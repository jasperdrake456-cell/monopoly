'use strict';
// Server-side profanity filter — mirrors client/src/utils/profanity.js
const BAD_WORDS = [
  'fuck','shit','ass','bitch','cunt','dick','cock','pussy','bastard',
  'retard','piss','crap','wank','bollock','prick','arse','twat','slag',
  'whore','slut','skank','tit','boob','damn','hell','sex','porn','nude',
  'nigger','nigga','chink','spic','kike','cracker','wetback','gook','beaner',
  'coon','jigaboo','sambo','zipperhead','redskin','injun','squaw',
  'raghead','towelhead','sandnigger','heeb','yid','hymie','greaseball',
  'dago','wop','guinea','polack','kraut','mick','paddy','paki','coolie','spaz',
  'jewboy','ihatejews','jewscum','gassthejews','jewdeath','jewskill',
  'hitlerdidnothingwrong','jewisdevil','deathtojews','killalljews',
  'goatfucker','muzzy','muzzie',
  'faggot','fag','dyke','tranny','shemale','homo',
  'kill','murder','rape','lynch','genocide','nazi','hitler','kkk',
  'heil','14words','1488','rahowa','whitepride','whitesupremacy',
];

function normalise(str) {
  return str.toLowerCase()
    .replace(/[4@]/g, 'a').replace(/[3]/g, 'e').replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o').replace(/[5$]/g, 's').replace(/[7]/g, 't')
    .replace(/[^a-z0-9]/g, '');
}

function isClean(name) {
  if (!name || !name.trim()) return false;
  const n = normalise(name);
  return !BAD_WORDS.some(w => n.includes(normalise(w)));
}

module.exports = { isClean };
