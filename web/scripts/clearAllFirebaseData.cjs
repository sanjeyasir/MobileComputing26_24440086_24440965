const admin = require("../functions/node_modules/firebase-admin");

admin.initializeApp({
  projectId: "msc-mobile-computing-project",
  storageBucket: "msc-mobile-computing-project.firebasestorage.app"
});

const db = admin.firestore();

async function deleteCollection(collectionName) {
  console.log(`Clearing collection: ${collectionName}...`);
  const snapshot = await db.collection(collectionName).get();
  if (snapshot.empty) {
    console.log(`  -> ${collectionName} was already empty.`);
    return 0;
  }

  const batchSize = 400;
  let deletedCount = 0;
  const docs = snapshot.docs;

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const batch = db.batch();
    chunk.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deletedCount += chunk.length;
  }

  console.log(`  -> Deleted ${deletedCount} documents from ${collectionName}.`);
  return deletedCount;
}

async function clearStorageFiles() {
  console.log("Checking Cloud Storage for reports to delete...");
  const bucketCandidates = [
    "msc-mobile-computing-project.firebasestorage.app",
    "msc-mobile-computing-project.appspot.com"
  ];

  for (const bucketName of bucketCandidates) {
    try {
      const bucket = admin.storage().bucket(bucketName);
      const [files] = await bucket.getFiles({ prefix: "reports/" });
      if (files.length > 0) {
        console.log(`Found ${files.length} files in bucket ${bucketName}. Deleting...`);
        for (const file of files) {
          await file.delete();
        }
        console.log(`  -> Deleted ${files.length} storage files from ${bucketName}.`);
      } else {
        console.log(`  -> No files found in bucket ${bucketName}.`);
      }
    } catch (e) {
      console.log(`  -> Storage bucket ${bucketName} check info: ${e.message}`);
    }
  }
}

async function resetMachineState() {
  console.log("Resetting machine state to fresh operational baseline...");
  const machineRef = db.collection("machines").doc("rubberised_coir_cutter");
  const now = Date.now();
  await machineRef.set({
    machineId: "rubberised_coir_cutter",
    machineName: "Rubberised Coir Fleece Cutting machine",
    company: "Toyo Cushion Lanka",
    sector: "Hayleys Eco Solutions Sector",
    status: "RUNNING",
    currentSignalState: 1, // Blade at home/resting position
    todayCutsCount: 0,
    lastActivityMs: now,
    lastBladeArrivesMs: now,
    lastBladeLeavesMs: null,
    lastCutTime: null,
    lastCycleDurationSec: null,
    currentDowntimeId: null,
    updatedAt: new Date().toISOString()
  });
  console.log("  -> Machine state successfully reset.");
}

async function main() {
  console.log("==========================================");
  console.log("STARTING COMPREHENSIVE FIREBASE DATA PURGE");
  console.log("==========================================");

  const collections = [
    "cuts",
    "downtime",
    "cuts_archive",
    "downtime_archive",
    "daily_metrics",
    "reports",
    "audit_logs",
    "email_reports"
  ];

  for (const col of collections) {
    await deleteCollection(col);
  }

  await clearStorageFiles();
  await resetMachineState();

  console.log("==========================================");
  console.log("PURGE AND RESET COMPLETED SUCCESSFULLY!");
  console.log("==========================================");
  process.exit(0);
}

main().catch((err) => {
  console.error("Purge error:", err);
  process.exit(1);
});
