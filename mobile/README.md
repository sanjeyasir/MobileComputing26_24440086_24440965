# Mobile Application Subsystem
### Toyo Cushion Lanka | Rubberised Coir Fleece Cutting Machine
**MCS4302 Mobile Computing Project**

---

## 📌 Overview
The Mobile Subsystem is a cross-platform companion application built with **React Native (Expo SDK 51)** and **Firebase**. It provides floor managers, maintenance engineers, and machine operators at Toyo Cushion Lanka (Hayleys Group) with instantaneous machine status, cut metrics, idle downtime detection, and OEE indicators directly on mobile devices.

---

## ⚙️ Operational Mechanics & Blade Tracking

1. **Cut Detection Principle (Blade Leaves / Blade Arrives)**:
   - **Blade Leaves (`1 -> 0`)**: Triggered when the cutting blade initiates its descent. If in idle/downtime, it immediately transitions machine status back to **`RUNNING / OPERATIONAL`** and starts the stroke cycle timer.
   - **Blade Arrives (`0 -> 1`)**: Triggered when the blade returns to top origin. Each completed stroke produces 2 cuts of coir fleece sheets and increments the hourly production bucket.

2. **2-Minute Inactivity Watchdog**:
   - If no stroke activity occurs for **> 120 seconds**, the machine transitions to **`IDLE / DOWNTIME`** and logs a downtime incident in Firestore.

3. **OEE Metrics**:
   - **Availability (A)**: $\frac{\text{Actual Operating Uptime (mins)}}{1,440} \times 100\%$
   - **Performance (P)**: $\frac{\text{Actual Cuts}}{\text{Rated Standard Target Capacity}} \times 100\%$
   - **Quality (Q)**: 100% conforming baseline.
   - **OEE**: $\text{Availability} \times \text{Performance} \times \text{Quality}$

---

## 📱 Features & Screens

- **DashboardScreen**: Real-time machine operational badge, cycle countdown banner, total cuts today, and live 24h hourly bar charts.
- **SignalControllerScreen**: In-app signal simulator for testing `POST 1` and `POST 2` events and adjusting the idle threshold parameter.
- **ApiPerformanceScreen**: API latency metrics, network response times, and connection health diagnostics.
- **ExcelReportsScreen & PdfReportsScreen**: On-demand viewing and exporting of historical 4-sheet daily shift reports stored in Firestore.
- **MachineInfoScreen**: Machine serial numbers, specifications, operating limits, and calibration values.
- **LoginScreen**: Secure authentication for authorized supervisors and operators.

---

## 🏗️ Tech Stack

- **Framework**: React Native 0.74, Expo SDK 51
- **Navigation**: React Navigation (Bottom Tabs & Native Stack)
- **Backend / Database**: Firebase (Cloud Firestore & Authentication)
- **Styling & Assets**: Responsive scaling utilities, LinearGradient, custom theme tokens
- **Build & Distribution**: Expo CLI & EAS Build (Android APK / AAB)

---

## 📁 Directory Structure

```text
mobile/
├── assets/                     # App icons, splash screens, and corporate logo
│   ├── adaptive-icon.png
│   ├── favicon.png
│   ├── icon.png
│   ├── logo.png
│   └── splash.png
│
├── src/                        # React Native source code
│   ├── components/             # Reusable UI widgets
│   │   ├── AppLogo.jsx
│   │   ├── BrandHeader.jsx
│   │   ├── DailyCutVolumeLineGraph.jsx
│   │   ├── DowntimeLogCard.jsx
│   │   ├── HourlyBarChart.jsx
│   │   ├── IdleCountdownBanner.jsx
│   │   └── OeeGaugeCard.jsx
│   │
│   ├── context/                # CutterContext state provider
│   │   └── CutterContext.js
│   │
│   ├── screens/                # Mobile application screens
│   │   ├── DashboardScreen.jsx
│   │   ├── SignalControllerScreen.jsx
│   │   ├── ApiPerformanceScreen.jsx
│   │   ├── ExcelReportsScreen.jsx
│   │   ├── PdfReportsScreen.jsx
│   │   ├── MachineInfoScreen.jsx
│   │   └── LoginScreen.jsx
│   │
│   ├── services/               # API & Firebase services
│   │   ├── cutterApiService.js
│   │   └── firebaseConfig.js
│   │
│   ├── theme/                  # Color palette & styling definitions
│   │   └── colors.js
│   │
│   └── utils/                  # Screen scaling & timezone helpers
│       ├── responsive.js
│       └── timeZoneUtils.js
│
├── App.js                      # Root application component & navigation setup
├── app.json                    # Expo configuration & app metadata
├── babel.config.js             # Babel compiler settings
├── eas.json                    # Expo Application Services build profile
├── metro.config.js             # Metro bundler configuration
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or v20)
- [Expo Go](https://expo.dev/client) app installed on your physical mobile device, or an Android/iOS emulator.

### 1. Install Dependencies
```bash
cd mobile
npm install
```

### 2. Start the Development Server
```bash
npm start
# or: npx expo start
```
- Press `a` to open in Android Emulator.
- Press `w` to open in Web Browser.
- Scan the QR code with **Expo Go** on an Android device to test on physical hardware.

### 3. Build APK for Android
```bash
npm run build:android
```
