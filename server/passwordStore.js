'use strict';

const crypto = require('crypto');

// Password is derived deterministically from the current UTC date + PASSWORD_SECRET.
// This means it's always consistent across any number of redeploys or server restarts
// — no storage needed. Set PASSWORD_SECRET in Railway env vars once and forget it.

const SECRET = process.env.PASSWORD_SECRET || 'gamehub-default-secret';

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

function computePassword(dateKey) {
  const buf = crypto.createHmac('sha256', SECRET).update(dateKey).digest();
  const adj  = ADJECTIVES[buf[0] % ADJECTIVES.length];
  const noun = NOUNS[buf[1] % NOUNS.length];
  const num  = 10 + (buf[2] % 90);
  return adj + noun + num;
}

function getDateKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function getPassword() {
  return computePassword(getDateKey());
}

// generatePassword() still works the same way — returns today's password.
// setPassword() is a no-op since the password is derived, not stored.
function generatePassword() { return getPassword(); }
function setPassword() {}

module.exports = { getPassword, setPassword, generatePassword };
