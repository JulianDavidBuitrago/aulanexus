// =====================================================================
//  Backend de demostración: misma interfaz que Firebase, datos en el navegador.
//  Se usa automáticamente mientras firebase-config.js no tenga credenciales.
// =====================================================================
import { TEACHER_EMAIL, TEACHER_NAME } from './firebase-config.js';
import { codeKey, docKey, uid as newId } from './util.js';
import { emptyProposal, defaultFinal, currentPeriod } from './practica-model.js';
import { openSession as attOpen, sessionKeys as attKeys, localParts as attLocal, keyOf as attKey, toMin as attMin } from './asistencia-model.js';

const KEY = 'aulanexus-demo-v8';
const SESSION = 'aulanexus-demo-session';
export const DEMO_ACCOUNTS = {
  admin: { email: TEACHER_EMAIL, password: 'Docente#2026' },
  teacher: { email: 'carlos.mejia@ucaldas.edu.co', password: 'Docente#2026' },
  student: { email: 'valentina.rios@ucaldas.edu.co', password: 'Estudiante#2026' }
};
const ADMIN_UID = 'teacher-uid';

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
  const db = { accounts: {}, users: {}, classes: {}, posts: {}, submissions: {}, notifications: {}, uniques: {},
    practices: {}, practiceComments: {}, practiceFiles: {}, visits: {}, attendance: {},
    settings: { allowSelfRegistration: true, schemaVersion: 2 } };

  db.accounts[TEACHER_EMAIL] = { uid: ADMIN_UID, password: DEMO_ACCOUNTS.admin.password };
  // Segundo docente (creado por el administrador)
  db.accounts[DEMO_ACCOUNTS.teacher.email] = { uid: 't-carlos', password: DEMO_ACCOUNTS.teacher.password };
  db.users['t-carlos'] = { id: 't-carlos', uid: 't-carlos', role: 'teacher', active: true, fullName: 'Carlos Andrés Mejía Ríos', docType: 'CC', docNumber: '75081234', email: DEMO_ACCOUNTS.teacher.email, mustChangePassword: false, createdBy: ADMIN_UID, createdAt: now - 100 * D, updatedAt: now - 100 * D };

  const classes = [
    { id: 'c-ihm', name: 'Interacción Humano-Máquina', code: '232G8F', schedule: 'Lunes · 7:00 – 10:00', room: 'Bloque D · Sala 3', color: 'violet', description: 'Principios de usabilidad, diseño centrado en el usuario, prototipado y evaluación heurística.' },
    { id: 'c-req', name: 'Ingeniería de Requisitos', code: 'IRQ-01', schedule: 'Martes · 14:00 – 17:00', room: 'Bloque C · 204', color: 'cyan', description: 'Elicitación, especificación, validación y gestión de requisitos de software.' },
    { id: 'c-saw', name: 'Seguridad en Aplicaciones Web', code: 'SAW-02', schedule: 'Jueves · 18:00 – 21:00', room: 'Laboratorio de Redes', color: 'pink', description: 'OWASP Top 10, autenticación segura, criptografía aplicada y pruebas de penetración éticas.', coTeachers: ['t-carlos'], coTeacherInfo: [{ uid: 't-carlos', name: 'Carlos Andrés Mejía Ríos', email: DEMO_ACCOUNTS.teacher.email }] },
    { id: 'c-fti', name: 'Fundamentos de TI', code: 'FTI-2026-1', schedule: 'Viernes · 8:00 – 11:00', room: 'Bloque A · 101', color: 'emerald', description: 'Curso del periodo 2026-1.', archived: true, archivedAt: now - 60 * D },
    { id: 'c-bd', name: 'Bases de Datos', code: 'BD-01', schedule: 'Miércoles · 10:00 – 12:00', room: 'Bloque B · 305', color: 'amber', description: 'Modelo entidad-relación, normalización y SQL.', ownerId: 't-carlos', ownerName: 'Carlos Andrés Mejía Ríos' }
  ];
  classes.forEach((c, i) => { db.classes[c.id] = { archived: false, ownerId: ADMIN_UID, ownerName: TEACHER_NAME, createdAt: now - (90 - i) * D, ...c }; });

  const people = [
    ['s-valentina', 'Valentina Ríos Gómez', '1702310045', 'CC', '1053845120', 'valentina.rios@ucaldas.edu.co', ['c-ihm', 'c-saw', 'c-fti']],
    ['s-santiago', 'Santiago Marín López', '1702310078', 'CC', '1053811234', 'santiago.marin@ucaldas.edu.co', ['c-ihm', 'c-req', 'c-bd']],
    ['s-mariana', 'Mariana Castaño Arias', '1702310112', 'TI', '1002345678', 'mariana.castano@ucaldas.edu.co', ['c-ihm', 'c-saw']],
    ['s-juan', 'Juan Esteban Ocampo Ruiz', '1702310134', 'CC', '1053799001', 'juan.ocampo@ucaldas.edu.co', ['c-req', 'c-saw']],
    ['s-daniela', 'Daniela Giraldo Henao', '1702310156', 'CC', '1053866432', 'daniela.giraldo@ucaldas.edu.co', ['c-ihm', 'c-req', 'c-fti']],
    ['s-sebastian', 'Sebastián Arango Duque', '1702310167', 'CE', '5123987', 'sebastian.arango@ucaldas.edu.co', ['c-saw']],
    ['s-laura', 'Laura Sofía Valencia Mejía', '1702310189', 'CC', '1053870011', 'laura.valencia@ucaldas.edu.co', ['c-ihm', 'c-req']],
    ['s-camilo', 'Camilo Andrés Zuluaga Toro', '1702310201', 'CC', '1053890345', 'camilo.zuluaga@ucaldas.edu.co', ['c-ihm', 'c-saw', 'c-req', 'c-bd']]
  ];
  const phones = ['3104567812', '3157894521', '3016549870', '3208765432', '3112233445', '3185566778', '3009988776', ''];
  people.forEach(([id, fullName, studentCode, docType, docNumber, email, classIds], i) => {
    db.users[id] = { id, uid: id, role: 'student', fullName, studentCode, docType, docNumber, email, phone: phones[i] || '', classIds, mustChangePassword: false, createdAt: now - (40 - i) * D, updatedAt: now - (40 - i) * D };
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
  posts.push({ id: 'p11', classId: 'c-bd', type: 'anuncio', title: 'Bienvenidos a Bases de Datos', body: 'Instalen PostgreSQL 16 antes de la primera sesión.', links: [], files: [], createdAt: now - 3 * D });
  posts.forEach((p) => { db.posts[p.id] = { ...p, ownerId: db.classes[p.classId].ownerId }; });

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
      id, postId, classId: p.classId, ownerId: p.ownerId, studentId: sid, studentName: u.fullName, studentCode: u.studentCode,
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
  notif(ADMIN_UID, 'submission', 'Nueva entrega · Camilo Andrés Zuluaga Toro', 'Reto 1 · Validador y hash de contraseñas', '#/tarea/p6', now - 0.5 * D);
  notif(ADMIN_UID, 'submission', 'Nueva entrega · Valentina Ríos Gómez', 'Reto 1 · Validador y hash de contraseñas', '#/tarea/p6', now - 1.5 * D, true);
  // ---------- Asistencia (ejemplo) ----------
  {
    const tz = -new Date().getTimezoneOffset();
    const lp = attLocal(now, tz);
    const s0 = Math.max(0, Math.floor((lp.min - 20) / 5) * 5), e0 = Math.min(1439, s0 + 150);
    const hh = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const days = { 1: { start: '07:00', end: '10:00', s: 420, e: 600 }, 3: { start: '07:00', end: '09:00', s: 420, e: 540 } };
    days[lp.dow] = { start: hh(s0), end: hh(e0), s: s0, e: e0 };
    const startDate = new Date(now - 35 * D + tz * 60000).toISOString().slice(0, 10);
    const ihm = db.classes['c-ihm'];
    const endDate = new Date(now + 80 * D + tz * 60000).toISOString().slice(0, 10);
    const k = (iso) => Number(iso.replace(/-/g, ''));
    ihm.attendance = { enabled: true, tz, before: 10, late: 15, startDate, endDate, startKey: k(startDate), endKey: k(endDate), days, extra: [], removed: [] };
    const stIhm = Object.values(db.users).filter((u) => (u.classIds || []).includes('c-ihm'));
    const today = attKey(lp);
    const pattern = ['presente', 'presente', 'presente', 'tarde', 'presente', 'ausente', 'presente', 'excusa', 'presente', 'presente', 'tarde'];
    attKeys(ihm, [], now).filter((k) => k !== today).forEach((k, i) => stIhm.forEach((u, j) => {
      if ((i + j) % 9 === 4) return; // sin registro: cuenta como ausencia
      const id = `c-ihm_${k}_${u.uid}`;
      db.attendance[id] = { id, classId: 'c-ihm', ownerId: ADMIN_UID, studentId: u.uid, studentName: u.fullName, dateKey: k, status: pattern[(i * 3 + j) % pattern.length], by: j % 2 ? 'teacher' : 'student', at: now - (i + 1) * 3 * D };
    }));
    stIhm.filter((u) => u.uid !== 's-valentina').slice(0, 3).forEach((u) => {
      const id = `c-ihm_${today}_${u.uid}`;
      db.attendance[id] = { id, classId: 'c-ihm', ownerId: ADMIN_UID, studentId: u.uid, studentName: u.fullName, dateKey: today, status: 'presente', by: 'student', at: now - 5 * 60000 };
    });
    void attMin;
  }

  // ---------- Prácticas empresariales (ejemplo ficticio) ----------
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const company = {
    name: 'Andes Software S.A.S.', nit: '900.456.789-1', sector: 'Desarrollo de software', city: 'Manizales', address: 'Carrera 23 # 65-12, Edificio Cumbre',
    phone: '6068901234', website: 'www.andessoftware.co', area: 'Fábrica de software',
    contactName: 'María Fernanda Ruiz Gómez', contactRole: 'Líder de desarrollo', contactPhone: '3124567890', contactEmail: 'mfruiz@andessoftware.co',
    startDate: iso(now - 58 * D), endDate: iso(now + 60 * D), paid: true, hours: '40', modality: 'presencial', schedule: 'Lunes a viernes · 8:00 – 17:00'
  };
  const proposal = {
    ...emptyProposal(), status: 'enviado', fillDate: iso(now - 50 * D), submittedAt: now - 3 * D,
    description: 'La práctica se desarrollará en el área de **Fábrica de software** de Andes Software S.A.S., encargada de construir, probar y mantener las aplicaciones web y móviles que la empresa ofrece a sus clientes del sector comercio.\nDurante la práctica, la estudiante participará en el **desarrollo, prueba y documentación** del módulo de facturación electrónica de la plataforma de ventas de la empresa.',
    needs: [
      { a: 'Pruebas de regresión manuales y repetitivas', b: 'Cada entrega demora dos días adicionales y se escapan errores a producción', c: 'Automatización de pruebas de extremo a extremo con Playwright' },
      { a: 'Documentación técnica desactualizada', b: 'Curva de aprendizaje alta para el personal nuevo', c: 'Guía técnica y funcional estandarizada del módulo' }
    ],
    expected: 'Un módulo de facturación electrónica probado, documentado e integrado con la plataforma de ventas, listo para su salida a producción.',
    objective: 'Desarrollar el módulo de facturación electrónica de la plataforma de ventas de **Andes Software S.A.S.**, mediante un proceso iterativo de construcción y pruebas automatizadas, para reducir el tiempo de emisión de facturas y los errores en producción.',
    specific: [
      'Especificar los requisitos funcionales y no funcionales del módulo con los interesados, para establecer una línea base validada.',
      'Diseñar la arquitectura y el modelo de datos del módulo, conforme a la normativa de facturación electrónica vigente.',
      'Implementar el módulo mediante iteraciones de dos semanas, integrándolo con la plataforma de ventas.',
      'Validar el módulo con pruebas automatizadas y de aceptación, y documentar la solución para su mantenimiento.'
    ],
    methodIntro: 'La práctica se desarrollará con un enfoque **iterativo e incremental**, articulado al ciclo de trabajo de la Fábrica de software, durante diecisiete semanas.',
    phases: [
      { title: 'Inducción y levantamiento de requisitos (semanas 1 a 3)', oes: 'OE1', text: 'Reconocimiento de la plataforma de ventas, entrevistas con los interesados y especificación de requisitos.' },
      { title: 'Diseño (semanas 4 y 5)', oes: 'OE2', text: 'Definición de la arquitectura, el modelo de datos y los prototipos de interfaz.' },
      { title: 'Construcción iterativa (semanas 6 a 14)', oes: 'OE3', text: 'Desarrollo por sprints de dos semanas con revisión del líder de desarrollo.' },
      { title: 'Validación, documentación y cierre (semanas 15 a 17)', oes: 'OE4', text: 'Pruebas automatizadas, pruebas de aceptación y entrega de la documentación.' }
    ],
    activities: [
      { oe: 'OE1', act: 'Realizar la inducción y levantar los requisitos del módulo.', ent: 'Documento de especificación de requisitos', ini: iso(now - 58 * D), fin: iso(now - 40 * D) },
      { oe: 'OE2', act: 'Diseñar la arquitectura y el modelo de datos.', ent: 'Documento de arquitectura; modelo entidad-relación', ini: iso(now - 39 * D), fin: iso(now - 26 * D) },
      { oe: 'OE3', act: 'Construir el módulo por sprints.', ent: 'Código fuente versionado; incrementos funcionales', ini: iso(now - 25 * D), fin: iso(now + 38 * D) },
      { oe: 'OE4', act: 'Validar, documentar y entregar el módulo.', ent: 'Informe de pruebas; manual técnico', ini: iso(now + 39 * D), fin: iso(now + 60 * D) }
    ]
  };
  const final = defaultFinal({ teacher: TEACHER_NAME, company, proposal });
  final.cover.title = 'Módulo de facturación electrónica para la plataforma de ventas de Andes Software S.A.S.';
  final.chapters[0].blocks[0].text = 'La facturación electrónica es hoy una obligación tributaria para la mayoría de las empresas en Colombia y un factor clave en la eficiencia de sus procesos comerciales.\nEste informe presenta el trabajo realizado durante la práctica empresarial en Andes Software S.A.S.';
  const prA = 'pr-valentina';
  db.practices[prA] = {
    id: prA, ownerId: ADMIN_UID, ownerName: TEACHER_NAME, studentId: 's-valentina', studentName: 'Valentina Ríos Gómez', studentCode: '1702310045',
    studentDoc: '1053845120', studentDocType: 'CC', studentEmail: 'valentina.rios@ucaldas.edu.co', studentPhone: '3104567812',
    period: currentPeriod(), status: 'activa', company, proposal, final, createdAt: now - 60 * D, updatedAt: now - 3 * D
  };
  db.practiceComments['pc-1'] = { id: 'pc-1', practiceId: prA, doc: 'proposal', section: 'Objetivos específicos', authorId: ADMIN_UID, authorName: TEACHER_NAME, role: 'teacher', text: 'Los objetivos están bien formulados. En el OE4 separe la validación de la documentación: son dos logros distintos.', resolved: false, createdAt: now - 2 * D };
  db.practiceComments['pc-2'] = { id: 'pc-2', practiceId: prA, doc: 'proposal', section: 'Actividades', authorId: 's-valentina', authorName: 'Valentina Ríos Gómez', role: 'student', text: 'Entendido, profesor. Lo ajusto y vuelvo a enviar la propuesta.', resolved: false, createdAt: now - 1.5 * D };
  const at = (days, h) => { const d = new Date(now + days * D); d.setHours(h, 0, 0, 0); return d.getTime(); };
  db.visits['v-1'] = { id: 'v-1', practiceId: prA, ownerId: ADMIN_UID, studentId: 's-valentina', date: at(-20, 10), duration: 60, mode: 'presencial', place: 'Carrera 23 # 65-12, Edificio Cumbre, piso 4', notes: 'Primera visita de seguimiento.', status: 'realizada',
    acta: { responsible: 'María Fernanda Ruiz Gómez', development: 'La visita se realizó en las instalaciones de la empresa con la participación de la líder de desarrollo. Se verificó el avance en el levantamiento de requisitos y el diseño de la arquitectura del módulo.\nLa empresa manifiesta satisfacción con el desempeño de la estudiante. Se acuerda presentar el prototipo funcional en la próxima visita.', done: true, completedAt: at(-20, 12) }, createdAt: now - 25 * D };
  db.visits['v-2'] = { id: 'v-2', practiceId: prA, ownerId: ADMIN_UID, studentId: 's-valentina', date: at(9, 15), duration: 45, mode: 'virtual', place: 'https://meet.google.com/abc-defg-hij', notes: 'Revisión del prototipo funcional.', status: 'programada', acta: { responsible: '', development: '', done: false }, createdAt: now - 1 * D };
  db.practices['pr-santiago'] = {
    id: 'pr-santiago', ownerId: ADMIN_UID, ownerName: TEACHER_NAME, studentId: 's-santiago', studentName: 'Santiago Marín López', studentCode: '1702310078',
    studentDoc: '1053811234', studentDocType: 'CC', studentEmail: 'santiago.marin@ucaldas.edu.co', studentPhone: '3157894521',
    period: currentPeriod(), status: 'activa', company: { name: 'Cooperativa Cafetera del Centro', city: 'Manizales', area: 'Tecnología', contactName: '', contactRole: '', contactPhone: '', contactEmail: '', startDate: iso(now - 10 * D), endDate: iso(now + 110 * D), paid: false },
    proposal: emptyProposal(), final: null, createdAt: now - 12 * D, updatedAt: now - 12 * D
  };
  db.visits['v-3'] = { id: 'v-3', practiceId: 'pr-santiago', ownerId: ADMIN_UID, studentId: 's-santiago', date: at(3, 9), duration: 60, mode: 'presencial', place: 'Sede principal de la cooperativa', notes: 'Visita de inicio.', status: 'programada', acta: { responsible: '', development: '', done: false }, createdAt: now - 2 * D };

  return db;
}

export function createBackend() {
  let db;
  try { db = JSON.parse(store.get(KEY)) || seed(); } catch { db = seed(); }
  for (const k of ['practices', 'practiceComments', 'practiceFiles', 'visits', 'attendance']) db[k] = db[k] || {};
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

  // ¿El usuario actual enseña en la clase? (dueño, colaborador o administrador)
  const teaches = (cid) => { const c = db.classes[cid]; return !!c && (current?.uid === ADMIN_UID || c.ownerId === current?.uid || (c.coTeachers || []).includes(current?.uid)); };

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
      if (db.settings.allowSelfRegistration === false) throw err('app/registration-closed');
      db.users[uid] = { id: uid, uid, role: 'student', fullName: d.fullName, studentCode: d.studentCode, docType: d.docType, docNumber: d.docNumber, email, phone: d.phone || '', classIds: d.classIds, mustChangePassword: false, createdAt: Date.now(), updatedAt: Date.now() };
      commit();
      setSession({ uid, email });
    },
    async changePassword(currentPass, next) {
      await wait(); need();
      const acc = db.accounts[current.email];
      if (!acc || acc.password !== currentPass) throw err('auth/wrong-password');
      acc.password = next; commit();
    },
    async completePasswordChange(currentPass, next) {
      await this.changePassword(currentPass, next);
      const u = db.users[current.uid];
      if (u) { u.mustChangePassword = false; u.passwordChangedAt = Date.now(); }
      commit();
    },
    // Cuentas creadas por el docente / administrador (no cambia la sesión actual)
    async provisionAccount({ password, profile }) {
      await wait(350); need();
      const email = profile.email.trim().toLowerCase();
      if (email === TEACHER_EMAIL.toLowerCase()) throw err('app/teacher-email');
      if (db.accounts[email]) throw err('auth/email-already-in-use');
      if (profile.role === 'student' && (db.uniques[codeKey(profile.studentCode)] || db.uniques[docKey(profile.docType, profile.docNumber)])) throw err('app/duplicate');
      const uid = (profile.role === 'teacher' ? 't-' : 's-') + newId();
      db.accounts[email] = { uid, password };
      if (profile.role === 'student') {
        db.uniques[codeKey(profile.studentCode)] = { uid };
        db.uniques[docKey(profile.docType, profile.docNumber)] = { uid };
      }
      db.users[uid] = { ...clone(profile), id: uid, uid, email, mustChangePassword: true, createdBy: current.uid, createdAt: Date.now(), updatedAt: Date.now() };
      commit();
      return uid;
    },
    async updateUser(id, data) { await wait(); if (!db.users[id]) throw err('permission-denied'); Object.assign(db.users[id], clone(data), { updatedAt: Date.now() }); commit(); },
    watchTeachers: (cb) => watch(() => values('users').filter((u) => u.role === 'teacher'), cb),
    watchSettings: (cb) => watch(() => ({ allowSelfRegistration: true, ...clone(db.settings || {}) }), cb),
    async saveSettings(data) { await wait(); db.settings = { ...(db.settings || {}), ...clone(data) }; commit(); },
    async migrateLegacy() { return 0; },
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
    async joinClasses(id, ids) {
      await wait(); const u = db.users[id];
      if (current?.uid === id && db.settings.allowSelfRegistration === false) throw err('permission-denied'); u.classIds = [...new Set([...(u.classIds || []), ...ids])]; commit(); },
    async removeFromClass(id, cid) { await wait(); const u = db.users[id]; u.classIds = (u.classIds || []).filter((x) => x !== cid); commit(); },
    watchStudents: (cb) => watch(() => values('users').filter((u) => u.role === 'student' || u.studentAccess === true), cb),
    async grantStudentAccess(t, { studentCode, classIds }) {
      await wait(); need();
      const u = db.users[t.uid];
      const had = u.studentAccess === true;
      const newC = codeKey(studentCode), oldC = u.studentCode ? codeKey(u.studentCode) : null, dK = docKey(u.docType, u.docNumber);
      if ((newC !== oldC || !had) && db.uniques[newC] && db.uniques[newC].uid !== u.uid) throw err('app/duplicate');
      if (!had && db.uniques[dK] && db.uniques[dK].uid !== u.uid) throw err('app/duplicate');
      if (had && oldC && oldC !== newC) delete db.uniques[oldC];
      db.uniques[newC] = { uid: u.uid }; db.uniques[dK] = { uid: u.uid };
      Object.assign(u, { studentAccess: true, studentCode, classIds: clone(classIds), updatedAt: Date.now() });
      commit();
    },
    async promoteStudent(st) { await wait(); need(); Object.assign(db.users[st.uid], { role: 'teacher', active: true, studentAccess: true, promotedAt: Date.now(), updatedAt: Date.now() }); commit(); },
    async demoteToStudent(t) { await wait(); need(); Object.assign(db.users[t.uid], { role: 'student', studentAccess: false, updatedAt: Date.now() }); commit(); },
    async revokeStudentAccess(t) {
      await wait(); need();
      const u = db.users[t.uid];
      if (u.studentCode) delete db.uniques[codeKey(u.studentCode)];
      delete db.uniques[docKey(u.docType, u.docNumber)];
      Object.assign(u, { studentAccess: false, updatedAt: Date.now() });
      commit();
    },

    watchClasses: (cb) => watch(() => values('classes'), cb),
    async listOpenClasses() { await wait(300); return values('classes').filter((c) => !c.archived); },
    async createClass(data) { await wait(); const id = 'c-' + newId(); db.classes[id] = { id, ...data, archived: false, createdAt: Date.now() }; commit(); return { id }; },
    async updateClass(id, data) {
      await wait(); need();
      const c = db.classes[id];
      if (!c) throw err('permission-denied');
      // Mismas reglas que Firestore: el colaborador no cambia dueño, colaboradores ni archivo (salvo retirarse él mismo)
      if (c.ownerId !== current.uid && current.uid !== ADMIN_UID) {
        if (!(c.coTeachers || []).includes(current.uid)) throw err('permission-denied');
        const leaving = Object.keys(data).every((k) => ['coTeachers', 'coTeacherInfo'].includes(k))
          && JSON.stringify(data.coTeachers) === JSON.stringify((c.coTeachers || []).filter((u) => u !== current.uid));
        if (!leaving && ['ownerId', 'ownerName', 'coTeachers', 'coTeacherInfo', 'archived', 'archivedAt'].some((k) => k in data)) throw err('permission-denied');
      }
      Object.assign(c, clone(data)); commit();
    },
    async findTeacherByEmail(email) { await wait(300); need(); const e = email.trim().toLowerCase(); return clone(values('users').find((u) => u.role === 'teacher' && u.email === e) || null); },

    watchPostsByClass: (cid, cb) => watch(() => values('posts').filter((p) => p.classId === cid), cb),
    watchAllPosts: (cb) => watch(() => values('posts'), cb),
    watchPostsByOwner: (uid, cb) => watch(() => values('posts').filter((p) => p.ownerId === uid), cb),
    async createPost(p) { await wait(); if (!teaches(p.classId) || p.ownerId !== db.classes[p.classId].ownerId) throw err('permission-denied'); const id = 'p-' + newId(); db.posts[id] = { id, ...p, createdAt: Date.now() }; commit(); return id; },
    async deletePost(id) { await wait(); if (!teaches(db.posts[id]?.classId)) throw err('permission-denied'); delete db.posts[id]; commit(); },
    async markEmailed(id, n) { if (db.posts[id]) { Object.assign(db.posts[id], { lastEmailAt: Date.now(), lastEmailCount: n }); commit(); } },
    async idToken() { return 'demo-token'; },
    async updatePost(id, data) { await wait(); if (!db.posts[id] || !teaches(db.posts[id].classId)) throw err('permission-denied'); Object.assign(db.posts[id], clone(data), { updatedAt: Date.now() }); commit(); },

    watchSubmissionsBy: (field, value, cb, scope) => {
      const sc = typeof scope === 'string' ? { ownerId: scope } : (scope || {});
      return watch(() => values('submissions').filter((s) => s[field] === value && (!sc.ownerId || s.ownerId === sc.ownerId) && (!sc.classId || s.classId === sc.classId)), cb);
    },
    async submit(s) {
      await wait(600);
      const id = `${s.postId}_${s.studentId}`;
      if (db.submissions[id]?.grade != null) throw err('permission-denied');
      if (db.classes[s.classId]?.ownerId === current?.uid) throw err('permission-denied');
      db.submissions[id] = { id, ...clone(s), grade: null, feedback: '', status: 'entregado', submittedAt: Date.now(), gradedAt: null };
      commit();
    },
    async grade(g) {
      await wait(450);
      const id = `${g.postId}_${g.studentId}`;
      if (!teaches(g.classId || db.submissions[id]?.classId)) throw err('permission-denied');
      db.submissions[id] = { id, ...(db.submissions[id] || {}), ...clone(g), status: 'calificado', gradedAt: Date.now() };
      commit();
    },
    async returnSubmission(r) {
      await wait(450);
      const id = `${r.postId}_${r.studentId}`;
      const cur = db.submissions[id];
      if (!cur || !teaches(cur.classId)) throw err('permission-denied');
      Object.assign(cur, { status: 'devuelto', grade: null, gradedAt: null, submittedAt: null, prevSubmittedAt: r.prevSubmittedAt || null,
        returnNote: r.returnNote, returnDueAt: r.returnDueAt || null, returnCount: r.returnCount, returnedAt: Date.now() });
      commit();
    },

    // ---------- Consumo (datos simulados) ----------
    watchMetrics(cb) {
      const t = Date.now(), days = [];
      const d0 = new Date(); d0.setDate(1);
      for (let i = 0; i < new Date().getDate(); i++) {
        const d = new Date(d0); d.setDate(1 + i);
        const busy = [1, 3].includes(d.getDay());
        days.push({ d: d.toISOString().slice(0, 10), reads: busy ? 31000 + i * 450 : 6000 + i * 180, writes: busy ? 2400 : 600, deletes: 30 });
      }
      const today = { reads: 46210, writes: 3140, deletes: 42 };
      if (days.length) Object.assign(days[days.length - 1], today);
      const sum = (k) => days.reduce((a, x) => a + x[k], 0);
      const reset = new Date(); reset.setHours(26, 0, 0, 0);
      setTimeout(() => cb({ id: 'usage', updatedAt: t - 22 * 60000, quotaDay: '', resetsAt: reset.getTime(), today, month: { reads: sum('reads'), writes: sum('writes'), deletes: sum('deletes') },
        limits: { reads: 50000, writes: 20000, deletes: 20000 }, threshold: 0.9, alerts: ['reads'], days }, null), 150);
      return () => {};
    },

    // ---------- Asistencia ----------
    watchAttendance: (filters, cb) => watch(() => values('attendance').filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v)), cb),
    async setAttendance(id, data) {
      await wait(120); need();
      const c = db.classes[data.classId];
      if (!c || !teaches(c.id)) throw err('permission-denied');
      db.attendance[id] = { id, ...(db.attendance[id] || {}), ...clone(data), at: Date.now() }; commit();
    },
    async deleteAttendance(id) { await wait(100); delete db.attendance[id]; commit(); },
    async checkIn(id, data) {
      await wait(350); need();
      const c = db.classes[data.classId], s = attOpen(c);
      // Mismas validaciones que las reglas de Firestore
      if (db.attendance[id]) throw err('permission-denied');
      if (!c || !s || data.studentId !== current.uid || !(db.users[current.uid]?.classIds || []).includes(c.id)
        || data.dateKey !== s.dateKey || data.status !== s.status) throw err('permission-denied');
      db.attendance[id] = { id, ...clone(data), at: Date.now() }; commit();
    },

    // ---------- Prácticas empresariales ----------
    watchPractices: (field, value, cb) => watch(() => values('practices').filter((p) => p[field] === value), cb),
    async createPractice(p) {
      await wait(); need();
      if (p.studentId === current.uid) throw err('permission-denied');
      const id = 'pr-' + newId();
      db.practices[id] = { id, ...clone(p), createdAt: Date.now(), updatedAt: Date.now() };
      commit(); return id;
    },
    async updatePractice(id, data) {
      await wait(180); need();
      const cur = db.practices[id];
      if (!cur) throw err('permission-denied');
      if (cur.studentId === current.uid) {
        const allowed = ['company', 'proposal', 'final'];
        if (Object.keys(data).some((k) => !allowed.includes(k)) || (cur.status || 'activa') !== 'activa') throw err('permission-denied');
        for (const k of ['proposal', 'final']) if (k in data && cur[k]?.status === 'aprobado') throw err('permission-denied');
        for (const k of ['proposal', 'final']) if (data[k]?.status === 'aprobado') throw err('permission-denied');
      } else if (cur.ownerId !== current.uid && current.uid !== ADMIN_UID) throw err('permission-denied');
      Object.assign(cur, clone(data), { updatedAt: Date.now(), updatedBy: current.uid });
      commit();
    },
    async deletePractice(id) { await wait(); delete db.practices[id]; Object.values(db.visits).forEach((v) => { if (v.practiceId === id) delete db.visits[v.id]; }); commit(); },
    watchPracticeComments: (pid, cb) => watch(() => values('practiceComments').filter((c) => c.practiceId === pid).sort((a, b) => a.createdAt - b.createdAt), cb),
    async addPracticeComment(pid, c) { await wait(200); const id = 'pc-' + newId(); db.practiceComments[id] = { id, practiceId: pid, ...clone(c), createdAt: Date.now() }; commit(); return id; },
    async updatePracticeComment(pid, cid, data) { await wait(150); if (db.practiceComments[cid]) { Object.assign(db.practiceComments[cid], clone(data)); commit(); } },
    async deletePracticeComment(pid, cid) { await wait(150); delete db.practiceComments[cid]; commit(); },
    watchPracticeFiles: (pid, field, uid, cb) => watch(() => values('practiceFiles').filter((f) => f.practiceId === pid), cb),
    async addPracticeFile(f) { await wait(250); const id = 'pf-' + newId(); db.practiceFiles[id] = { id, ...clone(f), createdAt: Date.now() }; commit(); return id; },
    async deletePracticeFile(id) { await wait(150); delete db.practiceFiles[id]; commit(); },
    watchVisits: (field, value, cb) => watch(() => values('visits').filter((v) => v[field] === value), cb),
    async createVisit(v) { await wait(); const id = 'v-' + newId(); db.visits[id] = { id, ...clone(v), createdAt: Date.now() }; commit(); return id; },
    async updateVisit(id, data) { await wait(200); if (!db.visits[id]) throw err('not-found'); Object.assign(db.visits[id], clone(data), { updatedAt: Date.now() }); commit(); },
    async deleteVisit(id) { await wait(150); delete db.visits[id]; commit(); },

    watchNotifications: (key, cb) => watch(() => values('notifications').filter((n) => n.userId === key).sort((a, b) => b.createdAt - a.createdAt).slice(0, 40), cb),
    async addNotifications(items) {
      items.forEach((n) => { const id = newId(); db.notifications[id] = { id, ...n, read: false, createdAt: Date.now() }; });
      commit();
    },
    async markRead(id) { if (db.notifications[id]) { db.notifications[id].read = true; commit(); } },
    async markAllRead(ids) { ids.forEach((id) => { if (db.notifications[id]) db.notifications[id].read = true; }); commit(); }
  };
}
