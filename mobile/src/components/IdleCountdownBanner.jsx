import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCutter } from "../context/CutterContext";
import { useResponsive } from "../utils/responsive";

export default function IdleCountdownBanner() {
  const {
    machineState,
    dailyMetrics,
    secondsSinceLastActivity,
    idleThreshold,
    triggerPostSignal,
    isLoading
  } = useCutter();

  const { rf, containerPadding, cardPadding, isSmallPhone, isTablet } = useResponsive();

  const lastPost = machineState.lastPost || 1;
  const lastDuration =
    machineState.lastDuration !== undefined ? Number(machineState.lastDuration) : 0;
  const lastIdle = machineState.lastIdle === 1;
  const threshold = Number(idleThreshold || 20);
  const totalDayCuts = Number(dailyMetrics.totalCuts || 0);
  const isElapsedOver = secondsSinceLastActivity > threshold;

  // Responsive card width for the 5 Hero Metric Cards
  const cardWidth = isTablet ? "31.5%" : isSmallPhone ? "100%" : "48.2%";

  return (
    <View
      style={[
        styles.wrapper,
        {
          marginHorizontal: containerPadding,
          padding: cardPadding
        }
      ]}
    >
      {/* Top Header Row: Synced with Web App "Active Operational Indicator · Post 1 vs Post 2 Metrics" */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleCol}>
          <Text style={[styles.sectionEyebrow, { fontSize: rf(10) }]}>
            LIVE INGESTION STATE
          </Text>
          <Text style={[styles.sectionTitle, { fontSize: rf(16) }]}>
            Active Operational Indicator · Post 1 vs Post 2 Metrics
          </Text>
        </View>

        <View
          style={[
            styles.elapsedBox,
            isElapsedOver ? styles.elapsedBoxWarn : styles.elapsedBoxNormal
          ]}
        >
          <Text style={[styles.elapsedLabel, { fontSize: rf(9) }]}>
            TIME SINCE LAST POST
          </Text>
          <Text
            style={[
              styles.elapsedValue,
              { fontSize: rf(13) },
              isElapsedOver ? styles.textRed : styles.textGreen
            ]}
          >
            {secondsSinceLastActivity}s{" "}
            {isElapsedOver ? `(>${threshold}s Limit)` : `(≤${threshold}s)`}
          </Text>
        </View>
      </View>

      {/* 5 Hero Metric Cards (100% Synced with Web App CutterDashboard.jsx) */}
      <View style={styles.metricsGrid}>
        {/* 1. Volume Achieved (Sum of 1s) */}
        <View
          style={[
            styles.metricCard,
            styles.cardGreen,
            { width: cardWidth }
          ]}
        >
          <Text style={[styles.metricLabel, { color: "#166534", fontSize: rf(10) }]}>
            VOLUME ACHIEVED (SUM OF 1S)
          </Text>
          <View style={styles.metricValueRow}>
            <Text style={[styles.metricValue, { color: "#15803d", fontSize: rf(24) }]}>
              {totalDayCuts.toLocaleString()}
            </Text>
            <Text style={[styles.metricUnit, { color: "#15803d", fontSize: rf(12) }]}>
              cuts
            </Text>
          </View>
          <Text style={[styles.metricHint, { color: "#166534", fontSize: rf(10) }]}>
            Sum of all API Posts with Value = 1 today
          </Text>
        </View>

        {/* 2. Last Duration Logged */}
        <View
          style={[
            styles.metricCard,
            styles.cardSlate,
            { width: cardWidth }
          ]}
        >
          <Text style={[styles.metricLabel, { color: "#475569", fontSize: rf(10) }]}>
            LAST DURATION LOGGED
          </Text>
          <View style={styles.metricValueRow}>
            <Text
              style={[
                styles.metricValue,
                {
                  color: lastDuration > threshold ? "#dc2626" : "#0284c7",
                  fontSize: rf(24)
                }
              ]}
            >
              {lastDuration}
            </Text>
            <Text
              style={[
                styles.metricUnit,
                {
                  color: lastDuration > threshold ? "#dc2626" : "#0284c7",
                  fontSize: rf(12)
                }
              ]}
            >
              seconds
            </Text>
          </View>
          <Text style={[styles.metricHint, { color: "#64748b", fontSize: rf(10) }]}>
            {lastDuration === 0
              ? "Initial Entry Baseline (0s)"
              : "Diff between current & prev timestamp"}
          </Text>
        </View>

        {/* 3. Idle Column Value (0 or 1) */}
        <View
          style={[
            styles.metricCard,
            lastIdle ? styles.cardRed : styles.cardGreen,
            { width: cardWidth }
          ]}
        >
          <Text
            style={[
              styles.metricLabel,
              { color: lastIdle ? "#991b1b" : "#166534", fontSize: rf(10) }
            ]}
          >
            IDLE COLUMN VALUE
          </Text>
          <View style={styles.metricValueRow}>
            <Text
              style={[
                styles.metricValue,
                { color: lastIdle ? "#b91c1c" : "#16a34a", fontSize: rf(24) }
              ]}
            >
              {lastIdle ? 1 : 0}
            </Text>
            <View
              style={[
                styles.inlineBadge,
                { backgroundColor: lastIdle ? "#fee2e2" : "#dcfce7" }
              ]}
            >
              <Text
                style={[
                  styles.inlineBadgeText,
                  { color: lastIdle ? "#b91c1c" : "#16a34a", fontSize: rf(10) }
                ]}
              >
                {lastIdle ? "IDLE (1)" : "NORMAL (0)"}
              </Text>
            </View>
          </View>
          <Text
            style={[
              styles.metricHint,
              { color: lastIdle ? "#b91c1c" : "#166534", fontSize: rf(10) }
            ]}
          >
            {lastIdle
              ? `Duration > ${threshold}s limit`
              : `Cutter returned to origin in <= ${threshold}s`}
          </Text>
        </View>

        {/* 4. Last Post Type */}
        <View
          style={[
            styles.metricCard,
            styles.cardPurple,
            { width: cardWidth }
          ]}
        >
          <Text style={[styles.metricLabel, { color: "#6b21a8", fontSize: rf(10) }]}>
            LAST POST TYPE
          </Text>
          <View style={styles.metricValueRow}>
            <Text style={[styles.metricValue, { color: "#7e22ce", fontSize: rf(22) }]}>
              Post {lastPost}
            </Text>
          </View>
          <Text style={[styles.metricHint, { color: "#7e22ce", fontSize: rf(10) }]}>
            {lastPost === 1
              ? "Cutter to Origin (+1 Cut)"
              : "Origin Stationary (0 Cuts)"}
          </Text>
        </View>

        {/* 5. Idle Threshold Parameter */}
        <View
          style={[
            styles.metricCard,
            styles.cardAmber,
            { width: isTablet ? cardWidth : "100%" }
          ]}
        >
          <View style={styles.thresholdCardRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.metricLabel, { color: "#92400e", fontSize: rf(10) }]}>
                IDLE THRESHOLD PARAMETER
              </Text>
              <View style={styles.metricValueRow}>
                <Text style={[styles.metricValue, { color: "#b45309", fontSize: rf(24) }]}>
                  {threshold}
                </Text>
                <Text style={[styles.metricUnit, { color: "#b45309", fontSize: rf(12) }]}>
                  s
                </Text>
              </View>
              <Text style={[styles.metricHint, { color: "#92400e", fontSize: rf(10) }]}>
                Configured in parameters/cutter_config table
              </Text>
            </View>

            {/* Quick Trigger Buttons */}
            <View style={styles.quickActionGroup}>
              <TouchableOpacity
                style={[styles.quickBtn, styles.quickBtnPost1]}
                onPress={() => triggerPostSignal(1)}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                <Ionicons name="cut" size={13} color="#ffffff" />
                <Text style={[styles.quickBtnText, { fontSize: rf(11) }]}>
                  Post 1 (+1 Cut)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickBtn, styles.quickBtnPost2]}
                onPress={() => triggerPostSignal(2)}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                <Ionicons name="location" size={13} color="#ffffff" />
                <Text style={[styles.quickBtnText, { fontSize: rf(11) }]}>
                  Post 2 (0 Cuts)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9"
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 180
  },
  sectionEyebrow: {
    fontWeight: "800",
    color: "#059669",
    letterSpacing: 0.8
  },
  sectionTitle: {
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 2
  },
  elapsedBox: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1
  },
  elapsedBoxNormal: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0"
  },
  elapsedBoxWarn: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca"
  },
  elapsedLabel: {
    fontWeight: "800",
    color: "#64748b"
  },
  elapsedValue: {
    fontWeight: "900",
    marginTop: 1
  },
  textGreen: {
    color: "#059669"
  },
  textRed: {
    color: "#dc2626"
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 14
  },
  metricCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5
  },
  cardGreen: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0"
  },
  cardSlate: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0"
  },
  cardRed: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca"
  },
  cardPurple: {
    backgroundColor: "#faf5ff",
    borderColor: "#e9d5ff"
  },
  cardAmber: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a"
  },
  metricLabel: {
    fontWeight: "800",
    letterSpacing: 0.3
  },
  metricValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 6,
    marginVertical: 4
  },
  metricValue: {
    fontWeight: "900"
  },
  metricUnit: {
    fontWeight: "700"
  },
  metricHint: {
    fontWeight: "600",
    lineHeight: 14
  },
  inlineBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6
  },
  inlineBadgeText: {
    fontWeight: "800"
  },
  thresholdCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10
  },
  quickActionGroup: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  quickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8
  },
  quickBtnPost1: {
    backgroundColor: "#059669"
  },
  quickBtnPost2: {
    backgroundColor: "#6366f1"
  },
  quickBtnText: {
    color: "#ffffff",
    fontWeight: "800"
  }
});
