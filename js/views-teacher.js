// Vistas del docente
import { S, ctx, go, classById, studentsOf, postsOf, tasksOf, studentById, notifyClass, byName } from './state.js';
import { icon } from './icons.js';
import * as ui from './ui.js';
import { TEACHER_NAME, LIMITS } from './firebase-config.js';
import { esc, norm, fmtDate, timeAgo, avg, fmtGrade, greeting, errMsg, CLASS_COLORS, download, debounce, docLabel, extractUrl, youtubeId } from './util.js';
import {
  avatar, colorVar, empty, skeletonCards, skeletonLines, gradePill, ring, classCard, postCard, openFiles,
  dropzoneHTML, bindDropzone, openReview, TYPE, docText, patchFeed
} from './components.js';
import { passwordField, bindPassword, analyze } from './password.js';

export const routes = {
  '': dashboard,
  clases: classesView,
  clase: classDetail,
  tarea: taskDetail,
  estudiantes: studentsView,
  estudiante: studentDetail,
  archivadas: archivedView,
  cuenta: accountView
};

const activeClasses = () => S.classes.filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name, 'es'));
const archivedClasses = () => S.classes.filter((c) => c.archived).sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
const uniqueStudents = (classes) => new Set(S.students.filter((s) => (s.classIds || []).some((id) => classes.some((c) => c.id === id))).map((s) => s.uid)).size;

// Navegación por tarjetas con data-href
function bindCardNav(el) {
  el.addEventListener('click', (e) => {
    if (e.target.closest('button, a, input, select, textarea, label')) return;
    const card = e.target.closest('[data-href]');
    if (card) location.hash = card.dataset.href;
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const card = e.target.closest('[data-href]');
    if (card && e.target === card) location.hash = card.dataset.href;
  });
}

// Acciones comunes sobre clases
async function classActions(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return false;
  const id = b.dataset.id;
  const act = b.dataset.act;
  if (act === 'new-class') { classForm(); return true; }
  if (act === 'edit-class') { classForm(classById(id)); return true; }
  if (act === 'archive-class') {
    const c = classById(id);
    const ok = await ui.confirmDialog({ title: 'Archivar clase', iconName: 'archive', confirm: 'Archivar', message: `<b>${esc(c.name)}</b> pasará a la sección de archivadas. Los estudiantes conservarán acceso de solo lectura a su material y calificaciones, pero no podrán realizar nuevas entregas.` });
    if (ok) { try { await ctx.B.updateClass(id, { archived: true, archivedAt: Date.now() }); ui.toast('Clase archivada', 'success', c.name); } catch (er) { ui.toast('Error', 'error', errMsg(er)); } }
    return true;
  }
  if (act === 'restore-class') {
    const c = classById(id);
    try { await ctx.B.updateClass(id, { archived: false, archivedAt: null }); ui.toast('Clase restaurada', 'success', c.name); } catch (er) { ui.toast('Error', 'error', errMsg(er)); }
    return true;
  }
  return false;
}

// ---------- Formulario de clase ----------
function classForm(c = null) {
  const color = c?.color || CLASS_COLORS[Math.floor(Math.random() * CLASS_COLORS.length)];
  ui.modal({
    title: c ? 'Editar clase' : 'Nueva clase', subtitle: c ? esc(c.name) : 'Configure la información básica. Podrá editarla cuando lo necesite.', iconName: c ? 'edit' : 'plus', size: 'lg',
    body: `
      <div class="form-grid">
        <div class="field span-2"><label for="cf-name">Nombre de la clase</label><div class="input-wrap">${icon('book')}<input class="input" id="cf-name" value="${esc(c?.name || '')}" placeholder="Ej. Interacción Humano-Máquina" maxlength="90"></div><div class="error"></div></div>
        <div class="field"><label for="cf-code">Código / grupo</label><div class="input-wrap">${icon('hash')}<input class="input mono" id="cf-code" value="${esc(c?.code || '')}" placeholder="Ej. 232G8F" maxlength="30"></div><div class="error"></div></div>
        <div class="field"><label for="cf-room">Salón</label><div class="input-wrap">${icon('pin')}<input class="input" id="cf-room" value="${esc(c?.room || '')}" placeholder="Ej. Bloque D · Sala 3" maxlength="60"></div></div>
        <div class="field span-2"><label for="cf-sched">Horario</label><div class="input-wrap">${icon('calendar')}<input class="input" id="cf-sched" value="${esc(c?.schedule || '')}" placeholder="Ej. Lunes · 7:00 – 10:00" maxlength="80"></div></div>
        <div class="field span-2"><label for="cf-desc">Descripción</label><textarea class="input" id="cf-desc" rows="3" maxlength="400" placeholder="Objetivo del curso, contenidos principales…">${esc(c?.description || '')}</textarea></div>
        <div class="field span-2"><span class="label">Color de identificación</span>
          <div class="color-swatches">${CLASS_COLORS.map((k) => `<label style="--c:${colorVar(k)}" title="${k}"><input type="radio" name="cf-color" value="${k}" ${k === color ? 'checked' : ''}>${icon('check')}</label>`).join('')}</div>
        </div>
      </div>`,
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save data-loading="Guardando…">${icon('check')}${c ? 'Guardar cambios' : 'Crear clase'}</button>`,
    onMount(el, m) {
      el.querySelector('[data-save]').addEventListener('click', (e) => {
        const name = el.querySelector('#cf-name'), code = el.querySelector('#cf-code');
        ui.clearErrors(el);
        let ok = true;
        if (name.value.trim().length < 3) { ui.fieldError(name, 'Escriba el nombre de la clase.'); ok = false; }
        if (!code.value.trim()) { ui.fieldError(code, 'Escriba el código o grupo.'); ok = false; }
        if (!ok) return;
        const data = {
          name: name.value.trim(), code: code.value.trim().toUpperCase(),
          room: el.querySelector('#cf-room').value.trim(), schedule: el.querySelector('#cf-sched').value.trim(),
          description: el.querySelector('#cf-desc').value.trim(), color: el.querySelector('[name=cf-color]:checked')?.value || 'violet'
        };
        ui.withLoading(e.currentTarget, async () => {
          try {
            if (c) await ctx.B.updateClass(c.id, data); else await ctx.B.createClass(data);
            ui.toast(c ? 'Clase actualizada' : 'Clase creada', 'success', data.name);
            m.close();
          } catch (er) { ui.toast('No se pudo guardar', 'error', errMsg(er)); }
        });
      });
    }
  });
}

// =====================================================================
//  PANEL
// =====================================================================
function dashboard(el) {
  ui.setCrumb('Panel docente', 'INICIO');
  el.innerHTML = `
  <div class="stack">
    <section class="hero glow-border">
      <div class="hero-orb"></div>
      <div>
        <span class="eyebrow">${icon('sparkles')}${greeting()}</span>
        <h1>${esc(TEACHER_NAME)}</h1>
        <p>Resumen en tiempo real de sus clases, estudiantes y entregas pendientes por calificar.</p>
      </div>
      <div class="hero-actions">
        <a class="btn" href="#/estudiantes">${icon('search')}Consultar estudiante</a>
        <button class="btn btn-primary" data-act="new-class">${icon('plus')}Nueva clase</button>
      </div>
    </section>
    <section class="stats" id="d-stats"></section>
    <section class="grid-2">
      <div class="panel">
        <div class="panel-head"><h2>${icon('book')}Clases activas</h2><a href="#/clases" class="btn btn-sm btn-ghost">Ver todas${icon('chevronRight')}</a></div>
        <div id="d-classes" class="class-grid">${skeletonCards(2)}</div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>${icon('inbox')}Por calificar</h2><span class="badge b-accent" id="d-pend-n">0</span></div>
        <div id="d-pending" class="list">${skeletonLines(4)}</div>
      </div>
    </section>
  </div>`;
  el.addEventListener('click', classActions);
  bindCardNav(el);

  function update() {
    const act = activeClasses();
    ui.stats(el.querySelector('#d-stats'), [
      { key: 'c', label: 'Clases activas', value: S.ready.classes ? act.length : null, icon: 'book', color: 'var(--c-cyan)' },
      { key: 's', label: 'Estudiantes inscritos', value: S.ready.students ? uniqueStudents(act) : null, icon: 'users', color: 'var(--c-violet)' },
      { key: 'p', label: 'Publicaciones', value: S.ready.posts ? S.posts.filter((p) => act.some((c) => c.id === p.classId)).length : null, icon: 'layers', color: 'var(--c-pink)' },
      { key: 'g', label: 'Entregas por calificar', value: S.ready.pending ? S.pendingSubs.length : null, icon: 'clipboard', color: 'var(--c-amber)' }
    ]);
    if (S.ready.classes) {
      el.querySelector('#d-classes').innerHTML = act.length
        ? act.slice(0, 4).map((c) => classCard(c, { students: studentsOf(c.id), posts: postsOf(c.id).length })).join('')
        : empty('book', 'Aún no tiene clases', 'Cree su primera clase para que los estudiantes puedan registrarse en ella.', `<button class="btn btn-primary" data-act="new-class">${icon('plus')}Crear clase</button>`);
    }
    const pend = [...S.pendingSubs].sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
    el.querySelector('#d-pend-n').textContent = pend.length;
    if (S.ready.pending) {
      el.querySelector('#d-pending').innerHTML = pend.length ? pend.slice(0, 8).map((s) => {
        const p = S.posts.find((x) => x.id === s.postId);
        const c = classById(s.classId);
        const st = studentById(s.studentId);
        return `<a class="row-item" href="#/tarea/${s.postId}">
          ${avatar(st?.fullName || s.studentName, '', s.studentId)}
          <div class="ri-body"><b>${esc(st?.fullName || s.studentName)}</b><small>${esc(p?.title || 'Tarea')} · ${esc(c?.name || '')}</small></div>
          <div style="text-align:right">${s.late ? '<span class="badge b-warning">Tarde</span>' : ''}<small class="muted" style="display:block;font-size:11.5px;margin-top:3px">${timeAgo(s.submittedAt)}</small></div>
        </a>`;
      }).join('') : empty('check', 'Todo al día', 'No hay entregas pendientes por calificar.');
    }
  }
  update();
  return { update };
}

// =====================================================================
//  CLASES
// =====================================================================
function classesView(el) {
  ui.setCrumb('Clases', 'GESTIÓN ACADÉMICA');
  el.innerHTML = `
  <div class="stack">
    <div class="filter-row" style="margin:0">
      <div><h2 style="font-size:24px">Mis clases</h2><p class="muted" style="margin-top:4px">Cree, edite o archive sus clases del periodo.</p></div>
      <button class="btn btn-primary" data-act="new-class">${icon('plus')}Nueva clase</button>
    </div>
    <div class="class-grid" id="cl-grid">${skeletonCards(3)}</div>
  </div>`;
  el.addEventListener('click', classActions);
  bindCardNav(el);
  function update() {
    if (!S.ready.classes) return;
    const act = activeClasses();
    el.querySelector('#cl-grid').innerHTML = act.map((c) => classCard(c, { students: studentsOf(c.id), posts: postsOf(c.id).length, manage: true })).join('') +
      `<button class="class-card new" data-act="new-class"><div class="plus">${icon('plus')}</div><b>Crear nueva clase</b><span style="font-size:13px">Los estudiantes podrán inscribirse desde el registro o su panel.</span></button>`;
  }
  update();
  return { update };
}

// =====================================================================
//  DETALLE DE CLASE
// =====================================================================
function classDetail(el, id) {
  let tab = 'posts';
  let subs = [];
  let composerFiles = [];
  let type = 'anuncio';
  const unsub = ctx.B.watchSubmissionsBy('classId', id, (l) => { subs = l; update(); });

  el.innerHTML = `
  <div class="stack">
    <div>
      <a class="back-link" href="#/clases">${icon('arrowLeft')}Todas las clases</a>
      <section class="hero" id="cd-hero"></section>
    </div>
    <div>
      <div class="tabs" role="tablist">
        <button class="active" data-tab="posts">${icon('layers')}Publicaciones <span class="n" data-n="posts">0</span></button>
        <button data-tab="students">${icon('users')}Estudiantes <span class="n" data-n="students">0</span></button>
        <button data-tab="grades">${icon('table')}Calificaciones</button>
      </div>
      <div class="tab-panel" data-panel="posts">
        <div class="stack">
          <div class="card composer collapsed" id="composer">
            <div class="composer-head">
              <h3>${icon('edit')}Nueva publicación</h3>
              <button class="btn btn-sm btn-primary" id="cp-toggle">${icon('plus')}Publicar</button>
            </div>
            <div class="composer-body">
              <div class="segmented" id="cp-type">
                <button type="button" class="active" data-t="anuncio">${icon('megaphone')}Anuncio</button>
                <button type="button" data-t="material">${icon('layers')}Material didáctico</button>
                <button type="button" data-t="tarea">${icon('clipboard')}Tarea</button>
              </div>
              <div class="field"><label for="cp-title">Título</label><input class="input" id="cp-title" maxlength="140" placeholder="Título de la publicación"><div class="error"></div></div>
              <div class="field"><label for="cp-body">Contenido</label><textarea class="input" id="cp-body" rows="5" maxlength="8000" placeholder="Escriba el contenido. Los enlaces se convierten automáticamente en vínculos."></textarea></div>
              <div class="form-grid">
                <div class="field"><label for="cp-links">Enlaces <span class="hint">uno por línea · los de YouTube se muestran como video</span></label><textarea class="input" id="cp-links" rows="3" placeholder="https://www.youtube.com/watch?v=…&#10;https://drive.google.com/…"></textarea></div>
                <div class="field" id="cp-due-f" hidden><label for="cp-due">Fecha y hora límite</label><div class="input-wrap">${icon('calendar')}<input class="input" id="cp-due" type="datetime-local"></div><div class="error"></div></div>
              </div>
              <div class="field"><span class="label">Archivos de código de apoyo <span class="hint">opcional</span></span>${dropzoneHTML(LIMITS.teacherExt, 'Adjunte ejemplos de código (clic o arrastrar)')}</div>
              <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
                <span class="muted" style="font-size:12.5px;display:flex;gap:6px;align-items:center">${icon('bell')}Se notificará a todos los estudiantes de la clase.</span>
                <div style="display:flex;gap:8px"><button class="btn" id="cp-cancel">Cancelar</button><button class="btn btn-primary" id="cp-send" data-loading="Publicando…">${icon('send')}Publicar</button></div>
              </div>
            </div>
          </div>
          <div class="feed" id="cd-feed">${skeletonLines(3)}</div>
        </div>
      </div>
      <div class="tab-panel hidden" data-panel="students">
        <div class="panel">
          <div class="panel-head">
            <div class="count-head"><span class="big" id="st-count">0</span><span class="muted">estudiantes inscritos</span></div>
            <button class="btn btn-sm" id="st-export">${icon('download')}Exportar lista</button>
          </div>
          <div class="toolbar"><div class="input-wrap">${icon('search')}<input class="input" id="st-q" placeholder="Buscar por nombre, código, documento o correo"></div></div>
          <div id="st-list"></div>
        </div>
      </div>
      <div class="tab-panel hidden" data-panel="grades">
        <div class="panel">
          <div class="panel-head"><h2>${icon('table')}Planilla de calificaciones</h2><button class="btn btn-sm" id="gb-export">${icon('download')}Exportar CSV</button></div>
          <div id="gb"></div>
        </div>
      </div>
    </div>
  </div>`;
  const $ = (s) => el.querySelector(s);

  // Pestañas
  el.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    tab = b.dataset.tab;
    el.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
    el.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab));
  });

  // Compositor
  const composer = $('#composer');
  const openComposer = (open) => { composer.classList.toggle('collapsed', !open); $('#cp-toggle').classList.toggle('hidden', open); if (open) $('#cp-title').focus(); };
  $('#cp-toggle').onclick = () => openComposer(true);
  $('#cp-cancel').onclick = () => openComposer(false);
  $('#cp-type').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    type = b.dataset.t;
    $('#cp-type').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    $('#cp-due-f').hidden = type !== 'tarea';
  });
  bindDropzone(composer, { allowed: LIMITS.teacherExt, get: () => composerFiles, set: (v) => { composerFiles = v; } });

  $('#cp-send').addEventListener('click', (e) => {
    const c = classById(id);
    const title = $('#cp-title');
    ui.clearErrors(composer);
    if (title.value.trim().length < 3) { ui.fieldError(title, 'Escriba un título.'); return; }
    let dueAt = null;
    if (type === 'tarea') {
      const d = $('#cp-due');
      if (!d.value) { ui.fieldError(d, 'Defina la fecha límite de la tarea.'); return; }
      dueAt = new Date(d.value).getTime();
    }
    const links = $('#cp-links').value.split(/\n+/).map(extractUrl).filter((s) => /^https?:\/\//i.test(s))
      .map((s) => (youtubeId(s) ? `https://www.youtube.com/watch?v=${youtubeId(s)}` : s)).slice(0, 10);
    const post = { classId: id, type, title: title.value.trim(), body: $('#cp-body').value.trim(), links, files: composerFiles, dueAt };
    ui.withLoading(e.currentTarget, async () => {
      try {
        await ctx.B.createPost(post);
        const n = await notifyClass(id, {
          title: `${type === 'tarea' ? 'Nueva tarea' : type === 'material' ? 'Nuevo material' : 'Nuevo anuncio'} en ${c.name}`,
          message: post.title, link: `#/clase/${id}`
        });
        ui.toast('Publicación creada', 'success', `Se notificó a ${n} ${n === 1 ? 'estudiante' : 'estudiantes'}.`);
        ['#cp-title', '#cp-body', '#cp-links', '#cp-due'].forEach((s) => { $(s).value = ''; });
        composerFiles = []; composer.querySelector('.file-list').innerHTML = '';
        openComposer(false);
      } catch (er) { ui.toast('No se pudo publicar', 'error', errMsg(er)); }
    });
  });

  // Acciones del feed, estudiantes y hero
  el.addEventListener('click', async (e) => {
    if (await classActions(e)) return;
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'delete-post') {
      const p = S.posts.find((x) => x.id === b.dataset.id);
      const ok = await ui.confirmDialog({ title: 'Eliminar publicación', danger: true, confirm: 'Eliminar', iconName: 'trash', message: `Se eliminará <b>${esc(p?.title)}</b>. Esta acción no se puede deshacer.` });
      if (ok) { try { await ctx.B.deletePost(b.dataset.id); ui.toast('Publicación eliminada', 'success'); } catch (er) { ui.toast('Error', 'error', errMsg(er)); } }
    }
    if (act === 'open-files') {
      const p = S.posts.find((x) => x.id === b.dataset.id);
      openFiles(p.title, p.files, +b.dataset.i);
    }
    if (act === 'remove-student') {
      const s = studentById(b.dataset.id);
      const c = classById(id);
      const ok = await ui.confirmDialog({ title: 'Retirar estudiante', danger: true, confirm: 'Retirar', iconName: 'userMinus', message: `¿Retirar a <b>${esc(s.fullName)}</b> de <b>${esc(c.name)}</b>? Sus entregas se conservan, pero dejará de ver el contenido de la clase.` });
      if (ok) { try { await ctx.B.removeFromClass(s.uid, id); ui.toast('Estudiante retirado', 'success', s.fullName); } catch (er) { ui.toast('Error', 'error', errMsg(er)); } }
    }
  });
  el.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-student]');
    if (row && !e.target.closest('button')) location.hash = `#/estudiante/${row.dataset.student}`;
  });
  $('#st-q').addEventListener('input', debounce(() => renderStudents(), 120));
  $('#st-export').onclick = () => {
    const c = classById(id);
    const rows = [['Nombre completo', 'Código', 'Tipo doc.', 'Número doc.', 'Correo']].concat(studentsOf(id).map((s) => [s.fullName, s.studentCode, s.docType, s.docNumber, s.email]));
    download(`estudiantes-${c.code || c.name}.csv`, '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  };
  $('#gb-export').onclick = () => exportGradebook(id, subs);

  function renderStudents() {
    const q = norm($('#st-q').value);
    const list = studentsOf(id).filter((s) => !q || norm(`${s.fullName} ${s.studentCode} ${s.docNumber} ${s.email}`).includes(q));
    const tasks = tasksOf(id);
    $('#st-list').innerHTML = list.length ? `
      <div class="table-wrap"><table class="tbl cards">
        <thead><tr><th>#</th><th>Estudiante</th><th>Código</th><th>Documento</th><th>Promedio</th><th></th></tr></thead>
        <tbody>${list.map((s, i) => {
          const a = avg(tasks.map((t) => subs.find((x) => x.postId === t.id && x.studentId === s.uid)?.grade).filter((g) => g != null));
          return `<tr class="clickable" data-student="${s.uid}">
            <td class="num" data-label="#">${i + 1}</td>
            <td class="who-cell"><div class="who">${avatar(s.fullName, '', s.uid)}<div style="min-width:0"><b>${esc(s.fullName)}</b><small>${esc(s.email)}</small></div></div></td>
            <td class="num" data-label="Código">${esc(s.studentCode)}</td>
            <td class="num" data-label="Documento">${docText(s)}</td>
            <td data-label="Promedio">${gradePill(a)}</td>
            <td class="actions-cell"><div class="actions">
              <a class="btn btn-sm" href="#/estudiante/${s.uid}">${icon('user')}Ver</a>
              <button class="btn btn-sm btn-danger" data-act="remove-student" data-id="${s.uid}" title="Retirar de la clase">${icon('userMinus')}</button>
            </div></td></tr>`;
        }).join('')}</tbody></table></div>`
      : empty('users', q ? 'Sin coincidencias' : 'Aún no hay estudiantes', q ? 'Pruebe con otro término de búsqueda.' : 'Los estudiantes aparecerán aquí cuando se registren en esta clase.');
  }

  function renderGradebook() {
    const tasks = tasksOf(id);
    const list = studentsOf(id);
    if (!tasks.length) { $('#gb').innerHTML = empty('clipboard', 'Sin tareas todavía', 'Cree una publicación de tipo "Tarea" para comenzar a calificar.'); return; }
    if (!list.length) { $('#gb').innerHTML = empty('users', 'Sin estudiantes inscritos'); return; }
    $('#gb').innerHTML = `<div class="table-wrap"><table class="tbl gradebook">
      <thead><tr><th>Estudiante</th>${tasks.map((t, i) => `<th class="task" title="${esc(t.title)}">T${i + 1} · ${esc(t.title.split('·')[0].trim().slice(0, 18))}</th>`).join('')}<th>Definitiva</th></tr></thead>
      <tbody>${list.map((s) => {
        const gs = tasks.map((t) => subs.find((x) => x.postId === t.id && x.studentId === s.uid));
        const a = avg(gs.map((x) => x?.grade).filter((g) => g != null));
        return `<tr><td><div class="who">${avatar(s.fullName, 'sm', s.uid)}<b style="font-size:13px;white-space:nowrap">${esc(s.fullName)}</b></div></td>
          ${gs.map((x, i) => `<td><button class="btn btn-ghost btn-sm" style="padding:0 4px" data-grade="${tasks[i].id}" data-sid="${s.uid}" title="Calificar">${x?.grade != null ? gradePill(x.grade) : x?.submittedAt ? '<span class="badge b-info">Por calificar</span>' : '<span class="muted">—</span>'}</button></td>`).join('')}
          <td class="final">${gradePill(a)}</td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="muted" style="font-size:12.5px;margin-top:10px">La definitiva es el promedio simple de las tareas calificadas. Haga clic en una celda para revisar o calificar.</p>`;
  }
  $('#gb').addEventListener('click', (e) => {
    const b = e.target.closest('[data-grade]'); if (!b) return;
    const post = S.posts.find((p) => p.id === b.dataset.grade);
    openReview({ post, student: studentById(b.dataset.sid), sub: subs.find((x) => x.postId === post.id && x.studentId === b.dataset.sid) });
  });

  function update() {
    const c = classById(id);
    if (!S.ready.classes || !$('#cd-hero')) return;
    if (!c) { el.innerHTML = empty('alert', 'Clase no encontrada', 'Es posible que haya sido eliminada.', `<a class="btn" href="#/clases">${icon('arrowLeft')}Volver</a>`); return; }
    ui.setCrumb(c.name, `CLASES / ${c.code || ''}`);
    const studs = studentsOf(id), posts = postsOf(id), tasks = tasksOf(id);
    const hero = $('#cd-hero');
    hero.style.setProperty('--hc', colorVar(c.color));
    hero.innerHTML = `
      <div class="hero-orb"></div>
      <div style="min-width:0">
        <span class="eyebrow" style="color:${colorVar(c.color)}">${icon('hash')}${esc(c.code || '')}${c.archived ? ' · ARCHIVADA' : ''}</span>
        <h1>${esc(c.name)}</h1>
        ${c.description ? `<p>${esc(c.description)}</p>` : ''}
        <div class="hero-meta">
          ${c.schedule ? `<span>${icon('calendar')}${esc(c.schedule)}</span>` : ''}
          ${c.room ? `<span>${icon('pin')}${esc(c.room)}</span>` : ''}
          <span>${icon('users')}${studs.length} estudiantes</span>
          <span>${icon('clipboard')}${tasks.length} tareas</span>
        </div>
      </div>
      <div class="hero-actions">
        <button class="btn" data-act="edit-class" data-id="${c.id}">${icon('edit')}Editar</button>
        ${c.archived ? `<button class="btn" data-act="restore-class" data-id="${c.id}">${icon('restore')}Restaurar</button>` : `<button class="btn" data-act="archive-class" data-id="${c.id}">${icon('archive')}Archivar</button>`}
      </div>`;
    el.querySelector('[data-n="posts"]').textContent = posts.length;
    el.querySelector('[data-n="students"]').textContent = studs.length;
    $('#st-count').textContent = studs.length;
    composer.classList.toggle('hidden', !!c.archived);

    if (S.ready.posts) {
      patchFeed($('#cd-feed'), posts.map((p) => {
        let stats;
        if (p.type === 'tarea') {
          const ps = subs.filter((s) => s.postId === p.id);
          stats = { total: studs.length, submitted: ps.filter((s) => s.submittedAt).length, graded: ps.filter((s) => s.grade != null).length };
        }
        return postCard(p, { role: 'teacher', stats });
      }), empty('layers', 'Sin publicaciones', 'Publique anuncios, material didáctico o tareas para esta clase.'));
    }
    renderStudents();
    renderGradebook();
  }
  update();
  return { update, destroy: unsub };
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportGradebook(classId, subs) {
  const c = classById(classId);
  const tasks = tasksOf(classId);
  const header = ['Código', 'Nombre completo', ...tasks.map((t) => t.title), 'Definitiva'];
  const rows = studentsOf(classId).map((s) => {
    const gs = tasks.map((t) => subs.find((x) => x.postId === t.id && x.studentId === s.uid)?.grade ?? null);
    const a = avg(gs.filter((g) => g != null));
    const f = (g) => (g == null ? '' : Number(g).toFixed(1).replace('.', ','));
    return [s.studentCode, s.fullName, ...gs.map(f), f(a)];
  });
  download(`calificaciones-${c.code || c.name}.csv`, '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  ui.toast('Planilla exportada', 'success', 'Archivo CSV compatible con Excel.');
}

// =====================================================================
//  DETALLE DE TAREA (revisión de entregas)
// =====================================================================
function taskDetail(el, postId) {
  let subs = [];
  let filter = 'all';
  const unsub = ctx.B.watchSubmissionsBy('postId', postId, (l) => { subs = l; update(); });
  el.innerHTML = `
  <div class="stack">
    <div><a class="back-link" id="td-back" href="#/clases">${icon('arrowLeft')}Volver a la clase</a><div id="td-post"></div></div>
    <section class="stats" id="td-stats"></section>
    <div class="panel">
      <div class="filter-row">
        <h2 style="font-size:18px;display:flex;gap:10px;align-items:center">${icon('inbox')}Entregas</h2>
        <div class="segmented" id="td-filter">
          <button class="active" data-f="all">Todos</button><button data-f="submitted">Por calificar</button><button data-f="graded">Calificados</button><button data-f="missing">Sin entrega</button>
        </div>
      </div>
      <div id="td-list">${skeletonLines(4)}</div>
    </div>
  </div>`;
  const $ = (s) => el.querySelector(s);
  $('#td-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    filter = b.dataset.f;
    $('#td-filter').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    update();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-review]');
    if (b) {
      const post = S.posts.find((p) => p.id === postId);
      openReview({ post, student: studentById(b.dataset.review), sub: subs.find((s) => s.studentId === b.dataset.review) });
    }
    const f = e.target.closest('[data-act="open-files"]');
    if (f) { const p = S.posts.find((x) => x.id === postId); openFiles(p.title, p.files, +f.dataset.i); }
  });

  function update() {
    const post = S.posts.find((p) => p.id === postId);
    if (!S.ready.posts || !$('#td-list')) return;
    if (!post) { el.innerHTML = empty('alert', 'Tarea no encontrada', 'Es posible que haya sido eliminada.', `<a class="btn" href="#/clases">${icon('arrowLeft')}Volver</a>`); return; }
    const c = classById(post.classId);
    ui.setCrumb(post.title, `${(c?.name || '').toUpperCase()} / TAREA`);
    $('#td-back').href = `#/clase/${post.classId}`;
    $('#td-back').lastChild.textContent = `Volver a ${c?.name || 'la clase'}`;
    if (!$('#td-post').dataset.done) { $('#td-post').innerHTML = postCard(post, { role: 'teacher', noFoot: true }); $('#td-post').dataset.done = 1; }

    // Estudiantes inscritos + quienes entregaron aunque ya no estén inscritos
    const enrolled = studentsOf(post.classId);
    const extra = subs.filter((s) => !enrolled.some((e) => e.uid === s.studentId)).map((s) => studentById(s.studentId) || { uid: s.studentId, fullName: s.studentName, studentCode: s.studentCode, email: '' });
    const all = [...enrolled, ...extra];
    const rows = all.map((s) => ({ s, sub: subs.find((x) => x.studentId === s.uid) }));
    const submitted = rows.filter((r) => r.sub?.submittedAt).length;
    const graded = rows.filter((r) => r.sub?.grade != null).length;
    const a = avg(rows.map((r) => r.sub?.grade).filter((g) => g != null));
    ui.stats($('#td-stats'), [
      { key: 'e', label: `Entregas de ${all.length}`, value: submitted, icon: 'upload', color: 'var(--c-cyan)' },
      { key: 'p', label: 'Por calificar', value: rows.filter((r) => r.sub?.submittedAt && r.sub.grade == null).length, icon: 'clipboard', color: 'var(--c-amber)' },
      { key: 'g', label: 'Calificadas', value: graded, icon: 'award', color: 'var(--c-emerald)' },
      { key: 'a', label: 'Promedio del grupo', value: a == null ? null : Math.round(a * 10) / 10, decimals: 1, icon: 'chart', color: 'var(--c-violet)' }
    ]);
    const shown = rows.filter((r) =>
      filter === 'all' ? true :
      filter === 'submitted' ? r.sub?.submittedAt && r.sub.grade == null :
      filter === 'graded' ? r.sub?.grade != null : !r.sub?.submittedAt);
    $('#td-list').innerHTML = shown.length ? `<div class="table-wrap"><table class="tbl cards">
      <thead><tr><th>Estudiante</th><th>Estado</th><th>Entregado</th><th>Archivos</th><th>Nota</th><th></th></tr></thead>
      <tbody>${shown.map(({ s, sub }) => {
        const st = sub?.grade != null ? '<span class="badge b-success">Calificada</span>' : sub?.submittedAt ? `<span class="badge ${sub.late ? 'b-warning' : 'b-info'}">${sub.late ? 'Entregada tarde' : 'Por calificar'}</span>` : '<span class="badge b-danger">Sin entrega</span>';
        return `<tr>
          <td class="who-cell"><div class="who">${avatar(s.fullName, '', s.uid)}<div style="min-width:0"><b>${esc(s.fullName)}</b><small class="mono">${esc(s.studentCode || '')}</small></div></div></td>
          <td data-label="Estado">${st}</td>
          <td data-label="Entregado" class="num">${sub?.submittedAt ? fmtDate(sub.submittedAt) : '—'}</td>
          <td data-label="Archivos" class="num">${(sub?.files || []).length}</td>
          <td data-label="Nota">${gradePill(sub?.grade)}</td>
          <td class="actions-cell"><div class="actions"><button class="btn btn-sm ${sub?.submittedAt && sub.grade == null ? 'btn-primary' : ''}" data-review="${s.uid}">${icon(sub?.grade != null ? 'edit' : 'award')}${sub?.grade != null ? 'Editar nota' : sub?.submittedAt ? 'Revisar y calificar' : 'Calificar'}</button></div></td>
        </tr>`;
      }).join('')}</tbody></table></div>` : empty('inbox', 'Nada por aquí', 'No hay estudiantes en esta categoría.');
  }
  update();
  return { update, destroy: unsub };
}

// =====================================================================
//  CONSULTA DE ESTUDIANTES
// =====================================================================
function studentsView(el) {
  ui.setCrumb('Consulta de estudiantes', 'ESTUDIANTES');
  el.innerHTML = `
  <div class="stack">
    <div class="filter-row" style="margin:0">
      <div><h2 style="font-size:24px">Estudiantes</h2><p class="muted" style="margin-top:4px">Consulte por nombre, código, número de documento o correo.</p></div>
      <div class="count-head"><span class="big grad-text" id="sv-n">0</span><span class="muted">registrados</span></div>
    </div>
    <div class="panel">
      <div class="toolbar">
        <div class="input-wrap">${icon('search')}<input class="input" id="sv-q" placeholder="Buscar estudiante…" autocomplete="off"></div>
        <select class="input" id="sv-class"><option value="">Todas las clases</option></select>
      </div>
      <div id="sv-list">${skeletonLines(5)}</div>
    </div>
  </div>`;
  const $ = (s) => el.querySelector(s);
  $('#sv-q').addEventListener('input', debounce(update, 120));
  $('#sv-class').addEventListener('change', update);
  el.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-student]');
    if (row) location.hash = `#/estudiante/${row.dataset.student}`;
  });
  setTimeout(() => $('#sv-q').focus(), 100);

  function update() {
    const sel = $('#sv-class');
    const opts = S.classes.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (sel.options.length - 1 !== opts.length) {
      const v = sel.value;
      sel.innerHTML = `<option value="">Todas las clases</option>` + opts.map((c) => `<option value="${c.id}">${esc(c.name)}${c.archived ? ' (archivada)' : ''}</option>`).join('');
      sel.value = v;
    }
    if (!S.ready.students) return;
    $('#sv-n').textContent = S.students.length;
    const q = norm($('#sv-q').value);
    const cid = sel.value;
    const list = S.students.filter((s) => (!cid || (s.classIds || []).includes(cid)) && (!q || norm(`${s.fullName} ${s.studentCode} ${s.docNumber} ${s.email}`).includes(q))).sort(byName);
    $('#sv-list').innerHTML = list.length ? `<div class="table-wrap"><table class="tbl cards">
      <thead><tr><th>Estudiante</th><th>Código</th><th>Documento</th><th>Clases</th><th></th></tr></thead>
      <tbody>${list.map((s) => `<tr class="clickable" data-student="${s.uid}">
        <td class="who-cell"><div class="who">${avatar(s.fullName, '', s.uid)}<div style="min-width:0"><b>${esc(s.fullName)}</b><small>${esc(s.email)}</small></div></div></td>
        <td class="num" data-label="Código">${esc(s.studentCode)}</td>
        <td class="num" data-label="Documento">${docText(s)}</td>
        <td data-label="Clases"><div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">${(s.classIds || []).map((id) => classById(id)).filter(Boolean).map((c) => `<span class="chip chip-c" style="--c:${colorVar(c.color)};padding:2px 8px" title="${esc(c.name)}">${esc(c.code || c.name)}</span>`).join('') || '<span class="muted">—</span>'}</div></td>
        <td class="actions-cell"><div class="actions"><span class="btn btn-sm btn-ghost">${icon('chevronRight')}</span></div></td>
      </tr>`).join('')}</tbody></table></div>` : empty('search', 'Sin resultados', q ? `No se encontraron estudiantes para "${esc($('#sv-q').value)}".` : 'Aún no hay estudiantes registrados.');
  }
  update();
  return { update };
}

// =====================================================================
//  FICHA DEL ESTUDIANTE
// =====================================================================
function studentDetail(el, uid) {
  let subs = [];
  const unsub = ctx.B.watchSubmissionsBy('studentId', uid, (l) => { subs = l; update(); });
  el.innerHTML = `<div class="stack"><div><a class="back-link" href="#/estudiantes">${icon('arrowLeft')}Consulta de estudiantes</a><div id="sd">${skeletonLines(3)}</div></div></div>`;
  el.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-review]');
    if (r) {
      const post = S.posts.find((p) => p.id === r.dataset.review);
      openReview({ post, student: studentById(uid), sub: subs.find((s) => s.postId === post.id) });
    }
    const rm = e.target.closest('[data-remove-class]');
    if (rm) {
      const s = studentById(uid), c = classById(rm.dataset.removeClass);
      const ok = await ui.confirmDialog({ title: 'Retirar de la clase', danger: true, confirm: 'Retirar', iconName: 'userMinus', message: `¿Retirar a <b>${esc(s.fullName)}</b> de <b>${esc(c.name)}</b>?` });
      if (ok) { try { await ctx.B.removeFromClass(uid, c.id); ui.toast('Estudiante retirado', 'success'); } catch (er) { ui.toast('Error', 'error', errMsg(er)); } }
    }
  });

  function update() {
    if (!S.ready.students) return;
    const s = studentById(uid);
    if (!s) { el.querySelector('#sd').innerHTML = empty('user', 'Estudiante no encontrado'); return; }
    ui.setCrumb(s.fullName, 'ESTUDIANTES / FICHA');
    const classes = (s.classIds || []).map(classById).filter(Boolean);
    const allGrades = subs.map((x) => x.grade).filter((g) => g != null);
    el.querySelector('#sd').innerHTML = `
      <div class="stack">
        <section class="hero">
          <div class="profile-hero">
            ${avatar(s.fullName, 'lg', s.uid)}
            <div style="min-width:0">
              <span class="eyebrow">${icon('grad')}Estudiante</span>
              <h1 style="font-size:clamp(22px,3vw,32px)">${esc(s.fullName)}</h1>
              <div class="hero-meta"><span>${icon('mail')}${esc(s.email)}</span><span>${icon('calendar')}Registrado ${fmtDate(s.createdAt, false)}</span></div>
            </div>
          </div>
          ${ring(avg(allGrades), 96, 'general')}
        </section>
        <div class="kv">
          <div><small>Código</small><b class="mono">${esc(s.studentCode)}</b></div>
          <div><small>Tipo de documento</small><b>${esc(docLabel(s.docType))}</b></div>
          <div><small>Número de documento</small><b class="mono">${esc(s.docNumber)}</b></div>
          <div><small>Entregas realizadas</small><b>${subs.filter((x) => x.submittedAt).length}</b></div>
        </div>
        ${classes.length ? classes.map((c) => {
          const tasks = tasksOf(c.id);
          const a = avg(tasks.map((t) => subs.find((x) => x.postId === t.id)?.grade).filter((g) => g != null));
          return `<div class="panel" style="--c:${colorVar(c.color)}">
            <div class="panel-head">
              <h2><span class="chip chip-c mono">${esc(c.code || '')}</span>${esc(c.name)}${c.archived ? ' <span class="badge b-warning">Archivada</span>' : ''}</h2>
              <div style="display:flex;gap:10px;align-items:center">${ring(a, 56)}<button class="btn btn-sm btn-danger" data-remove-class="${c.id}" title="Retirar de la clase">${icon('userMinus')}</button></div>
            </div>
            ${tasks.length ? `<div class="table-wrap"><table class="tbl cards">
              <thead><tr><th>Tarea</th><th>Estado</th><th>Nota</th><th>Retroalimentación</th><th></th></tr></thead>
              <tbody>${tasks.map((t) => {
                const x = subs.find((y) => y.postId === t.id);
                const st = x?.grade != null ? '<span class="badge b-success">Calificada</span>' : x?.submittedAt ? '<span class="badge b-info">Por calificar</span>' : (t.dueAt && t.dueAt < Date.now()) ? '<span class="badge b-danger">Sin entrega</span>' : '<span class="badge b-accent">Pendiente</span>';
                return `<tr><td class="who-cell"><b>${esc(t.title)}</b><div class="muted" style="font-size:12px">${t.dueAt ? 'Límite: ' + fmtDate(t.dueAt) : ''}</div></td>
                  <td data-label="Estado">${st}</td><td data-label="Nota">${gradePill(x?.grade)}</td>
                  <td data-label="Retroalimentación" style="max-width:280px;font-size:13px;color:var(--text-2)">${esc(x?.feedback || '—')}</td>
                  <td class="actions-cell"><div class="actions"><button class="btn btn-sm" data-review="${t.id}">${icon('award')}${x?.submittedAt ? 'Revisar' : 'Calificar'}</button></div></td></tr>`;
              }).join('')}</tbody></table></div>` : '<p class="muted">Esta clase aún no tiene tareas.</p>'}
          </div>`;
        }).join('') : `<div class="panel">${empty('book', 'Sin clases inscritas')}</div>`}
      </div>`;
  }
  update();
  return { update, destroy: unsub };
}

// =====================================================================
//  ARCHIVADAS
// =====================================================================
function archivedView(el) {
  ui.setCrumb('Clases archivadas', 'HISTÓRICO');
  el.innerHTML = `
  <div class="stack">
    <div class="callout">${icon('info')}<div>Las clases archivadas no aparecen en el registro de estudiantes ni admiten nuevas entregas. Su información y calificaciones se conservan y puede restaurarlas en cualquier momento.</div></div>
    <div class="class-grid" id="ar-grid">${skeletonCards(2)}</div>
  </div>`;
  el.addEventListener('click', classActions);
  bindCardNav(el);
  function update() {
    if (!S.ready.classes) return;
    const list = archivedClasses();
    el.querySelector('#ar-grid').innerHTML = list.length
      ? list.map((c) => classCard(c, { students: studentsOf(c.id), posts: postsOf(c.id).length, manage: true })).join('')
      : `<div style="grid-column:1/-1">${empty('archive', 'No hay clases archivadas', 'Cuando archive una clase al finalizar el periodo, aparecerá aquí.')}</div>`;
  }
  update();
  return { update };
}

// =====================================================================
//  CUENTA DOCENTE
// =====================================================================
function accountView(el) {
  ui.setCrumb('Cuenta y seguridad', 'CUENTA');
  el.innerHTML = `
  <div class="stack" style="max-width:760px">
    <section class="hero">
      <div class="profile-hero">${avatar(TEACHER_NAME, 'lg', S.user.uid)}
        <div><span class="eyebrow">${icon('shield')}Rol docente</span><h1 style="font-size:28px">${esc(TEACHER_NAME)}</h1><div class="hero-meta"><span>${icon('mail')}${esc(S.user.email)}</span></div></div>
      </div>
    </section>
    <div class="panel">
      <div class="panel-head"><h2>${icon('key')}Cambiar contraseña</h2></div>
      <form id="acc-form" class="stack" style="gap:16px" novalidate>
        ${passwordField({ id: 'ac-cur', label: 'Contraseña actual', autocomplete: 'current-password' })}
        ${passwordField({ id: 'ac-new', label: 'Nueva contraseña', meter: true, generator: true })}
        ${passwordField({ id: 'ac-new2', label: 'Confirmar nueva contraseña' })}
        <div><button class="btn btn-primary" type="submit" data-loading="Actualizando…">${icon('check')}Actualizar contraseña</button></div>
      </form>
    </div>
  </div>`;
  const f = el.querySelector('#acc-form');
  bindPassword(el, 'ac-cur'); bindPassword(el, 'ac-new', { confirmId: 'ac-new2', context: () => [TEACHER_NAME, S.user.email] }); bindPassword(el, 'ac-new2');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const cur = f.querySelector('#ac-cur'), nw = f.querySelector('#ac-new'), nw2 = f.querySelector('#ac-new2');
    ui.clearErrors(f);
    if (!cur.value) return ui.fieldError(cur, 'Ingrese su contraseña actual.');
    if (!analyze(nw.value, [TEACHER_NAME, S.user.email]).valid) return ui.fieldError(nw, 'La nueva contraseña no cumple los requisitos.');
    if (nw.value !== nw2.value) return ui.fieldError(nw2, 'Las contraseñas no coinciden.');
    ui.withLoading(f.querySelector('[type=submit]'), async () => {
      try { await ctx.B.changePassword(cur.value, nw.value); ui.toast('Contraseña actualizada', 'success'); f.reset(); f.querySelectorAll('input').forEach((i) => i.dispatchEvent(new Event('input'))); }
      catch (er) { ui.fieldError(cur, errMsg(er)); }
    });
  });
  return {};
}
