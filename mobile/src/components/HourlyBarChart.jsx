import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCutter } from "../context/CutterContext";
import { formatHourRange } from "../utils/timeZoneUtils";
import { useResponsive } from "../utils/responsive";

export default function HourlyBarChart() {
  const { dailyMetrics, currentTimeSLST, idleThreshold } = useCutter();
  const { rf, containerPadding, cardPadding } = useResponsive();
  const [selectedHour, setSelectedHour] = useState(currentTimeSLST.hour);
  const [viewMode, setViewMode] = useState("chart"); // "chart" | "table"

  const hourlyCuts =
    Array.isArray(dailyMetrics.hourlyCuts) && dailyMetrics.hourlyCuts.length === 24
      ? dailyMetrics.hourlyCuts
      : Array(24).fill(0);

  const hourlyIdle =
    Array.isArray(dailyMetrics.hourlyIdle) && dailyMetrics.hourlyIdle.length === 24
      ? dailyMetrics.hourlyIdle
      : Array(24).fill(0);

  const maxVal = Math.max(...hourlyCuts, 1);
  const totalDayCuts = Number(dailyMetrics.totalCuts || 0);
  const threshold = Number(idleThreshold || 20);

  let peakHour = 0;
  let peakCount = 0;
  hourlyCuts.forEach((val, h) => {
    if (val > peakCount) {
      peakCount = val;
      peakHour = h;
    }
  });

  return (
    <View
      style={[
        styles.chartCard,
        {
          marginHorizontal: containerPadding,
          padding: cardPadding
        }
      ]}
    >
      {/* Header & View Toggle (Synced with Web App Section 6) */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1, minWidth: 200 }}>
          <Text style={[styles.eyebrow, { fontSize: rf(10) }]}>
            HOURLY PRODUCTION BREAKDOWN
          </Text>
          <Text style={[styles.title, { fontSize: rf(16) }]}>
            Volume Achieved per Hour (Summation of all "1s" in Hour)
          </Text>
          <Text style={[styles.subtitle, { fontSize: rf(11) }]}>
            Every Post 1 increments hourly volume. Post 2 (origin stationary) maintains timeline without inflating cut count.
          </Text>
        </View>

        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === "chart" && styles.toggleBtnActive]}
            onPress={() => setViewMode("chart")}
          >
            <Ionicons
              name="stats-chart"
              size={12}
              color={viewMode === "chart" ? "#ffffff" : "#64748b"}
            />
            <Text
              style={[
                styles.toggleText,
                { fontSize: rf(11) },
                viewMode === "chart" && styles.toggleTextActive
              ]}
            >
              Histogram View
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === "table" && styles.toggleBtnActive]}
            onPress={() => setViewMode("table")}
          >
            <Ionicons
              name="list"
              size={12}
              color={viewMode === "table" ? "#ffffff" : "#64748b"}
            />
            <Text
              style={[
                styles.toggleText,
                { fontSize: rf(11) },
                viewMode === "table" && styles.toggleTextActive
              ]}
            >
              Table View
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Selected Hour Summary Card (Synced with Web App) */}
      <View style={styles.selectedDetailCard}>
        <View style={styles.detailColLeft}>
          <Text style={[styles.detailHourTitle, { fontSize: rf(12) }]}>
            Hour Slot: {formatHourRange(selectedHour)}
          </Text>
          <Text style={[styles.detailHourSubtitle, { fontSize: rf(10) }]}>
            {selectedHour === currentTimeSLST.hour ? "(Current Active Hour)" : "Selected Time Slot"}
          </Text>
        </View>
        <View style={styles.detailColRight}>
          <Text style={[styles.detailCount, { fontSize: rf(14) }]}>
            {hourlyCuts[selectedHour] || 0} cuts achieved
          </Text>
          <Text style={[styles.detailUnit, { fontSize: rf(10) }]}>
            ({totalDayCuts > 0 ? (((hourlyCuts[selectedHour] || 0) / totalDayCuts) * 100).toFixed(1) : 0}% of day)
            {" · "}
            <Text style={{ color: "#d97706", fontWeight: "700" }}>
              {hourlyIdle[selectedHour] || 0} Idle Stoppages
            </Text>
          </Text>
        </View>
      </View>

      {viewMode === "chart" ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chartScroll}
        >
          <View style={styles.barsGrid}>
            {hourlyCuts.map((val, hour) => {
              const heightPercent = maxVal > 0 ? (val / maxVal) * 100 : 0;
              const isSelected = hour === selectedHour;
              const isCurrent = hour === currentTimeSLST.hour;
              const isPeak = val > 0 && hour === peakHour;

              return (
                <TouchableOpacity
                  key={hour}
                  style={[styles.barCol, isSelected && styles.barColSelected]}
                  onPress={() => setSelectedHour(hour)}
                  activeOpacity={0.8}
                >
                  <View style={styles.barTopLabelContainer}>
                    {val > 0 && (
                      <Text
                        style={[
                          styles.barValueText,
                          isSelected && styles.barValueTextSelected
                        ]}
                      >
                        {val}
                      </Text>
                    )}
                  </View>

                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { height: `${Math.max(4, heightPercent)}%` },
                        isSelected
                          ? styles.barFillSelected
                          : isPeak
                          ? styles.barFillPeak
                          : isCurrent
                          ? styles.barFillCurrent
                          : val > 0
                          ? styles.barFillDefault
                          : styles.barFillZero
                      ]}
                    />
                  </View>

                  <Text
                    style={[
                      styles.hourLabel,
                      isCurrent && { color: "#059669" },
                      isSelected && styles.hourLabelSelected
                    ]}
                  >
                    {String(hour).padStart(2, "0")}h
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        /* Structured 24-Hour Table (Synced with Web App Table View) */
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={[styles.thCell, { flex: 1.5, fontSize: rf(10) }]}>Hour Window</Text>
            <Text style={[styles.thCell, { flex: 1, textAlign: "center", fontSize: rf(10) }]}>
              Volume (1s)
            </Text>
            <Text style={[styles.thCell, { flex: 0.9, textAlign: "center", fontSize: rf(10) }]}>
              Idle (&gt;{threshold}s)
            </Text>
            <Text style={[styles.thCell, { flex: 0.8, textAlign: "right", fontSize: rf(10) }]}>
              % Day
            </Text>
            <Text style={[styles.thCell, { flex: 1.2, textAlign: "right", fontSize: rf(10) }]}>
              Status
            </Text>
          </View>
          <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled>
            {hourlyCuts.map((val, h) => {
              const share = totalDayCuts > 0 ? ((val / totalDayCuts) * 100).toFixed(1) : "0.0";
              const idleCnt = hourlyIdle[h] || 0;
              const isCurrent = h === currentTimeSLST.hour;
              const isPeak = val > 0 && val === peakCount;

              return (
                <TouchableOpacity
                  key={h}
                  onPress={() => setSelectedHour(h)}
                  style={[
                    styles.tableRow,
                    h === selectedHour && styles.tableRowSelected,
                    isCurrent && styles.tableRowCurrent
                  ]}
                >
                  <Text
                    style={[
                      styles.tdCell,
                      { flex: 1.5, fontWeight: "700", fontSize: rf(10) }
                    ]}
                  >
                    {formatHourRange(h)}
                    {isCurrent ? " *" : ""}
                  </Text>
                  <Text
                    style={[
                      styles.tdCell,
                      {
                        flex: 1,
                        textAlign: "center",
                        fontWeight: "800",
                        color: val > 0 ? "#059669" : "#94a3b8",
                        fontSize: rf(11)
                      }
                    ]}
                  >
                    {val} cuts
                  </Text>
                  <Text
                    style={[
                      styles.tdCell,
                      {
                        flex: 0.9,
                        textAlign: "center",
                        fontWeight: "700",
                        color: idleCnt > 0 ? "#d97706" : "#94a3b8",
                        fontSize: rf(11)
                      }
                    ]}
                  >
                    {idleCnt}
                  </Text>
                  <Text
                    style={[
                      styles.tdCell,
                      { flex: 0.8, textAlign: "right", color: "#64748b", fontSize: rf(10) }
                    ]}
                  >
                    {share}%
                  </Text>
                  <View style={{ flex: 1.2, alignItems: "flex-end" }}>
                    <View
                      style={[
                        styles.statusPill,
                        {
                          backgroundColor:
                            val > 0 ? (isPeak ? "#dcfce7" : "#ecfdf5") : "#f1f5f9"
                        }
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: rf(8),
                          fontWeight: "800",
                          color:
                            val > 0 ? (isPeak ? "#15803d" : "#059669") : "#94a3b8"
                        }}
                      >
                        {val > 0 ? (isPeak ? "PEAK" : "ACTIVE") : "IDLE"}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Legend Footer */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: "#10b981" }]} />
          <Text style={[styles.legendText, { fontSize: rf(10) }]}>Active Production</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: "#f59e0b" }]} />
          <Text style={[styles.legendText, { fontSize: rf(10) }]}>
            Peak Hour ({peakCount} cuts @ {String(peakHour).padStart(2, "0")}:00)
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: "#059669" }]} />
          <Text style={[styles.legendText, { fontSize: rf(10) }]}>Current Hour</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chartCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12
  },
  eyebrow: {
    fontWeight: "800",
    color: "#059669",
    letterSpacing: 0.8
  },
  title: {
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 2
  },
  subtitle: {
    color: "#64748b",
    marginTop: 3,
    lineHeight: 15
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    padding: 3
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4
  },
  toggleBtnActive: {
    backgroundColor: "#059669"
  },
  toggleText: {
    fontWeight: "700",
    color: "#64748b"
  },
  toggleTextActive: {
    color: "#ffffff"
  },
  selectedDetailCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12
  },
  detailColLeft: {
    flex: 1,
    minWidth: 140
  },
  detailHourTitle: {
    fontWeight: "800",
    color: "#0f172a"
  },
  detailHourSubtitle: {
    color: "#64748b",
    marginTop: 1
  },
  detailColRight: {
    alignItems: "flex-end"
  },
  detailCount: {
    fontWeight: "900",
    color: "#059669"
  },
  detailUnit: {
    color: "#475569",
    fontWeight: "600",
    marginTop: 1
  },
  chartScroll: {
    paddingVertical: 4
  },
  barsGrid: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    height: 160,
    paddingTop: 20,
    paddingBottom: 4
  },
  barCol: {
    width: 24,
    height: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingVertical: 2
  },
  barColSelected: {
    backgroundColor: "rgba(5, 150, 105, 0.1)",
    borderRadius: 6
  },
  barTopLabelContainer: {
    height: 14,
    justifyContent: "center",
    alignItems: "center"
  },
  barValueText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748b"
  },
  barValueTextSelected: {
    color: "#059669",
    fontWeight: "900"
  },
  barTrack: {
    flex: 1,
    width: 14,
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    justifyContent: "flex-end",
    overflow: "hidden"
  },
  barFill: {
    width: "100%",
    borderRadius: 4
  },
  barFillDefault: {
    backgroundColor: "#34d399"
  },
  barFillZero: {
    backgroundColor: "#e2e8f0"
  },
  barFillPeak: {
    backgroundColor: "#10b981"
  },
  barFillCurrent: {
    backgroundColor: "#059669"
  },
  barFillSelected: {
    backgroundColor: "#064e3b"
  },
  hourLabel: {
    fontSize: 9,
    color: "#64748b",
    fontWeight: "700",
    marginTop: 4
  },
  hourLabelSelected: {
    color: "#059669",
    fontWeight: "900"
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    overflow: "hidden"
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: "#e2e8f0"
  },
  thCell: {
    fontWeight: "800",
    color: "#64748b"
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9"
  },
  tableRowSelected: {
    backgroundColor: "rgba(5, 150, 105, 0.06)"
  },
  tableRowCurrent: {
    backgroundColor: "#f0fdf4"
  },
  tdCell: {
    color: "#0f172a"
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9"
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  legendBox: {
    width: 10,
    height: 10,
    borderRadius: 2
  },
  legendText: {
    color: "#64748b",
    fontWeight: "600"
  }
});
