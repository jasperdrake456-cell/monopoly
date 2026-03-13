// Full standard Monopoly board — 40 spaces
// rent array: [base (no houses), 1 house, 2 houses, 3 houses, 4 houses, hotel]
// base rent doubles automatically when owner has full color group (no houses)

const BOARD = [
  { id: 0,  name: 'Go',                      type: 'go' },
  { id: 1,  name: 'Mediterranean Avenue',    type: 'property', group: 'brown',     price: 60,  rent: [2,  10,  30,  90,  160, 250],  houseCost: 50,  mortgageValue: 30  },
  { id: 2,  name: 'Community Chest',         type: 'community_chest' },
  { id: 3,  name: 'Baltic Avenue',           type: 'property', group: 'brown',     price: 60,  rent: [4,  20,  60,  180, 320, 450],  houseCost: 50,  mortgageValue: 30  },
  { id: 4,  name: 'Income Tax',              type: 'tax',      amount: 200 },
  { id: 5,  name: 'Reading Railroad',        type: 'railroad', price: 200, mortgageValue: 100 },
  { id: 6,  name: 'Oriental Avenue',         type: 'property', group: 'light_blue',price: 100, rent: [6,  30,  90,  270, 400, 550],  houseCost: 50,  mortgageValue: 50  },
  { id: 7,  name: 'Chance',                  type: 'chance' },
  { id: 8,  name: 'Vermont Avenue',          type: 'property', group: 'light_blue',price: 100, rent: [6,  30,  90,  270, 400, 550],  houseCost: 50,  mortgageValue: 50  },
  { id: 9,  name: 'Connecticut Avenue',      type: 'property', group: 'light_blue',price: 120, rent: [8,  40,  100, 300, 450, 600],  houseCost: 50,  mortgageValue: 60  },
  { id: 10, name: 'Jail / Just Visiting',    type: 'jail' },
  { id: 11, name: 'St. Charles Place',       type: 'property', group: 'pink',      price: 140, rent: [10, 50,  150, 450, 625, 750],  houseCost: 100, mortgageValue: 70  },
  { id: 12, name: 'Electric Company',        type: 'utility',  price: 150, mortgageValue: 75 },
  { id: 13, name: 'States Avenue',           type: 'property', group: 'pink',      price: 140, rent: [10, 50,  150, 450, 625, 750],  houseCost: 100, mortgageValue: 70  },
  { id: 14, name: 'Virginia Avenue',         type: 'property', group: 'pink',      price: 160, rent: [12, 60,  180, 500, 700, 900],  houseCost: 100, mortgageValue: 80  },
  { id: 15, name: 'Pennsylvania Railroad',   type: 'railroad', price: 200, mortgageValue: 100 },
  { id: 16, name: 'St. James Place',         type: 'property', group: 'orange',    price: 180, rent: [14, 70,  200, 550, 750, 950],  houseCost: 100, mortgageValue: 90  },
  { id: 17, name: 'Community Chest',         type: 'community_chest' },
  { id: 18, name: 'Tennessee Avenue',        type: 'property', group: 'orange',    price: 180, rent: [14, 70,  200, 550, 750, 950],  houseCost: 100, mortgageValue: 90  },
  { id: 19, name: 'New York Avenue',         type: 'property', group: 'orange',    price: 200, rent: [16, 80,  220, 600, 800, 1000], houseCost: 100, mortgageValue: 100 },
  { id: 20, name: 'Free Parking',            type: 'free_parking' },
  { id: 21, name: 'Kentucky Avenue',         type: 'property', group: 'red',       price: 220, rent: [18, 90,  250, 700, 875, 1050], houseCost: 150, mortgageValue: 110 },
  { id: 22, name: 'Chance',                  type: 'chance' },
  { id: 23, name: 'Indiana Avenue',          type: 'property', group: 'red',       price: 220, rent: [18, 90,  250, 700, 875, 1050], houseCost: 150, mortgageValue: 110 },
  { id: 24, name: 'Illinois Avenue',         type: 'property', group: 'red',       price: 240, rent: [20, 100, 300, 750, 925, 1100], houseCost: 150, mortgageValue: 120 },
  { id: 25, name: 'B&O Railroad',            type: 'railroad', price: 200, mortgageValue: 100 },
  { id: 26, name: 'Atlantic Avenue',         type: 'property', group: 'yellow',    price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, mortgageValue: 130 },
  { id: 27, name: 'Ventnor Avenue',          type: 'property', group: 'yellow',    price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, mortgageValue: 130 },
  { id: 28, name: 'Water Works',             type: 'utility',  price: 150, mortgageValue: 75 },
  { id: 29, name: 'Marvin Gardens',          type: 'property', group: 'yellow',    price: 280, rent: [24, 120, 360, 850, 1025,1200], houseCost: 150, mortgageValue: 140 },
  { id: 30, name: 'Go To Jail',              type: 'go_to_jail' },
  { id: 31, name: 'Pacific Avenue',          type: 'property', group: 'green',     price: 300, rent: [26, 130, 390, 900, 1100,1275], houseCost: 200, mortgageValue: 150 },
  { id: 32, name: 'North Carolina Avenue',   type: 'property', group: 'green',     price: 300, rent: [26, 130, 390, 900, 1100,1275], houseCost: 200, mortgageValue: 150 },
  { id: 33, name: 'Community Chest',         type: 'community_chest' },
  { id: 34, name: 'Pennsylvania Avenue',     type: 'property', group: 'green',     price: 320, rent: [28, 150, 450, 1000,1200,1400], houseCost: 200, mortgageValue: 160 },
  { id: 35, name: 'Short Line Railroad',     type: 'railroad', price: 200, mortgageValue: 100 },
  { id: 36, name: 'Chance',                  type: 'chance' },
  { id: 37, name: 'Park Place',              type: 'property', group: 'dark_blue', price: 350, rent: [35, 175, 500, 1100,1300,1500], houseCost: 200, mortgageValue: 175 },
  { id: 38, name: 'Luxury Tax',              type: 'tax',      amount: 100 },
  { id: 39, name: 'Boardwalk',               type: 'property', group: 'dark_blue', price: 400, rent: [50, 200, 600, 1400,1700,2000], houseCost: 200, mortgageValue: 200 },
];

// Color groups and their property ids
const COLOR_GROUPS = {
  brown:     [1, 3],
  light_blue:[6, 8, 9],
  pink:      [11, 13, 14],
  orange:    [16, 18, 19],
  red:       [21, 23, 24],
  yellow:    [26, 27, 29],
  green:     [31, 32, 34],
  dark_blue: [37, 39],
};

const RAILROAD_IDS = [5, 15, 25, 35];
const UTILITY_IDS  = [12, 28];

module.exports = { BOARD, COLOR_GROUPS, RAILROAD_IDS, UTILITY_IDS };
