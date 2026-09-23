// Vistas públicas: inicio de sesión y registro de estudiantes (asistente en 3 pasos)
import { ctx } from './state.js';
import { icon, LOGO } from './icons.js';
import * as ui from './ui.js';
import { esc, errMsg, isEmail, DOC_TYPES, CLASS_COLORS } from './util.js';
import { passwordField, bindPassword, analyze } from './password.js';
import { APP, TEACHER_EMAIL } from './firebase-config.js';
import { colorVar } from './components.js';

const TERMINAL = [
  ['<span class="t-c">// AulaNexus · sesión segura</span>', 18],
  ['<span class="t-k">const</span> clase = <span class="t-k">await</span> aula.<span class="t-f">conectar</span>(<span class="t-s">"IHM-232G8F"</span>);', 22],
  ['clase.<span class="t-f">on</span>(<span class="t-s">"publicacion"</span>, notificar);', 22],
  ['<span class="t-k">const</span> entrega = <span class="t-k">new</span> <span class="t-f">Entrega</span>(<span class="t-s">"GestorTareas.java"</span>);', 22],
  ['<span class="t-k">await</span> entrega.<span class="t-f">enviar</span>();', 22],
  ['<span class="t-ok">✔ Entrega recibida · notificación enviada al docente</span>', 14],
  ['<span class="t-ok">✔ Calificación publicada: 4.6 / 5.0</span>', 14]
];

function hero() {
  return `
  <section class="auth-hero">
    <a class="brand" href="#/login">${LOGO}<div><b>${APP.name}</b><small>${esc(APP.institution)}</small></div></a>
    <div>
      <h1>Tu aula de <span class="grad-text">ingeniería</span>,<br>conectada en tiempo real.</h1>
      <p class="lead">Material didáctico, entregas de código <span class="mono">.java</span> y <span class="mono">.py</span>, calificaciones privadas y notificaciones instantáneas en un solo lugar.</p>
      <div class="features">
        <span class="feature">${icon('bell')}Notificaciones al instante</span>
        <span class="feature">${icon('code')}Entregas de código</span>
        <span class="feature">${icon('shield')}Notas privadas</span>
        <span class="feature">${icon('zap')}Sincronización en vivo</span>
      </div>
    </div>
    <div class="terminal" aria-hidden="true">
      <div class="cv-bar"><div class="cv-dots"><i></i><i></i><i></i></div><span>aulanexus — zsh</span></div>
      <div class="term-body" id="term"></div>
    </div>
    <div class="auth-foot"><span>${esc(APP.program)}</span><span>·</span><span>Firebase · Firestore</span><span>·</span><span>v1.0</span></div>
  </section>`;
}

function typeTerminal() {
  const el = document.getElementById('term');
  if (!el) return () => {};
  let stop = false, timer;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const strip = (h) => h.replace(/<[^>]+>/g, '');
  async function run() {
    while (!stop) {
      el.innerHTML = '';
      for (const [line, speed] of TERMINAL) {
        if (stop) return;
        const plain = strip(line);
        const div = document.createElement('div');
        el.appendChild(div);
        if (reduce) { div.innerHTML = line; continue; }
        for (let i = 1; i <= plain.length && !stop; i++) {
          div.innerHTML = esc(plain.slice(0, i)) + '<span class="cursor"></span>';
          await new Promise((r) => (timer = setTimeout(r, speed)));
        }
        div.innerHTML = line;
        await new Promise((r) => (timer = setTimeout(r, 260)));
      }
      el.insertAdjacentHTML('beforeend', '<span class="cursor"></span>');
      await new Promise((r) => (timer = setTimeout(r, 4200)));
      if (reduce) return;
    }
  }
  run();
  return () => { stop = true; clearTimeout(timer); };
}

// ---------------------------------------------------------------------
export function renderLogin(root) {
  document.title = `Iniciar sesión · ${APP.name}`;
  root.innerHTML = `
  <div class="auth">
    ${hero()}
    <section class="auth-side">
      <div class="auth-top">${ui.themeButton()}</div>
      <div class="auth-card card glow-border">
        <span class="badge b-info dot">Acceso seguro</span>
        <h2 style="margin-top:14px">Iniciar sesión</h2>
        <p class="sub">Ingrese con su correo institucional y contraseña.</p>
        <form class="auth-form" id="login-form" novalidate>
          <div class="field">
            <label for="l-email">Correo electrónico</label>
            <div class="input-wrap">${icon('mail')}<input class="input" id="l-email" type="email" autocomplete="email" placeholder="nombre@ucaldas.edu.co" required></div>
            <div class="error"></div>
          </div>
          ${passwordField({ id: 'l-pass', label: 'Contraseña', autocomplete: 'current-password' })}
          <div style="display:flex;justify-content:flex-end;margin-top:-6px"><button type="button" class="link-btn" id="forgot" style="font-size:13px">¿Olvidó su contraseña?</button></div>
          <button class="btn btn-primary btn-lg btn-block" type="submit" data-loading="Verificando…">${icon('lock')}Ingresar</button>
        </form>
        ${ctx.demo ? `
        <div class="divider" style="margin:22px 0 14px">modo demostración</div>
        <div class="demo-box">
          <p>Firebase aún no está configurado. Explore la plataforma con datos de ejemplo guardados en este navegador:</p>
          <div class="row">
            <button class="btn btn-sm" data-demo="teacher">${icon('grad')}Docente</button>
            <button class="btn btn-sm" data-demo="student">${icon('user')}Estudiante</button>
          </div>
        </div>` : ''}
        <p class="auth-alt">¿Es estudiante y aún no tiene cuenta? <a href="#/registro"><b>Crear cuenta</b></a></p>
      </div>
    </section>
  </div>`;
  const stopTerm = typeTerminal();
  const form = root.querySelector('#login-form');
  const email = root.querySelector('#l-email');
  bindPassword(root, 'l-pass');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const pass = root.querySelector('#l-pass');
    ui.clearErrors(form);
    let ok = true;
    if (!isEmail(email.value)) { ui.fieldError(email, 'Ingrese un correo válido.'); ok = false; }
    if (!pass.value) { ui.fieldError(pass, 'Ingrese su contraseña.'); ok = false; }
    if (!ok) return;
    ui.withLoading(form.querySelector('[type=submit]'), async () => {
      try { await ctx.B.login(email.value, pass.value); ui.toast('Bienvenido(a)', 'success', 'Sesión iniciada correctamente.'); }
      catch (err) { ui.toast('No fue posible ingresar', 'error', errMsg(err)); ui.fieldError(pass, errMsg(err)); }
    });
  });

  root.querySelector('#forgot').addEventListener('click', () => {
    ui.modal({
      title: 'Recuperar contraseña', subtitle: 'Le enviaremos un enlace seguro para crear una nueva contraseña.', iconName: 'key',
      body: `<div class="field"><label for="rp-email">Correo registrado</label><div class="input-wrap">${icon('mail')}<input class="input" id="rp-email" type="email" value="${esc(email.value)}" placeholder="nombre@ucaldas.edu.co"></div><div class="error"></div></div>`,
      footer: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-send data-loading="Enviando…">${icon('send')}Enviar enlace</button>`,
      onMount(el, m) {
        el.querySelector('[data-send]').addEventListener('click', (ev) => {
          const i = el.querySelector('#rp-email');
          if (!isEmail(i.value)) { ui.fieldError(i, 'Ingrese un correo válido.'); return; }
          ui.withLoading(ev.currentTarget, async () => {
            try {
              await ctx.B.resetPassword(i.value);
              ui.toast('Revise su correo', 'success', ctx.demo ? 'En modo demostración no se envían correos reales.' : 'Enviamos un enlace para restablecer su contraseña.');
              m.close();
            } catch (err) { ui.fieldError(i, errMsg(err)); }
          });
        });
      }
    });
  });

  root.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', async () => {
    const { DEMO_ACCOUNTS } = await import('./backend-demo.js');
    const acc = DEMO_ACCOUNTS[b.dataset.demo];
    email.value = acc.email;
    root.querySelector('#l-pass').value = acc.password;
    form.requestSubmit();
  }));
  return { destroy: stopTerm };
}

// ---------------------------------------------------------------------
export function renderRegister(root) {
  document.title = `Crear cuenta · ${APP.name}`;
  let step = 1;
  let openClasses = null;
  root.innerHTML = `
  <div class="auth">
    ${hero()}
    <section class="auth-side">
      <div class="auth-top">${ui.themeButton()}</div>
      <div class="auth-card wide card glow-border">
        <span class="badge b-accent dot">Registro de estudiantes</span>
        <h2 style="margin-top:14px">Crear cuenta</h2>
        <p class="sub">Complete sus datos, proteja su cuenta y elija las clases en las que está matriculado.</p>
        <div class="stepper" id="stepper">
          <div class="step active" data-s="1"><i>1</i><span>Datos</span></div><div class="step-line" data-l="1"></div>
          <div class="step" data-s="2"><i>2</i><span>Seguridad</span></div><div class="step-line" data-l="2"></div>
          <div class="step" data-s="3"><i>3</i><span>Clases</span></div>
        </div>
        <form class="auth-form" id="reg-form" novalidate>
          <div class="wizard-step active" data-step="1">
            <div class="field">
              <label for="r-name">Nombre completo</label>
              <div class="input-wrap">${icon('user')}<input class="input" id="r-name" autocomplete="name" placeholder="Nombres y apellidos"></div>
              <div class="error"></div>
            </div>
            <div class="field">
              <label for="r-code">Código de estudiante</label>
              <div class="input-wrap">${icon('hash')}<input class="input mono" id="r-code" inputmode="numeric" placeholder="Ej. 1702310045" autocomplete="off"></div>
              <div class="error"></div>
            </div>
            <div class="form-grid">
              <div class="field">
                <label for="r-doctype">Tipo de documento</label>
                <select class="input" id="r-doctype"><option value="">Seleccione…</option>${DOC_TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
                <div class="error"></div>
              </div>
              <div class="field">
                <label for="r-docnum">Número de documento</label>
                <div class="input-wrap">${icon('idcard')}<input class="input mono" id="r-docnum" inputmode="numeric" placeholder="Sin puntos ni espacios" autocomplete="off"></div>
                <div class="error"></div>
              </div>
            </div>
          </div>

          <div class="wizard-step" data-step="2">
            <div class="field">
              <label for="r-email">Correo electrónico</label>
              <div class="input-wrap">${icon('mail')}<input class="input" id="r-email" type="email" autocomplete="email" placeholder="nombre@ucaldas.edu.co"></div>
              <div class="error"></div>
            </div>
            ${passwordField({ id: 'r-pass', label: 'Contraseña', meter: true, generator: true, hint: 'Use el dado para generar una' })}
            ${passwordField({ id: 'r-pass2', label: 'Confirmar contraseña' })}
          </div>

          <div class="wizard-step" data-step="3">
            <div class="label">Seleccione una o varias clases</div>
            <div class="pick-list" id="r-classes">${'<div class="skeleton sk-line"></div>'.repeat(3)}</div>
            <div class="field"><div class="error" id="r-classes-err"></div></div>
            <label class="check"><input type="checkbox" id="r-terms"><span>Autorizo el tratamiento de mis datos personales con fines académicos, conforme a la Ley 1581 de 2012 (Habeas Data).</span></label>
            <div class="field"><div class="error" id="r-terms-err"></div></div>
          </div>

          <div class="wizard-nav">
            <button type="button" class="btn" id="r-back" style="visibility:hidden">${icon('arrowLeft')}Atrás</button>
            <button type="submit" class="btn btn-primary" id="r-next" data-loading="Creando cuenta…">Continuar${icon('arrowRight')}</button>
          </div>
        </form>
        <p class="auth-alt">¿Ya tiene cuenta? <a href="#/login"><b>Iniciar sesión</b></a></p>
      </div>
    </section>
  </div>`;
  const stopTerm = typeTerminal();
  const $ = (s) => root.querySelector(s);
  const form = $('#reg-form');
  bindPassword(root, 'r-pass', { confirmId: 'r-pass2', context: () => [$('#r-name').value, $('#r-email').value, $('#r-code').value, $('#r-docnum').value] });
  bindPassword(root, 'r-pass2');

  async function loadClasses() {
    const box = $('#r-classes');
    try {
      openClasses = (await ctx.B.listOpenClasses()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
      box.innerHTML = openClasses.length ? openClasses.map((c) => `
        <label class="pick" style="--c:${colorVar(c.color || CLASS_COLORS[0])}">
          <input type="checkbox" value="${c.id}">
          <span class="pick-dot">${icon('book')}</span>
          <span class="pick-body"><b>${esc(c.name)}</b><span>${esc([c.code, c.schedule].filter(Boolean).join(' · '))}</span></span>
          <span class="pick-check">${icon('check')}</span>
        </label>`).join('')
        : `<div class="callout warn">${icon('info')}<div>Aún no hay clases disponibles. El docente debe crearlas antes de que usted se registre.</div></div>`;
    } catch (e) {
      box.innerHTML = `<div class="callout warn">${icon('alert')}<div>No fue posible cargar las clases. ${esc(errMsg(e))}</div></div>`;
    }
  }
  loadClasses();

  function show(n) {
    step = n;
    root.querySelectorAll('.wizard-step').forEach((s) => s.classList.toggle('active', +s.dataset.step === n));
    root.querySelectorAll('.step').forEach((s) => { const k = +s.dataset.s; s.classList.toggle('active', k === n); s.classList.toggle('done', k < n); s.querySelector('i').innerHTML = k < n ? icon('check') : k; });
    root.querySelectorAll('.step-line').forEach((l) => l.classList.toggle('done', +l.dataset.l < n));
    $('#r-back').style.visibility = n > 1 ? 'visible' : 'hidden';
    $('#r-next').innerHTML = n < 3 ? `Continuar${icon('arrowRight')}` : `${icon('check')}Crear mi cuenta`;
    setTimeout(() => root.querySelector(`.wizard-step[data-step="${n}"] input, .wizard-step[data-step="${n}"] select`)?.focus(), 60);
  }

  function validate(n) {
    ui.clearErrors(form);
    let ok = true;
    const err = (sel, msg) => { ui.fieldError($(sel), msg); ok = false; };
    if (n === 1) {
      const name = $('#r-name').value.trim().replace(/\s+/g, ' ');
      if (name.split(' ').length < 2 || name.length < 5) err('#r-name', 'Escriba nombres y apellidos completos.');
      else if (!/^[A-Za-zÀ-ÿÑñ' .-]+$/.test(name)) err('#r-name', 'El nombre solo puede contener letras.');
      if (!/^[A-Za-z0-9-]{4,20}$/.test($('#r-code').value.trim())) err('#r-code', 'Código inválido (4 a 20 caracteres, sin espacios).');
      if (!$('#r-doctype').value) err('#r-doctype', 'Seleccione el tipo de documento.');
      const dn = $('#r-docnum').value.trim();
      const pattern = ['PA', 'PPT', 'CE'].includes($('#r-doctype').value) ? /^[A-Za-z0-9]{5,20}$/ : /^\d{5,15}$/;
      if (!pattern.test(dn)) err('#r-docnum', 'Número de documento inválido.');
    }
    if (n === 2) {
      const em = $('#r-email').value.trim();
      if (!isEmail(em)) err('#r-email', 'Ingrese un correo válido.');
      else if (em.toLowerCase() === TEACHER_EMAIL.toLowerCase()) err('#r-email', 'Este correo corresponde a la cuenta docente.');
      const a = $('#r-pass').value;
      const r = analyze(a, [$('#r-name').value, $('#r-email').value, $('#r-code').value, $('#r-docnum').value]);
      if (!r.valid) err('#r-pass', 'La contraseña no cumple los requisitos de seguridad.');
      if ($('#r-pass2').value !== a) err('#r-pass2', 'Las contraseñas no coinciden.');
    }
    if (n === 3) {
      const sel = [...root.querySelectorAll('#r-classes input:checked')];
      const ce = $('#r-classes-err'); ce.closest('.field').classList.toggle('invalid', !sel.length); ce.textContent = sel.length ? '' : 'Seleccione al menos una clase.';
      if (!sel.length) ok = false;
      const te = $('#r-terms-err'); const t = $('#r-terms').checked;
      te.closest('.field').classList.toggle('invalid', !t); te.textContent = t ? '' : 'Debe autorizar el tratamiento de datos para continuar.';
      if (!t) ok = false;
    }
    if (!ok) root.querySelector('.field.invalid .input')?.focus();
    return ok;
  }
  $('#r-back').addEventListener('click', () => show(step - 1));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate(step)) return;
    if (step < 3) { show(step + 1); return; }
    ui.withLoading($('#r-next'), async () => {
      try {
        await ctx.B.register({
          fullName: $('#r-name').value.trim().replace(/\s+/g, ' '),
          studentCode: $('#r-code').value.trim().toUpperCase(),
          docType: $('#r-doctype').value,
          docNumber: $('#r-docnum').value.trim().toUpperCase(),
          email: $('#r-email').value.trim().toLowerCase(),
          password: $('#r-pass').value,
          classIds: [...root.querySelectorAll('#r-classes input:checked')].map((i) => i.value)
        });
        ui.toast('¡Cuenta creada!', 'success', 'Bienvenido(a) a AulaNexus.');
        location.hash = '#/';
      } catch (err) {
        const code = err?.code || '';
        ui.toast('No fue posible crear la cuenta', 'error', errMsg(err));
        if (code.includes('email')) { show(2); ui.fieldError($('#r-email'), errMsg(err)); }
        if (code.includes('duplicate')) { show(1); ui.fieldError($('#r-code'), errMsg(err)); }
      }
    });
  });
  return { destroy: stopTerm };
}
