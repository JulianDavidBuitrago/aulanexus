// =====================================================================
//  Excel: plantilla de estudiantes, lectura de archivos (.xlsx / .csv) y
//  exportación de resultados. Usa ExcelJS (MIT) incluido en js/vendor y
//  cargado solo cuando se necesita.
// =====================================================================
import { norm, normDocType, download, formatName } from './util.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
let loading = null;

export function loadExcel() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/exceljs.min.js';
      s.onload = () => (window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('ExcelJS no disponible')));
      s.onerror = () => { loading = null; reject(new Error('No se pudo cargar el lector de Excel')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

const HEAD = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6D28D9' } }, alignment: { vertical: 'middle' } };

// ---------- Plantilla descargable ----------
export async function downloadTemplate() {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AulaNexus';
  wb.created = new Date();

  const ws = wb.addWorksheet('Estudiantes', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Nombre completo', key: 'fullName', width: 36 },
    { header: 'Código estudiante', key: 'studentCode', width: 20 },
    { header: 'Tipo documento', key: 'docType', width: 18 },
    { header: 'Número documento', key: 'docNumber', width: 20 },
    { header: 'Correo electrónico', key: 'email', width: 38 }
  ];
  const h = ws.getRow(1);
  h.height = 24;
  h.eachCell((c) => { Object.assign(c, HEAD); c.border = { bottom: { style: 'thin', color: { argb: 'FF22D3EE' } } }; });
  for (let r = 2; r <= 600; r++) {
    // Código y documento como texto: evita perder ceros o convertir a notación científica
    ws.getCell(`B${r}`).numFmt = '@';
    ws.getCell(`D${r}`).numFmt = '@';
    ws.getCell(`C${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"CC,TI,CE,PA,PPT"'],
      showErrorMessage: true, errorTitle: 'Tipo de documento', error: 'Use CC, TI, CE, PA o PPT'
    };
  }

  const info = wb.addWorksheet('Instrucciones');
  info.columns = [{ width: 30 }, { width: 90 }];
  const rows = [
    ['AulaNexus · Carga masiva de estudiantes', ''],
    ['', ''],
    ['Cómo usar', 'Diligencie la hoja "Estudiantes" (una fila por estudiante, sin filas vacías intermedias) y cárguela en Inscripciones → Carga masiva.'],
    ['Nombre completo', 'Nombres y apellidos. Ej.: Valentina Ríos Gómez'],
    ['Código estudiante', 'Código institucional (4 a 20 caracteres, sin espacios). Ej.: 1702310045'],
    ['Tipo documento', 'CC (cédula de ciudadanía), TI (tarjeta de identidad), CE (cédula de extranjería), PA (pasaporte) o PPT (permiso por protección temporal).'],
    ['Número documento', 'Sin puntos ni espacios. Ej.: 1053845120'],
    ['Correo electrónico', 'Correo con el que el estudiante iniciará sesión. Ej.: valentina.rios@ucaldas.edu.co'],
    ['', ''],
    ['Contraseña inicial', 'Primer nombre con la primera letra en mayúscula + número de documento + * (asterisco).'],
    ['Ejemplo', 'Valentina Ríos Gómez, documento 1053845120  →  Valentina1053845120*'],
    ['Primer ingreso', 'El sistema obliga al estudiante a cambiar la contraseña la primera vez que ingresa.'],
    ['Estudiantes existentes', 'Si el correo o el documento ya están registrados, no se crea otra cuenta: el estudiante solo se inscribe en las clases seleccionadas.']
  ];
  rows.forEach((r) => info.addRow(r));
  info.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF6D28D9' } };
  for (let r = 3; r <= rows.length; r++) {
    info.getCell(`A${r}`).font = { bold: true };
    info.getCell(`B${r}`).alignment = { wrapText: true, vertical: 'top' };
  }

  const buf = await wb.xlsx.writeBuffer();
  download('plantilla-estudiantes-aulanexus.xlsx', buf, XLSX_MIME);
}

// ---------- Lectura ----------
function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('').trim();
  if (v.text !== undefined) return cellText(v.text);
  if (v.result !== undefined) return cellText(v.result);
  if (v.hyperlink) return String(v.hyperlink).replace(/^mailto:/i, '').trim();
  return String(v).trim();
}

function mapHeader(h) {
  const n = norm(h).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return null;
  if (n.includes('correo') || n.includes('email') || n === 'e mail' || n.includes('mail')) return 'email';
  if (n.includes('tipo')) return 'docType';
  if (n.includes('codigo')) return 'studentCode';
  if (n.includes('documento') || n.includes('cedula') || n.includes('identificacion') || n === 'numero' || n === 'no' || n === 'nro') return 'docNumber';
  if (n.includes('nombre') || n.includes('estudiante') || n.includes('apellido')) return 'fullName';
  return null;
}

function parseCSV(text) {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur.trim()); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur.trim()); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur.trim()); rows.push(row); }
  return rows.map((vals, i) => ({ rn: i + 1, vals }));
}

// Devuelve { rows: [{ rn, fullName, studentCode, docTypeRaw, docType, docNumber, email }], missing: [campos] }
export async function parseRoster(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  let matrix = [];
  if (ext === 'csv' || ext === 'txt') {
    matrix = parseCSV((await file.text()).replace(/^﻿/, ''));
  } else if (ext === 'xlsx') {
    const ExcelJS = await loadExcel();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets.find((w) => norm(w.name).includes('estudiante')) || wb.worksheets[0];
    if (!ws) throw new Error('El archivo no tiene hojas.');
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      const vals = [];
      const n = Math.max(row.cellCount, 6);
      for (let c = 1; c <= n; c++) vals.push(cellText(row.getCell(c).value));
      matrix.push({ rn, vals });
    });
  } else {
    throw Object.assign(new Error('Formato no soportado. Use .xlsx (Excel) o .csv.'), { code: 'app/format' });
  }

  // Busca la fila de encabezados entre las primeras 5
  let headerIdx = -1, map = {};
  for (let i = 0; i < Math.min(5, matrix.length); i++) {
    const m = {};
    matrix[i].vals.forEach((v, col) => { const k = mapHeader(v); if (k && m[k] === undefined) m[k] = col; });
    if (Object.keys(m).length >= 3) { headerIdx = i; map = m; break; }
  }
  if (headerIdx < 0) throw Object.assign(new Error('No se encontraron los encabezados. Use la plantilla oficial.'), { code: 'app/headers' });

  const required = ['fullName', 'studentCode', 'docNumber', 'email'];
  const missing = required.filter((k) => map[k] === undefined);
  const rows = matrix.slice(headerIdx + 1)
    .map(({ rn, vals }) => {
      const get = (k) => (map[k] === undefined ? '' : String(vals[map[k]] ?? '').trim());
      const docTypeRaw = get('docType');
      const nt = normDocType(docTypeRaw);
      return {
        rn,
        fullName: formatName(get('fullName')),
        studentCode: get('studentCode').toUpperCase().replace(/\s/g, ''),
        docTypeRaw,
        docType: nt === '' ? 'CC' : nt, // vacío → se asume cédula de ciudadanía
        docTypeAssumed: nt === '',
        docNumber: get('docNumber').replace(/[\s.]/g, '').toUpperCase(),
        email: get('email').toLowerCase()
      };
    })
    .filter((r) => r.fullName || r.email || r.docNumber || r.studentCode);
  return { rows, missing };
}

// ---------- Exportación de resultados ----------
export async function exportResults(rows, fileName = 'resultados-inscripcion.xlsx') {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Resultados', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Fila', key: 'rn', width: 7 },
    { header: 'Nombre completo', key: 'fullName', width: 34 },
    { header: 'Código', key: 'studentCode', width: 16 },
    { header: 'Documento', key: 'doc', width: 20 },
    { header: 'Correo', key: 'email', width: 36 },
    { header: 'Contraseña inicial', key: 'password', width: 26 },
    { header: 'Resultado', key: 'result', width: 22 },
    { header: 'Detalle', key: 'detail', width: 50 }
  ];
  ws.getRow(1).eachCell((c) => Object.assign(c, HEAD));
  rows.forEach((r) => ws.addRow({
    rn: r.rn, fullName: r.fullName, studentCode: r.studentCode, doc: `${r.docType} ${r.docNumber}`, email: r.email,
    password: r.password || '', result: r.resultLabel || '', detail: r.detail || ''
  }));
  const buf = await wb.xlsx.writeBuffer();
  download(fileName, buf, XLSX_MIME);
}
