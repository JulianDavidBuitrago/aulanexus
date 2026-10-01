// =====================================================================
//  Prácticas empresariales
//  Docente: registro de prácticas, seguimiento, revisión, aprobación, calendario de visitas y actas.
//  Estudiante: datos de la empresa, propuesta, informe final, comentarios y visitas.
// =====================================================================
import { S, ctx, teacherName } from './state.js';
const byName = (a, b) => String(a || '').localeCompare(String(b || ''), 'es');
import { icon } from './icons.js';
import * as ui from './ui.js';
import { esc, norm, errMsg, fmtDate, timeAgo, DOC_TYPES, initialPassword, validatePerson, formatName, normPhone, fmtPhone, waLink, isEmail, isPhone } from './util.js';
import { avatar, empty, skeletonLines, showCredentials } from './components.js';
import { studentSearchHTML, bindStudentSearch } from './student-search.js';
import {
  PRACTICE_STATUS, DOC_STATUS, VISIT_MODES, VISIT_STATUS, DOC_NAMES, COMPANY_FIELDS, emptyCompany, emptyProposal, defaultFinal,
  companyProgress, proposalProgress, finalProgress, currentPeriod, longDate, dmy, todayISO
} from './practica-model.js';
import { proposalEditor, finalEditor, compressImage } from './practica-editors.js';
import { proposalHTML, finalHTML, actaHTML } from './practica-preview.js';
import { buildProposalDocx, buildFinalDocx, buildActaDocx, saveBlob, fileBase } from './practica-docx.js';

export const teacherRoutes = { practicas: practicesView, practica: practiceDetail };
export const studentRoutes = { 'mi-practica': myPractice, practica: practiceDetail };

const clone = (o) => JSON.parse(JSON.stringify(o ?? null));
const isTeacherView = () => S.role === 'teacher';
const practiceById = (id) => S.practices.find((p) => p.id === id);
const studentFor = (pr) => S.students.find((s) => s.uid === pr.studentId);
const visitsOf = (pid) => S.visits.filter((v) => v.practiceId === pid).sort((a, b) => a.date - b.date);
const nextVisit = (pid) => visitsOf(pid).find((v) => v.status === 'programada' && v.date >= Date.now() - 3600e3);
const docBadge = (st, prefix = '') => { const d = DOC_STATUS[st || 'borrador']; return `<span class="badge ${d.cls}">${icon(d.icon)}${prefix}${d.label}</span>`; };
const bar = (pct) => `<div class="pr-bar" title="${pct}%"><i style="width:${pct}%"></i></div>`;
const fmtVisit = (v) => `${fmtDate(v.date)}`;
const docOf = (pr, key) => (key === 'proposal' ? pr.proposal || emptyProposal() : pr.final);

// Datos del estudiante actualizados (si cambió su perfil) para documentos y fichas
function withStudent(pr) {
  const s = studentFor(pr) || (S.role === 'student' && S.user?.uid === pr.studentId ? S.profile : null);
  if (!s) return pr;
  return { ...pr, studentName: s.fullName || pr.studentName, studentCode: s.studentCode || pr.studentCode, studentDoc: s.docNumber || pr.studentDoc, studentDocType: s.docType || pr.studentDocType, studentEmail: s.email || pr.studentEmail, studentPhone: s.phone || pr.studentPhone };
}

async function notify(n) { try { await ctx.B.addNotifications([n]); } catch { /* las notificaciones no bloquean */ } }
const notifyStudent = (pr, title, message, tab = '') => notify({ userId: pr.studentId, type: 'practice', mode: 'student', title, message, link: `#/practica/${pr.id}${tab ? `/${tab}` : ''}`, practiceId: pr.id });
const notifyTeacher = (pr, title, message, tab = '') => notify({ userId: pr.ownerId, fromUid: S.user.uid, type: 'practice', mode: 'teacher', title, message, link: `#/practica/${pr.id}${tab ? `/${tab}` : ''}`, practiceId: pr.id });

// =====================================================================
//  DOCENTE · LISTA Y CALENDARIO
// =====================================================================
function practicesView(el) {
  ui.setCrumb('Prácticas', 'PRÁCTICAS EMPRESARIALES');
  let tab = 'list', q = '', filter = 'activa';
  let month = new Date(); month.setDate(1);
  el.innerHTML = `
  <div class="stack">
    <section class="hero glow-border">
      <div class="hero-orb"></div>
      <div style="min-width:0">
        <span class="eyebrow">${icon('briefcase')}Prácticas empresariales</span>
        <h1>Seguimiento individual de prácticas</h1>
        <p>Registre a cada practicante, revise su propuesta y su informe final, deje comentarios, agende las visitas y diligencie las actas.</p>
      </div>
      <div class="hero-actions"><button class="btn btn-primary" data-act="register">${icon('plus')}Registrar práctica</button></div>
    </section>
    <section class="stats" id="pr-stats"></section>
    <div>
      <div class="tabs" role="tablist">
        <button class="active" data-tab="list">${icon('users')}Practicantes</button>
        <button data-tab="cal">${icon('calendar')}Calendario de visitas</button>
      </div>
      <div class="tab-panel" data-panel="list">
        <div class="panel">
          <div class="toolbar pr-toolbar">
            <div class="input-wrap">${icon('search')}<input class="input" id="pr-q" placeholder="Buscar por estudiante, cédula o empresa"></div>
            <div class="segmented" id="pr-filter">
              <button type="button" class="active" data-f="activa">En curso</button><button type="button" data-f="finalizada">Finalizadas</button><button type="button" data-f="all">Todas</button>
            </div>
          </div>
          <div id="pr-list" class="pr-list">${skeletonLines(3)}</div>
        </div>
      </div>
      <div class="tab-panel hidden" data-panel="cal">
        <div class="panel"><div id="pr-cal"></div></div>
      </div>
    </div>
  </div>`;
  const $ = (s) => el.querySelector(s);
  el.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    tab = b.dataset.tab;
    el.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
    el.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab));
    update();
  });
  $('#pr-q').addEventListener('input', (e) => { q = e.target.value; update(); });
  $('#pr-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    filter = b.dataset.f; $('#pr-filter').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); update();
  });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="register"]')) { registerPracticeModal(); return; }
    const card = e.target.closest('[data-open]');
    if (card && !e.target.closest('a,button')) location.hash = `#/practica/${card.dataset.open}`;
  });
  const cal = calendarWidget($('#pr-cal'), { getMonth: () => month, setMonth: (m) => { month = m; update(); }, canEdit: true });

  function update() {
    const all = S.practices.map(withStudent);
    const active = all.filter((p) => (p.status || 'activa') === 'activa');
    ui.stats($('#pr-stats'), [
      { key: 'a', label: 'Prácticas en curso', value: S.ready.practices ? active.length : null, icon: 'briefcase', color: 'var(--c-cyan)' },
      { key: 'p', label: 'Propuestas por revisar', value: S.ready.practices ? all.filter((p) => p.proposal?.status === 'enviado').length : null, icon: 'fileText', color: 'var(--c-amber)' },
      { key: 'i', label: 'Informes por revisar', value: S.ready.practices ? all.filter((p) => p.final?.status === 'enviado').length : null, icon: 'fileCheck', color: 'var(--c-violet)' },
      { key: 'v', label: 'Visitas próximas (30 días)', value: S.ready.visits ? S.visits.filter((v) => v.status === 'programada' && v.date >= Date.now() && v.date <= Date.now() + 30 * 864e5).length : null, icon: 'calendar', color: 'var(--c-emerald)' }
    ]);
    if (tab === 'cal') { cal.render(); return; }
    if (!S.ready.practices) return;
    const terms = norm(q).split(/\s+/).filter(Boolean);
    const list = all
      .filter((p) => filter === 'all' || (p.status || 'activa') === filter)
      .filter((p) => !terms.length || terms.every((t) => norm(`${p.studentName} ${p.studentDoc} ${p.studentCode} ${p.company?.name} ${p.period}`).includes(t)))
      .sort((a, b) => byName(a.studentName, b.studentName));
    $('#pr-list').innerHTML = list.length ? list.map(practiceCard).join('')
      : empty('briefcase', all.length ? 'Sin resultados' : 'Aún no hay prácticas registradas', all.length ? 'Ajuste la búsqueda o el filtro.' : 'Use «Registrar práctica» para asignar un practicante.');
  }
  update();
  return { update };
}

function practiceCard(p) {
  const st = PRACTICE_STATUS[p.status || 'activa'];
  const nv = nextVisit(p.id);
  const cp = companyProgress(p.company), pp = proposalProgress(p.proposal || {}), fp = p.final ? finalProgress(p.final) : 0;
  return `<article class="pr-card" data-open="${p.id}" tabindex="0">
    <div class="pr-card-top">
      ${avatar(p.studentName, '', p.studentId)}
      <div class="pr-card-id">
        <b>${esc(p.studentName)}</b>
        <small><span class="mono">${esc(p.studentDocType || 'CC')} ${esc(p.studentDoc || '')}</span> · ${esc(p.period || '')}</small>
        <span class="pr-company">${icon('building')}${p.company?.name ? esc(p.company.name) : '<i class="muted">Empresa sin registrar</i>'}</span>
      </div>
      <span class="badge ${st.cls}">${icon(st.icon)}${st.label}</span>
    </div>
    <div class="pr-steps">
      <div><small>Empresa</small>${bar(cp)}<span>${cp}%</span></div>
      <div><small>Propuesta</small>${docBadge(p.proposal?.status)}</div>
      <div><small>Informe final</small>${p.final ? docBadge(p.final.status) : '<span class="badge">Sin iniciar</span>'}</div>
    </div>
    <div class="pr-card-foot">
      <span>${icon('calendar')}${nv ? `Próxima visita: <b>${fmtVisit(nv)}</b> · ${VISIT_MODES[nv.mode]?.short || ''}` : '<span class="muted">Sin visitas programadas</span>'}</span>
      <a class="btn btn-sm" href="#/practica/${p.id}">${icon('arrowRight')}Abrir</a>
    </div>
  </article>`;
}

// ---------- Registro de una práctica (solo docente) ----------
function registerPracticeModal() {
  let picked = null, mode = 'existing';
  ui.modal({
    title: 'Registrar práctica', subtitle: 'Cada práctica es individual: un estudiante y usted como docente asesor', iconName: 'briefcase', size: 'lg',
    body: `
      <div class="segmented" data-mode style="margin-bottom:14px">
        <button type="button" class="active" data-m="existing">${icon('search')}Estudiante registrado</button>
        <button type="button" data-m="new">${icon('userPlus')}Nuevo estudiante</button>
      </div>
      <div data-pane="existing">
        <div data-picked></div>
        <div data-search>${studentSearchHTML('rp')}</div>
      </div>
      <div data-pane="new" hidden>
        <div class="form-grid">
          <div class="field span-2"><label>Nombre completo</label><input class="input" id="rp-name" placeholder="Nombres y apellidos"><div class="error"></div></div>
          <div class="field"><label>Código de estudiante</label><input class="input mono" id="rp-code"><div class="error"></div></div>
          <div class="field"><label>Correo electrónico</label><input class="input" id="rp-email" type="email" placeholder="nombre@ucaldas.edu.co"><div class="error"></div></div>
          <div class="field"><label>Tipo de documento</label><select class="input" id="rp-dt">${DOC_TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
          <div class="field"><label>Número de documento</label><input class="input mono" id="rp-dn"><div class="error"></div></div>
          <div class="field"><label>Celular</label><input class="input mono" id="rp-phone" type="tel" placeholder="3001234567"><div class="error"></div></div>
        </div>
        <p class="muted" style="font-size:12.5px">Se crea la cuenta con la contraseña inicial institucional (primer nombre + documento + *). Deberá cambiarla en el primer ingreso.</p>
      </div>
      <div class="pr-reg-extra">
        <div class="form-grid">
          <div class="field"><label>Periodo académico</label><input class="input" id="rp-period" value="${esc(currentPeriod())}"></div>
          <div class="field"><label>Empresa <span class="hint">opcional · el estudiante puede completarla</span></label><input class="input" id="rp-company" placeholder="Razón social"></div>
          <div class="field"><label>Fecha de inicio <span class="hint">opcional</span></label><input class="input" id="rp-start" type="date"></div>
          <div class="field"><label>Fecha de terminación <span class="hint">opcional</span></label><input class="input" id="rp-end" type="date"></div>
        </div>
      </div>`,
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save data-loading="Registrando…">${icon('check')}Registrar práctica</button>`,
    onMount(el, m) {
      const $ = (s) => el.querySelector(s);
      const paintPicked = () => {
        $('[data-picked]').innerHTML = picked ? `<div class="ss-row pr-picked">${avatar(picked.fullName, '', picked.uid)}<div class="ss-body"><b>${esc(picked.fullName)}</b><small>${esc(picked.docType)} ${esc(picked.docNumber)} · ${esc(picked.studentCode)} · ${esc(picked.email)}</small></div><button type="button" class="btn btn-sm" data-unpick>${icon('x')}Cambiar</button></div>` : '';
        $('[data-search]').hidden = !!picked;
      };
      bindStudentSearch(el, 'rp', {
        exclude: (s) => s.uid === S.user.uid,
        action(s) {
          const has = S.practices.some((p) => p.studentId === s.uid && (p.status || 'activa') === 'activa');
          return { label: 'Seleccionar', icon: 'check', hint: has ? 'Ya tiene una práctica en curso con usted.' : '' };
        },
        onPick(s) { picked = s; paintPicked(); }
      });
      el.addEventListener('click', (e) => { if (e.target.closest('[data-unpick]')) { picked = null; paintPicked(); } });
      $('[data-mode]').addEventListener('click', (e) => {
        const b = e.target.closest('[data-m]'); if (!b) return;
        mode = b.dataset.m;
        $('[data-mode]').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        el.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== mode; });
      });
      $('[data-save]').addEventListener('click', (e) => ui.withLoading(e.currentTarget, async () => {
        ui.clearErrors(el);
        let student = picked, password = null;
        if (mode === 'existing' && !student) { ui.toast('Seleccione un estudiante', 'warn', 'Búsquelo por cédula o nombre.'); return; }
        if (mode === 'new') {
          const p = { fullName: formatName($('#rp-name').value), studentCode: $('#rp-code').value.trim().toUpperCase(), docType: $('#rp-dt').value, docNumber: $('#rp-dn').value.trim().replace(/[\s.]/g, '').toUpperCase(), email: $('#rp-email').value.trim().toLowerCase(), phone: normPhone($('#rp-phone').value) };
          const errs = validatePerson(p);
          const map = { Nombre: '#rp-name', Código: '#rp-code', 'Número de documento': '#rp-dn', Correo: '#rp-email', Celular: '#rp-phone' };
          errs.forEach((msg) => { const k = Object.keys(map).find((x) => msg.startsWith(x) || msg.includes(x.toLowerCase())); if (k) ui.fieldError($(map[k]), msg); });
          if (errs.length) return;
          const dup = S.students.find((s) => s.email === p.email || String(s.docNumber).toUpperCase() === p.docNumber);
          if (dup) { ui.toast('El estudiante ya existe', 'warn', `${dup.fullName} ya está registrado: búsquelo en «Estudiante registrado».`); return; }
          password = initialPassword(p.fullName, p.docNumber);
          try {
            const uid = await ctx.B.provisionAccount({ password, profile: { role: 'student', ...p, classIds: [] } });
            student = { uid, ...p };
          } catch (er) { ui.toast('No se pudo crear la cuenta', 'error', errMsg(er)); return; }
        }
        const company = { ...emptyCompany(), name: $('#rp-company').value.trim(), startDate: $('#rp-start').value, endDate: $('#rp-end').value };
        try {
          const id = await ctx.B.createPractice({
            ownerId: S.user.uid, ownerName: teacherName(),
            studentId: student.uid, studentName: student.fullName, studentCode: student.studentCode, studentDoc: student.docNumber, studentDocType: student.docType,
            studentEmail: student.email, studentPhone: student.phone || '', period: $('#rp-period').value.trim() || currentPeriod(), status: 'activa',
            company, proposal: emptyProposal(), final: null
          });
          await notify({ userId: student.uid, type: 'practice', mode: 'student', title: 'Práctica empresarial registrada', message: 'Su docente registró su práctica. Complete los datos de la empresa y la propuesta.', link: `#/practica/${id}/empresa`, practiceId: id });
          m.close();
          if (password) showCredentials({ name: student.fullName, email: student.email, password, role: 'estudiante' });
          else ui.toast('Práctica registrada', 'success', `${student.fullName} ya puede diligenciar su práctica.`);
          location.hash = `#/practica/${id}`;
        } catch (er) { ui.toast('No se pudo registrar la práctica', 'error', errMsg(er)); }
      }));
    }
  });
}

// =====================================================================
//  CALENDARIO DE VISITAS
// =====================================================================
const WEEK = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const timeOf = (ms) => new Date(ms).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

function calendarWidget(box, { getMonth, setMonth, canEdit, practiceId = null }) {
  box.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-cal]');
    if (nav) {
      const m = new Date(getMonth());
      if (nav.dataset.cal === 'prev') m.setMonth(m.getMonth() - 1);
      if (nav.dataset.cal === 'next') m.setMonth(m.getMonth() + 1);
      if (nav.dataset.cal === 'today') { const t = new Date(); m.setFullYear(t.getFullYear(), t.getMonth(), 1); }
      setMonth(m); return;
    }
    const v = e.target.closest('[data-visit]');
    if (v) { const visit = S.visits.find((x) => x.id === v.dataset.visit); if (visit) openVisit(visit); return; }
    const d = e.target.closest('[data-day]');
    if (d && canEdit) visitModal({ practice: practiceId ? practiceById(practiceId) : null, date: +d.dataset.day });
  });
  function render() {
    const m = getMonth(), y = m.getFullYear(), mo = m.getMonth();
    const first = new Date(y, mo, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    const today = new Date();
    const vs = (practiceId ? visitsOf(practiceId) : S.visits.slice().sort((a, b) => a.date - b.date));
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      if (i >= 35 && d.getMonth() !== mo) break;
      const dayVisits = vs.filter((v) => sameDay(new Date(v.date), d));
      const at = new Date(d); at.setHours(9, 0, 0, 0);
      cells.push(`<div class="cal-cell ${d.getMonth() !== mo ? 'out' : ''} ${sameDay(d, today) ? 'today' : ''} ${canEdit ? 'can' : ''}" ${canEdit ? `data-day="${at.getTime()}" role="button" tabindex="0" aria-label="Agendar visita el ${d.getDate()} de ${MONTHS[d.getMonth()]}"` : ''}>
        <span class="cal-d">${d.getDate()}</span>
        ${dayVisits.map((v) => { const p = practiceById(v.practiceId); return `<button type="button" class="cal-ev ${v.mode} ${v.status}" data-visit="${v.id}" title="${esc(`${timeOf(v.date)} · ${p?.studentName || ''} · ${VISIT_MODES[v.mode]?.short || ''}`)}">${icon(VISIT_MODES[v.mode]?.icon || 'calendar')}<span>${timeOf(v.date)} ${esc((p?.studentName || '').split(' ')[0])}</span></button>`; }).join('')}
      </div>`);
    }
    const upcoming = vs.filter((v) => v.date >= Date.now() - 3600e3 && v.status !== 'cancelada').slice(0, 8);
    box.innerHTML = `
      <div class="cal-head">
        <h2>${icon('calendar')}${MONTHS[mo][0].toUpperCase() + MONTHS[mo].slice(1)} ${y}</h2>
        <div class="cal-nav"><button class="btn btn-sm" data-cal="today">Hoy</button><button class="btn btn-icon btn-sm" data-cal="prev" aria-label="Mes anterior">${icon('arrowLeft')}</button><button class="btn btn-icon btn-sm" data-cal="next" aria-label="Mes siguiente">${icon('arrowRight')}</button>
        ${canEdit ? `<button class="btn btn-sm btn-primary" data-day="${Date.now() + 864e5}">${icon('plus')}Agendar visita</button>` : ''}</div>
      </div>
      <div class="cal-legend"><span class="lg presencial">${icon('building')}Presencial</span><span class="lg virtual">${icon('video')}Virtual</span><span class="lg realizada">${icon('check')}Realizada</span>${canEdit ? '<span class="muted">Clic en un día para agendar</span>' : ''}</div>
      <div class="cal-grid">${WEEK.map((w) => `<div class="cal-w">${w}</div>`).join('')}${cells.join('')}</div>
      <div class="cal-agenda">
        <h3>${icon('clock')}Próximas visitas</h3>
        ${upcoming.length ? upcoming.map((v) => visitRow(v, !practiceId)).join('') : '<p class="muted">No hay visitas programadas.</p>'}
      </div>`;
  }
  return { render };
}

function visitRow(v, showStudent = true) {
  const p = practiceById(v.practiceId);
  const md = VISIT_MODES[v.mode] || VISIT_MODES.presencial, st = VISIT_STATUS[v.status] || VISIT_STATUS.programada;
  return `<button type="button" class="visit-row ${v.mode}" data-visit="${v.id}">
    <span class="vr-date"><b>${new Date(v.date).getDate()}</b><small>${MONTHS[new Date(v.date).getMonth()].slice(0, 3)}</small></span>
    <span class="vr-body"><b>${showStudent ? esc(p?.studentName || 'Práctica') : esc(md.label)}</b>
      <small>${icon('clock')}${timeOf(v.date)} · ${v.duration || 60} min · ${icon(md.icon)}${md.short}${showStudent && p?.company?.name ? ` · ${esc(p.company.name)}` : ''}</small></span>
    <span class="badge ${st.cls}">${st.label}</span>
    ${v.acta?.done ? `<span class="badge b-success" title="Acta diligenciada">${icon('fileCheck')}Acta</span>` : ''}
  </button>`;
}

function openVisit(v) {
  const p = practiceById(v.practiceId);
  if (!p) return;
  if (isTeacherView()) visitModal({ practice: p, visit: v }); else studentVisitModal(p, v);
}

// ICS para agregar la visita al calendario personal
function downloadICS(v, p) {
  const d = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = v.date + (v.duration || 60) * 60000;
  const md = VISIT_MODES[v.mode] || VISIT_MODES.presencial;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AulaNexus//Practicas//ES', 'BEGIN:VEVENT',
    `UID:${v.id}@aulanexus`, `DTSTAMP:${d(Date.now())}`, `DTSTART:${d(v.date)}`, `DTEND:${d(end)}`,
    `SUMMARY:Visita de práctica (${md.short}) · ${p.studentName}`,
    `LOCATION:${String(v.place || p.company?.address || '').replace(/[,;]/g, ' ')}`,
    `DESCRIPTION:${String(`Empresa: ${p.company?.name || ''}. ${v.notes || ''}`).replace(/\n/g, ' ').replace(/[,;]/g, ' ')}`,
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  saveBlob(new Blob([ics], { type: 'text/calendar' }), `visita-${fileBase(p.studentName)}.ics`);
}

// ---------- Visita: crear / editar / acta (solo docente) ----------
function visitModal({ practice = null, visit = null, date = null }) {
  const active = S.practices.filter((p) => (p.status || 'activa') === 'activa').map(withStudent).sort((a, b) => byName(a.studentName, b.studentName));
  if (!practice && !active.length) { ui.toast('Sin prácticas en curso', 'warn', 'Registre primero una práctica.'); return; }
  const v = visit ? clone(visit) : { date: date || Date.now() + 864e5, duration: 60, mode: 'presencial', place: '', notes: '', status: 'programada', acta: { responsible: '', development: '', done: false } };
  const dt = new Date(v.date);
  const pad = (n) => String(n).padStart(2, '0');
  let pane = 'data';
  const pr0 = practice ? withStudent(practice) : null;
  ui.modal({
    title: visit ? 'Visita de seguimiento' : 'Agendar visita', subtitle: pr0 ? `${esc(pr0.studentName)} · ${esc(pr0.company?.name || 'Empresa sin registrar')}` : 'Seleccione el practicante', iconName: 'calendar', size: 'xl',
    body: `
      ${visit ? `<div class="segmented" data-pane-sel style="margin-bottom:14px">
        <button type="button" class="active" data-p="data">${icon('calendar')}Datos de la visita</button>
        <button type="button" data-p="acta">${icon('pen')}Acta de la visita</button>
        <button type="button" data-p="preview">${icon('eye')}Vista previa del acta</button></div>` : ''}
      <div data-pane="data">
        <div class="form-grid">
          ${practice ? '' : `<div class="field span-2"><label>Practicante</label><select class="input" id="vs-pr">${active.map((p) => `<option value="${p.id}">${esc(p.studentName)} · ${esc(p.company?.name || 'sin empresa')}</option>`).join('')}</select></div>`}
          <div class="field"><label>Fecha</label><input class="input" id="vs-date" type="date" value="${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}"></div>
          <div class="field"><label>Hora</label><input class="input" id="vs-time" type="time" value="${pad(dt.getHours())}:${pad(dt.getMinutes())}"></div>
          <div class="field"><label>Duración</label><select class="input" id="vs-dur">${[30, 45, 60, 90, 120].map((n) => `<option value="${n}" ${n === (v.duration || 60) ? 'selected' : ''}>${n} minutos</option>`).join('')}</select></div>
          <div class="field"><label>Estado</label><select class="input" id="vs-status">${Object.entries(VISIT_STATUS).map(([k, s]) => `<option value="${k}" ${k === v.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
          <div class="field span-2"><span class="label">Modalidad</span>
            <div class="mode-pick">${Object.entries(VISIT_MODES).map(([k, m]) => `<label class="mode-opt"><input type="radio" name="vs-mode" value="${k}" ${k === v.mode ? 'checked' : ''}><span>${icon(m.icon)}<b>${m.label}</b></span></label>`).join('')}</div></div>
          <div class="field span-2"><label id="vs-place-l">${v.mode === 'virtual' ? 'Enlace de la videollamada' : 'Lugar de la visita'}</label><input class="input" id="vs-place" value="${esc(v.place || (v.mode === 'presencial' ? (pr0?.company?.address || '') : ''))}" placeholder="${v.mode === 'virtual' ? 'https://meet.google.com/…' : 'Dirección de la empresa'}"></div>
          <div class="field span-2"><label>Notas <span class="hint">visibles para el estudiante</span></label><textarea class="input" id="vs-notes" rows="2">${esc(v.notes || '')}</textarea></div>
        </div>
      </div>
      ${visit ? `<div data-pane="acta" hidden>
        <div class="callout" style="font-size:13px">${icon('info')}<div>Formato institucional <b>Acta Control Visita Empresarial</b>. Solo el docente lo diligencia; el estudiante puede verlo y descargarlo cuando esté completo.</div></div>
        <div class="field"><label>Responsable de la empresa presente en la visita</label><input class="input" id="ac-resp" value="${esc(v.acta?.responsible || pr0?.company?.contactName || '')}"></div>
        <div class="field"><label>Breve explicación del desarrollo de la visita y conclusiones</label><textarea class="input" id="ac-dev" rows="9" placeholder="Desarrollo de la visita, avances verificados, observaciones de la empresa, compromisos y conclusiones.">${esc(v.acta?.development || '')}</textarea></div>
        <label class="check"><input type="checkbox" id="ac-done" ${v.acta?.done ? 'checked' : ''}><span>Acta completa (la visita queda como <b>realizada</b>)</span></label>
      </div>
      <div data-pane="preview" hidden><div class="doc-preview" data-acta-prev></div></div>` : ''}`,
    footer: `${visit ? `<button class="btn btn-danger" data-del>${icon('trash')}Eliminar</button><button class="btn" data-ics>${icon('calendar')}.ics</button><button class="btn" data-word data-loading="Generando…">${icon('download')}Acta en Word</button>` : ''}<span style="flex:1"></span><button class="btn" data-close>Cerrar</button><button class="btn btn-primary" data-save data-loading="Guardando…">${icon('check')}${visit ? 'Guardar' : 'Agendar visita'}</button>`,
    onMount(el, m) {
      const $ = (s) => el.querySelector(s);
      const currentPractice = () => withStudent(practice || practiceById($('#vs-pr').value));
      const read = () => {
        const [y, mo, d] = $('#vs-date').value.split('-').map(Number);
        const [h, mi] = ($('#vs-time').value || '09:00').split(':').map(Number);
        const out = {
          date: new Date(y, mo - 1, d, h, mi).getTime(), duration: +$('#vs-dur').value, status: $('#vs-status').value,
          mode: el.querySelector('input[name="vs-mode"]:checked').value, place: $('#vs-place').value.trim(), notes: $('#vs-notes').value.trim()
        };
        if (visit) {
          out.acta = { responsible: $('#ac-resp').value.trim(), development: $('#ac-dev').value.trim(), done: $('#ac-done').checked, completedAt: $('#ac-done').checked ? (v.acta?.completedAt || Date.now()) : null };
          if (out.acta.done && out.status === 'programada') out.status = 'realizada';
        }
        return out;
      };
      el.querySelectorAll('input[name="vs-mode"]').forEach((r) => r.addEventListener('change', () => {
        const virt = el.querySelector('input[name="vs-mode"]:checked').value === 'virtual';
        $('#vs-place-l').textContent = virt ? 'Enlace de la videollamada' : 'Lugar de la visita';
        $('#vs-place').placeholder = virt ? 'https://meet.google.com/…' : 'Dirección de la empresa';
        if (!virt && !$('#vs-place').value) $('#vs-place').value = currentPractice()?.company?.address || '';
      }));
      $('[data-pane-sel]')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-p]'); if (!b) return;
        pane = b.dataset.p;
        $('[data-pane-sel]').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        el.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== pane; });
        if (pane === 'preview') $('[data-acta-prev]').innerHTML = actaHTML(currentPractice(), { ...v, ...read() });
      });
      $('[data-ics]')?.addEventListener('click', () => downloadICS({ ...v, ...read() }, currentPractice()));
      $('[data-word]')?.addEventListener('click', (e) => ui.withLoading(e.currentTarget, async () => {
        try {
          const pr = currentPractice(), vv = { ...v, ...read() };
          saveBlob(await buildActaDocx(pr, vv), `Acta_Visita_${fileBase(pr.studentName)}_${new Date(vv.date).toISOString().slice(0, 10)}.docx`);
        } catch (er) { ui.toast('No se pudo generar el Word', 'error', er.message); }
      }));
      $('[data-del]')?.addEventListener('click', async () => {
        const ok = await ui.confirmDialog({ title: 'Eliminar visita', danger: true, confirm: 'Eliminar', iconName: 'trash', message: 'Se eliminará la visita y su acta.' });
        if (!ok) return;
        try { await ctx.B.deleteVisit(visit.id); ui.toast('Visita eliminada', 'success'); m.close(); } catch (er) { ui.toast('Error', 'error', errMsg(er)); }
      });
      $('[data-save]').addEventListener('click', (e) => ui.withLoading(e.currentTarget, async () => {
        const pr = currentPractice();
        if (!$('#vs-date').value) { ui.fieldError($('#vs-date'), 'Seleccione la fecha.'); return; }
        const data = read();
        try {
          if (visit) {
            await ctx.B.updateVisit(visit.id, data);
            const moved = data.date !== visit.date || data.mode !== visit.mode || data.status !== visit.status;
            if (moved) await notifyStudent(pr, data.status === 'cancelada' ? 'Visita cancelada' : 'Visita actualizada', `${longDate(data.date)} · ${timeOf(data.date)} · ${VISIT_MODES[data.mode].short}`, 'visitas');
            ui.toast('Visita guardada', 'success', data.acta?.done ? 'El acta quedó completa.' : '');
          } else {
            await ctx.B.createVisit({ ...data, practiceId: pr.id, ownerId: pr.ownerId, studentId: pr.studentId, acta: { responsible: '', development: '', done: false } });
            await notifyStudent(pr, 'Nueva visita de seguimiento', `${longDate(data.date)} · ${timeOf(data.date)} · ${VISIT_MODES[data.mode].short}`, 'visitas');
            ui.toast('Visita agendada', 'success', `Se notificó a ${pr.studentName}.`);
          }
          m.close();
        } catch (er) { ui.toast('No se pudo guardar', 'error', errMsg(er)); }
      }));
    }
  });
}

function studentVisitModal(p, v) {
  const md = VISIT_MODES[v.mode] || VISIT_MODES.presencial, st = VISIT_STATUS[v.status] || VISIT_STATUS.programada;
  const pr = withStudent(p);
  ui.modal({
    title: 'Visita de seguimiento', subtitle: `${esc(pr.company?.name || '')}`, iconName: 'calendar', size: v.acta?.done ? 'xl' : '',
    body: `<div class="kv wrap">
        <div><small>Fecha</small><b>${esc(longDate(v.date))}</b></div><div><small>Hora</small><b>${timeOf(v.date)} · ${v.duration || 60} min</b></div>
        <div><small>Modalidad</small><b>${icon(md.icon)} ${md.label}</b></div><div><small>Estado</small><b><span class="badge ${st.cls}">${st.label}</span></b></div>
        <div style="grid-column:1/-1"><small>${v.mode === 'virtual' ? 'Enlace' : 'Lugar'}</small><b>${/^https?:\/\//.test(v.place || '') ? `<a href="${esc(v.place)}" target="_blank" rel="noopener">${esc(v.place)}</a>` : esc(v.place || '—')}</b></div>
        ${v.notes ? `<div style="grid-column:1/-1"><small>Notas del docente</small><b style="font-weight:500">${esc(v.notes)}</b></div>` : ''}
      </div>
      ${v.acta?.done ? `<h3 style="margin:18px 0 10px">Acta de la visita</h3><div class="doc-preview">${actaHTML(pr, v)}</div>` : '<p class="muted" style="margin-top:14px">El acta estará disponible cuando el docente la diligencie.</p>'}`,
    footer: `<button class="btn" data-ics>${icon('calendar')}Agregar a mi calendario</button>${v.acta?.done ? `<button class="btn" data-word data-loading="Generando…">${icon('download')}Acta en Word</button>` : ''}<button class="btn btn-primary" data-close>Cerrar</button>`,
    onMount(el) {
      el.querySelector('[data-ics]').addEventListener('click', () => downloadICS(v, pr));
      el.querySelector('[data-word]')?.addEventListener('click', (e) => ui.withLoading(e.currentTarget, async () => {
        try { saveBlob(await buildActaDocx(pr, v), `Acta_Visita_${fileBase(pr.studentName)}.docx`); } catch (er) { ui.toast('No se pudo generar el Word', 'error', er.message); }
      }));
    }
  });
}

// =====================================================================
//  ESTUDIANTE · ENTRADA
// =====================================================================
function myPractice(el) {
  ui.setCrumb('Mi práctica', 'PRÁCTICA EMPRESARIAL');
  let mounted = null, mountedId = null;
  function update() {
    if (!S.ready.practices) { el.innerHTML = `<div class="panel">${skeletonLines(3)}</div>`; return; }
    const list = S.practices.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (!list.length) { mounted?.destroy?.(); mounted = null; mountedId = null; el.innerHTML = `<div class="panel">${empty('briefcase', 'Sin práctica registrada', 'Su docente asesor debe registrar su práctica empresarial.')}</div>`; return; }
    const act = list.find((p) => (p.status || 'activa') === 'activa') || list[0];
    if (list.length > 1 && !mountedId) {
      el.innerHTML = `<div class="stack"><div class="panel"><div class="panel-head"><h2>${icon('briefcase')}Mis prácticas</h2></div><div class="pr-list">${list.map(practiceCard).join('')}</div></div></div>`;
      el.onclick = (e) => { const c = e.target.closest('[data-open]'); if (c && !e.target.closest('a,button')) location.hash = `#/practica/${c.dataset.open}`; };
      return;
    }
    if (mountedId !== act.id) { mounted?.destroy?.(); el.innerHTML = ''; mountedId = act.id; mounted = practiceDetail(el, act.id); }
    else mounted?.update?.();
  }
  update();
  return { update, destroy: () => mounted?.destroy?.() };
}

// =====================================================================
//  FICHA DE LA PRÁCTICA (docente y estudiante)
// =====================================================================
const TABS = [['resumen', 'home', 'Resumen'], ['empresa', 'building', 'Empresa'], ['propuesta', 'fileText', 'Propuesta'], ['informe', 'fileCheck', 'Informe final'], ['visitas', 'calendar', 'Visitas']];
const SECTIONS = {
  proposal: ['General', 'Encabezado e información', 'Descripción general', 'Necesidades', 'Resultado esperado', 'Objetivo general', 'Objetivos específicos', 'Proceso metodológico', 'Actividades'],
  final: (f) => ['General', 'Portada', 'Preliminares', ...(f?.chapters || []).map((c) => c.title), 'Referencias', 'Anexos']
};

function practiceDetail(el, id) {
  const teacher = isTeacherView();
  const hashTab = (location.hash.split('/')[3] || '').toLowerCase();
  let tab = TABS.some((t) => t[0] === hashTab) ? hashTab : 'resumen';
  let comments = [], files = [];
  let editor = null, editorKey = null, view = 'edit';
  let draft = null, dirty = false, saving = false, lastSaved = 0, saveTimer = null, seenStamp = null;
  let visMonth = new Date(); visMonth.setDate(1);

  const unC = ctx.B.watchPracticeComments(id, (l) => { comments = l; paintComments(); paintTabs(); if (tab === 'resumen') paintBody(); });
  const unF = ctx.B.watchPracticeFiles(id, teacher ? 'ownerId' : 'studentId', S.user.uid, (l) => { files = l; editor?.refreshFiles?.(); if (view === 'preview') paintPreview(); });

  el.innerHTML = `<div class="stack pr-detail">
    ${teacher ? `<a class="back-link" href="#/practicas">${icon('arrowLeft')}Prácticas</a>` : ''}
    <section class="hero pr-hero" id="pd-hero"></section>
    <div class="tabs pr-tabs" role="tablist" id="pd-tabs"></div>
    <div id="pd-body"></div>
  </div>`;
  const $ = (s) => el.querySelector(s);

  const practice = () => { const p = practiceById(id); return p ? withStudent(p) : null; };
  const canEditDoc = (key) => {
    const p = practice(); if (!p) return false;
    const st = (key === 'proposal' ? p.proposal?.status : p.final?.status) || 'borrador';
    if (teacher) return st !== 'aprobado';
    return (p.status || 'activa') === 'activa' && (st === 'borrador' || st === 'correcciones');
  };
  const canEditCompany = () => teacher || (practice()?.status || 'activa') === 'activa';

  // ---------- Encabezado ----------
  function paintHero() {
    const p = practice(); if (!p) return;
    const st = PRACTICE_STATUS[p.status || 'activa'];
    ui.setCrumb(p.studentName, teacher ? 'PRÁCTICAS / FICHA' : 'MI PRÁCTICA');
    const contact = teacher ? [
      p.studentPhone ? `<a href="tel:${esc(p.studentPhone)}">${icon('phone')}${esc(fmtPhone(p.studentPhone))}</a>` : '',
      p.studentPhone ? `<a href="${esc(waLink(p.studentPhone))}" target="_blank" rel="noopener">${icon('chat')}WhatsApp</a>` : '',
      p.studentEmail ? `<a href="mailto:${esc(p.studentEmail)}">${icon('mail')}${esc(p.studentEmail)}</a>` : ''
    ].filter(Boolean).join('') : `<span>${icon('grad')}Asesor: ${esc(p.ownerName || '')}</span>`;
    $('#pd-hero').innerHTML = `
      <div class="profile-hero">
        ${avatar(p.studentName, 'lg', p.studentId)}
        <div style="min-width:0">
          <span class="eyebrow">${icon('briefcase')}Práctica empresarial · ${esc(p.period || '')}</span>
          <h1 style="font-size:clamp(22px,3vw,32px)">${esc(p.studentName)}</h1>
          <div class="hero-meta"><span>${icon('building')}${p.company?.name ? esc(p.company.name) : '<i>Empresa sin registrar</i>'}</span><span class="mono">${icon('idcard')}${esc(p.studentDocType || 'CC')} ${esc(p.studentDoc || '')}</span><span class="badge ${st.cls}">${icon(st.icon)}${st.label}</span></div>
          <div class="hero-meta pr-contact">${contact}</div>
        </div>
      </div>
      ${teacher ? `<div class="hero-actions">
        ${(p.status || 'activa') === 'activa' ? `<button class="btn btn-sm" data-pact="finalizada">${icon('check')}Finalizar práctica</button>` : `<button class="btn btn-sm" data-pact="activa">${icon('restore')}Reactivar</button>`}
        <button class="btn btn-sm btn-danger" data-pact="delete" title="Eliminar práctica">${icon('trash')}</button>
      </div>` : ''}`;
  }

  function paintTabs() {
    const p = practice(); if (!p) return;
    const open = (doc) => comments.filter((c) => c.doc === doc && !c.resolved).length;
    const n = { propuesta: open('proposal'), informe: open('final') };
    const dot = (k) => { const st = k === 'propuesta' ? p.proposal?.status : k === 'informe' ? p.final?.status : null; return st && st !== 'borrador' ? `<i class="tab-dot ${st}" title="${DOC_STATUS[st].label}"></i>` : ''; };
    $('#pd-tabs').innerHTML = TABS.map(([k, ic, l]) => `<button class="${k === tab ? 'active' : ''}" data-tab="${k}">${icon(ic)}${l}${dot(k)}${n[k] ? `<span class="n">${n[k]}</span>` : ''}</button>`).join('');
  }

  // ---------- Contenido por pestaña ----------
  function paintBody() {
    const p = practice(); if (!p) return;
    const body = $('#pd-body');
    if (tab === 'resumen') { body.innerHTML = summaryHTML(p); return; }
    if (tab === 'empresa') { body.innerHTML = companyHTML(p); return; }
    if (tab === 'visitas') { body.innerHTML = '<div class="panel"><div id="pd-cal"></div></div>'; calV().render(); return; }
    mountDoc(tab === 'propuesta' ? 'proposal' : 'final');
  }
  let calInst = null;
  const calV = () => {
    const box = $('#pd-cal');
    if (!calInst || calInst.box !== box) { calInst = calendarWidget(box, { getMonth: () => visMonth, setMonth: (m) => { visMonth = m; calInst.render(); }, canEdit: teacher && (practice()?.status || 'activa') === 'activa', practiceId: id }); calInst.box = box; }
    return calInst;
  };

  function summaryHTML(p) {
    const cp = companyProgress(p.company), pp = proposalProgress(p.proposal || {}), fp = p.final ? finalProgress(p.final) : 0;
    const nv = nextVisit(p.id);
    const last = comments.slice(-3).reverse();
    const step = (k, ic, title, pct, status, extra = '') => `<button type="button" class="pr-step" data-go="${k}">
      <span class="pr-step-ic">${icon(ic)}</span><span class="pr-step-b"><b>${title}</b>${bar(pct)}<small>${pct}% ${status || ''}</small>${extra}</span>${icon('chevronRight')}</button>`;
    return `<div class="grid-2 pr-sum">
      <div class="panel">
        <div class="panel-head"><h2>${icon('zap')}Avance de la práctica</h2></div>
        <div class="pr-steps-v">
          ${step('empresa', 'building', 'Datos de la empresa', cp, '')}
          ${step('propuesta', 'fileText', 'Propuesta de práctica', pp, docBadge(p.proposal?.status))}
          ${step('informe', 'fileCheck', 'Informe final', fp, p.final ? docBadge(p.final.status) : '<span class="badge">Sin iniciar</span>')}
          ${step('visitas', 'calendar', 'Visitas de seguimiento', visitsOf(p.id).length ? Math.round((visitsOf(p.id).filter((v) => v.status === 'realizada').length / visitsOf(p.id).length) * 100) : 0, `${visitsOf(p.id).filter((v) => v.status === 'realizada').length} de ${visitsOf(p.id).length} realizadas`)}
        </div>
      </div>
      <div class="stack" style="gap:16px">
        <div class="panel"><div class="panel-head"><h2>${icon('calendar')}Próxima visita</h2></div>
          ${nv ? visitRow(nv, false) : `<p class="muted">${teacher ? 'No hay visitas programadas.' : 'Su docente aún no ha programado visitas.'}</p>`}
          ${teacher && (p.status || 'activa') === 'activa' ? `<button class="btn btn-sm" data-new-visit style="margin-top:10px">${icon('plus')}Agendar visita</button>` : ''}</div>
        <div class="panel"><div class="panel-head"><h2>${icon('chat')}Últimos comentarios</h2></div>
          ${last.length ? last.map((c) => `<div class="pc-mini"><b>${esc(c.authorName)}</b> <span class="muted">· ${DOC_NAMES[c.doc] || ''} · ${timeAgo(c.createdAt)}</span><p>${esc(c.text.slice(0, 180))}${c.text.length > 180 ? '…' : ''}</p></div>`).join('') : '<p class="muted">Sin comentarios todavía.</p>'}</div>
      </div>
    </div>`;
  }

  function companyHTML(p) {
    const c = { ...emptyCompany(), ...(p.company || {}) };
    const ro = !canEditCompany();
    const f = (k, label, type = 'text', extra = '') => `<div class="field ${extra}"><label for="co-${k}">${label}</label><input class="input" id="co-${k}" data-co="${k}" type="${type}" value="${esc(c[k] ?? '')}" ${ro ? 'readonly' : ''}><div class="error"></div></div>`;
    return `<div class="panel">
      <div class="panel-head"><h2>${icon('building')}Datos de la empresa</h2><span class="muted" style="font-size:12.5px">${companyProgress(c)}% diligenciado</span></div>
      <p class="muted" style="margin:-4px 0 14px;font-size:13.5px">Estos datos alimentan automáticamente la propuesta, el informe final y el acta de visita.</p>
      <form id="co-form" novalidate>
        <h3 class="co-h">${icon('building')}Organización</h3>
        <div class="form-grid">
          ${f('name', 'Razón social', 'text', 'span-2')}${f('nit', 'NIT')}${f('sector', 'Sector económico')}
          ${f('city', 'Ciudad')}${f('address', 'Dirección')}${f('phone', 'Teléfono de la empresa', 'tel')}${f('website', 'Sitio web')}
        </div>
        <h3 class="co-h">${icon('briefcase')}Práctica</h3>
        <div class="form-grid">
          ${f('area', 'Área o dependencia', 'text', 'span-2')}
          ${f('startDate', 'Fecha de inicio', 'date')}${f('endDate', 'Fecha de terminación', 'date')}
          <div class="field"><label for="co-paid">¿La práctica es remunerada?</label><select class="input" id="co-paid" data-co="paid" ${ro ? 'disabled' : ''}><option value="" ${c.paid == null ? 'selected' : ''}>Seleccione…</option><option value="si" ${c.paid === true ? 'selected' : ''}>Sí</option><option value="no" ${c.paid === false ? 'selected' : ''}>No</option></select></div>
          <div class="field"><label for="co-modality">Modalidad</label><select class="input" id="co-modality" data-co="modality" ${ro ? 'disabled' : ''}>${[['presencial', 'Presencial'], ['hibrida', 'Híbrida'], ['remota', 'Remota']].map(([v, l]) => `<option value="${v}" ${c.modality === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          ${f('hours', 'Horas semanales', 'number')}${f('schedule', 'Horario')}
        </div>
        <h3 class="co-h">${icon('user')}Funcionario responsable (jefe inmediato)</h3>
        <div class="form-grid">
          ${f('contactName', 'Nombre completo')}${f('contactRole', 'Cargo')}${f('contactPhone', 'Teléfono', 'tel')}${f('contactEmail', 'Correo electrónico', 'email')}
        </div>
        ${ro ? '' : `<div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn btn-primary" type="submit" data-loading="Guardando…">${icon('check')}Guardar datos de la empresa</button></div>`}
      </form>
    </div>`;
  }

  // ---------- Documento (propuesta / informe) ----------
  function docToolbar(key) {
    const p = practice(); const d = docOf(p, key) || {};
    const st = d.status || 'borrador';
    const pct = key === 'proposal' ? proposalProgress(d) : finalProgress(d);
    const tActs = teacher ? `
      ${st !== 'aprobado' ? `<button class="btn btn-sm btn-warn-soft" data-dact="changes">${icon('undo')}Solicitar correcciones</button><button class="btn btn-sm btn-success" data-dact="approve">${icon('fileCheck')}Marcar como correcto</button>` : `<button class="btn btn-sm" data-dact="reopen">${icon('restore')}Reabrir para cambios</button>`}`
      : `${st === 'borrador' || st === 'correcciones' ? `<button class="btn btn-sm btn-primary" data-dact="submit">${icon('send')}Enviar a revisión</button>` : st === 'enviado' ? `<button class="btn btn-sm" data-dact="withdraw">${icon('pen')}Retirar envío para editar</button>` : ''}`;
    const msg = {
      enviado: teacher ? 'El estudiante envió el documento: revíselo, comente y márquelo como correcto o solicite correcciones.' : 'Enviado a su docente. Mientras lo revisa, la edición está bloqueada.',
      correcciones: teacher ? 'Se solicitaron correcciones. El estudiante puede editar y volver a enviar.' : 'Su docente solicitó correcciones: revise los comentarios, ajuste el documento y envíelo de nuevo.',
      aprobado: teacher ? `Aprobado el ${fmtDate(d.approvedAt)}. Para editarlo, reábralo.` : `¡Su docente marcó el documento como correcto el ${fmtDate(d.approvedAt)}! Ya puede descargarlo en Word.`
    }[st];
    return `<div class="doc-bar">
      <div class="doc-bar-l"><h2>${icon(key === 'proposal' ? 'fileText' : 'fileCheck')}${DOC_NAMES[key]}</h2>${docBadge(st)}<span class="doc-pct">${bar(pct)}<small>${pct}%</small></span><span class="save-state" data-save-state></span></div>
      <div class="doc-bar-r">
        <div class="segmented seg-sm" data-view><button type="button" class="${view === 'edit' ? 'active' : ''}" data-v="edit">${icon('pen')}Editar</button><button type="button" class="${view === 'preview' ? 'active' : ''}" data-v="preview">${icon('eye')}Vista previa</button></div>
        <button class="btn btn-sm" data-dact="word" data-loading="Generando…">${icon('download')}Word</button>
        ${tActs}
      </div>
    </div>
    ${msg ? `<div class="callout ${st === 'aprobado' ? 'ok' : st === 'correcciones' ? 'warn' : ''} doc-msg">${icon(DOC_STATUS[st].icon)}<div>${msg}</div></div>` : ''}`;
  }

  function mountDoc(key) {
    const p = practice();
    const body = $('#pd-body');
    if (key === 'final' && !p.final) {
      body.innerHTML = `<div class="panel">${empty('fileCheck', 'Informe final', 'Se creará con la estructura institucional (portada, preliminares, diez capítulos, referencias y anexos), con los objetivos y la empresa tomados de la propuesta. La estructura es flexible: puede agregar, quitar y reordenar capítulos y bloques.', `${(teacher || (p.status || 'activa') === 'activa') ? `<button class="btn btn-primary" data-create-final data-loading="Creando…">${icon('plus')}Crear informe final</button>` : ''}`)}</div>`;
      editor = null; editorKey = null; return;
    }
    if (editorKey !== key || !draft) { draft = clone(docOf(p, key)); dirty = false; seenStamp = p.updatedAt; }
    editorKey = key;
    body.innerHTML = `<div class="doc-wrap">
      <div class="doc-top" data-doc-top>${docToolbar(key)}</div>
      <div class="doc-layout">
        <div class="doc-main"><div data-editor ${view === 'edit' ? '' : 'hidden'}></div><div class="doc-preview" data-preview ${view === 'preview' ? '' : 'hidden'}></div></div>
        <aside class="doc-side panel" data-comments></aside>
      </div>
    </div>`;
    const host = body.querySelector('[data-editor]');
    const common = { getDraft: () => draft, practice: () => practice(), readonly: !canEditDoc(key), onChange: () => markDirty() };
    editor = key === 'proposal'
      ? proposalEditor(host, { ...common, goCompany: () => switchTab('empresa') })
      : finalEditor(host, { ...common, uploadImage, filesById: () => new Map(files.map((f) => [f.id, f])) });
    if (view === 'preview') paintPreview();
    paintComments();
    paintSaveState();
  }

  function paintDocTop() {
    const top = el.querySelector('[data-doc-top]');
    if (top && editorKey) { top.innerHTML = docToolbar(editorKey); paintSaveState(); }
  }
  function paintPreview() {
    const box = el.querySelector('[data-preview]'); if (!box || !editorKey) return;
    const p = { ...practice(), [editorKey]: draft };
    box.innerHTML = editorKey === 'proposal' ? proposalHTML(p) : finalHTML(p, files);
  }

  // ---------- Guardado automático ----------
  function markDirty() {
    dirty = true; paintSaveState();
    clearTimeout(saveTimer); saveTimer = setTimeout(save, 1400);
  }
  async function save() {
    if (!dirty || !editorKey || saving) return;
    saving = true; dirty = false; paintSaveState();
    const key = editorKey, snapshot = clone(draft);
    try {
      await ctx.B.updatePractice(id, { [key]: snapshot });
      lastSaved = Date.now();
    } catch (er) {
      dirty = true;
      ui.toast('No se pudo guardar', 'error', errMsg(er));
    } finally { saving = false; paintSaveState(); if (dirty) { clearTimeout(saveTimer); saveTimer = setTimeout(save, 2500); } }
  }
  function paintSaveState() {
    const s = el.querySelector('[data-save-state]'); if (!s) return;
    if (!canEditDoc(editorKey)) { s.innerHTML = `${icon('lock')}Solo lectura`; s.className = 'save-state ro'; return; }
    s.className = `save-state ${saving ? 'saving' : dirty ? 'dirty' : 'ok'}`;
    s.innerHTML = saving ? `${icon('clock')}Guardando…` : dirty ? `${icon('pen')}Cambios sin guardar` : `${icon('check')}${lastSaved ? 'Guardado' : 'Al día'}`;
  }
  async function flush() { clearTimeout(saveTimer); if (dirty) await save(); }

  async function uploadImage(file, oldId) {
    const p = practice();
    const img = await compressImage(file);
    const newId = await ctx.B.addPracticeFile({ practiceId: id, ownerId: p.ownerId, studentId: p.studentId, name: img.name, dataUrl: img.dataUrl, w: img.w, h: img.h, size: img.size, createdBy: S.user.uid });
    if (oldId) ctx.B.deletePracticeFile(oldId).catch(() => {});
    files = [...files, { id: newId, ...img }];
    return newId;
  }

  // ---------- Comentarios ----------
  function paintComments() {
    const box = el.querySelector('[data-comments]'); if (!box || !editorKey) return;
    const p = practice();
    const list = comments.filter((c) => c.doc === editorKey);
    const secs = editorKey === 'proposal' ? SECTIONS.proposal : SECTIONS.final(draft);
    const listHTML = () => list.length ? list.map((c) => commentHTML(c)).join('') : `<p class="muted pc-empty">${teacher ? 'Escriba observaciones para el estudiante sobre este documento.' : 'Aquí verá las observaciones de su docente.'}</p>`;
    if (box.dataset.built === editorKey && box.querySelector('.pc-list')) {
      box.querySelector('.pc-list').innerHTML = listHTML();
      box.querySelector('[data-open-n]').textContent = `${list.filter((c) => !c.resolved).length} abiertos`;
      const pl0 = box.querySelector('.pc-list'); pl0.scrollTop = pl0.scrollHeight;
      return;
    }
    box.dataset.built = editorKey;
    box.innerHTML = `
      <div class="panel-head"><h2>${icon('chat')}Comentarios</h2><span class="muted" style="font-size:12.5px" data-open-n>${list.filter((c) => !c.resolved).length} abiertos</span></div>
      <div class="pc-list">${listHTML()}</div>
      ${(p.status || 'activa') === 'activa' || teacher ? `<form class="pc-form" novalidate>
        <select class="input" id="pc-sec" aria-label="Sección">${secs.map((s) => `<option>${esc(s)}</option>`).join('')}</select>
        <textarea class="input" id="pc-text" rows="3" maxlength="4000" placeholder="${teacher ? 'Comentario para el estudiante…' : 'Responder a su docente…'}"></textarea>
        <button class="btn btn-primary btn-sm" type="submit" data-loading="Enviando…">${icon('send')}${teacher ? 'Comentar' : 'Responder'}</button>
      </form>` : ''}`;
    const pl = box.querySelector('.pc-list'); pl.scrollTop = pl.scrollHeight;
  }
  function commentHTML(c) {
    return `<div class="pc ${c.role} ${c.resolved ? 'resolved' : ''}">
      <div class="pc-head">${avatar(c.authorName, 'sm', c.authorId)}<div><b>${esc(c.authorName)}</b><small>${c.role === 'teacher' ? 'Docente' : 'Estudiante'} · ${timeAgo(c.createdAt)}</small></div>
        ${teacher ? `<div class="pc-tools"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-cres="${c.id}" title="${c.resolved ? 'Reabrir' : 'Marcar como resuelto'}" aria-label="${c.resolved ? 'Reabrir' : 'Marcar como resuelto'}">${icon(c.resolved ? 'restore' : 'check')}</button><button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger" data-cdel="${c.id}" title="Eliminar" aria-label="Eliminar">${icon('trash')}</button></div>` : ''}</div>
      ${c.section && c.section !== 'General' ? `<span class="pc-sec">${icon('pin')}${esc(c.section)}</span>` : ''}
      <p>${esc(c.text)}</p>
      ${c.resolved ? `<small class="pc-ok">${icon('check')}Resuelto</small>` : ''}
    </div>`;
  }
  async function addComment(text, section, doc = editorKey) {
    const p = practice();
    await ctx.B.addPracticeComment(id, { doc, section, text, authorId: S.user.uid, authorName: S.profile?.fullName || (teacher ? p.ownerName : p.studentName), role: teacher ? 'teacher' : 'student', resolved: false });
    if (teacher) await notifyStudent(p, `Nuevo comentario · ${DOC_NAMES[doc]}`, text.slice(0, 120), doc === 'proposal' ? 'propuesta' : 'informe');
    else await notifyTeacher(p, `Respuesta de ${p.studentName}`, `${DOC_NAMES[doc]}: ${text.slice(0, 100)}`, doc === 'proposal' ? 'propuesta' : 'informe');
  }

  // ---------- Flujo de revisión ----------
  async function setDocStatus(key, status, extra = {}) {
    await flush();
    const p = practice();
    const cur = draft && editorKey === key ? draft : clone(docOf(p, key));
    const next = { ...cur, status, ...extra };
    await ctx.B.updatePractice(id, { [key]: next });
    draft = clone(next); dirty = false;
  }
  async function docAction(act, btn) {
    const key = editorKey, p = practice(), name = DOC_NAMES[key];
    const tabName = key === 'proposal' ? 'propuesta' : 'informe';
    if (act === 'word') {
      await ui.withLoading(btn, async () => {
        try {
          await flush();
          const pp = { ...practice(), [key]: draft };
          const blob = key === 'proposal' ? await buildProposalDocx(pp) : await buildFinalDocx(pp, files);
          saveBlob(blob, `${key === 'proposal' ? 'Propuesta_Practica' : 'Informe_Final_Practica'}_${fileBase(pp.studentName)}.docx`);
        } catch (er) { console.error(er); ui.toast('No se pudo generar el Word', 'error', er.message); }
      });
      return;
    }
    try {
      if (act === 'submit') {
        const pct = key === 'proposal' ? proposalProgress(draft) : finalProgress(draft);
        if (pct < 60 && !(await ui.confirmDialog({ title: 'Enviar a revisión', iconName: 'send', confirm: 'Enviar de todas formas', message: `El documento está diligenciado en un ${pct}%. ¿Desea enviarlo así a su docente?` }))) return;
        await setDocStatus(key, 'enviado', { submittedAt: Date.now() });
        await notifyTeacher(p, `${name} enviado a revisión`, `${p.studentName} envió su ${name.toLowerCase()}.`, tabName);
        ui.toast('Documento enviado', 'success', 'Su docente fue notificado.');
      }
      if (act === 'withdraw') { await setDocStatus(key, 'borrador'); ui.toast('Envío retirado', 'info', 'Puede seguir editando el documento.'); }
      if (act === 'approve') {
        if (!(await ui.confirmDialog({ title: 'Marcar como correcto', iconName: 'fileCheck', confirm: 'Aprobar documento', message: `¿Confirma que <b>${esc(name.toLowerCase())}</b> de ${esc(p.studentName)} está correcto? Quedará bloqueado para edición (puede reabrirlo después).` }))) return;
        await setDocStatus(key, 'aprobado', { approvedAt: Date.now(), approvedBy: S.user.uid });
        await notifyStudent(p, `${name} aprobado`, `Su docente marcó ${name.toLowerCase()} como correcto. Ya puede descargarlo en Word.`, tabName);
        ui.toast('Documento aprobado', 'success', `Se notificó a ${p.studentName}.`);
      }
      if (act === 'reopen') { await setDocStatus(key, 'correcciones', { approvedAt: null }); ui.toast('Documento reabierto', 'info'); }
      if (act === 'changes') { changesModal(key); return; }
      mountDoc(key);
    } catch (er) { ui.toast('No se pudo completar la acción', 'error', errMsg(er)); }
  }
  function changesModal(key) {
    const secs = key === 'proposal' ? SECTIONS.proposal : SECTIONS.final(draft);
    ui.modal({
      title: 'Solicitar correcciones', subtitle: DOC_NAMES[key], iconName: 'undo',
      body: `<p class="muted" style="margin-top:0">El documento vuelve al estudiante para que lo ajuste. Su comentario queda registrado en el documento.</p>
        <div class="field"><label>Sección</label><select class="input" id="ch-sec">${secs.map((s) => `<option>${esc(s)}</option>`).join('')}</select></div>
        <div class="field"><label>¿Qué debe corregir?</label><textarea class="input" id="ch-text" rows="5"></textarea><div class="error"></div></div>`,
      footer: `<button class="btn" data-close>Cancelar</button><button class="btn btn-warn" data-ok data-loading="Enviando…">${icon('undo')}Solicitar correcciones</button>`,
      onMount(m, modal) {
        m.querySelector('[data-ok]').addEventListener('click', (e) => ui.withLoading(e.currentTarget, async () => {
          const t = m.querySelector('#ch-text');
          if (t.value.trim().length < 5) { ui.fieldError(t, 'Describa brevemente las correcciones.'); return; }
          try {
            await setDocStatus(key, 'correcciones');
            await addComment(t.value.trim(), m.querySelector('#ch-sec').value, key);
            ui.toast('Correcciones solicitadas', 'success', `Se notificó a ${practice().studentName}.`);
            modal.close(); mountDoc(key);
          } catch (er) { ui.toast('Error', 'error', errMsg(er)); }
        }));
      }
    });
  }

  function switchTab(t) {
    if (t === tab) return;
    flush();
    tab = t;
    if (t !== 'propuesta' && t !== 'informe') { editor = null; editorKey = null; draft = null; }
    else { const k = t === 'propuesta' ? 'proposal' : 'final'; if (editorKey !== k) { editorKey = null; draft = null; view = 'edit'; } }
    history.replaceState(null, '', `#/practica/${id}${t === 'resumen' ? '' : `/${t}`}`);
    paintTabs(); paintBody();
  }

  // ---------- Eventos ----------
  el.addEventListener('click', async (e) => {
    const tb = e.target.closest('[data-tab]'); if (tb) { switchTab(tb.dataset.tab); return; }
    const go = e.target.closest('[data-go]'); if (go) { switchTab(go.dataset.go); return; }
    const v = e.target.closest('[data-visit]'); if (v && !v.closest('#pd-cal')) { const visit = S.visits.find((x) => x.id === v.dataset.visit); if (visit) openVisit(visit); return; }
    if (e.target.closest('#pd-cal')) return;
    if (e.target.closest('[data-new-visit]')) { visitModal({ practice: practiceById(id) }); return; }
    const vw = e.target.closest('[data-v]');
    if (vw) {
      view = vw.dataset.v;
      el.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('active', x === vw));
      el.querySelector('[data-editor]').hidden = view !== 'edit';
      el.querySelector('[data-preview]').hidden = view !== 'preview';
      if (view === 'preview') paintPreview(); else editor?.render();
      return;
    }
    const da = e.target.closest('[data-dact]'); if (da) { docAction(da.dataset.dact, da); return; }
    const cf = e.target.closest('[data-create-final]');
    if (cf) {
      await ui.withLoading(cf, async () => {
        const p = practice();
        try {
          await ctx.B.updatePractice(id, { final: defaultFinal({ teacher: p.ownerName, company: p.company || {}, proposal: p.proposal || {} }) });
          editorKey = null; draft = null;
          setTimeout(() => mountDoc('final'), 50);
        } catch (er) { ui.toast('No se pudo crear el informe', 'error', errMsg(er)); }
      });
      return;
    }
    const cr = e.target.closest('[data-cres]');
    if (cr) { const c = comments.find((x) => x.id === cr.dataset.cres); try { await ctx.B.updatePracticeComment(id, c.id, { resolved: !c.resolved }); } catch (er) { ui.toast('Error', 'error', errMsg(er)); } return; }
    const cd = e.target.closest('[data-cdel]');
    if (cd) { if (await ui.confirmDialog({ title: 'Eliminar comentario', danger: true, confirm: 'Eliminar', iconName: 'trash', message: '¿Eliminar este comentario?' })) { try { await ctx.B.deletePracticeComment(id, cd.dataset.cdel); } catch (er) { ui.toast('Error', 'error', errMsg(er)); } } return; }
    const pa = e.target.closest('[data-pact]');
    if (pa) {
      const p = practice();
      if (pa.dataset.pact === 'delete') {
        const ok = await ui.confirmDialog({ title: 'Eliminar práctica', danger: true, confirm: 'Eliminar', iconName: 'trash', message: `Se eliminará la práctica de <b>${esc(p.studentName)}</b> con sus documentos y visitas. Esta acción no se puede deshacer.` });
        if (!ok) return;
        try {
          for (const v of visitsOf(id)) await ctx.B.deleteVisit(v.id).catch(() => {});
          for (const f of files) await ctx.B.deletePracticeFile(f.id).catch(() => {});
          for (const c of comments) await ctx.B.deletePracticeComment(id, c.id).catch(() => {});
          await ctx.B.deletePractice(id); ui.toast('Práctica eliminada', 'success'); location.hash = '#/practicas';
        } catch (er) { ui.toast('Error', 'error', errMsg(er)); }
        return;
      }
      try {
        await ctx.B.updatePractice(id, { status: pa.dataset.pact, ...(pa.dataset.pact === 'finalizada' ? { finishedAt: Date.now() } : {}) });
        ui.toast(pa.dataset.pact === 'finalizada' ? 'Práctica finalizada' : 'Práctica reactivada', 'success');
      } catch (er) { ui.toast('Error', 'error', errMsg(er)); }
    }
  });
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.id === 'co-form') {
      ui.clearErrors(form);
      const c = { ...emptyCompany(), ...(practice().company || {}) };
      form.querySelectorAll('[data-co]').forEach((i) => { c[i.dataset.co] = i.value.trim(); });
      c.paid = c.paid === 'si' ? true : c.paid === 'no' ? false : null;
      c.contactPhone = normPhone(c.contactPhone);
      let ok = true;
      if (c.contactEmail && !isEmail(c.contactEmail)) { ui.fieldError(form.querySelector('#co-contactEmail'), 'Correo inválido.'); ok = false; }
      if (c.contactPhone && !/^\+?\d{7,15}$/.test(c.contactPhone)) { ui.fieldError(form.querySelector('#co-contactPhone'), 'Teléfono inválido.'); ok = false; }
      if (c.startDate && c.endDate && c.endDate < c.startDate) { ui.fieldError(form.querySelector('#co-endDate'), 'Debe ser posterior a la fecha de inicio.'); ok = false; }
      if (!ok) return;
      await ui.withLoading(form.querySelector('[type=submit]'), async () => {
        try { await ctx.B.updatePractice(id, { company: c }); ui.toast('Datos guardados', 'success', 'La propuesta y el informe usarán estos datos.'); } catch (er) { ui.toast('No se pudo guardar', 'error', errMsg(er)); }
      });
      return;
    }
    if (form.classList.contains('pc-form')) {
      const t = form.querySelector('#pc-text');
      if (!t.value.trim()) return;
      await ui.withLoading(form.querySelector('[type=submit]'), async () => {
        try { await addComment(t.value.trim(), form.querySelector('#pc-sec').value); t.value = ''; } catch (er) { ui.toast('No se pudo comentar', 'error', errMsg(er)); }
      });
    }
  });

  // ---------- Actualización en vivo ----------
  let heroSig = '';
  function update() {
    const p = practice();
    if (!p) {
      if (!S.ready.practices) { $('#pd-body').innerHTML = `<div class="panel">${skeletonLines(3)}</div>`; return; }
      $('#pd-body').innerHTML = `<div class="panel">${empty('briefcase', 'Práctica no encontrada', 'Es posible que haya sido eliminada.')}</div>`; return;
    }
    const sig = JSON.stringify([p.studentName, p.company?.name, p.status, p.studentPhone, p.studentEmail]);
    if (sig !== heroSig) { heroSig = sig; paintHero(); }
    paintTabs();
    if (editorKey) {
      const key = editorKey, server = docOf(p, key);
      // Cambios de otra persona (o del estado) mientras no hay ediciones locales pendientes
      if (seenStamp !== p.updatedAt) {
        seenStamp = p.updatedAt;
        const fromOther = p.updatedBy && p.updatedBy !== S.user.uid;
        const statusChanged = (server?.status || 'borrador') !== (draft?.status || 'borrador');
        if (statusChanged || (fromOther && !dirty && !saving)) {
          if (!dirty) draft = clone(server);
          else draft.status = server?.status;
          const focused = el.querySelector('[data-editor]')?.contains(document.activeElement);
          editor?.setReadonly(!canEditDoc(key));
          if (!focused || statusChanged) editor?.render();
          if (fromOther && !statusChanged && !focused) ui.toast('Documento actualizado', 'info', `${teacher ? p.studentName : 'Su docente'} hizo cambios en ${DOC_NAMES[key].toLowerCase()}.`, 3500);
        }
        paintDocTop();
        if (view === 'preview') paintPreview();
      }
      return;
    }
    if (tab === 'visitas') { calV().render(); return; }
    if (tab === 'resumen') { paintBody(); return; }
    if (tab === 'empresa' && !el.querySelector('#co-form')?.contains(document.activeElement)) {
      const sigC = JSON.stringify(p.company || {});
      if (sigC !== el.dataset.coSig) { el.dataset.coSig = sigC; paintBody(); }
      return;
    }
    if ((tab === 'propuesta' || tab === 'informe') && !editorKey) paintBody();
  }
  const onLeave = () => { if (dirty) { save(); } };
  window.addEventListener('beforeunload', onLeave);
  paintHero(); paintTabs(); paintBody(); update();
  return {
    update,
    destroy() { window.removeEventListener('beforeunload', onLeave); flush(); unC(); unF(); }
  };
}
