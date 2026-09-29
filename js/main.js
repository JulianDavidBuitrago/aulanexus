// =====================================================================
//  Punto de entrada de AulaNexus
//  1. Verifica que firebase-config.js esté bien escrito (sin romper la app).
//  2. Si hay credenciales reales, usa Firebase; si no, entra en modo demostración.
// =====================================================================
import * as cfg from './firebase-config.js';

const REQUIRED = ['firebaseConfig', 'TEACHER_EMAIL', 'TEACHER_NAME', 'APP', 'LIMITS'];
const missing = REQUIRED.filter((name) => !(name in cfg));

if (missing.length) {
  showConfigError(missing, Object.keys(cfg));
} else {
  const { start } = await import('./app.js');
  const key = cfg.firebaseConfig?.apiKey || '';
  const configured = key && !key.startsWith('TU_');
  if (configured) {
    const { createBackend } = await import('./backend-firebase.js');
    start(createBackend(), { demo: false });
  } else {
    const { createBackend } = await import('./backend-demo.js');
    start(createBackend(), { demo: true });
  }
}

// Muestra en pantalla qué le falta al archivo de configuración
function showConfigError(missing, found) {
  const root = document.getElementById('root');
  const li = (arr) => arr.map((n) => `<li><code>${n}</code></li>`).join('');
  root.innerHTML = `
    <div style="max-width:720px;margin:60px auto;padding:28px;border-radius:20px;background:var(--surface-solid,#fff);color:var(--text,#111);border:1px solid rgba(220,38,38,.35);font-family:system-ui,sans-serif;line-height:1.55">
      <h2 style="margin:0 0 10px;color:#dc2626">Error en <code>js/firebase-config.js</code></h2>
      <p>El archivo no exporta estos valores obligatorios:</p>
      <ul>${li(missing)}</ul>
      <p>Valores que sí encontró: ${found.length ? found.map((n) => `<code>${n}</code>`).join(', ') : '<b>ninguno</b> (el archivo no tiene ningún <code>export</code>)'}.</p>
      <p><b>Solución:</b> cada valor debe empezar con <code>export const</code>, por ejemplo:</p>
      <pre style="background:#0d1224;color:#e2e8f0;padding:14px;border-radius:12px;overflow:auto">export const firebaseConfig = { apiKey: "…", authDomain: "…", projectId: "…", storageBucket: "…", messagingSenderId: "…", appId: "…" };
export const TEACHER_EMAIL = "julian.buitrago@ucaldas.edu.co";
export const TEACHER_NAME = "Julián Buitrago";
export const APP = { … };
export const LIMITS = { … };</pre>
      <p>No incluya líneas <code>import { initializeApp } …</code> ni <code>const app = initializeApp(…)</code>. Después de corregir, suba el cambio y recargue con <b>Ctrl + F5</b>.</p>
    </div>`;
  console.error('[AulaNexus] firebase-config.js no exporta:', missing.join(', '));
}
