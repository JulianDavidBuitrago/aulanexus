// Utilidades generales
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const initials = (name) =>
  (name || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export const firstName = (name) => (name || '').trim().split(/\s+/)[0] || '';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function fmtDate(ms, withTime = true) {
  if (!ms) return '—';
  const d = new Date(ms);
  const base = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (!withTime) return base;
  const h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
  const h12 = ((h + 11) % 12) + 1;
  return `${base} · ${h12}:${m} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

export function timeAgo(ms) {
  if (!ms) return '';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return 'hace un momento';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  return fmtDate(ms, false);
}

export function timeLeft(ms) {
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3.6e6), d = Math.floor(h / 24);
  const txt = d >= 1 ? `${d} ${d === 1 ? 'día' : 'días'}` : h >= 1 ? `${h} h` : `${Math.max(1, Math.floor(abs / 6e4))} min`;
  return diff >= 0 ? `Vence en ${txt}` : `Venció hace ${txt}`;
}

export const fmtGrade = (g) => (g === null || g === undefined || g === '' || isNaN(g) ? '—' : Number(g).toFixed(1));
export const gradeTone = (g) => (g == null ? 'none' : g >= 4 ? 'high' : g >= 3 ? 'mid' : 'low');
export const avg = (arr) => {
  const v = arr.filter((x) => typeof x === 'number' && !isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function langOf(name = '') {
  const ext = name.split('.').pop().toLowerCase();
  return { java: 'java', py: 'python', js: 'javascript', ts: 'typescript', sql: 'sql', html: 'xml', xml: 'xml', css: 'css', json: 'json', md: 'markdown', c: 'c', cpp: 'cpp', cs: 'csharp', csv: 'plaintext', txt: 'plaintext' }[ext] || 'plaintext';
}
export const extOf = (name = '') => '.' + name.split('.').pop().toLowerCase();

export function fmtBytes(n = 0) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const DOC_TYPES = [
  ['CC', 'Cédula de ciudadanía'],
  ['TI', 'Tarjeta de identidad'],
  ['CE', 'Cédula de extranjería'],
  ['PA', 'Pasaporte'],
  ['PPT', 'Permiso por Protección Temporal']
];
export const docLabel = (t) => (DOC_TYPES.find((d) => d[0] === t) || [t, t])[1];

export const CLASS_COLORS = ['cyan', 'violet', 'pink', 'emerald', 'amber', 'blue'];

export function linkify(text = '') {
  const safe = esc(text);
  return safe
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g, '<br>');
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s).trim());

export const codeKey = (code) => 'code_' + String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
export const docKey = (type, num) => `doc_${type}_${String(num).toUpperCase().replace(/[^A-Z0-9]/g, '')}`;

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function download(name, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Mensajes de error en español para Firebase y el modo demostración
export function errMsg(e) {
  const code = e?.code || e?.message || '';
  const map = {
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/wrong-password': 'La contraseña actual no es correcta.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/invalid-email': 'El correo electrónico no es válido.',
    'auth/email-already-in-use': 'Ya existe una cuenta registrada con ese correo.',
    'auth/weak-password': 'La contraseña es demasiado débil.',
    'auth/too-many-requests': 'Demasiados intentos. Espere unos minutos e intente de nuevo.',
    'auth/network-request-failed': 'Sin conexión. Verifique su red e intente de nuevo.',
    'auth/requires-recent-login': 'Por seguridad, cierre sesión e ingrese nuevamente antes de este cambio.',
    'auth/operation-not-allowed': 'El método de acceso por correo no está habilitado en Firebase.',
    'app/duplicate': 'El código de estudiante o el documento ya se encuentran registrados.',
    'app/teacher-email': 'Este correo corresponde a la cuenta docente y no puede registrarse como estudiante.',
    'permission-denied': 'No tiene permisos para realizar esta acción.',
    'unavailable': 'El servicio no está disponible temporalmente. Intente de nuevo.'
  };
  for (const k of Object.keys(map)) if (code.includes(k)) return map[k];
  return 'Ocurrió un error inesperado. Intente de nuevo.';
}

// ---------- Videos de YouTube ----------
// Devuelve el ID de 11 caracteres de cualquier URL de YouTube (watch, youtu.be, shorts, embed, live) o null.
export function youtubeId(url = '') {
  const m = String(url).match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  return m ? m[1] : null;
}
// Si el docente pega el código <iframe> que da YouTube, extrae la URL del atributo src.
export function extractUrl(line = '') {
  const t = String(line).trim();
  const m = t.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  return m ? m[1] : t;
}
