// =====================================================================
//  Administración (solo el administrador): registro libre y docentes
// =====================================================================
import { S, ctx, byName, selfRegOpen } from './state.js';
import { icon } from './icons.js';
import * as ui from './ui.js';
import { TEACHER_EMAIL, TEACHER_NAME } from './firebase-config.js';
import { esc, norm, errMsg, DOC_TYPES, initialPassword, validatePerson, debounce, formatName } from './util.js';
import { avatar, empty, skeletonLines, showCredentials, colorVar } from './components.js';

export const routes = { admin: adminView };

const classesOf = (uid, isAdmin = false) => S.classes.filter((c) => c.ownerId === uid || (isAdmin && !c.ownerId));

// ---------- Estudiante existente → también docente ----------
// Misma cuenta: conserva correo, contraseña, código, clases, entregas y notas.
export async function promoteToTeacher(st, after) {
  if (!st) return false;
  if (st.role === 'teacher') { ui.toast('Ya es docente', 'info', st.fullName); return false; }
  if (!st.docNumber) { ui.toast('Faltan datos', 'error', 'El estudiante no tiene número de documento registrado.'); return false; }
  const ok = await ui.confirmDialog({
    title: 'Habilitar como docente', iconName: 'grad', confirm: 'Habilitar como docente',
    message: `<b>${esc(st.fullName)}</b> (${esc(st.email)}) seguirá siendo estudiante, con sus clases y notas, y además podrá crear y gestionar sus propias clases como docente.<br><br>Usará la <b>misma cuenta y contraseña</b>; verá el selector <b>Docente / Estudiante</b> en la barra superior.`
  });
  if (!ok) return false;
  try {
    await ctx.B.promoteStudent(st);
    await ctx.B.addNotifications([{ userId: st.uid, type: 'post', title: 'Ahora también es docente', message: 'Use el selector Docente / Estudiante de la barra superior para cambiar de vista.', link: '#/' }]).catch(() => {});
    ui.toast('Habilitado como docente', 'success', `${st.fullName} ahora es docente y estudiante.`);
    after?.();
    return true;
  } catch (er) { ui.toast('No se pudo habilitar', 'error', errMsg(er)); return false; }
}

// Buscador de estudiantes para convertirlos también en docentes
function promoteSearch() {
  ui.modal({
    title: 'Habilitar a un estudiante como docente', subtitle: 'Busque por nombre, código, documento o correo.', iconName: 'grad', size: 'lg',
    body: `
      <div class="input-wrap">${icon('search')}<input class="input" id="ps-q" placeholder="Buscar estudiante…" autocomplete="off"></div>
      <div class="list" id="ps-list"></div>
      <div class="callout" style="font-size:12.5px">${icon('info')}<div>No se crea otra cuenta: el estudiante conserva su correo, contraseña, clases y notas, y además podrá gestionar sus propias clases.</div></div>`,
    footer: `<button class="btn" data-close>Cerrar</button>`,
    onMount(el, m) {
      const paint = () => {
        const q = norm(el.querySelector('#ps-q').value);
        const list = S.students.filter((x) => x.role === 'student' && (!q || norm(`${x.fullName} ${x.studentCode} ${x.docNumber} ${x.email}`).includes(q))).sort(byName).slice(0, 25);
        el.querySelector('#ps-list').innerHTML = list.length ? list.map((x) => `
          <div class="row-item" style="cursor:default">
            ${avatar(x.fullName, '', x.uid)}
            <div class="ri-body"><b>${esc(x.fullName)}</b><small>${esc(x.email)} · ${esc(x.docType)} ${esc(x.docNumber)}</small></div>
            <button class="btn btn-sm btn-primary" data-promote="${x.uid}">${icon('grad')}<span class="hide-sm">Habilitar</span></button>
          </div>`).join('') : empty('search', q ? 'Sin resultados' : 'No hay estudiantes registrados');
      };
      el.querySelector('#ps-q').addEventListener('input', debounce(paint, 120));
      el.querySelector('#ps-list').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-promote]'); if (!b) return;
        const st = S.students.find((x) => x.uid === b.dataset.promote);
        if (await promoteToTeacher(st)) m.close();
      });
      paint();
    }
  });
}

// ---------- Formulario de docente (crear / editar) ----------
function teacherForm(t = null) {
  ui.modal({
    title: t ? 'Editar docente' : 'Nuevo docente',
    subtitle: t ? esc(t.email) : 'Se creará la cuenta con la contraseña inicial y deberá cambiarla en su primer ingreso.',
    iconName: t ? 'edit' : 'userPlus', size: 'lg',
    body: `
      <div class="form-grid">
        <div class="field span-2"><label for="tf-name">Nombre completo</label><div class="input-wrap">${icon('user')}<input class="input" id="tf-name" value="${esc(t?.fullName || '')}" placeholder="Nombres y apellidos"></div><div class="error"></div></div>
        <div class="field"><label for="tf-dt">Tipo de documento</label><select class="input" id="tf-dt">${DOC_TYPES.map(([v, l]) => `<option value="${v}" ${v === (t?.docType || 'CC') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="tf-dn">Número de documento</label><div class="input-wrap">${icon('idcard')}<input class="input mono" id="tf-dn" value="${esc(t?.docNumber || '')}" placeholder="Sin puntos ni espacios"></div><div class="error"></div></div>
        <div class="field span-2"><label for="tf-email">Correo institucional</label><div class="input-wrap">${icon('mail')}<input class="input" id="tf-email" type="email" value="${esc(t?.email || '')}" ${t ? 'disabled' : ''} placeholder="nombre@ucaldas.edu.co"></div><div class="error"></div>
          ${t ? '<span class="hint">El correo de acceso no se puede cambiar desde aquí.</span>' : ''}</div>
      </div>
      ${t ? '' : `<div id="tf-existing"></div><div class="callout" id="tf-pass" style="font-size:13px">${icon('key')}<div>Contraseña inicial: <b class="mono">PrimerNombre + documento + *</b></div></div>`}`,
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save data-loading="Guardando…">${icon('check')}${t ? 'Guardar cambios' : 'Crear docente'}</button>`,
    onMount(el, m) {
      const $ = (q) => el.querySelector(q);
      const read = () => ({
        fullName: formatName($('#tf-name').value),
        docType: $('#tf-dt').value,
        docNumber: $('#tf-dn').value.trim().replace(/[\s.]/g, '').toUpperCase(),
        email: $('#tf-email').value.trim().toLowerCase()
      });
      // Si el correo o el documento ya pertenecen a un estudiante, se ofrece habilitarlo (sin crear otra cuenta)
      const existingStudent = (d) => (t ? null : S.students.find((x) => x.role === 'student'
        && ((d.email && x.email === d.email) || (d.docNumber && String(x.docNumber).toUpperCase() === d.docNumber))));
      el.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-promote-existing]'); if (!b) return;
        const st = S.students.find((x) => x.uid === b.dataset.promoteExisting);
        if (await promoteToTeacher(st)) m.close();
      });
      el.addEventListener('input', () => {
        const d = read();
        const ex = existingStudent(d);
        if (!t) {
          $('#tf-existing').innerHTML = ex ? `<div class="callout ok">${icon('userCheck')}<div style="flex:1"><b>${esc(ex.fullName)}</b> ya está registrado como estudiante (${esc(ex.email)}). No cree otra cuenta: habilítelo también como docente y conservará sus clases y notas.
            <div style="margin-top:10px"><button type="button" class="btn btn-sm btn-primary" data-promote-existing="${ex.uid}">${icon('grad')}Habilitar como docente</button></div></div></div>` : '';
          $('#tf-pass').hidden = !!ex;
        }
        if (!t && $('#tf-pass')) $('#tf-pass').innerHTML = `${icon('key')}<div>Contraseña inicial: <b class="mono">${d.fullName && d.docNumber ? esc(initialPassword(d.fullName, d.docNumber)) : 'PrimerNombre + documento + *'}</b></div>`;
      });
      $('[data-save]').addEventListener('click', (e) => {
        ui.clearErrors(el);
        const d = read();
        const errs = validatePerson(d, { requireCode: false });
        errs.forEach((msg) => {
          if (/nombre/i.test(msg)) ui.fieldError($('#tf-name'), msg);
          if (/documento/i.test(msg)) ui.fieldError($('#tf-dn'), msg);
          if (/correo/i.test(msg)) ui.fieldError($('#tf-email'), msg);
        });
        if (!t && d.email === TEACHER_EMAIL.toLowerCase()) { ui.fieldError($('#tf-email'), 'Es el correo del administrador.'); return; }
        if (!t && S.teachers.some((x) => x.email === d.email)) { ui.fieldError($('#tf-email'), 'Ya existe un docente con ese correo.'); return; }
        const ex = existingStudent(d);
        if (ex) { ui.fieldError(ex.email === d.email ? $('#tf-email') : $('#tf-dn'), 'Pertenece a un estudiante registrado. Use "Habilitar como docente".'); return; }
        if (errs.length) return;
        ui.withLoading(e.currentTarget, async () => {
          try {
            if (t) {
              await ctx.B.updateUser(t.uid, { fullName: d.fullName, docType: d.docType, docNumber: d.docNumber });
              ui.toast('Docente actualizado', 'success', d.fullName);
              m.close();
            } else {
              const password = initialPassword(d.fullName, d.docNumber);
              await ctx.B.provisionAccount({ password, profile: { role: 'teacher', active: true, fullName: d.fullName, docType: d.docType, docNumber: d.docNumber, email: d.email } });
              m.close();
              showCredentials({ name: d.fullName, email: d.email, password, role: 'docente' });
            }
          } catch (er) { ui.toast('No se pudo guardar', 'error', errMsg(er)); if ((er.code || '').includes('email')) ui.fieldError($('#tf-email'), errMsg(er)); }
        });
      });
    }
  });
}

// ---------- Doble rol: acceso del docente como estudiante ----------
function studentAccessForm(t) {
  const has = t.studentAccess === true;
  // Clases activas de OTROS docentes (nadie puede ser estudiante de su propia clase)
  const options = S.classes.filter((c) => !c.archived && c.ownerId !== t.uid)
    .sort((a, b) => (a.ownerName || '').localeCompare(b.ownerName || '', 'es') || a.name.localeCompare(b.name, 'es'));
  const current = has ? (t.classIds || []) : [];
  ui.modal({
    title: 'Acceso como estudiante', subtitle: `${esc(t.fullName)} · ${esc(t.email)}`, iconName: 'userCheck', size: 'lg',
    body: `
      <div class="setting-row">
        <div class="sr-text"><b>Habilitar también el rol de estudiante</b>
          <p>Usará la misma cuenta y contraseña. En la barra superior verá un selector <strong>Docente / Estudiante</strong>. Como estudiante solo verá las clases en las que esté inscrito, y no podrá inscribirse en sus propias clases.</p></div>
        <label class="switch"><input type="checkbox" id="sa-on" ${has ? 'checked' : ''}><span class="track"></span><span class="sr-only">Acceso como estudiante</span></label>
      </div>
      <div id="sa-fields" class="stack" style="gap:16px" ${has ? '' : 'hidden'}>
        <div class="form-grid">
          <div class="field"><label for="sa-code">Código de estudiante</label><div class="input-wrap">${icon('hash')}<input class="input mono" id="sa-code" value="${esc(t.studentCode || '')}" placeholder="Ej. 1702310045"></div><div class="error"></div></div>
          <div class="field"><span class="label">Documento</span><div class="input mono" style="display:flex;align-items:center;opacity:.8">${esc(t.docType || '')} ${esc(t.docNumber || '—')}</div></div>
        </div>
        <div class="field"><span class="label">Inscribir en las clases <span class="hint">de otros docentes</span></span>
          ${options.length ? `<div class="pick-grid">${options.map((c) => `
            <label class="pick" style="--c:${colorVar(c.color)}">
              <input type="checkbox" name="sa-cls" value="${c.id}" ${current.includes(c.id) ? 'checked' : ''}>
              <span class="pick-dot">${icon('book')}</span>
              <span class="pick-body"><b>${esc(c.name)}</b><span>${esc([c.code, c.ownerName].filter(Boolean).join(' · '))}</span></span>
              <span class="pick-check">${icon('check')}</span>
            </label>`).join('')}</div>` : `<div class="callout">${icon('info')}<div>No hay clases activas de otros docentes. Puede habilitar el acceso ahora y que los docentes lo inscriban después desde <b>Inscripciones</b>.</div></div>`}
          <div class="error" id="sa-cls-err"></div>
        </div>
      </div>
      ${has ? `<div class="setting-row" style="margin-top:4px">
        <div class="sr-text"><b>Dejar solo como estudiante</b><p>Quita el rol docente y conserva su cuenta de estudiante. Solo es posible si no tiene clases propias (activas ni archivadas).</p></div>
        <button type="button" class="btn btn-sm btn-danger" data-demote>${icon('userMinus')}Quitar rol docente</button>
      </div>` : ''}
      ${has ? `<div class="callout warn" id="sa-off-note" hidden>${icon('alert')}<div>Al retirar el acceso deja de ver sus clases como estudiante. Sus entregas y notas se conservan y reaparecen si se vuelve a habilitar.</div></div>` : ''}`,
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save data-loading="Guardando…">${icon('check')}Guardar</button>`,
    onMount(el, m) {
      const $ = (q) => el.querySelector(q);
      $('[data-demote]')?.addEventListener('click', async () => {
        const own = S.classes.filter((c) => c.ownerId === t.uid);
        if (own.length) { ui.toast('No es posible', 'error', `Tiene ${own.length} clase(s) propia(s). Solo se puede quitar el rol docente a quien no tiene clases.`); return; }
        const ok = await ui.confirmDialog({ title: 'Quitar rol docente', danger: true, iconName: 'userMinus', confirm: 'Dejar solo estudiante', message: `<b>${esc(t.fullName)}</b> quedará únicamente como estudiante, con su misma cuenta, clases y notas.` });
        if (!ok) return;
        try { await ctx.B.demoteToStudent(t); ui.toast('Rol docente retirado', 'success', `${t.fullName} ahora es solo estudiante.`); m.close(); }
        catch (er) { ui.toast('Error', 'error', errMsg(er)); }
      });
      $('#sa-on').addEventListener('change', () => {
        $('#sa-fields').hidden = !$('#sa-on').checked;
        if ($('#sa-off-note')) $('#sa-off-note').hidden = $('#sa-on').checked;
      });
      $('[data-save]').addEventListener('click', (e) => {
        ui.clearErrors(el);
        const on = $('#sa-on').checked;
        if (!on && !has) { m.close(); return; }
        ui.withLoading(e.currentTarget, async () => {
          try {
            if (!on) {
              await ctx.B.revokeStudentAccess(t);
              ui.toast('Acceso de estudiante retirado', 'success', t.fullName);
              m.close(); return;
            }
            const code = $('#sa-code').value.trim().toUpperCase();
            if (!/^[A-Za-z0-9-]{4,20}$/.test(code)) { ui.fieldError($('#sa-code'), 'Código inválido (4 a 20 caracteres, sin espacios).'); return; }
            if (!t.docNumber) { ui.toast('Faltan datos', 'error', 'Edite el docente y registre su número de documento.'); return; }
            // Unicidad: el código y el documento no pueden pertenecer a otro estudiante
            const other = S.students.find((s) => s.uid !== t.uid && (String(s.studentCode).toUpperCase() === code || String(s.docNumber).toUpperCase() === String(t.docNumber).toUpperCase()));
            if (other) {
              const by = String(other.studentCode).toUpperCase() === code ? 'el código' : 'el documento';
              ui.fieldError($('#sa-code'), `Ya existe un estudiante con ${by}: ${other.fullName} (${other.email}). Si es la misma persona, retire esa cuenta de estudiante antes de continuar.`);
              return;
            }
            const classIds = [...el.querySelectorAll('input[name="sa-cls"]:checked')].map((i) => i.value);
            await ctx.B.grantStudentAccess(t, { studentCode: code, classIds });
            if (!has) {
              await ctx.B.addNotifications([{ userId: t.uid, type: 'post', title: 'Acceso como estudiante habilitado', message: 'Use el selector Docente / Estudiante de la barra superior.', link: '#/' }]).catch(() => {});
            }
            ui.toast(has ? 'Acceso de estudiante actualizado' : 'Acceso de estudiante habilitado', 'success', `${t.fullName} · ${classIds.length} clase(s)`);
            m.close();
          } catch (er) { ui.toast('No se pudo guardar', 'error', errMsg(er)); }
        });
      });
    }
  });
}

// =====================================================================
function adminView(el) {
  ui.setCrumb('Administración', 'PLATAFORMA');
  el.innerHTML = `
  <div class="stack">
    <section class="hero glow-border">
      <div class="hero-orb"></div>
      <div>
        <span class="eyebrow">${icon('sliders')}Panel administrativo</span>
        <h1>Administración de la plataforma</h1>
        <p>Defina cómo se registran los estudiantes y gestione las cuentas de los docentes. Cada docente administra únicamente sus propias clases.</p>
      </div>
      <div class="hero-actions"><button class="btn btn-primary" data-act="new-teacher">${icon('userPlus')}Nuevo docente</button></div>
    </section>

    <section class="stats" id="ad-stats"></section>

    <div class="panel">
      <div class="panel-head"><h2>${icon('users')}Registro de estudiantes</h2><span id="ad-reg-badge"></span></div>
      <div class="setting-row">
        <div class="sr-text">
          <b>Permitir que los estudiantes se registren libremente</b>
          <p>Cuando está desactivado, solo los docentes crean las cuentas e inscriben a los estudiantes desde <a href="#/inscripciones">Inscripciones</a> (individual o con Excel).</p>
        </div>
        <label class="switch" title="Registro libre de estudiantes">
          <input type="checkbox" id="ad-reg" ${selfRegOpen() ? 'checked' : ''}>
          <span class="track"></span>
          <span class="sr-only">Registro libre</span>
        </label>
      </div>
      <div class="mode-grid">
        <div class="mode" data-mode="open"><b>${icon('users')}Registro libre</b>Los estudiantes crean su cuenta desde "Crear cuenta", eligen sus clases y pueden inscribirse en otras desde su panel.</div>
        <div class="mode" data-mode="closed"><b>${icon('lock')}Inscripción por el docente</b>Se oculta "Crear cuenta". El docente crea las cuentas; la contraseña inicial es <span class="mono">PrimerNombre + documento + *</span> y se exige cambiarla en el primer ingreso.</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>${icon('grad')}Docentes</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm" data-act="promote-student">${icon('userCheck')}Habilitar a un estudiante</button>
          <button class="btn btn-sm" data-act="new-teacher">${icon('userPlus')}Nuevo docente</button>
        </div>
      </div>
      <div class="toolbar"><div class="input-wrap">${icon('search')}<input class="input" id="ad-q" placeholder="Buscar por nombre, correo o documento"></div></div>
      <div id="ad-list">${skeletonLines(3)}</div>
    </div>
  </div>`;
  const $ = (q) => el.querySelector(q);

  $('#ad-reg').addEventListener('change', async (e) => {
    const on = e.target.checked;
    e.target.disabled = true;
    try {
      await ctx.B.saveSettings({ allowSelfRegistration: on });
      ui.toast(on ? 'Registro libre habilitado' : 'Registro libre deshabilitado', 'success', on ? 'Los estudiantes pueden crear su cuenta.' : 'Solo los docentes crean cuentas de estudiantes.');
    } catch (er) { e.target.checked = !on; ui.toast('No se pudo guardar', 'error', errMsg(er)); }
    e.target.disabled = false;
  });
  $('#ad-q').addEventListener('input', debounce(update, 120));

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const t = S.teachers.find((x) => x.uid === b.dataset.id);
    if (b.dataset.act === 'new-teacher') teacherForm();
    if (b.dataset.act === 'promote-student') promoteSearch();
    if (b.dataset.act === 'edit-teacher' && t) teacherForm(t);
    if (b.dataset.act === 'toggle-teacher' && t) {
      const off = t.active !== false;
      const ok = await ui.confirmDialog({
        title: off ? 'Deshabilitar docente' : 'Habilitar docente', iconName: 'power', danger: off, confirm: off ? 'Deshabilitar' : 'Habilitar',
        message: off ? `<b>${esc(t.fullName)}</b> no podrá ingresar al panel docente. Sus clases, publicaciones y calificaciones se conservan.` : `<b>${esc(t.fullName)}</b> recuperará el acceso a sus clases.`
      });
      if (ok) { try { await ctx.B.updateUser(t.uid, { active: !off }); ui.toast(off ? 'Docente deshabilitado' : 'Docente habilitado', 'success', t.fullName); } catch (er) { ui.toast('Error', 'error', errMsg(er)); } }
    }
    if (b.dataset.act === 'student-access' && t) { studentAccessForm(t); return; }
    if (b.dataset.act === 'reset-teacher' && t) {
      const ok = await ui.confirmDialog({ title: 'Restablecer contraseña', iconName: 'key', confirm: 'Enviar correo', message: `Se enviará a <b>${esc(t.email)}</b> un enlace para crear una nueva contraseña.` });
      if (ok) { try { await ctx.B.resetPassword(t.email); ui.toast('Correo enviado', 'success', ctx.demo ? 'En modo demostración no se envían correos.' : t.email); } catch (er) { ui.toast('Error', 'error', errMsg(er)); } }
    }
  });

  function update() {
    const reg = selfRegOpen();
    const sw = $('#ad-reg'); if (!sw.disabled) sw.checked = reg;
    $('#ad-reg-badge').innerHTML = reg ? '<span class="badge b-success dot">Habilitado</span>' : '<span class="badge b-warning dot">Deshabilitado</span>';
    el.querySelectorAll('.mode').forEach((m) => m.classList.toggle('on', (m.dataset.mode === 'open') === reg));

    const teachers = [...S.teachers].sort(byName);
    ui.stats($('#ad-stats'), [
      { key: 't', label: 'Docentes activos', value: S.ready.teachers ? teachers.filter((t) => t.active !== false).length + 1 : null, icon: 'grad', color: 'var(--c-violet)' },
      { key: 's', label: 'Estudiantes registrados', value: S.ready.students ? S.students.length : null, icon: 'users', color: 'var(--c-cyan)' },
      { key: 'c', label: 'Clases activas', value: S.ready.classes ? S.classes.filter((c) => !c.archived).length : null, icon: 'book', color: 'var(--c-pink)' },
      { key: 'p', label: 'Deben cambiar clave', value: S.ready.students ? [...S.students, ...teachers].filter((u) => u.mustChangePassword).length : null, icon: 'key', color: 'var(--c-amber)' }
    ]);
    if (!S.ready.teachers) return;
    const q = norm($('#ad-q').value);
    const admin = { uid: S.user.uid, fullName: S.profile?.fullName || TEACHER_NAME, email: S.user.email, isAdmin: true };
    const rows = [admin, ...teachers].filter((t) => !q || norm(`${t.fullName} ${t.email} ${t.docNumber || ''}`).includes(q));
    $('#ad-list').innerHTML = rows.length ? `<div class="table-wrap"><table class="tbl cards">
      <thead><tr><th>Docente</th><th>Documento</th><th>Clases</th><th>Estado</th><th></th></tr></thead>
      <tbody>${rows.map((t) => {
        const cls = classesOf(t.uid, t.isAdmin);
        const act = cls.filter((c) => !c.archived).length;
        const status = t.isAdmin ? '<span class="badge b-accent">Administrador</span>'
          : `${t.active === false ? '<span class="badge b-danger dot">Deshabilitado</span>' : '<span class="badge b-success dot">Activo</span>'}${t.mustChangePassword ? ' <span class="badge b-warning">Clave inicial</span>' : ''}${t.studentAccess ? ` <span class="badge b-info" title="Código ${esc(t.studentCode || '')} · ${(t.classIds || []).length} clase(s)">${icon('user')}También estudiante</span>` : ''}`;
        return `<tr>
          <td class="who-cell"><div class="who">${avatar(t.fullName, '', t.uid)}<div style="min-width:0"><b>${esc(t.fullName)}</b><small>${esc(t.email)}</small></div></div></td>
          <td class="num" data-label="Documento">${t.docNumber ? `${esc(t.docType)} ${esc(t.docNumber)}` : '—'}</td>
          <td data-label="Clases"><span title="${esc(cls.map((c) => c.name).join(', '))}">${act} activas${cls.length - act ? ` · ${cls.length - act} archivadas` : ''}</span></td>
          <td data-label="Estado">${status}</td>
          <td class="actions-cell"><div class="actions">${t.isAdmin ? '<span class="muted" style="font-size:12px">Su cuenta</span>' : `
            <button class="btn btn-sm" data-act="edit-teacher" data-id="${t.uid}" title="Editar">${icon('edit')}<span class="hide-sm">Editar</span></button>
            <button class="btn btn-sm ${t.studentAccess ? 'btn-primary' : ''}" data-act="student-access" data-id="${t.uid}" title="Acceso como estudiante">${icon('userCheck')}<span class="hide-sm">Estudiante</span></button>
            <button class="btn btn-sm" data-act="reset-teacher" data-id="${t.uid}" title="Enviar correo para restablecer contraseña">${icon('key')}</button>
            <button class="btn btn-sm ${t.active === false ? '' : 'btn-danger'}" data-act="toggle-teacher" data-id="${t.uid}" title="${t.active === false ? 'Habilitar' : 'Deshabilitar'}">${icon('power')}<span class="hide-sm">${t.active === false ? 'Habilitar' : 'Deshabilitar'}</span></button>`}
          </div></td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="muted" style="font-size:12.5px;margin-top:10px">${teachers.length} docente(s) además del administrador. Por seguridad, las cuentas no se eliminan desde el navegador: deshabilite el acceso y, si lo requiere, elimine el usuario en la consola de Firebase (Authentication).</p>`
      : empty('search', 'Sin resultados');
  }
  update();
  return { update };
}
