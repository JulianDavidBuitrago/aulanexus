// =====================================================================
//  Integración con Google Drive
//  1) Enlaces de Drive → tarjetas con tipo y visor integrado (sin configuración).
//  2) Selector de Google Drive (Google Picker) para el docente (configuración opcional
//     en firebase-config.js → GOOGLE_DRIVE).
// =====================================================================
import * as cfg from './firebase-config.js';
import { icon } from './icons.js';
import { esc } from './util.js';
import { modal, toast } from './ui.js';

const DRIVE = cfg.GOOGLE_DRIVE || {};
export const pickerConfigured = () => !!(DRIVE.apiKey && DRIVE.clientId && DRIVE.appId);

// ---------- Tipos ----------
const KINDS = {
  doc: { label: 'Documento', ic: 'file', color: '#4285f4' },
  slides: { label: 'Presentación', ic: 'layers', color: '#f4b400' },
  sheet: { label: 'Hoja de cálculo', ic: 'table', color: '#0f9d58' },
  form: { label: 'Formulario', ic: 'clipboard', color: '#7248b9' },
  drawing: { label: 'Dibujo', ic: 'edit', color: '#db4437' },
  pdf: { label: 'PDF', ic: 'file', color: '#ea4335' },
  video: { label: 'Video', ic: 'zap', color: '#e91e63' },
  image: { label: 'Imagen', ic: 'sparkles', color: '#8b5cf6' },
  audio: { label: 'Audio', ic: 'bell', color: '#06b6d4' },
  folder: { label: 'Carpeta', ic: 'archive', color: '#64748b' },
  file: { label: 'Archivo', ic: 'file', color: '#64748b' }
};
export const kindInfo = (k) => KINDS[k] || KINDS.file;

const ID = '([A-Za-z0-9_-]{10,})';
// Reconoce los formatos de enlace de Drive y de Google Docs/Slides/Sheets/Forms
export function parseDriveUrl(url = '') {
  const u = String(url).trim();
  if (!/^https?:\/\/(drive|docs)\.google\.com\//i.test(u)) return null;
  let m;
  if ((m = u.match(new RegExp(`docs\\.google\\.com/document/(?:u/\\d+/)?d/${ID}`)))) return { kind: 'doc', id: m[1], url: u };
  if ((m = u.match(new RegExp(`docs\\.google\\.com/presentation/(?:u/\\d+/)?d/${ID}`)))) return { kind: 'slides', id: m[1], url: u };
  if ((m = u.match(new RegExp(`docs\\.google\\.com/spreadsheets/(?:u/\\d+/)?d/${ID}`)))) return { kind: 'sheet', id: m[1], url: u };
  if ((m = u.match(new RegExp(`docs\\.google\\.com/forms/(?:u/\\d+/)?d/e/${ID}`)))) return { kind: 'form', id: m[1], published: true, url: u };
  if ((m = u.match(new RegExp(`docs\\.google\\.com/forms/(?:u/\\d+/)?d/${ID}`)))) return { kind: 'form', id: m[1], url: u };
  if ((m = u.match(new RegExp(`docs\\.google\\.com/drawings/(?:u/\\d+/)?d/${ID}`)))) return { kind: 'drawing', id: m[1], url: u };
  if ((m = u.match(new RegExp(`drive\\.google\\.com/(?:drive/)?(?:u/\\d+/)?folders/${ID}`)))) return { kind: 'folder', id: m[1], url: u };
  if ((m = u.match(new RegExp(`drive\\.google\\.com/file/(?:u/\\d+/)?d/${ID}`)))) return { kind: 'file', id: m[1], url: u };
  if ((m = u.match(new RegExp(`drive\\.google\\.com/(?:open|uc)\\?(?:.*&)?id=${ID}`)))) return { kind: 'file', id: m[1], url: u };
  return null;
}

// Elemento devuelto por el selector de Google Drive
export function itemFromPicker(d) {
  const mt = d.mimeType || '';
  const kind = mt === 'application/vnd.google-apps.document' ? 'doc'
    : mt === 'application/vnd.google-apps.presentation' ? 'slides'
    : mt === 'application/vnd.google-apps.spreadsheet' ? 'sheet'
    : mt === 'application/vnd.google-apps.form' ? 'form'
    : mt === 'application/vnd.google-apps.drawing' ? 'drawing'
    : mt === 'application/vnd.google-apps.folder' ? 'folder'
    : mt === 'application/pdf' ? 'pdf'
    : mt.startsWith('video/') ? 'video'
    : mt.startsWith('image/') ? 'image'
    : mt.startsWith('audio/') ? 'audio' : 'file';
  return { id: d.id, name: d.name || 'Archivo de Drive', kind, mimeType: mt, url: d.url || openUrl({ kind, id: d.id }) };
}

// URL de vista previa incrustable
export function previewUrl(it) {
  const id = encodeURIComponent(it.id);
  switch (it.kind) {
    case 'doc': return `https://docs.google.com/document/d/${id}/preview`;
    case 'slides': return `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false`;
    case 'sheet': return `https://docs.google.com/spreadsheets/d/${id}/preview`;
    case 'form': return it.published ? `https://docs.google.com/forms/d/e/${id}/viewform?embedded=true` : `https://docs.google.com/forms/d/${id}/viewform?embedded=true`;
    case 'drawing': return `https://docs.google.com/drawings/d/${id}/preview`;
    case 'folder': return `https://drive.google.com/embeddedfolderview?id=${id}#grid`;
    default: return `https://drive.google.com/file/d/${id}/preview`;
  }
}
export function openUrl(it) {
  if (it.url && /^https?:\/\//.test(it.url)) return it.url;
  const id = encodeURIComponent(it.id);
  switch (it.kind) {
    case 'doc': return `https://docs.google.com/document/d/${id}/edit`;
    case 'slides': return `https://docs.google.com/presentation/d/${id}/edit`;
    case 'sheet': return `https://docs.google.com/spreadsheets/d/${id}/edit`;
    case 'form': return `https://docs.google.com/forms/d/${id}/viewform`;
    case 'folder': return `https://drive.google.com/drive/folders/${id}`;
    default: return `https://drive.google.com/file/d/${id}/view`;
  }
}

// Une archivos elegidos con el selector y enlaces pegados (sin duplicados)
export function collectDrive(driveFiles = [], links = []) {
  const out = [];
  const seen = new Set();
  [...driveFiles, ...links.map(parseDriveUrl).filter(Boolean)].forEach((it) => {
    if (!it?.id || seen.has(it.id)) return;
    seen.add(it.id); out.push(it);
  });
  return out;
}

// ---------- Tarjetas ----------
export function driveCards(items = [], { removable = false } = {}) {
  if (!items.length) return '';
  return `<div class="drive-grid">${items.map((it, i) => {
    const k = kindInfo(it.kind);
    const name = it.name || `${k.label} de Google Drive`;
    return `
    <div class="drive-card" style="--dk:${k.color}">
      <button type="button" class="dc-main" data-drive-view data-kind="${esc(it.kind)}" data-id="${esc(it.id)}" data-name="${esc(name)}" data-url="${esc(it.url || '')}" ${it.published ? 'data-published="1"' : ''} title="Ver ${esc(name)}">
        <span class="dc-ic">${icon(k.ic)}</span>
        <span class="dc-body"><b>${esc(name)}</b><small>${k.label} · Google Drive</small></span>
        <span class="dc-eye">${icon('eye')}</span>
      </button>
      ${removable ? `<button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger" data-drive-del="${i}" title="Quitar" aria-label="Quitar">${icon('x')}</button>` : ''}
    </div>`;
  }).join('')}</div>`;
}

// ---------- Visor integrado ----------
export function openDriveViewer(it) {
  const k = kindInfo(it.kind);
  const name = it.name || `${k.label} de Google Drive`;
  modal({
    title: name, subtitle: `${k.label} · Google Drive`, iconName: k.ic, size: 'xl',
    body: `
      <div class="drive-viewer ${it.kind}">
        <div class="dv-loading"><span class="spinner"></span>Cargando vista previa…</div>
        <iframe src="${esc(previewUrl(it))}" title="${esc(name)}" allow="autoplay; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
      </div>
      <p class="muted" style="font-size:12.5px">¿No ve el contenido? El archivo debe estar compartido como <b>“Cualquier persona con el enlace”</b> o con su cuenta institucional (inicie sesión en Google en este navegador). También puede abrirlo directamente en Drive.</p>`,
    footer: `<a class="btn" href="${esc(openUrl(it))}" target="_blank" rel="noopener noreferrer">${icon('link')}Abrir<span class="hide-sm">&nbsp;en Google Drive</span></a><button class="btn btn-primary" data-close>Cerrar</button>`,
    onMount(el) {
      const f = el.querySelector('iframe');
      f.addEventListener('load', () => el.querySelector('.dv-loading')?.remove());
      setTimeout(() => el.querySelector('.dv-loading')?.remove(), 6000);
    }
  });
}
// Delegación global: cualquier tarjeta de Drive abre el visor (feed, modales, entregas)
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-drive-view]');
  if (!b) return;
  e.preventDefault();
  openDriveViewer({ kind: b.dataset.kind, id: b.dataset.id, name: b.dataset.name, url: b.dataset.url, published: !!b.dataset.published });
});

// ---------- Selector de Google Drive (Google Picker) ----------
let token = null, tokenExp = 0, tokenClient = null, loaded = null;
const loadScript = (src) => new Promise((res, rej) => {
  if (document.querySelector(`script[src="${src}"]`)) return res();
  const s = Object.assign(document.createElement('script'), { src, async: true, defer: true });
  s.onload = res; s.onerror = () => rej(new Error(`No se pudo cargar ${src}`));
  document.head.appendChild(s);
});
function loadGoogle() {
  if (!loaded) {
    loaded = Promise.all([loadScript('https://apis.google.com/js/api.js'), loadScript('https://accounts.google.com/gsi/client')])
      .then(() => new Promise((res) => window.gapi.load('picker', res)))
      .catch((e) => { loaded = null; throw e; });
  }
  return loaded;
}
function getToken() {
  if (token && Date.now() < tokenExp - 60000) return Promise.resolve(token);
  return new Promise((resolve, reject) => {
    tokenClient = tokenClient || window.google.accounts.oauth2.initTokenClient({
      client_id: DRIVE.clientId,
      scope: 'https://www.googleapis.com/auth/drive.file', // acceso solo a los archivos que el docente elige
      callback: () => {}
    });
    tokenClient.callback = (r) => {
      if (r.error) return reject(new Error(r.error_description || r.error));
      token = r.access_token; tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
      resolve(token);
    };
    tokenClient.error_callback = (e) => reject(new Error(e?.message || 'Ventana de Google cerrada'));
    tokenClient.requestAccessToken({ prompt: token ? '' : 'consent' });
  });
}
// Comparte en modo lectura con "cualquier persona con el enlace"
async function shareAnyone(id) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/permissions?supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

// Abre el selector; devuelve la lista de elementos elegidos
export async function pickFromDrive({ share = true } = {}) {
  if (!pickerConfigured()) { driveHelp(); return []; }
  await loadGoogle();
  await getToken();
  const G = window.google.picker;
  const docs = await new Promise((resolve) => {
    const view = new G.DocsView(G.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(true).setMode(G.DocsViewMode.LIST);
    const picker = new G.PickerBuilder()
      .enableFeature(G.Feature.MULTISELECT_ENABLED)
      .enableFeature(G.Feature.SUPPORT_DRIVES)
      .setDeveloperKey(DRIVE.apiKey)
      .setAppId(DRIVE.appId)
      .setOAuthToken(token)
      .setLocale('es')
      .setTitle('Elija archivos de Google Drive')
      .addView(view)
      .addView(new G.DocsUploadView().setIncludeFolders(true))
      .setCallback((data) => {
        if (data[G.Response.ACTION] === G.Action.PICKED) resolve(data[G.Response.DOCUMENTS] || []);
        if (data[G.Response.ACTION] === G.Action.CANCEL) resolve([]);
      })
      .build();
    picker.setVisible(true);
  });
  const items = docs.map((d) => itemFromPicker({ id: d[G.Document.ID], name: d[G.Document.NAME], mimeType: d[G.Document.MIME_TYPE], url: d[G.Document.URL] }));
  if (share && items.length) {
    const failed = [];
    for (const it of items) { try { await shareAnyone(it.id); } catch { failed.push(it.name); } }
    if (failed.length) toast('Revise el uso compartido', 'warn', `No se pudo compartir automáticamente: ${failed.join(', ')}. Compártalo(s) manualmente en Drive (su institución puede restringir el acceso público).`, 9000);
  }
  return items;
}

// Ayuda cuando el selector no está configurado
export function driveHelp() {
  modal({
    title: 'Agregar desde Google Drive', subtitle: 'Pegue el enlace del archivo', iconName: 'link',
    body: `
      <ol class="help-steps">
        <li>En Google Drive, clic derecho sobre el archivo o carpeta → <b>Compartir</b> → en <i>Acceso general</i> elija <b>“Cualquier persona con el enlace”</b> (o su institución) con rol <b>Lector</b>.</li>
        <li>Pulse <b>Copiar enlace</b>.</li>
        <li>Péguelo en el campo <b>Enlaces</b> de la publicación (uno por línea).</li>
      </ol>
      <div class="callout" style="font-size:12.5px">${icon('info')}<div>Los estudiantes lo verán como una tarjeta con su tipo (PDF, Documento, Presentación, Hoja de cálculo, Formulario, video, carpeta…) y podrán abrirlo en un visor dentro de la plataforma.</div></div>
      ${pickerConfigured() ? '' : `<p class="muted" style="font-size:12px">El botón para elegir archivos directamente desde Drive se activa cuando el administrador configura <span class="mono">GOOGLE_DRIVE</span> en <span class="mono">firebase-config.js</span> (ver README).</p>`}`,
    footer: `<button class="btn btn-primary" data-close>Entendido</button>`
  });
}
