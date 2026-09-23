// Piezas visuales compartidas entre las vistas del docente y del estudiante
import { icon } from './icons.js';
import { hueOf, toast, modal, withLoading } from './ui.js';
import { esc, initials, fmtDate, timeAgo, timeLeft, fmtGrade, gradeTone, linkify, langOf, fmtBytes, extOf, download, errMsg, docLabel } from './util.js';
import { LIMITS } from './firebase-config.js';
import { S, ctx, classById } from './state.js';

export const avatar = (name, size = '', key) =>
  `<div class="avatar ${size}" style="--h:${hueOf(key || name || '')}" aria-hidden="true">${esc(initials(name))}</div>`;

export const colorVar = (c) => `var(--c-${c || 'violet'})`;

export const empty = (ic, title, text = '', action = '') => `
  <div class="empty"><div class="em-ic">${icon(ic)}</div><b>${esc(title)}</b>${text ? `<p>${text}</p>` : ''}${action}</div>`;

export const skeletonCards = (n = 3) => Array.from({ length: n }, () => '<div class="skeleton sk-card"></div>').join('');
export const skeletonLines = (n = 4) => Array.from({ length: n }, () => '<div class="skeleton sk-line"></div>').join('');

export const gradePill = (g) => `<span class="grade-pill ${gradeTone(g)}">${fmtGrade(g)}</span>`;

export function ring(value, size = 84, label = 'prom.') {
  const tone = gradeTone(value);
  const p = value == null ? 0 : Math.round((value / 5) * 100);
  return `<div class="ring ${tone}" style="--p:${p};--s:${size}px"><b>${fmtGrade(value)}</b>${size >= 70 ? `<small>${label}</small>` : ''}</div>`;
}

export const TYPE = {
  anuncio: { label: 'Anuncio', icon: 'megaphone' },
  material: { label: 'Material didáctico', icon: 'layers' },
  tarea: { label: 'Tarea', icon: 'clipboard' }
};

// Estado de una tarea para un estudiante
export function taskStatus(post, sub) {
  if (sub && sub.grade != null) return { key: 'graded', label: 'Calificada', cls: 'b-success', icon: 'award' };
  if (sub && sub.submittedAt) return { key: 'submitted', label: sub.late ? 'Entregada tarde' : 'Entregada', cls: sub.late ? 'b-warning' : 'b-info', icon: 'check' };
  if (post.dueAt && post.dueAt < Date.now()) return { key: 'overdue', label: 'Vencida', cls: 'b-danger', icon: 'clock' };
  return { key: 'pending', label: 'Pendiente', cls: 'b-accent', icon: 'clock' };
}

export function classCard(c, { students = [], posts = 0, manage = false } = {}) {
  const shown = students.slice(0, 4);
  return `
  <article class="class-card" style="--c:${colorVar(c.color)}" data-href="#/clase/${c.id}" tabindex="0">
    <div class="cc-top">
      <span class="chip mono chip-c">${icon('hash')}${esc(c.code || 'CLASE')}</span>
      ${c.archived ? `<span class="badge b-warning">${icon('archive')}Archivada</span>` : `<span class="badge b-success dot">Activa</span>`}
    </div>
    <h3>${esc(c.name)}</h3>
    ${c.description ? `<p class="desc">${esc(c.description)}</p>` : ''}
    <div class="cc-meta">
      ${c.schedule ? `<span>${icon('calendar')}${esc(c.schedule)}</span>` : ''}
      ${c.room ? `<span>${icon('pin')}${esc(c.room)}</span>` : ''}
      <span>${icon('layers')}${posts} ${posts === 1 ? 'publicación' : 'publicaciones'}</span>
    </div>
    ${manage ? `<div class="cc-actions">
      <button class="btn btn-sm" data-act="edit-class" data-id="${c.id}">${icon('edit')}Editar</button>
      ${c.archived
        ? `<button class="btn btn-sm" data-act="restore-class" data-id="${c.id}">${icon('restore')}Restaurar</button>`
        : `<button class="btn btn-sm" data-act="archive-class" data-id="${c.id}">${icon('archive')}Archivar</button>`}
    </div>` : ''}
    <div class="cc-foot">
      <div style="display:flex;align-items:center;gap:10px">
        ${students.length ? `<div class="avatar-stack">${shown.map((s) => avatar(s.fullName, 'sm', s.uid)).join('')}${students.length > 4 ? `<div class="avatar sm more">+${students.length - 4}</div>` : ''}</div>` : ''}
        <span>${students.length} ${students.length === 1 ? 'estudiante' : 'estudiantes'}</span>
      </div>
      <span class="go">${icon('arrowRight')}</span>
    </div>
  </article>`;
}

// Tarjeta de publicación
export function postCard(p, { role, sub, stats, showClass = false, noFoot = false } = {}) {
  const t = TYPE[p.type] || TYPE.anuncio;
  const c = classById(p.classId);
  const links = (p.links || []).filter(Boolean);
  const files = p.files || [];
  let foot = '';
  if (p.type === 'tarea' && noFoot) {
    foot = p.dueAt ? `<div class="post-foot"><span class="due">${icon('clock')}Fecha límite: ${fmtDate(p.dueAt)} <span class="muted" style="font-weight:500">· ${timeLeft(p.dueAt)}</span></span></div>` : '';
  } else if (p.type === 'tarea') {
    const due = p.dueAt ? `<span class="due">${icon('clock')}${fmtDate(p.dueAt)} <span class="muted" style="font-weight:500">· ${timeLeft(p.dueAt)}</span></span>` : `<span class="due">${icon('clock')}Sin fecha límite</span>`;
    if (role === 'teacher') {
      const pct = stats && stats.total ? Math.round((stats.submitted / stats.total) * 100) : 0;
      foot = `<div class="post-foot">${due}
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span class="muted" style="font-size:12.5px">${stats?.submitted || 0}/${stats?.total || 0} entregas · ${stats?.graded || 0} calificadas</span>
          <div class="progress"><i style="width:${pct}%"></i></div>
          <a class="btn btn-sm btn-primary" href="#/tarea/${p.id}">${icon('clipboard')}Revisar entregas</a>
        </div></div>`;
    } else {
      const st = taskStatus(p, sub);
      const archived = c?.archived;
      const btn = st.key === 'graded'
        ? `<button class="btn btn-sm" data-act="view-grade" data-id="${p.id}">${icon('award')}Ver calificación ${gradePill(sub.grade)}</button>`
        : archived ? '' : `<button class="btn btn-sm ${st.key === 'submitted' ? '' : 'btn-primary'}" data-act="submit" data-id="${p.id}">${icon(st.key === 'submitted' ? 'edit' : 'upload')}${st.key === 'submitted' ? 'Editar entrega' : 'Entregar'}</button>`;
      foot = `<div class="post-foot">${due}<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="badge ${st.cls}">${icon(st.icon)}${st.label}</span>${btn}</div></div>`;
    }
  }
  return `
  <article class="post ${p.type}" data-post="${p.id}">
    <div class="post-head">
      <div class="post-ic">${icon(t.icon)}</div>
      <div class="post-title">
        <h3>${esc(p.title)}</h3>
        <div class="meta">
          <span class="badge" style="padding:2px 8px">${t.label}</span>
          ${showClass && c ? `<span class="chip chip-c" style="--c:${colorVar(c.color)};padding:2px 8px">${esc(c.name)}</span>` : ''}
          <span title="${fmtDate(p.createdAt)}">${timeAgo(p.createdAt)}</span>
        </div>
      </div>
      ${role === 'teacher' ? `<button class="btn btn-ghost btn-icon btn-sm btn-danger" data-act="delete-post" data-id="${p.id}" title="Eliminar publicación" aria-label="Eliminar publicación">${icon('trash')}</button>` : ''}
    </div>
    ${p.body ? `<div class="post-body">${linkify(p.body)}</div>` : ''}
    ${links.length ? `<div class="post-links">${links.map((l) => `<a class="post-link" href="${esc(l)}" target="_blank" rel="noopener noreferrer">${icon('link')}<span>${esc(l.replace(/^https?:\/\//, ''))}</span></a>`).join('')}</div>` : ''}
    ${files.length ? `<div class="post-files">${files.map((f, i) => `<button class="post-link" data-act="open-files" data-id="${p.id}" data-i="${i}">${icon('code')}<span>${esc(f.name)}</span></button>`).join('')}</div>` : ''}
    ${foot}
  </article>`;
}

// ---------- Visor de código con resaltado de sintaxis ----------
export function codeViewer(files = []) {
  if (!files.length) return '';
  return `
  <div class="code-viewer" data-cv>
    <div class="cv-bar">
      <div class="cv-dots"><i></i><i></i><i></i></div>
      <div class="cv-tabs">${files.map((f, i) => `<button type="button" class="${i === 0 ? 'active' : ''}" data-cv-tab="${i}">${esc(f.name)}</button>`).join('')}</div>
      <button type="button" class="btn btn-sm btn-icon" data-cv-copy title="Copiar código" aria-label="Copiar código">${icon('copy')}</button>
      <button type="button" class="btn btn-sm btn-icon" data-cv-dl title="Descargar archivo" aria-label="Descargar archivo">${icon('download')}</button>
    </div>
    <div class="cv-body"></div>
  </div>`;
}
export function bindCodeViewer(root, files = []) {
  const cv = root.querySelector('[data-cv]');
  if (!cv) return;
  let cur = 0;
  const render = () => {
    const f = files[cur];
    const code = f.content || '';
    const lines = code.split('\n').length;
    let html = esc(code);
    const hl = window.hljs;
    if (hl) { try { html = hl.highlight(code, { language: langOf(f.name), ignoreIllegals: true }).value; } catch { /* sin resaltado */ } }
    cv.querySelector('.cv-body').innerHTML = `<div class="cv-gutter">${Array.from({ length: lines }, (_, i) => i + 1).join('\n')}</div><pre><code>${html}</code></pre>`;
    cv.querySelectorAll('[data-cv-tab]').forEach((b) => b.classList.toggle('active', +b.dataset.cvTab === cur));
  };
  cv.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-cv-tab]');
    if (tab) { cur = +tab.dataset.cvTab; render(); }
    if (e.target.closest('[data-cv-copy]')) {
      try { await navigator.clipboard.writeText(files[cur].content || ''); toast('Código copiado', 'success'); } catch { toast('No fue posible copiar', 'error'); }
    }
    if (e.target.closest('[data-cv-dl]')) download(files[cur].name, files[cur].content || '');
  });
  render();
}
export function openFiles(title, files, index = 0) {
  const ordered = [...files.slice(index), ...files.slice(0, index)];
  modal({ title, subtitle: `${files.length} ${files.length === 1 ? 'archivo' : 'archivos'}`, iconName: 'code', size: 'lg', body: codeViewer(ordered), onMount: (el) => bindCodeViewer(el, ordered) });
}

// ---------- Lectura de archivos de código ----------
export async function readCodeFiles(fileList, allowed, current = []) {
  const out = [...current];
  for (const f of fileList) {
    const ext = extOf(f.name);
    if (!allowed.includes(ext)) { toast(`Archivo no permitido: ${f.name}`, 'error', `Solo se aceptan: ${allowed.join(', ')}`); continue; }
    if (f.size > LIMITS.maxFileBytes) { toast(`Archivo demasiado grande: ${f.name}`, 'error', `Máximo ${fmtBytes(LIMITS.maxFileBytes)} por archivo.`); continue; }
    if (out.length >= LIMITS.maxFiles) { toast('Límite de archivos alcanzado', 'warn', `Máximo ${LIMITS.maxFiles} archivos por entrega.`); break; }
    const content = await f.text();
    const idx = out.findIndex((x) => x.name === f.name);
    const item = { name: f.name, size: f.size, content };
    if (idx >= 0) out[idx] = item; else out.push(item);
  }
  return out;
}
export const fileItems = (files, removable = true) => files.map((f, i) => {
  const ext = f.name.split('.').pop().toLowerCase();
  return `<div class="file-item"><span class="fi-badge ${ext}">${esc(ext)}</span><span class="fi-name">${esc(f.name)}</span><span class="fi-size">${fmtBytes(f.size || (f.content || '').length)}</span>
    <button type="button" class="btn btn-ghost btn-icon btn-sm" data-file-view="${i}" title="Vista previa" aria-label="Vista previa">${icon('eye')}</button>
    ${removable ? `<button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger" data-file-del="${i}" title="Quitar" aria-label="Quitar archivo">${icon('x')}</button>` : ''}</div>`;
}).join('');

// Dropzone reutilizable (arrastrar y soltar o seleccionar)
export function bindDropzone(root, { allowed, get, set, render }) {
  const dz = root.querySelector('.dropzone');
  const input = root.querySelector('input[type=file]');
  const list = root.querySelector('.file-list');
  const paint = () => { list.innerHTML = fileItems(get()); render?.(); };
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', async (e) => { set(await readCodeFiles(e.dataTransfer.files, allowed, get())); paint(); });
  input.addEventListener('change', async () => { set(await readCodeFiles(input.files, allowed, get())); input.value = ''; paint(); });
  list.addEventListener('click', (e) => {
    const del = e.target.closest('[data-file-del]');
    const view = e.target.closest('[data-file-view]');
    if (del) { const arr = get(); arr.splice(+del.dataset.fileDel, 1); set(arr); paint(); }
    if (view) { const arr = get(); openFiles('Vista previa', arr, +view.dataset.fileView); }
  });
  paint();
}
export const dropzoneHTML = (allowed, label = 'Arrastre sus archivos aquí o haga clic para seleccionarlos') => `
  <div class="dropzone" tabindex="0" role="button" aria-label="${esc(label)}">
    <div class="dz-icon">${icon('upload')}</div>
    <b>${esc(label)}</b>
    <small>Formatos: ${allowed.join(' · ')} — máx. ${LIMITS.maxFiles} archivos de ${fmtBytes(LIMITS.maxFileBytes)}</small>
  </div>
  <input type="file" multiple accept="${allowed.join(',')}" hidden>
  <div class="file-list"></div>`;

// ---------- Revisión y calificación (docente) ----------
export function openReview({ post, student, sub }) {
  const c = classById(post.classId);
  const name = student?.fullName || sub?.studentName || 'Estudiante';
  const code = student?.studentCode || sub?.studentCode || '';
  const has = sub && sub.submittedAt;
  const body = `
  <div class="review-grid">
    <div class="stack" style="gap:14px">
      <div style="display:flex;gap:12px;align-items:center">
        ${avatar(name, '', student?.uid || sub?.studentId)}
        <div style="min-width:0"><b>${esc(name)}</b><div class="muted" style="font-size:12.5px">${esc(code)}${student ? ` · ${esc(student.email)}` : ''}</div></div>
      </div>
      ${has ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span class="badge b-info">${icon('clock')}Entregado ${fmtDate(sub.submittedAt)}</span>
          ${sub.late ? `<span class="badge b-warning">${icon('alert')}Entrega tardía</span>` : ''}
        </div>
        <div><div class="label" style="margin-bottom:8px">Respuesta en texto</div>
          <div class="text-block">${sub.text ? esc(sub.text) : '<span class="muted">Sin texto.</span>'}</div></div>
        ${(sub.files || []).length ? `<div><div class="label" style="margin-bottom:8px">Archivos de código (${sub.files.length})</div>${codeViewer(sub.files)}</div>` : ''}
      ` : `<div class="callout warn">${icon('alert')}<div>Este estudiante no ha realizado la entrega. Puede registrar una calificación de todas formas (por ejemplo, 0.0 por no entrega).</div></div>`}
    </div>
    <div class="grade-box">
      <div class="field">
        <label for="rv-grade">Calificación <span class="hint">escala 0.0 – 5.0</span></label>
        <input class="input grade-input" id="rv-grade" type="number" min="0" max="5" step="0.1" inputmode="decimal" value="${sub?.grade != null ? Number(sub.grade).toFixed(1) : ''}" placeholder="0.0">
        <div class="error"></div>
      </div>
      <div class="quick-grades">${['5.0', '4.5', '4.0', '3.5', '3.0', '0.0'].map((g) => `<button type="button" data-q="${g}">${g}</button>`).join('')}</div>
      <div class="field">
        <label for="rv-fb">Retroalimentación</label>
        <textarea class="input" id="rv-fb" rows="5" placeholder="Fortalezas, aspectos por mejorar y recomendaciones…">${esc(sub?.feedback || '')}</textarea>
      </div>
      <div class="callout" style="font-size:12.5px">${icon('bell')}<div>El estudiante recibirá una notificación y solo él podrá ver esta calificación.</div></div>
    </div>
  </div>`;
  modal({
    title: post.title, subtitle: `${esc(c?.name || '')} · Revisión de entrega`, iconName: 'award', size: 'xl', body,
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save data-loading="Guardando…">${icon('check')}Guardar calificación</button>`,
    onMount(el, m) {
      if (has && sub.files?.length) bindCodeViewer(el, sub.files);
      const gi = el.querySelector('#rv-grade');
      el.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { gi.value = b.dataset.q; gi.focus(); }));
      el.querySelector('[data-save]').addEventListener('click', (e) => withLoading(e.currentTarget, async () => {
        const g = parseFloat(String(gi.value).replace(',', '.'));
        const f = gi.closest('.field');
        if (isNaN(g) || g < 0 || g > 5) { f.classList.add('invalid'); f.querySelector('.error').textContent = 'Ingrese una nota entre 0.0 y 5.0'; return; }
        f.classList.remove('invalid');
        const grade = Math.round(g * 10) / 10;
        const studentId = student?.uid || sub.studentId;
        try {
          await ctx.B.grade({
            postId: post.id, classId: post.classId, studentId, studentName: name, studentCode: code,
            grade, feedback: el.querySelector('#rv-fb').value.trim()
          });
          await ctx.B.addNotifications([{ userId: studentId, type: 'grade', title: `Nueva calificación · ${c?.name || 'Clase'}`, message: `${post.title}: ${grade.toFixed(1)}`, link: '#/calificaciones', classId: post.classId }]);
          toast('Calificación registrada', 'success', `${name}: ${grade.toFixed(1)} — se notificó al estudiante.`);
          m.close();
        } catch (err) { toast('No se pudo guardar', 'error', errMsg(err)); }
      }));
    }
  });
}

export const docText = (s) => `${esc(s.docType)} ${esc(s.docNumber)}`;
export const docTitle = (s) => `${docLabel(s.docType)} ${s.docNumber}`;
export { S };
