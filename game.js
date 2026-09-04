import { Bot } from './bot.js';
import { SynthMusic } from './src/audio/synth-music.js';
import { BOT_NAMES, CELL_SIZE, CHARACTERS, GRID_SIZE, MAP_SIZE, NEON_COLORS, TICK_INTERVAL } from './src/config/game-config.js';
import { countPlayableCells, isCellPlayable } from './src/domain/geometry.js';
import { Player } from './src/domain/player.js';
import { ProgressStore } from './src/infrastructure/progress-store.js';
import { escapeHtml } from './src/presentation/escape-html.js';
import { createLeaderboardItem } from './src/presentation/leaderboard.js';
import { ThreeRenderer } from './src/presentation/three-renderer.js';

const LEVELS = {
    classic: {
        id: 'classic',
        name: 'Klassisch',
        description: 'Die Standard-Arena. Erobere die Ecken.',
        type: 'square',
        target: 100,
        unlockAt: 0
    },
    australia: {
        id: 'australia',
        name: 'Australien',
        description: 'Eine zerklüftete Insel im weiten Ozean.',
        type: 'formula',
        formula: (u, v) => {
            const dx = u - 0.5;
            const dy = v - 0.5;
            const r = Math.sqrt(dx*dx + dy*dy);
            const theta = Math.atan2(dy, dx);
            return r < 0.42 * (1 + 0.1 * Math.sin(6 * theta) + 0.05 * Math.cos(11 * theta) - 0.07 * Math.sin(3 * theta));
        },
        target: 100,
        unlockAt: 0
    },
    africa: {
        id: 'africa',
        name: 'Afrika',
        description: 'Der Kontinent mit Wüsten und Savannen.',
        type: 'polygon',
        poly: [{x: 0.18, y: 0.3}, {x: 0.38, y: 0.15}, {x: 0.72, y: 0.15}, {x: 0.82, y: 0.32}, {x: 0.68, y: 0.55}, {x: 0.48, y: 0.88}, {x: 0.4, y: 0.88}, {x: 0.35, y: 0.65}, {x: 0.15, y: 0.42}],
        target: 100,
        unlockAt: 15
    },
    europe: {
        id: 'europe',
        name: 'Europa',
        description: 'Abwechslungsreich mit vielen Küsten.',
        type: 'polygon',
        poly: [{x: 0.15, y: 0.65}, {x: 0.15, y: 0.45}, {x: 0.25, y: 0.22}, {x: 0.5, y: 0.15}, {x: 0.75, y: 0.2}, {x: 0.88, y: 0.35}, {x: 0.88, y: 0.6}, {x: 0.7, y: 0.7}, {x: 0.52, y: 0.6}, {x: 0.35, y: 0.75}],
        target: 100,
        unlockAt: 30
    },
    north_america: {
        id: 'north_america',
        name: 'Nordamerika',
        description: 'Von eisigen Fjorden bis in den warmen Süden.',
        type: 'polygon',
        poly: [{x: 0.15, y: 0.2}, {x: 0.65, y: 0.12}, {x: 0.82, y: 0.25}, {x: 0.78, y: 0.45}, {x: 0.65, y: 0.55}, {x: 0.52, y: 0.85}, {x: 0.42, y: 0.85}, {x: 0.35, y: 0.55}, {x: 0.2, y: 0.4}],
        target: 100,
        unlockAt: 50
    },
    south_america: {
        id: 'south_america',
        name: 'Südamerika',
        description: 'Der Kontinent des Amazonas und der Anden.',
        type: 'polygon',
        poly: [{x: 0.22, y: 0.2}, {x: 0.68, y: 0.25}, {x: 0.78, y: 0.4}, {x: 0.62, y: 0.65}, {x: 0.45, y: 0.88}, {x: 0.38, y: 0.88}, {x: 0.28, y: 0.55}, {x: 0.18, y: 0.35}],
        target: 100,
        unlockAt: 70
    }
};

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 5;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.alpha = 1.0;
        this.decay = 0.02 + Math.random() * 0.03;
        this.size = 2 + Math.random() * 4;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.96; // drag
        this.vy *= 0.96;
        this.alpha -= this.decay;
    }

    draw(ctx, cameraOffsetX, cameraOffsetY) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x * CELL_SIZE + cameraOffsetX, this.y * CELL_SIZE + cameraOffsetY, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class GameEngine {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.minimapCanvas = document.getElementById('minimap-canvas');
        this.minimapCtx = this.minimapCanvas.getContext('2d');

        // Setup screen elements
        this.lobbyScreen = document.getElementById('lobby-screen');
        this.gameScreen = document.getElementById('game-screen');
        this.gameOverScreen = document.getElementById('game-over-screen');

        // Setup HUD elements
        this.hudScore = document.getElementById('hud-score');
        this.hudKills = document.getElementById('hud-kills');
        this.leaderboardList = document.getElementById('leaderboard-list');

        // Setup stats elements
        this.recapScore = document.getElementById('recap-score');
        this.recapKills = document.getElementById('recap-kills');
        this.recapCoins = document.getElementById('recap-coins');
        this.recapTime = document.getElementById('recap-time');
        this.recapRank = document.getElementById('recap-rank');
        this.eliminatedByText = document.getElementById('eliminated-by-text');

        // Coin economy elements
        this.hudCoins = document.getElementById('hud-coins');
        this.coinBalanceValue = document.getElementById('coin-balance-value');
        this.coins = []; // In-arena collectible coin pickups
        this.selectedCharacterId = CHARACTERS.find(c => c.cost === 0)?.id || CHARACTERS[0].id;

        // Grid Size & Data
        this.gridSize = GRID_SIZE;
        this.grid = []; // 2D array of { ownerId: string, trailOwnerId: string }
        
        this.entities = []; // human + bots
        this.player = null;
        this.botsCount = 7;
        
        this.particles = [];
        this.projectiles = [];
        this.isPlaying = false;
        
        // Loop timing
        this.lastTickTime = 0;
        this.lastTime = 0;
        this.timeSurvived = 0; // seconds
        this.gameStartTime = 0;

        // Camera
        this.camera = { x: 0, y: 0, zoom: 1 };
        
        // Animations
        this.screenShake = 0;
        this.captureFlashes = [];

        // Game Modes & Level State
        this.currentMode = 'classic'; // 'classic' or 'world'
        this.currentLevelId = 'classic';
        this.playableCellsCount = 0;
        this.boundarySegments = [];
        this.levelCellCounts = {};
        this.progressStore = new ProgressStore(window.localStorage);
        this.music = new SynthMusic();

        // Pre-calculate and cache level cell counts
        Object.keys(LEVELS).forEach(levelId => {
            this.levelCellCounts[levelId] = this.countPlayableCells(levelId);
        });

        // 3D & 2D Rendering View Mode
        this.viewMode = '3d'; // Default to modern 3D view
        this.threeRenderer = new ThreeRenderer();
        this.threeRenderer.init(this.gameScreen);

        this.initGrid();
        this.setupEventListeners();
        this.renderCharacterPicker();
        this.updateCoinBalanceDisplay();
    }

    countPlayableCells(levelId) {
        return countPlayableCells(LEVELS[levelId], this.gridSize);
    }

    initGrid() {
        this.grid = [];
        this.playableCellsCount = this.levelCellCounts[this.currentLevelId] || (this.gridSize * this.gridSize);
        
        const level = LEVELS[this.currentLevelId];
        
        for (let x = 0; x < this.gridSize; x++) {
            this.grid[x] = [];
            for (let y = 0; y < this.gridSize; y++) {
                this.grid[x][y] = {
                    ownerId: null,
                    trailOwnerId: null,
                    playable: isCellPlayable(level, x, y, this.gridSize)
                };
            }
        }
        
        // Find boundary segments for drawing
        this.boundarySegments = [];
        for (let x = 0; x < this.gridSize; x++) {
            for (let y = 0; y < this.gridSize; y++) {
                if (!this.grid[x][y].playable) continue;
                
                // Check top
                if (y === 0 || !this.grid[x][y-1].playable) {
                    this.boundarySegments.push({ x1: x, y1: y, x2: x + 1, y2: y });
                }
                // Check bottom
                if (y === this.gridSize - 1 || !this.grid[x][y+1].playable) {
                    this.boundarySegments.push({ x1: x, y1: y + 1, x2: x + 1, y2: y + 1 });
                }
                // Check left
                if (x === 0 || !this.grid[x-1][y].playable) {
                    this.boundarySegments.push({ x1: x, y1: y, x2: x, y2: y + 1 });
                }
                // Check right
                if (x === this.gridSize - 1 || !this.grid[x+1][y].playable) {
                    this.boundarySegments.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1 });
                }
            }
        }
    }

    isPlayableCell(x, y) {
        if (x < 0 || x >= this.gridSize || y < 0 || y >= this.gridSize) return false;
        return this.grid[x][y].playable;
    }

    getOverallWorldConquest() {
        return this.progressStore.getOverallWorldConquest(Object.values(LEVELS));
    }

    getLevelProgress(levelId) {
        return this.progressStore.getLevelProgress(levelId);
    }

    renderWorldLevels() {
        const gridContainer = document.getElementById('world-levels-grid');
        if (!gridContainer) return;
        
        gridContainer.innerHTML = '';
        const overallProgress = this.getOverallWorldConquest();
        
        Object.values(LEVELS).forEach(level => {
            if (level.id === 'classic') return;
            
            const progress = this.getLevelProgress(level.id);
            const isLocked = level.unlockAt > overallProgress;
            
            const card = document.createElement('div');
            card.className = `level-card ${this.currentLevelId === level.id ? 'active' : ''}`;
            
            if (isLocked) {
                card.innerHTML = `
                    <div class="level-locked">
                        <span class="lock-icon">🔒</span>
                        <span>Freischalten bei ${level.unlockAt}%</span>
                    </div>
                    <div class="level-name">${level.name}</div>
                    <div class="level-desc">${level.description}</div>
                `;
            } else {
                card.innerHTML = `
                    <div class="level-name">${level.name}</div>
                    <div class="level-desc">${level.description}</div>
                    <div class="level-progress-container">
                        <div class="level-progress-label">
                            <span>Erobert</span>
                            <span>${progress.toFixed(1)}%</span>
                        </div>
                        <div class="level-progress-bar">
                            <div class="level-progress-fill" style="width: ${progress}%"></div>
                        </div>
                    </div>
                `;
                
                card.addEventListener('click', () => {
                    const cards = gridContainer.querySelectorAll('.level-card');
                    cards.forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                    this.currentLevelId = level.id;
                });
            }
            
            gridContainer.appendChild(card);
        });
    }

    updateCoinBalanceDisplay() {
        if (this.coinBalanceValue) {
            this.coinBalanceValue.innerText = this.progressStore.getCoins();
        }
    }

    renderCharacterPicker() {
        const picker = document.getElementById('character-picker');
        if (!picker) return;

        const freeCharacterIds = CHARACTERS.filter(c => c.cost === 0).map(c => c.id);
        const unlocked = this.progressStore.getUnlockedCharacters(freeCharacterIds);
        const coins = this.progressStore.getCoins();

        if (!unlocked.has(this.selectedCharacterId)) {
            this.selectedCharacterId = freeCharacterIds[0] || CHARACTERS[0].id;
        }

        picker.innerHTML = '';

        CHARACTERS.forEach(character => {
            const isUnlocked = unlocked.has(character.id);
            const card = document.createElement('button');
            card.type = 'button';
            card.className = `character-card ${this.selectedCharacterId === character.id ? 'active' : ''}`;
            card.style.setProperty('--btn-color', character.id);
            card.title = character.name;

            if (!isUnlocked) {
                const canAfford = coins >= character.cost;
                card.innerHTML = `
                    <div class="level-locked ${canAfford ? 'affordable' : ''}">
                        <span class="lock-icon">🔒</span>
                        <span>${character.cost} 🪙</span>
                    </div>
                    <span class="character-icon">${character.icon}</span>
                    <span class="character-name">${escapeHtml(character.name)}</span>
                `;

                card.addEventListener('click', () => {
                    const balance = this.progressStore.getCoins();
                    if (balance < character.cost) {
                        this.showNotification(`Nicht genug Münzen! Dir fehlen ${character.cost - balance} 🪙`, '#ffd700');
                        return;
                    }
                    this.progressStore.spendCoins(character.cost);
                    this.progressStore.unlockCharacter(character.id, freeCharacterIds);
                    this.selectedCharacterId = character.id;
                    this.showNotification(`<span style="color: ${character.id}">${character.icon} ${escapeHtml(character.name)}</span> freigeschaltet! 🎉`, character.id);
                    this.updateCoinBalanceDisplay();
                    this.renderCharacterPicker();
                });
            } else {
                card.innerHTML = `
                    <span class="character-icon">${character.icon}</span>
                    <span class="character-name">${escapeHtml(character.name)}</span>
                `;

                card.addEventListener('click', () => {
                    picker.querySelectorAll('.character-card').forEach(opt => opt.classList.remove('active'));
                    card.classList.add('active');
                    this.selectedCharacterId = character.id;
                });
            }

            picker.appendChild(card);
        });
    }

    findSpawnInTerritory(entityId) {
        const owned = [];
        for (let x = 0; x < this.gridSize; x++) {
            for (let y = 0; y < this.gridSize; y++) {
                if (this.grid[x][y].ownerId === entityId && this.grid[x][y].playable) {
                    owned.push({ x, y });
                }
            }
        }
        if (owned.length > 0) {
            let avgX = 0, avgY = 0;
            owned.forEach(c => { avgX += c.x; avgY += c.y; });
            avgX = Math.round(avgX / owned.length);
            avgY = Math.round(avgY / owned.length);
            
            let bestCell = owned[0];
            let minDist = Infinity;
            owned.forEach(c => {
                const dist = Math.abs(c.x - avgX) + Math.abs(c.y - avgY);
                if (dist < minDist) {
                    minDist = dist;
                    bestCell = c;
                }
            });
            return bestCell;
        }
        return null;
    }

    handleWorldVictory() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        this.music.stop();

        // Save 100% progress
        this.progressStore.setLevelProgress(this.currentLevelId, 100);
        this.renderWorldLevels();
        
        this.showNotification(`🎉 KONTINENT EROBERT! 100% 🎉`, '#00f3ff');
        
        setTimeout(() => {
            this.recapScore.innerText = '100.00%';
            this.recapKills.innerText = this.player.kills;
            const duration = Math.floor((performance.now() - this.gameStartTime) / 1000);
            this.recapTime.innerText = `${duration}s`;
            this.recapRank.innerText = '#1';
            this.eliminatedByText.innerText = 'Herzlichen Glückwunsch! Du hast den Kontinent vollständig erobert!';
            this.awardRunCoins();
            this.showScreen(this.gameOverScreen);
        }, 1500);
    }

    /**
     * Bank coins collected this run into the persistent wallet: coin pickups
     * plus a performance bonus for peak territory % and kills. Updates the
     * recap row and lobby balance display.
     */
    awardRunCoins() {
        if (!this.player) return 0;

        const performanceBonus = Math.round(this.player.peakPercentage) + this.player.kills * 10;
        const earned = this.player.sessionCoins + performanceBonus;

        this.progressStore.addCoins(earned);
        this.updateCoinBalanceDisplay();

        if (this.recapCoins) {
            this.recapCoins.innerText = `+${earned} 🪙`;
        }

        return earned;
    }

    setupEventListeners() {
        // Music Toggle
        const musicToggleBtn = document.getElementById('music-toggle');
        if (musicToggleBtn) {
            const syncMusicButton = () => {
                musicToggleBtn.textContent = this.music.muted ? '🔇' : '🔊';
                musicToggleBtn.classList.toggle('muted', this.music.muted);
            };
            syncMusicButton();
            musicToggleBtn.addEventListener('click', () => {
                this.music.toggleMuted();
                if (this.music.muted) {
                    this.music.stop();
                } else if (this.isPlaying) {
                    // Only resume playback if a round is actually running —
                    // music never plays outside of active gameplay.
                    this.music.start();
                }
                syncMusicButton();
            });
        }

        // Mode Selector
        const modeClassic = document.getElementById('mode-classic');
        const modeWorld = document.getElementById('mode-world');
        const worldMapContainer = document.getElementById('world-map-container');

        modeClassic.addEventListener('click', () => {
            modeClassic.classList.add('active');
            modeWorld.classList.remove('active');
            worldMapContainer.classList.add('hidden');
            this.currentMode = 'classic';
            this.currentLevelId = 'classic';
        });

        modeWorld.addEventListener('click', () => {
            modeWorld.classList.add('active');
            modeClassic.classList.remove('active');
            worldMapContainer.classList.remove('hidden');
            this.currentMode = 'world';
            
            const overallProgress = this.getOverallWorldConquest();
            const unlockedLevels = Object.values(LEVELS).filter(l => l.unlockAt <= overallProgress && l.id !== 'classic');
            if (unlockedLevels.length > 0 && this.currentLevelId === 'classic') {
                this.currentLevelId = unlockedLevels[0].id;
            }
            this.renderWorldLevels();
        });

        // View Mode Selector (3D / 2D)
        const view3dBtn = document.getElementById('view-3d');
        const view2dBtn = document.getElementById('view-2d');
        if (view3dBtn && view2dBtn) {
            view3dBtn.addEventListener('click', () => {
                view3dBtn.classList.add('active');
                view2dBtn.classList.remove('active');
                this.viewMode = '3d';
            });

            view2dBtn.addEventListener('click', () => {
                view2dBtn.classList.add('active');
                view3dBtn.classList.remove('active');
                this.viewMode = '2d';
            });
        }

        // Play Button
        const playBtn = document.getElementById('play-button');
        playBtn.addEventListener('click', () => {
            const nameInput = document.getElementById('username');
            let name = nameInput.value.trim();
            if (!name) name = 'Spieler';
            this.startGame(name, this.selectedCharacterId);
        });

        // Try Again Button
        const restartBtn = document.getElementById('restart-button');
        restartBtn.addEventListener('click', () => {
            this.renderWorldLevels(); // Refresh levels progress and locks
            this.renderCharacterPicker(); // Refresh unlocked characters
            this.showScreen(this.lobbyScreen);
        });

        // Key Controls
        window.addEventListener('keydown', (e) => {
            if (!this.isPlaying || !this.player) return;

            if (this.viewMode === '3d') {
                // In 3D (behind player follow camera): A/Left turns Left, D/Right turns Right
                switch(e.key) {
                    case 'ArrowLeft':
                    case 'a':
                    case 'A':
                        this.player.setNextDirection((this.player.direction + 3) % 4);
                        break;
                    case 'ArrowRight':
                    case 'd':
                    case 'D':
                        this.player.setNextDirection((this.player.direction + 1) % 4);
                        break;
                    case 'ArrowUp':
                    case 'w':
                    case 'W':
                        this.player.setNextDirection(this.player.direction);
                        break;
                    case ' ':
                        this.fireProjectile(this.player);
                        e.preventDefault();
                        break;
                }
            } else {
                // In 2D: Absolute directions (Up, Right, Down, Left)
                switch(e.key) {
                    case 'ArrowUp':
                    case 'w':
                    case 'W':
                        this.player.setNextDirection(0);
                        break;
                    case 'ArrowRight':
                    case 'd':
                    case 'D':
                        this.player.setNextDirection(1);
                        break;
                    case 'ArrowDown':
                    case 's':
                    case 'S':
                        this.player.setNextDirection(2);
                        break;
                    case 'ArrowLeft':
                    case 'a':
                    case 'A':
                        this.player.setNextDirection(3);
                        break;
                    case ' ':
                        this.fireProjectile(this.player);
                        e.preventDefault();
                        break;
                }
            }
        });

        // Mobile Fire Button Touch & Click
        const mobileFireBtn = document.getElementById('mobile-fire-button');
        if (mobileFireBtn) {
            const handleFire = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.isPlaying && this.player) {
                    this.fireProjectile(this.player);
                }
            };
            mobileFireBtn.addEventListener('click', handleFire);
            mobileFireBtn.addEventListener('touchstart', handleFire, { passive: false });
        }

        // Mobile Swipe Controls (attached to gameScreen so both 2D and 3D work)
        let touchStartX = 0;
        let touchStartY = 0;
        const SWIPE_THRESHOLD = 25; // pixels

        this.gameScreen.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
        }, { passive: true });

        this.gameScreen.addEventListener('touchmove', (e) => {
            if (!this.isPlaying || !this.player || e.touches.length !== 1) return;
            
            const touchX = e.touches[0].clientX;
            const touchY = e.touches[0].clientY;
            const dx = touchX - touchStartX;
            const dy = touchY - touchStartY;

            if (Math.abs(dx) > SWIPE_THRESHOLD || Math.abs(dy) > SWIPE_THRESHOLD) {
                if (this.viewMode === '3d') {
                    if (Math.abs(dx) > Math.abs(dy)) {
                        if (dx > 0) this.player.setNextDirection((this.player.direction + 1) % 4); // Turn Right
                        else this.player.setNextDirection((this.player.direction + 3) % 4);        // Turn Left
                    }
                } else {
                    if (Math.abs(dx) > Math.abs(dy)) {
                        if (dx > 0) this.player.setNextDirection(1); // Right
                        else this.player.setNextDirection(3);        // Left
                    } else {
                        if (dy > 0) this.player.setNextDirection(2); // Down
                        else this.player.setNextDirection(0);        // Up
                    }
                }
                touchStartX = touchX;
                touchStartY = touchY;
            }
        }, { passive: true });

        // Resize Canvas
        window.addEventListener('resize', () => this.resizeCanvas());

        // Tab Visibility Change / Pause on blur
        this.isTabVisible = true;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.isTabVisible = false;
            } else {
                this.isTabVisible = true;
                // Reset clocks to avoid tick catches
                this.lastTickTime = performance.now();
                this.lastTime = performance.now();
            }
        });
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.threeRenderer) {
            this.threeRenderer.resize(window.innerWidth, window.innerHeight);
        }
    }

    startGame(playerName, characterId) {
        const character = CHARACTERS.find(c => c.id === characterId) || CHARACTERS[0];
        const playerColor = character.id;
        this.resizeCanvas();
        this.initGrid();
        this.entities = [];
        this.particles = [];
        this.powerUps = [];
        this.coins = [];
        this.projectiles = [];
        this.captureFlashes = [];

        // Setup 3D / 2D Canvas display
        if (this.viewMode === '3d') {
            this.canvas.style.display = 'none';
            if (this.threeRenderer.canvas) this.threeRenderer.canvas.style.display = 'block';
            this.threeRenderer.reset();
            this.threeRenderer.setupBoundaryWalls(this);
        } else {
            this.canvas.style.display = 'block';
            if (this.threeRenderer.canvas) this.threeRenderer.canvas.style.display = 'none';
        }

        // Spawn Player
        const pSpawn = this.findSafeSpawnCell();

        this.player = new Player('player', playerName, playerColor, pSpawn.x, pSpawn.y, this.gridSize);
        this.player.icon = character.icon;
        this.entities.push(this.player);
        this.player.lastMoveTime = performance.now();

        this.claimInitialTerritory(this.player);
        this.player.snapToGrid();

        // Spawn Bots
        for (let i = 0; i < this.botsCount; i++) {
            this.spawnBot();
        }

        this.isPlaying = true;
        this.gameStartTime = performance.now();
        this.lastTickTime = performance.now();
        this.lastTime = performance.now();

        // "JETZT SPIELEN" is a user gesture, so this is where audio unlocks.
        // Music only plays for the duration of the round.
        this.music.ensureAudioReady();
        if (!this.music.muted) {
            this.music.start();
        }

        this.showScreen(this.gameScreen);
        this.resizeCanvas();
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    findSafeSpawnCell() {
        let attempts = 0;
        while (attempts < 200) {
            const x = 15 + Math.floor(Math.random() * (this.gridSize - 30));
            const y = 15 + Math.floor(Math.random() * (this.gridSize - 30));
            
            if (!this.isPlayableCell(x, y)) {
                attempts++;
                continue;
            }

            // Check if center and surrounding area are empty and playable
            let areaSafe = true;
            for (let dx = -4; dx <= 4; dx++) {
                for (let dy = -4; dy <= 4; dy++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || nx >= this.gridSize || ny < 0 || ny >= this.gridSize || !this.isPlayableCell(nx, ny) || this.grid[nx][ny].ownerId !== null) {
                        areaSafe = false;
                        break;
                    }
                }
                if (!areaSafe) break;
            }

            if (areaSafe) {
                return { x, y };
            }
            attempts++;
        }
        // Fallback: any playable cell not owned
        for (let x = 0; x < this.gridSize; x++) {
            for (let y = 0; y < this.gridSize; y++) {
                if (this.isPlayableCell(x, y) && this.grid[x][y].ownerId === null) {
                    return { x, y };
                }
            }
        }
        return { x: Math.floor(this.gridSize / 2), y: Math.floor(this.gridSize / 2) };
    }

    claimInitialTerritory(entity) {
        const sx = entity.gridX;
        const sy = entity.gridY;
        
        let score = 0;
        // Give 4x4 starting base
        for (let dx = -2; dx <= 1; dx++) {
            for (let dy = -2; dy <= 1; dy++) {
                const x = sx + dx;
                const y = sy + dy;
                if (this.isPlayableCell(x, y)) {
                    this.grid[x][y].ownerId = entity.id;
                    score++;
                }
            }
        }
        entity.score = score;
    }

    spawnBot() {
        const spawn = this.findSafeSpawnCell();
        
        // Pick name
        const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + ` Bot`;
        
        // Find a color that is not currently in use by any alive entity
        const colorsList = Object.keys(NEON_COLORS);
        const usedColors = this.entities.filter(e => !e.isDead).map(e => e.color);
        const availableColors = colorsList.filter(c => !usedColors.includes(c));
        
        let color;
        if (availableColors.length > 0) {
            color = availableColors[Math.floor(Math.random() * availableColors.length)];
        } else {
            // Fallback (should not happen with 10 colors and max 8 active entities)
            color = colorsList[Math.floor(Math.random() * colorsList.length)];
        }

        const botId = `bot_${Math.random().toString(36).substr(2, 9)}`;
        const bot = new Bot(botId, name, color, spawn.x, spawn.y, this.gridSize);
        bot.icon = CHARACTERS.find(c => c.id === color)?.icon || '🎮';
        this.entities.push(bot);
        bot.lastMoveTime = performance.now();
        this.claimInitialTerritory(bot);
        bot.snapToGrid();
    }

    fireProjectile(entity) {
        if (entity.isDead || !entity.cannonShots || entity.cannonShots <= 0) return;

        entity.cannonShots--;

        const directions = [
            { dx: 0, dy: -1 }, // Up
            { dx: 1, dy: 0 },  // Right
            { dx: 0, dy: 1 },  // Down
            { dx: -1, dy: 0 }  // Left
        ];
        const dir = directions[entity.direction];

        const p = {
            ownerId: entity.id,
            color: entity.color,
            gridX: entity.gridX,
            gridY: entity.gridY,
            prevGridX: entity.gridX,
            prevGridY: entity.gridY,
            x: entity.gridX,
            y: entity.gridY,
            vx: dir.dx,
            vy: dir.dy,
            distanceTraveled: 0,
            maxDistance: 25
        };

        this.projectiles.push(p);

        this.screenShake = Math.max(this.screenShake, 5);
        for (let i = 0; i < 6; i++) {
            const rx = entity.gridX;
            const ry = entity.gridY;
            const particle = new Particle(rx, ry, entity.color);
            particle.vx = -dir.dx * (3 + Math.random() * 4) + (Math.random() * 2 - 1);
            particle.vy = -dir.dy * (3 + Math.random() * 4) + (Math.random() * 2 - 1);
            this.particles.push(particle);
        }

        if (entity.id === 'player') {
            this.updateHUD();
        }
    }

    triggerPaintExplosion(p) {
        const radius = 2;
        const capturedCells = [];
        const shooter = this.entities.find(e => e.id === p.ownerId);

        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const nx = p.gridX + dx;
                const ny = p.gridY + dy;

                if (dx*dx + dy*dy <= radius*radius + 0.5) {
                    if (this.isPlayableCell(nx, ny)) {
                        const cell = this.grid[nx][ny];
                        if (cell.ownerId !== p.ownerId) {
                            if (cell.ownerId) {
                                const victim = this.entities.find(e => e.id === cell.ownerId);
                                if (victim) victim.score = Math.max(0, victim.score - 1);
                            }
                            cell.ownerId = p.ownerId;
                            capturedCells.push({ x: nx, y: ny });
                        }
                    }
                }
            }
        }

        if (shooter && !shooter.isDead) {
            shooter.score = this.countOwnedCells(p.ownerId);
        }

        if (capturedCells.length > 0) {
            this.captureFlashes.push({
                ownerId: p.ownerId,
                cells: capturedCells,
                opacity: 0.9
            });

            const numParticles = 12 + Math.floor(capturedCells.length / 2);
            for (let i = 0; i < numParticles; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 1 + Math.random() * 4;
                const rx = p.gridX + (Math.random() * 0.6 - 0.3);
                const ry = p.gridY + (Math.random() * 0.6 - 0.3);
                const particle = new Particle(rx, ry, p.color);
                particle.vx = Math.cos(angle) * speed;
                particle.vy = Math.sin(angle) * speed;
                particle.alpha = 1.0;
                particle.decay = 0.03 + Math.random() * 0.03;
                this.particles.push(particle);
            }
        }

        if (p.ownerId === 'player' && this.currentMode === 'world' && shooter && !shooter.isDead) {
            const pct = (shooter.score / this.playableCellsCount) * 100;
            if (pct >= 100) {
                this.handleWorldVictory();
            }
        }

        this.screenShake = Math.max(this.screenShake, 8);
    }


    showScreen(screenToShow) {
        [this.lobbyScreen, this.gameScreen, this.gameOverScreen].forEach(screen => {
            screen.classList.remove('active');
            screen.classList.add('hidden');
        });
        screenToShow.classList.remove('hidden');
        // trigger animation delay
        setTimeout(() => screenToShow.classList.add('active'), 20);
    }

    getCellOwner(x, y) {
        if (x < 0 || x >= this.gridSize || y < 0 || y >= this.gridSize) return null;
        return this.grid[x][y].ownerId;
    }

    countOwnedCells(ownerId) {
        let count = 0;
        for (let x = 0; x < this.gridSize; x++) {
            for (let y = 0; y < this.gridSize; y++) {
                if (this.grid[x][y].ownerId === ownerId) {
                    count++;
                }
            }
        }
        return count;
    }

    /**
     * Logical Game Update Tick
     */
    tick(now) {
        if (this.player && this.player.isDead) return; // Freeze logic updates on death
        const deadList = new Set();
        const blockedList = new Set(); // Entities stopped by a wall this tick
        const killerMap = {}; // Track who killed whom: victimId -> killerId
        const directions = [
            { dx: 0, dy: -1 }, // Up
            { dx: 1, dy: 0 },  // Right
            { dx: 0, dy: 1 },  // Down
            { dx: -1, dy: 0 }  // Left
        ];

        // 0. Update power-up timers
        this.entities.forEach(entity => {
            if (entity.isDead) return;
            if (entity.speedBoostTime > 0) {
                entity.speedBoostTime = Math.max(0, entity.speedBoostTime - 60);
            }
        });

        // 1. Move logical positions and update paths
        this.entities.forEach(entity => {
            if (entity.isDead) return;

            entity.tickCooldown--;
            if (entity.tickCooldown > 0) {
                return; // Skip movement on this sub-tick
            }

            // Reset tick cooldown: 1 sub-tick for speed boosted, 2 sub-ticks for normal
            const isBoosted = entity.speedBoostTime > 0;
            entity.tickCooldown = isBoosted ? 1 : 2;
            entity.lastMoveTime = now;

            const nextDir = entity.nextDirection;
            const step = directions[nextDir];
            const nextGridX = entity.gridX + step.dx;
            const nextGridY = entity.gridY + step.dy;

            // Save previous coordinates for rendering interpolation
            entity.prevGridX = entity.gridX;
            entity.prevGridY = entity.gridY;

            // Wall collision: don't die, stop in front of the wall and steer left or right
            if (!this.isPlayableCell(nextGridX, nextGridY)) {
                const reverseDir = (entity.direction + 2) % 4;
                const hasEscape = directions.some((option, dir) => (
                    dir !== reverseDir &&
                    this.isPlayableCell(entity.gridX + option.dx, entity.gridY + option.dy)
                ));

                if (!hasEscape) {
                    // Completely walled in: nothing left to steer into
                    deadList.add(entity.id);
                    entity.deathReason = 'ist in einer Sackgasse gestrandet';
                    return;
                }

                blockedList.add(entity.id);
                if (!entity.isBlocked) {
                    entity.isBlocked = true;
                    this.createWallBumpParticles(entity, step);
                    if (entity.id === 'player') {
                        this.notifyWallBump();
                    }
                }
                // Keep facing the wall; the next steering input resolves the block
                return;
            }
            entity.isBlocked = false;

            // Check if hitting another player's trail (immune to own trail)
            const targetCell = this.grid[nextGridX][nextGridY];
            if (targetCell.trailOwnerId !== null && targetCell.trailOwnerId !== entity.id) {
                const trailOwner = targetCell.trailOwnerId;
                const killedEntity = this.entities.find(e => e.id === trailOwner);
                
                if (killedEntity) {
                    if (killedEntity.hasShield) {
                        // Shield blocks death!
                        killedEntity.hasShield = false;
                        this.createShieldBreakParticles(killedEntity);
                        this.showNotification(`<span style="color: ${killedEntity.color}">${escapeHtml(killedEntity.name)}s</span> Schild wurde zerstört! 🛡️`, '#00ffd5');
                    } else {
                        deadList.add(trailOwner);
                        killerMap[trailOwner] = entity.id; // entity is the killer
                        killedEntity.deathReason = `wurde von ${entity.name} eliminiert`;
                        entity.kills++;
                    }
                }
            }

            // Head-on collision check
            this.entities.forEach(other => {
                if (other.id === entity.id || other.isDead) return;
                
                const otherStep = directions[other.nextDirection];
                const otherNextX = other.gridX + otherStep.dx;
                const otherNextY = other.gridY + otherStep.dy;

                if (nextGridX === otherNextX && nextGridY === otherNextY) {
                    // Head-on!
                    const isEntityHome = (this.grid[nextGridX][nextGridY].ownerId === entity.id);
                    const isOtherHome = (this.grid[otherNextX][otherNextY].ownerId === other.id);

                    if (isEntityHome && !isOtherHome) {
                        deadList.add(other.id);
                        killerMap[other.id] = entity.id;
                        other.deathReason = `ist frontal mit ${entity.name} kollidiert`;
                        entity.kills++;
                    } else if (!isEntityHome && isOtherHome) {
                        deadList.add(entity.id);
                        killerMap[entity.id] = other.id;
                        entity.deathReason = `ist frontal mit ${other.name} kollidiert`;
                        other.kills++;
                    } else {
                        // Both outside or both inside: larger territory wins
                        if (entity.score > other.score) {
                            deadList.add(other.id);
                            killerMap[other.id] = entity.id;
                            other.deathReason = `wurde von ${entity.name} dominiert`;
                            entity.kills++;
                        } else if (other.score > entity.score) {
                            deadList.add(entity.id);
                            killerMap[entity.id] = other.id;
                            entity.deathReason = `wurde von ${other.name} dominiert`;
                            other.kills++;
                        } else {
                            // Equal score: both die (no killer)
                            deadList.add(entity.id);
                            deadList.add(other.id);
                            entity.deathReason = `wechselseitige frontale Kollision mit ${other.name}`;
                            other.deathReason = `wechselseitige frontale Kollision mit ${entity.name}`;
                        }
                    }
                }
            });

            // Update logical position
            entity.gridX = nextGridX;
            entity.gridY = nextGridY;
            entity.direction = nextDir;
        });

        // 2. Apply movement updates, trails, and territory captures
        this.entities.forEach(entity => {
            if (entity.isDead || deadList.has(entity.id)) return;
            if (blockedList.has(entity.id)) return; // Stopped at a wall, no trail or pickup this tick

            // Check if they actually moved on this tick (cooldown just reset)
            const isBoosted = entity.speedBoostTime > 0;
            const targetCooldown = isBoosted ? 1 : 2;
            if (entity.tickCooldown !== targetCooldown) {
                return; // Didn't move on this logical sub-tick
            }

            const x = entity.gridX;
            const y = entity.gridY;
            const cell = this.grid[x][y];

            const isOwnTerritory = (cell.ownerId === entity.id);

            if (isOwnTerritory) {
                // If we were outside (have a trail) and returned home, capture!
                if (entity.trail.length > 0) {
                    this.captureTerritory(entity);
                }
            } else {
                // Draw trail cell
                entity.trail.push({ x, y });
                cell.trailOwnerId = entity.id;
            }

            // Check if collecting a power-up
            const puIndex = this.powerUps.findIndex(pu => pu.x === x && pu.y === y);
            if (puIndex !== -1) {
                const pu = this.powerUps[puIndex];
                this.powerUps.splice(puIndex, 1); // Remove it
                if (entity.id === 'player') {
                    this.music.playPowerUp(pu.type);
                }

                if (pu.type === 'speed') {
                    entity.speedBoostTime = 6000; // 6 seconds
                    this.showNotification(`<span style="color: ${entity.color}">${escapeHtml(entity.name)}</span> hat TURBO gesammelt! ⚡`, '#ffff00');
                    for (let i = 0; i < 15; i++) this.particles.push(new Particle(entity.gridX, entity.gridY, '#ffff00'));
                } else if (pu.type === 'shield') {
                    entity.hasShield = true;
                    this.showNotification(`<span style="color: ${entity.color}">${escapeHtml(entity.name)}</span> hat SCHILD gesammelt! 🛡️`, '#00ffd5');
                    for (let i = 0; i < 15; i++) this.particles.push(new Particle(entity.gridX, entity.gridY, '#00ffd5'));
                } else if (pu.type === 'bomb') {
                    this.showNotification(`<span style="color: ${entity.color}">${escapeHtml(entity.name)}</span> hat BOMBE gezündet! 💥`, '#ff007f');
                    this.triggerBomb(entity, x, y);
                } else if (pu.type === 'cannon') {
                    entity.cannonShots = (entity.cannonShots || 0) + 3;
                    this.showNotification(`<span style="color: ${entity.color}">${escapeHtml(entity.name)}</span> hat FARBKANONE gesammelt! 🔫 (3 Schüsse)`, '#ff007f');
                    for (let i = 0; i < 15; i++) this.particles.push(new Particle(entity.gridX, entity.gridY, '#ff007f'));
                    if (entity.id === 'player') {
                        this.updateHUD();
                    }
                }
            }

            // Check if collecting a coin
            const coinIndex = this.coins.findIndex(c => c.x === x && c.y === y);
            if (coinIndex !== -1) {
                const coin = this.coins[coinIndex];
                this.coins.splice(coinIndex, 1); // Remove it
                entity.sessionCoins += coin.value;
                for (let i = 0; i < (coin.value > 1 ? 12 : 6); i++) {
                    this.particles.push(new Particle(entity.gridX, entity.gridY, '#ffd700'));
                }
                if (entity.id === 'player') {
                    this.music.playCoin(coin.value > 1);
                    this.updateHUD();
                }
            }
        });

        // 2.5 Update Projectiles
        const projectilesToDestroy = [];
        this.projectiles.forEach((p, index) => {
            p.prevGridX = p.gridX;
            p.prevGridY = p.gridY;
            p.gridX += p.vx;
            p.gridY += p.vy;
            p.distanceTraveled++;

            // 1. Boundary collision
            if (!this.isPlayableCell(p.gridX, p.gridY)) {
                projectilesToDestroy.push(index);
                this.triggerPaintExplosion(p);
                return;
            }

            // 2. Collision with player heads
            let hitHead = false;
            this.entities.forEach(entity => {
                if (entity.isDead || deadList.has(entity.id) || hitHead) return;
                if (entity.gridX === p.gridX && entity.gridY === p.gridY) {
                    if (entity.id !== p.ownerId || p.distanceTraveled > 1) {
                        hitHead = true;
                        deadList.add(entity.id);
                        killerMap[entity.id] = p.ownerId;
                        entity.deathReason = `wurde von ${this.entities.find(e => e.id === p.ownerId)?.name || 'einer Farbkanone'} abgeschossen`;
                        
                        const shooter = this.entities.find(e => e.id === p.ownerId);
                        if (shooter && entity.id !== p.ownerId) {
                            shooter.kills++;
                        }
                    }
                }
            });

            if (hitHead) {
                projectilesToDestroy.push(index);
                this.triggerPaintExplosion(p);
                return;
            }

            // 3. Collision with trails
            let hitTrail = false;
            const cell = this.grid[p.gridX][p.gridY];
            if (cell.trailOwnerId !== null) {
                const trailOwnerId = cell.trailOwnerId;
                if (trailOwnerId !== p.ownerId || p.distanceTraveled > 1) {
                    hitTrail = true;
                    const victim = this.entities.find(e => e.id === trailOwnerId);
                    if (victim && !deadList.has(trailOwnerId)) {
                        if (victim.hasShield) {
                            victim.hasShield = false;
                            this.createShieldBreakParticles(victim);
                            this.showNotification(`<span style="color: ${victim.color}">${escapeHtml(victim.name)}s</span> Schild wurde zerstört! 🛡️`, '#00ffd5');
                        } else {
                            deadList.add(trailOwnerId);
                            killerMap[trailOwnerId] = p.ownerId;
                            victim.deathReason = `wurde von ${this.entities.find(e => e.id === p.ownerId)?.name || 'einer Farbkanone'} abgeschossen`;
                            
                            const shooter = this.entities.find(e => e.id === p.ownerId);
                            if (shooter && trailOwnerId !== p.ownerId) {
                                shooter.kills++;
                            }
                        }
                    }
                }
            }

            if (hitTrail) {
                projectilesToDestroy.push(index);
                this.triggerPaintExplosion(p);
                return;
            }

            // 4. Maximum range reached
            if (p.distanceTraveled >= p.maxDistance) {
                projectilesToDestroy.push(index);
                this.triggerPaintExplosion(p);
            }
        });

        // Remove exploded/destroyed projectiles
        projectilesToDestroy.sort((a, b) => b - a).forEach(index => {
            this.projectiles.splice(index, 1);
        });

        // 3. Process deaths
        deadList.forEach(deadId => {
            const killerId = killerMap[deadId] || null;
            this.eliminateEntity(deadId, killerId);
        });

        // 4. Update Bot Decisions
        this.entities.forEach(entity => {
            if (entity instanceof Bot && !entity.isDead) {
                entity.decideNextDirection(this);
            }
        });

        // 5. Randomly spawn power-ups
        if (Math.random() < 0.035 && this.powerUps.length < 5) {
            this.spawnPowerUp();
        }

        // 6. Randomly spawn coin pickups (the in-run currency)
        if (Math.random() < 0.09 && this.coins.length < 18) {
            this.spawnCoin();
        }

        // Update Leaderboard & Scores
        this.updateHUD();
    }

    captureTerritory(entity) {
        const gridSize = this.gridSize;
        const visited = Array(gridSize).fill(null).map(() => Array(gridSize).fill(false));
        
        // Queue for boundary-start flood fill
        const queue = [];

        // Check if cell is blocked by this player's stuff (either owned or part of their trail) or is unplayable
        const isBlock = (x, y) => {
            return !this.isPlayableCell(x, y) || this.grid[x][y].ownerId === entity.id || this.grid[x][y].trailOwnerId === entity.id;
        };

        // Initialize outer edges for flood fill
        for (let x = 0; x < gridSize; x++) {
            if (!isBlock(x, 0)) {
                visited[x][0] = true;
                queue.push({ x, y: 0 });
            }
            if (!isBlock(x, gridSize - 1)) {
                visited[x][gridSize - 1] = true;
                queue.push({ x, y: gridSize - 1 });
            }
        }

        for (let y = 1; y < gridSize - 1; y++) {
            if (!isBlock(0, y)) {
                visited[0][y] = true;
                queue.push({ x: 0, y });
            }
            if (!isBlock(gridSize - 1, y)) {
                visited[gridSize - 1][y] = true;
                queue.push({ x: gridSize - 1, y });
            }
        }

        // Run BFS to mark all cells reachable from grid boundary
        let head = 0;
        const dx = [0, 0, 1, -1];
        const dy = [1, -1, 0, 0];

        while (head < queue.length) {
            const curr = queue[head++];
            for (let i = 0; i < 4; i++) {
                const nx = curr.x + dx[i];
                const ny = curr.y + dy[i];

                if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
                    if (!visited[nx][ny] && !isBlock(nx, ny)) {
                        visited[nx][ny] = true;
                        queue.push({ x: nx, y: ny });
                    }
                }
            }
        }

        // Capture all unvisited playable cells (those enclosed by player's boundary)
        let capturedCount = 0;
        const capturedCellsList = [];
        for (let x = 0; x < gridSize; x++) {
            for (let y = 0; y < gridSize; y++) {
                if (!visited[x][y] && this.grid[x][y].playable) {
                    const cell = this.grid[x][y];
                    
                    // Steal territory from others
                    if (cell.ownerId && cell.ownerId !== entity.id) {
                        const victim = this.entities.find(e => e.id === cell.ownerId);
                        if (victim) victim.score = Math.max(0, victim.score - 1);
                    }
                    
                    if (cell.ownerId !== entity.id) {
                        capturedCount++;
                        capturedCellsList.push({ x, y });
                    }

                    cell.ownerId = entity.id;
                }
                
                // Clear the trail flag
                if (this.grid[x][y].trailOwnerId === entity.id) {
                    this.grid[x][y].trailOwnerId = null;
                }
            }
        }

        entity.score = this.countOwnedCells(entity.id);
        entity.trail = [];

        // Spawn visual flash particles
        this.createCaptureParticles(entity, capturedCount);

        // Record flash animation
        if (capturedCellsList.length > 0) {
            this.captureFlashes.push({
                ownerId: entity.id,
                cells: capturedCellsList,
                opacity: 0.85
            });
        }

        // Check if player won the continent
        if (entity.id === 'player' && this.currentMode === 'world') {
            const pct = (entity.score / this.playableCellsCount) * 100;
            if (pct >= 100) {
                this.handleWorldVictory();
            }
        }
    }

    eliminateEntity(id, killerId = null) {
        const entity = this.entities.find(e => e.id === id);
        if (!entity || entity.isDead) return;

        entity.isDead = true;

        // Save progress if the player was eliminated
        if (id === 'player' && this.currentMode === 'world') {
            const runPercent = this.player.peakPercentage || 0;
            const currentProgress = this.progressStore.getLevelProgress(this.currentLevelId);
            const newProgress = Math.min(100, currentProgress + runPercent);
            this.progressStore.setLevelProgress(this.currentLevelId, newProgress);
            this.renderWorldLevels();
        }

        // Particle explosion
        for (let i = 0; i < 24; i++) {
            this.particles.push(new Particle(entity.gridX, entity.gridY, entity.color));
        }

        const killer = killerId ? this.entities.find(e => e.id === killerId && !e.isDead) : null;

        // Reset all grid cells owned by them, or transfer to killer (including active trails)
        for (let x = 0; x < this.gridSize; x++) {
            for (let y = 0; y < this.gridSize; y++) {
                if (this.grid[x][y].ownerId === id) {
                    if (killer) {
                        this.grid[x][y].ownerId = killerId;
                    } else {
                        this.grid[x][y].ownerId = null;
                    }
                }
                if (this.grid[x][y].trailOwnerId === id) {
                    if (killer) {
                        this.grid[x][y].ownerId = killerId;
                    }
                    this.grid[x][y].trailOwnerId = null;
                }
            }
        }

        // Recalculate scores for killer if present
        if (killer) {
            killer.score = this.countOwnedCells(killerId);
        }

        // Trigger kill toast notification
        const victimName = entity.name;
        const killerName = killer ? killer.name : null;
        if (killerName) {
            this.showNotification(`<span style="color: ${killer.color}">${escapeHtml(killerName)}</span> hat <span style="color: ${entity.color}">${escapeHtml(victimName)}</span> eliminiert!`, killer.color);
        } else {
            this.showNotification(`<span style="color: ${entity.color}">${escapeHtml(victimName)}</span> ist ausgeschieden!`, entity.color);
        }

        // Clean up entity lists
        if (id === 'player') {
            this.screenShake = 26;
            // Cut the music and play the stinger immediately on death, not
            // after the recap-screen delay below — otherwise it lags the
            // actual moment of dying by ~1.8s.
            this.music.stop();
            this.music.playGameOver();
            setTimeout(() => {
                this.isPlaying = false;
                this.showGameOver();
            }, 1800);
        } else {
            // Respawn bot after a delay
            setTimeout(() => {
                if (!this.isPlaying) return;
                this.entities = this.entities.filter(e => e.id !== id);
                this.spawnBot();
            }, 3000);
        }
    }

    createCaptureParticles(entity, count) {
        if (count < 5) return;
        // Spawn particles along the edge or head
        const numParticles = Math.min(15, Math.floor(count / 4));
        for (let i = 0; i < numParticles; i++) {
            const rx = entity.gridX + (Math.random() * 4 - 2);
            const ry = entity.gridY + (Math.random() * 4 - 2);
            this.particles.push(new Particle(rx, ry, entity.color));
        }
    }

    updateHUD() {
        if (!this.player) return;

        const totalPlayable = this.currentMode === 'world' ? this.playableCellsCount : (this.gridSize * this.gridSize);
        
        // Calculate percentages
        this.entities.forEach(e => {
            if (e.isDead) return;
            const pct = (e.score / totalPlayable) * 100;
            if (pct > e.peakPercentage) {
                e.peakPercentage = pct;
            }
        });

        const playerPct = (this.player.score / totalPlayable) * 100;
        this.hudScore.innerText = `${playerPct.toFixed(2)}%`;
        this.hudKills.innerText = this.player.kills;
        if (this.hudCoins) {
            this.hudCoins.innerText = `🪙 ${this.player.sessionCoins}`;
        }

        // Cannon ammo display and mobile fire button toggle
        const cannonContainer = document.getElementById('hud-cannon-container');
        const cannonVal = document.getElementById('hud-cannon');
        const mobileFireBtn = document.getElementById('mobile-fire-button');

        if (cannonContainer && cannonVal) {
            if (this.player.cannonShots > 0) {
                cannonVal.innerText = this.player.cannonShots;
                cannonContainer.classList.remove('hidden');
            } else {
                cannonContainer.classList.add('hidden');
            }
        }
        if (mobileFireBtn) {
            if (this.player.cannonShots > 0) {
                mobileFireBtn.classList.remove('hidden');
            } else {
                mobileFireBtn.classList.add('hidden');
            }
        }

        // Populate Leaderboard (Sort active entities by score)
        const activeList = this.entities
            .filter(e => !e.isDead)
            .sort((a, b) => b.score - a.score);

        this.leaderboardList.innerHTML = '';
        activeList.slice(0, 5).forEach((entity, index) => {
            const pct = ((entity.score / totalPlayable) * 100).toFixed(1);
            const li = createLeaderboardItem(document, entity, index + 1, pct);
            this.leaderboardList.appendChild(li);
        });
    }

    showGameOver() {
        const totalPlayable = this.currentMode === 'world' ? this.playableCellsCount : (this.gridSize * this.gridSize);
        const finalScore = this.player.peakPercentage;
        this.recapScore.innerText = `${finalScore.toFixed(2)}%`;
        this.recapKills.innerText = this.player.kills;

        const duration = Math.floor((performance.now() - this.gameStartTime) / 1000);
        this.recapTime.innerText = `${duration}s`;

        // Calculate rank
        const ranking = this.entities.sort((a, b) => b.score - a.score);
        const rank = ranking.findIndex(e => e.id === 'player') + 1;
        this.recapRank.innerText = `#${rank}`;
        
        this.eliminatedByText.innerText = this.player.deathReason || 'Du bist abgestürzt!';

        this.awardRunCoins();
        this.showScreen(this.gameOverScreen);
    }

    showNotification(message, color) {
        const container = document.getElementById('notification-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'notification';
        toast.style.borderColor = color;
        toast.style.color = color;
        toast.innerHTML = message;

        container.appendChild(toast);

        // Remove after animation finishes
        setTimeout(() => {
            toast.remove();
        }, 2500);
    }

    /**
     * Render Frame loop (Runs at 60fps)
     */
    gameLoop(now) {
        if (!this.isPlaying) return;

        if (!this.isTabVisible) {
            this.lastTime = now;
            this.lastTickTime = now;
            requestAnimationFrame((t) => this.gameLoop(t));
            return;
        }

        const delta = now - this.lastTime;
        this.lastTime = now;

        // Logical logic tick
        let timeSinceLastTick = now - this.lastTickTime;
        if (timeSinceLastTick >= TICK_INTERVAL) {
            this.tick(now);
            this.lastTickTime = now - (timeSinceLastTick % TICK_INTERVAL);
            timeSinceLastTick = 0;
            
            // Snap entities visual position to logical position right after tick
            this.entities.forEach(e => {
                if (!e.isDead) {
                    e.prevX = e.prevGridX ?? e.gridX;
                    e.prevY = e.prevGridY ?? e.gridY;
                }
            });

            this.projectiles.forEach(p => {
                p.prevX = p.prevGridX ?? p.gridX;
                p.prevY = p.prevGridY ?? p.gridY;
            });
        }

        // Update visual positions based on entity-specific moves
        this.entities.forEach(e => {
            if (e.isDead) return;
            const prevX = e.prevX ?? e.gridX;
            const prevY = e.prevY ?? e.gridY;
            const elapsed = now - (e.lastMoveTime ?? 0);
            const duration = e.speedBoostTime > 0 ? 60 : 120; // 60ms for Turbo, 120ms for Normal
            const t = Math.min(1.0, elapsed / duration);
            e.x = prevX + (e.gridX - prevX) * t;
            e.y = prevY + (e.gridY - prevY) * t;
        });

        // Update visual positions for projectiles
        const elapsedSinceTick = now - this.lastTickTime;
        const projectileT = Math.min(1.0, elapsedSinceTick / TICK_INTERVAL);
        this.projectiles.forEach(p => {
            const prevX = p.prevX ?? p.gridX;
            const prevY = p.prevY ?? p.gridY;
            p.x = prevX + (p.gridX - prevX) * projectileT;
            p.y = prevY + (p.gridY - prevY) * projectileT;
        });

        // Camera lerp towards player and handle death zoom out
        if (this.player) {
            if (this.player.isDead) {
                // Smoothly zoom out on death
                this.camera.zoom += (0.7 - this.camera.zoom) * 0.03;
            } else {
                this.camera.zoom += (1.0 - this.camera.zoom) * 0.08;
            }
            
            const targetCamX = this.player.x;
            const targetCamY = this.player.y;
            // Lerp camera
            this.camera.x += (targetCamX - this.camera.x) * 0.1;
            this.camera.y += (targetCamY - this.camera.y) * 0.1;
        }

        // Update capture flashes opacity
        this.captureFlashes.forEach(f => f.opacity -= 0.04);
        this.captureFlashes = this.captureFlashes.filter(f => f.opacity > 0);

        // Update particles
        this.particles.forEach(p => p.update());
        this.particles = this.particles.filter(p => p.alpha > 0);

        // Decay screen shake here so it settles in both view modes — the 2D
        // canvas path used to be the only place decrementing it, so in 3D
        // mode a shake (kill, bomb, shield break) never wore off.
        if (this.screenShake > 0) {
            this.screenShake--;
        }

        // Render everything
        if (this.viewMode === '3d') {
            this.threeRenderer.render(this);
        } else {
            this.render();
        }
        this.renderMinimap();

        requestAnimationFrame((t) => this.gameLoop(t));
    }

    drawSmoothTrail(ctx, entity, camOffsetX, camOffsetY) {
        if (entity.trail.length === 0) return;

        ctx.save();
        const rgb = NEON_COLORS[entity.color];
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.78)`;
        ctx.lineWidth = CELL_SIZE - 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Add visual neon glow to the trails
        ctx.shadowBlur = 12;
        ctx.shadowColor = entity.color;

        ctx.beginPath();
        const points = [];

        entity.trail.forEach(p => {
            points.push({
                x: p.x * CELL_SIZE + CELL_SIZE / 2 + camOffsetX,
                y: p.y * CELL_SIZE + CELL_SIZE / 2 + camOffsetY
            });
        });

        // Connect smoothly to the visual head position
        points.push({
            x: entity.x * CELL_SIZE + CELL_SIZE / 2 + camOffsetX,
            y: entity.y * CELL_SIZE + CELL_SIZE / 2 + camOffsetY
        });

        if (points.length < 2) {
            ctx.restore();
            return;
        }

        ctx.moveTo(points[0].x, points[0].y);

        if (points.length === 2) {
            ctx.lineTo(points[1].x, points[1].y);
        } else {
            // Draw smooth quadratic curves through midpoint interpolation
            for (let i = 0; i < points.length - 1; i++) {
                const xc = (points[i].x + points[i+1].x) / 2;
                const yc = (points[i].y + points[i+1].y) / 2;
                ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
            }
            ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        }

        ctx.stroke();
        ctx.restore();
    }

    render() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.clearRect(0, 0, width, height);

        ctx.save();
        // Scale viewport centered around center
        ctx.translate(width / 2, height / 2);
        ctx.scale(this.camera.zoom, this.camera.zoom);
        ctx.translate(-width / 2, -height / 2);

        // Center camera offset
        let camOffsetX = width / 2 - this.camera.x * CELL_SIZE;
        let camOffsetY = height / 2 - this.camera.y * CELL_SIZE;

        // Apply screen shake (decay happens once per frame in gameLoop)
        if (this.screenShake > 0) {
            const shakeMagnitude = (this.screenShake / 26) * 14;
            camOffsetX += (Math.random() * 2 - 1) * shakeMagnitude;
            camOffsetY += (Math.random() * 2 - 1) * shakeMagnitude;
        }

        // Viewport culling limits
        const startX = Math.max(0, Math.floor((-camOffsetX) / CELL_SIZE));
        const endX = Math.min(this.gridSize, Math.ceil((width - camOffsetX) / CELL_SIZE));
        const startY = Math.max(0, Math.floor((-camOffsetY) / CELL_SIZE));
        const endY = Math.min(this.gridSize, Math.ceil((height - camOffsetY) / CELL_SIZE));

        // 1. Draw Land Background & Cell Borders (Optimized Batch Rendering)
        ctx.fillStyle = '#111322';
        ctx.beginPath();
        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                if (this.grid[x][y].playable) {
                    ctx.rect(x * CELL_SIZE + camOffsetX, y * CELL_SIZE + camOffsetY, CELL_SIZE, CELL_SIZE);
                }
            }
        }
        ctx.fill();

        ctx.strokeStyle = '#181a2b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                if (this.grid[x][y].playable) {
                    const px = x * CELL_SIZE + camOffsetX;
                    const py = y * CELL_SIZE + camOffsetY;
                    
                    // Top line
                    ctx.moveTo(px, py);
                    ctx.lineTo(px + CELL_SIZE, py);
                    
                    // Left line
                    ctx.moveTo(px, py);
                    ctx.lineTo(px, py + CELL_SIZE);
                    
                    // Right and bottom outer borders
                    if (x === this.gridSize - 1 || !this.grid[x + 1][y].playable) {
                        ctx.moveTo(px + CELL_SIZE, py);
                        ctx.lineTo(px + CELL_SIZE, py + CELL_SIZE);
                    }
                    if (y === this.gridSize - 1 || !this.grid[x][y + 1].playable) {
                        ctx.moveTo(px, py + CELL_SIZE);
                        ctx.lineTo(px + CELL_SIZE, py + CELL_SIZE);
                    }
                }
            }
        }
        ctx.stroke();

        // 2. Draw Captured Territories (Optimized Batch Rendering)
        this.entities.forEach(owner => {
            if (owner.isDead) return;
            
            const rgb = NEON_COLORS[owner.color];
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.28)`;
            ctx.beginPath();
            
            for (let x = startX; x < endX; x++) {
                for (let y = startY; y < endY; y++) {
                    if (this.grid[x][y].ownerId === owner.id) {
                        ctx.rect(x * CELL_SIZE + camOffsetX, y * CELL_SIZE + camOffsetY, CELL_SIZE, CELL_SIZE);
                    }
                }
            }
            ctx.fill();
        });

        // Draw Capture Flashes (Optimized Batch Rendering)
        this.captureFlashes.forEach(flash => {
            const owner = this.entities.find(e => e.id === flash.ownerId);
            if (!owner) return;
            const rgb = NEON_COLORS[owner.color];
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${flash.opacity})`;
            ctx.beginPath();
            flash.cells.forEach(c => {
                ctx.rect(c.x * CELL_SIZE + camOffsetX, c.y * CELL_SIZE + camOffsetY, CELL_SIZE, CELL_SIZE);
            });
            ctx.fill();
        });

        // Draw Power-Ups (rotating, glowing capsules)
        this.powerUps.forEach(pu => {
            const px = pu.x * CELL_SIZE + camOffsetX;
            const py = pu.y * CELL_SIZE + camOffsetY;
            if (px < -30 || px > width + 30 || py < -30 || py > height + 30) return;

            ctx.save();
            const pulse = 1 + Math.sin(performance.now() * 0.007 + pu.x) * 0.12;
            ctx.translate(px + CELL_SIZE / 2, py + CELL_SIZE / 2);
            ctx.scale(pulse, pulse);

            let color = '#ffff00';
            if (pu.type === 'shield') color = '#00ffd5';
            if (pu.type === 'bomb') color = '#ff007f';
            if (pu.type === 'cannon') color = '#ffaa00';

            ctx.shadowBlur = 15;
            ctx.shadowColor = color;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(0, 0, CELL_SIZE / 2 - 2, 0, Math.PI * 2);
            ctx.stroke();

            const rgb = NEON_COLORS[color];
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`;
            ctx.beginPath();
            ctx.arc(0, 0, CELL_SIZE / 2 - 3, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = color;
            ctx.font = '800 12px Inter';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let symbol = '⚡';
            if (pu.type === 'shield') symbol = '🛡️';
            if (pu.type === 'bomb') symbol = '💥';
            if (pu.type === 'cannon') symbol = '🔫';
            ctx.fillText(symbol, 0, 0.5);

            ctx.restore();
        });

        // Draw Coins (spinning gold discs)
        this.coins.forEach(coin => {
            const px = coin.x * CELL_SIZE + camOffsetX;
            const py = coin.y * CELL_SIZE + camOffsetY;
            if (px < -30 || px > width + 30 || py < -30 || py > height + 30) return;

            const isBig = coin.value > 1;
            const baseRadius = (isBig ? 0.42 : 0.32) * CELL_SIZE;
            const spinScaleX = Math.cos(performance.now() * 0.004 + coin.x + coin.y);
            const bob = Math.sin(performance.now() * 0.005 + coin.x) * 2;

            ctx.save();
            ctx.translate(px + CELL_SIZE / 2, py + CELL_SIZE / 2 + bob);
            ctx.scale(Math.max(0.15, Math.abs(spinScaleX)), 1);

            ctx.shadowBlur = isBig ? 20 : 12;
            ctx.shadowColor = '#ffd700';
            ctx.fillStyle = isBig ? '#ffe45c' : '#ffd700';
            ctx.beginPath();
            ctx.arc(0, 0, baseRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#b8860b';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.restore();

            if (isBig) {
                ctx.save();
                ctx.fillStyle = '#fff8dc';
                ctx.font = '800 11px Inter';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('5', px + CELL_SIZE / 2, py + CELL_SIZE / 2 + bob + 0.5);
                ctx.restore();
            }
        });

        // 3. Draw Smooth Active Trails as Rounded Curves
        this.entities.forEach(entity => {
            if (!entity.isDead) {
                this.drawSmoothTrail(ctx, entity, camOffsetX, camOffsetY);
            }
        });

        // 4. Draw Arena Outer Glowing Borders
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#b026ff';
        ctx.strokeStyle = '#b026ff';
        ctx.lineWidth = 4;
        if (this.currentMode === 'world') {
            ctx.beginPath();
            this.boundarySegments.forEach(seg => {
                ctx.moveTo(seg.x1 * CELL_SIZE + camOffsetX, seg.y1 * CELL_SIZE + camOffsetY);
                ctx.lineTo(seg.x2 * CELL_SIZE + camOffsetX, seg.y2 * CELL_SIZE + camOffsetY);
            });
            ctx.stroke();
        } else {
            ctx.strokeRect(camOffsetX, camOffsetY, MAP_SIZE, MAP_SIZE);
        }
        ctx.restore();

        // 5. Draw Entities Heads (Circular & Interpolated smoothly)
        this.entities.forEach(entity => {
            if (entity.isDead) return;

            // Cull if entity is way off screen
            const ex = entity.x * CELL_SIZE + camOffsetX;
            const ey = entity.y * CELL_SIZE + camOffsetY;
            if (ex < -40 || ex > width + 40 || ey < -40 || ey > height + 40) return;

            ctx.save();
            ctx.fillStyle = entity.color;
            ctx.shadowBlur = 15;
            ctx.shadowColor = entity.color;

            // Draw glowing circular head
            const padding = 1.5;
            ctx.beginPath();
            ctx.arc(ex + CELL_SIZE/2, ey + CELL_SIZE/2, CELL_SIZE/2 - padding, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw glowing shield bubble if present
            if (entity.hasShield) {
                ctx.save();
                ctx.strokeStyle = '#00ffd5';
                ctx.lineWidth = 2.5;
                ctx.shadowBlur = 12;
                ctx.shadowColor = '#00ffd5';
                ctx.beginPath();
                ctx.arc(ex + CELL_SIZE/2, ey + CELL_SIZE/2, CELL_SIZE * 0.72, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
            ctx.shadowBlur = 0; // turn off shadow for detail drawing

            // Draw Eyes looking in movement direction
            ctx.fillStyle = '#ffffff';
            let eyeX1, eyeY1, eyeX2, eyeY2;
            const eyeSize = 3;
            const eyeOffset = 4;

            // 0: Up, 1: Right, 2: Down, 3: Left
            if (entity.direction === 0) { // Up
                eyeX1 = ex + eyeOffset; eyeY1 = ey + eyeOffset;
                eyeX2 = ex + CELL_SIZE - eyeOffset - eyeSize; eyeY2 = ey + eyeOffset;
            } else if (entity.direction === 1) { // Right
                eyeX1 = ex + CELL_SIZE - eyeOffset - eyeSize; eyeY1 = ey + eyeOffset;
                eyeX2 = ex + CELL_SIZE - eyeOffset - eyeSize; eyeY2 = ey + CELL_SIZE - eyeOffset - eyeSize;
            } else if (entity.direction === 2) { // Down
                eyeX1 = ex + eyeOffset; eyeY1 = ey + CELL_SIZE - eyeOffset - eyeSize;
                eyeX2 = ex + CELL_SIZE - eyeOffset - eyeSize; eyeY2 = ey + CELL_SIZE - eyeOffset - eyeSize;
            } else { // Left
                eyeX1 = ex + eyeOffset; eyeY1 = ey + eyeOffset;
                eyeX2 = ex + eyeOffset; eyeY2 = ey + CELL_SIZE - eyeOffset - eyeSize;
            }

            ctx.beginPath();
            ctx.arc(eyeX1 + eyeSize/2, eyeY1 + eyeSize/2, eyeSize/2, 0, Math.PI*2);
            ctx.arc(eyeX2 + eyeSize/2, eyeY2 + eyeSize/2, eyeSize/2, 0, Math.PI*2);
            ctx.fill();

            // Pupil detail
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(eyeX1 + eyeSize/2, eyeY1 + eyeSize/2, eyeSize/4, 0, Math.PI*2);
            ctx.arc(eyeX2 + eyeSize/2, eyeY2 + eyeSize/2, eyeSize/4, 0, Math.PI*2);
            ctx.fill();

            // Draw character icon badge just above the head, so the chosen
            // character is legible at a glance, not just a tiny inline glyph
            if (entity.icon) {
                const badgeX = ex + CELL_SIZE / 2;
                const badgeY = ey - 8;
                const badgeRadius = 8;

                ctx.save();
                ctx.fillStyle = 'rgba(10, 12, 22, 0.78)';
                ctx.beginPath();
                ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = entity.color;
                ctx.lineWidth = 1.5;
                ctx.shadowBlur = 8;
                ctx.shadowColor = entity.color;
                ctx.stroke();
                ctx.shadowBlur = 0;

                ctx.font = '11px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(entity.icon, badgeX, badgeY + 0.5);
                ctx.restore();
            }

            // Draw player username tag above the icon badge
            ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.font = '500 10px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(entity.name, ex + CELL_SIZE/2, ey - 24);
            ctx.restore();
        });

        // 4.5 Draw Projectiles
        this.projectiles.forEach(p => {
            const px = p.x * CELL_SIZE + camOffsetX;
            const py = p.y * CELL_SIZE + camOffsetY;
            if (px < -30 || px > width + 30 || py < -30 || py > height + 30) return;

            ctx.save();
            ctx.shadowBlur = 12;
            ctx.shadowColor = p.color;
            ctx.fillStyle = p.color;

            // Draw glowing circular projectile
            ctx.beginPath();
            ctx.arc(px + CELL_SIZE/2, py + CELL_SIZE/2, 6, 0, Math.PI * 2);
            ctx.fill();

            // Draw a small tail behind it in the opposite direction of its motion
            const rgb = NEON_COLORS[p.color];
            if (rgb) {
                ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.55)`;
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(px + CELL_SIZE/2, py + CELL_SIZE/2);
                ctx.lineTo(px + CELL_SIZE/2 - p.vx * 15, py + CELL_SIZE/2 - p.vy * 15);
                ctx.stroke();
            }

            ctx.restore();
        });

        // 5. Draw Death/Capture Particles
        this.particles.forEach(p => p.draw(ctx, camOffsetX, camOffsetY));

        ctx.restore(); // Restore zoom scale translation
    }

    createShieldBreakParticles(entity) {
        for (let i = 0; i < 20; i++) {
            this.particles.push(new Particle(entity.gridX, entity.gridY, '#00ffd5'));
        }
    }

    createWallBumpParticles(entity, step) {
        const x = entity.gridX + step.dx * 0.5;
        const y = entity.gridY + step.dy * 0.5;
        for (let i = 0; i < 8; i++) {
            this.particles.push(new Particle(x, y, '#ffffff'));
        }
    }

    notifyWallBump() {
        const now = performance.now();
        if (this.lastWallHintTime && now - this.lastWallHintTime < 8000) return;
        this.lastWallHintTime = now;
        this.showNotification('Wand! Lenke nach links oder rechts. 🧱', '#ffffff');
    }

    triggerBomb(entity, cx, cy) {
        const radius = 3;
        const capturedCells = [];
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const x = cx + dx;
                const y = cy + dy;
                if (this.isPlayableCell(x, y)) {
                    if (dx * dx + dy * dy <= radius * radius) {
                        const cell = this.grid[x][y];
                        if (cell.ownerId !== entity.id) {
                            if (cell.ownerId) {
                                const victim = this.entities.find(e => e.id === cell.ownerId);
                                if (victim) victim.score = Math.max(0, victim.score - 1);
                            }
                            cell.ownerId = entity.id;
                            capturedCells.push({ x, y });
                        }
                    }
                }
            }
        }
        entity.score = this.countOwnedCells(entity.id);

        if (capturedCells.length > 0) {
            this.captureFlashes.push({
                ownerId: entity.id,
                cells: capturedCells,
                opacity: 0.95
            });
            this.createCaptureParticles(entity, capturedCells.length * 2);
        }

        this.screenShake = 16;
    }

    spawnPowerUp() {
        const x = 5 + Math.floor(Math.random() * (this.gridSize - 10));
        const y = 5 + Math.floor(Math.random() * (this.gridSize - 10));

        if (!this.isPlayableCell(x, y)) return; // Only spawn in playable cells
        if (this.grid[x][y].ownerId !== null) return; // Only spawn in neutral cells
        if (this.grid[x][y].trailOwnerId !== null) return;
        if (this.powerUps.some(pu => pu.x === x && pu.y === y)) return;

        const types = ['speed', 'speed', 'shield', 'shield', 'bomb'];
        if (this.currentMode === 'classic') {
            types.push('cannon', 'cannon'); // Add twice to make it reasonably common
        }
        const type = types[Math.floor(Math.random() * types.length)];

        this.powerUps.push({ x, y, type });
    }

    spawnCoin() {
        const x = 5 + Math.floor(Math.random() * (this.gridSize - 10));
        const y = 5 + Math.floor(Math.random() * (this.gridSize - 10));

        if (!this.isPlayableCell(x, y)) return; // Only spawn in playable cells
        if (this.grid[x][y].ownerId !== null) return; // Only spawn in neutral cells
        if (this.grid[x][y].trailOwnerId !== null) return;
        if (this.coins.some(c => c.x === x && c.y === y)) return;
        if (this.powerUps.some(pu => pu.x === x && pu.y === y)) return;

        const value = Math.random() < 0.12 ? 5 : 1; // Rare bigger coin
        this.coins.push({ x, y, value });
    }

    renderMinimap() {
        const mCtx = this.minimapCtx;
        const mWidth = this.minimapCanvas.width;
        const mHeight = this.minimapCanvas.height;

        mCtx.clearRect(0, 0, mWidth, mHeight);

        const ratio = mWidth / this.gridSize; // 120 / 150 = 0.8 pixels per cell

        // Draw boundaries
        if (this.currentMode === 'world') {
            // Draw background land shape on minimap (Optimized Batch Rendering)
            mCtx.fillStyle = 'rgba(255, 255, 255, 0.03)';
            mCtx.beginPath();
            for (let x = 0; x < this.gridSize; x++) {
                for (let y = 0; y < this.gridSize; y++) {
                    if (this.grid[x][y].playable) {
                        mCtx.rect(x * ratio, y * ratio, ratio, ratio);
                    }
                }
            }
            mCtx.fill();
            
            // Draw boundary outline on minimap
            mCtx.strokeStyle = 'rgba(176, 38, 255, 0.4)';
            mCtx.lineWidth = 1.5;
            mCtx.beginPath();
            this.boundarySegments.forEach(seg => {
                mCtx.moveTo(seg.x1 * ratio, seg.y1 * ratio);
                mCtx.lineTo(seg.x2 * ratio, seg.y2 * ratio);
            });
            mCtx.stroke();
        } else {
            mCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            mCtx.lineWidth = 1;
            mCtx.strokeRect(0, 0, mWidth, mHeight);
        }

        // Draw owned cells on minimap (Optimized Batch Rendering)
        this.entities.forEach(owner => {
            if (owner.isDead) return;
            mCtx.fillStyle = owner.color;
            mCtx.beginPath();
            for (let x = 0; x < this.gridSize; x++) {
                for (let y = 0; y < this.gridSize; y++) {
                    if (this.grid[x][y].ownerId === owner.id) {
                        mCtx.rect(x * ratio, y * ratio, Math.max(1, ratio), Math.max(1, ratio));
                    }
                }
            }
            mCtx.fill();
        });

        // Draw entity head dots on minimap
        this.entities.forEach(entity => {
            if (entity.isDead) return;

            mCtx.fillStyle = (entity.id === 'player') ? '#ffffff' : entity.color;
            const size = (entity.id === 'player') ? 4 : 2.5;
            mCtx.beginPath();
            mCtx.arc(entity.gridX * ratio, entity.gridY * ratio, size/2, 0, Math.PI*2);
            mCtx.fill();
        });
    }
}

// Instantiate and start engine
window.onload = () => {
    window.game = new GameEngine();
};
