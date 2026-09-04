export const NEON_COLORS = Object.freeze({
    '#00f3ff': Object.freeze({ r: 0, g: 243, b: 255 }),
    '#ff007f': Object.freeze({ r: 255, g: 0, b: 127 }),
    '#39ff14': Object.freeze({ r: 57, g: 255, b: 20 }),
    '#ffaa00': Object.freeze({ r: 255, g: 170, b: 0 }),
    '#b026ff': Object.freeze({ r: 176, g: 38, b: 255 }),
    '#ff3333': Object.freeze({ r: 255, g: 51, b: 51 }),
    '#ffff00': Object.freeze({ r: 255, g: 255, b: 0 }),
    '#ff00ff': Object.freeze({ r: 255, g: 0, b: 255 }),
    '#a6ff00': Object.freeze({ r: 166, g: 255, b: 0 }),
    '#00ffd5': Object.freeze({ r: 0, g: 255, b: 213 }),
});

export const BOT_NAMES = Object.freeze([
    'Shadow', 'Vortex', 'Apex', 'Matrix', 'Cosmo', 'Echo', 'Blaze', 'Frost', 'Pixel', 'Rogue', 'Alpha', 'Spectre', 'Helix', 'Nova', 'Titan'
]);

// Unlockable player characters, in picker order. Each has its own name, icon
// and color so unlocking one feels like getting a new player, not a new
// paint job. The first two are free; the rest are bought with coins earned
// in-run and the unlock is persisted per-browser.
export const CHARACTERS = Object.freeze([
    Object.freeze({ id: '#00f3ff', name: 'Cortex', icon: '🤖', cost: 0 }),
    Object.freeze({ id: '#ff007f', name: 'Pixel', icon: '👾', cost: 0 }),
    Object.freeze({ id: '#39ff14', name: 'Viper', icon: '🐍', cost: 150 }),
    Object.freeze({ id: '#ffaa00', name: 'Fuchs', icon: '🦊', cost: 150 }),
    Object.freeze({ id: '#b026ff', name: 'Alien', icon: '👽', cost: 300 }),
    Object.freeze({ id: '#ff3333', name: 'Drache', icon: '🐉', cost: 300 }),
    Object.freeze({ id: '#ffff00', name: 'Volt', icon: '⚡', cost: 500 }),
    Object.freeze({ id: '#ff00ff', name: 'Einhorn', icon: '🦄', cost: 500 }),
    Object.freeze({ id: '#a6ff00', name: 'Toxic', icon: '☢️', cost: 750 }),
    Object.freeze({ id: '#00ffd5', name: 'Frost', icon: '❄️', cost: 750 }),
]);

export const GRID_SIZE = 150;
export const CELL_SIZE = 24;
export const TICK_INTERVAL = 60;
export const MAP_SIZE = GRID_SIZE * CELL_SIZE;
