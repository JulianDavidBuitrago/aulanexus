// =====================================================================
//  Vista previa (HTML) de los formatos de práctica: imita la hoja de Word
// =====================================================================
import { APP } from './firebase-config.js';
import { esc } from './util.js';
import {
  inlineRuns, paragraphs, dmy, longDate, parseISODate, numberFinal, todayISO, currentPeriod
} from './practica-model.js';

export const bannerSrc = () => window.__AN_TEMPLATES__?.bannerUrl || 'templates/banner.png';

const rich = (s) => String(s ?? '').split('\n').map((line) => inlineRuns(line).map((r) => {
  let h = esc(r.text);
  if (r.b) h = `<b>${h}</b>`;
  if (r.i) h = `<i>${h}</i>`;
  return h;
}).join('')).join('<br>');
const ps = (s, cls = '') => paragraphs(s).map((t) => `<p class="${cls}">${rich(t)}</p>`).join('');
const missing = (label) => `<span class="dp-missing">${esc(label)}</span>`;
const v = (s, label) => (String(s ?? '').trim() ? esc(s) : missing(label));

const header = () => `<div class="dp-banner"><img src="${bannerSrc()}" alt="Facultad de Inteligencia Artificial e Ingenierías · Universidad de Caldas"></div>`;
const footer = () => '<div class="dp-foot">Universidad de Caldas · Tejiendo Universidad</div>';

// ---------------- Propuesta ----------------
export function proposalHTML(pr) {
  const c = pr.company || {}, p = pr.proposal || {};
  const fd = parseISODate(p.fillDate || todayISO()) || {}, fi = parseISODate(c.startDate) || {}, ft = parseISODate(c.endDate) || {};
  const date3 = (d) => `<span class="dp-date"><small>dd</small>${esc(d.d || '  ')}</span><span class="dp-date"><small>mm</small>${esc(d.m || '  ')}</span><span class="dp-date"><small>aaaa</small>${esc(d.y || '    ')}</span>`;
  const needs = (p.needs || []).filter((n) => n.a || n.b || n.c);
  const oes = (p.specific || []).filter((x) => String(x).trim());
  const phases = (p.phases || []).filter((f) => f.title || f.text);
  const acts = (p.activities || []).filter((a) => a.act || a.ent);
  return `<div class="doc-paper dp-prop">
    ${header()}
    <p class="dp-center"><b>Ingeniería de Sistemas y Computación</b><br><b>Propuesta de Práctica</b></p>
    <table class="dp-plain">
      <tr><td>Estudiante:</td><td>${v(pr.studentName, 'Estudiante')}</td><td>Código:</td><td>${v(pr.studentCode, 'Código')}</td></tr>
      <tr><td>Profesor asesor:</td><td colspan="3">${v(pr.ownerName, 'Docente')}</td></tr>
      <tr><td>Periodo académico:</td><td>${esc(pr.period || currentPeriod())}</td><td>Fecha de diligenciamiento:</td><td>${date3(fd)}</td></tr>
    </table>
    <div class="dp-sec"><span>I.</span>INFORMACIÓN DE LA PRÁCTICA</div>
    <table class="dp-grid">
      <tr><th>Fecha de inicio:</th><td>${date3(fi)}</td><th>Fecha de terminación:</th><td>${date3(ft)}</td></tr>
      <tr><th colspan="4">La práctica es remunerada: &nbsp; SÍ (${c.paid === true ? 'X' : '&nbsp;'}) &nbsp;-&nbsp; NO (${c.paid === false ? 'X' : '&nbsp;'})</th></tr>
      <tr><th colspan="2">Nombre del funcionario responsable de la práctica en la entidad:</th><td colspan="2">${v(c.contactName, 'Funcionario responsable')}</td></tr>
      <tr><th>Cargo:</th><td colspan="3">${v(c.contactRole, 'Cargo')}</td></tr>
      <tr><th>Teléfono:</th><td>${v(c.contactPhone, 'Teléfono')}</td><th>Correo electrónico:</th><td>${v(c.contactEmail, 'Correo')}</td></tr>
    </table>
    <div class="dp-sec"><span>II.</span>DESARROLLO DE LA PRÁCTICA</div>
    <table class="dp-box"><tr><th>Descripción General de la práctica</th></tr><tr><td>
      ${ps(p.description, 'j') || `<p>${missing('Descripción general de la práctica')}</p>`}
      <p><b>Necesidades actuales identificadas y estrategia de solución:</b></p>
      <table class="dp-grid"><tr class="sh"><th>Necesidad identificada</th><th>Manifestación en la operación</th><th>Cómo se atenderá desde la práctica</th></tr>
        ${needs.length ? needs.map((n) => `<tr><td>${rich(n.a)}</td><td>${rich(n.b)}</td><td>${rich(n.c)}</td></tr>`).join('') : `<tr><td colspan="3">${missing('Sin necesidades registradas')}</td></tr>`}
      </table>
      <p style="margin-top:10px"><b>Resultado general esperado</b></p>${ps(p.expected, 'j') || `<p>${missing('Resultado general esperado')}</p>`}
    </td></tr></table>
    <table class="dp-box"><tr><th>Objetivo General</th></tr><tr><td>${ps(p.objective, 'j') || missing('Objetivo general')}</td></tr></table>
    <table class="dp-box"><tr><th>Objetivos Específicos</th></tr><tr><td>${oes.length ? oes.map((t, i) => `<p class="j dp-hang"><b>OE${i + 1}.</b> ${rich(t)}</p>`).join('') : missing('Objetivos específicos')}</td></tr></table>
    <table class="dp-box"><tr><th>Proceso Metodológico</th></tr><tr><td>
      ${ps(p.methodIntro, 'j')}
      ${phases.map((f, i) => `<p class="dp-phase"><b>Fase ${i + 1}. ${esc(f.title || '')}${f.oes ? ` – ${esc(f.oes)}.` : ''}</b></p>${ps(f.text, 'j')}`).join('') || (!p.methodIntro ? missing('Proceso metodológico') : '')}
    </td></tr></table>
    <table class="dp-grid dp-acts"><tr class="sh"><th></th><th>Actividades – Etapas proyecto</th><th>Entregable(s) asociado(s)</th><th>Fecha</th></tr>
      ${acts.length ? acts.map((a, i) => `<tr><td class="c"><b>${i + 1}</b></td><td>${a.oe ? `<b>(${esc(a.oe)})</b> ` : ''}${rich(a.act)}</td><td>${rich(a.ent)}</td><td>${esc(dmy(a.ini))}<br>-<br>${esc(dmy(a.fin))}</td></tr>`).join('') : `<tr><td colspan="4">${missing('Sin actividades registradas')}</td></tr>`}
    </table>
    <div class="dp-signs"><div>Firma del estudiante</div><div>Firma del Profesor</div><div>Firma del funcionario responsable</div></div>
    ${footer()}
  </div>`;
}

// ---------------- Acta de visita ----------------
export function actaHTML(pr, visit) {
  const a = visit.acta || {}, c = pr.company || {};
  return `<div class="doc-paper dp-acta">
    ${header()}
    <p class="dp-center" style="margin:26px 0"><b>Acta Control Visita Empresarial</b></p>
    <p class="j dp-l15">El profesor asesor <u>${v(pr.ownerName, 'Nombre asesor')}</u> ha realizado su visita de revisión al estudiante <u>${v(pr.studentName, 'Nombre estudiante')}</u> en la empresa <u>${v(c.name, 'Nombre empresa')}</u> en la fecha <u>${esc(longDate(visit.date || Date.now()))}</u>, contando con la presencia de <u>${v(a.responsible || c.contactName, 'Nombre responsable empresa')}</u> por parte de la empresa.</p>
    <p class="dp-l15" style="margin-top:22px">Breve explicación del desarrollo de la visita y conclusiones.</p>
    ${ps(a.development, 'j dp-l15') || `<p>${missing('Desarrollo de la visita y conclusiones')}</p>`}
    <div class="dp-acta-signs"><div>Firma Estudiante</div><div>Firma Responsable Empresa</div><div>Firma Profesor Asesor</div></div>
    ${footer()}
  </div>`;
}

// ---------------- Informe final ----------------
export function finalHTML(pr, files = []) {
  const f = pr.final || {}, cv = f.cover || {}, fr = f.front || {};
  const N = numberFinal(f);
  const fileMap = new Map(files.map((x) => [x.id, x]));
  const page = (inner, cls = '') => `<div class="doc-paper dp-inf ${cls}">${inner}</div>`;
  const ftitle = (t) => `<h2 class="dp-ftitle">${esc(t)}</h2>`;
  const dec = fr.declaration || {};
  const out = [];
  out.push(page(`
    <div class="dp-cover">
      <img class="dp-cover-logo" src="${bannerSrc()}" alt="">
      <p class="dp-uc">UNIVERSIDAD DE CALDAS</p>
      <p class="dp-g">Facultad de Inteligencia Artificial e Ingenierías<br>Departamento de Sistemas e Informática<br>Programa de ${esc(APP.program || 'Ingeniería en Informática')}</p>
      <h1 class="dp-ctitle">${cv.title ? esc(cv.title.toUpperCase()) : missing('TÍTULO DEL INFORME')}</h1>
      <p class="dp-g"><i>Informe final de práctica empresarial</i></p>
      <p class="dp-name">${esc(pr.studentName || '')}</p>
      <p class="dp-g sm">Código estudiantil: ${esc(pr.studentCode || '')}</p>
      <p class="dp-g sm" style="margin-top:28px">Informe presentado como requisito parcial para optar al título de<br><b style="color:#000">Ingeniero(a) en Informática</b></p>
      <p class="sm" style="margin-top:20px">Asesor(a) académico(a): <b>${v(cv.academicAdvisor || pr.ownerName, 'Asesor académico')}</b><br>Asesor(a) empresarial: <b>${v(cv.companyAdvisor, 'Asesor empresarial')}</b></p>
      <p class="dp-city">${esc(cv.city || 'Manizales, Caldas, Colombia')}<br>${esc(cv.year || '')}</p>
    </div>`, 'dp-cover-page'));
  let front = '';
  if (String(fr.dedication || '').trim()) front += page(ftitle('DEDICATORIA') + `<div class="dp-dedic">${ps(fr.dedication)}</div>`);
  if (String(fr.thanks || '').trim()) front += page(ftitle('AGRADECIMIENTOS') + ps(fr.thanks, 'j b15'));
  if (dec.include !== false) {
    front += page(ftitle('DECLARACIÓN DE AUTORÍA Y USO DE HERRAMIENTAS DE INTELIGENCIA ARTIFICIAL') + `
      <p class="j b15">Yo, ${esc(pr.studentName || '')}, identificado(a) con documento de identidad n.º ${esc(pr.studentDoc || '')}, declaro que el presente informe es de mi autoría, que ha sido elaborado a partir del trabajo realizado durante la práctica empresarial y que las ideas, datos y textos de terceros se encuentran debidamente citados y referenciados conforme a la norma APA 7.ª edición.</p>
      <p class="j b15">${dec.aiUsed ? `Declaro, asimismo, que utilicé herramientas de inteligencia artificial generativa (${v(dec.aiTools, 'herramienta y versión')}) únicamente como apoyo para ${v(dec.aiUse, 'propósito')}. Todo contenido asistido fue revisado, validado y ajustado críticamente por mí, y asumo plena responsabilidad por su exactitud. Ningún resultado, análisis o conclusión fue generado de forma automática sin verificación.` : 'Declaro, asimismo, que no utilicé herramientas de inteligencia artificial generativa en la elaboración del contenido de este informe.'}</p>
      <p class="j b15">La información de carácter reservado de la organización ha sido omitida o anonimizada${dec.confidentiality ? ` de acuerdo con el acuerdo de confidencialidad suscrito el ${esc(dec.confidentiality)}` : ' de acuerdo con las políticas de confidencialidad de la organización'}.</p>
      <div class="dp-signature"><b>${esc(pr.studentName || '')}</b><small>C. C. ${esc(pr.studentDoc || '')}</small></div>`);
  }
  front += page(ftitle('RESUMEN') + (ps(fr.abstractEs, 'j b15') || `<p>${missing('Resumen')}</p>`) + `<p class="b15"><b>Palabras clave:</b> ${esc(fr.keywordsEs || '')}</p>`
    + ftitle('ABSTRACT') + (ps(fr.abstractEn, 'j b15 it') || `<p>${missing('Abstract')}</p>`) + `<p class="b15"><b>Keywords:</b> ${esc(fr.keywordsEn || '')}</p>`);
  // Contenido
  const toc = [];
  N.chapters.forEach((c) => {
    toc.push(`<div class="toc1">${c.num ? `${c.num}. ` : ''}${esc(c.title)}</div>`);
    c.blocks.forEach((b) => { if (b.t === 'h2') toc.push(`<div class="toc2">${b.num} ${esc(b.text)}</div>`); if (b.t === 'h3') toc.push(`<div class="toc3">${b.num} ${esc(b.text)}</div>`); });
  });
  if (String(f.references || '').trim()) toc.push('<div class="toc1">REFERENCIAS</div>');
  const annexes = (f.annexes || []).filter((a) => a.title || a.text);
  if (annexes.length) { toc.push('<div class="toc1">ANEXOS</div>'); annexes.forEach((a, i) => toc.push(`<div class="toc2">Anexo ${String.fromCharCode(65 + i)}. ${esc(a.title)}</div>`)); }
  front += page(ftitle('CONTENIDO') + `<div class="dp-toc">${toc.join('')}</div><p class="dp-hint">En Word, los números de página del índice se actualizan al abrir el documento.</p>`);
  const tl = [], fl = [];
  N.chapters.forEach((c) => c.blocks.forEach((b) => {
    if (b.t === 'table') tl.push(`<div><b>Tabla ${b.num}.</b> <i>${esc(b.caption || '')}</i></div>`);
    if (b.t === 'figure' || b.t === 'code') fl.push(`<div><b>Figura ${b.num}.</b> <i>${esc(b.caption || '')}</i></div>`);
  }));
  if (tl.length || fl.length) front += page((tl.length ? ftitle('LISTA DE TABLAS') + `<div class="dp-toc">${tl.join('')}</div>` : '') + (fl.length ? ftitle('LISTA DE FIGURAS') + `<div class="dp-toc">${fl.join('')}</div>` : ''));
  const acr = (fr.acronyms || []).filter((r) => r[0] || r[1]).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es'));
  const glo = (fr.glossary || []).filter((r) => r[0] || r[1]).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es'));
  if (acr.length || glo.length) {
    front += page((acr.length ? ftitle('LISTA DE SIGLAS Y ACRÓNIMOS') + table(['Sigla', 'Significado'], acr) : '')
      + (glo.length ? ftitle('GLOSARIO') + glo.map(([t, d]) => `<p class="j b15"><b>${esc(t)}:</b> ${rich(d)}</p>`).join('') : ''));
  }
  out.push(front);
  // Cuerpo
  N.chapters.forEach((c) => {
    let h = `<h2 class="dp-h1">${c.num ? `${c.num}. ` : ''}${esc(c.title)}</h2>`;
    for (const b of c.blocks) {
      if (b.t === 'p') h += ps(b.text, 'j b15');
      else if (b.t === 'h2') h += `<h3 class="dp-h2">${b.num} ${esc(b.text)}</h3>`;
      else if (b.t === 'h3') h += `<h4 class="dp-h3">${b.num} ${esc(b.text)}</h4>`;
      else if (b.t === 'ul') h += `<ul class="dp-ul">${b.items.filter((x) => String(x).trim()).map((x) => `<li>${rich(x)}</li>`).join('')}</ul>`;
      else if (b.t === 'ol') h += `<ol class="dp-ol ${b.style === 'oe' ? 'oe' : ''}">${b.items.filter((x) => String(x).trim()).map((x) => `<li>${rich(x)}</li>`).join('')}</ol>`;
      else if (b.t === 'table') h += `<p class="dp-cap"><b>Tabla ${b.num}.</b> <i>${esc(b.caption || '')}</i></p>${table(b.cols, b.rows.filter((r) => r.some((x) => String(x).trim())))}${note(b.note)}`;
      else if (b.t === 'figure') {
        const file = fileMap.get(b.fileId);
        h += `<p class="dp-cap"><b>Figura ${b.num}.</b> <i>${esc(b.caption || '')}</i></p>${file ? `<div class="dp-fig"><img src="${file.dataUrl}" alt="${esc(b.caption || file.name)}"></div>` : `<div class="dp-fig">${missing('Figura pendiente por cargar')}</div>`}${note(b.note)}`;
      } else if (b.t === 'code') h += `<p class="dp-cap"><b>Figura ${b.num}.</b> <i>${esc(b.caption || '')}</i></p><pre class="dp-code">${esc(b.text)}</pre>${note(b.note)}`;
      else if (b.t === 'formula') h += `<p class="dp-formula">${rich(b.text)}</p>`;
    }
    out.push(page(h));
  });
  const refs = String(f.references || '').split('\n').map((x) => x.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  if (refs.length) out.push(page(`<h2 class="dp-h1">REFERENCIAS</h2>${refs.map((r) => `<p class="dp-ref">${rich(r)}</p>`).join('')}`));
  if (annexes.length) out.push(page(`<h2 class="dp-h1">ANEXOS</h2>${annexes.map((a, i) => `<h3 class="dp-h2">Anexo ${String.fromCharCode(65 + i)}. ${esc(a.title)}</h3>${ps(a.text, 'j b15')}`).join('')}`));
  return out.join('');
}

function table(cols, rows) {
  return `<table class="dp-data"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((_, i) => `<td>${rich(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
const note = (t) => (String(t || '').trim() ? `<p class="dp-note"><i>Nota.</i> ${rich(t)}</p>` : '');
