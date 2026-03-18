'use strict';

const fs   = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'data', 'siteConfig.json');

const DEFAULT_CONFIG = {
  closedGames:      [],    // array of game slugs currently closed
  testingMode:      false, // when true, only approvedTesters (+ admin) can play
  approvedTesters:  [],    // array of usernames approved for testing mode
};

function readConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch { /* non-fatal */ }
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

function setTestingMode(enabled) {
  const cfg = readConfig();
  cfg.testingMode = !!enabled;
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

module.exports = { getConfig, setGameClosed, setTestingMode, addTester, removeTester };
