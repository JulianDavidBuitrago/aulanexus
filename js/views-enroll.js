// =====================================================================
//  Inscripciones: el docente crea cuentas de estudiantes y los inscribe
//  en sus clases (individual o carga masiva desde Excel).
// =====================================================================
import { S, ctx, myClasses, classById, selfRegOpen, byName } from './state.js';
import { icon } from './icons.js';
import * as ui from './ui.js';
import { esc, norm, errMsg, DOC_TYPES, initialPassword, validatePerson, normDocType, formatName } from './util.js';
import { colorVar, empty, avatar, showCredentials } from './components.js';
import { TEACHER_EMAIL } from './firebase-config.js';
import { downloadTemplate, parseRoster, exportResults } from './excel.js';

export const routes = { inscripciones: enrollView };

const activeMine = () => myClasses().filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name, 'es'));

const classPicks = (name, preselect = []) => {
  const list = activeMine();
  if (!list.length) return `<div class="callout warn">${icon('info')}<div>Primero cree una clase activa en <a href="#/clases">Clases</a>.</div></div>`;
  return `<div class="pick-grid">${list.map((c) => `
    <label class="pick" style="--c:${colorVar(c.color)}">
      <input type="checkbox" name="${name}" value="${c.id}" ${preselect.includes(c.id) ? 'checked' : ''}>
      <span class="pick-dot">${icon('book')}</span>
      <span class="pick-body"><b>${esc(c.name)}</b><span>${esc(c.code || '')}</span></span>
      <span class="pick-check">${icon('check')}</span>
    </label>`).join('')}</div>`;
};
const checked = (root, name) => [...root.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);

// ---------- Búsqueda de estudiantes existentes ----------
function findExisting(p) {
  const byEmail = S.students.find((s) => (s.email || '').toLowerCase() === p.email);
  const byDoc = S.students.find((s) => String(s.docNumber).toUpperCase() === p.docNumber);
  const byCode = p.studentCode ? S.students.find((s) => String(s.studentCode).toUpperCase() === p.studentCode) : null;
  const found = byEmail || byDoc;
  if (byEmail && byDoc && byEmail.uid !== byDoc.uid) return { conflict: 'El correo y el documento pertenecen a estudiantes diferentes.' };
  if (found && byCode && byCode.uid !== found.uid) return { conflict: 'El código de estudiante ya pertenece a otro estudiante.' };
  if (!found && byCode) return { conflict: `El código ya está registrado para ${byCode.fullName}.` };
  return { student: found || null };
}

// Analiza una persona antes de procesarla
function analyzeRow(p, classIds, seen) {
  const errors = validatePerson(p);
  if (p.docTypeRaw && normDocType(p.docTypeRaw) === null) errors.push(`Tipo de documento "${p.docTypeRaw}" no reconocido`);
  if (p.email === TEACHER_EMAIL.toLowerCase()) errors.push('Es el correo del administrador');
  if (seen) {
    if (seen.emails.has(p.email)) errors.push('Correo repetido en el archivo');
    if (seen.docs.has(p.docNumber)) errors.push('Documento repetido en el archivo');
    if (p.studentCode && seen.codes.has(p.studentCode)) errors.push('Código repetido en el archivo');
    seen.emails.add(p.email); seen.docs.add(p.docNumber); if (p.studentCode) seen.codes.add(p.studentCode);
  }
  if (errors.length) return { kind: 'error', errors };
  const ex = findExisting(p);
  if (ex.conflict) return { kind: 'error', errors: [ex.conflict] };
  if (ex.student) {
    const missing = classIds.filter((id) => !(ex.student.classIds || []).includes(id));
    return missing.length ? { kind: 'exists', student: ex.student, missing } : { kind: 'already', student: ex.student };
  }
  return { kind: 'new' };
}

// Crea la cuenta o inscribe al estudiante existente
async function processPerson(p, classIds) {
  const a = analyzeRow(p, classIds);
  const names = classIds.map((id) => classById(id)?.name).filter(Boolean).join(', ');
  if (a.kind === 'error') return { status: 'error', detail: a.errors.join('; ') };
  if (a.kind === 'already') return { status: 'already', detail: 'Ya estaba inscrito en las clases seleccionadas' };
  if (a.kind === 'exists') {
    await ctx.B.joinClasses(a.student.uid, a.missing);
    await ctx.B.addNotifications([{ userId: a.student.uid, type: 'post', title: 'Nueva inscripción', message: `Fue inscrito en: ${a.missing.map((id) => classById(id)?.name).join(', ')}`, link: '#/clases' }]).catch(() => {});
    return { status: 'enrolled', detail: `Cuenta existente · inscrito en ${a.missing.length} clase(s)` };
  }
  const password = initialPassword(p.fullName, p.docNumber);
  const uid = await ctx.B.provisionAccount({
    password,
    profile: { role: 'student', fullName: p.fullName, studentCode: p.studentCode, docType: p.docType, docNumber: p.docNumber, email: p.email, classIds }
  });
  await ctx.B.addNotifications([{ userId: uid, type: 'post', title: '¡Bienvenido(a) a AulaNexus!', message: `Fue inscrito en: ${names}`, link: '#/clases' }]).catch(() => {});
  return { status: 'created', password, detail: 'Cuenta creada · debe cambiar la contraseña al ingresar' };
}

const STATUS = {
  new: ['b-info', 'Nuevo'],
  exists: ['b-accent', 'Existe · se inscribirá'],
  already: ['', 'Ya inscrito'],
  error: ['b-danger', 'Con errores'],
  created: ['b-success', 'Cuenta creada'],
  enrolled: ['b-success', 'Inscrito'],
  pending: ['b-warning', 'Pendiente']
};
const badge = (k) => `<span class="badge ${STATUS[k][0]}">${STATUS[k][1]}</span>`;

// =====================================================================
function enrollView(el, presetClass) {
  ui.setCrumb('Inscripciones', 'GESTIÓN DE ESTUDIANTES');
  const pre = presetClass ? [presetClass] : [];
  let tab = 'single';
  let parsed = null;        // { rows, missing, fileName }
  let running = false;

  el.innerHTML = `
  <div class="stack">
    <section class="hero glow-border">
      <div class="hero-orb"></div>
      <div style="min-width:0">
        <span class="eyebrow">${icon('userPlus')}Inscripciones</span>
        <h1>Crear cuentas e inscribir estudiantes</h1>
        <p>Registre a sus estudiantes uno por uno o de forma masiva con Excel. Si el estudiante ya tiene cuenta, solo se inscribe en las clases que elija.</p>
        <div class="hero-meta" id="en-meta"></div>
      </div>
    </section>

    <div>
      <div class="tabs" role="tablist">
        <button class="active" data-tab="single">${icon('user')}Individual</button>
        <button data-tab="bulk">${icon('sheet')}Carga masiva (Excel)</button>
      </div>

      <div class="tab-panel" data-panel="single">
        <div class="panel">
          <div class="panel-head"><h2>${icon('userPlus')}Nuevo estudiante</h2></div>
          <form id="en-form" class="stack" style="gap:16px" novalidate>
            <div class="form-grid">
              <div class="field span-2"><label for="en-name">Nombre completo</label><div class="input-wrap">${icon('user')}<input class="input" id="en-name" placeholder="Nombres y apellidos" autocomplete="off"></div><div class="error"></div></div>
              <div class="field"><label for="en-code">Código de estudiante</label><div class="input-wrap">${icon('hash')}<input class="input mono" id="en-code" placeholder="Ej. 1702310045" autocomplete="off"></div><div class="error"></div></div>
              <div class="field"><label for="en-email">Correo electrónico</label><div class="input-wrap">${icon('mail')}<input class="input" id="en-email" type="email" placeholder="nombre@ucaldas.edu.co" autocomplete="off"></div><div class="error"></div></div>
              <div class="field"><label for="en-dt">Tipo de documento</label><select class="input" id="en-dt">${DOC_TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
              <div class="field"><label for="en-dn">Número de documento</label><div class="input-wrap">${icon('idcard')}<input class="input mono" id="en-dn" placeholder="Sin puntos ni espacios" autocomplete="off"></div><div class="error"></div></div>
            </div>
            <div class="field"><span class="label">Inscribir en</span><div id="en-classes"></div><div class="error" id="en-classes-err"></div></div>
            <div class="callout" id="en-preview" style="font-size:13px">${icon('key')}<div>La contraseña inicial se genera automáticamente.</div></div>
            <div style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap">
              <button class="btn" type="reset">Limpiar</button>
              <button class="btn btn-primary" type="submit" data-loading="Procesando…">${icon('userCheck')}Crear e inscribir</button>
            </div>
          </form>
        </div>
      </div>

      <div class="tab-panel hidden" data-panel="bulk">
        <div class="panel">
          <div class="steps">
            <div class="step-card"><span class="num">1</span><div>
              <h3>Descargue y diligencie la plantilla</h3>
              <p class="muted" style="font-size:13.5px;margin-bottom:12px">Columnas: nombre completo, código, tipo y número de documento, correo. Incluye una hoja de instrucciones y lista desplegable para el tipo de documento.</p>
              <button class="btn" id="bk-template" data-loading="Generando…">${icon('download')}Descargar plantilla Excel</button>
            </div></div>
            <div class="step-card"><span class="num">2</span><div>
              <h3>Seleccione las clases</h3>
              <div id="bk-classes"></div><div class="field"><div class="error" id="bk-classes-err"></div></div>
            </div></div>
            <div class="step-card"><span class="num">3</span><div style="min-width:0">
              <h3>Cargue el archivo</h3>
              <div class="dropzone" id="bk-drop" tabindex="0" role="button" aria-label="Cargar archivo de Excel">
                <div class="dz-icon">${icon('sheet')}</div>
                <b>Arrastre el archivo aquí o haga clic para seleccionarlo</b>
                <small>Formatos: .xlsx (Excel) o .csv</small>
              </div>
              <input type="file" id="bk-file" accept=".xlsx,.csv" hidden>
            </div></div>
          </div>
        </div>
        <div id="bk-preview"></div>
      </div>
    </div>
  </div>`;

  const $ = (q) => el.querySelector(q);

  // ---- Pestañas ----
  el.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    tab = b.dataset.tab;
    el.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
    el.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab));
  });

  // ---- Individual ----
  const form = $('#en-form');
  const readForm = () => ({
    fullName: formatName($('#en-name').value),
    studentCode: $('#en-code').value.trim().toUpperCase(),
    docType: $('#en-dt').value,
    docNumber: $('#en-dn').value.trim().replace(/[\s.]/g, '').toUpperCase(),
    email: $('#en-email').value.trim().toLowerCase()
  });
  const paintPreview = () => {
    const p = readForm();
    const ex = p.email || p.docNumber ? findExisting(p) : {};
    const box = $('#en-preview');
    if (ex.student) {
      box.className = 'callout ok';
      box.innerHTML = `${icon('userCheck')}<div><b>${esc(ex.student.fullName)}</b> ya tiene cuenta. No se creará una nueva: solo se inscribirá en las clases seleccionadas.</div>`;
    } else if (ex.conflict) {
      box.className = 'callout warn';
      box.innerHTML = `${icon('alert')}<div>${esc(ex.conflict)}</div>`;
    } else {
      box.className = 'callout';
      box.innerHTML = `${icon('key')}<div>Contraseña inicial: <b class="mono">${p.fullName && p.docNumber ? esc(initialPassword(p.fullName, p.docNumber)) : 'PrimerNombre + documento + *'}</b>. El estudiante deberá cambiarla en su primer ingreso.</div>`;
    }
  };
  form.addEventListener('input', paintPreview);
  form.addEventListener('reset', () => setTimeout(() => { ui.clearErrors(form); paintPreview(); }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ui.clearErrors(form);
    const p = readForm();
    const classIds = checked(el, 'en-cls');
    const errs = validatePerson(p);
    const map = { 'Nombre': '#en-name', 'Código': '#en-code', 'Número de documento': '#en-dn', 'Correo': '#en-email' };
    errs.forEach((m) => { const k = Object.keys(map).find((x) => m.startsWith(x) || m.includes(x.toLowerCase())); if (k) ui.fieldError($(map[k]), m); });
    const ce = $('#en-classes-err');
    ce.closest('.field').classList.toggle('invalid', !classIds.length);
    ce.textContent = classIds.length ? '' : 'Seleccione al menos una clase.';
    if (errs.length || !classIds.length) return;
    ui.withLoading(form.querySelector('[type=submit]'), async () => {
      try {
        const r = await processPerson({ ...p, rn: 1 }, classIds);
        if (r.status === 'error') { ui.toast('No se pudo inscribir', 'error', r.detail); return; }
        if (r.status === 'already') { ui.toast('Sin cambios', 'info', `${p.fullName} ya estaba inscrito en esas clases.`); return; }
        if (r.status === 'enrolled') ui.toast('Estudiante inscrito', 'success', `${p.fullName} ya tenía cuenta y fue inscrito.`);
        if (r.status === 'created') showCredentials({ name: p.fullName, email: p.email, password: r.password, role: 'estudiante' });
        form.reset();
      } catch (er) { ui.toast('No se pudo crear la cuenta', 'error', errMsg(er)); }
    });
  });

  // ---- Masiva ----
  $('#bk-template').addEventListener('click', (e) => ui.withLoading(e.currentTarget, async () => {
    try { await downloadTemplate(); ui.toast('Plantilla descargada', 'success', 'plantilla-estudiantes-aulanexus.xlsx'); }
    catch (er) { ui.toast('No se pudo generar la plantilla', 'error', er.message); }
  }));
  const drop = $('#bk-drop'), fileIn = $('#bk-file');
  drop.addEventListener('click', () => fileIn.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
  fileIn.addEventListener('change', () => { if (fileIn.files[0]) loadFile(fileIn.files[0]); fileIn.value = ''; });
  el.addEventListener('change', (e) => { if (e.target.name === 'bk-cls' && parsed && !running) renderPreview(); });

  async function loadFile(file) {
    if (file.size > 5 * 1024 * 1024) { ui.toast('Archivo demasiado grande', 'error', 'Máximo 5 MB.'); return; }
    $('#bk-preview').innerHTML = `<div class="panel" style="margin-top:16px"><div class="skeleton sk-line"></div></div>`;
    try {
      const { rows, missing } = await parseRoster(file);
      if (missing.length) {
        const names = { fullName: 'Nombre completo', studentCode: 'Código estudiante', docNumber: 'Número documento', email: 'Correo electrónico' };
        $('#bk-preview').innerHTML = `<div class="callout warn" style="margin-top:16px">${icon('alert')}<div>Faltan columnas obligatorias: <b>${missing.map((m) => names[m]).join(', ')}</b>. Descargue y use la plantilla.</div></div>`;
        parsed = null; return;
      }
      if (!rows.length) { $('#bk-preview').innerHTML = `<div class="callout warn" style="margin-top:16px">${icon('info')}<div>El archivo no tiene filas con datos.</div></div>`; parsed = null; return; }
      if (rows.length > 500) { ui.toast('Demasiadas filas', 'warn', 'Se procesarán las primeras 500. Divida el archivo para el resto.'); rows.length = 500; }
      parsed = { rows, fileName: file.name };
      renderPreview();
    } catch (er) {
      parsed = null;
      $('#bk-preview').innerHTML = `<div class="callout warn" style="margin-top:16px">${icon('alert')}<div>${esc(er.message || errMsg(er))}</div></div>`;
    }
  }

  function renderPreview() {
    const classIds = checked(el, 'bk-cls');
    const seen = { emails: new Set(), docs: new Set(), codes: new Set() };
    parsed.rows.forEach((r) => {
      if (r.done) { seen.emails.add(r.email); seen.docs.add(r.docNumber); if (r.studentCode) seen.codes.add(r.studentCode); return; }
      r.analysis = analyzeRow(r, classIds, seen);
    });
    const count = (k) => parsed.rows.filter((r) => (r.result || r.analysis.kind) === k).length;
    const actionable = parsed.rows.filter((r) => !r.done && ['new', 'exists'].includes(r.analysis.kind)).length;
    $('#bk-preview').innerHTML = `
      <div class="panel" style="margin-top:16px">
        <div class="panel-head">
          <h2>${icon('table')}Vista previa · ${esc(parsed.fileName)}</h2>
          <div class="summary-chips">
            <span class="badge b-info">${count('new')} nuevos</span>
            <span class="badge b-accent">${count('exists')} existentes</span>
            ${count('already') ? `<span class="badge">${count('already')} ya inscritos</span>` : ''}
            <span class="badge b-danger">${count('error')} con errores</span>
            ${count('created') + count('enrolled') ? `<span class="badge b-success">${count('created') + count('enrolled')} procesados</span>` : ''}
          </div>
        </div>
        ${!classIds.length ? `<div class="callout warn" style="margin-bottom:14px">${icon('info')}<div>Seleccione al menos una clase en el paso 2.</div></div>` : ''}
        <div id="bk-progress" class="hidden" style="margin-bottom:14px"><div class="progress lg"><i style="width:0%"></i></div><small class="muted" id="bk-progress-t"></small></div>
        <div class="table-wrap"><table class="tbl cards">
          <thead><tr><th>Fila</th><th>Estudiante</th><th>Código</th><th>Documento</th><th>Estado</th></tr></thead>
          <tbody>${parsed.rows.map((r) => {
            const k = r.result || r.analysis.kind;
            const det = r.detail || (r.analysis.errors ? '' : r.analysis.kind === 'exists' ? `Se inscribirá en ${r.analysis.missing.length} clase(s)` : '');
            return `<tr>
              <td class="num" data-label="Fila">${r.rn}</td>
              <td class="who-cell"><div class="who">${avatar(r.fullName || '?', 'sm', r.email)}<div style="min-width:0"><b>${esc(r.fullName || '—')}</b><small>${esc(r.email || '—')}</small></div></div></td>
              <td class="num" data-label="Código">${esc(r.studentCode || '—')}</td>
              <td class="num" data-label="Documento">${esc(r.docType)} ${esc(r.docNumber || '—')}${r.docTypeAssumed ? ' <span class="muted" title="Tipo no indicado: se asume CC">*</span>' : ''}</td>
              <td data-label="Estado">${badge(k)}${r.password ? `<div class="mono" style="font-size:12px;margin-top:4px">${esc(r.password)}</div>` : ''}
                ${r.analysis.errors && !r.result ? `<ul class="err-list">${r.analysis.errors.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
                ${det ? `<div class="muted" style="font-size:12px;margin-top:4px">${esc(det)}</div>` : ''}</td>
            </tr>`;
          }).join('')}</tbody></table></div>
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:16px;align-items:center">
          <span class="muted" style="font-size:12.5px">Las filas con errores no se procesan. Corrija el archivo y vuelva a cargarlo si lo necesita.</span>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            ${parsed.rows.some((r) => r.result) ? `<button class="btn" id="bk-export" data-loading="Generando…">${icon('download')}Descargar resultados</button>` : ''}
            <button class="btn btn-primary" id="bk-run" ${!actionable || !classIds.length || running ? 'disabled' : ''}>${icon('userCheck')}Procesar ${actionable} ${actionable === 1 ? 'registro' : 'registros'}</button>
          </div>
        </div>
      </div>`;
    $('#bk-run')?.addEventListener('click', run);
    $('#bk-export')?.addEventListener('click', (e) => ui.withLoading(e.currentTarget, () => exportResults(parsed.rows.map((r) => ({
      ...r, resultLabel: STATUS[r.result || r.analysis.kind][1], detail: r.detail || (r.analysis.errors || []).join('; ')
    })), `resultados-${(parsed.fileName || 'inscripcion').replace(/\.[^.]+$/, '')}.xlsx`)));
  }

  async function run() {
    const classIds = checked(el, 'bk-cls');
    if (!classIds.length) { const ce = $('#bk-classes-err'); ce.closest('.field').classList.add('invalid'); ce.textContent = 'Seleccione al menos una clase.'; return; }
    const todo = parsed.rows.filter((r) => !r.done && ['new', 'exists'].includes(r.analysis.kind));
    const newOnes = todo.filter((r) => r.analysis.kind === 'new').length;
    const ok = await ui.confirmDialog({
      title: 'Procesar carga masiva', iconName: 'sheet', confirm: 'Procesar',
      message: `Se crearán <b>${newOnes}</b> cuentas nuevas y se inscribirán <b>${todo.length - newOnes}</b> estudiantes existentes en <b>${classIds.length}</b> clase(s).<br><br>No cierre esta pestaña hasta que termine.`
    });
    if (!ok) return;
    running = true;
    renderPreview();
    const bar = () => $('#bk-progress i'), txt = () => $('#bk-progress-t');
    $('#bk-progress').classList.remove('hidden');
    let done = 0, stopped = false;
    for (const r of todo) {
      if (stopped) { r.result = 'pending'; r.detail = 'No procesado: límite temporal de Firebase. Vuelva a cargar el archivo más tarde.'; continue; }
      try {
        const res = await processPerson(r, classIds);
        r.result = res.status === 'already' ? 'already' : res.status;
        r.detail = res.detail; r.password = res.password; r.done = res.status !== 'error';
        if (res.status === 'error') { r.analysis = { kind: 'error', errors: [res.detail] }; r.result = 'error'; }
      } catch (er) {
        r.result = 'error'; r.detail = errMsg(er); r.analysis = { kind: 'error', errors: [errMsg(er)] };
        if ((er.code || '').includes('too-many-requests')) stopped = true;
      }
      done++;
      if (bar()) { bar().style.width = `${Math.round((done / todo.length) * 100)}%`; txt().textContent = `${done} de ${todo.length} · ${r.fullName}`; }
      await new Promise((res) => setTimeout(res, 120));
    }
    running = false;
    renderPreview();
    const created = parsed.rows.filter((r) => r.result === 'created').length;
    const enrolled = parsed.rows.filter((r) => r.result === 'enrolled').length;
    const errs = parsed.rows.filter((r) => r.result === 'error' || r.result === 'pending').length;
    ui.toast('Carga masiva terminada', errs ? 'warn' : 'success', `${created} cuentas creadas · ${enrolled} inscritos${errs ? ` · ${errs} con novedades` : ''}. Descargue los resultados para entregar las contraseñas iniciales.`, 8000);
  }

  function update() {
    const regOpen = selfRegOpen();
    $('#en-meta').innerHTML = `
      <span class="rule-chip">${icon('key')}Contraseña inicial: <span class="mono">PrimerNombre + documento + *</span></span>
      <span class="rule-chip">${icon(regOpen ? 'users' : 'lock')}Registro libre: <b>${regOpen ? 'habilitado' : 'deshabilitado'}</b></span>`;
    if (!running) {
      // Conserva selección al refrescar
      const keepA = checked(el, 'en-cls'), keepB = checked(el, 'bk-cls');
      const sigA = activeMine().map((c) => c.id).join();
      if ($('#en-classes').dataset.sig !== sigA) {
        $('#en-classes').innerHTML = classPicks('en-cls', keepA.length ? keepA : pre);
        $('#bk-classes').innerHTML = classPicks('bk-cls', keepB.length ? keepB : pre);
        $('#en-classes').dataset.sig = sigA;
      }
    }
    paintPreview();
  }
  update();
  return { update };
}
