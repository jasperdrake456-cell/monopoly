// Basic profanity filter — blocks names containing common offensive words
const BAD_WORDS = [
  'fuck','shit','ass','bitch','cunt','dick','cock','pussy','nigger','nigga',
  'faggot','fag','whore','slut','bastard','retard','piss','crap','damn',
  'hell','sex','porn','nude','rape','kill','die','nazi','hitler','kkk',
  'twat','wank','bollock','prick','arse','slag','spaz','chink','spic',
  'kike','cracker','tranny','homo','dyke',
];

export function isClean(name) {
  if (!name || name.trim().length === 0) return false;
  const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return !BAD_WORDS.some(w => lower.includes(w));
}

export function cleanName(name) {
  return name.trim().slice(0, 20);
}
