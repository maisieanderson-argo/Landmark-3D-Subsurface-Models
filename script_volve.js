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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // cap at 1.5 for perf on Retina
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

// Norne survey sub-group (horizons, faults, wells, bbox, seismic)
// Offset this group to reposition the Norne survey within the regional context
const norneSurveyGroup = new THREE.Group();
modelGroup.add(norneSurveyGroup);

// Volve survey sub-group
const volveSurveyGroup = new THREE.Group();
modelGroup.add(volveSurveyGroup);

// Well trajectories sub-group
const wellGroup = new THREE.Group();
modelGroup.add(wellGroup);

// Helper: iterate meshes from BOTH survey groups (for survey-spanning operations)
function allSurveyChildren() {
    return [...norneSurveyGroup.children, ...volveSurveyGroup.children];
}

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
    ],
    // Colorcet Perceptually Uniform Colormaps
    'CET-L01 (Gray)': [
        { t: 0.0, c: '#000000' }, { t: 0.5, c: '#808080' }, { t: 1.0, c: '#ffffff' }
    ],
    'CET-L02 (Blue-White)': [
        { t: 0.0, c: '#1e1e4a' }, { t: 0.25, c: '#3b5998' }, { t: 0.5, c: '#6b9dc7' }, { t: 0.75, c: '#a8d0e6' }, { t: 1.0, c: '#ffffff' }
    ],
    'CET-L03 (Blue-Yellow)': [
        { t: 0.0, c: '#352a87' }, { t: 0.25, c: '#0f6faa' }, { t: 0.5, c: '#38b99e' }, { t: 0.75, c: '#a5d96a' }, { t: 1.0, c: '#f7feac' }
    ],
    'CET-L04 (Blue-White-Red)': [
        { t: 0.0, c: '#2166ac' }, { t: 0.25, c: '#67a9cf' }, { t: 0.5, c: '#f7f7f7' }, { t: 0.75, c: '#ef8a62' }, { t: 1.0, c: '#b2182b' }
    ],
    'CET-L06 (Blue-Black-Red)': [
        { t: 0.0, c: '#0571b0' }, { t: 0.25, c: '#2a4858' }, { t: 0.5, c: '#1a1a1a' }, { t: 0.75, c: '#5c2a2a' }, { t: 1.0, c: '#ca0020' }
    ],
    'CET-L07 (Blue-Magenta-Yellow)': [
        { t: 0.0, c: '#1e1e78' }, { t: 0.25, c: '#7b2e8e' }, { t: 0.5, c: '#c44e52' }, { t: 0.75, c: '#e8a838' }, { t: 1.0, c: '#f0f921' }
    ],
    'CET-L08 (Green-White-Purple)': [
        { t: 0.0, c: '#1b7837' }, { t: 0.25, c: '#7fbf7b' }, { t: 0.5, c: '#f7f7f7' }, { t: 0.75, c: '#af8dc3' }, { t: 1.0, c: '#762a83' }
    ],
    'CET-L09 (Green-White-Brown)': [
        { t: 0.0, c: '#01665e' }, { t: 0.25, c: '#5ab4ac' }, { t: 0.5, c: '#f5f5f5' }, { t: 0.75, c: '#d8b365' }, { t: 1.0, c: '#8c510a' }
    ],
    'CET-L16 (Rainbow)': [
        { t: 0.0, c: '#30123b' }, { t: 0.17, c: '#4662d7' }, { t: 0.33, c: '#36aac8' },
        { t: 0.5, c: '#43e86b' }, { t: 0.67, c: '#c8e020' }, { t: 0.83, c: '#f57d15' }, { t: 1.0, c: '#7a0403' }
    ],
    'CET-L17 (Cyclic-Gray)': [
        { t: 0.0, c: '#2a2a2a' }, { t: 0.25, c: '#808080' }, { t: 0.5, c: '#d4d4d4' }, { t: 0.75, c: '#808080' }, { t: 1.0, c: '#2a2a2a' }
    ],
    'CET-L18 (Cyclic-Magenta-Yellow)': [
        { t: 0.0, c: '#bf77bf' }, { t: 0.25, c: '#e8e857' }, { t: 0.5, c: '#57e8e8' }, { t: 0.75, c: '#e8e857' }, { t: 1.0, c: '#bf77bf' }
    ],
    'CET-L19 (Cyclic-Red-Blue)': [
        { t: 0.0, c: '#d73027' }, { t: 0.25, c: '#f7f7f7' }, { t: 0.5, c: '#4575b4' }, { t: 0.75, c: '#f7f7f7' }, { t: 1.0, c: '#d73027' }
    ],
    'CET-D01 (Blue-White-Red Diverging)': [
        { t: 0.0, c: '#3b4cc0' }, { t: 0.25, c: '#8abbdc' }, { t: 0.5, c: '#f7f7f7' }, { t: 0.75, c: '#f0a582' }, { t: 1.0, c: '#b40426' }
    ],
    'CET-D02 (Cyan-White-Magenta)': [
        { t: 0.0, c: '#008080' }, { t: 0.25, c: '#80c0c0' }, { t: 0.5, c: '#ffffff' }, { t: 0.75, c: '#c080c0' }, { t: 1.0, c: '#800080' }
    ],
    'CET-D03 (Green-White-Red)': [
        { t: 0.0, c: '#1a9641' }, { t: 0.25, c: '#a6d96a' }, { t: 0.5, c: '#ffffbf' }, { t: 0.75, c: '#fdae61' }, { t: 1.0, c: '#d7191c' }
    ],
    'CET-D04 (Blue-Black-Yellow)': [
        { t: 0.0, c: '#2c7bb6' }, { t: 0.25, c: '#1a4a6e' }, { t: 0.5, c: '#1a1a1a' }, { t: 0.75, c: '#6e5a1a' }, { t: 1.0, c: '#d7a02c' }
    ],
    'CET-I1 (Isoluminant Blue-Green)': [
        { t: 0.0, c: '#5773cc' }, { t: 0.5, c: '#7a9a9a' }, { t: 1.0, c: '#9ac257' }
    ],
    'CET-I2 (Isoluminant Magenta-Green)': [
        { t: 0.0, c: '#cc5599' }, { t: 0.5, c: '#999999' }, { t: 1.0, c: '#55cc77' }
    ],
    'CET-I3 (Isoluminant Red-Blue)': [
        { t: 0.0, c: '#cc6666' }, { t: 0.5, c: '#9a7a9a' }, { t: 1.0, c: '#6666cc' }
    ],
    'CET-R1 (Rainbow-Bright)': [
        { t: 0.0, c: '#e41a1c' }, { t: 0.2, c: '#ff7f00' }, { t: 0.4, c: '#ffff33' },
        { t: 0.6, c: '#4daf4a' }, { t: 0.8, c: '#377eb8' }, { t: 1.0, c: '#984ea3' }
    ],
    'CET-R2 (Rainbow-Dark)': [
        { t: 0.0, c: '#7f0000' }, { t: 0.2, c: '#b35900' }, { t: 0.4, c: '#b3b300' },
        { t: 0.6, c: '#267326' }, { t: 0.8, c: '#264d73' }, { t: 1.0, c: '#4d264d' }
    ],
    'CET-CBC1 (Colorblind-Safe Blue-Orange)': [
        { t: 0.0, c: '#0072b2' }, { t: 0.5, c: '#f0e442' }, { t: 1.0, c: '#d55e00' }
    ],
    'CET-CBC2 (Colorblind-Safe Blue-Red)': [
        { t: 0.0, c: '#0072b2' }, { t: 0.5, c: '#f7f7f7' }, { t: 1.0, c: '#cc79a7' }
    ]
};

function getColormapColor(name, t) {
    const stops = ColormapRegistry[name] || ColormapRegistry['Viridis'];
    // Clamp t
    t = Math.max(0, Math.min(1, t));

    // Find stops
    for (let i = 0; i < stops.length - 1; i++) {
        if (t >= stops[i].t && t <= stops[i + 1].t) {
            const t0 = stops[i].t;
            const t1 = stops[i + 1].t;
            const localT = (t - t0) / (t1 - t0);
            const c1 = new THREE.Color(stops[i].c);
            const c2 = new THREE.Color(stops[i + 1].c);
            return c1.lerp(c2, localT);
        }
    }
    return new THREE.Color(stops[stops.length - 1].c);
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

/**
 * Parse a fault CSV that has columns: IL, XL, K, X, Y, Z
 * Returns an array of {il, xl, k, x, y, z} objects.
 */
function parseFaultCSV(text) {
    const lines = text.split('\n');
    const pts = [];
    // Detect whether K column exists by reading the header
    const header = lines[0].trim().toUpperCase().split(',');
    const hasK = header.length >= 6 && header[2] === 'K';

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const p = line.split(',');
        if (hasK && p.length < 6) continue;
        if (!hasK && p.length < 5) continue;

        const il = Math.round(parseFloat(p[0]));
        const xl = Math.round(parseFloat(p[1]));
        let k, x, y, z;
        if (hasK) {
            k  = Math.round(parseFloat(p[2]));
            x  = parseFloat(p[3]);
            y  = parseFloat(p[4]);
            z  = parseFloat(p[5]);
        } else {
            k  = 0;
            x  = parseFloat(p[2]);
            y  = parseFloat(p[3]);
            z  = parseFloat(p[4]);
        }
        if (isNaN(x) || isNaN(z)) continue;
        pts.push({ il, xl, k, x, y, z });
    }
    return pts;
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

/** Load a fault CSV (IL, XL, K, X, Y, Z) and return an array of point objects. */
async function loadFault(name, url, color) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const pts = parseFaultCSV(text);
        return { name, color, pts };
    } catch (e) {
        console.error(`Failed to load fault ${name}`, e);
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
    for (let i = 0; i < sampleSize; i++) {
        const pt = ref.data[keys[i]];
        sumX += pt.x;
        sumY += pt.y;
        count++;
    }
    const centerX = sumX / count;
    const centerY = sumY / count;
    console.log(`Center calculated: ${centerX}, ${centerY}`);

    // 2. Build Meshes (decimated — skip every DECIMATE-th IL/XL for performance)
    const VOLVE_DECIMATE = 2; // keep every 2nd IL/XL → 4× fewer vertices; set to 1 for full res
    validHorizons.forEach(h => {
        console.log(`Building mesh for ${h.name}...`);
        // Original grid dimensions
        const fullWidth  = h.maxIL - h.minIL + 1;
        const fullHeight = h.maxXL - h.minXL + 1;
        // Decimated grid
        const width  = Math.ceil(fullWidth  / VOLVE_DECIMATE);
        const height = Math.ceil(fullHeight / VOLVE_DECIMATE);

        console.log(`Grid size: ${fullWidth} x ${fullHeight} → decimated ${width} x ${height} (factor ${VOLVE_DECIMATE})`);

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
        const filled = new Uint8Array(width * height); // 1 = has data

        let validPoints = 0;
        for (let ix = 0; ix < width; ix++) {
            for (let iy = 0; iy < height; iy++) {
                const il = h.minIL + ix * VOLVE_DECIMATE;
                const xl = h.minXL + iy * VOLVE_DECIMATE;
                const pt = h.data[`${il}_${xl}`];
                const idx = iy * width + ix;
                if (pt) {
                    posAttr.setXYZ(idx, pt.x - centerX, -pt.z, -(pt.y - centerY));
                    filled[idx] = 1;
                    validPoints++;
                }
            }
        }

        // ── Pre-compute XZ grid positions from spatial gradients ──────────────
        // Compute average dX/dIL, dZ/dIL, dX/dXL, dZ/dXL from valid data
        let dxDil = 0, dzDil = 0, dxDxl = 0, dzDxl = 0;
        let cntIl = 0, cntXl = 0;
        for (let ix = 0; ix < width - 1; ix++) {
            for (let iy = 0; iy < height; iy++) {
                const i0 = iy * width + ix, i1 = iy * width + ix + 1;
                if (filled[i0] && filled[i1]) {
                    dxDil += posAttr.getX(i1) - posAttr.getX(i0);
                    dzDil += posAttr.getZ(i1) - posAttr.getZ(i0);
                    cntIl++;
                }
            }
        }
        for (let ix = 0; ix < width; ix++) {
            for (let iy = 0; iy < height - 1; iy++) {
                const i0 = iy * width + ix, i1 = (iy + 1) * width + ix;
                if (filled[i0] && filled[i1]) {
                    dxDxl += posAttr.getX(i1) - posAttr.getX(i0);
                    dzDxl += posAttr.getZ(i1) - posAttr.getZ(i0);
                    cntXl++;
                }
            }
        }
        if (cntIl > 0) { dxDil /= cntIl; dzDil /= cntIl; }
        if (cntXl > 0) { dxDxl /= cntXl; dzDxl /= cntXl; }

        // Find a reference valid point to anchor the grid
        let refIx = 0, refIy = 0, refX = 0, refZ = 0;
        for (let ix = 0; ix < width && !refX; ix++) {
            for (let iy = 0; iy < height; iy++) {
                const idx = iy * width + ix;
                if (filled[idx]) { refIx = ix; refIy = iy; refX = posAttr.getX(idx); refZ = posAttr.getZ(idx); break; }
            }
        }

        // Pre-fill XZ for ALL grid cells using the spatial gradient
        const gridX = new Float32Array(width * height);
        const gridZ = new Float32Array(width * height);
        for (let ix = 0; ix < width; ix++) {
            for (let iy = 0; iy < height; iy++) {
                const idx = iy * width + ix;
                gridX[idx] = refX + (ix - refIx) * dxDil + (iy - refIy) * dxDxl;
                gridZ[idx] = refZ + (ix - refIx) * dzDil + (iy - refIy) * dzDxl;
            }
        }

        // Set XZ for all unfilled vertices; keep original XZ for valid data
        for (let ix = 0; ix < width; ix++) {
            for (let iy = 0; iy < height; iy++) {
                const idx = iy * width + ix;
                if (!filled[idx]) {
                    posAttr.setXYZ(idx, gridX[idx], 0, gridZ[idx]);
                }
            }
        }

        // Fill only Y (depth) from neighbours
        const maxPasses = Math.max(width, height);
        for (let pass = 0; pass < maxPasses; pass++) {
            let anyFilled = false;
            for (let ix = 0; ix < width; ix++) {
                for (let iy = 0; iy < height; iy++) {
                    const idx = iy * width + ix;
                    if (filled[idx]) continue;
                    let sy = 0, cnt = 0;
                    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
                        const nx = ix + dx, ny = iy + dy;
                        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                        const ni = ny * width + nx;
                        if (!filled[ni]) continue;
                        sy += posAttr.getY(ni);
                        cnt++;
                    }
                    if (cnt > 0) {
                        posAttr.setY(idx, sy / cnt);
                        filled[idx] = 1;
                        anyFilled = true;
                    }
                }
            }
            if (!anyFilled) break;
        }
        // Safety: nearest-neighbor for any remaining
        for (let ix = 0; ix < width; ix++) {
            for (let iy = 0; iy < height; iy++) {
                const idx = iy * width + ix;
                if (filled[idx]) continue;
                for (let r = 1; r < Math.max(width, height); r++) {
                    let found = false;
                    for (let dx = -r; dx <= r && !found; dx++) {
                        for (let dy = -r; dy <= r && !found; dy++) {
                            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                            const nx = ix + dx, ny = iy + dy;
                            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                            const ni = ny * width + nx;
                            if (!filled[ni]) continue;
                            posAttr.setY(idx, posAttr.getY(ni));
                            filled[idx] = 1;
                            found = true;
                        }
                    }
                    if (found) break;
                }
            }
        }
        console.log(`Mesh built with ${validPoints} valid + ${width * height - validPoints} filled vertices`);

        geometry.computeVertexNormals();
        geometry.computeBoundingBox();

        const material = new THREE.MeshPhongMaterial({
            color: h.color,
            side: THREE.DoubleSide,
            wireframe: false,
            shininess: 40,
            depthWrite: true  // ensures horizon depth is written so regional contour is occluded
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.originalColor = h.color; // Save for toggling
        mesh.userData.layerName = h.name; // Store for layer controls
        mesh.userData.isHorizon = true;
        mesh.userData.centerX = centerX;
        mesh.userData.centerY = centerY;
        // Cache raw (unperturbed) vertex positions for the texture slider
        mesh.userData.rawHorizonPos = Float32Array.from(geometry.attributes.position.array);
        mesh.userData.survey = 'volve';
        volveSurveyGroup.add(mesh);


        // Create Contour Overlay
        const cMesh = new THREE.Mesh(geometry, contourMaterial.clone());
        cMesh.visible = false;
        cMesh.renderOrder = 1; // Force rendering after the terrain to fix transparency issues
        cMesh.userData.isContour = true;
        cMesh.userData.layerName = h.name; // Also tag contours so they hide with layer
        cMesh.userData.survey = 'volve';
        volveSurveyGroup.add(cMesh);
    });

    // Initialize Volve Layer Controls
    initLayerControls(validHorizons);

    console.log('Volve data loaded — overlaid on Norne regional context');
    // Apply depth colormap to Volve horizons
    updateColoring();
    hideLoading();
}

// ═══════════════════════════════════════════════════════════════
// WELL TRAJECTORIES & TARGETS
// Ported from seismic-viewer/src/wellPlan.ts — Lateral 1 + 2
// ═══════════════════════════════════════════════════════════════

const WELL_SURFACE_NORTHING = 12146030.14; // ft
const WELL_SURFACE_EASTING  = 2564557.08;  // ft
const FT_TO_M = 0.3048;

// Lateral 1 — kicks off south-west, turns due west
const LATERAL1_TURN_POINTS = [
    { sectionType: 'Tie Line',      md: 0.0,     inc: 0.00,  azi: 0.00,   tvd: 0.0,    northing: WELL_SURFACE_NORTHING, easting: WELL_SURFACE_EASTING, target: '' },
    { sectionType: 'Straight MD',   md: 2000.0,  inc: 0.00,  azi: 0.00,   tvd: 2000.0, northing: WELL_SURFACE_NORTHING, easting: WELL_SURFACE_EASTING, target: '' },
    { sectionType: 'OPT AL DLS',    md: 2885.2,  inc: 50.54, azi: 215.50, tvd: 2774.8, northing: 12145732.38, easting: 2564344.85, target: '' },
    { sectionType: 'Hold',          md: 3050.6,  inc: 50.54, azi: 215.50, tvd: 2879.8, northing: 12145628.47, easting: 2564270.52, target: '' },
    { sectionType: 'Build + Turn',  md: 3315.5,  inc: 78.51, azi: 270.00, tvd: 5000.0, northing: 12145538.01, easting: 2564064.95, target: 'LP1' },
    { sectionType: 'Lateral',       md: 13359.0, inc: 78.51, azi: 270.00, tvd: 5000.0, northing: 12145537.99, easting: 2554222.58, target: 'BHL' },
];

// Lateral 2 (Sidetrack) — branches from KOP at 2000 ft, builds S
const LATERAL2_TURN_POINTS = [
    { sectionType: 'KOP Junction',  md: 2000.0,  inc: 0.00,  azi: 175.00, tvd: 2000.0, northing: WELL_SURFACE_NORTHING, easting: WELL_SURFACE_EASTING, target: '' },
    { sectionType: 'OPT AL DLS',    md: 3050.0,  inc: 55.00, azi: 175.00, tvd: 2826.0, northing: 12145602.00, easting: 2564594.00, target: '' },
    { sectionType: 'Hold',          md: 3350.0,  inc: 55.00, azi: 175.00, tvd: 2998.0, northing: 12145357.00, easting: 2564615.00, target: '' },
    { sectionType: 'Build + Turn',  md: 3650.0,  inc: 82.00, azi: 230.00, tvd: 3105.0, northing: 12145139.00, easting: 2564512.00, target: 'LP2' },
    { sectionType: 'Lateral',       md: 10650.0, inc: 82.00, azi: 230.00, tvd: 4080.0, northing: 12140685.00, easting: 2559202.00, target: 'BHL2' },
];

// Lateral 3 — higher KOP (1200 ft), single dogleg to same LP1/BHL targets as Lateral 1
const LATERAL3_TURN_POINTS = [
    { sectionType: 'Tie Line',      md: 0.0,     inc: 0.00,  azi: 0.00,   tvd: 0.0,    northing: WELL_SURFACE_NORTHING, easting: WELL_SURFACE_EASTING, target: '' },
    { sectionType: 'Straight MD',   md: 1200.0,  inc: 0.00,  azi: 0.00,   tvd: 1200.0, northing: WELL_SURFACE_NORTHING, easting: WELL_SURFACE_EASTING, target: '' },
    { sectionType: 'Build + Turn',  md: 3315.5,  inc: 78.51, azi: 270.00, tvd: 5000.0, northing: 12145538.01, easting: 2564064.95, target: 'LP1' },
    { sectionType: 'Lateral',       md: 13359.0, inc: 78.51, azi: 270.00, tvd: 5000.0, northing: 12145537.99, easting: 2554222.58, target: 'BHL' },
];

// Lateral 4 — higher KOP (1200 ft), single dogleg to same LP2/BHL2 targets as Lateral 2
const LATERAL4_TURN_POINTS = [
    { sectionType: 'KOP Junction',  md: 1200.0,  inc: 0.00,  azi: 175.00, tvd: 1200.0, northing: WELL_SURFACE_NORTHING, easting: WELL_SURFACE_EASTING, target: '' },
    { sectionType: 'Build + Turn',  md: 3650.0,  inc: 82.00, azi: 230.00, tvd: 3105.0, northing: 12145139.00, easting: 2564512.00, target: 'LP2' },
    { sectionType: 'Lateral',       md: 10650.0, inc: 82.00, azi: 230.00, tvd: 4080.0, northing: 12140685.00, easting: 2559202.00, target: 'BHL2' },
];

const WELL_TARGETS = [
    { name: 'LP1',  wellbore: 'Lateral 1', tpIndexParam: 'lat1LP1Position' },
    { name: 'BHL',  wellbore: 'Lateral 1', tpIndex: 5 },
    { name: 'LP2',  wellbore: 'Lateral 2', tpIndex: 4 },
];

const WELL_DEFS = [
    { name: 'Lateral 1', turnPoints: LATERAL1_TURN_POINTS, colorParam: 'lat1Color', visParam: 'showLateral1', targetVisParam: 'showLat1Targets' },
    { name: 'Lateral 2', turnPoints: LATERAL2_TURN_POINTS, colorParam: 'lat2Color', visParam: 'showLateral2', targetVisParam: 'showLat2Targets' },
    { name: 'Lateral 3', turnPoints: LATERAL3_TURN_POINTS, colorParam: 'lat3Color', visParam: 'showLateral3', targetVisParam: 'showLat3Targets' },
    { name: 'Lateral 4', turnPoints: LATERAL4_TURN_POINTS, colorParam: 'lat4Color', visParam: 'showLateral4', targetVisParam: 'showLat4Targets' },
];

// ── Minimum Curvature Interpolation ────────────────────────────
const DEG2RAD = Math.PI / 180;
const WELL_INTERP_STEPS = 20;

function lerpAngle(a1, a2, t) {
    let diff = a2 - a1;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    let result = a1 + diff * t;
    if (result < 0) result += 360;
    if (result >= 360) result -= 360;
    return result;
}

function minimumCurvature(turnPoints) {
    const stations = [];
    stations.push({ ...turnPoints[0] });

    for (let i = 0; i < turnPoints.length - 1; i++) {
        const p1 = turnPoints[i];
        const p2 = turnPoints[i + 1];
        for (let j = 1; j <= WELL_INTERP_STEPS; j++) {
            const frac = j / WELL_INTERP_STEPS;
            const md = p1.md + (p2.md - p1.md) * frac;
            const inc = p1.inc + (p2.inc - p1.inc) * frac;
            const azi = lerpAngle(p1.azi, p2.azi, frac);

            const prev = stations[stations.length - 1];
            const deltaMD = md - prev.md;

            const i1 = prev.inc * DEG2RAD, a1 = prev.azi * DEG2RAD;
            const i2 = inc * DEG2RAD,      a2 = azi * DEG2RAD;

            const cosDL = Math.cos(i2 - i1) - Math.sin(i1) * Math.sin(i2) * (1 - Math.cos(a2 - a1));
            const dl = Math.acos(Math.min(1, Math.max(-1, cosDL)));
            const rf = dl < 1e-7 ? 1.0 : (2 / dl) * Math.tan(dl / 2);

            const dN   = (deltaMD / 2) * (Math.sin(i1) * Math.cos(a1) + Math.sin(i2) * Math.cos(a2)) * rf;
            const dE   = (deltaMD / 2) * (Math.sin(i1) * Math.sin(a1) + Math.sin(i2) * Math.sin(a2)) * rf;
            const dTVD = (deltaMD / 2) * (Math.cos(i1) + Math.cos(i2)) * rf;

            stations.push({
                md, inc, azi,
                tvd:      prev.tvd + dTVD,
                northing: prev.northing + dN,
                easting:  prev.easting + dE,
                sectionType: j === WELL_INTERP_STEPS ? p2.sectionType : p1.sectionType,
                target:      j === WELL_INTERP_STEPS ? p2.target : '',
            });
        }
    }
    return stations;
}

// Convert well coordinates (ft, absolute) → scene metres (relative to well surface)
function wellToWorld(northing, easting, tvd) {
    return new THREE.Vector3(
        (easting - WELL_SURFACE_EASTING) * FT_TO_M,   // +X = East
        -tvd * FT_TO_M,                                 // -Y = depth
        -(northing - WELL_SURFACE_NORTHING) * FT_TO_M, // -Z = North
    );
}

// Pre-compute stations
const wellStations = new Map();
for (const wb of WELL_DEFS) {
    wellStations.set(wb.name, minimumCurvature(wb.turnPoints));
}

// Smoothly correct Lat 3/4 build sections to meet Lat 1/2 target positions.
// Instead of a hard snap (which creates a kink), we linearly ramp the
// positional correction from KOP (0%) to the target turn point (100%),
// then apply 100% for the entire lateral section.
function blendLateralToReference(lateralName, refName, targetTPLabel) {
    const stns = wellStations.get(lateralName);
    const refStns = wellStations.get(refName);
    if (!stns || !refStns) return;

    const srcDef = WELL_DEFS.find(w => w.name === lateralName);
    const refDef = WELL_DEFS.find(w => w.name === refName);
    const srcTPIdx = srcDef.turnPoints.findIndex(tp => tp.target === targetTPLabel);
    const refTPIdx = refDef.turnPoints.findIndex(tp => tp.target === targetTPLabel);
    if (srcTPIdx < 0 || refTPIdx < 0) return;

    const tgtStIdx = Math.min(srcTPIdx * WELL_INTERP_STEPS, stns.length - 1);
    const refStIdx = Math.min(refTPIdx * WELL_INTERP_STEPS, refStns.length - 1);

    // Compute the delta at the target station
    const dN = refStns[refStIdx].northing - stns[tgtStIdx].northing;
    const dE = refStns[refStIdx].easting  - stns[tgtStIdx].easting;
    const dT = refStns[refStIdx].tvd      - stns[tgtStIdx].tvd;

    // Find KOP station (start of build — first station after vertical)
    // For Lat 3, KOP is turn point 1 (end of straight section); for Lat 4, it's turn point 0
    const kopTPIdx = srcDef.turnPoints.findIndex(tp =>
        tp.sectionType === 'Straight MD' || tp.sectionType === 'KOP Junction');
    const kopStIdx = Math.max(0, kopTPIdx * WELL_INTERP_STEPS);

    // Blend: 0% at KOP, 100% at target, 100% beyond
    for (let i = kopStIdx; i < stns.length; i++) {
        let t;
        if (i >= tgtStIdx) {
            t = 1.0; // full correction from target onward
        } else {
            t = (i - kopStIdx) / (tgtStIdx - kopStIdx); // linear ramp
            t = t * t * (3 - 2 * t); // smoothstep for even smoother curve
        }
        stns[i].northing += dN * t;
        stns[i].easting  += dE * t;
        stns[i].tvd      += dT * t;
    }
}
blendLateralToReference('Lateral 3', 'Lateral 1', 'LP1');
blendLateralToReference('Lateral 4', 'Lateral 2', 'LP2');

// ── Build Well Trajectories ────────────────────────────────────
function buildWellTrajectories() {
    // Clear existing
    while (wellGroup.children.length > 0) {
        const c = wellGroup.children[0];
        wellGroup.remove(c);
        c.geometry?.dispose();
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
        else c.material?.dispose();
    }

    for (const wb of WELL_DEFS) {
        if (!params[wb.visParam]) continue;
        const stations = wellStations.get(wb.name);
        if (!stations || stations.length < 2) continue;

        const baseColor = new THREE.Color(params[wb.colorParam]);

        // Collect all world-space points for this wellbore (needed for dots mode)
        const allPts = [];
        for (let tpIdx = 0; tpIdx < wb.turnPoints.length - 1; tpIdx++) {
            const startSt = tpIdx * WELL_INTERP_STEPS;
            const endSt   = Math.min((tpIdx + 1) * WELL_INTERP_STEPS, stations.length - 1);

            const pts = [];
            for (let i = startSt; i <= endSt; i++) {
                const s = stations[i];
                pts.push(wellToWorld(s.northing, s.easting, s.tvd));
            }
            if (pts.length < 2) continue;

            // Rotate Lateral 2/4 around its KOP junction
            if ((wb.name === 'Lateral 2' || wb.name === 'Lateral 4') && params.lat2RotationDeg !== 0) {
                const kopWorld = wellToWorld(LATERAL2_TURN_POINTS[0].northing, LATERAL2_TURN_POINTS[0].easting, LATERAL2_TURN_POINTS[0].tvd);
                const angle = -params.lat2RotationDeg * Math.PI / 180;
                const cosA = Math.cos(angle), sinA = Math.sin(angle);
                for (const p of pts) {
                    const dx = p.x - kopWorld.x, dz = p.z - kopWorld.z;
                    p.x = kopWorld.x + dx * cosA - dz * sinA;
                    p.z = kopWorld.z + dx * sinA + dz * cosA;
                }
            }

            if (params.wellPathStyle === 'tube') {
                const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
                const tubeGeo = new THREE.TubeGeometry(curve, Math.max(pts.length * 3, 16), params.wellTubeRadius, 8, false);
                const tubeMat = new THREE.MeshPhongMaterial({
                    color: baseColor,
                    emissive: baseColor.clone().multiplyScalar(0.15),
                    shininess: 60,
                });
                const tube = new THREE.Mesh(tubeGeo, tubeMat);
                tube.userData = { isWell: true, wellbore: wb.name };
                wellGroup.add(tube);
            }

            // Accumulate points for whole-well dots curve (skip duplicates at segment boundaries)
            for (let i = (tpIdx === 0 ? 0 : 1); i < pts.length; i++) {
                allPts.push(pts[i]);
            }
        }

        // Dots mode: single curve across the whole well, evenly spaced dots
        if (params.wellPathStyle === 'dots' && allPts.length >= 2) {
            const curve = new THREE.CatmullRomCurve3(allPts, false, 'catmullrom', 0.5);
            const totalLength = curve.getLength();
            const spacing = params.wellDotSpacing;
            const dotCount = Math.max(2, Math.floor(totalLength / spacing));
            const dotGeo = new THREE.SphereGeometry(params.wellDotSize, 8, 8);
            const dotMat = new THREE.MeshPhongMaterial({
                color: baseColor,
                emissive: baseColor.clone().multiplyScalar(0.15),
                shininess: 60,
            });
            const instanced = new THREE.InstancedMesh(dotGeo, dotMat, dotCount);
            const dummy = new THREE.Object3D();
            for (let d = 0; d < dotCount; d++) {
                const p = curve.getPointAt(d / (dotCount - 1));
                dummy.position.copy(p);
                dummy.updateMatrix();
                instanced.setMatrixAt(d, dummy.matrix);
            }
            instanced.instanceMatrix.needsUpdate = true;
            instanced.userData = { isWell: true, wellbore: wb.name };
            wellGroup.add(instanced);
        }

        // Wellhead sphere
        const s0 = stations[0];
        if (s0.tvd === 0) {
            const headPos = wellToWorld(s0.northing, s0.easting, s0.tvd);
            const headGeo = new THREE.SphereGeometry(params.wellTubeRadius * 3, 16, 16);
            const headMat = new THREE.MeshPhongMaterial({
                color: baseColor,
                emissive: baseColor.clone().multiplyScalar(0.3),
            });
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.copy(headPos);
            head.scale.y = 1 / (params.zScale || 1);
            head.userData = { isWell: true, wellbore: wb.name };
            wellGroup.add(head);
        }

        // Turn point markers — skip in dots mode
        if (params.wellPathStyle !== 'dots') {
        for (let tpIdx = 0; tpIdx < wb.turnPoints.length; tpIdx++) {
            const stationIdx = Math.min(tpIdx * WELL_INTERP_STEPS, stations.length - 1);
            const s = stations[stationIdx];
            const tpPos = wellToWorld(s.northing, s.easting, s.tvd);

            // Rotate Lateral 2/4 turn point markers around KOP
            if ((wb.name === 'Lateral 2' || wb.name === 'Lateral 4') && params.lat2RotationDeg !== 0) {
                const kopWorld = wellToWorld(LATERAL2_TURN_POINTS[0].northing, LATERAL2_TURN_POINTS[0].easting, LATERAL2_TURN_POINTS[0].tvd);
                const angle = -params.lat2RotationDeg * Math.PI / 180;
                const cosA = Math.cos(angle), sinA = Math.sin(angle);
                const dx = tpPos.x - kopWorld.x, dz = tpPos.z - kopWorld.z;
                tpPos.x = kopWorld.x + dx * cosA - dz * sinA;
                tpPos.z = kopWorld.z + dx * sinA + dz * cosA;
            }

            const markerGeo = new THREE.SphereGeometry(params.wellTubeRadius * 2, 12, 12);
            const markerMat = new THREE.MeshPhongMaterial({
                color: baseColor,
                emissive: baseColor.clone().multiplyScalar(0.25),
            });
            const marker = new THREE.Mesh(markerGeo, markerMat);
            marker.position.copy(tpPos);
            marker.scale.y = 1 / (params.zScale || 1);
            marker.userData = { isWell: true, wellbore: wb.name, isTurnPoint: true, tpIdx };
            wellGroup.add(marker);
        }
        } // end if not dots
        // TD sphere
        const td = stations[stations.length - 1];
        const tdPos = wellToWorld(td.northing, td.easting, td.tvd);
        // Rotate Lateral 2 TD around KOP
        if ((wb.name === 'Lateral 2' || wb.name === 'Lateral 4') && params.lat2RotationDeg !== 0) {
            const kopWorld = wellToWorld(LATERAL2_TURN_POINTS[0].northing, LATERAL2_TURN_POINTS[0].easting, LATERAL2_TURN_POINTS[0].tvd);
            const angle = -params.lat2RotationDeg * Math.PI / 180;
            const cosA = Math.cos(angle), sinA = Math.sin(angle);
            const dx = tdPos.x - kopWorld.x, dz = tdPos.z - kopWorld.z;
            tdPos.x = kopWorld.x + dx * cosA - dz * sinA;
            tdPos.z = kopWorld.z + dx * sinA + dz * cosA;
        }
        const tdGeo = new THREE.SphereGeometry(params.wellTubeRadius * 2.5, 12, 12);
        const tdMat = new THREE.MeshPhongMaterial({
            color: baseColor,
            emissive: baseColor.clone().multiplyScalar(0.2),
        });
        const tdMesh = new THREE.Mesh(tdGeo, tdMat);
        tdMesh.position.copy(tdPos);
        tdMesh.scale.y = 1 / (params.zScale || 1);
        tdMesh.userData = { isWell: true, wellbore: wb.name };
        wellGroup.add(tdMesh);
    }

    // Target orbs — rendered independently of well tube visibility
    if (params.wellShowTargets) {
        const tColor = new THREE.Color(params.wellTargetColor);
        const ringTubeRadius = Math.max(0.5, params.wellTargetSize * 0.02); // thin ring tube
        for (const tgt of WELL_TARGETS) {
            const wb = WELL_DEFS.find(w => w.name === tgt.wellbore);
            if (!wb) continue;
            // Per-lateral target visibility
            if (wb.targetVisParam && !params[wb.targetVisParam]) continue;
            // Need stations even if the well tube is hidden — compute if missing
            if (!wellStations.has(wb.name)) {
                const stns = minimumCurvature(wb.turnPoints, WELL_INTERP_STEPS);
                wellStations.set(wb.name, stns);
            }

            const stns = wellStations.get(wb.name);
            const tpIdx = tgt.tpIndexParam ? params[tgt.tpIndexParam] : tgt.tpIndex;
            const stIdx = Math.min(Math.round(tpIdx * WELL_INTERP_STEPS), stns.length - 1);
            const s = stns[stIdx];
            const pos = wellToWorld(s.northing, s.easting, s.tvd);

            // Rotate Lateral 2/4 targets around KOP
            if ((tgt.wellbore === 'Lateral 2' || tgt.wellbore === 'Lateral 4') && params.lat2RotationDeg !== 0) {
                const kopWorld = wellToWorld(LATERAL2_TURN_POINTS[0].northing, LATERAL2_TURN_POINTS[0].easting, LATERAL2_TURN_POINTS[0].tvd);
                const angle = -params.lat2RotationDeg * Math.PI / 180;
                const cosA = Math.cos(angle), sinA = Math.sin(angle);
                const dx = pos.x - kopWorld.x, dz = pos.z - kopWorld.z;
                pos.x = kopWorld.x + dx * cosA - dz * sinA;
                pos.z = kopWorld.z + dx * sinA + dz * cosA;
            }

            const orbGeo = new THREE.SphereGeometry(params.wellTargetSize, 16, 16);
            const orbMat = new THREE.MeshPhongMaterial({
                color: tColor,
                emissive: tColor.clone().multiplyScalar(0.15),
                transparent: true,
                opacity: params.wellTargetOpacity,
                depthWrite: false,
                depthTest: false,
                side: THREE.DoubleSide,
                shininess: 80,
            });
            const orb = new THREE.Mesh(orbGeo, orbMat);
            orb.position.copy(pos);
            orb.scale.y = 1 / (params.zScale || 1);
            orb.name = `target-${tgt.name}`;
            orb.userData = { isWell: true, isTarget: true };
            wellGroup.add(orb);

            // ── Horizontal ring (lies flat in XZ plane) ──────────────────────
            const hRingGeo = new THREE.TorusGeometry(params.wellTargetSize * 1.625, ringTubeRadius, 12, 48);
            const ringMat = new THREE.MeshPhongMaterial({
                color: tColor,
                emissive: tColor.clone().multiplyScalar(0.15),
                transparent: true,
                opacity: Math.min(1, params.wellTargetOpacity * 1.5),
                depthWrite: false,
                depthTest: false,
                side: THREE.DoubleSide,
            });
            const hRing = new THREE.Mesh(hRingGeo, ringMat);
            hRing.position.copy(pos);
            hRing.scale.y = 1 / (params.zScale || 1);
            hRing.userData = { isWell: true, isTarget: true };
            wellGroup.add(hRing);
        }
    }
}

// Add Custom UI Styles and HTML
const uiStyles = document.createElement('style');
uiStyles.textContent = `
    .preset-bar {
        position: fixed;
        bottom: 20px;
        left: 20px;
        z-index: 100;
        display: flex;
        gap: 8px;
        align-items: center;
        color: #eee;
        font-family: sans-serif;
        font-size: 13px;
        background: rgba(0, 0, 0, 0.6);
        padding: 8px 14px;
        border-radius: 8px;
        backdrop-filter: blur(5px);
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
    <div class="preset-bar" id="presetBar">
        <span>Preset:</span>
        <select id="presetSelect" class="preset-select"></select>
        <button id="btnSave" class="icon-btn" title="Save New Preset">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
        </button>
        <button id="btnUpdate" class="icon-btn" title="Update Current Preset">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
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

// ── Title click → hide all UI for clean screenshots ─────────────────────────
// Click the title to enter screenshot mode (all UI hidden).
// Click anywhere on the canvas to exit screenshot mode and restore UI.
let _uiHidden = false;

function hideAllUI() {
    _uiHidden = true;
    const guiEl   = document.querySelector('.lil-gui.root');
    const preBar  = document.getElementById('presetBar');
    const compass = document.getElementById('compass-hud');
    const loading = document.getElementById('loading');
    const title   = document.querySelector('#ui-container h1');
    if (guiEl)   guiEl.style.display   = 'none';
    if (preBar)  preBar.style.display  = 'none';
    if (compass) compass.style.display = 'none';
    if (loading) loading.style.display = 'none';
    if (title)   title.style.display   = 'none';

    // One-shot click listener on the canvas to restore UI
    const canvas = document.querySelector('#canvas-container canvas') || document.getElementById('canvas-container');
    canvas.addEventListener('click', showAllUI, { once: true });
}

function showAllUI() {
    _uiHidden = false;
    const guiEl   = document.querySelector('.lil-gui.root');
    const preBar  = document.getElementById('presetBar');
    const compass = document.getElementById('compass-hud');
    const loading = document.getElementById('loading');
    const title   = document.querySelector('#ui-container h1');
    if (guiEl)   guiEl.style.display   = '';
    if (preBar)  preBar.style.display  = '';
    if (compass) compass.style.display = '';
    if (loading) loading.style.display = '';
    if (title)   title.style.display   = '';
}

document.querySelector('#ui-container h1').addEventListener('click', hideAllUI);

// ... Rest of script ...
const PARAMS_STORAGE_KEY = 'geo_viewer_params';
const PANEL_STATE_KEY   = 'geo_viewer_panel_state';

// ── Panel open/close persistence ─────────────────────────────────────────────
// Call after each addFolder() to (a) restore its prior open/closed state from
// localStorage and (b) save any future toggle back to localStorage.
function _trackFolder(folder, name) {
    try {
        const saved = JSON.parse(localStorage.getItem(PANEL_STATE_KEY) || '{}');
        if (saved[name] === false) folder.close();
        else if (saved[name] === true) folder.open();
    } catch(e) {}
    folder.$title.addEventListener('click', () => {
        // lil-gui toggles _closed synchronously before this fires, so read
        // the current state after a microtask tick.
        setTimeout(() => {
            try {
                const state = JSON.parse(localStorage.getItem(PANEL_STATE_KEY) || '{}');
                state[name] = !folder._closed;
                localStorage.setItem(PANEL_STATE_KEY, JSON.stringify(state));
            } catch(e) {}
        }, 0);
    });
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  DEVELOPER RULE — ADDING A NEW CONTROL PANEL PARAMETER                  ║
// ║                                                                          ║
// ║  ① Add it to _paramsDefaults below with a sensible starting value.       ║
// ║     The params Proxy will auto-save every write to localStorage.         ║
// ║                                                                          ║
// ║  ② Add a matching GUI control (gui.add / addColor / addFolder etc.)      ║
// ║     so the restored value is VISIBLE and EDITABLE after a browser        ║
// ║     refresh. Skipping ② means the value silently retains its last-saved  ║
// ║     value with no way for the user to see or change it.                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const _paramsDefaults = {
    wireframe: false,
    flatShading: false,
    colorByDepth: true,
    depthColorPerLayer: false,      // true = each horizon uses its own min/max depth
    faultSmoothIterations: 3,
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
    lightingEnabled: true,

    faultColorMode: 'original',// 'original' | 'uniform' | 'warm' | 'cool' | 'earth' | 'mono'
    faultSingleColor: '#aaaaaa',
    regionalVisible: true,     // master visibility toggle for the regional mesh
    regionalOpacity: 0.22,    // ghost opacity for the regional Åre surface
    regionalWireframe: false,  // wireframe overlay for regional surface
    regionalFitToBase: true,   // true = conform to Norne Base survey; false = smooth polynomial prior
    regionalBlendKm: 50,       // km beyond survey edge over which to blend conform→poly
    regionalTopologyFalloff: true, // enable/disable topology falloff on prior surface
    regionalFitBlendKm: 5,     // km beyond mesh edge for fit-mode transition to prior
    regionalShowContours: false,
    regionalContourInterval: 50,
    regionalContourThickness: 1.2,
    regionalContourOpacity: 0.4,
    regionalContourColor: '#7799BB',  // matches regional mesh body color
    regionalContourSmooth: 0,         // Laplacian smoothing iterations (0 = off)
    // ── Horizon footprint bounding boxes ─────────────────────────────────────
    norneBBoxVisible: false,            // show Norne horizon footprint box
    volveBBoxVisible: false,            // show Volve horizon footprint box
    horizonBBoxColor: '#ffffff',       // wireframe colour
    // ── Per-horizon depth exaggeration ───────────────────────────────────────
    horizonDepthExag: 1.0,             // 1 = true scale; >1 spreads layers apart
    // Seismic crossline panel
    seismicPanelVisible: true,         // toggle the crossline plane
    seismicPanelOpacity: 0.9,          // 0 = transparent, 1 = fully opaque
    // ── Survey position offset ───────────────────────────────────────────────
    surveyOffsetEastKm: 0,             // Norne: km east (positive) or west (negative)
    surveyOffsetNorthKm: 0,            // Norne: km north (positive) or south (negative)
    surveyRotationDeg: 0,              // Norne: degrees clockwise rotation
    norneDepthOffsetM: 0,              // Norne: vertical depth offset in metres (+ = deeper)
    volveOffsetEastKm: 0,              // Volve: km east (positive) or west (negative)
    volveOffsetNorthKm: 0,             // Volve: km north (positive) or south (negative)
    volveRotationDeg: 0,               // Volve: degrees clockwise rotation
    volveDepthOffsetM: 0,              // Volve: vertical depth offset in metres (+ = deeper)
    norneScale: 1.0,                   // Norne: uniform XZ scale factor
    volveScale: 1.0,                   // Volve: uniform XZ scale factor
    regionalFitToVolve: false,         // fit to Hugin Fm Base (Volve)
    // ── Well Trajectories ────────────────────────────────────────────────────
    showLateral1: true,
    showLateral2: true,
    showLateral3: true,
    showLateral4: true,
    lat1Color: '#7495d8',
    lat2Color: '#d87474',
    lat3Color: '#74d8c4',
    lat4Color: '#d8b774',
    wellTubeRadius: 8,                 // metres (scene units)
    wellPathStyle: 'tube',             // 'tube' or 'dots'
    wellDotSize: 5,                    // dot radius in metres
    wellDotSpacing: 20,                // metres between dots
    wellShowTargets: true,
    showLat1Targets: true,
    showLat2Targets: true,
    wellTargetColor: '#3ad994',
    wellTargetSize: 50,                // metres (scene units)
    wellTargetOpacity: 0.25,
    wellOffsetEastKm: 0,
    wellOffsetNorthKm: 0,
    wellRotationDeg: 0,
    wellScale: 1.0,
    wellDepthOffsetM: 0,
    lat2RotationDeg: 0,                // Lateral 2 rotation around its KOP (°)
    lat1LP1Position: 4.5,              // LP1 target position along Lateral 1 (turn point index)

};

// Merge any previously saved values over the defaults
try {
    const stored = JSON.parse(localStorage.getItem(PARAMS_STORAGE_KEY) || '{}');
    Object.assign(_paramsDefaults, stored);
} catch(e) { /* corrupt storage — use defaults */ }

// Proxy: auto-save to localStorage on every property write so every GUI change is persisted
const params = new Proxy(_paramsDefaults, {
    set(target, key, value) {
        target[key] = value;
        try { localStorage.setItem(PARAMS_STORAGE_KEY, JSON.stringify(target)); } catch(e) {}
        return true;
    }
});


// Global Layer State for Presets
const layerState = {};

// Preset Storage
let savedPresets = {
    'Default': null // Will be captured on init
};

// ── Top-level panel sections for horizons and faults ─────────────────────────
let horizonFolder = gui.addFolder('Horizons');
_trackFolder(horizonFolder, 'Horizons');
addHorizonPanelControls();

let faultFolder = gui.addFolder('Faults');
_trackFolder(faultFolder, 'Faults');
faultFolder.close();


let horizonBBox   = null;  // Norne: THREE.LineSegments auto-fitted to horizon footprint
let volveBBox     = null;  // Volve: THREE.LineSegments
let seismicPanel  = null;  // THREE.Mesh textured seismic crossline plane
let _obbState     = null;  // cached OBB geometry params shared by bbox + seismic panel

// Generic: build an OBB fitted to a single survey group's horizons
function buildSurveyBBox(surveyGroup) {
    const xzPts = [];
    let minY = Infinity, maxY = -Infinity;
    surveyGroup.children.forEach(m => {
        if (!m.userData.isHorizon || m.userData.isContour) return;
        if (!(m instanceof THREE.Mesh)) return;
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 4) {
            const y = pos.getY(i);
            if (y === 0) continue;
            xzPts.push({ x: pos.getX(i), z: pos.getZ(i) });
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    });
    if (xzPts.length < 3 || !isFinite(minY) || !isFinite(maxY)) return null;

    const cx = xzPts.reduce((s, p) => s + p.x, 0) / xzPts.length;
    const cz = xzPts.reduce((s, p) => s + p.z, 0) / xzPts.length;
    let Cxx = 0, Cxz = 0, Czz = 0;
    for (const p of xzPts) {
        const dx = p.x - cx, dz = p.z - cz;
        Cxx += dx * dx; Cxz += dx * dz; Czz += dz * dz;
    }
    Cxx /= xzPts.length; Cxz /= xzPts.length; Czz /= xzPts.length;
    const trace = Cxx + Czz, det = Cxx * Czz - Cxz * Cxz;
    const disc = Math.sqrt(Math.max(0, (trace * 0.5) ** 2 - det));
    const lam1 = trace * 0.5 + disc;
    let ax, az;
    if (Math.abs(Cxz) > 1e-10) { ax = lam1 - Czz; az = Cxz; }
    else { ax = Cxx >= Czz ? 1 : 0; az = Cxx >= Czz ? 0 : 1; }
    const len = Math.sqrt(ax * ax + az * az);
    ax /= len; az /= len;
    const bx = -az, bz = ax;

    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (const p of xzPts) {
        const dx = p.x - cx, dz = p.z - cz;
        const pA = dx * ax + dz * az, pB = dx * bx + dz * bz;
        if (pA < minA) minA = pA; if (pA > maxA) maxA = pA;
        if (pB < minB) minB = pB; if (pB > maxB) maxB = pB;
    }

    const widthA = maxA - minA, widthB = maxB - minB;
    const oCtrA = (minA + maxA) * 0.5, oCtrB = (minB + maxB) * 0.5;
    const oCtrX = cx + oCtrA * ax + oCtrB * bx;
    const oCtrZ = cz + oCtrA * az + oCtrB * bz;
    const stackH = maxY - minY;
    const bottom = minY - stackH * 0.08;
    const boxHeight = maxY - bottom;
    const oCtrY = (maxY + bottom) * 0.5;

    const bGeo = new THREE.BoxGeometry(widthA, boxHeight, widthB);
    const edges = new THREE.EdgesGeometry(bGeo);
    bGeo.dispose();
    const dashMat = new THREE.LineDashedMaterial({
        color: new THREE.Color(params.horizonBBoxColor),
        dashSize: Math.max(25, stackH * 0.025),
        gapSize: Math.max(50, stackH * 0.06),
    });
    const bbox = new THREE.LineSegments(edges, dashMat);
    bbox.computeLineDistances();
    bbox.position.set(oCtrX, oCtrY, oCtrZ);
    bbox.rotation.y = Math.atan2(-az, ax);
    bbox.userData.isHorizonBBox = true;
    surveyGroup.add(bbox);
    return { bbox, oCtrX, oCtrY, oCtrZ, rotY: Math.atan2(-az, ax), widthA, widthB, boxHeight };
}

function buildHorizonBBox() {
    // Norne bbox
    if (horizonBBox) {
        norneSurveyGroup.remove(horizonBBox);
        horizonBBox.geometry.dispose();
        horizonBBox.material.dispose();
        horizonBBox = null;
    }
    const norneResult = buildSurveyBBox(norneSurveyGroup);
    if (norneResult) {
        horizonBBox = norneResult.bbox;
        horizonBBox.visible = params.norneBBoxVisible;
        _obbState = norneResult;
        buildSeismicPanel();
    }

    // Volve bbox
    if (volveBBox) {
        volveSurveyGroup.remove(volveBBox);
        volveBBox.geometry.dispose();
        volveBBox.material.dispose();
        volveBBox = null;
    }
    const volveResult = buildSurveyBBox(volveSurveyGroup);
    if (volveResult) {
        volveBBox = volveResult.bbox;
        volveBBox.visible = params.volveBBoxVisible;
    }
}

// ── Seismic crossline panel ───────────────────────────────────────────────────
// Vertical plane spanning the full length × height of the OBB, textured with
// the user-provided seismic section image. Shares the OBB rotation.
const _seismicTexture = new THREE.TextureLoader().load('seismic_crossline.jpg');
function buildSeismicPanel() {
    if (seismicPanel) {
        norneSurveyGroup.remove(seismicPanel);
        seismicPanel.geometry.dispose();
        seismicPanel.material.dispose();
        seismicPanel = null;
    }
    if (!_obbState) return;

    const { oCtrX, oCtrY, oCtrZ, rotY, widthB, boxHeight } = _obbState;

    const geo = new THREE.PlaneGeometry(widthB, boxHeight); // crossline = short axis
    const mat = new THREE.MeshBasicMaterial({
        map:         _seismicTexture,
        side:        THREE.DoubleSide,
        transparent: true,
        opacity:     params.seismicPanelOpacity,
        depthWrite:  true,   // write depth so panel occludes topology lines behind it
    });
    seismicPanel = new THREE.Mesh(geo, mat);
    seismicPanel.position.set(oCtrX, oCtrY, oCtrZ);
    seismicPanel.rotation.y = rotY + Math.PI / 2; // perpendicular to long axis = crossline
    seismicPanel.visible = params.seismicPanelVisible;
    seismicPanel.userData.isSeismicPanel = true;
    norneSurveyGroup.add(seismicPanel);
}


// ── Per-horizon depth exaggeration ──────────────────────────────────────────
// Spreads horizon layers apart on the Y axis, anchored to the deepest layer
// so the regional context surface (which sits below all horizons) is unaffected.
// Stores a per-mesh Y shift in mesh.userData.exagShift; applyHorizonPositions
// uses that shift as the base offset before adding any noise.
function applyHorizonDepthExag(exag) {
    // Step 1: compute mean raw Y for every horizon mesh
    const meshInfos = [];
    allSurveyChildren().forEach(mesh => {
        if (!mesh.userData.isHorizon || !mesh.userData.rawHorizonPos || mesh.userData.isContour) return;
        if (!(mesh instanceof THREE.Mesh)) return;
        const raw = mesh.userData.rawHorizonPos;
        let sumY = 0, count = 0;
        for (let i = 1; i < raw.length; i += 3) { sumY += raw[i]; count++; }
        meshInfos.push({ mesh, meanY: count > 0 ? sumY / count : 0 });
    });
    if (meshInfos.length === 0) return;

    // Step 2: anchor on the deepest (most-negative Y) horizon
    const bottomMeanY = Math.min(...meshInfos.map(m => m.meanY));

    // Step 3: store the exaggeration shift on each mesh
    meshInfos.forEach(({ mesh, meanY }) => {
        // shift = extra Y offset added on top of raw positions (0 at bottom layer)
        mesh.userData.exagShift = (meanY - bottomMeanY) * (exag - 1.0);
    });

    // Step 4: re-apply raw positions with exag shift and recolor
    applyHorizonPositions();
    updateColoring();

    // Step 5: rebuild bbox so it reflects new extents
    buildHorizonBBox();
}

// Helper to add Horizons panel controls for bbox and depth exaggeration.
// Called once at startup and again in clearScene whenever horizonFolder is recreated.
function addHorizonPanelControls() {
    const depthExagFolder = horizonFolder.addFolder('Depth & Display');
    _trackFolder(depthExagFolder, 'Depth & Display');
    depthExagFolder.add(params, 'horizonDepthExag', 1.0, 5.0, 0.05)
        .name('Layer Spread (×)')
        .onChange(v => applyHorizonDepthExag(v));
    depthExagFolder.add(params, 'norneBBoxVisible').name('Norne Footprint Box')
        .onChange(v => { if (horizonBBox) horizonBBox.visible = v; });
    depthExagFolder.add(params, 'volveBBoxVisible').name('Volve Footprint Box')
        .onChange(v => { if (volveBBox) volveBBox.visible = v; });
    depthExagFolder.addColor(params, 'horizonBBoxColor').name('Box Color')
        .onChange(v => { if (horizonBBox) horizonBBox.material.color.set(v); if (volveBBox) volveBBox.material.color.set(v); });
    // Seismic crossline panel controls
    depthExagFolder.add(params, 'seismicPanelVisible').name('Crossline Panel')
        .onChange(v => { if (seismicPanel) seismicPanel.visible = v; });
    depthExagFolder.add(params, 'seismicPanelOpacity', 0.0, 1.0, 0.01).name('Panel Opacity')
        .onChange(v => { if (seismicPanel) { seismicPanel.material.opacity = v; seismicPanel.material.needsUpdate = true; } });
}


// Reset horizon mesh vertex positions to raw + depth exaggeration shift.
function applyHorizonPositions() {
    allSurveyChildren().forEach(mesh => {
        if (!mesh.userData.isHorizon || !mesh.userData.rawHorizonPos) return;
        if (!(mesh instanceof THREE.Mesh)) return;
        const pos = mesh.geometry.attributes.position;
        const raw = mesh.userData.rawHorizonPos;
        const exagShift = mesh.userData.exagShift || 0;

        for (let i = 0; i < pos.count; i++) {
            const rx = raw[i * 3], ry = raw[i * 3 + 1], rz = raw[i * 3 + 2];
            pos.setXYZ(i, rx, ry + exagShift, rz);
        }
        pos.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
    });
}


// ── Douglas-Peucker 3D stick simplification ──────────────────────────────────
// Removes near-collinear intermediate points from each fault stick polyline.
// This reduces ~22 K-layer vertices (only ~3m apart) to 2-4 representative
// points while preserving genuine bends, dramatically cutting ribbon vertex count.
function _ptSegDist3(p, a, b) {
    const abx=b.x-a.x, aby=b.y-a.y, abz=b.z-a.z;
    const apx=p.x-a.x, apy=p.y-a.y, apz=p.z-a.z;
    const ab2=abx*abx+aby*aby+abz*abz;
    const t=ab2>0 ? Math.max(0,Math.min(1,(apx*abx+apy*aby+apz*abz)/ab2)) : 0;
    const dx=a.x+t*abx-p.x, dy=a.y+t*aby-p.y, dz=a.z+t*abz-p.z;
    return Math.sqrt(dx*dx+dy*dy+dz*dz);
}
function simplifyStick(pts, eps) {
    if (pts.length<=2) return pts;
    let maxD=0, maxI=0;
    for (let i=1;i<pts.length-1;i++) {
        const d=_ptSegDist3(pts[i],pts[0],pts[pts.length-1]);
        if (d>maxD){maxD=d;maxI=i;}
    }
    if (maxD>eps) {
        const L=simplifyStick(pts.slice(0,maxI+1),eps);
        const R=simplifyStick(pts.slice(maxI),eps);
        return [...L.slice(0,-1),...R];
    }
    return [pts[0],pts[pts.length-1]];
}
// Centroid-path smoothing for fault ribbons.
// Applies N iterations of 1D Laplacian smoothing to the XY centroid path of
// each fault's sorted sticks (rounding staircase corners), then rebuilds the
// vertex buffer.  Canonical sticks are stored on mesh.userData at build time.
function applyFaultSmoothing(iterations) {
    const LAMBDA = 0.5;
    allSurveyChildren().forEach(mesh => {
        if (!mesh.userData.isFault || !mesh.userData.canonicalSticks) return;
        if (!(mesh instanceof THREE.Mesh)) return;

        // Deep-clone canonical sticks so we don't mutate the source
        let sticks = mesh.userData.canonicalSticks.map(s => s.map(p => ({...p})));
        const n = sticks.length;

        for (let iter = 0; iter < iterations; iter++) {
            // Compute centroids of current positions
            const cx = sticks.map(s => s.reduce((a,p)=>a+p.x,0)/s.length);
            const cy = sticks.map(s => s.reduce((a,p)=>a+p.y,0)/s.length);
            // Laplacian move: interior sticks only (boundary sticks are fixed)
            const newCx = [...cx], newCy = [...cy];
            for (let i = 1; i < n-1; i++) {
                newCx[i] = cx[i] + LAMBDA * ((cx[i-1]+cx[i+1])/2 - cx[i]);
                newCy[i] = cy[i] + LAMBDA * ((cy[i-1]+cy[i+1])/2 - cy[i]);
            }
            // Translate all points in each stick by the centroid delta
            for (let i = 0; i < n; i++) {
                const dx = newCx[i] - cx[i], dy = newCy[i] - cy[i];
                sticks[i].forEach(p => { p.x += dx; p.y += dy; });
            }
        }

        // Rebuild vertex buffer from smoothed sticks
        const geo = mesh.geometry;
        const pos = geo.attributes.position;
        const centerX = mesh.userData.centerX, centerY = mesh.userData.centerY;
        let vIdx = 0;
        const validStripIndices = mesh.userData.validStripIndices || [];
        for (const si of validStripIndices) {
            const sA = sticks[si], sB = sticks[si+1];
            if (!sA || !sB) continue;
            for (const p of sA) { pos.setXYZ(vIdx++, p.x-centerX, -p.z, -(p.y-centerY)); }
            for (const p of sB) { pos.setXYZ(vIdx++, p.x-centerX, -p.z, -(p.y-centerY)); }
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        geo.computeBoundingBox();
    });
}

function initLayerControls(layers) {
    const faultLayers = layers.filter(l => l.isFault);

    const faultToggleState = { visible: true };
    let masterFaultCtrl = null;
    const individualFaultCtrls = [];

    // ── Horizons section ─────────────────────────────────────────────────────
    layers.forEach(h => {
        if (h.isFault) return;

        const folder = horizonFolder.addFolder(h.name);
        _trackFolder(folder, 'layer:' + h.name);
        const _storedLayer = (() => { try { return JSON.parse(localStorage.getItem('geo_layer_' + h.name) || 'null'); } catch(e){ return null; } })();
        layerState[h.name] = { visible: _storedLayer?.visible ?? true, opacity: _storedLayer?.opacity ?? 1.0 };

        // Initialise scene from stored state
        const _ls = layerState[h.name];
        allSurveyChildren().forEach(c => {
            if (c.userData.layerName === h.name) {
                if (c.userData.isContour) {
                    c.userData.layerVisible = _ls.visible;
                    c.visible = _ls.visible && params.showContours;
                } else {
                    c.visible = _ls.visible;
                    c.material.transparent = true;
                    c.material.opacity = _ls.opacity;
                }
            }
        });

        folder.add(layerState[h.name], 'visible').onChange(v => {
            allSurveyChildren().forEach(c => {
                if (c.userData.layerName === h.name) {
                    if (c.userData.isContour) { c.userData.layerVisible = v; c.visible = v && params.showContours; }
                    else { c.visible = v; }
                }
            });
            try { localStorage.setItem('geo_layer_' + h.name, JSON.stringify(layerState[h.name])); } catch(e) {}
        });

        folder.add(layerState[h.name], 'opacity', 0, 1).onChange(v => {
            allSurveyChildren().forEach(c => {
                if (c.userData.layerName === h.name) {
                    c.material.transparent = true; c.material.opacity = v;
                    c.material.depthWrite = v >= 1;
                    c.material.needsUpdate = true;
                }
            });
            try { localStorage.setItem('geo_layer_' + h.name, JSON.stringify(layerState[h.name])); } catch(e) {}
        });
    });

    // ── Faults section ───────────────────────────────────────────────────────
    if (faultLayers.length > 0) {
        // Show All Faults master toggle at the top
        masterFaultCtrl = faultFolder.add(faultToggleState, 'visible').name('Show All Faults').onChange(v => {
            faultLayers.forEach(f => {
                layerState[f.name].visible = v;
                allSurveyChildren().forEach(c => {
                    if (c.userData.layerName === f.name) c.visible = v;
                });
                // PERSIST: master toggle must save each fault individually so they
                // are still hidden after a browser refresh (DEVELOPER RULE step ②).
                try { localStorage.setItem('geo_layer_' + f.name, JSON.stringify(layerState[f.name])); } catch(e) {}
            });
            individualFaultCtrls.forEach(ctrl => ctrl.updateDisplay());
        });

        // ── Smoothing slider ──────────────────────────────────────────────────
        faultFolder.add(params, 'faultSmoothIterations', 0, 8, 1)
            .name('Smoothing (iterations)')
            .onChange(v => { applyFaultSmoothing(v); updateColoring(); });

        // ── Fault Coloring sub-folder ─────────────────────────────────────────
        const faultColorFolder = faultFolder.addFolder('Fault Coloring');
        _trackFolder(faultColorFolder, 'Fault Coloring');
        const colorPickerCtrl = faultColorFolder.addColor(params, 'faultSingleColor')
            .name('Color').onChange(() => applyFaultColoring());
        faultColorFolder.add(params, 'faultColorMode', {
            'Original (per-fault)': 'original',
            'Uniform':              'uniform',
            'Warm spectrum':        'warm',
            'Cool spectrum':        'cool',
            'Earth tones':          'earth',
            'Monochrome':           'mono',
        }).name('Palette').onChange(v => {
            v === 'uniform' ? colorPickerCtrl.show() : colorPickerCtrl.hide();
            applyFaultColoring();
        });
        // Hide the color picker unless starting in uniform mode
        if (params.faultColorMode !== 'uniform') colorPickerCtrl.hide();

        // ── Individual fault toggles ──────────────────────────────────────────
        faultLayers.forEach(f => {
            const _storedFault = (() => { try { return JSON.parse(localStorage.getItem('geo_layer_' + f.name) || 'null'); } catch(e){ return null; } })();
            layerState[f.name] = { visible: _storedFault?.visible ?? true, opacity: _storedFault?.opacity ?? 0.75 };

            allSurveyChildren().forEach(c => {
                if (c.userData.layerName === f.name) {
                    c.visible = layerState[f.name].visible;
                    if (c.material) { c.material.transparent = true; c.material.opacity = 0.75; c.material.depthWrite = false; }
                }
            });

            const ctrl = faultFolder.add(layerState[f.name], 'visible').name(f.name).onChange(v => {
                allSurveyChildren().forEach(c => {
                    if (c.userData.layerName === f.name) c.visible = v;
                });
                try { localStorage.setItem('geo_layer_' + f.name, JSON.stringify(layerState[f.name])); } catch(e) {}
                // Sync master toggle
                const allOn = faultLayers.every(fl => layerState[fl.name].visible);
                faultToggleState.visible = allOn;
                masterFaultCtrl.updateDisplay();
            });
            individualFaultCtrls.push(ctrl);
        });
    }
}



function getCurrentState() {
    return {
        params: { ...params },
        layers: JSON.parse(JSON.stringify(layerState)),
        // Camera state — captured so presets restore the exact viewpoint
        camera: {
            px: camera.position.x, py: camera.position.y, pz: camera.position.z,
            tx: controls.target.x, ty: controls.target.y, tz: controls.target.z
        }
    };
}

// Toggle scene lighting on/off. When disabled, boost ambient so the scene is
// still visible but shading-free; when enabled, restore the stored intensities.
function updateMaterialType(enabled) {
    if (enabled) {
        ambientLight.intensity          = params.ambientIntensity;
        if (mainLight) mainLight.intensity = params.sunIntensity;
        headLight.intensity             = params.headlampIntensity;
        hemiLight.intensity             = params.hemiIntensity;
    } else {
        ambientLight.intensity          = 8.0; // flat, unshaded look
        if (mainLight) mainLight.intensity = 0;
        headLight.intensity             = 0;
        hemiLight.intensity             = 0;
    }
}

function applyState(state) {
    // 1. Update Params
    Object.assign(params, state.params);

    // 2. Update Layer State — IMPORTANT: mutate existing objects in place so that
    // lil-gui checkbox/slider bindings (which hold a reference to the original
    // per-layer object) stay valid. Using Object.assign(layerState, state.layers)
    // would REPLACE each inner object with a new one, breaking the GUI binding and
    // causing onChange to save stale (wrong) values to localStorage.
    Object.keys(state.layers).forEach(name => {
        if (layerState[name]) {
            Object.assign(layerState[name], state.layers[name]); // mutate in place
        } else {
            layerState[name] = state.layers[name]; // new layer not yet in state
        }
    });

    // 3. Update GUI Controllers
    gui.controllersRecursive().forEach(c => c.updateDisplay());

    // 4. Apply Side Effects

    // Layers
    Object.keys(layerState).forEach(name => {
        const s = layerState[name];
        allSurveyChildren().forEach(c => {
            if (c.userData.layerName === name) {
                if (c.userData.isContour) {
                    c.userData.layerVisible = s.visible;
                    c.visible = s.visible && params.showContours;
                } else {
                    c.visible = s.visible;
                    c.material.transparent = true;
                    // s.opacity may be undefined for fault layers — use existing value as fallback
                    if (s.opacity !== undefined) {
                        c.material.opacity = s.opacity;
                        c.material.depthWrite = s.opacity >= 1;
                    }
                }
            }
        });
    });

    // Coloring & Material
    updateMaterialType(params.lightingEnabled);
    updateColoring(); // Handles depth coloring

    // Contours
    allSurveyChildren().forEach(c => {
        if (c.userData.isContour) {
            c.material.uniforms.interval.value = params.contourInterval;
            c.material.uniforms.thickness.value = params.contourThickness;
            c.material.uniforms.opacity.value = params.contourOpacity;
            c.material.uniforms.lineColor.value.set(params.contourColor);
            // Visibility is handled in Layer loop + global toggle check below
            if (!params.showContours) c.visible = false;
        }
        if (c.userData.isRegionalContour) {
            c.material.uniforms.interval.value   = params.regionalContourInterval;
            c.material.uniforms.thickness.value  = params.regionalContourThickness;
            c.material.uniforms.opacity.value    = params.regionalContourOpacity;
            c.material.uniforms.lineColor.value.set(params.regionalContourColor);
            c.visible = params.regionalShowContours;
            // Re-smooth in case the iteration count was changed in the preset
            smoothRegionalContourY(params.regionalContourSmooth);
        }
        if (c.userData.isRegional) {
            c.visible = params.regionalVisible && params.regionalOpacity > 0;
            c.material.opacity = params.regionalOpacity;
            c.material.needsUpdate = true;
        }
    });

    // Lighting
    ambientLight.intensity = params.ambientIntensity;
    if (mainLight) mainLight.intensity = params.sunIntensity;
    headLight.intensity = params.headlampIntensity;
    hemiLight.intensity = params.hemiIntensity;

    // Model Transform
    allSurveyChildren().forEach(c => {
        if (!c.userData.isContour && !c.userData.isRegionalContour) c.material.wireframe = params.wireframe;
    });
    allSurveyChildren().forEach(c => {
        if (!c.userData.isContour && !c.userData.isRegionalContour) c.material.flatShading = params.flatShading;
        c.material.needsUpdate = true;
    });
    modelGroup.scale.y = params.zScale;


    // Depth exaggeration (applyHorizonDepthExag chains into applyHorizonPositions)
    applyHorizonDepthExag(params.horizonDepthExag);
    // Horizon footprint bounding box
    buildHorizonBBox();
    if (horizonBBox) {
        horizonBBox.visible = params.norneBBoxVisible;
        horizonBBox.material.color.set(params.horizonBBoxColor);
    }
    if (volveBBox) {
        volveBBox.visible = params.volveBBoxVisible;
        volveBBox.material.color.set(params.horizonBBoxColor);
    }
    // Fault smoothing
    applyFaultSmoothing(params.faultSmoothIterations);
    // Fault palette
    applyFaultColoring();

    // Regional surface extras
    if (regionalMesh) {
        regionalMesh.material.wireframe = params.regionalWireframe;
        regionalMesh.material.needsUpdate = true;
    }
    applyRegionalBlend(params.regionalBlendKm);

    // Seismic crossline panel
    if (seismicPanel) {
        seismicPanel.visible = params.seismicPanelVisible;
        seismicPanel.material.opacity = params.seismicPanelOpacity;
        seismicPanel.material.needsUpdate = true;
    }

    // Survey group positions (Norne + Volve)
    if (typeof applyNorneSurveyOffset === 'function') applyNorneSurveyOffset();
    if (typeof applyVolveSurveyOffset === 'function') applyVolveSurveyOffset();

    // Well group position + trajectory rebuild
    if (typeof applyWellOffset === 'function') applyWellOffset();
    if (typeof buildWellTrajectories === 'function') buildWellTrajectories();

    // 5. Restore camera viewpoint (only present in states saved after this fix)
    if (state.camera) {
        camera.position.set(state.camera.px, state.camera.py, state.camera.pz);
        controls.target.set(state.camera.tx, state.camera.ty, state.camera.tz);
        const dist = camera.position.distanceTo(controls.target);
        camera.near = Math.max(1, dist * 0.001);
        camera.far  = dist * 50;
        camera.updateProjectionMatrix();
        controls.update();
    }
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

// initPresets — call ONCE on first page load to wire up all event listeners.
// Never call again; use updatePresetsForDataset() when switching datasets.
let _presetsInitialised = false;
function initPresets() {
    if (_presetsInitialised) {
        // Already wired — just refresh Default for the new dataset and return
        updatePresetsForDataset();
        return;
    }
    _presetsInitialised = true;

    // Load persisted presets from localStorage
    const stored = localStorage.getItem('volve_viz_presets');
    if (stored) {
        try { savedPresets = JSON.parse(stored); } catch(e) { /* corrupt — ignore */ }
    }

    // Wire up dropdown — fires when user picks a preset
    document.getElementById('presetSelect').addEventListener('change', (e) => {
        const name = e.target.value;
        if (savedPresets[name]) applyState(savedPresets[name]);
    });

    // ── Save flow ──────────────────────────────────────────────────────────────
    document.getElementById('btnSave').addEventListener('click', () => {
        document.getElementById('presetNameInput').value = '';
        document.getElementById('saveModal').style.display = 'flex';
        document.getElementById('presetNameInput').focus();
    });

    document.getElementById('confirmSave').addEventListener('click', () => {
        const name = document.getElementById('presetNameInput').value.trim();
        if (!name) return alert('Please enter a name');
        // Snapshot current params + layer visibility + camera position
        savedPresets[name] = getCurrentState();
        try { localStorage.setItem('volve_viz_presets', JSON.stringify(savedPresets)); } catch(e) {}
        updatePresetDropdown(name);
        closeModal('saveModal');
    });

    // ── Update flow (overwrite current preset) ────────────────────────────────
    document.getElementById('btnUpdate').addEventListener('click', () => {
        const name = document.getElementById('presetSelect').value;
        if (name === 'Default') return alert('Cannot overwrite the Default preset.\nUse "Save" to create a new preset.');
        savedPresets[name] = getCurrentState();
        try { localStorage.setItem('volve_viz_presets', JSON.stringify(savedPresets)); } catch(e) {}
        // Brief flash to confirm the update
        const btn = document.getElementById('btnUpdate');
        btn.style.background = '#2e7d32';
        setTimeout(() => btn.style.background = '', 600);
    });

    // ── Delete flow ────────────────────────────────────────────────────────────
    document.getElementById('btnDelete').addEventListener('click', () => {
        const name = document.getElementById('presetSelect').value;
        if (name === 'Default') return alert('Cannot delete the Default preset');
        document.getElementById('deleteTargetName').textContent = name;
        document.getElementById('deleteModal').style.display = 'flex';
    });

    document.getElementById('confirmDelete').addEventListener('click', () => {
        const name = document.getElementById('presetSelect').value;
        delete savedPresets[name];
        try { localStorage.setItem('volve_viz_presets', JSON.stringify(savedPresets)); } catch(e) {}
        updatePresetDropdown('Default');
        applyState(savedPresets['Default']);
        closeModal('deleteModal');
    });

    // Capture initial Default and populate dropdown for the first dataset
    updatePresetsForDataset();
}

// Call after each dataset load to refresh the Default snapshot and dropdown.
function updatePresetsForDataset() {
    savedPresets['Default'] = getCurrentState();
    updatePresetDropdown('Default');
}

// ── Fault colour palettes ────────────────────────────────────────────────────
const FAULT_PALETTES = {
    original:    null, // use each fault's originalColor
    uniform:     null, // use params.faultSingleColor for all
    warm:    [0xFF6B6B, 0xFF8C42, 0xFFAA22, 0xFFCC44, 0xFF5577, 0xFF7733, 0xEE4444, 0xFF9900],
    cool:    [0x4ECDC4, 0x45B7D1, 0x5C9EDA, 0x7B68EE, 0x48A999, 0x2980B9, 0x8E44AD, 0x3498DB],
    earth:   [0xA0845C, 0xC49A6C, 0x8B6914, 0xD2A679, 0xB87333, 0x967117, 0xCC9944, 0x7D5A3C],
    mono:    [0x888888, 0xAAAAAA, 0x666666, 0xCCCCCC, 0x555555, 0x999999, 0xBBBBBB, 0x444444],
};

// ── Regional Åre Fm context horizon ──────────────────────────────────────────
let regionalMesh = null;
let regionalContourMesh = null;

// ── Recompute fit blend data from survey base meshes ────────────────────────
// Called at load time and whenever survey position/rotation changes.
// Gathers transformed vertices from both Norne Base and Hugin Fm Base (if their
// respective fit toggles are enabled), merges into a single spatial hash, and
// runs one BFS pass.  Whichever field's base is closest wins at each cell.
function recomputeFitBlend() {
    if (!regionalMesh) return;
    const { rxArr, rzArr, yPriorSmooth } = regionalMesh.userData;
    const W = regionalMesh.userData.gridW;
    const H = regionalMesh.userData.gridH;
    const N = W * H;

    const fitConformDepth = new Float32Array(N);
    const fitDistArr      = new Float32Array(N);
    for (let i = 0; i < N; i++) { fitConformDepth[i] = -yPriorSmooth[i]; fitDistArr[i] = Infinity; }

    // Helper: gather transformed raw vertices from a base mesh
    function gatherBaseVerts(layerName, surveyGroup) {
        const mesh = surveyGroup.children.find(m =>
            m.userData.isHorizon && m.userData.layerName === layerName && !m.userData.isContour);
        if (!mesh) return [];
        surveyGroup.updateMatrix();
        const mat4 = surveyGroup.matrix;
        const rawPos = mesh.userData.rawHorizonPos;
        const hIdx = mesh.geometry.index;
        const hPosCount = rawPos.length / 3;
        const usedVerts = new Set();
        if (hIdx) { const arr = hIdx.array; for (let i = 0; i < arr.length; i++) usedVerts.add(arr[i]); }
        const verts = [];
        const _v = new THREE.Vector3();
        for (let i = 0; i < hPosCount; i++) {
            if (!usedVerts.has(i)) continue;
            _v.set(rawPos[i*3], rawPos[i*3+1], rawPos[i*3+2]);
            _v.applyMatrix4(mat4);
            verts.push({ x: _v.x, y: _v.y, z: _v.z });
        }
        return verts;
    }

    // Collect vertices from whichever fields have fit enabled
    let allVerts = [];
    if (params.regionalFitToBase)  allVerts = allVerts.concat(gatherBaseVerts('Norne Base', norneSurveyGroup));
    if (params.regionalFitToVolve) allVerts = allVerts.concat(gatherBaseVerts('Hugin Fm Base', volveSurveyGroup));

    if (allVerts.length > 0) {
        // Spatial hash (200m buckets)
        const BUCKET = 200;
        const hash = {};
        for (const v of allVerts) {
            const k = `${Math.round(v.x / BUCKET)},${Math.round(v.z / BUCKET)}`;
            (hash[k] || (hash[k] = [])).push(v);
        }

        // Phase 1: seed cells near mesh vertices
        const SEED_RADIUS = 3;
        const SEED_THRESH2 = 300 * 300;
        const seedMask = new Uint8Array(N);
        for (let i = 0; i < N; i++) {
            const rx = rxArr[i], rz = rzArr[i];
            const bx = Math.round(rx / BUCKET), bz = Math.round(rz / BUCKET);
            let minDist2 = Infinity, nearestY = 0;
            for (let dx = -SEED_RADIUS; dx <= SEED_RADIUS; dx++) {
                for (let dz = -SEED_RADIUS; dz <= SEED_RADIUS; dz++) {
                    const bucket = hash[`${bx + dx},${bz + dz}`];
                    if (!bucket) continue;
                    for (const v of bucket) {
                        const ddx = rx - v.x, ddz = rz - v.z;
                        const d2 = ddx * ddx + ddz * ddz;
                        if (d2 < minDist2) { minDist2 = d2; nearestY = v.y; }
                    }
                }
            }
            if (minDist2 <= SEED_THRESH2) {
                seedMask[i] = 1;
                fitConformDepth[i] = -nearestY;
                fitDistArr[i] = 0;
            }
        }

        // Phase 2: BFS flood fill
        const gridDx = Math.abs(rxArr[1] - rxArr[0]) || 125;
        const queue = new Int32Array(4 * N);
        let qHead = 0, qTail = 0;
        for (let i = 0; i < N; i++) if (seedMask[i]) queue[qTail++] = i;
        while (qHead < qTail) {
            const idx = queue[qHead++];
            const ci = idx % W, cj = (idx - ci) / W;
            const newDist = fitDistArr[idx] + gridDx;
            const depth  = fitConformDepth[idx];
            const tryNeighbour = (nIdx) => {
                if (newDist < fitDistArr[nIdx]) {
                    fitDistArr[nIdx] = newDist;
                    fitConformDepth[nIdx] = depth;
                    queue[qTail++] = nIdx;
                }
            };
            if (ci > 0)     tryNeighbour(idx - 1);
            if (ci < W - 1) tryNeighbour(idx + 1);
            if (cj > 0)     tryNeighbour(idx - W);
            if (cj < H - 1) tryNeighbour(idx + W);
        }
    }

    regionalMesh.userData.fitConformDepth = fitConformDepth;
    regionalMesh.userData.fitDistArr      = fitDistArr;
}


// 4-neighbour Laplacian smoothing on a flat W×H Float32Array.
// returns a new array; does not mutate input.
function _laplacianSmoothGrid(arr, w, h) {
    const out = new Float32Array(arr);
    for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
            const i = row * w + col;
            let sum = 0, cnt = 0;
            if (col > 0)     { sum += arr[i - 1]; cnt++; }
            if (col < w - 1) { sum += arr[i + 1]; cnt++; }
            if (row > 0)     { sum += arr[i - w]; cnt++; }
            if (row < h - 1) { sum += arr[i + w]; cnt++; }
            if (cnt > 0) out[i] = arr[i] * 0.5 + (sum / cnt) * 0.5;
        }
    }
    return out;
}

async function loadRegionalHorizon() {
    let centerX = 0, centerY = 0;
    allSurveyChildren().forEach(m => {
        if (m.userData.isHorizon && m.userData.centerX) { centerX = m.userData.centerX; centerY = m.userData.centerY; }
    });

    let text;
    try { const r = await fetch('Norne_Are_Regional.csv'); if (!r.ok) return null; text = await r.text(); }
    catch(e) { console.warn('Regional horizon CSV not found'); return null; }

    const lines = text.trim().split('\n');
    // ── Source grid (auto-detect dimensions from CSV IL/XL ranges) ───────────
    let maxIL = 0, maxXL = 0;
    const dataLines = lines.slice(1);
    dataLines.forEach(l => {
        const p = l.split(',');
        const il = parseInt(p[0]), xl = parseInt(p[1]);
        if (il > maxIL) maxIL = il;
        if (xl > maxXL) maxXL = xl;
    });
    const SRC_W = maxIL + 1, SRC_H = maxXL + 1;
    console.log(`Regional CSV grid: ${SRC_W}×${SRC_H}`);
    const SRC_N = SRC_W * SRC_H;
    const src_rx      = new Float32Array(SRC_N);
    const src_rz      = new Float32Array(SRC_N);
    const src_zConform = new Float32Array(SRC_N);
    const src_zPoly    = new Float32Array(SRC_N);
    const src_dist     = new Float32Array(SRC_N);

    dataLines.forEach(l => {
        const p = l.split(',');
        const il = parseInt(p[0]), xl = parseInt(p[1]);
        const idx = xl * SRC_W + il;
        src_rx[idx]       = parseFloat(p[2]) - centerX;
        src_rz[idx]       = -(parseFloat(p[3]) - centerY);
        src_zConform[idx] = parseFloat(p[4]);
        src_zPoly[idx]    = parseFloat(p[5]);
        src_dist[idx]     = parseFloat(p[6]);
    });

    // ── Bilinear upsample SRC → render grid ─────────────────────────────────
    // Target ~200 cells on the longest axis, scaling proportionally.
    const UPSAMPLE_TARGET = 201;
    const upsampleFactor = Math.max(1, Math.round(UPSAMPLE_TARGET / Math.max(SRC_W, SRC_H)));
    const W = (SRC_W - 1) * upsampleFactor + 1;
    const H = (SRC_H - 1) * upsampleFactor + 1;
    console.log(`Regional upsample: ${SRC_W}×${SRC_H} → ${W}×${H} (${upsampleFactor}× factor)`);
    const N = W * H;
    const rxArr    = new Float32Array(N);
    const rzArr    = new Float32Array(N);
    const zConformRaw = new Float32Array(N); // Renamed from zConform, will be updated by sampling
    const zPoly    = new Float32Array(N);
    const distArr  = new Float32Array(N);

    function bilerp(src, srcW, srcH, fi, fj) {
        const i0 = Math.min(Math.floor(fi), srcW - 2);
        const j0 = Math.min(Math.floor(fj), srcH - 2);
        const i1 = i0 + 1, j1 = j0 + 1;
        const ti = fi - i0, tj = fj - j0;
        return (src[j0 * srcW + i0] * (1 - ti) + src[j0 * srcW + i1] * ti) * (1 - tj)
             + (src[j1 * srcW + i0] * (1 - ti) + src[j1 * srcW + i1] * ti) * tj;
    }

    for (let j = 0; j < H; j++) {
        for (let i = 0; i < W; i++) {
            const fi = i * (SRC_W - 1) / (W - 1); // maps [0,W-1] → [0,SRC_W-1]
            const fj = j * (SRC_H - 1) / (H - 1);
            const idx = j * W + i;
            rxArr[idx]    = bilerp(src_rx,       SRC_W, SRC_H, fi, fj);
            rzArr[idx]    = bilerp(src_rz,       SRC_W, SRC_H, fi, fj);
            zConformRaw[idx] = bilerp(src_zConform, SRC_W, SRC_H, fi, fj); // Use zConformRaw here
            zPoly[idx]    = bilerp(src_zPoly,    SRC_W, SRC_H, fi, fj);
            distArr[idx]  = bilerp(src_dist,     SRC_W, SRC_H, fi, fj);
        }
    }

    const geo = new THREE.PlaneGeometry(1, 1, W - 1, H - 1);
    const pos = geo.attributes.position;

    // Initial positions from CSV data (gives nice topology features).
    // CSV zConformRaw has real geological structure inside the survey rectangle
    // which creates the visible bumps and features in prior mode.
    const blendM = params.regionalBlendKm * 1000;
    for (let i = 0; i < N; i++) {
        let t = distArr[i] / (blendM || 1);
        t = Math.min(t, 1); t = t * t * (3 - 2 * t); // smoothstep
        const z = -(1 - t) * zConformRaw[i] - t * zPoly[i];
        pos.setXYZ(i, rxArr[i], z, rzArr[i]);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
        color: 0x7799BB, transparent: true, opacity: params.regionalOpacity,
        depthWrite: false, side: THREE.DoubleSide,
        shininess: 20, wireframe: params.regionalWireframe
    });

    regionalMesh = new THREE.Mesh(geo, mat);
    regionalMesh.userData.isRegional = true;
    regionalMesh.userData.layerName = 'Norne Base';
    regionalMesh.userData.gridW        = W;
    regionalMesh.userData.gridH        = H;
    regionalMesh.userData.rxArr       = rxArr;
    regionalMesh.userData.rzArr       = rzArr;
    regionalMesh.userData.zConformRaw = zConformRaw;
    regionalMesh.userData.zPoly       = zPoly;
    regionalMesh.userData.csvDistArr  = distArr;

    // yPriorSmooth: the surface shown when "Fit to Norne Base" is unchecked.
    // Built from the CSV-based initial positions (nice topology features).
    let yPriorSmooth = new Float32Array(N);
    for (let i = 0; i < N; i++) yPriorSmooth[i] = pos.getY(i);
    for (let pass = 0; pass < 2; pass++) yPriorSmooth = _laplacianSmoothGrid(yPriorSmooth, W, H);
    regionalMesh.userData.yPriorSmooth = yPriorSmooth;

    // ── Runtime sampling of the actual Norne Base horizon mesh ───────────────
    // Extracted to recomputeFitBlend() so it can be re-called when the survey
    // position or rotation changes.  Called once at load time below.
    recomputeFitBlend();

    regionalMesh.userData.fitConformDepth = regionalMesh.userData.fitConformDepth || new Float32Array(N);
    regionalMesh.userData.fitDistArr      = regionalMesh.userData.fitDistArr || new Float32Array(N);

    modelGroup.add(regionalMesh);

    // ── Regional contour / topology overlay ──────────────────────────────────
    const rContourMat = contourMaterial.clone();
    rContourMat.uniforms.interval.value  = params.regionalContourInterval;
    rContourMat.uniforms.thickness.value = params.regionalContourThickness;
    rContourMat.uniforms.opacity.value   = params.regionalContourOpacity;
    rContourMat.uniforms.lineColor.value.set(params.regionalContourColor);
    // Inherited polygonOffset from base contourMaterial clone is fine here;
    // the survey-interior triangles are removed from the index buffer instead.
    regionalContourMesh = new THREE.Mesh(geo.clone(), rContourMat);
    regionalContourMesh.visible     = params.regionalShowContours;
    // renderOrder 5: must execute AFTER all horizon surface meshes (0) and
    // horizon contour overlays (1) so the stencil buffer is fully written first.
    regionalContourMesh.renderOrder = 5;
    regionalContourMesh.userData.isRegionalContour = true;
    modelGroup.add(regionalContourMesh);
    // Initialise the contour mesh geometry (smoothing = 0 on first load)
    smoothRegionalContourY(params.regionalContourSmooth);

    if (camera) { camera.far = Math.max(camera.far, 200000); camera.updateProjectionMatrix(); }
    console.log('Norne Base regional horizon loaded');

    // Apply the fit blend according to the persisted toggle state
    applyRegionalBlend(params.regionalBlendKm);

    return regionalMesh;
}

// Recompute the smoothstep blend on the already-loaded regional mesh.
// blendKm: distance (km) beyond the survey edge over which to blend conform→poly.
//   0  = sharp cutoff at survey boundary (conformed inside, poly outside)
//   25 = blend extends all the way to the 25km edge of the regional surface
function applyRegionalBlend(blendKm) {
    if (!regionalMesh) { console.warn('applyRegionalBlend: no regionalMesh'); return; }
    const { rxArr, rzArr, yPriorSmooth, fitConformDepth, fitDistArr } = regionalMesh.userData;
    const pos = regionalMesh.geometry.attributes.position;

    if (!params.regionalFitToBase && !params.regionalFitToVolve) {
        // ── Prior mode ────────────────────────────────────────────────────────
        // y = yPriorSmooth everywhere. Simple, clean, no shift needed.
        for (let i = 0; i < pos.count; i++) {
            pos.setXYZ(i, rxArr[i], yPriorSmooth[i], rzArr[i]);
        }
    } else {
        // ── Fit mode: start from the prior surface and pull toward true depth ──
        // Inside the mesh footprint (fitDistArr≈0) → snap to actual mesh depth.
        // Outside (fitDistArr large) → stays at yPriorSmooth (prior surface).
        // fitDistArr comes from BFS on the actual mesh footprint (smooth everywhere).
        const falloffM = Math.max(params.regionalFitBlendKm * 1000, 1);

        for (let i = 0; i < pos.count; i++) {
            let t = Math.min(fitDistArr[i] / falloffM, 1);
            t = 1 - (1 - t) * (1 - t); // quadratic ease-out
            const conformedY = -fitConformDepth[i];
            const priorY     = yPriorSmooth[i];
            pos.setXYZ(i, rxArr[i], conformedY * (1 - t) + priorY * t, rzArr[i]);
        }
    }

    pos.needsUpdate = true;
    regionalMesh.geometry.computeVertexNormals();
    smoothRegionalContourY(params.regionalContourSmooth);
}

// Rebuild the prior surface (yPriorSmooth) when the topology falloff slider changes.
// Recomputes the CSV-based blend with the new falloff, then re-applies fit mode if active.
function rebuildRegionalPrior() {
    if (!regionalMesh) return;
    const { rxArr, rzArr, zConformRaw, zPoly, csvDistArr } = regionalMesh.userData;
    const pos = regionalMesh.geometry.attributes.position;
    const N = pos.count;
    const blendM = params.regionalBlendKm * 1000;
    const yPriorSmooth = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        if (params.regionalTopologyFalloff) {
            // Distance-based blend: topology near survey, smooth trend far away
            let t = csvDistArr[i] / (blendM || 1);
            t = Math.min(t, 1); t = t * t * (3 - 2 * t);
            yPriorSmooth[i] = -(1 - t) * zConformRaw[i] - t * zPoly[i];
        } else {
            // No falloff: use full topology (zConformRaw) everywhere
            yPriorSmooth[i] = -zConformRaw[i];
        }
    }
    regionalMesh.userData.yPriorSmooth = yPriorSmooth;
    // Apply 2 passes of Laplacian smoothing before fitting
    for (let pass = 0; pass < 2; pass++) {
        regionalMesh.userData.yPriorSmooth = _laplacianSmoothGrid(regionalMesh.userData.yPriorSmooth, regionalMesh.userData.gridW, regionalMesh.userData.gridH);
    }
    applyRegionalBlend(params.regionalBlendKm);
}


// Apply N passes of 4-neighbour Laplacian smoothing (Y channel only) to the
// regional contour mesh, then clip the index buffer so that only triangles
// OUTSIDE the survey footprint (distArr > 0) are rendered.
// Regional grid dimensions are stored dynamically on regionalMesh.userData.gridW / .gridH
function smoothRegionalContourY(iterations) {
    if (!regionalContourMesh || !regionalMesh) return;
    const srcPos = regionalMesh.geometry.attributes.position;
    const distArr = regionalMesh.userData.csvDistArr;
    const N = srcPos.count; // 51*51 = 2601

    // Start from the blended (non-smoothed) Y values
    const yBuf = new Float32Array(N);
    for (let i = 0; i < N; i++) yBuf[i] = srcPos.getY(i);

    // Laplacian passes on the regular 51x51 grid
    const W = regionalMesh.userData.gridW, H = regionalMesh.userData.gridH;
    for (let pass = 0; pass < iterations; pass++) {
        const next = new Float32Array(yBuf);
        for (let row = 0; row < H; row++) {
            for (let col = 0; col < W; col++) {
                const i = row * W + col;
                let sum = 0, count = 0;
                if (col > 0)     { sum += yBuf[i - 1]; count++; }
                if (col < W - 1) { sum += yBuf[i + 1]; count++; }
                if (row > 0)     { sum += yBuf[i - W]; count++; }
                if (row < H - 1) { sum += yBuf[i + W]; count++; }
                if (count > 0) next[i] = (yBuf[i] + sum / count) * 0.5;
            }
        }
        yBuf.set(next);
    }

    // Write X, smoothed-Y, Z into the contour mesh's own geometry
    const cGeo = regionalContourMesh.geometry;
    const cPos = cGeo.attributes.position;
    for (let i = 0; i < N; i++) {
        cPos.setXYZ(i, srcPos.getX(i), yBuf[i], srcPos.getZ(i));
    }
    cPos.needsUpdate = true;
    cGeo.computeVertexNormals();
    // Index is unchanged — all triangles kept; the depth buffer naturally
    // occludes the regional layer wherever survey horizon meshes exist.
}


function applyFaultColoring() {
    const mode = params.faultColorMode;
    let faultIndex = 0;
    allSurveyChildren().forEach(mesh => {
        if (!mesh.userData.isFault || mesh.userData.isContour) return;
        mesh.material.vertexColors = false;
        if (mode === 'uniform') {
            mesh.material.color.set(params.faultSingleColor);
        } else if (mode === 'original') {
            if (mesh.userData.originalColor !== undefined) mesh.material.color.setHex(mesh.userData.originalColor);
        } else {
            const palette = FAULT_PALETTES[mode];
            if (palette) mesh.material.color.setHex(palette[faultIndex % palette.length]);
        }
        mesh.material.needsUpdate = true;
        faultIndex++;
    });
}

function updateColoring() {
    // Helper: returns true for any mesh that should NOT be depth-coloured
    // (faults, contours, regional surfaces, bbox wireframes, non-Mesh objects).
    const skip = m => (
        m.userData.isContour ||
        m.userData.isFault ||
        m.userData.isRegional ||
        m.userData.isRegionalContour ||
        m.userData.isHorizonBBox ||
        m.userData.isSeismicPanel ||
        !(m instanceof THREE.Mesh)
    );

    if (params.colorByDepth) {
        if (params.depthColorPerLayer) {
            // ── Per-layer mode: each horizon coloured relative to its own depth extents ──
            // Good for showing within-surface topography on every layer simultaneously.
            allSurveyChildren().forEach(mesh => {
                if (skip(mesh)) return;
                const pos = mesh.geometry.attributes.position;
                const count = pos.count;
                // Compute this mesh's own depth range
                let lo = Infinity, hi = -Infinity;
                for (let i = 0; i < count; i++) {
                    const y = pos.getY(i);
                    if (!isNaN(y) && y !== 0) { if (y < lo) lo = y; if (y > hi) hi = y; }
                }
                const range = hi - lo || 1;
                const colors = new Float32Array(count * 3);
                for (let i = 0; i < count; i++) {
                    const t = (pos.getY(i) - lo) / range;
                    const c = getColormapColor(params.selectedColormap, t);
                    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
                }
                mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                mesh.material.vertexColors = true;
                mesh.material.color.set(0xffffff);
                mesh.material.needsUpdate = true;
            });
        } else {
            // ── Global mode: one shared depth range across all horizons (default) ──
            // Shows relative depth between layers — deepest layer = one end of palette.
            let minZ = Infinity, maxZ = -Infinity;
            allSurveyChildren().forEach(mesh => {
                if (skip(mesh)) return;
                const pos = mesh.geometry.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    const y = pos.getY(i);
                    if (!isNaN(y) && y !== 0) { if (y < minZ) minZ = y; if (y > maxZ) maxZ = y; }
                }
            });
            const range = maxZ - minZ || 1;
            allSurveyChildren().forEach(mesh => {
                if (skip(mesh)) return;
                const pos = mesh.geometry.attributes.position;
                const count = pos.count;
                const colors = new Float32Array(count * 3);
                for (let i = 0; i < count; i++) {
                    const t = (pos.getY(i) - minZ) / range;
                    const c = getColormapColor(params.selectedColormap, t);
                    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
                }
                mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                mesh.material.vertexColors = true;
                mesh.material.color.set(0xffffff);
                mesh.material.needsUpdate = true;
            });
        }
    } else {
        // Revert horizons to original colours
        allSurveyChildren().forEach(mesh => {
            if (skip(mesh)) return;
            mesh.material.vertexColors = false;
            if (mesh.userData.originalColor) mesh.material.color.setHex(mesh.userData.originalColor);
            mesh.material.needsUpdate = true;
        });
    }
    // Always (re-)apply fault palette — faults are never depth-coloured
    applyFaultColoring();
}


const vizFolder = gui.addFolder('Visualization');
_trackFolder(vizFolder, 'Visualization');

vizFolder.add(params, 'zScale', 0.1, 10).name('Vertical Exaggeration').onChange(v => {
    modelGroup.scale.y = v;
    buildWellTrajectories(); // re-counter-scale spheres
});

vizFolder.add(params, 'wireframe').onChange((v) => {
    allSurveyChildren().forEach(c => {
        if (!c.userData.isContour && !c.userData.isRegionalContour) c.material.wireframe = v;
    });
});

vizFolder.add(params, 'flatShading').name('Sharp/Flat').onChange((v) => {
    allSurveyChildren().forEach(c => {
        if (!c.userData.isContour && !c.userData.isRegionalContour) {
            c.material.flatShading = v;
            c.material.needsUpdate = true;
        }
    });
});

const depthFolder = vizFolder.addFolder('Depth Coloring');
_trackFolder(depthFolder, 'Depth Coloring');

depthFolder.add(params, 'colorByDepth').name('Enable').onChange(() => updateColoring());

depthFolder.add(params, 'depthColorPerLayer').name('Per-Layer Gradient').onChange(() => {
    if (params.colorByDepth) updateColoring();
});

depthFolder.add(params, 'selectedColormap', Object.keys(ColormapRegistry)).name('Colormap').onChange(() => {
    if (params.colorByDepth) updateColoring();
});

const topoFolder = vizFolder.addFolder('Topology Lines');
_trackFolder(topoFolder, 'Topology Lines');

topoFolder.add(params, 'showContours').name('Enable').onChange((v) => {
    allSurveyChildren().forEach(c => {
        if (c.userData.isContour) {
            // Only show if global toggle is ON AND the parent layer is visible
            c.visible = v && c.userData.layerVisible;
        }
    });
});

topoFolder.add(params, 'contourInterval', 10, 500).name('Interval').onChange((v) => {
    allSurveyChildren().forEach(c => {
        if (c.userData.isContour) {
            c.material.uniforms.interval.value = v;
        }
    });
});

topoFolder.add(params, 'contourThickness', 0.5, 5.0).name('Thickness').onChange((v) => {
    allSurveyChildren().forEach(c => {
        if (c.userData.isContour) {
            c.material.uniforms.thickness.value = v;
        }
    });
});

topoFolder.add(params, 'contourOpacity', 0.1, 1.0).name('Opacity').onChange((v) => {
    allSurveyChildren().forEach(c => {
        if (c.userData.isContour) {
            c.material.uniforms.opacity.value = v;
        }
    });
});

topoFolder.addColor(params, 'contourColor').name('Color').onChange((v) => {
    allSurveyChildren().forEach(c => {
        if (c.userData.isContour) {
            c.material.uniforms.lineColor.value.set(v);
        }
    });
});

// (Regional Context moved to its own top-level section below)






const lightFolder = gui.addFolder('Lighting');
_trackFolder(lightFolder, 'Lighting');
lightFolder.add(params, 'lightingEnabled').name('Enable Lighting').onChange(v => {
    updateMaterialType(v);
});
lightFolder.add(params, 'ambientIntensity', 0, 10).name('Ambient Light').onChange(v => {
    ambientLight.intensity = v;
});
lightFolder.add(params, 'sunIntensity', 0, 10).name('Sun Light').onChange(v => {
    if (mainLight) mainLight.intensity = v;
});
lightFolder.add(params, 'headlampIntensity', 0, 5).name('Headlamp').onChange(v => {
    headLight.intensity = v;
});
lightFolder.add(params, 'hemiIntensity', 0, 5).name('Sky Light').onChange(v => {
    hemiLight.intensity = v;
});

// ── Norne Survey Position ───────────────────────────────────────────────────
const nornePosFolder = gui.addFolder('Norne Survey Position');
_trackFolder(nornePosFolder, 'Norne Survey Position');
function applyNorneSurveyOffset() {
    norneSurveyGroup.position.x = params.surveyOffsetEastKm * 1000;
    norneSurveyGroup.position.z = -params.surveyOffsetNorthKm * 1000;
    norneSurveyGroup.position.y = -params.norneDepthOffsetM; // negative Y = deeper in scene
    norneSurveyGroup.rotation.y = -params.surveyRotationDeg * Math.PI / 180;
    norneSurveyGroup.scale.set(params.norneScale, params.norneScale, params.norneScale);
    recomputeFitBlend();
    if (params.regionalFitToBase || params.regionalFitToVolve) applyRegionalBlend(params.regionalBlendKm);
}
nornePosFolder.add(params, 'surveyOffsetEastKm', -30, 30, 0.5).name('East/West (km)').onChange(applyNorneSurveyOffset);
nornePosFolder.add(params, 'surveyOffsetNorthKm', -20, 20, 0.5).name('North/South (km)').onChange(applyNorneSurveyOffset);
nornePosFolder.add(params, 'surveyRotationDeg', -180, 180, 1).name('Rotation (°)').onChange(applyNorneSurveyOffset);
nornePosFolder.add(params, 'norneScale', 0.1, 5, 0.1).name('Scale').onChange(applyNorneSurveyOffset);
nornePosFolder.add(params, 'norneDepthOffsetM', -3000, 3000, 10).name('Depth Offset (m)').onChange(applyNorneSurveyOffset);
applyNorneSurveyOffset();

// ── Volve Survey Position ───────────────────────────────────────────────────
const volvePosFolder = gui.addFolder('Volve Survey Position');
_trackFolder(volvePosFolder, 'Volve Survey Position');
function applyVolveSurveyOffset() {
    volveSurveyGroup.position.x = params.volveOffsetEastKm * 1000;
    volveSurveyGroup.position.z = -params.volveOffsetNorthKm * 1000;
    volveSurveyGroup.position.y = -params.volveDepthOffsetM;
    volveSurveyGroup.rotation.y = -params.volveRotationDeg * Math.PI / 180;
    volveSurveyGroup.scale.set(params.volveScale, params.volveScale, params.volveScale);
    recomputeFitBlend();
    if (params.regionalFitToBase || params.regionalFitToVolve) applyRegionalBlend(params.regionalBlendKm);
}
volvePosFolder.add(params, 'volveOffsetEastKm', -30, 30, 0.5).name('East/West (km)').onChange(applyVolveSurveyOffset);
volvePosFolder.add(params, 'volveOffsetNorthKm', -25, 25, 0.5).name('North/South (km)').onChange(applyVolveSurveyOffset);
volvePosFolder.add(params, 'volveRotationDeg', -180, 180, 1).name('Rotation (°)').onChange(applyVolveSurveyOffset);
volvePosFolder.add(params, 'volveScale', 0.1, 5, 0.1).name('Scale').onChange(applyVolveSurveyOffset);
volvePosFolder.add(params, 'volveDepthOffsetM', -3000, 3000, 10).name('Depth Offset (m)').onChange(applyVolveSurveyOffset);
applyVolveSurveyOffset();

// ── Wells — top-level panel section ─────────────────────────────────────────
const wellFolder = gui.addFolder('Wells');
_trackFolder(wellFolder, 'Wells');

const wellPosFolder = wellFolder.addFolder('Position');
function applyWellOffset() {
    wellGroup.position.x = params.wellOffsetEastKm * 1000;
    wellGroup.position.z = -params.wellOffsetNorthKm * 1000;
    wellGroup.position.y = -params.wellDepthOffsetM;
    wellGroup.rotation.y = -params.wellRotationDeg * Math.PI / 180;
    wellGroup.scale.set(params.wellScale, params.wellScale, params.wellScale);
}
wellPosFolder.add(params, 'wellOffsetEastKm', -30, 30, 0.5).name('East/West (km)').onChange(applyWellOffset);
wellPosFolder.add(params, 'wellOffsetNorthKm', -25, 25, 0.5).name('North/South (km)').onChange(applyWellOffset);
wellPosFolder.add(params, 'wellRotationDeg', -180, 180, 1).name('Rotation (°)').onChange(applyWellOffset);
wellPosFolder.add(params, 'wellScale', 0.1, 5, 0.1).name('Scale').onChange(applyWellOffset);
wellPosFolder.add(params, 'wellDepthOffsetM', -3000, 3000, 10).name('Depth Offset (m)').onChange(applyWellOffset);
applyWellOffset();

const wellTrajFolder = wellFolder.addFolder('Trajectory');
wellTrajFolder.add(params, 'showLateral1').name('Lateral 1').onChange(() => buildWellTrajectories());
wellTrajFolder.addColor(params, 'lat1Color').name('Lat 1 Color').onChange(() => buildWellTrajectories());
wellTrajFolder.add(params, 'showLateral2').name('Lateral 2').onChange(() => buildWellTrajectories());
wellTrajFolder.addColor(params, 'lat2Color').name('Lat 2 Color').onChange(() => buildWellTrajectories());
wellTrajFolder.add(params, 'lat2RotationDeg', -180, 180, 1).name('Lat 2/4 Rotation (°)').onChange(() => buildWellTrajectories());
wellTrajFolder.add(params, 'showLateral3').name('Lateral 3').onChange(() => buildWellTrajectories());
wellTrajFolder.addColor(params, 'lat3Color').name('Lat 3 Color').onChange(() => buildWellTrajectories());
wellTrajFolder.add(params, 'showLateral4').name('Lateral 4').onChange(() => buildWellTrajectories());
wellTrajFolder.addColor(params, 'lat4Color').name('Lat 4 Color').onChange(() => buildWellTrajectories());
wellTrajFolder.add(params, 'wellPathStyle', ['tube', 'dots']).name('Path Style').onChange(() => buildWellTrajectories());
wellTrajFolder.add(params, 'wellTubeRadius', 1, 30, 1).name('Tube Radius (m)').onChange(() => buildWellTrajectories());
wellTrajFolder.add(params, 'wellDotSize', 1, 15, 0.5).name('Dot Size (m)').onChange(() => buildWellTrajectories());
wellTrajFolder.add(params, 'wellDotSpacing', 5, 100, 5).name('Dot Spacing (m)').onChange(() => buildWellTrajectories());

const wellTargetFolder = wellFolder.addFolder('Targets');
wellTargetFolder.add(params, 'wellShowTargets').name('Show All Targets').onChange(() => buildWellTrajectories());
wellTargetFolder.add(params, 'showLat1Targets').name('Lat 1 Targets').onChange(() => buildWellTrajectories());
wellTargetFolder.add(params, 'showLat2Targets').name('Lat 2 Targets').onChange(() => buildWellTrajectories());
wellTargetFolder.addColor(params, 'wellTargetColor').name('Color').onChange(() => buildWellTrajectories());
wellTargetFolder.add(params, 'wellTargetSize', 10, 200, 5).name('Size (m)').onChange(() => buildWellTrajectories());
wellTargetFolder.add(params, 'wellTargetOpacity', 0.05, 0.8, 0.05).name('Opacity').onChange(() => buildWellTrajectories());
wellTargetFolder.add(params, 'lat1LP1Position', 0, 5, 0.1).name('LP1 Position').onChange(() => buildWellTrajectories());



// Build wells on first load
buildWellTrajectories();

// ── Regional Context — top-level panel section ──────────────────────────────
const regionalFolder = gui.addFolder('Regional Context');
_trackFolder(regionalFolder, 'Regional Context');
regionalFolder.add(params, 'regionalFitToBase').name('Fit to Norne Base')
    .onChange(() => { recomputeFitBlend(); applyRegionalBlend(params.regionalBlendKm); });
regionalFolder.add(params, 'regionalFitToVolve').name('Fit to Hugin Fm Base')
    .onChange(() => { recomputeFitBlend(); applyRegionalBlend(params.regionalBlendKm); });
regionalFolder.add(params, 'regionalVisible').name('Show Surface').onChange(v => {
    if (regionalMesh) { regionalMesh.visible = v && params.regionalOpacity > 0; }
});
regionalFolder.add(params, 'regionalOpacity', 0, 1, 0.01).name('Surface Opacity').onChange(v => {
    if (regionalMesh) {
        regionalMesh.material.opacity = v;
        regionalMesh.visible = params.regionalVisible && v > 0;
        regionalMesh.material.needsUpdate = true;
    }
});
regionalFolder.add(params, 'regionalTopologyFalloff').name('Topology Falloff').onChange(() => {
    rebuildRegionalPrior();
});
regionalFolder.add(params, 'regionalBlendKm', 0, 60, 0.5).name('Topology Falloff (km)').onChange(() => {
    rebuildRegionalPrior();
});
regionalFolder.add(params, 'regionalFitBlendKm', 0.5, 15, 0.5).name('Fit Blend (km)').onChange(() => {
    if (params.regionalFitToBase || params.regionalFitToVolve) applyRegionalBlend(params.regionalBlendKm);
});
regionalFolder.add(params, 'regionalWireframe').name('Wireframe').onChange(v => {
    if (regionalMesh) { regionalMesh.material.wireframe = v; regionalMesh.material.needsUpdate = true; }
});

const regionalTopoFolder = regionalFolder.addFolder('Topology Lines');
_trackFolder(regionalTopoFolder, 'Regional Topology Lines');

regionalTopoFolder.add(params, 'regionalContourSmooth', 0, 8, 1).name('Smoothing').onChange(v => {
    smoothRegionalContourY(v);
});

regionalTopoFolder.add(params, 'regionalShowContours').name('Enable').onChange(v => {
    if (regionalContourMesh) regionalContourMesh.visible = v;
});

regionalTopoFolder.add(params, 'regionalContourInterval', 10, 500, 1).name('Interval').onChange(v => {
    if (regionalContourMesh) regionalContourMesh.material.uniforms.interval.value = v;
});

regionalTopoFolder.add(params, 'regionalContourThickness', 0.5, 5.0, 0.1).name('Thickness').onChange(v => {
    if (regionalContourMesh) regionalContourMesh.material.uniforms.thickness.value = v;
});

regionalTopoFolder.add(params, 'regionalContourOpacity', 0.05, 1.0, 0.01).name('Opacity').onChange(v => {
    if (regionalContourMesh) regionalContourMesh.material.uniforms.opacity.value = v;
});

regionalTopoFolder.addColor(params, 'regionalContourColor').name('Color').onChange(v => {
    if (regionalContourMesh) regionalContourMesh.material.uniforms.lineColor.value.set(v);
});


// ─────────────────────────────────────────────────────────────
// NORNE FIELD
// ─────────────────────────────────────────────────────────────

async function initNorneData() {
    console.log('Starting initNorneData...');
    updateLoading('Fetching Norne Field Data...');

    // Load horizons and faults in parallel
    // All Norne fault CSV files extracted from IRAP_1005.GRDECL + FAULT_JUN_05.INC
    // Grouped by structural family with a distinct colour per family.
    const faultDefs = [
        // Main border faults
        { file: 'Fault_m_west.csv',          name: 'm_west',         color: 0xFFD700 },
        { file: 'Fault_m_east.csv',           name: 'm_east',         color: 0xFF4500 },
        { file: 'Fault_norne_m_north.csv',    name: 'm_north',        color: 0xFF6B35 },
        { file: 'Fault_norne_m_northe.csv',   name: 'm_northe',       color: 0xFF8C42 },
        { file: 'Fault_norne_m_east_2.csv',   name: 'm_east_2',       color: 0xFFA040 },
        // BC / Big Central family
        { file: 'Fault_norne_BC.csv',         name: 'BC',             color: 0x4ECDC4 },
        { file: 'Fault_norne_B2.csv',         name: 'B2',             color: 0x6EE0D8 },
        // EF / GH / IH backbone faults
        { file: 'Fault_norne_EF.csv',         name: 'EF',             color: 0xA8DADC },
        { file: 'Fault_norne_GH.csv',         name: 'GH',             color: 0x457B9D },
        { file: 'Fault_norne_IH.csv',         name: 'IH',             color: 0x1D3557 },
        // DE family
        { file: 'Fault_norne_DE_0.csv',       name: 'DE_0',           color: 0xE63946 },
        { file: 'Fault_norne_DE_B3.csv',      name: 'DE_B3',          color: 0xEF6E6E },
        { file: 'Fault_norne_DE_1.csv',       name: 'DE_1',           color: 0xF4A261 },
        { file: 'Fault_norne_DE_1_LTo.csv',   name: 'DE_1_LTo',       color: 0xE9C46A },
        { file: 'Fault_norne_DE_2.csv',       name: 'DE_2',           color: 0xF4D35E },
        // DI family
        { file: 'Fault_norne_DI.csv',         name: 'DI',             color: 0x2A9D8F },
        { file: 'Fault_norne_DI_S.csv',       name: 'DI_S',           color: 0x57CC99 },
        // CD family
        { file: 'Fault_norne_CD_0.csv',       name: 'CD_0',           color: 0xC77DFF },
        { file: 'Fault_norne_CD_B3.csv',      name: 'CD_B3',          color: 0x9D4EDD },
        { file: 'Fault_norne_CD.csv',         name: 'CD',             color: 0x7B2FBE },
        { file: 'Fault_norne_CD_To.csv',      name: 'CD_To',          color: 0x5C2187 },
        { file: 'Fault_norne_CD_1.csv',       name: 'CD_1',           color: 0x3A1060 },
        // D family
        { file: 'Fault_norne_D_05.csv',       name: 'D_05',           color: 0xFB8500 },
        // E family
        { file: 'Fault_norne_E_01.csv',       name: 'E_01',           color: 0xFF006E },
        { file: 'Fault_norne_E_01_F3.csv',    name: 'E_01_F3',        color: 0xFF5C8A },
        // G family
        { file: 'Fault_norne_G_01.csv',       name: 'G_01',           color: 0x06D6A0 },
        { file: 'Fault_norne_G_02.csv',       name: 'G_02',           color: 0x1B9AAA },
        { file: 'Fault_norne_G_03.csv',       name: 'G_03',           color: 0x06A3B7 },
        { file: 'Fault_norne_G_05.csv',       name: 'G_05',           color: 0x0DCEDA },
        { file: 'Fault_norne_G_07.csv',       name: 'G_07',           color: 0x00F5D4 },
        { file: 'Fault_norne_G_08.csv',       name: 'G_08',           color: 0x00BBF9 },
        { file: 'Fault_norne_G_09.csv',       name: 'G_09',           color: 0x0077B6 },
        { file: 'Fault_norne_G_13.csv',       name: 'G_13',           color: 0x023E8A },
        // H family
        { file: 'Fault_norne_H_03.csv',       name: 'H_03',           color: 0xF72585 },
        // C family (many small cross-faults)
        { file: 'Fault_norne_C_01.csv',       name: 'C_01',           color: 0xB5179E },
        { file: 'Fault_norne_C_01_Ti.csv',    name: 'C_01_Ti',        color: 0xC45EAD },
        { file: 'Fault_norne_C_02.csv',       name: 'C_02',           color: 0xD4A5C9 },
        { file: 'Fault_norne_C_04.csv',       name: 'C_04',           color: 0xA0BBDD },
        { file: 'Fault_norne_C_05.csv',       name: 'C_05',           color: 0x80A8D0 },
        { file: 'Fault_norne_C_06.csv',       name: 'C_06',           color: 0x6095C3 },
        { file: 'Fault_norne_C_08.csv',       name: 'C_08',           color: 0x4082B6 },
        { file: 'Fault_norne_C_08_Ile.csv',   name: 'C_08_Ile',       color: 0x346FA3 },
        { file: 'Fault_norne_C_08_S.csv',     name: 'C_08_S',         color: 0x285C90 },
        { file: 'Fault_norne_C_08_S_Ti.csv',  name: 'C_08_S_Ti',      color: 0x1C497D },
        { file: 'Fault_norne_C_08_Ti.csv',    name: 'C_08_Ti',        color: 0x10366A },
        { file: 'Fault_norne_C_09.csv',       name: 'C_09',           color: 0xF9C74F },
        { file: 'Fault_norne_C_10.csv',       name: 'C_10',           color: 0xF8961E },
        { file: 'Fault_norne_C_12.csv',       name: 'C_12',           color: 0xF3722C },
        { file: 'Fault_norne_C_20.csv',       name: 'C_20',           color: 0x90BE6D },
        { file: 'Fault_norne_C_20_LTo.csv',   name: 'C_20_LTo',       color: 0x79A855 },
        { file: 'Fault_norne_C_21.csv',       name: 'C_21',           color: 0x62923D },
        { file: 'Fault_norne_C_21_Ti.csv',    name: 'C_21_Ti',        color: 0x4B7C25 },
        { file: 'Fault_norne_C_22.csv',       name: 'C_22',           color: 0x34660D },
        { file: 'Fault_norne_C_23.csv',       name: 'C_23',           color: 0xAACC00 },
        { file: 'Fault_norne_C_24.csv',       name: 'C_24',           color: 0xBBDF00 },
        { file: 'Fault_norne_C_25.csv',       name: 'C_25',           color: 0xCCF200 },
        { file: 'Fault_norne_C_26.csv',       name: 'C_26',           color: 0xDDFF00 },
        { file: 'Fault_norne_C_26N.csv',      name: 'C_26N',          color: 0xEEFF33 },
        { file: 'Fault_norne_C_27.csv',       name: 'C_27',           color: 0xFFFF66 },
        { file: 'Fault_norne_C_28.csv',       name: 'C_28',           color: 0xFFEE44 },
        { file: 'Fault_norne_C_29.csv',       name: 'C_29',           color: 0xFFDD22 },
    ];

    const [horizonResults, faultResults] = await Promise.all([
        Promise.all([
            loadHorizon('Åre Fm Top',   'Norne_Are_Top_hires.csv',   0xFF6B6B),
            loadHorizon('Tilje Fm Top', 'Norne_Tilje_Top_hires.csv', 0xFFAA44),
            loadHorizon('Ile Fm Top',   'Norne_Ile_Top_hires.csv',   0xFFDD22),
            loadHorizon('Tofte Fm Top', 'Norne_Tofte_Top_hires.csv', 0x66CC66),
            loadHorizon('Garn Fm Top',  'Norne_Garn_Top_hires.csv',  0x4ECDC4),
            loadHorizon('Not Fm Top',   'Norne_Not_Top_hires.csv',   0x45B7D1),
            loadHorizon('Norne Base',   'Norne_Base_hires.csv',      0x9B59B6)
        ]),


        Promise.all(faultDefs.map(fd => loadFault(fd.name, fd.file, fd.color)))
    ]);

    const validHorizons = horizonResults.filter(h => h !== null);
    const validFaults = faultResults.filter(f => f !== null);
    console.log(`Loaded ${validHorizons.length} horizons, ${validFaults.length} faults`);

    if (validHorizons.length === 0 && validFaults.length === 0) {
        updateLoading('Error: No Norne data loaded.');
        return;
    }

    updateLoading('Processing Norne Geometry...');

    // Center calculation — use first horizon if available, else first fault
    let centerX, centerY;
    if (validHorizons.length > 0) {
        const ref = validHorizons[0];
        const keys = Object.keys(ref.data);
        const sampleSize = Math.min(keys.length, 1000);
        let sumX = 0, sumY = 0;
        for (let i = 0; i < sampleSize; i++) {
            const pt = ref.data[keys[i]];
            sumX += pt.x; sumY += pt.y;
        }
        centerX = sumX / sampleSize;
        centerY = sumY / sampleSize;
    } else {
        const pts = validFaults[0].pts;
        const n = Math.min(pts.length, 500);
        let sumX = 0, sumY = 0;
        for (let i = 0; i < n; i++) { sumX += pts[i].x; sumY += pts[i].y; }
        centerX = sumX / n; centerY = sumY / n;
    }
    console.log(`Norne center: ${centerX.toFixed(1)}, ${centerY.toFixed(1)}`);

    // ── Horizon meshes (stride-aware: IL/XL step by 10 in Norne CSV) ──
    validHorizons.forEach(h => {
        // Compute stride from the actual IL/XL values
        const allILs = [...new Set(Object.keys(h.data).map(k => parseInt(k.split('_')[0])))].sort((a,b) => a-b);
        const allXLs = [...new Set(Object.keys(h.data).map(k => parseInt(k.split('_')[1])))].sort((a,b) => a-b);
        const strideIL = allILs.length > 1 ? allILs[1] - allILs[0] : 1;
        const strideXL = allXLs.length > 1 ? allXLs[1] - allXLs[0] : 1;
        const width = allILs.length;
        const height = allXLs.length;
        console.log(`Norne mesh "${h.name}": ${width} x ${height}, stride IL=${strideIL} XL=${strideXL}`);

        if (width <= 0 || height <= 0) {
            console.error(`Invalid grid for ${h.name}: ${width}x${height}`);
            return;
        }

        const geometry = new THREE.PlaneGeometry(1, 1, width - 1, height - 1);
        const posAttr = geometry.attributes.position;
        const invalidIndices = new Set();

        for (let ix = 0; ix < width; ix++) {
            for (let iy = 0; iy < height; iy++) {
                // Use actual IL/XL values as keys (not sequential offsets)
                const ilVal = allILs[ix];
                const xlVal = allXLs[iy];
                const pt = h.data[`${ilVal}_${xlVal}`];
                const idx = iy * width + ix;
                if (pt) {
                    posAttr.setXYZ(idx, pt.x - centerX, -pt.z, -(pt.y - centerY));
                } else {
                    invalidIndices.add(idx);
                    posAttr.setXYZ(idx, 0, 0, 0);
                }
            }
        }

        // Remove degenerate triangles
        const rawIndices = geometry.index.array;
        const cleanIndices = [];
        for (let i = 0; i < rawIndices.length; i += 3) {
            const a = rawIndices[i], b = rawIndices[i + 1], c = rawIndices[i + 2];
            if (!invalidIndices.has(a) && !invalidIndices.has(b) && !invalidIndices.has(c)) {
                cleanIndices.push(a, b, c);
            }
        }
        geometry.setIndex(cleanIndices);
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();

        const material = new THREE.MeshPhongMaterial({
            color: h.color,
            side: THREE.DoubleSide,
            shininess: 40,
            depthWrite: true  // horizon writes depth buffer to occlude regional contour layer
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.originalColor = h.color;
        mesh.userData.layerName = h.name;
        mesh.userData.isHorizon = true;
        mesh.userData.centerX = centerX;
        mesh.userData.centerY = centerY;
        mesh.userData.rawHorizonPos = Float32Array.from(geometry.attributes.position.array);
        norneSurveyGroup.add(mesh);


        // Contour overlay
        const cMesh = new THREE.Mesh(geometry, contourMaterial.clone());
        cMesh.visible = false;
        cMesh.renderOrder = 1;
        cMesh.userData.isContour = true;
        cMesh.userData.layerName = h.name;
        norneSurveyGroup.add(cMesh);
    });

    // ── Fault meshes: fault-stick ribbon approach ──────────────────────────
    // Geologists interpret faults as "sticks" — one vertical line per seismic
    // section. The surface is built by connecting adjacent sticks with panels.
    // We group points by their trace position (one stick per XL/IL column),
    // sort each stick by real-world depth Z, then connect adjacent sticks with
    // depth-matched triangle strips and per-strip local edge culling.
    validFaults.forEach(f => {
        const pts = f.pts;
        if (!pts || pts.length === 0) return;

        const uniqueILs = [...new Set(pts.map(p => p.il))].sort((a,b) => a-b);
        const uniqueXLs = [...new Set(pts.map(p => p.xl))].sort((a,b) => a-b);

        // The axis with more unique values is the "trace" direction
        const traceVals = uniqueILs.length >= uniqueXLs.length ? uniqueILs : uniqueXLs;
        const traceKey  = uniqueILs.length >= uniqueXLs.length ? 'il' : 'xl';
        const traceW    = traceVals.length;

        // Build sticks keyed by (il, xl) pair so that IL positions with multiple XL
        // branches (like m_north) don't merge separate fence lines into one stick.
        const stickMap = new Map();
        pts.forEach(p => {
            const key = `${p.il}_${p.xl}`;
            if (!stickMap.has(key)) stickMap.set(key, []);
            stickMap.get(key).push(p);
        });
        // Sort each stick by real-world depth Z (ascending)
        stickMap.forEach(stick => stick.sort((a, b) => a.z - b.z));

        // Build array of valid sticks (≥2 points)
        const allSticks = [...stickMap.values()].filter(s => s.length >= 2);
        if (allSticks.length < 2) {
            const positions = new Float32Array(pts.length * 3);
            pts.forEach((p, i) => {
                positions[i*3]   = p.x - centerX;
                positions[i*3+1] = -p.z;
                positions[i*3+2] = -(p.y - centerY);
            });
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const cloud = new THREE.Points(geo, new THREE.PointsMaterial({
                color: f.color, size: 12, sizeAttenuation: true,
                transparent: true, opacity: 0.8
            }));
            cloud.userData = { layerName: f.name, originalColor: f.color, isFault: true };
            norneSurveyGroup.add(cloud);
            return;
        }

        // Sort sticks spatially along the fault's principal XY direction.
        // Compute each stick's centroid, find the dominant axis, then sort by projection.
        const centroids = allSticks.map(s => ({
            x: s.reduce((a, p) => a + p.x, 0) / s.length,
            y: s.reduce((a, p) => a + p.y, 0) / s.length
        }));
        const cx = centroids.reduce((a, c) => a + c.x, 0) / centroids.length;
        const cy = centroids.reduce((a, c) => a + c.y, 0) / centroids.length;
        // PCA: pick the axis with the largest variance
        const dxArr = centroids.map(c => c.x - cx);
        const dyArr = centroids.map(c => c.y - cy);
        const varX  = dxArr.reduce((a, d) => a + d*d, 0);
        const varY  = dyArr.reduce((a, d) => a + d*d, 0);
        // Sort by projection onto the dominant axis
        // Douglas-Peucker simplification: collapse near-collinear K-layer points.
        // epsilon=20m — well above the ~3m K-spacing but small vs 280m cross-stick width.
        const STICK_EPS = 20;
        const sortedSticks = allSticks
            .map((s, i) => ({ s, proj: varX >= varY ? dxArr[i] : dyArr[i] }))
            .sort((a, b) => a.proj - b.proj)
            .map(o => simplifyStick(o.s, STICK_EPS))  // ← D-P: collapse near-collinear K points
            .filter(s => s.length >= 2);               // need at least 2 pts after simplification




        // Build all-in-one BufferGeometry from per-strip ribbon panels
        const vertFloats = [];
        const triIndices = [];
        const validStripIndices = []; // indices into sortedSticks pairs that pass strip distance check
        let vBase = 0;

        // Pre-compute fault-wide global cross-stick median.
        // Used to skip stray end-fray strips and cull individual long triangles.
        const dist3 = (a, b) => Math.hypot(b.x-a.x, b.y-a.y, b.z-a.z);
        const allCrossD = [];
        for (let t = 0; t < sortedSticks.length - 1; t++) {
            const sA = sortedSticks[t], sB = sortedSticks[t + 1];
            if (!sA || !sB) continue;
            const mn = Math.min(sA.length, sB.length);
            for (let i = 0; i < mn; i++) allCrossD.push(dist3(sA[i], sB[i]));
        }
        allCrossD.sort((a, b) => a - b);
        const globalCrossMedian = allCrossD[Math.floor(allCrossD.length * 0.5)] ?? 1e9;
        const maxStripDist = globalCrossMedian * 2.0;  // skip whole strip if too wide
        const maxTriEdge   = globalCrossMedian * 2.5;  // cull individual long triangles


        for (let t = 0; t < sortedSticks.length - 1; t++) {
            const sA = sortedSticks[t];
            const sB = sortedSticks[t + 1];
            if (!sA || !sB || sA.length < 2 || sB.length < 2) continue;

            // Skip strip if median cross-stick distance exceeds the global reference
            // (catches end-fray sticks that the spatial sort placed far from their true neighbours).
            const minN = Math.min(sA.length, sB.length);
            const stripCD = [];
            for (let i = 0; i < minN; i++) stripCD.push(dist3(sA[i], sB[i]));
            stripCD.sort((a, b) => a - b);
            const stripMedian = stripCD[Math.floor(stripCD.length * 0.5)] ?? 1e9;
            if (stripMedian > maxStripDist) continue;

            const maxEdge = maxTriEdge;
            validStripIndices.push(t); // track which strips make it into the vertex buffer


            // Add vertex positions for this strip
            const baseA = vBase;
            sA.forEach(p => {
                vertFloats.push(p.x - centerX, -p.z, -(p.y - centerY));
                vBase++;
            });
            const baseB = vBase;
            sB.forEach(p => {
                vertFloats.push(p.x - centerX, -p.z, -(p.y - centerY));
                vBase++;
            });

            // Zipper merge: advance through both sticks by depth, creating quads
            // Each iteration: advance whichever stick's next point is shallower
            // to keep the strip Z-monotone and avoid crossing triangles.
            const nA = sA.length, nB = sB.length;
            let ia = 0, ib = 0;
            while (ia < nA - 1 || ib < nB - 1) {
                const aHas = ia < nA - 1;
                const bHas = ib < nB - 1;
                let advA, advB;

                if (aHas && bHas) {
                    // Advance the stick whose NEXT point is shallower
                    advA = sA[ia + 1].z <= sB[ib + 1].z;
                    advB = !advA;
                } else {
                    advA = aHas;
                    advB = bHas;
                }

                // Triangle winding: looking from outside (from sB toward sA), keep CCW.
                // advance-A: sA moves deeper → (B_cur, A_cur, A_next) winds CCW from outside
                // advance-B: sB moves deeper → (A_cur, B_next, B_cur) winds CCW from outside
                if (advA) {
                    const pA0 = sA[ia], pA1 = sA[ia + 1], pB0 = sB[ib];
                    const maxE = Math.max(dist3(pA0, pA1), dist3(pA1, pB0), dist3(pA0, pB0));
                    if (maxE <= maxEdge) triIndices.push(baseB+ib, baseA+ia, baseA+ia+1);
                    ia++;
                } else {
                    const pA0 = sA[ia], pB0 = sB[ib], pB1 = sB[ib + 1];
                    const maxE = Math.max(dist3(pA0, pB0), dist3(pB0, pB1), dist3(pA0, pB1));
                    if (maxE <= maxEdge) triIndices.push(baseA+ia, baseB+ib+1, baseB+ib);
                    ib++;
                }
            }
        }

        if (triIndices.length === 0) return;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertFloats, 3));
        geometry.setIndex(triIndices);
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();

        const material = new THREE.MeshPhongMaterial({
            color: f.color,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.75,
            shininess: 10,       // low specular — avoids glare on near-planar surfaces
            specular: 0x222222,
            flatShading: params.flatShading  // respect the Sharp/Flat toggle state
        });


        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.originalColor = f.color;
        mesh.userData.layerName = f.name;
        mesh.userData.isFault = true;
        // Store canonical (pre-smooth) sticks for centroid-path smoothing
        mesh.userData.canonicalSticks = sortedSticks.map(s => s.map(p => ({...p})));
        mesh.userData.validStripIndices = validStripIndices;
        mesh.userData.centerX = centerX;
        mesh.userData.centerY = centerY;
        norneSurveyGroup.add(mesh);

    });


    // Tag fault result objects so initLayerControls can detect them
    validFaults.forEach(f => { f.isFault = true; });

    // ── Camera and lighting ──────────────────────────────────
    const box = new THREE.Box3().setFromObject(modelGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    if (mainLight) scene.remove(mainLight);
    mainLight = new THREE.DirectionalLight(0xffffff, 1.15);
    mainLight.position.set(center.x, center.y + Math.max(size.x, size.z) * 2, center.z);
    mainLight.target.position.copy(center);
    scene.add(mainLight);
    scene.add(mainLight.target);

    const viewVector = new THREE.Vector3(-1427.66, 2580.91, -5574.77).normalize();
    const maxDim = Math.max(size.x, size.y, size.z);
    const viewDistance = Math.max(maxDim * 1.5, 4000);
    controls.target.copy(center).add(new THREE.Vector3(0, -maxDim * 0.2, 0));
    camera.position.copy(controls.target.clone().add(viewVector.multiplyScalar(viewDistance)));
    camera.near = 10;
    camera.far = viewDistance * 20;
    camera.updateProjectionMatrix();

    // ── Layer controls ───────────────────────────────────────
    const allLayers = [...validHorizons, ...validFaults];
    initLayerControls(allLayers);
    applyFaultSmoothing(params.faultSmoothIterations);
    applyHorizonDepthExag(params.horizonDepthExag);
    loadRegionalHorizon(); // async — adds ghost surface once CSV loads


    // Apply ALL stored settings to the scene (wireframe, zScale, lighting,
    // flatShading, depth coloring, contour uniforms, layer visibility, etc.)
    applyState(getCurrentState());

    // Refresh Default preset snapshot + dropdown for this dataset
    initPresets();

    hideLoading();

}

// ─────────────────────────────────────────────────────────────
// SCENE MANAGEMENT
// ─────────────────────────────────────────────────────────────

function clearScene() {
    // Dispose all survey objects from both survey groups
    [norneSurveyGroup, volveSurveyGroup].forEach(group => {
        while (group.children.length > 0) {
            const obj = group.children[0];
            group.remove(obj);
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material?.dispose();
        }
    });
    // Dispose regional objects from modelGroup (skip survey groups)
    for (let i = modelGroup.children.length - 1; i >= 0; i--) {
        const obj = modelGroup.children[i];
        if (obj === norneSurveyGroup || obj === volveSurveyGroup) continue;
        modelGroup.remove(obj);
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material?.dispose();
    }
    // Rebuild the Horizons and Faults folders so only new-field layers appear
    horizonBBox  = null; // geometry was disposed by the loop above
    volveBBox    = null;
    seismicPanel = null; // likewise
    _obbState    = null;
    horizonFolder.destroy();
    horizonFolder = gui.addFolder('Horizons');
    _trackFolder(horizonFolder, 'Horizons');
    addHorizonPanelControls(); // re-attach depth exag + bbox controls to new folder

    faultFolder.destroy();
    faultFolder = gui.addFolder('Faults');
    _trackFolder(faultFolder, 'Faults');
    faultFolder.close();
}


// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// COMPASS HUD
// ─────────────────────────────────────────────────────────────
const compassEl = document.createElement('div');
compassEl.id = 'compass-hud';
compassEl.innerHTML = `
<svg viewBox="-50 -50 100 100" width="80" height="80">
  <circle cx="0" cy="0" r="46" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
  <!-- Tick marks -->
  <line x1="0" y1="-42" x2="0" y2="-36" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
  <line x1="0" y1="36" x2="0" y2="42" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
  <line x1="-42" y1="0" x2="-36" y2="0" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
  <line x1="36" y1="0" x2="42" y2="0" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
  <!-- North needle (red) -->
  <polygon points="0,-34 -5,-8 5,-8" fill="#e74c3c" opacity="0.9"/>
  <!-- South needle (white) -->
  <polygon points="0,34 -5,8 5,8" fill="rgba(255,255,255,0.35)"/>
  <!-- Labels -->
  <text x="0" y="-22" text-anchor="middle" font-size="11" font-weight="700" fill="#e74c3c" font-family="Inter,sans-serif">N</text>
  <text x="0" y="28" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.4)" font-family="Inter,sans-serif">S</text>
  <text x="26" y="4" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.4)" font-family="Inter,sans-serif">E</text>
  <text x="-26" y="4" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.4)" font-family="Inter,sans-serif">W</text>
  <!-- Center dot -->
  <circle cx="0" cy="0" r="3" fill="rgba(255,255,255,0.6)"/>
</svg>`;
compassEl.style.cssText = 'position:fixed;bottom:24px;left:24px;z-index:100;pointer-events:none;';
document.body.appendChild(compassEl);
const compassSvg = compassEl.querySelector('svg');

function updateCompass() {
    // Camera look direction projected onto XZ plane
    // In this scene: +X = East, -Z = North
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    // atan2 gives angle from +X axis; we want angle from North (-Z)
    // North (-Z) is at angle = π/2 from +X in standard atan2
    const azimuth = Math.atan2(dir.x, -dir.z); // radians, 0 = looking north
    compassSvg.style.transform = `rotate(${-azimuth * 180 / Math.PI}deg)`;
}

// ─────────────────────────────────────────────────────────────
// ANIMATE
// ─────────────────────────────────────────────────────────────
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    updateCompass();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Boot — load both fields simultaneously
(async () => {
    await initNorneData();   // Norne first (owns regional surface + camera setup)
    await initVolveData();   // Volve overlaid on the same regional context

    // Post-boot fixup: Volve wasn't loaded when applyState ran during initNorneData,
    // so re-apply fit blend and per-layer opacity/depthWrite for all horizons.
    recomputeFitBlend();
    if (params.regionalFitToBase || params.regionalFitToVolve) {
        applyRegionalBlend(params.regionalBlendKm);
    }

    // Rebuild bounding boxes now that both surveys have their horizons loaded
    buildHorizonBBox();

    // Re-apply stored opacity + depthWrite for layers loaded after applyState
    allSurveyChildren().forEach(c => {
        if (c.userData.layerName) {
            try {
                const saved = JSON.parse(localStorage.getItem('geo_layer_' + c.userData.layerName) || 'null');
                if (saved && saved.opacity !== undefined) {
                    c.material.transparent = true;
                    c.material.opacity = saved.opacity;
                    c.material.depthWrite = saved.opacity >= 1;
                    c.material.needsUpdate = true;
                }
            } catch(e) {}
        }
    });
})();
animate();
