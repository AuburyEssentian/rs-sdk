/**
 * calk - Bot Arc Character Configuration
 *
 * A desert-focused character centered around Al Kharid.
 * Strategy: Thieving for GP, buy kebabs for food, train combat, buy scimitars.
 *
 * Al Kharid Resources:
 * - Kebab seller (Karim): Cheap food (1gp each)
 * - Scimitar shop (Zeke): Bronze to Adamant scimitars
 * - Warriors: Good thieving targets (18gp each at level 25+)
 * - Bank: (3269, 3167)
 * - Fishing spots: (3267, 3148) - safe shrimp fishing
 */

export const character = {
  // The username used for save files (lowercase)
  username: 'calk',

  // Display name
  displayName: 'calk',

  // Current focus arc
  currentArc: 'get-to-alkharid',

  // Ultimate goals
  goals: {
    // Combat stats
    attack: 40,      // Rune scimitar requirement
    strength: 40,
    defence: 40,

    // Thieving for money
    thieving: 40,    // Warriors become easy to pickpocket

    // Equipment goal
    weapon: 'Rune scimitar',
  },

  // Gear progression milestones (scimitars from Zeke)
  gearProgression: [
    { level: 1, tier: 'Bronze scimitar', cost: 32 },
    { level: 5, tier: 'Iron scimitar', cost: 112 },
    { level: 10, tier: 'Steel scimitar', cost: 400 },
    { level: 20, tier: 'Mithril scimitar', cost: 1040 },
    { level: 30, tier: 'Adamant scimitar', cost: 2560 },
    { level: 40, tier: 'Rune scimitar', cost: 25600 },  // May need Champions' Guild or other source
  ],

  // Progress tracking - Score = Total Level + GP + Equipment Value
  lastScore: {
    totalLevel: 32,
    gp: 0,
    equipmentValue: 0,
    total: 32,
    timestamp: new Date().toISOString(),
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

  // Key locations for this character's activities (Al Kharid focused)
  locations: {
    // Travel
    lumbridge: { x: 3222, z: 3218 },
    lumbridgeGeneralStore: { x: 3212, z: 3247 },
    alkharidGate: { x: 3268, z: 3228 },

    // Al Kharid destinations
    alkharidBank: { x: 3269, z: 3167 },
    alkharidKebabShop: { x: 3273, z: 3180 },  // Karim
    alkharidScimitarShop: { x: 3287, z: 3186 },  // Zeke
    alkharidFishing: { x: 3267, z: 3148 },

    // Thieving spots
    alkharidMen: { x: 3293, z: 3175 },  // Men near palace
    alkharidWarriors: { x: 3295, z: 3173 },  // Al Kharid warriors
  },

  // Notes
  notes: 'Desert-focused character - thieving + scimitars + kebabs in Al Kharid',
};
