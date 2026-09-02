import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { CELL_SIZE, MAP_SIZE, NEON_COLORS } from '../config/game-config.js';

export class ThreeRenderer {
    constructor() {
        this.container = null;
        this.canvas = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.isInitialized = false;

        // Lighting
        this.dirLight = null;
        this.ambientLight = null;

        // Arena & Floor
        this.floorMesh = null;
        this.floorCanvas = null;
        this.floorCtx = null;
        this.floorTexture = null;
        this.boundaryGroup = null;

        // Meshes pools/maps
        this.entityMeshes = new Map(); // id -> { group, body, eyes, shield, label, crown }
        this.trailMeshes = new Map();  // id -> mesh
        this.powerUpMeshes = new Map(); // key `${x},${y}` -> mesh
        this.projectileMeshes = new Map(); // id -> mesh

        // Particles
        this.particlePool = [];
        this.particleGroup = null;

        // Camera follow & shake state
        this.cameraTargetPos = new THREE.Vector3();
        this.cameraLookTarget = new THREE.Vector3();
        this.cameraCurrentPos = new THREE.Vector3();
        this.cameraCurrentLook = new THREE.Vector3();
        this.cameraShakeOffset = new THREE.Vector3();
        this.cameraInitialized = false;

        // Materials cache
        this.materials = new Map();
    }

    init(container) {
        this.container = container;

        // Create WebGL canvas
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'three-canvas';
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.zIndex = '1';
        this.canvas.style.pointerEvents = 'none';
        this.container.appendChild(this.canvas);

        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;

        // 1. Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0c16);
        this.scene.fog = new THREE.FogExp2(0x0a0c16, 0.00065);

        // 2. Camera (Perspective 3rd-person)
        this.camera = new THREE.PerspectiveCamera(50, width / height, 10, 5000);
        this.camera.position.set(MAP_SIZE / 2, 450, MAP_SIZE / 2 + 350);
        this.camera.lookAt(MAP_SIZE / 2, 0, MAP_SIZE / 2);

        // 3. WebGL Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;

        // 4. Lights
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(this.ambientLight);

        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        this.dirLight.position.set(MAP_SIZE / 2 - 200, 600, MAP_SIZE / 2 - 300);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.dirLight.shadow.camera.near = 50;
        this.dirLight.shadow.camera.far = 1500;
        const d = 500;
        this.dirLight.shadow.camera.left = -d;
        this.dirLight.shadow.camera.right = d;
        this.dirLight.shadow.camera.top = d;
        this.dirLight.shadow.camera.bottom = -d;
        this.dirLight.shadow.bias = -0.0005;
        this.scene.add(this.dirLight);

        // Subtle colored rim lights for neon atmosphere
        const blueLight = new THREE.PointLight(0x00f3ff, 2.5, 1200);
        blueLight.position.set(MAP_SIZE * 0.2, 100, MAP_SIZE * 0.2);
        this.scene.add(blueLight);

        const magentaLight = new THREE.PointLight(0xb026ff, 2.5, 1200);
        magentaLight.position.set(MAP_SIZE * 0.8, 100, MAP_SIZE * 0.8);
        this.scene.add(magentaLight);

        // 5. Groups
        this.boundaryGroup = new THREE.Group();
        this.scene.add(this.boundaryGroup);

        this.particleGroup = new THREE.Group();
        this.scene.add(this.particleGroup);

        // 6. Setup Floor
        this.initFloor();

        this.isInitialized = true;
    }

    initFloor() {
        // High-res dynamic canvas texture for territories and grid
        const canvasRes = 1024;
        this.floorCanvas = document.createElement('canvas');
        this.floorCanvas.width = canvasRes;
        this.floorCanvas.height = canvasRes;
        this.floorCtx = this.floorCanvas.getContext('2d');

        this.floorTexture = new THREE.CanvasTexture(this.floorCanvas);
        this.floorTexture.generateMipmaps = false;
        this.floorTexture.minFilter = THREE.LinearFilter;
        this.floorTexture.magFilter = THREE.LinearFilter;

        const floorGeo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 1, 1);
        const floorMat = new THREE.MeshStandardMaterial({
            map: this.floorTexture,
            roughness: 0.45,
            metalness: 0.15,
        });

        this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
        this.floorMesh.rotation.x = -Math.PI / 2;
        this.floorMesh.position.set(MAP_SIZE / 2, 0, MAP_SIZE / 2);
        this.floorMesh.receiveShadow = true;
        this.scene.add(this.floorMesh);

        // Outer dark grid base plane (extended beyond map)
        const outerGeo = new THREE.PlaneGeometry(MAP_SIZE * 3, MAP_SIZE * 3);
        const outerMat = new THREE.MeshStandardMaterial({
            color: 0x05060b,
            roughness: 0.9,
            metalness: 0.1
        });
        const outerMesh = new THREE.Mesh(outerGeo, outerMat);
        outerMesh.rotation.x = -Math.PI / 2;
        outerMesh.position.set(MAP_SIZE / 2, -1, MAP_SIZE / 2);
        outerMesh.receiveShadow = true;
        this.scene.add(outerMesh);
    }

    setupBoundaryWalls(game) {
        // Clear previous boundary walls
        while (this.boundaryGroup.children.length > 0) {
            const child = this.boundaryGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.boundaryGroup.remove(child);
        }

        const wallHeight = 18;
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0xb026ff,
            emissive: 0xb026ff,
            emissiveIntensity: 0.6,
            roughness: 0.2,
            metalness: 0.8,
            transparent: true,
            opacity: 0.85
        });

        if (game.currentMode === 'world' && game.boundarySegments && game.boundarySegments.length > 0) {
            game.boundarySegments.forEach(seg => {
                const x1 = seg.x1 * CELL_SIZE;
                const z1 = seg.y1 * CELL_SIZE;
                const x2 = seg.x2 * CELL_SIZE;
                const z2 = seg.y2 * CELL_SIZE;

                const dx = x2 - x1;
                const dz = z2 - z1;
                const length = Math.sqrt(dx * dx + dz * dz);
                const angle = Math.atan2(dz, dx);

                const wallGeo = new THREE.BoxGeometry(length, wallHeight, 4);
                const wallMesh = new THREE.Mesh(wallGeo, wallMat);
                wallMesh.position.set((x1 + x2) / 2, wallHeight / 2, (z1 + z2) / 2);
                wallMesh.rotation.y = -angle;
                wallMesh.castShadow = true;
                this.boundaryGroup.add(wallMesh);
            });
        } else {
            // Classic Square Outer Border Walls
            const thickness = 6;
            const positions = [
                { x: MAP_SIZE / 2, z: 0, w: MAP_SIZE, d: thickness },
                { x: MAP_SIZE / 2, z: MAP_SIZE, w: MAP_SIZE, d: thickness },
                { x: 0, z: MAP_SIZE / 2, w: thickness, d: MAP_SIZE },
                { x: MAP_SIZE, z: MAP_SIZE / 2, w: thickness, d: MAP_SIZE }
            ];

            positions.forEach(p => {
                const wallGeo = new THREE.BoxGeometry(p.w, wallHeight, p.d);
                const wallMesh = new THREE.Mesh(wallGeo, wallMat);
                wallMesh.position.set(p.x, wallHeight / 2, p.z);
                wallMesh.castShadow = true;
                this.boundaryGroup.add(wallMesh);
            });
        }
    }

    updateFloorTexture(game) {
        if (!this.floorCtx) return;
        const ctx = this.floorCtx;
        const w = this.floorCanvas.width;
        const h = this.floorCanvas.height;
        const scale = w / MAP_SIZE;
        const cellPixelSize = CELL_SIZE * scale;

        // Clear background
        ctx.fillStyle = '#0f111e';
        ctx.fillRect(0, 0, w, h);

        // Draw playable arena
        ctx.fillStyle = '#14172a';
        for (let x = 0; x < game.gridSize; x++) {
            for (let y = 0; y < game.gridSize; y++) {
                if (game.grid[x] && game.grid[x][y] && game.grid[x][y].playable) {
                    ctx.fillRect(x * cellPixelSize, y * cellPixelSize, cellPixelSize + 0.5, cellPixelSize + 0.5);
                }
            }
        }

        // Draw grid lines
        ctx.strokeStyle = '#1d2138';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        for (let x = 0; x <= game.gridSize; x += 2) {
            ctx.moveTo(x * cellPixelSize, 0);
            ctx.lineTo(x * cellPixelSize, h);
        }
        for (let y = 0; y <= game.gridSize; y += 2) {
            ctx.moveTo(0, y * cellPixelSize);
            ctx.lineTo(w, y * cellPixelSize);
        }
        ctx.stroke();

        // Draw captured territories
        game.entities.forEach(owner => {
            if (owner.isDead) return;
            const rgb = NEON_COLORS[owner.color];
            if (!rgb) return;

            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.55)`;
            ctx.beginPath();
            for (let x = 0; x < game.gridSize; x++) {
                for (let y = 0; y < game.gridSize; y++) {
                    if (game.grid[x] && game.grid[x][y] && game.grid[x][y].ownerId === owner.id) {
                        ctx.rect(x * cellPixelSize, y * cellPixelSize, cellPixelSize + 0.5, cellPixelSize + 0.5);
                    }
                }
            }
            ctx.fill();
        });

        // Draw capture flashes
        if (game.captureFlashes && game.captureFlashes.length > 0) {
            game.captureFlashes.forEach(flash => {
                const owner = game.entities.find(e => e.id === flash.ownerId);
                if (!owner) return;
                const rgb = NEON_COLORS[owner.color] || { r: 255, g: 255, b: 255 };
                ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${flash.opacity * 0.9})`;
                ctx.beginPath();
                flash.cells.forEach(c => {
                    ctx.rect(c.x * cellPixelSize, c.y * cellPixelSize, cellPixelSize + 0.5, cellPixelSize + 0.5);
                });
                ctx.fill();
            });
        }

        this.floorTexture.needsUpdate = true;
    }

    getMaterial(colorHex, emissiveIntensity = 0.35) {
        if (!this.materials.has(colorHex)) {
            const mat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(colorHex),
                emissive: new THREE.Color(colorHex),
                emissiveIntensity: emissiveIntensity,
                roughness: 0.3,
                metalness: 0.4
            });
            this.materials.set(colorHex, mat);
        }
        return this.materials.get(colorHex);
    }

    createEntityMesh(entity) {
        const group = new THREE.Group();

        // Body: Rounded box with smooth bevels
        const bodyGeo = new THREE.BoxGeometry(CELL_SIZE * 0.85, CELL_SIZE * 0.85, CELL_SIZE * 0.85);
        const bodyMat = this.getMaterial(entity.color, 0.45);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = (CELL_SIZE * 0.85) / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Eyes Container (rotates with movement direction)
        const eyesGroup = new THREE.Group();
        eyesGroup.position.y = (CELL_SIZE * 0.85) / 2 + 1;

        const eyeGeo = new THREE.SphereGeometry(2.5, 12, 12);
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 });
        const pupilGeo = new THREE.SphereGeometry(1.3, 12, 12);
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

        // Left Eye
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-4.5, 2, 7.5);
        const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
        leftPupil.position.set(-4.5, 2, 9.2);
        eyesGroup.add(leftEye);
        eyesGroup.add(leftPupil);

        // Right Eye
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(4.5, 2, 7.5);
        const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
        rightPupil.position.set(4.5, 2, 9.2);
        eyesGroup.add(rightEye);
        eyesGroup.add(rightPupil);

        group.add(eyesGroup);

        // Shield Bubble
        const shieldGeo = new THREE.SphereGeometry(CELL_SIZE * 0.82, 20, 20);
        const shieldMat = new THREE.MeshStandardMaterial({
            color: 0x00ffd5,
            emissive: 0x00ffd5,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.4,
            roughness: 0.1,
            metalness: 0.8,
            wireframe: false
        });
        const shield = new THREE.Mesh(shieldGeo, shieldMat);
        shield.position.y = (CELL_SIZE * 0.85) / 2;
        shield.visible = false;
        group.add(shield);

        // Username Tag (Canvas Sprite)
        const nameCanvas = document.createElement('canvas');
        nameCanvas.width = 256;
        nameCanvas.height = 64;
        const nameCtx = nameCanvas.getContext('2d');
        nameCtx.fillStyle = 'rgba(10, 12, 22, 0.65)';
        nameCtx.roundRect(16, 12, 224, 40, 12);
        nameCtx.fill();
        nameCtx.fillStyle = '#ffffff';
        nameCtx.font = 'bold 24px Inter, sans-serif';
        nameCtx.textAlign = 'center';
        nameCtx.textBaseline = 'middle';
        nameCtx.fillText(entity.name, 128, 32);

        const nameTexture = new THREE.CanvasTexture(nameCanvas);
        nameTexture.minFilter = THREE.LinearFilter;
        const spriteMat = new THREE.SpriteMaterial({ map: nameTexture, transparent: true });
        const label = new THREE.Sprite(spriteMat);
        label.scale.set(38, 9.5, 1);
        label.position.y = CELL_SIZE * 1.5;
        group.add(label);

        // Crown for #1 Player
        const crownGroup = new THREE.Group();
        const crownGeo = new THREE.ConeGeometry(5, 6, 5);
        const crownMat = new THREE.MeshStandardMaterial({
            color: 0xffd700,
            emissive: 0xffaa00,
            emissiveIntensity: 0.6,
            roughness: 0.2,
            metalness: 0.9
        });
        const crownMesh = new THREE.Mesh(crownGeo, crownMat);
        crownMesh.rotation.x = Math.PI;
        crownMesh.position.y = CELL_SIZE * 1.25;
        crownGroup.add(crownMesh);
        crownGroup.visible = false;
        group.add(crownGroup);

        this.scene.add(group);

        return {
            group,
            body,
            eyesGroup,
            shield,
            label,
            crownGroup,
            currentAngle: 0
        };
    }

    updateEntities(game) {
        const activeIds = new Set();
        let topEntity = null;
        let maxScore = -1;

        game.entities.forEach(entity => {
            if (!entity.isDead && entity.score > maxScore) {
                maxScore = entity.score;
                topEntity = entity;
            }
        });

        game.entities.forEach(entity => {
            if (entity.isDead) return;
            activeIds.add(entity.id);

            let meshObj = this.entityMeshes.get(entity.id);
            if (!meshObj) {
                meshObj = this.createEntityMesh(entity);
                this.entityMeshes.set(entity.id, meshObj);
            }

            // Position (X, Y in 2D -> X, Z in 3D)
            const posX = entity.x * CELL_SIZE + CELL_SIZE / 2;
            const posZ = entity.y * CELL_SIZE + CELL_SIZE / 2;
            meshObj.group.position.x = posX;
            meshObj.group.position.z = posZ;

            // Subtle vertical bounce
            meshObj.body.position.y = (CELL_SIZE * 0.85) / 2 + Math.sin(performance.now() * 0.008 + posX) * 1.5;

            // Shield status & pulse
            meshObj.shield.visible = !!entity.hasShield;
            if (entity.hasShield) {
                const pulse = 1 + Math.sin(performance.now() * 0.01) * 0.05;
                meshObj.shield.scale.set(pulse, pulse, pulse);
            }

            // Crown for leader
            meshObj.crownGroup.visible = (entity === topEntity && entity.score > 20);
            if (meshObj.crownGroup.visible) {
                meshObj.crownGroup.rotation.y += 0.03;
            }

            // Direction & Eyes orientation
            // 0: Up (-Z), 1: Right (+X), 2: Down (+Z), 3: Left (-X)
            let targetAngle = 0;
            if (entity.direction === 0) targetAngle = Math.PI;
            else if (entity.direction === 1) targetAngle = Math.PI / 2;
            else if (entity.direction === 2) targetAngle = 0;
            else if (entity.direction === 3) targetAngle = -Math.PI / 2;

            meshObj.eyesGroup.rotation.y = targetAngle;
        });

        // Cleanup dead entities
        for (const [id, meshObj] of this.entityMeshes.entries()) {
            if (!activeIds.has(id)) {
                this.scene.remove(meshObj.group);
                this.entityMeshes.delete(id);
            }
        }
    }

    updateTrails(game) {
        const activeTrailIds = new Set();

        game.entities.forEach(entity => {
            if (entity.isDead || !entity.trail || entity.trail.length === 0) return;
            activeTrailIds.add(entity.id);

            // Construct 3D ribbon path from trail points + current head position
            const points = entity.trail.map(t => new THREE.Vector3(
                t.x * CELL_SIZE + CELL_SIZE / 2,
                2.5,
                t.y * CELL_SIZE + CELL_SIZE / 2
            ));

            // Add current head position as the tip of the trail
            points.push(new THREE.Vector3(
                entity.x * CELL_SIZE + CELL_SIZE / 2,
                2.5,
                entity.y * CELL_SIZE + CELL_SIZE / 2
            ));

            if (points.length < 2) return;

            let trailMesh = this.trailMeshes.get(entity.id);
            if (trailMesh) {
                this.scene.remove(trailMesh);
                if (trailMesh.geometry) trailMesh.geometry.dispose();
            }

            // Create flat ribbon geometry along points
            const ribbonWidth = CELL_SIZE * 0.72;
            const vertices = [];
            const indices = [];

            for (let i = 0; i < points.length; i++) {
                const curr = points[i];
                let dir = new THREE.Vector3(0, 0, 1);
                if (i < points.length - 1) {
                    dir.subVectors(points[i + 1], curr).normalize();
                } else if (i > 0) {
                    dir.subVectors(curr, points[i - 1]).normalize();
                }

                // Normal perpendicular in XZ plane
                const normal = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

                const left = new THREE.Vector3().copy(curr).addScaledVector(normal, ribbonWidth / 2);
                const right = new THREE.Vector3().copy(curr).addScaledVector(normal, -ribbonWidth / 2);

                vertices.push(left.x, left.y, left.z);
                vertices.push(right.x, right.y, right.z);

                if (i < points.length - 1) {
                    const v0 = i * 2;
                    const v1 = i * 2 + 1;
                    const v2 = (i + 1) * 2;
                    const v3 = (i + 1) * 2 + 1;

                    indices.push(v0, v1, v2);
                    indices.push(v1, v3, v2);
                }
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geo.setIndex(indices);
            geo.computeVertexNormals();

            const mat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(entity.color),
                emissive: new THREE.Color(entity.color),
                emissiveIntensity: 0.65,
                roughness: 0.2,
                metalness: 0.6,
                side: THREE.DoubleSide
            });

            trailMesh = new THREE.Mesh(geo, mat);
            trailMesh.receiveShadow = true;
            this.scene.add(trailMesh);
            this.trailMeshes.set(entity.id, trailMesh);
        });

        // Cleanup trails
        for (const [id, mesh] of this.trailMeshes.entries()) {
            if (!activeTrailIds.has(id)) {
                this.scene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
                this.trailMeshes.delete(id);
            }
        }
    }

    updatePowerUps(game) {
        const activeKeys = new Set();

        game.powerUps.forEach(pu => {
            const key = `${pu.x},${pu.y}`;
            activeKeys.add(key);

            let mesh = this.powerUpMeshes.get(key);
            if (!mesh) {
                let color = 0xffff00;
                let geo = new THREE.OctahedronGeometry(CELL_SIZE * 0.45, 0);

                if (pu.type === 'shield') {
                    color = 0x00ffd5;
                    geo = new THREE.IcosahedronGeometry(CELL_SIZE * 0.45, 0);
                } else if (pu.type === 'bomb') {
                    color = 0xff007f;
                    geo = new THREE.DodecahedronGeometry(CELL_SIZE * 0.45, 0);
                } else if (pu.type === 'cannon') {
                    color = 0xffaa00;
                    geo = new THREE.TorusGeometry(CELL_SIZE * 0.35, 3.5, 8, 16);
                }

                const mat = new THREE.MeshStandardMaterial({
                    color: color,
                    emissive: color,
                    emissiveIntensity: 0.75,
                    roughness: 0.2,
                    metalness: 0.8
                });

                mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = true;
                this.scene.add(mesh);
                this.powerUpMeshes.set(key, mesh);
            }

            const posX = pu.x * CELL_SIZE + CELL_SIZE / 2;
            const posZ = pu.y * CELL_SIZE + CELL_SIZE / 2;
            const hover = 12 + Math.sin(performance.now() * 0.005 + posX) * 4;

            mesh.position.set(posX, hover, posZ);
            mesh.rotation.y += 0.035;
            mesh.rotation.x += 0.02;
        });

        // Cleanup
        for (const [key, mesh] of this.powerUpMeshes.entries()) {
            if (!activeKeys.has(key)) {
                this.scene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
                this.powerUpMeshes.delete(key);
            }
        }
    }

    updateProjectiles(game) {
        const activeIndices = new Set();

        game.projectiles.forEach((p, idx) => {
            activeIndices.add(idx);
            let mesh = this.projectileMeshes.get(idx);
            if (!mesh) {
                const geo = new THREE.SphereGeometry(6, 12, 12);
                const mat = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(p.color),
                    emissive: new THREE.Color(p.color),
                    emissiveIntensity: 1.0,
                    roughness: 0.1
                });
                mesh = new THREE.Mesh(geo, mat);
                this.scene.add(mesh);
                this.projectileMeshes.set(idx, mesh);
            }

            mesh.position.set(
                p.x * CELL_SIZE + CELL_SIZE / 2,
                10,
                p.y * CELL_SIZE + CELL_SIZE / 2
            );
        });

        for (const [idx, mesh] of this.projectileMeshes.entries()) {
            if (!activeIndices.has(idx)) {
                this.scene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
                this.projectileMeshes.delete(idx);
            }
        }
    }

    updateCamera(game) {
        if (!game.player || game.player.isDead) return;

        const targetX = game.player.x * CELL_SIZE + CELL_SIZE / 2;
        const targetZ = game.player.y * CELL_SIZE + CELL_SIZE / 2;

        // Dynamic 3rd person follow offset
        // Elevated angle looking down at ~55 degrees behind the player
        const elevation = 380;
        const distanceBehind = 280;

        // Direction offset lookahead
        let lookAheadX = 0;
        let lookAheadZ = 0;
        if (game.player.direction === 0) lookAheadZ = -60;
        else if (game.player.direction === 1) lookAheadX = 60;
        else if (game.player.direction === 2) lookAheadZ = 60;
        else if (game.player.direction === 3) lookAheadX = -60;

        this.cameraTargetPos.set(targetX, elevation, targetZ + distanceBehind);
        this.cameraLookTarget.set(targetX + lookAheadX, 0, targetZ + lookAheadZ);

        // Apply Screen Shake
        this.cameraShakeOffset.set(0, 0, 0);
        if (game.screenShake > 0) {
            const shakeMag = (game.screenShake / 26) * 16;
            this.cameraShakeOffset.set(
                (Math.random() * 2 - 1) * shakeMag,
                (Math.random() * 2 - 1) * shakeMag,
                (Math.random() * 2 - 1) * shakeMag
            );
        }

        if (!this.cameraInitialized) {
            this.cameraCurrentPos.copy(this.cameraTargetPos);
            this.cameraCurrentLook.copy(this.cameraLookTarget);
            this.cameraInitialized = true;
        } else {
            // Smooth lerp follow
            this.cameraCurrentPos.lerp(this.cameraTargetPos, 0.12);
            this.cameraCurrentLook.lerp(this.cameraLookTarget, 0.15);
        }

        this.camera.position.copy(this.cameraCurrentPos).add(this.cameraShakeOffset);
        this.camera.lookAt(this.cameraCurrentLook);

        // Update directional light to follow player for crisp local shadows
        if (this.dirLight) {
            this.dirLight.position.set(targetX - 150, 500, targetZ - 200);
            this.dirLight.target.position.set(targetX, 0, targetZ);
            this.dirLight.target.updateMatrixWorld();
        }
    }

    render(game) {
        if (!this.isInitialized || !this.renderer) return;

        // 1. Update Floor Map Texture
        this.updateFloorTexture(game);

        // 2. Update Entities
        this.updateEntities(game);

        // 3. Update Trails
        this.updateTrails(game);

        // 4. Update Power-Ups
        this.updatePowerUps(game);

        // 5. Update Projectiles
        this.updateProjectiles(game);

        // 6. Update Follow Camera
        this.updateCamera(game);

        // 7. Render WebGL frame
        this.renderer.render(this.scene, this.camera);
    }

    resize(width, height) {
        if (!this.renderer || !this.camera) return;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }

    reset() {
        this.cameraInitialized = false;
        // Clear entities
        for (const [id, meshObj] of this.entityMeshes.entries()) {
            this.scene.remove(meshObj.group);
        }
        this.entityMeshes.clear();

        // Clear trails
        for (const [id, mesh] of this.trailMeshes.entries()) {
            this.scene.remove(mesh);
        }
        this.trailMeshes.clear();

        // Clear powerups
        for (const [key, mesh] of this.powerUpMeshes.entries()) {
            this.scene.remove(mesh);
        }
        this.powerUpMeshes.clear();

        // Clear projectiles
        for (const [idx, mesh] of this.projectileMeshes.entries()) {
            this.scene.remove(mesh);
        }
        this.projectileMeshes.clear();
    }

    destroy() {
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        if (this.renderer) {
            this.renderer.dispose();
        }
        this.isInitialized = false;
    }
}
