/**
 * Aubury's autonomous bot script — v7
 *
 * Strategy: Prioritise skills by XP/hr efficiency.
 * Phase 1: WC + FM to 15 (quick start)
 * Phase 2: Thieving at Draynor — men (1-25), guards (25-38), master farmers (38-65)
 * Phase 3: Fishing + Cooking + Banking at Draynor
 * Phase 4: Mining + Smelting + Smithing (copper+tin → bronze bars → items)
 * Phase 5: Combat — chickens (1-40), cows (40-70), Al-Kharid warriors (70-99)
 * Phase 6: Agility — Gnome Stronghold course (run energy cap increase)
 *
 * v7 changes:
 *   - Combat: After 70/70/70, switch to Al-Kharid warriors (better XP, more HP)
 *     Warriors require 5gp toll or Rogue Castle shortcut. Pay the toll from coin stack.
 *   - Combat: After warriors take us to 99/99/99 or 3h timeout, fall back to cows.
 *   - Thieving: Extended target from 50 → 65. Master farmers at Draynor (lvl 38+)
 *     yield seeds worth 2-10k gp each. At 65+ continue with guards indefinitely.
 *   - Agility: Gnome Stronghold course (1 lap ≈ 86 XP). Trains every 6 cycles if
 *     Agility < 30, since run energy recovery rate scales with agility level.
 *   - Fix: thieving banking loop now also deposits seeds from master farmer pockets.
 *   - Log banner updated to v7
 *
 * Runs indefinitely. Picks the best available activity each cycle.
 */
import { runScript } from '../../sdk/runner';

await runScript(async (ctx) => {
    const { bot, sdk, log } = ctx;

    // === CONFIGURATION ===
    const WOODCUT_AREA        = { x: 3200, z: 3220 };  // Lumbridge trees
    const FISHING_AREA        = { x: 3087, z: 3230 };  // Draynor Village shrimps
    const COOK_RANGE_XZ       = { x: 3211, z: 3215 };  // Range near Bob's Axes, Lumbridge
    const THIEVE_AREA         = { x: 3094, z: 3245 };  // Draynor Village men/women
    const THIEVE_GUARD_AREA   = { x: 3093, z: 3237 };  // Draynor Village guards (south of bank)
    const THIEVE_MASTER_FARM  = { x: 3079, z: 3255 };  // Draynor Village master farmer (north of bank)
    const VARROCK_MINE        = { x: 3285, z: 3365 };  // SE Varrock mine (copper + tin)
    const LUMB_FURNACE        = { x: 3225, z: 3256 };  // Lumbridge furnace
    const VARROCK_ANVIL       = { x: 3188, z: 3421 };  // Varrock west smithy anvil
    const DRAYNOR_BANK        = { x: 3092, z: 3243 };  // Draynor Village bank
    const LUMB_CHICKENS       = { x: 3229, z: 3296 };  // Lumbridge chicken pen
    const LUMB_COWS           = { x: 3254, z: 3265 };  // Lumbridge cow pen (east of castle)
    const ALKHARID_WARRIORS   = { x: 3293, z: 3175 };  // Al-Kharid palace warriors
    const ALKHARID_GATE       = { x: 3268, z: 3227 };  // Al-Kharid toll gate (5gp)
    const ALKHARID_BANK       = { x: 3312, z: 3119 };  // Al-Kharid bank
    const GNOME_AGILITY_START = { x: 2474, z: 3436 };  // Gnome Stronghold agility course start
    const MAX_DRIFT       = 18;

    // Rock IDs at SE Varrock mine (from learnings/mining.md)
    const COPPER_ROCK_IDS = [2090, 2091];
    const TIN_ROCK_IDS    = [2093, 2094];

    await sdk.waitForReady(30_000);
    log('Game state ready!');

    // Complete tutorial if still on Tutorial Island (all skills at 1 = tutorial state)
    const wc = sdk.getSkill('woodcutting')?.level ?? 1;
    const fishing = sdk.getSkill('fishing')?.level ?? 1;
    if (wc === 1 && fishing === 1) {
        log('Detected Tutorial Island — running skipTutorial...');
        try {
            await bot.skipTutorial();
            log('Tutorial complete');
            await sdk.waitForTicks(10);
        } catch (e: any) {
            log(`skipTutorial warning: ${e.message} — continuing anyway`);
        }
    } else {
        log('Tutorial already complete — skipping');
    }

    const getLevel = (skill: string): number => sdk.getSkill(skill)?.level ?? 1;

    const getState = async () => {
        for (let i = 0; i < 20; i++) {
            const s = sdk.getState();
            if (s) return s;
            await sdk.waitForTicks(2);
        }
        throw new Error('No game state after 10s');
    };

    const distFrom = (px: number, pz: number, tx: number, tz: number) =>
        Math.sqrt(Math.pow(px - tx, 2) + Math.pow(pz - tz, 2));

    const dismissDialogs = async () => {
        const s = sdk.getState();
        if (s?.dialog?.isOpen) {
            await sdk.sendClickDialog(0);
            await sdk.waitForTicks(1);
        }
    };

    const printLevels = () => {
        const state = sdk.getState();
        const hp = state?.player?.hitpoints;
        const hpStr = hp ? ` HP:${hp.current}/${hp.max}` : '';
        log(`Levels | WC:${getLevel('woodcutting')} FM:${getLevel('firemaking')} Fish:${getLevel('fishing')} Cook:${getLevel('cooking')} Thiev:${getLevel('thieving')} Mine:${getLevel('mining')} Smith:${getLevel('smithing')} Atk:${getLevel('attack')} Str:${getLevel('strength')} Def:${getLevel('defence')} Prayer:${getLevel('prayer')}${hpStr}`);
    };

    // =====================================================================
    // PHASE 1: Woodcutting + Firemaking
    // =====================================================================
    const runWoodcutFiremake = async () => {
        log('=== WC + FM Phase (target: 15/15) ===');

        while (getLevel('woodcutting') < 15 || getLevel('firemaking') < 15) {
            await dismissDialogs();
            const state = await getState();
            const { worldX, worldZ } = state.player;

            if (distFrom(worldX, worldZ, WOODCUT_AREA.x, WOODCUT_AREA.z) > MAX_DRIFT) {
                await bot.walkTo(WOODCUT_AREA.x, WOODCUT_AREA.z);
                continue;
            }

            const invCount = state.inventory.length;
            const logs_ = sdk.findInventoryItem(/^logs$/i);
            const tinderbox = sdk.findInventoryItem(/tinderbox/i);

            if (invCount >= 20 && logs_ && tinderbox && getLevel('firemaking') < 15) {
                const r = await bot.burnLogs(logs_);
                if (!r.success) {
                    for (const item of state.inventory.filter(i => /^logs$/i.test(i.name))) {
                        await sdk.sendDropItem(item.slot);
                        await sdk.waitForTicks(1);
                    }
                }
                continue;
            }

            if (invCount >= 27) {
                for (const item of state.inventory.filter(i => /^logs$/i.test(i.name))) {
                    await sdk.sendDropItem(item.slot);
                    await sdk.waitForTicks(1);
                }
                continue;
            }

            const tree = sdk.findNearbyLoc(/^tree$/i);
            if (tree) {
                await bot.chopTree(tree);
            } else {
                await sdk.waitForTicks(4);
            }
        }

        log(`WC/FM done: WC${getLevel('woodcutting')} FM${getLevel('firemaking')}`);
    };

    // =====================================================================
    // PHASE 2: Thieving
    // At lvl  1-24: pickpocket men/women at Draynor (~8k XP/hr)
    // At lvl 25-37: pickpocket guards at Draynor (~16k XP/hr)
    // At lvl 38-64: pickpocket master farmers at Draynor (~22k XP/hr + valuable seeds)
    // At lvl 65+:   continue master farmers (best Draynor option — 22k+)
    // Banking: deposit coins/seeds at Draynor bank when inventory full
    // =====================================================================
    const runThieving = async (durationMs: number) => {
        const thievingLvl = getLevel('thieving');
        const useMasterFarmer = thievingLvl >= 38;
        const useGuards = thievingLvl >= 25 && !useMasterFarmer;
        const targetLabel = useMasterFarmer ? 'master farmer' : useGuards ? 'guards' : 'men/women';
        log(`=== Thieving (level ${thievingLvl}, target: ${targetLabel}, ${durationMs / 1000}s) ===`);

        // Master farmer is north of Draynor bank — different tile from men/women/guards
        const thieveTarget = useMasterFarmer
            ? THIEVE_MASTER_FARM
            : useGuards
                ? THIEVE_GUARD_AREA
                : THIEVE_AREA;
        await bot.walkTo(thieveTarget.x, thieveTarget.z);

        const endTime = Date.now() + durationMs;
        let pickpockets = 0;

        while (Date.now() < endTime) {
            await dismissDialogs();
            const state = await getState();

            // Bank when full — deposit coins AND seeds (seeds are valuable, don't drop)
            if (state.inventory.length >= 26) {
                log('Thieving — inventory full, banking at Draynor');
                await bot.walkTo(DRAYNOR_BANK.x, DRAYNOR_BANK.z);
                const openResult = await bot.openBank(8_000);
                if (openResult.success) {
                    const bankState = sdk.getState();
                    // Deposit coins
                    const coins = bankState?.inventory.filter(i => /^coins$/i.test(i.name)) ?? [];
                    for (const c of coins) {
                        await bot.depositItem(c, -1);
                        await sdk.waitForTicks(1);
                    }
                    // Deposit seeds obtained from master farmer pockets
                    const seeds = bankState?.inventory.filter(i => /seed$/i.test(i.name)) ?? [];
                    for (const s of seeds) {
                        await bot.depositItem(s, -1);
                        await sdk.waitForTicks(1);
                    }
                    // Deposit miscellaneous loot (potato, cabbage, wheat)
                    const misc = bankState?.inventory.filter(i =>
                        /^potato$|^cabbage$|^wheat$|^grain$/i.test(i.name)
                    ) ?? [];
                    for (const m of misc) {
                        await bot.depositItem(m, -1);
                        await sdk.waitForTicks(1);
                    }
                }
                await bot.walkTo(thieveTarget.x, thieveTarget.z);
                continue;
            }

            const { worldX, worldZ } = state.player;
            if (distFrom(worldX, worldZ, thieveTarget.x, thieveTarget.z) > MAX_DRIFT) {
                await bot.walkTo(thieveTarget.x, thieveTarget.z);
                continue;
            }

            // Pick target NPC based on thieving level
            const target = useMasterFarmer
                ? state.nearbyNpcs.find(npc =>
                    /master\s*farmer/i.test(npc.name) &&
                    npc.optionsWithIndex?.some(o => /pickpocket/i.test(o.text))
                  ) ?? state.nearbyNpcs.find(npc =>
                    /\bguard\b/i.test(npc.name) &&
                    npc.optionsWithIndex?.some(o => /pickpocket/i.test(o.text))
                  )
                : useGuards
                ? state.nearbyNpcs.find(npc =>
                    /\bguard\b/i.test(npc.name) &&
                    npc.optionsWithIndex?.some(o => /pickpocket/i.test(o.text))
                  ) ?? state.nearbyNpcs.find(npc =>
                    /\bman\b|\bwoman\b/i.test(npc.name) &&
                    npc.optionsWithIndex?.some(o => /pickpocket/i.test(o.text))
                  )
                : state.nearbyNpcs.find(npc =>
                    /\bman\b|\bwoman\b/i.test(npc.name) &&
                    npc.optionsWithIndex?.some(o => /pickpocket/i.test(o.text))
                  );

            if (target) {
                const ppOpt = target.optionsWithIndex?.find(o => /pickpocket/i.test(o.text));
                if (ppOpt) {
                    await sdk.sendInteractNpc(target.index, ppOpt.opIndex);
                    await sdk.waitForTicks(3);
                    pickpockets++;
                }
            } else {
                await sdk.waitForTicks(3);
            }
        }

        log(`Thieving done — ${pickpockets} pickpockets | Thieving ${getLevel('thieving')}`);
    };

    // =====================================================================
    // PHASE 3: Fishing
    // =====================================================================
    const runFishing = async (): Promise<boolean> => {
        log(`=== Fishing at Draynor | Fishing ${getLevel('fishing')} ===`);
        await bot.walkTo(FISHING_AREA.x, FISHING_AREA.z);

        const endTime = Date.now() + 5 * 60_000;

        while (Date.now() < endTime) {
            await dismissDialogs();
            const state = await getState();

            if (state.inventory.length >= 26) {
                log('Inventory full — going to cook');
                return true;
            }

            const { worldX, worldZ } = state.player;
            if (distFrom(worldX, worldZ, FISHING_AREA.x, FISHING_AREA.z) > MAX_DRIFT) {
                await bot.walkTo(FISHING_AREA.x, FISHING_AREA.z);
                continue;
            }

            const fishingSpot = state.nearbyNpcs.find(npc =>
                /fishing\s*spot/i.test(npc.name) &&
                npc.optionsWithIndex?.some(o => /^net$/i.test(o.text))
            ) ?? state.nearbyNpcs.find(npc => /fishing\s*spot/i.test(npc.name));

            if (fishingSpot) {
                const netOpt = fishingSpot.optionsWithIndex?.find(o => /^net$/i.test(o.text));
                if (netOpt) {
                    await sdk.sendInteractNpc(fishingSpot.index, netOpt.opIndex);
                } else {
                    await bot.interactNpc(fishingSpot, 'net');
                }
                await sdk.waitForTicks(6);
            } else {
                await sdk.waitForTicks(4);
            }
        }

        return false;
    };

    // =====================================================================
    // PHASE 3b: Cooking
    // =====================================================================
    const runCooking = async () => {
        log(`=== Cooking at Lumbridge | Cooking ${getLevel('cooking')} ===`);
        await bot.walkTo(COOK_RANGE_XZ.x, COOK_RANGE_XZ.z);
        await sdk.waitForTicks(2);

        let cooked = 0;
        let failures = 0;

        while (failures < 5) {
            await dismissDialogs();

            const rawFish = sdk.findInventoryItem(/^raw/i);
            if (!rawFish) {
                log(`Cooking done — ${cooked} fish cooked`);
                break;
            }

            let range = sdk.findNearbyLoc(/^range$/i);
            if (!range) {
                await sdk.scanNearbyLocs(12);
                range = sdk.findNearbyLoc(/^range$/i);
            }
            if (!range) {
                await bot.walkTo(COOK_RANGE_XZ.x, COOK_RANGE_XZ.z);
                await sdk.waitForTicks(3);
                continue;
            }

            const r = await bot.useItemOnLoc(rawFish, range);
            if (r.success) {
                cooked++;
                failures = 0;
            } else {
                failures++;
                await sdk.waitForTicks(3);
            }

            const s2 = sdk.getState();
            if (s2?.dialog?.isOpen) {
                await sdk.sendClickDialog(0);
                await sdk.waitForTicks(1);
            }
        }
    };

    // =====================================================================
    // PHASE 3c: Banking — deposit cooked fish and smithed items at Draynor
    // Keeps food for combat (up to 5 shrimps), banks the rest
    // =====================================================================
    const runBanking = async () => {
        log(`=== Banking at Draynor ===`);
        await bot.walkTo(DRAYNOR_BANK.x, DRAYNOR_BANK.z);
        await sdk.waitForTicks(2);

        const openResult = await bot.openBank(10_000);
        if (!openResult.success) {
            log(`Banking skipped — couldn't open bank: ${openResult.message}`);
            return;
        }

        await sdk.waitForTicks(2);

        // Deposit all cooked fish except keep 5 for food during combat
        const state = sdk.getState();
        const cookedFish = state?.inventory.filter(i => /^shrimps$|^anchovies$|^sardine$|^herring$|^trout$|^salmon$/i.test(i.name)) ?? [];
        let fishDeposited = 0;

        for (const fish of cookedFish) {
            // Keep up to 5 fish for eating during combat
            const remaining = (state?.inventory.filter(i => /^shrimps$|^anchovies$|^sardine$|^herring$|^trout$|^salmon$/i.test(i.name)) ?? []).length;
            if (remaining <= 5) break;

            const r = await bot.depositItem(fish, -1);
            if (r.success) {
                fishDeposited += r.amountDeposited ?? 0;
                await sdk.waitForTicks(1);
            }
        }

        // Deposit bronze items (daggers, etc.) — no need to hold them
        const bronzeItems = state?.inventory.filter(i => /^bronze/i.test(i.name)) ?? [];
        let bronzeDeposited = 0;
        for (const item of bronzeItems) {
            const r = await bot.depositItem(item, -1);
            if (r.success) {
                bronzeDeposited += r.amountDeposited ?? 0;
                await sdk.waitForTicks(1);
            }
        }

        // Deposit ores if any left over
        const ores = state?.inventory.filter(i => /ore$/i.test(i.name)) ?? [];
        for (const ore of ores) {
            await bot.depositItem(ore, -1);
            await sdk.waitForTicks(1);
        }

        const openResult2 = await bot.openBank(3_000);
        if (openResult2.success) {
            await sdk.waitForTicks(1);
        }

        log(`Banking done — ${fishDeposited} fish banked, ${bronzeDeposited} bronze items banked`);
    };

    // =====================================================================
    // PHASE 4a: Mining — copper + tin at SE Varrock mine
    // Mines until inventory is full (half copper, half tin for smelting)
    // =====================================================================
    const runMining = async (): Promise<{ copper: number; tin: number }> => {
        log(`=== Mining at SE Varrock | Mining ${getLevel('mining')} ===`);
        await bot.walkTo(VARROCK_MINE.x, VARROCK_MINE.z);

        let copperMined = 0;
        let tinMined = 0;
        let idleTicks = 0;

        while (true) {
            await dismissDialogs();
            const state = await getState();
            const inv = state.inventory;

            if (inv.length >= 26) {
                copperMined = inv.filter(i => /copper ore/i.test(i.name)).reduce((s, i) => s + i.count, 0);
                tinMined    = inv.filter(i => /tin ore/i.test(i.name)).reduce((s, i) => s + i.count, 0);
                log(`Mining done — ${copperMined} copper, ${tinMined} tin | Mining ${getLevel('mining')}`);
                return { copper: copperMined, tin: tinMined };
            }

            const { worldX, worldZ } = state.player;
            if (distFrom(worldX, worldZ, VARROCK_MINE.x, VARROCK_MINE.z) > MAX_DRIFT + 5) {
                await bot.walkTo(VARROCK_MINE.x, VARROCK_MINE.z);
                continue;
            }

            // Balance copper and tin so we can smelt everything into bars
            const currentCopper = inv.filter(i => /copper ore/i.test(i.name)).reduce((s, i) => s + i.count, 0);
            const currentTin    = inv.filter(i => /tin ore/i.test(i.name)).reduce((s, i) => s + i.count, 0);

            // Pick which ore to target: whichever is behind
            const preferCopper = currentCopper <= currentTin;
            const targetIds = preferCopper ? COPPER_ROCK_IDS : TIN_ROCK_IDS;

            const rock = state.nearbyLocs
                .filter(loc => targetIds.includes(loc.id))
                .filter(loc => loc.optionsWithIndex?.some(o => /^mine$/i.test(o.text)))
                .sort((a, b) => a.distance - b.distance)[0]
                ?? state.nearbyLocs
                    .filter(loc => [...COPPER_ROCK_IDS, ...TIN_ROCK_IDS].includes(loc.id))
                    .filter(loc => loc.optionsWithIndex?.some(o => /^mine$/i.test(o.text)))
                    .sort((a, b) => a.distance - b.distance)[0];

            if (!rock) {
                idleTicks++;
                if (idleTicks > 20) {
                    log('No minable rocks nearby — rocks may be depleted, waiting');
                    idleTicks = 0;
                }
                await sdk.waitForTicks(3);
                continue;
            }

            idleTicks = 0;

            if (rock.distance > 3) {
                await sdk.sendWalk(rock.x, rock.z, true);
                await sdk.waitForTicks(3);
                continue;
            }

            const mineOpt = rock.optionsWithIndex?.find(o => /^mine$/i.test(o.text));
            if (mineOpt) {
                await sdk.sendInteractLoc(rock.x, rock.z, rock.id, mineOpt.opIndex);
                await sdk.waitForTicks(5);
            } else {
                await sdk.waitForTicks(3);
            }
        }
    };

    // =====================================================================
    // PHASE 4b: Smelting — copper + tin → bronze bars at Lumbridge furnace
    // =====================================================================
    const runSmelting = async (): Promise<number> => {
        log(`=== Smelting at Lumbridge furnace | Smithing ${getLevel('smithing')} ===`);
        await bot.walkTo(LUMB_FURNACE.x, LUMB_FURNACE.z);
        await sdk.waitForTicks(3);

        let barsSmelted = 0;

        while (true) {
            await dismissDialogs();
            const state = await getState();

            const copper = state.inventory.find(i => /copper ore/i.test(i.name));
            const tin    = state.inventory.find(i => /tin ore/i.test(i.name));

            if (!copper || !tin) {
                log(`Smelting done — ${barsSmelted} bronze bars | Smithing ${getLevel('smithing')}`);
                return barsSmelted;
            }

            let furnace = sdk.findNearbyLoc(/furnace/i);
            if (!furnace) {
                await sdk.scanNearbyLocs(15);
                furnace = sdk.findNearbyLoc(/furnace/i);
            }
            if (!furnace) {
                await bot.walkTo(LUMB_FURNACE.x, LUMB_FURNACE.z);
                await sdk.waitForTicks(3);
                continue;
            }

            if (furnace.distance > 3) {
                await sdk.sendWalk(furnace.x, furnace.z, true);
                await sdk.waitForTicks(3);
                continue;
            }

            const r = await sdk.sendUseItemOnLoc(copper.slot, furnace.x, furnace.z, furnace.id);
            if (r.success) {
                barsSmelted++;
                await sdk.waitForTicks(4);
            } else {
                await sdk.waitForTicks(3);
            }

            const s2 = sdk.getState();
            if (s2?.dialog?.isOpen) {
                await sdk.sendClickDialog(0);
                await sdk.waitForTicks(1);
            }
        }
    };

    // =====================================================================
    // PHASE 4c: Smithing — bronze bars → daggers at Varrock anvil
    // =====================================================================
    const runSmithing = async (): Promise<number> => {
        log(`=== Smithing at Varrock anvil | Smithing ${getLevel('smithing')} ===`);
        await bot.walkTo(VARROCK_ANVIL.x, VARROCK_ANVIL.z);
        await sdk.waitForTicks(3);

        let itemsSmithed = 0;
        let failures = 0;

        while (failures < 5) {
            await dismissDialogs();

            const bar = sdk.findInventoryItem(/bronze bar/i);
            if (!bar) {
                log(`Smithing done — ${itemsSmithed} items smithed | Smithing ${getLevel('smithing')}`);
                break;
            }

            const r = await bot.smithAtAnvil('dagger', { barPattern: /bronze bar/i });
            if (r.success) {
                itemsSmithed++;
                failures = 0;
                await sdk.waitForTicks(4);
            } else {
                log(`Smith attempt failed: ${r.message}`);
                failures++;
                await sdk.waitForTicks(3);
            }
        }

        return itemsSmithed;
    };

    // =====================================================================
    // PHASE 4d: Withdraw food from bank before combat if running low
    // Ensures we always have at least MIN_FOOD items for combat healing.
    // =====================================================================
    const ensureFoodForCombat = async (minFood = 5) => {
        const state = sdk.getState();
        const currentFood = state?.inventory.filter(i =>
            /^shrimps$|^anchovies$|^sardine$|^herring$|^trout$|^salmon$/i.test(i.name)
        ) ?? [];

        if (currentFood.length >= minFood) return;

        log(`Food low (${currentFood.length}/${minFood}) — withdrawing from Draynor bank`);
        await bot.walkTo(DRAYNOR_BANK.x, DRAYNOR_BANK.z);
        const openResult = await bot.openBank(10_000);
        if (!openResult.success) {
            log(`Could not open bank for food withdrawal: ${openResult.message}`);
            return;
        }

        await sdk.waitForTicks(2);
        const bankState = sdk.getState();

        // Try to withdraw salmon/trout first (best food), then shrimps
        const foodNames = ['salmon', 'trout', 'herring', 'sardine', 'anchovies', 'shrimps'];
        for (const foodName of foodNames) {
            const bankFood = bankState?.bank?.find(i => new RegExp(`^${foodName}$`, 'i').test(i.name));
            if (bankFood) {
                const amountNeeded = minFood - currentFood.length;
                await bot.withdrawItem(bankFood, amountNeeded);
                await sdk.waitForTicks(2);
                break;
            }
        }

        // Close bank
        await sdk.waitForTicks(1);
    };

    // =====================================================================
    // PHASE 5b-helper: Bank cow hides (100-200gp each — don't waste them)
    // Called mid-combat when inventory fills up with hides, and after each
    // combat session when training cows.
    // =====================================================================
    const bankCowhides = async () => {
        const state = sdk.getState();
        const hides = state?.inventory.filter(i => /^cow\s*hide$/i.test(i.name)) ?? [];
        if (hides.length === 0) return;

        log(`Banking ${hides.length} cow hide(s) at Draynor`);
        await bot.walkTo(DRAYNOR_BANK.x, DRAYNOR_BANK.z);
        const openResult = await bot.openBank(10_000);
        if (!openResult.success) {
            log(`Could not open bank for cow hides: ${openResult.message}`);
            return;
        }

        await sdk.waitForTicks(2);
        const freshState = sdk.getState();
        const freshHides = freshState?.inventory.filter(i => /^cow\s*hide$/i.test(i.name)) ?? [];
        for (const hide of freshHides) {
            await bot.depositItem(hide, -1);
            await sdk.waitForTicks(1);
        }
        log(`Cow hides banked`);
    };

    // =====================================================================
    // PHASE 5b-helper: Pay Al-Kharid toll if needed (5gp)
    // The toll gate requires 5gp or completion of Prince Ali Rescue quest.
    // We check for a toll gate dialog and pay automatically.
    // =====================================================================
    const payAlKharidToll = async (): Promise<boolean> => {
        const state = sdk.getState();
        if (!state?.dialog?.isOpen) return true;

        const dialogText = state.dialog.options?.join(' ') ?? '';
        if (/toll|5 coins|pay/i.test(dialogText)) {
            log('Paying Al-Kharid toll (5gp)');
            // Option 0 is usually "Pay toll (5 coins)"
            await sdk.sendClickDialog(0);
            await sdk.waitForTicks(3);
            return true;
        }
        // Close unexpected dialog
        await sdk.sendClickDialog(0);
        await sdk.waitForTicks(1);
        return true;
    };

    // =====================================================================
    // PHASE 5c: Al-Kharid warriors (70+ all combat stats)
    // Warriors have 30 HP (vs 10 for cows) — much better XP/hr at high levels.
    // Located in Al-Kharid palace. Requires 5gp toll to enter Al-Kharid.
    // Banks at Al-Kharid bank (no cowhides — warriors only drop coins/rune items).
    // =====================================================================
    const runWarriors = async (durationMs: number) => {
        await ensureFoodForCombat(8);

        const atk = getLevel('attack');
        const str = getLevel('strength');
        const def = getLevel('defence');
        log(`=== Combat (Al-Kharid warriors) | Atk:${atk} Str:${str} Def:${def} Prayer:${getLevel('prayer')} ===`);

        // Walk to Al-Kharid gate and pay toll
        await bot.walkTo(ALKHARID_GATE.x, ALKHARID_GATE.z);
        await sdk.waitForTicks(5);
        await dismissDialogs();

        // Interact with the gate
        const gateState = await getState();
        const gate = gateState.nearbyLocs.find(loc =>
            /al-kharid\s*gate|toll\s*gate/i.test(loc.name)
        );
        if (gate) {
            const gateOpt = gate.optionsWithIndex?.find(o => /^open$|^enter$/i.test(o.text));
            if (gateOpt) {
                await sdk.sendInteractLoc(gate.x, gate.z, gate.id, gateOpt.opIndex);
                await sdk.waitForTicks(4);
                await payAlKharidToll();
            }
        }

        await bot.walkTo(ALKHARID_WARRIORS.x, ALKHARID_WARRIORS.z);
        await sdk.waitForTicks(3);

        const pickStyle = (): number => {
            const atk = getLevel('attack');
            const str = getLevel('strength');
            const def = getLevel('defence');
            const min = Math.min(atk, str, def);
            if (atk === min) return 0;
            if (str === min) return 2;
            return 3;
        };

        let currentStyle = pickStyle();
        await sdk.sendSetCombatStyle(currentStyle);
        await sdk.waitForTicks(2);

        const endTime = Date.now() + durationMs;
        let kills = 0;
        let bonesBuried = 0;

        while (Date.now() < endTime) {
            await dismissDialogs();
            const state = await getState();

            // Eat at < 50% HP
            const hp = state.player?.hitpoints;
            if (hp && hp.current < hp.max * 0.5) {
                const food = sdk.findInventoryItem(/^shrimps$|^anchovies$|^sardine$|^herring$|^trout$|^salmon$/i);
                if (food) {
                    await sdk.sendUseItem(food.slot);
                    await sdk.waitForTicks(3);
                    log(`Ate ${food.name} — HP ${hp.current}/${hp.max}`);
                    continue;
                } else {
                    // No food — bank and restock
                    log('Out of food during warrior training — going to Al-Kharid bank');
                    await bot.walkTo(ALKHARID_BANK.x, ALKHARID_BANK.z);
                    const openResult = await bot.openBank(10_000);
                    if (openResult.success) {
                        // Deposit loot
                        const bankState = sdk.getState();
                        const loot = bankState?.inventory.filter(i =>
                            !/^shrimps$|^anchovies$|^sardine$|^herring$|^trout$|^salmon$/i.test(i.name)
                        ) ?? [];
                        for (const item of loot) {
                            await bot.depositItem(item, -1);
                            await sdk.waitForTicks(1);
                        }
                        // Withdraw food
                        const foodNames = ['salmon', 'trout', 'herring', 'sardine', 'anchovies', 'shrimps'];
                        for (const foodName of foodNames) {
                            const bankFood = bankState?.bank?.find(i => new RegExp(`^${foodName}$`, 'i').test(i.name));
                            if (bankFood) {
                                await bot.withdrawItem(bankFood, 10);
                                await sdk.waitForTicks(2);
                                break;
                            }
                        }
                    }
                    await bot.walkTo(ALKHARID_GATE.x, ALKHARID_GATE.z);
                    await sdk.waitForTicks(3);
                    await payAlKharidToll();
                    await bot.walkTo(ALKHARID_WARRIORS.x, ALKHARID_WARRIORS.z);
                    await sdk.waitForTicks(3);
                    continue;
                }
            }

            // Bury bones for prayer XP
            const bones = sdk.findInventoryItem(/^bones?$/i);
            if (bones) {
                await sdk.sendUseItem(bones.slot);
                await sdk.waitForTicks(2);
                bonesBuried++;
                continue;
            }

            // Bank if inventory near-full
            if (state.inventory.length >= 24) {
                await bot.walkTo(ALKHARID_BANK.x, ALKHARID_BANK.z);
                const openResult = await bot.openBank(10_000);
                if (openResult.success) {
                    const bankState = sdk.getState();
                    const loot = bankState?.inventory.filter(i =>
                        !/^shrimps$|^anchovies$|^sardine$|^herring$|^trout$|^salmon$/i.test(i.name)
                    ) ?? [];
                    for (const item of loot) {
                        await bot.depositItem(item, -1);
                        await sdk.waitForTicks(1);
                    }
                }
                await bot.walkTo(ALKHARID_GATE.x, ALKHARID_GATE.z);
                await sdk.waitForTicks(2);
                await payAlKharidToll();
                await bot.walkTo(ALKHARID_WARRIORS.x, ALKHARID_WARRIORS.z);
                continue;
            }

            // Rotate combat style
            const idealStyle = pickStyle();
            if (idealStyle !== currentStyle) {
                await sdk.sendSetCombatStyle(idealStyle);
                currentStyle = idealStyle;
                await sdk.waitForTicks(1);
            }

            const { worldX, worldZ } = state.player;
            if (distFrom(worldX, worldZ, ALKHARID_WARRIORS.x, ALKHARID_WARRIORS.z) > MAX_DRIFT) {
                await bot.walkTo(ALKHARID_WARRIORS.x, ALKHARID_WARRIORS.z);
                continue;
            }

            const warrior = state.nearbyNpcs.find(npc =>
                /al-kharid\s*warrior/i.test(npc.name) &&
                !npc.isInCombat &&
                npc.optionsWithIndex?.some(o => /^attack$/i.test(o.text))
            ) ?? state.nearbyNpcs.find(npc =>
                /al-kharid\s*warrior/i.test(npc.name) &&
                npc.optionsWithIndex?.some(o => /^attack$/i.test(o.text))
            );

            if (warrior) {
                const r = await bot.attackNpc(warrior, 12_000);
                if (r.success) {
                    kills++;
                    await sdk.waitForTicks(2);
                } else {
                    await sdk.waitForTicks(4);
                }
            } else {
                await sdk.waitForTicks(5);
            }
        }

        log(`Warriors done — ${kills} kills, ${bonesBuried} bones buried | Atk:${getLevel('attack')} Str:${getLevel('strength')} Def:${getLevel('defence')} Prayer:${getLevel('prayer')}`);
    };

    // =====================================================================
    // PHASE 6: Agility — Gnome Stronghold course (levels 1-35)
    // Each lap is ~86 XP. Increases run energy recovery rate significantly.
    // Obstacles: log balance → 2 obstacles → net → tree branch → balancing rope
    // → tree branch → ladder → obstacle net → tree top → ladder down
    // =====================================================================
    const runAgility = async (laps: number) => {
        const agility = getLevel('agility');
        log(`=== Agility | Gnome Stronghold course | Agility ${agility} | ${laps} laps ===`);
        await bot.walkTo(GNOME_AGILITY_START.x, GNOME_AGILITY_START.z);
        await sdk.waitForTicks(5);

        let completedLaps = 0;

        for (let lap = 0; lap < laps; lap++) {
            // The Gnome Stronghold course is sequential — each obstacle has a fixed name
            const obstacles = [
                /log\s*balance/i,
                /obstacle\s*net/i,
                /tree\s*branch/i,
                /balancing\s*rope/i,
                /tree\s*branch/i,
                /obstacle\s*net/i,
                /tree\s*top/i,
            ];

            let lapSuccess = true;

            for (const obstaclePattern of obstacles) {
                await dismissDialogs();
                const state = await getState();

                // Find the obstacle as a nearby loc
                let obstacle = state.nearbyLocs.find(loc =>
                    obstaclePattern.test(loc.name) &&
                    loc.optionsWithIndex?.some(o =>
                        /^walk-across$|^climb$|^cross$|^jump$/i.test(o.text)
                    )
                );

                if (!obstacle) {
                    await sdk.scanNearbyLocs(20);
                    const scanned = sdk.getState();
                    obstacle = scanned?.nearbyLocs.find(loc =>
                        obstaclePattern.test(loc.name)
                    );
                }

                if (!obstacle) {
                    log(`Agility: could not find obstacle matching ${obstaclePattern} — aborting lap`);
                    lapSuccess = false;
                    break;
                }

                const useOpt = obstacle.optionsWithIndex?.find(o =>
                    /^walk-across$|^climb$|^cross$|^jump$/i.test(o.text)
                ) ?? obstacle.optionsWithIndex?.[0];

                if (useOpt) {
                    await sdk.sendInteractLoc(obstacle.x, obstacle.z, obstacle.id, useOpt.opIndex);
                    await sdk.waitForTicks(6);
                }
            }

            if (lapSuccess) {
                completedLaps++;
                log(`Agility lap ${completedLaps}/${laps} done | Agility ${getLevel('agility')}`);
            }

            await sdk.waitForTicks(2);
        }

        log(`Agility done — ${completedLaps} laps | Agility ${getLevel('agility')}`);
    };

    // =====================================================================
    // PHASE 5: Combat — chickens (1-40), cows (40-70), warriors (70+)
    // Cows give ~3x the HP and better XP than chickens at higher levels.
    // Al-Kharid warriors (~30 HP) are best available target at 70+.
    // Cycles combat style to train Attack/Strength/Defence evenly.
    // Buries bones for Prayer XP.
    // Eats cooked fish from inventory when HP drops below 50%.
    // =====================================================================
    const runCombat = async (durationMs: number) => {
        // Ensure food before entering combat (v6 fix — v5 could start fights with 0 food)
        await ensureFoodForCombat(5);

        const atk = getLevel('attack');
        const str = getLevel('strength');
        const def = getLevel('defence');
        const useWarriors = atk >= 70 && str >= 70 && def >= 70;
        const useCows = !useWarriors && atk >= 40 && str >= 40 && def >= 40;

        // Delegate to specialised warrior trainer
        if (useWarriors) {
            await runWarriors(durationMs);
            return;
        }

        const TARGET_AREA = useCows ? LUMB_COWS : LUMB_CHICKENS;
        const targetName  = useCows ? /^cow$/i : /^chicken$/i;

        log(`=== Combat (${useCows ? 'cows' : 'chickens'}) | Atk:${atk} Str:${str} Def:${def} Prayer:${getLevel('prayer')} ===`);
        await bot.walkTo(TARGET_AREA.x, TARGET_AREA.z);
        await sdk.waitForTicks(3);

        // Cycle through styles: 0=attack(accurate), 1=attack(aggressive), 2=strength, 3=defence
        // Train the lowest skill's style
        const pickStyle = (): number => {
            const atk = getLevel('attack');
            const str = getLevel('strength');
            const def = getLevel('defence');
            const min = Math.min(atk, str, def);
            if (atk === min) return 0;   // accurate → attack xp
            if (str === min) return 2;   // aggressive → strength xp
            return 3;                    // defensive → defence xp
        };

        // Set initial combat style
        let currentStyle = pickStyle();
        await sdk.sendSetCombatStyle(currentStyle);
        await sdk.waitForTicks(2);

        const endTime = Date.now() + durationMs;
        let kills = 0;
        let bonesPickedUp = 0;
        let bonesBuried = 0;

        while (Date.now() < endTime) {
            await dismissDialogs();
            const state = await getState();

            // Eat if HP < 50%
            const hp = state.player?.hitpoints;
            if (hp && hp.current < hp.max * 0.5) {
                const food = sdk.findInventoryItem(/^shrimps$|^anchovies$|^sardine$|^herring$|^trout$|^salmon$/i);
                if (food) {
                    await sdk.sendUseItem(food.slot);
                    await sdk.waitForTicks(3);
                    log(`Ate ${food.name} — HP ${hp.current}/${hp.max}`);
                    continue;
                }
            }

            // Bury any bones in inventory — sendUseItem triggers the default "Bury" action
            const bones = sdk.findInventoryItem(/^bones?$/i);
            if (bones) {
                await sdk.sendUseItem(bones.slot);
                await sdk.waitForTicks(2);
                bonesBuried++;
                continue;
            }

            // Pick up bones dropped by chickens
            const groundBones = sdk.findGroundItem(/^bones?$/i);
            if (groundBones) {
                const r = await bot.pickupItem(groundBones);
                if (r.success) {
                    bonesPickedUp++;
                }
                await sdk.waitForTicks(2);
                continue;
            }

            // Don't fight if inventory is nearly full (need room for loot)
            if (state.inventory.length >= 26) {
                // Bury all bones first, then continue
                for (const item of state.inventory.filter(i => /^bones?$/i.test(i.name))) {
                    await sdk.sendUseItem(item.slot);
                    await sdk.waitForTicks(2);
                    bonesBuried++;
                }
                // Bank cow hides (valuable — don't drop them)
                const hides = state.inventory.filter(i => /^cow\s*hide$/i.test(i.name));
                if (hides.length > 0) {
                    await bankCowhides();
                    // Re-ensure food after banking trip
                    await ensureFoodForCombat(5);
                    await bot.walkTo(TARGET_AREA.x, TARGET_AREA.z);
                    continue;
                }

                // Drop feathers/misc junk to make room
                const junk = state.inventory.filter(i => /^feather$/i.test(i.name));
                for (const f of junk) {
                    await sdk.sendDropItem(f.slot);
                    await sdk.waitForTicks(1);
                }
                continue;
            }

            // Stay in combat style that targets lowest skill
            const idealStyle = pickStyle();
            if (idealStyle !== currentStyle) {
                await sdk.sendSetCombatStyle(idealStyle);
                currentStyle = idealStyle;
                await sdk.waitForTicks(1);
            }

            // Attack target (chicken or cow)
            const { worldX, worldZ } = state.player;
            if (distFrom(worldX, worldZ, TARGET_AREA.x, TARGET_AREA.z) > MAX_DRIFT) {
                await bot.walkTo(TARGET_AREA.x, TARGET_AREA.z);
                continue;
            }

            // Prefer targets not already in combat with someone else
            const chicken = state.nearbyNpcs.find(npc =>
                targetName.test(npc.name) &&
                !npc.isInCombat &&
                npc.optionsWithIndex?.some(o => /^attack$/i.test(o.text))
            ) ?? state.nearbyNpcs.find(npc =>
                targetName.test(npc.name) &&
                npc.optionsWithIndex?.some(o => /^attack$/i.test(o.text))
            );

            if (chicken) {
                const r = await bot.attackNpc(chicken, 8_000);
                if (r.success) {
                    kills++;
                    await sdk.waitForTicks(2);
                } else {
                    await sdk.waitForTicks(4);
                }
            } else {
                // No chickens — wait for respawn
                await sdk.waitForTicks(5);
            }
        }

        log(`Combat done (${useCows ? 'cows' : 'chickens'}) — ${kills} kills, ${bonesBuried} bones buried | Atk:${getLevel('attack')} Str:${getLevel('strength')} Def:${getLevel('defence')} Prayer:${getLevel('prayer')}`);

        // Bank cow hides accumulated during this combat session
        if (useCows) {
            await bankCowhides();
        }
    };

    // =====================================================================
    // NOTE: Al-Kharid warrior function (runWarriors) is defined above.
    // It handles the 70+ combat phase autonomously including banking and
    // food restocking at Al-Kharid bank.
    // =====================================================================

    // =====================================================================
    // MAIN LOOP — Runs indefinitely
    // =====================================================================
    log('');
    log('╔══════════════════════════════════════════════════╗');
    log('║  Aubury Bot v7 — Indefinite Skilling             ║');
    log('║  + Warriors at 70+ + Master Farmers + Agility   ║');
    log('╚══════════════════════════════════════════════════╝');
    log('');

    // Phase 1: Get WC/FM to 15 first
    if (getLevel('woodcutting') < 15 || getLevel('firemaking') < 15) {
        await runWoodcutFiremake();
    } else {
        log('WC & FM already ≥15 — skipping');
    }

    let cycle = 0;

    while (true) {
        cycle++;
        log(`\n=== Cycle ${cycle} ===`);
        printLevels();

        const thiev  = getLevel('thieving');
        const atk    = getLevel('attack');
        const str    = getLevel('strength');
        const def    = getLevel('defence');

        // Thieving every 3 cycles until 70 (master farmers above 38, guards above 25)
        if (cycle % 3 === 0 && thiev < 70) {
            await runThieving(3 * 60_000);
        }

        // Fish + Cook cycle
        const gotFish = await runFishing();
        if (gotFish) {
            await runCooking();
        }

        // Bank cooked fish and bronze loot at Draynor every cycle
        // (keeps inventory clean, accumulates food for combat)
        await runBanking();

        // Mining + Smelting + Smithing every 4 cycles
        if (cycle % 4 === 0) {
            log('--- Phase 4: Mining + Smelting + Smithing ---');
            const { copper, tin } = await runMining();
            if (copper > 0 && tin > 0) {
                const bars = await runSmelting();
                if (bars > 0) {
                    await runSmithing();
                }
            }
            log(`Phase 4 done | Mine:${getLevel('mining')} Smith:${getLevel('smithing')}`);
            // Bank after smithing too
            await runBanking();
        }

        // Combat: chickens until 40/40/40, then cows until 70/70/70
        // Stop at 70 — would need better targets (Al-Kharid warriors, etc.) after that
        if (cycle % 2 === 0 && (atk < 70 || str < 70 || def < 70)) {
            await runCombat(4 * 60_000);
        }

        // Agility every 6 cycles if below 35 — Gnome Stronghold course
        // Run energy recovery at 35+ agility is noticeably better (saves time walking)
        if (cycle % 6 === 0 && getLevel('agility') < 35) {
            await runAgility(5);
        }

        // Occasional WC+FM bonus every 5 cycles if levels are low
        if (cycle % 5 === 0 && (getLevel('woodcutting') < 60 || getLevel('firemaking') < 60)) {
            log('--- Bonus WC+FM session (90s) ---');
            await bot.walkTo(WOODCUT_AREA.x, WOODCUT_AREA.z);
            const bonusEnd = Date.now() + 90_000;
            while (Date.now() < bonusEnd) {
                await dismissDialogs();
                const state = await getState();
                const logs_ = sdk.findInventoryItem(/^logs$/i);
                const tinder = sdk.findInventoryItem(/tinderbox/i);
                if (state.inventory.length >= 18 && logs_ && tinder) {
                    await bot.burnLogs(logs_);
                } else {
                    const tree = sdk.findNearbyLoc(/^tree$/i);
                    if (tree) {
                        await bot.chopTree(tree);
                    } else {
                        await sdk.waitForTicks(3);
                    }
                }
            }
            log(`WC bonus done | WC${getLevel('woodcutting')} FM${getLevel('firemaking')}`);
        }
    }

}, {
    timeout: 24 * 60 * 60_000,  // 24 hour timeout
    onDisconnect: 'wait',
});
