import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCutter } from "../context/CutterContext";
import { useResponsive } from "../utils/responsive";

export default function DowntimeLogCard() {
  const {
    downtimesList,
    selectedDate,
    currentTimeSLST,
    resolveDowntime,
    idleThreshold,
    isLoading
  } = useCutter();

  const { rf, containerPadding, cardPadding } = useResponsive();
  const [resolvingId, setResolvingId] = useState(null);

  const threshold = Number(idleThreshold || 20);
  const incidentCount = downtimesList.length;
  const activeDowntimes = downtimesList.filter((dt) => dt.active === true);

  const handleResolve = async (targetDtId = null) => {
    try {
      const activeId = targetDtId || activeDowntimes[0]?.id;
      setResolvingId(activeId || "all");
      await resolveDowntime(activeId);
    } finally {
      setResolvingId(null);
    }
  };

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
      {/* Header: Synced with Web App Section 8 "Idle Stoppage Incidents Log (Duration > {idleThreshold}s)" */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Text style={[styles.eyebrow, { fontSize: rf(10) }]}>
            DOWNTIME & IDLE TRACKING
          </Text>
          <Text style={[styles.title, { fontSize: rf(16) }]}>
            Idle Stoppage Incidents Log (Duration &gt; {threshold}s)
          </Text>
          <Text style={[styles.subtitle, { fontSize: rf(11) }]}>
            Every cycle where duration exceeds {threshold} seconds is flagged as Idle = 1 and recorded for shift audit.
          </Text>
        </View>

        <View style={styles.totalIncidentsBadge}>
          <Text style={[styles.totalIncidentsText, { fontSize: rf(11) }]}>
            Total Idle Incidents: {incidentCount}
          </Text>
        </View>
      </View>

      {incidentCount === 0 ? (
        <View style={styles.emptySuccessCard}>
          <Text style={{ fontSize: 22 }}>✨</Text>
          <Text style={[styles.emptySuccessTitle, { fontSize: rf(13) }]}>
            Zero idle stoppages exceeding {threshold}s recorded for {selectedDate}.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollList}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          <View style={styles.listContainer}>
            {downtimesList.map((dt, idx) => {
              const isActive = dt.active === true;
              const isResolvingThis =
                resolvingId === dt.id || (resolvingId === "all" && isActive);
              const durSec =
                dt.durationSeconds || Math.round((Number(dt.durationMinutes) || 0) * 60);
              const durMin =
                dt.durationMinutes !== undefined
                  ? dt.durationMinutes
                  : parseFloat((durSec / 60).toFixed(2));
              const postType = dt.post || 1;

              return (
                <View
                  key={dt.id || idx}
                  style={[styles.itemCard, isActive && styles.itemCardActive]}
                >
                  <View style={styles.itemTopRow}>
                    <View style={styles.itemLeft}>
                      <View style={styles.incidentNumBadge}>
                        <Text style={[styles.incidentNumText, { fontSize: rf(10) }]}>
                          #{idx + 1}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.postBadge,
                          postType === 1 ? styles.postBadge1 : styles.postBadge2
                        ]}
                      >
                        <Text
                          style={[
                            styles.postBadgeText,
                            { fontSize: rf(10) },
                            postType === 1 ? styles.postText1 : styles.postText2
                          ]}
                        >
                          Post {postType}
                        </Text>
                      </View>
                      <Text style={[styles.itemTime, { fontSize: rf(12) }]}>
                        {dt.startTimeStr || dt.startTime?.slice(11, 19) || "N/A"} →{" "}
                        {isActive
                          ? "ONGOING"
                          : dt.endTimeStr || dt.endTime?.slice(11, 19) || "N/A"}
                      </Text>
                    </View>

                    <View style={styles.durationGroup}>
                      <Text style={[styles.durSecText, { fontSize: rf(13) }]}>
                        {durSec}s
                      </Text>
                      <Text style={[styles.durMinText, { fontSize: rf(10) }]}>
                        ({durMin}m)
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.itemReason, { fontSize: rf(11) }]}>
                    {dt.reason || `Cycle Duration > ${threshold}s`}
                  </Text>

                  {isActive && (
                    <TouchableOpacity
                      style={styles.resolveItemBtn}
                      onPress={() => handleResolve(dt.id)}
                      disabled={isResolvingThis || isLoading}
                      activeOpacity={0.8}
                    >
                      {isResolvingThis ? (
                        <ActivityIndicator
                          size="small"
                          color="#ffffff"
                          style={{ marginRight: 6 }}
                        />
                      ) : (
                        <Ionicons
                          name="checkmark-done-circle"
                          size={15}
                          color="#ffffff"
                          style={{ marginRight: 6 }}
                        />
                      )}
                      <Text style={[styles.resolveItemBtnText, { fontSize: rf(11) }]}>
                        {isResolvingThis
                          ? "Resolving..."
                          : `Resolve Stoppage (${currentTimeSLST?.timeString || "Now"})`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14
  },
  eyebrow: {
    fontWeight: "800",
    color: "#ea580c",
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
  totalIncidentsBadge: {
    backgroundColor: "#fff7ed",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ffedd5"
  },
  totalIncidentsText: {
    fontWeight: "800",
    color: "#c2410c"
  },
  emptySuccessCard: {
    paddingVertical: 26,
    paddingHorizontal: 16,
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bbf7d0"
  },
  emptySuccessTitle: {
    fontWeight: "700",
    color: "#059669",
    marginTop: 6,
    textAlign: "center"
  },
  scrollList: {
    maxHeight: 380
  },
  listContainer: {
    gap: 10
  },
  itemCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  itemCardActive: {
    backgroundColor: "#fff7ed",
    borderColor: "#fdba74",
    borderWidth: 1.5
  },
  itemTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    flex: 1
  },
  incidentNumBadge: {
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  incidentNumText: {
    fontWeight: "800",
    color: "#475569"
  },
  postBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1
  },
  postBadge1: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0"
  },
  postBadge2: {
    backgroundColor: "#eef2ff",
    borderColor: "#c7d2fe"
  },
  postBadgeText: {
    fontWeight: "800"
  },
  postText1: {
    color: "#059669"
  },
  postText2: {
    color: "#4f46e5"
  },
  itemTime: {
    fontWeight: "800",
    color: "#0f172a"
  },
  durationGroup: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4
  },
  durSecText: {
    fontWeight: "900",
    color: "#dc2626"
  },
  durMinText: {
    fontWeight: "600",
    color: "#64748b"
  },
  itemReason: {
    color: "#475569",
    marginTop: 6,
    fontWeight: "600"
  },
  resolveItemBtn: {
    marginTop: 10,
    backgroundColor: "#059669",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  },
  resolveItemBtnText: {
    color: "#ffffff",
    fontWeight: "800"
  }
});
