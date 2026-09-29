// =====================================================================
//  Administración (solo el administrador): registro libre y docentes
// =====================================================================
import { S, ctx, byName, selfRegOpen } from './state.js';
import { icon } from './icons.js';
import * as ui from './ui.js';
import { TEACHER_EMAIL, TEACHER_NAME } from './firebase-config.js';
import { esc, norm, errMsg, DOC_TYPES, initialPassword, validatePerson, debounce, formatName } from './util.js';
import { avatar, empty, skeletonLines, showCredentials } from './components.js';

export const routes = { admin: adminView };

const classesOf = (uid, isAdmin = false) => S.classes.filter((c) => c.ownerId === uid || (isAdmin && !c.ownerId));

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
      ${t ? '' : `<div class="callout" id="tf-pass" style="font-size:13px">${icon('key')}<div>Contraseña inicial: <b class="mono">PrimerNombre + documento + *</b></div></div>`}`,
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-save data-loading="Guardando…">${icon('check')}${t ? 'Guardar cambios' : 'Crear docente'}</button>`,
    onMount(el, m) {
      const $ = (q) => el.querySelector(q);
      const read = () => ({
        fullName: formatName($('#tf-name').value),
        docType: $('#tf-dt').value,
        docNumber: $('#tf-dn').value.trim().replace(/[\s.]/g, '').toUpperCase(),
        email: $('#tf-email').value.trim().toLowerCase()
      });
      el.addEventListener('input', () => {
        const d = read();
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
        <button class="btn btn-sm" data-act="new-teacher">${icon('userPlus')}Nuevo docente</button>
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
    if (b.dataset.act === 'edit-teacher' && t) teacherForm(t);
    if (b.dataset.act === 'toggle-teacher' && t) {
      const off = t.active !== false;
      const ok = await ui.confirmDialog({
        title: off ? 'Deshabilitar docente' : 'Habilitar docente', iconName: 'power', danger: off, confirm: off ? 'Deshabilitar' : 'Habilitar',
        message: off ? `<b>${esc(t.fullName)}</b> no podrá ingresar al panel docente. Sus clases, publicaciones y calificaciones se conservan.` : `<b>${esc(t.fullName)}</b> recuperará el acceso a sus clases.`
      });
      if (ok) { try { await ctx.B.updateUser(t.uid, { active: !off }); ui.toast(off ? 'Docente deshabilitado' : 'Docente habilitado', 'success', t.fullName); } catch (er) { ui.toast('Error', 'error', errMsg(er)); } }
    }
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
          : `${t.active === false ? '<span class="badge b-danger dot">Deshabilitado</span>' : '<span class="badge b-success dot">Activo</span>'}${t.mustChangePassword ? ' <span class="badge b-warning">Clave inicial</span>' : ''}`;
        return `<tr>
          <td class="who-cell"><div class="who">${avatar(t.fullName, '', t.uid)}<div style="min-width:0"><b>${esc(t.fullName)}</b><small>${esc(t.email)}</small></div></div></td>
          <td class="num" data-label="Documento">${t.docNumber ? `${esc(t.docType)} ${esc(t.docNumber)}` : '—'}</td>
          <td data-label="Clases"><span title="${esc(cls.map((c) => c.name).join(', '))}">${act} activas${cls.length - act ? ` · ${cls.length - act} archivadas` : ''}</span></td>
          <td data-label="Estado">${status}</td>
          <td class="actions-cell"><div class="actions">${t.isAdmin ? '<span class="muted" style="font-size:12px">Su cuenta</span>' : `
            <button class="btn btn-sm" data-act="edit-teacher" data-id="${t.uid}" title="Editar">${icon('edit')}<span class="hide-sm">Editar</span></button>
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
