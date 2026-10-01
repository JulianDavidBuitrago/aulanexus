/**
 * =====================================================================
 *  AulaNexus · Relé de avisos por correo (Google Apps Script)
 * ---------------------------------------------------------------------
 *  Envía un correo a los estudiantes cuando el docente publica una
 *  tarea, material o anuncio. Se ejecuta con la cuenta de Google de
 *  quien lo implementa, sin costo (cuota diaria de Google).
 *
 *  Seguridad:
 *   - Solo atiende peticiones con un token de sesión válido de Firebase.
 *     El token se valida usándolo contra Firestore: si Firestore lo
 *     acepta, la identidad es auténtica.
 *   - Lee la publicación con los permisos del docente (reglas de Firestore)
 *     y exige que sea el dueño de la clase o el administrador.
 *   - Solo escribe a usuarios inscritos en esa clase (classIds).
 *
 *  Instalación: README, sección 8.7.
 * =====================================================================
 */
const CONFIG = {
  PROJECT_ID: 'TU_PROJECT_ID',                          // projectId de firebaseConfig
  ADMIN_EMAIL: 'julian.buitrago@ucaldas.edu.co',        // igual a TEACHER_EMAIL
  ADMIN_NAME: 'Julián Buitrago',                        // igual a TEACHER_NAME
  SITE_URL: 'https://USUARIO.github.io/aulanexus/',     // dirección pública de AulaNexus
  APP_NAME: 'AulaNexus',
  INSTITUTION: 'Universidad de Caldas',
  TIME_ZONE: 'America/Bogota',
  MAX_PER_REQUEST: 250
};

// Comprobación rápida en el navegador: abrir la URL /exec debe mostrar {"ok":true,...}
function doGet() {
  return json_({ ok: true, service: CONFIG.APP_NAME + ' · correo', remainingToday: MailApp.getRemainingDailyQuota() });
}

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const token = String(req.idToken || '');
    const caller = verifyCaller_(token);

    const post = getDoc_('posts/' + safeId_(req.postId), token);
    if (!post) throw fail_('not-found', 'La publicación no existe o fue eliminada.');
    const isAdmin = caller.email === CONFIG.ADMIN_EMAIL.toLowerCase();
    if (post.ownerId !== caller.uid && !isAdmin) throw fail_('forbidden', 'Solo el docente de la clase puede enviar avisos de esta publicación.');

    const cls = getDoc_('classes/' + safeId_(post.classId), token) || {};
    const uids = unique_((req.uids || []).map(safeId_)).slice(0, CONFIG.MAX_PER_REQUEST);
    if (!uids.length) throw fail_('empty', 'No hay destinatarios.');

    const users = batchGet_(uids.map(function (u) { return 'users/' + u; }), token);
    const recipients = users.filter(function (u) {
      return u && u.email && (u.classIds || []).indexOf(post.classId) >= 0 && u.uid !== post.ownerId;
    });
    if (!recipients.length) throw fail_('empty', 'Ninguno de los destinatarios está inscrito en la clase.');

    const remaining = MailApp.getRemainingDailyQuota();
    if (recipients.length > remaining) {
      throw fail_('quota', 'La cuota diaria de correos de Google permite ' + remaining + ' envío(s) más hoy y se necesitan ' + recipients.length + '. Intente mañana o seleccione menos estudiantes.');
    }

    const owner = (post.ownerId && getDoc_('users/' + post.ownerId, token)) || {};
    const teacher = {
      name: owner.fullName || (isAdmin && post.ownerId === caller.uid ? CONFIG.ADMIN_NAME : caller.name) || 'Su docente',
      email: owner.email || (post.ownerId === caller.uid ? caller.email : CONFIG.ADMIN_EMAIL)
    };
    const site = /^https:\/\//.test(CONFIG.SITE_URL) && CONFIG.SITE_URL.indexOf('USUARIO') < 0
      ? CONFIG.SITE_URL : (/^https:\/\//.test(String(req.siteUrl || '')) ? String(req.siteUrl) : '');
    const link = site ? site.replace(/#.*$/, '') + '#/clase/' + post.classId : '';

    let sent = 0; const failed = [];
    recipients.forEach(function (u) {
      const msg = buildMessage_(post, cls, teacher, u, link);
      try {
        MailApp.sendEmail({
          to: u.email, subject: msg.subject, body: msg.text, htmlBody: msg.html,
          name: CONFIG.APP_NAME + ' · ' + teacher.name, replyTo: teacher.email
        });
        sent++;
      } catch (err) { failed.push(u.email); }
    });

    return json_({ ok: true, sent: sent, failed: failed.length, skipped: uids.length - recipients.length, remaining: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return json_({ ok: false, code: err.code || 'error', error: err.code ? err.message : 'Error del servicio de correo: ' + err.message });
  }
}

// ---------------------------------------------------------------------
//  Identidad: el token de Firebase se decodifica y se comprueba usándolo
//  contra Firestore (Firestore verifica su firma y vigencia).
// ---------------------------------------------------------------------
function verifyCaller_(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw fail_('auth', 'Sesión no válida. Cierre sesión e ingrese de nuevo.');
  let claims;
  try { claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(pad_(parts[1]))).getDataAsString()); }
  catch (e) { throw fail_('auth', 'Sesión no válida.'); }
  if (claims.aud !== CONFIG.PROJECT_ID) throw fail_('auth', 'El token no corresponde a este proyecto (revise PROJECT_ID en el script).');
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw fail_('auth', 'La sesión expiró. Recargue la página.');
  // Lectura del propio perfil (o de la configuración, para el administrador): valida el token
  const r = fsFetch_('GET', docUrl_('users/' + claims.user_id), token);
  if (r.getResponseCode() === 401) throw fail_('auth', 'Firestore rechazó la sesión. Ingrese de nuevo.');
  return { uid: claims.user_id, email: String(claims.email || '').toLowerCase(), name: claims.name || '' };
}

// ---------------------------------------------------------------------
//  Firestore REST con los permisos del usuario
// ---------------------------------------------------------------------
function base_() { return 'https://firestore.googleapis.com/v1/projects/' + CONFIG.PROJECT_ID + '/databases/(default)/documents'; }
function docUrl_(path) { return base_() + '/' + path; }
function fsFetch_(method, url, token, payload) {
  const opt = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token } };
  if (payload) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(payload); }
  return UrlFetchApp.fetch(url, opt);
}
function getDoc_(path, token) {
  const r = fsFetch_('GET', docUrl_(path), token);
  const code = r.getResponseCode();
  if (code === 404) return null;
  if (code === 403) throw fail_('forbidden', 'Sin permiso para leer ' + path.split('/')[0] + '.');
  if (code !== 200) throw fail_('firestore', 'Firestore respondió ' + code + '.');
  return fromDoc_(JSON.parse(r.getContentText()));
}
function batchGet_(paths, token) {
  const prefix = 'projects/' + CONFIG.PROJECT_ID + '/databases/(default)/documents/';
  const r = fsFetch_('POST', base_() + ':batchGet', token, { documents: paths.map(function (p) { return prefix + p; }) });
  if (r.getResponseCode() !== 200) throw fail_('firestore', 'No se pudieron leer los estudiantes (código ' + r.getResponseCode() + ').');
  return JSON.parse(r.getContentText()).map(function (x) { return x.found ? fromDoc_(x.found) : null; });
}
function fromDoc_(d) {
  const o = {}; const f = d.fields || {};
  Object.keys(f).forEach(function (k) { o[k] = val_(f[k]); });
  o.uid = o.uid || String(d.name || '').split('/').pop();
  return o;
}
function val_(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return new Date(v.timestampValue).getTime();
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val_);
  if ('mapValue' in v) { const m = {}; const f = v.mapValue.fields || {}; Object.keys(f).forEach(function (k) { m[k] = val_(f[k]); }); return m; }
  return null;
}

// ---------------------------------------------------------------------
//  Mensaje
// ---------------------------------------------------------------------
const TYPES_ = {
  tarea: { noun: 'una nueva tarea', label: 'Nueva tarea', color: '#db2777' },
  material: { noun: 'nuevo material didáctico', label: 'Nuevo material', color: '#0891b2' },
  anuncio: { noun: 'un nuevo anuncio', label: 'Nuevo anuncio', color: '#7c3aed' }
};
const MONTHS_ = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS_ = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function fmtDate_(ms) {
  const d = new Date(ms); const z = CONFIG.TIME_ZONE;
  const day = Number(Utilities.formatDate(d, z, 'u')) % 7; // 1=lunes … 7=domingo
  const h = Number(Utilities.formatDate(d, z, 'H')); const min = Utilities.formatDate(d, z, 'mm');
  return DAYS_[day] + ' ' + Utilities.formatDate(d, z, 'd') + ' de ' + MONTHS_[Number(Utilities.formatDate(d, z, 'M')) - 1] +
    ' · ' + ((h % 12) || 12) + ':' + min + (h < 12 ? ' a. m.' : ' p. m.');
}

function buildMessage_(post, cls, teacher, student, link) {
  const t = TYPES_[post.type] || TYPES_.anuncio;
  const className = cls.name || 'su clase';
  const first = String(student.fullName || '').split(/\s+/)[0] || '';
  const body = String(post.body || '');
  const excerpt = body.length > 700 ? body.slice(0, 700).replace(/\s+\S*$/, '') + '…' : body;
  const extras = (post.links || []).length + (post.driveFiles || []).length + (post.files || []).length;
  const due = post.type === 'tarea' && post.dueAt ? fmtDate_(post.dueAt) : '';

  const subject = t.label + ' · ' + className + ': ' + post.title;
  const text = [
    'Hola ' + first + ',', '',
    teacher.name + ' publicó ' + t.noun + ' en ' + className + '.', '',
    post.title, excerpt, due ? '\nFecha límite: ' + due : '',
    extras ? '\nIncluye ' + extras + ' archivo(s) o enlace(s) disponibles en la plataforma.' : '',
    link ? '\nVer en ' + CONFIG.APP_NAME + ': ' + link : '', '',
    'Mensaje automático de ' + CONFIG.APP_NAME + ' · ' + CONFIG.INSTITUTION + '. Si responde este correo, su respuesta llegará al docente.'
  ].join('\n');

  const html =
    '<div style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0">' +
    '<tr><td style="background:#4f46e5;background-image:linear-gradient(120deg,#06b6d4,#6366f1 55%,#a855f7);padding:22px 26px;color:#ffffff">' +
      '<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.85">' + esc_(CONFIG.APP_NAME) + ' · ' + esc_(CONFIG.INSTITUTION) + '</div>' +
      '<div style="font-size:20px;font-weight:700;margin-top:6px">' + esc_(className) + (cls.code ? ' <span style="font-weight:500;opacity:.8;font-size:14px">(' + esc_(cls.code) + ')</span>' : '') + '</div>' +
    '</td></tr>' +
    '<tr><td style="padding:26px">' +
      '<p style="margin:0 0 14px;font-size:15px">Hola ' + esc_(first) + ',</p>' +
      '<p style="margin:0 0 18px;font-size:15px;color:#334155">' + esc_(teacher.name) + ' publicó ' + t.noun + '.</p>' +
      '<div style="border:1px solid #e2e8f0;border-left:4px solid ' + t.color + ';border-radius:12px;padding:16px 18px">' +
        '<span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + t.color + '">' + t.label + '</span>' +
        '<div style="font-size:18px;font-weight:700;margin:6px 0 8px">' + esc_(post.title) + '</div>' +
        (excerpt ? '<div style="font-size:14.5px;line-height:1.55;color:#334155">' + esc_(excerpt).replace(/\n/g, '<br>') + '</div>' : '') +
        (due ? '<div style="margin-top:14px;padding:10px 12px;background:#fff1f2;border-radius:10px;font-size:14px;color:#9f1239"><b>Fecha límite:</b> ' + esc_(due) + '</div>' : '') +
        (extras ? '<div style="margin-top:12px;font-size:13px;color:#64748b">Incluye ' + extras + ' archivo(s) o enlace(s) disponibles en la plataforma.</div>' : '') +
      '</div>' +
      (link ? '<div style="text-align:center;margin:24px 0 6px"><a href="' + esc_(link) + '" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:12px">Abrir en ' + esc_(CONFIG.APP_NAME) + '</a></div>' : '') +
    '</td></tr>' +
    '<tr><td style="padding:16px 26px;background:#f8fafc;font-size:12px;color:#64748b;line-height:1.5">' +
      'Recibe este mensaje porque está inscrito(a) en ' + esc_(className) + '. Es un mensaje automático; si lo responde, su respuesta llegará a ' + esc_(teacher.name) + '.' +
    '</td></tr></table></div>';

  return { subject: subject, text: text, html: html };
}

// ---------------------------------------------------------------------
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail_(code, message) { const e = new Error(message); e.code = code; return e; }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function unique_(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
function safeId_(s) { s = String(s || ''); if (!/^[A-Za-z0-9_-]{1,128}$/.test(s)) throw fail_('bad-request', 'Identificador no válido.'); return s; }
function pad_(s) { while (s.length % 4) s += '='; return s; }

// Ejecute esta función una vez desde el editor para autorizar el envío de correos
function autorizar() {
  Logger.log('Cuota de correos disponible hoy: ' + MailApp.getRemainingDailyQuota());
  UrlFetchApp.fetch('https://firestore.googleapis.com/', { muteHttpExceptions: true });
}
