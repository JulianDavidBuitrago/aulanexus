// =====================================================================
//  CONFIGURACIÓN DE FIREBASE
//  Reemplace estos valores por los de su proyecto:
//  Consola de Firebase → Configuración del proyecto → Tus apps → Web (</>)
//  Mientras apiKey empiece por "TU_", la plataforma funciona en MODO DEMOSTRACIÓN
//  (datos de ejemplo guardados solo en el navegador).
// =====================================================================
export const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "000000000000",
  appId: "TU_APP_ID"
};

// Cuenta con rol docente (debe coincidir con firestore.rules)
export const TEACHER_EMAIL = "julian.buitrago@ucaldas.edu.co";
export const TEACHER_NAME = "Julián Buitrago";

export const APP = {
  name: "AulaNexus",
  institution: "Universidad de Caldas",
  program: "Ingeniería en Informática"
};

// Límites de archivos de código (se guardan como texto dentro de Firestore)
export const LIMITS = {
  studentExt: [".java", ".py"],
  teacherExt: [".java", ".py", ".txt", ".md", ".sql", ".js", ".ts", ".html", ".css", ".json", ".c", ".cpp", ".cs", ".xml", ".csv"],
  maxFileBytes: 200 * 1024,   // 200 KB por archivo
  maxFiles: 5,
  maxTextChars: 20000
};
