const MAX = 10;

export function getLeaderboard(gameId) {
  try { return JSON.parse(localStorage.getItem(`lb_${gameId}`) || '[]'); }
  catch { return []; }
}

// higherIsBetter: true for score-based, false for time/moves-based
export function isHighScore(gameId, score, higherIsBetter = true) {
  const lb = getLeaderboard(gameId);
  if (lb.length < MAX) return true;
  const worst = lb[lb.length - 1].score;
  return higherIsBetter ? score > worst : score < worst;
}

export function addScore(gameId, score, name, higherIsBetter = true) {
  const lb = getLeaderboard(gameId);
  lb.push({ name, score, date: new Date().toLocaleDateString() });
  lb.sort((a, b) => higherIsBetter ? b.score - a.score : a.score - b.score);
  const trimmed = lb.slice(0, MAX);
  localStorage.setItem(`lb_${gameId}`, JSON.stringify(trimmed));
  return trimmed;
}

export function getRank(gameId, score, higherIsBetter = true) {
  const lb = getLeaderboard(gameId);
  const sorted = [...lb, { score }].sort((a, b) =>
    higherIsBetter ? b.score - a.score : a.score - b.score
  );
  return sorted.findIndex(e => e.score === score) + 1;
}
