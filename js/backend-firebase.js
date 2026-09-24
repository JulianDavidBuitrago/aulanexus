// =====================================================================
//  Backend real: Firebase Authentication + Cloud Firestore (SDK modular v10)
// =====================================================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential, updatePassword,
  verifyBeforeUpdateEmail, deleteUser, setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query,
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
          email: d.email.trim().toLowerCase(), classIds: d.classIds,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        await b.commit();
      } catch (e) {
        if (cred) {
          await deleteUser(cred.user).catch(() => signOut(auth));
          suspended = false;
          authCb(null);
          if (e.code === 'permission-denied') throw err('app/duplicate');
        }
        suspended = false;
        throw e;
      }
      suspended = false;
      authCb(toUser(auth.currentUser));
    },

    async changePassword(current, next) {
      const u = auth.currentUser;
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
      await updatePassword(u, next);
    },
    async changeEmail(current, newEmail) {
      const u = auth.currentUser;
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
      await verifyBeforeUpdateEmail(u, newEmail.trim());
      return { pendingVerification: true };
    },
    syncEmail: (uid, email) => updateDoc(doc(db, 'users', uid), { email }).catch(() => {}),

    // ---------- Perfiles ----------
    watchProfile: (uid, cb) => onSnapshot(doc(db, 'users', uid), (s) => cb(s.exists() ? plain(s) : null), fail),
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
    watchStudents: (cb) => onSnapshot(query(collection(db, 'users'), where('role', '==', 'student')), (qs) => cb(list(qs)), fail),

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
    watchAllPosts: (cb) => onSnapshot(collection(db, 'posts'), (qs) => cb(list(qs)), fail),
    async createPost(p) {
      const ref = await addDoc(collection(db, 'posts'), { ...p, createdAt: serverTimestamp() });
      return ref.id;
    },
    deletePost: (id) => deleteDoc(doc(db, 'posts', id)),
    updatePost: (id, data) => updateDoc(doc(db, 'posts', id), { ...data, updatedAt: serverTimestamp() }),

    // ---------- Entregas / calificaciones ----------
    watchSubmissionsBy: (field, value, cb) =>
      onSnapshot(query(collection(db, 'submissions'), where(field, '==', value)), (qs) => cb(list(qs)), fail),
    submit: (s) => setDoc(doc(db, 'submissions', `${s.postId}_${s.studentId}`), {
      ...s, grade: null, feedback: '', status: 'entregado', submittedAt: serverTimestamp(), gradedAt: null
    }),
    grade: (g) => setDoc(doc(db, 'submissions', `${g.postId}_${g.studentId}`), {
      ...g, status: 'calificado', gradedAt: serverTimestamp()
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
    }
  };
  return api;
}
