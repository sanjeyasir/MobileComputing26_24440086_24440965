# Web Dashboard & Analytics Subsystem
### Toyo Cushion Lanka | Rubberised Coir Cutter Machine
**MCS4302 Mobile Computing Project**

---

## 📌 Overview
The Web Subsystem is an industrial dashboard starter built with **React 18**, **Vite**, **Ant Design**, and **Firebase**. It provides real-time monitoring of cutter machine operational state, cut counts, cycle durations, and idle stoppage alerts.

---

## 📁 Project Structure

```text
web/
├── public/
│   ├── favicon.svg
│   └── logo.png
│
├── src/
│   ├── components/
│   │   └── common/
│   │       └── MetricCard.jsx        # Reusable industrial KPI card
│   ├── pages/
│   │   └── CutterDashboard.jsx       # Interactive operational dashboard & simulator
│   ├── services/
│   │   ├── firebase/
│   │   │   └── config.js             # Firebase client configuration
│   │   └── cutterService.js          # API endpoints & cutter constants
│   ├── theme/
│   │   └── theme.js                  # Custom Ant Design theme tokens
│   ├── utils/
│   │   ├── timeZoneUtils.js          # Sri Lanka Standard Time (Asia/Colombo UTC+05:30)
│   │   └── wsnCalculations.js        # RSSI signal & OEE calculations
│   ├── App.jsx                       # Routing setup
│   ├── App.css & index.css           # Styling
│   └── main.jsx                      # Application entry point
│
├── .env                              # Environment configuration
├── .gitignore
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

---

## 🚀 Running the Web Application

```bash
cd web
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.
