
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ==========================================
// WIFI CONFIGURATION
// ==========================================

const char* ssid = "toyo_cutter_1";
const char* password = "4650240D";

// ==========================================
// API CONFIGURATION
// ==========================================

const char* SIGNAL_API =
  "https://msc-mobile-computing-project.web.app/api/signal";

const char* DOWNTIME_API =
  "https://msc-mobile-computing-project.web.app/api/downtime/status";

const char* DATE_API =
  "https://msc-mobile-computing-project.web.app/api/date";

const char* MACHINE_ID = "rubberised_coir_cutter";

// ==========================================
// GPIO CONFIGURATION
// ==========================================

const int RELAY_IN1 = 18;
const int RELAY_IN2 = 21;
const int IR_SENSOR = 23;

// Active LOW relay
const int RELAY_ON = LOW;
const int RELAY_OFF = HIGH;

// E18-D80NK: LOW = object detected
const int OBJECT_DETECTED = LOW;

// ==========================================
// TIMING
// ==========================================

const unsigned long BLINK_INTERVAL = 500;
const unsigned long WIFI_TIMEOUT = 120000;
const unsigned long RECONNECT_INTERVAL = 5000;
const unsigned long DOWNTIME_CHECK_INTERVAL = 60000;
const unsigned long SENSOR_DEBOUNCE = 30;

// ==========================================
// TIMING VARIABLES
// ==========================================

unsigned long startTime;
unsigned long lastIRBlinkTime;
unsigned long lastWiFiBlinkTime;
unsigned long lastReconnectTime;

unsigned long lastSensorChangeTime = 0;

int lastRawSensorState = HIGH;
int stableSensorState = HIGH;

// ==========================================
// STATE VARIABLES
// ==========================================

bool irRelayState = false;
bool wifiRelayState = false;
bool wifiConnected = false;
bool objectDetected = false;

volatile bool downtimeActive = false;

// System initialization lock
bool systemReady = false;

// ==========================================
// API EVENT QUEUE
// ==========================================

QueueHandle_t signalQueue = NULL;

// ==========================================
// GET SERVER DATE
// ==========================================

bool getServerDate(String &date, String &iso) {

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;

  http.setConnectTimeout(5000);
  http.setTimeout(5000);

  if (!http.begin(client, DATE_API)) {
    Serial.println("Date API connection failed");
    return false;
  }

  int httpCode = http.GET();

  if (httpCode == HTTP_CODE_OK) {

    String response = http.getString();

    StaticJsonDocument<1024> doc;

    DeserializationError error =
      deserializeJson(doc, response);

    if (!error && doc["success"] == true) {

      date = doc["date"].as<String>();
      iso = doc["iso"].as<String>();

      http.end();

      Serial.print("Server date: ");
      Serial.println(date);

      Serial.print("Server timestamp: ");
      Serial.println(iso);

      return true;
    }
  }

  Serial.print("Date API HTTP error: ");
  Serial.println(httpCode);

  http.end();

  return false;
}

// ==========================================
// POST IR SIGNAL
// ==========================================

void postSignal() {

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Cannot post signal: Wi-Fi disconnected");
    return;
  }

  Serial.println("Submitting IR signal...");

  String serverDate;
  String serverISO;

  bool dateAvailable =
    getServerDate(serverDate, serverISO);

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;

  http.setConnectTimeout(5000);
  http.setTimeout(5000);

  if (!http.begin(client, SIGNAL_API)) {
    Serial.println("Signal API connection failed");
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Accept", "application/json");

  StaticJsonDocument<256> doc;

  doc["post"] = 1;
  doc["machineId"] = MACHINE_ID;

  if (dateAvailable) {
    doc["timestamp"] = serverISO;
  }

  String requestBody;
  serializeJson(doc, requestBody);

  Serial.print("POST payload: ");
  Serial.println(requestBody);

  int httpCode = http.POST(requestBody);

  if (httpCode == HTTP_CODE_OK) {

    String response = http.getString();

    StaticJsonDocument<1024> responseDoc;

    DeserializationError error =
      deserializeJson(responseDoc, response);

    if (!error && responseDoc["ok"] == 1) {

      Serial.println("SIGNAL SUCCESSFULLY RECORDED");

      Serial.print("Cuts added: ");
      Serial.println(responseDoc["cutsAdded"].as<int>());

      Serial.print("Hourly volume: ");
      Serial.println(responseDoc["hourlyVolume"].as<int>());

      Serial.print("Total cuts today: ");
      Serial.println(responseDoc["totalCutsToday"].as<int>());

      Serial.print("Server time: ");
      Serial.println(responseDoc["serverTime"].as<String>());

    } else {

      Serial.println("Invalid signal API response");
      Serial.println(response);
    }

  } else {

    Serial.print("Signal API HTTP error: ");
    Serial.println(httpCode);

    if (httpCode > 0) {
      Serial.println(http.getString());
    }
  }

  http.end();
}

// ==========================================
// CHECK DOWNTIME STATUS
// ==========================================

void checkDowntime() {

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  Serial.println("Checking machine downtime...");

  String serverDate;
  String serverISO;

  if (!getServerDate(serverDate, serverISO)) {

    Serial.println("Unable to obtain server date");
    Serial.println("Keeping previous downtime status");

    return;
  }

  String url =
    String(DOWNTIME_API) + "?date=" + serverDate;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;

  http.setConnectTimeout(5000);
  http.setTimeout(5000);

  if (!http.begin(client, url)) {
    Serial.println("Downtime API connection failed");
    return;
  }

  http.addHeader("Accept", "application/json");

  int httpCode = http.GET();

  if (httpCode == HTTP_CODE_OK) {

    String response = http.getString();

    StaticJsonDocument<2048> doc;

    DeserializationError error =
      deserializeJson(doc, response);

    if (!error && doc["success"] == true) {

      downtimeActive =
        doc["hasActiveDowntime"].as<bool>();

      Serial.println("DOWNTIME STATUS UPDATED");

      Serial.print("Date: ");
      Serial.println(doc["date"].as<String>());

      Serial.print("Machine status: ");
      Serial.println(doc["machineStatus"].as<String>());

      Serial.print("Active downtime: ");
      Serial.println(downtimeActive ? "TRUE" : "FALSE");

      Serial.print("Total downtime minutes: ");
      Serial.println(
        doc["totalDowntimeMinutes"].as<float>()
      );

    } else {

      Serial.println("Invalid downtime API response");
      Serial.println("Keeping previous status");
    }

  } else {

    Serial.print("Downtime API HTTP error: ");
    Serial.println(httpCode);

    Serial.println("Keeping previous downtime status");
  }

  http.end();
}

// ==========================================
// API BACKGROUND TASK
// ==========================================

void apiWorker(void* parameter) {

  unsigned long lastDowntimeCheck = 0;

  bool firstCheck = true;

  uint8_t signalEvent;

  for (;;) {

    if (WiFi.status() == WL_CONNECTED) {

      if (
        xQueueReceive(
          signalQueue,
          &signalEvent,
          pdMS_TO_TICKS(100)
        ) == pdTRUE
      ) {

        postSignal();
      }

      unsigned long now = millis();

      if (
        firstCheck ||
        now - lastDowntimeCheck >= DOWNTIME_CHECK_INTERVAL
      ) {

        lastDowntimeCheck = now;
        firstCheck = false;

        checkDowntime();
      }

    } else {

      firstCheck = true;

      vTaskDelay(pdMS_TO_TICKS(250));
    }
  }
}

// ==========================================
// SETUP
// ==========================================

void setup() {

  Serial.begin(115200);

  // ----------------------------------------
  // 1. INITIALIZE RELAYS
  // ----------------------------------------

  pinMode(RELAY_IN1, OUTPUT);
  pinMode(RELAY_IN2, OUTPUT);

  digitalWrite(RELAY_IN1, RELAY_OFF);
  digitalWrite(RELAY_IN2, RELAY_OFF);

  // ----------------------------------------
  // 2. STARTUP BLINKING (BEFORE WIFI)
  // ----------------------------------------

  Serial.println("-----------------------------------");
  Serial.println("TOYO CUSHION CUTTER IoT CONTROLLER");
  Serial.println("-----------------------------------");

  Serial.println("System starting...");

  unsigned long startupStart = millis();
  unsigned long lastBlink = startupStart;

  bool startupRelayState = false;

  while (millis() - startupStart < 2000) {

    if (millis() - lastBlink >= BLINK_INTERVAL) {

      lastBlink = millis();

      startupRelayState = !startupRelayState;

      digitalWrite(
        RELAY_IN2,
        startupRelayState ? RELAY_ON : RELAY_OFF
      );
    }

    digitalWrite(RELAY_IN1, RELAY_OFF);

    delay(10);
  }

  // ----------------------------------------
  // 3. WIFI CONNECTION ATTEMPT
  // ----------------------------------------

  Serial.println();
  Serial.println("Connecting to Wi-Fi...");

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  WiFi.begin(ssid, password);

  // Continue blinking while connecting
  lastBlink = millis();
  startupRelayState = false;

  while (WiFi.status() != WL_CONNECTED) {

    if (millis() - lastBlink >= BLINK_INTERVAL) {

      lastBlink = millis();

      startupRelayState = !startupRelayState;

      digitalWrite(
        RELAY_IN2,
        startupRelayState ? RELAY_ON : RELAY_OFF
      );
    }

    digitalWrite(RELAY_IN1, RELAY_OFF);

    delay(10);
  }

  // ----------------------------------------
  // 4. WIFI CONNECTED
  // ----------------------------------------

  digitalWrite(RELAY_IN1, RELAY_OFF);
  digitalWrite(RELAY_IN2, RELAY_OFF);

  wifiRelayState = false;
  wifiConnected = true;

  Serial.println();
  Serial.println("WIFI CONNECTED!");

  Serial.print("SSID: ");
  Serial.println(WiFi.SSID());

  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  Serial.print("Gateway: ");
  Serial.println(WiFi.gatewayIP());

  Serial.print("Signal Strength: ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");

  // ----------------------------------------
  // 5. INITIALIZE IR SENSOR
  // ----------------------------------------

  pinMode(IR_SENSOR, INPUT_PULLUP);

  lastRawSensorState = digitalRead(IR_SENSOR);
  stableSensorState = lastRawSensorState;

  objectDetected = false;

  lastSensorChangeTime = millis();

  Serial.println("IR Sensor Initialized");

  // ----------------------------------------
  // 6. INITIALIZE TIMERS
  // ----------------------------------------

  startTime = millis();

  lastIRBlinkTime = startTime;
  lastWiFiBlinkTime = startTime;
  lastReconnectTime = startTime;

  // ----------------------------------------
  // 7. CREATE API QUEUE
  // ----------------------------------------

  signalQueue = xQueueCreate(10, sizeof(uint8_t));

  if (signalQueue != NULL) {

    BaseType_t taskCreated = xTaskCreate(
      apiWorker,
      "API Worker",
      8192,
      NULL,
      1,
      NULL
    );

    if (taskCreated == pdPASS) {

      Serial.println("API Worker Started");

    } else {

      Serial.println("ERROR: API Worker creation failed");
    }

  } else {

    Serial.println("ERROR: Signal queue creation failed");
  }

  // ----------------------------------------
  // 8. ENABLE NORMAL OPERATION
  // ----------------------------------------

  systemReady = true;

  Serial.println("-----------------------------------");
  Serial.println("SYSTEM READY");
  Serial.println("IR SENSOR: ENABLED");
  Serial.println("SIGNAL API: ENABLED");
  Serial.println("DOWNTIME MONITORING: ENABLED");
  Serial.println("-----------------------------------");
}



// ==========================================
// MAIN LOOP
// ==========================================

void loop() {

  // ----------------------------------------
  // SYSTEM INITIALIZATION LOCK
  // ----------------------------------------

  if (!systemReady) {
    return;
  }

  unsigned long now = millis();

  // ----------------------------------------
  // 1. IR SENSOR WITH DEBOUNCING
  // ----------------------------------------

  int rawSensorState = digitalRead(IR_SENSOR);

  if (rawSensorState != lastRawSensorState) {

    lastRawSensorState = rawSensorState;
    lastSensorChangeTime = now;
  }

  if (
    now - lastSensorChangeTime >= SENSOR_DEBOUNCE &&
    stableSensorState != rawSensorState
  ) {

    stableSensorState = rawSensorState;

    bool newDetection =
      (stableSensorState == OBJECT_DETECTED);

    if (newDetection) {

      objectDetected = true;

      Serial.println("IR OBJECT DETECTED");

      if (signalQueue != NULL) {

        uint8_t event = 1;

        if (xQueueSend(signalQueue, &event, 0) != pdTRUE) {
          Serial.println("WARNING: Signal queue full");
        }
      }

    } else {

      objectDetected = false;

      Serial.println("IR OBJECT CLEARED");

      irRelayState = false;
      lastIRBlinkTime = now;
    }
  }

  // ----------------------------------------
  // 2. WIFI CONNECTION
  // ----------------------------------------

  if (WiFi.status() == WL_CONNECTED) {

    if (!wifiConnected) {

      wifiConnected = true;

      Serial.println("WIFI CONNECTED!");

      Serial.print("IP Address: ");
      Serial.println(WiFi.localIP());
    }

    // --------------------------------------
    // 3. DOWNTIME LED PRIORITY
    // --------------------------------------

    if (downtimeActive) {

      digitalWrite(RELAY_IN1, RELAY_OFF);
      digitalWrite(RELAY_IN2, RELAY_ON);

      irRelayState = false;
    }

    else {

      digitalWrite(RELAY_IN2, RELAY_OFF);

      if (objectDetected) {

        if (now - lastIRBlinkTime >= BLINK_INTERVAL) {

          lastIRBlinkTime = now;

          irRelayState = !irRelayState;

          digitalWrite(
            RELAY_IN1,
            irRelayState ? RELAY_ON : RELAY_OFF
          );
        }

      } else {

        digitalWrite(RELAY_IN1, RELAY_ON);

        irRelayState = true;
      }
    }

  } else {

    // --------------------------------------
    // 4. WIFI DISCONNECTED
    // --------------------------------------

    wifiConnected = false;

    if (objectDetected) {

      if (now - lastIRBlinkTime >= BLINK_INTERVAL) {

        lastIRBlinkTime = now;

        irRelayState = !irRelayState;

        digitalWrite(
          RELAY_IN1,
          irRelayState ? RELAY_ON : RELAY_OFF
        );
      }

    } else {

      digitalWrite(RELAY_IN1, RELAY_OFF);
      irRelayState = false;
    }

    // Original Wi-Fi blinking behaviour
    if (now - startTime < WIFI_TIMEOUT) {

      if (now - lastWiFiBlinkTime >= BLINK_INTERVAL) {

        lastWiFiBlinkTime = now;

        wifiRelayState = !wifiRelayState;

        digitalWrite(
          RELAY_IN2,
          wifiRelayState ? RELAY_ON : RELAY_OFF
        );
      }

    } else {

      digitalWrite(RELAY_IN2, RELAY_OFF);
      wifiRelayState = false;
    }

    // Reconnect every 5 seconds
    if (now - lastReconnectTime >= RECONNECT_INTERVAL) {

      lastReconnectTime = now;

      Serial.println("Wi-Fi disconnected. Retrying...");

      WiFi.reconnect();
    }
  }

  delay(10);
}
