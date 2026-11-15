import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Linking,
  Alert
} from "react-native";
import BrandHeader from "../components/BrandHeader";
import { useCutter } from "../context/CutterContext";
import { useResponsive } from "../utils/responsive";
import ApiPerformanceScreen from "./ApiPerformanceScreen";

const DOWNTIME_PRESETS = [
  "Blade Maintenance",
  "Material Changeover",
  "Coir Sheet Feeding Adjustment",
  "Electrical / Sensor Check",
  "Scheduled Operator Break"
];

export default function DashboardScreen({ initialTab = "overview" }) {
  const {
    selectedDate,
    todayStr,
    yesterdayStr,
    currentTimeSLST,
    dailyMetrics,
    cutsLog,
    downtimesList,
    storedReports,
    activeDowntime,
    activeDowntimeElapsedSec,
    triggerPostSignal,
    triggerDowntimeStart,
    triggerDowntimeEnd,
    checkDowntime,
    downtimeCheckResult,
    generatePdf,
    deleteReport,
    getReportDownloadUrl,
    isLoading
  } = useCutter();

  const { rf, containerPadding, cardPadding, isTablet } = useResponsive();
  const [activeTab, setActiveTab] = useState(initialTab); // "overview" | "downtime" | "reports"
  const [downtimeReason, setDowntimeReason] = useState("Blade Maintenance");

  const formatElapsed = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const formatDurationMins = (totalMinutes) => {
    if (!totalMinutes || isNaN(totalMinutes)) return "0m";
    const totalSec = Math.round(Number(totalMinutes) * 60);
    if (totalSec < 60 && totalSec > 0) return `${totalSec}s`;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return secs > 0 ? `${m}m ${secs}s` : `${m}m`;
    return `${h}h ${m}m`;
  };

  const handleDownloadReport = (reportId) => {
    const url = getReportDownloadUrl(reportId);
    if (Platform.OS === "web") {
      window.open(url, "_blank");
    } else {
      Linking.openURL(url).catch((err) => console.warn("Open URL error:", err));
    }
  };

  const handleDeleteReport = (reportId, fileName) => {
    if (Platform.OS === "web") {
      if (window.confirm(`Are you sure you want to delete report "${fileName || reportId}"?`)) {
        deleteReport(reportId);
      }
    } else {
      Alert.alert(
        "Delete PDF Report",
        `Are you sure you want to delete "${fileName || reportId}"? This will remove the file from Firestore and Cloud Storage.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => deleteReport(reportId)
          }
        ]
      );
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <BrandHeader />

        <View style={{ paddingHorizontal: containerPadding, marginTop: 14, gap: 14 }}>
          {/* Active Downtime Alert Banner (.tcl-downtime-banner) */}
          {activeDowntime && (
            <View style={[styles.downtimeBanner, { padding: cardPadding }]}>
              <View style={styles.bannerTopRow}>
                <View style={styles.badgeDanger}>
                  <Text style={[styles.badgeDangerText, { fontSize: rf(10) }]}>
                    ⚠️ ACTIVE DOWNTIME IN PROGRESS
                  </Text>
                </View>
                <Text style={[styles.startedDangerText, { fontSize: rf(11) }]}>
                  Started at {activeDowntime.startTimeStr || activeDowntime.startTime}
                </Text>
              </View>

              <Text style={[styles.bannerReasonTitle, { fontSize: rf(16) }]}>
                Reason: {activeDowntime.reason || "Machine Downtime"}
              </Text>

              <Text style={[styles.bannerElapsedSub, { fontSize: rf(12) }]}>
                Elapsed Downtime:{" "}
                <Text style={styles.bannerElapsedBold}>
                  {formatElapsed(activeDowntimeElapsedSec)}
                </Text>{" "}
                • Tap End Active Downtime when the machine resumes operation.
              </Text>

              <TouchableOpacity
                style={styles.btnSuccessBanner}
                onPress={() => triggerDowntimeEnd(activeDowntime.id)}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                <Text style={[styles.btnSuccessBannerText, { fontSize: rf(13) }]}>
                  ✓ End Active Downtime
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 4 Summary KPI Cards (.tcl-kpi-card) */}
          <View style={styles.kpiGrid}>
            {/* KPI 1: Total Volume */}
            <View
              style={[
                styles.kpiCard,
                isTablet ? styles.kpiCol4 : styles.kpiCol2,
                { padding: cardPadding }
              ]}
            >
              <Text style={[styles.kpiLabel, { fontSize: rf(10) }]}>
                TOTAL VOLUME ({selectedDate})
              </Text>
              <Text style={[styles.kpiValueSuccess, { fontSize: rf(24) }]}>
                {dailyMetrics.totalCuts.toLocaleString()}{" "}
                <Text style={[styles.kpiUnitMuted, { fontSize: rf(13) }]}>cuts</Text>
              </Text>
              <View style={styles.kpiMetaRow}>
                <Text style={[styles.kpiMetaText, { fontSize: rf(10) }]}>
                  <Text style={{ fontWeight: "800" }}>{dailyMetrics.totalSignals}</Text> posts •{" "}
                </Text>
                <View style={styles.badgeSuccessSm}>
                  <Text style={[styles.badgeSuccessSmText, { fontSize: rf(9) }]}>
                    1 Post = 2 Cuts
                  </Text>
                </View>
              </View>
            </View>

            {/* KPI 2: Current Hour */}
            <View
              style={[
                styles.kpiCard,
                isTablet ? styles.kpiCol4 : styles.kpiCol2,
                { padding: cardPadding }
              ]}
            >
              <Text style={[styles.kpiLabel, { fontSize: rf(10) }]}>
                CURRENT HOUR ({String(currentTimeSLST.hour).padStart(2, "0")}:00)
              </Text>
              <Text style={[styles.kpiValuePrimary, { fontSize: rf(24) }]}>
                {dailyMetrics.currentHourCuts.toLocaleString()}{" "}
                <Text style={[styles.kpiUnitMuted, { fontSize: rf(13) }]}>cuts</Text>
              </Text>
              <Text style={[styles.kpiMetaText, { fontSize: rf(10), marginTop: 6 }]}>
                Peak Hour:{" "}
                <Text style={{ fontWeight: "800", color: "#212529" }}>
                  {dailyMetrics.peakCount > 0
                    ? `${String(dailyMetrics.peakHour).padStart(2, "0")}:00 (${dailyMetrics.peakCount} cuts)`
                    : "No cuts yet"}
                </Text>
              </Text>
            </View>

            {/* KPI 3: Downtime Logs */}
            <View
              style={[
                styles.kpiCard,
                isTablet ? styles.kpiCol4 : styles.kpiCol2,
                { padding: cardPadding }
              ]}
            >
              <Text style={[styles.kpiLabel, { fontSize: rf(10) }]}>
                DOWNTIME LOGS ({selectedDate})
              </Text>
              <Text style={[styles.kpiValueWarning, { fontSize: rf(24) }]}>
                {downtimesList.length}{" "}
                <Text style={[styles.kpiUnitMuted, { fontSize: rf(13) }]}>logs</Text>
              </Text>
              <Text style={[styles.kpiMetaText, { fontSize: rf(10), marginTop: 6 }]}>
                Total Duration:{" "}
                <Text style={{ fontWeight: "800", color: "#212529" }}>
                  {formatDurationMins(dailyMetrics.totalDowntimeMinutes)}
                </Text>
              </Text>
            </View>

            {/* KPI 4: Quick Cut Signal Test */}
            <View
              style={[
                styles.kpiCard,
                isTablet ? styles.kpiCol4 : styles.kpiCol2,
                { padding: cardPadding, justifyContent: "space-between" }
              ]}
            >
              <Text style={[styles.kpiLabel, { fontSize: rf(10) }]}>
                QUICK CUT SIGNAL TEST
              </Text>
              <TouchableOpacity
                style={styles.btnSuccessBlock}
                onPress={() => triggerPostSignal()}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={[styles.btnSuccessBlockText, { fontSize: rf(12) }]}>
                    + Post 1 Signal (+2 Cuts)
                  </Text>
                )}
              </TouchableOpacity>
              <Text style={[styles.kpiEndpointHint, { fontSize: rf(9) }]}>
                Calls <Text style={styles.codePink}>POST /api/signal</Text> (post = 1)
              </Text>
            </View>
          </View>

          {/* Bootstrap-style Nav Pills (.tcl-nav-pills) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.navPillsRow}
          >
            {[
              { id: "overview", label: "📊 Hourly Cut Volume (24h)" },
              { id: "downtime", label: `⚠️ Downtime Control & Logs (${downtimesList.length})` },
              { id: "reports", label: `📄 PDF Reports (${storedReports.length})` },
              { id: "performance", label: "⚡ API Performance (MCS4302)" }
            ].map((pill) => {
              const isActive = activeTab === pill.id;
              return (
                <TouchableOpacity
                  key={pill.id}
                  style={[styles.navPill, isActive && styles.navPillActive]}
                  onPress={() => setActiveTab(pill.id)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.navPillText,
                      { fontSize: rf(12) },
                      isActive && styles.navPillTextActive
                    ]}
                  >
                    {pill.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* =============================================================== */}
          {/* TAB 1: HOURLY CUT VOLUME & QUICK DOWNTIME CONTROL               */}
          {/* =============================================================== */}
          {activeTab === "overview" && (
            <View style={{ gap: 14 }}>
              {/* Quick Downtime Control Card */}
              <View style={[styles.sectionCard, { padding: cardPadding }]}>
                <View style={styles.cardHeaderFlex}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionTitle, { fontSize: rf(15) }]}>
                      Downtime Control (Start & End Downtime)
                    </Text>
                    <Text style={[styles.sectionSub, { fontSize: rf(11) }]}>
                      Post a downtime when a stoppage occurs and end the same downtime when resolved.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.btnOutlinePrimarySm}
                    onPress={checkDowntime}
                    disabled={isLoading}
                  >
                    <Text style={[styles.btnOutlinePrimarySmText, { fontSize: rf(10) }]}>
                      🔍 Check Downtime API
                    </Text>
                  </TouchableOpacity>
                </View>

                {!activeDowntime ? (
                  <View style={{ marginTop: 12, gap: 10 }}>
                    <TextInput
                      style={[styles.formControl, { fontSize: rf(13) }]}
                      value={downtimeReason}
                      onChangeText={setDowntimeReason}
                      placeholder="Enter downtime reason..."
                      placeholderTextColor="#6c757d"
                    />

                    <TouchableOpacity
                      style={styles.btnWarningBlock}
                      onPress={() => triggerDowntimeStart(downtimeReason)}
                      disabled={isLoading}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.btnWarningBlockText, { fontSize: rf(13) }]}>
                        ⚠️ Post / Start Downtime
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.chipsWrap}>
                      {DOWNTIME_PRESETS.map((preset) => {
                        const selected = downtimeReason === preset;
                        return (
                          <TouchableOpacity
                            key={preset}
                            style={[
                              styles.reasonChip,
                              selected && styles.reasonChipSelected
                            ]}
                            onPress={() => setDowntimeReason(preset)}
                          >
                            <Text
                              style={[
                                styles.reasonChipText,
                                { fontSize: rf(10) },
                                selected && styles.reasonChipTextSelected
                              ]}
                            >
                              {preset}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ) : (
                  <View style={styles.alertDangerInline}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.alertDangerInlineText, { fontSize: rf(12) }]}>
                        <Text style={{ fontWeight: "800" }}>Active Downtime:</Text>{" "}
                        {activeDowntime.reason} • Started at {activeDowntime.startTimeStr}{" "}
                        (Elapsed: {formatElapsed(activeDowntimeElapsedSec)})
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.btnSuccessSm}
                      onPress={() => triggerDowntimeEnd(activeDowntime.id)}
                      disabled={isLoading}
                    >
                      <Text style={[styles.btnSuccessSmText, { fontSize: rf(11) }]}>
                        ✓ End Same Downtime
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* 24-Hour Hourly Cut Volume Chart & Table */}
              <View style={[styles.sectionCard, { padding: cardPadding }]}>
                <View style={styles.cardHeaderFlex}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionTitle, { fontSize: rf(15) }]}>
                      Hourly Cut Volume ({selectedDate})
                    </Text>
                    <Text style={[styles.sectionSub, { fontSize: rf(11) }]}>
                      Each <Text style={styles.codePink}>Post 1</Text> signal increments the hour&apos;s volume by{" "}
                      <Text style={{ color: "#198754", fontWeight: "800" }}>2 cuts</Text>.
                    </Text>
                  </View>
                  <View style={styles.badgeSuccessLg}>
                    <Text style={[styles.badgeSuccessLgText, { fontSize: rf(11) }]}>
                      Daily Total: {dailyMetrics.totalCuts} Cuts ({dailyMetrics.totalSignals} Posts)
                    </Text>
                  </View>
                </View>

                {/* 24-Hour Visual Bar Chart (.tcl-hourly-chart) */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hourlyChartBox}
                >
                  {dailyMetrics.hourlyCuts.map((cuts, hour) => {
                    const maxH = dailyMetrics.maxHourly || 2;
                    const barHeight = Math.max(Math.round((cuts / maxH) * 110), cuts > 0 ? 14 : 5);
                    const isCurrentHour = hour === currentTimeSLST.hour;
                    return (
                      <View key={hour} style={styles.hourCol}>
                        <Text style={[styles.hourValText, { fontSize: rf(10) }]}>
                          {cuts > 0 ? cuts : ""}
                        </Text>
                        <View
                          style={[
                            styles.hourBar,
                            {
                              height: barHeight,
                              backgroundColor:
                                cuts > 0
                                  ? isCurrentHour
                                    ? "#059669"
                                  : "#10b981"
                                  : "#cbd5e1"
                            }
                          ]}
                        />
                        <Text
                          style={[
                            styles.hourLabelText,
                            { fontSize: rf(10) },
                            isCurrentHour && { color: "#059669", fontWeight: "900" }
                          ]}
                        >
                          {String(hour).padStart(2, "0")}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>

                {/* Bootstrap-style Hourly Breakdown Table */}
                <View style={styles.bsTable}>
                  <View style={styles.bsTableHead}>
                    <Text style={[styles.bsTh, { flex: 1.5, fontSize: rf(10) }]}>
                      Hour Window (SLST)
                    </Text>
                    <Text style={[styles.bsTh, { flex: 1, fontSize: rf(10) }]}>
                      Signals
                    </Text>
                    <Text style={[styles.bsTh, { flex: 1.2, fontSize: rf(10) }]}>
                      Cut Volume
                    </Text>
                    <Text style={[styles.bsTh, { flex: 0.7, textAlign: "right", fontSize: rf(10) }]}>
                      Share
                    </Text>
                  </View>

                  {dailyMetrics.hourlyCuts.map((cuts, hour) => {
                    if (cuts === 0 && hour !== currentTimeSLST.hour) return null;
                    const signals = dailyMetrics.hourlySignals[hour] || 0;
                    const pct =
                      dailyMetrics.totalCuts > 0
                        ? ((cuts / dailyMetrics.totalCuts) * 100).toFixed(1)
                        : "0.0";
                    return (
                      <View key={hour} style={styles.bsTr}>
                        <View style={{ flex: 1.5, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
                          <Text style={[styles.bsTdBold, { fontSize: rf(11) }]}>
                            {String(hour).padStart(2, "0")}:00 - {String((hour + 1) % 24).padStart(2, "0")}:00
                          </Text>
                          {hour === currentTimeSLST.hour && (
                            <View style={styles.badgeSuccessSm}>
                              <Text style={[styles.badgeSuccessSmText, { fontSize: rf(8) }]}>
                                Current
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.bsTd, { flex: 1, fontSize: rf(11) }]}>
                          {signals} posts
                        </Text>
                        <Text style={[styles.bsTdSuccess, { flex: 1.2, fontSize: rf(12) }]}>
                          {cuts} cuts
                        </Text>
                        <Text style={[styles.bsTdMuted, { flex: 0.7, textAlign: "right", fontSize: rf(11) }]}>
                          {pct}%
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Recent Cut Signals Feed Card */}
              <View style={[styles.sectionCard, { padding: cardPadding }]}>
                <View style={styles.cardHeaderFlex}>
                  <Text style={[styles.sectionTitle, { fontSize: rf(15) }]}>
                    Recent Cut Signals ({cutsLog.length} posts on {selectedDate})
                  </Text>
                  <View style={styles.badgeSecondary}>
                    <Text style={[styles.badgeSecondaryText, { fontSize: rf(10) }]}>
                      Each Post 1 = +2 Cuts
                    </Text>
                  </View>
                </View>

                {cutsLog.length === 0 ? (
                  <Text style={[styles.emptyTableText, { fontSize: rf(12) }]}>
                    No cut signals logged for {selectedDate} yet. Tap &ldquo;+ Post 1 Signal (+2 Cuts)&rdquo; above to test.
                  </Text>
                ) : (
                  <View style={[styles.bsTable, { marginTop: 10 }]}>
                    <View style={styles.bsTableHead}>
                      <Text style={[styles.bsTh, { flex: 0.5, fontSize: rf(10) }]}>#</Text>
                      <Text style={[styles.bsTh, { flex: 1.3, fontSize: rf(10) }]}>Time (SLST)</Text>
                      <Text style={[styles.bsTh, { flex: 1, fontSize: rf(10) }]}>Signal</Text>
                      <Text style={[styles.bsTh, { flex: 1, textAlign: "right", fontSize: rf(10) }]}>
                        Volume Added
                      </Text>
                    </View>
                    {cutsLog.slice(0, 25).map((item, idx) => (
                      <View
                        key={item.id || idx}
                        style={[
                          styles.bsTr,
                          idx % 2 === 1 && { backgroundColor: "#f8f9fa" }
                        ]}
                      >
                        <Text style={[styles.bsTdMuted, { flex: 0.5, fontSize: rf(11) }]}>
                          {cutsLog.length - idx}
                        </Text>
                        <Text style={[styles.bsTdBold, { flex: 1.3, fontSize: rf(11) }]}>
                          {item.timeString || item.timestamp}
                        </Text>
                        <View style={{ flex: 1, alignItems: "flex-start" }}>
                          <View style={styles.badgeSuccessSm}>
                            <Text style={[styles.badgeSuccessSmText, { fontSize: rf(9) }]}>
                              POST 1
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.bsTdSuccess, { flex: 1, textAlign: "right", fontSize: rf(11) }]}>
                          +{Number(item.cutsAdded) >= 2 ? item.cutsAdded : 2} Cuts
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* =============================================================== */}
          {/* TAB 2: DOWNTIME MANAGEMENT, MONITORING API & LOGS               */}
          {/* =============================================================== */}
          {activeTab === "downtime" && (
            <View style={{ gap: 14 }}>
              <View style={[styles.sectionCard, { padding: cardPadding }]}>
                <View style={styles.cardHeaderFlex}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionTitle, { fontSize: rf(15) }]}>
                      Post & End Machine Downtime
                    </Text>
                    <Text style={[styles.sectionSub, { fontSize: rf(11) }]}>
                      Create a downtime via <Text style={styles.codePink}>POST /api/downtime/start</Text> and end via{" "}
                      <Text style={styles.codePink}>POST /api/downtime/end</Text>.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.btnPrimarySm}
                    onPress={checkDowntime}
                    disabled={isLoading}
                  >
                    <Text style={[styles.btnPrimarySmText, { fontSize: rf(10) }]}>
                      🔍 Check Downtime Status API (GET)
                    </Text>
                  </TouchableOpacity>
                </View>

                {!activeDowntime ? (
                  <View style={{ marginTop: 12, gap: 10 }}>
                    <TextInput
                      style={[styles.formControl, { fontSize: rf(13) }]}
                      value={downtimeReason}
                      onChangeText={setDowntimeReason}
                      placeholder="Reason for downtime..."
                      placeholderTextColor="#6c757d"
                    />
                    <TouchableOpacity
                      style={styles.btnWarningBlock}
                      onPress={() => triggerDowntimeStart(downtimeReason)}
                      disabled={isLoading}
                    >
                      <Text style={[styles.btnWarningBlockText, { fontSize: rf(13) }]}>
                        ⚠️ Start Downtime
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.alertDangerInline}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.alertDangerInlineText, { fontSize: rf(12) }]}>
                        <Text style={{ fontWeight: "800" }}>Active Downtime In Progress:</Text>{" "}
                        {activeDowntime.reason} (Started: {activeDowntime.startTimeStr} • Elapsed:{" "}
                        {formatElapsed(activeDowntimeElapsedSec)})
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.btnSuccessSm}
                      onPress={() => triggerDowntimeEnd(activeDowntime.id)}
                      disabled={isLoading}
                    >
                      <Text style={[styles.btnSuccessSmText, { fontSize: rf(11) }]}>
                        ✓ End This Downtime
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Downtime Check API 4-Box Grid */}
                {downtimeCheckResult && (
                  <View style={styles.apiCheckBox}>
                    <View style={styles.cardHeaderFlex}>
                      <Text style={[styles.codePrimary, { fontSize: rf(11) }]}>
                        GET /api/downtime/status?date={selectedDate}
                      </Text>
                      <Text style={[styles.sectionSub, { fontSize: rf(10) }]}>
                        {downtimeCheckResult.serverTimeSLST}
                      </Text>
                    </View>
                    <View style={styles.apiGridRow}>
                      <View style={styles.apiGridItem}>
                        <Text style={[styles.apiGridLabel, { fontSize: rf(9) }]}>
                          hasActiveDowntime
                        </Text>
                        <Text
                          style={[
                            styles.apiGridValue,
                            {
                              fontSize: rf(12),
                              color: downtimeCheckResult.hasActiveDowntime ? "#dc3545" : "#198754"
                            }
                          ]}
                        >
                          {String(downtimeCheckResult.hasActiveDowntime)}
                        </Text>
                      </View>
                      <View style={styles.apiGridItem}>
                        <Text style={[styles.apiGridLabel, { fontSize: rf(9) }]}>
                          hasDowntimeCreatedToday
                        </Text>
                        <Text style={[styles.apiGridValue, { fontSize: rf(12), color: "#d97706" }]}>
                          {String(downtimeCheckResult.hasDowntimeCreatedToday)}
                        </Text>
                      </View>
                      <View style={styles.apiGridItem}>
                        <Text style={[styles.apiGridLabel, { fontSize: rf(9) }]}>
                          machineStatus
                        </Text>
                        <Text style={[styles.apiGridValue, { fontSize: rf(12), color: "#212529" }]}>
                          {downtimeCheckResult.machineStatus}
                        </Text>
                      </View>
                      <View style={styles.apiGridItem}>
                        <Text style={[styles.apiGridLabel, { fontSize: rf(9) }]}>
                          totalDowntimesCount
                        </Text>
                        <Text style={[styles.apiGridValue, { fontSize: rf(12), color: "#212529" }]}>
                          {downtimeCheckResult.totalDowntimesCount}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>

              {/* Downtime Logs Table Card */}
              <View style={[styles.sectionCard, { padding: cardPadding }]}>
                <View style={styles.cardHeaderFlex}>
                  <Text style={[styles.sectionTitle, { fontSize: rf(15) }]}>
                    Downtime Logs ({selectedDate})
                  </Text>
                  <View style={styles.badgeWarning}>
                    <Text style={[styles.badgeWarningText, { fontSize: rf(10) }]}>
                      Total Downtime: {formatDurationMins(dailyMetrics.totalDowntimeMinutes)}
                    </Text>
                  </View>
                </View>

                {downtimesList.length === 0 ? (
                  <Text style={[styles.emptyTableText, { fontSize: rf(12) }]}>
                    No downtimes recorded for {selectedDate}.
                  </Text>
                ) : (
                  <View style={[styles.bsTable, { marginTop: 10 }]}>
                    <View style={styles.bsTableHead}>
                      <Text style={[styles.bsTh, { flex: 0.4, fontSize: rf(10) }]}>#</Text>
                      <Text style={[styles.bsTh, { flex: 1.5, fontSize: rf(10) }]}>Reason</Text>
                      <Text style={[styles.bsTh, { flex: 1.2, fontSize: rf(10) }]}>Start / End</Text>
                      <Text style={[styles.bsTh, { flex: 0.9, fontSize: rf(10) }]}>Duration</Text>
                      <Text style={[styles.bsTh, { flex: 1, textAlign: "right", fontSize: rf(10) }]}>
                        Status
                      </Text>
                    </View>
                    {downtimesList.map((dt, idx) => (
                      <View key={dt.id || idx} style={styles.bsTr}>
                        <Text style={[styles.bsTdMuted, { flex: 0.4, fontSize: rf(11) }]}>
                          {downtimesList.length - idx}
                        </Text>
                        <View style={{ flex: 1.5 }}>
                          <Text style={[styles.bsTdBold, { fontSize: rf(11) }]}>
                            {dt.reason || "Machine Downtime"}
                          </Text>
                          <Text style={[styles.bsTdMuted, { fontSize: rf(9) }]}>
                            Source: {String(dt.source || "web").toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1.2 }}>
                          <Text style={[styles.codePink, { fontSize: rf(10) }]}>
                            {dt.startTimeStr || "—"}
                          </Text>
                          <Text style={[styles.bsTdMuted, { fontSize: rf(10) }]}>
                            to {dt.active ? "Ongoing..." : dt.endTimeStr || "—"}
                          </Text>
                        </View>
                        <Text style={[styles.bsTdWarning, { flex: 0.9, fontSize: rf(11) }]}>
                          {dt.active
                            ? formatElapsed(activeDowntimeElapsedSec)
                            : dt.durationSeconds !== undefined && dt.durationSeconds !== null
                            ? `${dt.durationSeconds}s`
                            : formatDurationMins(dt.durationMinutes)}
                        </Text>
                        <View style={{ flex: 1, alignItems: "flex-end" }}>
                          {dt.active ? (
                            <TouchableOpacity
                              style={styles.btnSuccessSm}
                              onPress={() => triggerDowntimeEnd(dt.id)}
                            >
                              <Text style={[styles.btnSuccessSmText, { fontSize: rf(10) }]}>
                                End
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.badgeSecondary}>
                              <Text style={[styles.badgeSecondaryText, { fontSize: rf(9) }]}>
                                ENDED
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* =============================================================== */}
          {/* TAB 3: SINGLE-PAGE PDF REPORTS (HOURLY CUTS & DOWNTIME LOGS)     */}
          {/* =============================================================== */}
          {activeTab === "reports" && (
            <View style={[styles.sectionCard, { padding: cardPadding }]}>
              <View style={styles.cardHeaderFlex}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { fontSize: rf(15) }]}>
                    Single-Page PDF Reports (Toyo Cushion Lanka)
                  </Text>
                  <Text style={[styles.sectionSub, { fontSize: rf(11) }]}>
                    Generates clean, single-page PDF reports presenting strictly the 24-hour hourly cuts or downtime logs.
                  </Text>
                </View>
              </View>

              {/* Generate Buttons for Selected Day */}
              <View style={{ marginTop: 10, gap: 8 }}>
                <TouchableOpacity
                  style={styles.btnSuccessBlock}
                  onPress={() => generatePdf("hourly", selectedDate)}
                  disabled={isLoading}
                  activeOpacity={0.85}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={[styles.btnSuccessBlockText, { fontSize: rf(12) }]}>
                      📄 Generate Hourly Cuts PDF ({selectedDate})
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnWarningBlock}
                  onPress={() => generatePdf("downtime", selectedDate)}
                  disabled={isLoading}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.btnWarningBlockText, { fontSize: rf(12) }]}>
                    ⚠️ Generate Downtime Logs PDF ({selectedDate})
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Quick Previous Day Row */}
              <View style={[styles.previousDayBox, { marginTop: 12 }]}>
                <Text style={[styles.previousDayTitle, { fontSize: rf(11) }]}>
                  Previous Day Reports ({yesterdayStr}):
                </Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                  <TouchableOpacity
                    style={[styles.btnOutlineSuccessSm, { flex: 1, alignItems: "center" }]}
                    onPress={() => generatePdf("hourly", yesterdayStr)}
                    disabled={isLoading}
                  >
                    <Text style={[styles.btnOutlineSuccessSmText, { fontSize: rf(10) }]}>
                      + Hourly PDF
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.btnOutlineWarningSm, { flex: 1, alignItems: "center" }]}
                    onPress={() => generatePdf("downtime", yesterdayStr)}
                    disabled={isLoading}
                  >
                    <Text style={[styles.btnOutlineWarningSmText, { fontSize: rf(10) }]}>
                      + Downtime PDF
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {storedReports.length === 0 ? (
                <Text style={[styles.emptyTableText, { fontSize: rf(12), marginTop: 14 }]}>
                  No PDF reports generated yet. Tap one of the buttons above to generate a report.
                </Text>
              ) : (
                <View style={{ marginTop: 14, gap: 10 }}>
                  {storedReports.map((rep) => {
                    const isDowntime =
                      rep.reportType === "downtime" ||
                      (rep.fileName && rep.fileName.includes("Downtime"));

                    return (
                      <View key={rep.id} style={styles.pdfReportCard}>
                        <View style={styles.pdfReportHeader}>
                          <View
                            style={[
                              styles.badgeReportType,
                              isDowntime ? styles.badgeDt : styles.badgeHourly
                            ]}
                          >
                            <Text
                              style={[
                                styles.badgeReportTypeText,
                                { fontSize: rf(9) },
                                isDowntime && { color: "#212529" }
                              ]}
                            >
                              {isDowntime ? "⚠️ DOWNTIME LOGS" : "📊 HOURLY CUTS"}
                            </Text>
                          </View>
                          <Text style={[styles.pdfDateText, { fontSize: rf(11) }]}>
                            {rep.date}
                          </Text>
                        </View>

                        <Text style={[styles.pdfFileName, { fontSize: rf(11) }]} numberOfLines={1}>
                          {rep.fileName || "Cutter_Report.pdf"}
                        </Text>

                        <Text style={[styles.pdfMetaText, { fontSize: rf(9) }]}>
                          Size: {rep.fileSizeBytes ? `${(rep.fileSizeBytes / 1024).toFixed(1)} KB` : "—"} • Created: {rep.createdAtFormatted || rep.createdAt || "—"}
                        </Text>

                        <View style={styles.pdfActionsRow}>
                          <TouchableOpacity
                            style={[styles.btnOutlineSuccessSm, { flex: 1, alignItems: "center" }]}
                            onPress={() => handleDownloadReport(rep.id)}
                          >
                            <Text style={[styles.btnOutlineSuccessSmText, { fontSize: rf(11) }]}>
                              View / Download PDF
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.btnOutlineDangerSm, { paddingHorizontal: 12, alignItems: "center" }]}
                            onPress={() => handleDeleteReport(rep.id, rep.fileName)}
                          >
                            <Text style={[styles.btnOutlineDangerSmText, { fontSize: rf(11) }]}>
                              🗑️ Delete
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* =============================================================== */}
          {/* TAB 4: API PERFORMANCE (MCS4302 MOBILE COMPUTING PROJECT)       */}
          {/* =============================================================== */}
          {activeTab === "performance" && <ApiPerformanceScreen embedded={true} />}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f1f5f9"
  },
  scrollContainer: {
    flex: 1
  },
  contentContainer: {
    paddingBottom: 32
  },
  downtimeBanner: {
    backgroundColor: "#fef2f2",
    borderWidth: 2,
    borderColor: "#ef4444",
    borderRadius: 16,
    gap: 6
  },
  bannerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8
  },
  badgeDanger: {
    backgroundColor: "#dc3545",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  badgeDangerText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  startedDangerText: {
    color: "#dc3545",
    fontWeight: "700"
  },
  bannerReasonTitle: {
    color: "#212529",
    fontWeight: "800",
    marginTop: 2
  },
  bannerElapsedSub: {
    color: "#6c757d"
  },
  bannerElapsedBold: {
    color: "#dc3545",
    fontWeight: "900"
  },
  btnSuccessBanner: {
    marginTop: 6,
    backgroundColor: "#198754",
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center"
  },
  btnSuccessBannerText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  kpiCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    elevation: 2,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6
  },
  kpiCol2: {
    width: "48%"
  },
  kpiCol4: {
    width: "23.5%"
  },
  kpiLabel: {
    color: "#64748b",
    fontWeight: "800",
    letterSpacing: 0.4
  },
  kpiValueSuccess: {
    color: "#198754",
    fontWeight: "900",
    marginTop: 4
  },
  kpiValuePrimary: {
    color: "#0d6efd",
    fontWeight: "900",
    marginTop: 4
  },
  kpiValueWarning: {
    color: "#ffc107",
    fontWeight: "900",
    marginTop: 4
  },
  kpiUnitMuted: {
    color: "#6c757d",
    fontWeight: "700"
  },
  kpiMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 6
  },
  kpiMetaText: {
    color: "#6c757d"
  },
  badgeSuccessSm: {
    backgroundColor: "#198754",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5
  },
  badgeSuccessSmText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  btnSuccessBlock: {
    backgroundColor: "#198754",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 6
  },
  btnSuccessBlockText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  kpiEndpointHint: {
    color: "#6c757d",
    textAlign: "center"
  },
  codePink: {
    color: "#d63384",
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace"
  },
  codePrimary: {
    color: "#0d6efd",
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace"
  },
  navPillsRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2
  },
  navPill: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 16
  },
  navPillActive: {
    backgroundColor: "#059669",
    borderColor: "#059669"
  },
  navPillText: {
    color: "#475569",
    fontWeight: "700"
  },
  navPillTextActive: {
    color: "#ffffff"
  },
  sectionCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    elevation: 2,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6
  },
  cardHeaderFlex: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8
  },
  sectionTitle: {
    color: "#212529",
    fontWeight: "800"
  },
  sectionSub: {
    color: "#6c757d",
    marginTop: 2
  },
  btnOutlinePrimarySm: {
    borderWidth: 1,
    borderColor: "#0d6efd",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  btnOutlinePrimarySmText: {
    color: "#0d6efd",
    fontWeight: "700"
  },
  btnPrimarySm: {
    backgroundColor: "#0d6efd",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  btnPrimarySmText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  formControl: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ced4da",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: "#212529"
  },
  btnWarningBlock: {
    backgroundColor: "#ffc107",
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center"
  },
  btnWarningBlockText: {
    color: "#212529",
    fontWeight: "800"
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  reasonChip: {
    borderWidth: 1,
    borderColor: "#6c757d",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    backgroundColor: "#ffffff"
  },
  reasonChipSelected: {
    backgroundColor: "#ffc107",
    borderColor: "#ffc107"
  },
  reasonChipText: {
    color: "#6c757d",
    fontWeight: "600"
  },
  reasonChipTextSelected: {
    color: "#212529",
    fontWeight: "700"
  },
  alertDangerInline: {
    marginTop: 12,
    backgroundColor: "#f8d7da",
    borderWidth: 1,
    borderColor: "#f5c2c7",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8
  },
  alertDangerInlineText: {
    color: "#842029"
  },
  btnSuccessSm: {
    backgroundColor: "#198754",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  btnSuccessSmText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  btnOutlineSuccessSm: {
    borderWidth: 1,
    borderColor: "#198754",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  btnOutlineSuccessSmText: {
    color: "#198754",
    fontWeight: "700"
  },
  badgeSuccessLg: {
    backgroundColor: "#198754",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  badgeSuccessLgText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  badgeSecondary: {
    backgroundColor: "#6c757d",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6
  },
  badgeSecondaryText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  badgeWarning: {
    backgroundColor: "#ffc107",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6
  },
  badgeWarningText: {
    color: "#212529",
    fontWeight: "800"
  },
  hourlyChartBox: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 7,
    paddingTop: 20,
    paddingBottom: 10,
    paddingHorizontal: 10,
    marginTop: 12,
    marginBottom: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14
  },
  hourCol: {
    alignItems: "center",
    width: 22
  },
  hourValText: {
    color: "#059669",
    fontWeight: "800",
    marginBottom: 4
  },
  hourBar: {
    width: 18,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5
  },
  hourLabelText: {
    color: "#64748b",
    fontWeight: "700",
    marginTop: 5
  },
  bsTable: {
    borderWidth: 1,
    borderColor: "#dee2e6",
    borderRadius: 8,
    overflow: "hidden"
  },
  bsTableHead: {
    flexDirection: "row",
    backgroundColor: "#f8f9fa",
    borderBottomWidth: 2,
    borderBottomColor: "#dee2e6",
    paddingVertical: 9,
    paddingHorizontal: 10
  },
  bsTh: {
    color: "#212529",
    fontWeight: "800"
  },
  bsTr: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#dee2e6",
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: "#ffffff"
  },
  bsTd: {
    color: "#212529"
  },
  bsTdBold: {
    color: "#212529",
    fontWeight: "700"
  },
  bsTdSuccess: {
    color: "#198754",
    fontWeight: "800"
  },
  bsTdWarning: {
    color: "#d97706",
    fontWeight: "800"
  },
  bsTdMuted: {
    color: "#6c757d"
  },
  emptyTableText: {
    color: "#6c757d",
    textAlign: "center",
    paddingVertical: 20
  },
  apiCheckBox: {
    marginTop: 12,
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#dee2e6",
    borderRadius: 10,
    padding: 12
  },
  apiGridRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8
  },
  apiGridItem: {
    width: "48%",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dee2e6",
    borderRadius: 8,
    padding: 8,
    alignItems: "center"
  },
  apiGridLabel: {
    color: "#6c757d"
  },
  apiGridValue: {
    fontWeight: "800",
    marginTop: 2
  },
  previousDayBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 10
  },
  previousDayTitle: {
    fontWeight: "800",
    color: "#1e293b"
  },
  btnOutlineWarningSm: {
    borderWidth: 1,
    borderColor: "#d97706",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fffbeb"
  },
  btnOutlineWarningSmText: {
    color: "#b45309",
    fontWeight: "800"
  },
  btnOutlineDangerSm: {
    borderWidth: 1,
    borderColor: "#dc3545",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fef2f2"
  },
  btnOutlineDangerSmText: {
    color: "#dc3545",
    fontWeight: "800"
  },
  pdfReportCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    gap: 4
  },
  pdfReportHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  badgeReportType: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  badgeHourly: {
    backgroundColor: "#059669"
  },
  badgeDt: {
    backgroundColor: "#f59e0b"
  },
  badgeReportTypeText: {
    color: "#ffffff",
    fontWeight: "900"
  },
  pdfDateText: {
    fontWeight: "800",
    color: "#0f172a"
  },
  pdfFileName: {
    color: "#1e293b",
    fontWeight: "700",
    marginTop: 2
  },
  pdfMetaText: {
    color: "#64748b"
  },
  pdfActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6
  }
});
