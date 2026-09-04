export class ProgressStore {
    constructor(storage, keyPrefix = 'papierfisch_conquest_') {
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

    // Write-then-read self-test. If this fails (private browsing, blocked
    // storage, quota exceeded), every get/set above silently no-ops and
    // coins/progress will look like they "reset" on every reload.
    isStorageAvailable() {
        const testKey = this.keyPrefix + '__storage_test__';
        try {
            this.storage.setItem(testKey, '1');
            const ok = this.storage.getItem(testKey) === '1';
            this.storage.removeItem(testKey);
            return ok;
        } catch (error) {
            return false;
        }
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

    // Local high-score table: best runs ever played on this browser, ranked
    // by peak territory %. Kept short (top 10) so it stays a "best of",
    // not a full history.
    getHighScores() {
        try {
            const raw = this.storage.getItem(this.keyPrefix + 'highscores');
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    addHighScore(entry) {
        const scores = this.getHighScores();
        scores.push({
            name: String(entry.name || 'Spieler').slice(0, 20),
            territory: Math.max(0, Number(entry.territory) || 0),
            kills: Math.max(0, Math.floor(Number(entry.kills) || 0)),
            timestamp: Date.now(),
        });
        scores.sort((a, b) => b.territory - a.territory);
        const top = scores.slice(0, 10);

        try {
            this.storage.setItem(this.keyPrefix + 'highscores', JSON.stringify(top));
        } catch (error) {
            // Storage may be unavailable in privacy mode.
        }

        return top;
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
