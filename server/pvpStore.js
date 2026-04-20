'use strict';
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'pvp.json');

const CHALLENGE_TTL = 5 * 60 * 1000; // 5 minutes to accept
const MIN_BET = 500;
const MAX_BET = 5_000_000;

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { challenges: [] }; }
}

function write(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  // Only keep last 200 finished + all open challenges
  data.challenges = data.challenges
    .filter(c => c.status === 'open' || Date.now() - c.createdAt < 86400000)
    .slice(0, 200);
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}

function pruneExpired(data) {
  const now = Date.now();
  data.challenges.forEach(c => {
    if (c.status === 'open' && now - c.createdAt > CHALLENGE_TTL) {
      c.status = 'expired';
    }
  });
}

function createChallenge(challenger, opponent, amount) {
  if (amount < MIN_BET) return { ok: false, error: `Minimum challenge is $${MIN_BET.toLocaleString()}` };
  if (amount > MAX_BET) return { ok: false, error: `Maximum challenge is $${MAX_BET.toLocaleString()}` };

  const data = read();
  pruneExpired(data);

  // Can't have more than 1 open challenge at a time
  const existing = data.challenges.find(c => c.challenger === challenger && c.status === 'open');
  if (existing) return { ok: false, error: 'You already have an open challenge' };

  const id = crypto.randomBytes(6).toString('hex');
  data.challenges.push({
    id,
    challenger,
    opponent:    opponent || null, // null = open challenge (anyone can accept)
    amount,
    status:      'open',
    createdAt:   Date.now(),
    result:      null,
    winner:      null,
  });
  write(data);
  return { ok: true, id, amount };
}

function acceptChallenge(id, acceptor) {
  const data = read();
  pruneExpired(data);

  const c = data.challenges.find(x => x.id === id);
  if (!c)                       return { ok: false, error: 'Challenge not found' };
  if (c.status !== 'open')      return { ok: false, error: 'Challenge is no longer open' };
  if (c.challenger === acceptor) return { ok: false, error: 'Cannot accept your own challenge' };
  if (c.opponent && c.opponent !== acceptor) return { ok: false, error: 'This challenge is not for you' };

  // Flip coin
  const flip   = Math.random() < 0.5 ? 'heads' : 'tails';
  const winner = flip === 'heads' ? c.challenger : acceptor;
  const loser  = winner === c.challenger ? acceptor : c.challenger;

  c.status     = 'done';
  c.acceptor   = acceptor;
  c.flip       = flip;
  c.winner     = winner;
  c.loser      = loser;
  c.settledAt  = Date.now();
  c.result     = { flip, winner, loser };

  write(data);
  return { ok: true, winner, loser, flip, amount: c.amount, id };
}

function cancelChallenge(id, username) {
  const data = read();
  const c    = data.challenges.find(x => x.id === id);
  if (!c)                        return { ok: false, error: 'Not found' };
  if (c.challenger !== username) return { ok: false, error: 'Not your challenge' };
  if (c.status !== 'open')       return { ok: false, error: 'Already resolved' };
  c.status = 'cancelled';
  write(data);
  return { ok: true };
}

function getOpenChallenges() {
  const data = read();
  pruneExpired(data);
  return data.challenges.filter(c => c.status === 'open').sort((a, b) => b.createdAt - a.createdAt);
}

function getRecentResults(limit = 20) {
  const data = read();
  return data.challenges
    .filter(c => c.status === 'done')
    .sort((a, b) => b.settledAt - a.settledAt)
    .slice(0, limit);
}

function getUserChallenges(username) {
  const data = read();
  return data.challenges
    .filter(c => c.challenger === username || c.acceptor === username || c.opponent === username)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 30);
}

module.exports = {
  createChallenge, acceptChallenge, cancelChallenge,
  getOpenChallenges, getRecentResults, getUserChallenges,
  MIN_BET, MAX_BET,
};
