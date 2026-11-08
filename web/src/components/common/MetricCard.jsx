import React from "react";
import { Card, Typography, Space } from "antd";

const { Text, Title } = Typography;

export default function MetricCard({
  title,
  value,
  subtitle,
  icon,
  iconBg = "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
  iconColor = "#ffffff",
  badge,
  badgeColor = "default",
  trend,
  trendColor = "#10b981",
  onClick,
  style = {}
}) {
  return (
    <Card
      bordered={true}
      className="metric-card-hover"
      onClick={onClick}
      style={{
        borderRadius: 16,
        border: "1px solid #e2e8f0",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
        cursor: onClick ? "pointer" : "default",
        background: "#ffffff",
        height: "100%",
        ...style
      }}
      styles={{ body: { padding: "20px" } }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, marginRight: 12 }}>
          <Text type="secondary" style={{ fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b" }}>
            {title}
          </Text>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4, marginBottom: 4 }}>
            <Title level={2} style={{ margin: 0, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {value}
            </Title>
            {badge && (
              <span style={{ 
                fontSize: "0.75rem", 
                fontWeight: 700, 
                padding: "2px 8px", 
                borderRadius: 12,
                backgroundColor: badgeColor === "success" ? "rgba(16, 185, 129, 0.12)" : (badgeColor === "error" ? "rgba(239, 68, 68, 0.12)" : "rgba(99, 102, 241, 0.12)"),
                color: badgeColor === "success" ? "#10b981" : (badgeColor === "error" ? "#ef4444" : "#6366f1")
              }}>
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <Text type="secondary" style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
              {subtitle}
            </Text>
          )}
          {trend && (
            <div style={{ marginTop: 4, fontSize: "0.8rem", color: trendColor, fontWeight: 600 }}>
              {trend}
            </div>
          )}
        </div>

        <div style={{
          width: 46,
          height: 46,
          borderRadius: 12,
          background: iconBg,
          color: iconColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          boxShadow: "0 4px 10px rgba(0, 0, 0, 0.08)",
          flexShrink: 0
        }}>
          {icon}
        </div>
      </div>
    </Card>
  );
}
