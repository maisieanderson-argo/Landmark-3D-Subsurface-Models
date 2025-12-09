import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

// Setup Three.js
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
// scene.fog = new THREE.Fog(0x111111, 2000, 10000); // Removed for clarity

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 10, 50000);
camera.position.set(2000, 2000, 2000); // Start far out
scene.add(camera); // Add camera to scene so attached lights work

// Headlamp (Light attached to camera)
const headLight = new THREE.DirectionalLight(0xffffff, 0.8);
headLight.position.set(0, 0, 1); // Pointing along camera view
camera.add(headLight);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = false;
container.appendChild(renderer.domElement);

// GUI
const gui = new GUI();

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Debug: Log camera position on change
controls.addEventListener('change', () => {
    // Throttling could be added but for manual positioning this is fine
    // console.log(`Camera Pos: x=${camera.position.x.toFixed(2)}, y=${camera.position.y.toFixed(2)}, z=${camera.position.z.toFixed(2)} | Target: x=${controls.target.x.toFixed(2)}, y=${controls.target.y.toFixed(2)}, z=${controls.target.z.toFixed(2)}`);
});
// Expose a helper to get the current view
window.getCameraView = () => {
    console.log(`
    // Copy this block to set default view:
    controls.target.set(${controls.target.x.toFixed(2)}, ${controls.target.y.toFixed(2)}, ${controls.target.z.toFixed(2)});
    camera.position.set(${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)});
    `);
};

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 4.84); // Very bright ambient
scene.add(ambientLight);

// Hemisphere light for better overall visibility
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.575);
hemiLight.position.set(0, 5000, 0);
scene.add(hemiLight);

// Directional Light will be added dynamically to center on model
let mainLight;

const fillLight = new THREE.DirectionalLight(0xffffff, 1.15);
fillLight.position.set(-5000, 5000, -5000); 
scene.add(fillLight);

const bottomLight = new THREE.DirectionalLight(0xffffff, 0.5);
bottomLight.position.set(-1000, -2000, -1000);
scene.add(bottomLight);

// Data container
const modelGroup = new THREE.Group();
scene.add(modelGroup);

// Loading UI
const loadingEl = document.getElementById('loading');
function updateLoading(msg) {
    if (loadingEl) {
        loadingEl.style.display = 'block';
        loadingEl.textContent = msg;
    }
}
function hideLoading() {
    if (loadingEl) loadingEl.style.display = 'none';
}

// Colormap Definitions (Control Points 0..1)
const ColormapRegistry = {
    'Viridis': [
        { t: 0.0, c: '#440154' }, { t: 0.25, c: '#3b528b' }, { t: 0.5, c: '#21918c' }, { t: 0.75, c: '#5ec962' }, { t: 1.0, c: '#fde725' }
    ],
    'Plasma': [
        { t: 0.0, c: '#0d0887' }, { t: 0.25, c: '#7e03a8' }, { t: 0.5, c: '#cc4778' }, { t: 0.75, c: '#f89540' }, { t: 1.0, c: '#f0f921' }
    ],
    'Magma': [
        { t: 0.0, c: '#000004' }, { t: 0.25, c: '#3b0f70' }, { t: 0.5, c: '#8c2981' }, { t: 0.75, c: '#de4968' }, { t: 1.0, c: '#fcfdbf' }
    ],
    'Inferno': [
        { t: 0.0, c: '#000004' }, { t: 0.25, c: '#420a68' }, { t: 0.5, c: '#932667' }, { t: 0.75, c: '#dd513a' }, { t: 1.0, c: '#fcffa4' }
    ],
    'Terrain': [
        { t: 0.0, c: '#000080' }, { t: 0.25, c: '#008000' }, { t: 0.5, c: '#f0e68c' }, { t: 0.75, c: '#8b4513' }, { t: 1.0, c: '#ffffff' }
    ],
    'Ocean': [
        { t: 0.0, c: '#000000' }, { t: 0.5, c: '#000080' }, { t: 1.0, c: '#00ffff' }
    ],
    'Cividis': [
        { t: 0.0, c: '#00204d' }, { t: 0.5, c: '#7c7b78' }, { t: 1.0, c: '#ffea46' }
    ],
    'Turbo': [
        { t: 0.0, c: '#30123b' }, { t: 0.2, c: '#4686fb' }, { t: 0.4, c: '#18d5cc' }, 
        { t: 0.6, c: '#a4fc3b' }, { t: 0.8, c: '#e98a1c' }, { t: 1.0, c: '#7a0403' }
    ],
    'Warm': [
        { t: 0.0, c: '#6e40aa' }, { t: 0.5, c: '#ff5e63' }, { t: 1.0, c: '#aff05b' }
    ],
    'Cool': [
        { t: 0.0, c: '#4c6edb' }, { t: 0.5, c: '#23abd8' }, { t: 1.0, c: '#e460de' }
    ]
};

function getColormapColor(name, t) {
    const stops = ColormapRegistry[name] || ColormapRegistry['Viridis'];
    // Clamp t
    t = Math.max(0, Math.min(1, t));
    
    // Find stops
    for (let i = 0; i < stops.length - 1; i++) {
        if (t >= stops[i].t && t <= stops[i+1].t) {
            const t0 = stops[i].t;
            const t1 = stops[i+1].t;
            const localT = (t - t0) / (t1 - t0);
            const c1 = new THREE.Color(stops[i].c);
            const c2 = new THREE.Color(stops[i+1].c);
            return c1.lerp(c2, localT);
        }
    }
    return new THREE.Color(stops[stops.length-1].c);
}

// Data Parsing
function parseCSV(text) {
    console.log("Parsing CSV, length:", text.length);
    const lines = text.split('\n');
    console.log("Line count:", lines.length);
    const data = {}; // Map "IL_XL" -> {x, y, z}
    
    let minIL = Infinity, maxIL = -Infinity;
    let minXL = Infinity, maxXL = -Infinity;
    let parsedCount = 0;

    // Skip header (line 0)
    for (let i = 1; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        
        const parts = line.split(',');
        
        if (parts.length < 5) {
             continue;
        }
        
        const il = parseFloat(parts[0]); 
        const xl = parseFloat(parts[1]);
        const x = parseFloat(parts[2]);
        const y = parseFloat(parts[3]);
        const z = parseFloat(parts[4]);
        
        if (isNaN(il) || isNaN(xl) || isNaN(x) || isNaN(y) || isNaN(z)) continue;
        
        // Round IL/XL to integers for indexing
        const il_idx = Math.round(il);
        const xl_idx = Math.round(xl);
        
        minIL = Math.min(minIL, il_idx);
        maxIL = Math.max(maxIL, il_idx);
        minXL = Math.min(minXL, xl_idx);
        maxXL = Math.max(maxXL, xl_idx);
        
        data[`${il_idx}_${xl_idx}`] = { x, y, z };
        parsedCount++;
    }
    
    console.log(`Parsed ${parsedCount} points. IL range: ${minIL}-${maxIL}, XL range: ${minXL}-${maxXL}`);
    return { data, minIL, maxIL, minXL, maxXL };
}

// Contour Shader
const contourMaterial = new THREE.ShaderMaterial({
    uniforms: {
        interval: { value: 50.0 },
        lineColor: { value: new THREE.Color(0x111111) },
        opacity: { value: 0.5 },
        thickness: { value: 1.5 }
    },
    vertexShader: `
        varying float vY;
        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vY = worldPosition.y;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
    `,
    fragmentShader: `
        uniform float interval;
        uniform vec3 lineColor;
        uniform float opacity;
        uniform float thickness;
        varying float vY;
        void main() {
            // Draw lines at fixed intervals
            float y = abs(vY);
            // Use fwidth for screen-space constant width
            float f = fract(y / interval);
            float df = fwidth(y / interval);
            
            // Calculate line intensity (0..1)
            // Thickness factor controls how wide the smoothstep edge is
            float line = smoothstep(thickness * df, 0.0, abs(f - 0.5));
            
            // If line is too weak, discard
            if (line < 0.1) discard;
            
            gl_FragColor = vec4(lineColor, opacity * line);
        }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1, 
    polygonOffsetUnits: -1
});

async function loadHorizon(name, url, color) {
    updateLoading(`Loading ${name}...`);
    console.log(`Fetching ${url}...`);
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const text = await response.text();
        console.log(`Received ${text.length} bytes for ${name}`);
        const parsed = parseCSV(text);
        parsed.name = name;
        parsed.color = color;
        return parsed;
    } catch (e) {
        console.error(`Failed to load ${name}`, e);
        return null;
    }
}

async function initVolveData() {
    console.log("Starting initVolveData...");
    updateLoading("Fetching Volve Field Data...");
    
    const horizons = await Promise.all([
        loadHorizon("BCU (Base Cretaceous Unconformity)", "BCU.csv", 0x4ECDC4),
        loadHorizon("Hugin Fm Top", "Hugin_Fm_Top.csv", 0xFF6B6B),
        loadHorizon("Hugin Fm Base", "Hugin_Fm_Base.csv", 0x45B7D1)
    ]);
    
    const validHorizons = horizons.filter(h => h !== null);
    console.log(`Loaded ${validHorizons.length} valid horizons`);
    
    if (validHorizons.length === 0) {
        updateLoading("Error: No data loaded.");
        return;
    }

    updateLoading("Processing Geometry...");

    // 1. Calculate global center to normalize coordinates
    const ref = validHorizons[0];
    let sumX = 0, sumY = 0, count = 0;
    const keys = Object.keys(ref.data);
    if (keys.length === 0) {
        console.error("Reference horizon has no data points!");
        return;
    }

    const sampleSize = Math.min(keys.length, 1000);
    for(let i=0; i<sampleSize; i++) {
        const pt = ref.data[keys[i]];
        sumX += pt.x;
        sumY += pt.y;
        count++;
    }
    const centerX = sumX / count;
    const centerY = sumY / count;
    console.log(`Center calculated: ${centerX}, ${centerY}`);

    // 2. Build Meshes
    validHorizons.forEach(h => {
        console.log(`Building mesh for ${h.name}...`);
        // Grid dimensions
        const width = h.maxIL - h.minIL + 1;
        const height = h.maxXL - h.minXL + 1;
        
        console.log(`Grid size: ${width} x ${height}`);

        if (width <= 0 || height <= 0 || !isFinite(width) || !isFinite(height)) {
             console.error(`Invalid grid dimensions for ${h.name}: ${width}x${height}`);
             return;
        }

        // Calculate average Z for hole filling (better than NaN for bounding box safety)
        let sumZ = 0;
        let countZ = 0;
        Object.values(h.data).forEach(pt => {
            sumZ += pt.z;
            countZ++;
        });
        const avgZ = countZ > 0 ? sumZ / countZ : 0;
        console.log(`Average Depth for ${h.name}: ${avgZ}`);

        const geometry = new THREE.PlaneGeometry(1, 1, width - 1, height - 1);
        const posAttr = geometry.attributes.position;
        const invalidIndices = new Set();
        
        let validPoints = 0;
        for (let ix = 0; ix < width; ix++) {
            for (let iy = 0; iy < height; iy++) {
                const il = h.minIL + ix;
                const xl = h.minXL + iy;
                const pt = h.data[`${il}_${xl}`];
                
                const idx = iy * width + ix;
                
                if (pt) {
                    posAttr.setXYZ(idx, 
                        pt.x - centerX, 
                        -pt.z,           
                        -(pt.y - centerY) 
                    );
                    validPoints++;
                } else {
                    // Mark as invalid
                    invalidIndices.add(idx);
                    // Set to 0 (won't be rendered anyway after index cleanup)
                    posAttr.setXYZ(idx, 0, 0, 0); 
                }
            }
        }
        console.log(`Mesh built with ${validPoints} valid vertices out of ${width*height} total grid points`);
        
        // CLEANUP INDICES: Remove triangles connected to invalid vertices
        const indexAttr = geometry.index;
        const indices = indexAttr.array;
        const newIndices = [];
        
        for (let i = 0; i < indices.length; i += 3) {
            const a = indices[i];
            const b = indices[i+1];
            const c = indices[i+2];
            
            // If any vertex of the triangle is invalid, skip this triangle
            if (!invalidIndices.has(a) && !invalidIndices.has(b) && !invalidIndices.has(c)) {
                newIndices.push(a, b, c);
            }
        }
        
        geometry.setIndex(newIndices);
        
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        
        const material = new THREE.MeshStandardMaterial({ 
            color: h.color, 
            side: THREE.DoubleSide,
            wireframe: false,
            roughness: 0.6,
            metalness: 0.2
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.originalColor = h.color; // Save for toggling
        mesh.userData.layerName = h.name; // Store for layer controls
        modelGroup.add(mesh);

        // Create Contour Overlay
        const cMesh = new THREE.Mesh(geometry, contourMaterial.clone());
        cMesh.visible = false;
        cMesh.renderOrder = 1; // Force rendering after the terrain to fix transparency issues
        cMesh.userData.isContour = true;
        cMesh.userData.layerName = h.name; // Also tag contours so they hide with layer
        modelGroup.add(cMesh);
    });

    // 3. Center Camera
    const box = new THREE.Box3().setFromObject(modelGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    console.log("Model Bounding Box:", box);
    console.log("Model Center:", center);
    console.log("Model Size:", size);

    // DYNAMIC LIGHTING
    // Center the light directly over the model
    if (mainLight) scene.remove(mainLight);
    mainLight = new THREE.DirectionalLight(0xffffff, 1.15);
    // Position high above center
    const lightHeight = Math.max(size.x, size.z) * 2;
    mainLight.position.set(center.x, center.y + lightHeight, center.z);
    mainLight.target.position.copy(center);
    scene.add(mainLight);
    scene.add(mainLight.target);

    // DYNAMIC CAMERA POSITIONING
    // Based on user's preferred guidepost:
    // Target: (3847.87, -3407.03, 82.23)
    // Position: (2420.21, -826.12, -5492.54)
    // Direction Vector = Position - Target = (-1427.66, 2580.91, -5574.77)
    
    const viewVector = new THREE.Vector3(-1427.66, 2580.91, -5574.77).normalize();
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // New distance is approx 6300m for model size 8200m -> 0.77x
    const viewDistance = maxDim * 0.77; 
    
    // Set Target to Model Center, but offset DOWN to move model UP on screen
    const targetOffset = new THREE.Vector3(0, -maxDim * 0.2, 0); 
    controls.target.copy(center).add(targetOffset);
    
    // Set Position relative to Center
    const cameraPos = controls.target.clone().add(viewVector.multiplyScalar(viewDistance));
    camera.position.copy(cameraPos);
    
    camera.near = 10;
    camera.far = viewDistance * 20; 
    camera.updateProjectionMatrix();
    
    console.log("Camera Position (Dynamic):", camera.position);
    console.log("Camera Near/Far:", camera.near, camera.far);

    // Initialize Layer Controls
    initLayerControls(validHorizons);

    // Apply Visualization Defaults
    updateColoring(); // Apply depth coloring if enabled
    
    // Apply contour defaults
    modelGroup.children.forEach(c => {
        if (c.userData.isContour) {
            // Respect layer visibility!
            c.visible = params.showContours && c.userData.layerVisible;
            c.material.uniforms.interval.value = params.contourInterval;
            c.material.uniforms.thickness.value = params.contourThickness;
            c.material.uniforms.opacity.value = params.contourOpacity;
            c.material.uniforms.lineColor.value.set(params.contourColor);
        }
    });

    // Initialize Presets (Capture Default)
    initPresets();

    hideLoading();
}

// Add Custom UI Styles and HTML
const uiStyles = document.createElement('style');
uiStyles.textContent = `
    .preset-bar {
        position: absolute;
        bottom: 20px;
        right: 20px; /* Aligned with GUI usually on right */
        background: #1a1a1a;
        padding: 10px;
        border-radius: 6px;
        display: flex;
        gap: 8px;
        align-items: center;
        color: #eee;
        font-family: sans-serif;
        font-size: 13px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        z-index: 1001;
    }
    .preset-select {
        background: #333;
        border: 1px solid #444;
        color: #fff;
        padding: 5px 10px;
        border-radius: 4px;
        outline: none;
        min-width: 120px;
    }
    .icon-btn {
        background: #333;
        border: none;
        color: #ccc;
        width: 30px;
        height: 30px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s, color 0.2s;
    }
    .icon-btn:hover {
        background: #444;
        color: #fff;
    }
    .icon-btn.delete:hover {
        background: #622;
        color: #fcc;
    }
    .modal-overlay {
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.6);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 2000;
        backdrop-filter: blur(2px);
    }
    .modal {
        background: #222;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        color: #eee;
        font-family: sans-serif;
        min-width: 300px;
        border: 1px solid #333;
    }
    .modal h3 { margin: 0 0 15px 0; font-size: 16px; }
    .modal input {
        width: 100%;
        padding: 8px;
        background: #111;
        border: 1px solid #444;
        color: #fff;
        border-radius: 4px;
        margin-bottom: 15px;
        box-sizing: border-box;
    }
    .modal-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }
    .btn {
        padding: 6px 12px;
        border-radius: 4px;
        border: none;
        cursor: pointer;
        font-size: 13px;
    }
    .btn-primary { background: #2196F3; color: white; }
    .btn-primary:hover { background: #1976D2; }
    .btn-danger { background: #d32f2f; color: white; }
    .btn-danger:hover { background: #b71c1c; }
    .btn-cancel { background: #444; color: #ccc; }
    .btn-cancel:hover { background: #555; }
`;
document.head.appendChild(uiStyles);

// Add HTML Structure
const uiContainer = document.createElement('div');
uiContainer.innerHTML = `
    <!-- Preset Bar -->
    <div class="preset-bar">
        <span>Preset:</span>
        <select id="presetSelect" class="preset-select"></select>
        <button id="btnSave" class="icon-btn" title="Save Preset">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
        </button>
        <button id="btnDelete" class="icon-btn delete" title="Delete Preset">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
    </div>

    <!-- Save Modal -->
    <div id="saveModal" class="modal-overlay">
        <div class="modal">
            <h3>Save Preset</h3>
            <input type="text" id="presetNameInput" placeholder="Enter preset name...">
            <div class="modal-buttons">
                <button class="btn btn-cancel" onclick="closeModal('saveModal')">Cancel</button>
                <button class="btn btn-primary" id="confirmSave">Save</button>
            </div>
        </div>
    </div>

    <!-- Delete Modal -->
    <div id="deleteModal" class="modal-overlay">
        <div class="modal">
            <h3>Delete Preset?</h3>
            <p style="margin-bottom:20px; color:#ccc;">Are you sure you want to delete "<span id="deleteTargetName"></span>"?</p>
            <div class="modal-buttons">
                <button class="btn btn-cancel" onclick="closeModal('deleteModal')">Cancel</button>
                <button class="btn btn-danger" id="confirmDelete">Delete</button>
            </div>
        </div>
    </div>
`;
document.body.appendChild(uiContainer);

window.closeModal = (id) => {
    document.getElementById(id).style.display = 'none';
};

// ... Rest of script ...
const params = {
    wireframe: false,
    flatShading: false,
    colorByDepth: true,
    selectedColormap: 'Warm',
    showContours: true,
    contourInterval: 44.59,
    contourThickness: 0.99,
    contourOpacity: 0.2,
    contourColor: '#111111',
    zScale: 1.0,
    ambientIntensity: 6.44,
    sunIntensity: 0.0,
    headlampIntensity: 0.39,
    hemiIntensity: 1.62,
    lightingEnabled: true
};

// Global Layer State for Presets
const layerState = {};

// Preset Storage
let savedPresets = {
    'Default': null // Will be captured on init
};

// Create Layer Controls dynamically
const layerFolder = gui.addFolder('Layers');

function initLayerControls(horizons) {
    horizons.forEach(h => {
        const folder = layerFolder.addFolder(h.name);
        
        // Defaults per layer
        let defaultVisible = false;
        let defaultOpacity = 1.0;
        
        // Only Hugin Fm Base visible by default
        if (h.name.includes("Hugin Fm Base")) {
            defaultVisible = true;
        }
        
        // Initialize State
        layerState[h.name] = {
            visible: defaultVisible,
            opacity: defaultOpacity
        };
        
        // Apply initial visibility/opacity
        modelGroup.children.forEach(c => {
            if (c.userData.layerName === h.name) {
                if (c.userData.isContour) {
                    // Initialize tracking state
                    c.userData.layerVisible = defaultVisible;
                    // Only visible if layer is visible AND global contours are on
                    c.visible = defaultVisible && params.showContours;
                } else {
                    c.visible = defaultVisible;
                    c.material.transparent = true; // Always transparent
                    c.material.opacity = defaultOpacity;
                }
            }
        });
        
        folder.add(layerState[h.name], 'visible').onChange(v => {
            modelGroup.children.forEach(c => {
                if (c.userData.layerName === h.name) {
                    if (c.userData.isContour) {
                        c.userData.layerVisible = v;
                        c.visible = v && params.showContours;
                    } else {
                        c.visible = v;
                    }
                }
            });
        });
        
        folder.add(layerState[h.name], 'opacity', 0, 1).onChange(v => {
            modelGroup.children.forEach(c => {
                if (c.userData.layerName === h.name) {
                    // Always keep transparent=true to ensure consistent rendering with topology lines
                    // otherwise switching between opaque/transparent queues causes z-fighting or blending issues
                    c.material.transparent = true; 
                    c.material.opacity = v;
                    c.material.needsUpdate = true;
                }
            });
        });
    });
}


function getCurrentState() {
    return {
        params: { ...params },
        layers: JSON.parse(JSON.stringify(layerState))
    };
}

function applyState(state) {
    // 1. Update Params
    Object.assign(params, state.params);
    
    // 2. Update Layer State
    Object.assign(layerState, state.layers);
    
    // 3. Update GUI Controllers
    gui.controllersRecursive().forEach(c => c.updateDisplay());
    
    // 4. Apply Side Effects
    
    // Layers
    Object.keys(layerState).forEach(name => {
        const s = layerState[name];
        modelGroup.children.forEach(c => {
            if (c.userData.layerName === name) {
                if (c.userData.isContour) {
                    c.userData.layerVisible = s.visible;
                    c.visible = s.visible && params.showContours;
                } else {
                    c.visible = s.visible;
                    c.material.transparent = true;
                    c.material.opacity = s.opacity;
                }
            }
        });
    });
    
    // Coloring & Material
    updateMaterialType(params.lightingEnabled);
    updateColoring(); // Handles depth coloring
    
    // Contours
    modelGroup.children.forEach(c => {
        if (c.userData.isContour) {
            c.material.uniforms.interval.value = params.contourInterval;
            c.material.uniforms.thickness.value = params.contourThickness;
            c.material.uniforms.opacity.value = params.contourOpacity;
            c.material.uniforms.lineColor.value.set(params.contourColor);
            // Visibility is handled in Layer loop + global toggle check below
            if (!params.showContours) c.visible = false;
        }
    });
    
    // Lighting
    ambientLight.intensity = params.ambientIntensity;
    if(mainLight) mainLight.intensity = params.sunIntensity;
    headLight.intensity = params.headlampIntensity;
    hemiLight.intensity = params.hemiIntensity;
    
    // Model Transform
    modelGroup.children.forEach(c => c.material.wireframe = params.wireframe);
    modelGroup.children.forEach(c => { 
        if(!c.userData.isContour) c.material.flatShading = params.flatShading; 
        c.material.needsUpdate = true;
    });
    modelGroup.scale.y = params.zScale;
}

// --- Custom UI Logic ---

function updatePresetDropdown(selectName) {
    const select = document.getElementById('presetSelect');
    select.innerHTML = '';
    
    Object.keys(savedPresets).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });

    if (selectName && savedPresets[selectName]) {
        select.value = selectName;
    }
}

function initPresets() {
    // Load from LocalStorage
    const stored = localStorage.getItem('volve_viz_presets');
    if (stored) {
        savedPresets = JSON.parse(stored);
    }
    
    // Capture Default
    savedPresets['Default'] = getCurrentState();
    
    updatePresetDropdown('Default');

    // Event Listeners
    const select = document.getElementById('presetSelect');
    select.addEventListener('change', (e) => {
        const name = e.target.value;
        if (savedPresets[name]) {
            applyState(savedPresets[name]);
        }
    });

    // Save Flow
    document.getElementById('btnSave').addEventListener('click', () => {
        document.getElementById('presetNameInput').value = '';
        document.getElementById('saveModal').style.display = 'flex';
        document.getElementById('presetNameInput').focus();
    });

    document.getElementById('confirmSave').addEventListener('click', () => {
        const name = document.getElementById('presetNameInput').value.trim();
        if (!name) return alert("Please enter a name");
        
        savedPresets[name] = getCurrentState();
        localStorage.setItem('volve_viz_presets', JSON.stringify(savedPresets));
        
        updatePresetDropdown(name);
        closeModal('saveModal');
    });

    // Delete Flow
    document.getElementById('btnDelete').addEventListener('click', () => {
        const name = document.getElementById('presetSelect').value;
        if (name === 'Default') return alert("Cannot delete Default preset");
        
        document.getElementById('deleteTargetName').textContent = name;
        document.getElementById('deleteModal').style.display = 'flex';
    });

    document.getElementById('confirmDelete').addEventListener('click', () => {
        const name = document.getElementById('presetSelect').value;
        delete savedPresets[name];
        localStorage.setItem('volve_viz_presets', JSON.stringify(savedPresets));
        
        updatePresetDropdown('Default');
        applyState(savedPresets['Default']);
        closeModal('deleteModal');
    });
}

function updateColoring() {
    if (params.colorByDepth) {
        // Calculate bounds
        let minZ = Infinity, maxZ = -Infinity;
        modelGroup.children.forEach(mesh => {
            if (mesh.userData.isContour) return; // Skip contours
            const pos = mesh.geometry.attributes.position;
            for(let i=0; i<pos.count; i++) {
                // Remember Y in Three is -Z in Geo (Depth)
                // So lower Y is deeper.
                // We want deeper (lower Y) to be start of ramp?
                // Standard: Low Value (Deep/Blue) -> High Value (Shallow/Red)
                // BUT in depth map: Depth is usually positive downwards.
                // So Deep = Large Value. Shallow = Small Value.
                // Let's stick to Y: Min Y (deepest) to Max Y (shallowest)
                const y = pos.getY(i);
                if(!isNaN(y) && y !== 0) { // check for holes (0 or NaN)
                    if(y < minZ) minZ = y;
                    if(y > maxZ) maxZ = y;
                }
            }
        });

        // Apply vertex colors
        modelGroup.children.forEach(mesh => {
            if (mesh.userData.isContour) return;
            
            const geometry = mesh.geometry;
            const count = geometry.attributes.position.count;
            const colors = new Float32Array(count * 3);
            const pos = geometry.attributes.position;
            
            for (let i = 0; i < count; i++) {
                const y = pos.getY(i);
                // Normalize 0..1
                // t=0 at minZ (deep), t=1 at maxZ (shallow)
                const t = (y - minZ) / (maxZ - minZ);
                
                const color = getColormapColor(params.selectedColormap, t);
                
                colors[i * 3] = color.r;
                colors[i * 3 + 1] = color.g;
                colors[i * 3 + 2] = color.b;
            }
            
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            mesh.material.vertexColors = true;
            mesh.material.color.set(0xffffff); // Reset base color
            mesh.material.needsUpdate = true;
        });
    } else {
        // Revert to original layer colors
        modelGroup.children.forEach(mesh => {
            if (mesh.userData.isContour) return;
            
            mesh.material.vertexColors = false;
            if (mesh.userData.originalColor) {
                mesh.material.color.setHex(mesh.userData.originalColor);
            }
            mesh.material.needsUpdate = true;
        });
    }
}

const vizFolder = gui.addFolder('Visualization');

vizFolder.add(params, 'wireframe').onChange((v) => {
    modelGroup.children.forEach(c => c.material.wireframe = v);
});

vizFolder.add(params, 'flatShading').name('Sharp/Flat').onChange((v) => {
    modelGroup.children.forEach(c => {
        if (!c.userData.isContour) {
            c.material.flatShading = v;
            c.material.needsUpdate = true;
        }
    });
});

const depthFolder = vizFolder.addFolder('Depth Coloring');

depthFolder.add(params, 'colorByDepth').name('Enable').onChange((v) => {
    updateColoring();
});

depthFolder.add(params, 'selectedColormap', Object.keys(ColormapRegistry)).name('Colormap').onChange((v) => {
    if(params.colorByDepth) updateColoring();
});

const topoFolder = vizFolder.addFolder('Topology Lines');

topoFolder.add(params, 'showContours').name('Enable').onChange((v) => {
    modelGroup.children.forEach(c => {
        if (c.userData.isContour) {
            // Only show if global toggle is ON AND the parent layer is visible
            c.visible = v && c.userData.layerVisible;
        }
    });
});

topoFolder.add(params, 'contourInterval', 10, 500).name('Interval').onChange((v) => {
    modelGroup.children.forEach(c => {
        if (c.userData.isContour) {
            c.material.uniforms.interval.value = v;
        }
    });
});

topoFolder.add(params, 'contourThickness', 0.5, 5.0).name('Thickness').onChange((v) => {
    modelGroup.children.forEach(c => {
        if (c.userData.isContour) {
            c.material.uniforms.thickness.value = v;
        }
    });
});

topoFolder.add(params, 'contourOpacity', 0.1, 1.0).name('Opacity').onChange((v) => {
    modelGroup.children.forEach(c => {
        if (c.userData.isContour) {
            c.material.uniforms.opacity.value = v;
        }
    });
});

topoFolder.addColor(params, 'contourColor').name('Color').onChange((v) => {
    modelGroup.children.forEach(c => {
        if (c.userData.isContour) {
            c.material.uniforms.lineColor.value.set(v);
        }
    });
});

gui.add(params, 'zScale', 0.1, 10).name('Vertical Exaggeration').onChange(v => {
    modelGroup.scale.y = v;
});

const lightFolder = gui.addFolder('Lighting');
lightFolder.add(params, 'lightingEnabled').name('Enable Lighting').onChange(v => {
    updateMaterialType(v);
});
lightFolder.add(params, 'ambientIntensity', 0, 10).name('Ambient Light').onChange(v => {
    ambientLight.intensity = v;
});
lightFolder.add(params, 'sunIntensity', 0, 10).name('Sun Light').onChange(v => {
    if(mainLight) mainLight.intensity = v;
});
lightFolder.add(params, 'headlampIntensity', 0, 5).name('Headlamp').onChange(v => {
    headLight.intensity = v;
});
lightFolder.add(params, 'hemiIntensity', 0, 5).name('Sky Light').onChange(v => {
    hemiLight.intensity = v;
});


// Animation
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// Handle Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start
initVolveData();
animate();
