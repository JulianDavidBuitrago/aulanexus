// Componentes de interfaz reutilizables: toasts, modales, tema, animaciones
import { icon } from './icons.js';
import { esc } from './util.js';

// ---------- Tema claro / oscuro ----------
export function initTheme() {
  let t = null;
  try { t = localStorage.getItem('an-theme'); } catch { /* */ }
  if (!t) t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  applyTheme(t);
}
export function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'dark' ? '#050814' : '#eef2fa';
}
export function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('an-theme', next); } catch { /* */ }
}
export const themeButton = () =>
  `<button class="btn btn-ghost btn-icon theme-btn" data-theme-toggle title="Cambiar tema" aria-label="Cambiar tema claro u oscuro">${icon('moon', 'ic-moon')}${icon('sun', 'ic-sun')}</button>`;
document.addEventListener('click', (e) => { if (e.target.closest('[data-theme-toggle]')) toggleTheme(); });

// ---------- Toasts ----------
const TOAST_IC = { success: 'check', error: 'alert', warn: 'alert', info: 'bell' };
export function toast(title, type = 'info', message = '', ms = 4200) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.style.setProperty('--t', ms + 'ms');
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<div class="t-ic">${icon(TOAST_IC[type] || 'info')}</div><div><b>${esc(title)}</b>${message ? `<p>${esc(message)}</p>` : ''}</div>`;
  box.appendChild(el);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  el.addEventListener('click', close);
  setTimeout(close, ms);
}

// ---------- Modales ----------
export function modal({ title, subtitle = '', iconName = 'sparkles', body = '', footer = '', size = '', onMount, dismissible = true }) {
  const host = document.getElementById('modals');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <div class="mh-ic">${icon(iconName)}</div>
        <div class="mh-text"><h3>${esc(title)}</h3>${subtitle ? `<p>${subtitle}</p>` : ''}</div>
        <button class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  host.appendChild(wrap);
  document.body.style.overflow = 'hidden';
  const prevFocus = document.activeElement;
  let closed = false;
  const api = {
    el: wrap.querySelector('.modal'),
    close() {
      if (closed) return; closed = true;
      wrap.classList.add('closing');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => {
        wrap.remove();
        if (!host.children.length) document.body.style.overflow = '';
        prevFocus?.focus?.();
      }, 200);
    }
  };
  const onKey = (e) => { if (e.key === 'Escape' && dismissible) api.close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && dismissible) api.close(); });
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) api.close(); });
  onMount?.(api.el, api);
  setTimeout(() => api.el.querySelector('input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea, select')?.focus(), 80);
  return api;
}

export function confirmDialog({ title, message, confirm = 'Confirmar', danger = false, iconName = 'alert' }) {
  return new Promise((resolve) => {
    let answered = false;
    const m = modal({
      title, iconName,
      body: `<p style="color:var(--text-2)">${message}</p>`,
      footer: `<button class="btn" data-close>Cancelar</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(confirm)}</button>`,
      onMount(el) {
        el.querySelector('[data-ok]').addEventListener('click', () => { answered = true; resolve(true); m.close(); });
      }
    });
    const orig = m.close;
    m.close = () => { if (!answered) resolve(false); orig(); };
    m.el.parentElement.addEventListener('click', (e) => { if (e.target.closest('[data-close]') && !answered) resolve(false); });
  });
}

// ---------- Botón con estado de carga ----------
export async function withLoading(btn, fn) {
  if (!btn) return fn();
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>${btn.dataset.loading ? esc(btn.dataset.loading) : ''}`;
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = html; }
}

// ---------- Migas / título ----------
export function setCrumb(title, sub = '') {
  const el = document.getElementById('crumb');
  if (el) el.innerHTML = `<small>${esc(sub)}</small><h1>${esc(title)}</h1>`;
  document.title = `${title} · AulaNexus`;
}

// ---------- Contador animado ----------
export function countTo(el, to, decimals = 0) {
  const from = parseFloat(el.dataset.v || '0') || 0;
  el.dataset.v = to;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || from === to) { el.textContent = to.toFixed(decimals); return; }
  const t0 = performance.now(), dur = 900;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = (from + (to - from) * e).toFixed(decimals);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Tarjetas de estadísticas que se actualizan sin reconstruirse
export function stats(container, items) {
  if (container.children.length !== items.length) {
    container.innerHTML = items.map((s) => `
      <div class="stat" style="--sc:${s.color}">
        <div class="st-ic">${icon(s.icon)}</div>
        <div class="st-val" data-k="${s.key}">0</div>
        <div class="st-label">${esc(s.label)}</div>
      </div>`).join('');
  }
  items.forEach((s) => {
    const el = container.querySelector(`[data-k="${s.key}"]`);
    if (s.value === null || s.value === undefined) { el.textContent = '—'; el.dataset.v = ''; return; }
    if (el.dataset.v !== String(s.value)) countTo(el, s.value, s.decimals || 0);
  });
}

// ---------- Validación de campos ----------
export function fieldError(input, msg) {
  const f = input.closest('.field');
  if (!f) return;
  f.classList.toggle('invalid', !!msg);
  let e = f.querySelector('.error');
  if (!e) { e = document.createElement('div'); e.className = 'error'; f.appendChild(e); }
  e.textContent = msg || '';
}
export function clearErrors(root) { root.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid')); }

// Clave de color HSL estable para avatares
export function hueOf(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}
