// Custom Community Chest and Chance decks — wild, creative, Game Vault themed

const COMMUNITY_CHEST = [
  { text: 'Your roommate finally pays you back. Collect $200.',                          action: 'collect',          amount: 200  },
  { text: 'Neighborhood pizza party — collect $15 from every player.',                  action: 'collect_from_each',amount: 15   },
  { text: 'Your 47 Amazon packages arrived... all wrong. Pay $90.',                     action: 'pay',              amount: 90   },
  { text: "It's your half-birthday (you made this up). Collect $30 from each player.",  action: 'collect_from_each',amount: 30   },
  { text: 'Your landlord raised the rent AGAIN. Pay $200.',                             action: 'pay',              amount: 200  },
  { text: 'Tax refund hits different this year. Collect $175.',                         action: 'collect',          amount: 175  },
  { text: 'AI stole your job. Pay $100 in retraining fees.',                            action: 'pay',              amount: 100  },
  { text: 'You started a fire in the break room. Pay $80 per house, $200 per hotel.',   action: 'repairs',          houseCost: 80, hotelCost: 200 },
  { text: 'Hustle paid off. Advance to Go. Collect $200.',                              action: 'advance_to',       position: 0  },
  { text: 'Local hero award! Collect $50.',                                             action: 'collect',          amount: 50   },
  { text: 'You fell for a scam text. Pay $150.',                                        action: 'pay',              amount: 150  },
  { text: 'Lost dog reward! Collect $40.',                                              action: 'collect',          amount: 40   },
  { text: 'You became HOA president. Pay each player $25 in mandatory dues.',           action: 'pay_each',         amount: 25   },
  { text: 'Mysterious bug quarantine. Go directly to Jail.',                            action: 'go_to_jail'                     },
  { text: 'Your lawyer found a loophole. Get Out of Jail Free.',                        action: 'get_out_of_jail'               },
  { text: 'Grocery store glitch — everything was $1. Collect $60.',                    action: 'collect',          amount: 60   },
  { text: 'Your Airbnb guests trashed the place. Pay $40 per house, $115 per hotel.',   action: 'repairs',          houseCost: 40, hotelCost: 115 },
  { text: 'Side hustle absolutely popping. Collect $90.',                               action: 'collect',          amount: 90   },
];

const CHANCE = [
  { text: 'Your crypto went to the moon! Collect $300.',                                action: 'collect',               amount: 300   },
  { text: 'Your NFT is now worth $0. Pay $250.',                                        action: 'pay',                   amount: 250   },
  { text: 'You went viral for the wrong reason. Pay each player $40 in clout tax.',     action: 'pay_each',              amount: 40    },
  { text: 'Jackpot! Slot machine pays out. Collect $200.',                              action: 'collect',               amount: 200   },
  { text: 'Wormhole detected. Go back 3 spaces.',                                       action: 'go_back',               spaces: 3     },
  { text: 'You won a rap battle. Collect $60 from each player.',                        action: 'collect_from_each',     amount: 60    },
  { text: 'Catch the hype train. Advance to the nearest Railroad.',                     action: 'advance_nearest_railroad'             },
  { text: 'Power surge! Advance to the nearest Utility. Pay 10x if owned.',             action: 'advance_nearest_utility'              },
  { text: 'The cops saw your search history. Go directly to Jail.',                     action: 'go_to_jail'                            },
  { text: 'You bribed a guard with snacks. Get Out of Jail Free.',                      action: 'get_out_of_jail'                       },
  { text: 'You won the internet for a day. Collect $150.',                              action: 'collect',               amount: 150   },
  { text: 'IRS found your offshore account. Pay $300.',                                 action: 'pay',                   amount: 300   },
  { text: 'Reality glitch. Advance to the last property on the board.',                 action: 'advance_to',            position: 39  },
  { text: 'Mystery gift from a millionaire. Collect $100.',                             action: 'collect',               amount: 100   },
  { text: 'You challenged the final boss. Pay $25 per house, $100 per hotel.',          action: 'repairs',               houseCost: 25, hotelCost: 100 },
  { text: 'The simulation resets. Advance to Go. Collect $200.',                        action: 'advance_to',            position: 0   },
  { text: 'Speeding fine on a scooter. Pay $40.',                                       action: 'pay',                   amount: 40    },
  { text: 'You invented a meme. Collect $50 from each player.',                         action: 'collect_from_each',     amount: 50    },
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
