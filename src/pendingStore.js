const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "..", "data");
const PENDING_PATH = path.join(DATA_DIR, "pending.json");

// شكل البيانات:
// {
//   [messageId]: {
//     guildId: string,
//     channelId: string,
//     createdAtMs: number,
//     endsAtMs: number
//   }
// }

function ensurePendingFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PENDING_PATH)) fs.writeFileSync(PENDING_PATH, JSON.stringify({}, null, 2), "utf8");
}

function readPending() {
  ensurePendingFile();
  const raw = fs.readFileSync(PENDING_PATH, "utf8");
  try {
    return JSON.parse(raw || "{}");
  } catch {
    fs.writeFileSync(PENDING_PATH, JSON.stringify({}, null, 2), "utf8");
    return {};
  }
}

function writePending(pending) {
  ensurePendingFile();
  fs.writeFileSync(PENDING_PATH, JSON.stringify(pending, null, 2), "utf8");
}

function upsertPending(messageId, record) {
  const all = readPending();
  all[messageId] = record;
  writePending(all);
}

function removePending(messageId) {
  const all = readPending();
  if (all[messageId]) {
    delete all[messageId];
    writePending(all);
  }
}

module.exports = {
  readPending,
  upsertPending,
  removePending,
};

