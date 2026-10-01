// =====================================================================
//  Buscador de estudiantes registrados (cédula, nombre, código o correo)
//  Reutilizado en Inscripciones y en el registro de prácticas.
// =====================================================================
import { S, classById } from './state.js';
import { icon } from './icons.js';
import { esc, norm, fmtPhone } from './util.js';
import { avatar, colorVar } from './components.js';

const MAX = 25;

export function studentSearchHTML(id, { placeholder = 'Buscar por número de cédula, nombre, código o correo' } = {}) {
  return `
  <div class="st-search" data-ss="${id}">
    <div class="input-wrap ss-input">${icon('search')}<input class="input" type="search" data-ss-q placeholder="${esc(placeholder)}" autocomplete="off" aria-label="${esc(placeholder)}"></div>
    <div class="ss-meta muted" data-ss-meta></div>
    <div class="ss-results" data-ss-results role="list"></div>
  </div>`;
}

// Coincidencia: todas las palabras deben aparecer (sin tildes ni mayúsculas); los dígitos se comparan sin puntos
function matches(s, terms) {
  const hay = norm(`${s.fullName} ${s.studentCode} ${s.docNumber} ${s.email} ${s.phone || ''}`);
  const digits = String(s.docNumber || '') + ' ' + String(s.studentCode || '');
  return terms.every((t) => hay.includes(t) || (/^\d+$/.test(t) && digits.includes(t)));
}

/**
 * @param root      contenedor
 * @param id        identificador del buscador
 * @param action(s) devuelve { label, icon, disabled, cls, hint } para el botón de cada resultado
 * @param onPick(s) acción al pulsar el botón
 * @param exclude(s) true para ocultar un estudiante
 */
export function bindStudentSearch(root, id, { action, onPick, exclude = () => false, showClasses = true } = {}) {
  const box = root.querySelector(`[data-ss="${id}"]`);
  const q = box.querySelector('[data-ss-q]');
  const out = box.querySelector('[data-ss-results]');
  const meta = box.querySelector('[data-ss-meta]');

  function paint() {
    const raw = q.value.trim();
    const terms = norm(raw.replace(/[.\s]+(?=\d)/g, '')).split(/\s+/).filter(Boolean);
    const pool = S.students.filter((s) => !exclude(s));
    if (!terms.length) {
      out.innerHTML = '';
      meta.textContent = `${pool.length} estudiantes registrados en la plataforma. Escriba para filtrar.`;
      return;
    }
    const found = pool.filter((s) => matches(s, terms)).sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
    meta.textContent = found.length ? `${found.length} ${found.length === 1 ? 'coincidencia' : 'coincidencias'}${found.length > MAX ? ` · se muestran las primeras ${MAX}` : ''}` : '';
    out.innerHTML = found.length ? found.slice(0, MAX).map((s) => {
      const a = action ? action(s) : { label: 'Seleccionar', icon: 'check' };
      const classes = (s.classIds || []).map(classById).filter(Boolean);
      return `<div class="ss-row" role="listitem">
        ${avatar(s.fullName, '', s.uid)}
        <div class="ss-body">
          <b>${esc(s.fullName)}</b>
          <small><span class="mono">${esc(s.docType)} ${esc(s.docNumber)}</span> · <span class="mono">${esc(s.studentCode)}</span> · ${esc(s.email)}${s.phone ? ` · ${icon('phone')}${esc(fmtPhone(s.phone))}` : ''}</small>
          ${showClasses && classes.length ? `<div class="ss-chips">${classes.map((c) => `<span class="chip chip-c" style="--c:${colorVar(c.color)}">${esc(c.name)}</span>`).join('')}</div>` : ''}
          ${a.hint ? `<small class="ss-hint">${a.hint}</small>` : ''}
        </div>
        <button type="button" class="btn btn-sm ${a.cls || 'btn-primary'}" data-ss-pick="${esc(s.uid)}" ${a.disabled ? 'disabled' : ''}>${icon(a.icon || 'check')}${esc(a.label)}</button>
      </div>`;
    }).join('') : `<div class="ss-empty">${icon('search')}<div><b>Sin resultados para "${esc(raw)}"</b><small>Verifique el número de documento o el nombre. Si el estudiante no está registrado, créelo con el formulario.</small></div></div>`;
  }
  q.addEventListener('input', paint);
  out.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ss-pick]'); if (!b || b.disabled) return;
    const s = S.students.find((x) => x.uid === b.dataset.ssPick);
    if (s) onPick?.(s, b);
  });
  paint();
  return { refresh: paint, focus: () => q.focus(), clear: () => { q.value = ''; paint(); } };
}
