import React from "react";
import { View, Text, StyleSheet, ScrollView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import BrandHeader from "../components/BrandHeader";
import { useCutter } from "../context/CutterContext";
import { useResponsive } from "../utils/responsive";
import { colors } from "../theme/colors";

export default function MachineInfoScreen() {
  const { idleThreshold } = useCutter();
  const { rf, containerPadding, cardPadding } = useResponsive();
  const threshold = Number(idleThreshold || 20);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <BrandHeader />

        <View style={{ paddingHorizontal: containerPadding, paddingTop: 12 }}>
          {/* Corporate Profile Card */}
          <View style={[styles.card, { padding: cardPadding }]}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="business" size={18} color="#059669" />
              <Text style={[styles.cardTitle, { fontSize: rf(15) }]}>
                Enterprise Profile
              </Text>
            </View>

            <View style={styles.specGrid}>
              <View style={styles.specRow}>
                <Text style={[styles.specKey, { fontSize: rf(12) }]}>Operating Unit:</Text>
                <Text style={[styles.specVal, { fontSize: rf(12) }]}>
                  Toyo Cushion Lanka (Pvt) Ltd
                </Text>
              </View>
              <View style={styles.specRow}>
                <Text style={[styles.specKey, { fontSize: rf(12) }]}>
                  Corporate Sector:
                </Text>
                <Text style={[styles.specVal, { fontSize: rf(12) }]}>
                  Hayleys Eco Solutions Sector
                </Text>
              </View>
              <View style={styles.specRow}>
                <Text style={[styles.specKey, { fontSize: rf(12) }]}>Machine Title:</Text>
                <Text style={[styles.specVal, { fontSize: rf(12) }]}>
                  Rubberised Coir Fleece Cutting Machine
                </Text>
              </View>
              <View style={styles.specRow}>
                <Text style={[styles.specKey, { fontSize: rf(12) }]}>
                  Primary Endpoint:
                </Text>
                <Text style={[styles.specVal, { fontSize: rf(12) }]}>
                  POST /api/signal (Post 1 & Post 2)
                </Text>
              </View>
              <View style={styles.specRow}>
                <Text style={[styles.specKey, { fontSize: rf(12) }]}>
                  Parameter Table:
                </Text>
                <Text style={[styles.specVal, { fontSize: rf(12) }]}>
                  parameters/cutter_config ({threshold}s limit)
                </Text>
              </View>
              <View style={styles.specRow}>
                <Text style={[styles.specKey, { fontSize: rf(12) }]}>Plant Timezone:</Text>
                <Text style={[styles.specVal, { fontSize: rf(12) }]}>
                  Sri Lanka (Asia/Colombo UTC+05:30)
                </Text>
              </View>
            </View>
          </View>

          {/* Revamped Post 1 & Post 2 Signal Architecture */}
          <View style={[styles.card, { padding: cardPadding }]}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="git-network" size={18} color="#0284c7" />
              <Text style={[styles.cardTitle, { fontSize: rf(15) }]}>
                Revamped Post 1 & Post 2 Signal Architecture
              </Text>
            </View>

            <Text style={[styles.cardBody, { fontSize: rf(12) }]}>
              The cutting machine reports edge events to a single unified endpoint (/api/signal) using two signal states:
            </Text>

            <View style={styles.stepList}>
              <View style={styles.stepItem}>
                <View style={[styles.stepNum, { backgroundColor: "#059669" }]}>
                  <Text style={styles.stepNumText}>1</Text>
                </View>
                <View style={styles.stepTextGroup}>
                  <Text style={[styles.stepHead, { fontSize: rf(13) }]}>
                    Post 1: Cutter Returned to Origin (+1 Cut)
                  </Text>
                  <Text style={[styles.stepDesc, { fontSize: rf(11) }]}>
                    Sent when the cutter completes a cut cycle and arrives back at the origin sensor. Increments the hourly cut volume by +1. The summation of all Post 1 entries in an hour equals the hourly volume achieved.
                  </Text>
                </View>
              </View>

              <View style={styles.stepItem}>
                <View style={[styles.stepNum, { backgroundColor: "#6366f1" }]}>
                  <Text style={styles.stepNumText}>2</Text>
                </View>
                <View style={styles.stepTextGroup}>
                  <Text style={[styles.stepHead, { fontSize: rf(13) }]}>
                    Post 2: Stationary at Origin (0 Cuts Special Case)
                  </Text>
                  <Text style={[styles.stepDesc, { fontSize: rf(11) }]}>
                    Sent when the cutter has not moved from origin. Logs timestamp and cycle duration against the previous post, and evaluates the Idle column (1 if duration &gt; {threshold}s, else 0), without inflating the cut count (0 cuts added).
                  </Text>
                </View>
              </View>

              <View style={styles.stepItem}>
                <View style={[styles.stepNum, { backgroundColor: "#d97706" }]}>
                  <Text style={styles.stepNumText}>3</Text>
                </View>
                <View style={styles.stepTextGroup}>
                  <Text style={[styles.stepHead, { fontSize: rf(13) }]}>
                    Duration & Parameterized Idle Column ({threshold}s)
                  </Text>
                  <Text style={[styles.stepDesc, { fontSize: rf(11) }]}>
                    Initial entry logs Duration = 0s. Every subsequent post computes Duration = (currentTimestamp − previousTimestamp) in seconds. If Duration ≤ {threshold}s (configured in parameters/cutter_config), Idle = 0 (Normal). If Duration &gt; {threshold}s, Idle = 1 (Delay) and a stoppage incident is logged.
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* OEE Mathematical Formulation */}
          <View style={[styles.card, { padding: cardPadding }]}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="calculator" size={18} color="#8b5cf6" />
              <Text style={[styles.cardTitle, { fontSize: rf(15) }]}>
                OEE & Zero-Data Dormancy Formulation
              </Text>
            </View>

            <View style={styles.formulaBox}>
              <Text style={[styles.formulaText, { fontSize: rf(12) }]}>
                OEE = Availability (A) × Performance (P) × Quality (Q)
              </Text>
            </View>

            <View style={styles.formulaBreakdown}>
              <Text style={[styles.formulaItem, { fontSize: rf(11) }]}>
                • Availability (A): Total Operating Uptime / 24 Hours (1,440 Planned Minutes).
              </Text>
              <Text style={[styles.formulaItem, { fontSize: rf(11) }]}>
                • Performance (P): Actual Coir Cuts (Sum of 1s) / Rated Standard Target Capacity.
              </Text>
              <Text style={[styles.formulaItem, { fontSize: rf(11) }]}>
                • Quality (Q): First-pass conforming cuts (100% baseline).
              </Text>
              <Text
                style={[
                  styles.formulaItem,
                  { color: "#b45309", marginTop: 4, fontSize: rf(11) }
                ]}
              >
                • Zero-Data Inactivity Rule: If no signal posts exist for a date, the system evaluates the day as 100% idle (0h Uptime, 24h Downtime) with 0% OEE.
              </Text>
            </View>
          </View>

          {/* 12 AM Midnight Excel Generation & Weekly Rotation */}
          <View style={[styles.card, { padding: cardPadding }]}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="document-text" size={18} color="#059669" />
              <Text style={[styles.cardTitle, { fontSize: rf(15) }]}>
                Automated Midnight Excel Archive & Rotation
              </Text>
            </View>
            <Text style={[styles.cardBody, { fontSize: rf(12) }]}>
              At 12:00 AM (00:00 Asia/Colombo), a scheduled Cloud Function automatically compiles the 4-sheet Excel workbook (.xlsx), uploads it to Firebase Storage & Firestore (/reports/), and rotates daily records into archive collections. Every Monday at 2:00 AM, older archive records are cleaned while preserving the previous day's details.
            </Text>
            <View style={styles.storagePill}>
              <Ionicons
                name="cloud-done"
                size={14}
                color="#064e3b"
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.storagePillText, { fontSize: rf(11) }]}>
                Firestore Collection: /reports/ & /parameters/cutter_config
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background
  },
  scrollContainer: {
    flex: 1
  },
  contentContainer: {
    paddingBottom: 32,
    maxWidth: Platform.OS === "web" ? 1200 : undefined,
    alignSelf: Platform.OS === "web" ? "center" : undefined,
    width: "100%"
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12
  },
  cardTitle: {
    fontWeight: "800",
    color: "#0f172a",
    flex: 1
  },
  cardBody: {
    color: "#475569",
    lineHeight: 18,
    marginBottom: 12
  },
  specGrid: {
    gap: 8
  },
  specRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9"
  },
  specKey: {
    color: "#64748b",
    fontWeight: "600"
  },
  specVal: {
    color: "#0f172a",
    fontWeight: "700",
    textAlign: "right",
    flex: 1,
    minWidth: 150
  },
  stepList: {
    gap: 12
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2
  },
  stepNumText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800"
  },
  stepTextGroup: {
    flex: 1
  },
  stepHead: {
    fontWeight: "800",
    color: "#0f172a"
  },
  stepDesc: {
    color: "#475569",
    lineHeight: 16,
    marginTop: 2
  },
  formulaBox: {
    backgroundColor: "#f5f3ff",
    borderWidth: 1,
    borderColor: "#ddd6fe",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12
  },
  formulaText: {
    fontWeight: "800",
    color: "#5b21b6",
    textAlign: "center"
  },
  formulaBreakdown: {
    gap: 6
  },
  formulaItem: {
    color: "#334155",
    lineHeight: 17,
    fontWeight: "600"
  },
  storagePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#d1fae5",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: "flex-start"
  },
  storagePillText: {
    fontWeight: "800",
    color: "#064e3b"
  }
});
