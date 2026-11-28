import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  sendPasswordResetEmail, 
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./config";

/**
 * Log in a user with email and password via Firebase Auth
 * Supports default admin@gmail.com / admin123 initial provisioning
 */
export async function login(email, password) {
  const cleanEmail = email.trim().toLowerCase();

  let userCredential;
  try {
    userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
  } catch (err) {
    // If admin default credentials used and user not in Firebase Auth yet, auto-register
    if (
      (err.code === "auth/user-not-found" || 
       err.code === "auth/invalid-credential" || 
       err.code === "auth/invalid-email") &&
      cleanEmail === "admin@gmail.com" &&
      password === "admin123"
    ) {
      try {
        userCredential = await createUserWithEmailAndPassword(auth, "admin@gmail.com", "admin123");
      } catch (createErr) {
        if (createErr.code === "auth/email-already-in-use") {
          throw new Error("auth/wrong-password: Password incorrect for admin@gmail.com.");
        }
        throw createErr;
      }
    } else {
      throw err;
    }
  }

  const user = userCredential.user;

  // Retrieve or create user profile doc in Firestore
  let profile = null;
  try {
    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
      profile = { id: userSnap.id, ...userSnap.data() };
    } else {
      profile = {
        uid: user.uid,
        email: user.email,
        displayName: cleanEmail === "admin@gmail.com" ? "WSN Administrator" : "WSN Researcher",
        role: cleanEmail === "admin@gmail.com" ? "admin" : "engineer",
        status: "active",
        createdAt: serverTimestamp()
      };
      await setDoc(userDocRef, profile);
    }
  } catch (dbErr) {
    console.warn("User profile doc fetch notice:", dbErr);
    profile = {
      uid: user.uid,
      email: user.email,
      displayName: cleanEmail === "admin@gmail.com" ? "WSN Administrator" : "User",
      role: cleanEmail === "admin@gmail.com" ? "admin" : "engineer",
      status: "active"
    };
  }

  return {
    user: { uid: user.uid, email: user.email },
    profile,
    role: profile.role
  };
}

/**
 * Log out user from Firebase Auth
 */
export async function logout() {
  try {
    await firebaseSignOut(auth);
  } catch (err) {
    console.warn("SignOut notice:", err);
  }
}

/**
 * Reset password via Firebase Auth email
 */
export async function resetPassword(email) {
  return await sendPasswordResetEmail(auth, email);
}

/**
 * Subscribe to Firebase Auth State Changes
 */
export function subscribeAuthState(callback) {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      try {
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        let profile;
        if (userDoc.exists()) {
          profile = { id: userDoc.id, ...userDoc.data() };
        } else {
          profile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.email === "admin@gmail.com" ? "WSN Administrator" : "WSN User",
            role: firebaseUser.email === "admin@gmail.com" ? "admin" : "engineer",
            status: "active"
          };
        }
        callback(firebaseUser, profile, profile.role || "admin");
      } catch (err) {
        callback(
          firebaseUser, 
          { uid: firebaseUser.uid, email: firebaseUser.email, role: "admin", displayName: "Administrator" }, 
          "admin"
        );
      }
    } else {
      callback(null, null, null);
    }
  });
}
