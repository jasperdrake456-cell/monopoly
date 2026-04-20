'use strict';

// VIP tiers based on ALL-TIME total wagered (from xpStore stats)
// Perks unlock as you wager more over your lifetime

const VIP_TIERS = [
  {
    tier: 0, name: 'Standard',  color: '#94a3b8', icon: '⚪',
    minWagered: 0,
    perks: [],
    payoutBoost: 0,
    jackpotShare: 0,
    dailySpinBonus: 0,
  },
  {
    tier: 1, name: 'Bronze',    color: '#cd7f32', icon: '🥉',
    minWagered: 10_000,
    perks: ['1.01× payout boost on all casino games'],
    payoutBoost: 0.01,
    jackpotShare: 0,
    dailySpinBonus: 100,
  },
  {
    tier: 2, name: 'Silver',    color: '#94a3b8', icon: '🥈',
    minWagered: 100_000,
    perks: ['1.02× payout boost', '+$200 daily spin bonus', 'Silver chat badge'],
    payoutBoost: 0.02,
    jackpotShare: 0,
    dailySpinBonus: 200,
  },
  {
    tier: 3, name: 'Gold',      color: '#f59e0b', icon: '🥇',
    minWagered: 500_000,
    perks: ['1.03× payout boost', '+$500 daily spin bonus', 'Gold chat badge', 'Priority support'],
    payoutBoost: 0.03,
    jackpotShare: 0.01,
    dailySpinBonus: 500,
  },
  {
    tier: 4, name: 'Platinum',  color: '#22d3ee', icon: '💎',
    minWagered: 2_000_000,
    perks: ['1.05× payout boost', '+$1,000 daily spin bonus', 'Platinum badge', '1% extra jackpot share'],
    payoutBoost: 0.05,
    jackpotShare: 0.02,
    dailySpinBonus: 1000,
  },
  {
    tier: 5, name: 'Diamond',   color: '#a78bfa', icon: '👑',
    minWagered: 10_000_000,
    perks: ['1.10× payout boost', '+$2,500 daily spin bonus', 'Diamond badge', '3% extra jackpot share', 'Exclusive Diamond lounge'],
    payoutBoost: 0.10,
    jackpotShare: 0.03,
    dailySpinBonus: 2500,
  },
];

function getTierForWagered(totalWagered) {
  let tier = VIP_TIERS[0];
  for (const t of VIP_TIERS) {
    if (totalWagered >= t.minWagered) tier = t;
  }
  const nextIdx = VIP_TIERS.findIndex(t => t.tier === tier.tier) + 1;
  const next    = VIP_TIERS[nextIdx] || null;
  return {
    ...tier,
    totalWagered,
    toNext: next ? next.minWagered - totalWagered : null,
    nextTier: next,
    progress: next ? Math.min(100, Math.floor(((totalWagered - tier.minWagered) / (next.minWagered - tier.minWagered)) * 100)) : 100,
  };
}

module.exports = { VIP_TIERS, getTierForWagered };
