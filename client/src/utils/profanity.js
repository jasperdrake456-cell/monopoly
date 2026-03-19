// Profanity / hate-speech filter for leaderboard names
// Blocks slurs, hate speech, offensive content, and l33tspeak variants

const BAD_WORDS = [
  // General profanity
  'fuck','shit','ass','bitch','cunt','dick','cock','pussy','bastard',
  'retard','piss','crap','wank','bollock','prick','arse','twat','slag',
  'whore','slut','skank','tit','boob','damn','hell','sex','porn','nude',
  // Racial / ethnic slurs
  'nigger','nigga','chink','spic','kike','cracker','wetback','gook','beaner',
  'coon','jigaboo','sambo','zipperhead','redskin','injun','squaw',
  'raghead','towelhead','sandnigger','heeb','yid','hymie','greaseball',
  'dago','wop','guinea','polack','kraut','mick','paddy','paki','coolie','spaz',
  // Antisemitism / hate phrases
  'jewboy','ihatejews','jewscum','gassthejews','jewdeath','jewskill',
  'hitlerdidnothingwrong','jewisdevil','deathtojews','killalljews',
  // Religious hate
  'goatfucker','muzzy','muzzie',
  // Homophobic / transphobic
  'faggot','fag','dyke','tranny','shemale','homo',
  // Violence / extremism
  'kill','murder','rape','lynch','genocide','nazi','hitler','kkk',
  'heil','14words','1488','rahowa','whitepride','whitesupremacy',
  // Reserved admin name — no impersonation allowed
  'jasper',
];

// Normalise: lowercase + strip spaces/punctuation + decode l33tspeak
function normalise(str) {
  return str
    .toLowerCase()
    .replace(/[4@]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z0-9]/g, '');
}

export function isClean(name) {
  if (!name || name.trim().length === 0) return false;
  const n = normalise(name);
  return !BAD_WORDS.some(w => n.includes(normalise(w)));
}

export function cleanName(name) {
  return name.trim().slice(0, 20);
}
