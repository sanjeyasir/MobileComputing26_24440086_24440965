const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

admin.initializeApp({
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "msc-mobile-computing-project.firebasestorage.app"
});
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const MACHINE_ID = "rubberised_coir_cutter";
const MACHINE_NAME = "Rubberised Coir Fleece Cutting machine";
const COMPANY_NAME = "Toyo Cushion Lanka";
const SECTOR_NAME = "Hayleys Eco Solutions Sector";
const CUTS_PER_POST = 2; // Every post of 1 counts as 2 cuts

/**
 * Utility to calculate and format Sri Lanka Standard Time (Asia/Colombo, UTC+05:30)
 */
function getSLSTDate(inputDate = new Date()) {
  const d = inputDate instanceof Date ? inputDate : new Date(inputDate);
  const validDate = isNaN(d.getTime()) ? new Date() : d;

  const utcMs = validDate.getTime() + validDate.getTimezoneOffset() * 60000;
  const slstOffsetMs = 5.5 * 60 * 60 * 1000;
  const slstDate = new Date(utcMs + slstOffsetMs);

  const yyyy = slstDate.getFullYear();
  const mm = String(slstDate.getMonth() + 1).padStart(2, "0");
  const dd = String(slstDate.getDate()).padStart(2, "0");
  const hh = String(slstDate.getHours()).padStart(2, "0");
  const min = String(slstDate.getMinutes()).padStart(2, "0");
  const ss = String(slstDate.getSeconds()).padStart(2, "0");

  const dateString = `${yyyy}-${mm}-${dd}`;
  const timeString = `${hh}:${min}:${ss}`;
  const iso = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+05:30`;
  const formatted = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} (+05:30 SLST)`;
  const fileStamp = `${yyyy}-${mm}-${dd}_${hh}${min}${ss}`;

  return {
    date: slstDate,
    dateString,
    timeString,
    iso,
    formatted,
    fileStamp,
    hour: slstDate.getHours(),
    minute: slstDate.getMinutes(),
    second: slstDate.getSeconds(),
    timestampMs: validDate.getTime()
  };
}

/**
 * Compute Daily Volume & Downtime Metrics for a given date (YYYY-MM-DD)
 * - Each Post 1 signal = 2 cuts (CUTS_PER_POST = 2)
 * - No cycle duration, idle threshold, availability, or OEE concepts
 */
async function computeDailyMetrics(targetDateStr) {
  const cutsSnap = await db
    .collection("cuts")
    .where("date", "==", targetDateStr)
    .get();

  const downtimesSnap = await db
    .collection("downtime")
    .where("date", "==", targetDateStr)
    .get();

  const cuts = [];
  cutsSnap.forEach((d) => cuts.push({ id: d.id, ...d.data() }));
  if (cuts.length === 0) {
    const archiveCutsSnap = await db
      .collection("cuts_archive")
      .where("date", "==", targetDateStr)
      .get();
    archiveCutsSnap.forEach((d) => cuts.push({ id: d.id, ...d.data() }));
  }
  cuts.sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));

  const downtimes = [];
  downtimesSnap.forEach((d) => downtimes.push({ id: d.id, ...d.data() }));
  if (downtimes.length === 0) {
    const archiveDtSnap = await db
      .collection("downtime_archive")
      .where("date", "==", targetDateStr)
      .get();
    archiveDtSnap.forEach((d) => downtimes.push({ id: d.id, ...d.data() }));
  }
  downtimes.sort((a, b) => (b.startMs || 0) - (a.startMs || 0));

  // Hourly volume array for 24 hours: hour 0 to 23
  // Every post of 1 counts as 2 cuts
  const hourlyCuts = Array(24).fill(0);
  const hourlySignals = Array(24).fill(0);
  let totalCuts = 0;

  cuts.forEach((c) => {
    const h = Number(c.hour);
    const cutCount = c.cutsAdded !== undefined ? Number(c.cutsAdded) : CUTS_PER_POST;
    if (!isNaN(h) && h >= 0 && h < 24) {
      hourlyCuts[h] += cutCount;
      hourlySignals[h] += 1;
    }
    totalCuts += cutCount;
  });

  let totalDowntimeMinutes = 0;
  let activeDowntime = null;

  downtimes.forEach((dt) => {
    if (dt.active) {
      if (!activeDowntime) activeDowntime = dt;
      if (dt.startMs && !dt.endMs) {
        const slstNow = getSLSTDate();
        const activeDurationMs = Math.max(0, slstNow.timestampMs - dt.startMs);
        totalDowntimeMinutes += activeDurationMs / 60000;
      }
    } else {
      totalDowntimeMinutes += Number(dt.durationMinutes || 0);
    }
  });

  totalDowntimeMinutes = parseFloat(totalDowntimeMinutes.toFixed(2));

  return {
    date: targetDateStr,
    machineId: MACHINE_ID,
    machineName: MACHINE_NAME,
    company: COMPANY_NAME,
    sector: SECTOR_NAME,
    cutsPerPost: CUTS_PER_POST,
    totalCuts,
    totalSignals: cuts.length,
    totalCycles: cuts.length,
    hourlyCuts,
    hourlySignals,
    totalDowntimeMinutes,
    downtimeIncidentsCount: downtimes.length,
    hasActiveDowntime: !!activeDowntime,
    activeDowntime,
    cutsList: cuts,
    downtimesList: downtimes
  };
}

/**
 * Generate Clean 1-Page PDF Buffer: Hourly Cut Volume Report (24h)
 * Strictly presents 24-hour hourly cuts, volume summary, and peak production.
 */
function generateHourlyCutsPdfBuffer(metrics, generatedTime = getSLSTDate()) {
  return new Promise((resolve, reject) => {
    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({ size: "A4", margins: { top: 32, bottom: 32, left: 32, right: 32 } });
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    // Find Peak Hour
    let peakHour = 0;
    let peakCount = 0;
    metrics.hourlyCuts.forEach((cnt, h) => {
      if (cnt > peakCount) {
        peakCount = cnt;
        peakHour = h;
      }
    });

    // Header banner
    doc.rect(32, 32, 531, 54).fill("#064e3b");
    doc.fillColor("#fbbf24").fontSize(9).font("Helvetica-Bold")
       .text("TOYO CUSHION LANKA (PVT) LTD • HAYLEYS ECO SOLUTIONS", 44, 42);
    doc.fillColor("#ffffff").fontSize(16).font("Helvetica-Bold")
       .text("HOURLY CUT VOLUME REPORT", 44, 58);

    doc.fillColor("#1e293b").fontSize(8.5).font("Helvetica-Bold")
       .text(`Machine: ${MACHINE_NAME}`, 32, 96);
    doc.font("Helvetica").fillColor("#64748b")
       .text(`Report Date: ${metrics.date}  |  Generated (SLST): ${generatedTime.formatted}  |  Counting Rule: 1 Post = 2 Cuts`, 32, 108);

    // Summary 3-box KPI row
    const kpiY = 124;
    const boxW = 171;

    // KPI 1: Total Volume
    doc.rect(32, kpiY, boxW, 42).fillAndStroke("#ecfdf5", "#a7f3d0");
    doc.fillColor("#065f46").fontSize(8).font("Helvetica-Bold").text("TOTAL CUT VOLUME", 42, kpiY + 6);
    doc.fontSize(16).text(`${metrics.totalCuts.toLocaleString()} Cuts`, 42, kpiY + 18);

    // KPI 2: Peak Hour
    doc.rect(212, kpiY, boxW, 42).fillAndStroke("#eff6ff", "#bfdbfe");
    doc.fillColor("#1e40af").fontSize(8).font("Helvetica-Bold").text("PEAK PRODUCTION HOUR", 222, kpiY + 6);
    doc.fontSize(11).text(peakCount > 0 ? `${String(peakHour).padStart(2, "0")}:00 - ${String((peakHour + 1) % 24).padStart(2, "0")}:00 (${peakCount} cuts)` : "No cuts recorded", 222, kpiY + 20);

    // KPI 3: Machine Status
    doc.rect(392, kpiY, boxW, 42).fillAndStroke(metrics.hasActiveDowntime ? "#fef2f2" : "#f0fdf4", metrics.hasActiveDowntime ? "#f87171" : "#86efac");
    doc.fillColor(metrics.hasActiveDowntime ? "#dc2626" : "#166534").fontSize(8).font("Helvetica-Bold").text("MACHINE STATUS", 402, kpiY + 6);
    doc.fontSize(12).text(metrics.hasActiveDowntime ? "⚠️ DOWNTIME ACTIVE" : "✓ MACHINE RUNNING", 402, kpiY + 20);

    // 24 Hour Hourly Cuts Table (Strictly: Hour Window and Count of Cuts)
    const tableTop = 176;
    const rowH = 22.5;
    doc.rect(32, tableTop, 531, 20).fill("#1e293b");
    doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold");
    doc.text("HOUR WINDOW (SLST)", 50, tableTop + 6);
    doc.text("COUNT OF CUTS PER HOUR", 320, tableTop + 6);

    let cy = tableTop + 20;
    for (let h = 0; h < 24; h++) {
      const cuts = metrics.hourlyCuts[h] || 0;
      const isAlt = h % 2 === 1;
      const isPeak = cuts > 0 && cuts === peakCount;
      const rowBg = isPeak ? "#d1fae5" : (cuts > 0 ? (isAlt ? "#ecfdf5" : "#ffffff") : (isAlt ? "#f8fafc" : "#ffffff"));

      doc.rect(32, cy, 531, rowH).fill(rowBg);
      doc.fillColor("#0f172a").fontSize(8.5).font("Helvetica");
      doc.text(`${String(h).padStart(2, "0")}:00 - ${String((h + 1) % 24).padStart(2, "0")}:00`, 50, cy + 6);

      if (cuts > 0) {
        doc.fillColor("#047857").font("Helvetica-Bold").text(`${cuts} Cuts ${isPeak ? "★ (Peak Hour)" : ""}`, 320, cy + 6);
      } else {
        doc.fillColor("#94a3b8").font("Helvetica").text("0 Cuts", 320, cy + 6);
      }

      cy += rowH;
    }
    doc.rect(32, tableTop, 531, 20 + 24 * rowH).stroke("#cbd5e1");

    // Single-page Footer
    doc.fillColor("#64748b").fontSize(7).font("Helvetica")
       .text("Toyo Cushion Lanka (Pvt) Ltd • Hayleys Eco Solutions Sector • MSc Mobile Computing Project Telemetry Engine", 32, 792, { align: "center", width: 531 });

    doc.end();
  });
}

/**
 * Generate Clean 1-Page PDF Buffer: Downtime Logs Report
 * Strictly presents all downtime incidents for the target date on a single page.
 */
function generateDowntimeLogsPdfBuffer(metrics, generatedTime = getSLSTDate()) {
  return new Promise((resolve, reject) => {
    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({ size: "A4", margins: { top: 32, bottom: 32, left: 32, right: 32 } });
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const downtimes = metrics.downtimesList || [];

    // Header banner
    doc.rect(32, 32, 531, 54).fill("#7f1d1d");
    doc.fillColor("#fde68a").fontSize(9).font("Helvetica-Bold")
       .text("TOYO CUSHION LANKA (PVT) LTD • HAYLEYS ECO SOLUTIONS", 44, 42);
    doc.fillColor("#ffffff").fontSize(16).font("Helvetica-Bold")
       .text("MACHINE DOWNTIME INCIDENTS & LOGS REPORT", 44, 58);

    doc.fillColor("#1e293b").fontSize(8.5).font("Helvetica-Bold")
       .text(`Machine: ${MACHINE_NAME}`, 32, 96);
    doc.font("Helvetica").fillColor("#64748b")
       .text(`Report Date: ${metrics.date}  |  Generated (SLST): ${generatedTime.formatted}  |  Total Incidents: ${downtimes.length}`, 32, 108);

    // Summary 3-box KPI row
    const kpiY = 124;
    const boxW = 171;

    // KPI 1: Total Downtime Duration
    doc.rect(32, kpiY, boxW, 44).fillAndStroke("#fef2f2", "#fca5a5");
    doc.fillColor("#991b1b").fontSize(8).font("Helvetica-Bold").text("TOTAL DOWNTIME DURATION", 40, kpiY + 6);
    doc.fontSize(15).text(`${metrics.totalDowntimeMinutes || 0} minutes`, 40, kpiY + 20);

    // KPI 2: Total Stoppages
    doc.rect(212, kpiY, boxW, 44).fillAndStroke("#fffbeb", "#fde68a");
    doc.fillColor("#92400e").fontSize(8).font("Helvetica-Bold").text("TOTAL STOPPAGE INCIDENTS", 220, kpiY + 6);
    doc.fontSize(15).text(`${downtimes.length} incidents`, 220, kpiY + 20);

    // KPI 3: Active Status
    doc.rect(392, kpiY, boxW, 44).fillAndStroke(metrics.hasActiveDowntime ? "#fef2f2" : "#f0fdf4", metrics.hasActiveDowntime ? "#f87171" : "#86efac");
    doc.fillColor(metrics.hasActiveDowntime ? "#dc2626" : "#166534").fontSize(8).font("Helvetica-Bold").text("ACTIVE MACHINE STATUS", 400, kpiY + 6);
    doc.fontSize(12).text(metrics.hasActiveDowntime ? "⚠️ ACTIVE STOPPAGE" : "✓ ALL RESOLVED / NORMAL", 400, kpiY + 22);

    // Downtime Table
    const tableTop = 180;
    doc.rect(32, tableTop, 531, 20).fill("#1e293b");
    doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
    doc.text("#", 38, tableTop + 6);
    doc.text("REASON / DESCRIPTION", 56, tableTop + 6);
    doc.text("START TIME (SLST)", 220, tableTop + 6);
    doc.text("END TIME (SLST)", 320, tableTop + 6);
    doc.text("DURATION", 415, tableTop + 6);
    doc.text("STATUS", 480, tableTop + 6);

    let cy = tableTop + 20;

    if (downtimes.length === 0) {
      doc.rect(32, cy, 531, 80).fill("#f8fafc");
      doc.fillColor("#15803d").fontSize(11).font("Helvetica-Bold")
         .text("✓ No downtime incidents recorded on this date.", 32, cy + 26, { align: "center", width: 531 });
      doc.fillColor("#64748b").fontSize(8.5).font("Helvetica")
         .text("The Rubberised Coir Cutting Machine operated without any recorded stoppages.", 32, cy + 44, { align: "center", width: 531 });
      cy += 80;
    } else {
      const maxRows = 24; // Ensure clean single page
      const visibleDts = downtimes.slice(0, maxRows);
      const rowH = visibleDts.length > 15 ? 20 : 24;

      visibleDts.forEach((dt, idx) => {
        const isAlt = idx % 2 === 1;
        const rowBg = dt.active ? "#fee2e2" : (isAlt ? "#f8fafc" : "#ffffff");
        doc.rect(32, cy, 531, rowH).fill(rowBg);

        doc.fillColor("#475569").fontSize(7.5).font("Helvetica").text(String(idx + 1), 38, cy + 6);
        doc.fillColor("#0f172a").font("Helvetica-Bold").text(dt.reason || "Machine Downtime", 56, cy + 6, { width: 155, ellipsis: true });
        doc.font("Helvetica").fillColor("#334155").text(dt.startTimeStr || dt.startTime || "—", 220, cy + 6);
        doc.text(dt.active ? "Ongoing..." : (dt.endTimeStr || dt.endTime || "—"), 320, cy + 6);

        const durText = dt.active
          ? "Active"
          : (dt.durationSeconds !== undefined && dt.durationSeconds !== null
            ? `${dt.durationSeconds}s`
            : `${dt.durationMinutes || 0}m`);
        doc.fillColor("#b45309").font("Helvetica-Bold").text(durText, 415, cy + 6);

        if (dt.active) {
          doc.fillColor("#dc2626").font("Helvetica-Bold").text("ACTIVE", 480, cy + 6);
        } else {
          doc.fillColor("#16a34a").font("Helvetica-Bold").text("ENDED", 480, cy + 6);
        }

        cy += rowH;
      });
      doc.rect(32, tableTop, 531, cy - tableTop).stroke("#cbd5e1");
    }

    // Single-page Footer
    doc.fillColor("#64748b").fontSize(7).font("Helvetica")
       .text("Toyo Cushion Lanka (Pvt) Ltd • Hayleys Eco Solutions Sector • MSc Mobile Computing Project Telemetry Engine", 32, 792, { align: "center", width: 531 });

    doc.end();
  });
}

/**
 * Attempt to upload PDF report to Firebase Storage (Cloud Storage for Firebase)
 */
async function uploadReportToFirebaseStorage(fileName, buffer, mimeType = "application/pdf") {
  const bucketCandidates = [
    process.env.FIREBASE_STORAGE_BUCKET,
    "msc-mobile-computing-project.firebasestorage.app",
    "msc-mobile-computing-project.appspot.com"
  ].filter(Boolean);

  for (const bucketName of bucketCandidates) {
    try {
      const bucket = admin.storage().bucket(bucketName);
      const destination = `reports/${fileName}`;
      const file = bucket.file(destination);

      await file.save(buffer, {
        metadata: {
          contentType: mimeType,
          metadata: {
            uploadedBy: "ToyoCushionCutterEngine",
            uploadedAt: new Date().toISOString()
          }
        },
        resumable: false
      });

      let publicUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;
      try {
        await file.makePublic();
      } catch (e) {
        // Uniform bucket-level access may restrict direct makePublic
      }

      console.log(`[Firebase Storage] Uploaded ${fileName} to bucket ${bucketName}`);
      return {
        success: true,
        bucket: bucketName,
        destination,
        publicUrl
      };
    } catch (err) {
      console.warn(`[Firebase Storage Attempt] Bucket "${bucketName}" not writable:`, err.message);
    }
  }

  return {
    success: false,
    message: "Firebase Storage direct upload completed or fallback used. Preserved in Firestore."
  };
}

/**
 * Execute PDF Report Pipeline, Upload to Firebase Storage & Save to Firestore
 */
async function executeDailyPdfReportPipeline(targetDateStr, reportType = "hourly") {
  const slstTime = getSLSTDate();
  const metrics = await computeDailyMetrics(targetDateStr);
  const isDowntime = String(reportType).toLowerCase() === "downtime";

  let pdfBuffer;
  let fileName;
  let title;

  if (isDowntime) {
    pdfBuffer = await generateDowntimeLogsPdfBuffer(metrics, slstTime);
    fileName = `ToyoCushion_DowntimeLogs_${targetDateStr}_${slstTime.fileStamp}.pdf`;
    title = `Downtime Logs Report (${targetDateStr})`;
  } else {
    pdfBuffer = await generateHourlyCutsPdfBuffer(metrics, slstTime);
    fileName = `ToyoCushion_HourlyCuts_${targetDateStr}_${slstTime.fileStamp}.pdf`;
    title = `Hourly Cut Volume Report (${targetDateStr})`;
  }

  const base64Data = pdfBuffer.toString("base64");
  const storageResult = await uploadReportToFirebaseStorage(fileName, pdfBuffer, "application/pdf");

  await db.collection("daily_metrics").doc(targetDateStr).set({
    date: targetDateStr,
    machineId: MACHINE_ID,
    machineName: MACHINE_NAME,
    company: COMPANY_NAME,
    sector: SECTOR_NAME,
    totalCuts: metrics.totalCuts,
    totalSignals: metrics.totalSignals,
    totalCycles: metrics.totalCycles,
    hourlyCuts: metrics.hourlyCuts,
    totalDowntimeMinutes: metrics.totalDowntimeMinutes,
    downtimeIncidentsCount: metrics.downtimeIncidentsCount,
    updatedAt: slstTime.iso
  }, { merge: true });

  const reportDoc = {
    reportId: `REP-${isDowntime ? "DOWNTIME" : "HOURLY"}-${targetDateStr}-${slstTime.fileStamp}`,
    date: targetDateStr,
    reportType: isDowntime ? "downtime" : "hourly",
    title,
    fileName,
    format: "pdf",
    machineId: MACHINE_ID,
    machineName: MACHINE_NAME,
    company: COMPANY_NAME,
    sector: SECTOR_NAME,
    createdAt: slstTime.iso,
    createdAtFormatted: slstTime.formatted,
    storageStatus: storageResult.success ? "UPLOADED_TO_FIRESTORAGE" : "PRESERVED_IN_FIRESTORE",
    storageBucket: storageResult.bucket || null,
    storagePath: storageResult.destination || null,
    storageUrl: storageResult.publicUrl || null,
    metrics: {
      totalCuts: metrics.totalCuts,
      totalSignals: metrics.totalSignals,
      totalCycles: metrics.totalCycles,
      totalDowntimeMinutes: metrics.totalDowntimeMinutes,
      downtimeIncidentsCount: metrics.downtimeIncidentsCount
    },
    base64Data,
    fileSizeBytes: pdfBuffer.length,
    downloadUrl: `https://api-auc2wpy33q-uc.a.run.app/api/reports/download/file/${encodeURIComponent(fileName)}`,
    serverTimestamp: admin.firestore.FieldValue.serverTimestamp()
  };

  const docRef = await db.collection("reports").add(reportDoc);
  return { id: docRef.id, ...reportDoc };
}

/**
 * Delete a PDF report from Firestore and Firebase Storage
 */
async function deleteReportPipeline(reportId) {
  let docRef = db.collection("reports").doc(reportId);
  let docSnap = await docRef.get();
  let docId = reportId;

  if (!docSnap.exists) {
    const qSnap = await db.collection("reports").where("reportId", "==", reportId).limit(1).get();
    if (!qSnap.empty) {
      docSnap = qSnap.docs[0];
      docRef = docSnap.ref;
      docId = docSnap.id;
    }
  }

  if (!docSnap || !docSnap.exists) {
    return { success: false, message: "Report document not found." };
  }

  const reportData = docSnap.data();

  // Remove from Storage if storagePath exists
  if (reportData.storagePath) {
    const bucketCandidates = [
      reportData.storageBucket,
      process.env.FIREBASE_STORAGE_BUCKET,
      "msc-mobile-computing-project.firebasestorage.app",
      "msc-mobile-computing-project.appspot.com"
    ].filter(Boolean);

    for (const bName of bucketCandidates) {
      try {
        await admin.storage().bucket(bName).file(reportData.storagePath).delete({ ignoreNotFound: true });
        break;
      } catch (err) {}
    }
  }

  await docRef.delete();
  return { success: true, message: `Report ${docId} deleted successfully.` };
}

/**
 * Remove existing data in the database to another list (cuts_archive & downtime_archive)
 */
async function archiveAndRotateDailyData(targetDateStr) {
  console.log(`[Archive Rotation] Moving existing data for ${targetDateStr} to archive collections...`);
  const slst = getSLSTDate();

  const cutsSnap = await db.collection("cuts").where("date", "==", targetDateStr).get();
  let migratedCutsCount = 0;

  if (!cutsSnap.empty) {
    const batches = [];
    let currentBatch = db.batch();
    let opCount = 0;

    cutsSnap.forEach((doc) => {
      const data = doc.data();
      const archiveRef = db.collection("cuts_archive").doc(doc.id);
      currentBatch.set(archiveRef, {
        ...data,
        archivedAt: slst.iso,
        archivedFrom: "cuts",
        originalDocId: doc.id
      });
      currentBatch.delete(doc.ref);
      opCount += 2;
      migratedCutsCount++;

      if (opCount >= 450) {
        batches.push(currentBatch.commit());
        currentBatch = db.batch();
        opCount = 0;
      }
    });

    if (opCount > 0) batches.push(currentBatch.commit());
    await Promise.all(batches);
  }

  const dtSnap = await db.collection("downtime").where("date", "==", targetDateStr).get();
  let migratedDowntimesCount = 0;

  if (!dtSnap.empty) {
    const batches = [];
    let currentBatch = db.batch();
    let opCount = 0;

    dtSnap.forEach((doc) => {
      const data = doc.data();
      const archiveRef = db.collection("downtime_archive").doc(doc.id);
      currentBatch.set(archiveRef, {
        ...data,
        archivedAt: slst.iso,
        archivedFrom: "downtime",
        originalDocId: doc.id
      });
      currentBatch.delete(doc.ref);
      opCount += 2;
      migratedDowntimesCount++;

      if (opCount >= 450) {
        batches.push(currentBatch.commit());
        currentBatch = db.batch();
        opCount = 0;
      }
    });

    if (opCount > 0) batches.push(currentBatch.commit());
    await Promise.all(batches);
  }

  return {
    date: targetDateStr,
    migratedCutsCount,
    migratedDowntimesCount,
    timestamp: slst.formatted
  };
}

/**
 * Delete data from the archive list every Monday at 2am, WITHOUT eliminating the previous day's details.
 */
async function purgeOldArchiveDataWithoutEliminatingPreviousDay() {
  const slstNow = getSLSTDate();
  const prevDayDate = new Date(slstNow.date.getTime() - 24 * 60 * 60 * 1000);
  const previousDayStr = getSLSTDate(prevDayDate).dateString;

  const cutsArchiveSnap = await db
    .collection("cuts_archive")
    .where("date", "<", previousDayStr)
    .get();

  let purgedCuts = 0;
  if (!cutsArchiveSnap.empty) {
    const batches = [];
    let currentBatch = db.batch();
    let opCount = 0;

    cutsArchiveSnap.forEach((doc) => {
      currentBatch.delete(doc.ref);
      opCount++;
      purgedCuts++;
      if (opCount >= 450) {
        batches.push(currentBatch.commit());
        currentBatch = db.batch();
        opCount = 0;
      }
    });

    if (opCount > 0) batches.push(currentBatch.commit());
    await Promise.all(batches);
  }

  const dtArchiveSnap = await db
    .collection("downtime_archive")
    .where("date", "<", previousDayStr)
    .get();

  let purgedDowntimes = 0;
  if (!dtArchiveSnap.empty) {
    const batches = [];
    let currentBatch = db.batch();
    let opCount = 0;

    dtArchiveSnap.forEach((doc) => {
      currentBatch.delete(doc.ref);
      opCount++;
      purgedDowntimes++;
      if (opCount >= 450) {
        batches.push(currentBatch.commit());
        currentBatch = db.batch();
        opCount = 0;
      }
    });

    if (opCount > 0) batches.push(currentBatch.commit());
    await Promise.all(batches);
  }

  const result = {
    action: "weekly_monday_archive_purge",
    executedAt: slstNow.iso,
    executedAtFormatted: slstNow.formatted,
    protectedPreviousDay: previousDayStr,
    purgedCutRecordsCount: purgedCuts,
    purgedDowntimeRecordsCount: purgedDowntimes,
    status: "SUCCESS"
  };

  await db.collection("audit_logs").add(result);
  return result;
}

// -------------------------------------------------------------
// EXPRESS APP CONFIGURATION
// -------------------------------------------------------------
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * GET /health or /api/health
 */
app.get(["/health", "/api/health"], (req, res) => {
  const slst = getSLSTDate();
  res.json({
    status: "healthy",
    company: COMPANY_NAME,
    sector: SECTOR_NAME,
    machine: MACHINE_NAME,
    cutsPerPost: CUTS_PER_POST,
    currentDate: slst.dateString,
    serverTimeSLST: slst.formatted,
    timeZone: "Asia/Colombo (+05:30)"
  });
});

/**
 * GET /api/date (Aliases: /date, /api/current-date, /current-date, /api/time, /time)
 * Returns the current date and time in Sri Lanka Standard Time (Asia/Colombo, UTC+05:30)
 */
app.get(
  ["/date", "/api/date", "/current-date", "/api/current-date", "/time", "/api/time"],
  (req, res) => {
    const slst = getSLSTDate();
    return res.status(200).json({
      success: true,
      date: slst.dateString,
      currentDate: slst.dateString,
      time: slst.timeString,
      hour: slst.hour,
      minute: slst.minute,
      second: slst.second,
      iso: slst.iso,
      formatted: slst.formatted,
      timestampMs: slst.timestampMs,
      timeZone: "Asia/Colombo (+05:30)"
    });
  }
);

// -------------------------------------------------------------
// OPENAPI 3.0 SPECIFICATION & SWAGGER UI
// -------------------------------------------------------------
const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Rubberised Coir Cutter IoT API — Volume & Downtime Management",
    version: "3.0.0",
    description:
      "Production REST API for Toyo Cushion Lanka (Hayleys Eco Solutions Sector) Rubberised Coir Fleece Cutting Machine.\n\n" +
      "### Core Rules:\n" +
      "- **Cut Signal Ingestion (`POST /api/signal`)**: Only posts `1` (`{ \"post\": 1 }`). Every post of `1` is counted as **2 cuts** (`cutsAdded = 2`) toward hourly and daily volume.\n" +
      "- **Downtime Start (`POST /api/downtime/start`)**: Creates an active downtime log when a stoppage occurs.\n" +
      "- **Downtime Monitor / Check (`GET /api/downtime/status`)**: Checks whether a downtime has been created / is currently active and returns downtime logs.\n" +
      "- **Downtime End (`POST /api/downtime/end`)**: Ends and resolves the active downtime log with start/end timestamps and total downtime duration.",
    contact: {
      name: "Engineering & Maintenance Team",
      organization: "Toyo Cushion Lanka - Hayleys Eco Solutions Sector"
    }
  },
  servers: [
    {
      url: "https://api-auc2wpy33q-uc.a.run.app",
      description: "Direct Production Cloud Run URL"
    },
    {
      url: "https://msc-mobile-computing-project.web.app",
      description: "Firebase Hosting Proxy"
    }
  ],
  tags: [
    { name: "Cutter Volume Signals", description: "Post 1 signal ingestion (1 post = 2 cuts)" },
    { name: "Downtime Management", description: "Create/start downtime, check/monitor downtime status, and end downtime" },
    { name: "Dashboard & Volume", description: "Hourly cut volume and downtime logs for Web & Mobile apps" },
    { name: "PDF Reports", description: "Single-page Hourly Cuts and Downtime Logs PDF report generation, download, and deletion" },
    { name: "Admin & System", description: "Health check and data reset operations" }
  ],
  paths: {
    "/api/signal": {
      post: {
        tags: ["Cutter Volume Signals"],
        summary: "Post Cutter Signal (Post 1 = 2 Cuts)",
        description:
          "Primary IoT & Web/Mobile signal endpoint. Accepts `{ \"post\": 1 }` and logs **2 cuts** (`cutsAdded: 2`) in Sri Lanka Standard Time (SLST UTC+05:30), incrementing both the current hour's volume and today's total cut volume by 2.\n\n*Aliases: `/api/post`, `/api/cut`, `/api/arduino`*",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["post"],
                properties: {
                  post: {
                    type: "integer",
                    enum: [1],
                    description: "Signal value: always 1. Each post of 1 adds 2 cuts to the hourly and daily volume.",
                    example: 1
                  },
                  machineId: {
                    type: "string",
                    description: "Machine identifier",
                    default: "rubberised_coir_cutter",
                    example: "rubberised_coir_cutter"
                  },
                  timestamp: {
                    type: "string",
                    format: "date-time",
                    description: "Optional ISO timestamp (defaults to current SLST server time)",
                    example: "2026-10-31T14:30:00+05:30"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Signal processed (+2 cuts added to hourly & daily volume)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "integer", example: 1 },
                    post: { type: "integer", example: 1 },
                    cutsAdded: { type: "integer", example: 2 },
                    hourlyVolume: { type: "integer", example: 24 },
                    totalCutsToday: { type: "integer", example: 120 },
                    timestamp: { type: "string", example: "2026-10-31T14:30:00+05:30" },
                    status: { type: "string", example: "Post 1 Signal Logged (+2 Cuts Added)" },
                    id: { type: "string", example: "ceF0Q9dYX6ryM88Ygs7R" },
                    serverTime: { type: "string", example: "2026-10-31 14:30:00 (+05:30 SLST)" }
                  }
                }
              }
            }
          }
        }
      },
      get: {
        tags: ["Cutter Volume Signals"],
        summary: "Post Cutter Signal via GET (?post=1 -> +2 Cuts)",
        description: "Allows microcontrollers or simple clients to trigger a cut signal via `?post=1`. Counts as **2 cuts**.",
        parameters: [
          {
            name: "post",
            in: "query",
            required: false,
            schema: { type: "integer", enum: [1], default: 1 },
            description: "Signal value: 1 (adds 2 cuts)"
          }
        ],
        responses: {
          "200": {
            description: "Signal recorded (+2 cuts added)"
          }
        }
      }
    },
    "/api/downtime/start": {
      post: {
        tags: ["Downtime Management"],
        summary: "Create / Start a Downtime",
        description:
          "Creates a new active downtime record (`active: true`) when a machine stoppage occurs. Updates the machine status to `DOWNTIME` until `/api/downtime/end` is called to end the same downtime.\n\n*Aliases: `POST /api/downtime`, `POST /downtime/start`*",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: {
                    type: "string",
                    description: "Reason or note for the downtime",
                    example: "Blade Maintenance / Material Changeover"
                  },
                  source: {
                    type: "string",
                    description: "Origin of the downtime post (`web`, `mobile`, `api`)",
                    example: "web"
                  },
                  startTime: {
                    type: "string",
                    format: "date-time",
                    description: "Optional start timestamp (defaults to current SLST server time)"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Downtime created and marked ACTIVE",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    status: { type: "string", example: "DOWNTIME" },
                    downtimeId: { type: "string", example: "dt_98a7bc65" },
                    downtime: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "dt_98a7bc65" },
                        active: { type: "boolean", example: true },
                        reason: { type: "string", example: "Blade Maintenance / Material Changeover" },
                        startTime: { type: "string", example: "2026-10-31T14:35:00+05:30" },
                        startTimeStr: { type: "string", example: "14:35:00" },
                        date: { type: "string", example: "2026-10-31" },
                        source: { type: "string", example: "web" }
                      }
                    },
                    message: { type: "string", example: "Downtime started and logged." }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/downtime/end": {
      post: {
        tags: ["Downtime Management"],
        summary: "End / Resolve Active Downtime",
        description:
          "Ends the active downtime record (`active: false`), records the end timestamp, calculates the downtime duration (`durationSeconds` and `durationMinutes`), and returns the machine status to `RUNNING`.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  downtimeId: {
                    type: "string",
                    description: "Optional specific downtime document ID to end (if omitted, ends the currently active downtime)",
                    example: "dt_98a7bc65"
                  },
                  resolvedBy: {
                    type: "string",
                    description: "Optional note on who/what ended the downtime",
                    example: "Ended via Web App"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Active downtime ended and duration calculated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    status: { type: "string", example: "RUNNING" },
                    downtimeResolved: {
                      type: "object",
                      properties: {
                        downtimeId: { type: "string", example: "dt_98a7bc65" },
                        startTimeStr: { type: "string", example: "14:35:00" },
                        endTimeStr: { type: "string", example: "14:47:30" },
                        durationSeconds: { type: "integer", example: 750 },
                        durationMinutes: { type: "number", example: 12.5 },
                        reason: { type: "string", example: "Blade Maintenance / Material Changeover" }
                      }
                    },
                    resolvedAt: { type: "string", example: "2026-10-31 14:47:30 (+05:30 SLST)" },
                    message: { type: "string", example: "Downtime ended successfully at 14:47:30." }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/downtime/status": {
      get: {
        tags: ["Downtime Management"],
        summary: "Monitor & Check if Downtime Has Been Created (GET)",
        description:
          "Monitors and checks whether an active downtime currently exists (`hasActiveDowntime`), whether any downtime has been created on the selected date (`hasDowntimeCreatedToday`), and returns the active downtime details plus the full list of downtime logs.\n\n*Aliases: `GET /api/downtime`, `GET /api/downtime/check`*",
        parameters: [
          {
            name: "date",
            in: "query",
            required: false,
            schema: { type: "string", format: "date", example: "2026-10-31" },
            description: "Target date in YYYY-MM-DD format (defaults to today in SLST)"
          }
        ],
        responses: {
          "200": {
            description: "Downtime monitoring status and downtime logs",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    date: { type: "string", example: "2026-10-31" },
                    hasActiveDowntime: { type: "boolean", example: true },
                    hasDowntimeCreatedToday: { type: "boolean", example: true },
                    machineStatus: { type: "string", enum: ["RUNNING", "DOWNTIME"], example: "DOWNTIME" },
                    activeDowntime: {
                      type: "object",
                      nullable: true,
                      properties: {
                        id: { type: "string", example: "dt_98a7bc65" },
                        active: { type: "boolean", example: true },
                        reason: { type: "string", example: "Blade Maintenance" },
                        startTime: { type: "string", example: "2026-10-31T14:35:00+05:30" },
                        startTimeStr: { type: "string", example: "14:35:00" },
                        elapsedSeconds: { type: "integer", example: 185 },
                        elapsedMinutes: { type: "number", example: 3.08 }
                      }
                    },
                    totalDowntimesCount: { type: "integer", example: 2 },
                    totalDowntimeMinutes: { type: "number", example: 15.5 },
                    downtimes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          active: { type: "boolean" },
                          reason: { type: "string" },
                          startTimeStr: { type: "string" },
                          endTimeStr: { type: "string", nullable: true },
                          durationMinutes: { type: "number", nullable: true },
                          durationSeconds: { type: "integer", nullable: true }
                        }
                      }
                    },
                    serverTimeSLST: { type: "string", example: "2026-10-31 14:38:05 (+05:30 SLST)" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/dashboard": {
      get: {
        tags: ["Dashboard & Volume"],
        summary: "Get Hourly Cut Volume & Downtime Logs",
        description: "Returns live machine status, today's total cut volume (`1 post = 2 cuts`), 24-hour hourly volume array (`0-23h`), active downtime status, and downtime logs.",
        parameters: [
          {
            name: "date",
            in: "query",
            required: false,
            schema: { type: "string", format: "date", example: "2026-10-31" },
            description: "Target date in YYYY-MM-DD format (defaults to current date in SLST)"
          }
        ],
        responses: {
          "200": {
            description: "Dashboard volume and downtime state"
          }
        }
      }
    },
    "/api/reports/generate": {
      post: {
        tags: ["PDF Reports"],
        summary: "Generate Single-Page PDF Report (Hourly Cuts or Downtime Logs)",
        description: "Generates a clean 1-page PDF report. Type can be `hourly` (presents strictly the 24-hour hourly cuts) or `downtime` (presents all downtime incidents on one page).",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  date: {
                    type: "string",
                    format: "date",
                    description: "Target report date (YYYY-MM-DD).",
                    example: "2026-11-01"
                  },
                  type: {
                    type: "string",
                    enum: ["hourly", "downtime"],
                    description: "Type of PDF report to generate",
                    example: "hourly"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "PDF report generated and saved"
          }
        }
      }
    },
    "/api/reports": {
      get: {
        tags: ["PDF Reports"],
        summary: "List Generated PDF Reports",
        description: "Retrieves list of generated PDF reports stored in Firestore.",
        responses: {
          "200": { description: "List of PDF report records" }
        }
      }
    },
    "/api/reports/download/{id}": {
      get: {
        tags: ["PDF Reports"],
        summary: "Download / View PDF Report (.pdf)",
        description: "Direct binary download / streaming of the requested PDF report file.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Report Document ID"
          }
        ],
        responses: {
          "200": {
            description: "PDF file stream (.pdf)"
          }
        }
      }
    },
    "/api/reports/{id}": {
      delete: {
        tags: ["PDF Reports"],
        summary: "Delete PDF Report",
        description: "Deletes a PDF report document from Firestore and removes the file from Firebase Storage.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Report Document ID"
          }
        ],
        responses: {
          "200": {
            description: "Report deleted successfully"
          }
        }
      }
    },
    "/api/admin/purge-all": {
      post: {
        tags: ["Admin & System"],
        summary: "Purge All Data & Reset Machine Baseline",
        description: "Clears all documents from `cuts`, `cutter_logs`, `downtime`, `daily_metrics`, archives, and resets machine state to 0 cuts.",
        responses: {
          "200": {
            description: "Collections purged and baseline reset"
          }
        }
      }
    },
    "/api/date": {
      get: {
        tags: ["Admin & System"],
        summary: "Get Current Date & Time (SLST)",
        description:
          "Returns the current server date (`YYYY-MM-DD`), time (`HH:MM:SS`), hour, ISO string, and timestamp in Sri Lanka Standard Time (`Asia/Colombo`, `UTC+05:30`).\n\n*Aliases: `GET /date`, `GET /api/current-date`, `GET /api/time`*",
        responses: {
          "200": {
            description: "Current date and time in SLST",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    date: { type: "string", format: "date", example: "2026-11-01" },
                    currentDate: { type: "string", format: "date", example: "2026-11-01" },
                    time: { type: "string", example: "04:55:00" },
                    hour: { type: "integer", example: 4 },
                    minute: { type: "integer", example: 55 },
                    second: { type: "integer", example: 0 },
                    iso: { type: "string", example: "2026-11-01T04:55:00+05:30" },
                    formatted: { type: "string", example: "2026-11-01 04:55:00 (+05:30 SLST)" },
                    timestampMs: { type: "integer", example: 1793489100000 },
                    timeZone: { type: "string", example: "Asia/Colombo (+05:30)" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/health": {
      get: {
        tags: ["Admin & System"],
        summary: "System Health & Server Time",
        description: "Verifies API uptime and returns current Sri Lanka Standard Time (Asia/Colombo UTC+05:30).",
        responses: {
          "200": {
            description: "Health status"
          }
        }
      }
    }
  }
};

// Serve Raw OpenAPI JSON Specification
app.get(
  ["/openapi.json", "/api/openapi.json", "/swagger.json", "/api/swagger.json"],
  (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.json(openApiSpec);
  }
);

// Serve Interactive Swagger UI Page
app.get(
  ["/docs", "/api/docs", "/swagger", "/api/swagger"],
  (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cutter IoT API | Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5.11.0/favicon-32x32.png" sizes="32x32" />
  <style>
    body { margin: 0; background: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .topbar-branding { background: #0b1120; border-bottom: 2px solid #10b981; color: white; padding: 14px 28px; display: flex; align-items: center; justify-content: space-between; }
    .topbar-branding h1 { margin: 0; font-size: 1.15rem; font-weight: 700; letter-spacing: -0.02em; display: flex; align-items: center; gap: 10px; }
    .topbar-branding .badge { background: #065f46; color: #6ee7b7; padding: 3px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .topbar-branding .subtext { font-size: 0.85rem; color: #94a3b8; }
    .swagger-ui { background: #f8fafc; padding: 20px 0; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 20px 0; }
  </style>
</head>
<body>
  <div class="topbar-branding">
    <div>
      <h1>
        <span>⚙️ Toyo Cushion Lanka — Cutter IoT API</span>
        <span class="badge">v3.0 • Post 1 = 2 Cuts & Downtime API</span>
      </h1>
      <div class="subtext">Hayleys Eco Solutions Sector • Hourly Volume & Downtime Management</div>
    </div>
    <div>
      <a href="/api/openapi.json" target="_blank" style="color: #34d399; text-decoration: none; font-size: 0.85rem; font-weight: 600; border: 1px solid #059669; padding: 6px 12px; border-radius: 6px;">
        📄 Raw OpenAPI Spec
      </a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" charset="UTF-8"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: "/api/openapi.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
        docExpansion: "list"
      });
    };
  </script>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  }
);

/**
 * Helper to resolve and finalize active downtime when ended via Web/Mobile UI or API
 */
async function resolveActiveDowntimeIfAny(machineData, slst, resolvedByText, specificDtId) {
  const dtId = specificDtId || machineData?.currentDowntimeId || machineData?.activeDowntime?.id;
  if (dtId) {
    const dtRef = db.collection("downtime").doc(dtId);
    const dtDoc = await dtRef.get();
    if (dtDoc.exists) {
      const dtData = dtDoc.data();
      const startMs = Number(dtData.startMs) || slst.timestampMs;
      const durationMs = Math.max(0, slst.timestampMs - startMs);
      const durationMinutes = parseFloat((durationMs / 60000).toFixed(2));
      const durationSeconds = Math.round(durationMs / 1000);

      await dtRef.set(
        {
          active: false,
          endTime: slst.iso,
          endTimeStr: slst.timeString,
          endMs: slst.timestampMs,
          durationMs,
          durationSeconds,
          durationMinutes,
          resolvedBy: resolvedByText || "Ended via Web App",
          resolvedAt: slst.formatted
        },
        { merge: true }
      );

      return {
        downtimeId: dtId,
        reason: dtData.reason || "Machine Downtime",
        startTime: dtData.startTime,
        startTimeStr: dtData.startTimeStr,
        endTime: slst.iso,
        endTimeStr: slst.timeString,
        durationMinutes,
        durationSeconds,
        resolvedBy: resolvedByText || "Ended via Web App"
      };
    }
  }

  // Fallback: check if any active downtime exists in the downtime collection
  try {
    const activeSnap = await db.collection("downtime").where("active", "==", true).get();
    if (!activeSnap.empty) {
      let resolvedItem = null;
      for (const doc of activeSnap.docs) {
        const dtData = doc.data();
        const startMs = Number(dtData.startMs) || slst.timestampMs;
        const durationMs = Math.max(0, slst.timestampMs - startMs);
        const durationMinutes = parseFloat((durationMs / 60000).toFixed(2));
        const durationSeconds = Math.round(durationMs / 1000);

        await doc.ref.set(
          {
            active: false,
            endTime: slst.iso,
            endTimeStr: slst.timeString,
            endMs: slst.timestampMs,
            durationMs,
            durationSeconds,
            durationMinutes,
            resolvedBy: resolvedByText || "Ended via Web App",
            resolvedAt: slst.formatted
          },
          { merge: true }
        );

        resolvedItem = {
          downtimeId: doc.id,
          reason: dtData.reason || "Machine Downtime",
          startTime: dtData.startTime,
          startTimeStr: dtData.startTimeStr,
          endTime: slst.iso,
          endTimeStr: slst.timeString,
          durationMinutes,
          durationSeconds,
          resolvedBy: resolvedByText || "Ended via Web App"
        };
      }
      return resolvedItem;
    }
  } catch (err) {
    console.warn("Fallback active downtime query warning:", err);
  }

  return null;
}

/**
 * Unified Cutter Signal & Volume Ingestion Endpoint
 * - The API only posts `1` (`{ "post": 1 }` or `?post=1`).
 * - Whenever `1` is posted, it is counted as 2 cuts (`cutsAdded = 2`).
 * - Time-taken / cycle duration / idle threshold concepts are retired.
 */
app.all(
  [
    "/signal",
    "/api/signal",
    "/post",
    "/api/post",
    "/cut",
    "/api/cut",
    "/arduino",
    "/api/arduino",
    "/edge",
    "/api/edge"
  ],
  async (req, res) => {
    try {
      const params = { ...(req.query || {}), ...(req.body || {}) };
      const postValue = 1;
      const cutsAdded = CUTS_PER_POST; // 1 post = 2 cuts

      const slst = getSLSTDate(params.timestamp || new Date());
      const currentMs = slst.timestampMs;

      const machineRef = db.collection("machines").doc(MACHINE_ID);
      const machineDoc = await machineRef.get();
      const machineData = machineDoc.exists ? machineDoc.data() : {};

      const statusDescription = "Post 1 Signal Logged (+2 Cuts Added)";

      // Write record into Firestore `cuts` collection
      const cutPayload = {
        post: postValue,
        value: postValue,
        cutsAdded: cutsAdded,
        timestamp: slst.iso,
        timestampMs: currentMs,
        timeString: slst.timeString,
        date: slst.dateString,
        hour: slst.hour,
        minute: slst.minute,
        second: slst.second,
        statusDescription,
        jayawardenepuraTime: slst.formatted,
        serverTimestamp: admin.firestore.FieldValue.serverTimestamp()
      };

      const cutRef = await db.collection("cuts").add(cutPayload);
      await db.collection("cutter_logs").doc(cutRef.id).set(cutPayload);

      // Atomically update daily_metrics
      const dailyRef = db.collection("daily_metrics").doc(slst.dateString);
      let updatedTotalCuts = 0;
      let updatedHourlyVolume = 0;
      let updatedTotalSignals = 0;

      await db.runTransaction(async (transaction) => {
        const dDoc = await transaction.get(dailyRef);
        let currentHourly = Array(24).fill(0);
        let currentTotal = 0;
        let currentSignals = 0;

        if (dDoc.exists) {
          const dData = dDoc.data();
          currentTotal = Number(dData.totalCuts) || 0;
          currentSignals = Number(dData.totalSignals || dData.totalCycles) || 0;
          if (Array.isArray(dData.hourlyCuts) && dData.hourlyCuts.length === 24) {
            currentHourly = [...dData.hourlyCuts];
          }
        }

        currentHourly[slst.hour] = (currentHourly[slst.hour] || 0) + cutsAdded;
        currentTotal += cutsAdded;
        currentSignals += 1;

        updatedTotalCuts = currentTotal;
        updatedHourlyVolume = currentHourly[slst.hour];
        updatedTotalSignals = currentSignals;

        transaction.set(
          dailyRef,
          {
            date: slst.dateString,
            machineId: MACHINE_ID,
            totalCuts: currentTotal,
            totalSignals: currentSignals,
            totalCycles: currentSignals,
            hourlyCuts: currentHourly,
            lastPost: postValue,
            lastCutsAdded: cutsAdded,
            lastCutTime: slst.iso,
            lastEntryTime: slst.iso,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      });

      // Keep DOWNTIME status if a downtime is currently active; otherwise RUNNING
      const isCurrentlyInDowntime =
        machineData.status === "DOWNTIME" && !!machineData.currentDowntimeId;

      await machineRef.set(
        {
          machineId: MACHINE_ID,
          machineName: MACHINE_NAME,
          company: COMPANY_NAME,
          sector: SECTOR_NAME,
          status: isCurrentlyInDowntime ? "DOWNTIME" : "RUNNING",
          currentSignalState: postValue,
          lastPost: postValue,
          lastCutsAdded: cutsAdded,
          lastTimestamp: slst.iso,
          lastTimestampMs: currentMs,
          todayCutsCount: updatedTotalCuts,
          todaySignalsCount: updatedTotalSignals,
          lastCutTime: slst.iso,
          lastActivityMs: currentMs,
          lastActivityIso: slst.iso,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      return res.status(200).json({
        ok: 1,
        post: postValue,
        cutsAdded: cutsAdded,
        hourlyVolume: updatedHourlyVolume,
        totalCutsToday: updatedTotalCuts,
        totalSignalsToday: updatedTotalSignals,
        timestamp: slst.iso,
        status: statusDescription,
        id: cutRef.id,
        serverTime: slst.formatted
      });
    } catch (error) {
      console.error("Signal API error:", error);
      return res.status(500).json({ ok: 0, error: error.message });
    }
  }
);

/**
 * POST /api/downtime or /api/downtime/start
 * Creates/starts an active downtime record when a downtime occurs.
 * The same downtime remains active until ended via POST /api/downtime/end.
 */
app.post(
  ["/downtime", "/downtime/start", "/idle", "/api/downtime", "/api/downtime/start", "/api/idle"],
  async (req, res) => {
    try {
      const slst = getSLSTDate(req.body?.startTime || new Date());
      const machineRef = db.collection("machines").doc(MACHINE_ID);
      const machineDoc = await machineRef.get();
      const machineData = machineDoc.exists ? machineDoc.data() : {};

      // Check if there is already an active downtime
      if (machineData.status === "DOWNTIME" && machineData.currentDowntimeId) {
        const existingSnap = await db.collection("downtime").doc(machineData.currentDowntimeId).get();
        if (existingSnap.exists && existingSnap.data().active) {
          const existingData = existingSnap.data();
          return res.status(200).json({
            success: true,
            alreadyActive: true,
            status: "DOWNTIME",
            downtimeId: existingSnap.id,
            downtime: { id: existingSnap.id, ...existingData },
            message: "An active downtime is already in progress. End the current downtime before starting a new one."
          });
        }
      }

      const reason = (req.body?.reason && String(req.body.reason).trim()) || "Machine Downtime";
      const source = req.body?.source || "web";

      const downtimePayload = {
        machineId: MACHINE_ID,
        machineName: MACHINE_NAME,
        active: true,
        reason,
        source,
        startTime: slst.iso,
        startTimeStr: slst.timeString,
        startMs: slst.timestampMs,
        endTime: null,
        endTimeStr: null,
        endMs: null,
        durationSeconds: null,
        durationMinutes: null,
        date: slst.dateString,
        hour: slst.hour,
        jayawardenepuraTime: slst.formatted,
        serverTimestamp: admin.firestore.FieldValue.serverTimestamp()
      };

      const dtRef = await db.collection("downtime").add(downtimePayload);

      const activeDowntimeSummary = {
        id: dtRef.id,
        active: true,
        reason,
        source,
        startTime: slst.iso,
        startTimeStr: slst.timeString,
        startMs: slst.timestampMs,
        date: slst.dateString
      };

      await machineRef.set(
        {
          status: "DOWNTIME",
          currentDowntimeId: dtRef.id,
          activeDowntime: activeDowntimeSummary,
          downtimeStartedAtIso: slst.iso,
          downtimeStartedAtMs: slst.timestampMs,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      return res.status(200).json({
        success: true,
        status: "DOWNTIME",
        downtimeId: dtRef.id,
        downtime: activeDowntimeSummary,
        serverTime: slst.formatted,
        message: "Downtime started and logged."
      });
    } catch (error) {
      console.error("Downtime start error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * POST /api/downtime/end
 * Ends the active downtime that was previously started.
 */
app.post(["/downtime/end", "/api/downtime/end"], async (req, res) => {
  try {
    const customTime = req.body?.endTime || req.body?.timestamp || req.body?.endMs;
    const slst = getSLSTDate(customTime || new Date());
    const machineRef = db.collection("machines").doc(MACHINE_ID);
    const machineDoc = await machineRef.get();
    const machineData = machineDoc.exists ? machineDoc.data() : {};

    const specificDtId = req.body?.downtimeId;
    const resolvedBy = req.body?.resolvedBy || "Ended via Web App";
    const resolved = await resolveActiveDowntimeIfAny(machineData, slst, resolvedBy, specificDtId);

    await machineRef.set(
      {
        status: "RUNNING",
        currentDowntimeId: null,
        activeDowntime: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return res.status(200).json({
      success: true,
      status: "RUNNING",
      downtimeResolved: resolved,
      resolvedAt: slst.formatted,
      resolvedTimeStr: slst.timeString,
      message: resolved
        ? `Downtime ended successfully at ${slst.timeString} (Duration: ${resolved.durationMinutes}m / ${resolved.durationSeconds}s).`
        : `Machine status set to RUNNING at ${slst.timeString}.`
    });
  } catch (error) {
    console.error("Downtime end error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/downtime, /api/downtime/status, /api/downtime/check
 * Monitors and checks whether a downtime has been created (active or logged on the date).
 */
app.get(
  [
    "/downtime",
    "/downtime/status",
    "/downtime/check",
    "/api/downtime",
    "/api/downtime/status",
    "/api/downtime/check"
  ],
  async (req, res) => {
    try {
      const slstNow = getSLSTDate();
      const dateStr = req.query.date || slstNow.dateString;

      const machineDoc = await db.collection("machines").doc(MACHINE_ID).get();
      const machineData = machineDoc.exists ? machineDoc.data() : {};

      const dtSnap = await db
        .collection("downtime")
        .where("date", "==", dateStr)
        .get();

      const downtimes = [];
      dtSnap.forEach((doc) => {
        downtimes.push({ id: doc.id, ...doc.data() });
      });
      downtimes.sort((a, b) => (b.startMs || 0) - (a.startMs || 0));

      // Also check if there's any active downtime across the collection
      let activeDowntime = downtimes.find((d) => d.active === true) || null;
      if (!activeDowntime && machineData.currentDowntimeId) {
        const currentDtDoc = await db.collection("downtime").doc(machineData.currentDowntimeId).get();
        if (currentDtDoc.exists && currentDtDoc.data().active) {
          activeDowntime = { id: currentDtDoc.id, ...currentDtDoc.data() };
        }
      }

      if (activeDowntime && activeDowntime.startMs) {
        const elapsedMs = Math.max(0, slstNow.timestampMs - Number(activeDowntime.startMs));
        activeDowntime = {
          ...activeDowntime,
          elapsedSeconds: Math.round(elapsedMs / 1000),
          elapsedMinutes: parseFloat((elapsedMs / 60000).toFixed(2))
        };
      }

      let totalDowntimeMinutes = 0;
      downtimes.forEach((dt) => {
        if (dt.active && dt.startMs) {
          const elapsedMs = Math.max(0, slstNow.timestampMs - Number(dt.startMs));
          totalDowntimeMinutes += elapsedMs / 60000;
        } else {
          totalDowntimeMinutes += Number(dt.durationMinutes || 0);
        }
      });

      const hasActiveDowntime = !!activeDowntime;

      return res.status(200).json({
        success: true,
        date: dateStr,
        hasActiveDowntime,
        hasDowntimeCreatedToday: downtimes.length > 0,
        machineStatus: hasActiveDowntime ? "DOWNTIME" : "RUNNING",
        activeDowntime,
        totalDowntimesCount: downtimes.length,
        totalDowntimeMinutes: parseFloat(totalDowntimeMinutes.toFixed(2)),
        downtimes,
        serverTimeSLST: slstNow.formatted
      });
    } catch (error) {
      console.error("Downtime check error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/dashboard
 */
app.get(["/dashboard", "/api/dashboard"], async (req, res) => {
  try {
    const slstNow = getSLSTDate();
    const dateStr = req.query.date || slstNow.dateString;
    const machineDoc = await db.collection("machines").doc(MACHINE_ID).get();
    const machineData = machineDoc.exists ? machineDoc.data() : {};
    const metrics = await computeDailyMetrics(dateStr);

    return res.status(200).json({
      success: true,
      machineState: {
        ...machineData,
        cutsPerPost: CUTS_PER_POST,
        currentTimeSLST: slstNow.formatted,
        currentIso: slstNow.iso
      },
      metrics
    });
  } catch (error) {
    console.error("Dashboard endpoint error:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/reports/generate
 * Generates single-page PDF report (Hourly Cuts or Downtime Logs) and stores in Firestore /reports/
 */
app.all(["/reports/generate", "/api/reports/generate"], async (req, res) => {
  try {
    const slstNow = getSLSTDate();
    const yesterdayDate = new Date(slstNow.date.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = getSLSTDate(yesterdayDate).dateString;

    const targetDate = req.body?.date || req.query?.date || yesterdayStr;
    const reportType = req.body?.type || req.query?.type || "hourly";

    const reportRecord = await executeDailyPdfReportPipeline(targetDate, reportType);

    return res.status(200).json({
      success: true,
      message: `${reportRecord.title} generated and saved to Firestore.`,
      report: {
        id: reportRecord.id,
        reportId: reportRecord.reportId,
        date: reportRecord.date,
        reportType: reportRecord.reportType,
        title: reportRecord.title,
        fileName: reportRecord.fileName,
        format: "pdf",
        fileSizeBytes: reportRecord.fileSizeBytes,
        createdAtFormatted: reportRecord.createdAtFormatted,
        metrics: reportRecord.metrics,
        downloadUrl: `https://api-auc2wpy33q-uc.a.run.app/api/reports/download/${reportRecord.id}`
      }
    });
  } catch (error) {
    console.error("Report generate error:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/reports
 * Returns list of all stored PDF reports in Firestore
 */
app.get(["/reports", "/api/reports"], async (req, res) => {
  try {
    const snap = await db.collection("reports").orderBy("createdAt", "desc").limit(100).get();
    const list = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        id: d.id,
        reportId: data.reportId,
        date: data.date,
        reportType: data.reportType || "hourly",
        title: data.title || (data.reportType === "downtime" ? "Downtime Logs Report" : "Hourly Cut Volume Report"),
        fileName: data.fileName,
        format: data.format || "pdf",
        fileSizeBytes: data.fileSizeBytes,
        createdAt: data.createdAt,
        createdAtFormatted: data.createdAtFormatted,
        metrics: data.metrics,
        hasPdfData: !!data.base64Data,
        downloadUrl: `https://api-auc2wpy33q-uc.a.run.app/api/reports/download/${d.id}`
      });
    });
    return res.status(200).json({ success: true, count: list.length, reports: list });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/reports/:id and POST /api/reports/delete/:id
 * Deletes a report from Firestore and Cloud Storage
 */
app.delete(["/reports/:id", "/api/reports/:id"], async (req, res) => {
  try {
    const reportId = req.params.id;
    const result = await deleteReportPipeline(reportId);
    return res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.all(["/reports/delete/:id", "/api/reports/delete/:id"], async (req, res) => {
  try {
    const reportId = req.params.id;
    const result = await deleteReportPipeline(reportId);
    return res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/reports/download/:id
 * Direct binary streaming download / view of stored PDF from Firestore
 */
app.get(["/reports/download/:id", "/api/reports/download/:id"], async (req, res) => {
  try {
    const reportId = req.params.id;
    let reportDoc = null;

    const docRef = db.collection("reports").doc(reportId);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      reportDoc = docSnap.data();
    } else {
      const qSnap = await db.collection("reports").where("reportId", "==", reportId).limit(1).get();
      if (!qSnap.empty) {
        reportDoc = qSnap.docs[0].data();
      }
    }

    if (!reportDoc || !reportDoc.base64Data) {
      return res.status(404).send("Report or PDF data not found in Firestore.");
    }

    const buffer = Buffer.from(reportDoc.base64Data, "base64");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${reportDoc.fileName || "Cutter_Report.pdf"}"`);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/reports/download/file/:fileName
 */
app.get(["/reports/download/file/:fileName", "/api/reports/download/file/:fileName"], async (req, res) => {
  try {
    const fileName = req.params.fileName;
    const qSnap = await db.collection("reports").where("fileName", "==", fileName).limit(1).get();
    if (!qSnap.empty && qSnap.docs[0].data().base64Data) {
      const reportDoc = qSnap.docs[0].data();
      const buffer = Buffer.from(reportDoc.base64Data, "base64");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      return res.send(buffer);
    }
    return res.status(404).send("File not found.");
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/archive/rotate
 */
app.post(["/archive/rotate", "/api/archive/rotate"], async (req, res) => {
  try {
    const slstNow = getSLSTDate();
    const yesterdayDate = new Date(slstNow.date.getTime() - 24 * 60 * 60 * 1000);
    const targetDate = req.body?.date || req.query?.date || getSLSTDate(yesterdayDate).dateString;

    const hourlyRep = await executeDailyPdfReportPipeline(targetDate, "hourly");
    const dtRep = await executeDailyPdfReportPipeline(targetDate, "downtime");
    const rotation = await archiveAndRotateDailyData(targetDate);

    return res.status(200).json({
      success: true,
      message: `PDF Reports for ${targetDate} saved to Firebase Storage & Firestore. Data rotated to archive lists.`,
      hourlyReportId: hourlyRep.id,
      downtimeReportId: dtRep.id,
      rotation
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/archive/cleanup
 */
app.post(["/archive/cleanup", "/api/archive/cleanup"], async (req, res) => {
  try {
    const result = await purgeOldArchiveDataWithoutEliminatingPreviousDay();
    return res.status(200).json({
      success: true,
      message: `Archive cleanup executed. Previous day (${result.protectedPreviousDay}) preserved.`,
      result
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/archive/status
 */
app.get(["/archive/status", "/api/archive/status"], async (req, res) => {
  try {
    const cutsSnap = await db.collection("cuts").count().get();
    const archiveCutsSnap = await db.collection("cuts_archive").count().get();
    const dtSnap = await db.collection("downtime").count().get();
    const archiveDtSnap = await db.collection("downtime_archive").count().get();
    const reportsSnap = await db.collection("reports").count().get();

    return res.status(200).json({
      success: true,
      activeCutsCount: cutsSnap.data().count,
      archivedCutsCount: archiveCutsSnap.data().count,
      activeDowntimesCount: dtSnap.data().count,
      archivedDowntimesCount: archiveDtSnap.data().count,
      totalStoredReports: reportsSnap.data().count,
      serverTimeSLST: getSLSTDate().formatted
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/purge-all
 */
app.post(["/admin/purge-all", "/api/admin/purge-all"], async (req, res) => {
  try {
    const collectionsToPurge = [
      "cuts",
      "cutter_logs",
      "downtime",
      "cuts_archive",
      "downtime_archive",
      "daily_metrics",
      "reports",
      "audit_logs",
      "email_reports"
    ];

    const results = {};
    for (const colName of collectionsToPurge) {
      const snap = await db.collection(colName).get();
      let count = 0;
      if (!snap.empty) {
        const batchSize = 400;
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += batchSize) {
          const chunk = docs.slice(i, i + batchSize);
          const batch = db.batch();
          chunk.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          count += chunk.length;
        }
      }
      results[colName] = count;
    }

    let storageDeleted = 0;
    const bucketCandidates = [
      process.env.FIREBASE_STORAGE_BUCKET,
      "msc-mobile-computing-project.firebasestorage.app",
      "msc-mobile-computing-project.appspot.com"
    ].filter(Boolean);

    for (const bName of bucketCandidates) {
      try {
        const bucket = admin.storage().bucket(bName);
        const [files] = await bucket.getFiles({ prefix: "reports/" });
        for (const f of files) {
          await f.delete();
          storageDeleted++;
        }
      } catch (e) { }
    }
    results.storageFilesDeleted = storageDeleted;

    await db.collection("machines").doc(MACHINE_ID).set({
      machineId: MACHINE_ID,
      machineName: MACHINE_NAME,
      company: COMPANY_NAME,
      sector: SECTOR_NAME,
      status: "RUNNING",
      currentSignalState: 1,
      todayCutsCount: 0,
      todaySignalsCount: 0,
      lastTimestampMs: null,
      lastTimestamp: null,
      lastPost: null,
      lastCutTime: null,
      currentDowntimeId: null,
      activeDowntime: null,
      updatedAt: new Date().toISOString()
    });
    results.machineReset = true;

    return res.status(200).json({
      success: true,
      message: "All collections and storage files successfully purged. Machine reset to operational baseline.",
      details: results
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Export Express API as Cloud Function
exports.api = onRequest({ cors: true }, app);

/**
 * Scheduled Cloud Function running every day at 12:00 AM (00:00) Asia/Colombo Time
 */
exports.dailyMidnightReportScheduler = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "Asia/Colombo"
  },
  async () => {
    try {
      const slstNow = getSLSTDate();
      const yesterdayDate = new Date(slstNow.date.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = getSLSTDate(yesterdayDate).dateString;

      await executeDailyPdfReportPipeline(yesterdayStr, "hourly");
      await executeDailyPdfReportPipeline(yesterdayStr, "downtime");
      await archiveAndRotateDailyData(yesterdayStr);
      return null;
    } catch (err) {
      console.error("Scheduled midnight report & archive rotation failed:", err);
      throw err;
    }
  }
);

/**
 * Scheduled Cloud Function running every Monday at 2:00 AM (02:00) Asia/Colombo Time
 */
exports.weeklyMondayArchiveCleanupScheduler = onSchedule(
  {
    schedule: "0 2 * * 1",
    timeZone: "Asia/Colombo"
  },
  async () => {
    try {
      await purgeOldArchiveDataWithoutEliminatingPreviousDay();
      return null;
    } catch (err) {
      console.error("Monday 2am archive cleanup failed:", err);
      throw err;
    }
  }
);
