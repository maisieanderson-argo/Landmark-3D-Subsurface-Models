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
        console.log(`Mesh built with ${validPoints} valid vertices out of ${width * height} total grid points`);

        // CLEANUP INDICES: Remove triangles connected to invalid vertices
        const indexAttr = geometry.index;
        const indices = indexAttr.array;
        const newIndices = [];

        for (let i = 0; i < indices.length; i += 3) {
            const a = indices[i];
            const b = indices[i + 1];
            const c = indices[i + 2];

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
            metalness: 0.2,
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

    // Apply ALL stored settings to the scene (wireframe, zScale, lighting,
    // flatShading, depth coloring, contour uniforms, layer visibility, etc.)
    // This is the canonical "restore from localStorage" step — do not remove.
    applyState(getCurrentState());

    // Initialize Presets (Capture Default)
    initPresets();

    hideLoading();
}

// Add Custom UI Styles and HTML
const uiStyles = document.createElement('style');
uiStyles.textContent = `
    .preset-bar {
        display: flex;
        gap: 8px;
        align-items: center;
        color: #eee;
        font-family: sans-serif;
        font-size: 13px;
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
// Move preset bar inline with the field picker
const _presetBar = uiContainer.querySelector('.preset-bar');
if (_presetBar) {
    const _datasetSel = document.getElementById('dataset-selector');
    if (_datasetSel) {
        _datasetSel.style.cssText += ';display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:10px;';
        _datasetSel.appendChild(_presetBar);
    }
}

window.closeModal = (id) => {
    document.getElementById(id).style.display = 'none';
};

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
    horizonTextureAmp: 0,      // 0 = smooth, 10 = full geological texture
    subregionEnabled: false,   // show HD survey subregion box
    subregionX: 0,             // scene X centre of box (metres from field centre)
    subregionZ: 0,             // scene Z centre of box
    subregionW: 1000,          // box E-W width (m)
    subregionD: 2500,          // box N-S depth (m)
    useVolveTexture: true,     // use real Volve BCU residual instead of synthetic fBm
    faultColorMode: 'original',// 'original' | 'uniform' | 'warm' | 'cool' | 'earth' | 'mono'
    faultSingleColor: '#aaaaaa',
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
    // ── Horizon footprint bounding box ───────────────────────────────────────
    horizonBBoxVisible: false,         // show auto-fitted horizon footprint box
    horizonBBoxColor: '#ffffff',       // wireframe colour
    // ── Per-horizon depth exaggeration ───────────────────────────────────────
    horizonDepthExag: 1.0,             // 1 = true scale; >1 spreads layers apart
    // Seismic crossline panel
    seismicPanelVisible: true,         // toggle the crossline plane
    seismicPanelOpacity: 0.9,          // 0 = transparent, 1 = fully opaque
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

// ── Horizon texture (fBm noise displacement) ─────────────────────────────────
// Simple 3-octave value noise applied as a Y-axis (depth) displacement.
// Noise is deterministic (seed via sine hash) so it's consistent on reload.
function _hash2(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
}
function _smoothNoise2(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = _hash2(ix,   iy),   b = _hash2(ix+1, iy);
    const c = _hash2(ix,   iy+1), d = _hash2(ix+1, iy+1);
    return a + (b-a)*ux + (c-a)*uy + (b-a+d-c-b+a)*ux*uy - 0.5; // centre on 0
}
function _fbm2(wx, wy) {
    // Three octaves: large compaction drape, medium bedform, fine fabric
    //   octave 1: 800m wavelength, amplitude scale=1.0
    //   octave 2: 200m wavelength, amplitude scale=0.4
    //   octave 3: 50m  wavelength, amplitude scale=0.15
    const OCTAVES = [[1/800, 1.0], [1/200, 0.4], [1/50, 0.15]];
    let v = 0;
    for (const [freq, amp] of OCTAVES) v += _smoothNoise2(wx*freq, wy*freq) * amp;
    return v; // range roughly ±0.77
}

// HD survey subregion: white wireframe box + fBm noise only inside footprint.
// ── Volve BCU real-data texture ──────────────────────────────────────────────
// Loaded once at startup; null while loading or if file absent.
let volveTexture = null;
(async () => {
    try {
        const r = await fetch('volve_bcu_texture.json');
        if (r.ok) {
            volveTexture = await r.json();
            console.log('Volve texture loaded:', volveTexture.rows, '×', volveTexture.cols);
            // Re-apply texture now that real data is available
            if (params.useVolveTexture && params.subregionEnabled && params.horizonTextureAmp > 0) {
                applyHorizonTexture(params.horizonTextureAmp);
                updateColoring();
            }
        }
    } catch(e) { console.warn('Volve texture unavailable, using fBm fallback'); }
})();

// Bilinear sample from the Volve texture, tiling in both axes.
function _sampleVolveTexture(u, v) {
    if (!volveTexture) return 0;
    const rows = volveTexture.rows, cols = volveTexture.cols, data = volveTexture.data;
    u = ((u % 1) + 1) % 1;
    v = ((v % 1) + 1) % 1;
    const x = u * (cols - 1), y = v * (rows - 1);
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const r0 = data[iy], r1 = data[Math.min(iy+1, rows-1)];
    const c1 = Math.min(ix+1, cols-1);
    return r0[ix]*(1-fx)*(1-fy) + r0[c1]*fx*(1-fy) + r1[ix]*(1-fx)*fy + r1[c1]*fx*fy;
}

let subregionBox = null; // THREE.LineSegments for the white bounding box
let horizonBBox   = null;  // THREE.LineSegments auto-fitted to horizon footprint
let seismicPanel  = null;  // THREE.Mesh textured seismic crossline plane
let _obbState     = null;  // cached OBB geometry params shared by bbox + seismic panel

// Build (or rebuild) an Oriented Bounding Box fitted to the horizon survey footprint.
// Uses PCA on the XZ vertex cloud to find the dominant survey strike direction,
// then rotates a box to match it snugly.
// Height: top = shallowest horizon vertex (≈ seabed / start of survey),
//         bottom = deepest horizon vertex + small extra punch (~8% of stack height).
// Rendered as a dashed wireframe. Lives in modelGroup so it scales with zScale.
function buildHorizonBBox() {
    if (horizonBBox) {
        modelGroup.remove(horizonBBox);
        horizonBBox.geometry.dispose();
        horizonBBox.material.dispose();
        horizonBBox = null;
    }

    // ── Step 1: Collect XZ footprint positions (sample every 4th vertex for speed) ──
    const xzPts = []; // { x, z }
    let minY = Infinity, maxY = -Infinity;
    modelGroup.children.forEach(m => {
        if (!m.userData.isHorizon || m.userData.isContour) return;
        if (!(m instanceof THREE.Mesh)) return;
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 4) {
            const y = pos.getY(i);
            if (y === 0) continue; // skip invalid (hole-fill) vertices
            xzPts.push({ x: pos.getX(i), z: pos.getZ(i) });
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    });
    if (xzPts.length < 3 || !isFinite(minY) || !isFinite(maxY)) return;

    // ── Step 2: PCA on XZ to find the survey's dominant strike axis ──────────────
    const cx = xzPts.reduce((s, p) => s + p.x, 0) / xzPts.length;
    const cz = xzPts.reduce((s, p) => s + p.z, 0) / xzPts.length;

    let Cxx = 0, Cxz = 0, Czz = 0;
    for (const p of xzPts) {
        const dx = p.x - cx, dz = p.z - cz;
        Cxx += dx * dx; Cxz += dx * dz; Czz += dz * dz;
    }
    Cxx /= xzPts.length; Cxz /= xzPts.length; Czz /= xzPts.length;

    // Eigenvector of 2×2 symmetric covariance → principal axis (ax, az)
    const trace = Cxx + Czz;
    const det   = Cxx * Czz - Cxz * Cxz;
    const disc  = Math.sqrt(Math.max(0, (trace * 0.5) ** 2 - det));
    const lam1  = trace * 0.5 + disc;
    let ax, az;
    if (Math.abs(Cxz) > 1e-10) {
        ax = lam1 - Czz; az = Cxz;
    } else {
        ax = Cxx >= Czz ? 1 : 0; az = Cxx >= Czz ? 0 : 1;
    }
    const len = Math.sqrt(ax * ax + az * az);
    ax /= len; az /= len;
    const bx = -az, bz = ax; // perpendicular axis

    // ── Step 3: Project all points onto OBB axes to find extents ─────────────────
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (const p of xzPts) {
        const dx = p.x - cx, dz = p.z - cz;
        const pA = dx * ax + dz * az;
        const pB = dx * bx + dz * bz;
        if (pA < minA) minA = pA; if (pA > maxA) maxA = pA;
        if (pB < minB) minB = pB; if (pB > maxB) maxB = pB;
    }

    // ── Step 4: Compute OBB geometry ─────────────────────────────────────────────
    const widthA = maxA - minA;  // dimension along principal axis
    const widthB = maxB - minB;  // dimension along perpendicular axis

    // Centre of OBB footprint in world XZ
    const oCtrA = (minA + maxA) * 0.5, oCtrB = (minB + maxB) * 0.5;
    const oCtrX = cx + oCtrA * ax + oCtrB * bx;
    const oCtrZ = cz + oCtrA * az + oCtrB * bz;

    // Y extent: top = shallowest horizon vertex (≈ seabed / start of survey column),
    //           bottom = deepest vertex + small extra push (8% of stack thickness)
    //           so the box encloses the full survey column with a hint of depth.
    const stackH     = maxY - minY;           // total survey stack height
    const bottom     = minY - stackH * 0.08;  // punch ~8% deeper than deepest horizon
    const boxHeight  = maxY - bottom;         // positive height
    const oCtrY      = (maxY + bottom) * 0.5; // centre between seabed top and deep bottom

    // ── Step 5: Build geometry, rotate, and place ─────────────────────────────────
    const bGeo = new THREE.BoxGeometry(widthA, boxHeight, widthB);
    const edges = new THREE.EdgesGeometry(bGeo);
    bGeo.dispose();

    const dashMat = new THREE.LineDashedMaterial({
        color:    new THREE.Color(params.horizonBBoxColor),
        dashSize: Math.max(25, stackH * 0.025), // shorter dashes
        gapSize:  Math.max(50, stackH * 0.06),  // wider gaps for a more spaced-out look
    });
    horizonBBox = new THREE.LineSegments(edges, dashMat);
    horizonBBox.computeLineDistances(); // required for dashed rendering
    horizonBBox.position.set(oCtrX, oCtrY, oCtrZ);

    // Rotate around Y so local +X aligns with principal strike axis (ax, 0, az).
    // Three.js rotateY(θ): local X → (cos θ, 0, −sin θ)  =>  θ = atan2(−az, ax)
    horizonBBox.rotation.y = Math.atan2(-az, ax);

    horizonBBox.visible = params.horizonBBoxVisible;
    horizonBBox.userData.isHorizonBBox = true;
    modelGroup.add(horizonBBox);

    // Cache OBB parameters for the seismic panel, then rebuild the panel
    _obbState = { oCtrX, oCtrY, oCtrZ, rotY: Math.atan2(-az, ax), widthA, widthB, boxHeight };
    buildSeismicPanel();
}

// ── Seismic crossline panel ───────────────────────────────────────────────────
// Vertical plane spanning the full length × height of the OBB, textured with
// the user-provided seismic section image. Shares the OBB rotation.
const _seismicTexture = new THREE.TextureLoader().load('seismic_crossline.jpg');
function buildSeismicPanel() {
    if (seismicPanel) {
        modelGroup.remove(seismicPanel);
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
    modelGroup.add(seismicPanel);
}


// ── Per-horizon depth exaggeration ──────────────────────────────────────────
// Spreads horizon layers apart on the Y axis, anchored to the deepest layer
// so the regional context surface (which sits below all horizons) is unaffected.
// Stores a per-mesh Y shift in mesh.userData.exagShift; applyHorizonTexture
// uses that shift as the base offset before adding any noise.
function applyHorizonDepthExag(exag) {
    // Step 1: compute mean raw Y for every horizon mesh
    const meshInfos = [];
    modelGroup.children.forEach(mesh => {
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

    // Step 3: store the exaggeration shift on each mesh for applyHorizonTexture to use
    meshInfos.forEach(({ mesh, meanY }) => {
        // shift = extra Y offset added on top of raw positions (0 at bottom layer)
        mesh.userData.exagShift = (meanY - bottomMeanY) * (exag - 1.0);
    });

    // Step 4: re-apply texture (which reads exagShift) and recolor
    applyHorizonTexture(params.horizonTextureAmp);
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
    depthExagFolder.add(params, 'horizonBBoxVisible').name('Footprint Box')
        .onChange(v => { if (horizonBBox) horizonBBox.visible = v; });
    depthExagFolder.addColor(params, 'horizonBBoxColor').name('Box Color')
        .onChange(v => { if (horizonBBox) horizonBBox.material.color.set(v); });
    // Seismic crossline panel controls
    depthExagFolder.add(params, 'seismicPanelVisible').name('Crossline Panel')
        .onChange(v => { if (seismicPanel) seismicPanel.visible = v; });
    depthExagFolder.add(params, 'seismicPanelOpacity', 0.0, 1.0, 0.01).name('Panel Opacity')
        .onChange(v => { if (seismicPanel) { seismicPanel.material.opacity = v; seismicPanel.material.needsUpdate = true; } });
}


function rebuildSubregionBox() {
    if (subregionBox) { scene.remove(subregionBox); subregionBox.geometry.dispose(); subregionBox = null; }
    if (!params.subregionEnabled) return;

    // Compute Y extent from all horizon raw positions
    let minY = Infinity, maxY = -Infinity;
    modelGroup.children.forEach(m => {
        if (!m.userData.isHorizon || !m.userData.rawHorizonPos) return;
        const raw = m.userData.rawHorizonPos;
        for (let i = 1; i < raw.length; i += 3) { if (raw[i] < minY) minY = raw[i]; if (raw[i] > maxY) maxY = raw[i]; }
    });
    const boxH = (maxY - minY) || 400;
    const midY = (minY + maxY) / 2;

    const W = params.subregionW, D = params.subregionD;
    const bGeo = new THREE.BoxGeometry(W, boxH, D);
    const edges = new THREE.EdgesGeometry(bGeo);
    subregionBox = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }));
    subregionBox.position.set(
        params.subregionX,
        midY * params.zScale,     // match zScale of modelGroup
        params.subregionZ
    );
    scene.add(subregionBox);
}

// Apply fBm displacement inside the subregion footprint; reset outside.
function applyHorizonTexture(amp) {
    const enabled  = params.subregionEnabled;
    const sX = params.subregionX, sZ = params.subregionZ;
    const halfW = params.subregionW / 2, halfD = params.subregionD / 2;
    // Noise amplitude: 20m at amp=10 (visible when zoomed into 1km box)
    const maxAmp = (amp / 10) * 20.0;

    modelGroup.children.forEach(mesh => {
        if (!mesh.userData.isHorizon || !mesh.userData.rawHorizonPos) return;
        if (!(mesh instanceof THREE.Mesh)) return;
        const pos = mesh.geometry.attributes.position;
        const raw = mesh.userData.rawHorizonPos;
        const cX = mesh.userData.centerX || 0, cY = mesh.userData.centerY || 0;

        // Per-mesh depth exaggeration shift (0 when exag=1 or not yet computed)
        const exagShift = mesh.userData.exagShift || 0;

        for (let i = 0; i < pos.count; i++) {
            const rx = raw[i * 3], ry = raw[i * 3 + 1], rz = raw[i * 3 + 2];
            // Reset to raw + depth-exaggeration offset
            pos.setXYZ(i, rx, ry + exagShift, rz);
            if (amp === 0 || !enabled) continue;

            // Is this vertex inside the subregion footprint (XZ plane)?
            const px = rx, pz = rz; // scene coords (already centred)
            if (Math.abs(px - sX) > halfW || Math.abs(pz - sZ) > halfD) continue;

            let noise;
            if (params.useVolveTexture && volveTexture) {
                // Physical-scale sampling: 1m in box == 1m in texture.
                // Texture covers: rows×dx_il metres (IL / E-W) × cols×dx_xl metres (XL / N-S)
                const texW = volveTexture.rows * volveTexture.dx_il;  // ≈ 1000 m
                const texD = volveTexture.cols * volveTexture.dx_xl;  // ≈ 2500 m
                // Offset from box centre → normalised texture coordinate (tiles if box > texture)
                const u = (px - sX) / texW + 0.5;
                const v = (pz - sZ) / texD + 0.5;
                // Sample: u addresses rows (IL/1000m), v addresses cols (XL/2500m)
                const rawVal = _sampleVolveTexture(v, u); // note: sampler is (u→cols, v→rows), swap
                const range = (volveTexture.p95 - volveTexture.p5) / 2 || 1;
                noise = rawVal / range;

            } else {
                // Fall back to synthetic fBm
                const wx = rx + cX, wz = -(rz) + cY;
                noise = _fbm2(wx * 0.001, wz * 0.001);
            }
            // Apply noise on top of the depth-exaggeration-shifted base
            pos.setY(i, ry + exagShift + noise * maxAmp);
        }
        pos.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
    });
    // Keep box position in sync with zScale
    if (subregionBox) {
        let minY = Infinity, maxY = -Infinity;
        modelGroup.children.forEach(m => {
            if (!m.userData.isHorizon || !m.userData.rawHorizonPos) return;
            const raw = m.userData.rawHorizonPos;
            for (let i = 1; i < raw.length; i += 3) { if (raw[i] < minY) minY = raw[i]; if (raw[i] > maxY) maxY = raw[i]; }
        });
        subregionBox.position.y = ((minY + maxY) / 2) * params.zScale;
    }
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
    modelGroup.children.forEach(mesh => {
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
        modelGroup.children.forEach(c => {
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
            modelGroup.children.forEach(c => {
                if (c.userData.layerName === h.name) {
                    if (c.userData.isContour) { c.userData.layerVisible = v; c.visible = v && params.showContours; }
                    else { c.visible = v; }
                }
            });
            try { localStorage.setItem('geo_layer_' + h.name, JSON.stringify(layerState[h.name])); } catch(e) {}
        });

        folder.add(layerState[h.name], 'opacity', 0, 1).onChange(v => {
            modelGroup.children.forEach(c => {
                if (c.userData.layerName === h.name) {
                    c.material.transparent = true; c.material.opacity = v; c.material.needsUpdate = true;
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
                modelGroup.children.forEach(c => {
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

            modelGroup.children.forEach(c => {
                if (c.userData.layerName === f.name) {
                    c.visible = layerState[f.name].visible;
                    if (c.material) { c.material.transparent = true; c.material.opacity = 0.75; }
                }
            });

            const ctrl = faultFolder.add(layerState[f.name], 'visible').name(f.name).onChange(v => {
                modelGroup.children.forEach(c => {
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
        modelGroup.children.forEach(c => {
            if (c.userData.layerName === name) {
                if (c.userData.isContour) {
                    c.userData.layerVisible = s.visible;
                    c.visible = s.visible && params.showContours;
                } else {
                    c.visible = s.visible;
                    c.material.transparent = true;
                    // s.opacity may be undefined for fault layers — use existing value as fallback
                    if (s.opacity !== undefined) c.material.opacity = s.opacity;
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
    modelGroup.children.forEach(c => {
        if (!c.userData.isContour && !c.userData.isRegionalContour) c.material.wireframe = params.wireframe;
    });
    modelGroup.children.forEach(c => {
        if (!c.userData.isContour && !c.userData.isRegionalContour) c.material.flatShading = params.flatShading;
        c.material.needsUpdate = true;
    });
    modelGroup.scale.y = params.zScale;

    // HD Survey Subregion — rebuild box and reapply texture displacement
    rebuildSubregionBox();
    // Depth exaggeration + texture (applyHorizonDepthExag chains into applyHorizonTexture)
    applyHorizonDepthExag(params.horizonDepthExag);
    // Horizon footprint bounding box
    buildHorizonBBox();
    if (horizonBBox) {
        horizonBBox.visible = params.horizonBBoxVisible;
        horizonBBox.material.color.set(params.horizonBBoxColor);
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
    modelGroup.children.forEach(m => {
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
    // Target ~400 cells on the longest axis, scaling proportionally.
    const UPSAMPLE_TARGET = 401;
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

    const mat = new THREE.MeshStandardMaterial({
        color: 0x7799BB, transparent: true, opacity: params.regionalOpacity,
        depthWrite: false, side: THREE.DoubleSide,
        roughness: 0.85, metalness: 0.05, wireframe: params.regionalWireframe
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
    // Produces separate fitConformDepth / fitDistArr for fit mode only.
    // The prior surface keeps its CSV-derived topology untouched.
    // Initialize fitConformDepth = -yPriorSmooth so that outside the mesh
    // footprint, the fit blend is identity (conformedY = yPriorSmooth → no dip).
    const fitConformDepth = new Float32Array(N);
    const fitDistArr      = new Float32Array(N);
    for (let i = 0; i < N; i++) { fitConformDepth[i] = -yPriorSmooth[i]; fitDistArr[i] = Infinity; }

    const norneBaseMesh = modelGroup.children.find(m =>
        m.userData.isHorizon && m.userData.layerName === 'Norne Base' && !m.userData.isContour);
    if (norneBaseMesh) {
        const hPos = norneBaseMesh.geometry.attributes.position;
        const hIdx = norneBaseMesh.geometry.index;
        const usedVerts = new Set();
        if (hIdx) { const arr = hIdx.array; for (let i = 0; i < arr.length; i++) usedVerts.add(arr[i]); }
        const validVerts = [];
        for (let i = 0; i < hPos.count; i++) {
            if (!usedVerts.has(i)) continue;
            validVerts.push({ x: hPos.getX(i), y: hPos.getY(i), z: hPos.getZ(i) });
        }
        console.log(`Norne Base mesh: ${validVerts.length} valid vertices for runtime sampling`);

        // Spatial hash (200m buckets)
        const BUCKET = 200;
        const hash = {};
        for (const v of validVerts) {
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
                fitConformDepth[i] = -nearestY; // actual mesh depth (positive down)
                fitDistArr[i] = 0;
            }
        }

        // Phase 2: BFS flood fill — propagate distance AND depth from seeds.
        // Non-seed cells inherit the nearest seed's mesh depth, so the fit
        // blend can smoothly transition from mesh depth → yPriorSmooth.
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
                    fitConformDepth[nIdx] = depth; // inherit nearest seed's depth
                    queue[qTail++] = nIdx;
                }
            };
            if (ci > 0)     tryNeighbour(idx - 1);
            if (ci < W - 1) tryNeighbour(idx + 1);
            if (cj > 0)     tryNeighbour(idx - W);
            if (cj < H - 1) tryNeighbour(idx + W);
        }
        let seedCount = 0; for (let i = 0; i < N; i++) if (seedMask[i]) seedCount++;
        console.log(`Regional conform: ${seedCount} seed cells, BFS distance field complete`);
    }

    regionalMesh.userData.fitConformDepth = fitConformDepth;
    regionalMesh.userData.fitDistArr      = fitDistArr;

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

    if (!params.regionalFitToBase) {
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
    modelGroup.children.forEach(mesh => {
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
            modelGroup.children.forEach(mesh => {
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
            modelGroup.children.forEach(mesh => {
                if (skip(mesh)) return;
                const pos = mesh.geometry.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    const y = pos.getY(i);
                    if (!isNaN(y) && y !== 0) { if (y < minZ) minZ = y; if (y > maxZ) maxZ = y; }
                }
            });
            const range = maxZ - minZ || 1;
            modelGroup.children.forEach(mesh => {
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
        modelGroup.children.forEach(mesh => {
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
});

vizFolder.add(params, 'wireframe').onChange((v) => {
    modelGroup.children.forEach(c => {
        if (!c.userData.isContour && !c.userData.isRegionalContour) c.material.wireframe = v;
    });
});

vizFolder.add(params, 'flatShading').name('Sharp/Flat').onChange((v) => {
    modelGroup.children.forEach(c => {
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

// (Regional Context moved to its own top-level section below)

const textureFolder = vizFolder.addFolder('HD Survey Subregion');
_trackFolder(textureFolder, 'HD Survey Subregion');


textureFolder.add(params, 'subregionEnabled').name('Enable Box').onChange(v => {
    rebuildSubregionBox();
    applyHorizonTexture(params.horizonTextureAmp);
    updateColoring();
});

textureFolder.add(params, 'subregionX', -6000, 6000, 10).name('Position E-W (m)').onChange(v => {
    if (subregionBox) subregionBox.position.x = v;
    applyHorizonTexture(params.horizonTextureAmp);
    updateColoring();
});

textureFolder.add(params, 'subregionZ', -7000, 7000, 10).name('Position N-S (m)').onChange(v => {
    if (subregionBox) subregionBox.position.z = v;
    applyHorizonTexture(params.horizonTextureAmp);
    updateColoring();
});

// NOTE: subregionW and subregionD are persisted via the params Proxy.
// These sliders ensure the restored values are visible after refresh.
textureFolder.add(params, 'subregionW', 200, 5000, 10).name('Width E-W (m)').onChange(() => {
    rebuildSubregionBox();
    applyHorizonTexture(params.horizonTextureAmp);
    updateColoring();
});

textureFolder.add(params, 'subregionD', 200, 10000, 10).name('Depth N-S (m)').onChange(() => {
    rebuildSubregionBox();
    applyHorizonTexture(params.horizonTextureAmp);
    updateColoring();
});

textureFolder.add(params, 'useVolveTexture').name('Use Volve Texture').onChange(() => {
    applyHorizonTexture(params.horizonTextureAmp);
    updateColoring();
});

textureFolder.add(params, 'horizonTextureAmp', 0, 10, 0.1).name('Texture Amplitude').onChange(v => {
    applyHorizonTexture(v);
    updateColoring();
});



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

// ── Regional Context — top-level panel section ──────────────────────────────
const regionalFolder = gui.addFolder('Regional Context (Norne Base)');
_trackFolder(regionalFolder, 'Regional Context');
regionalFolder.add(params, 'regionalFitToBase').name('Fit to Norne Base')
    .onChange(() => applyRegionalBlend(params.regionalBlendKm));
regionalFolder.add(params, 'regionalOpacity', 0, 1, 0.01).name('Opacity').onChange(v => {
    if (regionalMesh) { regionalMesh.material.opacity = v; regionalMesh.material.needsUpdate = true; }
});
regionalFolder.add(params, 'regionalTopologyFalloff').name('Topology Falloff').onChange(() => {
    rebuildRegionalPrior();
});
regionalFolder.add(params, 'regionalBlendKm', 0, 60, 0.5).name('Topology Falloff (km)').onChange(() => {
    rebuildRegionalPrior();
});
regionalFolder.add(params, 'regionalFitBlendKm', 0.5, 15, 0.5).name('Fit Blend (km)').onChange(() => {
    if (params.regionalFitToBase) applyRegionalBlend(params.regionalBlendKm);
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

        const material = new THREE.MeshStandardMaterial({
            color: h.color,
            side: THREE.DoubleSide,
            roughness: 0.6,
            metalness: 0.2,
            depthWrite: true  // horizon writes depth buffer to occlude regional contour layer
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.originalColor = h.color;
        mesh.userData.layerName = h.name;
        mesh.userData.isHorizon = true;
        mesh.userData.centerX = centerX;
        mesh.userData.centerY = centerY;
        mesh.userData.rawHorizonPos = Float32Array.from(geometry.attributes.position.array);
        modelGroup.add(mesh);


        // Contour overlay
        const cMesh = new THREE.Mesh(geometry, contourMaterial.clone());
        cMesh.visible = false;
        cMesh.renderOrder = 1;
        cMesh.userData.isContour = true;
        cMesh.userData.layerName = h.name;
        modelGroup.add(cMesh);
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
            modelGroup.add(cloud);
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
        modelGroup.add(mesh);

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
    if (params.horizonTextureAmp > 0) applyHorizonDepthExag(params.horizonDepthExag);
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
    // Dispose all GPU resources
    while (modelGroup.children.length > 0) {
        const obj = modelGroup.children[0];
        modelGroup.remove(obj);
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material?.dispose();
    }
    // Rebuild the Horizons and Faults folders so only new-field layers appear
    horizonBBox  = null; // geometry was disposed by the loop above
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

async function loadDataset(datasetName) {
    updateLoading('Switching dataset...');
    clearScene();
    controls.target.set(0, 0, 0);
    camera.position.set(2000, 2000, 2000);

    // Keep the dropdown in sync and persist the choice
    document.getElementById('dataset-select').value = datasetName;
    localStorage.setItem('geo_active_field', datasetName);

    if (datasetName === 'volve') {
        await initVolveData();
    } else if (datasetName === 'norne') {
        await initNorneData();
    }
}

// ─────────────────────────────────────────────────────────────
// DATASET DROPDOWN
// ─────────────────────────────────────────────────────────────
document.getElementById('dataset-select').addEventListener('change', e => {
    loadDataset(e.target.value);
});

// ─────────────────────────────────────────────────────────────
// ANIMATE
// ─────────────────────────────────────────────────────────────
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Boot — restore last selected field (default to volve)
const savedField = localStorage.getItem('geo_active_field') || 'volve';
document.getElementById('dataset-select').value = savedField;
loadDataset(savedField);
animate();
