'use strict';

const fs   = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'data', 'siteConfig.json');

const DEFAULT_CONFIG = {
  closedGames:      [],    // array of game slugs currently closed
  testingGames:     [],    // array of game slugs in testing mode (testers-only)
  approvedTesters:  [],    // array of usernames approved for all testing-mode games
};

let _cache = null;

function readConfig() {
  if (_cache) return _cache;
  const raw = (() => {
    try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
    catch { return {}; }
  })();
  const out = { ...DEFAULT_CONFIG, ...raw };
  if (typeof out.testingMode !== 'undefined') delete out.testingMode;
  if (!Array.isArray(out.testingGames)) out.testingGames = [];
  _cache = out;
  return _cache;
}

function writeConfig(cfg) {
  _cache = cfg;
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg), 'utf8'); }
  catch { /* non-fatal */ }
}

function getConfig() {
  return readConfig();
}

function setGameClosed(slug, closed) {
  const cfg = readConfig();
  if (closed) {
    if (!cfg.closedGames.includes(slug)) cfg.closedGames.push(slug);
  } else {
    cfg.closedGames = cfg.closedGames.filter(s => s !== slug);
  }
  writeConfig(cfg);
}

function setGameTesting(slug, inTest) {
  const cfg = readConfig();
  if (inTest) {
    if (!cfg.testingGames.includes(slug)) cfg.testingGames.push(slug);
  } else {
    cfg.testingGames = cfg.testingGames.filter(s => s !== slug);
  }
  writeConfig(cfg);
}

function addTester(username) {
  const cfg = readConfig();
  if (!cfg.approvedTesters.includes(username)) {
    cfg.approvedTesters.push(username);
    writeConfig(cfg);
  }
}

function removeTester(username) {
  const cfg = readConfig();
  cfg.approvedTesters = cfg.approvedTesters.filter(u => u !== username);
  writeConfig(cfg);
}

module.exports = { getConfig, setGameClosed, setGameTesting, addTester, removeTester };
