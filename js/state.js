// Estado global compartido entre vistas
export const S = {
  user: null,          // { uid, email }
  role: null,          // 'teacher' | 'student'
  profile: null,       // perfil del estudiante
  classes: [],         // todas las clases
  students: [],        // (docente) todos los estudiantes
  posts: [],           // publicaciones visibles
  notifications: [],
  mySubs: [],          // (estudiante) mis entregas
  pendingSubs: [],     // (docente) entregas sin calificar
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

// Notificar a todos los estudiantes de una clase
export async function notifyClass(classId, { title, message, link, type = 'post' }) {
  const list = studentsOf(classId).map((s) => ({ userId: s.uid, type, title, message, link, classId }));
  if (list.length) await ctx.B.addNotifications(list);
  return list.length;
}
