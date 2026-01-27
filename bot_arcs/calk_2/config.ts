/**
 * calk_2 - Bot Arc Character Configuration
 *
 * A desert-focused character centered around Al Kharid.
 * Strategy: Get to Al Kharid, thieving for GP, buy kebabs for food, train combat, buy scimitars.
 *
 * Al Kharid Resources:
 * - Kebab seller (Karim): Cheap food (1gp each)
 * - Scimitar shop (Zeke): Bronze to Adamant scimitars
 * - Warriors: Good combat training (level 9)
 * - Men: Pickpocket targets (3gp each)
 * - Bank: (3269, 3167)
 * - Fishing spots: (3267, 3148) - safe shrimp fishing
 */

export const character = {
  // The username used for save files (lowercase)
  username: 'calk_2',

  // Display name
  displayName: 'calk_2',

  // Current focus arc
  currentArc: 'desert-journey',

  // Ultimate goals (Phase 2)
  goals: {
    // Combat stats - raised to 60
    attack: 60,
    strength: 60,
    defence: 60,

    // Thieving for money
    thieving: 70,    // Higher level = more GP/hour

    // Equipment goal
    weapon: 'Adamant scimitar',  // Then Rune at 40 Attack (need Champions' Guild)
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

    // Training spots
    alkharidMen: { x: 3293, z: 3175 },  // Men near palace
    alkharidWarriors: { x: 3295, z: 3173 },  // Al Kharid warriors
  },

  // Notes
  notes: 'Desert-focused character - thieving + scimitars + kebabs + combat in Al Kharid',
};
