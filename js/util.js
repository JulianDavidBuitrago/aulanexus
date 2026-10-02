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

// ---------- Celular ----------
// Normaliza: quita espacios, guiones, puntos y paréntesis; conserva el + inicial
export const normPhone = (s) => String(s || '').trim().replace(/[\s().-]/g, '');
// Colombia: 10 dígitos que inician en 3 (opcional +57); internacional: + y 8 a 15 dígitos
export const isPhone = (s) => { const p = normPhone(s); return /^(\+?57)?3\d{9}$/.test(p) || /^\+\d{8,15}$/.test(p); };
export function fmtPhone(s) {
  const p = normPhone(s); if (!p) return '';
  const m = p.match(/^(?:\+?57)?(3\d{2})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : p;
}
// Enlace de WhatsApp (asume Colombia cuando son 10 dígitos)
export function waLink(s) {
  const p = normPhone(s).replace(/^\+/, '');
  if (!p) return '';
  return `https://wa.me/${/^3\d{9}$/.test(p) ? '57' + p : p}`;
}

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
    'auth/too-many-requests': 'Firebase limitó temporalmente las solicitudes desde esta red. Espere unos minutos (o una hora si creó muchas cuentas) e intente de nuevo.',
    'auth/network-request-failed': 'Sin conexión. Verifique su red e intente de nuevo.',
    'auth/requires-recent-login': 'Por seguridad, cierre sesión e ingrese nuevamente antes de este cambio.',
    'auth/operation-not-allowed': 'El método de acceso por correo no está habilitado en Firebase.',
    'auth/admin-restricted-operation': 'La creación de cuentas está deshabilitada en Firebase (Authentication → Configuración → Acciones del usuario).',
    'app/duplicate': 'El código de estudiante o el documento ya se encuentran registrados.',
    'app/teacher-email': 'Este correo corresponde a la cuenta del administrador.',
    'app/registration-closed-or-duplicate': 'El registro libre está deshabilitado, o el código / documento ya está registrado.',
    'app/registration-closed': 'El registro libre de estudiantes está deshabilitado. Su docente creará su cuenta.',
    'permission-denied': 'No tiene permisos para realizar esta acción.',
    'invalid-argument': 'La base de datos rechazó el formato de los datos. Actualice la página (Ctrl + F5) e intente de nuevo.',
    'resource-exhausted': 'Se alcanzó el límite diario gratuito de la base de datos (plan Spark de Firebase). El servicio se restablece hacia las 2:00–3:00 a. m. (hora de Colombia); para evitarlo, el administrador debe pasar el proyecto al plan Blaze.',
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

// ---------- Cuentas creadas por el docente ----------
// Contraseña inicial: primer nombre con la primera letra en mayúscula + número de documento + "*"
// Ej.: "valentina ríos gómez", 1053845120  →  "Valentina1053845120*"
export function initialPassword(fullName = '', docNumber = '') {
  const first = String(fullName).trim().split(/\s+/)[0] || '';
  const lower = first.toLocaleLowerCase('es-CO');
  const cap = lower.charAt(0).toLocaleUpperCase('es-CO') + lower.slice(1);
  return `${cap}${String(docNumber).replace(/[\s.\-]/g, '')}*`;
}

// Normaliza el tipo de documento escrito de distintas formas en Excel
export function normDocType(v = '') {
  const t = norm(v).replace(/[^a-z ]/g, '').trim();
  if (!t) return '';
  if (['cc', 'cedula', 'cedula de ciudadania', 'cedula ciudadania'].includes(t)) return 'CC';
  if (['ti', 'tarjeta de identidad', 'tarjeta identidad'].includes(t)) return 'TI';
  if (['ce', 'cedula de extranjeria', 'cedula extranjeria'].includes(t)) return 'CE';
  if (['pa', 'pasaporte', 'pas'].includes(t)) return 'PA';
  if (['ppt', 'pep', 'permiso por proteccion temporal', 'permiso de proteccion temporal'].includes(t)) return 'PPT';
  return null; // no reconocido
}

// Validaciones compartidas por el registro, el formulario del docente y la carga masiva
export function validatePerson({ fullName = '', studentCode, docType, docNumber = '', email = '', phone = '' }, { requireCode = true } = {}) {
  const errors = [];
  const name = String(fullName).trim().replace(/\s+/g, ' ');
  if (name.split(' ').length < 2 || name.length < 5) errors.push('Nombre completo incompleto');
  else if (!/^[A-Za-zÀ-ÿÑñ' .-]+$/.test(name)) errors.push('El nombre tiene caracteres no válidos');
  if (requireCode && !/^[A-Za-z0-9-]{4,20}$/.test(String(studentCode || '').trim())) errors.push('Código de estudiante inválido');
  if (!['CC', 'TI', 'CE', 'PA', 'PPT'].includes(docType)) errors.push('Tipo de documento no reconocido');
  const dn = String(docNumber).trim();
  const pattern = ['PA', 'PPT', 'CE'].includes(docType) ? /^[A-Za-z0-9]{5,20}$/ : /^\d{5,15}$/;
  if (!pattern.test(dn)) errors.push('Número de documento inválido');
  if (!isEmail(email)) errors.push('Correo inválido');
  if (phone && !isPhone(phone)) errors.push('Celular inválido (10 dígitos, p. ej. 3001234567)');
  return errors;
}

// Nombres escritos todo en minúscula o todo en MAYÚSCULA → "Nombre Propio" (respeta los ya bien escritos)
export function formatName(n = '') {
  const clean = String(n).trim().replace(/\s+/g, ' ');
  if (!clean || (clean !== clean.toLocaleLowerCase('es-CO') && clean !== clean.toLocaleUpperCase('es-CO'))) return clean;
  const small = ['de', 'del', 'la', 'las', 'los', 'y', 'e'];
  return clean.toLocaleLowerCase('es-CO').split(' ')
    .map((w, i) => (i > 0 && small.includes(w) ? w : w.charAt(0).toLocaleUpperCase('es-CO') + w.slice(1)))
    .join(' ');
}
