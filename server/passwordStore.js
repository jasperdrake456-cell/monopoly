'use strict';

const fs   = require('fs');
const path = require('path');

// Persist password to a file so it survives server restarts within the same deploy.
// On Railway, /tmp is writable. Falls back to the project root for local dev.
const PERSIST_FILE = process.env.PASSWORD_FILE || path.join('/tmp', 'game_password.json');

function readPersistedPassword() {
  try {
    const data = JSON.parse(fs.readFileSync(PERSIST_FILE, 'utf8'));
    if (data && data.password) return data.password;
  } catch {}
  return null;
}

function persistPassword(pw) {
  try {
    fs.writeFileSync(PERSIST_FILE, JSON.stringify({ password: pw }), 'utf8');
  } catch (e) {
    console.error('[passwordStore] Failed to write persist file:', e.message);
  }
}

// Priority: persisted file → GAME_PASSWORD env var → default
let currentPassword = readPersistedPassword() || process.env.GAME_PASSWORD || 'MrMoney';

const ADJECTIVES = [
  'Swift','Bold','Bright','Cool','Dark','Fast','Gold','Hot','Jade','Keen',
  'Loud','Mild','Nice','Odd','Pink','Rare','Slim','Tame','Warm','Wild',
  'Blue','Red','Green','Sharp','Grand','Brave','Calm','Fair','Free','Glad',
];
const NOUNS = [
  'Tiger','Eagle','Storm','Flame','Wave','Rock','Star','Moon','Wolf','Fox',
  'Bear','Hawk','Lion','Lynx','Owl','Puma','Raven','Snake','Shark','Elk',
  'Crane','Drake','Falcon','Gecko','Heron','Jaguar','Koala','Manta','Otter','Panda',
];

function generatePassword() {
  const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num  = String(Math.floor(Math.random() * 90) + 10); // 10–99
  return adj + noun + num;
}

function getPassword() {
  return currentPassword;
}

function setPassword(pw) {
  currentPassword = pw;
  persistPassword(pw);
}

module.exports = { getPassword, setPassword, generatePassword };
