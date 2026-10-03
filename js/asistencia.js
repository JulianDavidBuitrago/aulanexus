// =====================================================================
//  Asistencia · vistas
//  - Configuración (en el formulario de la clase y desde la pestaña Asistencia)
//  - Panel del docente: habilitar/deshabilitar, pasar lista, agregar/quitar sesiones y registros
//  - Estudiante: registro de su asistencia en el horario establecido
// =====================================================================
import { S, ctx, classById, studentsOf } from './state.js';
import { icon } from './icons.js';
import * as ui from './ui.js';
import { esc, errMsg, download } from './util.js';
import { avatar, empty } from './components.js';
import {
  WEEK, ATT_STATUS, toMin, fmtMin, tzOf, defaultTz, localParts, keyOf, keyFromISO, isoFromKey, fmtKey, recId,
  hasSchedule, scheduleText, openSession, nextSession, sessionKeys, sessionClosed, summary, periodOf, periodText
} from './asistencia-model.js';
import { exportAttendance } from './excel.js';

export { scheduleText, openSession, periodText };

// ---------------------------------------------------------------------
//  Configuración (bloque reutilizable)
// ---------------------------------------------------------------------
export function attendanceFieldsHTML(a = {}) {
  const days = a.days || {};
  const today = localParts(Date.now(), defaultTz());
  return `
  <div class="att-cfg" data-att-cfg>
    <label class="check att-enable"><input type="checkbox" data-att-on ${a.enabled ? 'checked' : ''}><span><b>Clase con asistencia</b> · los estudiantes registran su asistencia en el horario establecido</span></label>
    <div class="att-days" role="group" aria-label="Días de clase">
      ${WEEK.map(([n, short, long]) => {
        const d = days[String(n)];
        return `<div class="att-day ${d ? 'on' : ''}" data-day="${n}">
          <label class="att-day-chip"><input type="checkbox" data-day-on ${d ? 'checked' : ''}><span>${short}</span><span class="sr-only">${long}</span></label>
          <div class="att-day-times">
            <input class="input" type="time" data-day-start value="${esc(d?.start || '07:00')}" aria-label="Inicio ${long}">
            <span>a</span>
            <input class="input" type="time" data-day-end value="${esc(d?.end || '10:00')}" aria-label="Fin ${long}">
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="error" data-att-err></div>
    <div class="form-grid att-opts">
      <div class="field"><label>Abrir registro antes del inicio</label><select class="input" data-att-before>${[0, 5, 10, 15, 20, 30].map((n) => `<option value="${n}" ${(a.before ?? 10) === n ? 'selected' : ''}>${n} minutos</option>`).join('')}</select></div>
      <div class="field"><label>Tolerancia para "Presente"</label><select class="input" data-att-late>${[0, 5, 10, 15, 20, 30, 45].map((n) => `<option value="${n}" ${(a.late ?? 15) === n ? 'selected' : ''}>${n} minutos</option>`).join('')}</select></div>
      <div class="field"><label>Fecha inicial <span class="hint">primer día de clase</span></label><input class="input" type="date" data-att-start value="${esc(a.startDate || isoFromKey(keyOf(today)))}"></div>
      <div class="field"><label>Fecha final <span class="hint">último día de clase</span></label><input class="input" type="date" data-att-end value="${esc(a.endDate || '')}"></div>
    </div>
    <p class="muted att-help">${icon('info')}Solo hay sesiones (y registro de asistencia) entre la fecha inicial y la final. El registro se cierra a la hora de fin. Después de la tolerancia queda como <b>Tarde</b>; quien no se registre queda <b>Ausente</b> (usted puede corregirlo).</p>
  </div>`;
}

export function bindAttendanceFields(root) {
  const box = root.querySelector('[data-att-cfg]'); if (!box) return;
  const paint = () => {
    const on = box.querySelector('[data-att-on]').checked;
    box.classList.toggle('disabled', !on);
    box.querySelectorAll('.att-day').forEach((d) => d.classList.toggle('on', d.querySelector('[data-day-on]').checked));
  };
  box.addEventListener('change', paint);
  paint();
}

// Devuelve { attendance, error }
export function readAttendanceFields(root, prev = {}) {
  const box = root.querySelector('[data-att-cfg]'); if (!box) return { attendance: prev };
  const days = {};
  let error = '';
  box.querySelectorAll('.att-day').forEach((d) => {
    if (!d.querySelector('[data-day-on]').checked) return;
    const start = d.querySelector('[data-day-start]').value || '07:00', end = d.querySelector('[data-day-end]').value || '10:00';
    const s = toMin(start), e = toMin(end);
    if (e <= s) error = `En ${WEEK[d.dataset.day - 1][2]} la hora de fin debe ser posterior a la de inicio.`;
    days[d.dataset.day] = { start, end, s, e };
  });
  const enabled = box.querySelector('[data-att-on]').checked;
  if (enabled && !Object.keys(days).length) error = 'Seleccione al menos un día de clase.';
  const startDate = box.querySelector('[data-att-start]').value || '', endDate = box.querySelector('[data-att-end]')?.value || '';
  if (!error && enabled && !startDate) error = 'Indique la fecha inicial de la clase.';
  if (!error && startDate && endDate && endDate < startDate) error = 'La fecha final debe ser igual o posterior a la fecha inicial.';
  box.querySelector('[data-att-err]').textContent = error;
  return {
    error,
    attendance: {
      ...prev, enabled, days,
      before: +box.querySelector('[data-att-before]').value, late: +box.querySelector('[data-att-late]').value,
      startDate, endDate, startKey: keyFromISO(startDate) || 0, endKey: keyFromISO(endDate) || 0,
      tz: Number.isFinite(prev.tz) ? prev.tz : defaultTz(),
      extra: prev.extra || [], removed: prev.removed || []
    }
  };
}

function configModal(c) {
  ui.modal({
    title: 'Configurar asistencia', subtitle: esc(c.name), iconName: 'calendar', size: 'lg',
    body: attendanceFieldsHTML(c.attendance || { enabled: true }),
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save data-loading="Guardando…">${icon('check')}Guardar</button>`,
    onMount(el, m) {
      bindAttendanceFields(el);
      el.querySelector('[data-save]').addEventListener('click', (e) => {
        const { attendance, error } = readAttendanceFields(el, c.attendance || {});
        if (error) return;
        ui.withLoading(e.currentTarget, async () => {
          try {
            await ctx.B.updateClass(c.id, { attendance, ...(!c.schedule && hasSchedule(attendance) ? { schedule: scheduleText(attendance) } : {}) });
            ui.toast('Asistencia actualizada', 'success', attendance.enabled ? scheduleText(attendance) : 'Registro de asistencia deshabilitado');
            m.close();
          } catch (er) { ui.toast('No se pudo guardar', 'error', errMsg(er)); }
        });
      });
    }
  });
}

// ---------------------------------------------------------------------
//  Panel del docente (pestaña "Asistencia" de la clase)
// ---------------------------------------------------------------------
export function attendancePanel(root, classId) {
  let recs = [], ready = false, sel = null;
  // La consulta usa el dueño de la clase (también para colaboradores); se abre cuando la clase está cargada
  let unsub = null, subOwner = null;
  const ensureSub = () => {
    const c = classById(classId);
    if (!c && !S.ready.classes) return;
    const owner = c?.ownerId || S.user.uid;
    if (owner === subOwner) return;
    unsub?.(); subOwner = owner;
    unsub = ctx.B.watchAttendance({ classId, ownerId: owner }, (l) => { recs = l; ready = true; render(); });
  };
  ensureSub();

  const rec = (uid, key) => recs.find((r) => r.studentId === uid && r.dateKey === key);
  async function setStatus(c, s, key, status) {
    const id = recId(c.id, key, s.uid);
    try {
      if (!status) await ctx.B.deleteAttendance(id);
      else await ctx.B.setAttendance(id, { classId: c.id, ownerId: c.ownerId, studentId: s.uid, studentName: s.fullName, dateKey: key, status, by: 'teacher' });
    } catch (er) { ui.toast('No se pudo guardar', 'error', errMsg(er)); }
  }

  root.addEventListener('click', async (e) => {
    const c = classById(classId); if (!c) return;
    const a = c.attendance || {};
    const b = e.target.closest('[data-aact]');
    if (!b) return;
    const act = b.dataset.aact;
    if (act === 'config') { configModal(c); return; }
    if (act === 'toggle') return; // lo maneja "change"
    if (act === 'set') {
      const s = studentsOf(classId).find((x) => x.uid === b.dataset.uid);
      const cur = rec(s.uid, sel)?.status;
      await setStatus(c, s, sel, cur === b.dataset.st ? null : b.dataset.st);
      return;
    }
    if (act === 'all') {
      const pending = studentsOf(classId).filter((s) => !rec(s.uid, sel));
      if (!pending.length) { ui.toast('Sin pendientes', 'info', 'Todos los estudiantes tienen registro en esta sesión.'); return; }
      await ui.withLoading(b, async () => { for (const s of pending) await setStatus(c, s, sel, b.dataset.st); });
      ui.toast('Lista actualizada', 'success', `${pending.length} estudiante(s) marcados como ${ATT_STATUS[b.dataset.st].label.toLowerCase()}.`);
      return;
    }
    if (act === 'add-session') {
      ui.modal({
        title: 'Agregar sesión', subtitle: 'Clase extra, reposición o fecha fuera del horario', iconName: 'plus',
        body: `<div class="field"><label>Fecha de la sesión</label><input class="input" type="date" id="as-date" value="${isoFromKey(keyOf(localParts(Date.now(), tzOf(a))))}"></div>`,
        footer: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-ok data-loading="Agregando…">${icon('plus')}Agregar</button>`,
        onMount(el, m) {
          el.querySelector('[data-ok]').addEventListener('click', (ev) => ui.withLoading(ev.currentTarget, async () => {
            const k = keyFromISO(el.querySelector('#as-date').value); if (!k) return;
            try {
              await ctx.B.updateClass(c.id, { attendance: { ...a, extra: [...new Set([...(a.extra || []), k])], removed: (a.removed || []).filter((x) => x !== k) } });
              sel = k; m.close(); ui.toast('Sesión agregada', 'success', fmtKey(k, true));
            } catch (er) { ui.toast('Error', 'error', errMsg(er)); }
          }));
        }
      });
      return;
    }
    if (act === 'remove-session') {
      const n = recs.filter((r) => r.dateKey === sel).length;
      const ok = await ui.confirmDialog({ title: 'Quitar sesión', danger: true, confirm: 'Quitar sesión', iconName: 'trash', message: `Se quitará la sesión del <b>${esc(fmtKey(sel, true))}</b>${n ? ` y sus ${n} registro(s) de asistencia` : ''}. No contará en los porcentajes.` });
      if (!ok) return;
      try {
        for (const r of recs.filter((x) => x.dateKey === sel)) await ctx.B.deleteAttendance(r.id);
        await ctx.B.updateClass(c.id, { attendance: { ...a, removed: [...new Set([...(a.removed || []), sel])], extra: (a.extra || []).filter((x) => x !== sel) } });
        ui.toast('Sesión quitada', 'success'); sel = null;
      } catch (er) { ui.toast('Error', 'error', errMsg(er)); }
      return;
    }
    if (act === 'export') {
      await ui.withLoading(b, async () => {
        try { await exportXlsx(c); } catch (er) { ui.toast('No se pudo generar el Excel', 'error', errMsg(er)); }
      });
    }
  });
  root.addEventListener('change', async (e) => {
    const c = classById(classId); if (!c) return;
    if (e.target.matches('[data-att-toggle]')) {
      const on = e.target.checked;
      if (on && !hasSchedule(c.attendance)) { e.target.checked = false; configModal(c); return; }
      try { await ctx.B.updateClass(c.id, { attendance: { ...(c.attendance || {}), enabled: on } }); ui.toast(on ? 'Asistencia habilitada' : 'Asistencia deshabilitada', on ? 'success' : 'info', on ? 'Los estudiantes podrán registrarse en el horario de la clase.' : 'Los estudiantes ya no pueden registrarse.'); }
      catch (er) { e.target.checked = !on; ui.toast('Error', 'error', errMsg(er)); }
    }
    if (e.target.matches('[data-sel-session]')) { sel = +e.target.value; render(); }
  });

  // Excel: hoja "Asistencia" (matriz estudiantes × sesiones con totales) y hoja "Detalle" (un registro por fila)
  async function exportXlsx(c) {
    const keys = sessionKeys(c, recs).slice().reverse();
    const studs = studentsOf(classId);
    const status = (s, k) => { const r = rec(s.uid, k); return r ? r.status : (sessionClosed(c, k) ? 'ausente' : null); };
    await exportAttendance({
      cls: c, period: periodText(c.attendance || {}), schedule: scheduleText(c.attendance || {}),
      sessions: keys.map((k) => ({ key: k, iso: isoFromKey(k), label: fmtKey(k) })),
      students: studs.map((s) => {
        const sm = summary(c, s.uid, recs, keys);
        return {
          name: s.fullName, code: s.studentCode || '', doc: `${s.docType || ''} ${s.docNumber || ''}`.trim(), email: s.email || '',
          marks: keys.map((k) => status(s, k)), totals: sm,
          records: keys.map((k) => {
            const r = rec(s.uid, k), st = status(s, k);
            return { key: k, iso: isoFromKey(k), status: st, by: r ? (r.by === 'student' ? 'Estudiante' : 'Docente') : (st ? 'Automático (sin registro)' : ''), at: r?.at || null };
          })
        };
      })
    });
  }

  function render() {
    const c = classById(classId); if (!c) return;
    const a = c.attendance || {};
    const studs = studentsOf(classId);
    if (!hasSchedule(a)) {
      root.innerHTML = `<div class="panel">${empty('calendar', 'Asistencia sin configurar', 'Defina los días y el horario de la clase para que los estudiantes registren su asistencia.', `<button class="btn btn-primary" data-aact="config">${icon('calendar')}Configurar asistencia</button>`)}</div>`;
      return;
    }
    const open = openSession(c), next = nextSession(c);
    const keys = sessionKeys(c, recs);
    if (!keys.includes(sel)) sel = open?.dateKey && keys.includes(open.dateKey) ? open.dateKey : keys[0] ?? null;
    const reg = open ? recs.filter((r) => r.dateKey === open.dateKey).length : 0;
    const statusLine = !a.enabled ? `<span class="badge">${icon('lock')}Deshabilitada</span> Los estudiantes no pueden registrarse.`
      : open ? `<span class="badge b-success att-live">${icon('zap')}Registro abierto</span> ${fmtMin(open.slot.s)} – ${fmtMin(open.slot.e)} · <b>${reg} de ${studs.length}</b> registrados`
      : next ? `Próxima sesión: <b>${esc(fmtKey(next.dateKey, true))}</b>, ${fmtMin(next.slot.s)}`
      : periodOf(a).end && keyOf(localParts(Date.now(), tzOf(a))) > periodOf(a).end ? `<span class="badge">${icon('check')}Periodo finalizado</span> La clase terminó el ${esc(fmtKey(periodOf(a).end, true))}.` : '';
    const closed = sel != null && sessionClosed(c, sel);
    root.innerHTML = `
    <div class="stack">
      <div class="panel att-head">
        <div class="att-head-main">
          <label class="switch" title="Habilitar o deshabilitar el registro de asistencia"><input type="checkbox" data-att-toggle ${a.enabled ? 'checked' : ''}><span class="track"></span><span><b>Asistencia ${a.enabled ? 'habilitada' : 'deshabilitada'}</b></span></label>
          <div class="att-sched">${icon('calendar')}${esc(scheduleText(a))}${periodText(a) ? ` · <span class="att-period">${esc(periodText(a))}</span>` : ''}</div>
          <div class="att-status">${statusLine}</div>
        </div>
        <div class="att-head-actions">
          <button class="btn btn-sm" data-aact="config">${icon('sliders')}Horario</button>
          <button class="btn btn-sm" data-aact="add-session">${icon('plus')}Agregar sesión</button>
          <button class="btn btn-sm" data-aact="export" data-loading="Generando…">${icon('download')}Descargar Excel</button>
        </div>
      </div>
      ${!keys.length ? `<div class="panel">${empty('clock', 'Aún no hay sesiones', next ? `La primera sesión es el ${fmtKey(next.dateKey, true)}.` : 'Agregue una sesión o revise la fecha de inicio.')}</div>` : `
      <div class="panel">
        <div class="panel-head att-list-head">
          <h2>${icon('userCheck')}Pasar lista</h2>
          <div class="att-sel">
            <select class="input" data-sel-session aria-label="Sesión">${keys.map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(fmtKey(k, true))}${open?.dateKey === k ? ' · en curso' : ''}${(a.extra || []).includes(k) ? ' · extra' : ''}</option>`).join('')}</select>
            <button class="btn btn-sm btn-ghost btn-danger" data-aact="remove-session" title="Quitar esta sesión">${icon('trash')}</button>
          </div>
        </div>
        <div class="att-bulk"><span class="muted">Estudiantes sin registro:</span>
          <button class="btn btn-sm" data-aact="all" data-st="presente" data-loading="Marcando…">${icon('check')}Marcar presentes</button>
          ${closed ? `<button class="btn btn-sm" data-aact="all" data-st="ausente" data-loading="Marcando…">${icon('x')}Marcar ausentes</button>` : ''}
        </div>
        ${studs.length ? `<div class="att-roll">${studs.map((s) => {
          const r = rec(s.uid, sel);
          const st = r?.status;
          return `<div class="att-row">
            ${avatar(s.fullName, 'sm', s.uid)}
            <div class="att-who"><b>${esc(s.fullName)}</b><small>${r ? `${r.by === 'student' ? 'Se registró' : 'Registrado por el docente'}${r.at ? ` · ${new Date(r.at).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}` : ''}` : closed ? '<span class="att-implicit">Sin registro · cuenta como ausente</span>' : 'Pendiente'}</small></div>
            <div class="att-btns" role="group" aria-label="Asistencia de ${esc(s.fullName)}">
              ${Object.entries(ATT_STATUS).map(([k, d]) => `<button type="button" class="att-b ${k} ${st === k ? 'on' : ''}" data-aact="set" data-uid="${s.uid}" data-st="${k}" title="${d.label}${st === k ? ' (clic para quitar)' : ''}" aria-pressed="${st === k}">${d.short}<span>${d.label}</span></button>`).join('')}
            </div>
          </div>`;
        }).join('')}</div>` : empty('users', 'Sin estudiantes inscritos')}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>${icon('chart')}Resumen por estudiante</h2><span class="muted" style="font-size:12.5px">${keys.length} sesión(es) · las excusas no cuentan</span></div>
        <div class="table-wrap"><table class="tbl cards att-sum">
          <thead><tr><th>Estudiante</th><th>P</th><th>T</th><th>A</th><th>E</th><th>Asistencia</th></tr></thead>
          <tbody>${studs.map((s) => {
            const sm = summary(c, s.uid, recs, keys);
            const tone = sm.pct == null ? '' : sm.pct >= 80 ? 'ok' : sm.pct >= 60 ? 'mid' : 'low';
            return `<tr><td class="who-cell"><div class="who">${avatar(s.fullName, 'sm', s.uid)}<b>${esc(s.fullName)}</b></div></td>
              <td data-label="Presente" class="num">${sm.presente}</td><td data-label="Tarde" class="num">${sm.tarde}</td><td data-label="Ausente" class="num">${sm.ausente}</td><td data-label="Excusa" class="num">${sm.excusa}</td>
              <td data-label="Asistencia"><div class="att-pct ${tone}"><div class="pr-bar"><i style="width:${sm.pct ?? 0}%"></i></div><b>${sm.pct == null ? '—' : `${sm.pct}%`}</b></div></td></tr>`;
          }).join('')}</tbody></table></div>
      </div>`}
    </div>`;
    if (!ready) root.querySelector('.att-roll')?.classList.add('loading');
  }
  render();
  return { update: () => { ensureSub(); render(); }, destroy: () => unsub?.() };
}

// ---------------------------------------------------------------------
//  Estudiante
// ---------------------------------------------------------------------
export async function checkIn(classId, btn) {
  const c = classById(classId);
  const s = openSession(c);
  if (!s) { ui.toast('Registro cerrado', 'warn', 'La asistencia solo se registra durante el horario de la clase.'); return; }
  const run = async () => {
    try {
      await ctx.B.checkIn(recId(c.id, s.dateKey, S.user.uid), { classId: c.id, ownerId: c.ownerId, studentId: S.user.uid, studentName: S.profile?.fullName || '', dateKey: s.dateKey, status: s.status, by: 'student' });
      ui.toast('Asistencia registrada', 'success', `${c.name} · ${ATT_STATUS[s.status].label}`);
    } catch (er) {
      // El registro rechazado aparece un instante en la caché local (escritura optimista) y luego se revierte:
      // se espera la reversión antes de decidir si de verdad ya existía en el servidor.
      await new Promise((r) => setTimeout(r, 1200));
      const dup = S.myAttendance.some((r) => r.id === recId(c.id, s.dateKey, S.user.uid));
      console.error('[Asistencia] registro rechazado', er.code || '', er.message || er, { classId: c.id, dateKey: s.dateKey, status: s.status });
      ui.toast(dup ? 'Ya estaba registrada' : 'No se pudo registrar la asistencia', dup ? 'info' : 'error',
        dup ? '' : /permission/i.test(er.code || er.message || '') ? 'La base de datos rechazó el registro (permisos). Avise a su docente.' : errMsg(er));
    }
  };
  return btn ? ui.withLoading(btn, run) : run();
}

// Tarjeta en la vista de la clase del estudiante
export function studentAttendanceHTML(c) {
  const a = c?.attendance;
  if (!a?.enabled && !S.myAttendance.some((r) => r.classId === c?.id)) return '';
  const mine = S.myAttendance.filter((r) => r.classId === c.id);
  const keys = sessionKeys(c, mine);
  const sm = summary(c, S.user.uid, mine, keys);
  const open = openSession(c), next = nextSession(c);
  const done = open && mine.find((r) => r.dateKey === open.dateKey);
  const action = !a?.enabled ? `<span class="muted">El registro de asistencia está deshabilitado.</span>`
    : open ? (done ? `<div class="att-done">${icon('check')}<div><b>Asistencia registrada</b><small>${ATT_STATUS[done.status].label}${done.at ? ` · ${new Date(done.at).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}` : ''}</small></div></div>`
      : `<button class="btn btn-primary att-checkin" data-checkin="${c.id}" data-loading="Registrando…">${icon('userCheck')}Registrar mi asistencia</button><small class="muted">Abierto hasta las ${fmtMin(open.slot.e)}${open.status === 'presente' ? ` · Presente hasta las ${fmtMin(open.lateAt)}` : ' · quedará como Tarde'}</small>`)
    : next ? `<span class="muted">${icon('clock')} Próxima sesión: <b>${esc(fmtKey(next.dateKey, true))}</b>, ${fmtMin(next.slot.s)}</span>` : '';
  const hist = keys.slice(0, 12).map((k) => {
    const r = mine.find((x) => x.dateKey === k);
    const st = r?.status || (sessionClosed(c, k) ? 'ausente' : null);
    return `<span class="att-pill ${st || 'pend'}" title="${esc(fmtKey(k, true))}: ${st ? ATT_STATUS[st].label : 'Pendiente'}">${esc(fmtKey(k))}<b>${st ? ATT_STATUS[st].short : '·'}</b></span>`;
  }).join('');
  return `<div class="panel att-student ${open && !done && a?.enabled ? 'live' : ''}">
    <div class="panel-head"><h2>${icon('userCheck')}Asistencia</h2>${sm.pct != null ? `<span class="att-pct-big ${sm.pct >= 80 ? 'ok' : sm.pct >= 60 ? 'mid' : 'low'}">${sm.pct}%</span>` : ''}</div>
    <div class="att-sched">${icon('calendar')}${esc(scheduleText(a))}</div>
    <div class="att-action">${action}</div>
    ${hist ? `<div class="att-hist">${hist}</div><small class="muted">P presente · T tarde · A ausente · E excusa</small>` : ''}
  </div>`;
}

// Aviso en el inicio del estudiante: clases con registro abierto y pendiente
export function attendanceBanner() {
  const list = (S.profile?.classIds || []).map(classById).filter((c) => c && openSession(c) && !S.myAttendance.some((r) => r.classId === c.id && r.dateKey === openSession(c).dateKey));
  if (!list.length) return '';
  return list.map((c) => `<div class="callout ok att-banner">${icon('userCheck')}<div><b>Asistencia abierta · ${esc(c.name)}</b><small>Registre su asistencia antes de las ${fmtMin(openSession(c).slot.e)}.</small></div><button class="btn btn-primary btn-sm" data-checkin="${c.id}" data-loading="Registrando…">Registrar</button></div>`).join('');
}

// Delegación global del botón "Registrar"
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-checkin]'); if (!b) return;
  checkIn(b.dataset.checkin, b);
});
