// =====================================================================
//  Editores de la propuesta (formato fijo) y del informe final (flexible)
// =====================================================================
import { icon } from './icons.js';
import { esc, fmtPhone } from './util.js';
import * as ui from './ui.js';
import {
  PROPOSAL_GUIDE, GUIDES, BLOCK_TYPES, newBlock, newChapter, numberFinal, dmy, longDate, finalWords
} from './practica-model.js';

// ---------- Utilidades de enlace de datos ----------
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = /^\d+$/.test(keys[i]) ? +keys[i] : keys[i];
    if (o[k] === undefined || o[k] === null) o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[k];
  }
  const last = keys[keys.length - 1];
  o[/^\d+$/.test(last) ? +last : last] = value;
}
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[/^\d+$/.test(k) ? +k : k]), obj);
}
const autoGrow = (t) => { t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight + 2, 900)}px`; };
const ta = (path, value, { rows = 3, placeholder = '', cls = '', ro = false } = {}) =>
  `<textarea class="input ${cls}" data-path="${path}" rows="${rows}" placeholder="${esc(placeholder)}" ${ro ? 'readonly' : ''}>${esc(value ?? '')}</textarea>`;
const inp = (path, value, { placeholder = '', type = 'text', cls = '', ro = false } = {}) =>
  `<input class="input ${cls}" data-path="${path}" type="${type}" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}" ${ro ? 'readonly' : ''}>`;
const guide = (text, open = false) => `<details class="pe-guide" ${open ? 'open' : ''}><summary>${icon('info')}Guía de redacción</summary><p>${esc(text).replace(/\*([^*]+)\*/g, '<i>$1</i>')}</p></details>`;
const iconBtn = (act, ic, title, extra = '') => `<button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="${act}" ${extra} title="${esc(title)}" aria-label="${esc(title)}">${icon(ic)}</button>`;

function bindInputs(root, draft, onChange) {
  root.addEventListener('input', (e) => {
    const el = e.target.closest('[data-path]'); if (!el || el.readOnly || el.disabled) return;
    const v = el.type === 'checkbox' ? el.checked : el.value;
    setPath(draft(), el.dataset.path, v);
    if (el.tagName === 'TEXTAREA') autoGrow(el);
    onChange(el.dataset.path);
  });
  root.addEventListener('change', (e) => {
    const el = e.target.closest('[data-path]'); if (!el || el.type !== 'checkbox' && el.tagName !== 'SELECT') return;
    setPath(draft(), el.dataset.path, el.type === 'checkbox' ? el.checked : el.value);
    onChange(el.dataset.path, true);
  });
}
const growAll = (root) => requestAnimationFrame(() => root.querySelectorAll('textarea').forEach(autoGrow));

// =====================================================================
//  PROPUESTA DE PRÁCTICA
// =====================================================================
export function proposalEditor(root, { getDraft, practice, readonly, onChange, goCompany }) {
  let ro = readonly;
  function render() {
    const p = getDraft(), pr = practice(), c = pr.company || {};
    const oes = (p.specific || []).map((_, i) => `OE${i + 1}`);
    root.innerHTML = `
    <div class="pe">
      <section class="pe-sec">
        <div class="pe-head"><h3><span class="pe-num">I</span>Encabezado e información de la práctica</h3>
          ${goCompany ? `<button type="button" class="btn btn-sm" data-act="go-company">${icon('building')}Editar datos de la empresa</button>` : ''}</div>
        <p class="muted pe-note">Estos datos se toman automáticamente del registro de la práctica y de la pestaña <b>Empresa</b>.</p>
        <div class="kv pe-kv">
          <div><small>Estudiante</small><b>${esc(pr.studentName)}</b></div>
          <div><small>Código</small><b class="mono">${esc(pr.studentCode)}</b></div>
          <div><small>Profesor asesor</small><b>${esc(pr.ownerName)}</b></div>
          <div><small>Periodo académico</small><b>${esc(pr.period || '')}</b></div>
          <div><small>Fecha de inicio</small><b>${esc(dmy(c.startDate)) || '<span class="pe-miss">Sin definir</span>'}</b></div>
          <div><small>Fecha de terminación</small><b>${esc(dmy(c.endDate)) || '<span class="pe-miss">Sin definir</span>'}</b></div>
          <div><small>¿Remunerada?</small><b>${c.paid === true ? 'Sí' : c.paid === false ? 'No' : '<span class="pe-miss">Sin definir</span>'}</b></div>
          <div><small>Funcionario responsable</small><b>${esc(c.contactName) || '<span class="pe-miss">Sin definir</span>'}</b></div>
          <div><small>Cargo</small><b>${esc(c.contactRole) || '<span class="pe-miss">—</span>'}</b></div>
          <div><small>Teléfono · correo</small><b>${esc([fmtPhone(c.contactPhone), c.contactEmail].filter(Boolean).join(' · ')) || '<span class="pe-miss">—</span>'}</b></div>
        </div>
        <div class="field" style="max-width:260px"><label>Fecha de diligenciamiento</label>${inp('fillDate', p.fillDate, { type: 'date', ro })}</div>
      </section>

      <section class="pe-sec">
        <div class="pe-head"><h3><span class="pe-num">II</span>Descripción general de la práctica</h3></div>
        ${guide(PROPOSAL_GUIDE.description)}
        ${ta('description', p.description, { rows: 6, placeholder: 'La práctica se desarrollará en el área de…', ro })}
      </section>

      <section class="pe-sec">
        <div class="pe-head"><h3>Necesidades actuales identificadas y estrategia de solución</h3></div>
        ${guide(PROPOSAL_GUIDE.needs)}
        <div class="pe-rows">
          ${(p.needs || []).map((n, i) => `
          <div class="pe-row pe-row-3">
            <div class="field"><label>Necesidad identificada</label>${ta(`needs.${i}.a`, n.a, { rows: 2, ro })}</div>
            <div class="field"><label>Manifestación en la operación</label>${ta(`needs.${i}.b`, n.b, { rows: 2, ro })}</div>
            <div class="field"><label>Cómo se atenderá desde la práctica</label>${ta(`needs.${i}.c`, n.c, { rows: 2, ro })}</div>
            ${ro ? '' : `<div class="pe-row-tools">${iconBtn('del', 'trash', 'Quitar fila', `data-list="needs" data-i="${i}"`)}</div>`}
          </div>`).join('')}
        </div>
        ${ro ? '' : `<button type="button" class="btn btn-sm" data-act="add" data-list="needs">${icon('plus')}Agregar necesidad</button>`}
      </section>

      <section class="pe-sec">
        <div class="pe-head"><h3>Resultado general esperado</h3></div>
        ${guide(PROPOSAL_GUIDE.expected)}
        ${ta('expected', p.expected, { rows: 3, ro })}
      </section>

      <section class="pe-sec">
        <div class="pe-head"><h3>Objetivo general</h3></div>
        ${guide(PROPOSAL_GUIDE.objective)}
        ${ta('objective', p.objective, { rows: 3, placeholder: 'Desarrollar…, mediante…, para…', ro })}
      </section>

      <section class="pe-sec">
        <div class="pe-head"><h3>Objetivos específicos</h3></div>
        ${guide(PROPOSAL_GUIDE.specific)}
        <div class="pe-list">
          ${(p.specific || []).map((t, i) => `
          <div class="pe-li"><span class="pe-tag">OE${i + 1}.</span>${ta(`specific.${i}`, t, { rows: 2, ro })}
            ${ro ? '' : `<div class="pe-li-tools">${iconBtn('up', 'arrowUp', 'Subir', `data-list="specific" data-i="${i}"`)}${iconBtn('down', 'arrowDown', 'Bajar', `data-list="specific" data-i="${i}"`)}${iconBtn('del', 'trash', 'Quitar', `data-list="specific" data-i="${i}"`)}</div>`}</div>`).join('')}
        </div>
        ${ro ? '' : `<button type="button" class="btn btn-sm" data-act="add" data-list="specific">${icon('plus')}Agregar objetivo específico</button>`}
      </section>

      <section class="pe-sec">
        <div class="pe-head"><h3>Proceso metodológico</h3></div>
        ${guide(PROPOSAL_GUIDE.method)}
        <div class="field"><label>Enfoque general</label>${ta('methodIntro', p.methodIntro, { rows: 3, placeholder: 'La práctica se desarrollará bajo un enfoque…', ro })}</div>
        <div class="pe-rows">
          ${(p.phases || []).map((f, i) => `
          <div class="pe-row pe-phase">
            <div class="pe-phase-top">
              <span class="pe-tag">Fase ${i + 1}.</span>
              <div class="field" style="flex:1"><label>Nombre y duración</label>${inp(`phases.${i}.title`, f.title, { placeholder: 'Inducción y diagnóstico (semana 1)', ro })}</div>
              <div class="field" style="width:150px"><label>Objetivos</label>${inp(`phases.${i}.oes`, f.oes, { placeholder: oes.slice(0, 2).join(', ') || 'OE1', ro })}</div>
            </div>
            <div class="field"><label>Descripción</label>${ta(`phases.${i}.text`, f.text, { rows: 3, ro })}</div>
            ${ro ? '' : `<div class="pe-row-tools">${iconBtn('up', 'arrowUp', 'Subir', `data-list="phases" data-i="${i}"`)}${iconBtn('down', 'arrowDown', 'Bajar', `data-list="phases" data-i="${i}"`)}${iconBtn('del', 'trash', 'Quitar fase', `data-list="phases" data-i="${i}"`)}</div>`}
          </div>`).join('')}
        </div>
        ${ro ? '' : `<button type="button" class="btn btn-sm" data-act="add" data-list="phases">${icon('plus')}Agregar fase</button>`}
      </section>

      <section class="pe-sec">
        <div class="pe-head"><h3>Actividades – Etapas del proyecto</h3></div>
        ${guide(PROPOSAL_GUIDE.activities)}
        <div class="pe-rows">
          ${(p.activities || []).map((a, i) => `
          <div class="pe-row pe-act">
            <span class="pe-n">${i + 1}</span>
            <div class="pe-act-grid">
              <div class="field"><label>Objetivo(s)</label>${inp(`activities.${i}.oe`, a.oe, { placeholder: 'OE1', ro })}</div>
              <div class="field span-act"><label>Actividad o etapa</label>${ta(`activities.${i}.act`, a.act, { rows: 2, ro })}</div>
              <div class="field span-act"><label>Entregable(s) asociado(s)</label>${ta(`activities.${i}.ent`, a.ent, { rows: 2, ro })}</div>
              <div class="field"><label>Inicio</label>${inp(`activities.${i}.ini`, a.ini, { type: 'date', ro })}</div>
              <div class="field"><label>Fin</label>${inp(`activities.${i}.fin`, a.fin, { type: 'date', ro })}</div>
            </div>
            ${ro ? '' : `<div class="pe-row-tools">${iconBtn('up', 'arrowUp', 'Subir', `data-list="activities" data-i="${i}"`)}${iconBtn('down', 'arrowDown', 'Bajar', `data-list="activities" data-i="${i}"`)}${iconBtn('del', 'trash', 'Quitar actividad', `data-list="activities" data-i="${i}"`)}</div>`}
          </div>`).join('')}
        </div>
        ${ro ? '' : `<button type="button" class="btn btn-sm" data-act="add" data-list="activities">${icon('plus')}Agregar actividad</button>`}
      </section>
    </div>`;
    growAll(root);
  }
  const blank = { needs: () => ({ a: '', b: '', c: '' }), specific: () => '', phases: () => ({ title: '', oes: '', text: '' }), activities: () => ({ oe: '', act: '', ent: '', ini: '', fin: '' }) };
  bindInputs(root, getDraft, (path) => onChange(path));
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'go-company') { goCompany?.(); return; }
    if (ro) return;
    const p = getDraft(), list = b.dataset.list, i = +b.dataset.i;
    if (!list || !blank[list]) return;
    p[list] = p[list] || [];
    if (b.dataset.act === 'add') p[list].push(blank[list]());
    if (b.dataset.act === 'del') { p[list].splice(i, 1); if (!p[list].length) p[list].push(blank[list]()); }
    if (b.dataset.act === 'up' && i > 0) [p[list][i - 1], p[list][i]] = [p[list][i], p[list][i - 1]];
    if (b.dataset.act === 'down' && i < p[list].length - 1) [p[list][i + 1], p[list][i]] = [p[list][i], p[list][i + 1]];
    onChange(list, true);
    render();
  });
  render();
  return { render, setReadonly(v) { if (v !== ro) { ro = v; render(); } } };
}

// =====================================================================
//  INFORME FINAL (estructura flexible)
// =====================================================================
const FRONT_SECTIONS = [['cover', 'Portada', 'image'], ['front', 'Preliminares', 'fileText']];

// Comprime una imagen en el navegador (máx. 1600 px, ~900 KB)
export async function compressImage(file) {
  if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) throw new Error('Use una imagen PNG o JPG.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No se pudo leer la imagen.')); i.src = url; });
    let w = img.naturalWidth, h = img.naturalHeight;
    const k = Math.min(1, 1600 / w); w = Math.round(w * k); h = Math.round(h * k);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    // PNG para diagramas pequeños (texto nítido); JPEG para fotografías o capturas grandes
    let dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length > 650000) {
      let q = 0.86;
      dataUrl = canvas.toDataURL('image/jpeg', q);
      while (dataUrl.length > 880000 && q > 0.45) { q -= 0.08; dataUrl = canvas.toDataURL('image/jpeg', q); }
      let scale = 1;
      while (dataUrl.length > 880000 && scale > 0.4) {
        scale -= 0.15; canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
        g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height); g.drawImage(img, 0, 0, canvas.width, canvas.height);
        dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      }
      w = canvas.width; h = canvas.height;
    }
    return { dataUrl, w, h, name: file.name, size: Math.round(dataUrl.length * 0.75) };
  } finally { URL.revokeObjectURL(url); }
}

export function finalEditor(root, { getDraft, practice, readonly, onChange, uploadImage, filesById }) {
  let ro = readonly;
  let sel = 'cover';

  const sections = () => {
    const f = getDraft(), N = numberFinal(f, { prune: false });
    return [...FRONT_SECTIONS.map(([k, l, ic]) => ({ k, label: l, ic })),
      ...N.chapters.map((c, i) => ({ k: `ch:${f.chapters[i].id}`, label: `${c.num ? `${c.num}. ` : ''}${c.title || 'Sin título'}`, ic: 'book', ch: true })),
      { k: 'refs', label: 'Referencias', ic: 'list' }, { k: 'annex', label: 'Anexos', ic: 'layers' }];
  };

  function render() {
    const f = getDraft();
    const list = sections();
    if (!list.some((s) => s.k === sel)) sel = 'cover';
    const words = finalWords(f);
    root.innerHTML = `
    <div class="fe">
      <aside class="fe-nav">
        <div class="fe-nav-head"><b>Estructura</b><span class="muted" title="Palabras del cuerpo del informe">${words.toLocaleString('es-CO')} palabras</span></div>
        <select class="input fe-nav-select" data-nav-select aria-label="Sección">${list.map((s) => `<option value="${s.k}" ${s.k === sel ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
        <nav class="fe-nav-list">${list.map((s) => `<button type="button" class="${s.k === sel ? 'active' : ''} ${s.ch ? 'is-ch' : ''}" data-sel="${s.k}">${icon(s.ic)}<span>${esc(s.label)}</span></button>`).join('')}</nav>
        ${ro ? '' : `<button type="button" class="btn btn-sm fe-add-ch" data-act="add-ch">${icon('plus')}Agregar capítulo</button>`}
        <details class="pe-guide"><summary>${icon('info')}Normas de presentación</summary><p>${esc(GUIDES.norms)}</p></details>
      </aside>
      <div class="fe-main" data-main>${mainHTML(f)}</div>
    </div>`;
    growAll(root);
  }

  function mainHTML(f) {
    if (sel === 'cover') {
      const c = f.cover || {}, pr = practice();
      return `<div class="fe-sec">
        <h3 class="fe-title">${icon('image')}Portada</h3>
        <p class="muted pe-note">El nombre, el código y el programa se toman de la plataforma. El logo de la facultad se agrega automáticamente.</p>
        <div class="field"><label>Título del informe</label>${ta('cover.title', c.title, { rows: 2, placeholder: 'Sistema web para… en… (máx. 20 palabras, sin siglas)', ro })}</div>
        <div class="form-grid">
          <div class="field"><label>Asesor(a) académico(a)</label>${inp('cover.academicAdvisor', c.academicAdvisor, { placeholder: 'Nombre completo, título académico', ro })}</div>
          <div class="field"><label>Asesor(a) empresarial</label>${inp('cover.companyAdvisor', c.companyAdvisor, { placeholder: 'Nombre completo, cargo en la organización', ro })}</div>
          <div class="field"><label>Ciudad</label>${inp('cover.city', c.city, { ro })}</div>
          <div class="field"><label>Año</label>${inp('cover.year', c.year, { ro })}</div>
        </div>
        <div class="kv pe-kv"><div><small>Estudiante</small><b>${esc(pr.studentName)}</b></div><div><small>Código</small><b class="mono">${esc(pr.studentCode)}</b></div><div><small>Documento</small><b class="mono">${esc(pr.studentDoc || '')}</b></div></div>
      </div>`;
    }
    if (sel === 'front') {
      const fr = f.front || {}, d = fr.declaration || {};
      const wc = (s) => (String(s || '').trim().match(/\S+/g) || []).length;
      return `<div class="fe-sec">
        <h3 class="fe-title">${icon('fileText')}Preliminares</h3>
        <div class="fe-card"><h4>Dedicatoria <span class="hint">opcional</span></h4>${guide(GUIDES.dedication)}${ta('front.dedication', fr.dedication, { rows: 2, ro })}</div>
        <div class="fe-card"><h4>Agradecimientos <span class="hint">opcional</span></h4>${guide(GUIDES.thanks)}${ta('front.thanks', fr.thanks, { rows: 3, ro })}</div>
        <div class="fe-card"><h4>Declaración de autoría y uso de inteligencia artificial</h4>${guide(GUIDES.declaration)}
          <label class="check"><input type="checkbox" data-path="front.declaration.include" ${d.include !== false ? 'checked' : ''} ${ro ? 'disabled' : ''}><span>Incluir la declaración (recomendado)</span></label>
          <label class="check"><input type="checkbox" data-path="front.declaration.aiUsed" ${d.aiUsed ? 'checked' : ''} ${ro ? 'disabled' : ''}><span>Utilicé herramientas de inteligencia artificial generativa como apoyo</span></label>
          <div class="form-grid" style="margin-top:8px">
            <div class="field"><label>Herramienta y versión</label>${inp('front.declaration.aiTools', d.aiTools, { placeholder: 'p. ej. ChatGPT 5, Claude', ro })}</div>
            <div class="field"><label>Usada únicamente como apoyo para</label>${inp('front.declaration.aiUse', d.aiUse, { placeholder: 'revisión ortográfica / depuración de código', ro })}</div>
            <div class="field"><label>Fecha del acuerdo de confidencialidad <span class="hint">si aplica</span></label>${inp('front.declaration.confidentiality', d.confidentiality, { placeholder: '3 de agosto de 2026', ro })}</div>
          </div></div>
        <div class="fe-card"><h4>Resumen <span class="hint" data-wc="front.abstractEs">${wc(fr.abstractEs)} palabras · recomendado 250 a 300</span></h4>${guide(GUIDES.abstractEs)}${ta('front.abstractEs', fr.abstractEs, { rows: 6, ro })}
          <div class="field"><label>Palabras clave</label>${inp('front.keywordsEs', fr.keywordsEs, { placeholder: 'cuatro a seis, separadas por coma', ro })}</div></div>
        <div class="fe-card"><h4>Abstract <span class="hint" data-wc="front.abstractEn">${wc(fr.abstractEn)} words</span></h4>${guide(GUIDES.abstractEn)}${ta('front.abstractEn', fr.abstractEn, { rows: 6, ro })}
          <div class="field"><label>Keywords</label>${inp('front.keywordsEn', fr.keywordsEn, { ro })}</div></div>
        <div class="fe-card"><h4>Lista de siglas y acrónimos</h4>${guide(GUIDES.acronyms)}${pairs('front.acronyms', fr.acronyms, 'Sigla', 'Significado')}</div>
        <div class="fe-card"><h4>Glosario</h4>${guide(GUIDES.glossary)}${pairs('front.glossary', fr.glossary, 'Término', 'Definición')}</div>
        <p class="muted pe-note">${icon('info')} El contenido, la lista de tablas y la lista de figuras se generan automáticamente.</p>
      </div>`;
    }
    if (sel === 'refs') {
      const n = String(f.references || '').split('\n').filter((x) => x.trim()).length;
      return `<div class="fe-sec"><h3 class="fe-title">${icon('list')}Referencias <span class="hint">${n} referencia(s)</span></h3>
        ${guide(GUIDES.references, true)}
        ${ta('references', f.references, { rows: 12, cls: 'mono-soft', placeholder: 'Una referencia por línea (se ordenan alfabéticamente al exportar). Use *cursiva* para títulos.', ro })}</div>`;
    }
    if (sel === 'annex') {
      return `<div class="fe-sec"><h3 class="fe-title">${icon('layers')}Anexos <span class="hint">opcional</span></h3>
        ${guide(GUIDES.annexes)}
        ${(f.annexes || []).map((a, i) => `<div class="fe-card">
          <div class="fe-card-head"><b>Anexo ${String.fromCharCode(65 + i)}</b>${ro ? '' : iconBtn('del-annex', 'trash', 'Quitar anexo', `data-i="${i}"`)}</div>
          <div class="field"><label>Título</label>${inp(`annexes.${i}.title`, a.title, { ro })}</div>
          <div class="field"><label>Contenido o enlace</label>${ta(`annexes.${i}.text`, a.text, { rows: 3, placeholder: 'Descripción del anexo o enlace al documento (p. ej. Google Drive)', ro })}</div></div>`).join('')}
        ${ro ? '' : `<button type="button" class="btn btn-sm" data-act="add-annex">${icon('plus')}Agregar anexo</button>`}</div>`;
    }
    // Capítulo
    const ci = f.chapters.findIndex((c) => `ch:${c.id}` === sel);
    const ch = f.chapters[ci];
    if (!ch) return '';
    const N = numberFinal(f, { prune: false }).chapters[ci];
    return `<div class="fe-sec">
      <div class="fe-ch-head">
        <span class="fe-ch-num">${N.num ? `${N.num}.` : '—'}</span>
        ${inp(`chapters.${ci}.title`, ch.title, { cls: 'fe-ch-title', placeholder: 'TÍTULO DEL CAPÍTULO', ro })}
        ${ro ? '' : `<div class="fe-ch-tools">
          <label class="check" title="Los capítulos numerados reciben número (1., 2.…)"><input type="checkbox" data-path="chapters.${ci}.numbered" ${ch.numbered !== false ? 'checked' : ''}><span>Numerado</span></label>
          ${iconBtn('ch-up', 'arrowUp', 'Mover capítulo arriba', `data-i="${ci}"`)}${iconBtn('ch-down', 'arrowDown', 'Mover capítulo abajo', `data-i="${ci}"`)}${iconBtn('ch-del', 'trash', 'Eliminar capítulo', `data-i="${ci}"`)}
        </div>`}
      </div>
      ${guide(GUIDES[ch.guide] || GUIDES.custom)}
      <div class="fe-blocks">
        ${ch.blocks.map((b, bi) => blockHTML(b, N.blocks[bi], ci, bi)).join('') || `<p class="muted">Este capítulo está vacío.</p>`}
      </div>
      ${ro ? '' : addMenu(ci, ch.blocks.length)}
    </div>`;
  }

  const pairs = (path, rows = [], a, b) => `<div class="fe-pairs">
    ${(rows.length ? rows : [['', '']]).map((r, i) => `<div class="fe-pair">${inp(`${path}.${i}.0`, r[0], { placeholder: a, ro })}${inp(`${path}.${i}.1`, r[1], { placeholder: b, ro })}${ro ? '' : iconBtn('del-pair', 'x', 'Quitar', `data-path-list="${path}" data-i="${i}"`)}</div>`).join('')}
    ${ro ? '' : `<button type="button" class="btn btn-sm" data-act="add-pair" data-path-list="${path}">${icon('plus')}Agregar</button>`}</div>`;

  function addMenu(ci, at) {
    return `<div class="fe-add"><span>${icon('plus')}Agregar:</span>${Object.entries(BLOCK_TYPES).map(([t, d]) => `<button type="button" class="btn btn-sm" data-act="add-block" data-type="${t}" data-ci="${ci}" data-at="${at}">${icon(d.icon)}${esc(d.label.replace(' (nivel 2)', '').replace(' (nivel 3)', ' 3'))}</button>`).join('')}</div>`;
  }

  function blockHTML(b, nb, ci, bi) {
    const base = `chapters.${ci}.blocks.${bi}`;
    const tools = ro ? '' : `<div class="fe-b-tools">${iconBtn('b-up', 'arrowUp', 'Subir', `data-ci="${ci}" data-bi="${bi}"`)}${iconBtn('b-down', 'arrowDown', 'Bajar', `data-ci="${ci}" data-bi="${bi}"`)}${iconBtn('b-del', 'trash', 'Eliminar bloque', `data-ci="${ci}" data-bi="${bi}"`)}</div>`;
    const label = (t) => `<span class="fe-b-label">${icon(BLOCK_TYPES[b.t].icon)}${t}</span>`;
    let body = '';
    if (b.t === 'p') body = ta(`${base}.text`, b.text, { rows: 3, placeholder: 'Escriba el párrafo. Una línea por párrafo; **negrita** y *cursiva*.', ro });
    else if (b.t === 'h2' || b.t === 'h3') body = `<div class="fe-h ${b.t}"><span class="fe-h-num">${nb.num}</span>${inp(`${base}.text`, b.text, { placeholder: 'Título de la sección', ro })}</div>`;
    else if (b.t === 'formula') body = inp(`${base}.text`, b.text, { placeholder: 'Indicador (%) = (A ÷ B) × 100', ro });
    else if (b.t === 'ul' || b.t === 'ol') {
      body = `<div class="fe-items">${b.items.map((it, ii) => `<div class="fe-item"><span class="fe-bullet">${b.t === 'ul' ? '▪' : b.style === 'oe' ? `OE${ii + 1}.` : `${ii + 1}.`}</span>${ta(`${base}.items.${ii}`, it, { rows: 1, ro })}${ro ? '' : iconBtn('item-del', 'x', 'Quitar', `data-ci="${ci}" data-bi="${bi}" data-ii="${ii}"`)}</div>`).join('')}
        ${ro ? '' : `<button type="button" class="btn btn-sm" data-act="item-add" data-ci="${ci}" data-bi="${bi}">${icon('plus')}Elemento</button>`}</div>`;
    } else if (b.t === 'table') {
      body = `<div class="field"><label>Título de la tabla <b class="fe-cap-n">Tabla ${nb.num}.</b></label>${inp(`${base}.caption`, b.caption, { placeholder: 'Título descriptivo', ro })}</div>
        <div class="fe-table-wrap"><table class="fe-table" style="min-width:${Math.max(480, b.cols.length * 170)}px"><thead><tr>${b.cols.map((c, k) => `<th>${inp(`${base}.cols.${k}`, c, { ro })}${ro || b.cols.length < 2 ? '' : `<button type="button" class="fe-x" data-act="col-del" data-ci="${ci}" data-bi="${bi}" data-k="${k}" title="Quitar columna" aria-label="Quitar columna">${icon('x')}</button>`}</th>`).join('')}${ro ? '' : '<th class="fe-tcol"></th>'}</tr></thead>
        <tbody>${b.rows.map((r, ri) => `<tr>${b.cols.map((_, k) => `<td>${ta(`${base}.rows.${ri}.${k}`, r[k] ?? '', { rows: 1, ro })}</td>`).join('')}${ro ? '' : `<td class="fe-tcol"><button type="button" class="fe-x" data-act="row-del" data-ci="${ci}" data-bi="${bi}" data-ri="${ri}" title="Quitar fila" aria-label="Quitar fila">${icon('x')}</button></td>`}</tr>`).join('')}</tbody></table></div>
        ${ro ? '' : `<div class="fe-t-actions"><button type="button" class="btn btn-sm" data-act="row-add" data-ci="${ci}" data-bi="${bi}">${icon('plus')}Fila</button><button type="button" class="btn btn-sm" data-act="col-add" data-ci="${ci}" data-bi="${bi}">${icon('plus')}Columna</button></div>`}
        <div class="field"><label>Nota de fuente</label>${inp(`${base}.note`, b.note, { placeholder: 'Elaboración propia.', ro })}</div>`;
    } else if (b.t === 'figure') {
      const file = filesById().get(b.fileId);
      body = `<div class="field"><label>Título de la figura <b class="fe-cap-n">Figura ${nb.num}.</b></label>${inp(`${base}.caption`, b.caption, { placeholder: 'Título descriptivo', ro })}</div>
        <div class="fe-fig">${file ? `<img src="${file.dataUrl}" alt="${esc(b.caption || file.name)}"><small>${esc(file.name || '')} · ${Math.round((file.size || 0) / 1024)} KB</small>` : `<div class="fe-fig-empty">${icon('image')}<span>Sin imagen</span></div>`}
          ${ro ? '' : `<label class="btn btn-sm">${icon('upload')}${file ? 'Reemplazar imagen' : 'Cargar imagen'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden data-upload data-ci="${ci}" data-bi="${bi}"></label>`}</div>
        <div class="field"><label>Nota de fuente</label>${inp(`${base}.note`, b.note, { placeholder: 'Elaboración propia. / Adaptado de…', ro })}</div>`;
    } else if (b.t === 'code') {
      body = `<div class="field"><label>Título <b class="fe-cap-n">Figura ${nb.num}.</b></label>${inp(`${base}.caption`, b.caption, { ro })}</div>
        ${ta(`${base}.text`, b.text, { rows: 6, cls: 'mono', placeholder: '// Fragmento significativo (sin credenciales ni datos reales)', ro })}
        <div class="field"><label>Nota de fuente</label>${inp(`${base}.note`, b.note, { ro })}</div>`;
    }
    return `<div class="fe-block fe-${b.t}" data-block="${b.id}"><div class="fe-b-head">${label(BLOCK_TYPES[b.t].label)}${tools}</div>${body}</div>`;
  }

  // ---------- Eventos ----------
  bindInputs(root, getDraft, (path, structural) => {
    onChange(path);
    // Contadores y títulos del índice lateral en vivo
    const wc = root.querySelector(`[data-wc="${path}"]`);
    if (wc) { const n = (String(getPath(getDraft(), path) || '').trim().match(/\S+/g) || []).length; wc.textContent = path.endsWith('En') ? `${n} words` : `${n} palabras · recomendado 250 a 300`; }
    if (/^chapters\.\d+\.(title|numbered)$/.test(path)) {
      const f = getDraft(), N = numberFinal(f, { prune: false });
      root.querySelectorAll('[data-sel^="ch:"]').forEach((btn) => {
        const i = f.chapters.findIndex((c) => `ch:${c.id}` === btn.dataset.sel);
        if (i >= 0) btn.querySelector('span').textContent = `${N.chapters[i].num ? `${N.chapters[i].num}. ` : ''}${f.chapters[i].title || 'Sin título'}`;
      });
      if (structural) render();
    }
  });
  root.addEventListener('change', async (e) => {
    const up = e.target.closest('[data-upload]'); if (!up || !up.files[0]) return;
    const f = getDraft(), b = f.chapters[+up.dataset.ci].blocks[+up.dataset.bi];
    const lbl = up.closest('label');
    lbl.classList.add('is-loading');
    try {
      const id = await uploadImage(up.files[0], b.fileId);
      b.fileId = id;
      onChange('figure', true);
      render();
    } catch (er) { ui.toast('No se pudo cargar la imagen', 'error', er.message); lbl.classList.remove('is-loading'); }
  });
  root.addEventListener('change', (e) => { if (e.target.matches('[data-nav-select]')) { sel = e.target.value; render(); } });
  root.addEventListener('click', async (e) => {
    const s = e.target.closest('[data-sel]');
    if (s) { sel = s.dataset.sel; render(); root.querySelector('[data-main]').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const b = e.target.closest('[data-act]'); if (!b || ro) return;
    const f = getDraft(), act = b.dataset.act;
    const ci = +b.dataset.ci, bi = +b.dataset.bi;
    const blocks = Number.isInteger(ci) && f.chapters[ci] ? f.chapters[ci].blocks : null;
    const swap = (arr, i, j) => { if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
    switch (act) {
      case 'add-ch': { const c = newChapter(); const refsIdx = f.chapters.length; f.chapters.splice(refsIdx, 0, c); sel = `ch:${c.id}`; break; }
      case 'ch-up': swap(f.chapters, +b.dataset.i, +b.dataset.i - 1); break;
      case 'ch-down': swap(f.chapters, +b.dataset.i, +b.dataset.i + 1); break;
      case 'ch-del': {
        const c = f.chapters[+b.dataset.i];
        const ok = await ui.confirmDialog({ title: 'Eliminar capítulo', danger: true, confirm: 'Eliminar', iconName: 'trash', message: `Se eliminará el capítulo <b>${esc(c.title)}</b> con todo su contenido.` });
        if (!ok) return;
        f.chapters.splice(+b.dataset.i, 1); sel = 'cover'; break;
      }
      case 'add-block': blocks.splice(+b.dataset.at, 0, newBlock(b.dataset.type)); break;
      case 'b-up': swap(blocks, bi, bi - 1); break;
      case 'b-down': swap(blocks, bi, bi + 1); break;
      case 'b-del': {
        const blk = blocks[bi];
        const has = blk.text || (blk.items || []).some(Boolean) || (blk.rows || []).some((r) => r.some(Boolean)) || blk.fileId;
        if (has && !(await ui.confirmDialog({ title: 'Eliminar bloque', danger: true, confirm: 'Eliminar', iconName: 'trash', message: 'Se eliminará este bloque y su contenido.' }))) return;
        blocks.splice(bi, 1); break;
      }
      case 'item-add': blocks[bi].items.push(''); break;
      case 'item-del': blocks[bi].items.splice(+b.dataset.ii, 1); if (!blocks[bi].items.length) blocks[bi].items.push(''); break;
      case 'row-add': blocks[bi].rows.push(blocks[bi].cols.map(() => '')); break;
      case 'row-del': blocks[bi].rows.splice(+b.dataset.ri, 1); break;
      case 'col-add': blocks[bi].cols.push(`Columna ${blocks[bi].cols.length + 1}`); blocks[bi].rows.forEach((r) => r.push('')); break;
      case 'col-del': blocks[bi].cols.splice(+b.dataset.k, 1); blocks[bi].rows.forEach((r) => r.splice(+b.dataset.k, 1)); break;
      case 'add-annex': f.annexes = f.annexes || []; f.annexes.push({ id: Math.random().toString(36).slice(2), title: '', text: '' }); break;
      case 'del-annex': f.annexes.splice(+b.dataset.i, 1); break;
      case 'add-pair': { const arr = getPath(f, b.dataset.pathList) || []; arr.push(['', '']); setPath(f, b.dataset.pathList, arr); break; }
      case 'del-pair': { const arr = getPath(f, b.dataset.pathList) || []; arr.splice(+b.dataset.i, 1); setPath(f, b.dataset.pathList, arr); break; }
      default: return;
    }
    onChange(act, true);
    render();
  });

  render();
  return {
    render,
    setReadonly(v) { if (v !== ro) { ro = v; render(); } },
    refreshFiles() { if (root.querySelector('.fe-figure') && !root.contains(document.activeElement)) render(); }
  };
}

export const fmtLongDate = longDate;
