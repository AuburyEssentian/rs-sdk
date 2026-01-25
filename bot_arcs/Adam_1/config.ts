/**
 * Adam_1 - Bot Arc Character Configuration
 *
 * A persistent character for long-term progression experiments.
 */

export const character = {
  // The username used for save files (lowercase)
  username: 'adam_1',

  // Display name
  displayName: 'Adam_1',

  // Current focus arc
  currentArc: 'mining-banking',

  // Progress tracking - Score = Total Level + GP + Equipment Value
  lastScore: {
    totalLevel: 307,
    gp: 0,
    equipmentValue: 10,
    total: 307,
    timestamp: '2026-01-25T16:45:00Z',
  },

  // Skill levels (only non-1 levels tracked)
  skills: {
    Fishing: 48,
    Woodcutting: 41,
    Mining: 52,  // 38 -> 52 via mining-banking arc
    Attack: 27,
    Strength: 46,
    Defence: 26,
    Hitpoints: 15,
  },

  // Inventory
  inventory: [
    'Bronze sword',
    'Wooden shield',
    'Bronze axe',
    'Tinderbox',
    'Bronze pickaxe',
    'Bread',
  ],

  // Bank state summary
  bankHighlights: [
    'Tin ore x~30',
    'Iron ore x~30',
  ],

  // Arc history
  completedArcs: [
    {
      name: 'fishing-basics',
      runs: 2,
      lastRun: '2026-01-25',
      outcome: 'success',
      scoreGain: 24,
    },
    {
      name: 'fishing-cooking',
      runs: 1,
      lastRun: '2026-01-25',
      outcome: 'partial',
      scoreGain: 23,
      notes: 'Fishing worked great, cooking failed (tree chopping issue)',
    },
    {
      name: 'wc-fm-lumbridge',
      runs: 1,
      lastRun: '2026-01-25',
      outcome: 'success',
      scoreGain: 40,
    },
    {
      name: 'mining-varrock',
      runs: 1,
      lastRun: '2026-01-25',
      outcome: 'success',
      scoreGain: 37,
    },
    {
      name: 'combat-lumbridge',
      runs: 1,
      lastRun: '2026-01-25',
      outcome: 'success',
      scoreGain: 94,
    },
    {
      name: 'cowhide-combat',
      runs: 1,
      lastRun: '2026-01-25',
      outcome: 'success',
      scoreGain: 45,
      notes: 'Banking failed (long walks), dropped hides instead. Great Strength XP.',
    },
    {
      name: 'mining-banking',
      runs: 4,
      lastRun: '2026-01-25',
      outcome: 'success',
      scoreGain: 14,
      notes: 'First successful banking arc! Used waypoints for walking. Banked ~60 ore total.',
    },
  ],

  // Notes
  notes: 'Banking working! Mining 52, Str 46, ~60 ore in bank. Total level 307. Waypoint walking solved banking.',
};
