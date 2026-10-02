// =====================================================================
//  CONFIGURACIÓN DE FIREBASE
//  Reemplace estos valores por los de su proyecto:
//  Consola de Firebase → Configuración del proyecto → Tus apps → Web (</>)
//  Mientras apiKey empiece por "TU_", la plataforma funciona en MODO DEMOSTRACIÓN
//  (datos de ejemplo guardados solo en el navegador).
// =====================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyCm3jbGOIH0uaLkuA_-Wqwrmbn30T79IsM",
  authDomain: "aulanexus-ucaldas.firebaseapp.com",
  projectId: "aulanexus-ucaldas",
  storageBucket: "aulanexus-ucaldas.firebasestorage.app",
  messagingSenderId: "273919632860",
  appId: "1:273919632860:web:0eb04f5d176198e9f91b19"
};

// Cuenta con rol docente (debe coincidir con firestore.rules)
export const TEACHER_EMAIL = "julian.buitrago@ucaldas.edu.co";
export const TEACHER_NAME = "Julián David Buitrago Orozco";

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


export const EMAIL_RELAY = {
  url: 'https://script.google.com/macros/s/AKfycby9mfNWlQmGr03Lyp4BEmq1T8BwTS3J7lZcmtyaGNIJ_WERgMtPxxd_y7TzZPz7DOCI/exec'
};

export const USAGE_RELAY = { url: 'https://script.google.com/macros/s/AKfycbwllkrk13bRNXvlkxHPPOirIFVQq62qJ6ejAwLEwSNR9WIK1JUYDqbYyRKjKTIKio0R/exec' };
// ---------------------------------------------------------------------
// OPCIONAL · Selector de Google Drive (README §8.5.2). Descomente y complete.
// export const GOOGLE_DRIVE = { apiKey: '', clientId: '', appId: '' };

// OPCIONAL · Avisos por correo (README §8.7). Pegue la URL /exec de su Apps Script.
// export const EMAIL_RELAY = { url: 'https://script.google.com/macros/s/XXXXXXXX/exec' };
