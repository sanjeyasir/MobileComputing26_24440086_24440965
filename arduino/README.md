# Arduino / IoT Subsystem

## Overview
This directory contains the embedded firmware and hardware documentation for the IoT monitoring unit installed on the Rubberised Coir Cutter Machine at Toyo Cushion Lanka.

## Responsibilities
- Interfacing with physical sensors (e.g., ultrasonic/time-of-flight distance sensors, rotary encoders, limit switches).
- Real-time calculation of block dimensions (length, width, height) and cut volume.
- Edge filtering and data packet assembly.
- Data transmission over Wi-Fi / MQTT / HTTPS to cloud backend services.

## Directory Structure
- `src/` - Microcontroller source code (`.ino`, `.cpp`, `.h`)
- `schematics/` - Circuit diagrams, pinout configurations, and wiring guides
- `libraries/` - Custom or external library dependencies

