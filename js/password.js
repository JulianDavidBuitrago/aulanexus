// Asistente de contraseña segura: medidor, verificación de reglas y generador criptográfico
import { icon } from './icons.js';
import { toast } from './ui.js';
import { esc, norm } from './util.js';

const COMMON = ['password', 'contrasena', 'contraseña', '123456', 'qwerty', 'abc123', 'admin', 'ucaldas', 'caldas', 'manizales', 'colombia', 'iloveyou', 'welcome', 'letmein', 'estudiante', 'universidad', '111111', '000000'];
export const MIN_LEN = 10;

export function analyze(pw = '', context = []) {
  const checks = {
    len: pw.length >= MIN_LEN,
    lower: /[a-zà-ÿ]/.test(pw),
    upper: /[A-ZÀ-Ý]/.test(pw),
    digit: /\d/.test(pw),
    symbol: /[^A-Za-z0-9À-ÿ\s]/.test(pw),
    personal: true
  };
  const low = norm(pw);
  const personal = context.flatMap((c) => norm(c).split(/[\s@._-]+/)).filter((t) => t.length >= 4);
  if (personal.some((t) => low.includes(t))) checks.personal = false;

  let pool = 0;
  if (checks.lower) pool += 26;
  if (checks.upper) pool += 26;
  if (checks.digit) pool += 10;
  if (checks.symbol) pool += 33;
  let entropy = pw.length * Math.log2(Math.max(pool, 1));

  // Penalizaciones por patrones predecibles
  if (/(.)\1{2,}/.test(pw)) entropy *= 0.75;
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|qwer|asdf|zxcv)/i.test(pw)) entropy *= 0.7;
  if (COMMON.some((w) => low.includes(w))) entropy *= 0.5;
  if (!checks.personal) entropy *= 0.6;

  let score = entropy < 28 ? 0 : entropy < 40 ? 1 : entropy < 60 ? 2 : entropy < 80 ? 3 : 4;
  if (!pw) score = 0;
  if (pw.length < 8) score = Math.min(score, 1);
  const cats = [checks.lower, checks.upper, checks.digit, checks.symbol].filter(Boolean).length;
  if (cats < 3) score = Math.min(score, 2);
  if (!checks.personal) score = Math.min(score, 2);
  if (pw && score === 0) score = 1;

  const labels = ['—', 'Muy débil', 'Débil', 'Fuerte', 'Muy fuerte'];
  const colors = ['var(--muted)', 'var(--danger)', 'var(--warning)', 'var(--primary)', 'var(--success)'];
  if (score === 1 && entropy >= 28) labels[1] = 'Débil';
  const valid = checks.len && checks.lower && checks.upper && checks.digit && checks.symbol && checks.personal && score >= 3;
  return { score, label: pw ? labels[score] : 'Sin evaluar', color: colors[pw ? score : 0], checks, entropy, valid, crack: crackTime(entropy) };
}

function crackTime(bits) {
  if (!bits) return '';
  // Supuesto: 10 000 millones de intentos por segundo (ataque fuera de línea con GPU)
  const secs = Math.pow(2, bits) / 1e10 / 2;
  const units = [['siglos', 3.15e9], ['años', 3.15e7], ['días', 86400], ['horas', 3600], ['minutos', 60], ['segundos', 1]];
  if (secs < 1) return 'Se descifra al instante';
  for (const [name, s] of units) {
    if (secs >= s) {
      const v = secs / s;
      if (name === 'siglos' && v > 1e6) return 'Descifrado: millones de siglos';
      return `Descifrado: ~${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('es-CO')} ${name}`;
    }
  }
  return '';
}

export function generate(len = 16) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*?-_+=.'];
  const all = sets.join('');
  const rnd = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  const chars = sets.map((s) => s[rnd(s.length)]);
  while (chars.length < len) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

// Marcado de un campo de contraseña
export function passwordField({ id, label, placeholder = '••••••••••', autocomplete = 'new-password', meter = false, generator = false, hint = '' }) {
  return `
  <div class="field">
    <label for="${id}">${esc(label)}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</label>
    <div class="input-wrap has-actions">
      ${icon('lock')}
      <input class="input mono" type="password" id="${id}" name="${id}" placeholder="${placeholder}" autocomplete="${autocomplete}" spellcheck="false" autocapitalize="off">
      <div class="input-actions">
        ${generator ? `<button type="button" class="btn btn-ghost btn-icon" data-gen="${id}" title="Generar contraseña segura" aria-label="Generar contraseña segura">${icon('dice')}</button>` : ''}
        <button type="button" class="btn btn-ghost btn-icon" data-eye="${id}" title="Mostrar u ocultar" aria-label="Mostrar u ocultar contraseña">${icon('eye')}</button>
      </div>
    </div>
    ${meter ? `
    <div class="pw-meter" data-meter="${id}" data-score="0">
      <div class="pw-bars"><i></i><i></i><i></i><i></i></div>
      <div class="pw-meta"><span class="pw-label">Sin evaluar</span><span class="pw-crack"></span></div>
      <ul class="pw-checks">
        <li data-c="len">${icon('check')} Mínimo ${MIN_LEN} caracteres</li>
        <li data-c="upper">${icon('check')} Una letra mayúscula</li>
        <li data-c="lower">${icon('check')} Una letra minúscula</li>
        <li data-c="digit">${icon('check')} Un número</li>
        <li data-c="symbol">${icon('check')} Un símbolo (!@#$…)</li>
        <li data-c="personal">${icon('check')} Sin datos personales</li>
      </ul>
      <div class="pw-tip">${icon('sparkles')}<span>Use el dado para generar una contraseña aleatoria con criptografía del navegador, o una frase larga fácil de recordar (p. ej. <span class="mono">Café-Nevado-Ruiz-2026!</span>).</span></div>
    </div>` : ''}
    <div class="error"></div>
  </div>`;
}

// Enlaza el comportamiento: medidor en vivo, mostrar/ocultar, generador y copia
export function bindPassword(root, id, { confirmId, context = () => [] } = {}) {
  const input = root.querySelector('#' + id);
  const meter = root.querySelector(`[data-meter="${id}"]`);
  const update = () => {
    if (!meter) return;
    const r = analyze(input.value, context());
    meter.dataset.score = input.value ? r.score : 0;
    const lab = meter.querySelector('.pw-label');
    lab.textContent = r.label; lab.style.color = r.color;
    meter.querySelector('.pw-crack').textContent = input.value ? r.crack : '';
    Object.entries(r.checks).forEach(([k, ok]) => meter.querySelector(`[data-c="${k}"]`)?.classList.toggle('ok', ok && !!input.value));
  };
  input.addEventListener('input', update);

  root.querySelectorAll(`[data-eye="${id}"]`).forEach((b) => b.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.innerHTML = icon(show ? 'eyeOff' : 'eye');
  }));

  root.querySelectorAll(`[data-gen="${id}"]`).forEach((b) => b.addEventListener('click', async () => {
    const pw = generate(16);
    input.value = pw; input.type = 'text';
    root.querySelector(`[data-eye="${id}"]`).innerHTML = icon('eyeOff');
    if (confirmId) {
      const c = root.querySelector('#' + confirmId);
      if (c) { c.value = pw; c.type = 'text'; c.dispatchEvent(new Event('input')); }
    }
    input.dispatchEvent(new Event('input'));
    b.querySelector('.ic')?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 500, easing: 'ease-out' });
    try { await navigator.clipboard.writeText(pw); toast('Contraseña segura generada', 'success', 'Se copió al portapapeles. Guárdela en un gestor de contraseñas.'); }
    catch { toast('Contraseña segura generada', 'success', 'Anótela o guárdela en un gestor de contraseñas antes de continuar.'); }
  }));
  update();
  return { value: () => input.value, analyze: () => analyze(input.value, context()), input };
}
