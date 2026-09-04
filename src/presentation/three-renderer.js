import * as THREE from './three.module.js';
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
        this.playerLight = null;

        // Arena & Floor
        this.floorMesh = null;
        this.floorCanvas = null;
        this.floorCtx = null;
        this.floorTexture = null;
        this.boundaryGroup = null;

        // Meshes pools/maps
        this.entityMeshes = new Map(); // id -> { group, body, eyesGroup, shield, label, crownGroup }
        this.trailMeshes = new Map();  // id -> mesh
        this.powerUpMeshes = new Map(); // key `${x},${y}` -> mesh
        this.coinMeshes = new Map(); // key `${x},${y}` -> mesh
        this.projectileMeshes = new Map(); // id -> mesh

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
        this.canvas.style.zIndex = '5';
        this.container.appendChild(this.canvas);

        const width = window.innerWidth || 800;
        const height = window.innerHeight || 600;

        // 1. Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x080912);
        this.scene.fog = new THREE.FogExp2(0x080912, 0.0006);

        // 2. Camera (Perspective 3rd-person elevated perspective)
        this.camera = new THREE.PerspectiveCamera(52, width / height, 10, 6000);
        this.camera.position.set(MAP_SIZE / 2, 320, MAP_SIZE / 2 + 260);
        this.camera.lookAt(MAP_SIZE / 2, 0, MAP_SIZE / 2);

        // 3. WebGL Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.25;

        // 4. Lights
        this.ambientLight = new THREE.AmbientLight(0xddeeff, 0.85);
        this.scene.add(this.ambientLight);

        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
        this.dirLight.position.set(MAP_SIZE / 2 - 200, 500, MAP_SIZE / 2 - 200);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.dirLight.shadow.camera.near = 50;
        this.dirLight.shadow.camera.far = 1600;
        const d = 450;
        this.dirLight.shadow.camera.left = -d;
        this.dirLight.shadow.camera.right = d;
        this.dirLight.shadow.camera.top = d;
        this.dirLight.shadow.camera.bottom = -d;
        this.dirLight.shadow.bias = -0.0004;
        this.scene.add(this.dirLight);

        // Player point light for neon glow
        this.playerLight = new THREE.PointLight(0x00f3ff, 3.0, 450, 1.5);
        this.playerLight.position.set(MAP_SIZE / 2, 40, MAP_SIZE / 2);
        this.scene.add(this.playerLight);

        // Colored ambient rim lights
        const blueLight = new THREE.PointLight(0x00f3ff, 2.0, 1500);
        blueLight.position.set(MAP_SIZE * 0.1, 120, MAP_SIZE * 0.1);
        this.scene.add(blueLight);

        const magentaLight = new THREE.PointLight(0xb026ff, 2.0, 1500);
        magentaLight.position.set(MAP_SIZE * 0.9, 120, MAP_SIZE * 0.9);
        this.scene.add(magentaLight);

        // 5. Boundary Group
        this.boundaryGroup = new THREE.Group();
        this.scene.add(this.boundaryGroup);

        // 6. Setup Floor
        this.initFloor();

        this.isInitialized = true;
    }

    initFloor() {
        const canvasRes = 1024;
        this.floorCanvas = document.createElement('canvas');
        this.floorCanvas.width = canvasRes;
        this.floorCanvas.height = canvasRes;
        this.floorCtx = this.floorCanvas.getContext('2d');

        this.floorTexture = new THREE.CanvasTexture(this.floorCanvas);
        this.floorTexture.generateMipmaps = false;
        this.floorTexture.minFilter = THREE.LinearFilter;
        this.floorTexture.magFilter = THREE.LinearFilter;
        this.floorTexture.colorSpace = THREE.SRGBColorSpace;

        const floorGeo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 1, 1);
        const floorMat = new THREE.MeshStandardMaterial({
            map: this.floorTexture,
            emissiveMap: this.floorTexture,
            emissive: new THREE.Color(0xffffff),
            emissiveIntensity: 0.5,
            roughness: 0.5,
            metalness: 0.1,
        });

        this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
        this.floorMesh.rotation.x = -Math.PI / 2;
        this.floorMesh.position.set(MAP_SIZE / 2, 0, MAP_SIZE / 2);
        this.floorMesh.receiveShadow = true;
        this.scene.add(this.floorMesh);

        // Extended outer dark ground
        const outerGeo = new THREE.PlaneGeometry(MAP_SIZE * 3, MAP_SIZE * 3);
        const outerMat = new THREE.MeshStandardMaterial({
            color: 0x040508,
            roughness: 0.95,
            metalness: 0.05
        });
        const outerMesh = new THREE.Mesh(outerGeo, outerMat);
        outerMesh.rotation.x = -Math.PI / 2;
        outerMesh.position.set(MAP_SIZE / 2, -1, MAP_SIZE / 2);
        outerMesh.receiveShadow = true;
        this.scene.add(outerMesh);
    }

    setupBoundaryWalls(game) {
        while (this.boundaryGroup.children.length > 0) {
            const child = this.boundaryGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.boundaryGroup.remove(child);
        }

        const wallHeight = 22;
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0xb026ff,
            emissive: 0xb026ff,
            emissiveIntensity: 0.7,
            roughness: 0.15,
            metalness: 0.85,
            transparent: true,
            opacity: 0.9
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

                const wallGeo = new THREE.BoxGeometry(length, wallHeight, 6);
                const wallMesh = new THREE.Mesh(wallGeo, wallMat);
                wallMesh.position.set((x1 + x2) / 2, wallHeight / 2, (z1 + z2) / 2);
                wallMesh.rotation.y = -angle;
                wallMesh.castShadow = true;
                this.boundaryGroup.add(wallMesh);
            });
        } else {
            const thickness = 8;
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

        // Base arena background
        ctx.fillStyle = '#0d0f1a';
        ctx.fillRect(0, 0, w, h);

        // Playable cells background
        ctx.fillStyle = '#14182b';
        for (let x = 0; x < game.gridSize; x++) {
            for (let y = 0; y < game.gridSize; y++) {
                if (game.grid[x] && game.grid[x][y] && game.grid[x][y].playable) {
                    ctx.fillRect(x * cellPixelSize, y * cellPixelSize, cellPixelSize + 0.6, cellPixelSize + 0.6);
                }
            }
        }

        // Subtle grid lines
        ctx.strokeStyle = '#1e243d';
        ctx.lineWidth = 0.8;
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

        // Captured territories with solid vivid color and glowing outline
        game.entities.forEach(owner => {
            if (owner.isDead) return;
            const rgb = NEON_COLORS[owner.color];
            if (!rgb) return;

            // Fill
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.78)`;
            ctx.beginPath();
            for (let x = 0; x < game.gridSize; x++) {
                for (let y = 0; y < game.gridSize; y++) {
                    if (game.grid[x] && game.grid[x][y] && game.grid[x][y].ownerId === owner.id) {
                        ctx.rect(x * cellPixelSize, y * cellPixelSize, cellPixelSize + 0.5, cellPixelSize + 0.5);
                    }
                }
            }
            ctx.fill();

            // Bright glowing border contour around conquered land
            ctx.strokeStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            for (let x = 0; x < game.gridSize; x++) {
                for (let y = 0; y < game.gridSize; y++) {
                    if (game.grid[x] && game.grid[x][y] && game.grid[x][y].ownerId === owner.id) {
                        const px = x * cellPixelSize;
                        const py = y * cellPixelSize;
                        if (y === 0 || game.grid[x][y-1]?.ownerId !== owner.id) {
                            ctx.moveTo(px, py); ctx.lineTo(px + cellPixelSize, py);
                        }
                        if (y === game.gridSize - 1 || game.grid[x][y+1]?.ownerId !== owner.id) {
                            ctx.moveTo(px, py + cellPixelSize); ctx.lineTo(px + cellPixelSize, py + cellPixelSize);
                        }
                        if (x === 0 || game.grid[x-1]?.[y]?.ownerId !== owner.id) {
                            ctx.moveTo(px, py); ctx.lineTo(px, py + cellPixelSize);
                        }
                        if (x === game.gridSize - 1 || game.grid[x+1]?.[y]?.ownerId !== owner.id) {
                            ctx.moveTo(px + cellPixelSize, py); ctx.lineTo(px + cellPixelSize, py + cellPixelSize);
                        }
                    }
                }
            }
            ctx.stroke();
        });

        // Capture flashes
        if (game.captureFlashes && game.captureFlashes.length > 0) {
            game.captureFlashes.forEach(flash => {
                const owner = game.entities.find(e => e.id === flash.ownerId);
                if (!owner) return;
                const rgb = NEON_COLORS[owner.color] || { r: 255, g: 255, b: 255 };
                ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${flash.opacity * 0.95})`;
                ctx.beginPath();
                flash.cells.forEach(c => {
                    ctx.rect(c.x * cellPixelSize, c.y * cellPixelSize, cellPixelSize + 0.6, cellPixelSize + 0.6);
                });
                ctx.fill();
            });
        }

        this.floorTexture.needsUpdate = true;
    }

    getMaterial(colorHex, emissiveIntensity = 0.45) {
        if (!this.materials.has(colorHex)) {
            const mat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(colorHex),
                emissive: new THREE.Color(colorHex),
                emissiveIntensity: emissiveIntensity,
                roughness: 0.25,
                metalness: 0.55
            });
            this.materials.set(colorHex, mat);
        }
        return this.materials.get(colorHex);
    }

    createEntityMesh(entity) {
        const group = new THREE.Group();

        // 3D Avatar Body: Rounded Box
        const size = CELL_SIZE * 0.9;
        const bodyGeo = new THREE.BoxGeometry(size, size, size);
        const bodyMat = this.getMaterial(entity.color, 0.5);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = size / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Eyes container
        const eyesGroup = new THREE.Group();
        eyesGroup.position.y = size / 2 + 1;

        const eyeGeo = new THREE.SphereGeometry(2.8, 14, 14);
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 });
        const pupilGeo = new THREE.SphereGeometry(1.5, 14, 14);
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-5, 2.5, size / 2 - 1);
        const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
        leftPupil.position.set(-5, 2.5, size / 2 + 0.8);
        eyesGroup.add(leftEye);
        eyesGroup.add(leftPupil);

        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(5, 2.5, size / 2 - 1);
        const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
        rightPupil.position.set(5, 2.5, size / 2 + 0.8);
        eyesGroup.add(rightEye);
        eyesGroup.add(rightPupil);

        group.add(eyesGroup);

        // Glowing Shield Bubble
        const shieldGeo = new THREE.SphereGeometry(CELL_SIZE * 0.88, 22, 22);
        const shieldMat = new THREE.MeshStandardMaterial({
            color: 0x00ffd5,
            emissive: 0x00ffd5,
            emissiveIntensity: 0.6,
            transparent: true,
            opacity: 0.45,
            roughness: 0.1,
            metalness: 0.9
        });
        const shield = new THREE.Mesh(shieldGeo, shieldMat);
        shield.position.y = size / 2;
        shield.visible = false;
        group.add(shield);

        // Name tag label
        const nameCanvas = document.createElement('canvas');
        nameCanvas.width = 256;
        nameCanvas.height = 64;
        const nameCtx = nameCanvas.getContext('2d');
        nameCtx.fillStyle = 'rgba(10, 12, 22, 0.7)';
        nameCtx.roundRect(10, 10, 236, 44, 14);
        nameCtx.fill();
        nameCtx.strokeStyle = entity.color;
        nameCtx.lineWidth = 3;
        nameCtx.roundRect(10, 10, 236, 44, 14);
        nameCtx.stroke();
        nameCtx.fillStyle = '#ffffff';
        nameCtx.font = 'bold 24px Inter, sans-serif';
        nameCtx.textAlign = 'center';
        nameCtx.textBaseline = 'middle';
        nameCtx.fillText(entity.icon ? `${entity.icon} ${entity.name}` : entity.name, 128, 32);

        const nameTexture = new THREE.CanvasTexture(nameCanvas);
        nameTexture.minFilter = THREE.LinearFilter;
        const spriteMat = new THREE.SpriteMaterial({ map: nameTexture, transparent: true });
        const label = new THREE.Sprite(spriteMat);
        label.scale.set(40, 10, 1);
        label.position.y = CELL_SIZE * 1.6;
        group.add(label);

        // Crown for Leader
        const crownGroup = new THREE.Group();
        const crownGeo = new THREE.CylinderGeometry(5, 3.5, 4.5, 5);
        const crownMat = new THREE.MeshStandardMaterial({
            color: 0xffd700,
            emissive: 0xffaa00,
            emissiveIntensity: 0.7,
            roughness: 0.2,
            metalness: 0.9
        });
        const crownMesh = new THREE.Mesh(crownGeo, crownMat);
        crownMesh.position.y = CELL_SIZE * 1.3;
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
            crownGroup
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

            const posX = entity.x * CELL_SIZE + CELL_SIZE / 2;
            const posZ = entity.y * CELL_SIZE + CELL_SIZE / 2;
            meshObj.group.position.x = posX;
            meshObj.group.position.z = posZ;

            // Subtle bounce animation
            meshObj.body.position.y = (CELL_SIZE * 0.9) / 2 + Math.sin(performance.now() * 0.009 + posX) * 1.8;

            // Shield status
            meshObj.shield.visible = !!entity.hasShield;
            if (entity.hasShield) {
                const pulse = 1 + Math.sin(performance.now() * 0.01) * 0.06;
                meshObj.shield.scale.set(pulse, pulse, pulse);
            }

            // Crown for leader
            meshObj.crownGroup.visible = (entity === topEntity && entity.score > 20);
            if (meshObj.crownGroup.visible) {
                meshObj.crownGroup.rotation.y += 0.035;
            }

            // Look direction: 0: Up (-Z), 1: Right (+X), 2: Down (+Z), 3: Left (-X)
            let targetAngle = 0;
            if (entity.direction === 0) targetAngle = Math.PI;
            else if (entity.direction === 1) targetAngle = Math.PI / 2;
            else if (entity.direction === 2) targetAngle = 0;
            else if (entity.direction === 3) targetAngle = -Math.PI / 2;

            meshObj.eyesGroup.rotation.y = targetAngle;
        });

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

            const points = entity.trail.map(t => new THREE.Vector3(
                t.x * CELL_SIZE + CELL_SIZE / 2,
                3.0,
                t.y * CELL_SIZE + CELL_SIZE / 2
            ));

            points.push(new THREE.Vector3(
                entity.x * CELL_SIZE + CELL_SIZE / 2,
                3.0,
                entity.y * CELL_SIZE + CELL_SIZE / 2
            ));

            if (points.length < 2) return;

            let trailMesh = this.trailMeshes.get(entity.id);
            if (trailMesh) {
                this.scene.remove(trailMesh);
                if (trailMesh.geometry) trailMesh.geometry.dispose();
            }

            const ribbonWidth = CELL_SIZE * 0.76;
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
                emissiveIntensity: 0.75,
                roughness: 0.2,
                metalness: 0.6,
                side: THREE.DoubleSide
            });

            trailMesh = new THREE.Mesh(geo, mat);
            trailMesh.receiveShadow = true;
            this.scene.add(trailMesh);
            this.trailMeshes.set(entity.id, trailMesh);
        });

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
                let geo = new THREE.OctahedronGeometry(CELL_SIZE * 0.5, 0);

                if (pu.type === 'shield') {
                    color = 0x00ffd5;
                    geo = new THREE.IcosahedronGeometry(CELL_SIZE * 0.5, 0);
                } else if (pu.type === 'bomb') {
                    color = 0xff007f;
                    geo = new THREE.DodecahedronGeometry(CELL_SIZE * 0.5, 0);
                } else if (pu.type === 'cannon') {
                    color = 0xffaa00;
                    geo = new THREE.TorusGeometry(CELL_SIZE * 0.38, 4.0, 8, 16);
                }

                const mat = new THREE.MeshStandardMaterial({
                    color: color,
                    emissive: color,
                    emissiveIntensity: 0.85,
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
            const hover = 14 + Math.sin(performance.now() * 0.006 + posX) * 5;

            mesh.position.set(posX, hover, posZ);
            mesh.rotation.y += 0.04;
            mesh.rotation.x += 0.02;
        });

        for (const [key, mesh] of this.powerUpMeshes.entries()) {
            if (!activeKeys.has(key)) {
                this.scene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
                this.powerUpMeshes.delete(key);
            }
        }
    }

    updateCoins(game) {
        const activeKeys = new Set();

        game.coins.forEach(coin => {
            const key = `${coin.x},${coin.y}`;
            activeKeys.add(key);

            let mesh = this.coinMeshes.get(key);
            if (!mesh) {
                const isBig = coin.value > 1;
                const radius = isBig ? CELL_SIZE * 0.42 : CELL_SIZE * 0.3;
                const geo = new THREE.CylinderGeometry(radius, radius, 4, 20);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0xffd700,
                    emissive: 0xffb700,
                    emissiveIntensity: isBig ? 0.9 : 0.6,
                    roughness: 0.25,
                    metalness: 0.9
                });

                mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = true;
                mesh.rotation.x = Math.PI / 2; // Face flat side up before spinning on Y
                this.scene.add(mesh);
                this.coinMeshes.set(key, mesh);
            }

            const posX = coin.x * CELL_SIZE + CELL_SIZE / 2;
            const posZ = coin.y * CELL_SIZE + CELL_SIZE / 2;
            const hover = 10 + Math.sin(performance.now() * 0.005 + posX) * 4;

            mesh.position.set(posX, hover, posZ);
            mesh.rotation.y += 0.08;
        });

        for (const [key, mesh] of this.coinMeshes.entries()) {
            if (!activeKeys.has(key)) {
                this.scene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
                this.coinMeshes.delete(key);
            }
        }
    }

    updateProjectiles(game) {
        const activeIndices = new Set();

        game.projectiles.forEach((p, idx) => {
            activeIndices.add(idx);
            let mesh = this.projectileMeshes.get(idx);
            if (!mesh) {
                const geo = new THREE.SphereGeometry(7, 14, 14);
                const mat = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(p.color),
                    emissive: new THREE.Color(p.color),
                    emissiveIntensity: 1.2,
                    roughness: 0.1
                });
                mesh = new THREE.Mesh(geo, mat);
                this.scene.add(mesh);
                this.projectileMeshes.set(idx, mesh);
            }

            mesh.position.set(
                p.x * CELL_SIZE + CELL_SIZE / 2,
                11,
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

        // Camera always directly behind the player's movement direction
        // 0: Up (-Z), 1: Right (+X), 2: Down (+Z), 3: Left (-X)
        let targetYaw = 0;
        if (game.player.direction === 0) targetYaw = 0;
        else if (game.player.direction === 1) targetYaw = -Math.PI / 2;
        else if (game.player.direction === 2) targetYaw = Math.PI;
        else if (game.player.direction === 3) targetYaw = Math.PI / 2;

        if (!this.cameraInitialized) {
            this.cameraYaw = targetYaw;
            this.cameraCurrentLook.set(targetX, 10, targetZ);
        } else {
            // Shortest angular interpolation
            let diff = targetYaw - this.cameraYaw;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            this.cameraYaw += diff * 0.14; // smooth turning pan
        }

        const distanceBehind = 210;
        const elevation = 160;
        const lookAheadDistance = 120;

        const offsetX = Math.sin(this.cameraYaw) * distanceBehind;
        const offsetZ = Math.cos(this.cameraYaw) * distanceBehind;

        const forwardX = -Math.sin(this.cameraYaw) * lookAheadDistance;
        const forwardZ = -Math.cos(this.cameraYaw) * lookAheadDistance;

        this.cameraTargetPos.set(targetX + offsetX, elevation, targetZ + offsetZ);
        this.cameraLookTarget.set(targetX + forwardX, 10, targetZ + forwardZ);

        this.cameraShakeOffset.set(0, 0, 0);
        if (game.screenShake > 0) {
            const shakeMag = (game.screenShake / 26) * 18;
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
            this.cameraCurrentPos.lerp(this.cameraTargetPos, 0.18);
            this.cameraCurrentLook.lerp(this.cameraLookTarget, 0.2);
        }

        this.camera.position.copy(this.cameraCurrentPos).add(this.cameraShakeOffset);
        this.camera.lookAt(this.cameraCurrentLook);

        if (this.playerLight) {
            this.playerLight.position.set(targetX, 35, targetZ);
            this.playerLight.color.set(game.player.color);
        }

        if (this.dirLight) {
            this.dirLight.position.set(targetX - 160, 480, targetZ - 180);
            this.dirLight.target.position.set(targetX, 0, targetZ);
            this.dirLight.target.updateMatrixWorld();
        }
    }

    render(game) {
        if (!this.isInitialized || !this.renderer) return;

        this.updateFloorTexture(game);
        this.updateEntities(game);
        this.updateTrails(game);
        this.updatePowerUps(game);
        this.updateCoins(game);
        this.updateProjectiles(game);
        this.updateCamera(game);

        this.renderer.render(this.scene, this.camera);
    }

    resize(width, height) {
        if (!this.renderer || !this.camera) return;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    }

    reset() {
        this.cameraInitialized = false;
        this.cameraYaw = 0;
        for (const [id, meshObj] of this.entityMeshes.entries()) {
            this.scene.remove(meshObj.group);
        }
        this.entityMeshes.clear();

        for (const [id, mesh] of this.trailMeshes.entries()) {
            this.scene.remove(mesh);
        }
        this.trailMeshes.clear();

        for (const [key, mesh] of this.powerUpMeshes.entries()) {
            this.scene.remove(mesh);
        }
        this.powerUpMeshes.clear();

        for (const [key, mesh] of this.coinMeshes.entries()) {
            this.scene.remove(mesh);
        }
        this.coinMeshes.clear();

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
