import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getAnalytics, isSupported } from "firebase/analytics";

// Environment-aware Firebase configuration for MSc Mobile Computing WSN Project
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAxTPxQVKDqJwh9jPJXJEcgP70QGHZ5D9Y",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "msc-mobile-computing-project.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "msc-mobile-computing-project",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "msc-mobile-computing-project.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "660259181368",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:660259181368:web:2df23a5ba5429d0b2d67cd",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-7PTMVRH6X2"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

let analytics = null;
if (typeof window !== "undefined" && firebaseConfig.measurementId) {
  isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {});
}

export { app, auth, db, functions, analytics, firebaseConfig };
