// ==========================================
// Muhax Sniffer  v1.0
// WiFi / BLE reconnaissance app for Bruce
// Default device theme — no custom colors
// ==========================================
// Install: copy this file to /scripts on your Bruce
// device (SD card or WebUI upload), then launch it
// from the "Scripts" menu.

var dialog = require("dialog");
var storage = require("storage");
var wifi = require("wifi");
var device = require("device");

var APP_NAME = "Muhax Sniffer";
var APP_VERSION = "1.0";
var LOG_DIR = "/muhax_sniffer";

// ---------- generic helpers ----------

function padRight(str, len) {
  str = to_string(str);
  while (str.length < len) {
    str = str + " ";
  }
  if (str.length > len) {
    str = str.substr(0, len);
  }
  return str;
}

function timestamp() {
  return to_string(now());
}

function makePath(fsType, path) {
  return { fs: fsType, path: path };
}

// Ask the user where results should be saved.
// Returns "sd", "littlefs", or null if cancelled.
function chooseStorage() {
  var options = [
    ["SD Card", "sd"],
    ["LittleFS (internal)", "littlefs"],
  ];
  var selected = dialog.choice(options);
  return selected;
}

function ensureLogDir(fsType) {
  var ok = storage.mkdir(makePath(fsType, LOG_DIR));
  return ok;
}

// ---------- WiFi ----------

function countByEncryption(nets) {
  var openCount = 0;
  for (var i = 0; i < nets.length; i++) {
    if (nets[i].encryptionType === "OPEN") {
      openCount = openCount + 1;
    }
  }
  return openCount;
}

function buildWifiReport(nets) {
  var openCount = countByEncryption(nets);

  var lines = [];
  lines.push(APP_NAME + " v" + APP_VERSION + " - WiFi Scan");
  lines.push("Total networks : " + to_string(nets.length));
  lines.push("Open (no auth) : " + to_string(openCount));
  lines.push("");
  lines.push(padRight("SSID", 18) + padRight("ENC", 14) + "MAC");
  lines.push("--------------------------------------------");

  for (var i = 0; i < nets.length; i++) {
    var n = nets[i];
    var ssid = n.SSID.length === 0 ? "(hidden)" : n.SSID;
    lines.push(
      padRight(ssid, 18) + padRight(n.encryptionType, 14) + n.MAC
    );
  }

  return lines.join("\n");
}

function saveWifiCsv(nets, fsType) {
  ensureLogDir(fsType);
  var filePath = LOG_DIR + "/wifi_" + timestamp() + ".csv";
  var target = makePath(fsType, filePath);

  storage.write(target, "ssid,encryption,mac,scanned_at\n", "write");
  for (var i = 0; i < nets.length; i++) {
    var n = nets[i];
    var ssid = n.SSID.length === 0 ? "(hidden)" : n.SSID;
    storage.write(
      target,
      ssid + "," + n.encryptionType + "," + n.MAC + "," + timestamp() + "\n",
      "append"
    );
  }

  return filePath;
}

function runWifiScan() {
  // Scan first, no intermediate "scanning..." popup — this is what
  // caused the screen flicker (a quick redraw immediately followed
  // by another redraw for the results screen).
  var nets = wifi.scan();

  if (nets.length === 0) {
    dialog.warning("No networks found.", true);
    return;
  }

  var report = buildWifiReport(nets);
  dialog.viewText(report, APP_NAME + " - Results");

  var fsType = chooseStorage();
  if (fsType === null || fsType === undefined) {
    dialog.info("Not saved.", true);
  } else {
    var savedPath = saveWifiCsv(nets, fsType);
    dialog.success(
      "Saved to " + (fsType === "sd" ? "SD" : "LittleFS") + ": " + savedPath,
      true
    );
  }
}

// ---------- BLE ----------

function runBleScan() {
  dialog.warning(
    "BLE scanning is not yet exposed in the Bruce " +
      "JS API. Use the native BLE > BLE Scan menu " +
      "for now.",
    true
  );
}

// ---------- log browser ----------

function viewSavedLogs() {
  var fsType = chooseStorage();
  if (fsType === null || fsType === undefined) {
    return;
  }

  var dirPath = makePath(fsType, LOG_DIR);
  var files;
  try {
    files = storage.readdir(dirPath);
  } catch (e) {
    files = [];
  }

  if (!files || files.length === 0) {
    dialog.warning("No saved logs on this storage yet.", true);
    return;
  }

  var picked = dialog.choice(files);
  if (!picked) return;

  var filePath = makePath(fsType, LOG_DIR + "/" + picked);
  var content = storage.read(filePath);
  dialog.viewText(content, picked);
}

// ---------- about ----------

function showAbout() {
  var msg =
    APP_NAME +
    " v" +
    APP_VERSION +
    "\n" +
    "by MUHAX\n\n" +
    "Device: " +
    device.getName() +
    "\n" +
    "Board: " +
    device.getBoard() +
    "\n" +
    "Battery: " +
    to_string(device.getBatteryCharge()) +
    "%";
  dialog.message(msg, true);
}

// ---------- main ----------

function main() {
  var running = true;

  while (running) {
    var mode = dialog.choice([
      "WiFi Scan",
      "BLE Scan",
      "View Saved Logs",
      "About",
      "Exit",
    ]);

    if (mode === "WiFi Scan") {
      runWifiScan();
    } else if (mode === "BLE Scan") {
      runBleScan();
    } else if (mode === "View Saved Logs") {
      viewSavedLogs();
    } else if (mode === "About") {
      showAbout();
    } else {
      running = false;
    }
  }
}

main();
