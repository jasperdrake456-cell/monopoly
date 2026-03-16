const API = '/api/leaderboard';

export async function getLeaderboard(gameId) {
  try {
    const res = await fetch(`${API}/${gameId}`);
    return await res.json();
  } catch { return []; }
}

// Returns true if score qualifies for the top 10
export async function isHighScore(gameId, score, higherIsBetter = true) {
  try {
    const res = await fetch(`${API}/${gameId}/check?score=${score}&higherIsBetter=${higherIsBetter}`);
    const data = await res.json();
    return !!data.isHighScore;
  } catch { return false; }
}

// Submit a score; returns updated leaderboard array
export async function addScore(gameId, score, name, higherIsBetter = true) {
  try {
    const res = await fetch(`${API}/${gameId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, name, higherIsBetter }),
    });
    return await res.json();
  } catch { return []; }
}

// Returns 1-based rank of score
export async function getRank(gameId, score, higherIsBetter = true) {
  try {
    const res = await fetch(`${API}/${gameId}/check?score=${score}&higherIsBetter=${higherIsBetter}`);
    const data = await res.json();
    return data.rank ?? 1;
  } catch { return 1; }
}
