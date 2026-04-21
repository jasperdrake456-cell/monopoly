'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE       = path.join(DATA_DIR, 'mysteryBox.json');
const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4-hour cooldown

// Reward pool — weighted random
const REWARDS = [
  { amount:       200, weight: 28, tier: 'common',    emoji: '💰', label: 'Small Loot'   },
  { amount:       750, weight: 22, tier: 'common',    emoji: '💵', label: 'Nice Find'    },
  { amount:     2_500, weight: 18, tier: 'uncommon',  emoji: '💎', label: 'Good Haul'    },
  { amount:     7_500, weight: 13, tier: 'uncommon',  emoji: '🔥', label: 'Hot Reward'   },
  { amount:    20_000, weight: 9,  tier: 'rare',      emoji: '⚡', label: 'Rare Score'   },
  { amount:    75_000, weight: 6,  tier: 'rare',      emoji: '🌟', label: 'Big Score'    },
  { amount:   250_000, weight: 3,  tier: 'epic',      emoji: '💥', label: 'Epic Jackpot' },
  { amount: 1_000_000, weight: 1,  tier: 'legendary', emoji: '👑', label: 'LEGENDARY'   },
];

const TOTAL_WEIGHT = REWARDS.reduce((s, r) => s + r.weight, 0);

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

function pickReward() {
  let rand = Math.random() * TOTAL_WEIGHT;
  for (const r of REWARDS) {
    rand -= r.weight;
    if (rand <= 0) return { ...r };
  }
  return { ...REWARDS[0] };
}

function getStatus(username) {
  const d    = read();
  const last = d[username]?.lastClaim || 0;
  const remaining = Math.max(0, COOLDOWN_MS - (Date.now() - last));
  return {
    canClaim:    remaining === 0,
    remaining,
    nextClaimAt: last + COOLDOWN_MS,
    lastReward:  d[username]?.lastReward || null,
  };
}

function claim(username) {
  const d    = read();
  const last = d[username]?.lastClaim || 0;
  if (Date.now() - last < COOLDOWN_MS) {
    return { ok: false, remaining: Math.max(0, COOLDOWN_MS - (Date.now() - last)) };
  }
  const reward = pickReward();
  d[username] = { lastClaim: Date.now(), lastReward: reward };
  write(d);
  return { ok: true, reward };
}

module.exports = { getStatus, claim, COOLDOWN_MS, REWARDS };
