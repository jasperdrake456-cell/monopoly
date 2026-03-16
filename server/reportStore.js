'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR    = process.env.DATA_DIR || path.join(__dirname, 'data');
const REPORT_FILE = path.join(DATA_DIR, 'reports.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(REPORT_FILE)) fs.writeFileSync(REPORT_FILE, '[]', 'utf8');

function readReports() {
  try { return JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8')); }
  catch { return []; }
}

function writeReports(reports) {
  fs.writeFileSync(REPORT_FILE, JSON.stringify(reports, null, 2), 'utf8');
}

function addReport({ gameId, entryName, entryScore, reason }) {
  const reports = readReports();
  const report = {
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    gameId,
    entryName,
    entryScore,
    reason: (reason || '').trim().slice(0, 200),
    createdAt: new Date().toISOString(),
    reviewed: false,
  };
  reports.push(report);
  writeReports(reports);
  return report;
}

function getReports() {
  return readReports().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function deleteReport(id) {
  const reports = readReports().filter(r => r.id !== id);
  writeReports(reports);
}

function markReviewed(id) {
  const reports = readReports().map(r => r.id === id ? { ...r, reviewed: true } : r);
  writeReports(reports);
}

// Remove a leaderboard entry by name in a specific game
function removeLeaderboardEntry(gameId, entryName, lb) {
  const updated = (lb.getLeaderboard(gameId) || []).filter(e => e.name !== entryName);
  // Directly overwrite store entry via leaderboard module
  return updated;
}

module.exports = { addReport, getReports, deleteReport, markReviewed };
