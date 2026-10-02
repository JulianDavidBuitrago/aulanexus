// Estado global compartido entre vistas
import { TEACHER_NAME } from './firebase-config.js';

export const S = {
  user: null,          // { uid, email }
  role: null,          // 'teacher' (incluye al administrador) | 'student'
  isAdmin: false,      // administrador de la plataforma (correo TEACHER_EMAIL)
  profile: null,       // perfil en /users (docentes y estudiantes)
  settings: { allowSelfRegistration: true },
  classes: [],         // todas las clases (lectura pública)
  students: [],        // (docente) estudiantes
  teachers: [],        // (administrador) docentes
  posts: [],           // publicaciones visibles
  notifications: [],
  mySubs: [],          // (estudiante) mis entregas
  pendingSubs: [],     // (docente) entregas sin calificar de sus clases
  practices: [],       // (docente) prácticas que asesora · (estudiante) sus prácticas
  visits: [],          // visitas de seguimiento de prácticas
  myAttendance: [],    // (estudiante) mis registros de asistencia
  metrics: null,       // (docentes) consumo de Firestore publicado por el Apps Script
  ready: {}
};

export const ctx = { B: null, demo: false };

let updater = () => {};
export const setUpdater = (fn) => { updater = fn; };
let queued = false;
export function emit() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; updater(); });
}

export const go = (hash) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };

// ---------- Selectores ----------
export const classById = (id) => S.classes.find((c) => c.id === id);
export const byName = (a, b) => (a.fullName || a.name || '').localeCompare(b.fullName || b.name || '', 'es');
export const studentsOf = (cid) => S.students.filter((s) => (s.classIds || []).includes(cid)).sort(byName);
export const postsOf = (cid) => S.posts.filter((p) => p.classId === cid).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
export const tasksOf = (cid) => S.posts.filter((p) => p.classId === cid && p.type === 'tarea').sort((a, b) => (a.dueAt || a.createdAt || 0) - (b.dueAt || b.createdAt || 0));
export const studentById = (id) => S.students.find((s) => s.uid === id);

// ---------- Propiedad de clases (cada docente gestiona las suyas) ----------
export const isMine = (c) => !!c && (c.ownerId === S.user?.uid || (S.isAdmin && !c.ownerId));
export const myClasses = () => S.classes.filter(isMine);
export const ownerOf = (classId) => classById(classId)?.ownerId || S.user?.uid;
export const selfRegOpen = () => S.settings?.allowSelfRegistration !== false;
export const teacherName = () => (S.isAdmin ? S.profile?.fullName || TEACHER_NAME : S.profile?.fullName || S.user?.email || '');
// Estudiantes visibles para el docente: los de sus clases (el administrador ve todos)
export const myStudents = () => {
  if (S.isAdmin) return S.students;
  const ids = new Set(myClasses().map((c) => c.id));
  return S.students.filter((s) => (s.classIds || []).some((id) => ids.has(id)));
};

// Notificar a todos los estudiantes de una clase
export async function notifyClass(classId, { title, message, link, type = 'post' }) {
  const list = studentsOf(classId).map((s) => ({ userId: s.uid, type, title, message, link, classId }));
  if (list.length) await ctx.B.addNotifications(list);
  return list.length;
}
