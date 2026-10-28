/**
 * ============================================================================
 * PLANETARIUM DB - Main 3D Engine & Frontend Controller
 * Technologies: Three.js (r128), OrbitControls, Server-Sent Events (SSE)
 * ============================================================================
 *
 * SCALING MATHEMATICS EXPLANATION (KEY VIVA TALKING POINT):
 * In real astronomical units:
 * - Jupiter's radius (~69,911 km) is ~28x larger than Mercury (~2,439 km)
 * - The Sun's radius is ~109x Earth
 * - Neptune's distance (30 AU) is ~78x Mercury's distance (0.387 AU)
 *
 * If drawn at true 1:1 scale, either Mercury is invisible (sub-pixel) or
 * Neptune is hundreds of thousands of pixels away from the star.
 *
 * Therefore, we apply COMPRESSED / LOGARITHMIC scaling functions:
 * 1. Planet Radius:
 *    scaleRadius(km) = base + Math.log10(km) * multiplier
 *    Ensures small terrestrial planets remain clearly visible while gas giants
 *    look proportionally bigger without consuming the entire viewport.
 *
 * 2. Orbit Radius:
 *    scaleOrbitAU(au) = Math.pow(au, 0.65) * 28 + 22
 *    Power law / root compression bunches distant planets (Uranus, Neptune)
 *    closer so the whole solar system fits elegantly in the default camera view.
 *
 * 3. Orbital Speed:
 *    speed(period_days) = (1 / Math.sqrt(period_days)) * speedFactor
 *    Respects Kepler's 3rd Law (inner planets orbit faster than outer planets)
 *    while ensuring animation is comfortably noticeable to the viewer.
 * ============================================================================
 */

// Global State
let scene, camera, renderer, controls;
let starMesh, starGlow;
const planetMeshes = new Map(); // Key: planet_id -> Object { group, mesh, orbitRing, data, currentAngle, speed, moons: [] }
let cachedPlanets = [];
let selectedPlanetId = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Scaling constants
const RADIUS_MIN = 1.0;
const RADIUS_MULTIPLIER = 1.8;
const ORBIT_POWER = 0.65;
const ORBIT_SCALE = 30.0;
const ORBIT_BASE_OFFSET = 24.0;
const SPEED_FACTOR = 0.015;

/**
 * Logarithmic radius scaling function
 */
function scaleRadius(radiusKm) {
    const km = parseFloat(radiusKm);
    if (isNaN(km) || km <= 0) return RADIUS_MIN;
    return Math.max(RADIUS_MIN, (Math.log10(km) - 2.8) * RADIUS_MULTIPLIER + 1.2);
}

/**
 * Compressed orbit radius scaling function (Power law)
 */
function scaleOrbitAU(orbitAU) {
    const au = parseFloat(orbitAU);
    if (isNaN(au) || au <= 0) return ORBIT_BASE_OFFSET;
    return Math.pow(au, ORBIT_POWER) * ORBIT_SCALE + ORBIT_BASE_OFFSET;
}

/**
 * Angular speed derived from orbital period
 */
function calculateSpeed(periodDays) {
    const days = parseFloat(periodDays);
    if (isNaN(days) || days <= 0) return 0.005;
    return (1.0 / Math.sqrt(days)) * SPEED_FACTOR;
}

// ============================================================================
// 1. THREE.JS SCENE INITIALIZATION
// ============================================================================
function initScene() {
    const container = document.getElementById('canvas-container');

    // 1. Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070913, 0.0008);

    // 2. Camera
    camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.5,
        5000
    );
    camera.position.set(-40, 150, 270);

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // 4. OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 1800;
    controls.minDistance = 20;
    controls.maxPolarAngle = Math.PI / 2 + 0.15;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0x334155, 0.65);
    scene.add(ambientLight);

    const sunLight = new THREE.PointLight(0xfff7ed, 2.5, 3000, 0.5);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    // 6. Starfield Background
    createStarfield();

    // 7. Central Star (Sun)
    createCentralStar();

    // 8. Event Listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('pointerdown', onPointerClick);

    // 9. Start Animation Loop
    animate();
}

/**
 * 3,500 random background stars
 */
function createStarfield() {
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 3500;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
        const radius = 1200 + Math.random() * 1500;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);

        positions[i] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i + 2] = radius * Math.cos(phi);

        const tone = Math.random();
        if (tone > 0.8) {
            colors[i] = 0.7; colors[i + 1] = 0.85; colors[i + 2] = 1.0;
        } else if (tone > 0.6) {
            colors[i] = 1.0; colors[i + 1] = 0.95; colors[i + 2] = 0.7;
        } else {
            colors[i] = 0.95; colors[i + 1] = 0.95; colors[i + 2] = 0.95;
        }
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starMaterial = new THREE.PointsMaterial({
        size: 1.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.85
    });

    const starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);
}

/**
 * Central Star Mesh with corona glow
 */
function createCentralStar() {
    const starGroup = new THREE.Group();

    const coreGeometry = new THREE.SphereGeometry(10, 32, 32);
    const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    starMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    starGroup.add(starMesh);

    const glowGeometry = new THREE.SphereGeometry(13, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.28
    });
    starGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    starGroup.add(starGlow);

    scene.add(starGroup);
}

// ============================================================================
// 2. PLANET & MOON MESH LIFECYCLE (SYNCED TO POSTGRESQL)
// ============================================================================

function createOrbitRing(radius) {
    const segments = 128;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((segments + 1) * 3);

    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        positions[i * 3] = Math.cos(theta) * radius;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = Math.sin(theta) * radius;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
        color: 0x334155,
        transparent: true,
        opacity: 0.4
    });

    return new THREE.Line(geometry, material);
}

function spawnPlanetMesh(planetData, animateIn = true) {
    const planetId = planetData.planet_id;
    const orbitDistance = scaleOrbitAU(planetData.orbit_radius_au);
    const radius = scaleRadius(planetData.radius_km);
    const colorHex = planetData.color_hex || '#4A90E2';

    const group = new THREE.Group();

    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorHex),
        roughness: 0.6,
        metalness: 0.15,
        emissive: new THREE.Color(colorHex),
        emissiveIntensity: 0.08
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { planetId: planetId, type: 'planet' };
    group.add(mesh);

    if (planetData.has_rings) {
        const ringGeo = new THREE.RingGeometry(radius * 1.4, radius * 2.3, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(colorHex),
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5
        });
        const rings = new THREE.Mesh(ringGeo, ringMat);
        rings.rotation.x = Math.PI / 2.3;
        group.add(rings);
    }

    const orbitRing = createOrbitRing(orbitDistance);
    scene.add(orbitRing);

    const initialAngle = Math.random() * Math.PI * 2;
    group.position.x = Math.cos(initialAngle) * orbitDistance;
    group.position.z = Math.sin(initialAngle) * orbitDistance;

    // Moons
    const moonList = planetData.moons_list || [];
    const moonObjects = [];
    moonList.forEach((moon, index) => {
        const moonRadius = Math.max(0.25, (scaleRadius(moon.radius_km) * 0.35));
        const moonDistance = radius + 2.0 + (index * 1.4);

        const moonGeo = new THREE.SphereGeometry(moonRadius, 16, 16);
        const moonMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(moon.color_hex || '#cccccc'),
            roughness: 0.8
        });
        const moonMesh = new THREE.Mesh(moonGeo, moonMat);
        moonMesh.userData = { name: moon.name, type: 'moon', parentPlanetId: planetId };
        group.add(moonMesh);

        moonObjects.push({
            mesh: moonMesh,
            distance: moonDistance,
            angle: (index / moonList.length) * Math.PI * 2,
            speed: 0.03 + (0.01 / (index + 1))
        });
    });

    // Scale-in spawn animation
    if (animateIn) {
        group.scale.set(0.001, 0.001, 0.001);
        new TWEEN_SCALE(group, { x: 1, y: 1, z: 1 }, 700);
    }

    scene.add(group);

    planetMeshes.set(planetId, {
        planetId: planetId,
        group: group,
        mesh: mesh,
        orbitRing: orbitRing,
        orbitDistance: orbitDistance,
        currentAngle: initialAngle,
        speed: calculateSpeed(planetData.orbital_period_days),
        data: planetData,
        moons: moonObjects,
        isRemoving: false
    });
}

function removePlanetMesh(planetId) {
    const item = planetMeshes.get(planetId);
    if (!item || item.isRemoving) return;

    item.isRemoving = true;

    // Shrink animation (Scale 1 -> 0)
    new TWEEN_SCALE(item.group, { x: 0.001, y: 0.001, z: 0.001 }, 600, () => {
        scene.remove(item.group);
        if (item.orbitRing) scene.remove(item.orbitRing);

        item.mesh.geometry.dispose();
        item.mesh.material.dispose();
        if (item.orbitRing) {
            item.orbitRing.geometry.dispose();
            item.orbitRing.material.dispose();
        }

        planetMeshes.delete(planetId);

        if (selectedPlanetId === planetId) {
            closeInfoCard();
        }
    });
}

function syncPlanetsWithDatabase(planetsFromDB) {
    cachedPlanets = planetsFromDB;
    const dbIds = new Set(planetsFromDB.map(p => p.planet_id));

    // Remove deleted planets
    for (const [id] of planetMeshes) {
        if (!dbIds.has(id)) {
            removePlanetMesh(id);
        }
    }

    // Add or update planets
    planetsFromDB.forEach(planetData => {
        const existing = planetMeshes.get(planetData.planet_id);
        if (!existing) {
            spawnPlanetMesh(planetData, true);
        } else {
            existing.data = planetData;
            if (selectedPlanetId === planetData.planet_id) {
                populateInfoCard(planetData);
            }
        }
    });

    // Update Side Panel (Tab B: Planets list)
    renderPlanetsCatalog();
}

function TWEEN_SCALE(target, targetScale, durationMs, onComplete) {
    const startScale = { x: target.scale.x, y: target.scale.y, z: target.scale.z };
    const startTime = performance.now();

    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        const ease = 1 - Math.pow(1 - progress, 3);

        target.scale.x = startScale.x + (targetScale.x - startScale.x) * ease;
        target.scale.y = startScale.y + (targetScale.y - startScale.y) * ease;
        target.scale.z = startScale.z + (targetScale.z - startScale.z) * ease;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            if (onComplete) onComplete();
        }
    }

    requestAnimationFrame(update);
}

// ============================================================================
// 3. ANIMATION LOOP
// ============================================================================
function animate() {
    requestAnimationFrame(animate);

    if (starMesh) starMesh.rotation.y += 0.003;
    if (starGlow) starGlow.rotation.y -= 0.001;

    planetMeshes.forEach(item => {
        item.currentAngle += item.speed;
        item.group.position.x = Math.cos(item.currentAngle) * item.orbitDistance;
        item.group.position.z = Math.sin(item.currentAngle) * item.orbitDistance;

        item.mesh.rotation.y += 0.015;

        item.moons.forEach(m => {
            m.angle += m.speed;
            m.mesh.position.x = Math.cos(m.angle) * m.distance;
            m.mesh.position.z = Math.sin(m.angle) * m.distance;
            m.mesh.position.y = Math.sin(m.angle * 1.5) * 0.4;
        });
    });

    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================================
// 4. RAYCASTING & INTERACTIVE INSPECTION CARD
// ============================================================================
function onPointerClick(event) {
    if (event.target.closest('#side-panel') || 
        event.target.closest('.top-nav') || 
        event.target.closest('#planet-info-card')) {
        return;
    }

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const meshesToTest = [];
    planetMeshes.forEach(item => meshesToTest.push(item.mesh));

    const intersects = raycaster.intersectObjects(meshesToTest, false);

    if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;
        const planetId = clickedMesh.userData.planetId;
        const entry = planetMeshes.get(planetId);
        if (entry) {
            selectPlanet(entry.data);
        }
    }
}

function selectPlanet(planetData) {
    selectedPlanetId = planetData.planet_id;
    populateInfoCard(planetData);
    document.getElementById('planet-info-card').classList.add('visible');
}

function closeInfoCard() {
    selectedPlanetId = null;
    document.getElementById('planet-info-card').classList.remove('visible');
}

function populateInfoCard(p) {
    document.getElementById('card-name').textContent = p.planet_name;
    document.getElementById('card-dot').style.backgroundColor = p.color_hex;
    document.getElementById('card-dot').style.boxShadow = `0 0 10px ${p.color_hex}`;
    document.getElementById('card-type').textContent = p.type_name || 'N/A';
    document.getElementById('card-star').textContent = p.star_name || 'Sun';
    document.getElementById('card-orbit').textContent = `${parseFloat(p.orbit_radius_au).toFixed(3)} AU`;
    document.getElementById('card-period').textContent = `${parseFloat(p.orbital_period_days).toFixed(1)} days`;
    document.getElementById('card-radius').textContent = `${parseInt(p.radius_km).toLocaleString()} km`;
    document.getElementById('card-moons-count').textContent = p.total_moons || '0';

    const atmoContainer = document.getElementById('card-atmosphere');
    atmoContainer.innerHTML = '';
    const atmoList = p.atmosphere || [];
    if (atmoList.length === 0) {
        atmoContainer.innerHTML = '<span class="pill">No significant atmosphere</span>';
    } else {
        atmoList.forEach(gas => {
            const pill = document.createElement('span');
            pill.className = 'pill gas';
            pill.textContent = `${gas.gas_name} (${gas.percentage}%)`;
            atmoContainer.appendChild(pill);
        });
    }

    const moonsContainer = document.getElementById('card-moons');
    moonsContainer.innerHTML = '';
    const moonList = p.moons_list || [];
    if (moonList.length === 0) {
        moonsContainer.innerHTML = '<span class="pill">No natural satellites</span>';
    } else {
        moonList.forEach(m => {
            const pill = document.createElement('span');
            pill.className = 'pill';
            pill.textContent = m.name;
            moonsContainer.appendChild(pill);
        });
    }

    const disc = p.discovery_info || {};
    const discContainer = document.getElementById('card-discovery');
    const discoverer = disc.discoverer || 'Known since antiquity';
    const year = disc.discovery_year ? ` (${disc.discovery_year})` : '';
    const method = disc.discovery_method ? ` via ${disc.discovery_method}` : '';
    discContainer.textContent = `${discoverer}${year}${method}.`;
}

// ============================================================================
// 5. SIDE PANEL (A, B, C, D, E) CONTROLLERS & LOGIC
// ============================================================================

/**
 * Tab Navigation in Side Panel
 */
function setupSidePanelTabs() {
    const tabs = document.querySelectorAll('.panel-tab');
    const panes = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');

            // Trigger data load when specific tabs open
            if (targetId === 'tab-stats') loadStatsTab();
            if (targetId === 'tab-audit') loadAuditFeed();
        });
    });

    // Toggle Collapsed / Expanded state of side panel
    const toggleBtn = document.getElementById('panel-toggle-btn');
    const panel = document.getElementById('side-panel');
    toggleBtn.addEventListener('click', () => {
        panel.classList.toggle('collapsed');
        toggleBtn.textContent = panel.classList.contains('collapsed') ? '▶' : '◀';
    });
}

/**
 * (A) Add Planet Form & Moons Sub-form with Inline Errors
 */
function setupAddPlanetForm() {
    const form = document.getElementById('form-add-planet');
    const errorBanner = document.getElementById('form-inline-error');
    const moonsContainer = document.getElementById('moons-container');
    const addMoonBtn = document.getElementById('btn-add-moon-row');

    // Add moon sub-form row dynamically
    addMoonBtn.addEventListener('click', () => {
        const rowId = 'moon-row-' + Date.now();
        const row = document.createElement('div');
        row.id = rowId;
        row.className = 'form-row';
        row.style.alignItems = 'center';
        row.innerHTML = `
            <div class="form-group" style="margin-bottom: 0;">
                <input type="text" class="moon-name" placeholder="Moon Name" required>
            </div>
            <div class="form-group" style="margin-bottom: 0; display: flex; gap: 6px;">
                <input type="number" class="moon-radius" step="0.1" placeholder="Radius km" required min="1">
                <button type="button" class="btn btn-danger btn-sm" onclick="document.getElementById('${rowId}').remove()">&times;</button>
            </div>
        `;
        moonsContainer.appendChild(row);
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBanner.classList.remove('visible');
        errorBanner.textContent = '';

        const name = document.getElementById('input-name').value.trim();
        const typeId = parseInt(document.getElementById('input-type').value, 10);
        const color = document.getElementById('input-color').value;
        const radius = parseFloat(document.getElementById('input-radius').value);
        const orbit = parseFloat(document.getElementById('input-orbit').value);
        const period = parseFloat(document.getElementById('input-period').value);
        const mass = parseFloat(document.getElementById('input-mass').value);
        const hasRings = document.getElementById('input-rings').checked;

        // Collect moon sub-form rows
        const moonRows = moonsContainer.querySelectorAll('.form-row');
        const moons = [];
        moonRows.forEach(row => {
            const moonName = row.querySelector('.moon-name').value.trim();
            const moonRadius = parseFloat(row.querySelector('.moon-radius').value);
            if (moonName && moonRadius > 0) {
                moons.push({
                    name: moonName,
                    radius_km: moonRadius,
                    orbit_radius_km: 250000.0,
                    orbital_period_days: 12.0
                });
            }
        });

        try {
            let res;
            if (moons.length > 0) {
                // Call atomic transaction function
                res = await fetch('/api/planets/with-moons', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        star_id: 1,
                        type_id: typeId,
                        name: name,
                        radius_km: radius,
                        orbit_radius_au: orbit,
                        orbital_period_days: period,
                        mass_earth_masses: mass,
                        has_rings: hasRings,
                        color_hex: color,
                        moons: moons
                    })
                });
            } else {
                res = await fetch('/api/planets', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        star_id: 1,
                        type_id: typeId,
                        name: name,
                        radius_km: radius,
                        orbit_radius_au: orbit,
                        orbital_period_days: period,
                        mass_earth_masses: mass,
                        has_rings: hasRings,
                        color_hex: color
                    })
                });
            }

            const json = await res.json();
            if (json.success) {
                showToast(`Planet '${name}' saved to PostgreSQL!`, 'success');
                form.reset();
                moonsContainer.innerHTML = '';
                loadPlanetsFromDB();
            } else {
                // Show server validation error inline
                errorBanner.textContent = `⚠️ ${json.error}: ${json.detail || ''}`;
                errorBanner.classList.add('visible');
            }
        } catch (err) {
            errorBanner.textContent = '⚠️ Could not connect to Express backend server.';
            errorBanner.classList.add('visible');
        }
    });
}

/**
 * (B) Planets List with Inline Delete Button
 */
function renderPlanetsCatalog() {
    const listContainer = document.getElementById('planets-catalog-list');
    if (!listContainer) return;

    if (cachedPlanets.length === 0) {
        listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem;">No planets found in PostgreSQL.</div>';
        return;
    }

    listContainer.innerHTML = '';
    cachedPlanets.forEach(p => {
        const item = document.createElement('div');
        item.className = 'planet-list-item';

        const left = document.createElement('div');
        left.className = 'planet-item-left';
        left.innerHTML = `
            <span class="planet-item-dot" style="background-color: ${p.color_hex}; box-shadow: 0 0 6px ${p.color_hex};"></span>
            <div>
                <div class="planet-item-name">${p.planet_name}</div>
                <div class="planet-item-meta">${p.type_name} • ${p.orbit_radius_au} AU • ${p.total_moons} moons</div>
            </div>
        `;
        left.addEventListener('click', () => {
            selectPlanet(p);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-sm';
        deleteBtn.innerHTML = '🗑️ Delete';
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const confirmed = confirm(`Delete planet '${p.planet_name}'? All ${p.total_moons} dependent moons will CASCADE delete!`);
            if (!confirmed) return;

            try {
                const res = await fetch(`/api/planets/${p.planet_id}`, { method: 'DELETE' });
                const json = await res.json();
                if (json.success) {
                    showToast(`Deleted '${p.planet_name}' (CASCADE)`, 'success');
                    loadPlanetsFromDB();
                } else {
                    alert(json.detail || json.error);
                }
            } catch (err) {
                alert('Delete request failed.');
            }
        });

        item.appendChild(left);
        item.appendChild(deleteBtn);
        listContainer.appendChild(item);
    });
}

/**
 * (C) Stats Panel: Renders /api/stats as small tables
 */
async function loadStatsTab() {
    const container = document.getElementById('stats-tables-container');
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.78rem;">Executing analytical queries...</div>';

    try {
        const res = await fetch('/api/stats');
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        const data = json.data;
        let html = '';

        // Table 1: Heaviest Planet
        if (data.heaviestPlanet) {
            html += `
                <div class="stat-card">
                    <div class="stat-card-title">1. Heaviest Planet (Subquery + JOIN)</div>
                    <table class="mini-table">
                        <tr><th>Planet</th><td>${data.heaviestPlanet.planet_name}</td></tr>
                        <tr><th>Mass</th><td><strong>${data.heaviestPlanet.mass_earth_masses} M⊕</strong></td></tr>
                        <tr><th>Classification</th><td>${data.heaviestPlanet.type_name}</td></tr>
                        <tr><th>Star</th><td>${data.heaviestPlanet.star_name}</td></tr>
                    </table>
                </div>
            `;
        }

        // Table 2: Planets per Star
        html += `
            <div class="stat-card">
                <div class="stat-card-title">2. Planets per Star System (GROUP BY)</div>
                <table class="mini-table">
                    <thead>
                        <tr><th>Star</th><th>Type</th><th>Planets</th></tr>
                    </thead>
                    <tbody>
                        ${data.planetsPerStar.map(s => `
                            <tr>
                                <td>${s.star_name}</td>
                                <td>${s.spectral_type}</td>
                                <td><strong>${s.total_planets}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Table 3: Average Orbit per Type
        html += `
            <div class="stat-card">
                <div class="stat-card-title">3. Orbit Distance by Type (GROUP BY + AVG)</div>
                <table class="mini-table">
                    <thead>
                        <tr><th>Type</th><th>Count</th><th>Avg AU</th><th>Range</th></tr>
                    </thead>
                    <tbody>
                        ${data.averageOrbitRadiusPerType.map(t => `
                            <tr>
                                <td>${t.type_name}</td>
                                <td>${t.total_planets}</td>
                                <td><strong>${t.avg_orbit_radius_au} AU</strong></td>
                                <td>${t.min_orbit_radius_au} - ${t.max_orbit_radius_au}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Table 4: Planets with Most Moons
        html += `
            <div class="stat-card">
                <div class="stat-card-title">4. Planets with Most Moons (HAVING ≥ 2)</div>
                <table class="mini-table">
                    <thead>
                        <tr><th>Planet</th><th>Type</th><th>Moons</th></tr>
                    </thead>
                    <tbody>
                        ${data.planetsWithMostMoons.map(p => `
                            <tr>
                                <td>${p.planet_name}</td>
                                <td>${p.type_name}</td>
                                <td><strong style="color: var(--accent-cyan);">${p.moon_count}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Table 5: Without Atmosphere Data
        html += `
            <div class="stat-card">
                <div class="stat-card-title">5. Planets Without Atmosphere Records (NOT EXISTS)</div>
                <table class="mini-table">
                    <thead>
                        <tr><th>Planet</th><th>Type</th><th>Radius</th></tr>
                    </thead>
                    <tbody>
                        ${data.planetsWithoutAtmosphere.length > 0 ? data.planetsWithoutAtmosphere.map(p => `
                            <tr>
                                <td>${p.planet_name}</td>
                                <td>${p.type_name}</td>
                                <td>${p.radius_km} km</td>
                            </tr>
                        `).join('') : '<tr><td colspan="3" style="color: var(--text-muted);">None (all planets have data)</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<div style="color: var(--accent-red); font-size: 0.78rem;">Failed to fetch stats: ${err.message}</div>`;
    }
}

/**
 * (D) Live Audit Log Feed
 */
async function loadAuditFeed() {
    const feed = document.getElementById('live-audit-feed');
    try {
        const res = await fetch('/api/audit?limit=25');
        const json = await res.json();
        if (!json.success) return;

        feed.innerHTML = '';
        if (json.data.length === 0) {
            feed.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem;">No audit logs recorded yet.</div>';
            return;
        }

        json.data.forEach(entry => appendAuditEntry(entry, false));
    } catch (err) {
        feed.innerHTML = '<div style="color: var(--accent-red); font-size: 0.75rem;">Error loading audit feed.</div>';
    }
}

function appendAuditEntry(entry, prepend = true) {
    const feed = document.getElementById('live-audit-feed');
    if (!feed) return;

    const div = document.createElement('div');
    div.className = `audit-entry ${entry.action_type}`;

    const timeStr = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

    div.innerHTML = `
        <div class="audit-entry-top">
            <span class="audit-badge ${entry.action_type}">${entry.action_type}</span>
            <span style="color: var(--text-muted);">${timeStr}</span>
        </div>
        <div style="color: var(--text-primary); font-weight: 500;">
            ${entry.table_name} #${entry.record_id || entry.id || ''}
        </div>
        <div style="color: var(--text-muted); font-size: 0.68rem;">
            by ${entry.performed_by || 'system'}
        </div>
    `;

    if (prepend) {
        feed.prepend(div);
        // keep at most 30 items
        if (feed.children.length > 30) feed.removeChild(feed.lastChild);
    } else {
        feed.appendChild(div);
    }
}

/**
 * (E) SQL Console: Runs only SELECT queries through read-only endpoint
 */
function setupSqlConsole() {
    const input = document.getElementById('sql-input');
    const executeBtn = document.getElementById('btn-execute-sql');
    const resultContainer = document.getElementById('sql-result-container');
    const resultHeader = document.getElementById('sql-result-header');

    // Preset buttons
    document.querySelectorAll('.sql-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            input.value = btn.getAttribute('data-sql');
            runQuery();
        });
    });

    executeBtn.addEventListener('click', runQuery);

    async function runQuery() {
        const queryText = input.value.trim();
        if (!queryText) return;

        resultHeader.style.display = 'block';
        resultHeader.textContent = 'Executing query in PostgreSQL...';
        resultContainer.innerHTML = '<span style="color: var(--text-muted);">Running...</span>';

        try {
            const res = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: queryText })
            });

            const json = await res.json();

            if (!res.ok || !json.success) {
                resultHeader.textContent = '❌ Query Rejected / Failed';
                resultHeader.style.color = 'var(--accent-red)';
                resultContainer.innerHTML = `
                    <div style="color: var(--accent-red); font-weight: 600; margin-bottom: 4px;">${json.error}</div>
                    <div style="color: #fda4af;">${json.detail || ''}</div>
                `;
                return;
            }

            resultHeader.style.color = 'var(--accent-cyan)';
            resultHeader.textContent = `✅ ${json.rowCount} rows returned in ${json.executionTimeMs}ms`;

            if (json.data.length === 0) {
                resultContainer.innerHTML = '<span style="color: var(--text-muted);">(0 rows returned)</span>';
                return;
            }

            // Render Result Table
            const fields = json.fields || Object.keys(json.data[0]);
            let tableHtml = `
                <table class="mini-table" style="font-family: var(--font-mono);">
                    <thead>
                        <tr>${fields.map(f => `<th>${f}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${json.data.map(row => `
                            <tr>
                                ${fields.map(f => {
                                    const val = row[f];
                                    return `<td>${val !== null && val !== undefined ? (typeof val === 'object' ? JSON.stringify(val) : val) : '<span style="color: var(--text-muted);">NULL</span>'}</td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            resultContainer.innerHTML = tableHtml;
        } catch (err) {
            resultHeader.textContent = '❌ Request Error';
            resultContainer.innerHTML = `<span style="color: var(--accent-red);">${err.message}</span>`;
        }
    }
}

// ============================================================================
// 6. REST API & SSE EVENT HANDLING
// ============================================================================

async function loadPlanetsFromDB() {
    try {
        const response = await fetch('/api/planets');
        const json = await response.json();
        if (json.success) {
            syncPlanetsWithDatabase(json.data);
        }
    } catch (err) {
        console.error('Error fetching planets:', err);
        showToast('Failed to load planets from database.', 'error');
    }
}

function initRealtimeSSE() {
    const statusText = document.getElementById('status-text');
    const statusIndicator = document.getElementById('status-indicator');

    if (!window.EventSource) {
        statusText.textContent = 'SSE Unsupported';
        return;
    }

    const eventSource = new EventSource('/api/events');

    eventSource.onopen = () => {
        statusIndicator.classList.add('connected');
        statusText.textContent = 'PostgreSQL Live (SSE)';
    };

    eventSource.onmessage = (e) => {
        try {
            const message = JSON.parse(e.data);
            if (message.event === 'db_change') {
                const change = message.data;
                showToast(`Live Trigger: ${change.action} on ${change.table}`, 'success');

                // Append live entry to audit feed
                appendAuditEntry(change, true);

                // Seamlessly refresh planets
                loadPlanetsFromDB();
            }
        } catch (err) {
            console.error('SSE JSON parse error:', err);
        }
    };

    eventSource.onerror = () => {
        statusIndicator.classList.remove('connected');
        statusText.textContent = 'Reconnecting...';
    };
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '⚡' : '⚠️'}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-30px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ============================================================================
// 7. BOOTSTRAP APPLICATION
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
    initScene();
    setupSidePanelTabs();
    setupAddPlanetForm();
    setupSqlConsole();

    // Reset camera button
    document.getElementById('btn-reset-view').addEventListener('click', () => {
        camera.position.set(-40, 150, 270);
        controls.target.set(0, 0, 0);
    });

    // Refresh stats button
    document.getElementById('btn-refresh-stats').addEventListener('click', loadStatsTab);

    // Clear audit feed button
    document.getElementById('btn-clear-audit-view').addEventListener('click', () => {
        document.getElementById('live-audit-feed').innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem;">Feed cleared. Waiting for events...</div>';
    });

    // Info card close button
    document.getElementById('card-close-btn').addEventListener('click', closeInfoCard);

    // Initial data fetch
    loadPlanetsFromDB();
    initRealtimeSSE();
});
