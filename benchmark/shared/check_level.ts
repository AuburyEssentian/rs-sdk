/**
 * Verification script: connects to the bot via SDK (observe mode)
 * and checks the current Woodcutting level.
 *
 * Writes a continuous reward to /logs/verifier/reward.txt:
 *   reward = min(current_level / 10, 1.0)
 */
import { BotSDK } from '/app/sdk/index';
import { writeFileSync, mkdirSync } from 'fs';

const TARGET_LEVEL = 10;

async function main() {
    const sdk = new BotSDK({
        botUsername: 'agent',
        password: 'test',
        gatewayUrl: 'ws://localhost:7780',
        connectionMode: 'observe',
        autoLaunchBrowser: false,
        autoReconnect: false,
    });

    try {
        await sdk.connect();

        // Wait for state to arrive
        await sdk.waitForCondition(s => s.inGame && s.skills.length > 0, 15000);

        const wc = sdk.getSkill('Woodcutting');
        const level = wc?.level ?? 1;
        const xp = wc?.experience ?? 0;

        console.log(`Woodcutting: level ${level}, xp ${xp}`);

        // Write continuous reward
        const reward = Math.min(level / TARGET_LEVEL, 1.0);
        mkdirSync('/logs/verifier', { recursive: true });
        writeFileSync('/logs/verifier/reward.txt', reward.toString());

        console.log(`Reward: ${reward} (level ${level} / ${TARGET_LEVEL})`);

        if (level >= TARGET_LEVEL) {
            console.log('PASS: Target level reached');
        } else {
            console.log(`FAIL: Need level ${TARGET_LEVEL}, got ${level}`);
        }
    } finally {
        sdk.disconnect();
    }
}

main().catch(err => {
    console.error('Verification error:', err);
    // Write 0 reward on error
    try {
        mkdirSync('/logs/verifier', { recursive: true });
        writeFileSync('/logs/verifier/reward.txt', '0');
    } catch {}
    process.exit(1);
});
