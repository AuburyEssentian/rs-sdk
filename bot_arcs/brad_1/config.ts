/**
 * Brad_1 - Bot Arc Character Configuration
 *
 * Goal: Combat levels + thieving GP + Varrock armor drip
 */

export const character = {
  username: 'brad_1',
  displayName: 'Brad_1',
  currentArc: 'combat-thief-drip',

  // Progress tracking - Score = Total Level + GP + Equipment Value
  lastScore: {
    totalLevel: 32,
    gp: 0,
    equipmentValue: 0,
    total: 32,
    timestamp: '2026-01-26T00:00:00Z',
  },

  // Starting skills (all at 1 except HP at 10)
  skills: {
    Attack: 1,
    Strength: 1,
    Defence: 1,
    Hitpoints: 10,
    Thieving: 1,
  },

  inventory: [],
  bankHighlights: [],
  completedArcs: [],

  notes: 'Fresh character. Goal: Combat + Thieving + Varrock gear upgrades.',
};
