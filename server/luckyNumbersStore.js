'use strict';
// Lucky Numbers: each day, 5 random numbers (1-36) are drawn.
// Betting on them in Roulette gives double XP.
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'luckyNumbers.json');

function dayKey() {
  return new Date().toDateString();
}

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return {}; }
}
function write(d) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, FILE);
}

/** Get today's 5 lucky numbers, generating them if needed. */
function getTodaysNumbers() {
  const today = dayKey();
  const d     = read();
  if (d.date === today && d.numbers?.length === 5) return d.numbers;

  // Generate 5 unique random numbers between 1 and 36
  const nums = [];
  while (nums.length < 5) {
    const n = Math.floor(Math.random() * 36) + 1;
    if (!nums.includes(n)) nums.push(n);
  }
  nums.sort((a, b) => a - b);
  write({ date: today, numbers: nums, generatedAt: Date.now() });
  return nums;
}

/** Returns true if `number` is in today's lucky numbers. */
function isLucky(number) {
  return getTodaysNumbers().includes(Number(number));
}

module.exports = { getTodaysNumbers, isLucky };
