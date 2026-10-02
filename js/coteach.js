// =====================================================================
//  Clases compartidas: docentes colaboradores
//  class.coTeachers    = [uid, …]                    (lo validan las reglas)
//  class.coTeacherInfo = [{ uid, name, email }, …]    (solo para mostrar)
//  El dueño invita por correo a otro docente de la plataforma. El colaborador
//  publica, califica, devuelve entregas, toma asistencia, inscribe estudiantes
//  y edita los datos de la clase. Solo el dueño archiva la clase y gestiona
//  a los colaboradores. Los datos (publicaciones, entregas, asistencia)
//  conservan ownerId = dueño de la clase.
// =====================================================================
import { icon } from './icons.js';
import { esc, errMsg } from './util.js';
import * as ui from './ui.js';
import { S, ctx, classById, coClasses } from './state.js';
import { TEACHER_EMAIL } from './firebase-config.js';
import { avatar } from './components.js';

export const MAX_CO_TEACHERS = 10;
export const coInfo = (c) => (c?.coTeacherInfo || []).filter((t) => (c.coTeachers || []).includes(t.uid));

// ---------------------------------------------------------------------
//  Entregas visibles para el docente (propias + clases compartidas)
//  Devuelve { sync, stop }: la vista llama sync() en cada actualización para
//  ajustar las consultas cuando cambian las clases compartidas.
// ---------------------------------------------------------------------
export function scopedSubs(field, value, cb) {
  const live = new Map(); // clave → { sig, un, list }
  const out = () => cb([...new Map([...live.values()].flatMap((x) => x.list).map((s) => [s.id, s])).values()]);
  function want() {
    if (field === 'classId') {
      const c = classById(value);
      if (!c && !S.ready.classes) return [];
      return [['c', { ownerId: c?.ownerId || S.user.uid }]];
    }
    return [['own', { ownerId: S.user.uid }], ...coClasses().map((c) => [c.id, { ownerId: c.ownerId, classId: c.id }])];
  }
  function sync() {
    const w = new Map(want().map(([k, sc]) => [k, sc]));
    let removed = false;
    for (const [k, x] of live) if (!w.has(k) || x.sig !== JSON.stringify(w.get(k))) { x.un(); live.delete(k); removed = true; }
    for (const [k, sc] of w) {
      if (live.has(k)) continue;
      const x = { sig: JSON.stringify(sc), list: [], un: () => {} };
      live.set(k, x);
      x.un = ctx.B.watchSubmissionsBy(field, value, (l) => { x.list = l; out(); }, sc);
    }
    if (removed) out();
  }
  sync();
  return { sync, stop: () => { for (const x of live.values()) x.un(); live.clear(); } };
}

// ---------------------------------------------------------------------
//  Gestión de colaboradores (solo el dueño)
// ---------------------------------------------------------------------
export function coTeachersDialog(classId) {
  const c0 = classById(classId);
  if (!c0) return;
  ui.modal({
    title: 'Docentes de la clase', subtitle: esc(c0.name), iconName: 'users', size: 'lg',
    body: `
      <div class="callout">${icon('info')}<div>Los colaboradores tienen las mismas acciones que usted en esta clase: publicar, calificar, devolver entregas, tomar asistencia, inscribir estudiantes y editar sus datos. Solo usted puede archivarla y gestionar a los colaboradores.</div></div>
      <div class="field" style="margin-top:14px">
        <label for="co-email">Invitar a un docente</label>
        <div class="co-add">
          <div class="input-wrap">${icon('mail')}<input class="input" id="co-email" type="email" placeholder="correo@ucaldas.edu.co" autocomplete="off"></div>
          <button class="btn btn-primary" id="co-add" data-loading="Buscando…">${icon('userPlus')}Agregar</button>
        </div>
        <div class="error"></div>
        <small class="hint">Debe tener cuenta de docente en la plataforma (la crea el administrador).</small>
      </div>
      <div class="co-list" id="co-list"></div>`,
    footer: '<button class="btn btn-primary" data-close>Listo</button>',
    onMount(el) {
      const $ = (q) => el.querySelector(q);
      // Lista local: la clase en memoria se actualiza un instante después de guardar
      let team = coInfo(classById(classId));
      const paint = () => {
        const c = classById(classId);
        const list = team;
        $('#co-list').innerHTML = `
          <div class="co-row owner">${avatar(c.ownerName || 'Docente', 'sm', c.ownerId)}<div class="co-who"><b>${esc(c.ownerName || 'Docente')}</b><small>Dueño de la clase</small></div><span class="badge b-accent">${icon('shield')}Dueño</span></div>
          ${list.length ? list.map((t) => `
          <div class="co-row">${avatar(t.name, 'sm', t.uid)}<div class="co-who"><b>${esc(t.name)}</b><small>${esc(t.email)}</small></div>
            <button class="btn btn-sm btn-ghost" data-co-del="${esc(t.uid)}" title="Quitar">${icon('userMinus')}Quitar</button></div>`).join('')
          : `<p class="muted" style="font-size:13px;margin:10px 2px">Aún no hay docentes colaboradores.</p>`}`;
      };
      paint();
      const input = $('#co-email');
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#co-add').click(); });
      $('#co-add').addEventListener('click', (e) => {
        ui.clearErrors(el);
        const email = input.value.trim().toLowerCase();
        const c = classById(classId);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { ui.fieldError(input, 'Escriba un correo válido.'); return; }
        if (email === String(S.user.email).toLowerCase()) { ui.fieldError(input, 'Usted ya es el dueño de la clase.'); return; }
        if (email === String(TEACHER_EMAIL).toLowerCase()) { ui.fieldError(input, 'El administrador ya tiene acceso a todas las clases.'); return; }
        if (team.some((t) => t.email === email)) { ui.fieldError(input, 'Ese docente ya es colaborador.'); return; }
        if (team.length >= MAX_CO_TEACHERS) { ui.fieldError(input, `Máximo ${MAX_CO_TEACHERS} colaboradores por clase.`); return; }
        ui.withLoading(e.currentTarget, async () => {
          try {
            const t = await ctx.B.findTeacherByEmail(email);
            if (!t) { ui.fieldError(input, 'No hay un docente con ese correo en la plataforma. Pídale al administrador que cree su cuenta de docente.'); return; }
            if (t.active === false) { ui.fieldError(input, 'Ese docente está deshabilitado.'); return; }
            if (t.uid === c.ownerId) { ui.fieldError(input, 'Ese docente ya es el dueño de la clase.'); return; }
            if (team.some((x) => x.uid === t.uid)) { ui.fieldError(input, 'Ese docente ya es colaborador.'); return; }
            const info = [...team, { uid: t.uid, name: t.fullName || email, email }];
            await ctx.B.updateClass(classId, { coTeachers: info.map((x) => x.uid), coTeacherInfo: info });
            await ctx.B.addNotifications([{ userId: t.uid, type: 'post', title: `Lo agregaron como docente de ${c.name}`, message: `${S.profile?.fullName || 'El docente'} lo invitó a gestionar la clase con usted.`, link: `#/clase/${classId}`, classId }]).catch(() => {});
            input.value = '';
            team = info; paint();
            ui.toast('Colaborador agregado', 'success', `${t.fullName || email} ya puede gestionar la clase.`);
          } catch (er) { ui.toast('No se pudo agregar', 'error', errMsg(er)); }
        });
      });
      $('#co-list').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-co-del]'); if (!b) return;
        const c = classById(classId);
        const t = team.find((x) => x.uid === b.dataset.coDel);
        const ok = await ui.confirmDialog({ title: 'Quitar colaborador', danger: true, confirm: 'Quitar', iconName: 'userMinus', message: `<b>${esc(t?.name || 'El docente')}</b> dejará de ver y gestionar <b>${esc(c.name)}</b>. Lo que publicó y calificó se conserva.` });
        if (!ok) return;
        try {
          const info = team.filter((x) => x.uid !== b.dataset.coDel);
          await ctx.B.updateClass(classId, { coTeachers: info.map((x) => x.uid), coTeacherInfo: info });
          team = info; paint();
          ui.toast('Colaborador retirado', 'success', t?.name || '');
        } catch (er) { ui.toast('No se pudo quitar', 'error', errMsg(er)); }
      });
    }
  });
}

// El colaborador puede retirarse por sí mismo
export async function leaveClass(classId) {
  const c = classById(classId);
  if (!c) return;
  const ok = await ui.confirmDialog({ title: 'Salir de la clase', danger: true, confirm: 'Salir', iconName: 'logout', message: `Dejará de ver y gestionar <b>${esc(c.name)}</b>. Lo que publicó y calificó se conserva. Para volver, el dueño (${esc(c.ownerName || 'docente')}) debe invitarlo de nuevo.` });
  if (!ok) return;
  try {
    const info = coInfo(c).filter((x) => x.uid !== S.user.uid);
    await ctx.B.updateClass(classId, { coTeachers: (c.coTeachers || []).filter((u) => u !== S.user.uid), coTeacherInfo: info });
    ui.toast('Salió de la clase', 'success', c.name);
    location.hash = '#/clases';
  } catch (er) { ui.toast('No se pudo salir', 'error', errMsg(er)); }
}
