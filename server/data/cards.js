// Community Chest and Chance decks

const COMMUNITY_CHEST = [
  { text: 'Advance to Go. Collect $200.',                              action: 'advance_to',       position: 0 },
  { text: 'Bank error in your favor. Collect $200.',                   action: 'collect',          amount: 200 },
  { text: "Doctor's fees. Pay $50.",                                   action: 'pay',              amount: 50  },
  { text: 'From sale of stock you get $50.',                           action: 'collect',          amount: 50  },
  { text: 'Get Out of Jail Free.',                                     action: 'get_out_of_jail'               },
  { text: 'Go to Jail. Do not pass Go, do not collect $200.',          action: 'go_to_jail'                    },
  { text: 'Grand Opera Night. Collect $50 from every player.',         action: 'collect_from_each',amount: 50  },
  { text: 'Holiday Fund matures. Receive $100.',                       action: 'collect',          amount: 100 },
  { text: 'Income tax refund. Collect $20.',                           action: 'collect',          amount: 20  },
  { text: 'It is your birthday. Collect $10 from each player.',        action: 'collect_from_each',amount: 10  },
  { text: 'Life insurance matures. Collect $100.',                     action: 'collect',          amount: 100 },
  { text: 'Pay hospital fees of $100.',                                action: 'pay',              amount: 100 },
  { text: 'Pay school fees of $150.',                                  action: 'pay',              amount: 150 },
  { text: 'Receive $25 consultancy fee.',                              action: 'collect',          amount: 25  },
  { text: 'You are assessed for street repairs: $40 per house, $115 per hotel.', action: 'repairs', houseCost: 40, hotelCost: 115 },
  { text: 'You have won second prize in a beauty contest. Collect $10.', action: 'collect',        amount: 10  },
];

const CHANCE = [
  { text: 'Advance to Boardwalk.',                                     action: 'advance_to',            position: 39 },
  { text: 'Advance to Go. Collect $200.',                              action: 'advance_to',            position: 0  },
  { text: 'Advance to Illinois Avenue. If you pass Go, collect $200.', action: 'advance_to',            position: 24 },
  { text: 'Advance to St. Charles Place. If you pass Go, collect $200.', action: 'advance_to',          position: 11 },
  { text: 'Advance to the nearest Railroad. If unowned you may buy it; if owned pay twice the rent.',   action: 'advance_nearest_railroad' },
  { text: 'Advance to the nearest Railroad. If unowned you may buy it; if owned pay twice the rent.',   action: 'advance_nearest_railroad' },
  { text: 'Advance token to the nearest Utility. If unowned you may buy it; if owned throw dice and pay owner 10x amount.', action: 'advance_nearest_utility' },
  { text: 'Bank pays you dividend of $50.',                            action: 'collect',               amount: 50   },
  { text: 'Get Out of Jail Free.',                                     action: 'get_out_of_jail'                     },
  { text: 'Go Back 3 Spaces.',                                         action: 'go_back',               spaces: 3    },
  { text: 'Go to Jail. Do not pass Go, do not collect $200.',          action: 'go_to_jail'                          },
  { text: 'Make general repairs on all your property: $25 per house, $100 per hotel.', action: 'repairs', houseCost: 25, hotelCost: 100 },
  { text: 'Speeding fine. Pay $15.',                                   action: 'pay',                   amount: 15   },
  { text: 'Take a trip to Reading Railroad. If you pass Go, collect $200.', action: 'advance_to',       position: 5  },
  { text: 'You have been elected Chairman of the Board. Pay each player $50.', action: 'pay_each',      amount: 50   },
  { text: 'Your building loan matures. Collect $150.',                 action: 'collect',               amount: 150  },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function freshDecks() {
  return {
    chance: shuffle(CHANCE.map((_, i) => i)),
    community: shuffle(COMMUNITY_CHEST.map((_, i) => i)),
    chanceIdx: 0,
    communityIdx: 0,
  };
}

module.exports = { COMMUNITY_CHEST, CHANCE, freshDecks };
