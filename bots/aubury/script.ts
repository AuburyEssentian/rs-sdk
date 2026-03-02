/**
 * Aubury's autonomous bot script — v3
 *
 * Strategy: Prioritise skills by XP/hr efficiency.
 * Phase 1: WC + FM to 15 (quick start)
 * Phase 2: Thieving at Draynor (men, then guards, then masters)
 * Phase 3: Fishing + Cooking loop (continuous)
 * Phase 4: Mining + Smelting + Smithing (copper+tin → bronze bars → items)
 *
 * Runs indefinitely. Picks the best available activity each cycle.
 */
import { runScript } from '../../sdk/runner';

await runScript(async (ctx) => {
    const { bot, sdk, log } = ctx;

    // === CONFIGURATION ===
    const WOODCUT_AREA    = { x: 3200, z: 3220 };  // Lumbridge trees
    const FISHING_AREA    = { x: 3087, z: 3230 };  // Draynor Village shrimps
    const COOK_RANGE_XZ   = { x: 3211, z: 3215 };  // Range near Bob's Axes, Lumbridge
    const THIEVE_AREA     = { x: 3094, z: 3245 };  // Draynor Village men
    const VARROCK_MINE    = { x: 3285, z: 3365 };  // SE Varrock mine (copper + tin)
    const LUMB_FURNACE    = { x: 3225, z: 3256 };  // Lumbridge furnace
    const VARROCK_ANVIL   = { x: 3188, z: 3421 };  // Varrock west smithy anvil
    const MAX_DRIFT       = 18;

    // Rock IDs at SE Varrock mine (from learnings/mining.md)
    const COPPER_ROCK_IDS = [2090, 2091];
    const TIN_ROCK_IDS    = [2093, 2094];

    await sdk.waitForReady(30_000);
    log('Game state ready!');

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
        log(`Levels | WC:${getLevel('woodcutting')} FM:${getLevel('firemaking')} Fish:${getLevel('fishing')} Cook:${getLevel('cooking')} Thiev:${getLevel('thieving')} Mine:${getLevel('mining')} Smith:${getLevel('smithing')}`);
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
    // =====================================================================
    const runThieving = async (durationMs: number) => {
        const thievingLvl = getLevel('thieving');
        log(`=== Thieving (level ${thievingLvl}, ${durationMs / 1000}s) ===`);

        await bot.walkTo(THIEVE_AREA.x, THIEVE_AREA.z);

        const endTime = Date.now() + durationMs;
        let pickpockets = 0;

        while (Date.now() < endTime) {
            await dismissDialogs();
            const state = await getState();

            if (state.inventory.length >= 26) {
                const coins = state.inventory.filter(i => /^coins$/i.test(i.name));
                for (const c of coins) {
                    await sdk.sendDropItem(c.slot);
                    await sdk.waitForTicks(1);
                }
                continue;
            }

            const { worldX, worldZ } = state.player;
            if (distFrom(worldX, worldZ, THIEVE_AREA.x, THIEVE_AREA.z) > MAX_DRIFT) {
                await bot.walkTo(THIEVE_AREA.x, THIEVE_AREA.z);
                continue;
            }

            const target = state.nearbyNpcs.find(npc =>
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
                // Wait for mining to complete (animation ~4 ticks, rock may deplete)
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

            // Find furnace nearby
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

            // Use copper ore on furnace — auto-consumes 1 tin from inventory
            const r = await sdk.sendUseItemOnLoc(copper.slot, furnace.x, furnace.z, furnace.id);
            if (r.success) {
                barsSmelted++;
                await sdk.waitForTicks(4); // ~2.5s per bar
            } else {
                await sdk.waitForTicks(3);
            }

            // Handle any smelting dialog (confirm interface)
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
    // MAIN LOOP — Runs indefinitely
    // =====================================================================
    log('');
    log('╔══════════════════════════════════════════╗');
    log('║  Aubury Bot v3 — Indefinite Skilling     ║');
    log('╚══════════════════════════════════════════╝');
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
        const fish   = getLevel('fishing');
        const cook   = getLevel('cooking');
        const mining = getLevel('mining');
        const smith  = getLevel('smithing');

        // Thieving every 3 cycles if not maxed
        if (cycle % 3 === 0 && thiev < 50) {
            await runThieving(3 * 60_000);
        }

        // Always do a fish+cook cycle
        const gotFish = await runFishing();
        if (gotFish) {
            await runCooking();
        }

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
