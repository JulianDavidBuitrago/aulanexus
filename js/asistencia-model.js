// =====================================================================
//  Asistencia · modelo puro (sin DOM)
//  class.attendance = {
//    enabled, tz (minutos respecto a UTC; Colombia = -300), before (min antes del inicio),
//    late (min de tolerancia para "presente"), startDate / endDate ('AAAA-MM-DD'),
//    startKey / endKey (AAAAMMDD numérico, para las reglas; endKey 0 = sin fecha final),
//    days: { '1': { start: '07:00', end: '10:00', s: 420, e: 600 }, … }   1 = lunes … 7 = domingo
//    extra: [AAAAMMDD…] (sesiones agregadas), removed: [AAAAMMDD…] (sesiones quitadas)
//  }
//  Registro /attendance/{classId}_{AAAAMMDD}_{uid}: classId, ownerId, studentId, studentName,
//    dateKey, status (presente · tarde · ausente · excusa), by (student · teacher), at
// =====================================================================

export const WEEK = [[1, 'Lun', 'lunes'], [2, 'Mar', 'martes'], [3, 'Mié', 'miércoles'], [4, 'Jue', 'jueves'], [5, 'Vie', 'viernes'], [6, 'Sáb', 'sábado'], [7, 'Dom', 'domingo']];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const ATT_STATUS = {
  presente: { label: 'Presente', short: 'P', cls: 'b-success', icon: 'check' },
  tarde: { label: 'Tarde', short: 'T', cls: 'b-warning', icon: 'clock' },
  ausente: { label: 'Ausente', short: 'A', cls: 'b-danger', icon: 'x' },
  excusa: { label: 'Excusa', short: 'E', cls: 'b-info', icon: 'fileText' }
};

export const toMin = (hhmm) => { const [h, m] = String(hhmm || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const fmtMin = (min) => { const h = Math.floor(min / 60), m = min % 60; return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`; };
export const tzOf = (a) => (a && Number.isFinite(a.tz) ? a.tz : -300);
export const defaultTz = () => -new Date().getTimezoneOffset();

// Fecha y hora "locales" de la clase, independientes de la zona del dispositivo
export function localParts(ms, tz) {
  const d = new Date(ms + tz * 60000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() || 7, min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
export const keyOf = (p) => p.y * 10000 + p.m * 100 + p.d;
export const keyFromISO = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : null; };
export const isoFromKey = (k) => `${Math.floor(k / 10000)}-${String(Math.floor(k / 100) % 100).padStart(2, '0')}-${String(k % 100).padStart(2, '0')}`;
const keyDate = (k) => new Date(Date.UTC(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100));
export const dowOfKey = (k) => keyDate(k).getUTCDay() || 7;
const addDays = (k, n) => { const d = keyDate(k); d.setUTCDate(d.getUTCDate() + n); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };

export function fmtKey(k, long = false) {
  const d = keyDate(k), w = WEEK[dowOfKey(k) - 1];
  return long ? `${w[2]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}` : `${w[1]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}
export const recId = (classId, dateKey, uid) => `${classId}_${dateKey}_${uid}`;
export const hasSchedule = (a) => !!a && !!a.days && Object.keys(a.days).length > 0;

// Periodo de la clase: fecha inicial y final (inclusive). Sin fecha final = indefinido.
export function periodOf(a) {
  const start = keyFromISO(a?.startDate) || 0, end = keyFromISO(a?.endDate) || 0;
  return { start, end };
}
export const inPeriod = (a, k) => { const p = periodOf(a); return k >= p.start && (!p.end || k <= p.end); };
const dmy = (k) => `${k % 100} ${MONTHS[Math.floor(k / 100) % 100 - 1].slice(0, 3)} ${Math.floor(k / 10000)}`;
export function periodText(a) {
  const p = periodOf(a);
  if (p.start && p.end) return `${dmy(p.start)} – ${dmy(p.end)}`;
  if (p.start) return `Desde el ${dmy(p.start)}`;
  return p.end ? `Hasta el ${dmy(p.end)}` : '';
}

export function scheduleText(a) {
  if (!hasSchedule(a)) return '';
  return Object.keys(a.days).sort().map((d) => `${WEEK[d - 1][1]} ${a.days[d].start}–${a.days[d].end}`).join(' · ');
}

// Sesión abierta ahora (ventana: desde "before" minutos antes del inicio hasta la hora de fin)
export function openSession(c, now = Date.now()) {
  const a = c?.attendance;
  if (!a?.enabled || c.archived) return null;
  const p = localParts(now, tzOf(a));
  const key = keyOf(p);
  if ((a.removed || []).includes(key) || !inPeriod(a, key)) return null;
  const slot = a.days?.[String(p.dow)];
  if (!slot) return null;
  const before = a.before ?? 10, late = a.late ?? 15;
  if (p.min < slot.s - before || p.min > slot.e) return null;
  return { dateKey: key, slot, status: p.min <= slot.s + late ? 'presente' : 'tarde', min: p.min, lateAt: slot.s + late };
}

// Próxima sesión programada (incluye la de hoy si aún no termina)
export function nextSession(c, now = Date.now()) {
  const a = c?.attendance;
  if (!hasSchedule(a)) return null;
  const p = localParts(now, tzOf(a)), per = periodOf(a), today = keyOf(p);
  let k = Math.max(today, per.start);
  for (let i = 0; i < 400; i++, k = addDays(k, 1)) {
    if (per.end && k > per.end) return null;
    const slot = a.days[String(dowOfKey(k))];
    if (!slot || (a.removed || []).includes(k)) continue;
    if (k === today && p.min > slot.e) continue;
    return { dateKey: k, slot };
  }
  return null;
}

// Sesiones de la clase hasta hoy (más recientes primero)
export function sessionKeys(c, recs = [], now = Date.now()) {
  const a = c?.attendance || {};
  const tz = tzOf(a), p = localParts(now, tz), today = keyOf(p);
  const keys = new Set();
  if (hasSchedule(a)) {
    let k = keyFromISO(a.startDate) || keyOf(localParts(c.createdAt || now, tz));
    const last = periodOf(a).end ? Math.min(today, periodOf(a).end) : today;
    for (let i = 0; i < 400 && k <= last; i++, k = addDays(k, 1)) {
      const slot = a.days[String(dowOfKey(k))];
      if (!slot) continue;
      if (k === today && p.min < slot.s - (a.before ?? 10)) continue;
      keys.add(k);
    }
  }
  (a.extra || []).forEach((k) => { if (k <= today) keys.add(k); });
  recs.forEach((r) => { if (r.classId === c.id) keys.add(r.dateKey); });
  (a.removed || []).forEach((k) => keys.delete(k));
  return [...keys].sort((x, y) => y - x);
}

// ¿Ya terminó la sesión? (sin registro = ausencia)
export function sessionClosed(c, key, now = Date.now()) {
  const a = c?.attendance || {};
  const p = localParts(now, tzOf(a)), today = keyOf(p);
  if (key < today) return true;
  if (key > today) return false;
  const slot = a.days?.[String(p.dow)];
  return !slot || p.min > slot.e;
}

// Resumen por estudiante: excusas no cuentan en el total
export function summary(c, uid, recs, keys, now = Date.now()) {
  const mine = new Map(recs.filter((r) => r.studentId === uid && r.classId === c.id).map((r) => [r.dateKey, r]));
  const s = { presente: 0, tarde: 0, ausente: 0, excusa: 0, pending: 0 };
  for (const k of keys) {
    const r = mine.get(k);
    if (r) s[r.status] = (s[r.status] || 0) + 1;
    else if (sessionClosed(c, k, now)) s.ausente++;
    else s.pending++;
  }
  const total = s.presente + s.tarde + s.ausente;
  s.pct = total ? Math.round(((s.presente + s.tarde) / total) * 100) : null;
  return s;
}
