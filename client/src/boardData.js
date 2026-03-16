export const BOARD = [
  { id: 0,  name: 'Go',                      type: 'go' },
  { id: 1,  name: 'Mediterranean Ave',        type: 'property', group: 'brown',     price: 60,  rent: [2,10,30,90,160,250],    houseCost: 50,  mortgageValue: 30  },
  { id: 2,  name: 'Community Chest',          type: 'community_chest' },
  { id: 3,  name: 'Baltic Ave',               type: 'property', group: 'brown',     price: 60,  rent: [4,20,60,180,320,450],   houseCost: 50,  mortgageValue: 30  },
  { id: 4,  name: 'Income Tax',               type: 'tax',      amount: 200 },
  { id: 5,  name: 'Reading Railroad',         type: 'railroad', price: 200, mortgageValue: 100 },
  { id: 6,  name: 'Oriental Ave',             type: 'property', group: 'light_blue',price: 100, rent: [6,30,90,270,400,550],   houseCost: 50,  mortgageValue: 50  },
  { id: 7,  name: 'Chance',                   type: 'chance' },
  { id: 8,  name: 'Vermont Ave',              type: 'property', group: 'light_blue',price: 100, rent: [6,30,90,270,400,550],   houseCost: 50,  mortgageValue: 50  },
  { id: 9,  name: 'Connecticut Ave',          type: 'property', group: 'light_blue',price: 120, rent: [8,40,100,300,450,600],  houseCost: 50,  mortgageValue: 60  },
  { id: 10, name: 'Jail',                     type: 'jail' },
  { id: 11, name: 'St. Charles Place',        type: 'property', group: 'pink',      price: 140, rent: [10,50,150,450,625,750], houseCost: 100, mortgageValue: 70  },
  { id: 12, name: 'Electric Company',         type: 'utility',  price: 150, mortgageValue: 75 },
  { id: 13, name: 'States Ave',               type: 'property', group: 'pink',      price: 140, rent: [10,50,150,450,625,750], houseCost: 100, mortgageValue: 70  },
  { id: 14, name: 'Virginia Ave',             type: 'property', group: 'pink',      price: 160, rent: [12,60,180,500,700,900], houseCost: 100, mortgageValue: 80  },
  { id: 15, name: 'Pennsylvania Railroad',    type: 'railroad', price: 200, mortgageValue: 100 },
  { id: 16, name: 'St. James Place',          type: 'property', group: 'orange',    price: 180, rent: [14,70,200,550,750,950], houseCost: 100, mortgageValue: 90  },
  { id: 17, name: 'Community Chest',          type: 'community_chest' },
  { id: 18, name: 'Tennessee Ave',            type: 'property', group: 'orange',    price: 180, rent: [14,70,200,550,750,950], houseCost: 100, mortgageValue: 90  },
  { id: 19, name: 'New York Ave',             type: 'property', group: 'orange',    price: 200, rent: [16,80,220,600,800,1000],houseCost: 100, mortgageValue: 100 },
  { id: 20, name: 'Free Parking',             type: 'free_parking' },
  { id: 21, name: 'Kentucky Ave',             type: 'property', group: 'red',       price: 220, rent: [18,90,250,700,875,1050],houseCost: 150, mortgageValue: 110 },
  { id: 22, name: 'Chance',                   type: 'chance' },
  { id: 23, name: 'Indiana Ave',              type: 'property', group: 'red',       price: 220, rent: [18,90,250,700,875,1050],houseCost: 150, mortgageValue: 110 },
  { id: 24, name: 'Illinois Ave',             type: 'property', group: 'red',       price: 240, rent: [20,100,300,750,925,1100],houseCost: 150, mortgageValue: 120 },
  { id: 25, name: 'B&O Railroad',             type: 'railroad', price: 200, mortgageValue: 100 },
  { id: 26, name: 'Atlantic Ave',             type: 'property', group: 'yellow',    price: 260, rent: [22,110,330,800,975,1150], houseCost: 150, mortgageValue: 130 },
  { id: 27, name: 'Ventnor Ave',              type: 'property', group: 'yellow',    price: 260, rent: [22,110,330,800,975,1150], houseCost: 150, mortgageValue: 130 },
  { id: 28, name: 'Water Works',              type: 'utility',  price: 150, mortgageValue: 75 },
  { id: 29, name: 'Marvin Gardens',           type: 'property', group: 'yellow',    price: 280, rent: [24,120,360,850,1025,1200],houseCost: 150, mortgageValue: 140 },
  { id: 30, name: 'Go To Jail',               type: 'go_to_jail' },
  { id: 31, name: 'Pacific Ave',              type: 'property', group: 'green',     price: 300, rent: [26,130,390,900,1100,1275], houseCost: 200, mortgageValue: 150 },
  { id: 32, name: 'North Carolina Ave',       type: 'property', group: 'green',     price: 300, rent: [26,130,390,900,1100,1275], houseCost: 200, mortgageValue: 150 },
  { id: 33, name: 'Community Chest',          type: 'community_chest' },
  { id: 34, name: 'Pennsylvania Ave',         type: 'property', group: 'green',     price: 320, rent: [28,150,450,1000,1200,1400],houseCost: 200, mortgageValue: 160 },
  { id: 35, name: 'Short Line Railroad',      type: 'railroad', price: 200, mortgageValue: 100 },
  { id: 36, name: 'Chance',                   type: 'chance' },
  { id: 37, name: 'Park Place',               type: 'property', group: 'dark_blue', price: 350, rent: [35,175,500,1100,1300,1500],houseCost: 200, mortgageValue: 175 },
  { id: 38, name: 'Luxury Tax',               type: 'tax',      amount: 100 },
  { id: 39, name: 'Boardwalk',                type: 'property', group: 'dark_blue', price: 400, rent: [50,200,600,1400,1700,2000],houseCost: 200, mortgageValue: 200 },
];

export const GROUP_COLORS = {
  brown:     '#955436',   // authentic Monopoly brown
  light_blue:'#ADD8E6',
  pink:      '#D93A96',   // authentic Monopoly magenta-pink
  orange:    '#F4811F',
  red:       '#ED1B24',   // authentic Monopoly red
  yellow:    '#FEF200',   // authentic Monopoly bright yellow
  green:     '#1FB25A',   // authentic Monopoly green
  dark_blue: '#0072BB',   // authentic Monopoly cobalt blue
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
  johnacido:    '🕺',
};

export const TOKEN_COLORS = {
  car:         '#FF6B6B',  // bright red
  hat:         '#B0BEC5',  // light slate (was near-black)
  dog:         '#FFAB40',  // bright orange
  ship:        '#4FC3F7',  // bright sky blue
  cat:         '#CE93D8',  // bright lavender
  rocket:      '#00E5FF',  // bright cyan
  crown:       '#FFCA28',  // bright gold
  lion:        '#FF7043',  // bright burnt orange
  frog:        '#69F0AE',  // bright green
  robot:       '#40E0D0',  // bright turquoise
  dragon:      '#FF4081',  // pink-red (distinct from car)
  penguin:     '#90A4AE',  // light blue-grey (was dark grey)
  johnacido:   '#E040FB',  // vivid purple
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
