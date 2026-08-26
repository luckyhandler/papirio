/**
 * AI Bot class for Papirio
 */
import { findClosestOwnedCell } from './src/domain/grid-search.js';

export class Bot {
    constructor(id, name, color, startGridX, startGridY, gridSize) {
        this.id = id;
        this.name = name;
        this.color = color;
        this.gridSize = gridSize;

        // Logical position on the grid
        this.gridX = startGridX;
        this.gridY = startGridY;

        // Visual coordinates (interpolated for smooth rendering)
        this.x = startGridX;
        this.y = startGridY;

        // Current and next direction: 0: Up, 1: Right, 2: Down, 3: Left
        this.direction = Math.floor(Math.random() * 4);
        this.nextDirection = this.direction;

        // Bot state
        this.trail = []; // List of {x, y} coordinates
        this.isDead = false;
        this.kills = 0;
        this.peakPercentage = 0.0;
        this.score = 0; // Number of cells owned

        // AI specific fields
        this.aiState = 'wander'; // 'wander', 'expand', 'return'
        this.stepsSinceLeftTerritory = 0;
        this.maxExpandSteps = 10 + Math.floor(Math.random() * 15);
        this.decisionCooldown = 0; // Steps to wait before changing mind (to avoid spinning)

        // Power-Up states
        this.speedBoostTime = 0;
        this.hasShield = false;
        this.cannonShots = 0;
        this.shootCooldown = 0;
        this.tickCooldown = 1;
        this.lastMoveTime = 0;
    }

    /**
     * Set visual coordinates to snap to grid (e.g. on start or respawn)
     */
    snapToGrid() {
        this.x = this.gridX;
        this.y = this.gridY;
    }

    /**
     * Interpolate visual coordinates towards logical grid coordinates
     * @param {number} t - Interpolation speed (0 to 1)
     */
    interpolate(t) {
        this.x += (this.gridX - this.x) * t;
        this.y += (this.gridY - this.y) * t;
    }

    /**
     * Determine the next move of the bot based on its AI state
     * @param {Object} game - Reference to the Game object to query grid and players
     */
    decideNextDirection(game) {
        // Abklingzeit für Schüsse verringern
        if (this.shootCooldown > 0) {
            this.shootCooldown--;
        }

        // Schießen, falls Munition vorhanden ist und die Abklingzeit abgelaufen ist
        if (this.cannonShots > 0 && this.shootCooldown <= 0) {
            const directions = [
                { dx: 0, dy: -1 }, // Oben
                { dx: 1, dy: 0 },  // Rechts
                { dx: 0, dy: 1 },  // Unten
                { dx: -1, dy: 0 }  // Links
            ];
            const step = directions[this.direction];
            
            let foundTarget = false;
            // Scanne bis zu 12 Felder vorwärts
            for (let k = 1; k <= 12; k++) {
                const tx = this.gridX + step.dx * k;
                const ty = this.gridY + step.dy * k;
                
                if (!game.isPlayableCell(tx, ty)) {
                    break; // Wand blockiert die Schusslinie
                }
                
                // Prüfe, ob sich ein gegnerischer Kopf auf dieser Zelle befindet
                const opponentHead = game.entities.find(e => !e.isDead && e.id !== this.id && e.gridX === tx && e.gridY === ty);
                if (opponentHead) {
                    foundTarget = true;
                    break;
                }
                
                // Prüfe, ob sich eine gegnerische Spur auf dieser Zelle befindet
                const cell = game.grid[tx][ty];
                if (cell.trailOwnerId !== null && cell.trailOwnerId !== this.id) {
                    foundTarget = true;
                    break;
                }
            }
            
            if (foundTarget) {
                // Schieße mit einer 20 % Chance pro Tick, um nicht sofort das ganze Magazin zu leeren
                if (Math.random() < 0.20) {
                    game.fireProjectile(this);
                    this.shootCooldown = 20; // 20 Ticks Abklingzeit (ca. 1,2s bei 60ms pro logical Tick)
                }
            }
        }

        // Decrease decision cooldown
        if (this.decisionCooldown > 0) {
            this.decisionCooldown--;
        }

        const currentCellOwner = game.getCellOwner(this.gridX, this.gridY);
        const amIOwner = (currentCellOwner === this.id);

        // State transitions
        if (amIOwner) {
            this.stepsSinceLeftTerritory = 0;
            if (this.aiState !== 'wander') {
                this.aiState = 'wander';
                this.maxExpandSteps = 12 + Math.floor(Math.random() * 18);
            }
        } else {
            this.stepsSinceLeftTerritory++;
            if (this.aiState === 'wander') {
                this.aiState = 'expand';
            } else if (this.aiState === 'expand' && this.stepsSinceLeftTerritory >= this.maxExpandSteps) {
                this.aiState = 'return';
            }
        }

        // Only make logical direction changes when we are cool down or need to turn
        if (this.decisionCooldown > 0 && this.isDirectionSafe(this.direction, game)) {
            this.nextDirection = this.direction;
            return;
        }

        // Evaluate all 4 possible directions
        const directions = [
            { dir: 0, dx: 0, dy: -1 }, // Up
            { dir: 1, dx: 1, dy: 0 },  // Right
            { dir: 2, dx: 0, dy: 1 },  // Down
            { dir: 3, dx: -1, dy: 0 }  // Left
        ];

        // Do not allow reversing directly (180 degree turn)
        const oppositeDir = (this.direction + 2) % 4;

        let bestDir = this.direction;
        let highestScore = -Infinity;

        // Find closest owned cell for distance calculation (routing home)
        const closestOwned = this.findClosestOwnedCell(game);

        for (const option of directions) {
            if (option.dir === oppositeDir) continue; // No 180s

            const nextX = this.gridX + option.dx;
            const nextY = this.gridY + option.dy;

            // Score this path
            let score = 0;

            // Check basic safety: boundaries & own trail
            if (!game.isPlayableCell(nextX, nextY)) {
                score -= 10000; // Wall death
            } else {
                const cell = game.grid[nextX][nextY];
                if (cell.trailOwnerId === this.id) {
                    score -= 20; // Avoid self-intersection slightly but not fatal
                }
            }

            // If it's a safe cell, apply heuristic scores
            if (score > -5000) {
                const isNextOwned = (game.getCellOwner(nextX, nextY) === this.id);
                const currentDistance = closestOwned ? Math.abs(this.gridX - closestOwned.x) + Math.abs(this.gridY - closestOwned.y) : 0;
                const nextDistance = closestOwned ? Math.abs(nextX - closestOwned.x) + Math.abs(nextY - closestOwned.y) : 0;

                // State-based weights
                if (this.aiState === 'wander') {
                    // Stay inside territory if wandering
                    if (isNextOwned) {
                        score += 30;
                    } else {
                        // Small chance to step out
                        score += 5;
                    }
                    // Keep moving forward preferred slightly
                    if (option.dir === this.direction) {
                        score += 5;
                    }
                } 
                else if (this.aiState === 'expand') {
                    // Try to expand, prefer neutral/enemy territory
                    if (!isNextOwned) {
                        score += 20;
                        // Avoid getting too far away
                        if (nextDistance < currentDistance) {
                            score += 2; // slightly favor looping back
                        }
                    } else {
                        // It's fine to return, closes the loop!
                        score += 40;
                    }
                    if (option.dir === this.direction) {
                        score += 4; // Prefer straight lines
                    }
                } 
                else if (this.aiState === 'return') {
                    // High priority on getting closer to home
                    if (isNextOwned) {
                        score += 100;
                    } else if (nextDistance < currentDistance) {
                        score += 30; // Closer to home is better
                    } else {
                        score -= 20; // Moving away is bad
                    }
                }

                // AI Killer instinct: if another player's trail is nearby, try to target it!
                const targetTrailOwner = this.checkForNearbyTrails(nextX, nextY, game, 3);
                if (targetTrailOwner && targetTrailOwner !== this.id) {
                    score += 50; // High incentive to cut someone off!
                }

                // Add a small amount of noise to make them feel organic
                score += Math.random() * 4;
            }

            if (score > highestScore) {
                highestScore = score;
                bestDir = option.dir;
            }
        }

        // Set direction and update cooldown if turned
        if (bestDir !== this.direction) {
            this.nextDirection = bestDir;
            this.decisionCooldown = 2 + Math.floor(Math.random() * 4); // Cooldown for next turn
        } else {
            this.nextDirection = this.direction;
        }
    }

    /**
     * Helper to check if a direction is safe from immediate death
     */
    isDirectionSafe(dir, game) {
        const directions = [
            { dx: 0, dy: -1 },
            { dx: 1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 }
        ];
        const nextX = this.gridX + directions[dir].dx;
        const nextY = this.gridY + directions[dir].dy;

        if (!game.isPlayableCell(nextX, nextY)) {
            return false;
        }

        // Immune to own trail in directional safety check
        return true;
    }

    /**
     * Find the coordinates of the closest cell owned by this bot
     */
    findClosestOwnedCell(game) {
        return findClosestOwnedCell(game.grid, this.gridX, this.gridY, this.gridSize, this.id);
    }

    /**
     * Check if there's any player/bot trail in a given radius
     */
    checkForNearbyTrails(startX, startY, game, radius) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const x = startX + dx;
                const y = startY + dy;

                if (x >= 0 && x < this.gridSize && y >= 0 && y < this.gridSize) {
                    const trailOwnerId = game.grid[x][y].trailOwnerId;
                    if (trailOwnerId) {
                        return trailOwnerId;
                    }
                }
            }
        }
        return null;
    }
}
