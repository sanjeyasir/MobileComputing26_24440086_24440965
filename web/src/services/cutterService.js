import {
  doc,
  collection,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  query,
  where
} from "firebase/firestore";
import { db } from "./firebase/config";

export const API_BASE_URL = "https://api-auc2wpy33q-uc.a.run.app";
export const MACHINE_ID = "rubberised_coir_cutter";
export const CUTS_PER_POST = 2; // Every post of 1 counts as 2 cuts

/**
 * Utility to calculate Sri Lanka Standard Time (Asia/Colombo UTC+05:30)
 */
export function getSLSTDate(inputDate = new Date()) {
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

  return {
    date: slstDate,
    dateString: `${yyyy}-${mm}-${dd}`,
    timeString: `${hh}:${min}:${ss}`,
    iso: `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+05:30`,
    formatted: `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} (+05:30 SLST)`,
    hour: slstDate.getHours(),
    minute: slstDate.getMinutes(),
    second: slstDate.getSeconds(),
    timestampMs: validDate.getTime()
  };
}

export function formatDuration(totalMinutes) {
  if (totalMinutes === undefined || totalMinutes === null || isNaN(totalMinutes)) {
    return "0m";
  }
  const totalSec = Math.round(Number(totalMinutes) * 60);
  if (totalSec < 60 && totalSec > 0) {
    return `${totalSec}s`;
  }
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) {
    return secs > 0 ? `${m}m ${secs}s` : `${m}m`;
  }
  return `${h}h ${m}m`;
}

/**
 * Primary Cut Signal API:
 * - Only posts 1 (`{ post: 1 }`)
 * - Every post of 1 is counted as 2 cuts (`cutsAdded = 2`)
 */
export async function postCutterSignal(extra = {}) {
  const slst = getSLSTDate();
  try {
    const res = await fetch(`${API_BASE_URL}/api/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post: 1, cutsAdded: CUTS_PER_POST, ...extra })
    });
    const data = await res.json();

    // Ensure the Firestore document stores cutsAdded = 2 even if an older Cloud Function instance handled it
    if (data && data.id && Number(data.cutsAdded) !== CUTS_PER_POST) {
      await setDoc(
        doc(db, "cuts", data.id),
        {
          post: 1,
          value: 1,
          cutsAdded: CUTS_PER_POST,
          statusDescription: "Post 1 Signal Logged (+2 Cuts Added)"
        },
        { merge: true }
      );
      data.cutsAdded = CUTS_PER_POST;
    }

    return data;
  } catch (err) {
    console.warn("API signal fallback to direct Firestore:", err);
    const cutPayload = {
      post: 1,
      value: 1,
      cutsAdded: CUTS_PER_POST,
      timestamp: slst.iso,
      timestampMs: slst.timestampMs,
      timeString: slst.timeString,
      date: slst.dateString,
      hour: slst.hour,
      minute: slst.minute,
      second: slst.second,
      statusDescription: "Post 1 Signal Logged (+2 Cuts Added)",
      jayawardenepuraTime: slst.formatted
    };
    const cutRef = await addDoc(collection(db, "cuts"), cutPayload);
    await setDoc(
      doc(db, "machines", MACHINE_ID),
      {
        lastPost: 1,
        lastCutsAdded: CUTS_PER_POST,
        lastTimestamp: slst.iso,
        lastTimestampMs: slst.timestampMs,
        lastCutTime: slst.iso
      },
      { merge: true }
    );
    return {
      ok: 1,
      post: 1,
      cutsAdded: CUTS_PER_POST,
      timestamp: slst.iso,
      id: cutRef.id,
      serverTime: slst.formatted
    };
  }
}

/**
 * Start / Create a Downtime (`POST /api/downtime/start`)
 * Creates an active downtime record (`active: true`) and marks machine status as DOWNTIME
 * until ended via `postDowntimeEnd`.
 */
export async function postDowntimeStart(reason = "Machine Downtime", source = "web") {
  const slst = getSLSTDate();
  const cleanReason = (reason && String(reason).trim()) || "Machine Downtime";

  try {
    const res = await fetch(`${API_BASE_URL}/api/downtime/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: cleanReason,
        source,
        startTime: slst.iso
      })
    });
    const data = await res.json();
    const dtId = data?.downtimeId || data?.downtime?.id;

    if (dtId) {
      // Ensure accurate start time and metadata in Firestore
      const dtSummary = {
        id: dtId,
        machineId: MACHINE_ID,
        active: true,
        reason: cleanReason,
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
        jayawardenepuraTime: slst.formatted
      };
      await setDoc(doc(db, "downtime", dtId), dtSummary, { merge: true });
      await setDoc(
        doc(db, "machines", MACHINE_ID),
        {
          status: "DOWNTIME",
          currentDowntimeId: dtId,
          activeDowntime: dtSummary
        },
        { merge: true }
      );
      return {
        success: true,
        status: "DOWNTIME",
        downtimeId: dtId,
        downtime: dtSummary,
        serverTime: slst.formatted
      };
    }
  } catch (err) {
    console.warn("postDowntimeStart API fallback to Firestore:", err);
  }

  // Fallback direct creation in Firestore
  const dtPayload = {
    machineId: MACHINE_ID,
    active: true,
    reason: cleanReason,
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
    jayawardenepuraTime: slst.formatted
  };
  const dtRef = await addDoc(collection(db, "downtime"), dtPayload);
  const dtSummary = { id: dtRef.id, ...dtPayload };
  await setDoc(
    doc(db, "machines", MACHINE_ID),
    {
      status: "DOWNTIME",
      currentDowntimeId: dtRef.id,
      activeDowntime: dtSummary
    },
    { merge: true }
  );

  return {
    success: true,
    status: "DOWNTIME",
    downtimeId: dtRef.id,
    downtime: dtSummary,
    serverTime: slst.formatted
  };
}

/**
 * End / Resolve the Active Downtime (`POST /api/downtime/end`)
 * Ends the same downtime that was created, calculates duration, and sets machine back to RUNNING.
 */
export async function postDowntimeEnd(payload = {}) {
  const slst = getSLSTDate();
  const specificId = payload?.downtimeId || null;
  const resolvedBy = payload?.resolvedBy || "Ended via Web App";

  try {
    // Resolve directly in Firestore as well so UI updates instantaneously
    const qActive = query(collection(db, "downtime"), where("active", "==", true));
    const snap = await getDocs(qActive);
    let resolvedRecord = null;

    for (const d of snap.docs) {
      if (specificId && d.id !== specificId) continue;
      const dtData = d.data();
      const startMs = Number(dtData.startMs) || slst.timestampMs;
      const durationMs = Math.max(0, slst.timestampMs - startMs);
      const durationSeconds = Math.round(durationMs / 1000);
      const durationMinutes = parseFloat((durationMs / 60000).toFixed(2));

      await setDoc(
        doc(db, "downtime", d.id),
        {
          active: false,
          endTime: slst.iso,
          endTimeStr: slst.timeString,
          endMs: slst.timestampMs,
          durationMs,
          durationSeconds,
          durationMinutes,
          resolvedBy,
          resolvedAt: slst.formatted
        },
        { merge: true }
      );

      resolvedRecord = {
        downtimeId: d.id,
        reason: dtData.reason || "Machine Downtime",
        startTimeStr: dtData.startTimeStr,
        endTimeStr: slst.timeString,
        durationSeconds,
        durationMinutes
      };
    }

    await setDoc(
      doc(db, "machines", MACHINE_ID),
      {
        status: "RUNNING",
        currentDowntimeId: null,
        activeDowntime: null
      },
      { merge: true }
    );

    // Also notify the backend API
    try {
      const res = await fetch(`${API_BASE_URL}/api/downtime/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          downtimeId: specificId,
          resolvedBy,
          endTime: slst.iso
        })
      });
      if (res.ok) {
        const apiData = await res.json();
        return {
          ...apiData,
          downtimeResolved: apiData.downtimeResolved || resolvedRecord
        };
      }
    } catch (apiErr) {
      console.warn("API /api/downtime/end notice:", apiErr);
    }

    return {
      success: true,
      status: "RUNNING",
      downtimeResolved: resolvedRecord,
      resolvedAt: slst.formatted,
      resolvedTimeStr: slst.timeString
    };
  } catch (err) {
    console.error("postDowntimeEnd error:", err);
    throw err;
  }
}

/**
 * Monitor / GET and Check if a Downtime Has Been Created (`GET /api/downtime/status`)
 */
export async function checkDowntimeStatus(dateStr) {
  const slstNow = getSLSTDate();
  const targetDate = dateStr || slstNow.dateString;

  try {
    const res = await fetch(`${API_BASE_URL}/api/downtime/status?date=${encodeURIComponent(targetDate)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.hasActiveDowntime === "boolean") {
        return data;
      }
    }
  } catch (apiErr) {
    // Fallback to Firestore check below
  }

  // Direct Firestore check (ensures instant reliability even before Cloud Function redeploy)
  const qDate = query(collection(db, "downtime"), where("date", "==", targetDate));
  const snap = await getDocs(qDate);
  const downtimes = [];
  snap.forEach((d) => downtimes.push({ id: d.id, ...d.data() }));
  downtimes.sort((a, b) => (b.startMs || 0) - (a.startMs || 0));

  let activeDowntime = downtimes.find((d) => d.active === true) || null;
  if (!activeDowntime) {
    const machineSnap = await getDoc(doc(db, "machines", MACHINE_ID));
    if (machineSnap.exists()) {
      const mData = machineSnap.data();
      if (mData.activeDowntime && mData.activeDowntime.active) {
        activeDowntime = mData.activeDowntime;
      }
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
      totalDowntimeMinutes += Math.max(0, slstNow.timestampMs - Number(dt.startMs)) / 60000;
    } else {
      totalDowntimeMinutes += Number(dt.durationMinutes || 0);
    }
  });

  return {
    success: true,
    endpoint: "/api/downtime/status",
    date: targetDate,
    hasActiveDowntime: !!activeDowntime,
    hasDowntimeCreatedToday: downtimes.length > 0,
    machineStatus: activeDowntime ? "DOWNTIME" : "RUNNING",
    activeDowntime,
    totalDowntimesCount: downtimes.length,
    totalDowntimeMinutes: parseFloat(totalDowntimeMinutes.toFixed(2)),
    downtimes,
    serverTimeSLST: slstNow.formatted
  };
}

/**
 * Generate PDF Report (with API + Client-Side jsPDF Fallback) and Store in Firestore
 * @param {string} dateStr - Target date (YYYY-MM-DD)
 * @param {"hourly"|"downtime"} type - Report type
 */
export async function generatePdfReport(dateStr, type = "hourly") {
  const cleanType = String(type).toLowerCase() === "downtime" ? "downtime" : "hourly";
  const slstTime = getSLSTDate();

  try {
    const res = await fetch(`${API_BASE_URL}/api/reports/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dateStr, type: cleanType })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) return data;
    }
  } catch (err) {
    console.warn("API report generation fallback to client-side jsPDF:", err.message);
  }

  // Client-side jsPDF fallback
  const metrics = await computeClientDailyMetrics(dateStr);
  const dataUri =
    cleanType === "downtime"
      ? await generateClientDowntimePdf(metrics, slstTime)
      : await generateClientHourlyPdf(metrics, slstTime);

  const base64Data = dataUri.replace(/^data:application\/pdf;filename=generated\.pdf;base64,/, "").replace(/^data:application\/pdf;base64,/, "");
  const fileName =
    cleanType === "downtime"
      ? `ToyoCushion_DowntimeLogs_${dateStr}_${slstTime.fileStamp}.pdf`
      : `ToyoCushion_HourlyCuts_${dateStr}_${slstTime.fileStamp}.pdf`;
  const title =
    cleanType === "downtime"
      ? `Downtime Logs Report (${dateStr})`
      : `Hourly Cut Volume Report (${dateStr})`;

  const reportDoc = {
    reportId: `REP-${cleanType.toUpperCase()}-${dateStr}-${slstTime.fileStamp}`,
    date: dateStr,
    reportType: cleanType,
    title,
    fileName,
    format: "pdf",
    machineId: MACHINE_ID,
    machineName: "Rubberised Coir Fleece Cutting machine",
    company: "Toyo Cushion Lanka",
    sector: "Hayleys Eco Solutions Sector",
    createdAt: slstTime.iso,
    createdAtFormatted: slstTime.formatted,
    storageStatus: "SAVED_IN_FIRESTORE",
    metrics: {
      totalCuts: metrics.totalCuts,
      totalSignals: metrics.totalSignals,
      totalDowntimeMinutes: metrics.totalDowntimeMinutes,
      downtimeIncidentsCount: metrics.downtimeIncidentsCount
    },
    base64Data,
    fileSizeBytes: Math.round((base64Data.length * 3) / 4)
  };

  const docRef = await addDoc(collection(db, "reports"), reportDoc);
  return {
    success: true,
    message: `${title} generated and saved to Firestore.`,
    report: { id: docRef.id, ...reportDoc }
  };
}

/**
 * Compute daily metrics from Firestore for client-side PDF generation
 */
async function computeClientDailyMetrics(targetDate) {
  const cutsQ = query(collection(db, "cuts"), where("date", "==", targetDate));
  const cutsSnap = await getDocs(cutsQ);
  const cuts = [];
  cutsSnap.forEach((d) => cuts.push({ id: d.id, ...d.data() }));

  const dtQ = query(collection(db, "downtime"), where("date", "==", targetDate));
  const dtSnap = await getDocs(dtQ);
  const downtimes = [];
  dtSnap.forEach((d) => downtimes.push({ id: d.id, ...d.data() }));
  downtimes.sort((a, b) => (b.startMs || 0) - (a.startMs || 0));

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

  const slstNow = getSLSTDate();
  let totalDowntimeMinutes = 0;
  let activeDowntime = null;

  downtimes.forEach((dt) => {
    if (dt.active) {
      if (!activeDowntime) activeDowntime = dt;
      if (dt.startMs) {
        totalDowntimeMinutes += Math.max(0, slstNow.timestampMs - Number(dt.startMs)) / 60000;
      }
    } else {
      totalDowntimeMinutes += Number(dt.durationMinutes || 0);
    }
  });

  return {
    date: targetDate,
    totalCuts,
    totalSignals: cuts.length,
    hourlyCuts,
    hourlySignals,
    totalDowntimeMinutes: parseFloat(totalDowntimeMinutes.toFixed(2)),
    downtimeIncidentsCount: downtimes.length,
    hasActiveDowntime: !!activeDowntime,
    activeDowntime,
    downtimesList: downtimes
  };
}

/**
 * Client-Side 1-Page PDF Generator for Hourly Cuts Report using jsPDF
 */
async function generateClientHourlyPdf(metrics, slstTime) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ format: "a4", unit: "pt" });

  let peakHour = 0;
  let peakCount = 0;
  metrics.hourlyCuts.forEach((cnt, h) => {
    if (cnt > peakCount) {
      peakCount = cnt;
      peakHour = h;
    }
  });

  // Header banner (595.28 pt width)
  doc.setFillColor(6, 78, 59); // #064e3b
  doc.rect(32, 32, 531, 54, "F");

  doc.setTextColor(251, 191, 36); // #fbbf24
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("TOYO CUSHION LANKA (PVT) LTD • HAYLEYS ECO SOLUTIONS", 44, 48);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("HOURLY CUT VOLUME REPORT", 44, 68);

  // Meta row
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text(`Machine: Rubberised Coir Fleece Cutting machine`, 32, 102);

  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Report Date: ${metrics.date}  |  Generated (SLST): ${slstTime.formatted}  |  Counting Rule: 1 Post = 2 Cuts`,
    32,
    114
  );

  // 3 KPI Summary Cards
  const kpiY = 126;
  const boxW = 171;

  // Box 1: Total Volume
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.rect(32, kpiY, boxW, 42, "FD");
  doc.setTextColor(6, 95, 70);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL CUT VOLUME", 42, kpiY + 12);
  doc.setFontSize(15);
  doc.text(`${metrics.totalCuts.toLocaleString()} Cuts`, 42, kpiY + 30);

  // Box 2: Peak Hour
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(191, 219, 254);
  doc.rect(212, kpiY, boxW, 42, "FD");
  doc.setTextColor(30, 64, 175);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("PEAK PRODUCTION HOUR", 222, kpiY + 12);
  doc.setFontSize(10.5);
  doc.text(
    peakCount > 0 ? `${String(peakHour).padStart(2, "0")}:00 - ${String((peakHour + 1) % 24).padStart(2, "0")}:00 (${peakCount} cuts)` : "No cuts recorded",
    222,
    kpiY + 30
  );

  // Box 3: Machine Status
  doc.setFillColor(metrics.hasActiveDowntime ? 254 : 240, metrics.hasActiveDowntime ? 242 : 253, metrics.hasActiveDowntime ? 242 : 244);
  doc.setDrawColor(metrics.hasActiveDowntime ? 248 : 134, metrics.hasActiveDowntime ? 113 : 239, metrics.hasActiveDowntime ? 113 : 172);
  doc.rect(392, kpiY, boxW, 42, "FD");
  doc.setTextColor(metrics.hasActiveDowntime ? 220 : 22, metrics.hasActiveDowntime ? 38 : 101, metrics.hasActiveDowntime ? 38 : 52);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("MACHINE STATUS", 402, kpiY + 12);
  doc.setFontSize(11.5);
  doc.text(metrics.hasActiveDowntime ? "⚠️ DOWNTIME ACTIVE" : "✓ MACHINE RUNNING", 402, kpiY + 30);

  // 24 Hour Table (Strictly: Hour Window and Count of Cuts)
  const tableTop = 178;
  const rowH = 22.5;

  doc.setFillColor(30, 41, 59);
  doc.rect(32, tableTop, 531, 20, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("HOUR WINDOW (SLST)", 50, tableTop + 13);
  doc.text("COUNT OF CUTS PER HOUR", 320, tableTop + 13);

  let cy = tableTop + 20;
  for (let h = 0; h < 24; h++) {
    const cuts = metrics.hourlyCuts[h] || 0;
    const isAlt = h % 2 === 1;
    const isPeak = cuts > 0 && cuts === peakCount;

    if (isPeak) {
      doc.setFillColor(209, 250, 229);
    } else if (cuts > 0) {
      doc.setFillColor(isAlt ? 236 : 255, isAlt ? 253 : 255, isAlt ? 245 : 255);
    } else {
      doc.setFillColor(isAlt ? 248 : 255, isAlt ? 250 : 255, isAlt ? 252 : 255);
    }
    doc.rect(32, cy, 531, rowH, "F");

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(`${String(h).padStart(2, "0")}:00 - ${String((h + 1) % 24).padStart(2, "0")}:00`, 50, cy + 14);

    if (cuts > 0) {
      doc.setTextColor(4, 120, 87);
      doc.setFont("helvetica", "bold");
      doc.text(`${cuts} Cuts ${isPeak ? "★ (Peak Hour)" : ""}`, 320, cy + 14);
    } else {
      doc.setTextColor(148, 163, 184);
      doc.setFont("helvetica", "normal");
      doc.text("0 Cuts", 320, cy + 14);
    }

    cy += rowH;
  }

  doc.setDrawColor(203, 213, 225);
  doc.rect(32, tableTop, 531, 20 + 24 * rowH, "S");

  // Single-page Footer
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text(
    "Toyo Cushion Lanka (Pvt) Ltd • Hayleys Eco Solutions Sector • MSc Mobile Computing Project Telemetry Engine",
    297.64,
    794,
    { align: "center" }
  );

  return doc.output("datauristring");
}

/**
 * Client-Side 1-Page PDF Generator for Downtime Logs Report using jsPDF
 */
async function generateClientDowntimePdf(metrics, slstTime) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ format: "a4", unit: "pt" });
  const downtimes = metrics.downtimesList || [];

  // Header banner
  doc.setFillColor(127, 29, 29); // #7f1d1d
  doc.rect(32, 32, 531, 54, "F");

  doc.setTextColor(253, 230, 138); // #fde68a
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("TOYO CUSHION LANKA (PVT) LTD • HAYLEYS ECO SOLUTIONS", 44, 48);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("MACHINE DOWNTIME INCIDENTS & LOGS REPORT", 44, 68);

  // Meta row
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text(`Machine: Rubberised Coir Fleece Cutting machine`, 32, 102);

  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Report Date: ${metrics.date}  |  Generated (SLST): ${slstTime.formatted}  |  Total Incidents: ${downtimes.length}`,
    32,
    114
  );

  // 3 Summary KPI Cards
  const kpiY = 126;
  const boxW = 171;

  // Box 1: Total Downtime Duration
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(252, 165, 165);
  doc.rect(32, kpiY, boxW, 44, "FD");
  doc.setTextColor(153, 27, 27);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL DOWNTIME DURATION", 40, kpiY + 12);
  doc.setFontSize(14);
  doc.text(`${metrics.totalDowntimeMinutes || 0} minutes`, 40, kpiY + 31);

  // Box 2: Total Stoppages
  doc.setFillColor(255, 251, 235);
  doc.setDrawColor(253, 230, 138);
  doc.rect(212, kpiY, boxW, 44, "FD");
  doc.setTextColor(146, 64, 14);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL STOPPAGE INCIDENTS", 220, kpiY + 12);
  doc.setFontSize(14);
  doc.text(`${downtimes.length} incidents`, 220, kpiY + 31);

  // Box 3: Active Status
  doc.setFillColor(
    metrics.hasActiveDowntime ? 254 : 240,
    metrics.hasActiveDowntime ? 242 : 253,
    metrics.hasActiveDowntime ? 242 : 244
  );
  doc.setDrawColor(
    metrics.hasActiveDowntime ? 248 : 134,
    metrics.hasActiveDowntime ? 113 : 239,
    metrics.hasActiveDowntime ? 113 : 172
  );
  doc.rect(392, kpiY, boxW, 44, "FD");
  doc.setTextColor(
    metrics.hasActiveDowntime ? 220 : 22,
    metrics.hasActiveDowntime ? 38 : 101,
    metrics.hasActiveDowntime ? 38 : 52
  );
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("ACTIVE MACHINE STATUS", 400, kpiY + 12);
  doc.setFontSize(11.5);
  doc.text(metrics.hasActiveDowntime ? "⚠️ ACTIVE STOPPAGE" : "✓ ALL RESOLVED / NORMAL", 400, kpiY + 31);

  // Downtime Table
  const tableTop = 182;
  doc.setFillColor(30, 41, 59);
  doc.rect(32, tableTop, 531, 20, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("#", 38, tableTop + 13);
  doc.text("REASON / DESCRIPTION", 56, tableTop + 13);
  doc.text("START TIME (SLST)", 220, tableTop + 13);
  doc.text("END TIME (SLST)", 320, tableTop + 13);
  doc.text("DURATION", 415, tableTop + 13);
  doc.text("STATUS", 480, tableTop + 13);

  let cy = tableTop + 20;

  if (downtimes.length === 0) {
    doc.setFillColor(248, 250, 252);
    doc.rect(32, cy, 531, 80, "F");
    doc.setTextColor(21, 128, 61);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("✓ No downtime incidents recorded on this date.", 297.64, cy + 34, { align: "center" });
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(
      "The Rubberised Coir Cutting Machine operated without any recorded stoppages.",
      297.64,
      cy + 52,
      { align: "center" }
    );
    cy += 80;
  } else {
    const visibleDts = downtimes.slice(0, 24);
    const rowH = visibleDts.length > 15 ? 20 : 24;

    visibleDts.forEach((dt, idx) => {
      const isAlt = idx % 2 === 1;
      if (dt.active) {
        doc.setFillColor(254, 226, 226);
      } else {
        doc.setFillColor(isAlt ? 248 : 255, isAlt ? 250 : 255, isAlt ? 252 : 255);
      }
      doc.rect(32, cy, 531, rowH, "F");

      doc.setTextColor(71, 85, 105);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.text(String(idx + 1), 38, cy + 14);

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      const reasonTxt = String(dt.reason || "Machine Downtime").substring(0, 28);
      doc.text(reasonTxt, 56, cy + 14);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.text(String(dt.startTimeStr || dt.startTime || "—").substring(0, 16), 220, cy + 14);
      doc.text(
        dt.active ? "Ongoing..." : String(dt.endTimeStr || dt.endTime || "—").substring(0, 16),
        320,
        cy + 14
      );

      const durText = dt.active
        ? "Active"
        : dt.durationSeconds !== undefined && dt.durationSeconds !== null
        ? `${dt.durationSeconds}s`
        : `${dt.durationMinutes || 0}m`;
      doc.setTextColor(180, 83, 9);
      doc.setFont("helvetica", "bold");
      doc.text(durText, 415, cy + 14);

      if (dt.active) {
        doc.setTextColor(220, 38, 38);
        doc.text("ACTIVE", 480, cy + 14);
      } else {
        doc.setTextColor(22, 163, 74);
        doc.text("ENDED", 480, cy + 14);
      }

      cy += rowH;
    });
    doc.setDrawColor(203, 213, 225);
    doc.rect(32, tableTop, 531, cy - tableTop, "S");
  }

  // Single-page Footer
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text(
    "Toyo Cushion Lanka (Pvt) Ltd • Hayleys Eco Solutions Sector • MSc Mobile Computing Project Telemetry Engine",
    297.64,
    794,
    { align: "center" }
  );

  return doc.output("datauristring");
}

/**
 * Legacy alias for backwards compatibility
 */
export async function generateAndStoreExcelReport(dateStr, type = "hourly") {
  return await generatePdfReport(dateStr, type);
}

/**
 * Delete Stored PDF Report across Firestore & Cloud Storage
 */
export async function deleteStoredReport(reportId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/reports/${encodeURIComponent(reportId)}`, {
      method: "DELETE"
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Delete API fallback to direct Firestore:", err);
  }

  // Direct Firestore delete fallback
  try {
    const { deleteDoc, doc: fsDoc } = await import("firebase/firestore");
    await deleteDoc(fsDoc(db, "reports", reportId));
    return { success: true, message: `Report ${reportId} deleted from Firestore.` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Fetch All Stored Reports in Firestore
 */
export async function fetchStoredReports() {
  const res = await fetch(`${API_BASE_URL}/api/reports`);
  return await res.json();
}

/**
 * Download URL by Report ID
 */
export function getReportDownloadUrl(reportId) {
  return `${API_BASE_URL}/api/reports/download/${reportId}`;
}

/**
 * Latest Report Download URL
 */
export function getLatestReportDownloadUrl() {
  return `${API_BASE_URL}/api/reports/download/latest`;
}

/**
 * Fetch Current Date & Time from API (`GET /api/date`)
 */
export async function fetchCurrentDate() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/date`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // Fallback to local SLST calculation
  }
  const slst = getSLSTDate();
  return {
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
  };
}

/**
 * Fetch Day-to-Day Dashboard Data
 */
export async function fetchDashboardData(dateStr) {
  const url = dateStr
    ? `${API_BASE_URL}/api/dashboard?date=${encodeURIComponent(dateStr)}`
    : `${API_BASE_URL}/api/dashboard`;
  const res = await fetch(url);
  return await res.json();
}
