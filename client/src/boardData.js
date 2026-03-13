export const BOARD = [
  { id: 0,  name: 'Go',                      type: 'go' },
  { id: 1,  name: 'Mediterranean Ave',        type: 'property', group: 'brown',     price: 60  },
  { id: 2,  name: 'Community Chest',          type: 'community_chest' },
  { id: 3,  name: 'Baltic Ave',               type: 'property', group: 'brown',     price: 60  },
  { id: 4,  name: 'Income Tax',               type: 'tax',      amount: 200 },
  { id: 5,  name: 'Reading Railroad',         type: 'railroad', price: 200 },
  { id: 6,  name: 'Oriental Ave',             type: 'property', group: 'light_blue',price: 100 },
  { id: 7,  name: 'Chance',                   type: 'chance' },
  { id: 8,  name: 'Vermont Ave',              type: 'property', group: 'light_blue',price: 100 },
  { id: 9,  name: 'Connecticut Ave',          type: 'property', group: 'light_blue',price: 120 },
  { id: 10, name: 'Jail',                     type: 'jail' },
  { id: 11, name: 'St. Charles Place',        type: 'property', group: 'pink',      price: 140 },
  { id: 12, name: 'Electric Company',         type: 'utility',  price: 150 },
  { id: 13, name: 'States Ave',               type: 'property', group: 'pink',      price: 140 },
  { id: 14, name: 'Virginia Ave',             type: 'property', group: 'pink',      price: 160 },
  { id: 15, name: 'Pennsylvania Railroad',    type: 'railroad', price: 200 },
  { id: 16, name: 'St. James Place',          type: 'property', group: 'orange',    price: 180 },
  { id: 17, name: 'Community Chest',          type: 'community_chest' },
  { id: 18, name: 'Tennessee Ave',            type: 'property', group: 'orange',    price: 180 },
  { id: 19, name: 'New York Ave',             type: 'property', group: 'orange',    price: 200 },
  { id: 20, name: 'Free Parking',             type: 'free_parking' },
  { id: 21, name: 'Kentucky Ave',             type: 'property', group: 'red',       price: 220 },
  { id: 22, name: 'Chance',                   type: 'chance' },
  { id: 23, name: 'Indiana Ave',              type: 'property', group: 'red',       price: 220 },
  { id: 24, name: 'Illinois Ave',             type: 'property', group: 'red',       price: 240 },
  { id: 25, name: 'B&O Railroad',             type: 'railroad', price: 200 },
  { id: 26, name: 'Atlantic Ave',             type: 'property', group: 'yellow',    price: 260 },
  { id: 27, name: 'Ventnor Ave',              type: 'property', group: 'yellow',    price: 260 },
  { id: 28, name: 'Water Works',              type: 'utility',  price: 150 },
  { id: 29, name: 'Marvin Gardens',           type: 'property', group: 'yellow',    price: 280 },
  { id: 30, name: 'Go To Jail',               type: 'go_to_jail' },
  { id: 31, name: 'Pacific Ave',              type: 'property', group: 'green',     price: 300 },
  { id: 32, name: 'North Carolina Ave',       type: 'property', group: 'green',     price: 300 },
  { id: 33, name: 'Community Chest',          type: 'community_chest' },
  { id: 34, name: 'Pennsylvania Ave',         type: 'property', group: 'green',     price: 320 },
  { id: 35, name: 'Short Line Railroad',      type: 'railroad', price: 200 },
  { id: 36, name: 'Chance',                   type: 'chance' },
  { id: 37, name: 'Park Place',               type: 'property', group: 'dark_blue', price: 350 },
  { id: 38, name: 'Luxury Tax',               type: 'tax',      amount: 100 },
  { id: 39, name: 'Boardwalk',                type: 'property', group: 'dark_blue', price: 400 },
];

export const GROUP_COLORS = {
  brown:     '#8B4513',
  light_blue:'#87CEEB',
  pink:      '#FF69B4',
  orange:    '#FFA500',
  red:       '#DC143C',
  yellow:    '#FFD700',
  green:     '#228B22',
  dark_blue: '#00008B',
};

export const TOKENS = {
  car:          '🚗',
  hat:          '🎩',
  dog:          '🐕',
  ship:         '🚢',
  cat:          '🐱',
  rocket:       '🚀',
  crown:        '👑',
  lion:         '🦁',
  frog:         '🐸',
  robot:        '🤖',
  dragon:       '🐉',
  penguin:      '🐧',
};

export const TOKEN_COLORS = {
  car:         '#e74c3c',
  hat:         '#2c3e50',
  dog:         '#e67e22',
  ship:        '#3498db',
  cat:         '#9b59b6',
  rocket:      '#00bcd4',
  crown:       '#f39c12',
  lion:        '#d35400',
  frog:        '#2ecc71',
  robot:       '#1abc9c',
  dragon:      '#c0392b',
  penguin:     '#34495e',
};

// Returns {row, col} for 11x11 grid (0-indexed)
export function getGridPos(id) {
  if (id === 0)  return { row: 10, col: 10 };
  if (id >= 1  && id <= 9)  return { row: 10, col: 10 - id };
  if (id === 10) return { row: 10, col: 0 };
  if (id >= 11 && id <= 19) return { row: 10 - (id - 10), col: 0 };
  if (id === 20) return { row: 0,  col: 0 };
  if (id >= 21 && id <= 29) return { row: 0,  col: id - 20 };
  if (id === 30) return { row: 0,  col: 10 };
  if (id >= 31 && id <= 39) return { row: id - 30, col: 10 };
  return { row: 5, col: 5 };
}

// Rotation of color banner based on board side
export function getTileOrientation(id) {
  if (id === 0 || id === 10 || id === 20 || id === 30) return 'corner';
  if (id >= 1  && id <= 9)  return 'bottom';  // banner at top
  if (id >= 11 && id <= 19) return 'left';    // banner at right
  if (id >= 21 && id <= 29) return 'top';     // banner at bottom
  if (id >= 31 && id <= 39) return 'right';   // banner at left
  return 'bottom';
}
