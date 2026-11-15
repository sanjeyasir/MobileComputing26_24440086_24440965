import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import {
  doc,
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit
} from "firebase/firestore";
import { db } from "../services/firebaseConfig";
import { getSLSTDate } from "../utils/timeZoneUtils";
import {
  postCutterSignal,
  postDowntimeStart,
  postDowntimeEnd,
  checkDowntimeStatus,
  generatePdfReport,
  generateAndStoreExcelReport,
  deleteStoredReport,
  fetchStoredReports,
  getReportDownloadUrl,
  getLatestReportDownloadUrl,
  MACHINE_ID,
  CUTS_PER_POST
} from "../services/cutterApiService";

const CutterContext = createContext(null);

export function CutterProvider({ children }) {
  // Authentication State (admin / admin)
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const [currentTimeSLST, setCurrentTimeSLST] = useState(() => getSLSTDate());
  const todayStr = useMemo(() => getSLSTDate().dateString, [currentTimeSLST.dateString]);
  const yesterdayStr = useMemo(() => {
    const d = new Date(getSLSTDate().date.getTime() - 24 * 60 * 60 * 1000);
    return getSLSTDate(d).dateString;
  }, [currentTimeSLST.dateString]);
  const [selectedDate, setSelectedDate] = useState(() => getSLSTDate().dateString);

  const [machineState, setMachineState] = useState({
    status: "RUNNING",
    currentDowntimeId: null,
    activeDowntime: null,
    lastPost: 1,
    lastCutTime: null
  });

  const [cutsLog, setCutsLog] = useState([]);
  const [downtimesList, setDowntimesList] = useState([]);
  const [storedReports, setStoredReports] = useState([]);
  const [downtimeCheckResult, setDowntimeCheckResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);

  const showNotice = (type, title, message) => {
    setActionNotice({ type, title, message });
    setTimeout(() => setActionNotice(null), 4500);
  };

  // Login handler checking admin / admin
  const login = (username, password) => {
    const cleanUser = String(username || "").trim().toLowerCase();
    const cleanPass = String(password || "").trim();

    if (cleanUser === "admin" && cleanPass === "admin") {
      const userObj = {
        username: "admin",
        displayName: "Plant Administrator",
        role: "Admin",
        company: "Toyo Cushion Lanka (Pvt) Ltd",
        sector: "Hayleys Eco Solutions Sector",
        loginTime: getSLSTDate().formatted
      };
      setCurrentUser(userObj);
      setIsAuthenticated(true);
      return { success: true, user: userObj };
    }

    return {
      success: false,
      error: "Invalid username or password. Please use 'admin' and 'admin'."
    };
  };

  const logout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  // 1. Live SLST Clock Ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeSLST(getSLSTDate());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Real-time Machine Status Listener
  useEffect(() => {
    const machineDocRef = doc(db, "machines", MACHINE_ID);
    const unsub = onSnapshot(
      machineDocRef,
      (snap) => {
        if (snap.exists()) {
          setMachineState((prev) => ({ ...prev, ...snap.data() }));
        }
      },
      (err) => {
        console.warn("Machine state listener error:", err.message);
      }
    );
    return () => unsub();
  }, []);

  // 3. Real-time Cuts & Downtime Listeners for Selected Date
  useEffect(() => {
    const cutsQ = query(collection(db, "cuts"), where("date", "==", selectedDate));
    const unsubCuts = onSnapshot(
      cutsQ,
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
        setCutsLog(list);
      },
      (err) => {
        console.warn("Cuts listener warning:", err.message);
      }
    );

    const dtQuery = query(collection(db, "downtime"), where("date", "==", selectedDate));
    const unsubDowntimes = onSnapshot(
      dtQuery,
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.startMs || 0) - (a.startMs || 0));
        setDowntimesList(list);
      },
      (err) => {
        console.warn("Downtime listener warning:", err.message);
      }
    );

    return () => {
      unsubCuts();
      unsubDowntimes();
    };
  }, [selectedDate]);

  // 4. Real-time Stored Excel Reports Listener
  useEffect(() => {
    const repQuery = query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(20));
    const unsubReports = onSnapshot(
      repQuery,
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setStoredReports(list);
      },
      () => {
        fetchStoredReports().then((res) => {
          if (res?.reports) setStoredReports(res.reports);
        });
      }
    );
    return () => unsubReports();
  }, []);

  // Volume Metrics: Every Post 1 = 2 Cuts
  const dailyMetrics = useMemo(() => {
    const hourlyCuts = Array(24).fill(0);
    const hourlySignals = Array(24).fill(0);
    let totalCuts = 0;
    let totalSignals = 0;

    cutsLog.forEach((c) => {
      const postVal = c.post !== undefined ? Number(c.post) : 1;
      if (postVal === 1) {
        const cutsForEntry = Number(c.cutsAdded) >= 2 ? Number(c.cutsAdded) : CUTS_PER_POST;
        const h = Number(c.hour);
        if (!isNaN(h) && h >= 0 && h < 24) {
          hourlyCuts[h] += cutsForEntry;
          hourlySignals[h] += 1;
        }
        totalCuts += cutsForEntry;
        totalSignals += 1;
      }
    });

    let peakHour = 0;
    let peakCount = 0;
    hourlyCuts.forEach((val, h) => {
      if (val > peakCount) {
        peakCount = val;
        peakHour = h;
      }
    });

    const currentHourCuts = hourlyCuts[currentTimeSLST.hour] || 0;
    const maxHourly = Math.max(...hourlyCuts, 2);

    let totalDowntimeMinutes = 0;
    downtimesList.forEach((dt) => {
      if (dt.active && dt.startMs) {
        totalDowntimeMinutes += Math.max(0, currentTimeSLST.timestampMs - Number(dt.startMs)) / 60000;
      } else {
        totalDowntimeMinutes += Number(dt.durationMinutes || 0);
      }
    });

    return {
      date: selectedDate,
      cutsPerPost: CUTS_PER_POST,
      totalCuts,
      totalSignals,
      totalCycles: totalSignals,
      hourlyCuts,
      hourlySignals,
      currentHourCuts,
      peakHour,
      peakCount,
      maxHourly,
      totalDowntimeMinutes: parseFloat(totalDowntimeMinutes.toFixed(1)),
      downtimeIncidentsCount: downtimesList.length
    };
  }, [cutsLog, downtimesList, selectedDate, currentTimeSLST.hour, currentTimeSLST.timestampMs]);

  // Active Downtime Detection
  const activeDowntime = useMemo(() => {
    const fromList = downtimesList.find((d) => d.active === true);
    if (fromList) return fromList;
    if (machineState.status === "DOWNTIME" && machineState.activeDowntime?.active) {
      return machineState.activeDowntime;
    }
    return null;
  }, [downtimesList, machineState]);

  const activeDowntimeElapsedSec = useMemo(() => {
    if (!activeDowntime || !activeDowntime.startMs) return 0;
    return Math.max(0, Math.floor((currentTimeSLST.timestampMs - Number(activeDowntime.startMs)) / 1000));
  }, [activeDowntime, currentTimeSLST.timestampMs]);

  // Actions
  const triggerPostSignal = async (extra = {}) => {
    try {
      setIsLoading(true);
      const res = await postCutterSignal(extra);
      showNotice(
        "success",
        "Signal Post 1 Logged (+2 Cuts)",
        `Added +2 cuts to ${String(currentTimeSLST.hour).padStart(2, "0")}:00 hourly volume.`
      );
      return res;
    } catch (err) {
      showNotice("error", "Signal Post Failed", err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const triggerDowntimeStart = async (reason = "Machine Downtime") => {
    if (activeDowntime) {
      showNotice("warning", "Downtime Already Active", "An active downtime is already in progress.");
      return activeDowntime;
    }
    try {
      setIsLoading(true);
      const res = await postDowntimeStart(reason, "mobile");
      showNotice(
        "warning",
        "Downtime Created",
        `Downtime logged: "${res.downtime?.reason || reason}"`
      );
      const checkRes = await checkDowntimeStatus(selectedDate);
      setDowntimeCheckResult(checkRes);
      return res;
    } catch (err) {
      showNotice("error", "Downtime Creation Error", err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const triggerDowntimeEnd = async (specificId = null) => {
    try {
      setIsLoading(true);
      const targetId = specificId || activeDowntime?.id || null;
      const res = await postDowntimeEnd({
        downtimeId: targetId,
        resolvedBy: "Ended via Mobile App"
      });
      showNotice("success", "Downtime Ended", "Downtime resolved and machine set to RUNNING.");
      const checkRes = await checkDowntimeStatus(selectedDate);
      setDowntimeCheckResult(checkRes);
      return res;
    } catch (err) {
      showNotice("error", "End Downtime Error", err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const checkDowntime = async () => {
    try {
      setIsLoading(true);
      const res = await checkDowntimeStatus(selectedDate);
      setDowntimeCheckResult(res);
      showNotice(
        res.hasActiveDowntime ? "warning" : "success",
        "Downtime Status Checked",
        res.hasActiveDowntime
          ? `Active Downtime: "${res.activeDowntime?.reason}"`
          : `No active downtime. (${res.totalDowntimesCount} logs on ${selectedDate})`
      );
      return res;
    } catch (err) {
      showNotice("error", "Check Downtime Failed", err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const generatePdf = async (type = "hourly", dateToGenerate = selectedDate) => {
    try {
      setIsLoading(true);
      const res = await generatePdfReport(dateToGenerate, type);
      showNotice(
        "success",
        "PDF Report Generated",
        `Saved ${res.report?.title || `${type} report`} (${dateToGenerate})!`
      );
      return res;
    } catch (err) {
      showNotice("error", "Report Generation Error", err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteReport = async (reportId) => {
    try {
      setIsLoading(true);
      const res = await deleteStoredReport(reportId);
      if (res && res.success) {
        showNotice("success", "Report Deleted", "Report removed from Cloud Storage & Firestore.");
      } else {
        showNotice("warning", "Notice", res?.message || "Could not delete report.");
      }
      return res;
    } catch (err) {
      showNotice("error", "Delete Failed", err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const generateExcel = async (dateToGenerate = selectedDate) => {
    return await generatePdf("hourly", dateToGenerate);
  };

  const refreshData = async () => {
    try {
      setIsLoading(true);
      const checkRes = await checkDowntimeStatus(selectedDate);
      setDowntimeCheckResult(checkRes);
      const repRes = await fetchStoredReports();
      if (repRes?.reports) setStoredReports(repRes.reports);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <CutterContext.Provider
      value={{
        isAuthenticated,
        currentUser,
        login,
        logout,
        selectedDate,
        setSelectedDate,
        todayStr,
        yesterdayStr,
        currentTimeSLST,
        machineState,
        dailyMetrics,
        cutsLog,
        downtimesList,
        storedReports,
        activeDowntime,
        activeDowntimeElapsedSec,
        downtimeCheckResult,
        isLoading,
        actionNotice,
        setActionNotice,
        triggerPostSignal,
        triggerDowntimeStart,
        triggerDowntimeEnd,
        checkDowntime,
        generatePdf,
        generateExcel,
        deleteReport,
        refreshData,
        getReportDownloadUrl,
        getLatestReportDownloadUrl
      }}
    >
      {children}
    </CutterContext.Provider>
  );
}

export function useCutter() {
  const ctx = useContext(CutterContext);
  if (!ctx) {
    throw new Error("useCutter must be used within a CutterProvider");
  }
  return ctx;
}
