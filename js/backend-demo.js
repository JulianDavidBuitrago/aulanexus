// =====================================================================
//  Backend de demostración: misma interfaz que Firebase, datos en el navegador.
//  Se usa automáticamente mientras firebase-config.js no tenga credenciales.
// =====================================================================
import { TEACHER_EMAIL } from './firebase-config.js';
import { codeKey, docKey, uid as newId } from './util.js';

const KEY = 'aulanexus-demo-v3';
const SESSION = 'aulanexus-demo-session';
export const DEMO_ACCOUNTS = {
  teacher: { email: TEACHER_EMAIL, password: 'Docente#2026' },
  student: { email: 'valentina.rios@ucaldas.edu.co', password: 'Estudiante#2026' }
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } }
};

const JAVA_SAMPLE = `import java.util.ArrayList;
import java.util.List;

/**
 * Gestor de tareas con validación de entradas.
 * Autor: Valentina Ríos Gómez
 */
public class GestorTareas {

    private final List<String> tareas = new ArrayList<>();

    public boolean agregar(String descripcion) {
        if (descripcion == null || descripcion.isBlank()) {
            System.out.println("La descripción no puede estar vacía");
            return false;
        }
        tareas.add(descripcion.trim());
        return true;
    }

    public int total() {
        return tareas.size();
    }

    public static void main(String[] args) {
        GestorTareas g = new GestorTareas();
        g.agregar("Diseñar prototipo de baja fidelidad");
        g.agregar("Evaluar heurísticas de Nielsen");
        System.out.println("Tareas registradas: " + g.total());
    }
}`;

const PY_SAMPLE = `"""Validador de contraseñas seguro — Seguridad en Aplicaciones Web."""
import re
import hashlib
import secrets


def es_segura(password: str) -> bool:
    reglas = [
        len(password) >= 12,
        re.search(r"[A-Z]", password),
        re.search(r"[a-z]", password),
        re.search(r"\\d", password),
        re.search(r"[^\\w\\s]", password),
    ]
    return all(reglas)


def hash_password(password: str) -> str:
    sal = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), sal.encode(), 310_000)
    return f"{sal}\${digest.hex()}"


if __name__ == "__main__":
    for p in ["123456", "Clave#Segura2026"]:
        print(p, "->", "segura" if es_segura(p) else "débil")
`;

const TEACHER_JAVA = `// Ejemplo visto en clase: patrón Observer para notificaciones de interfaz
import java.util.ArrayList;
import java.util.List;

interface Observador { void actualizar(String evento); }

class Boton {
    private final List<Observador> observadores = new ArrayList<>();
    void suscribir(Observador o) { observadores.add(o); }
    void click() { observadores.forEach(o -> o.actualizar("click")); }
}

public class DemoObserver {
    public static void main(String[] args) {
        Boton b = new Boton();
        b.suscribir(e -> System.out.println("Retroalimentación visual: " + e));
        b.suscribir(e -> System.out.println("Registro de analítica: " + e));
        b.click();
    }
}`;

function seed() {
  const now = Date.now();
  const H = 3.6e6, D = 24 * H;
  const db = { accounts: {}, users: {}, classes: {}, posts: {}, submissions: {}, notifications: {}, uniques: {} };

  db.accounts[TEACHER_EMAIL] = { uid: 'teacher-uid', password: DEMO_ACCOUNTS.teacher.password };

  const classes = [
    { id: 'c-ihm', name: 'Interacción Humano-Máquina', code: '232G8F', schedule: 'Lunes · 7:00 – 10:00', room: 'Bloque D · Sala 3', color: 'violet', description: 'Principios de usabilidad, diseño centrado en el usuario, prototipado y evaluación heurística.' },
    { id: 'c-req', name: 'Ingeniería de Requisitos', code: 'IRQ-01', schedule: 'Martes · 14:00 – 17:00', room: 'Bloque C · 204', color: 'cyan', description: 'Elicitación, especificación, validación y gestión de requisitos de software.' },
    { id: 'c-saw', name: 'Seguridad en Aplicaciones Web', code: 'SAW-02', schedule: 'Jueves · 18:00 – 21:00', room: 'Laboratorio de Redes', color: 'pink', description: 'OWASP Top 10, autenticación segura, criptografía aplicada y pruebas de penetración éticas.' },
    { id: 'c-fti', name: 'Fundamentos de TI', code: 'FTI-2026-1', schedule: 'Viernes · 8:00 – 11:00', room: 'Bloque A · 101', color: 'emerald', description: 'Curso del periodo 2026-1.', archived: true, archivedAt: now - 60 * D }
  ];
  classes.forEach((c, i) => { db.classes[c.id] = { archived: false, createdAt: now - (90 - i) * D, ...c }; });

  const people = [
    ['s-valentina', 'Valentina Ríos Gómez', '1702310045', 'CC', '1053845120', 'valentina.rios@ucaldas.edu.co', ['c-ihm', 'c-saw', 'c-fti']],
    ['s-santiago', 'Santiago Marín López', '1702310078', 'CC', '1053811234', 'santiago.marin@ucaldas.edu.co', ['c-ihm', 'c-req']],
    ['s-mariana', 'Mariana Castaño Arias', '1702310112', 'TI', '1002345678', 'mariana.castano@ucaldas.edu.co', ['c-ihm', 'c-saw']],
    ['s-juan', 'Juan Esteban Ocampo Ruiz', '1702310134', 'CC', '1053799001', 'juan.ocampo@ucaldas.edu.co', ['c-req', 'c-saw']],
    ['s-daniela', 'Daniela Giraldo Henao', '1702310156', 'CC', '1053866432', 'daniela.giraldo@ucaldas.edu.co', ['c-ihm', 'c-req', 'c-fti']],
    ['s-sebastian', 'Sebastián Arango Duque', '1702310167', 'CE', '5123987', 'sebastian.arango@ucaldas.edu.co', ['c-saw']],
    ['s-laura', 'Laura Sofía Valencia Mejía', '1702310189', 'CC', '1053870011', 'laura.valencia@ucaldas.edu.co', ['c-ihm', 'c-req']],
    ['s-camilo', 'Camilo Andrés Zuluaga Toro', '1702310201', 'CC', '1053890345', 'camilo.zuluaga@ucaldas.edu.co', ['c-ihm', 'c-saw', 'c-req']]
  ];
  people.forEach(([id, fullName, studentCode, docType, docNumber, email, classIds], i) => {
    db.users[id] = { id, uid: id, role: 'student', fullName, studentCode, docType, docNumber, email, classIds, createdAt: now - (40 - i) * D, updatedAt: now - (40 - i) * D };
    db.accounts[email] = { uid: id, password: DEMO_ACCOUNTS.student.password };
    db.uniques[codeKey(studentCode)] = { uid: id };
    db.uniques[docKey(docType, docNumber)] = { uid: id };
  });

  const posts = [
    { id: 'p1', classId: 'c-ihm', type: 'anuncio', title: 'Bienvenidos al curso de IHM', body: 'Este semestre trabajaremos en proyectos reales de diseño centrado en el usuario. Revisen el microcurrículo y el cronograma de entregas.\nLas sesiones inician puntualmente a las 7:00 a. m.', links: [], files: [], createdAt: now - 20 * D },
    { id: 'p2', classId: 'c-ihm', type: 'material', title: 'Patrón Observer y retroalimentación de interfaz', body: 'Adjunto el ejemplo visto en clase y la lectura sobre las 10 heurísticas de Nielsen.', links: ['https://www.nngroup.com/articles/ten-usability-heuristics/'], files: [{ name: 'DemoObserver.java', size: TEACHER_JAVA.length, content: TEACHER_JAVA }], createdAt: now - 12 * D },
    { id: 'p3', classId: 'c-ihm', type: 'tarea', title: 'Taller 1 · Gestor de tareas con validación', body: 'Implementen en Java un gestor de tareas que valide entradas vacías y muestre mensajes de error comprensibles para el usuario. Entreguen el archivo .java y una breve justificación de decisiones de usabilidad.', links: [], files: [], dueAt: now - 3 * D, createdAt: now - 10 * D },
    { id: 'p4', classId: 'c-ihm', type: 'tarea', title: 'Taller 2 · Evaluación heurística', body: 'Evalúen la plataforma de matrícula de la universidad aplicando las 10 heurísticas. Entreguen el informe en texto plano con hallazgos y severidad (0–4).', links: [], files: [], dueAt: now + 4 * D, createdAt: now - 2 * D },
    { id: 'p5', classId: 'c-saw', type: 'anuncio', title: 'Laboratorio de OWASP Juice Shop', body: 'El próximo jueves trabajaremos en el laboratorio de redes. Traigan su portátil con Docker instalado.', links: ['https://owasp.org/www-project-juice-shop/'], files: [], createdAt: now - 6 * D },
    { id: 'p6', classId: 'c-saw', type: 'tarea', title: 'Reto 1 · Validador y hash de contraseñas', body: 'Construyan en Python un validador de contraseñas y una función de hash con sal usando PBKDF2. Entreguen el archivo .py.', links: [], files: [], dueAt: now - 1 * D, createdAt: now - 8 * D },
    { id: 'p7', classId: 'c-saw', type: 'tarea', title: 'Reto 2 · Análisis de inyección SQL', body: 'Documenten tres vectores de inyección SQL y su mitigación con consultas parametrizadas. Pueden adjuntar código de ejemplo en Java o Python.', links: [], files: [], dueAt: now + 6 * D, createdAt: now - 1 * D },
    { id: 'p8', classId: 'c-req', type: 'material', title: 'Plantilla IEEE 830 y ejemplos de historias de usuario', body: 'Material de apoyo para la especificación de requisitos del proyecto integrador.', links: ['https://standards.ieee.org/ieee/830/1222/'], files: [], createdAt: now - 5 * D },
    { id: 'p9', classId: 'c-req', type: 'tarea', title: 'Entrega 1 · Historias de usuario', body: 'Redacten 10 historias de usuario con criterios de aceptación en formato Gherkin.', links: [], files: [], dueAt: now + 2 * D, createdAt: now - 4 * D },
    { id: 'p10', classId: 'c-fti', type: 'tarea', title: 'Proyecto final · Diagnóstico de equipos', body: 'Informe final del curso.', links: [], files: [], dueAt: now - 70 * D, createdAt: now - 80 * D }
  ];
  posts.forEach((p) => { db.posts[p.id] = p; });

  const subs = [
    ['p3', 's-valentina', 'Justifico los mensajes de error con la heurística 9: ayudar a reconocer, diagnosticar y recuperarse de errores.', [{ name: 'GestorTareas.java', content: JAVA_SAMPLE }], now - 4 * D, 4.6, 'Excelente manejo de validaciones y mensajes claros. Mejora la documentación de métodos.'],
    ['p3', 's-santiago', 'Adjunto la implementación.', [{ name: 'Gestor.java', content: JAVA_SAMPLE.replace('Valentina Ríos Gómez', 'Santiago Marín López') }], now - 3.5 * D, 3.8, 'Funciona correctamente; falta justificar decisiones de usabilidad.'],
    ['p3', 's-mariana', 'Entrega del taller 1.', [{ name: 'GestorTareas.java', content: JAVA_SAMPLE.replace('Valentina Ríos Gómez', 'Mariana Castaño Arias') }], now - 3.2 * D, null, ''],
    ['p3', 's-daniela', 'Incluyo validación adicional de longitud máxima.', [{ name: 'GestorTareas.java', content: JAVA_SAMPLE.replace('Valentina Ríos Gómez', 'Daniela Giraldo Henao') }], now - 3.1 * D, null, ''],
    ['p6', 's-valentina', 'Implementé PBKDF2 con 310.000 iteraciones siguiendo la recomendación de OWASP.', [{ name: 'validador.py', content: PY_SAMPLE }], now - 1.5 * D, null, ''],
    ['p6', 's-juan', 'Reto 1 terminado.', [{ name: 'reto1.py', content: PY_SAMPLE }], now - 1.2 * D, 4.2, 'Buen uso de secrets. Agrega pruebas unitarias.'],
    ['p6', 's-camilo', '', [{ name: 'validador.py', content: PY_SAMPLE }], now - 0.5 * D, null, ''],
    ['p10', 's-valentina', 'Informe final entregado.', [], now - 71 * D, 4.8, 'Trabajo sobresaliente.'],
    ['p10', 's-daniela', 'Informe final.', [], now - 70.5 * D, 4.1, 'Buen trabajo.']
  ];
  subs.forEach(([postId, sid, text, files, at, grade, feedback]) => {
    const p = db.posts[postId], u = db.users[sid];
    const id = `${postId}_${sid}`;
    db.submissions[id] = {
      id, postId, classId: p.classId, studentId: sid, studentName: u.fullName, studentCode: u.studentCode,
      text, files: files.map((f) => ({ ...f, size: f.content.length })), late: p.dueAt ? at > p.dueAt : false,
      submittedAt: at, grade, feedback, status: grade == null ? 'entregado' : 'calificado', gradedAt: grade == null ? null : at + 0.8 * D
    };
  });

  const notif = (userId, type, title, message, link, createdAt, read = false) => {
    const id = newId(); db.notifications[id] = { id, userId, type, title, message, link, createdAt, read };
  };
  notif('s-valentina', 'grade', 'Nueva calificación · IHM', 'Taller 1 · Gestor de tareas con validación: 4.6', '#/calificaciones', now - 2 * D, true);
  notif('s-valentina', 'post', 'Nueva tarea en Interacción Humano-Máquina', 'Taller 2 · Evaluación heurística', '#/clase/c-ihm', now - 2 * D);
  notif('s-valentina', 'post', 'Nueva tarea en Seguridad en Aplicaciones Web', 'Reto 2 · Análisis de inyección SQL', '#/clase/c-saw', now - 1 * D);
  notif('teacher', 'submission', 'Nueva entrega · Camilo Andrés Zuluaga Toro', 'Reto 1 · Validador y hash de contraseñas', '#/tarea/p6', now - 0.5 * D);
  notif('teacher', 'submission', 'Nueva entrega · Valentina Ríos Gómez', 'Reto 1 · Validador y hash de contraseñas', '#/tarea/p6', now - 1.5 * D, true);
  return db;
}

export function createBackend() {
  let db;
  try { db = JSON.parse(store.get(KEY)) || seed(); } catch { db = seed(); }
  const watchers = new Set();
  let authCb = () => {};
  let current = null;
  try { current = JSON.parse(store.get(SESSION)); } catch { current = null; }

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const wait = (ms = 260) => new Promise((r) => setTimeout(r, ms));
  const err = (code) => Object.assign(new Error(code), { code });
  const values = (col) => Object.values(db[col]).map(clone);

  function commit() {
    store.set(KEY, JSON.stringify(db));
    for (const w of watchers) setTimeout(() => w.alive && w.cb(w.q()), 0);
  }
  function watch(q, cb) {
    const w = { q, cb, alive: true };
    watchers.add(w);
    setTimeout(() => w.alive && cb(q()), 120);
    return () => { w.alive = false; watchers.delete(w); };
  }
  function setSession(u) {
    current = u;
    if (u) store.set(SESSION, JSON.stringify(u)); else store.del(SESSION);
    setTimeout(() => authCb(current), 0);
  }
  const need = () => { if (!current) throw err('permission-denied'); };

  return {
    isDemo: true,
    reset() { store.del(KEY); store.del(SESSION); location.hash = '#/login'; location.reload(); },

    onAuth(cb) { authCb = cb; setTimeout(() => cb(current), 60); return () => {}; },
    async login(email, pass) {
      await wait(500);
      const acc = db.accounts[email.trim().toLowerCase()];
      if (!acc || acc.password !== pass) throw err('auth/invalid-credential');
      setSession({ uid: acc.uid, email: email.trim().toLowerCase() });
    },
    async logout() { setSession(null); },
    async resetPassword(email) {
      await wait(400);
      if (!db.accounts[email.trim().toLowerCase()]) throw err('auth/user-not-found');
    },
    async register(d) {
      await wait(700);
      const email = d.email.trim().toLowerCase();
      if (email === TEACHER_EMAIL.toLowerCase()) throw err('app/teacher-email');
      if (db.accounts[email]) throw err('auth/email-already-in-use');
      if (db.uniques[codeKey(d.studentCode)] || db.uniques[docKey(d.docType, d.docNumber)]) throw err('app/duplicate');
      const uid = 's-' + newId();
      db.accounts[email] = { uid, password: d.password };
      db.uniques[codeKey(d.studentCode)] = { uid };
      db.uniques[docKey(d.docType, d.docNumber)] = { uid };
      db.users[uid] = { id: uid, uid, role: 'student', fullName: d.fullName, studentCode: d.studentCode, docType: d.docType, docNumber: d.docNumber, email, classIds: d.classIds, createdAt: Date.now(), updatedAt: Date.now() };
      commit();
      setSession({ uid, email });
    },
    async changePassword(currentPass, next) {
      await wait(); need();
      const acc = db.accounts[current.email];
      if (!acc || acc.password !== currentPass) throw err('auth/wrong-password');
      acc.password = next; commit();
    },
    async changeEmail(currentPass, newEmail) {
      await wait(); need();
      const acc = db.accounts[current.email];
      const ne = newEmail.trim().toLowerCase();
      if (!acc || acc.password !== currentPass) throw err('auth/wrong-password');
      if (db.accounts[ne]) throw err('auth/email-already-in-use');
      delete db.accounts[current.email];
      db.accounts[ne] = acc;
      if (db.users[acc.uid]) db.users[acc.uid].email = ne;
      commit();
      setSession({ uid: acc.uid, email: ne });
      return { pendingVerification: false };
    },
    async syncEmail() {},

    watchProfile: (id, cb) => watch(() => (db.users[id] ? clone(db.users[id]) : null), cb),
    async updateProfile(id, data, prev) {
      await wait(); need();
      const oldC = codeKey(prev.studentCode), newC = codeKey(data.studentCode);
      const oldD = docKey(prev.docType, prev.docNumber), newD = docKey(data.docType, data.docNumber);
      if ((newC !== oldC && db.uniques[newC]) || (newD !== oldD && db.uniques[newD])) throw err('app/duplicate');
      if (newC !== oldC) { delete db.uniques[oldC]; db.uniques[newC] = { uid: id }; }
      if (newD !== oldD) { delete db.uniques[oldD]; db.uniques[newD] = { uid: id }; }
      Object.assign(db.users[id], data, { updatedAt: Date.now() });
      commit();
    },
    async joinClasses(id, ids) { await wait(); const u = db.users[id]; u.classIds = [...new Set([...(u.classIds || []), ...ids])]; commit(); },
    async removeFromClass(id, cid) { await wait(); const u = db.users[id]; u.classIds = (u.classIds || []).filter((x) => x !== cid); commit(); },
    watchStudents: (cb) => watch(() => values('users').filter((u) => u.role === 'student'), cb),

    watchClasses: (cb) => watch(() => values('classes'), cb),
    async listOpenClasses() { await wait(300); return values('classes').filter((c) => !c.archived); },
    async createClass(data) { await wait(); const id = 'c-' + newId(); db.classes[id] = { id, ...data, archived: false, createdAt: Date.now() }; commit(); return { id }; },
    async updateClass(id, data) { await wait(); Object.assign(db.classes[id], data); commit(); },

    watchPostsByClass: (cid, cb) => watch(() => values('posts').filter((p) => p.classId === cid), cb),
    watchAllPosts: (cb) => watch(() => values('posts'), cb),
    async createPost(p) { await wait(); const id = 'p-' + newId(); db.posts[id] = { id, ...p, createdAt: Date.now() }; commit(); return id; },
    async deletePost(id) { await wait(); delete db.posts[id]; commit(); },
    async updatePost(id, data) { await wait(); if (!db.posts[id]) throw err('permission-denied'); Object.assign(db.posts[id], clone(data), { updatedAt: Date.now() }); commit(); },

    watchSubmissionsBy: (field, value, cb) => watch(() => values('submissions').filter((s) => s[field] === value), cb),
    async submit(s) {
      await wait(600);
      const id = `${s.postId}_${s.studentId}`;
      if (db.submissions[id]?.grade != null) throw err('permission-denied');
      db.submissions[id] = { id, ...clone(s), grade: null, feedback: '', status: 'entregado', submittedAt: Date.now(), gradedAt: null };
      commit();
    },
    async grade(g) {
      await wait(450);
      const id = `${g.postId}_${g.studentId}`;
      db.submissions[id] = { id, ...(db.submissions[id] || {}), ...clone(g), status: 'calificado', gradedAt: Date.now() };
      commit();
    },

    watchNotifications: (key, cb) => watch(() => values('notifications').filter((n) => n.userId === key).sort((a, b) => b.createdAt - a.createdAt).slice(0, 40), cb),
    async addNotifications(items) {
      items.forEach((n) => { const id = newId(); db.notifications[id] = { id, ...n, read: false, createdAt: Date.now() }; });
      commit();
    },
    async markRead(id) { if (db.notifications[id]) { db.notifications[id].read = true; commit(); } },
    async markAllRead(ids) { ids.forEach((id) => { if (db.notifications[id]) db.notifications[id].read = true; }); commit(); }
  };
}
