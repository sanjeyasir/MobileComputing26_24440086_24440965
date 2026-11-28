import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc, writeBatch } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAxTPxQVKDqJwh9jPJXJEcgP70QGHZ5D9Y",
  authDomain: "msc-mobile-computing-project.firebaseapp.com",
  projectId: "msc-mobile-computing-project",
  storageBucket: "msc-mobile-computing-project.firebasestorage.app",
  messagingSenderId: "660259181368",
  appId: "1:660259181368:web:2df23a5ba5429d0b2d67cd",
  measurementId: "G-7PTMVRH6X2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function clearCollection(collectionName) {
  console.log(`\nFetching documents from '${collectionName}'...`);
  const colRef = collection(db, collectionName);
  const snapshot = await getDocs(colRef);
  
  if (snapshot.empty) {
    console.log(`No documents found in '${collectionName}'.`);
    return 0;
  }

  console.log(`Found ${snapshot.size} documents in '${collectionName}'. Deleting in batches...`);
  
  let deletedCount = 0;
  let batch = writeBatch(db);
  let opCount = 0;

  for (const docSnap of snapshot.docs) {
    batch.delete(docSnap.ref);
    opCount++;
    deletedCount++;

    // Firestore batch limit is 500 operations
    if (opCount >= 400) {
      await batch.commit();
      console.log(` -> Deleted ${deletedCount} / ${snapshot.size} in '${collectionName}'`);
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  console.log(`Successfully deleted ${deletedCount} documents from '${collectionName}'.`);
  return deletedCount;
}

async function main() {
  console.log("=================================================");
  console.log("PURGING ALL DATA IN CLOUD FIRESTORE DATABASE");
  console.log(`Project: ${firebaseConfig.projectId}`);
  console.log("=================================================");

  try {
    const telemetryDeleted = await clearCollection("telemetry");
    const nodesDeleted = await clearCollection("nodes");
    const alertsDeleted = await clearCollection("alerts");

    console.log("\n=================================================");
    console.log("DATABASE PURGE COMPLETE!");
    console.log(`- Telemetry Bursts Deleted: ${telemetryDeleted}`);
    console.log(`- Nodes Deleted:            ${nodesDeleted}`);
    console.log(`- Alerts Deleted:           ${alertsDeleted}`);
    console.log("=================================================");
    process.exit(0);
  } catch (error) {
    console.error("Error purging database:", error);
    process.exit(1);
  }
}

main();
