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

// Unlockable player skins, in picker order. The first entries are free;
// the rest are bought with coins earned in-run and are persisted per-browser.
export const SKINS = Object.freeze([
    Object.freeze({ id: '#00f3ff', name: 'Cyber Cyan', cost: 0 }),
    Object.freeze({ id: '#ff007f', name: 'Neon Pink', cost: 0 }),
    Object.freeze({ id: '#39ff14', name: 'Toxic Green', cost: 150 }),
    Object.freeze({ id: '#ffaa00', name: 'Solar Orange', cost: 150 }),
    Object.freeze({ id: '#b026ff', name: 'Ultraviolett', cost: 300 }),
    Object.freeze({ id: '#ff3333', name: 'Crimson Alert', cost: 300 }),
    Object.freeze({ id: '#ffff00', name: 'Volt Yellow', cost: 500 }),
    Object.freeze({ id: '#ff00ff', name: 'Magenta Puls', cost: 500 }),
    Object.freeze({ id: '#a6ff00', name: 'Radioactive Lime', cost: 750 }),
    Object.freeze({ id: '#00ffd5', name: 'Aqua Prisma', cost: 750 }),
]);

export const GRID_SIZE = 150;
export const CELL_SIZE = 24;
export const TICK_INTERVAL = 60;
export const MAP_SIZE = GRID_SIZE * CELL_SIZE;
