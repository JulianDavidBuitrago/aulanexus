// =====================================================================
//  Plan de evaluación por clase (porcentajes dinámicos)
//  class.grading = { categories: [{ id, name, weight }] }   (los pesos suman 100)
//  post.category = id de la categoría (solo tareas). Sin plan: promedio simple.
//
//  Cálculo de la definitiva:
//   - Nota de cada categoría = promedio de sus tareas calificadas.
//   - Definitiva = Σ (nota categoría × peso) / Σ pesos de las categorías que ya tienen notas.
//     Mientras falten categorías por evaluar es una definitiva PARCIAL (se indica "sobre X %").
//   - Acumulado = Σ (nota categoría × peso) / 100: lo ya ganado sobre 5.0.
// =====================================================================
import { icon } from './icons.js';
import { esc, avg } from './util.js';

export const PRESETS = [
  { label: 'Seguimiento 40 % · Final 60 %', cats: [['Talleres, trabajos y quices', 40], ['Proyecto final', 60]] },
  { label: '3 cortes: 30 % · 30 % · 40 %', cats: [['Primer corte', 30], ['Segundo corte', 30], ['Tercer corte', 40]] },
  { label: 'Talleres 30 % · Parciales 40 % · Proyecto 30 %', cats: [['Talleres', 30], ['Parciales', 40], ['Proyecto', 30]] }
];

const newId = () => 'k' + Math.random().toString(36).slice(2, 8);
export const categoriesOf = (c) => (c?.grading?.categories || []).filter((k) => k && k.id && Number(k.weight) > 0);
export const hasPlan = (c) => categoriesOf(c).length > 0;
// Categoría efectiva de una tarea (si no tiene o la borraron, va a la primera)
export function catOf(c, post) {
  const cats = categoriesOf(c);
  if (!cats.length) return null;
  return cats.find((k) => k.id === post?.category) || cats[0];
}
export const planText = (c) => categoriesOf(c).map((k) => `${k.name} ${k.weight} %`).join(' · ');

// gradeOf(task) → nota (0–5) o null
export function finalGrade(c, tasks, gradeOf) {
  const cats = categoriesOf(c);
  if (!cats.length) {
    const g = avg(tasks.map(gradeOf).filter((x) => x != null));
    return { final: g, accumulated: null, covered: g == null ? 0 : 100, byCat: [], weighted: false };
  }
  const byCat = cats.map((k) => {
    const ts = tasks.filter((t) => catOf(c, t)?.id === k.id);
    const gs = ts.map(gradeOf).filter((x) => x != null);
    return { ...k, weight: Number(k.weight), tasks: ts.length, graded: gs.length, avg: avg(gs) };
  });
  const done = byCat.filter((k) => k.avg != null);
  const covered = done.reduce((s, k) => s + k.weight, 0);
  const sum = done.reduce((s, k) => s + k.avg * k.weight, 0);
  return { final: covered ? sum / covered : null, accumulated: sum / 100, covered, byCat, weighted: true };
}

// ---------------------------------------------------------------------
//  Editor del plan (formulario de la clase)
// ---------------------------------------------------------------------
const rowHTML = (k) => `
  <div class="ev-row" data-ev-row data-id="${esc(k.id)}">
    <input class="input" data-ev-name value="${esc(k.name)}" placeholder="Ej. Talleres y quices" maxlength="60" aria-label="Nombre de la categoría">
    <div class="ev-w"><input class="input" data-ev-weight type="number" min="1" max="100" step="1" value="${esc(k.weight)}" aria-label="Porcentaje"><span>%</span></div>
    <button type="button" class="btn btn-ghost btn-icon btn-sm" data-ev-del title="Quitar">${icon('trash')}</button>
  </div>`;

export function gradingFieldsHTML(c) {
  const cats = c?.grading?.categories || [];
  return `
  <div class="ev-cfg" data-ev-cfg>
    <label class="check"><input type="checkbox" data-ev-on ${cats.length ? 'checked' : ''}><span><b>Usar porcentajes de evaluación</b> · si no, la definitiva es el promedio simple de las tareas</span></label>
    <div class="ev-body">
      <div class="ev-presets"><span class="muted">Plantillas:</span>${PRESETS.map((p, i) => `<button type="button" class="btn btn-sm" data-ev-preset="${i}">${esc(p.label)}</button>`).join('')}</div>
      <div class="ev-rows" data-ev-rows>${cats.map(rowHTML).join('')}</div>
      <div class="ev-foot">
        <button type="button" class="btn btn-sm" data-ev-add>${icon('plus')}Agregar categoría</button>
        <span class="ev-total" data-ev-total></span>
      </div>
      <div class="error" data-ev-err></div>
      <p class="muted ev-help">${icon('info')}Al crear cada tarea elija a qué categoría pertenece. La nota de la categoría es el promedio de sus tareas calificadas.</p>
    </div>
  </div>`;
}

export function bindGradingFields(root) {
  const box = root.querySelector('[data-ev-cfg]'); if (!box) return;
  const rows = box.querySelector('[data-ev-rows]');
  const paint = () => {
    const on = box.querySelector('[data-ev-on]').checked;
    box.classList.toggle('off', !on);
    const total = [...rows.querySelectorAll('[data-ev-weight]')].reduce((s, i) => s + (Number(i.value) || 0), 0);
    const t = box.querySelector('[data-ev-total]');
    t.textContent = `Total: ${total} %`;
    t.classList.toggle('ok', total === 100);
    t.classList.toggle('bad', total !== 100);
  };
  box.addEventListener('input', paint);
  box.addEventListener('change', (e) => {
    if (e.target.matches('[data-ev-on]') && e.target.checked && !rows.children.length) {
      rows.innerHTML = PRESETS[0].cats.map(([name, weight]) => rowHTML({ id: newId(), name, weight })).join('');
    }
    paint();
  });
  box.addEventListener('click', (e) => {
    const p = e.target.closest('[data-ev-preset]');
    if (p) {
      // Conserva los id de las categorías existentes (las tareas ya asignadas no se pierden)
      const old = [...rows.querySelectorAll('[data-ev-row]')].map((r) => r.dataset.id);
      rows.innerHTML = PRESETS[+p.dataset.evPreset].cats.map(([name, weight], i) => rowHTML({ id: old[i] || newId(), name, weight })).join('');
      box.querySelector('[data-ev-on]').checked = true;
    }
    if (e.target.closest('[data-ev-add]')) rows.insertAdjacentHTML('beforeend', rowHTML({ id: newId(), name: '', weight: '' }));
    const d = e.target.closest('[data-ev-del]');
    if (d) d.closest('[data-ev-row]').remove();
    paint();
  });
  paint();
}

// Devuelve { grading, error }
export function readGradingFields(root) {
  const box = root.querySelector('[data-ev-cfg]'); if (!box) return { grading: null, error: '' };
  const errEl = box.querySelector('[data-ev-err]');
  if (!box.querySelector('[data-ev-on]').checked) { errEl.textContent = ''; return { grading: { categories: [] }, error: '' }; }
  const cats = [...box.querySelectorAll('[data-ev-row]')].map((r) => ({
    id: r.dataset.id, name: r.querySelector('[data-ev-name]').value.trim(), weight: Math.round(Number(r.querySelector('[data-ev-weight]').value) || 0)
  }));
  let error = '';
  if (!cats.length) error = 'Agregue al menos una categoría o desactive los porcentajes.';
  else if (cats.some((k) => !k.name)) error = 'Escriba el nombre de cada categoría.';
  else if (cats.some((k) => k.weight < 1 || k.weight > 100)) error = 'Cada porcentaje debe estar entre 1 y 100.';
  else if (new Set(cats.map((k) => k.name.toLowerCase())).size !== cats.length) error = 'Hay categorías con el mismo nombre.';
  else if (cats.reduce((s, k) => s + k.weight, 0) !== 100) error = `Los porcentajes deben sumar 100 % (ahora suman ${cats.reduce((s, k) => s + k.weight, 0)} %).`;
  errEl.textContent = error;
  return { grading: { categories: cats }, error };
}

// ---------------------------------------------------------------------
//  Selector de categoría (publicar / editar tarea)
// ---------------------------------------------------------------------
export function categoryFieldHTML(c, prefix, current = null, hidden = false) {
  const cats = categoriesOf(c);
  if (!cats.length) return '';
  const sel = cats.find((k) => k.id === current)?.id || cats[0].id;
  return `<div class="field" id="${prefix}-cat-f" ${hidden ? 'hidden' : ''}><label for="${prefix}-cat">Categoría de evaluación</label>
    <select class="input" id="${prefix}-cat">${cats.map((k) => `<option value="${esc(k.id)}" ${k.id === sel ? 'selected' : ''}>${esc(k.name)} (${k.weight} %)</option>`).join('')}</select></div>`;
}

// ---------------------------------------------------------------------
//  Resumen de la nota (estudiante y ficha del estudiante)
// ---------------------------------------------------------------------
export function breakdownHTML(r, fmt) {
  if (!r?.weighted) return '';
  return `<div class="ev-break">
    ${r.byCat.map((k) => `<div class="ev-b-row"><span class="ev-b-name">${esc(k.name)} <small>${k.weight} %</small></span>
      <span class="ev-b-bar"><i style="width:${k.avg == null ? 0 : (k.avg / 5) * 100}%"></i></span>
      <b>${k.avg == null ? '<span class="muted">—</span>' : fmt(k.avg)}</b><small class="muted">${k.graded}/${k.tasks} ${k.tasks === 1 ? 'tarea' : 'tareas'}</small></div>`).join('')}
    <div class="ev-b-foot">${r.covered < 100 && r.final != null
      ? `Definitiva parcial sobre el ${r.covered} % evaluado · acumulado: <b>${fmt(r.accumulated)}</b> de 5.0`
      : r.final != null ? `Definitiva ponderada · acumulado: <b>${fmt(r.accumulated)}</b> de 5.0` : 'Aún no hay notas.'}</div>
  </div>`;
}

// ---------------------------------------------------------------------
//  Planilla del estudiante (solo lectura, solo su fila)
//  cellOf(task) → HTML de la celda · pill(nota) → HTML de la nota
// ---------------------------------------------------------------------
export function studentSheetHTML(c, tasks, gradeOf, cellOf, pill, fmt) {
  if (!tasks.length) return '';
  const cats = categoriesOf(c);
  const num = new Map(tasks.map((t, i) => [t.id, i + 1]));
  const th = (t) => `<th class="task" title="${esc(t.title)}">T${num.get(t.id)} · ${esc(t.title.split('·')[0].trim().slice(0, 18))}</th>`;
  const td = (t) => `<td title="${esc(t.title)}">${cellOf(t)}</td>`;
  const r = finalGrade(c, tasks, gradeOf);
  let head, row;
  if (cats.length) {
    const groups = cats.map((k, i) => ({ k, i, ts: tasks.filter((t) => catOf(c, t).id === k.id) }));
    head = `<tr class="gb-cats">${groups.map((g) => `<th class="gb-cat" colspan="${g.ts.length + 1}">${esc(g.k.name)} · ${g.k.weight} %</th>`).join('')}<th rowspan="2">Definitiva</th></tr>
      <tr>${groups.map((g) => g.ts.map(th).join('') + '<th class="gb-avg">Prom.</th>').join('')}</tr>`;
    row = groups.map((g) => g.ts.map(td).join('') + `<td class="gb-avg">${pill(r.byCat[g.i].avg)}</td>`).join('');
  } else {
    head = `<tr>${tasks.map(th).join('')}<th>Definitiva</th></tr>`;
    row = tasks.map(td).join('');
  }
  const partial = r.weighted && r.final != null && r.covered < 100;
  return `<div class="panel my-sheet">
    <div class="panel-head"><h2>${icon('table')}Mi planilla de calificaciones</h2></div>
    ${cats.length ? `<div class="ev-plan">${icon('chart')}<span><b>Plan de evaluación:</b> ${esc(planText(c))}</span></div>` : ''}
    <div class="table-wrap"><table class="tbl gradebook"><thead>${head}</thead>
      <tbody><tr>${row}<td class="final">${pill(r.final)}${partial ? `<small class="gb-cov">${r.covered} %</small>` : ''}</td></tr></tbody></table></div>
    <p class="muted" style="font-size:12.5px;margin-top:10px">${r.weighted
      ? `${partial ? `Definitiva parcial: se ha evaluado el ${r.covered} % del curso. Acumulado: <b>${fmt(r.accumulated)}</b> de 5.0. ` : r.final != null ? `Acumulado: <b>${fmt(r.accumulated)}</b> de 5.0. ` : ''}La nota de cada categoría es el promedio de sus tareas calificadas.`
      : 'La definitiva es el promedio de las tareas calificadas.'} Solo usted ve esta planilla.</p>
  </div>`;
}
