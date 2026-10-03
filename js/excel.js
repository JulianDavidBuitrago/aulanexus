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
    { header: 'Correo electrónico', key: 'email', width: 38 },
    { header: 'Celular', key: 'phone', width: 18 }
  ];
  const h = ws.getRow(1);
  h.height = 24;
  h.eachCell((c) => { Object.assign(c, HEAD); c.border = { bottom: { style: 'thin', color: { argb: 'FF22D3EE' } } }; });
  for (let r = 2; r <= 600; r++) {
    // Código y documento como texto: evita perder ceros o convertir a notación científica
    ws.getCell(`B${r}`).numFmt = '@';
    ws.getCell(`D${r}`).numFmt = '@';
    ws.getCell(`F${r}`).numFmt = '@';
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
    ['Celular', 'Opcional. 10 dígitos sin espacios. Ej.: 3001234567'],
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
  if (n.includes('celular') || n.includes('telefono') || n.includes('movil') || n.includes('whatsapp')) return 'phone';
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
        email: get('email').toLowerCase(),
        phone: get('phone').replace(/[\s().-]/g, '')
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

// ---------- Asistencia de una clase ----------
// data: { cls, period, schedule, sessions:[{key, iso, label}], students:[{name, code, doc, email, marks:[status|null], totals, records:[…]}] }
const ATT = {
  presente: { t: 'P', label: 'Presente', fill: 'FFD1FAE5', font: 'FF065F46' },
  tarde: { t: 'T', label: 'Tarde', fill: 'FFFEF3C7', font: 'FF92400E' },
  ausente: { t: 'A', label: 'Ausente', fill: 'FFFEE2E2', font: 'FF991B1B' },
  excusa: { t: 'E', label: 'Excusa', fill: 'FFDBEAFE', font: 'FF1E40AF' }
};
export async function exportAttendance(data) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AulaNexus';
  const c = data.cls, n = data.sessions.length;
  const thin = { style: 'thin', color: { argb: 'FFD4D4D8' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const fixed = ['#', 'Estudiante', 'Código', 'Documento'];
  const tail = ['Presente', 'Tarde', 'Ausente', 'Excusa', '% asistencia'];

  // ---- Hoja 1: matriz ----
  const ws = wb.addWorksheet('Asistencia', { views: [{ state: 'frozen', xSplit: 2, ySplit: 6 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const lastCol = fixed.length + n + tail.length;
  ws.mergeCells(1, 1, 1, Math.max(lastCol, 6));
  Object.assign(ws.getCell(1, 1), { value: `Asistencia · ${c.name}${c.code ? ` (${c.code})` : ''}`, font: { bold: true, size: 14, color: { argb: 'FF4C1D95' } } });
  ws.getCell(2, 1).value = `Docente: ${c.ownerName || ''}`;
  ws.getCell(3, 1).value = `Periodo: ${data.period || 'sin fechas definidas'}${data.schedule ? ` · Horario: ${data.schedule}` : ''}`;
  ws.getCell(4, 1).value = `Generado: ${new Date().toLocaleString('es-CO')} · P presente · T tarde · A ausente · E excusa · el % no cuenta las excusas`;
  [2, 3, 4].forEach((r) => { ws.getCell(r, 1).font = { color: { argb: 'FF52525B' }, size: 10 }; });

  const H = 6;
  const head = [...fixed, ...data.sessions.map((s) => s.label), ...tail];
  ws.getRow(H).values = head;
  ws.getRow(H).height = 30;
  ws.getRow(H).eachCell((cell, i) => {
    Object.assign(cell, HEAD);
    cell.alignment = { vertical: 'middle', horizontal: i <= 2 ? 'left' : 'center', wrapText: true };
    cell.border = border;
  });
  // Fecha completa como nota en cada sesión
  data.sessions.forEach((s, i) => { ws.getCell(H, fixed.length + 1 + i).note = s.iso; });

  data.students.forEach((st, idx) => {
    const t = st.totals || {};
    const row = ws.getRow(H + 1 + idx);
    row.values = [idx + 1, st.name, st.code, st.doc, ...st.marks.map((m) => (m ? ATT[m].t : '')), t.presente || 0, t.tarde || 0, t.ausente || 0, t.excusa || 0, t.pct != null ? t.pct / 100 : null];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > lastCol) return;
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: col === 2 ? 'left' : 'center' };
      const m = col > fixed.length && col <= fixed.length + n ? st.marks[col - fixed.length - 1] : null;
      if (m) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ATT[m].fill } }; cell.font = { bold: true, color: { argb: ATT[m].font } }; }
    });
    const pc = row.getCell(lastCol);
    pc.numFmt = '0%';
    if (t.pct != null) pc.font = { bold: true, color: { argb: t.pct >= 80 ? 'FF065F46' : t.pct >= 60 ? 'FF92400E' : 'FF991B1B' } };
  });
  // Totales por sesión
  if (data.students.length && n) {
    const r = ws.getRow(H + data.students.length + 1);
    r.getCell(2).value = 'Presentes + tarde por sesión';
    r.getCell(2).font = { italic: true, color: { argb: 'FF52525B' } };
    data.sessions.forEach((s, i) => {
      const cell = r.getCell(fixed.length + 1 + i);
      cell.value = data.students.filter((st) => ['presente', 'tarde'].includes(st.marks[i])).length;
      cell.alignment = { horizontal: 'center' }; cell.font = { bold: true };
    });
  }
  ws.getColumn(1).width = 5; ws.getColumn(2).width = 34; ws.getColumn(3).width = 14; ws.getColumn(4).width = 17;
  for (let i = 0; i < n; i++) ws.getColumn(fixed.length + 1 + i).width = 8.5;
  tail.forEach((_, i) => { ws.getColumn(fixed.length + n + 1 + i).width = i === tail.length - 1 ? 13 : 10; });
  if (data.students.length) ws.autoFilter = { from: { row: H, column: 1 }, to: { row: H + data.students.length, column: lastCol } };

  // ---- Hoja 2: detalle ----
  const wd = wb.addWorksheet('Detalle', { views: [{ state: 'frozen', ySplit: 1 }] });
  wd.columns = [
    { header: 'Fecha', key: 'date', width: 12 },
    { header: 'Día', key: 'day', width: 11 },
    { header: 'Estudiante', key: 'name', width: 34 },
    { header: 'Código', key: 'code', width: 14 },
    { header: 'Correo', key: 'email', width: 34 },
    { header: 'Estado', key: 'status', width: 12 },
    { header: 'Registrado por', key: 'by', width: 24 },
    { header: 'Hora de registro', key: 'at', width: 20 }
  ];
  wd.getRow(1).eachCell((cell) => Object.assign(cell, HEAD));
  const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const rows = [];
  data.students.forEach((st) => st.records.forEach((r) => rows.push({ st, r })));
  rows.sort((a, b) => a.r.key - b.r.key || a.st.name.localeCompare(b.st.name, 'es'));
  rows.forEach(({ st, r }) => {
    const [y, m, d] = r.iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const row = wd.addRow({
      date: dt, day: DAYS[dt.getUTCDay()], name: st.name, code: st.code, email: st.email,
      status: r.status ? ATT[r.status].label : 'Pendiente', by: r.by,
      at: r.at ? new Date(r.at).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : ''
    });
    row.getCell('date').numFmt = 'dd/mm/yyyy';
    if (r.status) { const sc = row.getCell('status'); sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ATT[r.status].fill } }; sc.font = { color: { argb: ATT[r.status].font } }; }
  });
  if (rows.length) wd.autoFilter = { from: 'A1', to: `H${rows.length + 1}` };

  const buf = await wb.xlsx.writeBuffer();
  const safe = String(c.code || c.name || 'clase').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, '').trim().replace(/\s+/g, '-');
  download(`asistencia-${safe}-${new Date().toLocaleDateString('sv-SE')}.xlsx`, buf, XLSX_MIME);
}
