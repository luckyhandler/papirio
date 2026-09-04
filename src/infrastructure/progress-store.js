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

    getCoins() {
        try {
            const value = this.storage.getItem(this.keyPrefix + 'coins');
            const parsed = Number.parseInt(value, 10);
            return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
        } catch (error) {
            return 0;
        }
    }

    addCoins(amount) {
        const delta = Math.max(0, Math.floor(Number(amount) || 0));
        const total = this.getCoins() + delta;
        try {
            this.storage.setItem(this.keyPrefix + 'coins', String(total));
        } catch (error) {
            // Storage may be unavailable in privacy mode.
        }
        return total;
    }

    spendCoins(amount) {
        const cost = Math.max(0, Math.floor(Number(amount) || 0));
        const current = this.getCoins();
        if (current < cost) {
            return false;
        }
        try {
            this.storage.setItem(this.keyPrefix + 'coins', String(current - cost));
        } catch (error) {
            // Storage may be unavailable in privacy mode.
        }
        return true;
    }

    getUnlockedCharacters(freeCharacterIds = []) {
        try {
            const raw = this.storage.getItem(this.keyPrefix + 'unlocked_characters');
            const parsed = raw ? JSON.parse(raw) : [];
            const set = new Set(Array.isArray(parsed) ? parsed : []);
            freeCharacterIds.forEach((id) => set.add(id));
            return set;
        } catch (error) {
            return new Set(freeCharacterIds);
        }
    }

    isCharacterUnlocked(characterId, freeCharacterIds = []) {
        return this.getUnlockedCharacters(freeCharacterIds).has(characterId);
    }

    unlockCharacter(characterId, freeCharacterIds = []) {
        const unlocked = this.getUnlockedCharacters(freeCharacterIds);
        unlocked.add(characterId);
        try {
            this.storage.setItem(this.keyPrefix + 'unlocked_characters', JSON.stringify(Array.from(unlocked)));
        } catch (error) {
            // Storage may be unavailable in privacy mode.
        }
        return unlocked;
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
