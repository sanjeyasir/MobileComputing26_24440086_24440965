import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCutter } from "../context/CutterContext";
import { formatHourRange } from "../utils/timeZoneUtils";
import { useResponsive } from "../utils/responsive";

export default function DailyCutVolumeLineGraph() {
  const { dailyMetrics, currentTimeSLST } = useCutter();
  const { rf, containerPadding, cardPadding } = useResponsive();
  const [selectedHour, setSelectedHour] = useState(() => currentTimeSLST.hour);

  const hourlyCuts = useMemo(() => {
    return Array.isArray(dailyMetrics.hourlyCuts) && dailyMetrics.hourlyCuts.length === 24
      ? dailyMetrics.hourlyCuts
      : Array(24).fill(0);
  }, [dailyMetrics.hourlyCuts]);

  const hourlyIdle = useMemo(() => {
    return Array.isArray(dailyMetrics.hourlyIdle) && dailyMetrics.hourlyIdle.length === 24
      ? dailyMetrics.hourlyIdle
      : Array(24).fill(0);
  }, [dailyMetrics.hourlyIdle]);

  const maxVal = useMemo(() => Math.max(...hourlyCuts, 5), [hourlyCuts]);
  const totalDayCuts = Number(dailyMetrics.totalCuts || 0);

  const { peakHour, peakCount } = useMemo(() => {
    let p = 0;
    let c = 0;
    hourlyCuts.forEach((val, h) => {
      if (val > c) {
        c = val;
        p = h;
      }
    });
    return { peakHour: p, peakCount: c };
  }, [hourlyCuts]);

  const chartHeight = 140;
  const paddingX = 14;
  const paddingTop = 14;
  const paddingBottom = 20;
  const usableHeight = chartHeight - paddingTop - paddingBottom;

  const points = useMemo(() => {
    return hourlyCuts.map((val, i) => {
      const xPercent = (i / 23) * 100;
      const yNormalized = maxVal > 0 ? val / maxVal : 0;
      const yPos = chartHeight - paddingBottom - yNormalized * usableHeight;
      return { hour: i, value: val, idle: hourlyIdle[i] || 0, xPercent, yPos, yNormalized };
    });
  }, [hourlyCuts, hourlyIdle, maxVal]);

  const { linePath, areaPath } = useMemo(() => {
    if (points.length === 0) return { linePath: "", areaPath: "" };
    const svgWidth = 1000;
    const coords = points.map((p) => {
      const x = paddingX + (p.hour / 23) * (svgWidth - paddingX * 2);
      const y = chartHeight - paddingBottom - p.yNormalized * usableHeight;
      return { x, y };
    });

    let dLine = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const cp1x = prev.x + (curr.x - prev.x) / 2;
      const cp1y = prev.y;
      const cp2x = prev.x + (curr.x - prev.x) / 2;
      const cp2y = curr.y;
      dLine += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
    }

    const first = coords[0];
    const last = coords[coords.length - 1];
    const baseY = chartHeight - paddingBottom;
    const dArea = `${dLine} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;

    return { linePath: dLine, areaPath: dArea };
  }, [points]);

  const selectedPoint = points[selectedHour] || points[0];

  return (
    <View
      style={[
        styles.container,
        {
          marginHorizontal: containerPadding,
          padding: cardPadding
        }
      ]}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Ionicons name="trending-up" size={17} color="#059669" />
            <Text style={[styles.title, { fontSize: rf(15) }]}>
              Daily Cut Volume Trajectory
            </Text>
          </View>
          <Text style={[styles.subtitle, { fontSize: rf(11) }]}>
            24-Hour cutting volume curve (Sum of Post 1s · 00:00 - 23:59)
          </Text>
        </View>

        <View style={styles.headerBadge}>
          <Text style={[styles.headerBadgeText, { fontSize: rf(11) }]}>
            {totalDayCuts} {totalDayCuts === 1 ? "Cut" : "Cuts"} Today
          </Text>
        </View>
      </View>

      {/* Interactive Tooltip Banner */}
      <View style={styles.tooltipCard}>
        <View style={styles.tooltipLeft}>
          <Text style={[styles.tooltipHour, { fontSize: rf(13) }]}>
            {formatHourRange(selectedHour)}
          </Text>
          <Text style={[styles.tooltipHourSub, { fontSize: rf(10) }]}>
            {selectedHour === currentTimeSLST.hour
              ? "Current Active Hour Slot"
              : selectedHour === peakHour && peakCount > 0
              ? "Today's Peak Production Hour"
              : "Tap any hour below to inspect"}
          </Text>
        </View>

        <View style={styles.tooltipRight}>
          <Text style={[styles.tooltipCount, { fontSize: rf(15) }]}>
            {selectedPoint.value}{" "}
            <Text style={{ fontSize: rf(11), fontWeight: "600", color: "#64748b" }}>
              cuts
            </Text>
          </Text>
          <Text style={[styles.tooltipPercent, { fontSize: rf(10) }]}>
            {totalDayCuts > 0
              ? (((selectedPoint.value || 0) / totalDayCuts) * 100).toFixed(1)
              : 0}
            % of day · {selectedPoint.idle} idle
          </Text>
        </View>
      </View>

      {/* Responsive Graph Area */}
      <View style={styles.graphWrapper}>
        {Platform.OS === "web" ? (
          <View style={{ width: "100%", height: chartHeight, position: "relative" }}>
            <svg
              viewBox={`0 0 1000 ${chartHeight}`}
              preserveAspectRatio="none"
              style={{ width: "100%", height: "100%", overflow: "visible" }}
            >
              <defs>
                <linearGradient id="cutVolumeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              <line x1="14" y1={paddingTop} x2="986" y2={paddingTop} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
              <line x1="14" y1={paddingTop + usableHeight / 2} x2="986" y2={paddingTop + usableHeight / 2} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
              <line x1="14" y1={chartHeight - paddingBottom} x2="986" y2={chartHeight - paddingBottom} stroke="#e2e8f0" strokeWidth="1.5" />

              {totalDayCuts > 0 && <path d={areaPath} fill="url(#cutVolumeGrad)" />}

              <path
                d={linePath}
                fill="none"
                stroke="#059669"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {points.map((p) => {
                const svgWidth = 1000;
                const cx = paddingX + (p.hour / 23) * (svgWidth - paddingX * 2);
                const isSelected = p.hour === selectedHour;
                const isCurrent = p.hour === currentTimeSLST.hour;
                const isPeak = p.value > 0 && p.hour === peakHour;

                return (
                  <g key={p.hour} style={{ cursor: "pointer" }} onClick={() => setSelectedHour(p.hour)}>
                    {isSelected && (
                      <circle cx={cx} cy={p.yPos} r="8" fill="#10b981" fillOpacity="0.25" />
                    )}
                    <circle
                      cx={cx}
                      cy={p.yPos}
                      r={isSelected ? "5" : isPeak ? "4.5" : p.value > 0 ? "3.5" : "2.5"}
                      fill={isSelected ? "#064e3b" : isPeak ? "#f59e0b" : isCurrent ? "#3b82f6" : p.value > 0 ? "#059669" : "#cbd5e1"}
                      stroke="#ffffff"
                      strokeWidth={isSelected ? "2" : "1.5"}
                    />
                  </g>
                );
              })}
            </svg>
          </View>
        ) : (
          /* Native Android High-Clarity Stem & Node Trajectory Chart */
          <View style={{ width: "100%", height: chartHeight, position: "relative" }}>
            <View style={[styles.nativeGridLine, { top: paddingTop }]} />
            <View style={[styles.nativeGridLine, { top: paddingTop + usableHeight / 2 }]} />
            <View style={[styles.nativeGridBaseLine, { top: chartHeight - paddingBottom }]} />

            <View
              style={[
                styles.nativeNodesRow,
                { height: chartHeight - paddingBottom, paddingTop: paddingTop }
              ]}
            >
              {points.map((p) => {
                const isSelected = p.hour === selectedHour;
                const isCurrent = p.hour === currentTimeSLST.hour;
                const isPeak = p.value > 0 && p.hour === peakHour;
                const fillPct = maxVal > 0 ? Math.max(p.value > 0 ? 8 : 2, (p.value / maxVal) * 100) : 2;
                const stemColor = isSelected
                  ? "#064e3b"
                  : isPeak
                  ? "#f59e0b"
                  : isCurrent
                  ? "#3b82f6"
                  : p.value > 0
                  ? "#10b981"
                  : "#e2e8f0";

                return (
                  <TouchableOpacity
                    key={p.hour}
                    style={[styles.nativeNodeCol, isSelected && styles.nativeColSelected]}
                    onPress={() => setSelectedHour(p.hour)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.nativeStemContainer}>
                      <View
                        style={[
                          styles.nativeStemFill,
                          {
                            height: `${Math.min(100, fillPct)}%`,
                            backgroundColor:
                              p.value > 0 ? "rgba(16, 185, 129, 0.28)" : "rgba(226, 232, 240, 0.4)"
                          }
                        ]}
                      >
                        <View
                          style={[
                            styles.nativeNodeCap,
                            { backgroundColor: stemColor },
                            isSelected && styles.nativeNodeCapSelected
                          ]}
                        />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* 24-Hour Axis Labels */}
        <View style={styles.axisRow}>
          {[0, 4, 8, 12, 16, 20, 23].map((h) => (
            <TouchableOpacity key={h} onPress={() => setSelectedHour(h)}>
              <Text
                style={[
                  styles.axisText,
                  { fontSize: rf(10) },
                  selectedHour === h && styles.axisTextSelected
                ]}
              >
                {String(h).padStart(2, "0")}h
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Legend */}
      <View style={styles.footerRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#059669" }]} />
          <Text style={[styles.legendLabel, { fontSize: rf(10) }]}>Cut Volume</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#f59e0b" }]} />
          <Text style={[styles.legendLabel, { fontSize: rf(10) }]}>
            Peak ({peakCount > 0 ? `${peakCount} @ ${String(peakHour).padStart(2, "0")}h` : "0"})
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#3b82f6" }]} />
          <Text style={[styles.legendLabel, { fontSize: rf(10) }]}>
            Active ({String(currentTimeSLST.hour).padStart(2, "0")}h)
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
    marginBottom: 12,
    flexWrap: "wrap",
    gap: 8
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  title: {
    fontWeight: "900",
    color: "#0f172a"
  },
  subtitle: {
    color: "#64748b",
    marginTop: 2
  },
  headerBadge: {
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#a7f3d0"
  },
  headerBadgeText: {
    fontWeight: "800",
    color: "#065f46"
  },
  tooltipCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    gap: 8
  },
  tooltipLeft: {
    flex: 1
  },
  tooltipHour: {
    fontWeight: "900",
    color: "#0f172a"
  },
  tooltipHourSub: {
    color: "#64748b",
    marginTop: 2
  },
  tooltipRight: {
    alignItems: "flex-end"
  },
  tooltipCount: {
    fontWeight: "900",
    color: "#059669"
  },
  tooltipPercent: {
    color: "#64748b",
    fontWeight: "600",
    marginTop: 2
  },
  graphWrapper: {
    width: "100%",
    paddingVertical: 4
  },
  nativeGridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#f1f5f9"
  },
  nativeGridBaseLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: "#e2e8f0"
  },
  nativeNodesRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
    alignItems: "flex-end"
  },
  nativeNodeCol: {
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 1
  },
  nativeColSelected: {
    backgroundColor: "rgba(5, 150, 105, 0.08)",
    borderRadius: 4
  },
  nativeStemContainer: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
    alignItems: "center"
  },
  nativeStemFill: {
    width: "75%",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    alignItems: "center",
    justifyContent: "flex-start"
  },
  nativeNodeCap: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginTop: -3.5
  },
  nativeNodeCapSelected: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: -5,
    borderWidth: 1.5,
    borderColor: "#ffffff"
  },
  axisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginTop: 4
  },
  axisText: {
    fontWeight: "700",
    color: "#94a3b8"
  },
  axisTextSelected: {
    color: "#059669",
    fontWeight: "900"
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9"
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5
  },
  legendLabel: {
    fontWeight: "600",
    color: "#64748b"
  }
});
