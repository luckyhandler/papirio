export function isPointInPolygon(point, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    for (let i = 0; i < polygon.length; i++) {
        const v = polygon[i];
        if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) return false;
    }
    let minX = polygon[0].x;
    let maxX = polygon[0].x;
    let minY = polygon[0].y;
    let maxY = polygon[0].y;
    for (let i = 1; i < polygon.length; i++) {
        const v = polygon[i];
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
    }
    if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x;
        const yi = polygon[i].y;
        const xj = polygon[j].x;
        const yj = polygon[j].y;
        const intersect = ((yi > point.y) !== (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export function isCellPlayable(level, x, y, gridSize) {
    if (!Number.isInteger(gridSize) || gridSize <= 0) return false;
    if (!level || typeof level !== 'object') return false;
    if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) return false;
    const nx = x / gridSize;
    const ny = y / gridSize;
    switch (level.type) {
        case 'square': return true;
        case 'formula': return typeof level.formula === 'function' ? Boolean(level.formula(nx, ny)) : false;
        case 'polygon': return isPointInPolygon({ x: nx, y: ny }, level.poly);
        default: return false;
    }
}

export function countPlayableCells(level, gridSize) {
    if (!Number.isInteger(gridSize) || gridSize <= 0 || !level || typeof level !== 'object') return 0;
    let count = 0;
    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            if (isCellPlayable(level, x, y, gridSize)) count++;
        }
    }
    return count;
}
