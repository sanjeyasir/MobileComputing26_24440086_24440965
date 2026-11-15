
#include <WiFi.h>

const char* ssid = "toyo_cutter_1";
const char* password = "4650240D";

#define LED_PIN 2

void setup() {

  Serial.begin(115200);
  delay(500);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Disconnect previous Wi-Fi connection
  WiFi.disconnect(true);
  delay(500);

  // Set Wi-Fi station mode
  WiFi.mode(WIFI_STA);

  // --------------------------------
  // SCAN AVAILABLE WIFI NETWORKS
  // --------------------------------

  Serial.println();
  Serial.println("--------------------------------");
  Serial.println("AVAILABLE WIFI NETWORKS");
  Serial.println("--------------------------------");

  int networks = WiFi.scanNetworks();

  if (networks == 0) {

    Serial.println("No networks found.");

  } else {

    Serial.print(networks);
    Serial.println(" networks found.");

    for (int i = 0; i < networks; i++) {

      Serial.println();

      Serial.print(i + 1);
      Serial.print(". SSID: ");
      Serial.println(WiFi.SSID(i));

      Serial.print("   Signal: ");
      Serial.print(WiFi.RSSI(i));
      Serial.println(" dBm");

      Serial.print("   Security: ");

      if (WiFi.encryptionType(i) == WIFI_AUTH_OPEN) {
        Serial.println("Open");
      } else {
        Serial.println("Protected");
      }
    }
  }

  WiFi.scanDelete();

  // --------------------------------
  // CONNECT TO SPECIFIC WIFI
  // --------------------------------

  Serial.println();
  Serial.println("--------------------------------");
  Serial.println("CONNECTING TO WIFI...");
  Serial.println("--------------------------------");

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {

    digitalWrite(LED_PIN, HIGH);
    delay(300);

    digitalWrite(LED_PIN, LOW);
    delay(300);

    Serial.print(".");
  }

  // Connected - LED stays ON
  digitalWrite(LED_PIN, HIGH);

  Serial.println();
  Serial.println("WIFI CONNECTED!");

  Serial.print("Connected SSID: ");
  Serial.println(WiFi.SSID());

  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  Serial.print("Signal Strength: ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");
}

void loop() {
}