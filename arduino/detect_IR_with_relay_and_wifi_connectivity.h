
#include <WiFi.h>

const char* ssid = "ranjan";
const char* password = "david123";

// ----------------------------------
// GPIO CONFIGURATION
// ----------------------------------

// Relay pins
const int RELAY_IN1 = 18;
const int RELAY_IN2 = 21;

// E18-D80NK IR sensor
const int IR_SENSOR = 23;

// Active-LOW relay logic
const int RELAY_ON  = LOW;
const int RELAY_OFF = HIGH;

// IR sensor logic
const int OBJECT_DETECTED = LOW;

// ----------------------------------
// TIMING
// ----------------------------------

const unsigned long BLINK_INTERVAL = 500;
const unsigned long WIFI_TIMEOUT = 120000;
const unsigned long RECONNECT_INTERVAL = 5000;

// ----------------------------------
// TIMING VARIABLES
// ----------------------------------

unsigned long startTime;
unsigned long lastIRBlinkTime;
unsigned long lastWiFiBlinkTime;
unsigned long lastReconnectTime;

// ----------------------------------
// STATE VARIABLES
// ----------------------------------

bool irRelayState = false;
bool wifiRelayState = false;
bool wifiConnected = false;

// ----------------------------------
// SETUP
// ----------------------------------

void setup() {

  Serial.begin(115200);

  // Initialize relay outputs
  digitalWrite(RELAY_IN1, RELAY_OFF);
  digitalWrite(RELAY_IN2, RELAY_OFF);

  pinMode(RELAY_IN1, OUTPUT);
  pinMode(RELAY_IN2, OUTPUT);

  // Initialize IR sensor
  pinMode(IR_SENSOR, INPUT_PULLUP);

  // Start Wi-Fi connection
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  startTime = millis();

  lastIRBlinkTime = startTime;
  lastWiFiBlinkTime = startTime;
  lastReconnectTime = startTime;

  Serial.println("ESP32 Wi-Fi and IR Relay Controller");

  Serial.println("GPIO23: E18-D80NK IR Sensor");
  Serial.println("GPIO18: IR Detection Relay");
  Serial.println("GPIO21: Wi-Fi Status Relay");

  Serial.println("IN1: OFF initially");
  Serial.println("IN2: Blinking while Wi-Fi connects");

}

// ----------------------------------
// MAIN LOOP
// ----------------------------------

void loop() {

  unsigned long now = millis();

  // ==================================
  // 1. IR SENSOR - GPIO23
  // ==================================

  bool objectDetected =
      (digitalRead(IR_SENSOR) == OBJECT_DETECTED);

  if (objectDetected) {

    // Object detected: blink GPIO18

    if (now - lastIRBlinkTime >= BLINK_INTERVAL) {

      lastIRBlinkTime = now;

      irRelayState = !irRelayState;

      digitalWrite(
        RELAY_IN1,
        irRelayState ? RELAY_ON : RELAY_OFF
      );
    }

  } else {

    // No object: GPIO18 OFF

    digitalWrite(RELAY_IN1, RELAY_OFF);

    irRelayState = false;

  }

  // ==================================
  // 2. WI-FI CONNECTION - GPIO21
  // ==================================

  if (WiFi.status() == WL_CONNECTED) {

    // Wi-Fi connected: GPIO21 OFF

    digitalWrite(RELAY_IN2, RELAY_OFF);

    wifiRelayState = false;

    if (!wifiConnected) {

      wifiConnected = true;

      Serial.println("Wi-Fi CONNECTED!");

      Serial.print("IP Address: ");
      Serial.println(WiFi.localIP());

      Serial.println("IN2 OFF");

    }

  } else {

    wifiConnected = false;

    // IN2 blinks for the first 2 minutes

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

      // Two minutes elapsed: IN2 OFF

      digitalWrite(RELAY_IN2, RELAY_OFF);

      wifiRelayState = false;

    }

    // Retry Wi-Fi every 5 seconds

    if (now - lastReconnectTime >= RECONNECT_INTERVAL) {

      lastReconnectTime = now;

      Serial.println("Wi-Fi disconnected. Retrying...");

      WiFi.reconnect();

    }

  }

  delay(10);

}
