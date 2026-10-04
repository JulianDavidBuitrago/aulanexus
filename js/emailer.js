// =====================================================================
//  Avisos por correo electrónico de nuevas publicaciones
//  El envío lo hace un "relé" gratuito en Google Apps Script que se
//  despliega con la cuenta de Google del docente (ver README §8.7 y
//  tools/apps-script/AulaNexusCorreo.gs). El relé valida el token de
//  Firebase del docente y solo escribe a estudiantes inscritos en la clase.
// =====================================================================
import * as cfg from './firebase-config.js';
import { icon } from './icons.js';
import { esc, fmtDate } from './util.js';
import { modal, toast, withLoading } from './ui.js';
import { S, ctx, studentsOf, classById } from './state.js';

const RELAY = cfg.EMAIL_RELAY || {};
const MODE_KEY = 'an-mail-mode';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }
};

export const emailConfigured = () => !!ctx.demo || /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/.test(String(RELAY.url || '').trim());

// ---------- Envío ----------
export async function sendPostEmail(post, uids) {
  uids = [...new Set(uids)].filter(Boolean);
  if (!uids.length) return { ok: true, sent: 0 };
  if (ctx.demo) {
    await new Promise((r) => setTimeout(r, 900));
    await ctx.B.markEmailed?.(post.id, uids.length);
    return { ok: true, sent: uids.length, demo: true };
  }
  const idToken = await ctx.B.idToken();
  let res;
  try {
    // Sin cabeceras personalizadas: la petición es "simple" y Apps Script no exige CORS previo
    res = await fetch(String(RELAY.url).trim(), {
      method: 'POST',
      body: JSON.stringify({ idToken, postId: post.id, uids, siteUrl: location.origin + location.pathname })
    });
  } catch {
    throw new Error('No se pudo contactar el servicio de correo. Revise la URL de EMAIL_RELAY y que el despliegue tenga acceso "Cualquier usuario".');
  }
  let data = null;
  try { data = await res.json(); } catch { /* respuesta no JSON */ }
  if (!data) throw new Error('El servicio de correo respondió de forma inesperada. Verifique que la URL termine en /exec y que el despliegue esté actualizado.');
  if (!data.ok) throw new Error(data.error || 'No se pudieron enviar los correos.');
  if (data.sent) await ctx.B.markEmailed?.(post.id, data.sent).catch(() => {});
  return data;
}

// ---------- Aviso individual: calificación o devolución ----------
// El relé lee la nota / la observación directamente de Firestore (no se envían en la petición).
const RESULT_KEY = 'an-mail-result';
export const resultMailPref = () => store.get(RESULT_KEY) !== '0';
export const setResultMailPref = (on) => store.set(RESULT_KEY, on ? '1' : '0');
export async function sendResultEmail(post, studentId, kind) {
  if (ctx.demo) { await new Promise((r) => setTimeout(r, 700)); return { ok: true, sent: 1, demo: true }; }
  const idToken = await ctx.B.idToken();
  let res;
  try {
    res = await fetch(String(RELAY.url).trim(), {
      method: 'POST',
      body: JSON.stringify({ idToken, kind, postId: post.id, studentId, siteUrl: location.origin + location.pathname })
    });
  } catch {
    throw new Error('No se pudo contactar el servicio de correo.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* respuesta no JSON */ }
  if (!data) throw new Error('El servicio de correo respondió de forma inesperada.');
  // Un script anterior a la 1.3 no conoce "kind" y responde "No hay destinatarios"
  if (!data.ok && data.code === 'empty' && !data.kind) throw new Error('Actualice el script de correo (versión 1.3) para enviar avisos de calificación y devolución.');
  if (!data.ok) throw new Error(data.error || 'No se pudo enviar el correo.');
  return data;
}
// Casilla reutilizable (calificar / devolver)
export function resultMailCheck(id, label) {
  if (!emailConfigured()) return '';
  return `<label class="check mail-result"><input type="checkbox" id="${id}" ${resultMailPref() ? 'checked' : ''}><span>${icon('mail')}${label}</span></label>`;
}

export function mailResultText(r) {
  if (!r) return '';
  const extra = [];
  if (r.skipped) extra.push(`${r.skipped} omitido(s) por no estar inscritos`);
  if (r.failed) extra.push(`${r.failed} con error`);
  return `Correo enviado a ${r.sent} ${r.sent === 1 ? 'estudiante' : 'estudiantes'}${extra.length ? ` (${extra.join(', ')})` : ''}.${r.demo ? ' Modo demostración: no se envían correos reales.' : ''}`;
}

// ---------- Selector de destinatarios ----------
export function audienceHTML(prefix, { allowNone = true } = {}) {
  if (!emailConfigured()) {
    return `<div class="mail-off">${icon('mail')}<span>Avisos por correo desactivados.</span><button type="button" class="link-btn" data-mail-help>¿Cómo activarlos?</button></div>`;
  }
  return `
  <div class="mail-block" data-mail="${prefix}">
    <div class="mail-head">
      <span class="label">${icon('mail')}Aviso por correo electrónico</span>
      <span class="hint" data-mail-sum></span>
    </div>
    <div class="segmented seg-mail" data-mail-mode role="radiogroup" aria-label="Destinatarios del correo">
      ${allowNone ? `<button type="button" data-m="none" role="radio">${icon('x')}No enviar</button>` : ''}
      <button type="button" data-m="all" role="radio">${icon('users')}Todos</button>
      <button type="button" data-m="some" role="radio">${icon('userCheck')}Algunos</button>
    </div>
    <div class="mail-pick" hidden>
      <div class="mail-tools">
        <div class="input-wrap">${icon('search')}<input class="input" data-mail-q placeholder="Buscar por nombre o código" aria-label="Buscar estudiante"></div>
        <button type="button" class="btn btn-sm" data-mail-sel="all">Todos</button>
        <button type="button" class="btn btn-sm" data-mail-sel="none">Ninguno</button>
      </div>
      <div class="mail-list" data-mail-list></div>
    </div>
  </div>`;
}

export function bindAudience(root, prefix, classId, { allowNone = true } = {}) {
  root.querySelector('[data-mail-help]')?.addEventListener('click', emailHelp);
  const box = root.querySelector(`[data-mail="${prefix}"]`);
  if (!box) return { value: () => ({ mode: 'none', uids: [] }), reset() {} };
  const saved = store.get(MODE_KEY);
  let mode = (saved === 'none' && !allowNone) || !['none', 'all', 'some'].includes(saved || '') ? 'all' : saved;
  if (mode === 'some') mode = 'all'; // la selección parcial no se recuerda entre publicaciones
  const picked = new Set();
  const pick = box.querySelector('.mail-pick');
  const list = box.querySelector('[data-mail-list]');
  const q = box.querySelector('[data-mail-q]');
  const students = () => studentsOf(classId).filter((s) => s.email);

  const summary = () => {
    const n = students().length;
    box.querySelector('[data-mail-sum]').textContent =
      mode === 'none' ? 'solo se notificará en la plataforma' :
      mode === 'all' ? `${n} ${n === 1 ? 'destinatario' : 'destinatarios'}` :
      `${[...picked].filter((u) => students().some((s) => s.uid === u)).length} de ${n} seleccionados`;
  };
  const paintList = () => {
    const term = (q.value || '').trim().toLowerCase();
    const rows = students().filter((s) => !term || `${s.fullName} ${s.studentCode || ''} ${s.email}`.toLowerCase().includes(term));
    list.innerHTML = rows.length ? rows.map((s) => `
      <label class="mail-row">
        <input type="checkbox" value="${esc(s.uid)}" ${picked.has(s.uid) ? 'checked' : ''}>
        <span class="mr-name"><b>${esc(s.fullName)}</b><small>${esc(s.studentCode || '')} · ${esc(s.email)}</small></span>
      </label>`).join('') : `<p class="muted" style="margin:10px 4px;font-size:13px">${students().length ? 'Sin coincidencias.' : 'La clase aún no tiene estudiantes inscritos.'}</p>`;
  };
  const setMode = (m) => {
    mode = m;
    box.querySelectorAll('[data-m]').forEach((b) => { const on = b.dataset.m === m; b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on)); });
    pick.hidden = m !== 'some';
    if (m === 'some') paintList();
    if (m !== 'some') store.set(MODE_KEY, m);
    summary();
  };
  box.querySelector('[data-mail-mode]').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) setMode(b.dataset.m); });
  list.addEventListener('change', (e) => { const c = e.target.closest('input[type=checkbox]'); if (!c) return; c.checked ? picked.add(c.value) : picked.delete(c.value); summary(); });
  q.addEventListener('input', paintList);
  box.querySelectorAll('[data-mail-sel]').forEach((b) => b.addEventListener('click', () => {
    const visible = [...list.querySelectorAll('input[type=checkbox]')].map((c) => c.value);
    visible.forEach((u) => (b.dataset.mailSel === 'all' ? picked.add(u) : picked.delete(u)));
    paintList(); summary();
  }));
  setMode(mode);
  return {
    value() {
      const valid = students();
      if (mode === 'all') return { mode, uids: valid.map((s) => s.uid) };
      if (mode === 'some') return { mode, uids: valid.filter((s) => picked.has(s.uid)).map((s) => s.uid) };
      return { mode: 'none', uids: [] };
    },
    reset() { picked.clear(); q.value = ''; setMode(store.get(MODE_KEY) === 'none' && allowNone ? 'none' : 'all'); }
  };
}

// ---------- Envío desde una publicación existente ----------
export function emailPostModal(post) {
  const c = classById(post.classId);
  modal({
    title: 'Enviar aviso por correo', subtitle: `${esc(c?.name || '')} · ${esc(post.title)}`, iconName: 'mail', size: 'lg',
    body: `
      ${post.lastEmailAt ? `<div class="callout">${icon('info')}<div>Esta publicación ya se envió por correo a <b>${post.lastEmailCount || 0}</b> ${post.lastEmailCount === 1 ? 'estudiante' : 'estudiantes'} (${fmtDate(post.lastEmailAt)}). Si la reenvía, lo recibirán de nuevo.</div></div>` : ''}
      ${audienceHTML('em', { allowNone: false })}`,
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-send data-loading="Enviando…">${icon('send')}Enviar correo</button>`,
    onMount(el, m) {
      const aud = bindAudience(el, 'em', post.classId, { allowNone: false });
      el.querySelector('[data-send]').addEventListener('click', (e) => withLoading(e.currentTarget, async () => {
        const { uids } = aud.value();
        if (!uids.length) { toast('Sin destinatarios', 'warn', 'Seleccione al menos un estudiante.'); return; }
        try {
          const r = await sendPostEmail(post, uids);
          toast('Correo enviado', 'success', mailResultText(r));
          m.close();
        } catch (er) { toast('No se enviaron los correos', 'error', er.message); }
      }));
    }
  });
}

// Botón ✉ de las tarjetas de publicación (delegación global)
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act="email-post"]'); if (!b) return;
  const p = S.posts.find((x) => x.id === b.dataset.id);
  if (p) emailPostModal(p);
});

export function emailHelp() {
  modal({
    title: 'Avisos por correo', subtitle: 'Configuración gratuita con Google Apps Script', iconName: 'mail',
    body: `
      <p>AulaNexus puede enviar un correo a los estudiantes cuando usted publica una tarea, material o anuncio. El envío se hace desde su propia cuenta de Google, sin costo.</p>
      <ol class="help-steps">
        <li>Abra <b>script.google.com</b> con su cuenta y cree un proyecto nuevo.</li>
        <li>Pegue el archivo <span class="mono">tools/apps-script/AulaNexusCorreo.gs</span> del proyecto y complete su bloque <span class="mono">CONFIG</span>.</li>
        <li><b>Implementar → Nueva implementación → Aplicación web</b>, ejecutar como <b>Yo</b> y acceso <b>Cualquier usuario</b>.</li>
        <li>Copie la URL que termina en <span class="mono">/exec</span> y agréguela en <span class="mono">firebase-config.js</span> como <span class="mono">EMAIL_RELAY</span>.</li>
      </ol>
      <p class="muted" style="font-size:12.5px">El paso a paso completo está en la sección 8.7 del README.</p>`,
    footer: '<button class="btn btn-primary" data-close>Entendido</button>'
  });
}
