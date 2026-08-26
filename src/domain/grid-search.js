export function findClosestOwnedCell(grid, startX, startY, gridSize, ownerId) {
    if (!Array.isArray(grid) ||
        !Number.isInteger(gridSize) || gridSize <= 0 ||
        !Number.isInteger(startX) || !Number.isInteger(startY) ||
        ownerId === null || ownerId === undefined) {
        return null;
    }

    const maxDistance = 2 * (gridSize - 1);

    for (let distance = 0; distance <= maxDistance; distance++) {
        for (let dx = -distance; dx <= distance; dx++) {
            const dyAbs = distance - Math.abs(dx);
            const x = startX + dx;

            if (x < 0 || x >= gridSize || !grid[x]) {
                continue;
            }

            const y1 = startY - dyAbs;
            if (y1 >= 0 && y1 < gridSize && grid[x][y1]?.ownerId === ownerId) {
                return { x, y: y1 };
            }

            if (dyAbs !== 0) {
                const y2 = startY + dyAbs;
                if (y2 >= 0 && y2 < gridSize && grid[x][y2]?.ownerId === ownerId) {
                    return { x, y: y2 };
                }
            }
        }
    }

    return null;
}
