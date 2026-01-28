import { runArc } from '../../../arc-runner';

// Goblin area west of Lumbridge - lots of level 2 goblins
const GOBLIN_AREA = { x: 3146, z: 3233 };

runArc({
    characterName: 'david_3',
    arcName: 'goblin-combat',
    goal: 'Train combat by fighting goblins',
    timeLimit: 5 * 60_000, // 5 minutes
    stallTimeout: 30_000,
    launchOptions: {
        useSharedBrowser: false,
    },
}, async (ctx) => {
    const state = ctx.state();

    // Dismiss any blocking UI first
    await ctx.bot.dismissBlockingUI();
    await new Promise(r => setTimeout(r, 500));

    // Log position
    const startX = state?.player?.worldX || 0;
    const startZ = state?.player?.worldZ || 0;
    ctx.log(`Starting at (${startX}, ${startZ})`);

    // If we're far from goblin area, walk there
    if (startX > 0 && startZ > 0) {
        const dist = Math.sqrt(
            Math.pow(startX - GOBLIN_AREA.x, 2) +
            Math.pow(startZ - GOBLIN_AREA.z, 2)
        );
        if (dist > 50) {
            ctx.log(`Walking to goblin area (${dist.toFixed(0)} tiles away)...`);
            await ctx.bot.walkTo(GOBLIN_AREA.x, GOBLIN_AREA.z);
            ctx.progress();
        }
    }

    // Check combat stats and set initial style
    const startAtk = state?.skills.find(s => s.name === 'Attack')?.baseLevel || 1;
    const startStr = state?.skills.find(s => s.name === 'Strength')?.baseLevel || 1;
    const startDef = state?.skills.find(s => s.name === 'Defence')?.baseLevel || 1;
    ctx.log(`Combat stats: Atk ${startAtk}, Str ${startStr}, Def ${startDef}`);

    // Set initial combat style to train lowest stat
    let style = 0;
    let styleName = 'Attack';
    if (startStr <= startAtk && startStr <= startDef) {
        style = 1;
        styleName = 'Strength';
    } else if (startDef <= startAtk && startDef < startStr) {
        style = 3;
        styleName = 'Defence';
    }
    await ctx.sdk.sendSetCombatStyle(style);
    ctx.log(`Combat style set to ${styleName}`);

    // Equip sword if in inventory
    const sword = state?.inventory.find(i => /bronze sword/i.test(i.name));
    if (sword) {
        ctx.log('Equipping bronze sword...');
        await ctx.bot.equipItem(/bronze sword/i);
        await new Promise(r => setTimeout(r, 500));
    }

    // Equip shield if in inventory
    const shield = state?.inventory.find(i => /wooden shield/i.test(i.name));
    if (shield) {
        ctx.log('Equipping wooden shield...');
        await ctx.bot.equipItem(/wooden shield/i);
        await new Promise(r => setTimeout(r, 500));
    }

    // Combat loop
    let loopCount = 0;
    let killCount = 0;

    while (true) {
        loopCount++;
        const s = ctx.state();
        if (!s) continue;

        // Handle dialogs (level ups)
        if (s.dialog.isOpen) {
            ctx.log('Dismissing dialog');
            await ctx.sdk.sendClickDialog(0);
            ctx.progress();
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // If in combat, wait
        const inCombat = s.player?.combat?.inCombat ?? false;
        const isAnimating = s.player?.animId !== -1;
        if (inCombat || isAnimating) {
            ctx.progress();
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // Check if we died and respawned at Lumbridge
        const player = s.player;
        if (player && player.worldX > 3200 && player.worldX < 3250 && player.worldZ > 3200 && player.worldZ < 3250) {
            // Re-equip items if needed
            const swordInInv = s.inventory.find(i => /bronze sword/i.test(i.name));
            const shieldInInv = s.inventory.find(i => /wooden shield/i.test(i.name));
            if (swordInInv) {
                ctx.log('Re-equipping bronze sword after death...');
                try { await ctx.bot.equipItem(/bronze sword/i); } catch {}
            }
            if (shieldInInv) {
                ctx.log('Re-equipping wooden shield after death...');
                try { await ctx.bot.equipItem(/wooden shield/i); } catch {}
            }

            // No goblins here - walk back
            const nearbyGoblins = s.nearbyNpcs.filter(n => /goblin/i.test(n.name));
            if (nearbyGoblins.length === 0) {
                ctx.log('No goblins at Lumbridge, walking back...');
                await ctx.bot.walkTo(GOBLIN_AREA.x, GOBLIN_AREA.z);
                ctx.progress();
                continue;
            }
        }

        // Update combat style every 50 loops to train lowest stat
        if (loopCount % 50 === 1) {
            const atk = s.skills.find(sk => sk.name === 'Attack')?.baseLevel || 1;
            const str = s.skills.find(sk => sk.name === 'Strength')?.baseLevel || 1;
            const def = s.skills.find(sk => sk.name === 'Defence')?.baseLevel || 1;

            let newStyle = 0;
            let newStyleName = 'Attack';
            if (str <= atk && str <= def) {
                newStyle = 1;
                newStyleName = 'Strength';
            } else if (def <= atk && def < str) {
                newStyle = 3;
                newStyleName = 'Defence';
            }
            try {
                await ctx.sdk.sendSetCombatStyle(newStyle);
            } catch {}
        }

        // Drop bones if inventory is getting full (keep some space)
        if (s.inventory.length >= 26) {
            const bones = s.inventory.filter(i => /^bones$/i.test(i.name));
            if (bones.length > 5) {
                ctx.log(`Dropping ${Math.min(5, bones.length)} bones (have ${bones.length})...`);
                const toDrop = bones.slice(0, 5);
                for (const bone of toDrop) {
                    await ctx.sdk.sendDropItem(bone.slot);
                    ctx.progress();
                    await new Promise(r => setTimeout(r, 150));
                }
            }
        }

        // Find and attack goblin
        const goblin = s.nearbyNpcs
            .filter(n => /goblin/i.test(n.name))
            .filter(n => !n.inCombat)
            .sort((a, b) => a.distance - b.distance)[0];

        if (goblin) {
            try {
                await ctx.bot.attackNpc(/goblin/i);
                killCount++;
                ctx.progress();
            } catch (err) {
                // Try next goblin
            }
        } else {
            // Pick up nearby loot (skip bones if we have lots)
            const groundItems = ctx.sdk.getGroundItems?.() || [];
            const boneCount = s.inventory.filter(i => /^bones$/i.test(i.name)).length;
            const loot = groundItems
                .filter(i => i.distance < 5)
                .filter(i => boneCount < 10 || !/^bones$/i.test(i.name)) // Only pick bones if we have < 10
                .slice(0, 2);
            for (const item of loot) {
                try {
                    await ctx.bot.pickupItem(item);
                    ctx.progress();
                } catch {}
            }
        }

        // Log progress every 30 loops
        if (loopCount % 30 === 0) {
            const curAtk = s.skills.find(sk => sk.name === 'Attack')?.baseLevel || 1;
            const curStr = s.skills.find(sk => sk.name === 'Strength')?.baseLevel || 1;
            const curDef = s.skills.find(sk => sk.name === 'Defence')?.baseLevel || 1;
            const hp = s.skills.find(sk => sk.name === 'Hitpoints');
            ctx.log(`Loop ${loopCount}: Atk ${curAtk}, Str ${curStr}, Def ${curDef}, HP ${hp?.level}/${hp?.baseLevel}`);
        }

        await new Promise(r => setTimeout(r, 500));
    }
});
