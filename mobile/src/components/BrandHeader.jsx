import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Linking
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AppLogo from "./AppLogo";
import { useCutter } from "../context/CutterContext";
import { getSLSTDate } from "../utils/timeZoneUtils";
import { useResponsive } from "../utils/responsive";

export default function BrandHeader() {
  const {
    activeDowntime,
    currentTimeSLST,
    selectedDate,
    setSelectedDate,
    currentUser,
    logout,
    actionNotice,
    setActionNotice
  } = useCutter();

  const insets = useSafeAreaInsets();
  const { isSmallPhone, rf, containerPadding } = useResponsive();

  const todayStr = getSLSTDate().dateString;
  const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yesterdayStr = getSLSTDate(yesterdayDate).dateString;

  const stepDate = (daysDelta) => {
    const parts = (selectedDate || todayStr).split("-").map(Number);
    if (parts.length === 3) {
      const dt = new Date(parts[0], parts[1] - 1, parts[2]);
      dt.setDate(dt.getDate() + daysDelta);
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");
      setSelectedDate(`${yyyy}-${mm}-${dd}`);
    }
  };

  const openSwaggerDocs = () => {
    const url = "https://msc-mobile-computing-project.web.app/docs";
    if (Platform.OS === "web") {
      window.open(url, "_blank");
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  return (
    <View>
      {/* Top Navbar (.tcl-navbar style) */}
      <View
        style={[
          styles.navbar,
          {
            paddingTop: Math.max(insets.top + 8, 14),
            paddingHorizontal: containerPadding
          }
        ]}
      >
        {/* Row 1: Logo + Brand Title */}
        <View style={styles.brandRow}>
          <View style={styles.navLogoBox}>
            <AppLogo size={isSmallPhone ? 38 : 42} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrowWarning, { fontSize: rf(9) }]} numberOfLines={1}>
              TOYO CUSHION LANKA • HAYLEYS ECO SOLUTIONS
            </Text>
            <Text style={[styles.brandTitle, { fontSize: rf(16) }]} numberOfLines={1}>
              Coir Cutter Volume & Downtime Monitor
            </Text>
          </View>
        </View>

        {/* Row 2: Live Status Pill + SLST Clock Badge + Swagger + Sign Out */}
        <View style={styles.controlsRow}>
          <View
            style={[
              styles.statusPill,
              activeDowntime ? styles.statusDowntime : styles.statusRunning
            ]}
          >
            <View
              style={[
                styles.statusDot,
                activeDowntime ? styles.dotDowntime : styles.dotRunning
              ]}
            />
            <Text style={[styles.statusPillText, { fontSize: rf(10) }]}>
              {activeDowntime ? "DOWNTIME ACTIVE" : "MACHINE RUNNING"}
            </Text>
          </View>

          <View style={styles.darkClockBadge}>
            <Text style={[styles.darkClockText, { fontSize: rf(10) }]}>
              🕒 {currentTimeSLST.timeString} SLST
            </Text>
          </View>

          <View style={styles.rightButtons}>
            <TouchableOpacity
              style={styles.btnOutlineLight}
              onPress={openSwaggerDocs}
              activeOpacity={0.75}
            >
              <Text style={[styles.btnOutlineLightText, { fontSize: rf(10) }]}>
                📄 API Docs
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnDangerSm}
              onPress={logout}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnDangerSmText, { fontSize: rf(10) }]}>
                Sign Out ({currentUser?.username || "admin"})
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Row 3: Day Selector (Today vs Previous Day) */}
        <View style={styles.dateBar}>
          <TouchableOpacity
            style={[
              styles.dateChip,
              { flex: 1, paddingVertical: 8, alignItems: "center" },
              selectedDate === todayStr && styles.dateChipActive
            ]}
            onPress={() => setSelectedDate(todayStr)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.dateChipText,
                { fontSize: rf(11), fontWeight: "800" },
                selectedDate === todayStr && styles.dateChipTextActive
              ]}
            >
              Today ({todayStr})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.dateChip,
              { flex: 1, paddingVertical: 8, alignItems: "center" },
              selectedDate === yesterdayStr && styles.dateChipActive
            ]}
            onPress={() => setSelectedDate(yesterdayStr)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.dateChipText,
                { fontSize: rf(11), fontWeight: "800" },
                selectedDate === yesterdayStr && styles.dateChipTextActive
              ]}
            >
              Previous Day ({yesterdayStr})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Dismissible Bootstrap-style Alert Toast */}
      {actionNotice && (
        <View
          style={[
            styles.alertBox,
            { marginHorizontal: containerPadding },
            actionNotice.type === "warning"
              ? styles.alertWarning
              : actionNotice.type === "error"
              ? styles.alertDanger
              : styles.alertSuccess
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.alertTitle,
                { fontSize: rf(12) },
                actionNotice.type === "warning"
                  ? { color: "#664d03" }
                  : actionNotice.type === "error"
                  ? { color: "#842029" }
                  : { color: "#0f5132" }
              ]}
            >
              {actionNotice.title}
            </Text>
            <Text
              style={[
                styles.alertMsg,
                { fontSize: rf(11) },
                actionNotice.type === "warning"
                  ? { color: "#664d03" }
                  : actionNotice.type === "error"
                  ? { color: "#842029" }
                  : { color: "#0f5132" }
              ]}
            >
              {actionNotice.message}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setActionNotice(null)}>
            <Ionicons name="close" size={18} color="#495057" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  navbar: {
    backgroundColor: "#065f46",
    borderBottomWidth: 3,
    borderBottomColor: "#10b981",
    paddingBottom: 12,
    elevation: 6,
    shadowColor: "#064e3b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10
  },
  navLogoBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    padding: 3,
    alignItems: "center",
    justifyContent: "center"
  },
  eyebrowWarning: {
    color: "#ffc107",
    fontWeight: "800",
    letterSpacing: 0.6
  },
  brandTitle: {
    color: "#ffffff",
    fontWeight: "800",
    marginTop: 1
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1
  },
  statusRunning: {
    backgroundColor: "rgba(16, 185, 129, 0.22)",
    borderColor: "#6ee7b7"
  },
  statusDowntime: {
    backgroundColor: "rgba(239, 68, 68, 0.9)",
    borderColor: "#fca5a5"
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  },
  dotRunning: {
    backgroundColor: "#34d399"
  },
  dotDowntime: {
    backgroundColor: "#ffffff"
  },
  statusPillText: {
    color: "#ffffff",
    fontWeight: "800",
    letterSpacing: 0.3
  },
  darkClockBadge: {
    backgroundColor: "#212529",
    borderColor: "#6c757d",
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6
  },
  darkClockText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  rightButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto"
  },
  btnOutlineLight: {
    borderWidth: 1,
    borderColor: "#f8f9fa",
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  btnOutlineLightText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  btnDangerSm: {
    backgroundColor: "#dc3545",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  btnDangerSmText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  dateBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.14)"
  },
  dateChipsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  dateChip: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6
  },
  dateChipActive: {
    backgroundColor: "#198754"
  },
  dateChipText: {
    color: "#e2e8f0",
    fontWeight: "700"
  },
  dateChipTextActive: {
    color: "#ffffff"
  },
  dateInputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3
  },
  stepBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2
  },
  dateValueText: {
    color: "#212529",
    fontWeight: "800",
    marginHorizontal: 6
  },
  alertBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  alertSuccess: {
    backgroundColor: "#d1e7dd",
    borderColor: "#badbcc"
  },
  alertWarning: {
    backgroundColor: "#fff3cd",
    borderColor: "#ffecb5"
  },
  alertDanger: {
    backgroundColor: "#f8d7da",
    borderColor: "#f5c2c7"
  },
  alertTitle: {
    fontWeight: "800"
  },
  alertMsg: {
    marginTop: 2
  }
});
