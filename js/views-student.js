// Vistas del estudiante
import { S, ctx, classById, postsOf, tasksOf } from './state.js';
import { icon } from './icons.js';
import * as ui from './ui.js';
import { LIMITS } from './firebase-config.js';
import { esc, fmtDate, timeLeft, avg, fmtGrade, greeting, firstName, errMsg, DOC_TYPES, docLabel, isEmail } from './util.js';
import {
  avatar, colorVar, empty, skeletonCards, skeletonLines, gradePill, ring, classCard, postCard, openFiles,
  dropzoneHTML, bindDropzone, taskStatus, codeViewer, bindCodeViewer, fileItems
} from './components.js';
import { passwordField, bindPassword, analyze } from './password.js';

export const routes = {
  '': home,
  clases: myClasses,
  clase: classView,
  calificaciones: grades,
  perfil: profile
};

const myClassList = () => (S.profile?.classIds || []).map(classById).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'es'));
const activeMine = () => myClassList().filter((c) => !c.archived);
const subOf = (postId) => S.mySubs.find((s) => s.postId === postId);
const openTasks = () => S.posts
  .filter((p) => p.type === 'tarea' && activeMine().some((c) => c.id === p.classId) && !subOf(p.id)?.submittedAt)
  .sort((a, b) => (a.dueAt || Infinity) - (b.dueAt || Infinity));

function bindCardNav(el) {
  el.addEventListener('click', (e) => {
    if (e.target.closest('button, a, input, label')) return;
    const card = e.target.closest('[data-href]');
    if (card) location.hash = card.dataset.href;
  });
}

// Acciones comunes del feed (entregar, ver nota, abrir archivos)
function feedActions(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const post = S.posts.find((p) => p.id === b.dataset.id);
  if (!post) return;
  if (b.dataset.act === 'submit') submitModal(post);
  if (b.dataset.act === 'view-grade') gradeModal(post, subOf(post.id));
  if (b.dataset.act === 'open-files') openFiles(post.title, post.files, +b.dataset.i);
}

// ---------- Entrega de tareas ----------
function submitModal(post) {
  const c = classById(post.classId);
  const prev = subOf(post.id);
  let files = (prev?.files || []).map((f) => ({ ...f }));
  const late = post.dueAt && Date.now() > post.dueAt;
  ui.modal({
    title: post.title, subtitle: `${esc(c?.name || '')}${post.dueAt ? ` · Límite: ${fmtDate(post.dueAt)}` : ''}`, iconName: 'upload', size: 'lg',
    body: `
      ${late ? `<div class="callout warn">${icon('alert')}<div>La fecha límite ya pasó. Su entrega quedará marcada como <b>tardía</b>.</div></div>` : ''}
      ${prev ? `<div class="callout">${icon('info')}<div>Ya realizó una entrega el ${fmtDate(prev.submittedAt)}. Puede reemplazarla mientras no haya sido calificada.</div></div>` : ''}
      <div class="field">
        <label for="sb-text">Respuesta en texto plano <span class="hint" id="sb-count">0 / ${LIMITS.maxTextChars.toLocaleString('es-CO')}</span></label>
        <textarea class="input mono" id="sb-text" rows="8" maxlength="${LIMITS.maxTextChars}" placeholder="Escriba aquí su respuesta, justificación o comentarios…" style="font-size:13.5px">${esc(prev?.text || '')}</textarea>
        <div class="error"></div>
      </div>
      <div class="field"><span class="label">Archivos de código <span class="hint">solo .java y .py</span></span>${dropzoneHTML(LIMITS.studentExt)}</div>`,
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-send data-loading="Enviando…">${icon('send')}${prev ? 'Reemplazar entrega' : 'Enviar entrega'}</button>`,
    onMount(el, m) {
      const ta = el.querySelector('#sb-text');
      const count = () => { el.querySelector('#sb-count').textContent = `${ta.value.length.toLocaleString('es-CO')} / ${LIMITS.maxTextChars.toLocaleString('es-CO')}`; };
      ta.addEventListener('input', count); count();
      bindDropzone(el, { allowed: LIMITS.studentExt, get: () => files, set: (v) => { files = v; } });
      el.querySelector('[data-send]').addEventListener('click', (e) => {
        if (!ta.value.trim() && !files.length) { ui.fieldError(ta, 'Escriba una respuesta o adjunte al menos un archivo .java o .py.'); return; }
        ui.fieldError(ta, '');
        const p = S.profile;
        ui.withLoading(e.currentTarget, async () => {
          try {
            await ctx.B.submit({
              postId: post.id, classId: post.classId, studentId: S.user.uid, studentName: p.fullName, studentCode: p.studentCode,
              text: ta.value.trim(), files: files.map(({ name, size, content }) => ({ name, size: size || content.length, content })), late: !!late
            });
            await ctx.B.addNotifications([{ userId: 'teacher', fromUid: S.user.uid, type: 'submission', title: `Nueva entrega · ${p.fullName}`, message: `${post.title} (${c?.name || ''})`, link: `#/tarea/${post.id}`, classId: post.classId }]).catch(() => {});
            ui.toast(prev ? 'Entrega actualizada' : 'Entrega enviada', 'success', 'El docente fue notificado.');
            m.close();
          } catch (er) { ui.toast('No se pudo enviar', 'error', errMsg(er)); }
        });
      });
    }
  });
}

function gradeModal(post, sub) {
  const c = classById(post.classId);
  ui.modal({
    title: post.title, subtitle: esc(c?.name || ''), iconName: 'award', size: 'lg',
    body: `
      <div class="big-grade">${ring(sub.grade, 128, 'nota')}<span class="muted" style="font-size:13px">Calificado ${fmtDate(sub.gradedAt)}</span></div>
      <div><div class="label" style="margin-bottom:8px">Retroalimentación del docente</div><div class="text-block" style="font-family:var(--font)">${sub.feedback ? esc(sub.feedback) : '<span class="muted">Sin comentarios.</span>'}</div></div>
      ${sub.submittedAt ? `
        <div><div class="label" style="margin-bottom:8px">Su entrega · ${fmtDate(sub.submittedAt)}</div><div class="text-block">${sub.text ? esc(sub.text) : '<span class="muted">Sin texto.</span>'}</div></div>
        ${(sub.files || []).length ? codeViewer(sub.files) : ''}` : ''}`,
    footer: `<button class="btn btn-primary" data-close>Entendido</button>`,
    onMount: (el) => { if (sub.files?.length) bindCodeViewer(el, sub.files); }
  });
}

// ---------- Inscripción a clases ----------
async function joinModal() {
  let open = [];
  try { open = await ctx.B.listOpenClasses(); } catch (er) { ui.toast('Error', 'error', errMsg(er)); return; }
  const mine = S.profile.classIds || [];
  const avail = open.filter((c) => !mine.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  ui.modal({
    title: 'Inscribirme en clases', subtitle: 'Seleccione las clases en las que está matriculado.', iconName: 'userPlus',
    body: avail.length ? `<div class="pick-list">${avail.map((c) => `
      <label class="pick" style="--c:${colorVar(c.color)}"><input type="checkbox" value="${c.id}"><span class="pick-dot">${icon('book')}</span>
      <span class="pick-body"><b>${esc(c.name)}</b><span>${esc([c.code, c.schedule].filter(Boolean).join(' · '))}</span></span><span class="pick-check">${icon('check')}</span></label>`).join('')}</div>`
      : empty('check', 'Ya está inscrito en todas las clases', 'No hay más clases activas disponibles.'),
    footer: avail.length ? `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-join data-loading="Inscribiendo…">${icon('userPlus')}Inscribirme</button>` : `<button class="btn" data-close>Cerrar</button>`,
    onMount(el, m) {
      el.querySelector('[data-join]')?.addEventListener('click', (e) => {
        const ids = [...el.querySelectorAll('input:checked')].map((i) => i.value);
        if (!ids.length) { ui.toast('Seleccione al menos una clase', 'warn'); return; }
        ui.withLoading(e.currentTarget, async () => {
          try { await ctx.B.joinClasses(S.user.uid, ids); ui.toast('Inscripción exitosa', 'success', `${ids.length} ${ids.length === 1 ? 'clase agregada' : 'clases agregadas'}.`); m.close(); }
          catch (er) { ui.toast('Error', 'error', errMsg(er)); }
        });
      });
    }
  });
}

// =====================================================================
//  INICIO
// =====================================================================
function home(el) {
  ui.setCrumb('Inicio', 'PORTAL ESTUDIANTE');
  el.innerHTML = `
  <div class="stack">
    <section class="hero glow-border">
      <div class="hero-orb"></div>
      <div>
        <span class="eyebrow">${icon('sparkles')}${greeting()}</span>
        <h1>Hola, <span class="grad-text">${esc(firstName(S.profile.fullName))}</span></h1>
        <p id="h-sub">Aquí tiene las novedades de sus clases y las tareas próximas a vencer.</p>
      </div>
      <div class="hero-actions"><a class="btn" href="#/calificaciones">${icon('award')}Mis notas</a><a class="btn btn-primary" href="#/clases">${icon('book')}Mis clases</a></div>
    </section>
    <section class="stats" id="h-stats"></section>
    <section class="grid-2">
      <div class="panel"><div class="panel-head"><h2>${icon('zap')}Novedades</h2></div><div class="feed" id="h-feed">${skeletonLines(3)}</div></div>
      <div class="panel"><div class="panel-head"><h2>${icon('clock')}Próximas entregas</h2></div><div class="list" id="h-due">${skeletonLines(3)}</div></div>
    </section>
  </div>`;
  el.addEventListener('click', feedActions);
  el.addEventListener('click', (e) => { if (e.target.closest('[data-join-open]')) joinModal(); });

  function update() {
    const act = activeMine();
    const graded = S.mySubs.filter((s) => s.grade != null);
    ui.stats(el.querySelector('#h-stats'), [
      { key: 'c', label: 'Clases activas', value: act.length, icon: 'book', color: 'var(--c-cyan)' },
      { key: 't', label: 'Tareas pendientes', value: S.ready.posts ? openTasks().length : null, icon: 'clipboard', color: 'var(--c-pink)' },
      { key: 'e', label: 'Entregas realizadas', value: S.ready.subs ? S.mySubs.filter((s) => s.submittedAt).length : null, icon: 'upload', color: 'var(--c-violet)' },
      { key: 'a', label: 'Promedio general', value: graded.length ? Math.round(avg(graded.map((s) => s.grade)) * 10) / 10 : null, decimals: 1, icon: 'award', color: 'var(--c-emerald)' }
    ]);
    if (!act.length) {
      el.querySelector('#h-feed').innerHTML = empty('book', 'Aún no está inscrito en clases', 'Inscríbase para ver el material y las tareas.', `<button class="btn btn-primary" data-join-open>${icon('userPlus')}Inscribirme</button>`);
      el.querySelector('#h-due').innerHTML = empty('check', 'Sin tareas');
      return;
    }
    if (!S.ready.posts) return;
    const feed = S.posts.filter((p) => act.some((c) => c.id === p.classId)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);
    el.querySelector('#h-feed').innerHTML = feed.length ? feed.map((p) => postCard(p, { role: 'student', sub: subOf(p.id), showClass: true })).join('') : empty('layers', 'Sin novedades', 'Cuando el docente publique contenido aparecerá aquí.');
    const due = openTasks().slice(0, 6);
    el.querySelector('#h-due').innerHTML = due.length ? due.map((p) => {
      const c = classById(p.classId), st = taskStatus(p, subOf(p.id));
      return `<button class="row-item" style="border:0;background:none;width:100%;text-align:left" data-act="submit" data-id="${p.id}">
        <div class="post-ic" style="--tc:${colorVar(c?.color)};width:38px;height:38px">${icon('clipboard')}</div>
        <div class="ri-body"><b>${esc(p.title)}</b><small>${esc(c?.name || '')} · ${p.dueAt ? timeLeft(p.dueAt) : 'Sin fecha límite'}</small></div>
        <span class="badge ${st.cls}">${st.label}</span></button>`;
    }).join('') : empty('check', '¡Todo al día!', 'No tiene tareas pendientes.');
  }
  update();
  return { update };
}

// =====================================================================
//  MIS CLASES
// =====================================================================
function myClasses(el) {
  ui.setCrumb('Mis clases', 'PORTAL ESTUDIANTE');
  el.innerHTML = `
  <div class="stack">
    <div class="filter-row" style="margin:0">
      <div><h2 style="font-size:24px">Mis clases</h2><p class="muted" style="margin-top:4px">Acceda al material didáctico, anuncios y tareas de cada clase.</p></div>
      <button class="btn btn-primary" data-join-open>${icon('userPlus')}Inscribirme en otra clase</button>
    </div>
    <div class="class-grid" id="mc-grid">${skeletonCards(3)}</div>
    <div id="mc-arch"></div>
  </div>`;
  el.addEventListener('click', (e) => { if (e.target.closest('[data-join-open]')) joinModal(); });
  bindCardNav(el);
  function update() {
    if (!S.ready.classes) return;
    const act = activeMine(), arch = myClassList().filter((c) => c.archived);
    el.querySelector('#mc-grid').innerHTML = act.length ? act.map((c) => studentClassCard(c)).join('')
      : `<div style="grid-column:1/-1">${empty('book', 'No está inscrito en ninguna clase activa', 'Inscríbase en las clases en las que está matriculado.', `<button class="btn btn-primary" data-join-open>${icon('userPlus')}Inscribirme</button>`)}</div>`;
    el.querySelector('#mc-arch').innerHTML = arch.length ? `<h3 style="font-size:17px;margin:8px 0 14px;display:flex;gap:8px;align-items:center">${icon('archive')}Clases archivadas <span class="muted" style="font-size:13px;font-weight:500">(solo lectura)</span></h3><div class="class-grid">${arch.map((c) => studentClassCard(c)).join('')}</div>` : '';
  }
  update();
  return { update };
}

function studentClassCard(c) {
  const tasks = tasksOf(c.id);
  const pend = tasks.filter((t) => !subOf(t.id)?.submittedAt && !c.archived).length;
  const a = avg(tasks.map((t) => subOf(t.id)?.grade).filter((g) => g != null));
  return `
  <article class="class-card" style="--c:${colorVar(c.color)}" data-href="#/clase/${c.id}" tabindex="0">
    <div class="cc-top"><span class="chip mono chip-c">${icon('hash')}${esc(c.code || '')}</span>${c.archived ? `<span class="badge b-warning">${icon('archive')}Archivada</span>` : pend ? `<span class="badge b-accent">${pend} ${pend === 1 ? 'tarea pendiente' : 'tareas pendientes'}</span>` : `<span class="badge b-success dot">Al día</span>`}</div>
    <h3>${esc(c.name)}</h3>
    ${c.description ? `<p class="desc">${esc(c.description)}</p>` : ''}
    <div class="cc-meta">${c.schedule ? `<span>${icon('calendar')}${esc(c.schedule)}</span>` : ''}${c.room ? `<span>${icon('pin')}${esc(c.room)}</span>` : ''}</div>
    <div class="cc-foot"><div style="display:flex;align-items:center;gap:10px">${gradePill(a)}<span>promedio · ${postsOf(c.id).length} publicaciones</span></div><span class="go">${icon('arrowRight')}</span></div>
  </article>`;
}

// =====================================================================
//  CLASE
// =====================================================================
function classView(el, id) {
  let filter = 'all';
  el.innerHTML = `
  <div class="stack">
    <div><a class="back-link" href="#/clases">${icon('arrowLeft')}Mis clases</a><section class="hero" id="cv-hero"></section></div>
    <div id="cv-arch"></div>
    <div>
      <div class="filter-row">
        <div class="segmented" id="cv-filter">
          <button class="active" data-f="all">${icon('layers')}Todo</button>
          <button data-f="anuncio">${icon('megaphone')}Anuncios</button>
          <button data-f="material">${icon('book')}Material</button>
          <button data-f="tarea">${icon('clipboard')}Tareas</button>
        </div>
      </div>
      <div class="feed" id="cv-feed">${skeletonLines(3)}</div>
    </div>
  </div>`;
  const $ = (s) => el.querySelector(s);
  $('#cv-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    filter = b.dataset.f;
    $('#cv-filter').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    update();
  });
  el.addEventListener('click', feedActions);

  function update() {
    if (!S.ready.classes || !$('#cv-hero')) return;
    const c = classById(id);
    if (!c || !(S.profile.classIds || []).includes(id)) {
      el.innerHTML = empty('lock', 'Clase no disponible', 'No está inscrito en esta clase o ya no existe.', `<a class="btn" href="#/clases">${icon('arrowLeft')}Mis clases</a>`);
      return;
    }
    ui.setCrumb(c.name, `MIS CLASES / ${c.code || ''}`);
    const tasks = tasksOf(id);
    const a = avg(tasks.map((t) => subOf(t.id)?.grade).filter((g) => g != null));
    const hero = $('#cv-hero');
    hero.style.setProperty('--hc', colorVar(c.color));
    hero.innerHTML = `
      <div class="hero-orb"></div>
      <div style="min-width:0">
        <span class="eyebrow" style="color:${colorVar(c.color)}">${icon('hash')}${esc(c.code || '')}</span>
        <h1>${esc(c.name)}</h1>
        ${c.description ? `<p>${esc(c.description)}</p>` : ''}
        <div class="hero-meta">${c.schedule ? `<span>${icon('calendar')}${esc(c.schedule)}</span>` : ''}${c.room ? `<span>${icon('pin')}${esc(c.room)}</span>` : ''}<span>${icon('clipboard')}${tasks.length} tareas</span></div>
      </div>
      ${ring(a, 92, 'promedio')}`;
    $('#cv-arch').innerHTML = c.archived ? `<div class="callout warn">${icon('archive')}<div>Esta clase fue archivada por el docente. Puede consultar el material y sus calificaciones, pero ya no se reciben entregas.</div></div>` : '';
    if (!S.ready.posts) return;
    const posts = postsOf(id).filter((p) => filter === 'all' || p.type === filter);
    $('#cv-feed').innerHTML = posts.length ? posts.map((p) => postCard(p, { role: 'student', sub: subOf(p.id) })).join('')
      : empty('layers', 'Sin publicaciones', filter === 'all' ? 'El docente aún no ha publicado contenido en esta clase.' : 'No hay publicaciones de este tipo.');
  }
  update();
  return { update };
}

// =====================================================================
//  CALIFICACIONES (solo las propias)
// =====================================================================
function grades(el) {
  ui.setCrumb('Mis calificaciones', 'PORTAL ESTUDIANTE');
  el.innerHTML = `
  <div class="stack">
    <section class="hero glow-border" id="g-hero"></section>
    <div id="g-list" class="stack">${skeletonLines(3)}</div>
  </div>`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    const post = S.posts.find((p) => p.id === b.dataset.view);
    const sub = subOf(post.id);
    if (sub?.grade != null) gradeModal(post, sub); else if (!classById(post.classId)?.archived) submitModal(post);
  });
  function update() {
    const classes = myClassList();
    const graded = S.mySubs.filter((s) => s.grade != null && classes.some((c) => c.id === s.classId));
    const overall = avg(graded.map((s) => s.grade));
    el.querySelector('#g-hero').innerHTML = `
      <div class="hero-orb"></div>
      <div><span class="eyebrow">${icon('shield')}Información privada</span><h1>Mis calificaciones</h1><p>Solo usted puede ver estas notas y la retroalimentación del docente. Escala de 0.0 a 5.0.</p>
        <div class="hero-meta"><span>${icon('award')}${graded.length} ${graded.length === 1 ? 'nota registrada' : 'notas registradas'}</span><span>${icon('book')}${classes.length} clases</span></div></div>
      ${ring(overall, 112, 'general')}`;
    if (!S.ready.posts || !S.ready.subs) return;
    el.querySelector('#g-list').innerHTML = classes.length ? classes.map((c) => {
      const tasks = tasksOf(c.id);
      const a = avg(tasks.map((t) => subOf(t.id)?.grade).filter((g) => g != null));
      return `<div class="panel" style="--c:${colorVar(c.color)}">
        <div class="panel-head">
          <h2><span class="chip chip-c mono">${esc(c.code || '')}</span>${esc(c.name)}${c.archived ? ' <span class="badge b-warning">Archivada</span>' : ''}</h2>
          ${ring(a, 60)}
        </div>
        ${tasks.length ? `<div class="table-wrap"><table class="tbl cards">
          <thead><tr><th>Tarea</th><th>Estado</th><th>Nota</th><th>Retroalimentación</th><th></th></tr></thead>
          <tbody>${tasks.map((t) => {
            const s = subOf(t.id), st = taskStatus(t, s);
            return `<tr>
              <td class="who-cell"><b>${esc(t.title)}</b><div class="muted" style="font-size:12px">${t.dueAt ? 'Límite: ' + fmtDate(t.dueAt) : 'Sin fecha límite'}</div></td>
              <td data-label="Estado"><span class="badge ${st.cls}">${st.label}</span></td>
              <td data-label="Nota">${gradePill(s?.grade)}</td>
              <td data-label="Retroalimentación" style="max-width:320px;font-size:13px;color:var(--text-2)">${esc(s?.feedback || '—')}</td>
              <td class="actions-cell"><div class="actions">${s?.grade != null ? `<button class="btn btn-sm" data-view="${t.id}">${icon('eye')}Detalle</button>` : c.archived ? '' : `<button class="btn btn-sm ${s?.submittedAt ? '' : 'btn-primary'}" data-view="${t.id}">${icon(s?.submittedAt ? 'edit' : 'upload')}${s?.submittedAt ? 'Editar' : 'Entregar'}</button>`}</div></td>
            </tr>`;
          }).join('')}</tbody></table></div>` : '<p class="muted">Esta clase aún no tiene tareas.</p>'}
      </div>`;
    }).join('') : `<div class="panel">${empty('award', 'Sin calificaciones', 'Inscríbase en una clase para comenzar.')}</div>`;
  }
  update();
  return { update };
}

// =====================================================================
//  PERFIL
// =====================================================================
function profile(el) {
  ui.setCrumb('Mi perfil', 'PORTAL ESTUDIANTE');
  const p = S.profile;
  el.innerHTML = `
  <div class="stack" style="max-width:920px">
    <section class="hero glow-border">
      <div class="hero-orb"></div>
      <div class="profile-hero" id="pf-hero"></div>
    </section>
    <div class="panel">
      <div class="panel-head"><h2>${icon('user')}Datos personales</h2><span class="muted" style="font-size:12.5px">Actualice su información cuando lo necesite</span></div>
      <form id="pf-form" class="form-grid" novalidate>
        <div class="field span-2"><label for="pf-name">Nombre completo</label><div class="input-wrap">${icon('user')}<input class="input" id="pf-name" value="${esc(p.fullName)}" autocomplete="name"></div><div class="error"></div></div>
        <div class="field span-2"><label for="pf-code">Código de estudiante</label><div class="input-wrap">${icon('hash')}<input class="input mono" id="pf-code" value="${esc(p.studentCode)}"></div><div class="error"></div></div>
        <div class="field"><label for="pf-dt">Tipo de documento</label><select class="input" id="pf-dt">${DOC_TYPES.map(([v, l]) => `<option value="${v}" ${v === p.docType ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="pf-dn">Número de documento</label><div class="input-wrap">${icon('idcard')}<input class="input mono" id="pf-dn" value="${esc(p.docNumber)}"></div><div class="error"></div></div>
        <div class="span-2" style="display:flex;justify-content:flex-end;gap:10px"><button class="btn" type="reset">Descartar</button><button class="btn btn-primary" type="submit" data-loading="Guardando…">${icon('check')}Guardar cambios</button></div>
      </form>
    </div>
    <div class="grid-2" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))">
      <div class="panel">
        <div class="panel-head"><h2>${icon('key')}Cambiar contraseña</h2></div>
        <form id="pw-form" class="stack" style="gap:16px" novalidate>
          ${passwordField({ id: 'pw-cur', label: 'Contraseña actual', autocomplete: 'current-password' })}
          ${passwordField({ id: 'pw-new', label: 'Nueva contraseña', meter: true, generator: true })}
          ${passwordField({ id: 'pw-new2', label: 'Confirmar nueva contraseña' })}
          <div><button class="btn btn-primary" type="submit" data-loading="Actualizando…">${icon('shield')}Actualizar contraseña</button></div>
        </form>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>${icon('mail')}Correo electrónico</h2></div>
        <form id="em-form" class="stack" style="gap:16px" novalidate>
          <div class="kv"><div><small>Correo actual</small><b>${esc(S.user.email)}</b></div></div>
          <div class="field"><label for="em-new">Nuevo correo</label><div class="input-wrap">${icon('mail')}<input class="input" id="em-new" type="email" placeholder="nuevo@ucaldas.edu.co" autocomplete="email"></div><div class="error"></div></div>
          ${passwordField({ id: 'em-pass', label: 'Contraseña actual (confirmación)', autocomplete: 'current-password' })}
          <div class="callout" style="font-size:12.5px">${icon('info')}<div>${ctx.demo ? 'En modo demostración el cambio es inmediato.' : 'Le enviaremos un enlace de verificación al nuevo correo. El cambio se aplica al confirmarlo.'}</div></div>
          <div><button class="btn" type="submit" data-loading="Procesando…">${icon('send')}Cambiar correo</button></div>
        </form>
      </div>
    </div>
  </div>`;
  const $ = (s) => el.querySelector(s);
  const ctxWords = () => [S.profile.fullName, S.user.email, S.profile.studentCode, S.profile.docNumber];
  bindPassword(el, 'pw-cur'); bindPassword(el, 'pw-new', { confirmId: 'pw-new2', context: ctxWords }); bindPassword(el, 'pw-new2'); bindPassword(el, 'em-pass');

  const pf = $('#pf-form');
  pf.addEventListener('reset', () => setTimeout(() => ui.clearErrors(pf)));
  pf.addEventListener('submit', (e) => {
    e.preventDefault();
    ui.clearErrors(pf);
    const name = $('#pf-name').value.trim().replace(/\s+/g, ' ');
    const code = $('#pf-code').value.trim().toUpperCase();
    const dt = $('#pf-dt').value, dn = $('#pf-dn').value.trim().toUpperCase();
    let ok = true;
    if (name.split(' ').length < 2 || !/^[A-Za-zÀ-ÿÑñ' .-]{5,}$/.test(name)) { ui.fieldError($('#pf-name'), 'Escriba nombres y apellidos completos.'); ok = false; }
    if (!/^[A-Za-z0-9-]{4,20}$/.test(code)) { ui.fieldError($('#pf-code'), 'Código inválido.'); ok = false; }
    const pattern = ['PA', 'PPT', 'CE'].includes(dt) ? /^[A-Za-z0-9]{5,20}$/ : /^\d{5,15}$/;
    if (!pattern.test(dn)) { ui.fieldError($('#pf-dn'), 'Número de documento inválido.'); ok = false; }
    if (!ok) return;
    ui.withLoading(pf.querySelector('[type=submit]'), async () => {
      try {
        await ctx.B.updateProfile(S.user.uid, { fullName: name, studentCode: code, docType: dt, docNumber: dn }, S.profile);
        ui.toast('Perfil actualizado', 'success', 'Sus datos se guardaron correctamente.');
      } catch (er) { ui.toast('No se pudo guardar', 'error', errMsg(er)); }
    });
  });

  const pw = $('#pw-form');
  pw.addEventListener('submit', (e) => {
    e.preventDefault();
    ui.clearErrors(pw);
    const cur = $('#pw-cur'), nw = $('#pw-new'), nw2 = $('#pw-new2');
    if (!cur.value) return ui.fieldError(cur, 'Ingrese su contraseña actual.');
    if (!analyze(nw.value, ctxWords()).valid) return ui.fieldError(nw, 'La nueva contraseña no cumple los requisitos de seguridad.');
    if (nw.value === cur.value) return ui.fieldError(nw, 'La nueva contraseña debe ser diferente a la actual.');
    if (nw.value !== nw2.value) return ui.fieldError(nw2, 'Las contraseñas no coinciden.');
    ui.withLoading(pw.querySelector('[type=submit]'), async () => {
      try { await ctx.B.changePassword(cur.value, nw.value); ui.toast('Contraseña actualizada', 'success', 'Use la nueva contraseña en su próximo ingreso.'); pw.reset(); pw.querySelectorAll('input').forEach((i) => i.dispatchEvent(new Event('input'))); }
      catch (er) { ui.fieldError(cur, errMsg(er)); }
    });
  });

  const em = $('#em-form');
  em.addEventListener('submit', (e) => {
    e.preventDefault();
    ui.clearErrors(em);
    const ne = $('#em-new'), pass = $('#em-pass');
    if (!isEmail(ne.value)) return ui.fieldError(ne, 'Ingrese un correo válido.');
    if (ne.value.trim().toLowerCase() === S.user.email) return ui.fieldError(ne, 'Es el mismo correo actual.');
    if (!pass.value) return ui.fieldError(pass, 'Confirme con su contraseña.');
    ui.withLoading(em.querySelector('[type=submit]'), async () => {
      try {
        const r = await ctx.B.changeEmail(pass.value, ne.value);
        ui.toast(r?.pendingVerification ? 'Verifique su nuevo correo' : 'Correo actualizado', 'success', r?.pendingVerification ? 'Abra el enlace que enviamos para completar el cambio.' : '');
        em.reset();
      } catch (er) { ui.fieldError(pass, errMsg(er)); }
    });
  });

  function update() {
    const pr = S.profile;
    $('#pf-hero').innerHTML = `${avatar(pr.fullName, 'lg', S.user.uid)}
      <div style="min-width:0"><span class="eyebrow">${icon('grad')}Estudiante · ${esc(pr.studentCode)}</span><h1 style="font-size:clamp(22px,3vw,32px)">${esc(pr.fullName)}</h1>
      <div class="hero-meta"><span>${icon('idcard')}${esc(docLabel(pr.docType))} ${esc(pr.docNumber)}</span><span>${icon('mail')}${esc(S.user.email)}</span><span>${icon('book')}${(pr.classIds || []).length} clases</span></div></div>`;
  }
  update();
  return { update };
}
