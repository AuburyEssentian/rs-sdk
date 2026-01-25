/**
 * Adam_2 - Bot Arc Character Configuration
 *
 * A persistent character for long-term progression experiments.
 */

export const character = {
  // The username used for save files (lowercase)
  username: 'adam_2',

  // Display name
  displayName: 'Adam_2',

  // Current focus arc
  currentArc: 'fishing-basics',

  // Progress tracking - Score = Total Level + GP + Equipment Value
  lastScore: {
    totalLevel: 49,       // After fishing-basics run 001
    gp: 0,                // No coins yet
    equipmentValue: 0,    // Nothing equipped
    total: 49,            // 49 + 0 + 0
    timestamp: '2026-01-25T07:36:00Z',
  },

  // Starting inventory from LUMBRIDGE_SPAWN preset
  startingInventory: [
    'Bronze axe',
    'Tinderbox',
    'Small fishing net',
    'Shrimps',
    'Bucket',
    'Pot',
    'Bread',
    'Bronze pickaxe',
    'Bronze dagger',
    'Bronze sword',
    'Wooden shield',
    'Shortbow',
    'Bronze arrows (25)',
    'Air runes (25)',
    'Mind runes (15)',
    'Water runes (6)',
    'Earth runes (4)',
    'Body runes (2)',
  ],

  // Bank state summary (updated after runs)
  bankHighlights: [],

  // Notes
  notes: 'First arc complete! Fishing 13, ready for more.',
};
