// Entrada exclusiva para la versión de demostración empaquetada en un solo archivo.
import { createBackend } from './backend-demo.js';
import { start } from './app.js';

start(createBackend(), { demo: true });
