# Dialogs & UI

Successful patterns for handling game dialogs and interfaces.

## Dismissing Level-Up Dialogs

Level-up dialogs block all actions. Dismiss them immediately:

```typescript
if (state.dialog.isOpen) {
    await ctx.sdk.sendClickDialog(0);
    ctx.progress();
    continue;  // Skip rest of loop iteration
}
```

## Dismiss at Arc Start

Always clear blocking UI before starting:

```typescript
await ctx.bot.dismissBlockingUI();
```

## Checking Dialog State

```typescript
const dialog = ctx.state()?.dialog;

// Is any dialog open?
if (dialog.isOpen) { ... }

// Is dialog waiting for input?
if (dialog.isOpen && !dialog.isWaiting) { ... }

// Get available options
for (const opt of dialog.options) {
    console.log(`${opt.index}: ${opt.text}`);
}
```

## Navigating Multi-Step Dialogs

For NPC conversations with choices:

```typescript
// Click through until specific option appears
for (let i = 0; i < 20; i++) {
    const s = ctx.state();
    if (!s?.dialog.isOpen) {
        await new Promise(r => setTimeout(r, 150));
        continue;
    }

    // Look for target option
    const targetOpt = s.dialog.options.find(o => /yes/i.test(o.text));
    if (targetOpt) {
        await ctx.sdk.sendClickDialog(targetOpt.index);
        break;
    }

    // Otherwise click to continue
    await ctx.sdk.sendClickDialog(0);
    await new Promise(r => setTimeout(r, 200));
}
```

## Shop Interfaces

```typescript
// Check if shop is open
if (state.shop.isOpen) { ... }

// Check if any interface is open (bank, shop, etc.)
if (state.interface?.isOpen) { ... }
```

## Toll Gate Pattern

Al Kharid toll gate requires dialog interaction:

```typescript
// Click gate
const gate = ctx.state()?.nearbyLocs.find(l => /gate/i.test(l.name));
const openOpt = gate.optionsWithIndex.find(o => /open/i.test(o.text));
await ctx.sdk.sendInteractLoc(gate.x, gate.z, gate.id, openOpt.opIndex);
await new Promise(r => setTimeout(r, 800));

// Handle dialog
for (let i = 0; i < 20; i++) {
    const s = ctx.state();
    if (!s?.dialog.isOpen) {
        await new Promise(r => setTimeout(r, 150));
        continue;
    }

    const yesOpt = s.dialog.options.find(o => /yes/i.test(o.text));
    if (yesOpt) {
        await ctx.sdk.sendClickDialog(yesOpt.index);
        break;
    }
    await ctx.sdk.sendClickDialog(0);
    await new Promise(r => setTimeout(r, 200));
}
```

## Detecting Stuck in Dialog

If your script makes no progress, check for stuck dialogs:

```typescript
// In your main loop
if (state.dialog.isOpen) {
    ctx.log('Dialog open, dismissing...');
    await ctx.sdk.sendClickDialog(0);
    ctx.progress();  // Mark progress to avoid stall detection
    continue;
}
```
