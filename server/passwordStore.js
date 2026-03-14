'use strict';

// In-memory password store — initialised from env var or default
let currentPassword = process.env.GAME_PASSWORD || 'MrMoney';

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
}

module.exports = { getPassword, setPassword, generatePassword };
