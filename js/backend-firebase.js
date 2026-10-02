// =====================================================================
//  Backend real: Firebase Authentication + Cloud Firestore (SDK modular v10)
// =====================================================================
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, EmailAuthProvider,
  reauthenticateWithCredential, updatePassword, verifyBeforeUpdateEmail, deleteUser,
  setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query,
  where, orderBy, limit, serverTimestamp, writeBatch, arrayUnion, arrayRemove, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, TEACHER_EMAIL } from './firebase-config.js';
import { codeKey, docKey } from './util.js';

export function createBackend() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  auth.languageCode = 'es';
  const db = getFirestore(app);
  setPersistence(auth, browserLocalPersistence).catch(() => {});

  // Convierte Timestamps a milisegundos para la interfaz
  const plain = (snap) => {
    const d = snap.data({ serverTimestamps: 'estimate' }) || {};
    const o = { id: snap.id };
    for (const [k, v] of Object.entries(d)) o[k] = v instanceof Timestamp ? v.toMillis() : v;
    return o;
  };
  const list = (qs) => qs.docs.map(plain);
  // Firestore no admite listas dentro de listas (filas de tablas, siglas, glosario del informe):
  // al guardar, cada lista interna se envuelve como { __a: [...] } y al leer se restaura.
  const packArr = (v) => (Array.isArray(v) ? v.map((x) => (Array.isArray(x) ? { __a: packArr(x) } : packArr(x)))
    : v && typeof v === 'object' && v.constructor === Object ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, packArr(x)])) : v);
  const unpackArr = (v) => (Array.isArray(v) ? v.map(unpackArr)
    : v && typeof v === 'object' && !(v instanceof Timestamp) ? (Array.isArray(v.__a) && Object.keys(v).length === 1 ? unpackArr(v.__a) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unpackArr(x)]))) : v);
  const plainPractice = (snap) => unpackArr(plain(snap));
  const fail = (e) => console.error('[Firestore]', e);
  const err = (code) => Object.assign(new Error(code), { code });

  // Durante el registro se suspenden los eventos de sesión hasta crear el perfil
  let suspended = false;
  let authCb = () => {};
  const toUser = (u) => (u ? { uid: u.uid, email: (u.email || '').toLowerCase() } : null);

  const api = {
    onAuth(cb) {
      authCb = cb;
      return onAuthStateChanged(auth, (u) => { if (!suspended) cb(toUser(u)); });
    },
    login: (email, pass) => signInWithEmailAndPassword(auth, email.trim(), pass),
    logout: () => signOut(auth),
    resetPassword: (email) => sendPasswordResetEmail(auth, email.trim()),

    // Registro libre del estudiante (solo funciona si el administrador lo habilitó)
    async register(d) {
      if (d.email.trim().toLowerCase() === TEACHER_EMAIL.toLowerCase()) throw err('app/teacher-email');
      suspended = true;
      let cred;
      try {
        cred = await createUserWithEmailAndPassword(auth, d.email.trim(), d.password);
        const uid = cred.user.uid;
        const b = writeBatch(db);
        b.set(doc(db, 'uniques', codeKey(d.studentCode)), { uid, kind: 'code' });
        b.set(doc(db, 'uniques', docKey(d.docType, d.docNumber)), { uid, kind: 'doc' });
        b.set(doc(db, 'users', uid), {
          uid, role: 'student',
          fullName: d.fullName, studentCode: d.studentCode, docType: d.docType, docNumber: d.docNumber,
          email: d.email.trim().toLowerCase(), phone: d.phone || '', classIds: d.classIds, mustChangePassword: false,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        await b.commit();
      } catch (e) {
        if (cred) {
          await deleteUser(cred.user).catch(() => signOut(auth));
          suspended = false;
          authCb(null);
          if (e.code === 'permission-denied') throw err('app/registration-closed-or-duplicate');
        }
        suspended = false;
        throw e;
      }
      suspended = false;
      authCb(toUser(auth.currentUser));
    },

    // ---------- Creación de cuentas por el docente / administrador ----------
    // Usa una instancia secundaria de Firebase con sesión en memoria: la cuenta nueva
    // se crea sin cerrar la sesión de quien la crea. Si el perfil no se puede guardar,
    // la cuenta recién creada se elimina para no dejar usuarios huérfanos.
    async provisionAccount({ password, profile }) {
      const email = profile.email.trim().toLowerCase();
      if (email === TEACHER_EMAIL.toLowerCase()) throw err('app/teacher-email');
      const sec = initializeApp(firebaseConfig, `provision-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const secAuth = initializeAuth(sec, { persistence: inMemoryPersistence });
      try {
        const cred = await createUserWithEmailAndPassword(secAuth, email, password);
        const uid = cred.user.uid;
        const b = writeBatch(db);
        if (profile.role === 'student') {
          b.set(doc(db, 'uniques', codeKey(profile.studentCode)), { uid, kind: 'code' });
          b.set(doc(db, 'uniques', docKey(profile.docType, profile.docNumber)), { uid, kind: 'doc' });
        }
        b.set(doc(db, 'users', uid), {
          ...profile, uid, email, mustChangePassword: true,
          createdBy: auth.currentUser?.uid || null, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        try { await b.commit(); } catch (e) {
          await deleteUser(cred.user).catch(() => {});
          if (e.code === 'permission-denied') throw err('app/duplicate');
          throw e;
        }
        return uid;
      } finally {
        await signOut(secAuth).catch(() => {});
        await deleteApp(sec).catch(() => {});
      }
    },
    updateUser: (uid, data) => updateDoc(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() }),
    watchTeachers: (cb) => onSnapshot(query(collection(db, 'users'), where('role', '==', 'teacher')), (qs) => cb(list(qs)), fail),

    async changePassword(current, next) {
      const u = auth.currentUser;
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
      await updatePassword(u, next);
    },
    // Cambio obligatorio en el primer ingreso
    async completePasswordChange(current, next) {
      await api.changePassword(current, next);
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { mustChangePassword: false, passwordChangedAt: serverTimestamp() });
    },
    async changeEmail(current, newEmail) {
      const u = auth.currentUser;
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
      await verifyBeforeUpdateEmail(u, newEmail.trim());
      return { pendingVerification: true };
    },
    syncEmail: (uid, email) => updateDoc(doc(db, 'users', uid), { email }).catch(() => {}),

    // ---------- Ajustes ----------
    watchSettings: (cb) => onSnapshot(doc(db, 'settings', 'app'),
      (s) => cb({ allowSelfRegistration: true, ...(s.exists() ? s.data() : {}) }),
      () => cb({ allowSelfRegistration: true })),
    saveSettings: (data) => setDoc(doc(db, 'settings', 'app'), { ...data, updatedAt: serverTimestamp() }, { merge: true }),

    // ---------- Perfiles ----------
    watchProfile: (uid, cb) => onSnapshot(doc(db, 'users', uid), (s) => cb(s.exists() ? plain(s) : null, null), (e) => { fail(e); cb(null, e); }),
    async updateProfile(uid, data, prev) {
      const b = writeBatch(db);
      if (codeKey(data.studentCode) !== codeKey(prev.studentCode)) {
        b.delete(doc(db, 'uniques', codeKey(prev.studentCode)));
        b.set(doc(db, 'uniques', codeKey(data.studentCode)), { uid, kind: 'code' });
      }
      if (docKey(data.docType, data.docNumber) !== docKey(prev.docType, prev.docNumber)) {
        b.delete(doc(db, 'uniques', docKey(prev.docType, prev.docNumber)));
        b.set(doc(db, 'uniques', docKey(data.docType, data.docNumber)), { uid, kind: 'doc' });
      }
      b.update(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() });
      try { await b.commit(); } catch (e) { if (e.code === 'permission-denied') throw err('app/duplicate'); throw e; }
    },
    joinClasses: (uid, ids) => updateDoc(doc(db, 'users', uid), { classIds: arrayUnion(...ids) }),
    removeFromClass: (uid, classId) => updateDoc(doc(db, 'users', uid), { classIds: arrayRemove(classId) }),
    // Estudiantes = rol estudiante + docentes a los que el administrador habilitó el acceso como estudiante
    watchStudents(cb) {
      let a = [], b = [], ra = false, rb = false;
      const out = () => { if (!ra || !rb) return; const m = new Map(); [...a, ...b].forEach((u) => m.set(u.id, u)); cb([...m.values()]); };
      const u1 = onSnapshot(query(collection(db, 'users'), where('role', '==', 'student')), (qs) => { a = list(qs); ra = true; out(); }, fail);
      const u2 = onSnapshot(query(collection(db, 'users'), where('studentAccess', '==', true)), (qs) => { b = list(qs); rb = true; out(); }, (e) => { fail(e); rb = true; out(); });
      return () => { u1(); u2(); };
    },
    // ---------- Doble rol: docente con acceso como estudiante (solo administrador) ----------
    async grantStudentAccess(t, { studentCode, classIds }) {
      const b = writeBatch(db);
      const had = t.studentAccess === true;
      if (!had || codeKey(t.studentCode || '') !== codeKey(studentCode)) {
        if (had && t.studentCode) b.delete(doc(db, 'uniques', codeKey(t.studentCode)));
        b.set(doc(db, 'uniques', codeKey(studentCode)), { uid: t.uid, kind: 'code' });
      }
      if (!had) b.set(doc(db, 'uniques', docKey(t.docType, t.docNumber)), { uid: t.uid, kind: 'doc' });
      b.update(doc(db, 'users', t.uid), { studentAccess: true, studentCode, classIds, updatedAt: serverTimestamp() });
      try { await b.commit(); } catch (e) { if (e.code === 'permission-denied') throw err('app/duplicate'); throw e; }
    },
    // Estudiante existente → también docente (misma cuenta; conserva código, clases y notas)
    promoteStudent: (st) => updateDoc(doc(db, 'users', st.uid), { role: 'teacher', active: true, studentAccess: true, promotedAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    // Docente-estudiante → solo estudiante (solo si no es dueño de clases)
    demoteToStudent: (t) => updateDoc(doc(db, 'users', t.uid), { role: 'student', studentAccess: false, updatedAt: serverTimestamp() }),
    async revokeStudentAccess(t) {
      const b = writeBatch(db);
      if (t.studentCode) b.delete(doc(db, 'uniques', codeKey(t.studentCode)));
      if (t.docNumber) b.delete(doc(db, 'uniques', docKey(t.docType, t.docNumber)));
      b.update(doc(db, 'users', t.uid), { studentAccess: false, updatedAt: serverTimestamp() });
      await b.commit();
    },

    // ---------- Clases ----------
    watchClasses: (cb) => onSnapshot(collection(db, 'classes'), (qs) => cb(list(qs)), fail),
    async listOpenClasses() {
      const qs = await getDocs(query(collection(db, 'classes'), where('archived', '==', false)));
      return list(qs);
    },
    createClass: (data) => addDoc(collection(db, 'classes'), { ...data, archived: false, createdAt: serverTimestamp() }),
    updateClass: (id, data) => updateDoc(doc(db, 'classes', id), data),

    // ---------- Publicaciones ----------
    watchPostsByClass: (cid, cb) => onSnapshot(query(collection(db, 'posts'), where('classId', '==', cid)), (qs) => cb(list(qs)), fail),
    watchPostsByOwner: (uid, cb) => onSnapshot(query(collection(db, 'posts'), where('ownerId', '==', uid)), (qs) => cb(list(qs)), fail),
    async createPost(p) {
      const ref = await addDoc(collection(db, 'posts'), { ...p, createdAt: serverTimestamp() });
      return ref.id;
    },
    deletePost: (id) => deleteDoc(doc(db, 'posts', id)),
    updatePost: (id, data) => updateDoc(doc(db, 'posts', id), { ...data, updatedAt: serverTimestamp() }),
    // Registro del último aviso por correo (no marca la publicación como editada)
    markEmailed: (id, n) => updateDoc(doc(db, 'posts', id), { lastEmailAt: serverTimestamp(), lastEmailCount: n }),
    idToken: () => auth.currentUser.getIdToken(),

    // ---------- Consumo (lo escribe el Apps Script cada hora) ----------
    watchMetrics: (cb) => onSnapshot(doc(db, 'metrics', 'usage'), (s) => cb(s.exists() ? plain(s) : null, null), (e) => cb(null, e)),

    // ---------- Asistencia ----------
    // filters: { classId, ownerId } (docente) o { studentId } (estudiante)
    watchAttendance: (filters, cb) => onSnapshot(query(collection(db, 'attendance'), ...Object.entries(filters).map(([k, v]) => where(k, '==', v))),
      (qs) => cb(list(qs)), (e) => { fail(e); cb([]); }),
    setAttendance: (id, data) => setDoc(doc(db, 'attendance', id), { ...data, at: serverTimestamp() }, { merge: true }),
    deleteAttendance: (id) => deleteDoc(doc(db, 'attendance', id)),
    // El estudiante solo puede crear su registro (las reglas validan día, hora y estado)
    checkIn: (id, data) => setDoc(doc(db, 'attendance', id), { ...data, at: serverTimestamp() }),

    // ---------- Prácticas empresariales ----------
    // field: 'ownerId' (docente) o 'studentId' (estudiante)
    watchPractices: (field, value, cb) => onSnapshot(query(collection(db, 'practices'), where(field, '==', value)), (qs) => cb(qs.docs.map(plainPractice), null), (e) => { fail(e); cb([], e); }),
    async createPractice(p) {
      const ref = await addDoc(collection(db, 'practices'), { ...packArr(p), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return ref.id;
    },
    updatePractice: (id, data) => updateDoc(doc(db, 'practices', id), { ...packArr(data), updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || null }),
    deletePractice: (id) => deleteDoc(doc(db, 'practices', id)),
    watchPracticeComments: (pid, cb) => onSnapshot(query(collection(db, 'practices', pid, 'comments'), orderBy('createdAt', 'asc')), (qs) => cb(list(qs)), (e) => { fail(e); cb([]); }),
    addPracticeComment: (pid, c) => addDoc(collection(db, 'practices', pid, 'comments'), { ...c, createdAt: serverTimestamp() }),
    updatePracticeComment: (pid, cid, data) => updateDoc(doc(db, 'practices', pid, 'comments', cid), data),
    deletePracticeComment: (pid, cid) => deleteDoc(doc(db, 'practices', pid, 'comments', cid)),
    // Figuras del informe (la consulta incluye ownerId o studentId para que las reglas puedan validarla)
    watchPracticeFiles: (pid, field, uid, cb) => onSnapshot(query(collection(db, 'practiceFiles'), where('practiceId', '==', pid), where(field, '==', uid)), (qs) => cb(list(qs)), (e) => { fail(e); cb([]); }),
    async addPracticeFile(f) { const ref = await addDoc(collection(db, 'practiceFiles'), { ...f, createdAt: serverTimestamp() }); return ref.id; },
    deletePracticeFile: (id) => deleteDoc(doc(db, 'practiceFiles', id)),
    // Visitas (calendario)
    watchVisits: (field, value, cb) => onSnapshot(query(collection(db, 'visits'), where(field, '==', value)), (qs) => cb(list(qs)), (e) => { fail(e); cb([]); }),
    async createVisit(v) { const ref = await addDoc(collection(db, 'visits'), { ...v, createdAt: serverTimestamp() }); return ref.id; },
    updateVisit: (id, data) => updateDoc(doc(db, 'visits', id), { ...data, updatedAt: serverTimestamp() }),
    deleteVisit: (id) => deleteDoc(doc(db, 'visits', id)),

    // ---------- Entregas / calificaciones ----------
    // ownerId: los docentes solo pueden consultar entregas de sus propias clases
    watchSubmissionsBy: (field, value, cb, ownerId) => {
      const cons = [where(field, '==', value)];
      if (ownerId && field !== 'ownerId') cons.push(where('ownerId', '==', ownerId));
      return onSnapshot(query(collection(db, 'submissions'), ...cons), (qs) => cb(list(qs)), fail);
    },
    submit: (s) => setDoc(doc(db, 'submissions', `${s.postId}_${s.studentId}`), {
      ...s, grade: null, feedback: '', status: 'entregado', submittedAt: serverTimestamp(), gradedAt: null
    }),
    grade: (g) => setDoc(doc(db, 'submissions', `${g.postId}_${g.studentId}`), {
      ...g, status: 'calificado', gradedAt: serverTimestamp()
    }, { merge: true }),
    // Devolver una entrega: queda sin nota y sin fecha de entrega para que el estudiante la corrija y la reenvíe
    returnSubmission: (r) => setDoc(doc(db, 'submissions', `${r.postId}_${r.studentId}`), {
      ownerId: r.ownerId, status: 'devuelto', grade: null, gradedAt: null, submittedAt: null,
      prevSubmittedAt: r.prevSubmittedAt || null, returnNote: r.returnNote, returnDueAt: r.returnDueAt || null,
      returnCount: r.returnCount, returnedAt: serverTimestamp()
    }, { merge: true }),

    // ---------- Notificaciones ----------
    watchNotifications: (key, cb) => onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', key), orderBy('createdAt', 'desc'), limit(40)),
      (qs) => cb(list(qs)), fail),
    async addNotifications(items) {
      for (let i = 0; i < items.length; i += 450) {
        const b = writeBatch(db);
        items.slice(i, i + 450).forEach((n) => b.set(doc(collection(db, 'notifications')), { ...n, read: false, createdAt: serverTimestamp() }));
        await b.commit();
      }
    },
    markRead: (id) => updateDoc(doc(db, 'notifications', id), { read: true }),
    async markAllRead(ids) {
      const b = writeBatch(db);
      ids.forEach((id) => b.update(doc(db, 'notifications', id), { read: true }));
      await b.commit();
    },

    // ---------- Migración de datos de la versión de un solo docente ----------
    // Se ejecuta una vez al ingresar el administrador: asigna ownerId a clases,
    // publicaciones y entregas anteriores, y mueve las notificaciones 'teacher'.
    async migrateLegacy(adminUid, adminName) {
      const st = await getDoc(doc(db, 'settings', 'app'));
      if (st.exists() && (st.data().schemaVersion || 0) >= 2) return 0;
      const ops = [];
      const owner = {};
      (await getDocs(collection(db, 'classes'))).forEach((d) => {
        const o = d.data().ownerId;
        owner[d.id] = o || adminUid;
        if (!o) ops.push([d.ref, { ownerId: adminUid, ownerName: adminName }]);
      });
      (await getDocs(collection(db, 'posts'))).forEach((d) => {
        if (!d.data().ownerId) ops.push([d.ref, { ownerId: owner[d.data().classId] || adminUid }]);
      });
      (await getDocs(collection(db, 'submissions'))).forEach((d) => {
        if (!d.data().ownerId) ops.push([d.ref, { ownerId: owner[d.data().classId] || adminUid }]);
      });
      (await getDocs(query(collection(db, 'notifications'), where('userId', '==', 'teacher')))).forEach((d) => {
        ops.push([d.ref, { userId: adminUid }]);
      });
      for (let i = 0; i < ops.length; i += 400) {
        const b = writeBatch(db);
        ops.slice(i, i + 400).forEach(([ref, data]) => b.update(ref, data));
        await b.commit();
      }
      await setDoc(doc(db, 'settings', 'app'), { schemaVersion: 2 }, { merge: true });
      return ops.length;
    }
  };
  return api;
}
