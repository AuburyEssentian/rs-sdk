import { runArc } from '../../../arc-runner';

runArc({
    characterName: 'david_3',
    arcName: 'simple-combat',
    goal: 'Simple combat test',
    timeLimit: 2 * 60_000, // 2 minutes
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
    ctx.log(`Position: (${state?.player?.worldX}, ${state?.player?.worldZ})`);

    // Check combat stats
    const atk = state?.skills.find(s => s.name === 'Attack')?.baseLevel || 1;
    const str = state?.skills.find(s => s.name === 'Strength')?.baseLevel || 1;
    const def = state?.skills.find(s => s.name === 'Defence')?.baseLevel || 1;
    ctx.log(`Combat stats: Atk ${atk}, Str ${str}, Def ${def}`);

    // Set combat style to train lowest stat
    let style = 0;
    let styleName = 'Attack';
    if (str <= atk && str <= def) {
        style = 1;
        styleName = 'Strength';
    } else if (def <= atk && def < str) {
        style = 3;
        styleName = 'Defence';
    }
    await ctx.sdk.sendSetCombatStyle(style);
    ctx.log(`Combat style set to ${styleName}`);

    // Equip sword if needed
    const sword = state?.inventory.find(i => /bronze sword/i.test(i.name));
    if (sword) {
        ctx.log('Equipping bronze sword...');
        await ctx.bot.equipItem(/bronze sword/i);
        await new Promise(r => setTimeout(r, 500));
    }

    // Combat loop
    let loopCount = 0;
    while (true) {
        loopCount++;
        const s = ctx.state();
        if (!s) continue;

        // Handle dialogs
        if (s.dialog.isOpen) {
            ctx.log('Dismissing dialog');
            await ctx.sdk.sendClickDialog(0);
            ctx.progress();
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // If in combat, wait
        const inCombat = s.combat?.inCombat ?? false;
        const isAnimating = s.player?.animId !== -1;
        if (inCombat || isAnimating) {
            ctx.progress();
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // Find and attack goblin
        const goblin = s.nearbyNpcs
            .filter(n => /goblin/i.test(n.name))
            .filter(n => !n.inCombat)
            .sort((a, b) => a.distance - b.distance)[0];

        if (goblin) {
            try {
                await ctx.bot.attackNpc(/goblin/i);
                ctx.progress();
            } catch (err) {
                ctx.log('Attack failed, retrying...');
            }
        } else {
            // Pick up nearby loot
            const groundItems = ctx.sdk.getGroundItems?.() || [];
            const loot = groundItems.filter(i => i.distance < 5).slice(0, 2);
            for (const item of loot) {
                try {
                    await ctx.bot.pickupItem(item);
                } catch {}
            }
        }

        // Log progress every 30 loops
        if (loopCount % 30 === 0) {
            const curAtk = s.skills.find(s => s.name === 'Attack')?.baseLevel || 1;
            const curStr = s.skills.find(s => s.name === 'Strength')?.baseLevel || 1;
            const curDef = s.skills.find(s => s.name === 'Defence')?.baseLevel || 1;
            ctx.log(`Loop ${loopCount}: Atk ${curAtk}, Str ${curStr}, Def ${curDef}`);
        }

        await new Promise(r => setTimeout(r, 500));
    }
});
