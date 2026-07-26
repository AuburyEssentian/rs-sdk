import { describe, expect, test } from 'bun:test';

// StateCollector imports the browser client graph. A tiny DOM shim is enough
// for module initialization because these tests exercise collection only.
(globalThis as any).window = {};
(globalThis as any).document = {
    hidden: false,
    body: { appendChild() {}, removeChild() {} },
    addEventListener() {},
    removeEventListener() {},
    getElementById() { return null; },
    createElement(tag: string) {
        if (tag === 'canvas') {
            return {
                width: 0,
                height: 0,
                getContext: () => ({
                    clearRect() {},
                    drawImage() {},
                    getImageData() { return {}; }
                })
            };
        }
        return {};
    }
};

const { BotStateCollector } = await import('./StateCollector.js');
const { default: IfType } = await import('#/config/IfType.js');

function createClient() {
    const skills = new Array(21).fill(1);
    skills[3] = 10;

    const client: any = {
        getClientCycle: () => 100,
        localPlayer: {
            name: 'Tester',
            combatLevel: 3,
            x: 128,
            z: 128,
            faceEntity: 7,
            // Deliberately different: the removed field must never win.
            targetId: 99,
            combatCycle: 120,
            damageCycles: new Int32Array([110, 0, 0, 0]),
            damageValues: new Int32Array([2, 0, 0, 0]),
            primaryAnim: -1,
            spotanimId: -1
        },
        statEffectiveLevel: [...skills],
        statBaseLevel: [...skills],
        mapBuildBaseX: 3200,
        mapBuildBaseZ: 3200,
        minusedlevel: 0,
        runenergy: 100,
        runweight: 0,
        npcCount: 1,
        npcIds: [7],
        npc: {
            7: {
                type: { name: 'Rat', vislevel: 1, op: ['Attack'] },
                x: 256,
                z: 128,
                health: 0,
                totalHealth: 0,
                faceEntity: -1,
                combatCycle: 0,
                primaryAnim: -1,
                spotanimId: -1,
                damageCycles: new Int32Array(4),
                damageValues: new Int32Array(4)
            }
        }
    };
    return client;
}

describe('BotStateCollector combat state', () => {
    test('uses the public tick for damage events and faceEntity for targeting', () => {
        const client = createClient();
        const collector = new BotStateCollector(client);

        (collector as any).collectCombatEvents(12);
        const player = (collector as any).collectPlayerState(12, 100);

        expect(player.combat.targetIndex).toBe(7);
        expect(player.combat.lastDamageTick).toBe(12);
        expect((collector as any).combatEvents[0].tick).toBe(12);
    });

    test('publishes UI-observed and same-tick duplicate messages on newer revisions', () => {
        const client = createClient();
        client.chatText = ['Hello'];
        client.chatUsername = ['Guide'];
        client.chatType = [0];
        client.messageTick = [9_999];
        client.messageSequence = [1];
        const collector = new BotStateCollector(client);

        // UI polling sees the message at server tick 5, but must not consume
        // the publication cursor before an agent-visible state is sent.
        const uiState = collector.collectState(5, false);
        expect(uiState.revision).toBe(0);
        expect(uiState.gameMessages[0]!.observationId).toBeUndefined();
        expect(uiState.combatEvents[0]!.observationId).toBeUndefined();

        const published = collector.collectState(6, true);
        expect(published.revision).toBe(1);
        expect(published.gameMessages[0]).toMatchObject({ tick: 5, observationId: 1 });
        expect(published.combatEvents[0]).toMatchObject({ tick: 5, observationId: 1 });

        // A repeated publication at the same server tick advances revision,
        // while old evidence retains its original observation id.
        const repeated = collector.collectState(6, true);
        expect(repeated).toMatchObject({ tick: 6, revision: 2 });
        expect(repeated.gameMessages[0]!.observationId).toBe(1);

        client.chatText.unshift('Hello');
        client.chatUsername.unshift('Guide');
        client.chatType.unshift(0);
        client.messageTick.unshift(9_999);
        client.messageSequence.unshift(2);
        const sameTickDuplicate = collector.collectState(6, true);

        expect(sameTickDuplicate.revision).toBe(3);
        expect(sameTickDuplicate.gameMessages.map(message => message.observationId)).toEqual([1, 3]);
    });

    test('represents unrevealed NPC health as unknown rather than dead', () => {
        const client = createClient();
        const collector = new BotStateCollector(client);

        const [npc] = (collector as any).collectNearbyNpcs(100);

        expect(npc.hp).toBeNull();
        expect(npc.maxHp).toBeNull();
        expect(npc.healthPercent).toBeNull();
    });

    test('decodes player targets, which the client packs above the npc index space', () => {
        const client = createClient();
        client.localPlayer.faceEntity = 32768 + 3; // player slot 3, not npc 32771

        const collector = new BotStateCollector(client);
        const player = (collector as any).collectPlayerState(1, 100);

        expect(player.combat).toMatchObject({ inCombat: true, targetType: 'player', targetIndex: 3 });
    });

    test('exposes death and respawn transitions with a stable life id', () => {
        const client = createClient();
        const collector = new BotStateCollector(client);

        const alive = (collector as any).collectPlayerState(1, 100);
        client.statEffectiveLevel[3] = 0;
        const dead = (collector as any).collectPlayerState(2, 100);
        client.statEffectiveLevel[3] = 10;
        const respawned = (collector as any).collectPlayerState(3, 100);

        expect(alive).toMatchObject({ isDead: false, lifeId: 1, respawnCount: 0 });
        expect(dead).toMatchObject({ isDead: true, lifeId: 1, lastDeathTick: 2 });
        expect(respawned).toMatchObject({ isDead: false, lifeId: 2, respawnCount: 1 });
    });
});

describe('BotStateCollector combat styles', () => {
    const SELECT_BUTTON = 5;

    /**
     * Install a combat tab shaped like the real ones: a layer holding one
     * select-button per style, each carrying its com_mode value in scriptOperand.
     */
    function defineCombatTab(interfaceId: number, styleCount: number): void {
        const layerId = interfaceId + 100;
        const buttonIds = Array.from({ length: styleCount }, (_, i) => interfaceId + 200 + i);

        (IfType.list as any)[interfaceId] = { id: interfaceId, children: [layerId] };
        (IfType.list as any)[layerId] = { id: layerId, children: buttonIds };
        buttonIds.forEach((id, index) => {
            (IfType.list as any)[id] = { id, buttonType: SELECT_BUTTON, scriptOperand: [index] };
        });
    }

    function collectStyles(tabInterfaceId: number, comMode: number) {
        const client = createClient();
        client.sideIcon = [tabInterfaceId, -1, -1];
        client.var = [];
        client.var[43] = comMode; // com_mode
        return (new BotStateCollector(client) as any).collectCombatStyle();
    }

    test('reads the style table from the combat tab, not the weapon name', () => {
        // combat_stabsword (weapon_stab): a bronze sword's index 2 is aggressive,
        // trains Strength and hits with Slash. Guessing from the name "sword"
        // used to report Controlled/Shared here, which trains nothing it claims.
        defineCombatTab(2276, 4);
        const style = collectStyles(2276, 0);

        expect(style.known).toBeTrue();
        expect(style.tabInterfaceId).toBe(2276);
        expect(style.styles.map((s: any) => `${s.name}/${s.type}/${s.trainsSkills.join('+')}/${s.damageType}`)).toEqual([
            'Stab/Accurate/Attack/Stab',
            'Lunge/Aggressive/Strength/Stab',
            'Slash/Aggressive/Strength/Slash',
            'Block/Defensive/Defence/Stab'
        ]);
    });

    test('separates the two sword tabs: scimitars really are controlled at index 2', () => {
        defineCombatTab(2423, 4); // combat_hacksword -> weapon_slash_table
        const style = collectStyles(2423, 2);

        expect(style.styles[2]).toMatchObject({
            name: 'Lunge',
            type: 'Controlled',
            trainsSkills: ['Attack', 'Strength', 'Defence'],
            damageType: 'Stab'
        });
        expect(style.currentStyle).toBe(2);
    });

    test('reports longrange as training Ranged and Defence', () => {
        defineCombatTab(1764, 3); // combat_bow
        const style = collectStyles(1764, 2);

        expect(style.styles[2]).toMatchObject({
            name: 'Longrange',
            type: 'Longrange',
            trainsSkills: ['Ranged', 'Defence'],
            damageType: 'Ranged'
        });
    });

    test('clamps com_mode to the styles the tab actually has, as the server does', () => {
        defineCombatTab(425, 3); // combat_blunt has 3 styles
        expect(collectStyles(425, 3).currentStyle).toBe(2);
    });

    test('says unknown rather than guessing when the tab is unrecognised', () => {
        defineCombatTab(6666, 2);
        const style = collectStyles(6666, 0);

        expect(style.known).toBeFalse();
        expect(style.styles).toEqual([
            { index: 0, name: 'Style 0', type: 'Unknown', trainsSkills: [], damageType: 'Unknown' },
            { index: 1, name: 'Style 1', type: 'Unknown', trainsSkills: [], damageType: 'Unknown' }
        ]);
    });
});
