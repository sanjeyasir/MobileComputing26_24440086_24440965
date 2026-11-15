import { Platform } from "react-native";
import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyAxTPxQVKDqJwh9jPJXJEcgP70QGHZ5D9Y",
  authDomain: "msc-mobile-computing-project.firebaseapp.com",
  projectId: "msc-mobile-computing-project",
  storageBucket: "msc-mobile-computing-project.firebasestorage.app",
  messagingSenderId: "660259181368",
  appId: "1:660259181368:web:2df23a5ba5429d0b2d67cd",
  measurementId: "G-7PTMVRH6X2"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let dbInstance;
try {
  // React Native on Android requires long polling for reliable Firestore real-time listeners
  dbInstance = initializeFirestore(
    app,
    Platform.OS === "web"
      ? { experimentalAutoDetectLongPolling: true }
      : { experimentalForceLongPolling: true }
  );
} catch (e) {
  dbInstance = getFirestore(app);
}

export const db = dbInstance;
export default app;
