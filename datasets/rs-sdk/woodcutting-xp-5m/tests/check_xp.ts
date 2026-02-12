/**
 * Verification: report raw Woodcutting XP as reward.
 * Writes XP to reward.json: {"xp": <number>}
 * Writes normalized reward to reward.txt for Harbor compatibility.
 */
import { BotSDK } from '/app/sdk/index';
import { writeFileSync, mkdirSync } from 'fs';

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
        await sdk.waitForCondition(s => s.inGame && s.skills.length > 0, 15000);

        const wc = sdk.getSkill('Woodcutting');
        const level = wc?.level ?? 1;
        const xp = wc?.experience ?? 0;

        console.log(`Woodcutting: level ${level}, xp ${xp}`);

        mkdirSync('/logs/verifier', { recursive: true });

        // Write structured reward with raw XP
        writeFileSync('/logs/verifier/reward.json', JSON.stringify({ xp, level }));

        // Also write xp as the scalar reward for easy comparison
        writeFileSync('/logs/verifier/reward.txt', xp.toString());

        console.log(`Reward: xp=${xp}, level=${level}`);
    } finally {
        sdk.disconnect();
    }
}

main().catch(err => {
    console.error('Verification error:', err);
    try {
        mkdirSync('/logs/verifier', { recursive: true });
        writeFileSync('/logs/verifier/reward.txt', '0');
        writeFileSync('/logs/verifier/reward.json', JSON.stringify({ xp: 0, level: 1, error: err.message }));
    } catch {}
    process.exit(1);
});
