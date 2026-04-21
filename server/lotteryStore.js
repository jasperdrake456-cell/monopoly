'use strict';
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE       = path.join(DATA_DIR, 'lottery.json');

const TICKET_PRICE = 500;   // $500 per ticket
const MAX_TICKETS  = 5;     // max per player per draw
const JACKPOT_SEED = 75_000; // seed for each new day

// ── Pacific time helpers ──────────────────────────────────────────────────────

function getPacificOffset(date) {
  // DST: 2nd Sunday in March → 1st Sunday in November = PDT (UTC-7), else PST (UTC-8)
  const y = date.getUTCFullYear();
  const march = new Date(Date.UTC(y, 2, 1));
  const dstStart = new Date(march.getTime() + (((14 - march.getUTCDay()) % 7) || 7) * 86400000);
  const nov = new Date(Date.UTC(y, 10, 1));
  const dstEnd   = new Date(nov.getTime() + ((7 - nov.getUTCDay()) % 7) * 86400000);
  return (date >= dstStart && date < dstEnd) ? -7 : -8;
}

function toPacific(date) {
  return new Date(date.getTime() + getPacificOffset(date) * 3_600_000);
}

function todayKeyPacific(date) {
  return toPacific(date || new Date()).toISOString().slice(0, 10);
}

// Returns UTC ms timestamp of the next noon Pacific
function getNextDrawAt() {
  const now      = new Date();
  const offset   = getPacificOffset(now);
  const pacific  = toPacific(now);

  // Noon Pacific today
  const noon = new Date(pacific);
  noon.setHours(12, 0, 0, 0);
  // If we're past noon (or within 2 min tolerance) → use tomorrow
  if (pacific.getTime() >= noon.getTime() - 120_000) {
    noon.setDate(noon.getDate() + 1);
  }
  // Convert back to UTC
  return noon.getTime() - offset * 3_600_000;
}

// ── File helpers ──────────────────────────────────────────────────────────────

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch {
    return {
      day: todayKeyPacific(), tickets: [], drawn: false, winner: null,
      jackpot: JACKPOT_SEED, history: [],
    };
  }
}

function write(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}

function maybeRollOver(data, today) {
  if (data.day === today) return false; // same day — no rollover needed

  // Archive old day to history (regardless of whether it was drawn)
  if (!data.drawn && data.tickets.length > 0) {
    // Carry 50% of jackpot to next day (never drawn carry-over)
    const carry = Math.floor(data.jackpot * 0.5);
    data.history = [{
      day: data.day, winner: null, tickets: data.tickets.length,
      jackpot: data.jackpot, note: 'No draw (server down)',
    }, ...(data.history || [])].slice(0, 30);
    data.jackpot = JACKPOT_SEED + carry;
  } else if (data.drawn) {
    data.history = [{
      day: data.day, winner: data.winner, tickets: data.tickets.length,
      jackpot: data.jackpot,
    }, ...(data.history || [])].slice(0, 30);
    data.jackpot = JACKPOT_SEED;
  } else {
    // No tickets, no draw
    data.history = [{
      day: data.day, winner: null, tickets: 0, jackpot: data.jackpot, note: 'No tickets sold',
    }, ...(data.history || [])].slice(0, 30);
    data.jackpot = JACKPOT_SEED;
  }

  data.day     = today;
  data.tickets = [];
  data.drawn   = false;
  data.winner  = null;
  return true;
}

// ── Public API ────────────────────────────────────────────────────────────────

function getStatus() {
  const data  = read();
  const today = todayKeyPacific();
  const rolled = maybeRollOver(data, today);
  if (rolled) write(data);

  // Summarise participants (username → count)
  const participantMap = {};
  for (const t of data.tickets) {
    participantMap[t.username] = (participantMap[t.username] || 0) + 1;
  }
  const participants = Object.entries(participantMap)
    .map(([username, count]) => ({ username, count }))
    .sort((a, b) => b.count - a.count);

  return {
    day:         data.day,
    tickets:     data.tickets.length,
    jackpot:     data.jackpot,
    drawn:       data.drawn,
    winner:      data.winner,
    ticketPrice: TICKET_PRICE,
    maxTickets:  MAX_TICKETS,
    nextDrawAt:  getNextDrawAt(),
    participants,
    history:     (data.history || []).slice(0, 10),
  };
}

function buyTicket(username) {
  const data  = read();
  const today = todayKeyPacific();
  maybeRollOver(data, today);

  if (data.drawn) return { ok: false, error: "Today's draw has already happened — come back tomorrow!" };

  const userTickets = data.tickets.filter(t => t.username === username).length;
  if (userTickets >= MAX_TICKETS) return { ok: false, error: `You already have the max ${MAX_TICKETS} tickets for today` };

  const ticketNum = crypto.randomInt(1000, 9999); // 4-digit lucky number
  const ticketId  = `${ticketNum}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  data.tickets.push({ ticketId, ticketNum, username, boughtAt: Date.now() });
  data.jackpot += Math.floor(TICKET_PRICE * 0.8); // 80% to jackpot
  write(data);

  const newCount = userTickets + 1;
  const odds     = data.tickets.length > 0 ? ((newCount / data.tickets.length) * 100).toFixed(1) : 100;
  return { ok: true, ticketId, ticketNum, jackpot: data.jackpot, myTickets: newCount, odds };
}

function getUserTickets(username) {
  const data  = read();
  const today = todayKeyPacific();
  maybeRollOver(data, today);
  return data.tickets.filter(t => t.username === username);
}

function drawWinner() {
  const data  = read();
  const today = todayKeyPacific();
  maybeRollOver(data, today);

  if (data.drawn) return { alreadyDrawn: true, winner: data.winner };

  data.drawn = true;

  if (data.tickets.length === 0) {
    data.winner = null;
    // Roll unused jackpot to tomorrow (50% carry)
    const carry = Math.floor(data.jackpot * 0.5);
    data.history = [{
      day: data.day, winner: null, tickets: 0, jackpot: data.jackpot, note: 'No tickets sold',
    }, ...(data.history || [])].slice(0, 30);
    write(data);
    return { winner: null, jackpot: data.jackpot, carry };
  }

  const idx    = crypto.randomInt(data.tickets.length);
  const ticket = data.tickets[idx];
  const win    = { username: ticket.username, ticketId: ticket.ticketId, ticketNum: ticket.ticketNum, jackpot: data.jackpot };
  data.winner  = win;
  data.history = [{
    day: data.day, winner: win, tickets: data.tickets.length, jackpot: data.jackpot,
  }, ...(data.history || [])].slice(0, 30);
  write(data);
  return { winner: ticket.username, ticketId: ticket.ticketId, ticketNum: ticket.ticketNum, jackpot: data.jackpot };
}

// Called every minute by server — returns result only if it just drew
function autoDrawIfTime() {
  const now    = new Date();
  const pac    = toPacific(now);
  const h      = pac.getHours();
  const m      = pac.getMinutes();
  if (h !== 12 || m !== 0) return null; // not noon Pacific

  const data  = read();
  const today = todayKeyPacific();
  maybeRollOver(data, today);
  if (data.drawn) return null; // already drawn today

  return drawWinner();
}

module.exports = {
  getStatus, buyTicket, getUserTickets, drawWinner, autoDrawIfTime,
  TICKET_PRICE, MAX_TICKETS, getNextDrawAt,
};
