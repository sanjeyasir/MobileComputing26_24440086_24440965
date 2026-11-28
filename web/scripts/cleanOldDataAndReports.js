import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, writeBatch, orderBy, query } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAxTPxQVKDqJwh9jPJXJEcgP70QGHZ5D9Y",
  authDomain: "msc-mobile-computing-project.firebaseapp.com",
  projectId: "msc-mobile-computing-project",
  storageBucket: "msc-mobile-computing-project.firebasestorage.app"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function cleanOldData() {
  console.log("==================================================================");
  console.log("CLEANING OLD DATA, RESETTING STALE METRICS & PURGING OLD REPORTS");
  console.log("==================================================================");

  // 1. Purge all telemetry bursts
  console.log("\n[1] Checking telemetry collection...");
  const tSnap = await getDocs(collection(db, "telemetry"));
  if (!tSnap.empty) {
    const batch = writeBatch(db);
    tSnap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    console.log(` -> Deleted ${tSnap.size} telemetry records.`);
  } else {
    console.log(" -> Telemetry collection is already clean (0 records).");
  }

  // 2. Reset / Clean nodes collection to remove stale temperature/battery/rssi averages
  console.log("\n[2] Cleaning stale metrics from nodes collection...");
  const nSnap = await getDocs(collection(db, "nodes"));
  if (!nSnap.empty) {
    const batch = writeBatch(db);
    nSnap.forEach(d => {
      // Completely remove old stale telemetry numbers from node documents
      batch.delete(d.ref);
    });
    await batch.commit();
    console.log(` -> Purged ${nSnap.size} old node documents with stale metrics/averages.`);
  }

  // 3. Purge all alerts
  console.log("\n[3] Checking alerts collection...");
  const aSnap = await getDocs(collection(db, "alerts"));
  if (!aSnap.empty) {
    const batch = writeBatch(db);
    aSnap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    console.log(` -> Deleted ${aSnap.size} alert records.`);
  } else {
    console.log(" -> Alerts collection is already clean (0 records).");
  }

  // 4. Reports collection: Delete previous reports and ONLY keep the single most recent one
  console.log("\n[4] Cleaning reports collection (keeping only the most recent)...");
  const rSnap = await getDocs(collection(db, "reports"));
  const reportsList = [];
  rSnap.forEach(d => reportsList.push({ id: d.id, ref: d.ref, ...d.data() }));

  // Sort descending by creation date
  reportsList.sort((a, b) => {
    const timeA = new Date(a.generatedAtIso || a.createdAt?.toDate?.() || 0).getTime();
    const timeB = new Date(b.generatedAtIso || b.createdAt?.toDate?.() || 0).getTime();
    return timeB - timeA;
  });

  if (reportsList.length > 1) {
    const toDelete = reportsList.slice(1);
    const batch = writeBatch(db);
    toDelete.forEach(r => {
      console.log(` -> Deleting previous report: ${r.id} (${r.fileName || 'Report'})`);
      batch.delete(r.ref);
    });
    // Update the recent report's downloadUrl
    batch.update(reportsList[0].ref, {
      downloadUrl: "https://api-auc2wpy33q-uc.a.run.app/reports/download/latest"
    });
    await batch.commit();
    console.log(` -> Successfully deleted ${toDelete.length} old reports. Kept and updated recent report: ${reportsList[0].id}`);
  } else if (reportsList.length === 1) {
    const batch = writeBatch(db);
    batch.update(reportsList[0].ref, {
      downloadUrl: "https://api-auc2wpy33q-uc.a.run.app/reports/download/latest"
    });
    await batch.commit();
    console.log(` -> Only 1 recent report exists (${reportsList[0].id}). Updated its downloadUrl.`);
  } else {
    console.log(" -> No reports present.");
  }

  console.log("\n==================================================================");
  console.log("DATABASE FULLY CLEANED & STALE METRICS REMOVED!");
  console.log("==================================================================");
  process.exit(0);
}

cleanOldData().catch(err => {
  console.error("Clean error:", err);
  process.exit(1);
});
