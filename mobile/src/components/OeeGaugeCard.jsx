import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCutter } from "../context/CutterContext";
import { formatDuration } from "../utils/timeZoneUtils";
import { useResponsive } from "../utils/responsive";

export default function OeeGaugeCard() {
  const { dailyMetrics, selectedDate } = useCutter();
  const { rf, containerPadding, cardPadding, isSmallPhone, isTablet } = useResponsive();

  const oee = Number(dailyMetrics.oeePercent || 0);
  const availability = Number(dailyMetrics.availabilityPercent || 0);
  const performance = Number(dailyMetrics.performancePercent || 0);
  const quality = Number(dailyMetrics.qualityPercent || 100);
  const totalCuts = Number(dailyMetrics.totalCuts || 0);
  const totalCycles = Number(dailyMetrics.totalCycles || totalCuts);
  const uptimeMinutes = Number(dailyMetrics.totalUptimeMinutes || 0);
  const downtimeMinutes = Number(dailyMetrics.totalDowntimeMinutes || 0);
  const plannedMinutes = 1440;

  const downtimePercent = parseFloat(((downtimeMinutes / plannedMinutes) * 100).toFixed(1));

  let oeeBadgeColor = "#10b981";
  let oeeBadgeBg = "#ecfdf5";
  let oeeLabel = "World Class";

  if (oee < 50) {
    oeeBadgeColor = "#ef4444";
    oeeBadgeBg = "#fef2f2";
    oeeLabel = "Idle / Low";
  } else if (oee < 75) {
    oeeBadgeColor = "#f59e0b";
    oeeBadgeBg = "#fffbeb";
    oeeLabel = "Acceptable";
  } else if (oee < 85) {
    oeeBadgeColor = "#0284c7";
    oeeBadgeBg = "#f0f9ff";
    oeeLabel = "Good";
  }

  const isNoData = dailyMetrics.isNoDataDay || (totalCuts === 0 && downtimeMinutes === 1440);
  const colWidth = isTablet ? "31.5%" : isSmallPhone ? "100%" : "48.2%";

  return (
    <View
      style={[
        styles.cardContainer,
        {
          marginHorizontal: containerPadding,
          padding: cardPadding
        }
      ]}
    >
      {isNoData && (
        <View style={styles.noDataBanner}>
          <Ionicons name="information-circle-outline" size={16} color="#b45309" />
          <Text style={[styles.noDataBannerText, { fontSize: rf(11) }]}>
            No cutting data recorded for {selectedDate}. System evaluated as 100% idle (0% OEE).
          </Text>
        </View>
      )}

      {/* OEE Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Ionicons name="pie-chart-outline" size={16} color="#059669" />
          <Text style={[styles.title, { fontSize: rf(15) }]}>
            OEE & Daily Shift Effectiveness
          </Text>
        </View>
        <View style={[styles.oeeSmallBadge, { backgroundColor: oeeBadgeColor }]}>
          <Text style={[styles.oeeSmallBadgeText, { fontSize: rf(10) }]}>
            {oee.toFixed(1)}% · {oeeLabel}
          </Text>
        </View>
      </View>

      {/* Availability Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFillUptime,
              { width: `${Math.min(100, Math.max(0, availability))}%` }
            ]}
          />
          {downtimePercent > 0 && (
            <View
              style={[
                styles.progressFillDowntime,
                { width: `${Math.min(100, downtimePercent)}%` }
              ]}
            />
          )}
        </View>
      </View>

      {/* Responsive KPI Grid */}
      <View style={styles.chipsGrid}>
        <View
          style={[
            styles.breakdownChip,
            { width: colWidth, backgroundColor: oeeBadgeBg, borderColor: oeeBadgeColor + "40" }
          ]}
        >
          <Text style={[styles.chipLabel, { fontSize: rf(9) }]}>OVERALL OEE</Text>
          <Text style={[styles.chipValue, { color: oeeBadgeColor, fontSize: rf(18) }]}>
            {oee.toFixed(1)}%
          </Text>
          <Text style={[styles.chipHint, { fontSize: rf(10) }]}>
            A:{availability.toFixed(0)}% × P:{performance.toFixed(0)}% × Q:{quality.toFixed(0)}%
          </Text>
        </View>

        <View
          style={[
            styles.breakdownChip,
            { width: colWidth, backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" }
          ]}
        >
          <Text style={[styles.chipLabel, { fontSize: rf(9) }]}>AVAILABILITY</Text>
          <Text style={[styles.chipValue, { color: "#065f46", fontSize: rf(18) }]}>
            {availability.toFixed(1)}%
          </Text>
          <Text style={[styles.chipHint, { fontSize: rf(10) }]}>
            {totalCycles} total signal posts
          </Text>
        </View>

        <View
          style={[
            styles.breakdownChip,
            { width: colWidth, backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }
          ]}
        >
          <Text style={[styles.chipLabel, { fontSize: rf(9) }]}>OPERATING UPTIME</Text>
          <Text style={[styles.chipValue, { color: "#15803d", fontSize: rf(18) }]}>
            {formatDuration(uptimeMinutes)}
          </Text>
          <Text style={[styles.chipHint, { fontSize: rf(10) }]}>
            {uptimeMinutes} mins active
          </Text>
        </View>

        <View
          style={[
            styles.breakdownChip,
            {
              width: colWidth,
              backgroundColor: downtimeMinutes > 0 ? "#fff7ed" : "#f8fafc",
              borderColor: downtimeMinutes > 0 ? "#fed7aa" : "#e2e8f0"
            }
          ]}
        >
          <Text style={[styles.chipLabel, { fontSize: rf(9) }]}>IDLE / DOWNTIME</Text>
          <Text
            style={[
              styles.chipValue,
              {
                color: downtimeMinutes > 0 ? "#dc2626" : "#64748b",
                fontSize: rf(18)
              }
            ]}
          >
            {formatDuration(downtimeMinutes)}
          </Text>
          <Text style={[styles.chipHint, { fontSize: rf(10) }]}>
            {downtimePercent}% of 24h ({dailyMetrics.totalIdleEntries || 0} idle logs)
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
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
  noDataBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8
  },
  noDataBannerText: {
    flex: 1,
    color: "#92400e",
    fontWeight: "600"
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10
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
  oeeSmallBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12
  },
  oeeSmallBadgeText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  progressContainer: {
    marginBottom: 12
  },
  progressTrack: {
    height: 8,
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    flexDirection: "row",
    overflow: "hidden"
  },
  progressFillUptime: {
    height: "100%",
    backgroundColor: "#059669"
  },
  progressFillDowntime: {
    height: "100%",
    backgroundColor: "#ef4444"
  },
  chipsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8
  },
  breakdownChip: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1
  },
  chipLabel: {
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 0.4
  },
  chipValue: {
    fontWeight: "900",
    marginVertical: 2
  },
  chipHint: {
    color: "#64748b",
    fontWeight: "600"
  }
});
