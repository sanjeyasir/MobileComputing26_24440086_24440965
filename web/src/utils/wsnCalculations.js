// WSN (Wireless Sensor Network) Calculation and Diagnostic Utilities

/**
 * Classifies RSSI (Received Signal Strength Indicator in dBm)
 * ESP32 Wi-Fi ranges typically span from -30 dBm (right beside AP) to -95 dBm (edge of coverage).
 */
export function getRssiClassification(rssi) {
  const val = Number(rssi) || -99;
  if (val >= -65) {
    return {
      quality: "Excellent",
      color: "#10b981", // Emerald
      bgLight: "rgba(16, 185, 129, 0.1)",
      bars: 4,
      percentage: Math.min(100, Math.round(100 - (val + 30) * -0.7)),
      statusText: "Strong, reliable link"
    };
  } else if (val >= -75) {
    return {
      quality: "Good",
      color: "#3b82f6", // Blue
      bgLight: "rgba(59, 130, 246, 0.1)",
      bars: 3,
      percentage: 75,
      statusText: "Stable connection"
    };
  } else if (val >= -85) {
    return {
      quality: "Fair",
      color: "#f59e0b", // Amber
      bgLight: "rgba(245, 158, 11, 0.1)",
      bars: 2,
      percentage: 50,
      statusText: "Moderate packet loss risk"
    };
  } else {
    return {
      quality: "Poor",
      color: "#ef4444", // Red
      bgLight: "rgba(239, 68, 68, 0.1)",
      bars: 1,
      percentage: 25,
      statusText: "Weak signal / High drop rate"
    };
  }
}

/**
 * Classifies battery percentage & health status
 */
export function getBatteryClassification(percentage, thresholds = { lowBattery: 25, criticalBattery: 15 }) {
  const val = Math.max(0, Math.min(100, Number(percentage) || 0));
  if (val <= thresholds.criticalBattery) {
    return {
      status: "Critical",
      color: "#ef4444",
      bgLight: "rgba(239, 68, 68, 0.1)",
      tagColor: "error",
      description: "Immediate replacement / recharge needed"
    };
  } else if (val <= thresholds.lowBattery) {
    return {
      status: "Low",
      color: "#f59e0b",
      bgLight: "rgba(245, 158, 11, 0.1)",
      tagColor: "warning",
      description: "Battery low, schedule replacement"
    };
  } else if (val < 60) {
    return {
      status: "Moderate",
      color: "#3b82f6",
      bgLight: "rgba(59, 130, 246, 0.1)",
      tagColor: "processing",
      description: "Adequate charge remaining"
    };
  } else {
    return {
      status: "Healthy",
      color: "#10b981",
      bgLight: "rgba(16, 185, 129, 0.1)",
      tagColor: "success",
      description: "Battery operating at nominal capacity"
    };
  }
}

/**
 * Classifies temperature reading against thresholds
 */
export function getTemperatureClassification(temp, thresholds = { highTemp: 35.0, criticalHighTemp: 42.0, lowTemp: 16.0 }) {
  const t = Number(temp);
  if (isNaN(t)) {
    return { status: "Unknown", color: "#64748b", tagColor: "default", icon: "❓" };
  }
  if (t >= thresholds.criticalHighTemp) {
    return { status: "Critical Overheat", color: "#b91c1c", tagColor: "error", icon: "🔥", alert: true };
  } else if (t >= thresholds.highTemp) {
    return { status: "High Temperature", color: "#ef4444", tagColor: "warning", icon: "⚠️", alert: true };
  } else if (t <= thresholds.lowTemp) {
    return { status: "Low Temperature", color: "#0284c7", tagColor: "cyan", icon: "❄️", alert: true };
  } else {
    return { status: "Optimal", color: "#10b981", tagColor: "success", icon: "✅", alert: false };
  }
}

/**
 * Determines if an ESP32 node is currently online based on last burst timestamp and interval
 */
export function isNodeOnline(lastSeen, burstIntervalSeconds = 15, maxThresholdSeconds = 180) {
  if (!lastSeen) return false;
  const lastTime = new Date(lastSeen).getTime();
  if (isNaN(lastTime)) return false;
  
  const elapsedSeconds = (Date.now() - lastTime) / 1000;
  // Node is online if burst was received within 3x its configured burst interval or within the max timeout
  const allowedInterval = Math.max(burstIntervalSeconds * 3, maxThresholdSeconds);
  return elapsedSeconds <= allowedInterval;
}

/**
 * Formats time difference in human-readable concise format (e.g. "Just now", "12s ago", "4m ago")
 */
export function formatTimeAgo(timestamp) {
  if (!timestamp) return "Never";
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "Unknown";

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Calculate network aggregate diagnostics
 * If no telemetry bursts exist in current 24h cycle, averages are strictly 0 / clean.
 */
export function computeNetworkHealthMetrics(nodes = [], telemetry = [], thresholds = {}) {
  const totalNodes = nodes.length;

  if (!telemetry || telemetry.length === 0) {
    return {
      totalNodes,
      onlineCount: 0,
      offlineCount: totalNodes,
      avgTemp: 0,
      minTemp: 0,
      maxTemp: 0,
      avgBattery: 0,
      avgRssi: 0,
      lowBatteryCount: 0,
      poorRssiCount: 0,
      warningCount: 0,
      healthScore: 0,
      totalBurstsRecorded: 0
    };
  }

  let onlineCount = 0;
  let warningCount = 0;
  let totalTemp = 0;
  let validTempCount = 0;
  let totalBattery = 0;
  let validBatteryCount = 0;
  let totalRssi = 0;
  let validRssiCount = 0;
  let minTemp = Infinity;
  let maxTemp = -Infinity;
  let lowBatteryCount = 0;
  let poorRssiCount = 0;

  // Aggregate metrics from current telemetry stream
  telemetry.forEach(item => {
    const temp = Number(item.temperature);
    if (!isNaN(temp)) {
      totalTemp += temp;
      validTempCount++;
      if (temp < minTemp) minTemp = temp;
      if (temp > maxTemp) maxTemp = temp;
    }

    const batt = Number(item.battery);
    if (!isNaN(batt)) {
      totalBattery += batt;
      validBatteryCount++;
      if (batt <= (thresholds.lowBattery || 25)) {
        lowBatteryCount++;
        warningCount++;
      }
    }

    const rssi = Number(item.rssi);
    if (!isNaN(rssi)) {
      totalRssi += rssi;
      validRssiCount++;
      if (rssi <= (thresholds.poorRssi || -85)) {
        poorRssiCount++;
        warningCount++;
      }
    }
  });

  nodes.forEach(node => {
    const online = isNodeOnline(node.lastSeen, node.burstInterval, thresholds.offlineThresholdSeconds || 180);
    if (online) onlineCount++;
  });

  const offlineCount = Math.max(0, totalNodes - onlineCount);
  const avgTemp = validTempCount > 0 ? parseFloat((totalTemp / validTempCount).toFixed(1)) : 0;
  const avgBattery = validBatteryCount > 0 ? Math.round(totalBattery / validBatteryCount) : 0;
  const avgRssi = validRssiCount > 0 ? Math.round(totalRssi / validRssiCount) : 0;

  // Overall network health score (0 - 100)
  const onlineScore = totalNodes > 0 ? (onlineCount / totalNodes) * 50 : 50;
  const batteryScore = (avgBattery / 100) * 30;
  const rssiScore = avgRssi > -65 ? 20 : (avgRssi > -75 ? 16 : (avgRssi > -85 ? 10 : 5));
  const healthScore = Math.min(100, Math.round(onlineScore + batteryScore + rssiScore));

  return {
    totalNodes,
    onlineCount,
    offlineCount,
    avgTemp,
    minTemp: minTemp === Infinity ? 0 : minTemp,
    maxTemp: maxTemp === -Infinity ? 0 : maxTemp,
    avgBattery,
    avgRssi,
    lowBatteryCount,
    poorRssiCount,
    warningCount,
    healthScore,
    totalBurstsRecorded: telemetry.length
  };
}
