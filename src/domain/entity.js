export class Entity {
    constructor(id, name, color, startGridX, startGridY, gridSize) {
        this.id = id;
        this.name = name;
        this.color = color;
        this.gridSize = gridSize;
        this.gridX = startGridX;
        this.gridY = startGridY;
        this.x = startGridX;
        this.y = startGridY;
        this.direction = 1;
        this.nextDirection = 1;
        this.trail = [];
        this.isDead = false;
        this.kills = 0;
        this.peakPercentage = 0.0;
        this.score = 0;
        this.speedBoostTime = 0;
        this.hasShield = false;
        this.cannonShots = 0;
        this.tickCooldown = 1;
        this.isBlocked = false; // Standing still because a wall blocks the current direction
        this.lastMoveTime = 0;
        this.sessionCoins = 0; // Coins picked up this run (not yet banked to the wallet)
        this.icon = null; // Character emoji shown next to the name tag
    }

    snapToGrid() {
        this.x = this.gridX;
        this.y = this.gridY;
    }

    interpolate(t) {
        this.x += (this.gridX - this.x) * t;
        this.y += (this.gridY - this.y) * t;
    }

    setNextDirection(dir) {
        if (Number.isInteger(dir) && dir >= 0 && dir <= 3 && dir !== (this.direction + 2) % 4) {
            this.nextDirection = dir;
        }
    }
}
