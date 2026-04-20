'use strict';
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE       = path.join(DATA_DIR, 'lottery.json');

const TICKET_PRICE = 500;   // $500 per ticket
const MAX_TICKETS  = 10;    // max per player per week
const JACKPOT_SEED = 100_000; // starts at $100k, grows with ticket sales

function sundayUTC() {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun
  const diff = 7 - day;
  const sun = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (day === 0 ? 0 : diff)));
  return sun.toISOString().slice(0, 10);
}

function thisWeekKey() {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return mon.toISOString().slice(0, 10);
}

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { week: thisWeekKey(), tickets: [], drawn: false, winner: null, jackpot: JACKPOT_SEED, history: [] }; }
}

function write(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}

function getStatus() {
  const data = read();
  const week = thisWeekKey();
  if (data.week !== week && !data.drawn) {
    // New week, reset
    if (data.tickets.length > 0 && !data.drawn) {
      // Move to history without drawing (edge case)
      data.history = [{ week: data.week, tickets: data.tickets, drawn: false, winner: null, jackpot: data.jackpot }, ...(data.history || [])].slice(0, 10);
    }
    data.week    = week;
    data.tickets = [];
    data.drawn   = false;
    data.winner  = null;
    data.jackpot = JACKPOT_SEED;
    write(data);
  }
  return {
    week:        data.week,
    tickets:     data.tickets.length,
    jackpot:     data.jackpot,
    drawn:       data.drawn,
    winner:      data.winner,
    ticketPrice: TICKET_PRICE,
    maxTickets:  MAX_TICKETS,
    drawDate:    sundayUTC(),
    history:     (data.history || []).slice(0, 5),
  };
}

function buyTicket(username) {
  const data = read();
  const week = thisWeekKey();
  if (data.week !== week) {
    // Reset for new week
    data.history = [{ week: data.week, tickets: data.tickets, drawn: data.drawn, winner: data.winner, jackpot: data.jackpot }, ...(data.history || [])].slice(0, 10);
    data.week    = week;
    data.tickets = [];
    data.drawn   = false;
    data.winner  = null;
    data.jackpot = JACKPOT_SEED;
  }
  if (data.drawn) return { ok: false, error: 'This week\'s draw has already happened' };

  const userTickets = data.tickets.filter(t => t.username === username).length;
  if (userTickets >= MAX_TICKETS) return { ok: false, error: `Maximum ${MAX_TICKETS} tickets per week` };

  const ticketId = crypto.randomBytes(4).toString('hex').toUpperCase();
  data.tickets.push({ ticketId, username, boughtAt: Date.now() });
  data.jackpot += Math.floor(TICKET_PRICE * 0.8); // 80% of ticket price goes to jackpot
  write(data);
  return { ok: true, ticketId, jackpot: data.jackpot, myTickets: userTickets + 1 };
}

function getUserTickets(username) {
  const data = read();
  return data.tickets.filter(t => t.username === username);
}

// Draw the winner — call from weekly reset
function drawWinner() {
  const data = read();
  if (data.drawn) return { alreadyDrawn: true, winner: data.winner };
  if (data.tickets.length === 0) {
    data.drawn   = true;
    data.winner  = null;
    write(data);
    return { winner: null, jackpot: data.jackpot };
  }

  const idx    = crypto.randomInt(data.tickets.length);
  const ticket = data.tickets[idx];
  data.drawn   = true;
  data.winner  = { username: ticket.username, ticketId: ticket.ticketId, jackpot: data.jackpot };
  data.history = [{ week: data.week, winner: data.winner, tickets: data.tickets.length, jackpot: data.jackpot }, ...(data.history || [])].slice(0, 10);
  write(data);
  return { winner: ticket.username, ticketId: ticket.ticketId, jackpot: data.jackpot };
}

module.exports = { getStatus, buyTicket, getUserTickets, drawWinner, TICKET_PRICE, MAX_TICKETS };
