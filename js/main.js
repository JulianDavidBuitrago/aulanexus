// Punto de entrada: usa Firebase si está configurado; de lo contrario, modo demostración.
import { firebaseConfig } from './firebase-config.js';
import { start } from './app.js';

const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('TU_');

if (configured) {
  const { createBackend } = await import('./backend-firebase.js');
  start(createBackend(), { demo: false });
} else {
  const { createBackend } = await import('./backend-demo.js');
  start(createBackend(), { demo: true });
}
