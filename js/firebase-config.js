//############################################################################

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
  maxFileBytes: 200 * 1024,
  maxFiles: 5,
  maxTextChars: 20000
};