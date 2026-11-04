
#define RELAY_PIN 18

void setup() {
  pinMode(RELAY_PIN, OUTPUT);

  // Relay OFF (active LOW)
  digitalWrite(RELAY_PIN, HIGH);
}

void loop() {
  // Relay ON
  digitalWrite(RELAY_PIN, LOW);
  delay(1000);

  // Relay OFF
  digitalWrite(RELAY_PIN, HIGH);
  delay(1000);
}
