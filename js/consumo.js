// =====================================================================
//  Consumo de Firestore (lo calcula el Apps Script cada hora y lo guarda
//  en metrics/usage). Panel en Administración y aviso para docentes.
// =====================================================================
import * as cfg from './firebase-config.js';
import { S, ctx, emit } from './state.js';
import { icon } from './icons.js';
import { esc, timeAgo } from './util.js';
import { modal } from './ui.js';

// Servicio de Apps Script que actualiza el consumo al pulsar "Actualizar ahora"
const RELAY = cfg.USAGE_RELAY || {};
export const usageRelayConfigured = () => !!ctx.demo || /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec/.test(String(RELAY.url || '').trim());

export async function refreshUsage() {
  if (ctx.demo) {
    await new Promise((r) => setTimeout(r, 900));
    if (S.metrics) { S.metrics = { ...S.metrics, updatedAt: Date.now() }; emit(); }
    return { ok: true };
  }
  const idToken = await ctx.B.idToken();
  let res, data = null;
  try {
    // Petición "simple" (sin cabeceras): Apps Script no exige CORS previo
    res = await fetch(String(RELAY.url).trim(), { method: 'POST', body: JSON.stringify({ idToken }) });
  } catch {
    throw new Error('No se pudo contactar el servicio de consumo. Revise USAGE_RELAY en firebase-config.js y que la implementación tenga acceso "Cualquier usuario".');
  }
  try { data = await res.json(); } catch { /* respuesta no JSON */ }
  if (!data) throw new Error('El servicio de consumo respondió de forma inesperada. Verifique que la URL termine en /exec.');
  if (!data.ok) throw new Error(data.error || 'No se pudo actualizar el consumo.');
  return data;
}

// El botón se muestra siempre; si falta USAGE_RELAY, al pulsarlo explica cómo configurarlo
const refreshBtn = () => `<button type="button" class="btn btn-sm${usageRelayConfigured() ? ' btn-primary' : ''}" data-usage-refresh data-loading="Consultando…">${icon('restore')}Actualizar ahora</button>`;

export function usageRelayHelp() {
  const raw = String(RELAY.url || '').trim();
  modal({
    title: 'Configurar "Actualizar ahora"', iconName: 'chart',
    body: `<div class="callout warn">${icon('alert')}<div>${raw
      ? `La URL de <span class="mono">USAGE_RELAY</span> no es válida: <span class="mono">${esc(raw)}</span>. Debe empezar por <span class="mono">https://script.google.com/</span> y terminar en <span class="mono">/exec</span>.`
      : `No se encontró <span class="mono">USAGE_RELAY</span> en <span class="mono">public/js/firebase-config.js</span> del sitio publicado.`}</div></div>
      <ol class="steps-list" style="margin:14px 0 0 18px;line-height:1.7">
        <li>En el proyecto de Apps Script de monitoreo: <b>Implementar → Nueva implementación → Aplicación web</b>, <i>Ejecutar como: Yo</i>, <i>Quién tiene acceso: Cualquier usuario</i>.</li>
        <li>Copie la URL que termina en <span class="mono">/exec</span>.</li>
        <li>Al final de su <span class="mono">public/js/firebase-config.js</span> agregue:<br><span class="mono" style="font-size:12px;word-break:break-all">export const USAGE_RELAY = { url: 'https://script.google.com/macros/s/…/exec' };</span></li>
        <li>Suba el cambio a GitHub, espere a que termine <b>Actions</b> y recargue con <b>Ctrl + F5</b>.</li>
      </ol>`,
    footer: '<button class="btn btn-primary" data-close>Entendido</button>'
  });
}

const LABEL = { reads: 'Lecturas', writes: 'Escrituras', deletes: 'Borrados' };
const n = (v) => Number(v || 0).toLocaleString('es-CO');
const tone = (p, th = 0.9) => (p >= th ? 'danger' : p >= 0.7 ? 'warn' : 'ok');
const hourCO = (ms) => new Date(ms).toLocaleString('es-CO', { timeZone: 'America/Bogota', weekday: 'long', hour: 'numeric', minute: '2-digit' });

export function usageAlertKinds(m = S.metrics) {
  if (!m?.today || !m.limits) return [];
  const th = m.threshold || 0.9;
  // Solo si los datos son del día de cuota vigente (no más de 26 h)
  if (m.updatedAt && Date.now() - m.updatedAt > 26 * 3600e3) return [];
  return Object.keys(LABEL).filter((k) => m.limits[k] && (m.today[k] || 0) / m.limits[k] >= th);
}

// Aviso para docentes (inicio) y administrador
export function usageBanner() {
  const m = S.metrics, kinds = usageAlertKinds(m);
  if (!kinds.length) return '';
  const max = Math.max(...kinds.map((k) => (m.today[k] || 0) / m.limits[k]));
  return `<div class="callout ${max >= 1 ? 'err' : 'warn'} usage-banner">${icon('alert')}<div>
    <b>${max >= 1 ? 'Se alcanzó el límite diario gratuito de la base de datos' : `La base de datos está al ${Math.round(max * 100)} % del límite diario gratuito`}</b>
    <small>${kinds.map((k) => `${LABEL[k]}: ${n(m.today[k])} de ${n(m.limits[k])}`).join(' · ')}. ${max >= 1 ? 'Si el proyecto está en el plan Spark, la plataforma puede dejar de responder' : 'Si se llega al 100 % en el plan Spark, la plataforma deja de responder'} hasta ${m.resetsAt ? esc(hourCO(m.resetsAt)) : 'la medianoche del Pacífico'} ${S.isAdmin ? '<a href="#/admin">Ver consumo</a>' : 'Avise al administrador.'}</small>
  </div></div>`;
}

// Panel de Administración
export function usagePanelHTML() {
  const m = S.metrics;
  if (S.metricsError || !m) {
    if (usageRelayConfigured() && !S.metricsError) {
      return `<div class="panel-head"><h2>${icon('chart')}Consumo de la base de datos</h2>${refreshBtn()}</div>
        <div class="callout">${icon('info')}<div><b>Aún no hay datos de consumo.</b> Pulse <b>Actualizar ahora</b> para consultarlos.</div></div>`;
    }
    return `<div class="panel-head"><h2>${icon('chart')}Consumo de la base de datos</h2>${refreshBtn()}</div>
      <div class="callout">${icon('info')}<div><b>Monitoreo sin configurar.</b> El navegador no puede consultar el consumo de Firestore; lo calcula cada hora el Apps Script de AulaNexus con su cuenta de Google y lo publica aquí.
      Siga la sección <b>8.11</b> del README: agregue <span class="mono">AulaNexusConsumo.gs</span> y <span class="mono">appsscript.json</span> al proyecto de Apps Script, habilite la API <i>Cloud Monitoring</i> y ejecute <span class="mono">instalarMonitoreo</span>.</div></div>`;
  }
  const th = m.threshold || 0.9;
  const manual = usageRelayConfigured();
  const stale = !manual && m.updatedAt && Date.now() - m.updatedAt > 3 * 3600e3;
  const meters = Object.keys(LABEL).map((k) => {
    const v = m.today?.[k] || 0, lim = m.limits?.[k] || 1, p = v / lim;
    return `<div class="usage-meter ${tone(p, th)}">
      <div class="um-top"><span>${LABEL[k]}</span><b>${Math.round(p * 100)} %</b></div>
      <div class="um-bar"><i style="width:${Math.min(100, p * 100)}%"></i><s style="left:${th * 100}%" title="Umbral de alerta ${Math.round(th * 100)} %"></s></div>
      <small>${n(v)} de ${n(lim)} hoy</small>
    </div>`;
  }).join('');
  const days = m.days || [];
  const maxR = Math.max(m.limits?.reads || 1, ...days.map((d) => d.reads || 0)) * 1.08;
  const chart = days.length ? `<div class="usage-chart" role="img" aria-label="Lecturas por día del mes"><div class="uc-area">
      <span class="uc-limit" style="bottom:${((m.limits?.reads || 0) / maxR) * 100}%"><em>límite diario de lecturas</em></span>
      ${days.map((d) => `<div class="uc-col" title="${esc(d.d)} · ${n(d.reads)} lecturas · ${n(d.writes)} escrituras · ${n(d.deletes)} borrados">
        <i class="${tone((d.reads || 0) / (m.limits?.reads || 1), th)}" style="height:${Math.max(2, ((d.reads || 0) / maxR) * 100)}%"></i><span>${Number(String(d.d).slice(-2))}</span></div>`).join('')}
    </div></div>` : '<p class="muted">Aún no hay datos del mes.</p>';
  const avg = days.length ? Math.round((m.month?.reads || 0) / days.length) : 0;
  return `
    <div class="panel-head">
      <h2>${icon('chart')}Consumo de la base de datos</h2>
      <div class="usage-head-r">
        <span class="muted" style="font-size:12px">${m.updatedAt ? `Actualizado ${esc(timeAgo(m.updatedAt))}${manual ? '' : ' · se revisa cada hora'}` : ''}</span>
        ${refreshBtn()}
      </div>
    </div>
    ${stale ? `<div class="callout warn">${icon('clock')}<div>El monitoreo no se actualiza desde hace más de 3 horas. Revise en Apps Script la sección <i>Ejecuciones</i> por si hay errores.</div></div>` : ''}
    ${usageBanner()}
    <h3 class="usage-h">Hoy <span class="muted">· cuota gratuita diaria · se reinicia ${m.resetsAt ? esc(hourCO(m.resetsAt)) : 'a medianoche del Pacífico'}</span></h3>
    <div class="usage-meters">${meters}</div>
    <h3 class="usage-h">Este mes</h3>
    <div class="kv usage-kv">
      <div><small>Lecturas</small><b>${n(m.month?.reads)}</b></div>
      <div><small>Escrituras</small><b>${n(m.month?.writes)}</b></div>
      <div><small>Borrados</small><b>${n(m.month?.deletes)}</b></div>
      <div><small>Promedio diario de lecturas</small><b>${n(avg)}</b></div>
    </div>
    ${chart}`;
}
