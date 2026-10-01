// =====================================================================
//  Exportación a Word (.docx) de los formatos de práctica empresarial.
//  Se parte de las plantillas institucionales (public/templates/*.docx):
//  conservan encabezado, pie, márgenes, estilos y numeración originales.
//  - Propuesta y acta: se reemplazan los marcadores {{…}} del formato fijo.
//  - Informe final: se genera el cuerpo con los estilos de la plantilla.
// =====================================================================
import { APP } from './firebase-config.js';
import {
  inlineRuns, paragraphs, dmy, longDate, parseISODate, numberFinal, todayISO, currentPeriod
} from './practica-model.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ---------- Carga perezosa de JSZip y de las plantillas ----------
let zipLoading = null;
export function loadZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (!zipLoading) {
    zipLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/jszip.min.js';
      s.onload = () => (window.JSZip ? resolve(window.JSZip) : reject(new Error('JSZip no disponible')));
      s.onerror = () => { zipLoading = null; reject(new Error('No se pudo cargar el generador de Word')); };
      document.head.appendChild(s);
    });
  }
  return zipLoading;
}
async function loadTemplate(name) {
  // La versión de demostración incrusta las plantillas en window.__AN_TEMPLATES__ (base64)
  const inline = window.__AN_TEMPLATES__?.[name];
  if (inline) return Uint8Array.from(atob(inline), (c) => c.charCodeAt(0));
  const res = await fetch(`templates/${name}.docx`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`No se encontró la plantilla templates/${name}.docx`);
  return new Uint8Array(await res.arrayBuffer());
}

// ---------- XML ----------
// eslint-disable-next-line no-control-regex
const clean = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const X = (s) => clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const T = (s) => `<w:t xml:space="preserve">${X(s)}</w:t>`;

// rPr en el orden que exige el esquema de Word
function rpr(o = {}) {
  let x = '';
  if (o.style) x += `<w:rStyle w:val="${o.style}"/>`;
  if (o.font) x += `<w:rFonts w:ascii="${o.font}" w:eastAsia="${o.font}" w:hAnsi="${o.font}" w:cs="${o.font}"/>`;
  if (o.b) x += '<w:b/><w:bCs/>';
  if (o.i) x += '<w:i/><w:iCs/>';
  if (o.noProof) x += '<w:noProof/>';
  if (o.color) x += `<w:color w:val="${o.color}"/>`;
  if (o.sz) x += `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>`;
  if (o.u) x += '<w:u w:val="single"/>';
  if (o.lang) x += `<w:lang w:val="${o.lang}"/>`;
  return x ? `<w:rPr>${x}</w:rPr>` : '';
}
// pPr en el orden del esquema
function ppr(o = {}) {
  let x = '';
  if (o.style) x += `<w:pStyle w:val="${o.style}"/>`;
  if (o.keepNext) x += '<w:keepNext/>';
  if (o.keepLines) x += '<w:keepLines/>';
  if (o.pageBreak) x += '<w:pageBreakBefore/>';
  if (o.num) x += `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${o.num}"/></w:numPr>`;
  if (o.borderTop) x += `<w:pBdr><w:top w:val="single" w:sz="${o.borderTop.sz || 6}" w:space="${o.borderTop.space || 4}" w:color="${o.borderTop.color || '000000'}"/></w:pBdr>`;
  if (o.tabs) x += `<w:tabs>${o.tabs}</w:tabs>`;
  if (o.before != null || o.after != null || o.line != null) {
    x += `<w:spacing${o.before != null ? ` w:before="${o.before}"` : ''}${o.after != null ? ` w:after="${o.after}"` : ''}${o.line != null ? ` w:line="${o.line}" w:lineRule="auto"` : ''}/>`;
  }
  if (o.ind) x += `<w:ind${o.ind.left != null ? ` w:left="${o.ind.left}"` : ''}${o.ind.hanging != null ? ` w:hanging="${o.ind.hanging}"` : ''}/>`;
  if (o.jc) x += `<w:jc w:val="${o.jc}"/>`;
  return x ? `<w:pPr>${x}</w:pPr>` : '';
}
// Texto con **negrita**/*cursiva* y saltos de línea
function runs(text, base = {}) {
  return String(text ?? '').split('\n').map((line, li) => {
    const segs = inlineRuns(line);
    const r = segs.map((s) => `<w:r>${rpr({ ...base, b: base.b || s.b, i: base.i || s.i })}${T(s.text)}</w:r>`).join('');
    return (li ? '<w:r><w:br/></w:r>' : '') + r;
  }).join('');
}
const para = (text, p = {}, r = {}) => `<w:p>${ppr(p)}${runs(text, r)}</w:p>`;
const emptyP = (p = {}) => `<w:p>${ppr(p)}</w:p>`;

// Valor de un marcador dentro de <w:t>: respeta saltos de línea
const tokenValue = (v) => X(v).replace(/\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
function fillTokens(xml, vals) {
  return xml.replace(/\{\{([\w.]+)\}\}/g, (m, k) => (k in vals ? tokenValue(vals[k]) : m));
}
function fillParas(xml, key, content) {
  const marker = `<w:p><w:r><w:t>{{@${key}}}</w:t></w:r></w:p>`;
  if (!xml.includes(marker)) throw new Error(`Marcador {{@${key}}} no encontrado en la plantilla`);
  return xml.replace(marker, () => content);
}
function fillRows(xml, key, items, valsOf) {
  const i = xml.indexOf(`{{#${key}}}`);
  if (i < 0) throw new Error(`Fila {{#${key}}} no encontrada en la plantilla`);
  const a = xml.lastIndexOf('<w:tr>', i), b = xml.indexOf('</w:tr>', i) + 7;
  const row = xml.slice(a, b).replace(`{{#${key}}}`, '');
  const list = items.length ? items : [null];
  // En celdas justificadas, los saltos de línea se unen con "; " para no estirar el texto
  const flat = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v ?? '').split(/\n+/).map((x) => x.trim()).filter(Boolean).join('; ')]));
  return xml.slice(0, a) + list.map((it, n) => fillTokens(row, flat(valsOf(it, n)))).join('') + xml.slice(b);
}

async function finish(zip, docXml) {
  zip.file('word/document.xml', docXml);
  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}
export function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export const fileBase = (s) => String(s || 'documento').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);

// =====================================================================
//  PROPUESTA DE PRÁCTICA (formato fijo)
// =====================================================================
export async function buildProposalDocx(pr) {
  const JSZip = await loadZip();
  const zip = await JSZip.loadAsync(await loadTemplate('propuesta'));
  let xml = await zip.file('word/document.xml').async('string');
  const c = pr.company || {}, p = pr.proposal || {};
  const fd = parseISODate(p.fillDate || todayISO()) || {}, fi = parseISODate(c.startDate) || {}, ft = parseISODate(c.endDate) || {};

  // Filas repetibles
  xml = fillRows(xml, 'needs', (p.needs || []).filter((n) => n.a || n.b || n.c), (n) => ({ 'n.a': n?.a || '', 'n.b': n?.b || '', 'n.c': n?.c || '' }));
  xml = fillRows(xml, 'acts', (p.activities || []).filter((a) => a.act || a.ent), (a, i) => ({
    'a.n': a ? String(i + 1) : '', 'a.oe': a?.oe ? `(${a.oe}) ` : '', 'a.act': a?.act || '', 'a.ent': a?.ent || '',
    'a.ini': dmy(a?.ini), 'a.fin': dmy(a?.fin)
  }));

  // Bloques de párrafos
  const bodyP = (t, after = 120) => para(t, { after, jc: 'both' });
  const descr = paragraphs(p.description).map((t) => bodyP(t)).join('') || emptyP();
  xml = fillParas(xml, 'desc', descr);
  xml = fillParas(xml, 'resultado', paragraphs(p.expected).map((t, i, a) => bodyP(t, i < a.length - 1 ? 120 : 0)).join('') || emptyP());
  xml = fillParas(xml, 'objGen', paragraphs(p.objective).map((t) => bodyP(t, 0)).join('') || emptyP());
  const oes = (p.specific || []).filter((x) => String(x).trim());
  xml = fillParas(xml, 'oes', oes.map((t, i) => `<w:p>${ppr({ keepLines: true, after: i < oes.length - 1 ? 120 : 0, ind: { left: 360, hanging: 360 }, jc: 'both' })}<w:r>${rpr({ b: true })}${T(`OE${i + 1}. `)}</w:r>${runs(t)}</w:p>`).join('') || emptyP());
  let met = paragraphs(p.methodIntro).map((t) => bodyP(t, 160)).join('');
  const phases = (p.phases || []).filter((f) => f.title || f.text);
  phases.forEach((f, i) => {
    met += para(`Fase ${i + 1}. ${f.title || ''}${f.oes ? ` – ${f.oes}.` : ''}`, { keepNext: true, keepLines: true, after: 40 }, { b: true });
    const ps = paragraphs(f.text);
    met += ps.map((t, j) => bodyP(t, i === phases.length - 1 && j === ps.length - 1 ? 0 : 160)).join('');
  });
  xml = fillParas(xml, 'metodo', met || emptyP());

  xml = fillTokens(xml, {
    est: pr.studentName || '', cod: pr.studentCode || '', prof: pr.ownerName || '', periodo: pr.period || currentPeriod(),
    fd_d: fd.d || '', fd_m: fd.m || '', fd_a: fd.y || '',
    fi_d: fi.d || '', fi_m: fi.m || '', fi_a: fi.y || '', ft_d: ft.d || '', ft_m: ft.m || '', ft_a: ft.y || '',
    remSi: c.paid === true ? 'X' : ' ', remNo: c.paid === false ? 'X' : ' ',
    func: c.contactName || '', cargo: c.contactRole || '', tel: c.contactPhone || '', correo: c.contactEmail || ''
  });
  return finish(zip, xml);
}

// =====================================================================
//  ACTA DE CONTROL DE VISITA EMPRESARIAL (formato fijo · solo docente)
// =====================================================================
export async function buildActaDocx(pr, visit) {
  const JSZip = await loadZip();
  const zip = await JSZip.loadAsync(await loadTemplate('acta'));
  let xml = await zip.file('word/document.xml').async('string');
  const a = visit.acta || {}, c = pr.company || {};
  const base = { font: 'Arial', sz: 22, lang: 'es-CO' };
  const dev = paragraphs(a.development).map((t) => para(t, { after: 120, line: 360, jc: 'both' }, base)).join('') || emptyP({ line: 360 });
  xml = fillParas(xml, 'desarrollo', dev);
  xml = fillTokens(xml, {
    prof: pr.ownerName || '', est: pr.studentName || '', empresa: c.name || '',
    fecha: longDate(visit.date || Date.now()), resp: a.responsible || c.contactName || ''
  });
  return finish(zip, xml);
}

// =====================================================================
//  INFORME FINAL (estructura flexible con los estilos de la plantilla)
// =====================================================================
const NAVY = '1F3864', BLUE = '2E75B6', GRAY = '595959';
const PAGE_W = 9405;  // ancho útil de la plantilla (twips)
const BODY = { after: 160, line: 360, jc: 'both' };

const cellBorders = (color = 'C3CCDA') => `<w:tcBorders>${['top', 'left', 'bottom', 'right'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="${color}"/>`).join('')}</w:tcBorders>`;
const cellMar = (t = 70, l = 100) => `<w:tcMar><w:top w:w="${t}" w:type="dxa"/><w:left w:w="${l}" w:type="dxa"/><w:bottom w:w="${t}" w:type="dxa"/><w:right w:w="${l}" w:type="dxa"/></w:tcMar>`;
const tblPr = (w = PAGE_W) => `<w:tblPr><w:tblW w:w="${w}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="C3CCDA"/>`).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="10" w:type="dxa"/><w:right w:w="10" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`;

function colWidths(n) {
  if (n === 1) return [PAGE_W];
  if (n === 2) return [Math.round(PAGE_W * 0.32), PAGE_W - Math.round(PAGE_W * 0.32)];
  const first = Math.round(PAGE_W * (n >= 5 ? 0.16 : 0.22));
  const rest = Math.floor((PAGE_W - first) / (n - 1));
  return [first, ...Array.from({ length: n - 1 }, (_, i) => (i === n - 2 ? PAGE_W - first - rest * (n - 2) : rest))];
}
function dataTable(cols, rows) {
  const w = colWidths(cols.length);
  const head = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cols.map((h, i) => `<w:tc><w:tcPr><w:tcW w:w="${w[i]}" w:type="dxa"/>${cellBorders()}<w:shd w:val="clear" w:color="auto" w:fill="${NAVY}"/>${cellMar()}<w:vAlign w:val="center"/></w:tcPr>${para(h, { jc: 'center' }, { b: true, color: 'FFFFFF', sz: 18 })}</w:tc>`).join('')}</w:tr>`;
  const body = rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cols.map((_, i) => `<w:tc><w:tcPr><w:tcW w:w="${w[i]}" w:type="dxa"/>${cellBorders()}${cellMar()}<w:vAlign w:val="center"/></w:tcPr>${para(r[i] ?? '', { after: 30, line: 250 }, { sz: 18, b: i === 0 && cols.length > 1 })}</w:tc>`).join('')}</w:tr>`).join('');
  return `<w:tbl>${tblPr()}<w:tblGrid>${w.map((x) => `<w:gridCol w:w="${x}"/>`).join('')}</w:tblGrid>${head}${body}</w:tbl>`;
}
function caption(kind, n, text) {
  const r = { b: true, color: NAVY, sz: 20 };
  return `<w:p>${ppr({ keepNext: true, before: 200, after: 100, line: 276 })}<w:r>${rpr(r)}${T(`${kind} `)}</w:r>`
    + `<w:r>${rpr(r)}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rpr(r)}<w:instrText xml:space="preserve"> SEQ ${kind} \\* ARABIC </w:instrText></w:r><w:r>${rpr(r)}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${rpr({ ...r, noProof: true })}${T(String(n))}</w:r><w:r>${rpr(r)}<w:fldChar w:fldCharType="end"/></w:r>`
    + `<w:r>${rpr(r)}${T('. ')}</w:r>${runs(text || '', { i: true, sz: 20 })}</w:p>`;
}
const noteP = (text) => (String(text || '').trim()
  ? `<w:p>${ppr({ before: 80, after: 280, line: 264 })}<w:r>${rpr({ i: true, color: GRAY, sz: 18 })}${T('Nota.')}</w:r>${runs(` ${text}`, { color: GRAY, sz: 18 })}</w:p>`
  : emptyP({ after: 200 }));
const frontTitle = (text, first) => para(text, { pageBreak: !first, after: 360, jc: 'center' }, { b: true, color: NAVY, sz: 28 });

function codeBox(text) {
  const lines = String(text || '').replace(/\t/g, '    ').split('\n');
  const ps = lines.map((l) => `<w:p>${ppr({ line: 250 })}<w:r>${rpr({ font: 'Consolas', color: '24292F', sz: 17 })}${T(l)}</w:r></w:p>`).join('');
  return `<w:tbl>${tblPr()}<w:tblGrid><w:gridCol w:w="${PAGE_W}"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="${PAGE_W}" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/><w:left w:val="single" w:sz="24" w:space="0" w:color="${NAVY}"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/><w:right w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/></w:tcBorders><w:shd w:val="clear" w:color="auto" w:fill="F6F8FA"/>${cellMar(120, 200)}</w:tcPr>${ps}</w:tc></w:tr></w:tbl>`;
}

const EMU = 9525; // por píxel a 96 ppp
function drawing(rid, cx, cy, id, name) {
  return `<w:r>${rpr({ noProof: true })}<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${X(name)}" descr="${X(name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${X(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}
function fitImage(w, h, maxW = 5700000, maxH = 6400000) {
  let cx = (w || 800) * EMU, cy = (h || 500) * EMU;
  const k = Math.min(1, maxW / cx, maxH / cy);
  return [Math.round(cx * k), Math.round(cy * k)];
}
function dataUrlBytes(u) {
  const m = String(u || '').match(/^data:(image\/(png|jpeg|jpg));base64,(.+)$/);
  if (!m) return null;
  return { ext: m[2] === 'png' ? 'png' : 'jpeg', bytes: Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0)) };
}

function tocField(instr, entries, empty) {
  const tab = '<w:tab w:val="right" w:leader="dot" w:pos="9395"/>';
  const list = entries.length ? entries : [{ text: empty, level: 1 }];
  return list.map((e, i) => {
    const style = e.style || (e.level === 2 ? 'TDC2' : e.level === 3 ? 'TDC3' : 'TDC1');
    const start = i === 0 ? `<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>` : '';
    const end = i === list.length - 1 ? '<w:r><w:fldChar w:fldCharType="end"/></w:r>' : '';
    return `<w:p>${ppr({ style, tabs: tab })}${start}${e.lead ? `<w:r>${rpr({ b: true })}${T(e.lead)}</w:r>` : ''}<w:r>${rpr({ i: !!e.lead })}${T(e.text)}</w:r>${end}</w:p>`;
  }).join('');
}

export async function buildFinalDocx(pr, files = []) {
  const JSZip = await loadZip();
  const zip = await JSZip.loadAsync(await loadTemplate('informe'));
  let xml = await zip.file('word/document.xml').async('string');
  let rels = await zip.file('word/_rels/document.xml.rels').async('string');
  let numbering = await zip.file('word/numbering.xml').async('string');
  const f = pr.final || {}, cv = f.cover || {}, fr = f.front || {};
  const N = numberFinal(f);
  let drawingId = 100, numId = 200, relN = 0;
  const newNum = (abstract) => {
    numId += 1;
    numbering = numbering.replace('</w:numbering>', `<w:num w:numId="${numId}"><w:abstractNumId w:val="${abstract}"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num></w:numbering>`);
    return numId;
  };
  const addImage = (dataUrl, name) => {
    const img = dataUrlBytes(dataUrl);
    if (!img) return null;
    relN += 1;
    const rid = `rIdAN${relN}`, target = `media/an_fig${relN}.${img.ext}`;
    zip.file(`word/${target}`, img.bytes);
    rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/></Relationships>`);
    return rid;
  };

  // ---------------- Portada ----------------
  const cp = (text, p = {}, r = {}) => para(text, { jc: 'center', ...p }, r);
  let cover = `<w:p>${ppr({ after: 360, jc: 'center' })}${drawing('rId9', 2520000, 818000, ++drawingId, 'Facultad de Inteligencia Artificial e Ingenierías')}</w:p>`;
  cover += cp('UNIVERSIDAD DE CALDAS', { after: 40 }, { b: true, color: NAVY, sz: 26 });
  cover += cp('Facultad de Inteligencia Artificial e Ingenierías', { after: 40 }, { color: GRAY, sz: 22 });
  cover += cp('Departamento de Sistemas e Informática', { after: 40 }, { color: GRAY, sz: 22 });
  cover += cp(`Programa de ${APP.program || 'Ingeniería en Informática'}`, { after: 1200 }, { color: GRAY, sz: 22 });
  cover += `<w:p>${ppr({ borderTop: { sz: 18, space: 14, color: BLUE }, after: 200, jc: 'center' })}${runs((cv.title || 'TÍTULO DEL INFORME').toUpperCase(), { b: true, color: NAVY, sz: 30 })}</w:p>`;
  cover += cp('Informe final de práctica empresarial', { after: 1200 }, { i: true, color: GRAY, sz: 22 });
  cover += cp(pr.studentName || '', { after: 40 }, { b: true, color: NAVY });
  cover += cp(`Código estudiantil: ${pr.studentCode || ''}`, { after: 600 }, { color: GRAY, sz: 20 });
  cover += cp('Informe presentado como requisito parcial para optar al título de', { after: 40 }, { color: GRAY, sz: 20 });
  cover += cp(`Ingeniero(a) en Informática`, { after: 400 }, { b: true, sz: 22 });
  cover += `<w:p>${ppr({ after: 40, jc: 'center' })}<w:r>${rpr({ sz: 20 })}${T('Asesor(a) académico(a): ')}</w:r><w:r>${rpr({ b: true, sz: 20 })}${T(cv.academicAdvisor || pr.ownerName || '')}</w:r></w:p>`;
  cover += `<w:p>${ppr({ after: 1200, jc: 'center' })}<w:r>${rpr({ sz: 20 })}${T('Asesor(a) empresarial: ')}</w:r><w:r>${rpr({ b: true, sz: 20 })}${T(cv.companyAdvisor || '')}</w:r></w:p>`;
  cover += cp(cv.city || 'Manizales, Caldas, Colombia', {}, { b: true, color: NAVY, sz: 22 });
  cover += cp(cv.year || String(new Date().getFullYear()), {}, { b: true, color: NAVY, sz: 22 });
  xml = fillParas(xml, 'cover', cover);

  // ---------------- Preliminares ----------------
  let front = '';
  let first = true;
  const title = (t) => { const x = frontTitle(t, first); first = false; return x; };
  if (String(fr.dedication || '').trim()) {
    front += title('DEDICATORIA');
    front += paragraphs(fr.dedication).map((t, i) => para(t, { before: i ? 0 : 2400, after: 160, line: 360, ind: { left: 4000 }, jc: 'right' }, { i: true })).join('');
  }
  if (String(fr.thanks || '').trim()) {
    front += title('AGRADECIMIENTOS');
    front += paragraphs(fr.thanks).map((t) => para(t, BODY)).join('');
  }
  const dec = fr.declaration || {};
  if (dec.include !== false) {
    front += title('DECLARACIÓN DE AUTORÍA Y USO DE HERRAMIENTAS DE INTELIGENCIA ARTIFICIAL');
    front += para(`Yo, ${pr.studentName || ''}, identificado(a) con documento de identidad n.º ${pr.studentDoc || ''}, declaro que el presente informe es de mi autoría, que ha sido elaborado a partir del trabajo realizado durante la práctica empresarial y que las ideas, datos y textos de terceros se encuentran debidamente citados y referenciados conforme a la norma APA 7.ª edición.`, BODY);
    front += para(dec.aiUsed
      ? `Declaro, asimismo, que utilicé herramientas de inteligencia artificial generativa (${dec.aiTools || 'herramienta no especificada'}) únicamente como apoyo para ${dec.aiUse || 'tareas de apoyo'}. Todo contenido asistido fue revisado, validado y ajustado críticamente por mí, y asumo plena responsabilidad por su exactitud. Ningún resultado, análisis o conclusión fue generado de forma automática sin verificación.`
      : 'Declaro, asimismo, que no utilicé herramientas de inteligencia artificial generativa en la elaboración del contenido de este informe.', BODY);
    front += para(`La información de carácter reservado de la organización ha sido omitida o anonimizada${dec.confidentiality ? ` de acuerdo con el acuerdo de confidencialidad suscrito el ${dec.confidentiality}` : ' de acuerdo con las políticas de confidencialidad de la organización'}.`, BODY);
    front += emptyP({ after: 1200 });
    front += para(pr.studentName || '', { borderTop: { sz: 6, space: 4, color: '000000' }, ind: { left: 4200 } }, { b: true, sz: 20 });
    front += `<w:p>${ppr({ ind: { left: 4200 } })}<w:r>${rpr({ color: GRAY, sz: 18 })}${T(`${pr.studentDocType === 'CC' || !pr.studentDocType ? 'C. C.' : pr.studentDocType} ${pr.studentDoc || ''}`)}</w:r></w:p>`;
  }
  front += title('RESUMEN');
  front += paragraphs(fr.abstractEs).map((t) => para(t, BODY)).join('') || emptyP();
  front += `<w:p>${ppr({ after: 160, line: 360 })}<w:r>${rpr({ b: true })}${T('Palabras clave:')}</w:r>${runs(` ${fr.keywordsEs || ''}`)}</w:p>`;
  front += title('ABSTRACT');
  front += paragraphs(fr.abstractEn).map((t) => para(t, BODY, { i: true })).join('') || emptyP();
  front += `<w:p>${ppr({ after: 160, line: 360 })}<w:r>${rpr({ b: true })}${T('Keywords:')}</w:r>${runs(` ${fr.keywordsEn || ''}`)}</w:p>`;

  // Índices (campos de Word: se actualizan al abrir el documento)
  const tocEntries = [];
  N.chapters.forEach((c) => {
    tocEntries.push({ text: `${c.num ? `${c.num}. ` : ''}${c.title}`, level: 1 });
    c.blocks.forEach((b) => { if (b.t === 'h2') tocEntries.push({ text: `${b.num} ${b.text}`, level: 2 }); if (b.t === 'h3') tocEntries.push({ text: `${b.num} ${b.text}`, level: 3 }); });
  });
  if (String(f.references || '').trim()) tocEntries.push({ text: 'REFERENCIAS', level: 1 });
  const annexes = (f.annexes || []).filter((a) => a.title || a.text);
  if (annexes.length) { tocEntries.push({ text: 'ANEXOS', level: 1 }); annexes.forEach((a, i) => tocEntries.push({ text: `Anexo ${String.fromCharCode(65 + i)}. ${a.title}`, level: 2 })); }
  front += title('CONTENIDO');
  front += tocField('TOC \\o "1-3" \\h \\z \\u', tocEntries, 'Actualice el índice: clic derecho → Actualizar campo.');
  const tables = [], figures = [];
  N.chapters.forEach((c) => c.blocks.forEach((b) => {
    if (b.t === 'table') tables.push({ lead: `Tabla ${b.num}. `, text: b.caption || '', style: 'Tabladeilustraciones' });
    if (b.t === 'figure' || b.t === 'code') figures.push({ lead: `Figura ${b.num}. `, text: b.caption || '', style: 'Tabladeilustraciones' });
  }));
  if (tables.length) { front += title('LISTA DE TABLAS'); front += tocField('TOC \\h \\z \\c "Tabla"', tables, ''); }
  if (figures.length) { front += title('LISTA DE FIGURAS'); front += tocField('TOC \\h \\z \\c "Figura"', figures, ''); }
  const acr = (fr.acronyms || []).filter((r) => r[0] || r[1]).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es'));
  if (acr.length) { front += title('LISTA DE SIGLAS Y ACRÓNIMOS'); front += dataTable(['Sigla', 'Significado'], acr); }
  const glo = (fr.glossary || []).filter((r) => r[0] || r[1]).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es'));
  if (glo.length) {
    front += title('GLOSARIO');
    front += glo.map(([t, d]) => `<w:p>${ppr(BODY)}<w:r>${rpr({ b: true })}${T(`${t}:`)}</w:r>${runs(` ${d}`)}</w:p>`).join('');
  }
  xml = fillParas(xml, 'front', front);

  // ---------------- Cuerpo ----------------
  const fileMap = new Map(files.map((x) => [x.id, x]));
  let main = '';
  N.chapters.forEach((c, ci) => {
    main += para(`${c.num ? `${c.num}. ` : ''}${c.title}`, { style: 'Ttulo1', pageBreak: ci > 0 });
    for (const b of c.blocks) {
      if (b.t === 'p') main += paragraphs(b.text).map((t) => para(t, BODY)).join('');
      else if (b.t === 'h2') main += para(`${b.num} ${b.text}`, { style: 'Ttulo2' });
      else if (b.t === 'h3') main += para(`${b.num} ${b.text}`, { style: 'Ttulo3' });
      else if (b.t === 'ul' || b.t === 'ol') {
        const items = (b.items || []).filter((x) => String(x).trim());
        if (!items.length) continue;
        const id = b.t === 'ul' ? 3 : newNum(b.style === 'oe' ? 4 : 2);
        main += items.map((t) => para(t, { style: 'Prrafodelista', num: id, after: 80, line: 360, jc: 'both' })).join('');
        main += emptyP({ after: 80 });
      } else if (b.t === 'table') {
        main += caption('Tabla', b.num, b.caption);
        main += dataTable(b.cols || [], (b.rows || []).filter((r) => r.some((x) => String(x).trim())));
        main += noteP(b.note);
      } else if (b.t === 'figure') {
        main += caption('Figura', b.num, b.caption);
        const file = fileMap.get(b.fileId);
        const rid = file ? addImage(file.dataUrl, b.caption || file.name) : null;
        if (rid) {
          const [cx, cy] = fitImage(file.w, file.h);
          main += `<w:p>${ppr({ keepNext: true, jc: 'center' })}${drawing(rid, cx, cy, ++drawingId, b.caption || file.name || 'Figura')}</w:p>`;
        } else main += para('[Figura pendiente por cargar]', { jc: 'center', after: 120 }, { color: '7F6000', i: true });
        main += noteP(b.note);
      } else if (b.t === 'code') {
        main += caption('Figura', b.num, b.caption);
        main += codeBox(b.text);
        main += noteP(b.note);
      } else if (b.t === 'formula') {
        main += para(b.text, { after: 160, line: 360, jc: 'center' }, { i: true });
      }
    }
  });
  const refs = String(f.references || '').split('\n').map((x) => x.trim()).filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  if (refs.length) {
    main += para('REFERENCIAS', { style: 'Ttulo1', pageBreak: true });
    main += refs.map((r) => para(r, { after: 160, line: 360, ind: { left: 720, hanging: 720 } })).join('');
  }
  if (annexes.length) {
    main += para('ANEXOS', { style: 'Ttulo1', pageBreak: true });
    annexes.forEach((a, i) => {
      main += para(`Anexo ${String.fromCharCode(65 + i)}. ${a.title || ''}`, { style: 'Ttulo2' });
      main += paragraphs(a.text).map((t) => para(t, BODY)).join('');
    });
  }
  xml = fillParas(xml, 'main', main);

  zip.file('word/_rels/document.xml.rels', rels);
  zip.file('word/numbering.xml', numbering);
  return finish(zip, xml);
}

export const DOCX = { MIME: DOCX_MIME };
