import React, { useState, useEffect } from "react";
import {
  Typography,
  Tag,
  Button,
  Space,
  Row,
  Col,
  Card,
  Divider,
  message
} from "antd";
import {
  ThunderboltOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined
} from "@ant-design/icons";
import MetricCard from "../components/common/MetricCard";
import { getJayawardenepuraDetails } from "../utils/timeZoneUtils";
import { getRssiClassification } from "../utils/wsnCalculations";

const { Title, Text, Paragraph } = Typography;

export default function CutterDashboard() {
  const [currentTime, setCurrentTime] = useState(getJayawardenepuraDetails());
  const [cutsToday, setCutsToday] = useState(142);
  const [lastCycleDuration, setLastCycleDuration] = useState(14.8);
  const [isIdle, setIsIdle] = useState(false);
  const [simulating, setSimulating] = useState(false);

  // Live SLST Clock update
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getJayawardenepuraDetails());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSimulatePost1 = () => {
    setSimulating(true);
    setTimeout(() => {
      setCutsToday((prev) => prev + 2);
      setLastCycleDuration(parseFloat((Math.random() * 5 + 12).toFixed(1)));
      setIsIdle(false);
      setSimulating(false);
      message.success("POST 1: Cut completed (Origin reached) -> +2 cuts recorded");
    }, 300);
  };

  const handleSimulatePost2 = () => {
    setSimulating(true);
    setTimeout(() => {
      setLastCycleDuration(parseFloat((Math.random() * 8 + 22).toFixed(1)));
      setIsIdle(true);
      setSimulating(false);
      message.warning("POST 2: Blade idle event at origin -> Idle stoppage logged");
    }, 300);
  };

  const wifiSignal = getRssiClassification(-68);

  return (
    <div style={{ padding: "28px 36px", background: "#f8fafc", minHeight: "100vh" }}>
      {/* Brand Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
          padding: "18px 24px",
          background: "#ffffff",
          borderRadius: 16,
          border: "1px solid #e2e8f0",
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img
            src="/logo.png"
            alt="Toyo Cushion Lanka"
            style={{ height: 48, objectFit: "contain" }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <div>
            <Title level={4} style={{ margin: 0, color: "#064e3b", fontWeight: 700 }}>
              Toyo Cushion Lanka | Rubberised Coir Cutter
            </Title>
            <Text type="secondary" style={{ fontSize: "0.85rem" }}>
              Hayleys Eco Solutions Sector &bull; MCS4302 Mobile Computing Project
            </Text>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <Tag color="success" icon={<CheckCircleOutlined />}>
            System Online
          </Tag>
          <div style={{ marginTop: 4 }}>
            <Text strong style={{ color: "#0f172a" }}>
              {currentTime.timeOnly}
            </Text>{" "}
            <Text type="secondary" style={{ fontSize: "0.8rem" }}>
              (SLST UTC+05:30)
            </Text>
          </div>
        </div>
      </div>

      {/* Primary KPI Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title="Machine Status"
            value={isIdle ? "IDLE / STOP" : "OPERATIONAL"}
            badge={isIdle ? "Stoppage" : "Running"}
            badgeColor={isIdle ? "error" : "success"}
            subtitle="Rubberised Coir Cutter #01"
            icon={isIdle ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            iconBg={isIdle ? "#ef4444" : "#10b981"}
          />
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title="Total Volume (Today)"
            value={`${cutsToday} Cuts`}
            badge="+12% target"
            badgeColor="success"
            subtitle="Standard Coir Fleece Sheets"
            icon={<DashboardOutlined />}
            iconBg="#6366f1"
          />
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title="Last Stroke Cycle"
            value={`${lastCycleDuration}s`}
            badge={lastCycleDuration > 20 ? "Idle Risk" : "Normal"}
            badgeColor={lastCycleDuration > 20 ? "error" : "success"}
            subtitle="Threshold: 20s Max"
            icon={<ClockCircleOutlined />}
            iconBg="#f59e0b"
          />
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <MetricCard
            title="ESP32 IoT Link"
            value={wifiSignal.quality}
            badge="-68 dBm"
            badgeColor="processing"
            subtitle={wifiSignal.statusText}
            icon={<ThunderboltOutlined />}
            iconBg={wifiSignal.color}
          />
        </Col>
      </Row>

      {/* Signal Simulator Action Card */}
      <Card
        title={
          <Space>
            <ThunderboltOutlined style={{ color: "#065f46" }} />
            <span>Interactive IoT Ingestion Simulator</span>
          </Space>
        }
        bordered={true}
        style={{
          borderRadius: 16,
          border: "1px solid #e2e8f0",
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
        }}
      >
        <Paragraph type="secondary">
          Simulate pulse signals coming from the cutter machine's photoelectric origin sensors
          to test duration calculation and volume increments.
        </Paragraph>

        <Space size="middle" wrap>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={simulating}
            onClick={handleSimulatePost1}
            style={{ background: "#065f46", borderColor: "#065f46", height: 40, borderRadius: 8 }}
          >
            Simulate POST 1 (Cut Completed)
          </Button>

          <Button
            danger
            icon={<PauseCircleOutlined />}
            loading={simulating}
            onClick={handleSimulatePost2}
            style={{ height: 40, borderRadius: 8 }}
          >
            Simulate POST 2 (Idle Event)
          </Button>

          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setCutsToday(0);
              setLastCycleDuration(0);
              setIsIdle(false);
              message.info("Counter reset for test run");
            }}
            style={{ height: 40, borderRadius: 8 }}
          >
            Reset Counters
          </Button>
        </Space>
      </Card>
    </div>
  );
}

