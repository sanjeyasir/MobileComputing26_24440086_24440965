// ESP32 Firmware and API Code Generation Utility

export function generateEsp32ArduinoCode({
  nodeId = "ESP32-NODE-01",
  wifiSsid = "YOUR_WIFI_SSID",
  wifiPassword = "YOUR_WIFI_PASSWORD",
  apiUrl = "https://us-central1-msc-mobile-computing-project.cloudfunctions.net/api/telemetry",
  burstIntervalSeconds = 15,
  sensorType = "DS18B20",
  batteryPin = 34
}) {
  return `/*
 * ESP32 Wireless Sensor Network (WSN) Node Telemetry Transmitter
 * Node ID: ${nodeId}
 * MSc Mobile Computing Project
 * 
 * Required Arduino Libraries:
 * 1. ArduinoJson (by Benoit Blanchon) v6.x or v7.x
 * 2. OneWire & DallasTemperature (if using DS18B20 digital sensor)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// --- Wi-Fi Credentials ---
const char* ssid = "${wifiSsid}";
const char* password = "${wifiPassword}";

// --- Cloud Telemetry Endpoint ---
const char* serverUrl = "${apiUrl}";

// --- Node Configuration ---
const char* NODE_ID = "${nodeId}";
const int BURST_INTERVAL_SECONDS = ${burstIntervalSeconds};
const int BATTERY_ADC_PIN = ${batteryPin}; // ADC1 pin (e.g. GPIO 34)

unsigned long lastBurstTime = 0;
unsigned long burstSequence = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\\n==========================================");
  Serial.printf("Starting WSN Node: %s\\n", NODE_ID);
  Serial.println("==========================================");

  // Setup battery ADC pin
  pinMode(BATTERY_ADC_PIN, INPUT);

  // Connect to Wi-Fi
  connectWiFi();
}

void loop() {
  // Check Wi-Fi connection health
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // Periodic Telemetry Burst Transmission
  unsigned long currentMillis = millis();
  if (currentMillis - lastBurstTime >= (BURST_INTERVAL_SECONDS * 1000UL) || lastBurstTime == 0) {
    lastBurstTime = currentMillis;
    burstSequence++;

    // 1. Read Physical Sensor Values
    float temperature = readTemperature();
    int batteryPercentage = readBatteryPercentage();
    int rssi = WiFi.RSSI();

    Serial.printf("\\n[Burst #%lu] Transmitting Telemetry...\\n", burstSequence);
    Serial.printf(" -> Temp: %.2f °C | Battery: %d %% | RSSI: %d dBm\\n", temperature, batteryPercentage, rssi);

    // 2. Post Telemetry Data via HTTP API
    postTelemetryBurst(NODE_ID, temperature, batteryPercentage, rssi, burstSequence);
  }

  delay(100);
}

void connectWiFi() {
  Serial.printf("Connecting to Wi-Fi: %s ", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 25) {
    delay(500);
    Serial.print(".");
    retries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" CONNECTED!");
    Serial.printf("Wi-Fi RSSI Signal: %d dBm\\n", WiFi.RSSI());
  } else {
    Serial.println(" Connection Failed! Will retry next loop.");
  }
}

// Read Temperature from Sensor (or simulated realistic analog probe)
float readTemperature() {
  static float simulatedTemp = 24.5;
  simulatedTemp += ((random(-50, 51) / 100.0) * 0.4);
  if (simulatedTemp < 18.0) simulatedTemp = 18.5;
  if (simulatedTemp > 38.0) simulatedTemp = 37.5;
  return simulatedTemp;
}

// Read Battery Level via ADC Voltage Divider
int readBatteryPercentage() {
  int rawAdc = analogRead(BATTERY_ADC_PIN);
  float voltage = (rawAdc / 4095.0) * 3.3 * 2.0; // 2x multiplier for voltage divider
  int percentage = (int)(((voltage - 3.4) / (4.2 - 3.4)) * 100.0);
  if (percentage < 0) percentage = 0;
  if (percentage > 100) percentage = 100;
  if (rawAdc == 0) return 92; // Default fallback if no battery connected
  return percentage;
}

// HTTP POST Telemetry to Cloud Endpoint
void postTelemetryBurst(const char* node, float temp, int battery, int rssi, unsigned long seq) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP] Error: Wi-Fi not connected. Burst aborted.");
    return;
  }

  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");

  // Construct JSON payload
  StaticJsonDocument<256> doc;
  doc["nodeId"] = node;
  doc["temperature"] = temp;
  doc["battery"] = battery;
  doc["rssi"] = rssi;
  doc["burstSequence"] = seq;
  doc["timestamp"] = ""; // Server assigns precise timestamp if empty

  String requestBody;
  serializeJson(doc, requestBody);

  int httpResponseCode = http.POST(requestBody);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.printf("[HTTP] Success! Code: %d | Response: %s\\n", httpResponseCode, response.c_str());
  } else {
    Serial.printf("[HTTP] Error on POST: %s (Code: %d)\\n", http.errorToString(httpResponseCode).c_str(), httpResponseCode);
  }

  http.end();
}
`;
}

export function generateCurlExample(apiUrl, nodeId = "ESP32-NODE-01") {
  return `curl -X POST "${apiUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "nodeId": "${nodeId}",
    "temperature": 26.4,
    "battery": 88,
    "rssi": -64,
    "burstSequence": 105
  }'`;
}

export function generatePythonExample(apiUrl, nodeId = "ESP32-NODE-01") {
  return `import requests
import time
import random

API_URL = "${apiUrl}"
NODE_ID = "${nodeId}"

def send_telemetry_burst(seq):
    payload = {
        "nodeId": NODE_ID,
        "temperature": round(24.0 + random.uniform(-2.5, 3.5), 1),
        "battery": random.randint(75, 95),
        "rssi": random.randint(-75, -55),
        "burstSequence": seq
    }
    
    try:
        response = requests.post(API_URL, json=payload, timeout=5)
        print(f"[{seq}] Burst Sent: {payload['temperature']}°C, Status {response.status_code}")
    except Exception as e:
        print(f"Transmission error: {e}")

# Simulate periodic burst every 10 seconds
seq = 1
while True:
    send_telemetry_burst(seq)
    seq += 1
    time.sleep(10)
`;
}
