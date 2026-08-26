export class ProgressStore {
    constructor(storage, keyPrefix = 'papirio_conquest_') {
        this.storage = storage;
        this.keyPrefix = keyPrefix;
    }

    getLevelProgress(levelId) {
        try {
            const value = this.storage.getItem(this.keyPrefix + levelId);
            const parsed = Number.parseFloat(value);
            if (!Number.isFinite(parsed)) {
                return 0;
            }
            return Math.max(0, Math.min(100, parsed));
        } catch (error) {
            return 0;
        }
    }

    setLevelProgress(levelId, progress) {
        let normalized = Number(progress);
        if (!Number.isFinite(normalized)) {
            normalized = 0;
        }
        normalized = Math.max(0, Math.min(100, normalized));

        try {
            this.storage.setItem(this.keyPrefix + levelId, normalized.toFixed(4));
        } catch (error) {
            // Storage may be unavailable in privacy mode.
        }

        return normalized;
    }

    getOverallWorldConquest(levels) {
        if (!levels || typeof levels[Symbol.iterator] !== 'function') {
            return 0;
        }

        let total = 0;
        let count = 0;

        for (const level of levels) {
            if (level && level.id && level.id !== 'classic') {
                total += this.getLevelProgress(level.id);
                count++;
            }
        }

        return count ? total / count : 0;
    }
}
