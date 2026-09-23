// Núcleo de la aplicación: sesión, suscripciones en tiempo real, estructura y enrutador
import { S, ctx, setUpdater, emit } from './state.js';
import { TEACHER_EMAIL, TEACHER_NAME, APP } from './firebase-config.js';
import * as ui from './ui.js';
import { icon, LOGO } from './icons.js';
import { esc, timeAgo, errMsg } from './util.js';
import { avatar } from './components.js';
import { startBackground } from './bg.js';
import { renderLogin, renderRegister } from './views-auth.js';
import * as Teacher from './views-teacher.js';
import * as Student from './views-student.js';

let current = null;          // vista montada { update, destroy }
let subs = [];               // suscripciones globales
let postSubs = new Map();    // (estudiante) suscripciones por clase
let postsByClass = new Map();
let shellMounted = false;
let seenNotifs = null;
let waitingProfile = false;

export function start(backend, { demo }) {
  ctx.B = backend; ctx.demo = demo;
  ui.initTheme();
  startBackground();
  setUpdater(() => {
    if (waitingProfile && S.profile) { waitingProfile = false; route(); return; }
    try { current?.update?.(); } catch (e) { console.error(e); }
    updateChrome();
  });
  backend.onAuth(onAuth);
  window.addEventListener('hashchange', route);
}

function clearSubs() {
  subs.forEach((u) => { try { u?.(); } catch { /* */ } });
  subs = [];
  postSubs.forEach((u) => u());
  postSubs.clear(); postsByClass.clear();
}
function destroyCurrent() { try { current?.destroy?.(); } catch { /* */ } current = null; }

function onAuth(user) {
  clearSubs(); destroyCurrent();
  shellMounted = false; seenNotifs = null; waitingProfile = false;
  Object.assign(S, { user, role: null, profile: null, classes: [], students: [], posts: [], notifications: [], mySubs: [], pendingSubs: [], ready: {} });
  if (!user) { route(); return; }

  const B = ctx.B;
  S.role = user.email === TEACHER_EMAIL.toLowerCase() ? 'teacher' : 'student';

  subs.push(B.watchClasses((l) => { S.classes = l; S.ready.classes = true; emit(); }));
  subs.push(B.watchNotifications(S.role === 'teacher' ? 'teacher' : user.uid, handleNotifs));

  if (S.role === 'teacher') {
    subs.push(B.watchStudents((l) => { S.students = l; S.ready.students = true; emit(); }));
    subs.push(B.watchAllPosts((l) => { S.posts = l; S.ready.posts = true; emit(); }));
    subs.push(B.watchSubmissionsBy('status', 'entregado', (l) => { S.pendingSubs = l; S.ready.pending = true; emit(); }));
  } else {
    subs.push(B.watchProfile(user.uid, (p) => {
      S.profile = p;
      if (p) {
        syncClassPosts(p.classIds || []);
        if (p.email && user.email && p.email !== user.email) B.syncEmail?.(user.uid, user.email);
      }
      emit();
    }));
    subs.push(B.watchSubmissionsBy('studentId', user.uid, (l) => { S.mySubs = l; S.ready.subs = true; emit(); }));
  }
  route();
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
      fresh.slice(0, 2).forEach((n) => ui.toast(n.title, n.type === 'grade' ? 'success' : 'info', n.message, 5500));
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
const NOTIF_IC = { post: 'megaphone', grade: 'award', submission: 'upload' };
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
const NAV = {
  teacher: [['', 'home', 'Panel'], ['clases', 'book', 'Clases'], ['estudiantes', 'users', 'Estudiantes'], ['archivadas', 'archive', 'Archivadas'], ['cuenta', 'shield', 'Cuenta']],
  student: [['', 'home', 'Inicio'], ['clases', 'book', 'Mis clases'], ['calificaciones', 'award', 'Notas'], ['perfil', 'user', 'Mi perfil']]
};
const ACTIVE_ALIAS = { clase: 'clases', tarea: 'clases', estudiante: 'estudiantes' };

function mountShell() {
  const root = document.getElementById('root');
  const nav = NAV[S.role];
  const links = (cls = '') => nav.map(([h, ic, label]) => `<a href="#/${h}" data-nav="${h}" class="${cls}">${icon(ic)}<span>${label}</span><i class="count hidden" data-count="${h}"></i></a>`).join('');
  root.innerHTML = `
  <div class="app">
    <aside class="sidebar" id="sidebar" aria-label="Navegación principal">
      <a class="brand" href="#/">${LOGO}<div><b>${APP.name}</b><small>${S.role === 'teacher' ? 'Panel docente' : 'Portal estudiante'}</small></div></a>
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
    <nav class="bottom-nav" aria-label="Navegación inferior">${nav.map(([h, ic, label]) => `<a href="#/${h}" data-nav="${h}">${icon(ic)}<span>${label}</span></a>`).join('')}</nav>
  </div>`;

  const sidebar = document.getElementById('sidebar'), scrim = document.getElementById('scrim');
  document.getElementById('menu-btn').onclick = () => { sidebar.classList.add('open'); scrim.classList.add('show'); };
  scrim.onclick = closeDrawer;

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

  const name = S.role === 'teacher' ? TEACHER_NAME : S.profile?.fullName || '';
  const sub = S.role === 'teacher' ? S.user.email : S.profile?.studentCode ? `Código ${S.profile.studentCode}` : S.user.email;
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
    const pend = S.posts.filter((p) => p.type === 'tarea' && !S.classes.find((c) => c.id === p.classId)?.archived && !S.mySubs.some((s) => s.postId === p.id) && (!p.dueAt || p.dueAt > Date.now())).length;
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
  if (S.role === 'student' && !S.profile) {
    waitingProfile = true;
    renderBoot('SINCRONIZANDO SU PERFIL…');
    return;
  }
  if (!shellMounted) mountShell();

  const routes = S.role === 'teacher' ? Teacher.routes : Student.routes;
  const view = routes[name] || routes[''];
  destroyCurrent();
  const el = document.getElementById('view');
  el.innerHTML = '';
  el.classList.remove('view-enter'); void el.offsetWidth; el.classList.add('view-enter');
  try { current = view(el, id) || {}; } catch (e) { console.error(e); el.innerHTML = '<div class="panel">Ocurrió un error al cargar esta sección.</div>'; }

  const active = ACTIVE_ALIAS[name] ?? (routes[name] ? name : '');
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === active));
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}
