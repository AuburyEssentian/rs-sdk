import ObjType from '../engine/src/cache/config/ObjType.js';
import fs from 'fs';
import path from 'path';

// Load items from cache
const cacheDir = path.resolve(import.meta.dirname, '../engine/data/pack');
ObjType.load(cacheDir);

console.log(`Loaded ${ObjType.count} items`);

// Extract all items with useful properties
const items = [];

for (let id = 0; id < ObjType.count; id++) {
    const obj = ObjType.get(id);
    if (!obj) continue;

    items.push({
        id: id,
        debugname: (obj as any).debugname,
        name: obj.name,
        desc: obj.desc,
        cost: obj.cost,
        stackable: obj.stackable,
        tradeable: obj.tradeable,
        members: obj.members,
        weight: obj.weight,
        category: obj.category,
        wearpos: obj.wearpos,
        wearpos2: obj.wearpos2,
        wearpos3: obj.wearpos3,
        // Ground options
        op: obj.op,
        // Inventory options
        iop: obj.iop,
    });
}

// Write to JSON file
const outputPath = path.resolve(import.meta.dirname, '../data/items.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(items, null, 2));

console.log(`Wrote ${items.length} items to ${outputPath}`);

// Also print summary
const tradeable = items.filter(i => i.tradeable).length;
const stackable = items.filter(i => i.stackable).length;
const equipable = items.filter(i => i.wearpos !== -1).length;
const members = items.filter(i => i.members).length;

console.log(`\nSummary:`);
console.log(`  Total items: ${items.length}`);
console.log(`  Tradeable: ${tradeable}`);
console.log(`  Stackable: ${stackable}`);
console.log(`  Equipable: ${equipable}`);
console.log(`  Members-only: ${members}`);
