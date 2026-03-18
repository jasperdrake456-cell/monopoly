'use strict';

// ── Word tiers ────────────────────────────────────────────────────────────────
// Tier 1 — ALWAYS blocked regardless of strictness (slurs, hate speech, threats)
const TIER1 = [
  // racial / ethnic slurs
  'nigger','nigga','chink','spic','kike','cracker','wetback','gook','beaner',
  'coon','jigaboo','sambo','zipperhead','redskin','injun','squaw',
  'raghead','towelhead','sandnigger','heeb','yid','hymie','greaseball',
  'dago','wop','guinea','polack','kraut','mick','paddy','paki','coolie',
  // anti-gay / trans slurs
  'faggot','fag','dyke','tranny','shemale',
  // hate / extremism
  'jewboy','ihatejews','gassthejews','killalljews','hitlerdidnothingwrong',
  'whitepride','rahowa','1488','whitesupremacy',
  'nazi','heil','kkk',
  // direct threats & self-harm
  'kys','kill yourself','hang yourself','slit your wrists','end your life',
  'i will find you','ill find you','find your address','your address is',
  'doxx','doxing','swat you',
  // extreme sexual / violent
  'rape','child porn','cp','loli','shotacon',
  'goatfucker','beastiality',
  // recruit / radicalize
  'lynch','lynch him','lynch her',
];

// Tier 2 — blocked at 'strict' and 'moderate' (heavy profanity)
const TIER2 = [
  'fuck','fucking','fucked','fucker','fucks','mf','wtf',
  'shit','shitting','shitty','bullshit','horseshit','batshit',
  'bitch','bitches','bitching',
  'cunt','cunts',
  'dick','dicks','dickhead',
  'cock','cocks','cocksucker',
  'pussy','pussies',
  'bastard','bastards',
  'asshole','assholes','asshat','jackass','dumbass','smartass',
  'retard','retarded','retards',
  'piss','pissy',
  'wank','wanker','wanking',
  'prick','pricks',
  'arse','arsehole',
  'twat','twats',
  'slag','slut','skank','whore',
  'motherfucker','mfer',
  'stfu','gtfo','idgaf','fml',
  'dipshit','horseshit','shithead',
];

// Tier 3 — blocked only at 'strict' (mild language / insults)
const TIER3 = [
  'damn','damned','dammit',
  'crap','crappy',
  'hell','hells',
  'sucks','suck it',
  'stupid','idiot','idiots','moron','morons','dumb','dumbass',
  'loser','losers',
  'ugly','fatass','fat ass',
  'trash','garbage',
  'noob','noobs',
  'shut up','shutup','shut it',
  'jerk','jerks',
];

// ── Normalisation ─────────────────────────────────────────────────────────────
// Removes leet-speak, separators, Unicode confusables, and collapses to plain text.
function normalize(s) {
  return s
    .toLowerCase()
    // leet speak
    .replace(/4|@|α/g, 'a')
    .replace(/3|€/g, 'e')
    .replace(/1|!|\|/g, 'i')
    .replace(/0|ο/g, 'o')
    .replace(/5|\$|§/g, 's')
    .replace(/7/g, 't')
    .replace(/\+/g, 't')
    // remove anything that's not alphanumeric (collapses spaces, symbols, dashes, dots, etc.)
    .replace(/[^a-z0-9]/g, '');
}

// Check if normalized message contains a bad word
function hits(normalizedText, wordList) {
  for (const w of wordList) {
    const nw = normalize(w);
    if (normalizedText.includes(nw)) return w;
  }
  return null;
}

// ── Patterns ──────────────────────────────────────────────────────────────────
// URL / invite link
const URL_RE = /https?:\/\/|www\.|\.com\b|\.net\b|\.org\b|\.gg\b|\.io\b|\.xyz\b|discord\.gg|t\.me|bit\.ly|tinyurl/i;

// Personal info
const PHONE_RE = /\b\d{3}[\s\-.]?\d{3}[\s\-.]?\d{4}\b/;
const EMAIL_RE = /\b[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}\b/i;

// IP address
const IP_RE   = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;

// Excessive capital letters (>70% of alpha chars, min 6 alpha chars)
function isCapsAbuse(text) {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 6) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return (upper / letters.length) > 0.70;
}

// Repeated character spam (aaaaaa, !!!!!, ....)
function isCharSpam(text) {
  return /(.)\1{5,}/.test(text);
}

// Emoji count
function countEmojis(text) {
  try { return ([...text].filter(ch => /\p{Emoji}/u.test(ch) && ch !== ' ')).length; }
  catch { return 0; }
}

// ── Main filter ───────────────────────────────────────────────────────────────
/**
 * filter(text, settings, recentUserMessages)
 *   text              — the raw message
 *   settings          — chatStore settings object
 *   recentUserMessages — array of last N message texts (strings) from this user
 *
 * Returns { allowed: bool, reason: string, severity: 'warn'|'mute'|'kick' }
 */
function filter(text, settings, recentUserMessages = []) {
  const {
    strictness, blockLinks, blockAllCaps, blockCharSpam,
    blockRepeat, repeatWindow, maxEmojis,
  } = settings;

  const norm = normalize(text);

  // ── Personal info (always blocked) ────────────────────────────────────────
  if (PHONE_RE.test(text))
    return { allowed: false, reason: 'Phone numbers are not permitted.', severity: 'warn' };
  if (EMAIL_RE.test(text))
    return { allowed: false, reason: 'Email addresses are not permitted.', severity: 'warn' };
  if (IP_RE.test(text))
    return { allowed: false, reason: 'IP addresses are not permitted.', severity: 'warn' };

  // ── Tier 1 — always blocked (slurs, threats, hate speech) ─────────────────
  const t1 = hits(norm, TIER1);
  if (t1) return { allowed: false, reason: 'Your message was blocked for prohibited content.', severity: 'mute' };

  // ── Tier 2 — blocked at strict + moderate ─────────────────────────────────
  if (strictness !== 'relaxed') {
    const t2 = hits(norm, TIER2);
    if (t2) return { allowed: false, reason: 'Your message contains inappropriate language.', severity: 'warn' };
  }

  // ── Tier 3 — blocked at strict only ───────────────────────────────────────
  if (strictness === 'strict') {
    const t3 = hits(norm, TIER3);
    if (t3) return { allowed: false, reason: 'Your message contains inappropriate language.', severity: 'warn' };
  }

  // ── URLs / links ──────────────────────────────────────────────────────────
  if (blockLinks && URL_RE.test(text))
    return { allowed: false, reason: 'Links and URLs are not allowed in chat.', severity: 'warn' };

  // ── ALL CAPS ──────────────────────────────────────────────────────────────
  if (blockAllCaps && isCapsAbuse(text))
    return { allowed: false, reason: 'Please don\'t use excessive caps.', severity: 'warn' };

  // ── Character spam ────────────────────────────────────────────────────────
  if (blockCharSpam && isCharSpam(text))
    return { allowed: false, reason: 'No character spamming.', severity: 'warn' };

  // ── Emoji spam ────────────────────────────────────────────────────────────
  if (maxEmojis > 0 && countEmojis(text) > maxEmojis)
    return { allowed: false, reason: `Max ${maxEmojis} emojis per message.`, severity: 'warn' };

  // ── Repeat spam ───────────────────────────────────────────────────────────
  // recentUserMessages holds PAST messages; current hasn't been added yet.
  // Block when the last (repeatWindow - 1) messages equal the current one,
  // meaning this message would make repeatWindow identical in a row.
  if (blockRepeat && recentUserMessages.length >= repeatWindow - 1) {
    const current = text.trim().toLowerCase();
    const sameCount = recentUserMessages
      .slice(0, repeatWindow - 1)
      .filter(m => m.trim().toLowerCase() === current).length;
    if (sameCount >= repeatWindow - 1)
      return { allowed: false, reason: 'Please don\'t repeat the same message.', severity: 'warn' };
  }

  return { allowed: true, reason: '', severity: null };
}

module.exports = { filter };
