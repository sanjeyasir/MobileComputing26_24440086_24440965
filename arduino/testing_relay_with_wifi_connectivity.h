
#include <WiFi.h>

#define RELAY_PIN 18

const char* ssid = "YOUR_WIFI_NAME";
const char* password = "YOUR_WIFI_PASSWORD";

void setup() {
  Serial.begin(115200);

  pinMode(RELAY_PIN, OUTPUT);

  // Relay OFF (active LOW)
  digitalWrite(RELAY_PIN, HIGH);

  // Connect to WiFi
  WiFi.begin(ssid, password);

  Serial.print("Connecting to WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi Connected!");

  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

void loop() {

  if (WiFi.status() == WL_CONNECTED) {
    // Relay ON
    digitalWrite(RELAY_PIN, LOW);
    Serial.println("WiFi Connected - Relay ON");
  } 
  else {
    // Relay OFF
    digitalWrite(RELAY_PIN, HIGH);
    Serial.println("WiFi Disconnected - Relay OFF");

    WiFi.reconnect();
  }

  delay(1000);
}
