// Núcleo de la aplicación: sesión, suscripciones en tiempo real, estructura y enrutador
import { S, ctx, setUpdater, emit, teacherName, coClasses } from './state.js';
import { TEACHER_EMAIL, TEACHER_NAME, APP } from './firebase-config.js';
import * as ui from './ui.js';
import { icon, LOGO } from './icons.js';
import { esc, timeAgo, errMsg } from './util.js';
import { avatar } from './components.js';
import { startBackground } from './bg.js';
import { renderLogin, renderRegister, renderForceChange, renderNotice } from './views-auth.js';
import * as Teacher from './views-teacher.js';
import * as Student from './views-student.js';
import * as Admin from './views-admin.js';
import * as Enroll from './views-enroll.js';
import * as Practica from './views-practica.js';

let current = null;          // vista montada { update, destroy }
let subs = [];               // suscripciones globales
let postSubs = new Map();    // (estudiante) suscripciones por clase
let postsByClass = new Map();
// (docente) clases compartidas como colaborador: publicaciones y entregas pendientes por clase
let coSubs = new Map();      // classId → { sig, un[] }
let coPosts = new Map(), coPend = new Map();
let ownPosts = [], ownPending = [], coActive = false;
let shellMounted = false;
let navSig = '';
let seenNotifs = null;
let waitingProfile = false;
let lastGate = '';
// "Compuerta" de acceso: si cambia (perfil cargado, clave cambiada, docente deshabilitado) se vuelve a enrutar
const gateKey = () => `${S.role === 'student' && S.practices.length ? 'P' : ''}|${!!S.user}|${S.isAdmin}|${S.dual ? 1 : 0}|${S.ready.profile ? 1 : 0}|${!!S.profile}|${S.profile?.mustChangePassword ? 1 : 0}|${S.profile?.active === false ? 0 : 1}|${S.role}`;

export function start(backend, { demo }) {
  ctx.B = backend; ctx.demo = demo;
  ui.initTheme();
  startBackground();
  setUpdater(() => {
    if (S.user && gateKey() !== lastGate) { route(); return; }
    try { current?.update?.(); } catch (e) { console.error(e); }
    updateChrome();
  });
  // Ajuste público: registro libre de estudiantes habilitado o no
  backend.watchSettings((st) => { S.settings = st; emit(); });
  backend.onAuth(onAuth);
  window.addEventListener('hashchange', route);
}

function clearSubs() {
  subs.forEach((u) => { try { u?.(); } catch { /* */ } });
  subs = [];
  postSubs.forEach((u) => u());
  postSubs.clear(); postsByClass.clear();
  coSubs.forEach((x) => x.un.forEach((u) => u()));
  coSubs.clear(); coPosts.clear(); coPend.clear(); ownPosts = []; ownPending = []; coActive = false;
}
function destroyCurrent() { try { current?.destroy?.(); } catch { /* */ } current = null; }

// ---------- Doble rol (docente con acceso de estudiante) ----------
const modeKey = (uid) => `an-mode-${uid}`;
const readMode = (uid) => { try { return localStorage.getItem(modeKey(uid)); } catch { return null; } };
const saveMode = (uid, m) => { try { localStorage.setItem(modeKey(uid), m); } catch { /* */ } };
// Cambia entre "Vista docente" y "Vista estudiante": reinicia las suscripciones del rol elegido
export function switchMode(mode, link = '#/') {
  if (!S.user || !S.dual || mode === S.role) return;
  saveMode(S.user.uid, mode);
  history.replaceState(null, '', link);
  onAuth(S.user);
  ui.toast(mode === 'student' ? 'Vista estudiante' : 'Vista docente', 'info', mode === 'student' ? 'Está viendo sus clases como estudiante.' : 'Está gestionando sus clases como docente.', 3000);
}
// Las notificaciones de entregas son del rol docente; las demás (publicaciones, notas, inscripciones) del rol estudiante
const notifMode = (n) => n.mode || (n.type === 'submission' ? 'teacher' : 'student');

function onAuth(user) {
  clearSubs(); destroyCurrent();
  // Al cambiar de sesión se cierran las ventanas emergentes abiertas
  document.getElementById('modals').innerHTML = '';
  document.body.style.overflow = '';
  shellMounted = false; seenNotifs = null; waitingProfile = false; lastGate = '';
  Object.assign(S, { user, role: null, isAdmin: false, dual: false, profile: null, classes: [], students: [], teachers: [], posts: [], notifications: [], mySubs: [], pendingSubs: [], practices: [], visits: [], myAttendance: [], ready: {} });
  if (!user) { route(); return; }

  const B = ctx.B;
  S.isAdmin = (user.email || '').trim().toLowerCase() === String(TEACHER_EMAIL || '').trim().toLowerCase();
  subs.push(B.watchClasses((l) => { S.classes = l; S.ready.classes = true; if (coActive) syncCoTeaching(); emit(); }));
  subs.push(B.watchNotifications(user.uid, handleNotifs));

  let started = false;
  const startRole = () => {
    if (started) return;
    started = true;
    if (S.role === 'teacher') startTeacher(user); else startStudent(user);
  };

  if (S.isAdmin) {
    S.role = 'teacher';
    // Perfil opcional del administrador (no es obligatorio en /users)
    subs.push(B.watchProfile(user.uid, (p) => { S.profile = p; S.ready.profile = true; emit(); }));
    // Migración única de datos de la versión anterior (un solo docente)
    Promise.resolve(B.migrateLegacy?.(user.uid, TEACHER_NAME))
      .then((n) => { if (n) ui.toast('Datos actualizados', 'success', `Se asignaron ${n} registros anteriores a su cuenta.`); })
      .catch((e) => console.error('[migración]', e))
      .finally(startRole);
  } else {
    subs.push(B.watchProfile(user.uid, (p, error) => {
      S.profile = p;
      S.profileError = error ? (error.code || 'error') : null;
      S.ready.profile = true;
      if (p) {
        // Solo el administrador puede otorgar studentAccess a un docente
        const wasDual = S.dual;
        S.dual = p.role === 'teacher' && p.studentAccess === true;
        if (started && wasDual !== S.dual) shellMounted = false; // mostrar u ocultar el selector en vivo
        const want = p.role !== 'teacher' ? 'student' : (S.dual && readMode(user.uid) === 'student' ? 'student' : 'teacher');
        if (started && want !== S.role) { onAuth(user); return; } // p. ej., le retiraron el acceso estando en vista estudiante
        S.role = want;
        startRole();
        if (S.role === 'student') syncClassPosts(p.classIds || []);
        if (p.email && user.email && p.email !== user.email) B.syncEmail?.(user.uid, user.email);
      }
      emit();
    }));
  }
  route();
}

function startTeacher(user) {
  const B = ctx.B;
  subs.push(B.watchStudents((l) => { S.students = l; S.ready.students = true; emit(); }));
  const tick = setInterval(emit, 30000); subs.push(() => clearInterval(tick)); // abre/cierra sesiones de asistencia a tiempo
  subs.push(B.watchMetrics((m, e) => { S.metrics = m; S.metricsError = e ? (e.code || e.message) : null; emit(); }));
  subs.push(B.watchPostsByOwner(user.uid, (l) => { ownPosts = l; S.ready.posts = true; mergeTeacher(); }));
  subs.push(B.watchSubmissionsBy('status', 'entregado', (l) => { ownPending = l; S.ready.pending = true; mergeTeacher(); }, user.uid));
  coActive = true;
  syncCoTeaching();
  if (S.isAdmin) subs.push(B.watchTeachers((l) => { S.teachers = l; S.ready.teachers = true; emit(); }));
  subs.push(B.watchPractices('ownerId', user.uid, (l, e) => { S.practices = l; S.practicesError = e ? (e.code || e.message) : null; S.ready.practices = true; emit(); }));
  subs.push(B.watchVisits('ownerId', user.uid, (l) => { S.visits = l; S.ready.visits = true; emit(); }));
}
function startStudent(user) {
  subs.push(ctx.B.watchSubmissionsBy('studentId', user.uid, (l) => { S.mySubs = l; S.ready.subs = true; emit(); }));
  const tick = setInterval(emit, 30000); subs.push(() => clearInterval(tick));
  subs.push(ctx.B.watchAttendance({ studentId: user.uid }, (l) => { S.myAttendance = l; S.ready.attendance = true; emit(); }));
  subs.push(ctx.B.watchPractices('studentId', user.uid, (l, e) => { S.practices = l; S.practicesError = e ? (e.code || e.message) : null; S.ready.practices = true; emit(); }));
  subs.push(ctx.B.watchVisits('studentId', user.uid, (l) => { S.visits = l; S.ready.visits = true; emit(); }));
}

// Clases donde el docente es colaborador: publicaciones y entregas por calificar de cada una
// (las reglas exigen filtrar por classId para comprobar que la clase está compartida con él)
function syncCoTeaching() {
  const want = new Map(coClasses().map((c) => [c.id, c.ownerId]));
  for (const [cid, x] of coSubs) if (want.get(cid) !== x.sig) { x.un.forEach((u) => u()); coSubs.delete(cid); coPosts.delete(cid); coPend.delete(cid); }
  for (const [cid, owner] of want) {
    if (coSubs.has(cid)) continue;
    coSubs.set(cid, { sig: owner, un: [
      ctx.B.watchPostsByClass(cid, (l) => { coPosts.set(cid, l); mergeTeacher(); }),
      ctx.B.watchSubmissionsBy('status', 'entregado', (l) => { coPend.set(cid, l); mergeTeacher(); }, { ownerId: owner, classId: cid })
    ] });
  }
  mergeTeacher();
}
function mergeTeacher() {
  const uniq = (arr) => [...new Map(arr.map((x) => [x.id, x])).values()];
  S.posts = uniq([...ownPosts, ...[...coPosts.values()].flat()]);
  S.pendingSubs = uniq([...ownPending, ...[...coPend.values()].flat()]);
  emit();
}

// Suscripción a publicaciones de cada clase inscrita (reglas: una consulta por clase)
function syncClassPosts(ids) {
  for (const [cid, un] of postSubs) if (!ids.includes(cid)) { un(); postSubs.delete(cid); postsByClass.delete(cid); }
  for (const cid of ids) {
    if (postSubs.has(cid)) continue;
    postSubs.set(cid, ctx.B.watchPostsByClass(cid, (l) => {
      postsByClass.set(cid, l);
      S.posts = [...postsByClass.values()].flat();
      S.ready.posts = true;
      emit();
    }));
  }
  if (!ids.length) { S.posts = []; S.ready.posts = true; }
}

// ---------- Notificaciones ----------
function handleNotifs(list) {
  const prev = seenNotifs;
  S.notifications = list;
  if (prev) {
    const fresh = list.filter((n) => !prev.has(n.id) && !n.read);
    if (fresh.length) {
      ringBell();
      fresh.slice(0, 2).forEach((n) => ui.toast(n.title, n.type === 'grade' ? 'success' : n.type === 'returned' ? 'warn' : 'info', n.message, 5500));
    }
  }
  seenNotifs = new Set(list.map((n) => n.id));
  updateChrome();
}
function ringBell() {
  const b = document.querySelector('.bell-btn');
  if (!b) return;
  // Clase exclusiva de la campana ("is-ringing"): no debe compartir nombre con el anillo de notas (.ring)
  b.classList.remove('is-ringing'); void b.offsetWidth; b.classList.add('is-ringing');
  b.addEventListener('animationend', () => b.classList.remove('is-ringing'), { once: true });
}
const NOTIF_IC = { post: 'megaphone', grade: 'award', submission: 'upload', returned: 'undo', practice: 'briefcase', visit: 'calendar' };
function renderNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel || panel.classList.contains('hidden')) return;
  const unread = S.notifications.filter((n) => !n.read).length;
  panel.innerHTML = `
    <div class="np-head"><h3>Notificaciones</h3>${unread ? `<button class="link-btn" data-np-all style="font-size:13px">Marcar todo como leído</button>` : `<span class="muted" style="font-size:12.5px">Al día</span>`}</div>
    <div class="np-list">
      ${S.notifications.length ? S.notifications.map((n) => `
        <button class="np-item ${n.type} ${n.read ? '' : 'unread'}" data-np="${n.id}">
          <div class="np-ic">${icon(NOTIF_IC[n.type] || 'bell')}</div>
          <div class="np-body"><b>${esc(n.title)}</b>${n.message ? `<p>${esc(n.message)}</p>` : ''}<small>${timeAgo(n.createdAt)}</small></div>
        </button>`).join('') : `<div class="np-empty">${icon('bell')}No tiene notificaciones todavía.</div>`}
    </div>`;
}

// ---------- Estructura (sidebar, barra superior, navegación inferior) ----------
const navFor = () => {
  if (S.role === 'student') {
    return [['', 'home', 'Inicio'], ['clases', 'book', 'Mis clases'], ['calificaciones', 'award', 'Notas'],
      ...(S.practices.length ? [['mi-practica', 'briefcase', 'Mi práctica']] : []), ['perfil', 'user', 'Mi perfil']];
  }
  return [
    ['', 'home', 'Panel'], ['clases', 'book', 'Clases'], ['estudiantes', 'users', 'Estudiantes'],
    ['inscripciones', 'userPlus', 'Inscripciones'], ['practicas', 'briefcase', 'Prácticas'], ['archivadas', 'archive', 'Archivadas'],
    ...(S.isAdmin ? [['admin', 'sliders', 'Administración']] : []),
    ['cuenta', 'user', 'Cuenta']
  ];
};
const ACTIVE_ALIAS = { clase: 'clases', tarea: 'clases', estudiante: 'estudiantes', practica: 'practicas' };
const routesFor = () => (S.role === 'student'
  ? { ...Student.routes, ...Practica.studentRoutes }
  : { ...Teacher.routes, ...Enroll.routes, ...Practica.teacherRoutes, ...(S.isAdmin ? Admin.routes : {}) });

function mountShell() {
  const root = document.getElementById('root');
  const nav = navFor();
  // En celular la barra inferior muestra máximo 5 accesos; el resto queda en "Más" (menú lateral)
  const bottom = nav.length > 5 ? nav.slice(0, 4) : nav;
  const links = (cls = '') => nav.map(([h, ic, label]) => `<a href="#/${h}" data-nav="${h}" class="${cls}">${icon(ic)}<span>${label}</span><i class="count hidden" data-count="${h}"></i></a>`).join('');
  root.innerHTML = `
  <div class="app">
    <aside class="sidebar" id="sidebar" aria-label="Navegación principal">
      <a class="brand" href="#/">${LOGO}<div><b>${APP.name}</b><small>${S.isAdmin ? 'Administración' : S.role === 'teacher' ? 'Panel docente' : S.dual ? 'Vista estudiante' : 'Portal estudiante'}</small></div></a>
      <div class="nav-label">Navegación</div>
      <nav class="nav">${links()}</nav>
      <div class="sidebar-foot">
        <div class="sys-status"><i></i>${ctx.demo ? 'MODO DEMO · LOCAL' : 'FIRESTORE · EN LÍNEA'}</div>
        <div class="user-card" id="user-card"></div>
      </div>
    </aside>
    <div class="scrim" id="scrim"></div>
    <div class="main">
      <header class="topbar">
        <button class="btn btn-ghost btn-icon menu-btn" id="menu-btn" aria-label="Abrir menú">${icon('menu')}</button>
        <div class="crumb" id="crumb"></div>
        <div class="top-actions">
          ${S.dual ? `<div class="role-switch" role="group" aria-label="Cambiar de vista">
            <button type="button" data-mode="teacher" class="${S.role === 'teacher' ? 'active' : ''}" aria-pressed="${S.role === 'teacher'}" title="Vista docente">${icon('grad')}<span>Docente</span></button>
            <button type="button" data-mode="student" class="${S.role === 'student' ? 'active' : ''}" aria-pressed="${S.role === 'student'}" title="Vista estudiante">${icon('user')}<span>Estudiante</span></button>
          </div>` : ''}
          ${ctx.demo ? `<button class="demo-pill" id="demo-pill" title="Datos de ejemplo guardados en este navegador. Clic para restablecer.">${icon('cpu')}<span>DEMO</span></button>` : ''}
          ${ui.themeButton()}
          <div class="bell-wrap">
            <button class="btn btn-ghost btn-icon bell-btn" id="bell-btn" aria-label="Notificaciones" aria-haspopup="true">${icon('bell')}<span class="badge-count hidden" id="bell-count"></span></button>
            <div class="notif-panel hidden" id="notif-panel" role="dialog" aria-label="Notificaciones"></div>
          </div>
        </div>
      </header>
      <main id="view" class="view"></main>
    </div>
    <nav class="bottom-nav" aria-label="Navegación inferior">${bottom.map(([h, ic, label]) => `<a href="#/${h}" data-nav="${h}">${icon(ic)}<span>${label}</span></a>`).join('')}${nav.length > 5 ? `<a href="#" id="more-btn" role="button">${icon('more')}<span>Más</span></a>` : ''}</nav>
  </div>`;

  const sidebar = document.getElementById('sidebar'), scrim = document.getElementById('scrim');
  document.getElementById('menu-btn').onclick = () => { sidebar.classList.add('open'); scrim.classList.add('show'); };
  scrim.onclick = closeDrawer;
  document.querySelector('.role-switch')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) switchMode(b.dataset.mode);
  });
  document.getElementById('more-btn')?.addEventListener('click', (e) => { e.preventDefault(); sidebar.classList.add('open'); scrim.classList.add('show'); });

  const panel = document.getElementById('notif-panel');
  document.getElementById('bell-btn').onclick = (e) => {
    e.stopPropagation();
    panel.classList.toggle('hidden');
    renderNotifPanel();
  };
  panel.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (e.target.closest('[data-np-all]')) {
      const ids = S.notifications.filter((n) => !n.read).map((n) => n.id);
      if (ids.length) await ctx.B.markAllRead(ids).catch((er) => ui.toast('Error', 'error', errMsg(er)));
      return;
    }
    const it = e.target.closest('[data-np]');
    if (it) {
      const n = S.notifications.find((x) => x.id === it.dataset.np);
      panel.classList.add('hidden');
      if (n && !n.read) ctx.B.markRead(n.id).catch(() => {});
      if (S.dual && n && notifMode(n) !== S.role) { switchMode(notifMode(n), n.link || '#/'); return; }
      if (n?.link) location.hash = n.link;
    }
  });
  document.addEventListener('click', () => panel.classList.add('hidden'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') panel.classList.add('hidden'); });

  document.getElementById('demo-pill')?.addEventListener('click', async () => {
    const ok = await ui.confirmDialog({ title: 'Restablecer demostración', message: 'Se borrarán los cambios hechos en este navegador y se restaurarán los datos de ejemplo.', confirm: 'Restablecer', danger: true });
    if (ok) ctx.B.reset();
  });

  document.getElementById('user-card').addEventListener('click', async (e) => {
    if (e.target.closest('[data-logout]')) {
      await ctx.B.logout();
      location.hash = '#/login';
    }
  });
  shellMounted = true;
  navSig = navFor().map((n) => n[0]).join('|');
  updateChrome();
}

function closeDrawer() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('scrim')?.classList.remove('show');
}

function updateChrome() {
  if (!shellMounted) return;
  const unread = S.notifications.filter((n) => !n.read).length;
  const bc = document.getElementById('bell-count');
  if (bc) { bc.textContent = unread > 99 ? '99+' : unread; bc.classList.toggle('hidden', !unread); }
  renderNotifPanel();

  const name = S.role === 'teacher' ? teacherName() : S.profile?.fullName || '';
  const sub = S.role === 'teacher' ? (S.isAdmin ? 'Administrador · ' : S.dual ? 'Docente y estudiante · ' : 'Docente · ') + S.user.email
    : S.profile?.studentCode ? `${S.dual ? 'Vista estudiante · ' : ''}Código ${S.profile.studentCode}` : S.user.email;
  const uc = document.getElementById('user-card');
  if (uc) {
    const sig = name + sub;
    if (uc.dataset.sig !== sig) {
      uc.dataset.sig = sig;
      uc.innerHTML = `${avatar(name, '', S.user.uid)}<div class="uc-body"><b>${esc(name)}</b><small>${esc(sub)}</small></div>
        <button class="btn btn-ghost btn-icon btn-sm" data-logout title="Cerrar sesión" aria-label="Cerrar sesión">${icon('logout')}</button>`;
    }
  }
  // Contadores en el menú
  const setCount = (h, n) => {
    document.querySelectorAll(`[data-count="${h}"]`).forEach((el) => { el.textContent = n; el.classList.toggle('hidden', !n); });
  };
  if (S.role === 'teacher') setCount('clases', S.pendingSubs.length);
  else {
    const pend = S.posts.filter((p) => p.type === 'tarea' && !S.classes.find((c) => c.id === p.classId)?.archived && !S.mySubs.some((s) => s.postId === p.id && s.submittedAt) && (!p.dueAt || p.dueAt > Date.now() || S.mySubs.some((s) => s.postId === p.id && s.status === 'devuelto'))).length;
    setCount('clases', pend);
  }
}

function renderBoot(msg) {
  document.getElementById('root').innerHTML = `
    <div class="boot">${LOGO}<div class="boot-bar"></div><p>${esc(msg)}</p>
    ${S.user ? `<button class="link-btn" id="boot-out" style="font-size:13px">Cerrar sesión</button>` : ''}</div>`;
  document.getElementById('boot-out')?.addEventListener('click', () => ctx.B.logout());
  shellMounted = false;
}

// ---------- Enrutador ----------
function route() {
  const [name = '', id] = location.hash.replace(/^#\/?/, '').split('/');
  closeDrawer();
  document.getElementById('notif-panel')?.classList.add('hidden');

  if (!S.user) {
    destroyCurrent(); shellMounted = false;
    const el = document.getElementById('root');
    current = (name === 'registro' ? renderRegister : renderLogin)(el) || {};
    return;
  }
  if (name === 'login' || name === 'registro') { location.hash = '#/'; return; }
  lastGate = gateKey();

  // Usuario sin administrador: espera su perfil en /users
  if (!S.isAdmin) {
    if (!S.ready.profile) { renderBoot('SINCRONIZANDO SU PERFIL…'); return; }
    if (!S.profile) {
      destroyCurrent(); shellMounted = false;
      const denied = /permission/i.test(S.profileError || '');
      current = renderNotice(document.getElementById('root'), denied
        ? { icon: 'lock', title: 'No se pudo leer su perfil', text: 'Firestore rechazó la lectura (permiso denegado). Normalmente significa que las reglas publicadas en Firebase no son las de esta versión: publique de nuevo el archivo firestore.rules.', diag: true }
        : { icon: 'alert', title: 'Cuenta sin perfil', text: 'Su usuario existe en Authentication, pero no tiene un perfil en la base de datos (colección users). Comuníquese con su docente o con el administrador.', diag: true }) || {};
      return;
    }
    if (S.profile.role === 'teacher' && S.profile.active === false) {
      destroyCurrent(); shellMounted = false;
      current = renderNotice(document.getElementById('root'), { icon: 'lock', title: 'Cuenta deshabilitada', text: 'El administrador deshabilitó temporalmente su acceso como docente. Comuníquese con él para reactivarlo.' }) || {};
      return;
    }
    // Primer ingreso con contraseña asignada: cambio obligatorio
    if (S.profile.mustChangePassword) {
      destroyCurrent(); shellMounted = false;
      current = renderForceChange(document.getElementById('root')) || {};
      return;
    }
  }
  const sig = navFor().map((n) => n[0]).join('|');
  if (!shellMounted || sig !== navSig) mountShell();

  const routes = routesFor();
  const view = routes[name] || routes[''];
  destroyCurrent();
  // Se reemplaza el contenedor por una copia limpia: así se descartan los "escuchadores" de clic
  // de la sección anterior y un clic nunca se ejecuta dos veces.
  const prevView = document.getElementById('view');
  const el = prevView.cloneNode(false);
  prevView.replaceWith(el);
  el.classList.remove('view-enter'); void el.offsetWidth; el.classList.add('view-enter');
  try { current = view(el, id) || {}; } catch (e) { console.error(e); el.innerHTML = '<div class="panel">Ocurrió un error al cargar esta sección.</div>'; }

  const active = (S.role === 'student' && name === 'practica') ? 'mi-practica' : (ACTIVE_ALIAS[name] ?? (routes[name] ? name : ''));
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === active));
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}
