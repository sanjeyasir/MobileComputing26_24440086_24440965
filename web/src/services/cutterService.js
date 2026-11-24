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
export const CUTS_PER_POST = 1; // 1 post = 1 cut (captured on an hourly basis, not multiplied by two)

export const SUPPORTED_MACHINES = [
  {
    machineId: "rubberised_coir_cutter",
    machineName: "Rubberised Coir Fleece Cutting Machine #1",
    company: "Toyo Cushion Lanka",
    sector: "Hayleys Eco Solutions Sector",
    defaultMeterCount: 2.50,
    defaultOrderNumber: ""
  },
  {
    machineId: "coir_fleece_cutter_02",
    machineName: "Rubberised Coir Fleece Cutting Machine #2",
    company: "Toyo Cushion Lanka",
    sector: "Hayleys Eco Solutions Sector",
    defaultMeterCount: 2.00,
    defaultOrderNumber: ""
  },
  {
    machineId: "rotary_edge_trimmer",
    machineName: "Rotary Fleece Edge Trimming Machine",
    company: "Toyo Cushion Lanka",
    sector: "Hayleys Eco Solutions Sector",
    defaultMeterCount: 1.50,
    defaultOrderNumber: ""
  }
];

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
 * - Count is captured on an hourly basis (1 post = 1 cut, not multiplied by two)
 */
export async function postCutterSignal(extra = {}) {
  const slst = getSLSTDate();
  const targetMachineId = extra.machineId || MACHINE_ID;
  try {
    const res = await fetch(`${API_BASE_URL}/api/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post: 1, cutsAdded: CUTS_PER_POST, machineId: targetMachineId, ...extra })
    });
    const data = await res.json();

    if (data && data.id && Number(data.cutsAdded) !== CUTS_PER_POST) {
      await setDoc(
        doc(db, "cuts", data.id),
        {
          post: 1,
          value: 1,
          cutsAdded: CUTS_PER_POST,
          machineId: targetMachineId,
          statusDescription: `Post 1 Signal Logged (+1 Cut Added on ${targetMachineId})`
        },
        { merge: true }
      );
      data.cutsAdded = CUTS_PER_POST;
    }

    return data;
  } catch (err) {
    console.warn("API signal fallback to direct Firestore:", err);
    const cutPayload = {
      machineId: targetMachineId,
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
      statusDescription: `Post 1 Signal Logged (+1 Cut Added on ${targetMachineId})`,
      jayawardenepuraTime: slst.formatted
    };
    const cutRef = await addDoc(collection(db, "cuts"), cutPayload);
    await setDoc(
      doc(db, "machines", targetMachineId),
      {
        machineId: targetMachineId,
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
      machineId: targetMachineId,
      cutsAdded: CUTS_PER_POST,
      timestamp: slst.iso,
      id: cutRef.id,
      serverTime: slst.formatted
    };
  }
}

/**
 * Fetch all machines with status, assigned meter count & today totals
 */
export async function fetchMachines() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/machines`);
    if (res.ok) {
      const data = await res.json();
      if (data.machines && Array.isArray(data.machines)) {
        return data.machines;
      }
    }
  } catch (err) {
    console.warn("fetchMachines API fallback:", err);
  }

  // Fallback: Firestore machines collection
  try {
    const snap = await getDocs(collection(db, "machines"));
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    if (list.length > 0) return list;
  } catch (err) {
    console.warn("fetchMachines Firestore fallback error:", err);
  }
  return SUPPORTED_MACHINES;
}

/**
 * Save / Update Machine Master Specifications (Display Name, Default Meter Count factor, Notes)
 */
export async function saveMachineMasterDetails({ machineId, machineName, meterCount, defaultMeterCount, orderNumber, notes = "" }) {
  const targetId = machineId || MACHINE_ID;
  const slst = getSLSTDate();
  const rate = !isNaN(Number(meterCount))
    ? Math.max(0.1, Number(meterCount))
    : !isNaN(Number(defaultMeterCount))
    ? Math.max(0.1, Number(defaultMeterCount))
    : 2.50;

  const machDef = SUPPORTED_MACHINES.find((m) => m.machineId === targetId) || {};
  const cleanName = (machineName && String(machineName).trim()) || machDef.machineName || targetId;
  const cleanNotes = notes !== undefined ? String(notes).trim() : "";
  const cleanOrderNumber = orderNumber !== undefined ? String(orderNumber).trim() : "";

  const payload = {
    machineId: targetId,
    machineName: cleanName,
    meterCount: rate,
    defaultMeterCount: rate,
    notes: cleanNotes,
    ...(cleanOrderNumber ? {
      currentProductionOrder: {
        orderNumber: cleanOrderNumber,
        meterCount: rate,
        linearMetersPerHour: rate,
        notes: cleanNotes,
        updatedAt: slst.iso
      }
    } : {}),
    updatedAt: slst.iso,
    updatedAtFormatted: slst.formatted
  };

  try {
    await setDoc(
      doc(db, "machines", targetId),
      payload,
      { merge: true }
    );

    await setDoc(
      doc(db, "settings", `production_order_${targetId}`),
      {
        machineId: targetId,
        meterCount: rate,
        linearMetersPerHour: rate,
        ...(cleanOrderNumber ? { orderNumber: cleanOrderNumber } : {}),
        notes: cleanNotes,
        updatedAt: slst.iso
      },
      { merge: true }
    );

    // Sync with Cloud Functions API for reliable persistence
    fetch(`${API_BASE_URL}/api/machines/master`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, orderNumber: cleanOrderNumber })
    }).catch(() => {});
  } catch (err) {
    console.warn("saveMachineMasterDetails error:", err);
  }
  return payload;
}

/**
 * Save / Assign Production Order and Meter Count to a Machine
 */
export async function saveMachineAssignment({ machineId, orderNumber, meterCount, notes = "" }) {
  const targetId = machineId || MACHINE_ID;
  const slst = getSLSTDate();
  const assignedMeterCount = !isNaN(Number(meterCount)) ? Math.max(0, Number(meterCount)) : 2.50;
  const payload = {
    machineId: targetId,
    orderNumber: orderNumber !== undefined ? String(orderNumber).trim() : "",
    meterCount: assignedMeterCount,
    linearMetersPerHour: assignedMeterCount,
    notes: notes ? String(notes).trim() : "",
    updatedAt: slst.iso,
    updatedAtFormatted: slst.formatted
  };

  try {
    await setDoc(
      doc(db, "machines", targetId),
      {
        meterCount: assignedMeterCount,
        currentProductionOrder: payload,
        updatedAt: slst.iso
      },
      { merge: true }
    );

    await setDoc(doc(db, "settings", `production_order_${targetId}`), payload, { merge: true });
    if (targetId === MACHINE_ID) {
      await setDoc(doc(db, "settings", "production_order"), payload, { merge: true });
    }

    fetch(`${API_BASE_URL}/api/production-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (err) {
    console.warn("saveMachineAssignment error:", err);
  }
  return payload;
}

/**
 * Fetch the active Production Order and Linear Meters configuration
 */
export async function fetchProductionOrder() {
  try {
    const snap = await getDoc(doc(db, "settings", "production_order"));
    if (snap.exists()) {
      return snap.data();
    }
    const mSnap = await getDoc(doc(db, "machines", MACHINE_ID));
    if (mSnap.exists() && mSnap.data().currentProductionOrder) {
      return mSnap.data().currentProductionOrder;
    }
  } catch (err) {
    console.warn("fetchProductionOrder warning:", err);
  }
  return { orderNumber: "", linearMetersPerHour: 0 };
}

/**
 * Save / Update active Production Order number and Linear Meters required for the hour
 */
export async function saveProductionOrder({ orderNumber, linearMetersPerHour, notes = "" }) {
  const slst = getSLSTDate();
  const payload = {
    orderNumber: orderNumber !== undefined ? String(orderNumber).trim() : "",
    linearMetersPerHour: !isNaN(Number(linearMetersPerHour)) ? Math.max(0, Number(linearMetersPerHour)) : 0,
    notes: notes ? String(notes).trim() : "",
    updatedAt: slst.iso,
    updatedAtFormatted: slst.formatted
  };

  try {
    await setDoc(doc(db, "settings", "production_order"), payload, { merge: true });
    await setDoc(
      doc(db, "machines", MACHINE_ID),
      { currentProductionOrder: payload },
      { merge: true }
    );

    // Sync with Cloud Functions API if reachable
    fetch(`${API_BASE_URL}/api/production-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (err) {
    console.warn("saveProductionOrder error:", err);
  }
  return payload;
}

/**
 * Fetch the 24-hour hourly production plan for a specific date and machine
 */
export async function fetchHourlyProductionPlan(dateStr, machineId = "rubberised_coir_cutter") {
  try {
    const snap = await getDoc(doc(db, "daily_production_plan", `${dateStr}_${machineId}`));
    if (snap.exists() && Array.isArray(snap.data().hourlyPlans)) {
      return snap.data().hourlyPlans;
    }
    const fallbackSnap = await getDoc(doc(db, "daily_production_plan", dateStr));
    if (fallbackSnap.exists() && Array.isArray(fallbackSnap.data().hourlyPlans)) {
      return fallbackSnap.data().hourlyPlans;
    }
  } catch (err) {
    console.warn("fetchHourlyProductionPlan error:", err);
  }
  return [];
}

/**
 * Save the 24-hour hourly production plan with per-hour order numbers (rate is defined per machine master)
 */
export async function saveHourlyProductionPlan(dateStr, hourlyPlans, machineId = "rubberised_coir_cutter") {
  const slst = getSLSTDate();
  const cleanPlans = Array.from({ length: 24 }).map((_, idx) => {
    const item = hourlyPlans[idx] || {};
    return {
      hour: idx,
      orderNumber: item.orderNumber !== undefined ? String(item.orderNumber).trim() : ""
    };
  });

  const payload = {
    date: dateStr,
    machineId,
    hourlyPlans: cleanPlans,
    updatedAt: slst.iso,
    updatedAtFormatted: slst.formatted
  };

  try {
    await setDoc(doc(db, "daily_production_plan", `${dateStr}_${machineId}`), payload, { merge: true });
    if (machineId === "rubberised_coir_cutter") {
      await setDoc(doc(db, "daily_production_plan", dateStr), payload, { merge: true });
    }
    const currentHour = slst.hour;
    const currentPlan = cleanPlans[currentHour] || {};
    if (currentPlan.orderNumber) {
      await setDoc(
        doc(db, "machines", machineId),
        {
          currentProductionOrder: {
            machineId,
            orderNumber: currentPlan.orderNumber,
            hour: currentHour,
            updatedAt: slst.iso
          }
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.warn("saveHourlyProductionPlan error:", err);
    throw err;
  }
  return payload;
}

/**
 * Start / Create a Downtime (`POST /api/downtime/start`)
 * Creates an active downtime record (`active: true`) and marks machine status as DOWNTIME
 * until ended via `postDowntimeEnd`.
 */
export async function postDowntimeStart(reason = "Machine Downtime", source = "web", machineId = "rubberised_coir_cutter") {
  const slst = getSLSTDate();
  const cleanReason = (reason && String(reason).trim()) || "Machine Downtime";
  const targetId = machineId || MACHINE_ID;
  const machDef = SUPPORTED_MACHINES.find((m) => m.machineId === targetId) || {
    machineId: targetId,
    machineName: targetId
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/downtime/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        machineId: targetId,
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
        machineId: targetId,
        machineName: machDef.machineName,
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
        doc(db, "machines", targetId),
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
        machineId: targetId,
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
    machineId: targetId,
    machineName: machDef.machineName,
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
    doc(db, "machines", targetId),
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
    machineId: targetId,
    downtimeId: dtRef.id,
    downtime: dtSummary,
    serverTime: slst.formatted
  };
}

/**
 * End / Resolve the Active Downtime for a specific machine (`POST /api/downtime/end`)
 */
export async function postDowntimeEnd(payload = {}) {
  const slst = getSLSTDate();
  const specificId = payload?.downtimeId || null;
  const resolvedBy = payload?.resolvedBy || "Ended via Web App";
  const targetMachineId = payload?.machineId || MACHINE_ID;

  try {
    // Resolve directly in Firestore as well so UI updates instantaneously
    const qActive = query(collection(db, "downtime"), where("active", "==", true));
    const snap = await getDocs(qActive);
    let resolvedRecord = null;

    for (const d of snap.docs) {
      if (specificId && d.id !== specificId) continue;
      const dtData = d.data();
      if (!specificId && dtData.machineId && dtData.machineId !== targetMachineId) continue;

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
        machineId: dtData.machineId || targetMachineId,
        reason: dtData.reason || "Machine Downtime",
        startTimeStr: dtData.startTimeStr,
        endTimeStr: slst.timeString,
        durationSeconds,
        durationMinutes
      };
    }

    await setDoc(
      doc(db, "machines", targetMachineId),
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
          machineId: targetMachineId,
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
      machineId: targetMachineId,
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
export async function checkDowntimeStatus(dateStr, machineId = null) {
  const slstNow = getSLSTDate();
  const targetDate = dateStr || slstNow.dateString;
  const mParam = machineId && machineId !== "all" ? `&machineId=${encodeURIComponent(machineId)}` : "";

  try {
    const res = await fetch(`${API_BASE_URL}/api/downtime/status?date=${encodeURIComponent(targetDate)}${mParam}`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.hasActiveDowntime === "boolean") {
        return data;
      }
    }
  } catch (apiErr) {
    // Fallback to Firestore check below
  }

  // Direct Firestore check
  const qDate = query(collection(db, "downtime"), where("date", "==", targetDate));
  const snap = await getDocs(qDate);
  const downtimes = [];
  snap.forEach((d) => {
    const dt = d.data();
    if (!machineId || machineId === "all" || dt.machineId === machineId) {
      downtimes.push({ id: d.id, ...dt });
    }
  });
  downtimes.sort((a, b) => (b.startMs || 0) - (a.startMs || 0));

  let activeDowntime = downtimes.find((d) => d.active === true) || null;
  if (!activeDowntime && machineId && machineId !== "all") {
    const machineSnap = await getDoc(doc(db, "machines", machineId));
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
    date: targetDate,
    machineId: machineId || "all",
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
export async function generatePdfReport(dateStr, type = "hourly", machineId = "rubberised_coir_cutter") {
  const cleanType = String(type).toLowerCase() === "downtime" ? "downtime" : "hourly";
  const slstTime = getSLSTDate();

  try {
    const res = await fetch(`${API_BASE_URL}/api/reports/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dateStr, type: cleanType, machineId })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) return data;
    }
  } catch (err) {
    console.warn("API report generation fallback to client-side jsPDF:", err.message);
  }

  // Client-side jsPDF fallback
  const metrics = await computeClientDailyMetrics(dateStr, machineId);
  const dataUri =
    cleanType === "downtime"
      ? await generateClientDowntimePdf(metrics, slstTime)
      : await generateClientHourlyPdf(metrics, slstTime);

  const base64Data = dataUri.replace(/^data:application\/pdf;filename=generated\.pdf;base64,/, "").replace(/^data:application\/pdf;base64,/, "");
  const fileName =
    cleanType === "downtime"
      ? `ToyoCushion_DowntimeLogs_${dateStr}_${slstTime.fileStamp}.pdf`
      : `ToyoCushion_HourlyProduction_${metrics.machineId}_${dateStr}_${slstTime.fileStamp}.pdf`;
  const title =
    cleanType === "downtime"
      ? `Downtime Logs Report (${dateStr})`
      : `Hourly Production Report (${metrics.machineName} - ${dateStr})`;

  const reportDoc = {
    reportId: `REP-${cleanType.toUpperCase()}-${metrics.machineId}-${dateStr}-${slstTime.fileStamp}`,
    date: dateStr,
    reportType: cleanType,
    title,
    fileName,
    format: "pdf",
    machineId: metrics.machineId,
    machineName: metrics.machineName,
    company: "Toyo Cushion Lanka",
    sector: "Hayleys Eco Solutions Sector",
    createdAt: slstTime.iso,
    createdAtFormatted: slstTime.formatted,
    storageStatus: "SAVED_IN_FIRESTORE",
    metrics: {
      totalCuts: metrics.totalCuts,
      totalLinearMeters: metrics.totalLinearMeters || 0,
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
async function computeClientDailyMetrics(targetDate, targetMachineId = null) {
  const cutsQ = query(collection(db, "cuts"), where("date", "==", targetDate));
  const cutsSnap = await getDocs(cutsQ);
  const allCuts = [];
  cutsSnap.forEach((d) => allCuts.push({ id: d.id, ...d.data() }));

  const dtQ = query(collection(db, "downtime"), where("date", "==", targetDate));
  const dtSnap = await getDocs(dtQ);
  const downtimes = [];
  dtSnap.forEach((d) => downtimes.push({ id: d.id, ...d.data() }));
  downtimes.sort((a, b) => (b.startMs || 0) - (a.startMs || 0));

  if (targetMachineId === "all") {
    let fleetTotalCuts = 0;
    let fleetTotalLinearMeters = 0;
    const fleetHourlyCuts = Array(24).fill(0);
    const fleetHourlyLinearMeters = Array(24).fill(0);

    const machinesBreakdown = await Promise.all(
      SUPPORTED_MACHINES.map(async (def) => {
        let machName = def.machineName;
        let rate = def.defaultMeterCount;
        let activeOrd = def.defaultOrderNumber || "";
        let status = "RUNNING";

        try {
          const mDoc = await getDoc(doc(db, "machines", def.machineId));
          if (mDoc.exists()) {
            const md = mDoc.data();
            if (md.machineName) machName = md.machineName;
            if (md.meterCount) rate = Number(md.meterCount);
            if (md.currentProductionOrder?.orderNumber) {
              const ordDate = md.currentProductionOrder.date || (md.currentProductionOrder.updatedAt ? md.currentProductionOrder.updatedAt.slice(0, 10) : "");
              if (ordDate === targetDate) {
                activeOrd = String(md.currentProductionOrder.orderNumber).trim();
              }
            }
            if (md.status) status = md.status;
          }
        } catch (e) {}

        const machCuts = allCuts.filter(
          (c) => c.machineId === def.machineId || (!c.machineId && def.machineId === "rubberised_coir_cutter")
        );

        const hCuts = Array(24).fill(0);
        let mTotalCuts = 0;
        machCuts.forEach((c) => {
          const h = Number(c.hour);
          const cutsAdded = c.cutsAdded !== undefined ? Number(c.cutsAdded) : CUTS_PER_POST;
          if (!isNaN(h) && h >= 0 && h < 24) {
            hCuts[h] += cutsAdded;
            fleetHourlyCuts[h] += cutsAdded;
          }
          mTotalCuts += cutsAdded;
        });

        const mLinearMeters = Number((mTotalCuts * rate).toFixed(2));
        fleetTotalCuts += mTotalCuts;
        fleetTotalLinearMeters += mLinearMeters;

        for (let h = 0; h < 24; h++) {
          fleetHourlyLinearMeters[h] += Number((hCuts[h] * rate).toFixed(2));
        }

        return {
          machineId: def.machineId,
          machineName: machName,
          status,
          meterCount: rate,
          activeOrder: activeOrd,
          totalCuts: mTotalCuts,
          totalLinearMeters: mLinearMeters,
          hourlyCuts: hCuts
        };
      })
    );

    const perHourDetails = Array.from({ length: 24 }).map((_, h) => ({
      hour: h,
      orderNumber: "Fleet Active",
      cuts: fleetHourlyCuts[h],
      meterCount: 0,
      linearMeters: Number(fleetHourlyLinearMeters[h].toFixed(2))
    }));

    let totalDowntimeMinutes = 0;
    downtimes.forEach((dt) => {
      totalDowntimeMinutes += Number(dt.durationMinutes || 0);
    });

    return {
      isFleetReport: true,
      date: targetDate,
      machineId: "all",
      machineName: "All Monitored Machines (Consolidated Fleet Report)",
      company: "Toyo Cushion Lanka",
      sector: "Hayleys Eco Solutions Sector",
      totalCuts: fleetTotalCuts,
      totalLinearMeters: Number(fleetTotalLinearMeters.toFixed(2)),
      totalSignals: allCuts.length,
      hourlyCuts: fleetHourlyCuts,
      perHourDetails,
      machinesBreakdown,
      totalDowntimeMinutes: parseFloat(totalDowntimeMinutes.toFixed(2)),
      downtimeIncidentsCount: downtimes.length,
      hasActiveDowntime: downtimes.some((d) => d.active),
      cutsList: allCuts,
      downtimesList: downtimes
    };
  }

  const machineId = targetMachineId || MACHINE_ID;
  const machDef = SUPPORTED_MACHINES.find((m) => m.machineId === machineId) || SUPPORTED_MACHINES[0];
  let machineName = machDef.machineName;
  let defaultMeterCount = machDef.defaultMeterCount || 2.50;
  let activeOrder = machDef.defaultOrderNumber || "";

  try {
    const mDoc = await getDoc(doc(db, "machines", machineId));
    if (mDoc.exists()) {
      const md = mDoc.data();
      if (md.machineName) machineName = md.machineName;
      if (md.meterCount) defaultMeterCount = Number(md.meterCount);
      if (md.currentProductionOrder?.orderNumber) {
        const ordDate = md.currentProductionOrder.date || (md.currentProductionOrder.updatedAt ? md.currentProductionOrder.updatedAt.slice(0, 10) : "");
        if (ordDate === targetDate) {
          activeOrder = String(md.currentProductionOrder.orderNumber).trim();
        }
      }
    }
  } catch (e) {
    console.warn("mDoc read error:", e);
  }

  // Load 24-hour hourly production plan (meterCount from machine master)
  let hourlyPlans = Array.from({ length: 24 }).map((_, i) => ({
    hour: i,
    orderNumber: activeOrder || "",
    meterCount: defaultMeterCount
  }));

  try {
    const pSnap = await getDoc(doc(db, "daily_production_plan", `${targetDate}_${machineId}`));
    let found = false;
    if (pSnap.exists() && Array.isArray(pSnap.data().hourlyPlans)) {
      const inc = pSnap.data().hourlyPlans;
      hourlyPlans = Array.from({ length: 24 }).map((_, i) => ({
        hour: i,
        orderNumber: inc[i]?.orderNumber !== undefined ? String(inc[i].orderNumber).trim() : "",
        meterCount: defaultMeterCount
      }));
      found = true;
    }
    if (!found) {
      const legSnap = await getDoc(doc(db, "daily_production_plan", targetDate));
      if (legSnap.exists() && Array.isArray(legSnap.data().hourlyPlans)) {
        const inc = legSnap.data().hourlyPlans;
        hourlyPlans = Array.from({ length: 24 }).map((_, i) => ({
          hour: i,
          orderNumber: inc[i]?.orderNumber !== undefined ? String(inc[i].orderNumber).trim() : "",
          meterCount: defaultMeterCount
        }));
      }
    }
  } catch (e) {
    console.warn("pSnap read error:", e);
  }

  const cuts = allCuts.filter(
    (c) => c.machineId === machineId || (!c.machineId && machineId === "rubberised_coir_cutter")
  );

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

  let totalLinearMeters = 0;
  const perHourDetails = Array.from({ length: 24 }).map((_, h) => {
    const hCuts = hourlyCuts[h] || 0;
    const plan = hourlyPlans[h] || {};
    const orderNum = plan.orderNumber !== undefined && plan.orderNumber !== "" ? plan.orderNumber : (activeOrder || "");
    const rate = Number(plan.meterCount) || defaultMeterCount;
    const produced = Number((hCuts * rate).toFixed(2));
    totalLinearMeters += produced;
    return {
      hour: h,
      orderNumber: orderNum,
      cuts: hCuts,
      meterCount: rate,
      linearMeters: produced
    };
  });

  totalLinearMeters = Number(totalLinearMeters.toFixed(2));

  // Filter downtimes for target machine
  const machDowntimes = targetMachineId === "all"
    ? downtimes
    : downtimes.filter(
        (dt) => dt.machineId === machineId || (!dt.machineId && machineId === "rubberised_coir_cutter")
      );

  const slstNow = getSLSTDate();
  let totalDowntimeMinutes = 0;
  let activeDowntime = null;

  machDowntimes.forEach((dt) => {
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
    machineId,
    machineName,
    totalCuts,
    totalLinearMeters,
    totalSignals: cuts.length,
    hourlyCuts,
    hourlySignals,
    perHourDetails,
    hourlyPlans,
    defaultMeterCount,
    activeOrder,
    totalDowntimeMinutes: parseFloat(totalDowntimeMinutes.toFixed(2)),
    downtimeIncidentsCount: machDowntimes.length,
    hasActiveDowntime: !!activeDowntime,
    activeDowntime,
    downtimesList: machDowntimes
  };
}

/**
 * Client-Side 1-Page PDF Generator for Hourly Cuts & Production Report using jsPDF
 */
async function generateClientHourlyPdf(metrics, slstTime) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ format: "a4", unit: "pt" });

  if (metrics.isFleetReport) {
    // Header banner for Fleet
    doc.setFillColor(30, 58, 138); // #1e3a8a
    doc.rect(28, 28, 539, 52, "F");

    doc.setTextColor(251, 191, 36);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("TOYO CUSHION LANKA (PVT) LTD • HAYLEYS ECO SOLUTIONS", 38, 44);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.text("CONSOLIDATED FLEET PRODUCTION REPORT", 38, 62);

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.text("Equipment Fleet: All Monitored Cutting Lines (3 Machines)", 28, 94);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Report Date: ${metrics.date}  |  Generated (SLST): ${slstTime.formatted}  |  Counting Rule: 1 Signal = 1 Cut`, 28, 106);

    // Summary 4-box KPI row
    const kpiY = 118;
    const boxW = 128;
    const gap = 9;

    // KPI 1: Fleet Total Cuts
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(167, 243, 208);
    doc.rect(28, kpiY, boxW, 40, "FD");
    doc.setTextColor(6, 95, 70);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text("FLEET TOTAL CUTS", 36, kpiY + 12);
    doc.setFontSize(13);
    doc.text(`${metrics.totalCuts.toLocaleString()} Cuts`, 36, kpiY + 28);

    // KPI 2: Fleet Linear Output
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(134, 239, 172);
    doc.rect(28 + boxW + gap, kpiY, boxW, 40, "FD");
    doc.setTextColor(22, 101, 52);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text("FLEET LINEAR OUTPUT", 36 + boxW + gap, kpiY + 12);
    doc.setFontSize(13);
    doc.text(`${Number(metrics.totalLinearMeters || 0).toFixed(2)} m`, 36 + boxW + gap, kpiY + 28);

    // KPI 3: Lines
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(191, 219, 254);
    doc.rect(28 + (boxW + gap) * 2, kpiY, boxW, 40, "FD");
    doc.setTextColor(30, 64, 175);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text("ACTIVE FLEET LINES", 36 + (boxW + gap) * 2, kpiY + 12);
    doc.setFontSize(13);
    doc.text(`${metrics.machinesBreakdown?.length || 3} Lines`, 36 + (boxW + gap) * 2, kpiY + 28);

    // KPI 4: Downtime
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(252, 165, 165);
    doc.rect(28 + (boxW + gap) * 3, kpiY, boxW, 40, "FD");
    doc.setTextColor(153, 27, 27);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text("FLEET DOWNTIME", 36 + (boxW + gap) * 3, kpiY + 12);
    doc.setFontSize(13);
    doc.text(`${metrics.totalDowntimeMinutes || 0} mins`, 36 + (boxW + gap) * 3, kpiY + 28);

    // Machines Fleet Summary Table
    let cy = 166;
    doc.setFillColor(30, 41, 59);
    doc.rect(28, cy, 539, 18, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text("MACHINE / PRODUCTION LINE", 36, cy + 12);
    doc.text("ACTIVE ORDER #", 210, cy + 12);
    doc.text("STATUS", 305, cy + 12);
    doc.text("CUTS", 375, cy + 12);
    doc.text("FACTOR", 425, cy + 12);
    doc.text("LINEAR OUTPUT", 480, cy + 12);
    cy += 18;

    const linesList = metrics.machinesBreakdown || [];
    linesList.forEach((m, idx) => {
      const isAlt = idx % 2 === 1;
      doc.setFillColor(isAlt ? 248 : 255, isAlt ? 250 : 255, isAlt ? 252 : 255);
      doc.rect(28, cy, 539, 19, "F");
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.text(m.machineName, 36, cy + 13);
      doc.setTextColor(13, 110, 253);
      doc.setFont("helvetica", "normal");
      doc.text(m.activeOrder || "—", 210, cy + 13);
      doc.setTextColor(m.status === "DOWNTIME" ? 220 : 22, m.status === "DOWNTIME" ? 38 : 101, m.status === "DOWNTIME" ? 38 : 52);
      doc.setFont("helvetica", "bold");
      doc.text(m.status, 305, cy + 13);
      doc.setTextColor(4, 120, 87);
      doc.text(`${m.totalCuts} pulses`, 375, cy + 13);
      doc.setTextColor(51, 65, 85);
      doc.setFont("helvetica", "normal");
      doc.text(`${m.meterCount.toFixed(2)} m/pulse`, 425, cy + 13);
      doc.setTextColor(22, 101, 52);
      doc.setFont("helvetica", "bold");
      doc.text(`${m.totalLinearMeters.toFixed(2)} m`, 480, cy + 13);
      cy += 19;
    });

    // Summary Total
    doc.setFillColor(226, 232, 240);
    doc.rect(28, cy, 539, 19, "F");
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("FLEET SUMMARY TOTAL", 36, cy + 13);
    doc.setTextColor(4, 120, 87);
    doc.text(`${metrics.totalCuts} Cuts`, 375, cy + 13);
    doc.setTextColor(22, 101, 52);
    doc.text(`${metrics.totalLinearMeters.toFixed(2)} m`, 480, cy + 13);
    cy += 26;

    // 24-Hour Distribution Section
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.text("24-Hour Fleet Hourly Output Distribution (SLST)", 28, cy);
    cy += 12;

    doc.setFillColor(51, 65, 85);
    doc.rect(28, cy, 539, 16, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("HOUR WINDOW", 36, cy + 11);
    doc.text("COMBINED FLEET CUTS", 220, cy + 11);
    doc.text("COMBINED LINEAR OUTPUT (m)", 400, cy + 11);
    cy += 16;

    const perHour = metrics.perHourDetails || [];
    const rowH = 17;
    for (let h = 0; h < 24; h++) {
      const row = perHour[h] || { hour: h, cuts: 0, linearMeters: 0 };
      const isAlt = h % 2 === 1;
      doc.setFillColor(isAlt ? 248 : 255, isAlt ? 250 : 255, isAlt ? 252 : 255);
      doc.rect(28, cy, 539, rowH, "F");
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(`${String(h).padStart(2, "0")}:00 - ${String((h + 1) % 24).padStart(2, "0")}:00`, 36, cy + 12);
      doc.setTextColor(row.cuts > 0 ? 4 : 148, row.cuts > 0 ? 120 : 163, row.cuts > 0 ? 87 : 184);
      doc.setFont("helvetica", row.cuts > 0 ? "bold" : "normal");
      doc.text(`${row.cuts} cuts`, 220, cy + 12);
      doc.setTextColor(row.linearMeters > 0 ? 22 : 148, row.linearMeters > 0 ? 101 : 163, row.linearMeters > 0 ? 52 : 184);
      doc.setFont("helvetica", row.linearMeters > 0 ? "bold" : "normal");
      doc.text(`${Number(row.linearMeters).toFixed(2)} m`, 400, cy + 12);
      cy += rowH;
    }

    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("Toyo Cushion Lanka (Pvt) Ltd • Hayleys Eco Solutions Sector • Consolidated Fleet Management Engine", 297, 810, { align: "center" });

    const pdfOutput = doc.output("datauristring");
    const base64Data = pdfOutput.split(",")[1];
    return {
      fileName: `ToyoCushion_FleetProduction_${metrics.date}_${slstTime.fileStamp}.pdf`,
      title: `Consolidated Fleet Production Report (${metrics.date})`,
      base64Data,
      doc
    };
  }

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
  doc.rect(28, 28, 539, 52, "F");

  doc.setTextColor(251, 191, 36); // #fbbf24
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("TOYO CUSHION LANKA (PVT) LTD • HAYLEYS ECO SOLUTIONS", 38, 44);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text("HOURLY PRODUCTION & LINEAR METERS REPORT", 38, 62);

  // Meta row
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text(`Machine: ${metrics.machineName || "Rubberised Coir Cutter"} (${metrics.machineId})`, 28, 94);

  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Report Date: ${metrics.date}  |  Generated (SLST): ${slstTime.formatted}  |  Counting Rule: 1 Signal = 1 Cut`,
    28,
    106
  );

  // 4 KPI Summary Cards
  const kpiY = 118;
  const boxW = 128;
  const gap = 9;

  // Box 1: Total Cuts
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.rect(28, kpiY, boxW, 40, "FD");
  doc.setTextColor(6, 95, 70);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL CUTS TODAY", 36, kpiY + 12);
  doc.setFontSize(13);
  doc.text(`${metrics.totalCuts.toLocaleString()} Cuts`, 36, kpiY + 28);

  // Box 2: Total Linear Output
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(134, 239, 172);
  doc.rect(28 + boxW + gap, kpiY, boxW, 40, "FD");
  doc.setTextColor(22, 101, 52);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL LINEAR OUTPUT", 36 + boxW + gap, kpiY + 12);
  doc.setFontSize(13);
  doc.text(`${Number(metrics.totalLinearMeters || 0).toFixed(2)} m`, 36 + boxW + gap, kpiY + 28);

  // Box 3: Peak Hour
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(191, 219, 254);
  doc.rect(28 + (boxW + gap) * 2, kpiY, boxW, 40, "FD");
  doc.setTextColor(30, 64, 175);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text("PEAK PRODUCTION HOUR", 36 + (boxW + gap) * 2, kpiY + 12);
  doc.setFontSize(9.5);
  doc.text(
    peakCount > 0 ? `${String(peakHour).padStart(2, "0")}:00 (${peakCount} cuts)` : "No cuts yet",
    36 + (boxW + gap) * 2,
    kpiY + 28
  );

  // Box 4: Machine Status
  doc.setFillColor(metrics.hasActiveDowntime ? 254 : 248, metrics.hasActiveDowntime ? 242 : 250, metrics.hasActiveDowntime ? 242 : 252);
  doc.setDrawColor(metrics.hasActiveDowntime ? 248 : 203, metrics.hasActiveDowntime ? 113 : 213, metrics.hasActiveDowntime ? 113 : 225);
  doc.rect(28 + (boxW + gap) * 3, kpiY, boxW, 40, "FD");
  doc.setTextColor(metrics.hasActiveDowntime ? 220 : 51, metrics.hasActiveDowntime ? 38 : 65, metrics.hasActiveDowntime ? 38 : 85);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text("MACHINE STATUS", 36 + (boxW + gap) * 3, kpiY + 12);
  doc.setFontSize(10.5);
  doc.text(metrics.hasActiveDowntime ? "⚠️ DOWNTIME" : "● RUNNING", 36 + (boxW + gap) * 3, kpiY + 28);

  // 24 Hour Detailed Production Table
  const tableTop = 166;
  const rowH = 22;

  doc.setFillColor(30, 41, 59);
  doc.rect(28, tableTop, 539, 20, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("HOUR WINDOW (SLST)", 36, tableTop + 13);
  doc.text("ORDER #", 155, tableTop + 13);
  doc.text("ENCODER PULSES", 265, tableTop + 13);
  doc.text("FACTOR (m/pulse)", 375, tableTop + 13);
  doc.text("LINEAR OUTPUT (m)", 460, tableTop + 13);

  let cy = tableTop + 20;
  const perHour = metrics.perHourDetails || [];

  for (let h = 0; h < 24; h++) {
    const row = perHour[h] || { hour: h, cuts: metrics.hourlyCuts[h] || 0, orderNumber: metrics.activeOrder, meterCount: metrics.defaultMeterCount, linearMeters: 0 };
    const isAlt = h % 2 === 1;
    const isPeak = row.cuts > 0 && row.cuts === peakCount;

    if (isPeak) {
      doc.setFillColor(209, 250, 229);
    } else if (row.cuts > 0) {
      doc.setFillColor(isAlt ? 236 : 255, isAlt ? 253 : 255, isAlt ? 245 : 255);
    } else {
      doc.setFillColor(isAlt ? 248 : 255, isAlt ? 250 : 255, isAlt ? 252 : 255);
    }
    doc.rect(28, cy, 539, rowH, "F");

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${String(h).padStart(2, "0")}:00 - ${String((h + 1) % 24).padStart(2, "0")}:00`, 36, cy + 14);

    // Order #
    doc.setTextColor(13, 110, 253);
    doc.setFont("helvetica", "bold");
    doc.text(String(row.orderNumber || "—"), 155, cy + 14);

    // Encoder Pulses
    if (row.cuts > 0) {
      doc.setTextColor(4, 120, 87);
      doc.setFont("helvetica", "bold");
      doc.text(`${row.cuts} pulses ${isPeak ? "★" : ""}`, 265, cy + 14);
    } else {
      doc.setTextColor(148, 163, 184);
      doc.setFont("helvetica", "normal");
      doc.text("0 pulses", 265, cy + 14);
    }

    // Rate
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "normal");
    doc.text(`${Number(row.meterCount || 2.50).toFixed(2)} m`, 375, cy + 14);

    // Linear Output
    if (row.linearMeters > 0) {
      doc.setTextColor(22, 101, 52);
      doc.setFont("helvetica", "bold");
      doc.text(`${Number(row.linearMeters).toFixed(2)} m`, 460, cy + 14);
    } else {
      doc.setTextColor(148, 163, 184);
      doc.setFont("helvetica", "normal");
      doc.text("0.00 m", 460, cy + 14);
    }

    cy += rowH;
  }

  // Summary Footer
  doc.setFillColor(226, 232, 240);
  doc.rect(28, cy, 539, 22, "F");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("DAILY TOTAL (24 HOURS)", 36, cy + 15);
  doc.text(`${metrics.machineId || "MACHINE"}`, 155, cy + 15);
  doc.setTextColor(4, 120, 87);
  doc.text(`${metrics.totalCuts} Pulses`, 265, cy + 15);
  doc.setTextColor(51, 65, 85);
  doc.text(`-`, 375, cy + 15);
  doc.setTextColor(22, 101, 52);
  doc.text(`${Number(metrics.totalLinearMeters || 0).toFixed(2)} m`, 460, cy + 15);

  doc.setDrawColor(203, 213, 225);
  doc.rect(28, tableTop, 539, 20 + 25 * rowH, "S");

  // Single-page Footer
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text(
    "Toyo Cushion Lanka (Pvt) Ltd • Hayleys Eco Solutions Sector • MSc Mobile Computing Project Telemetry Engine",
    297.64,
    804,
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

/**
 * Retrieve Archived Cuts between `fromDate` and `toDate` (YYYY-MM-DD)
 * for a specific machine or all machines ("all")
 */
export async function fetchArchivedCutsByRange(fromDate, toDate, machineId = "all") {
  const cuts = [];
  try {
    // 1. Query `cuts_archive` by date range
    let archiveQuery;
    if (fromDate && toDate) {
      archiveQuery = query(
        collection(db, "cuts_archive"),
        where("date", ">=", fromDate),
        where("date", "<=", toDate)
      );
    } else if (fromDate) {
      archiveQuery = query(
        collection(db, "cuts_archive"),
        where("date", ">=", fromDate)
      );
    } else if (toDate) {
      archiveQuery = query(
        collection(db, "cuts_archive"),
        where("date", "<=", toDate)
      );
    } else {
      archiveQuery = query(collection(db, "cuts_archive"));
    }

    const archiveSnap = await getDocs(archiveQuery);
    archiveSnap.forEach((docSnap) => {
      cuts.push({ id: docSnap.id, source: "archive", ...docSnap.data() });
    });

    // 2. Also check if the range includes today's active live cuts
    const todayStr = getSLSTDate().dateString;
    if ((!toDate || toDate >= todayStr) && (!fromDate || fromDate <= todayStr)) {
      const activeSnap = await getDocs(
        query(collection(db, "cuts"), where("date", "==", todayStr))
      );
      activeSnap.forEach((docSnap) => {
        if (!cuts.some((c) => c.id === docSnap.id)) {
          cuts.push({ id: docSnap.id, source: "active_today", ...docSnap.data() });
        }
      });
    }
  } catch (err) {
    console.warn("Direct Firestore cuts_archive query error, attempting API fallback:", err.message);
    try {
      const apiRes = await fetch(
        `${API_BASE_URL}/api/archive/cuts?from=${encodeURIComponent(fromDate || "")}&to=${encodeURIComponent(toDate || "")}&machineId=${encodeURIComponent(machineId || "all")}`
      );
      if (apiRes.ok) {
        const json = await apiRes.json();
        if (json.cuts) return json.cuts;
      }
    } catch (apiErr) {
      console.error("API archive cuts fallback error:", apiErr.message);
    }
  }

  // Filter in memory by target machine if specific machine requested
  let filtered = cuts;
  if (machineId && machineId !== "all") {
    filtered = cuts.filter(
      (c) =>
        c.machineId === machineId ||
        (!c.machineId && machineId === "rubberised_coir_cutter")
    );
  }

  // Sort by timestamp descending (newest first)
  filtered.sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
  return filtered;
}
