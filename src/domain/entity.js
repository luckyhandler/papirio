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
        this.lastMoveTime = 0;
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
