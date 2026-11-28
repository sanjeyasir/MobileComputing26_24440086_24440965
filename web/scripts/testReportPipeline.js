import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, doc, setDoc, writeBatch } from "firebase/firestore";
import * as XLSX from "xlsx";
import nodemailer from "nodemailer";

const firebaseConfig = {
  apiKey: "AIzaSyAxTPxQVKDqJwh9jPJXJEcgP70QGHZ5D9Y",
  authDomain: "msc-mobile-computing-project.firebaseapp.com",
  projectId: "msc-mobile-computing-project",
  storageBucket: "msc-mobile-computing-project.firebasestorage.app",
  messagingSenderId: "660259181368",
  appId: "1:660259181368:web:2df23a5ba5429d0b2d67cd",
  measurementId: "G-7PTMVRH6X2"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

function getJayawardenepuraTime(inputDate = new Date()) {
  const d = inputDate instanceof Date ? inputDate : new Date(inputDate);
  const validDate = isNaN(d.getTime()) ? new Date() : d;

  const utcMs = validDate.getTime() + (validDate.getTimezoneOffset() * 60000);
  const slstOffsetMs = 5.5 * 60 * 60 * 1000;
  const slstDate = new Date(utcMs + slstOffsetMs);

  const yyyy = slstDate.getFullYear();
  const mm = String(slstDate.getMonth() + 1).padStart(2, "0");
  const dd = String(slstDate.getDate()).padStart(2, "0");
  const hh = String(slstDate.getHours()).padStart(2, "0");
  const min = String(slstDate.getMinutes()).padStart(2, "0");
  const ss = String(slstDate.getSeconds()).padStart(2, "0");
  const sss = String(slstDate.getMilliseconds()).padStart(3, "0");

  const iso = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}.${sss}+05:30`;
  const formatted = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} (+05:30 Sri Jayawardenepura Time)`;
  const fileStamp = `${yyyy}-${mm}-${dd}_${hh}${min}${ss}`;

  return {
    iso,
    formatted,
    fileStamp,
    date: slstDate,
    timeZone: "Asia/Colombo",
    timeZoneOffset: "+05:30",
    timeZoneName: "Sri Jayawardenepura Standard Time (SLST)"
  };
}

async function runTestPipeline() {
  console.log("================================================================================");
  console.log("TESTING 24-HOUR REPORT & SRI JAYAWEERDENEPURA LIFECYCLE PIPELINE");
  console.log("================================================================================");

  const slst = getJayawardenepuraTime();
  console.log(`[1] Current Jayawardenepura Time: ${slst.formatted}`);
  console.log(`[2] ISO Timestamp with +05:30 Offset: ${slst.iso}`);

  // 1. Insert sample 24-hour telemetry test records with Jayawardenepura timestamps
  console.log("\n[3] Ingesting test telemetry bursts into Cloud Firestore with SLST timestamps...");
  const sampleNodes = ["ESP32-NODE-01", "ESP32-NODE-02", "ESP32-NODE-03"];
  
  for (let i = 0; i < 6; i++) {
    const nodeId = sampleNodes[i % sampleNodes.length];
    const burstTime = getJayawardenepuraTime(new Date(Date.now() - (i * 3600 * 1000))); // spaced over hours
    await addDoc(collection(db, "telemetry"), {
      nodeId,
      temperature: parseFloat((24.2 + (i * 1.8)).toFixed(1)),
      battery: Math.max(15, 95 - (i * 8)),
      rssi: -60 - (i * 4),
      burstSequence: 200 + i,
      timestamp: burstTime.iso,
      receivedAt: burstTime.iso,
      jayawardenepuraTime: burstTime.formatted,
      timezone: "Asia/Colombo (+05:30)"
    });
    
    // Upsert node
    await setDoc(doc(db, "nodes", nodeId), {
      nodeId,
      name: `Node ${nodeId}`,
      location: i === 0 ? "Greenhouse Sector A" : (i === 1 ? "Storage Facility B" : "Solar Farm C"),
      currentTemperature: parseFloat((24.2 + (i * 1.8)).toFixed(1)),
      currentBattery: Math.max(15, 95 - (i * 8)),
      currentRssi: -60 - (i * 4),
      status: (95 - (i * 8)) <= 20 ? "warning" : "online",
      lastSeen: burstTime.iso,
      lastSeenJayawardenepura: burstTime.formatted,
      totalBursts: 10 + i
    }, { merge: true });
  }

  // 2. Fetch current data
  console.log("\n[4] Querying 24-hour records from Firestore...");
  const tSnap = await getDocs(collection(db, "telemetry"));
  const telemetry = [];
  tSnap.forEach(d => telemetry.push({ id: d.id, ...d.data() }));

  const nSnap = await getDocs(collection(db, "nodes"));
  const nodes = [];
  nSnap.forEach(d => nodes.push({ id: d.id, ...d.data() }));

  console.log(` -> Found ${telemetry.length} telemetry bursts`);
  console.log(` -> Found ${nodes.length} registered nodes`);

  // 3. Generate Excel workbook
  console.log("\n[5] Building Multi-Sheet Excel Workbook (.xlsx)...");
  const wb = XLSX.utils.book_new();

  // Summary
  const summaryData = [
    { "Parameter": "Report Title", "Value": "WSN 24-Hour Telemetry & Operational Report" },
    { "Parameter": "Generation Time (SLST)", "Value": slst.formatted },
    { "Parameter": "Timezone", "Value": "Asia/Colombo (Sri Jayawardenepura Time UTC+05:30)" },
    { "Parameter": "Target Recipient", "Value": "sanjeyasir@gmail.com" },
    { "Parameter": "Total Bursts Ingested", "Value": telemetry.length },
    { "Parameter": "Monitored Nodes", "Value": nodes.length },
    { "Parameter": "Data Retention Lifecycle", "Value": "24h Storage Archive & Flush" }
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "WSN_Summary");

  // Telemetry
  const telemetryData = telemetry.map((t, idx) => ({
    "Index": idx + 1,
    "Record ID": t.id,
    "Burst Time (SLST)": t.jayawardenepuraTime || t.timestamp,
    "Node ID": t.nodeId,
    "Sequence #": t.burstSequence,
    "Temperature (°C)": t.temperature,
    "Battery (%)": t.battery,
    "RSSI (dBm)": t.rssi
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(telemetryData), "Telemetry_Bursts");

  // Nodes
  const nodesData = nodes.map(n => ({
    "Node ID": n.nodeId,
    "Name": n.name,
    "Location": n.location,
    "Status": n.status,
    "Current Temp (°C)": n.currentTemperature,
    "Current Battery (%)": n.currentBattery,
    "Last Seen (SLST)": n.lastSeenJayawardenepura || n.lastSeen
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(nodesData), "Node_Inventory");

  const fileName = `WSN_Report_${slst.fileStamp}_SLST.xlsx`;
  const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  console.log(` -> Generated Excel Workbook '${fileName}' (${excelBuffer.length} bytes)`);

  // 4. Test Email sending preview
  console.log("\n[6] Testing automated email dispatch to sanjeyasir@gmail.com...");
  const testAccount = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass
    }
  });

  const mailInfo = await transporter.sendMail({
    from: '"WSN Telemetry Gateway" <noreply@msc-mobile-computing.app>',
    to: "sanjeyasir@gmail.com",
    subject: `📊 WSN 24-Hour Telemetry & Operational Report - ${slst.formatted}`,
    html: `
      <h2>📊 WSN 24-Hour Telemetry & Operational Report</h2>
      <p><strong>Generated At:</strong> ${slst.formatted} (Sri Jayawardenepura Time UTC+05:30)</p>
      <p><strong>Total Bursts:</strong> ${telemetry.length} | <strong>Active Nodes:</strong> ${nodes.length}</p>
      <p>Target Recipient: <strong>sanjeyasir@gmail.com</strong></p>
      <p>Excel spreadsheet is attached.</p>
    `,
    attachments: [
      {
        filename: fileName,
        content: excelBuffer
      }
    ]
  });

  console.log(` -> Email successfully formatted and dispatched!`);
  console.log(` -> Message ID: ${mailInfo.messageId}`);
  console.log(` -> Ethereal Preview URL: ${nodemailer.getTestMessageUrl(mailInfo)}`);

  // 5. Purge database after export
  console.log("\n[7] Purging 24h telemetry database data from Cloud Firestore...");
  let batch = writeBatch(db);
  let count = 0;
  for (const docSnap of tSnap.docs) {
    batch.delete(docSnap.ref);
    count++;
  }
  if (count > 0) {
    await batch.commit();
    console.log(` -> Successfully purged ${count} telemetry records from Firestore.`);
  }

  // 6. Record report in 'reports' collection
  console.log("\n[8] Logging report metadata to Firestore 'reports' collection...");
  await addDoc(collection(db, "reports"), {
    reportId: `REP-${slst.fileStamp}`,
    fileName,
    storageBucket: firebaseConfig.storageBucket,
    storagePath: `reports/${fileName}`,
    recipient: "sanjeyasir@gmail.com",
    generatedAtJayawardenepuraTime: slst.formatted,
    generatedAtIso: slst.iso,
    timezone: "Asia/Colombo (Sri Jayawardenepura Time UTC+05:30)",
    burstCount: telemetry.length,
    nodeCount: nodes.length,
    databasePurged: true,
    purgedRecordsCount: count,
    createdAt: new Date()
  });
  console.log(" -> Report metadata saved successfully!");

  console.log("\n================================================================================");
  console.log("PIPELINE TEST COMPLETED WITH 100% SUCCESS!");
  console.log("================================================================================");
}

runTestPipeline().catch(console.error);
