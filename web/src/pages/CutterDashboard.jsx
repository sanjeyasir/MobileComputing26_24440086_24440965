import React, { useState, useEffect, useMemo } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Form,
  InputGroup,
  Table,
  Badge,
  Alert,
  Nav,
  Navbar,
  Spinner
} from "react-bootstrap";
import {
  doc,
  getDoc,
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit
} from "firebase/firestore";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "firebase/auth";
import { auth, db } from "../services/firebase/config";
import {
  getSLSTDate,
  formatDuration,
  postCutterSignal,
  postDowntimeStart,
  postDowntimeEnd,
  checkDowntimeStatus,
  generatePdfReport,
  deleteStoredReport,
  getReportDownloadUrl,
  fetchProductionOrder,
  saveProductionOrder,
  fetchHourlyProductionPlan,
  saveHourlyProductionPlan,
  saveMachineAssignment,
  saveMachineMasterDetails,
  fetchMachines,
  fetchArchivedCutsByRange,
  SUPPORTED_MACHINES,
  MACHINE_ID,
  CUTS_PER_POST
} from "../services/cutterService";
import ApiPerformanceTab from "../components/ApiPerformanceTab";

const DOWNTIME_PRESETS = [
  "Blade Maintenance",
  "Material Changeover",
  "Coir Sheet Feeding Adjustment",
  "Electrical / Sensor Check",
  "Scheduled Operator Break"
];

export default function CutterDashboard() {
  // Authentication state (Firebase Authentication)
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(null);

  // Active Module State: "portal" (blank view after login) | "cutter" | "rubber"
  const [currentModule, setCurrentModule] = useState("portal");
  const [wsnNodes, setWsnNodes] = useState([]);
  const [wsnTelemetryLogs, setWsnTelemetryLogs] = useState([]);

  // Firebase Auth State Listener
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser({
          uid: user.uid,
          email: user.email,
          username: user.email ? user.email.split("@")[0] : "admin",
          role: "Plant Administrator",
          loginTime: getSLSTDate().timeString
        });
        setIsAuthenticated(true);
      } else {
        setCurrentUser(null);
        setIsAuthenticated(false);
        setCurrentModule("portal");
      }
      setIsAuthChecking(false);
    });
    return () => unsubAuth();
  }, []);

  // Real-time listener for Rubber IoT WSN Nodes & Telemetry
  useEffect(() => {
    const unsubNodes = onSnapshot(collection(db, "nodes"), (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setWsnNodes(list);
    });

    const qTel = query(collection(db, "telemetry"), limit(30));
    const unsubTel = onSnapshot(qTel, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setWsnTelemetryLogs(list);
    });

    return () => {
      unsubNodes();
      unsubTel();
    };
  }, []);

  const [currentTimeSLST, setCurrentTimeSLST] = useState(() => getSLSTDate());
  const todayStr = useMemo(() => getSLSTDate().dateString, [currentTimeSLST.dateString]);
  const yesterdayStr = useMemo(() => {
    const d = new Date(getSLSTDate().date.getTime() - 24 * 60 * 60 * 1000);
    return getSLSTDate(d).dateString;
  }, [currentTimeSLST.dateString]);
  const [selectedDate, setSelectedDate] = useState(() => getSLSTDate().dateString);

  // Machine & Data states
  const [selectedMachineId, setSelectedMachineId] = useState("rubberised_coir_cutter");
  const [machinesFleet, setMachinesFleet] = useState(SUPPORTED_MACHINES);
  const [machineOrderInput, setMachineOrderInput] = useState("");
  const [machineMeterCountInput, setMachineMeterCountInput] = useState("2.50");
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);
  const [assignmentSavedFeedback, setAssignmentSavedFeedback] = useState(false);

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

  // UI states
  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "machines" | "downtime" | "reports" | "performance"
  const [downtimeMachineId, setDowntimeMachineId] = useState("rubberised_coir_cutter");
  const [downtimeReason, setDowntimeReason] = useState("Blade Maintenance");
  const [downtimeCheckResult, setDowntimeCheckResult] = useState(null);
  const [reportTargetMachineId, setReportTargetMachineId] = useState("all");
  const [isPostingCut, setIsPostingCut] = useState(false);
  const [isUpdatingDowntime, setIsUpdatingDowntime] = useState(false);
  const [isCheckingDowntime, setIsCheckingDowntime] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);

  // Legacy production order fallback state
  const [productionOrder, setProductionOrder] = useState("");
  const [linearMetersPerHour, setLinearMetersPerHour] = useState("2.50");
  const [poNotes, setPoNotes] = useState("");
  const [isSavingPo, setIsSavingPo] = useState(false);
  const [poSavedFeedback, setPoSavedFeedback] = useState(false);

  // 24-Hour Production Plan with order number editable per hour
  const [hourlyPlans, setHourlyPlans] = useState(() =>
    Array.from({ length: 24 }).map((_, i) => ({
      hour: i,
      orderNumber: ""
    }))
  );
  const [bulkOrderNumber, setBulkOrderNumber] = useState("");
  const [isSavingHourlyPlans, setIsSavingHourlyPlans] = useState(false);
  const [hourlySavedFeedback, setHourlySavedFeedback] = useState(false);

  // Machine Master Details state (Dedicated view)
  const [masterMachineId, setMasterMachineId] = useState("rubberised_coir_cutter");
  const [masterMachineName, setMasterMachineName] = useState("Rubberised Coir Fleece Cutting Machine #1");
  const [masterMeterCount, setMasterMeterCount] = useState("2.50");
  const [masterOrderNumber, setMasterOrderNumber] = useState("");
  const [masterNotes, setMasterNotes] = useState("");
  const [isSavingMaster, setIsSavingMaster] = useState(false);
  const [masterSavedFeedback, setMasterSavedFeedback] = useState(false);

  // Archived Cuts Explorer state
  const [archiveMachineId, setArchiveMachineId] = useState("all");
  const [archiveFromDate, setArchiveFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return getSLSTDate(d).dateString;
  });
  const [archiveToDate, setArchiveToDate] = useState(() => getSLSTDate().dateString);
  const [archivedCutsList, setArchivedCutsList] = useState([]);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);
  const [archiveSearchTerm, setArchiveSearchTerm] = useState("");
  const [archiveHasSearched, setArchiveHasSearched] = useState(false);

  const showNotice = (variant, title, message) => {
    setActionNotice({ variant, title, message });
    setTimeout(() => setActionNotice(null), 4500);
  };

  // Login & Logout handlers via Firebase Authentication
  const handleLoginSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    const cleanUser = String(usernameInput || "").trim();
    const cleanPass = String(passwordInput || "").trim();

    if (!cleanUser || !cleanPass) {
      setLoginError("Please enter your email or username and password.");
      setIsLoggingIn(false);
      return;
    }

    // Map bare username (e.g. 'admin') to email ('admin@gmail.com')
    const emailToUse = cleanUser.includes("@") ? cleanUser : `${cleanUser}@gmail.com`;

    try {
      const userCred = await signInWithEmailAndPassword(auth, emailToUse, cleanPass);
      setCurrentUser({
        uid: userCred.user.uid,
        email: userCred.user.email,
        username: userCred.user.email ? userCred.user.email.split("@")[0] : cleanUser,
        role: "Plant Administrator",
        loginTime: getSLSTDate().timeString
      });
      setIsAuthenticated(true);
      setLoginError(null);
    } catch (err) {
      console.error("Firebase auth error:", err);
      let msg = "Authentication failed. Please verify your credentials.";
      if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/wrong-password" ||
        err.code === "auth/user-not-found"
      ) {
        msg = "Invalid email/username or password. Please try again.";
      } else if (err.code === "auth/too-many-requests") {
        msg = "Access temporarily disabled due to many failed login attempts. Please try again later.";
      } else if (err.message) {
        msg = err.message;
      }
      setLoginError(msg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Firebase sign out error:", err);
    }
    setIsAuthenticated(false);
    setCurrentUser(null);
    setUsernameInput("");
    setPasswordInput("");
  };

  // 1. Live SLST Clock Ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeSLST(getSLSTDate());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Real-time Multi-Machine Fleet & Selected Machine Listener
  useEffect(() => {
    const unsubFleet = onSnapshot(collection(db, "machines"), (snap) => {
      const map = {};
      snap.forEach((d) => {
        map[d.id] = { id: d.id, ...d.data() };
      });
      const list = SUPPORTED_MACHINES.map((def) => {
        const item = map[def.machineId] || {};
        return {
          id: def.machineId,
          machineId: def.machineId,
          machineName: item.machineName || def.machineName,
          company: item.company || def.company,
          sector: item.sector || def.sector,
          status: item.status || "RUNNING",
          meterCount: item.meterCount !== undefined ? Number(item.meterCount) : def.defaultMeterCount,
          currentProductionOrder: item.currentProductionOrder || {
            orderNumber: def.defaultOrderNumber || "",
            meterCount: def.defaultMeterCount
          },
          lastCutTime: item.lastCutTime || null,
          lastPost: item.lastPost || 1
        };
      });
      setMachinesFleet(list);
    });

    return () => unsubFleet();
  }, []);

  useEffect(() => {
    const machineRef = doc(db, "machines", selectedMachineId);
    const unsubMachine = onSnapshot(machineRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMachineState((prev) => ({ ...prev, ...data }));
        // Strict date check: fresh set of orders per day, never carried over from previous days
        let ord = "";
        if (data.currentProductionOrder?.orderNumber) {
          const ordDate = data.currentProductionOrder.date || (data.currentProductionOrder.updatedAt ? data.currentProductionOrder.updatedAt.slice(0, 10) : "");
          if (ordDate === selectedDate) {
            ord = data.currentProductionOrder.orderNumber;
          }
        }
        setMachineOrderInput(ord || "");
        setProductionOrder(ord || "");
        if (data.meterCount !== undefined) {
          setMachineMeterCountInput(String(data.meterCount));
          setLinearMetersPerHour(String(data.meterCount));
        }
      } else {
        setMachineOrderInput("");
        setProductionOrder("");
      }
    });
    return () => unsubMachine();
  }, [selectedMachineId, selectedDate]);

  // 3. Real-time Cuts & Downtime Listeners for Selected Date
  useEffect(() => {
    const cutsQ = query(collection(db, "cuts"), where("date", "==", selectedDate));
    const unsubCuts = onSnapshot(cutsQ, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
      setCutsLog(list);
    });

    const dtQ = query(collection(db, "downtime"), where("date", "==", selectedDate));
    const unsubDt = onSnapshot(dtQ, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.startMs || 0) - (a.startMs || 0));
      setDowntimesList(list);
    });

    return () => {
      unsubCuts();
      unsubDt();
    };
  }, [selectedDate]);

  // 4. Real-time Stored Reports Listener
  useEffect(() => {
    const repQ = query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(15));
    const unsubRep = onSnapshot(repQ, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setStoredReports(list);
    });
    return () => unsubRep();
  }, []);

  // 5. Real-time Production Order & Linear Meters Configuration Listener
  useEffect(() => {
    const unsubPo = onSnapshot(doc(db, "settings", "production_order"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.orderNumber !== undefined) setProductionOrder(data.orderNumber);
        if (data.linearMetersPerHour !== undefined) setLinearMetersPerHour(String(data.linearMetersPerHour));
        if (data.notes !== undefined) setPoNotes(data.notes);
      }
    });
    return () => unsubPo();
  }, []);

  // 6. Real-time Daily 24-Hour Production Plan Listener (per machine & date)
  useEffect(() => {
    const planDocId = selectedMachineId ? `${selectedDate}_${selectedMachineId}` : selectedDate;
    const unsubPlan = onSnapshot(doc(db, "daily_production_plan", planDocId), (snap) => {
      if (snap.exists() && Array.isArray(snap.data().hourlyPlans)) {
        const incoming = snap.data().hourlyPlans;
        setHourlyPlans(
          Array.from({ length: 24 }).map((_, i) => ({
            hour: i,
            orderNumber: incoming[i]?.orderNumber !== undefined ? String(incoming[i].orderNumber) : ""
          }))
        );
      } else if (selectedMachineId === "rubberised_coir_cutter") {
        // Fallback to legacy document for primary machine
        getDoc(doc(db, "daily_production_plan", selectedDate)).then((fallbackSnap) => {
          if (fallbackSnap.exists() && Array.isArray(fallbackSnap.data().hourlyPlans)) {
            const incoming = fallbackSnap.data().hourlyPlans;
            setHourlyPlans(
              Array.from({ length: 24 }).map((_, i) => ({
                hour: i,
                orderNumber: incoming[i]?.orderNumber !== undefined ? String(incoming[i].orderNumber) : ""
              }))
            );
          } else {
            // Fresh day: clean slate for orders
            setHourlyPlans(Array.from({ length: 24 }).map((_, i) => ({ hour: i, orderNumber: "" })));
          }
        });
      } else {
        // Fresh day: clean slate for orders
        setHourlyPlans(Array.from({ length: 24 }).map((_, i) => ({ hour: i, orderNumber: "" })));
      }
    });
    return () => unsubPlan();
  }, [selectedDate, selectedMachineId]);

  // Handlers for Hourly Production Plan
  const handleHourlyPlanChange = (hourIndex, field, value) => {
    setHourlyPlans((prev) => {
      const copy = [...prev];
      copy[hourIndex] = {
        ...copy[hourIndex],
        [field]: value
      };
      return copy;
    });
  };

  const handleApplyBulkToAll = () => {
    const orderToApply = activeOrderNumber.trim();
    setHourlyPlans((prev) =>
      prev.map((item) => ({
        ...item,
        orderNumber: orderToApply
      }))
    );
    showNotice("info", "Applied to All Hours", `Applied machine active order #${orderToApply} to all 24 hours. Click '💾 Save Hourly Plan' to persist.`);
  };

  const handleApplyToEmptyOnly = () => {
    const orderToApply = activeOrderNumber.trim();
    setHourlyPlans((prev) =>
      prev.map((item) => ({
        ...item,
        orderNumber: item.orderNumber && item.orderNumber.trim() ? item.orderNumber : orderToApply
      }))
    );
    showNotice("info", "Populated Empty Hours", `Filled empty hours with machine active order #${orderToApply}. Click '💾 Save Hourly Plan' to persist.`);
  };

  const handleSaveAllHourlyPlans = async () => {
    setIsSavingHourlyPlans(true);
    try {
      await saveHourlyProductionPlan(selectedDate, hourlyPlans, selectedMachineId);
      showNotice(
        "success",
        "Hourly Production Plan Saved",
        `Hourly production orders for ${selectedDate} on ${currentMachineDef.machineName} saved to database.`
      );
      setHourlySavedFeedback(true);
      setTimeout(() => setHourlySavedFeedback(false), 3500);
    } catch (err) {
      showNotice("danger", "Failed to save hourly plan", err.message);
    } finally {
      setIsSavingHourlyPlans(false);
    }
  };

  // Derived Volume Metrics: Count captured on hourly basis (1 post = 1 cut)
  const volumeStats = useMemo(() => {
    const hourlyCuts = Array(24).fill(0);
    const hourlySignals = Array(24).fill(0);
    let totalCuts = 0;
    let totalSignals = 0;

    cutsLog.forEach((c) => {
      const postVal = c.post !== undefined ? Number(c.post) : 1;
      if (postVal === 1) {
        const cutsForEntry = c.cutsAdded !== undefined ? Number(c.cutsAdded) : CUTS_PER_POST;
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

    return {
      hourlyCuts,
      hourlySignals,
      totalCuts,
      totalSignals,
      currentHourCuts,
      peakHour,
      peakCount,
      maxHourly
    };
  }, [cutsLog, currentTimeSLST.hour]);

  // Save Production Order & Linear Meters
  const handleSaveProductionOrder = async (e) => {
    if (e) e.preventDefault();
    setIsSavingPo(true);
    try {
      const res = await saveProductionOrder({
        orderNumber: productionOrder,
        linearMetersPerHour: Number(linearMetersPerHour) || 0,
        notes: poNotes
      });
      showNotice(
        "success",
        "Production Order Saved",
        `Order #${res.orderNumber || "N/A"} with ${res.linearMetersPerHour} linear meters/cut applied to hourly counts.`
      );
      setPoSavedFeedback(true);
      setTimeout(() => setPoSavedFeedback(false), 3500);
    } catch (err) {
      showNotice("danger", "Failed to save order", err.message);
    } finally {
      setIsSavingPo(false);
    }
  };

  // Active Downtime Detection (Machine-specific)
  const downtimeMachineDef = useMemo(() => {
    return (
      machinesFleet.find((m) => m.machineId === downtimeMachineId) ||
      SUPPORTED_MACHINES.find((m) => m.machineId === downtimeMachineId) ||
      SUPPORTED_MACHINES[0]
    );
  }, [machinesFleet, downtimeMachineId]);

  const activeDowntime = useMemo(() => {
    const fromList = downtimesList.find(
      (d) =>
        d.active === true &&
        (d.machineId === downtimeMachineId ||
          (!d.machineId && downtimeMachineId === "rubberised_coir_cutter"))
    );
    if (fromList) return fromList;
    if (
      downtimeMachineId === selectedMachineId &&
      machineState.status === "DOWNTIME" &&
      machineState.activeDowntime?.active
    ) {
      return machineState.activeDowntime;
    }
    return null;
  }, [downtimesList, downtimeMachineId, selectedMachineId, machineState]);

  const activeDowntimeElapsedSec = useMemo(() => {
    if (!activeDowntime || !activeDowntime.startMs) return 0;
    return Math.max(0, Math.floor((currentTimeSLST.timestampMs - Number(activeDowntime.startMs)) / 1000));
  }, [activeDowntime, currentTimeSLST.timestampMs]);

  const totalDowntimeMinutes = useMemo(() => {
    let mins = 0;
    downtimesList.forEach((dt) => {
      if (dt.active && dt.startMs) {
        mins += Math.max(0, currentTimeSLST.timestampMs - Number(dt.startMs)) / 60000;
      } else {
        mins += Number(dt.durationMinutes || 0);
      }
    });
    return parseFloat(mins.toFixed(1));
  }, [downtimesList, currentTimeSLST.timestampMs]);

  const formatElapsed = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Handlers
  const currentMachineDef = useMemo(() => {
    return (
      machinesFleet.find((m) => m.machineId === selectedMachineId) ||
      SUPPORTED_MACHINES.find((m) => m.machineId === selectedMachineId) ||
      SUPPORTED_MACHINES[0]
    );
  }, [machinesFleet, selectedMachineId]);

  const assignedMeterCountNum = useMemo(() => {
    const n = Number(machineMeterCountInput);
    if (!isNaN(n) && n > 0) return n;
    return Number(currentMachineDef?.meterCount) || currentMachineDef?.defaultMeterCount || 2.50;
  }, [machineMeterCountInput, currentMachineDef]);

  const activeOrderNumber = useMemo(() => {
    return (
      currentMachineDef?.currentProductionOrder?.orderNumber ||
      currentMachineDef?.defaultOrderNumber ||
      ""
    );
  }, [currentMachineDef]);

  // Filter cuts for selected machine
  const selectedMachineCuts = useMemo(() => {
    return cutsLog.filter(
      (c) =>
        c.machineId === selectedMachineId ||
        (!c.machineId && selectedMachineId === "rubberised_coir_cutter")
    );
  }, [cutsLog, selectedMachineId]);

  // Unified Volume & Linear Meters Breakdown for selected machine
  // Linear Meters = Hour Cuts × Machine Master Assigned Meter Count
  const unifiedVolumeStats = useMemo(() => {
    const hourlyCuts = Array(24).fill(0);
    const hourlySignals = Array(24).fill(0);
    let totalCuts = 0;

    selectedMachineCuts.forEach((c) => {
      const h = Number(c.hour);
      const cutsAdded = c.cutsAdded !== undefined ? Number(c.cutsAdded) : CUTS_PER_POST;
      if (!isNaN(h) && h >= 0 && h < 24) {
        hourlyCuts[h] += cutsAdded;
        hourlySignals[h] += 1;
      }
      totalCuts += cutsAdded;
    });

    let calculatedTotalLinearMeters = 0;
    const perHourRows = Array.from({ length: 24 }).map((_, h) => {
      const cuts = hourlyCuts[h] || 0;
      const plan = hourlyPlans[h] || {};
      const orderNumber = plan.orderNumber ? String(plan.orderNumber).trim() : "";
      const meterCount = assignedMeterCountNum;
      const linearMeters = Number((cuts * meterCount).toFixed(2));
      calculatedTotalLinearMeters += linearMeters;
      return {
        hour: h,
        cuts,
        signals: hourlySignals[h] || 0,
        meterCount,
        orderNumber,
        linearMeters
      };
    });

    const currentHourCuts = hourlyCuts[currentTimeSLST.hour] || 0;
    const currentHourLinearMeters = Number((currentHourCuts * assignedMeterCountNum).toFixed(2));
    const totalLinearMetersToday = Number(calculatedTotalLinearMeters.toFixed(2));

    let peakHour = 0;
    let peakCount = 0;
    hourlyCuts.forEach((val, h) => {
      if (val > peakCount) {
        peakCount = val;
        peakHour = h;
      }
    });

    return {
      hourlyCuts,
      hourlySignals,
      totalCuts,
      currentHourCuts,
      currentHourLinearMeters,
      totalLinearMetersToday,
      peakHour,
      peakCount,
      perHourRows
    };
  }, [selectedMachineCuts, currentTimeSLST.hour, assignedMeterCountNum, hourlyPlans]);

  // Fleet Overview statistics (for multi-machine cards strip)
  const fleetOverviewStats = useMemo(() => {
    return SUPPORTED_MACHINES.map((def) => {
      const mDoc = machinesFleet.find((m) => m.machineId === def.machineId) || {};
      const mCuts = cutsLog
        .filter(
          (c) =>
            c.machineId === def.machineId ||
            (!c.machineId && def.machineId === "rubberised_coir_cutter")
        )
        .reduce((sum, c) => sum + (c.cutsAdded !== undefined ? Number(c.cutsAdded) : 1), 0);
      const mFactor =
        mDoc.meterCount !== undefined ? Number(mDoc.meterCount) : def.defaultMeterCount;
      const mMeters = Number((mCuts * mFactor).toFixed(2));
      const mOrder = mDoc.currentProductionOrder?.orderNumber || "";
      const mStatus = mDoc.status || "RUNNING";

      return {
        ...def,
        status: mStatus,
        meterCount: mFactor,
        orderNumber: mOrder,
        todayCuts: mCuts,
        todayLinearMeters: mMeters,
        isSelected: def.machineId === selectedMachineId
      };
    });
  }, [machinesFleet, cutsLog, selectedMachineId]);

  const handleSaveMachineAssignment = async (e) => {
    if (e) e.preventDefault();
    setIsSavingAssignment(true);
    setAssignmentSavedFeedback(false);
    try {
      const countVal = Number(machineMeterCountInput);
      const res = await saveMachineAssignment({
        machineId: selectedMachineId,
        orderNumber: machineOrderInput,
        meterCount: !isNaN(countVal) && countVal > 0 ? countVal : 2.50
      });
      setAssignmentSavedFeedback(true);
      showNotice(
        "success",
        "Machine Assignment Updated",
        `Assigned Production Order ${res.orderNumber || "PO"} with ${res.meterCount.toFixed(2)} m/pulse to ${currentMachineDef.machineName}.`
      );
      setTimeout(() => setAssignmentSavedFeedback(false), 3500);
    } catch (err) {
      showNotice("danger", "Save Failed", err.message || "Failed to update machine assignment.");
    } finally {
      setIsSavingAssignment(false);
    }
  };

  const handleTriggerPostSignal = async () => {
    setIsPostingCut(true);
    try {
      const res = await postCutterSignal({ machineId: selectedMachineId });
      showNotice(
        "success",
        "Encoder Pulse Logged",
        `Recorded 1 encoder pulse on ${currentMachineDef.machineName}. Linear meters calculated: ${res.linearMetersProduced || (1 * assignedMeterCountNum).toFixed(2)}m.`
      );
    } catch (err) {
      showNotice("danger", "Signal Failed", err.message || "Could not log encoder signal.");
    } finally {
      setIsPostingCut(false);
    }
  };

  // Select and load a machine into Master Details Editor
  const handleSelectMasterMachine = (machId) => {
    setMasterMachineId(machId);
    const m =
      machinesFleet.find((x) => x.machineId === machId) ||
      SUPPORTED_MACHINES.find((x) => x.machineId === machId);
    if (m) {
      setMasterMachineName(m.machineName || "");
      setMasterMeterCount(String(m.meterCount !== undefined ? m.meterCount : m.defaultMeterCount || 2.50));
      setMasterOrderNumber(
        m.currentProductionOrder?.orderNumber ||
        m.defaultOrderNumber ||
        ""
      );
      setMasterNotes(m.notes || "");
    }
  };

  // Sync Machine Master Details Editor ONLY when masterMachineId changes (not on background fleet polling)
  useEffect(() => {
    const m =
      machinesFleet.find((x) => x.machineId === masterMachineId) ||
      SUPPORTED_MACHINES.find((x) => x.machineId === masterMachineId);
    if (m) {
      setMasterMachineName(m.machineName || "");
      setMasterMeterCount(String(m.meterCount !== undefined ? m.meterCount : m.defaultMeterCount || 2.50));
      setMasterOrderNumber(
        m.currentProductionOrder?.orderNumber ||
        m.defaultOrderNumber ||
        ""
      );
      setMasterNotes(m.notes || "");
    }
  }, [masterMachineId]);

  const handleSaveMasterDetails = async (e) => {
    if (e) e.preventDefault();
    const cleanId = masterMachineId.trim();
    if (!cleanId) {
      showNotice("warning", "Machine Code Required", "Please enter a valid Machine Identifier (Code).");
      return;
    }

    setIsSavingMaster(true);
    setMasterSavedFeedback(false);
    try {
      const rate = Number(masterMeterCount) || 2.50;
      const cleanOrder = masterOrderNumber.trim();
      await saveMachineMasterDetails({
        machineId: cleanId,
        machineName: masterMachineName.trim(),
        meterCount: rate,
        defaultMeterCount: rate,
        orderNumber: cleanOrder,
        notes: masterNotes.trim()
      });

      // Update local fleet state immediately
      setMachinesFleet((prev) => {
        const exists = prev.some((m) => m.machineId === cleanId);
        if (exists) {
          return prev.map((m) =>
            m.machineId === cleanId
              ? {
                  ...m,
                  machineName: masterMachineName.trim(),
                  meterCount: rate,
                  notes: masterNotes.trim(),
                  ...(cleanOrder ? { currentProductionOrder: { ...(m.currentProductionOrder || {}), orderNumber: cleanOrder, meterCount: rate } } : {})
                }
              : m
          );
        } else {
          return [
            ...prev,
            {
              id: cleanId,
              machineId: cleanId,
              machineName: masterMachineName.trim(),
              meterCount: rate,
              defaultMeterCount: rate,
              notes: masterNotes.trim(),
              currentProductionOrder: { orderNumber: cleanOrder || "", meterCount: rate },
              status: "RUNNING"
            }
          ];
        }
      });

      if (cleanId === selectedMachineId && cleanOrder) {
        setMachineOrderInput(cleanOrder);
        setProductionOrder(cleanOrder);
      }

      setMasterSavedFeedback(true);
      showNotice(
        "success",
        "Machine Master Saved",
        `Master profile for ${masterMachineName} (${rate.toFixed(2)} m/pulse) saved to database.`
      );
      setTimeout(() => setMasterSavedFeedback(false), 3500);
    } catch (err) {
      showNotice("danger", "Master Save Failed", err.message);
    } finally {
      setIsSavingMaster(false);
    }
  };

  const handlePostOneSignal = async () => {
    try {
      setIsPostingCut(true);
      await postCutterSignal({ machineId: selectedMachineId });
      showNotice(
        "success",
        "Encoder Pulse Logged (+1 Pulse)",
        `Recorded 1 encoder pulse on ${currentMachineDef.machineName} for ${String(currentTimeSLST.hour).padStart(2, "0")}:00 hourly volume.`
      );
    } catch (err) {
      showNotice("danger", "Failed to Log Encoder Pulse", err.message);
    } finally {
      setIsPostingCut(false);
    }
  };

  const handleStartDowntime = async () => {
    if (activeDowntime) {
      showNotice("warning", "Downtime Already Active", `Please end the current downtime on ${downtimeMachineDef.machineName} first.`);
      return;
    }
    try {
      setIsUpdatingDowntime(true);
      const res = await postDowntimeStart(downtimeReason || "Machine Downtime", "web", downtimeMachineId);
      showNotice(
        "warning",
        "Downtime Started",
        `Downtime active for ${downtimeMachineDef.machineName} (${res.downtime?.reason || downtimeReason}).`
      );
      const statusCheck = await checkDowntimeStatus(selectedDate, downtimeMachineId);
      setDowntimeCheckResult(statusCheck);
    } catch (err) {
      showNotice("danger", "Failed to Start Downtime", err.message);
    } finally {
      setIsUpdatingDowntime(false);
    }
  };

  const handleEndDowntime = async (specificId = null, targetMachine = downtimeMachineId) => {
    try {
      setIsUpdatingDowntime(true);
      const targetId = specificId || activeDowntime?.id || null;
      const res = await postDowntimeEnd({
        downtimeId: targetId,
        resolvedBy: "Ended via Portal",
        machineId: targetMachine
      });
      const dur = res.downtimeResolved?.durationSeconds !== undefined
        ? `${res.downtimeResolved.durationSeconds}s (${res.downtimeResolved.durationMinutes}m)`
        : "Resolved";
      showNotice("success", "Downtime Ended", `Equipment is back to RUNNING (${dur}).`);
      const statusCheck = await checkDowntimeStatus(selectedDate, targetMachine);
      setDowntimeCheckResult(statusCheck);
    } catch (err) {
      showNotice("danger", "Failed to End Downtime", err.message);
    } finally {
      setIsUpdatingDowntime(false);
    }
  };

  const handleCheckDowntimeApi = async () => {
    try {
      setIsCheckingDowntime(true);
      const res = await checkDowntimeStatus(selectedDate, downtimeMachineId);
      setDowntimeCheckResult(res);
      showNotice(
        res.hasActiveDowntime ? "warning" : "info",
        `Downtime Status: ${downtimeMachineDef.machineName}`,
        res.hasActiveDowntime
          ? `Active Incident: "${res.activeDowntime?.reason}" (Started at ${res.activeDowntime?.startTimeStr})`
          : `Operational (Running). Total downtimes today: ${res.totalDowntimesCount}`
      );
    } catch (err) {
      showNotice("danger", "Status Check Failed", err.message);
    } finally {
      setIsCheckingDowntime(false);
    }
  };

  const handleGeneratePdf = async (type = "hourly", targetDate = selectedDate, targetMachine = reportTargetMachineId) => {
    try {
      setIsGeneratingReport(true);
      const res = await generatePdfReport(targetDate, type, targetMachine);
      const scopeLabel = targetMachine === "all" ? "Consolidated Fleet" : "Equipment";
      showNotice(
        "success",
        "PDF Report Ready",
        `Generated ${scopeLabel} ${type === "downtime" ? "Downtime Logs" : "Hourly Production & Encoder Pulses"} report (${targetDate}).`
      );
    } catch (err) {
      showNotice("danger", "Report Error", err.message || "Failed to generate report.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleDeleteReport = async (reportId, fileName) => {
    if (!window.confirm(`Are you sure you want to delete report "${fileName || reportId}"?`)) {
      return;
    }
    setDeletingReportId(reportId);
    try {
      const res = await deleteStoredReport(reportId);
      if (res && res.success) {
        showNotice("success", "Report Deleted", `Report removed from Firestore & Cloud Storage.`);
      } else {
        showNotice("warning", "Notice", res?.message || "Could not delete report.");
      }
    } catch (err) {
      showNotice("danger", "Delete Failed", err.message || "Failed to delete report.");
    } finally {
      setDeletingReportId(null);
    }
  };

  const handleRetrieveArchivedCuts = async () => {
    setIsLoadingArchive(true);
    setArchiveHasSearched(true);
    try {
      const results = await fetchArchivedCutsByRange(archiveFromDate, archiveToDate, archiveMachineId);
      setArchivedCutsList(results);
      showNotice("success", "Archived Cuts Retrieved", `Retrieved ${results.length} historical cut records.`);
    } catch (err) {
      console.error("Failed to retrieve archived cuts:", err);
      showNotice("danger", "Retrieval Error", err.message || "Failed to retrieve archived cuts.");
    } finally {
      setIsLoadingArchive(false);
    }
  };

  const handleExportArchiveCsv = () => {
    if (!archivedCutsList.length) return;
    const headers = [
      "Record ID",
      "Date",
      "Time (SLST)",
      "Machine ID",
      "Machine Name",
      "Production Order",
      "Cuts Added",
      "Meter Count Factor",
      "Linear Meters Produced",
      "Status Description",
      "Archived Source"
    ];
    const rows = archivedCutsList.map((c, i) => [
      c.id || `REC-${i + 1}`,
      c.date || "",
      c.timeString || (c.timestamp ? c.timestamp.slice(11, 19) : ""),
      c.machineId || "rubberised_coir_cutter",
      `"${(c.machineName || "Rubberised Coir Fleece Cutting Machine #1").replace(/"/g, '""')}"`,
      `"${(c.productionOrder || "").replace(/"/g, '""')}"`,
      c.cutsAdded || 1,
      c.meterCount || 2.50,
      c.linearMetersProduced || Number(((c.cutsAdded || 1) * (c.meterCount || 2.50)).toFixed(2)),
      `"${(c.statusDescription || "").replace(/"/g, '""')}"`,
      c.source || "archive"
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `ToyoCushion_ArchivedCuts_${archiveMachineId}_${archiveFromDate}_to_${archiveToDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredArchivedCuts = useMemo(() => {
    if (!archiveSearchTerm.trim()) return archivedCutsList;
    const term = archiveSearchTerm.toLowerCase();
    return archivedCutsList.filter(
      (c) =>
        (c.productionOrder && c.productionOrder.toLowerCase().includes(term)) ||
        (c.machineName && c.machineName.toLowerCase().includes(term)) ||
        (c.machineId && c.machineId.toLowerCase().includes(term)) ||
        (c.date && c.date.includes(term)) ||
        (c.statusDescription && c.statusDescription.toLowerCase().includes(term))
    );
  }, [archivedCutsList, archiveSearchTerm]);

  const archiveSummary = useMemo(() => {
    let totalCuts = 0;
    let totalLinearMeters = 0;
    const distinctOrders = new Set();
    const distinctMachines = new Set();
    for (const c of archivedCutsList) {
      const cuts = c.cutsAdded || 1;
      totalCuts += cuts;
      totalLinearMeters += c.linearMetersProduced || Number((cuts * (c.meterCount || 2.5)).toFixed(2));
      if (c.productionOrder) distinctOrders.add(c.productionOrder);
      if (c.machineId) distinctMachines.add(c.machineId);
    }
    return {
      totalCuts,
      totalLinearMeters: Number(totalLinearMeters.toFixed(2)),
      distinctOrdersCount: distinctOrders.size,
      distinctMachinesCount: distinctMachines.size
    };
  }, [archivedCutsList]);

  // =========================================================================
  // 1. LOGIN SCREEN GATE (Firebase Authentication)
  // =========================================================================
  if (isAuthChecking) {
    return (
      <div className="wb-login-wrapper d-flex align-items-center justify-content-center">
        <div className="text-center p-4">
          <Spinner animation="border" variant="primary" className="mb-2" />
          <div className="text-muted small fw-semibold">Connecting to telemetry network...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="wb-login-wrapper">
        <Card className="wb-login-card border-0">
          <div className="p-4 p-sm-5 text-center">
            {/* General Telemetry & WSN Equipment Logo */}
            <div className="mb-3 d-inline-block">
              <div 
                className="rounded-4 shadow-sm p-3 bg-primary bg-gradient text-white d-inline-flex align-items-center justify-content-center border"
                style={{ width: 64, height: 64 }}
              >
                <i className="bi bi-cpu-fill fs-2"></i>
              </div>
            </div>

            <div className="badge bg-primary bg-opacity-10 text-primary px-3 py-1.5 rounded-pill mb-2 fw-bold text-uppercase" style={{ fontSize: "0.72rem", letterSpacing: "0.06em" }}>
              Hayleys Eco Solutions Katana IOT implementation
            </div>

            <h3 className="fw-bold text-dark mb-1 fs-4 fs-sm-3">
              Katana IoT Portal
            </h3>
            <p className="text-secondary small mb-4">
              Real-time Industrial Telemetry &amp; WSN Systems
            </p>

            {loginError && (
              <Alert variant="danger" className="d-flex align-items-center gap-2 py-2 px-3 small rounded-3 mb-3 text-start">
                <i className="bi bi-exclamation-triangle-fill text-danger flex-shrink-0"></i>
                <div>{loginError}</div>
              </Alert>
            )}

            <Form onSubmit={handleLoginSubmit} className="text-start">
              <Form.Group className="mb-3" controlId="loginUsername">
                <Form.Label className="small fw-bold text-secondary text-uppercase" style={{ fontSize: "0.75rem" }}>
                  Email or Username
                </Form.Label>
                <InputGroup>
                  <InputGroup.Text className="bg-light border-end-0 text-muted">
                    <i className="bi bi-person fs-6"></i>
                  </InputGroup.Text>
                  <Form.Control
                    type="text"
                    placeholder="Enter email or username"
                    value={usernameInput}
                    onChange={(e) => {
                      setUsernameInput(e.target.value);
                      if (loginError) setLoginError(null);
                    }}
                    autoComplete="username"
                    className="bg-light border-start-0 py-2 fs-7"
                    required
                  />
                </InputGroup>
              </Form.Group>

              <Form.Group className="mb-4" controlId="loginPassword">
                <Form.Label className="small fw-bold text-secondary text-uppercase" style={{ fontSize: "0.75rem" }}>
                  Password
                </Form.Label>
                <InputGroup>
                  <InputGroup.Text className="bg-light border-end-0 text-muted">
                    <i className="bi bi-lock fs-6"></i>
                  </InputGroup.Text>
                  <Form.Control
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter password"
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      if (loginError) setLoginError(null);
                    }}
                    autoComplete="current-password"
                    className="bg-light border-start-0 border-end-0 py-2 fs-7"
                    required
                  />
                  <Button
                    variant="light"
                    type="button"
                    className="border border-start-0 text-muted px-3"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    <i className={showPassword ? "bi bi-eye-slash" : "bi bi-eye"}></i>
                  </Button>
                </InputGroup>
              </Form.Group>

              <div className="d-grid mb-2">
                <Button 
                  variant="primary" 
                  size="lg" 
                  type="submit" 
                  disabled={isLoggingIn}
                  className="fw-bold shadow-sm py-2.5 d-flex align-items-center justify-content-center gap-2"
                  style={{ fontSize: "0.95rem" }}
                >
                  {isLoggingIn ? (
                    <>
                      <Spinner size="sm" className="me-2" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <i className="bi bi-box-arrow-in-right fs-5"></i>
                      <span>Sign In to Dashboard</span>
                    </>
                  )}
                </Button>
              </div>
            </Form>
          </div>
        </Card>

        {/* Live SLST Clock pill on login page */}
        <div className="badge bg-white text-secondary border px-3 py-2 font-monospace fw-semibold shadow-sm mt-3 d-inline-flex align-items-center gap-1.5">
          <i className="bi bi-clock text-primary"></i>
          <span>Sri Lanka Standard Time: {currentTimeSLST.timeString} (+05:30)</span>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. KATANA IOT PORTAL HUB - MODULE SELECTOR (Blank View with 2 Creative Buttons)
  // =========================================================================
  if (currentModule === "portal") {
    return (
      <div className="katana-portal-wrapper min-vh-100 d-flex flex-column">
        {/* Top Header */}
        <header className="wb-header">
          <div className="container-fluid p-0 d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div className="d-flex align-items-center gap-2.5">
              <div className="wb-logo-box shadow-sm bg-primary text-white d-flex align-items-center justify-content-center">
                <i className="bi bi-cpu-fill fs-5"></i>
              </div>
              <div>
                <div className="fw-bold text-dark lh-sm fs-6 fs-sm-5 text-truncate" style={{ maxWidth: 320 }}>
                  Katana IoT Portal
                </div>
                <div className="text-primary text-uppercase fw-bold" style={{ fontSize: "0.65rem", letterSpacing: "0.05em" }}>
                  Hayleys Eco Solutions Katana IOT implementation
                </div>
              </div>
            </div>

            <div className="d-flex align-items-center gap-2.5 flex-wrap ms-auto">
              {/* Live SLST Date & Time */}
              <div className="badge bg-white text-secondary border px-2.5 py-1.5 font-monospace fw-semibold shadow-sm d-none d-md-inline-flex align-items-center">
                <i className="bi bi-clock text-primary me-2"></i>
                <span>{currentTimeSLST.timeString} (+05:30)</span>
              </div>

              {/* User Profile & Sign Out */}
              <div className="d-flex align-items-center gap-2 border-start ps-3 ms-2">
                <div
                  className="rounded-circle bg-primary text-white fw-bold d-flex align-items-center justify-content-center shadow-sm"
                  style={{ width: 30, height: 30, fontSize: "0.8rem" }}
                  title={currentUser?.email || "Operator"}
                >
                  {(currentUser?.username || "A").charAt(0).toUpperCase()}
                </div>
                <Button
                  variant="outline-danger"
                  size="sm"
                  className="fw-semibold px-2.5 py-1 d-flex align-items-center"
                  onClick={handleLogout}
                  style={{ fontSize: "0.78rem" }}
                >
                  <i className="bi bi-box-arrow-right me-1.5"></i>
                  <span className="d-none d-sm-inline">Sign Out</span>
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Blank View with 2 Creative Navigation Buttons */}
        <Container className="flex-grow-1 d-flex flex-column justify-content-center py-5">
          <div className="text-center mb-5 mx-auto" style={{ maxWidth: 680 }}>
            <div className="badge bg-primary bg-opacity-10 text-primary px-3 py-1.5 rounded-pill mb-2 fw-bold text-uppercase" style={{ fontSize: "0.75rem", letterSpacing: "0.06em" }}>
              Katana Manufacturing Facility • IOT Hub
            </div>
            <h2 className="fw-bold text-dark mb-2 fs-3 fs-md-2">
              Hayleys Eco Solutions Katana IOT implementation
            </h2>
            <p className="text-secondary small mb-0">
              Welcome to the central industrial telemetry network. Choose an operational IoT implementation below to access real-time monitoring and equipment telemetry:
            </p>
          </div>

          <Row className="g-4 justify-content-center">
            {/* 1. Toyo Cutter IoT Implementation Card */}
            <Col xs={12} md={6} lg={5}>
              <div className="katana-module-card cutter h-100">
                <div>
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    {/* Unique Favicon: Rotary Cutter Blades */}
                    <div className="katana-icon-box katana-icon-cutter shadow-sm">
                      <i className="bi bi-scissors fs-1"></i>
                    </div>
                    <Badge bg="primary" className="px-3 py-1.5 rounded-pill text-uppercase fw-semibold" style={{ fontSize: "0.7rem", letterSpacing: "0.04em" }}>
                      ● 3 Lines Monitored
                    </Badge>
                  </div>

                  <h4 className="fw-bold text-dark mb-1 fs-5">
                    Toyo Cutter IOT Implementation
                  </h4>
                  <div className="text-primary fw-semibold small mb-3">
                    Toyo Cushion Lanka • Coir Fleece Processing Lines
                  </div>

                  <p className="text-secondary small mb-4">
                    Continuous rotary encoder telemetry for fleece cutting equipment. Tracks calibrated linear meters (m = pulses × factor), per-hour production orders, machine downtimes, and generates single-page audit PDF reports.
                  </p>

                  <div className="p-3 bg-light rounded-3 small mb-4 border">
                    <div className="d-flex justify-content-between py-1 border-bottom">
                      <span className="text-muted">Monitored Lines:</span>
                      <strong className="text-dark">3 Cutting &amp; Trimming Machines</strong>
                    </div>
                    <div className="d-flex justify-content-between py-1 border-bottom">
                      <span className="text-muted">Telemetry Rule:</span>
                      <strong className="text-primary font-monospace">1 Pulse = Configured Meters</strong>
                    </div>
                    <div className="d-flex justify-content-between py-1">
                      <span className="text-muted">Reporting:</span>
                      <strong className="text-dark">Single-Page Audit PDF Engine</strong>
                    </div>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  className="w-100 fw-bold py-2.5 rounded-3 shadow-sm d-flex align-items-center justify-content-center gap-2"
                  style={{ fontSize: "0.95rem" }}
                  onClick={() => setCurrentModule("cutter")}
                >
                  <i className="bi bi-scissors fs-5"></i>
                  <span>Navigate to Toyo Cutter IOT</span>
                  <i className="bi bi-arrow-right ms-1"></i>
                </Button>
              </div>
            </Col>

            {/* 2. Rubber IoT Implementation Card */}
            <Col xs={12} md={6} lg={5}>
              <div className="katana-module-card rubber h-100">
                <div>
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    {/* Unique Favicon: Latex Droplet & Moisture Sensor */}
                    <div className="katana-icon-box katana-icon-rubber shadow-sm">
                      <i className="bi bi-droplet-half fs-1"></i>
                    </div>
                    <Badge bg="success" className="px-3 py-1.5 rounded-pill text-uppercase fw-semibold" style={{ fontSize: "0.7rem", letterSpacing: "0.04em" }}>
                      ● WSN Grid Online
                    </Badge>
                  </div>

                  <h4 className="fw-bold text-dark mb-1 fs-5">
                    Rubber IOT Implementation
                  </h4>
                  <div className="text-success fw-semibold small mb-3">
                    Katana Rubber Processing • WSN Sensor Network
                  </div>

                  <p className="text-secondary small mb-4">
                    Wireless sensor network (WSN) telemetry for rubber compounding and thermal processing. Monitors ESP32 sensor nodes, chamber temperatures, burst transmissions, battery levels, and wireless signal strength (RSSI).
                  </p>

                  <div className="p-3 bg-light rounded-3 small mb-4 border">
                    <div className="d-flex justify-content-between py-1 border-bottom">
                      <span className="text-muted">Active Sensor Node:</span>
                      <strong className="text-dark font-monospace">ESP32-NODE-01</strong>
                    </div>
                    <div className="d-flex justify-content-between py-1 border-bottom">
                      <span className="text-muted">Live Chamber Temp:</span>
                      <strong className="text-success font-monospace">31.26 °C • Optimal</strong>
                    </div>
                    <div className="d-flex justify-content-between py-1">
                      <span className="text-muted">Signal &amp; Battery:</span>
                      <strong className="text-dark font-monospace">-77 dBm • 77% Battery</strong>
                    </div>
                  </div>
                </div>

                <Button
                  variant="success"
                  size="lg"
                  className="w-100 fw-bold py-2.5 rounded-3 shadow-sm d-flex align-items-center justify-content-center gap-2"
                  style={{ fontSize: "0.95rem" }}
                  onClick={() => setCurrentModule("rubber")}
                >
                  <i className="bi bi-droplet-half fs-5"></i>
                  <span>Navigate to Rubber IOT</span>
                  <i className="bi bi-arrow-right ms-1"></i>
                </Button>
              </div>
            </Col>
          </Row>
        </Container>

        {/* Footer */}
        <footer className="text-center py-3 text-muted small border-top bg-white">
          Hayleys Eco Solutions Sector • Katana IOT implementation • Industrial WSN Hub
        </footer>
      </div>
    );
  }

  // =========================================================================
  // 3. RUBBER IOT IMPLEMENTATION VIEW
  // =========================================================================
  if (currentModule === "rubber") {
    const primaryNode = wsnNodes[0] || {
      nodeId: "ESP32-NODE-01",
      name: "Node ESP32-NODE-01",
      location: "Field Deployment",
      status: "online",
      currentTemperature: 31.26,
      currentBattery: 77,
      currentRssi: -77,
      totalBursts: 6,
      lastSeenJayawardenepura: "2026-09-29 23:12:01 (+05:30 Sri Jayawardenepura Time)"
    };

    return (
      <div className="min-vh-100 pb-5">
        {/* Top Header */}
        <header className="wb-header">
          <div className="container-fluid p-0 d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div className="d-flex align-items-center gap-2.5">
              <div className="wb-logo-box shadow-sm bg-success text-white d-flex align-items-center justify-content-center">
                <i className="bi bi-droplet-half fs-5"></i>
              </div>
              <div>
                <div className="fw-bold text-dark lh-sm fs-6 fs-sm-5 text-truncate" style={{ maxWidth: 280 }}>
                  Rubber IOT Implementation
                </div>
                <div className="text-success text-uppercase fw-bold" style={{ fontSize: "0.65rem", letterSpacing: "0.05em" }}>
                  Katana Rubber Processing • Hayleys
                </div>
              </div>
            </div>

            <div className="d-flex align-items-center gap-2.5 flex-wrap ms-auto">
              {/* Navigation Back to Katana Portal */}
              <Button
                variant="outline-primary"
                size="sm"
                className="fw-bold shadow-none d-flex align-items-center"
                onClick={() => setCurrentModule("portal")}
                title="Return to Katana IoT Portal Hub"
              >
                <i className="bi bi-grid-fill me-1.5"></i>
                <span className="d-none d-sm-inline">Katana Portal</span>
              </Button>

              {/* Navigation to Toyo Cutter IoT */}
              <Button
                variant="outline-primary"
                size="sm"
                className="fw-bold shadow-none d-flex align-items-center"
                onClick={() => setCurrentModule("cutter")}
                title="Navigate to Toyo Cutter IoT Implementation"
              >
                <i className="bi bi-scissors me-1.5"></i>
                <span className="d-none d-sm-inline">Toyo Cutter IoT</span>
              </Button>

              {/* Live SLST Date & Time */}
              <div className="badge bg-white text-secondary border px-2.5 py-1.5 font-monospace fw-semibold shadow-sm d-none d-md-inline-flex align-items-center">
                <i className="bi bi-clock text-primary me-2"></i>
                <span>{currentTimeSLST.timeString} (+05:30)</span>
              </div>

              {/* User Profile & Sign Out */}
              <div className="d-flex align-items-center gap-2 border-start ps-3 ms-2">
                <div
                  className="rounded-circle bg-success text-white fw-bold d-flex align-items-center justify-content-center shadow-sm"
                  style={{ width: 30, height: 30, fontSize: "0.8rem" }}
                  title={currentUser?.email || "Operator"}
                >
                  {(currentUser?.username || "A").charAt(0).toUpperCase()}
                </div>
                <Button
                  variant="outline-danger"
                  size="sm"
                  className="fw-semibold px-2.5 py-1 d-flex align-items-center"
                  onClick={handleLogout}
                  style={{ fontSize: "0.78rem" }}
                >
                  <i className="bi bi-box-arrow-right me-1.5"></i>
                  <span className="d-none d-sm-inline">Sign Out</span>
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Rubber IoT Implementation Body */}
        <Container fluid className="px-3 px-md-4 py-3">
          {/* Breadcrumb Banner */}
          <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
            <div className="d-flex align-items-center gap-2">
              <Button
                variant="light"
                size="sm"
                className="border py-1 px-2.5 fw-semibold text-secondary"
                onClick={() => setCurrentModule("portal")}
              >
                <i className="bi bi-arrow-left me-1"></i> Back to Katana Portal
              </Button>
              <Badge bg="success" className="px-2.5 py-1">
                Rubber IoT Active
              </Badge>
            </div>
            <span className="small text-muted">
              Location: <strong>Katana Rubber Processing Facility</strong> • WSN Protocol
            </span>
          </div>

          {/* 4 Rubber WSN KPI Cards */}
          <Row className="g-2.5 g-sm-3 mb-3">
            <Col xs={6} lg={3}>
              <Card className="border shadow-sm rounded-3 h-100 bg-white hover-lift">
                <Card.Body className="p-2.5 p-sm-3 d-flex flex-column justify-content-between">
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-1 mb-sm-2">
                      <span className="text-secondary fw-bold text-uppercase text-truncate" style={{ fontSize: "0.68rem", letterSpacing: "0.04em" }}>
                        WSN Sensor Node
                      </span>
                      <div className="bg-success bg-opacity-10 text-success p-1.5 rounded-2">
                        <i className="bi bi-broadcast fs-6"></i>
                      </div>
                    </div>
                    <h4 className="fw-bold mb-1 text-dark font-monospace fs-5 fs-sm-4 text-truncate">
                      {primaryNode.nodeId}
                    </h4>
                  </div>
                  <div className="text-muted small text-truncate pt-1.5 pt-sm-2 border-top" style={{ fontSize: "0.72rem" }}>
                    Status: <strong className="text-success">Online</strong> • {primaryNode.location}
                  </div>
                </Card.Body>
              </Card>
            </Col>

            <Col xs={6} lg={3}>
              <Card className="border shadow-sm rounded-3 h-100 bg-white hover-lift">
                <Card.Body className="p-2.5 p-sm-3 d-flex flex-column justify-content-between">
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-1 mb-sm-2">
                      <span className="text-secondary fw-bold text-uppercase text-truncate" style={{ fontSize: "0.68rem", letterSpacing: "0.04em" }}>
                        Chamber Temperature
                      </span>
                      <div className="bg-danger bg-opacity-10 text-danger p-1.5 rounded-2">
                        <i className="bi bi-thermometer-half fs-6"></i>
                      </div>
                    </div>
                    <h4 className="fw-bold mb-1 text-danger font-monospace fs-5 fs-sm-4 text-truncate">
                      {Number(primaryNode.currentTemperature || 31.26).toFixed(2)}{" "}
                      <span className="fs-7 fw-bold text-muted">°C</span>
                    </h4>
                  </div>
                  <div className="text-muted small text-truncate pt-1.5 pt-sm-2 border-top" style={{ fontSize: "0.72rem" }}>
                    Thermal Status: <strong className="text-success">Optimal Curing</strong>
                  </div>
                </Card.Body>
              </Card>
            </Col>

            <Col xs={6} lg={3}>
              <Card className="border shadow-sm rounded-3 h-100 bg-white hover-lift">
                <Card.Body className="p-2.5 p-sm-3 d-flex flex-column justify-content-between">
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-1 mb-sm-2">
                      <span className="text-secondary fw-bold text-uppercase text-truncate" style={{ fontSize: "0.68rem", letterSpacing: "0.04em" }}>
                        Signal Strength (RSSI)
                      </span>
                      <div className="bg-info bg-opacity-10 text-info p-1.5 rounded-2">
                        <i className="bi bi-wifi fs-6"></i>
                      </div>
                    </div>
                    <h4 className="fw-bold mb-1 text-info font-monospace fs-5 fs-sm-4 text-truncate">
                      {primaryNode.currentRssi || -77}{" "}
                      <span className="fs-7 fw-bold text-muted">dBm</span>
                    </h4>
                  </div>
                  <div className="text-muted small text-truncate pt-1.5 pt-sm-2 border-top" style={{ fontSize: "0.72rem" }}>
                    Link Quality: <strong className="text-dark">Strong Signal</strong>
                  </div>
                </Card.Body>
              </Card>
            </Col>

            <Col xs={6} lg={3}>
              <Card className="border shadow-sm rounded-3 h-100 bg-white hover-lift">
                <Card.Body className="p-2.5 p-sm-3 d-flex flex-column justify-content-between">
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-1 mb-sm-2">
                      <span className="text-secondary fw-bold text-uppercase text-truncate" style={{ fontSize: "0.68rem", letterSpacing: "0.04em" }}>
                        Battery Level
                      </span>
                      <div className="bg-warning bg-opacity-10 text-warning p-1.5 rounded-2">
                        <i className="bi bi-battery-charging fs-6"></i>
                      </div>
                    </div>
                    <h4 className="fw-bold mb-1 text-success font-monospace fs-5 fs-sm-4 text-truncate">
                      {primaryNode.currentBattery || 77}%
                    </h4>
                  </div>
                  <div className="text-muted small text-truncate pt-1.5 pt-sm-2 border-top" style={{ fontSize: "0.72rem" }}>
                    Power Source: <strong className="text-dark">Rechargeable LiPo</strong>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Node Profile & Real-time Telemetry Bursts Table */}
          <Row className="g-3">
            <Col xs={12} lg={4}>
              <Card className="modern-card border shadow-sm h-100">
                <Card.Header className="bg-transparent border-bottom pt-3 px-3 pb-2.5">
                  <h6 className="fw-bold mb-0 text-dark">
                    <i className="bi bi-cpu text-success me-2"></i>
                    WSN Hardware Profile
                  </h6>
                </Card.Header>
                <Card.Body className="p-3">
                  <div className="p-3 bg-light rounded-3 mb-3 border">
                    <div className="d-flex justify-content-between py-1.5 border-bottom small">
                      <span className="text-muted">Node Hardware:</span>
                      <strong className="text-dark font-monospace">ESP32-WROOM-32</strong>
                    </div>
                    <div className="d-flex justify-content-between py-1.5 border-bottom small">
                      <span className="text-muted">Node Key:</span>
                      <strong className="text-primary font-monospace">{primaryNode.nodeId}</strong>
                    </div>
                    <div className="d-flex justify-content-between py-1.5 border-bottom small">
                      <span className="text-muted">Deployment:</span>
                      <strong className="text-dark">Katana Rubber Processing</strong>
                    </div>
                    <div className="d-flex justify-content-between py-1.5 border-bottom small">
                      <span className="text-muted">Transmission Mode:</span>
                      <strong className="text-dark">Burst Sequence (2-min)</strong>
                    </div>
                    <div className="d-flex justify-content-between py-1.5 small">
                      <span className="text-muted">Total Bursts:</span>
                      <strong className="text-success font-monospace">{primaryNode.totalBursts || wsnTelemetryLogs.length} transmissions</strong>
                    </div>
                  </div>

                  <div className="d-grid gap-2">
                    <Button
                      variant="primary"
                      className="fw-bold d-flex align-items-center justify-content-center gap-2 shadow-sm"
                      onClick={() => setCurrentModule("cutter")}
                    >
                      <i className="bi bi-scissors"></i>
                      <span>Switch to Toyo Cutter IOT</span>
                    </Button>
                    <Button
                      variant="outline-secondary"
                      className="fw-semibold d-flex align-items-center justify-content-center gap-2"
                      onClick={() => setCurrentModule("portal")}
                    >
                      <i className="bi bi-grid-fill"></i>
                      <span>Return to Katana Portal</span>
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>

            <Col xs={12} lg={8}>
              <Card className="modern-card border shadow-sm h-100">
                <Card.Header className="bg-transparent border-bottom pt-3 px-3 pb-2.5 d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <div>
                    <h6 className="fw-bold mb-0 text-dark">
                      <i className="bi bi-activity text-success me-2"></i>
                      Real-time Rubber WSN Telemetry Bursts
                    </h6>
                    <div className="text-muted small" style={{ fontSize: "0.75rem" }}>
                      Live sensor packet stream from Katana Rubber curing chambers
                    </div>
                  </div>
                  <Badge bg="success" className="px-2.5 py-1">
                    {wsnTelemetryLogs.length} Packets Captured
                  </Badge>
                </Card.Header>
                <Card.Body className="p-3">
                  <div className="table-responsive">
                    <Table hover className="wb-table align-middle mb-0">
                      <thead>
                        <tr>
                          <th>Sequence #</th>
                          <th>Node ID</th>
                          <th>Temperature</th>
                          <th>Battery</th>
                          <th>RSSI</th>
                          <th>Recorded Time (SLST)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wsnTelemetryLogs.map((log, idx) => (
                          <tr key={log.id || idx}>
                            <td className="font-monospace fw-bold text-dark">
                              #{log.burstSequence || idx + 1}
                            </td>
                            <td>
                              <Badge bg="secondary-subtle" text="dark" className="font-monospace border">
                                {log.nodeId || "ESP32-NODE-01"}
                              </Badge>
                            </td>
                            <td className="font-monospace fw-bold text-danger">
                              {log.temperature !== undefined ? `${Number(log.temperature).toFixed(2)} °C` : "31.26 °C"}
                            </td>
                            <td className="font-monospace fw-bold text-success">
                              {log.battery !== undefined ? `${log.battery}%` : "77%"}
                            </td>
                            <td className="font-monospace text-muted">
                              {log.rssi !== undefined ? `${log.rssi} dBm` : "-77 dBm"}
                            </td>
                            <td className="text-secondary small font-monospace">
                              {log.jayawardenepuraTime || log.timestamp || "Live (+05:30 SLST)"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Container>
      </div>
    );
  }

  // =========================================================================
  // 4. TOYO CUTTER IOT IMPLEMENTATION DASHBOARD
  // =========================================================================
  return (
    <div className="min-vh-100 pb-5">
      {/* Top Navbar */}
      {/* Top Header Navbar - Adopted from Weighbridge Quality Process Hub */}
      <header className="wb-header">
        <div className="container-fluid p-0 d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-2.5">
            <div className="wb-logo-box shadow-sm bg-primary text-white d-flex align-items-center justify-content-center">
              <i className="bi bi-scissors fs-5"></i>
            </div>
            <div>
              <div className="fw-bold text-dark lh-sm fs-6 fs-sm-5 text-truncate" style={{ maxWidth: 240 }}>
                Toyo Cutter IOT
              </div>
              <div className="text-primary text-uppercase fw-bold" style={{ fontSize: "0.65rem", letterSpacing: "0.05em" }}>
                Toyo Cushion Lanka • Hayleys
              </div>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2.5 flex-wrap ms-auto">
            {/* Navigation Back to Katana Portal */}
            <Button
              variant="outline-primary"
              size="sm"
              className="fw-bold shadow-none d-flex align-items-center"
              onClick={() => setCurrentModule("portal")}
              title="Return to Katana IoT Portal Hub"
            >
              <i className="bi bi-grid-fill me-1.5"></i>
              <span className="d-none d-md-inline">Katana Portal</span>
            </Button>

            {/* Navigation to Rubber IoT */}
            <Button
              variant="outline-success"
              size="sm"
              className="fw-bold shadow-none d-flex align-items-center"
              onClick={() => setCurrentModule("rubber")}
              title="Navigate to Rubber IoT Implementation"
            >
              <i className="bi bi-droplet-half me-1.5"></i>
              <span className="d-none d-md-inline">Rubber IoT</span>
            </Button>

            {/* Live System Operational Status Badge */}
            <div className="pulse-badge bg-white border px-2.5 py-1 rounded-pill shadow-sm">
              <span
                className={`pulse-dot ${
                  activeDowntime ? "pulse-dot-downtime" : "pulse-dot-running"
                }`}
              />
              <span className="fw-bold text-dark" style={{ fontSize: "0.75rem" }}>
                {activeDowntime ? "DOWNTIME" : "RUNNING"}
              </span>
            </div>

            {/* Live SLST Date & Time */}
            <div className="badge bg-white text-secondary border px-2.5 py-1.5 font-monospace fw-semibold shadow-sm d-none d-md-inline-flex align-items-center">
              <i className="bi bi-clock text-primary me-2"></i>
              <span>{currentTimeSLST.timeString} (+05:30)</span>
            </div>

            {/* User Profile & Sign Out */}
            <div className="d-flex align-items-center gap-2 border-start ps-3 ms-2">
              <div
                className="rounded-circle bg-primary text-white fw-bold d-flex align-items-center justify-content-center shadow-sm"
                style={{ width: 30, height: 30, fontSize: "0.8rem" }}
                title={currentUser?.email || "Operator"}
              >
                {(currentUser?.username || "A").charAt(0).toUpperCase()}
              </div>
              <Button
                variant="outline-danger"
                size="sm"
                className="fw-semibold px-2.5 py-1 d-flex align-items-center"
                onClick={handleLogout}
                style={{ fontSize: "0.78rem" }}
              >
                <i className="bi bi-box-arrow-right me-1.5"></i>
                <span className="d-none d-sm-inline">Sign Out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container-fluid px-3 px-md-4 py-3">
        {/* Dismissible Toast Alert */}
        {actionNotice && (
          <Alert
            variant={actionNotice.variant || "info"}
            onClose={() => setActionNotice(null)}
            dismissible
            className="shadow-sm rounded-3 mb-3 d-flex align-items-center justify-content-between p-2.5 p-sm-3"
          >
            <div>
              <div className="fw-bold small">{actionNotice.title}</div>
              <div className="small text-muted">{actionNotice.message}</div>
            </div>
          </Alert>
        )}

        {/* Active Downtime Banner */}
        {activeDowntime && (
          <div className="card border-danger shadow-sm rounded-3 mb-3 bg-white p-3 border-2">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
              <div>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <Badge bg="danger" className="px-2.5 py-1 text-uppercase">
                    ⚠️ Active Downtime In Progress
                  </Badge>
                  <span className="small fw-bold text-danger">
                    Started at {activeDowntime.startTimeStr || activeDowntime.startTime}
                  </span>
                </div>
                <h5 className="fw-bold text-dark mb-1 fs-6 fs-sm-5">
                  Reason: {activeDowntime.reason || "Machine Downtime"}
                </h5>
                <div className="small text-secondary">
                  Elapsed Stoppage:{" "}
                  <strong className="text-danger fs-6">
                    {formatElapsed(activeDowntimeElapsedSec)}
                  </strong>{" "}
                  • Equipment line is stopped until resolved.
                </div>
              </div>

              <Button
                variant="success"
                size="md"
                className="fw-bold shadow-sm px-4 w-100 w-sm-auto"
                onClick={() => handleEndDowntime(activeDowntime.id)}
                disabled={isUpdatingDowntime}
              >
                {isUpdatingDowntime ? (
                  <>
                    <Spinner size="sm" className="me-2" /> Ending...
                  </>
                ) : (
                  "✓ End Active Downtime"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Section Navigation Tabs (Horizontal Pills - Strictly NO side navigation bar) */}
        <ul className="nav wb-nav-pills mb-3">
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link ${activeTab === "overview" ? "active" : ""}`}
              onClick={() => setActiveTab("overview")}
            >
              <i className="bi bi-calendar2-range"></i>
              <span>Production Orders &amp; Hourly Plan</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link ${activeTab === "machines" ? "active" : ""}`}
              onClick={() => setActiveTab("machines")}
            >
              <i className="bi bi-gear-wide-connected"></i>
              <span>Machine Master Details</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link ${activeTab === "downtime" ? "active" : ""}`}
              onClick={() => setActiveTab("downtime")}
            >
              <i className="bi bi-pause-circle"></i>
              <span>Downtime Management</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link ${activeTab === "reports" ? "active" : ""}`}
              onClick={() => setActiveTab("reports")}
            >
              <i className="bi bi-file-earmark-pdf"></i>
              <span>PDF Reports</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link ${activeTab === "archive" ? "active" : ""}`}
              onClick={() => setActiveTab("archive")}
            >
              <i className="bi bi-archive"></i>
              <span>Archived Cuts Explorer</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link ${activeTab === "performance" ? "active" : ""}`}
              onClick={() => setActiveTab("performance")}
            >
              <i className="bi bi-cpu"></i>
              <span>API &amp; Simulator</span>
            </button>
          </li>
        </ul>

        {/* =================================================================== */}
        {/* TAB 1: MACHINE-CENTERED FLEET & HOURLY PRODUCTION VIEW             */}
        {/* =================================================================== */}
        {activeTab === "overview" && (
          <div className="d-flex flex-column gap-3">
            {/* MULTI-MACHINE FLEET OVERVIEW & QUICK SWITCHER */}
            <div>
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="small fw-bold text-uppercase text-secondary" style={{ letterSpacing: "0.05em" }}>
                  Equipment Fleet • Select Active Machine
                </span>
                <span className="small text-muted">
                  3 Monitored Lines • SLST (UTC+05:30)
                </span>
              </div>
              <Row className="g-2.5 g-sm-3">
                {fleetOverviewStats.map((mach) => (
                  <Col xs={12} md={4} key={mach.machineId}>
                    <div
                      className={`wb-fleet-card ${mach.isSelected ? "active" : ""}`}
                      onClick={() => setSelectedMachineId(mach.machineId)}
                      style={{ cursor: "pointer" }}
                      title={`Select ${mach.machineName}`}
                    >
                      <div className="d-flex align-items-center justify-content-between mb-1.5">
                        <div className="fw-bold text-dark fs-6 text-truncate pe-2">
                          {mach.machineName}
                        </div>
                        <Badge bg={mach.status === "DOWNTIME" ? "danger" : "success"} className="small px-2 py-1">
                          {mach.status === "DOWNTIME" ? "Downtime" : "Running"}
                        </Badge>
                      </div>
                      <div className="d-flex align-items-center justify-content-between small text-muted pt-2 border-top">
                        <div>
                          Factor: <strong className="text-dark font-monospace">{mach.meterCount.toFixed(2)} m/pulse</strong>
                        </div>
                        <div className="fw-bold text-success font-monospace">
                          {mach.todayLinearMeters.toFixed(2)} m ({mach.todayCuts} pulses)
                        </div>
                      </div>
                      {mach.isSelected && (
                        <div className="small text-primary fw-bold pt-1.5 text-end" style={{ fontSize: "0.72rem" }}>
                          ✓ Active Machine Selected
                        </div>
                      )}
                    </div>
                  </Col>
                ))}
              </Row>
            </div>

            {/* ACTIVE MACHINE HERO CONSOLE */}
            <Card className="modern-card border shadow-sm rounded-3 p-3 p-sm-4 bg-white">
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3 pb-3 border-bottom">
                <div className="d-flex align-items-center gap-3">
                  <div className="rounded-3 bg-primary bg-opacity-10 text-primary p-2.5 d-flex align-items-center justify-content-center shadow-sm" style={{ width: 48, height: 48 }}>
                    <i className="bi bi-cpu-fill fs-4"></i>
                  </div>
                  <div>
                    <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                      <h5 className="fw-bold text-dark mb-0 fs-6 fs-sm-5">
                        {currentMachineDef.machineName}
                      </h5>
                      <span className="badge bg-secondary-subtle text-dark border font-monospace small">
                        {currentMachineDef.machineId}
                      </span>
                      <Badge bg={activeDowntime ? "danger" : "success"}>
                        {activeDowntime ? "⚠️ DOWNTIME" : "● OPERATIONAL"}
                      </Badge>
                    </div>
                    <div className="text-secondary small">
                      Calibrated Factor: <strong className="text-primary font-monospace">{assignedMeterCountNum.toFixed(2)} m/pulse</strong> • 1 Encoder Pulse = {assignedMeterCountNum.toFixed(2)} meters covered
                    </div>
                  </div>
                </div>

                <div className="d-flex align-items-center gap-2 flex-wrap">
                  {/* Date Scope Selector scoped directly to this Machine */}
                  <div className="d-flex align-items-center gap-1.5 bg-light border rounded-3 px-2.5 py-1.5 shadow-sm">
                    <i className="bi bi-calendar3 text-muted small"></i>
                    <span className="small text-muted fw-bold">Date:</span>
                    <input
                      type="date"
                      className="form-control form-control-sm border-0 p-0 shadow-none fw-semibold font-monospace"
                      style={{ width: 125, fontSize: "0.82rem", background: "transparent" }}
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      title="Select Date Scope"
                    />
                    {selectedDate !== todayStr && (
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 text-decoration-none fw-bold small text-primary"
                        onClick={() => setSelectedDate(todayStr)}
                        title="Jump to Today"
                      >
                        Today
                      </Button>
                    )}
                  </div>

                  {/* Machine Quick Actions */}
                  <Button
                    variant="outline-success"
                    size="sm"
                    className="fw-bold shadow-sm d-flex align-items-center gap-1.5"
                    onClick={handleTriggerPostSignal}
                    disabled={isPostingCut}
                    title="Simulate 1 encoder pulse signal for current hour"
                  >
                    {isPostingCut ? <Spinner size="sm" /> : <i className="bi bi-plus-circle"></i>}
                    <span>+ Log Encoder Pulse</span>
                  </Button>

                  <Button
                    variant={activeDowntime ? "outline-success" : "outline-warning"}
                    size="sm"
                    className="fw-bold shadow-sm d-flex align-items-center gap-1"
                    onClick={() => {
                      if (activeDowntime) {
                        handleEndDowntime(activeDowntime.id);
                      } else {
                        setDowntimeMachineId(selectedMachineId);
                        setActiveTab("downtime");
                      }
                    }}
                  >
                    <i className={`bi ${activeDowntime ? "bi-check-circle" : "bi-exclamation-triangle"}`}></i>
                    <span>{activeDowntime ? "End Stoppage" : "Report Downtime"}</span>
                  </Button>

                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="fw-bold shadow-sm d-flex align-items-center gap-1"
                    onClick={() => {
                      handleSelectMasterMachine(selectedMachineId);
                      setActiveTab("machines");
                    }}
                    title="Edit specs in Machine Master"
                  >
                    <i className="bi bi-gear"></i>
                    <span className="d-none d-sm-inline">Specs</span>
                  </Button>
                </div>
              </div>

              {/* 4 Machine-Centered KPI Cards */}
              <Row className="g-2.5 g-sm-3">
                <Col xs={6} lg={3}>
                  <Card className="border shadow-none rounded-3 h-100 bg-light">
                    <Card.Body className="p-2.5 p-sm-3 d-flex flex-column justify-content-between">
                      <div>
                        <div className="d-flex justify-content-between align-items-center mb-1 mb-sm-2">
                          <span className="text-secondary fw-bold text-uppercase text-truncate" style={{ fontSize: "0.68rem", letterSpacing: "0.04em" }}>
                            Active Order
                          </span>
                          <div className="bg-primary bg-opacity-10 text-primary p-1.5 rounded-2">
                            <i className="bi bi-upc-scan fs-6"></i>
                          </div>
                        </div>
                        <h4 className="fw-bold mb-1 text-dark font-monospace fs-5 fs-sm-4 text-truncate">
                          {activeOrderNumber ? (
                            activeOrderNumber
                          ) : (
                            <span className="text-muted fw-normal fs-6">No order</span>
                          )}
                        </h4>
                      </div>
                      <div className="text-muted small text-truncate pt-1.5 pt-sm-2 border-top" style={{ fontSize: "0.72rem" }}>
                        {currentMachineDef.machineName}
                      </div>
                    </Card.Body>
                  </Card>
                </Col>

                <Col xs={6} lg={3}>
                  <Card className="border shadow-none rounded-3 h-100 bg-light">
                    <Card.Body className="p-2.5 p-sm-3 d-flex flex-column justify-content-between">
                      <div>
                        <div className="d-flex justify-content-between align-items-center mb-1 mb-sm-2">
                          <span className="text-secondary fw-bold text-uppercase text-truncate" style={{ fontSize: "0.68rem", letterSpacing: "0.04em" }}>
                            Calibrated Factor
                          </span>
                          <div className="bg-info bg-opacity-10 text-info p-1.5 rounded-2">
                            <i className="bi bi-speedometer2 fs-6"></i>
                          </div>
                        </div>
                        <h4 className="fw-bold mb-1 text-info font-monospace fs-5 fs-sm-4 text-truncate">
                          {assignedMeterCountNum.toFixed(2)}{" "}
                          <span className="fs-7 fw-bold text-muted">m/pulse</span>
                        </h4>
                      </div>
                      <div className="text-muted small text-truncate pt-1.5 pt-sm-2 border-top" style={{ fontSize: "0.72rem" }}>
                        1 Pulse = {assignedMeterCountNum.toFixed(2)} meters
                      </div>
                    </Card.Body>
                  </Card>
                </Col>

                <Col xs={6} lg={3}>
                  <Card className="border shadow-none rounded-3 h-100 bg-light">
                    <Card.Body className="p-2.5 p-sm-3 d-flex flex-column justify-content-between">
                      <div>
                        <div className="d-flex justify-content-between align-items-center mb-1 mb-sm-2">
                          <span className="text-secondary fw-bold text-uppercase text-truncate" style={{ fontSize: "0.68rem", letterSpacing: "0.04em" }}>
                            Today's Output
                          </span>
                          <div className="bg-success bg-opacity-10 text-success p-1.5 rounded-2">
                            <i className="bi bi-rulers fs-6"></i>
                          </div>
                        </div>
                        <h4 className="fw-bold mb-1 text-success font-monospace fs-5 fs-sm-4 text-truncate">
                          {unifiedVolumeStats.totalLinearMetersToday.toFixed(2)}{" "}
                          <span className="fs-7 fw-bold text-muted">m</span>
                        </h4>
                      </div>
                      <div className="text-muted small text-truncate pt-1.5 pt-sm-2 border-top" style={{ fontSize: "0.72rem" }}>
                        <strong className="text-dark">{unifiedVolumeStats.totalCuts}</strong> encoder pulses
                      </div>
                    </Card.Body>
                  </Card>
                </Col>

                <Col xs={6} lg={3}>
                  <Card className="border shadow-none rounded-3 h-100 bg-light">
                    <Card.Body className="p-2.5 p-sm-3 d-flex flex-column justify-content-between">
                      <div>
                        <div className="d-flex justify-content-between align-items-center mb-1 mb-sm-2">
                          <span className="text-secondary fw-bold text-uppercase text-truncate" style={{ fontSize: "0.68rem", letterSpacing: "0.04em" }}>
                            Current Hour
                          </span>
                          <div className="bg-primary bg-opacity-10 text-primary p-1.5 rounded-2">
                            <i className="bi bi-clock-history fs-6"></i>
                          </div>
                        </div>
                        <h4 className="fw-bold mb-1 text-primary font-monospace fs-5 fs-sm-4 text-truncate">
                          {unifiedVolumeStats.currentHourLinearMeters.toFixed(2)}{" "}
                          <span className="fs-7 fw-bold text-muted">m</span>
                        </h4>
                      </div>
                      <div className="text-muted small text-truncate pt-1.5 pt-sm-2 border-top" style={{ fontSize: "0.72rem" }}>
                        <strong className="text-dark">{unifiedVolumeStats.currentHourCuts}</strong> pulses this hour
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            </Card>

            {/* 24-HOUR HOURLY PRODUCTION PLANNING TABLE */}
            <Card className="modern-card border shadow-sm rounded-3 p-0 overflow-hidden">
              {/* CLEAR, PROMINENT SAVE PLAN CTA BANNER */}
              <div className="wb-save-plan-banner m-3 mb-0 d-flex flex-wrap align-items-center justify-content-between gap-3">
                <div className="d-flex align-items-center gap-3">
                  <div className="bg-primary text-white p-2.5 rounded-3 d-flex align-items-center justify-content-center shadow-sm" style={{ width: 44, height: 44 }}>
                    <i className="bi bi-table fs-4"></i>
                  </div>
                  <div>
                    <h6 className="fw-bold text-dark mb-0 fs-6">
                      Hourly Production Planning: {currentMachineDef.machineName}
                    </h6>
                    <p className="text-secondary small mb-0">
                      Date: <strong>{selectedDate}</strong> • Calibrated Factor: <strong>{assignedMeterCountNum.toFixed(2)} m/pulse</strong>
                    </p>
                  </div>
                </div>

                <div className="d-flex align-items-center gap-2 flex-wrap">
                  {hourlySavedFeedback && (
                    <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-3 py-2 fw-semibold d-flex align-items-center gap-1.5">
                      <i className="bi bi-check-circle-fill"></i> Plan Saved to Database
                    </span>
                  )}
                  {activeOrderNumber && (
                    <Button
                      variant="outline-primary"
                      size="sm"
                      className="fw-bold shadow-none"
                      onClick={handleApplyToEmptyOnly}
                      title={`Fill empty hours with ${activeOrderNumber}`}
                    >
                      ⚡ Fill Empty ({activeOrderNumber})
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="md"
                    className="fw-bold px-4 py-2 shadow-sm d-flex align-items-center gap-2"
                    onClick={handleSaveAllHourlyPlans}
                    disabled={isSavingHourlyPlans}
                  >
                    {isSavingHourlyPlans ? (
                      <>
                        <Spinner size="sm" className="me-1" /> Saving Plan...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-floppy2-fill"></i> Save Hourly Plan
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Helper guide */}
              <div className="px-3 pt-2 pb-0">
                <div className="text-muted small fst-italic">
                  <i className="bi bi-info-circle me-1 text-primary"></i>
                  Linear meters produced = Encoder Pulses × Calibrated Factor ({assignedMeterCountNum.toFixed(2)} m/pulse). Production Orders are editable on an hourly basis. Click <strong>Save Hourly Plan</strong> to persist your changes.
                </div>
              </div>

              <Card.Body className="p-3">
                <div className="table-responsive">
                  <Table hover className="wb-table align-middle mb-0">
                    <thead>
                      <tr>
                        <th className="text-start" style={{ width: "22%" }}>
                          HOUR WINDOW (SLST)
                        </th>
                        <th style={{ width: "34%" }} className="text-center">
                          PRODUCTION ORDER # (EDITABLE)
                        </th>
                        <th style={{ width: "22%" }} className="text-center">
                          ENCODER PULSES (COUNT)
                        </th>
                        <th className="text-center" style={{ width: "10%" }}>
                          FACTOR
                        </th>
                        <th className="text-end" style={{ width: "12%" }}>
                          LINEAR OUTPUT (m)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {unifiedVolumeStats.perHourRows.map((row) => {
                        const isCurrentHour =
                          selectedDate === todayStr &&
                          row.hour === currentTimeSLST.hour;
                        const hourStart = String(row.hour).padStart(2, "0") + ":00";
                        const hourEnd = String((row.hour + 1) % 24).padStart(2, "0") + ":00";
                        const currentVal =
                          hourlyPlans[row.hour]?.orderNumber !== undefined
                            ? hourlyPlans[row.hour].orderNumber
                            : (row.orderNumber || "");

                        return (
                          <tr
                            key={row.hour}
                            className={
                              isCurrentHour
                                ? "table-primary fw-semibold"
                                : row.cuts > 0
                                ? "table-active"
                                : ""
                            }
                          >
                            <td className="text-start">
                              <span className="font-monospace fw-bold text-dark">
                                {hourStart} - {hourEnd}
                              </span>
                              {isCurrentHour && (
                                <Badge bg="primary" className="ms-2 py-1 px-2">
                                  Current Hour
                                </Badge>
                              )}
                            </td>
                            <td className="text-center">
                              <Form.Control
                                size="sm"
                                type="text"
                                value={currentVal}
                                onChange={(e) =>
                                  handleHourlyPlanChange(row.hour, "orderNumber", e.target.value)
                                }
                                placeholder="Enter Order #"
                                className="font-monospace fw-bold text-primary text-center mx-auto bg-white border"
                                style={{ maxWidth: "230px" }}
                              />
                            </td>
                            <td className="text-center">
                              {row.cuts > 0 ? (
                                <Badge bg="success" className="px-3 py-1.5 fs-7 fw-bold font-monospace">
                                  {row.cuts} {row.cuts === 1 ? "pulse" : "pulses"}
                                </Badge>
                              ) : (
                                <span className="text-muted small font-monospace">0 pulses</span>
                              )}
                            </td>
                            <td className="text-center text-muted small font-monospace">
                              {assignedMeterCountNum.toFixed(2)} m/p
                            </td>
                            <td className="text-end fw-bold font-monospace">
                              <span className={row.linearMeters > 0 ? "text-success fs-6" : "text-muted"}>
                                {row.linearMeters.toFixed(2)} m
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="table-light text-center border-top-2">
                      <tr>
                        <th className="text-start text-dark fw-bold">
                          TOTAL ({selectedDate})
                        </th>
                        <th className="text-center">
                          <Button
                            variant="primary"
                            size="sm"
                            className="py-1 px-3 fw-bold shadow-sm"
                            onClick={handleSaveAllHourlyPlans}
                            disabled={isSavingHourlyPlans}
                          >
                            <i className="bi bi-floppy2-fill me-1"></i> Save Hourly Plan
                          </Button>
                        </th>
                        <th className="text-center">
                          <Badge bg="dark" className="px-3 py-1.5 fs-7 font-monospace">
                            {unifiedVolumeStats.totalCuts} pulses total
                          </Badge>
                        </th>
                        <th className="text-center text-muted small">
                          {assignedMeterCountNum.toFixed(2)} m/pulse
                        </th>
                        <th className="text-end text-success fs-6 font-monospace fw-bold">
                          {unifiedVolumeStats.totalLinearMetersToday.toFixed(2)} m
                        </th>
                      </tr>
                    </tfoot>
                  </Table>
                </div>
              </Card.Body>
            </Card>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB: MACHINE MASTER DETAILS VIEW (SEPARATE DEDICATED VIEW)          */}
        {/* =================================================================== */}
        {activeTab === "machines" && (
          <div className="d-flex flex-column gap-4">
            {/* Header Description */}
            <Card className="modern-card border shadow-sm">
              <Card.Body className="p-3 p-sm-4">
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
                  <div>
                    <h5 className="fw-bold text-dark mb-1">
                      ⚙️ Machine Master Specifications &amp; Fleet Registry
                    </h5>
                    <p className="text-muted small mb-0">
                      Maintain master equipment profiles, engineering specifications, stroke multipliers, and hardware telemetry links.
                    </p>
                  </div>
                  <Badge bg="success" className="px-3 py-2 fs-6">
                    {SUPPORTED_MACHINES.length} Monitored Lines
                  </Badge>
                </div>
              </Card.Body>
            </Card>

            {/* Fleet Master Cards Strip */}
            <Row className="g-3">
              {SUPPORTED_MACHINES.map((mach) => {
                const liveDoc = machinesFleet.find((m) => m.machineId === mach.machineId) || {};
                const currentRate = liveDoc.meterCount !== undefined ? Number(liveDoc.meterCount) : mach.defaultMeterCount;
                const isSelectedForEdit = masterMachineId === mach.machineId;

                return (
                  <Col xs={12} md={4} key={mach.machineId}>
                    <Card
                      className={`h-100 shadow-sm border-2 cursor-pointer transition-all ${
                        isSelectedForEdit
                          ? "border-primary bg-primary-subtle bg-opacity-10 shadow"
                          : "border-light-subtle bg-white"
                      }`}
                      style={{ cursor: "pointer" }}
                      onClick={() => handleSelectMasterMachine(mach.machineId)}
                    >
                      <Card.Body className="p-4 d-flex flex-column justify-content-between">
                        <div>
                          <div className="d-flex align-items-center justify-content-between mb-2">
                            <span className="badge bg-secondary-subtle text-dark border font-monospace small">
                              {mach.machineId}
                            </span>
                            <Badge bg={liveDoc.status === "DOWNTIME" ? "danger" : "success"}>
                              {liveDoc.status === "DOWNTIME" ? "⚠️ DOWNTIME" : "● RUNNING"}
                            </Badge>
                          </div>
                          <h6 className="fw-bold text-dark mb-1">{liveDoc.machineName || mach.machineName}</h6>
                          <div className="text-muted small mb-3">
                            Toyo Cushion Lanka • Hayleys Eco Solutions
                          </div>
                          <div className="p-3 bg-light rounded-3 small mb-3">
                            <div className="d-flex justify-content-between py-1 border-bottom">
                              <span className="text-muted">Master Meter Factor:</span>
                              <strong className="text-primary">{currentRate.toFixed(2)} m / pulse</strong>
                            </div>
                            <div className="d-flex justify-content-between py-1 border-bottom">
                              <span className="text-muted">Counting Principle:</span>
                              <strong>1 Signal Pulse = {currentRate.toFixed(2)} m</strong>
                            </div>
                            <div className="d-flex justify-content-between py-1">
                              <span className="text-muted">Active Order:</span>
                              <strong className="font-monospace text-dark">{liveDoc.currentProductionOrder?.orderNumber || "—"}</strong>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant={isSelectedForEdit ? "primary" : "outline-primary"}
                          size="sm"
                          className="w-100 fw-bold shadow-none"
                          onClick={() => handleSelectMasterMachine(mach.machineId)}
                        >
                          {isSelectedForEdit ? "✓ Currently Selected Line" : "Configure Master"}
                        </Button>
                      </Card.Body>
                    </Card>
                  </Col>
                );
              })}
            </Row>

            {/* Master Machine Details Configuration Form */}
            <Card className="modern-card border shadow-sm">
              <Card.Header className="bg-transparent border-bottom pt-3 px-4 pb-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                  <h5 className="fw-bold mb-0 text-dark fs-6">
                    Configure Machine Master: {masterMachineName}
                  </h5>
                  <p className="text-secondary small mb-0">
                    Equipment stroke rate factor, machine code identifier, and hardware links stored in Firestore
                  </p>
                </div>
                {masterSavedFeedback && (
                  <Badge bg="success" className="px-3 py-2 fs-7 fw-semibold">
                    ✓ Master Details Saved
                  </Badge>
                )}
              </Card.Header>
              <Card.Body className="p-4">
                <Form onSubmit={handleSaveMasterDetails}>
                  <Row className="g-3">
                    <Col xs={12} md={3}>
                      <Form.Group>
                        <Form.Label className="small fw-bold text-secondary text-uppercase" style={{ fontSize: "0.74rem" }}>
                          Machine Code (Key)
                        </Form.Label>
                        <Form.Control
                          type="text"
                          value={masterMachineId}
                          onChange={(e) => setMasterMachineId(e.target.value)}
                          placeholder="e.g. rubberised_coir_cutter"
                          className="font-monospace fw-semibold bg-light"
                          required
                        />
                        <Form.Text className="text-muted small">
                          Unique IoT hardware identifier.
                        </Form.Text>
                      </Form.Group>
                    </Col>
                    <Col xs={12} md={4}>
                      <Form.Group>
                        <Form.Label className="small fw-bold text-secondary text-uppercase" style={{ fontSize: "0.74rem" }}>
                          Machine Display Name
                        </Form.Label>
                        <Form.Control
                          type="text"
                          value={masterMachineName}
                          onChange={(e) => setMasterMachineName(e.target.value)}
                          placeholder="e.g. Rubberised Coir Fleece Cutting Machine #1"
                          className="fw-semibold"
                        />
                      </Form.Group>
                    </Col>
                    <Col xs={12} md={2}>
                      <Form.Group>
                        <Form.Label className="small fw-bold text-secondary text-uppercase" style={{ fontSize: "0.74rem" }}>
                          Encoder Factor
                        </Form.Label>
                        <InputGroup>
                          <Form.Control
                            type="number"
                            step="0.01"
                            min="0.1"
                            value={masterMeterCount}
                            onChange={(e) => setMasterMeterCount(e.target.value)}
                            className="fw-bold font-monospace text-primary"
                          />
                          <InputGroup.Text className="small fw-bold">m/pulse</InputGroup.Text>
                        </InputGroup>
                        <Form.Text className="text-muted small">
                          Meters per pulse.
                        </Form.Text>
                      </Form.Group>
                    </Col>
                    <Col xs={12} md={3}>
                      <Form.Group>
                        <Form.Label className="small fw-bold text-secondary text-uppercase" style={{ fontSize: "0.74rem" }}>
                          Machine Order # (Optional)
                        </Form.Label>
                        <Form.Control
                          type="text"
                          value={masterOrderNumber}
                          onChange={(e) => setMasterOrderNumber(e.target.value)}
                          placeholder="Enter Order # (e.g. PO-1024)"
                          className="font-monospace fw-semibold"
                        />
                        <Form.Text className="text-muted small">
                          Active order assigned specifically to this machine.
                        </Form.Text>
                      </Form.Group>
                    </Col>
                    <Col xs={12}>
                      <Form.Group>
                        <Form.Label className="small fw-bold text-secondary text-uppercase" style={{ fontSize: "0.74rem" }}>
                          Engineering Specifications &amp; Operational Notes
                        </Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={3}
                          value={masterNotes}
                          onChange={(e) => setMasterNotes(e.target.value)}
                          placeholder="Technical notes, blade stroke specs, manufacturer details, maintenance notes..."
                        />
                      </Form.Group>
                    </Col>
                    <Col xs={12} className="d-flex justify-content-end gap-2 pt-2">
                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        className="fw-bold px-4 shadow-sm d-flex align-items-center gap-2"
                        disabled={isSavingMaster}
                      >
                        {isSavingMaster ? (
                          <>
                            <Spinner size="sm" /> Saving Master Details...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-floppy2-fill"></i> Save Machine Master Details
                          </>
                        )}
                      </Button>
                    </Col>
                  </Row>
                </Form>
              </Card.Body>
            </Card>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: DOWNTIME MANAGEMENT & INCIDENT LOGS                          */}
        {/* =================================================================== */}
        {activeTab === "downtime" && (
          <div className="d-flex flex-column gap-3">
            <Card className="modern-card border shadow-sm">
              <Card.Body className="p-3 p-sm-4">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2.5 mb-3">
                  <div>
                    <h5 className="fw-bold mb-1 fs-6 fs-sm-5">Equipment Downtime Management</h5>
                    <div className="text-muted small">
                      Select target equipment line, record downtime incidents, and resolve active stoppage when production resumes.
                    </div>
                  </div>
                  <Button
                    variant="outline-primary"
                    size="sm"
                    className="fw-bold shadow-none"
                    onClick={handleCheckDowntimeApi}
                    disabled={isCheckingDowntime}
                  >
                    {isCheckingDowntime ? "Checking..." : "🔄 Refresh Operating Status"}
                  </Button>
                </div>

                {/* Target Equipment Selector */}
                <div className="p-3 bg-light rounded-3 mb-3 border">
                  <div className="small fw-bold text-secondary text-uppercase mb-2" style={{ fontSize: "0.72rem" }}>
                    Target Equipment for Downtime Action:
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    {SUPPORTED_MACHINES.map((mach) => {
                      const isTarget = downtimeMachineId === mach.machineId;
                      const liveM = machinesFleet.find((m) => m.machineId === mach.machineId);
                      const isDown = liveM?.status === "DOWNTIME";

                      return (
                        <Button
                          key={mach.machineId}
                          variant={isTarget ? (isDown ? "danger" : "primary") : "outline-secondary"}
                          size="sm"
                          className="fw-bold shadow-sm d-flex align-items-center gap-1.5"
                          onClick={() => {
                            setDowntimeMachineId(mach.machineId);
                            checkDowntimeStatus(selectedDate, mach.machineId).then(setDowntimeCheckResult);
                          }}
                        >
                          <span>{isDown ? "⚠️" : "●"}</span>
                          <span className="text-truncate">{mach.machineName}</span>
                          {isDown && <Badge bg="light" text="danger">Downtime</Badge>}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {!activeDowntime ? (
                  <div>
                    <Row className="g-2 align-items-center mb-2">
                      <Col xs={12} md={8}>
                        <Form.Control
                          type="text"
                          value={downtimeReason}
                          onChange={(e) => setDowntimeReason(e.target.value)}
                          placeholder={`Reason for downtime on ${downtimeMachineDef.machineName}...`}
                          className="fw-semibold"
                        />
                      </Col>
                      <Col xs={12} md={4} className="d-grid">
                        <Button
                          variant="warning"
                          className="fw-bold text-dark shadow-sm"
                          onClick={handleStartDowntime}
                          disabled={isUpdatingDowntime}
                        >
                          {isUpdatingDowntime ? "Starting..." : `⚠️ Start Downtime (${downtimeMachineDef.machineName})`}
                        </Button>
                      </Col>
                    </Row>
                    <div className="d-flex flex-wrap gap-1 mt-2">
                      <span className="small text-muted me-1">Quick Reasons:</span>
                      {DOWNTIME_PRESETS.map((preset) => (
                        <Button
                          key={preset}
                          variant="outline-secondary"
                          size="sm"
                          className="py-0 px-2 small"
                          style={{ fontSize: "0.75rem" }}
                          onClick={() => setDowntimeReason(preset)}
                        >
                          {preset}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Alert variant="danger" className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-0 shadow-sm">
                    <div>
                      <div className="small fw-bold text-uppercase text-danger d-flex align-items-center gap-2 mb-1">
                        <span className="spinner-grow spinner-grow-sm text-danger" role="status" />
                        Active Downtime: {downtimeMachineDef.machineName}
                      </div>
                      <div className="fw-bold fs-5 mb-1">{activeDowntime.reason}</div>
                      <div className="small text-dark">
                        Started: <strong>{activeDowntime.startTimeStr || activeDowntime.startTime}</strong> • Stoppage Duration:{" "}
                        <strong className="text-danger fs-6">{formatElapsed(activeDowntimeElapsedSec)}</strong>
                      </div>
                    </div>
                    <Button
                      variant="success"
                      size="md"
                      className="fw-bold shadow-sm px-4 w-100 w-sm-auto"
                      onClick={() => handleEndDowntime(activeDowntime.id, downtimeMachineId)}
                      disabled={isUpdatingDowntime}
                    >
                      {isUpdatingDowntime ? "Resolving..." : "✓ End Active Downtime"}
                    </Button>
                  </Alert>
                )}

                {/* Downtime Status Summary Box */}
                {downtimeCheckResult && (
                  <Card className="bg-light border mt-4">
                    <Card.Body className="py-3">
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <span className="small fw-bold text-muted text-uppercase">
                          Operational Status Overview: {downtimeMachineDef.machineName}
                        </span>
                        <span className="small text-muted">
                          {downtimeCheckResult.serverTimeSLST}
                        </span>
                      </div>
                      <Row className="g-2 text-center">
                        <Col xs={6} md={3}>
                          <div className="p-2 bg-white rounded border">
                            <div className="small text-muted">Operational State</div>
                            <div
                              className={`fw-bold ${
                                downtimeCheckResult.hasActiveDowntime
                                  ? "text-danger"
                                  : "text-success"
                              }`}
                            >
                              {downtimeCheckResult.hasActiveDowntime ? "⚠️ DOWNTIME" : "● OPERATIONAL"}
                            </div>
                          </div>
                        </Col>
                        <Col xs={6} md={3}>
                          <div className="p-2 bg-white rounded border">
                            <div className="small text-muted">Incidents Today</div>
                            <div className="fw-bold text-dark">
                              {downtimeCheckResult.totalDowntimesCount} logged
                            </div>
                          </div>
                        </Col>
                        <Col xs={6} md={3}>
                          <div className="p-2 bg-white rounded border">
                            <div className="small text-muted">Machine Line</div>
                            <div className="fw-bold text-primary font-monospace">
                              {downtimeMachineId}
                            </div>
                          </div>
                        </Col>
                        <Col xs={6} md={3}>
                          <div className="p-2 bg-white rounded border">
                            <div className="small text-muted">Total Stoppage</div>
                            <div className="fw-bold text-warning-emphasis">
                              {formatDuration(totalDowntimeMinutes)}
                            </div>
                          </div>
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                )}
              </Card.Body>
            </Card>

            {/* Downtime Logs Table */}
            <Card className="modern-card border shadow-sm">
              <Card.Body className="p-3 p-sm-4">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                  <h5 className="fw-bold mb-0 fs-6 fs-sm-5">
                    Downtime Logs ({selectedDate})
                  </h5>
                  <Badge bg="warning" text="dark" className="px-3 py-1.5 fw-bold">
                    Total Downtime: {formatDuration(totalDowntimeMinutes)}
                  </Badge>
                </div>

                {downtimesList.length === 0 ? (
                  <div className="text-center text-muted py-4">
                    <i className="bi bi-check-circle text-success fs-3 d-block mb-1"></i>
                    No equipment downtimes recorded for {selectedDate}.
                  </div>
                ) : (
                  <div className="table-responsive">
                    <Table hover className="wb-table align-middle mb-0">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Equipment</th>
                          <th>Reason</th>
                          <th>Start Time</th>
                          <th>End Time</th>
                          <th>Duration</th>
                          <th>Source</th>
                          <th>Status / Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {downtimesList.map((dt, idx) => {
                          const machDef =
                            SUPPORTED_MACHINES.find((m) => m.machineId === dt.machineId) ||
                            SUPPORTED_MACHINES[0];

                          return (
                            <tr key={dt.id || idx}>
                              <td className="text-muted">{downtimesList.length - idx}</td>
                              <td>
                                <Badge bg="secondary" className="px-2 py-1">
                                  {machDef.machineName}
                                </Badge>
                              </td>
                              <td className="fw-bold">{dt.reason || "Machine Downtime"}</td>
                              <td>
                                <code className="text-dark">{dt.startTimeStr || dt.startTime || "—"}</code>
                              </td>
                              <td>
                                <code className="text-dark">
                                  {dt.active ? "Ongoing..." : dt.endTimeStr || dt.endTime || "—"}
                                </code>
                              </td>
                              <td className="fw-bold text-warning font-monospace">
                                {dt.active
                                  ? formatElapsed(activeDowntimeElapsedSec)
                                  : dt.durationSeconds !== undefined && dt.durationSeconds !== null
                                  ? `${dt.durationSeconds}s (${dt.durationMinutes || 0}m)`
                                  : formatDuration(dt.durationMinutes)}
                              </td>
                              <td>
                                <Badge bg="light" text="dark" className="text-uppercase border">
                                  {dt.source || "portal"}
                                </Badge>
                              </td>
                              <td>
                                {dt.active ? (
                                  <Button
                                    variant="success"
                                    size="sm"
                                    className="fw-bold shadow-sm"
                                    onClick={() => handleEndDowntime(dt.id, dt.machineId || downtimeMachineId)}
                                    disabled={isUpdatingDowntime}
                                  >
                                    End Downtime
                                  </Button>
                                ) : (
                                  <Badge bg="secondary">ENDED</Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </div>
                )}
              </Card.Body>
            </Card>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: SINGLE-PAGE PDF REPORTS (ACROSS ALL MACHINES / FLEET)        */}
        {/* =================================================================== */}
        {activeTab === "reports" && (
          <Card className="modern-card border shadow-sm">
            <Card.Body className="p-3 p-sm-4">
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
                <div>
                  <h5 className="fw-bold mb-1 fs-6 fs-sm-5">
                    Single-Page PDF Reports (Toyo Cushion Lanka)
                  </h5>
                  <div className="text-muted small">
                    Generate audit-ready single-page reports across all monitored lines (Consolidated Fleet) or for a specific cutting machine.
                  </div>
                </div>

                <div className="d-flex flex-wrap gap-2 w-100 w-sm-auto">
                  <Button
                    variant="success"
                    className="fw-bold shadow-sm flex-grow-1 flex-sm-grow-0"
                    onClick={() => handleGeneratePdf("hourly", selectedDate, reportTargetMachineId)}
                    disabled={isGeneratingReport}
                  >
                    {isGeneratingReport ? (
                      <>
                        <Spinner size="sm" className="me-1" /> Generating...
                      </>
                    ) : (
                      `📄 Hourly Production PDF (${selectedDate})`
                    )}
                  </Button>

                  <Button
                    variant="warning"
                    className="fw-bold text-dark shadow-sm flex-grow-1 flex-sm-grow-0"
                    onClick={() => handleGeneratePdf("downtime", selectedDate, reportTargetMachineId)}
                    disabled={isGeneratingReport}
                  >
                    {isGeneratingReport ? (
                      <>
                        <Spinner size="sm" className="me-1" /> Generating...
                      </>
                    ) : (
                      `⚠️ Downtime PDF (${selectedDate})`
                    )}
                  </Button>
                </div>
              </div>

              {/* Machine / Fleet Scope Selector */}
              <div className="p-3 bg-light rounded-3 border mb-4">
                <Row className="g-3 align-items-center">
                  <Col xs={12} md={6}>
                    <Form.Group>
                      <Form.Label className="small fw-bold text-muted text-uppercase">
                        Report Target Scope / Machine Line:
                      </Form.Label>
                      <Form.Select
                        value={reportTargetMachineId}
                        onChange={(e) => setReportTargetMachineId(e.target.value)}
                        className="fw-bold font-monospace"
                      >
                        <option value="all">🌐 All Monitored Machines (Consolidated Fleet Report)</option>
                        {SUPPORTED_MACHINES.map((m) => (
                          <option key={m.machineId} value={m.machineId}>
                            {m.machineName} ({m.machineId})
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={6}>
                    <div className="small text-muted pt-md-3">
                      {reportTargetMachineId === "all" ? (
                        <span className="text-success fw-semibold">
                          ✓ Fleet Report will include multi-machine volume summary, active orders, and 24-hour fleet distribution.
                        </span>
                      ) : (
                        <span>
                          Report will focus exclusively on the selected machine line.
                        </span>
                      )}
                    </div>
                  </Col>
                </Row>
              </div>

              {/* Quick Previous Day PDF Generator Row */}
              <div className="p-3 bg-light rounded-3 border mb-4 d-flex flex-wrap align-items-center justify-content-between gap-2">
                <div>
                  <span className="fw-bold text-dark">
                    Previous Day PDF Reports ({yesterdayStr}):
                  </span>
                  <span className="text-muted small ms-2">
                    Generate audit reports for yesterday with a single tap.
                  </span>
                </div>
                <div className="d-flex gap-2">
                  <Button
                    variant="outline-success"
                    size="sm"
                    className="fw-bold"
                    onClick={() => handleGeneratePdf("hourly", yesterdayStr, reportTargetMachineId)}
                    disabled={isGeneratingReport}
                  >
                    + Previous Day Hourly PDF
                  </Button>
                  <Button
                    variant="outline-warning"
                    size="sm"
                    className="fw-bold text-dark"
                    onClick={() => handleGeneratePdf("downtime", yesterdayStr, reportTargetMachineId)}
                    disabled={isGeneratingReport}
                  >
                    + Previous Day Downtime PDF
                  </Button>
                </div>
              </div>

              {storedReports.length === 0 ? (
                <div className="text-center text-muted py-4">
                  No PDF reports generated yet. Click above to generate an <strong>Hourly Cuts</strong> or <strong>Downtime Logs</strong> PDF.
                </div>
              ) : (
                <Table responsive hover className="align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Report Type</th>
                      <th>Scope / Equipment</th>
                      <th>Date</th>
                      <th>File Name</th>
                      <th>Size</th>
                      <th>Created (SLST)</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storedReports.map((rep) => {
                      const isDowntime =
                        rep.reportType === "downtime" ||
                        (rep.fileName && rep.fileName.includes("Downtime"));
                      const isDeleting = deletingReportId === rep.id;
                      const repMachine = rep.machineId || (rep.fileName && rep.fileName.includes("Fleet") ? "all" : "rubberised_coir_cutter");
                      const isFleet = repMachine === "all" || (rep.title && rep.title.includes("Fleet"));

                      return (
                        <tr key={rep.id}>
                          <td>
                            <Badge
                              bg={isDowntime ? "warning" : "success"}
                              text={isDowntime ? "dark" : "light"}
                              className="px-2 py-1"
                            >
                              {isDowntime ? "⚠️ DOWNTIME LOGS" : "📊 HOURLY PRODUCTION"}
                            </Badge>
                          </td>
                          <td>
                            <Badge bg={isFleet ? "primary" : "secondary"} className="px-2 py-1">
                              {isFleet ? "🌐 Consolidated Fleet" : repMachine}
                            </Badge>
                          </td>
                          <td className="fw-bold">{rep.date}</td>
                          <td>
                            <code>{rep.fileName || "Cutter_Report.pdf"}</code>
                          </td>
                          <td className="text-muted small">
                            {rep.fileSizeBytes
                              ? `${(rep.fileSizeBytes / 1024).toFixed(1)} KB`
                              : "—"}
                          </td>
                          <td className="text-secondary small">
                            {rep.createdAtFormatted || rep.createdAt || "—"}
                          </td>
                          <td>
                            <div className="d-flex justify-content-end gap-2">
                              <Button
                                as="a"
                                href={getReportDownloadUrl(rep.id)}
                                target="_blank"
                                rel="noreferrer"
                                variant="outline-success"
                                size="sm"
                                className="fw-bold"
                              >
                                View / Download PDF
                              </Button>
                              <Button
                                variant="outline-danger"
                                size="sm"
                                className="fw-bold"
                                onClick={() => handleDeleteReport(rep.id, rep.fileName)}
                                disabled={isDeleting}
                              >
                                {isDeleting ? (
                                  <>
                                    <Spinner size="sm" className="me-1" /> Deleting...
                                  </>
                                ) : (
                                  "🗑️ Delete"
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        )}

        {/* =================================================================== */}
        {/* TAB 5: ARCHIVED CUTS EXPLORER (CUSTOM MACHINE & DATE RANGE QUERY)  */}
        {/* =================================================================== */}
        {activeTab === "archive" && (
          <Card className="modern-card border shadow-sm">
            <Card.Body className="p-3 p-sm-4">
              {/* Header */}
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
                <div>
                  <h5 className="fw-bold mb-1 fs-6 fs-sm-5 d-flex align-items-center gap-2">
                    <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-2 py-1">
                      <i className="bi bi-archive-fill me-1"></i> Permanent Telemetry Archive
                    </span>
                    <span>Archived Cuts &amp; Production Pulse Explorer</span>
                  </h5>
                  <div className="text-muted small">
                    Retrieve permanent historical cut signals and linear output from <code>cuts_archive</code> across custom date spans and machines.
                  </div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <Badge bg="success" className="px-3 py-2 fs-7 fw-semibold">
                    <i className="bi bi-shield-check me-1"></i> Retention: Permanent (Zero Purge)
                  </Badge>
                </div>
              </div>

              {/* Filter Controls Bar */}
              <Card className="bg-light border mb-4">
                <Card.Body className="p-3">
                  <Row className="g-3 align-items-end">
                    <Col xs={12} md={4}>
                      <Form.Group>
                        <Form.Label className="small fw-bold text-uppercase text-secondary mb-1">
                          <i className="bi bi-cpu me-1"></i> Select Machine
                        </Form.Label>
                        <Form.Select
                          value={archiveMachineId}
                          onChange={(e) => setArchiveMachineId(e.target.value)}
                          className="fw-semibold"
                        >
                          <option value="all">🌐 All Monitored Machines (Consolidated Fleet)</option>
                          {SUPPORTED_MACHINES.map((m) => (
                            <option key={m.machineId} value={m.machineId}>
                              🏭 {m.machineName} ({m.machineId})
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                    <Col xs={6} md={3}>
                      <Form.Group>
                        <Form.Label className="small fw-bold text-uppercase text-secondary mb-1">
                          <i className="bi bi-calendar-event me-1"></i> From Date
                        </Form.Label>
                        <Form.Control
                          type="date"
                          value={archiveFromDate}
                          onChange={(e) => setArchiveFromDate(e.target.value)}
                          className="fw-semibold font-monospace"
                        />
                      </Form.Group>
                    </Col>
                    <Col xs={6} md={3}>
                      <Form.Group>
                        <Form.Label className="small fw-bold text-uppercase text-secondary mb-1">
                          <i className="bi bi-calendar-check me-1"></i> To Date
                        </Form.Label>
                        <Form.Control
                          type="date"
                          value={archiveToDate}
                          onChange={(e) => setArchiveToDate(e.target.value)}
                          className="fw-semibold font-monospace"
                        />
                      </Form.Group>
                    </Col>
                    <Col xs={12} md={2} className="d-flex gap-2">
                      <Button
                        variant="primary"
                        className="w-100 fw-bold d-flex align-items-center justify-content-center gap-1"
                        onClick={handleRetrieveArchivedCuts}
                        disabled={isLoadingArchive}
                      >
                        {isLoadingArchive ? (
                          <>
                            <Spinner animation="border" size="sm" />
                            <span>Querying...</span>
                          </>
                        ) : (
                          <>
                            <i className="bi bi-search"></i>
                            <span>Retrieve Cuts</span>
                          </>
                        )}
                      </Button>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>

              {/* Summary KPIs (shown when data retrieved) */}
              {archiveHasSearched && (
                <Row className="g-3 mb-4">
                  <Col xs={6} lg={3}>
                    <Card className="border shadow-none bg-primary bg-opacity-10 text-primary">
                      <Card.Body className="p-3 text-center">
                        <div className="small text-uppercase fw-bold opacity-75">Archived Pulses / Cuts</div>
                        <h3 className="fw-black my-1 font-monospace">{archiveSummary.totalCuts.toLocaleString()}</h3>
                        <div className="small opacity-75">Total signals recorded</div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col xs={6} lg={3}>
                    <Card className="border shadow-none bg-success bg-opacity-10 text-success">
                      <Card.Body className="p-3 text-center">
                        <div className="small text-uppercase fw-bold opacity-75">Linear Output</div>
                        <h3 className="fw-black my-1 font-monospace">{archiveSummary.totalLinearMeters.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m</h3>
                        <div className="small opacity-75">Total meters produced</div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col xs={6} lg={3}>
                    <Card className="border shadow-none bg-info bg-opacity-10 text-info">
                      <Card.Body className="p-3 text-center">
                        <div className="small text-uppercase fw-bold opacity-75">Records Retrieved</div>
                        <h3 className="fw-black my-1 font-monospace">{archivedCutsList.length.toLocaleString()}</h3>
                        <div className="small opacity-75">Across selected date span</div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col xs={6} lg={3}>
                    <Card className="border shadow-none bg-warning bg-opacity-10 text-dark">
                      <Card.Body className="p-3 text-center">
                        <div className="small text-uppercase fw-bold opacity-75">Orders Involved</div>
                        <h3 className="fw-black my-1 font-monospace">{archiveSummary.distinctOrdersCount}</h3>
                        <div className="small opacity-75">{archiveSummary.distinctMachinesCount} machine(s) active</div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              )}

              {/* Data Table with Search and Export */}
              {archiveHasSearched && (
                <div className="border rounded-3 p-3 bg-white">
                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
                    <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ maxWidth: 450 }}>
                      <InputGroup size="sm">
                        <InputGroup.Text className="bg-light border-end-0">
                          <i className="bi bi-funnel"></i>
                        </InputGroup.Text>
                        <Form.Control
                          type="text"
                          placeholder="Filter by Order #, Machine, Date, or Status..."
                          value={archiveSearchTerm}
                          onChange={(e) => setArchiveSearchTerm(e.target.value)}
                          className="border-start-0"
                        />
                      </InputGroup>
                      {archiveSearchTerm && (
                        <Button
                          variant="link"
                          size="sm"
                          className="text-muted p-0 text-decoration-none"
                          onClick={() => setArchiveSearchTerm("")}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <span className="small text-muted">
                        Showing {filteredArchivedCuts.length} of {archivedCutsList.length} records
                      </span>
                      <Button
                        variant="outline-success"
                        size="sm"
                        className="fw-bold d-flex align-items-center gap-1"
                        onClick={handleExportArchiveCsv}
                        disabled={!archivedCutsList.length}
                      >
                        <i className="bi bi-file-earmark-excel"></i>
                        <span>Export CSV</span>
                      </Button>
                    </div>
                  </div>

                  {filteredArchivedCuts.length === 0 ? (
                    <div className="text-center py-5 text-muted">
                      <div className="display-6 mb-2">📂</div>
                      <h6 className="fw-bold">No Archived Cuts Found</h6>
                      <p className="small mb-0">
                        {archivedCutsList.length === 0
                          ? "No cut telemetry records matched the selected date range and machine filter."
                          : "No records matched your current text search filter."}
                      </p>
                    </div>
                  ) : (
                    <div className="table-responsive" style={{ maxHeight: "560px" }}>
                      <Table hover size="sm" className="align-middle mb-0 font-monospace" style={{ fontSize: "0.82rem" }}>
                        <thead className="table-light sticky-top">
                          <tr>
                            <th style={{ width: "50px" }}>#</th>
                            <th style={{ minWidth: "160px" }}>Date &amp; SLST Time</th>
                            <th style={{ minWidth: "220px" }}>Machine</th>
                            <th style={{ minWidth: "130px" }}>Production Order</th>
                            <th className="text-center" style={{ width: "90px" }}>Pulse</th>
                            <th className="text-end" style={{ width: "110px" }}>Factor</th>
                            <th className="text-end" style={{ width: "130px" }}>Linear Meters</th>
                            <th style={{ minWidth: "220px" }}>Operational Status</th>
                            <th className="text-center" style={{ width: "90px" }}>Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredArchivedCuts.slice(0, 500).map((cut, idx) => {
                            const timeStr = cut.timeString || (cut.timestamp ? cut.timestamp.slice(11, 19) : "—");
                            const mach = SUPPORTED_MACHINES.find((m) => m.machineId === cut.machineId);
                            const machName = cut.machineName || mach?.machineName || cut.machineId || "Coir Cutter #1";
                            const cutsVal = cut.cutsAdded || cut.value || 1;
                            const factor = cut.meterCount !== undefined ? Number(cut.meterCount) : (mach?.defaultMeterCount || 2.50);
                            const linearMeters = cut.linearMetersProduced !== undefined ? Number(cut.linearMetersProduced) : Number((cutsVal * factor).toFixed(2));
                            const isLiveToday = cut.source === "active_today";

                            return (
                              <tr key={cut.id || idx}>
                                <td className="text-muted small">{idx + 1}</td>
                                <td>
                                  <span className="fw-bold">{cut.date}</span>{" "}
                                  <span className="text-muted">{timeStr}</span>
                                </td>
                                <td>
                                  <div className="fw-semibold text-truncate" style={{ maxWidth: "240px" }} title={machName}>
                                    {machName}
                                  </div>
                                  <small className="text-muted font-monospace">{cut.machineId || "rubberised_coir_cutter"}</small>
                                </td>
                                <td>
                                  {cut.productionOrder ? (
                                    <Badge bg="light" text="dark" className="border font-monospace px-2 py-1">
                                      {cut.productionOrder}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )}
                                </td>
                                <td className="text-center fw-bold text-primary">
                                  +{cutsVal}
                                </td>
                                <td className="text-end text-muted">
                                  {factor.toFixed(2)} m
                                </td>
                                <td className="text-end fw-bold text-success font-monospace">
                                  {linearMeters.toFixed(2)} m
                                </td>
                                <td>
                                  <small className="text-secondary text-truncate d-inline-block" style={{ maxWidth: "260px" }} title={cut.statusDescription}>
                                    {cut.statusDescription || `Signal Pulse Logged (+${cutsVal} Cut)`}
                                  </small>
                                </td>
                                <td className="text-center">
                                  {isLiveToday ? (
                                    <Badge bg="info" className="px-2 py-1">Live</Badge>
                                  ) : (
                                    <Badge bg="secondary" className="px-2 py-1">Archive</Badge>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                      {filteredArchivedCuts.length > 500 && (
                        <div className="text-center py-2 text-muted small bg-light border-top">
                          Displaying first 500 of {filteredArchivedCuts.length} records. Export CSV to analyze all records.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Initial call-to-action before first search */}
              {!archiveHasSearched && (
                <div className="text-center py-5 border rounded-3 bg-light text-muted">
                  <div className="display-5 mb-3 text-secondary">
                    <i className="bi bi-clock-history"></i>
                  </div>
                  <h6 className="fw-bold">Select Machine &amp; Date Range</h6>
                  <p className="small mb-3 text-secondary mx-auto" style={{ maxWidth: "500px" }}>
                    Choose a cutting machine and date interval (From / To) above, then click <strong>Retrieve Cuts</strong> to query and view permanent archived telemetry.
                  </p>
                  <Button
                    variant="outline-primary"
                    size="sm"
                    className="fw-bold"
                    onClick={handleRetrieveArchivedCuts}
                    disabled={isLoadingArchive}
                  >
                    <i className="bi bi-search me-1"></i> Retrieve Last 7 Days (Consolidated Fleet)
                  </Button>
                </div>
              )}
            </Card.Body>
          </Card>
        )}

        {/* =================================================================== */}
        {/* TAB 6: SYSTEM & API PERFORMANCE (DEVELOPER DOCS & TELEMETRY)        */}
        {/* =================================================================== */}
        {activeTab === "performance" && (
          <div className="d-flex flex-column gap-3">
            <Card className="modern-card border shadow-sm">
              <Card.Body className="p-3 d-flex flex-wrap align-items-center justify-content-between gap-3">
                <div>
                  <h6 className="fw-bold mb-0">REST API &amp; Swagger Documentation</h6>
                  <div className="small text-muted">
                    Explore OpenAPI 3.0 specs and live interactive endpoints for IoT integrations.
                  </div>
                </div>
                <Button
                  as="a"
                  href="/docs"
                  target="_blank"
                  rel="noreferrer"
                  variant="outline-primary"
                  size="sm"
                  className="fw-bold"
                >
                  📄 Open Swagger API Docs ↗
                </Button>
              </Card.Body>
            </Card>
            <ApiPerformanceTab selectedDate={selectedDate} />
          </div>
        )}
      </div>
    </div>
  );
}
