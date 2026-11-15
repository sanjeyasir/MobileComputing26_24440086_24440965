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
import { db } from "./firebaseConfig";
import { getSLSTDate } from "../utils/timeZoneUtils";

/**
 * API Service for Toyo Cushion Lanka Rubberised Coir Fleece Cutting Machine
 * Simplified Volume (Post 1 = 2 Cuts) & Downtime Architecture
 */
export const API_BASE_URL = "https://api-auc2wpy33q-uc.a.run.app";
export const MACHINE_ID = "rubberised_coir_cutter";
export const CUTS_PER_POST = 2; // Every post of 1 counts as 2 cuts

/**
 * Fetch Service Health
 */
export async function fetchServiceHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
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

    // Ensure Firestore doc has cutsAdded = 2 even if an older Cloud Function instance handled it
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
 */
export async function postDowntimeStart(reason = "Machine Downtime", source = "mobile") {
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
 */
export async function postDowntimeEnd(payload = {}) {
  const slst = getSLSTDate();
  const specificId = payload?.downtimeId || null;
  const resolvedBy = payload?.resolvedBy || "Ended via App";

  try {
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
      // Handled by Firestore update above
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
    // Fallback to direct Firestore check below
  }

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
  try {
    const url = dateStr
      ? `${API_BASE_URL}/api/dashboard?date=${encodeURIComponent(dateStr)}`
      : `${API_BASE_URL}/api/dashboard`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

/**
 * Generate PDF Report and Store in Firestore / Storage
 * @param {string} dateStr - Target date (YYYY-MM-DD)
 * @param {"hourly"|"downtime"} type - Report type
 */
export async function generatePdfReport(dateStr, type = "hourly") {
  const res = await fetch(`${API_BASE_URL}/api/reports/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: dateStr, type })
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || `Failed to generate PDF report (${res.status})`);
  }
  return data;
}

/**
 * Legacy alias for backwards compatibility
 */
export async function generateAndStoreExcelReport(dateStr, type = "hourly") {
  return await generatePdfReport(dateStr, type);
}

/**
 * Delete Stored PDF Report from Firestore & Cloud Storage
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
    console.warn("Delete API error, trying direct Firestore:", err);
  }

  // Direct Firestore fallback
  try {
    const { deleteDoc, doc: fsDoc } = await import("firebase/firestore");
    await deleteDoc(fsDoc(db, "reports", reportId));
    return { success: true, message: `Report ${reportId} deleted directly from Firestore.` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Fetch All Stored Reports in Firestore
 */
export async function fetchStoredReports() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/reports`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
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
