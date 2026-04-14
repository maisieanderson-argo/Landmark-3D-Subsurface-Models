import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

// Setup Three.js
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
// Background color is applied from params after _paramsDefaults is initialised (see below).
// scene.fog = new THREE.Fog(0x111111, 2000, 10000); // Removed for clarity

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 10, 200000);
camera.position.set(-22000, 12000, -35000); // South of scene, looking north
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
// Disable mouse-wheel value changes on lil-gui sliders/number fields.
// Sliders still work via drag, and number fields still work via typing.
document.addEventListener('wheel', (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('.lil-gui')) return;
    if (
        target.matches('input[type="range"]') ||
        target.matches('input[type="number"]') ||
        !!target.closest('.slider')
    ) {
        e.preventDefault();
    }
}, { passive: false, capture: true });

// For lil-gui numeric controls: keep real-time visual updates while scrubbing sliders,
// but defer updates during text entry until finish to avoid focus/scroll jumps.
function bindSliderRealtime(controller, onScrub, onCommit = onScrub) {
    if (!controller) return controller;
    const isTypingInController = () => {
        const active = document.activeElement;
        return (
            active instanceof HTMLInputElement &&
            (active.type === 'number' || active.type === 'text') &&
            controller.domElement?.contains(active)
        );
    };
    controller.onChange((v) => {
        if (isTypingInController()) return;
        onScrub(v);
    });
    controller.onFinishChange((v) => {
        onCommit(v);
    });
    return controller;
}

function captureGuiScrollStateForFolder(folder) {
    const snapshots = [];
    const seen = new Set();
    const add = (el) => {
        if (!(el instanceof HTMLElement)) return;
        if (seen.has(el)) return;
        seen.add(el);
        snapshots.push({
            el,
            top: el.scrollTop,
            left: el.scrollLeft,
        });
    };
    const root = folder?.domElement?.closest?.('.lil-gui') || null;
    add(root);
    add(root?.querySelector?.(':scope > .children') || null);
    add(folder?.domElement?.querySelector?.(':scope > .children') || null);
    add(folder?.domElement?.parentElement || null);
    return snapshots;
}

function restoreGuiScrollState(snapshots) {
    if (!Array.isArray(snapshots) || snapshots.length === 0) return;
    const apply = () => {
        snapshots.forEach((snapshot) => {
            const el = snapshot?.el;
            if (!(el instanceof HTMLElement)) return;
            if (!el.isConnected) return;
            el.scrollTop = Number(snapshot.top) || 0;
            el.scrollLeft = Number(snapshot.left) || 0;
        });
    };
    apply();
    requestAnimationFrame(() => {
        apply();
        requestAnimationFrame(() => {
            apply();
            setTimeout(apply, 0);
        });
    });
}

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(-22000, -5000, 5000); // Scene center, north-facing

// Restore persisted camera position if available
try {
    const savedCam = JSON.parse(localStorage.getItem('geo_camera'));
    if (savedCam) {
        camera.position.set(savedCam.px, savedCam.py, savedCam.pz);
        controls.target.set(savedCam.tx, savedCam.ty, savedCam.tz);
    }
} catch (e) { /* ignore parse errors */ }

// Persist camera position 2 seconds after the camera stops moving
let _cameraSaveTimer = null;
controls.addEventListener('change', () => {
    if (_cameraSaveTimer) clearTimeout(_cameraSaveTimer);
    _cameraSaveTimer = setTimeout(() => {
        try {
            localStorage.setItem('geo_camera', JSON.stringify({
                px: camera.position.x, py: camera.position.y, pz: camera.position.z,
                tx: controls.target.x,  ty: controls.target.y,  tz: controls.target.z,
            }));
        } catch (e) { /* quota exceeded etc. */ }
    }, 2000);
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

// Custom horizon wells live under the well group so they share position/scale transforms.
const customHorizonWellGroup = new THREE.Group();
wellGroup.add(customHorizonWellGroup);
const customSurfaceNetworkGroup = new THREE.Group();
wellGroup.add(customSurfaceNetworkGroup);
const customTieBackLineGroup = new THREE.Group();
wellGroup.add(customTieBackLineGroup);

// Custom horizon targets are rendered in world space (outside survey groups)
// so they never get pulled into horizon/fault colouring passes.
const customTargetGroup = new THREE.Group();
scene.add(customTargetGroup);

// Helper: iterate meshes from BOTH survey groups (for survey-spanning operations)
function allSurveyChildren() {
    return [...norneSurveyGroup.children, ...volveSurveyGroup.children];
}

function getSurveyGroupByName(survey) {
    if (survey === 'norne') return norneSurveyGroup;
    if (survey === 'volve') return volveSurveyGroup;
    return null;
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

// ── Per-layer texture mapping for Norne + Volve horizons ──
const TEXTURE_ASSIGNMENTS = [
    // Order matches the horizon loading order in initNorneData()
    { survey: 'norne', layerName: 'Åre Fm Top', imageIndex: 1 },
    { survey: 'norne', layerName: 'Tilje Fm Top', imageIndex: 2 },
    { survey: 'norne', layerName: 'Ile Fm Top', imageIndex: 3 },
    { survey: 'norne', layerName: 'Tofte Fm Top', imageIndex: 4 },
    { survey: 'norne', layerName: 'Garn Fm Top', imageIndex: 5 },
    { survey: 'norne', layerName: 'Not Fm Top', imageIndex: 6 },
    { survey: 'norne', layerName: 'Norne Base', imageIndex: 7 },
    // Volve reuses the same image families in its horizon load order.
    { survey: 'volve', layerName: 'BCU (Base Cretaceous Unconformity)', imageIndex: 1 },
    { survey: 'volve', layerName: 'Hugin Fm Top', imageIndex: 2 },
    { survey: 'volve', layerName: 'Hugin Fm Base', imageIndex: 3 },
];

function getTextureKey(survey, layerName) {
    return `${survey}:${layerName}`;
}

function getMeshTextureKey(mesh) {
    return getTextureKey(mesh.userData.survey, mesh.userData.layerName);
}

// Load per-layer SEM Map textures (SEM-Map-1.png through SEM-Map-7.png)
const semMapTextures = {};   // survey:layerName → THREE.Texture
const specDTextures = {};    // survey:layerName → THREE.Texture
const loader = new THREE.TextureLoader();
TEXTURE_ASSIGNMENTS.forEach(({ survey, layerName, imageIndex }) => {
    const key = getTextureKey(survey, layerName);
    const idx = imageIndex;
    const semTex = loader.load(`SEM-Map-${idx}.png`);
    semTex.colorSpace = THREE.SRGBColorSpace;
    semMapTextures[key] = semTex;

    const specTex = loader.load(`SpecD${idx}.png`);
    specTex.colorSpace = THREE.SRGBColorSpace;
    specDTextures[key] = specTex;
});
// Backward-compat alias used by the clear-texture sweep
const semMapTexture = semMapTextures[getTextureKey('norne', 'Åre Fm Top')];

// ── BCU texture overlay data (loaded from Volve seismic attribute grid) ──
// 80×200 grid of amplitude perturbation values from the BCU horizon
let bcuTextureData = null;   // { rows, cols, dx_il, dx_xl, p5, p95, data[][] }
fetch('volve_bcu_texture.json')
    .then(r => r.json())
    .then(d => {
        bcuTextureData = d;
        console.log(`BCU texture loaded: ${d.rows}×${d.cols}, p5=${d.p5} p95=${d.p95}`);
        // Apply immediately if intensity is already non-zero (e.g. restored from localStorage)
        if (params.bcuTextureIntensity > 0) {
            applyHorizonPositions();
            updateColoring();
        }
    })
    .catch(e => console.warn('BCU texture not available:', e));

// ── Per-layer offscreen canvases for pixel sampling (used by dots mode) ──
const semMapCanvases = {};   // survey:layerName → { canvas, ctx }
const specDCanvases = {};    // survey:layerName → { canvas, ctx }

function _loadCanvasForLayer(src, targetMap, survey, layerName) {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        targetMap[getTextureKey(survey, layerName)] = { canvas, ctx };
        console.log(`Canvas ready for ${survey}:${layerName}: ${canvas.width}×${canvas.height} (${src})`);
        // Rebuild dots if already showing the relevant texture mode
        const isSem  = params.selectedColormap === 'SEM Map';
        const isSpec = params.selectedColormap === 'Spec-D';
        if ((isSem || isSpec) && params.showHorizonDots) {
            const hasDots = allSurveyChildren().some(c => c.userData.isHorizonDots);
            if (hasDots) rebuildHorizonDots();
        }
    };
    img.src = src;
}

TEXTURE_ASSIGNMENTS.forEach(({ survey, layerName, imageIndex }) => {
    const idx = imageIndex;
    _loadCanvasForLayer(`SEM-Map-${idx}.png`, semMapCanvases, survey, layerName);
    _loadCanvasForLayer(`SpecD${idx}.png`, specDCanvases, survey, layerName);
});

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
        loadHorizon("BCU (Base Cretaceous Unconformity)", "BCU_regrid.csv", 0x4ECDC4),
        loadHorizon("Hugin Fm Top", "Hugin_Fm_Top_regrid.csv", 0xFF6B6B),
        loadHorizon("Hugin Fm Base", "Hugin_Fm_Base_regrid.csv", 0x45B7D1)
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

    // 2. Build Meshes — regridded data has uniform XY grid + edge Z-clamping,
    //    so no decimation or hole-filling needed. Use invalidIndices + spatial
    //    triangle culling (same approach as Norne mesh builder).
    validHorizons.forEach(h => {
        console.log(`Building mesh for ${h.name}...`);

        const width  = h.maxIL - h.minIL + 1;
        const height = h.maxXL - h.minXL + 1;

        console.log(`Grid size: ${width} x ${height} = ${width * height} cells`);

        if (width <= 0 || height <= 0 || !isFinite(width) || !isFinite(height)) {
            console.error(`Invalid grid dimensions for ${h.name}: ${width}x${height}`);
            return;
        }

        const geometry = new THREE.PlaneGeometry(1, 1, width - 1, height - 1);
        const posAttr = geometry.attributes.position;
        const invalidIndices = new Set();

        for (let ix = 0; ix < width; ix++) {
            for (let iy = 0; iy < height; iy++) {
                const il = h.minIL + ix;
                const xl = h.minXL + iy;
                const pt = h.data[`${il}_${xl}`];
                const idx = iy * width + ix;
                if (pt) {
                    posAttr.setXYZ(idx, pt.x - centerX, -pt.z, -(pt.y - centerY));
                } else {
                    invalidIndices.add(idx);
                    posAttr.setXYZ(idx, 0, 0, 0);
                }
            }
        }

        // Remove degenerate triangles (invalid vertices + spatially stretched edges)
        const rawIndices = geometry.index.array;
        let cleanIndices = [];
        for (let i = 0; i < rawIndices.length; i += 3) {
            const a = rawIndices[i], b = rawIndices[i + 1], c = rawIndices[i + 2];
            if (!invalidIndices.has(a) && !invalidIndices.has(b) && !invalidIndices.has(c)) {
                cleanIndices.push(a, b, c);
            }
        }

        // Compute typical edge length from valid adjacent vertices
        let edgeLenSum = 0, edgeLenCnt = 0;
        for (let ix = 0; ix < width - 1; ix++) {
            for (let iy = 0; iy < height; iy++) {
                const i0 = iy * width + ix, i1 = iy * width + (ix + 1);
                if (!invalidIndices.has(i0) && !invalidIndices.has(i1)) {
                    const dx = posAttr.getX(i1) - posAttr.getX(i0);
                    const dz = posAttr.getZ(i1) - posAttr.getZ(i0);
                    edgeLenSum += Math.sqrt(dx * dx + dz * dz);
                    edgeLenCnt++;
                    break;
                }
            }
            if (edgeLenCnt > 10) break;
        }
        const avgEdge = edgeLenCnt > 0 ? edgeLenSum / edgeLenCnt : 50;
        const maxEdgeLen = avgEdge * 3.0;

        // Second pass: cull triangles with stretched edges
        const finalIndices = [];
        let culledCount = 0;
        for (let i = 0; i < cleanIndices.length; i += 3) {
            const a = cleanIndices[i], b = cleanIndices[i + 1], c = cleanIndices[i + 2];
            let tooLong = false;
            const pairs = [[a, b], [b, c], [c, a]];
            for (const [p, q] of pairs) {
                const dx = posAttr.getX(p) - posAttr.getX(q);
                const dz = posAttr.getZ(p) - posAttr.getZ(q);
                if (dx * dx + dz * dz > maxEdgeLen * maxEdgeLen) {
                    tooLong = true;
                    break;
                }
            }
            if (!tooLong) {
                finalIndices.push(a, b, c);
            } else {
                culledCount++;
            }
        }
        if (culledCount > 0) console.log(`  Culled ${culledCount} stretched edge triangles for ${h.name}`);
        geometry.setIndex(finalIndices);
        console.log(`Mesh built: ${width * height - invalidIndices.size} valid, ${invalidIndices.size} invalid vertices`);

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

// Lateral 3 — deeper KOP (~1856 ft), extended build to same LP1/BHL targets as Lateral 1
const LATERAL3_TURN_POINTS = [
    { sectionType: 'Tie Line',      md: 0.0,     inc: 0.00,  azi: 0.00,   tvd: 0.0,    northing: WELL_SURFACE_NORTHING, easting: WELL_SURFACE_EASTING, target: '' },
    { sectionType: 'Straight MD',   md: 1856.0,  inc: 0.00,  azi: 0.00,   tvd: 1856.0, northing: WELL_SURFACE_NORTHING, easting: WELL_SURFACE_EASTING, target: '' },
    { sectionType: 'Build + Turn',  md: 4800.0,  inc: 78.51, azi: 270.00, tvd: 5000.0, northing: 12145538.01, easting: 2564064.95, target: 'LP1' },
    { sectionType: 'Lateral',       md: 13359.0, inc: 78.51, azi: 270.00, tvd: 5000.0, northing: 12145537.99, easting: 2554222.58, target: 'BHL' },
];

// Lateral 4 — deeper KOP (~1856 ft), extended build to same LP2/BHL2 targets as Lateral 2, 30% longer lateral
const LATERAL4_TURN_POINTS = [
    { sectionType: 'KOP Junction',  md: 1856.0,  inc: 0.00,  azi: 175.00, tvd: 1856.0, northing: WELL_SURFACE_NORTHING, easting: WELL_SURFACE_EASTING, target: '' },
    { sectionType: 'Build + Turn',  md: 5200.0,  inc: 82.00, azi: 230.00, tvd: 3105.0, northing: 12145139.00, easting: 2564512.00, target: 'LP2' },
    { sectionType: 'Lateral',       md: 13750.0, inc: 82.00, azi: 230.00, tvd: 4350.0, northing: 12139297.00, easting: 2557308.00, target: 'BHL2' },
];

const WELL_TARGETS = [
    { name: 'LP1',  wellbore: 'Lateral 1', tpIndexParam: 'lat1LP1Position', depthParam: 'targetLP1YOffset' },
    { name: 'BHL',  wellbore: 'Lateral 1', tpIndexParam: 'lat1BHLPosition', depthParam: 'targetBHLYOffset' },
    { name: 'LP2',  wellbore: 'Lateral 2', tpIndexParam: 'lat2LP2Position', depthParam: 'targetLP2YOffset' },
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

// Well stations map — recomputed each time buildWellTrajectories() is called
const wellStations = new Map();

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

// ── Build Well Trajectories ────────────────────────────────────
function buildWellTrajectories() {
    // Clear existing built-in well meshes but preserve custom horizon wells group.
    for (let i = wellGroup.children.length - 1; i >= 0; i--) {
        const c = wellGroup.children[i];
        if (c === customHorizonWellGroup || c === customSurfaceNetworkGroup || c === customTieBackLineGroup) continue;
        wellGroup.remove(c);
        c.traverse?.((obj) => {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material?.dispose();
        });
    }

    // Recompute stations from original turn-point data each rebuild.
    wellStations.clear();
    for (const wb of WELL_DEFS) {
        wellStations.set(wb.name, minimumCurvature(wb.turnPoints));
    }

    // Apply Y-offset depth adjustments by bending station TVDs.
    // For each target, find it in ALL laterals (not just the primary wellbore)
    // so that Lat 3/4 get the same offsets as Lat 1/2 before blending.
    // Per-well combined offset profile:
    //   • Smoothstep ramp from one TP before the first target up to it
    //   • Linear interpolation between consecutive targets (pivot behaviour)
    //   • Hold the last target's offset for stations beyond it
    {
        const targetsByWell = new Map();
        let anyOffset = false;

        for (const tgt of WELL_TARGETS) {
            if (!tgt.depthParam) continue;
            const yOffsetM = params[tgt.depthParam] || 0;
            const tvdDeltaFt = -yOffsetM / FT_TO_M;
            if (yOffsetM !== 0) anyOffset = true;

            // Find this target label in ALL laterals, not just tgt.wellbore
            for (const wb of WELL_DEFS) {
                const tpIdx = wb.turnPoints.findIndex(tp => tp.target === tgt.name);
                if (tpIdx < 0) continue;
                const stns = wellStations.get(wb.name);
                if (!stns) continue;

                if (!targetsByWell.has(wb.name)) targetsByWell.set(wb.name, []);
                const stIdx = Math.min(tpIdx * WELL_INTERP_STEPS, stns.length - 1);
                targetsByWell.get(wb.name).push({ stIdx, tvdDeltaFt, tpIdx });
            }
        }

        if (anyOffset) {
            for (const [wellName, targets] of targetsByWell) {
                const stns = wellStations.get(wellName);
                if (!stns || targets.length === 0) continue;

                targets.sort((a, b) => a.stIdx - b.stIdx);
                const first = targets[0];
                const last  = targets[targets.length - 1];
                const rampStart = Math.max(0, (first.tpIdx - 1) * WELL_INTERP_STEPS);

                for (let i = rampStart; i < stns.length; i++) {
                    let offset = 0;

                    if (i < first.stIdx) {
                        // Smoothstep ramp up to first target
                        if (first.stIdx > rampStart) {
                            const frac = (i - rampStart) / (first.stIdx - rampStart);
                            offset = first.tvdDeltaFt * frac * frac * (3 - 2 * frac);
                        }
                    } else if (i >= last.stIdx) {
                        // Hold last target's offset
                        offset = last.tvdDeltaFt;
                    } else {
                        // Between two targets: linear interpolation
                        for (let t = 0; t < targets.length - 1; t++) {
                            if (i >= targets[t].stIdx && i < targets[t + 1].stIdx) {
                                const span = targets[t + 1].stIdx - targets[t].stIdx;
                                const frac = span > 0 ? (i - targets[t].stIdx) / span : 0;
                                offset = targets[t].tvdDeltaFt + (targets[t + 1].tvdDeltaFt - targets[t].tvdDeltaFt) * frac;
                                break;
                            }
                        }
                    }

                    stns[i].tvd += offset;
                }
            }
        }
    }

    blendLateralToReference('Lateral 3', 'Lateral 1', 'LP1');
    blendLateralToReference('Lateral 4', 'Lateral 2', 'LP2');

    for (const wb of WELL_DEFS) {
        const stations = wellStations.get(wb.name);
        if (!stations || stations.length < 2) continue;

        const baseColor = new THREE.Color(params[wb.colorParam]);

        // Wellhead cone — always built, independent of lateral visibility
        const s0 = stations[0];
        if (s0.tvd === 0) {
            const headPos = wellToWorld(s0.northing, s0.easting, s0.tvd);
            const sc = params.wellheadConeScale;
            const coneRadius = params.wellTubeRadius * 3 * sc;
            const coneHeight = coneRadius * 3;
            const headGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 16);
            const coneColor = new THREE.Color(params.wellheadConeColor);
            const headMat = new THREE.MeshPhongMaterial({
                color: coneColor,
                emissive: coneColor.clone().multiplyScalar(0.3),
            });
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.copy(headPos);
            head.position.y += coneHeight * 0.5; // sit base at wellhead
            head.scale.y = 1 / (params.zScale || 1);
            head.userData = { isWell: true, isWellheadCone: true, wellbore: wb.name };
            head.visible = params.wellheadConeVisible;
            wellGroup.add(head);
        }

        // Skip trajectory/markers if this lateral is hidden
        if (!params[wb.visParam]) continue;
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
            const yCompensation = 1 / (params.zScale || 1);
            for (let d = 0; d < dotCount; d++) {
                const p = curve.getPointAt(d / (dotCount - 1));
                dummy.position.copy(p);
                dummy.scale.set(1, yCompensation, 1);
                dummy.updateMatrix();
                instanced.setMatrixAt(d, dummy.matrix);
            }
            instanced.instanceMatrix.needsUpdate = true;
            instanced.userData = { isWell: true, wellbore: wb.name };
            wellGroup.add(instanced);
        }

        // Turn point markers (skip index 0 = surface wellhead, now handled by cone)
        {
        for (let tpIdx = 1; tpIdx < wb.turnPoints.length; tpIdx++) {
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
            let wb = WELL_DEFS.find(w => w.name === tgt.wellbore);
            if (!wb) continue;
            // Per-lateral target visibility
            if (wb.targetVisParam && !params[wb.targetVisParam]) continue;

            // Prefer a VISIBLE lateral that shares the same target label,
            // so the orb sits on the rendered well path (not a hidden one).
            let useWb = wb;
            if (!params[wb.visParam]) {
                const alt = WELL_DEFS.find(w =>
                    w.name !== wb.name &&
                    params[w.visParam] &&
                    w.turnPoints.some(tp => tp.target === tgt.name));
                if (alt) useWb = alt;
            }

            // Ensure stations exist
            if (!wellStations.has(useWb.name)) {
                wellStations.set(useWb.name, minimumCurvature(useWb.turnPoints));
            }

            const stns = wellStations.get(useWb.name);
            // Map the target label to the correct TP index on the chosen lateral
            const tpIdxOnLateral = useWb.turnPoints.findIndex(tp => tp.target === tgt.name);
            let stIdx;
            {
                const tpIdx = tgt.tpIndexParam ? params[tgt.tpIndexParam] : tgt.tpIndex;
                stIdx = Math.min(Math.round(tpIdx * WELL_INTERP_STEPS), stns.length - 1);
            }
            const s = stns[stIdx];
            const pos = wellToWorld(s.northing, s.easting, s.tvd);

            // Rotate Lateral 2/4 targets around KOP
            if ((useWb.name === 'Lateral 2' || useWb.name === 'Lateral 4') && params.lat2RotationDeg !== 0) {
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
                depthWrite: true,
                side: THREE.DoubleSide,
                shininess: 80,
            });
            const orb = new THREE.Mesh(orbGeo, orbMat);
            orb.position.copy(pos);
            orb.scale.y = 1 / (params.zScale || 1);
            orb.name = `target-${tgt.name}`;
            orb.userData = { isWell: true, isTarget: true };
            wellGroup.add(orb);

            // ── Ring perpendicular to wellbore ─────────────────────────────
            // Compute wellbore tangent at the target station from neighbors
            const prevIdx = Math.max(0, stIdx - 1);
            const nextIdx = Math.min(stns.length - 1, stIdx + 1);
            const pPrev = wellToWorld(stns[prevIdx].northing, stns[prevIdx].easting, stns[prevIdx].tvd);
            const pNext = wellToWorld(stns[nextIdx].northing, stns[nextIdx].easting, stns[nextIdx].tvd);
            // Apply same Lat 2/4 rotation to tangent endpoints
            if ((tgt.wellbore === 'Lateral 2' || tgt.wellbore === 'Lateral 4') && params.lat2RotationDeg !== 0) {
                const kopWorld = wellToWorld(LATERAL2_TURN_POINTS[0].northing, LATERAL2_TURN_POINTS[0].easting, LATERAL2_TURN_POINTS[0].tvd);
                const angle = -params.lat2RotationDeg * Math.PI / 180;
                const cosA = Math.cos(angle), sinA = Math.sin(angle);
                for (const p of [pPrev, pNext]) {
                    const dx = p.x - kopWorld.x, dz = p.z - kopWorld.z;
                    p.x = kopWorld.x + dx * cosA - dz * sinA;
                    p.z = kopWorld.z + dx * sinA + dz * cosA;
                }
            }
            const tangent = new THREE.Vector3().subVectors(pNext, pPrev).normalize();

            const hRingGeo = new THREE.TorusGeometry(params.wellTargetSize * 1.625, ringTubeRadius, 12, 48);
            const ringMat = new THREE.MeshPhongMaterial({
                color: tColor,
                emissive: tColor.clone().multiplyScalar(0.15),
                transparent: true,
                opacity: Math.min(1, params.wellTargetOpacity * 1.5),
                depthWrite: true,
                side: THREE.DoubleSide,
            });
            const hRing = new THREE.Mesh(hRingGeo, ringMat);
            hRing.position.copy(pos);
            // Torus default normal is (0,0,1); rotate it to align with the wellbore tangent
            const defaultNormal = new THREE.Vector3(0, 0, 1);
            hRing.quaternion.setFromUnitVectors(defaultNormal, tangent);
            // Compensate for z-scale on top of the quaternion rotation
            const yComp = 1 / (params.zScale || 1);
            hRing.scale.set(1, yComp, 1);
            hRing.userData = { isWell: true, isTarget: true };
            wellGroup.add(hRing);
        }
    }

    rebuildCustomHorizonWells();
}

// ─────────────────────────────────────────────────────────────
// CUSTOM HORIZON TARGETS
// ─────────────────────────────────────────────────────────────
const customTargets = []; // { id, name, survey, layerName, baseLocal:{x,y,z}, offsetEastM, offsetNorthM, visible, color, size, opacity }
let customTargetSerial = 1;

let customTargetFolder = null;
let customTargetDeleteAllCtrl = null;
let customTargetRowFolders = [];
let customHorizonWellFolder = null;
let customHorizonWellCreateCtrl = null;
let customHorizonWellDeleteAllCtrl = null;
let customHorizonWellRowFolders = [];
let customSurfaceNetworkFolder = null;
let customSurfaceNetworkCreateCtrl = null;
let customSurfaceNetworkDeleteAllCtrl = null;
let customSurfaceNetworkRowFolders = [];
let customTieBackLineFolder = null;
let customTieBackLineCreateCtrl = null;
let customTieBackLineDeleteAllCtrl = null;
let customTieBackLineRowFolders = [];

const customTargetUi = {
    deleteAll: () => clearAllCustomTargets(),
};

function nextCustomTargetName() {
    let name = `Target ${customTargetSerial++}`;
    while (customTargets.some(t => t.name === name)) {
        name = `Target ${customTargetSerial++}`;
    }
    return name;
}

function rebuildCustomTargetSerial() {
    customTargetSerial = 1;
    customTargets.forEach(t => {
        const m = /^Target\s+(\d+)$/.exec(t.name || '');
        if (m) customTargetSerial = Math.max(customTargetSerial, parseInt(m[1], 10) + 1);
    });
}

function getCustomTargetsState() {
    return customTargets.map(t => ({
        id: t.id,
        name: t.name,
        survey: t.survey,
        layerName: t.layerName,
        baseLocal: { x: t.baseLocal.x, y: t.baseLocal.y, z: t.baseLocal.z },
        offsetEastM: t.offsetEastM,
        offsetNorthM: t.offsetNorthM,
        visible: t.visible,
        color: t.color,
        size: t.size,
        opacity: t.opacity,
    }));
}

function persistCustomTargetsToStorage() {
    try {
        localStorage.setItem(CUSTOM_TARGETS_STORAGE_KEY, JSON.stringify(getCustomTargetsState()));
    } catch (e) {}
    pushCustomActionHistorySnapshot();
}

function findHorizonMeshForTarget(target) {
    const surveyGroup = getSurveyGroupByName(target.survey);
    if (!surveyGroup) return null;
    return surveyGroup.children.find(c =>
        c instanceof THREE.Mesh &&
        c.userData.isHorizon &&
        c.userData.layerName === target.layerName
    ) || null;
}

function resolveCustomTargetWorldPosition(target) {
    const surveyGroup = getSurveyGroupByName(target.survey);
    if (!surveyGroup) return null;

    const candidateLocal = new THREE.Vector3(
        target.baseLocal.x + target.offsetEastM,
        target.baseLocal.y,
        target.baseLocal.z - target.offsetNorthM // +North should move toward -Z in this scene
    );
    const horizonMesh = findHorizonMeshForTarget(target);
    if (!horizonMesh) return surveyGroup.localToWorld(candidateLocal.clone());

    const candidateWorld = surveyGroup.localToWorld(candidateLocal.clone());
    const rayOrigin = new THREE.Vector3(candidateWorld.x, candidateWorld.y + 250000, candidateWorld.z);
    const raycaster = new THREE.Raycaster(rayOrigin, new THREE.Vector3(0, -1, 0), 0, 500000);
    const hits = raycaster.intersectObject(horizonMesh, false);

    if (hits.length > 0) return hits[0].point.clone();
    return candidateWorld;
}

function clearCustomTargetMeshes() {
    while (customTargetGroup.children.length > 0) {
        const obj = customTargetGroup.children[0];
        customTargetGroup.remove(obj);
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material?.dispose();
    }
}

function rebuildCustomTargets() {
    clearCustomTargetMeshes();

    if (customTargets.length === 0) return;

    customTargets.forEach(target => {
        if (target.visible === false) return;
        const worldPos = resolveCustomTargetWorldPosition(target);
        if (!worldPos) return;
        const size = Math.max(2, Number(target.size) || Number(params.customTargetSize) || 75);
        const color = new THREE.Color(target.color || params.customTargetColor);
        const opacity = Math.max(0.05, Math.min(1, Number(target.opacity) || Number(params.customTargetOpacity) || 0.65));
        const ringTubeRadius = Math.max(0.5, size * 0.02);

        const orbGeo = new THREE.SphereGeometry(size, 16, 16);
        const orbMat = new THREE.MeshPhongMaterial({
            color,
            emissive: color.clone().multiplyScalar(0.15),
            transparent: true,
            opacity,
            depthWrite: true,
            side: THREE.DoubleSide,
            shininess: 80,
        });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.copy(worldPos);
        orb.userData = { isCustomTarget: true, targetId: target.id, targetName: target.name };
        orb.name = `custom-target-${target.name}`;
        customTargetGroup.add(orb);

        const ringGeo = new THREE.TorusGeometry(size * 1.625, ringTubeRadius, 12, 48);
        const ringMat = new THREE.MeshPhongMaterial({
            color,
            emissive: color.clone().multiplyScalar(0.15),
            transparent: true,
            opacity: Math.min(1, opacity * 1.5),
            depthWrite: true,
            side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(worldPos);
        ring.rotation.x = Math.PI / 2;
        ring.userData = { isCustomTarget: true, targetId: target.id, targetName: target.name };
        customTargetGroup.add(ring);
    });

    if (typeof rebuildCustomHorizonWells === 'function') {
        rebuildCustomHorizonWells();
    }
}

function removeCustomTargetById(targetId) {
    const idx = customTargets.findIndex(t => t.id === targetId);
    if (idx < 0) return;
    customTargets.splice(idx, 1);
    rebuildCustomTargetSerial();
    rebuildCustomTargets();
    rebuildCustomTargetControllers();
    rebuildCustomHorizonWells();
    rebuildCustomHorizonWellControllers();
    persistCustomTargetsToStorage();
}

function makeUniqueCustomTargetName(baseName, excludeTargetId = null) {
    const trimmed = typeof baseName === 'string' ? baseName.trim() : '';
    if (!trimmed) return null;
    let uniqueName = trimmed;
    let suffix = 2;
    while (customTargets.some(t => t.id !== excludeTargetId && t.name === uniqueName)) {
        uniqueName = `${trimmed} (${suffix++})`;
    }
    return uniqueName;
}

function renameCustomTargetById(targetId, proposedName) {
    const target = customTargets.find(t => t.id === targetId);
    if (!target) return null;
    const uniqueName = makeUniqueCustomTargetName(proposedName, targetId);
    if (!uniqueName) return null;
    if (uniqueName === target.name) return uniqueName;
    target.name = uniqueName;
    rebuildCustomTargetSerial();
    rebuildCustomTargets();
    rebuildCustomTargetControllers();
    persistCustomTargetsToStorage();
    return uniqueName;
}

function promptRenameCustomTarget(targetId) {
    const target = customTargets.find(t => t.id === targetId);
    if (!target) return;
    const proposed = window.prompt('Rename target:', target.name);
    if (proposed === null) return;
    renameCustomTargetById(targetId, proposed);
}

function rebuildCustomTargetControllers() {
    if (!customTargetFolder) return;

    customTargetRowFolders.forEach(folder => folder.destroy());
    customTargetRowFolders = [];
    if (customTargetDeleteAllCtrl) {
        customTargetDeleteAllCtrl.destroy();
        customTargetDeleteAllCtrl = null;
    }

    customTargets.forEach(target => {
        const rowFolder = customTargetFolder.addFolder(target.name);
        _trackFolder(rowFolder, `custom-target:${target.id}`);
        const rowNameModel = { name: target.name };
        const rowOpacityModel = {
            opacityPct: Math.round((Math.max(0.05, Math.min(1, Number(target.opacity) || Number(params.customTargetOpacity) || 0.65))) * 100),
        };
        const nameCtrl = rowFolder.add(rowNameModel, 'name').name('Name');
        nameCtrl.onFinishChange((value) => {
            const renamed = renameCustomTargetById(target.id, value);
            if (renamed) return;
            rowNameModel.name = target.name;
            nameCtrl.updateDisplay();
        });
        rowFolder.add(target, 'visible').name('Visible').onChange(() => {
            rebuildCustomTargets();
            persistCustomTargetsToStorage();
        });
        rowFolder.addColor(target, 'color').name('Color').onChange(() => {
            rebuildCustomTargets();
            persistCustomTargetsToStorage();
        });
        bindSliderRealtime(
            rowFolder.add(target, 'size', 5, 200, 1).name('Size (m)'),
            () => {
                rebuildCustomTargets();
            },
            () => {
                rebuildCustomTargets();
                persistCustomTargetsToStorage();
            }
        );
        bindSliderRealtime(
            rowFolder.add(rowOpacityModel, 'opacityPct', 5, 100, 1).name('Opacity (%)'),
            (v) => {
                const pct = Math.max(5, Math.min(100, Number(v) || 65));
                rowOpacityModel.opacityPct = pct;
                target.opacity = pct / 100;
                rebuildCustomTargets();
            },
            (v) => {
                const pct = Math.max(5, Math.min(100, Number(v) || 65));
                rowOpacityModel.opacityPct = pct;
                target.opacity = pct / 100;
                rebuildCustomTargets();
                persistCustomTargetsToStorage();
            }
        );
        bindSliderRealtime(
            rowFolder.add(target, 'offsetEastM', -5000, 5000, 1).name('East/West (m)'),
            () => {
                rebuildCustomTargets();
                rebuildCustomHorizonWells();
            },
            () => {
                rebuildCustomTargets();
                rebuildCustomHorizonWells();
                persistCustomTargetsToStorage();
            }
        );
        bindSliderRealtime(
            rowFolder.add(target, 'offsetNorthM', -5000, 5000, 1).name('North/South (m)'),
            () => {
                rebuildCustomTargets();
                rebuildCustomHorizonWells();
            },
            () => {
                rebuildCustomTargets();
                rebuildCustomHorizonWells();
                persistCustomTargetsToStorage();
            }
        );
        const rowActions = {
            deleteTarget: () => removeCustomTargetById(target.id),
        };
        rowFolder.add(rowActions, 'deleteTarget').name('Delete');
        customTargetRowFolders.push(rowFolder);
    });
}

function addCustomTargetFromIntersection(intersection) {
    const mesh = intersection.object;
    if (!(mesh instanceof THREE.Mesh) || !mesh.userData.isHorizon) return;
    const survey = mesh.userData.survey;
    const layerName = mesh.userData.layerName;
    const surveyGroup = getSurveyGroupByName(survey);
    if (!surveyGroup) return;

    const localPos = surveyGroup.worldToLocal(intersection.point.clone());
    const target = {
        id: `ct_${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
        name: nextCustomTargetName(),
        survey,
        layerName,
        baseLocal: { x: localPos.x, y: localPos.y, z: localPos.z },
        offsetEastM: 0,
        offsetNorthM: 0,
        visible: true,
        color: params.customTargetColor,
        size: params.customTargetSize,
        opacity: params.customTargetOpacity,
    };
    customTargets.push(target);
    rebuildCustomTargets();
    rebuildCustomTargetControllers();
    rebuildCustomHorizonWells();
    persistCustomTargetsToStorage();
}

function clearAllCustomTargets() {
    customTargets.length = 0;
    rebuildCustomTargetSerial();
    rebuildCustomTargets();
    rebuildCustomTargetControllers();
    rebuildCustomHorizonWells();
    rebuildCustomHorizonWellControllers();
    persistCustomTargetsToStorage();
}

function setCustomTargetsFromData(targets, options = {}) {
    const persist = options.persist === true;
    customTargets.length = 0;
    if (Array.isArray(targets)) {
        targets.forEach((raw, i) => {
            if (!raw || !raw.baseLocal) return;
            if ((raw.survey !== 'norne' && raw.survey !== 'volve') || !raw.layerName) return;

            const safeName = typeof raw.name === 'string' && raw.name.trim()
                ? raw.name.trim()
                : `Target ${i + 1}`;
            let uniqueName = safeName;
            let suffix = 2;
            while (customTargets.some(t => t.name === uniqueName)) {
                uniqueName = `${safeName} (${suffix++})`;
            }
            customTargets.push({
                id: typeof raw.id === 'string' && raw.id ? raw.id : `ct_${Date.now()}_${i}`,
                name: uniqueName,
                survey: raw.survey,
                layerName: raw.layerName,
                baseLocal: {
                    x: Number(raw.baseLocal.x) || 0,
                    y: Number(raw.baseLocal.y) || 0,
                    z: Number(raw.baseLocal.z) || 0,
                },
                offsetEastM: Number(raw.offsetEastM) || 0,
                offsetNorthM: Number(raw.offsetNorthM) || 0,
                visible: raw.visible !== false,
                color: typeof raw.color === 'string' && raw.color ? raw.color : params.customTargetColor,
                size: Number(raw.size) > 0 ? Number(raw.size) : params.customTargetSize,
                opacity: Number(raw.opacity) > 0 ? Number(raw.opacity) : params.customTargetOpacity,
            });
        });
    }
    rebuildCustomTargetSerial();
    rebuildCustomTargets();
    rebuildCustomTargetControllers();
    rebuildCustomHorizonWells();
    rebuildCustomHorizonWellControllers();
    if (persist) persistCustomTargetsToStorage();
}

function loadCustomTargetsFromStorage() {
    const raw = localStorage.getItem(CUSTOM_TARGETS_STORAGE_KEY);
    if (!raw) {
        setCustomTargetsFromData([]);
        return;
    }
    try {
        const parsed = JSON.parse(raw);
        setCustomTargetsFromData(parsed);
    } catch (e) {
        setCustomTargetsFromData([]);
    }
}

// ─────────────────────────────────────────────────────────────
// CUSTOM HORIZON WELLS
// ─────────────────────────────────────────────────────────────
const customHorizonWells = []; // { id, name, targetIds, headLocal:{x,y,z}, kickoffDepthM, doglegSeverity, visible, color, wellheadColor, pathStyle, tubeRadius, dotSizingMode, dotSize, dotStartSize, dotEndSize, dotSpacing, ringSizingMode, ringSize, ringStartSize, ringEndSize, ringSpacing, ringColor, ringOpacity, showWellhead, wellheadScale }
let customHorizonWellSerial = 1;
let customWellPickerSelectedTargetIds = new Set();
let editWellTargetsTargetWellId = null;
let editWellTargetsSelectedTargetIds = new Set();

const customHorizonWellUi = {
    createNewWell: () => openCreateCustomHorizonWellModal(),
    deleteAll: () => clearAllCustomHorizonWells(),
};

function orderedUniqueTargetIds(targetIds) {
    const seen = new Set();
    const out = [];
    for (const id of Array.isArray(targetIds) ? targetIds : []) {
        if (typeof id !== 'string' || !id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

function getCustomTargetById(targetId) {
    return customTargets.find(t => t.id === targetId) || null;
}

function customWellTargetOrderLabel(index1Based) {
    const labels = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
    if (index1Based >= 1 && index1Based <= labels.length) return `${labels[index1Based - 1]} Target`;
    return `Target ${index1Based}`;
}

function setCustomHorizonWellTargetAtPosition(wellId, positionIndex, targetId) {
    const well = getCustomHorizonWellById(wellId);
    if (!well) return;
    const ids = orderedUniqueTargetIds(well.targetIds).filter(id => !!getCustomTargetById(id));
    if (positionIndex < 0 || positionIndex >= ids.length) return;
    const selectedIndex = ids.indexOf(targetId);
    if (selectedIndex < 0) return;
    if (selectedIndex === positionIndex) return;
    const prev = ids[positionIndex];
    ids[positionIndex] = targetId;
    ids[selectedIndex] = prev;
    well.targetIds = ids;
    rebuildCustomHorizonWells();
    rebuildCustomHorizonWellControllers();
    persistCustomHorizonWellsToStorage();
}

function nextCustomHorizonWellName() {
    let name = `Custom Well ${customHorizonWellSerial++}`;
    while (customHorizonWells.some(w => w.name === name)) {
        name = `Custom Well ${customHorizonWellSerial++}`;
    }
    return name;
}

function rebuildCustomHorizonWellSerial() {
    customHorizonWellSerial = 1;
    customHorizonWells.forEach(w => {
        const m = /^Custom Well\s+(\d+)$/.exec(w.name || '');
        if (m) customHorizonWellSerial = Math.max(customHorizonWellSerial, parseInt(m[1], 10) + 1);
    });
}

function makeUniqueCustomHorizonWellName(baseName, excludeWellId = null) {
    const trimmed = typeof baseName === 'string' ? baseName.trim() : '';
    if (!trimmed) return null;
    let uniqueName = trimmed;
    let suffix = 2;
    while (customHorizonWells.some(w => w.id !== excludeWellId && w.name === uniqueName)) {
        uniqueName = `${trimmed} (${suffix++})`;
    }
    return uniqueName;
}

function renameCustomHorizonWellById(wellId, proposedName) {
    const well = customHorizonWells.find(w => w.id === wellId);
    if (!well) return null;
    const uniqueName = makeUniqueCustomHorizonWellName(proposedName, wellId);
    if (!uniqueName) return null;
    if (uniqueName === well.name) return uniqueName;
    well.name = uniqueName;
    rebuildCustomHorizonWellSerial();
    rebuildCustomHorizonWellControllers();
    rebuildCustomTieBackLineControllers();
    persistCustomHorizonWellsToStorage();
    return uniqueName;
}

function getCustomHorizonWellsState() {
    return customHorizonWells.map(w => ({
        id: w.id,
        name: w.name,
        targetIds: [...w.targetIds],
        headLocal: { x: w.headLocal.x, y: w.headLocal.y, z: w.headLocal.z },
        visible: w.visible,
        color: w.color,
        wellheadColor: w.wellheadColor,
        pathStyle: w.pathStyle,
        tubeRadius: w.tubeRadius,
        dotSizingMode: w.dotSizingMode,
        dotSize: w.dotSize,
        dotStartSize: w.dotStartSize,
        dotEndSize: w.dotEndSize,
        dotSpacing: w.dotSpacing,
        ringSizingMode: w.ringSizingMode,
        ringSize: w.ringSize,
        ringStartSize: w.ringStartSize,
        ringEndSize: w.ringEndSize,
        ringSpacing: w.ringSpacing,
        ringColor: w.ringColor,
        ringOpacity: w.ringOpacity,
        kickoffDepthM: w.kickoffDepthM,
        doglegSeverity: w.doglegSeverity,
        showWellhead: w.showWellhead,
        wellheadScale: w.wellheadScale,
    }));
}

function persistCustomHorizonWellsToStorage() {
    try {
        localStorage.setItem(CUSTOM_HORIZON_WELLS_STORAGE_KEY, JSON.stringify(getCustomHorizonWellsState()));
    } catch (e) {}
    pushCustomActionHistorySnapshot();
}

function getCustomHorizonWellById(wellId) {
    return customHorizonWells.find(w => w.id === wellId) || null;
}

function clearCustomHorizonWellMeshes() {
    while (customHorizonWellGroup.children.length > 0) {
        const obj = customHorizonWellGroup.children[0];
        customHorizonWellGroup.remove(obj);
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material?.dispose();
    }
}

function getCustomWellTargetWorldPoints(well) {
    const out = [];
    for (const targetId of well.targetIds) {
        const target = getCustomTargetById(targetId);
        if (!target) continue;
        const world = resolveCustomTargetWorldPosition(target);
        if (!world) continue;
        out.push(world);
    }
    return out;
}

function buildCustomWellPathCurve(well, targetWorldPoints) {
    if (!Array.isArray(targetWorldPoints) || targetWorldPoints.length === 0) return null;
    const headLocal = new THREE.Vector3(
        Number(well.headLocal?.x) || 0,
        Number(well.headLocal?.y) || 0,
        Number(well.headLocal?.z) || 0
    );
    const targetsLocal = targetWorldPoints.map(p => wellGroup.worldToLocal(p.clone()));
    const firstTarget = targetsLocal[0];
    if (!firstTarget) return null;

    const curvePath = new THREE.CurvePath();
    const addLine = (a, b) => {
        if (a.distanceTo(b) <= 1) return;
        curvePath.add(new THREE.LineCurve3(a.clone(), b.clone()));
    };

    const kickoffDepthM = Math.max(50, Number(well.kickoffDepthM) || 1500);
    const kickoffPoint = new THREE.Vector3(headLocal.x, -kickoffDepthM, headLocal.z);
    if (headLocal.y <= kickoffPoint.y + 1) {
        // Keep wellhead above kickoff so the initial section remains a vertical descent.
        headLocal.y = kickoffPoint.y + 1;
    }

    // Vertical section from wellhead to kickoff point.
    addLine(headLocal, kickoffPoint);

    // Rounded kickoff segment (dogleg) into the straight first lateral section.
    const toFirst = new THREE.Vector3().subVectors(firstTarget, kickoffPoint);
    const toFirstLen = toFirst.length();
    let straightDir = null;
    if (targetsLocal.length >= 2) {
        const firstToSecond = new THREE.Vector3().subVectors(targetsLocal[1], targetsLocal[0]);
        if (firstToSecond.lengthSq() > 1e-6) {
            straightDir = firstToSecond.normalize();
        }
    }
    if (!straightDir) {
        straightDir = toFirstLen > 1e-6 ? toFirst.clone().divideScalar(toFirstLen) : new THREE.Vector3(1, 0, 0);
    }
    let curveEnd = kickoffPoint.clone();
    if (toFirstLen > 2) {
        const dogleg = Math.max(1, Math.min(20, Number(well.doglegSeverity) || 8));
        const baseCurveLen = Math.max(75, Math.min(3000, toFirstLen * 0.24));
        const curveLen = Math.max(30, Math.min(toFirstLen * 0.8, baseCurveLen * (8 / dogleg)));
        if (curveLen > 10 && curveLen < toFirstLen - 1) {
            curveEnd = firstTarget.clone().add(straightDir.clone().multiplyScalar(-curveLen));
            const severityT = (dogleg - 1) / 19;
            const startHandle = curveLen * THREE.MathUtils.lerp(0.46, 0.24, severityT);
            const endHandle = curveLen * THREE.MathUtils.lerp(0.42, 0.18, severityT);
            const c1 = kickoffPoint.clone().add(new THREE.Vector3(0, -1, 0).multiplyScalar(startHandle));
            const c2 = curveEnd.clone().add(straightDir.clone().multiplyScalar(-endHandle));
            const minTurnY = Math.min(kickoffPoint.y, curveEnd.y);
            const maxTurnY = Math.max(kickoffPoint.y, curveEnd.y);
            c1.y = THREE.MathUtils.clamp(c1.y, minTurnY, maxTurnY);
            c2.y = THREE.MathUtils.clamp(c2.y, minTurnY, maxTurnY);
            curvePath.add(new THREE.CubicBezierCurve3(
                kickoffPoint.clone(),
                c1,
                c2,
                curveEnd.clone()
            ));
        }
    }

    // From end of curved kickoff onward, trajectory is straight between targets.
    addLine(curveEnd, firstTarget);
    for (let i = 1; i < targetsLocal.length; i++) {
        addLine(targetsLocal[i - 1], targetsLocal[i]);
    }

    return curvePath.curves.length > 0 ? curvePath : null;
}

function rebuildCustomHorizonWells() {
    clearCustomHorizonWellMeshes();
    if (customHorizonWells.length === 0) {
        rebuildCustomSurfaceNetworks();
        return;
    }

    let mutated = false;
    let needsControllerRefresh = false;
    for (const well of customHorizonWells) {
        const validTargetIds = orderedUniqueTargetIds(well.targetIds).filter(id => !!getCustomTargetById(id));
        if (validTargetIds.length !== well.targetIds.length || validTargetIds.some((id, i) => id !== well.targetIds[i])) {
            well.targetIds = validTargetIds;
            mutated = true;
            needsControllerRefresh = true;
        }
        const minHeadY = -(Math.max(50, Number(well.kickoffDepthM) || 1500)) + 1;
        if ((Number(well.headLocal?.y) || 0) <= minHeadY) {
            well.headLocal.y = minHeadY;
            mutated = true;
        }
        if (well.dotSizingMode !== 'uniform' && well.dotSizingMode !== 'grows_with_depth') {
            well.dotSizingMode = 'uniform';
            mutated = true;
        }
        if (well.ringSizingMode !== 'uniform' && well.ringSizingMode !== 'grows_with_depth') {
            well.ringSizingMode = 'uniform';
            mutated = true;
        }
        if (well.pathStyle !== 'tube' && well.pathStyle !== 'dots' && well.pathStyle !== 'rings') {
            well.pathStyle = 'tube';
            mutated = true;
            needsControllerRefresh = true;
        }
        if (!well.visible) continue;
        if (well.targetIds.length === 0) continue;

        const targetWorldPoints = getCustomWellTargetWorldPoints(well);
        if (targetWorldPoints.length === 0) continue;
        const pathCurve = buildCustomWellPathCurve(well, targetWorldPoints);
        if (!pathCurve) continue;

        const color = new THREE.Color(well.color || params.customHorizonWellColor);
        const pathStyle = well.pathStyle === 'dots'
            ? 'dots'
            : (well.pathStyle === 'rings' ? 'rings' : 'tube');
        const totalLength = Math.max(1, pathCurve.getLength());
        const tubeRadius = Math.max(0.5, Number(well.tubeRadius) || Number(params.customHorizonWellTubeRadius) || 4);
        const dotSize = Math.max(1, Number(well.dotSize) || Number(params.customHorizonWellDotSize) || 4);
        const dotSizingMode = well.dotSizingMode === 'grows_with_depth' ? 'grows_with_depth' : 'uniform';
        const dotStartSize = Math.max(0.5, Number(well.dotStartSize) || dotSize);
        const dotEndSize = Math.max(0.5, Number(well.dotEndSize) || dotStartSize);
        const dotSpacing = Math.max(5, Number(well.dotSpacing) || Number(params.customHorizonWellDotSpacing) || 40);
        const ringSizingMode = well.ringSizingMode === 'grows_with_depth' ? 'grows_with_depth' : 'uniform';
        const ringSize = Math.max(1, Number(well.ringSize) || 12);
        const ringStartSize = Math.max(1, Number(well.ringStartSize) || ringSize);
        const ringEndSize = Math.max(1, Number(well.ringEndSize) || ringStartSize);
        const ringSpacing = Math.max(1, Number(well.ringSpacing) || 40);
        const ringColor = new THREE.Color(well.ringColor || well.color || params.customHorizonWellColor);
        const ringOpacity = THREE.MathUtils.clamp(Number(well.ringOpacity), 0, 1);

        if (pathStyle === 'tube' || pathStyle === 'rings') {
            const tubeSegments = Math.max(24, Math.round(totalLength / 20));
            const tubeGeo = new THREE.TubeGeometry(pathCurve, tubeSegments, tubeRadius, 8, false);
            const tubeMat = new THREE.MeshPhongMaterial({
                color,
                emissive: color.clone().multiplyScalar(0.15),
                shininess: 60,
            });
            const tube = new THREE.Mesh(tubeGeo, tubeMat);
            tube.userData = { isCustomHorizonWell: true, customHorizonWellId: well.id };
            customHorizonWellGroup.add(tube);
        }
        if (pathStyle === 'dots') {
            const dotCount = Math.max(2, Math.floor(totalLength / dotSpacing));
            const dotGeo = new THREE.SphereGeometry(1, 8, 8);
            const dotMat = new THREE.MeshPhongMaterial({
                color,
                emissive: color.clone().multiplyScalar(0.15),
                shininess: 60,
            });
            const instanced = new THREE.InstancedMesh(dotGeo, dotMat, dotCount);
            const dummy = new THREE.Object3D();
            const yCompensation = 1 / (params.zScale || 1);
            for (let i = 0; i < dotCount; i++) {
                const t = i / (dotCount - 1);
                const p = pathCurve.getPointAt(t);
                const dotScale = dotSizingMode === 'grows_with_depth'
                    ? THREE.MathUtils.lerp(dotStartSize, dotEndSize, t)
                    : dotSize;
                dummy.position.copy(p);
                dummy.scale.set(dotScale, dotScale * yCompensation, dotScale);
                dummy.updateMatrix();
                instanced.setMatrixAt(i, dummy.matrix);
            }
            instanced.instanceMatrix.needsUpdate = true;
            instanced.userData = { isCustomHorizonWell: true, customHorizonWellId: well.id };
            customHorizonWellGroup.add(instanced);
        }
        if (pathStyle === 'rings') {
            const ringCount = Math.max(2, Math.floor(totalLength / ringSpacing));
            const ringGeo = new THREE.TorusGeometry(1, 0.08, 8, 28);
            const ringMat = new THREE.MeshPhongMaterial({
                color: ringColor,
                emissive: ringColor.clone().multiplyScalar(0.12),
                shininess: 40,
                transparent: true,
                opacity: Number.isFinite(ringOpacity) ? ringOpacity : 0.65,
                depthWrite: (Number.isFinite(ringOpacity) ? ringOpacity : 0.65) >= 0.99,
            });
            const instancedRings = new THREE.InstancedMesh(ringGeo, ringMat, ringCount);
            const dummy = new THREE.Object3D();
            const tangent = new THREE.Vector3();
            const ringNormal = new THREE.Vector3(0, 0, 1);
            for (let i = 0; i < ringCount; i++) {
                const t = i / (ringCount - 1);
                const p = pathCurve.getPointAt(t);
                const ringDiameter = ringSizingMode === 'grows_with_depth'
                    ? THREE.MathUtils.lerp(ringStartSize, ringEndSize, t)
                    : ringSize;
                const ringRadius = Math.max(0.5, ringDiameter * 0.5);
                pathCurve.getTangentAt(t, tangent);
                if (tangent.lengthSq() <= 1e-8) tangent.set(1, 0, 0);
                else tangent.normalize();
                dummy.position.copy(p);
                dummy.quaternion.setFromUnitVectors(ringNormal, tangent);
                dummy.scale.setScalar(ringRadius);
                dummy.updateMatrix();
                instancedRings.setMatrixAt(i, dummy.matrix);
            }
            instancedRings.instanceMatrix.needsUpdate = true;
            instancedRings.userData = { isCustomHorizonWell: true, customHorizonWellId: well.id };
            customHorizonWellGroup.add(instancedRings);
        }

        if (well.showWellhead !== false) {
            const wellheadColor = new THREE.Color(well.wellheadColor || well.color || params.customHorizonWellColor);
            const wellheadScale = Math.max(0.2, Number(well.wellheadScale) || Number(params.customHorizonWellheadScale) || 1);
            const coneRadius = tubeRadius * 3 * wellheadScale;
            const coneHeight = coneRadius * 3;
            const headGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 16);
            const headMat = new THREE.MeshPhongMaterial({
                color: wellheadColor,
                emissive: wellheadColor.clone().multiplyScalar(0.3),
            });
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.set(
                Number(well.headLocal?.x) || 0,
                Number(well.headLocal?.y) || 0,
                Number(well.headLocal?.z) || 0
            );
            head.position.y += coneHeight * 0.5;
            head.scale.y = 1 / (params.zScale || 1);
            head.userData = {
                isCustomHorizonWell: true,
                isCustomHorizonWellhead: true,
                customHorizonWellId: well.id,
            };
            customHorizonWellGroup.add(head);
        }
    }

    if (mutated) {
        persistCustomHorizonWellsToStorage();
        if (needsControllerRefresh) rebuildCustomHorizonWellControllers();
    }
    rebuildCustomSurfaceNetworks();
}

function removeCustomHorizonWellById(wellId) {
    const idx = customHorizonWells.findIndex(w => w.id === wellId);
    if (idx < 0) return;
    customHorizonWells.splice(idx, 1);
    rebuildCustomHorizonWellSerial();
    rebuildCustomHorizonWells();
    rebuildCustomHorizonWellControllers();
    rebuildCustomTieBackLineControllers();
    persistCustomHorizonWellsToStorage();
}

function duplicateCustomHorizonWellById(wellId) {
    const src = getCustomHorizonWellById(wellId);
    if (!src) return null;

    const duplicated = {
        id: `chw_${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
        name: makeUniqueCustomHorizonWellName(`${src.name} Copy`) || nextCustomHorizonWellName(),
        targetIds: orderedUniqueTargetIds(src.targetIds),
        headLocal: {
            x: Number(src.headLocal?.x) || 0,
            y: Number(src.headLocal?.y) || 0,
            z: Number(src.headLocal?.z) || 0,
        },
        kickoffDepthM: Math.max(50, Number(src.kickoffDepthM) || 1500),
        doglegSeverity: Math.max(1, Math.min(20, Number(src.doglegSeverity) || 8)),
        visible: src.visible !== false,
        color: typeof src.color === 'string' && src.color ? src.color : params.customHorizonWellColor,
        wellheadColor: typeof src.wellheadColor === 'string' && src.wellheadColor
            ? src.wellheadColor
            : (typeof src.color === 'string' && src.color ? src.color : params.customHorizonWellColor),
        pathStyle: src.pathStyle === 'dots'
            ? 'dots'
            : (src.pathStyle === 'rings' ? 'rings' : 'tube'),
        tubeRadius: Math.max(1, Number(src.tubeRadius) || Number(params.customHorizonWellTubeRadius) || 4),
        dotSizingMode: src.dotSizingMode === 'grows_with_depth' ? 'grows_with_depth' : 'uniform',
        dotSize: Math.max(0.5, Number(src.dotSize) || Number(params.customHorizonWellDotSize) || 4),
        dotStartSize: Math.max(0.5, Number(src.dotStartSize) || Number(src.dotSize) || Number(params.customHorizonWellDotSize) || 4),
        dotEndSize: Math.max(0.5, Number(src.dotEndSize) || Number(src.dotSize) || Number(params.customHorizonWellDotSize) || 4),
        dotSpacing: Math.max(5, Number(src.dotSpacing) || Number(params.customHorizonWellDotSpacing) || 40),
        ringSizingMode: src.ringSizingMode === 'grows_with_depth' ? 'grows_with_depth' : 'uniform',
        ringSize: Math.max(1, Number(src.ringSize) || Number(params.customHorizonWellRingSize) || 12),
        ringStartSize: Math.max(1, Number(src.ringStartSize) || Number(src.ringSize) || Number(params.customHorizonWellRingStartSize) || 12),
        ringEndSize: Math.max(1, Number(src.ringEndSize) || Number(src.ringSize) || Number(params.customHorizonWellRingEndSize) || 24),
        ringSpacing: Math.max(1, Number(src.ringSpacing) || Number(params.customHorizonWellRingSpacing) || 40),
        ringColor: typeof src.ringColor === 'string' && src.ringColor ? src.ringColor : (typeof src.color === 'string' && src.color ? src.color : params.customHorizonWellColor),
        ringOpacity: Number.isFinite(Number(src.ringOpacity)) ? THREE.MathUtils.clamp(Number(src.ringOpacity), 0, 1) : Number(params.customHorizonWellRingOpacity),
        showWellhead: src.showWellhead !== false,
        wellheadScale: Math.max(0.2, Number(src.wellheadScale) || Number(params.customHorizonWellheadScale) || 1),
    };

    customHorizonWells.push(duplicated);
    rebuildCustomHorizonWells();
    rebuildCustomHorizonWellControllers();
    rebuildCustomTieBackLineControllers();
    persistCustomHorizonWellsToStorage();
    return duplicated.id;
}

function clearAllCustomHorizonWells() {
    customHorizonWells.length = 0;
    rebuildCustomHorizonWellSerial();
    rebuildCustomHorizonWells();
    rebuildCustomHorizonWellControllers();
    rebuildCustomTieBackLineControllers();
    persistCustomHorizonWellsToStorage();
}

function createCustomHorizonWellFromTargetIds(targetIds) {
    const validTargetIds = orderedUniqueTargetIds(targetIds).filter(id => !!getCustomTargetById(id));
    if (validTargetIds.length === 0) return null;

    const firstTarget = getCustomTargetById(validTargetIds[0]);
    if (!firstTarget) return null;
    const firstTargetWorld = resolveCustomTargetWorldPosition(firstTarget);
    if (!firstTargetWorld) return null;

    const defaultHeadWorld = firstTargetWorld.clone().add(new THREE.Vector3(0, 1200, 1800));
    const defaultHeadLocal = wellGroup.worldToLocal(defaultHeadWorld.clone());
    const firstTargetLocal = wellGroup.worldToLocal(firstTargetWorld.clone());
    const defaultKickoffDepthM = Math.max(100, Math.round(Math.abs(firstTargetLocal.y) * 0.55));
    const well = {
        id: `chw_${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
        name: nextCustomHorizonWellName(),
        targetIds: validTargetIds,
        headLocal: {
            x: defaultHeadLocal.x,
            y: defaultHeadLocal.y,
            z: defaultHeadLocal.z,
        },
        kickoffDepthM: defaultKickoffDepthM,
        doglegSeverity: Number(params.customHorizonWellDoglegSeverity) || 8,
        visible: true,
        color: params.customHorizonWellColor,
        wellheadColor: params.customHorizonWellColor,
        pathStyle: params.customHorizonWellPathStyle === 'dots'
            ? 'dots'
            : (params.customHorizonWellPathStyle === 'rings' ? 'rings' : 'tube'),
        tubeRadius: params.customHorizonWellTubeRadius,
        dotSizingMode: 'uniform',
        dotSize: params.customHorizonWellDotSize,
        dotStartSize: params.customHorizonWellDotSize,
        dotEndSize: params.customHorizonWellDotSize,
        dotSpacing: params.customHorizonWellDotSpacing,
        ringSizingMode: params.customHorizonWellRingSizingMode === 'grows_with_depth' ? 'grows_with_depth' : 'uniform',
        ringSize: params.customHorizonWellRingSize,
        ringStartSize: params.customHorizonWellRingStartSize,
        ringEndSize: params.customHorizonWellRingEndSize,
        ringSpacing: params.customHorizonWellRingSpacing,
        ringColor: params.customHorizonWellRingColor || params.customHorizonWellColor,
        ringOpacity: Number.isFinite(Number(params.customHorizonWellRingOpacity))
            ? THREE.MathUtils.clamp(Number(params.customHorizonWellRingOpacity), 0, 1)
            : 0.65,
        showWellhead: params.customHorizonWellheadVisible !== false,
        wellheadScale: params.customHorizonWellheadScale,
    };
    customHorizonWells.push(well);
    rebuildCustomHorizonWells();
    rebuildCustomHorizonWellControllers();
    rebuildCustomTieBackLineControllers();
    persistCustomHorizonWellsToStorage();
    return well.id;
}

function renderCustomHorizonWellTargetPicker() {
    const listEl = document.getElementById('customWellTargetDropdownList');
    const labelEl = document.getElementById('customWellTargetDropdownLabel');
    if (!listEl || !labelEl) return;
    listEl.innerHTML = '';

    if (customTargets.length === 0) {
        labelEl.textContent = 'No custom targets available';
        const empty = document.createElement('div');
        empty.className = 'custom-well-picker-empty';
        empty.textContent = 'Create at least one custom target first.';
        listEl.appendChild(empty);
        return;
    }

    customTargets.forEach(target => {
        const row = document.createElement('label');
        row.className = 'custom-well-picker-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = customWellPickerSelectedTargetIds.has(target.id);
        cb.addEventListener('change', () => {
            if (cb.checked) customWellPickerSelectedTargetIds.add(target.id);
            else customWellPickerSelectedTargetIds.delete(target.id);
            renderCustomHorizonWellTargetPicker();
        });
        const text = document.createElement('span');
        text.textContent = target.name;
        row.appendChild(cb);
        row.appendChild(text);
        listEl.appendChild(row);
    });

    if (customWellPickerSelectedTargetIds.size === 0) {
        labelEl.textContent = 'Select target(s)';
    } else {
        const selectedNames = [...customWellPickerSelectedTargetIds]
            .map(id => getCustomTargetById(id)?.name)
            .filter(Boolean);
        labelEl.textContent = `${selectedNames.length} selected`;
    }
}

function renderEditCustomHorizonWellTargetPicker() {
    const listEl = document.getElementById('editWellTargetList');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (customTargets.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'custom-well-picker-empty';
        empty.textContent = 'No custom targets available.';
        listEl.appendChild(empty);
        return;
    }

    customTargets.forEach(target => {
        const row = document.createElement('label');
        row.className = 'custom-well-picker-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = editWellTargetsSelectedTargetIds.has(target.id);
        cb.addEventListener('change', () => {
            if (cb.checked) editWellTargetsSelectedTargetIds.add(target.id);
            else editWellTargetsSelectedTargetIds.delete(target.id);
        });
        const text = document.createElement('span');
        text.textContent = target.name;
        row.appendChild(cb);
        row.appendChild(text);
        listEl.appendChild(row);
    });
}

function openEditCustomHorizonWellTargetsModal(wellId) {
    const well = getCustomHorizonWellById(wellId);
    if (!well) return;
    editWellTargetsTargetWellId = wellId;
    editWellTargetsSelectedTargetIds = new Set(
        orderedUniqueTargetIds(well.targetIds).filter(id => !!getCustomTargetById(id))
    );
    const titleEl = document.getElementById('editWellTargetsTitle');
    if (titleEl) titleEl.textContent = `Edit Targets — ${well.name}`;
    renderEditCustomHorizonWellTargetPicker();
    const modal = document.getElementById('editWellTargetsModal');
    if (modal) modal.style.display = 'flex';
}

function confirmEditCustomHorizonWellTargetsModal() {
    const well = getCustomHorizonWellById(editWellTargetsTargetWellId);
    if (!well) {
        window.closeModal?.('editWellTargetsModal');
        return;
    }
    const selected = orderedUniqueTargetIds([...editWellTargetsSelectedTargetIds]).filter(id => !!getCustomTargetById(id));
    if (selected.length === 0) {
        alert('Select at least one target for the well trajectory.');
        return;
    }

    const current = orderedUniqueTargetIds(well.targetIds).filter(id => !!getCustomTargetById(id));
    const selectedSet = new Set(selected);
    const ordered = [
        ...current.filter(id => selectedSet.has(id)),
        ...selected.filter(id => !current.includes(id)),
    ];
    well.targetIds = ordered;
    rebuildCustomHorizonWells();
    rebuildCustomHorizonWellControllers();
    persistCustomHorizonWellsToStorage();
    window.closeModal?.('editWellTargetsModal');
}

function openCreateCustomHorizonWellModal(prefillTargetIds = []) {
    if (customTargets.length === 0) {
        alert('Create at least one custom target first.');
        return;
    }
    customWellPickerSelectedTargetIds = new Set(
        orderedUniqueTargetIds(prefillTargetIds).filter(id => !!getCustomTargetById(id))
    );
    const listEl = document.getElementById('customWellTargetDropdownList');
    if (listEl) listEl.classList.remove('open');
    renderCustomHorizonWellTargetPicker();
    const modal = document.getElementById('createWellModal');
    if (modal) modal.style.display = 'flex';
}

function confirmCreateCustomHorizonWellFromModal() {
    const targetIds = [...customWellPickerSelectedTargetIds];
    const createdId = createCustomHorizonWellFromTargetIds(targetIds);
    if (!createdId) {
        alert('Select at least one target to create a custom well.');
        return;
    }
    customWellPickerSelectedTargetIds = new Set();
    const modal = document.getElementById('createWellModal');
    if (modal) modal.style.display = 'none';
}

function setCustomHorizonWellsFromData(wells, options = {}) {
    const persist = options.persist === true;
    customHorizonWells.length = 0;
    if (Array.isArray(wells)) {
        wells.forEach((raw, i) => {
            if (!raw) return;
            const safeName = typeof raw.name === 'string' && raw.name.trim()
                ? raw.name.trim()
                : `Custom Well ${i + 1}`;
            let uniqueName = safeName;
            let suffix = 2;
            while (customHorizonWells.some(w => w.name === uniqueName)) {
                uniqueName = `${safeName} (${suffix++})`;
            }
            customHorizonWells.push({
                id: typeof raw.id === 'string' && raw.id ? raw.id : `chw_${Date.now()}_${i}`,
                name: uniqueName,
                targetIds: orderedUniqueTargetIds(raw.targetIds),
                headLocal: {
                    x: Number(raw.headLocal?.x) || 0,
                    y: Number(raw.headLocal?.y) || 0,
                    z: Number(raw.headLocal?.z) || 0,
                },
                visible: raw.visible !== false,
                color: typeof raw.color === 'string' && raw.color ? raw.color : params.customHorizonWellColor,
                wellheadColor: typeof raw.wellheadColor === 'string' && raw.wellheadColor ? raw.wellheadColor : (typeof raw.color === 'string' && raw.color ? raw.color : params.customHorizonWellColor),
                pathStyle: raw.pathStyle === 'dots'
                    ? 'dots'
                    : (raw.pathStyle === 'rings' ? 'rings' : 'tube'),
                tubeRadius: Number(raw.tubeRadius) > 0 ? Number(raw.tubeRadius) : params.customHorizonWellTubeRadius,
                dotSize: Number(raw.dotSize) > 0 ? Number(raw.dotSize) : params.customHorizonWellDotSize,
                dotSizingMode: raw.dotSizingMode === 'grows_with_depth' ? 'grows_with_depth' : 'uniform',
                dotStartSize: Number(raw.dotStartSize) > 0 ? Number(raw.dotStartSize) : (Number(raw.dotSize) > 0 ? Number(raw.dotSize) : params.customHorizonWellDotSize),
                dotEndSize: Number(raw.dotEndSize) > 0 ? Number(raw.dotEndSize) : (Number(raw.dotSize) > 0 ? Number(raw.dotSize) : params.customHorizonWellDotSize),
                dotSpacing: Number(raw.dotSpacing) > 0 ? Number(raw.dotSpacing) : params.customHorizonWellDotSpacing,
                ringSizingMode: raw.ringSizingMode === 'grows_with_depth' ? 'grows_with_depth' : 'uniform',
                ringSize: Number(raw.ringSize) > 0 ? Number(raw.ringSize) : params.customHorizonWellRingSize,
                ringStartSize: Number(raw.ringStartSize) > 0 ? Number(raw.ringStartSize) : (Number(raw.ringSize) > 0 ? Number(raw.ringSize) : params.customHorizonWellRingStartSize),
                ringEndSize: Number(raw.ringEndSize) > 0 ? Number(raw.ringEndSize) : (Number(raw.ringSize) > 0 ? Number(raw.ringSize) : params.customHorizonWellRingEndSize),
                ringSpacing: Number(raw.ringSpacing) > 0 ? Number(raw.ringSpacing) : params.customHorizonWellRingSpacing,
                ringColor: typeof raw.ringColor === 'string' && raw.ringColor ? raw.ringColor : (typeof raw.color === 'string' && raw.color ? raw.color : params.customHorizonWellColor),
                ringOpacity: Number.isFinite(Number(raw.ringOpacity))
                    ? THREE.MathUtils.clamp(Number(raw.ringOpacity), 0, 1)
                    : (Number.isFinite(Number(params.customHorizonWellRingOpacity)) ? THREE.MathUtils.clamp(Number(params.customHorizonWellRingOpacity), 0, 1) : 0.65),
                kickoffDepthM: Number(raw.kickoffDepthM) > 0 ? Number(raw.kickoffDepthM) : 1500,
                doglegSeverity: Number(raw.doglegSeverity) > 0 ? Number(raw.doglegSeverity) : (Number(params.customHorizonWellDoglegSeverity) || 8),
                showWellhead: raw.showWellhead !== false,
                wellheadScale: Number(raw.wellheadScale) > 0 ? Number(raw.wellheadScale) : params.customHorizonWellheadScale,
            });
        });
    }
    rebuildCustomHorizonWellSerial();
    rebuildCustomHorizonWells();
    rebuildCustomHorizonWellControllers();
    rebuildCustomTieBackLineControllers();
    if (persist) persistCustomHorizonWellsToStorage();
}

function loadCustomHorizonWellsFromStorage() {
    const raw = localStorage.getItem(CUSTOM_HORIZON_WELLS_STORAGE_KEY);
    if (!raw) {
        setCustomHorizonWellsFromData([]);
        return;
    }
    try {
        const parsed = JSON.parse(raw);
        setCustomHorizonWellsFromData(parsed);
    } catch (e) {
        setCustomHorizonWellsFromData([]);
    }
}

function rebuildCustomHorizonWellControllers() {
    if (!customHorizonWellFolder) return;

    const scrollState = captureGuiScrollStateForFolder(customHorizonWellFolder);

    customHorizonWellRowFolders.forEach(folder => folder.destroy());
    customHorizonWellRowFolders = [];
    if (customHorizonWellDeleteAllCtrl) {
        customHorizonWellDeleteAllCtrl.destroy();
        customHorizonWellDeleteAllCtrl = null;
    }

    if (!customHorizonWellCreateCtrl) {
        customHorizonWellCreateCtrl = customHorizonWellFolder.add(customHorizonWellUi, 'createNewWell').name('Create New Well');
    }
    customHorizonWells.forEach(well => {
        const rowFolder = customHorizonWellFolder.addFolder(well.name);
        _trackFolder(rowFolder, `custom-horizon-well:${well.id}`);

        const rowNameModel = { name: well.name };
        const nameCtrl = rowFolder.add(rowNameModel, 'name').name('Name');
        nameCtrl.onFinishChange((value) => {
            const renamed = renameCustomHorizonWellById(well.id, value);
            if (renamed) return;
            rowNameModel.name = well.name;
            nameCtrl.updateDisplay();
        });

        rowFolder.add(well, 'visible').name('Visible').onChange(() => {
            rebuildCustomHorizonWells();
            persistCustomHorizonWellsToStorage();
        });
        rowFolder.addColor(well, 'color').name('Color').onChange(() => {
            rebuildCustomHorizonWells();
            persistCustomHorizonWellsToStorage();
        });
        rowFolder.addColor(well, 'wellheadColor').name('Wellhead Color').onChange(() => {
            rebuildCustomHorizonWells();
            persistCustomHorizonWellsToStorage();
        });
        bindSliderRealtime(
            rowFolder.add(well, 'kickoffDepthM', 50, 8000, 10).name('Kickoff Depth (m)'),
            () => {
                rebuildCustomHorizonWells();
            },
            () => {
                rebuildCustomHorizonWells();
                persistCustomHorizonWellsToStorage();
            }
        );
        bindSliderRealtime(
            rowFolder.add(well, 'doglegSeverity', 1, 20, 0.1).name('Dogleg Severity'),
            () => {
                rebuildCustomHorizonWells();
            },
            () => {
                rebuildCustomHorizonWells();
                persistCustomHorizonWellsToStorage();
            }
        );
        const headPosModel = {
            headEastWestM: Number(well.headLocal?.x) || 0,
            headHeightM: Number(well.headLocal?.y) || 0,
            headNorthSouthM: -(Number(well.headLocal?.z) || 0),
        };
        bindSliderRealtime(
            rowFolder.add(headPosModel, 'headEastWestM', -25000, 25000, 1).name('Head East/West (m)'),
            (v) => {
                well.headLocal.x = Number(v) || 0;
                rebuildCustomHorizonWells();
            },
            (v) => {
                well.headLocal.x = Number(v) || 0;
                rebuildCustomHorizonWells();
                persistCustomHorizonWellsToStorage();
            }
        );
        bindSliderRealtime(
            rowFolder.add(headPosModel, 'headHeightM', -5000, 5000, 10).name('Head Height (m)'),
            (v) => {
                const requestedY = Number(v) || 0;
                const minHeadY = -(Math.max(50, Number(well.kickoffDepthM) || 1500)) + 1;
                well.headLocal.y = Math.max(requestedY, minHeadY);
                headPosModel.headHeightM = well.headLocal.y;
                rebuildCustomHorizonWells();
            },
            (v) => {
                const requestedY = Number(v) || 0;
                const minHeadY = -(Math.max(50, Number(well.kickoffDepthM) || 1500)) + 1;
                well.headLocal.y = Math.max(requestedY, minHeadY);
                headPosModel.headHeightM = well.headLocal.y;
                rebuildCustomHorizonWells();
                persistCustomHorizonWellsToStorage();
            }
        );
        bindSliderRealtime(
            rowFolder.add(headPosModel, 'headNorthSouthM', -25000, 25000, 1).name('Head North/South (m)'),
            (v) => {
                well.headLocal.z = -(Number(v) || 0);
                rebuildCustomHorizonWells();
            },
            (v) => {
                well.headLocal.z = -(Number(v) || 0);
                rebuildCustomHorizonWells();
                persistCustomHorizonWellsToStorage();
            }
        );
        rowFolder.add(well, 'pathStyle', ['tube', 'dots', 'rings']).name('Path Style').onChange(() => {
            rebuildCustomHorizonWells();
            rebuildCustomHorizonWellControllers();
            persistCustomHorizonWellsToStorage();
        });
        if (well.pathStyle === 'dots') {
            rowFolder.add(well, 'dotSizingMode', {
                'Uniform': 'uniform',
                'Grows with depth': 'grows_with_depth',
            }).name('Dot Sizing').onChange((value) => {
                if (value !== 'uniform' && value !== 'grows_with_depth') {
                    well.dotSizingMode = 'uniform';
                }
                rebuildCustomHorizonWells();
                rebuildCustomHorizonWellControllers();
                persistCustomHorizonWellsToStorage();
            });
            if (well.dotSizingMode === 'grows_with_depth') {
                bindSliderRealtime(
                    rowFolder.add(well, 'dotStartSize', 0.5, 30, 0.5).name('Starting Dot Size (m)'),
                    () => {
                        rebuildCustomHorizonWells();
                    },
                    () => {
                        rebuildCustomHorizonWells();
                        persistCustomHorizonWellsToStorage();
                    }
                );
                bindSliderRealtime(
                    rowFolder.add(well, 'dotEndSize', 0.5, 30, 0.5).name('End Dot Size (m)'),
                    () => {
                        rebuildCustomHorizonWells();
                    },
                    () => {
                        rebuildCustomHorizonWells();
                        persistCustomHorizonWellsToStorage();
                    }
                );
            } else {
                bindSliderRealtime(
                    rowFolder.add(well, 'dotSize', 1, 15, 0.5).name('Dot Size (m)'),
                    () => {
                        rebuildCustomHorizonWells();
                    },
                    () => {
                        rebuildCustomHorizonWells();
                        persistCustomHorizonWellsToStorage();
                    }
                );
            }
            bindSliderRealtime(
                rowFolder.add(well, 'dotSpacing', 5, 100, 1).name('Dot Spacing (m)'),
                () => {
                    rebuildCustomHorizonWells();
                },
                () => {
                    rebuildCustomHorizonWells();
                    persistCustomHorizonWellsToStorage();
                }
            );
        } else {
            bindSliderRealtime(
                rowFolder.add(well, 'tubeRadius', 1, 30, 1).name('Tube Radius (m)'),
                () => {
                    rebuildCustomHorizonWells();
                },
                () => {
                    rebuildCustomHorizonWells();
                    persistCustomHorizonWellsToStorage();
                }
            );
        }
        if (well.pathStyle === 'rings') {
            rowFolder.addColor(well, 'ringColor').name('Ring Color').onChange(() => {
                rebuildCustomHorizonWells();
                persistCustomHorizonWellsToStorage();
            });
            bindSliderRealtime(
                rowFolder.add(well, 'ringOpacity', 0.05, 1, 0.05).name('Ring Opacity'),
                () => {
                    well.ringOpacity = THREE.MathUtils.clamp(Number(well.ringOpacity), 0, 1);
                    rebuildCustomHorizonWells();
                },
                () => {
                    well.ringOpacity = THREE.MathUtils.clamp(Number(well.ringOpacity), 0, 1);
                    rebuildCustomHorizonWells();
                    persistCustomHorizonWellsToStorage();
                }
            );
            rowFolder.add(well, 'ringSizingMode', {
                'Uniform': 'uniform',
                'Grows with depth': 'grows_with_depth',
            }).name('Ring Sizing').onChange((value) => {
                if (value !== 'uniform' && value !== 'grows_with_depth') {
                    well.ringSizingMode = 'uniform';
                }
                rebuildCustomHorizonWells();
                rebuildCustomHorizonWellControllers();
                persistCustomHorizonWellsToStorage();
            });
            if (well.ringSizingMode === 'grows_with_depth') {
                bindSliderRealtime(
                    rowFolder.add(well, 'ringStartSize', 1, 200, 1).name('Starting Ring Size (m)'),
                    () => {
                        rebuildCustomHorizonWells();
                    },
                    () => {
                        rebuildCustomHorizonWells();
                        persistCustomHorizonWellsToStorage();
                    }
                );
                bindSliderRealtime(
                    rowFolder.add(well, 'ringEndSize', 1, 200, 1).name('End Ring Size (m)'),
                    () => {
                        rebuildCustomHorizonWells();
                    },
                    () => {
                        rebuildCustomHorizonWells();
                        persistCustomHorizonWellsToStorage();
                    }
                );
            } else {
                bindSliderRealtime(
                    rowFolder.add(well, 'ringSize', 1, 200, 1).name('Ring Size (m)'),
                    () => {
                        rebuildCustomHorizonWells();
                    },
                    () => {
                        rebuildCustomHorizonWells();
                        persistCustomHorizonWellsToStorage();
                    }
                );
            }
            bindSliderRealtime(
                rowFolder.add(well, 'ringSpacing', 1, 200, 1).name('Ring Spacing (m)'),
                () => {
                    rebuildCustomHorizonWells();
                },
                () => {
                    rebuildCustomHorizonWells();
                    persistCustomHorizonWellsToStorage();
                }
            );
        }
        rowFolder.add(well, 'showWellhead').name('Show Wellhead').onChange(() => {
            rebuildCustomHorizonWells();
            persistCustomHorizonWellsToStorage();
        });
        bindSliderRealtime(
            rowFolder.add(well, 'wellheadScale', 0.2, 5, 0.1).name('Wellhead Scale'),
            () => {
                rebuildCustomHorizonWells();
            },
            () => {
                rebuildCustomHorizonWells();
                persistCustomHorizonWellsToStorage();
            }
        );
        const orderTargetIds = orderedUniqueTargetIds(well.targetIds).filter(id => !!getCustomTargetById(id));
        if (orderTargetIds.length > 1) {
            const orderOptions = {};
            orderTargetIds.forEach(id => {
                const t = getCustomTargetById(id);
                if (t) orderOptions[t.name] = id;
            });
            const orderModel = {};
            orderTargetIds.forEach((id, idx) => {
                const key = `targetOrder${idx + 1}`;
                orderModel[key] = id;
                rowFolder.add(orderModel, key, orderOptions).name(customWellTargetOrderLabel(idx + 1)).onChange((selectedId) => {
                    setCustomHorizonWellTargetAtPosition(well.id, idx, selectedId);
                });
            });
        }

        const rowActions = {
            editTargets: () => openEditCustomHorizonWellTargetsModal(well.id),
            deleteWell: () => removeCustomHorizonWellById(well.id),
        };
        rowFolder.add(rowActions, 'editTargets').name('Edit Targets');
        rowFolder.add(rowActions, 'deleteWell').name('Delete');
        customHorizonWellRowFolders.push(rowFolder);
    });

    restoreGuiScrollState(scrollState);
}

// ─────────────────────────────────────────────────────────────
// CUSTOM SURFACE NETWORKS
// ─────────────────────────────────────────────────────────────
const customSurfaceNetworks = []; // { id, name, local:{x,y,z}, rotationDeg, scale, bodyHeightM, topWidthM, topLengthM, bottomWidthM, bottomLengthM, fillColor, strokeColor, fillOpacity, visible, showRisers, showRiserBase, riserBaseHeightM, riserColor, riserThicknessM, riserSpreadM, riserBaseFillColor, riserBaseStrokeColor, riserBaseFillOpacity, showConnectingPipe, pipeBaseHeightM, pipeColor, pipeThicknessM }
let customSurfaceNetworkSerial = 1;

const customSurfaceNetworkUi = {
    createNewNetwork: () => createCustomSurfaceNetwork(),
    deleteAll: () => clearAllCustomSurfaceNetworks(),
};
let tieBackLinePickerTargetLineId = null;
let tieBackLinePickerSelectedNetworkId = '';
let tieBackLinePickerSelectedWellIds = new Set();

function orderedUniqueCustomWellIds(wellIds) {
    const out = [];
    const seen = new Set();
    for (const id of Array.isArray(wellIds) ? wellIds : []) {
        if (typeof id !== 'string' || !id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

function renderTieBackLinePickerWellList() {
    const listEl = document.getElementById('tieBackLineWellDropdownList');
    const labelEl = document.getElementById('tieBackLineWellDropdownLabel');
    if (!listEl || !labelEl) return;
    listEl.innerHTML = '';

    if (customHorizonWells.length === 0) {
        labelEl.textContent = 'Select one or more wells';
        const empty = document.createElement('div');
        empty.className = 'custom-well-picker-empty';
        empty.textContent = 'No custom wells available.';
        listEl.appendChild(empty);
        return;
    }

    customHorizonWells.forEach(well => {
        const row = document.createElement('label');
        row.className = 'custom-well-picker-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = tieBackLinePickerSelectedWellIds.has(well.id);
        cb.addEventListener('change', () => {
            if (cb.checked) tieBackLinePickerSelectedWellIds.add(well.id);
            else tieBackLinePickerSelectedWellIds.delete(well.id);
            renderTieBackLinePickerWellList();
        });
        const text = document.createElement('span');
        text.textContent = well.name;
        row.appendChild(cb);
        row.appendChild(text);
        listEl.appendChild(row);
    });

    const selectedCount = tieBackLinePickerSelectedWellIds.size;
    labelEl.textContent = selectedCount === 0 ? 'Select one or more wells' : `${selectedCount} selected`;
}

function renderTieBackLinePickerSurfaceNetworkOptions() {
    const selectEl = document.getElementById('tieBackLineSurfaceNetworkSelect');
    if (!(selectEl instanceof HTMLSelectElement)) return;
    selectEl.innerHTML = '';

    if (customSurfaceNetworks.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No surface networks available';
        selectEl.appendChild(option);
        selectEl.value = '';
        return;
    }

    customSurfaceNetworks.forEach(network => {
        const option = document.createElement('option');
        option.value = network.id;
        option.textContent = network.name;
        selectEl.appendChild(option);
    });
    if (!customSurfaceNetworks.some(network => network.id === tieBackLinePickerSelectedNetworkId)) {
        tieBackLinePickerSelectedNetworkId = customSurfaceNetworks[0].id;
    }
    selectEl.value = tieBackLinePickerSelectedNetworkId;
}

function openTieBackLinePickerModal(existingLineId = null) {
    tieBackLinePickerTargetLineId = existingLineId;
    const titleEl = document.getElementById('createTieBackLineModalTitle');
    const confirmBtn = document.getElementById('confirmCreateTieBackLine');
    if (existingLineId) {
        const line = getCustomTieBackLineById(existingLineId);
        if (!line) return;
        tieBackLinePickerSelectedNetworkId = line.surfaceNetworkId || '';
        tieBackLinePickerSelectedWellIds = new Set(
            orderedUniqueCustomWellIds(line.wellIds).filter(id => !!getCustomHorizonWellById(id))
        );
        if (titleEl) titleEl.textContent = 'Edit Tie Back Line';
        if (confirmBtn) confirmBtn.textContent = 'Apply';
    } else {
        tieBackLinePickerSelectedNetworkId = customSurfaceNetworks[0]?.id || '';
        tieBackLinePickerSelectedWellIds = new Set();
        if (titleEl) titleEl.textContent = 'Create Tie Back Line';
        if (confirmBtn) confirmBtn.textContent = 'Create';
    }

    renderTieBackLinePickerSurfaceNetworkOptions();
    renderTieBackLinePickerWellList();
    const listEl = document.getElementById('tieBackLineWellDropdownList');
    if (listEl) listEl.classList.remove('open');
    const modal = document.getElementById('createTieBackLineModal');
    if (modal) modal.style.display = 'flex';
}

function confirmTieBackLinePickerModal() {
    const networkId = tieBackLinePickerSelectedNetworkId;
    const wellIds = orderedUniqueCustomWellIds([...tieBackLinePickerSelectedWellIds]).filter(id => !!getCustomHorizonWellById(id));
    if (!getCustomSurfaceNetworkById(networkId)) {
        alert('Select a surface network.');
        return;
    }
    if (wellIds.length === 0) {
        alert('Select at least one custom well.');
        return;
    }

    if (tieBackLinePickerTargetLineId) {
        updateCustomTieBackLineConnections(tieBackLinePickerTargetLineId, networkId, wellIds);
    } else {
        createCustomTieBackLine(networkId, wellIds);
    }

    tieBackLinePickerTargetLineId = null;
    tieBackLinePickerSelectedNetworkId = '';
    tieBackLinePickerSelectedWellIds = new Set();
    const modal = document.getElementById('createTieBackLineModal');
    if (modal) modal.style.display = 'none';
}

function nextCustomSurfaceNetworkName() {
    let name = `Surface Network ${customSurfaceNetworkSerial++}`;
    while (customSurfaceNetworks.some(n => n.name === name)) {
        name = `Surface Network ${customSurfaceNetworkSerial++}`;
    }
    return name;
}

function rebuildCustomSurfaceNetworkSerial() {
    customSurfaceNetworkSerial = 1;
    customSurfaceNetworks.forEach(n => {
        const m = /^Surface Network\s+(\d+)$/.exec(n.name || '');
        if (m) customSurfaceNetworkSerial = Math.max(customSurfaceNetworkSerial, parseInt(m[1], 10) + 1);
    });
}

function makeUniqueCustomSurfaceNetworkName(baseName, excludeId = null) {
    const trimmed = typeof baseName === 'string' ? baseName.trim() : '';
    if (!trimmed) return null;
    let uniqueName = trimmed;
    let suffix = 2;
    while (customSurfaceNetworks.some(n => n.id !== excludeId && n.name === uniqueName)) {
        uniqueName = `${trimmed} (${suffix++})`;
    }
    return uniqueName;
}

function renameCustomSurfaceNetworkById(networkId, proposedName) {
    const network = customSurfaceNetworks.find(n => n.id === networkId);
    if (!network) return null;
    const uniqueName = makeUniqueCustomSurfaceNetworkName(proposedName, networkId);
    if (!uniqueName) return null;
    if (uniqueName === network.name) return uniqueName;
    network.name = uniqueName;
    rebuildCustomSurfaceNetworkSerial();
    rebuildCustomSurfaceNetworkControllers();
    rebuildCustomTieBackLineControllers();
    persistCustomSurfaceNetworksToStorage();
    return uniqueName;
}

function readSurfaceNetworkDimensions(raw) {
    const legacySize = Math.max(10, Number(raw?.sizeM) || Number(raw?.size) || 500);
    return {
        scale: Math.max(0.05, Number(raw?.scale) || 1),
        bodyHeightM: Math.max(10, Number(raw?.bodyHeightM) || legacySize),
        topWidthM: Math.max(10, Number(raw?.topWidthM) || legacySize),
        topLengthM: Math.max(10, Number(raw?.topLengthM) || legacySize),
        bottomWidthM: Math.max(10, Number(raw?.bottomWidthM) || legacySize),
        bottomLengthM: Math.max(10, Number(raw?.bottomLengthM) || legacySize),
    };
}

function readSurfaceNetworkRiserPipeSettings(raw, fallbackBaseHeightM = 0) {
    const orderedConnectedWells = [];
    const seenWellIds = new Set();
    for (const id of Array.isArray(raw?.connectedWellIds) ? raw.connectedWellIds : []) {
        if (typeof id !== 'string' || !id || seenWellIds.has(id)) continue;
        seenWellIds.add(id);
        orderedConnectedWells.push(id);
    }
    const tieBackControlPoints = [];
    const seenTieKeys = new Set();
    for (const point of Array.isArray(raw?.tieBackControlPoints) ? raw.tieBackControlPoints : []) {
        if (!point || typeof point.key !== 'string' || !point.key || seenTieKeys.has(point.key)) continue;
        seenTieKeys.add(point.key);
        tieBackControlPoints.push({
            key: point.key,
            x: Number(point.x) || 0,
            z: Number(point.z) || 0,
        });
    }
    return {
        showRisers: raw?.showRisers === true,
        showRiserBase: raw?.showRiserBase !== false,
        riserBaseHeightM: Number.isFinite(Number(raw?.riserBaseHeightM))
            ? Number(raw.riserBaseHeightM)
            : (Number(fallbackBaseHeightM) || 0),
        riserColor: typeof raw?.riserColor === 'string' && raw.riserColor
            ? raw.riserColor
            : '#d7ffb5',
        riserThicknessM: Math.max(0.5, Number(raw?.riserThicknessM) || 12),
        riserSpreadM: Math.max(0, Number(raw?.riserSpreadM) || 0),
        riserBaseFillColor: typeof raw?.riserBaseFillColor === 'string' && raw.riserBaseFillColor
            ? raw.riserBaseFillColor
            : '#1b2731',
        riserBaseStrokeColor: typeof raw?.riserBaseStrokeColor === 'string' && raw.riserBaseStrokeColor
            ? raw.riserBaseStrokeColor
            : '#d7ffb5',
        riserBaseFillOpacity: Number.isFinite(Number(raw?.riserBaseFillOpacity))
            ? THREE.MathUtils.clamp(Number(raw.riserBaseFillOpacity), 0, 1)
            : 0.28,
        showConnectingPipe: raw?.showConnectingPipe === true,
        pipeBaseHeightM: Number.isFinite(Number(raw?.pipeBaseHeightM))
            ? Number(raw.pipeBaseHeightM)
            : (Number(fallbackBaseHeightM) || 0),
        pipeColor: typeof raw?.pipeColor === 'string' && raw.pipeColor
            ? raw.pipeColor
            : '#ffdd8a',
        pipeThicknessM: Math.max(0.5, Number(raw?.pipeThicknessM) || 12),
        connectedWellIds: orderedConnectedWells,
        showConnectingTieBacks: raw?.showConnectingTieBacks === true,
        tieBackColor: typeof raw?.tieBackColor === 'string' && raw.tieBackColor
            ? raw.tieBackColor
            : '#9be3ff',
        tieBackThicknessM: Math.max(0.5, Number(raw?.tieBackThicknessM) || 8),
        tieBackLineStyle: raw?.tieBackLineStyle === 'dashed' ? 'dashed' : 'solid',
        tieBackDashLengthM: Math.max(1, Number(raw?.tieBackDashLengthM) || 120),
        tieBackDashSpacingM: Math.max(1, Number(raw?.tieBackDashSpacingM) || 80),
        tieBackControlPoints,
    };
}

const SURFACE_NETWORK_UP = new THREE.Vector3(0, 1, 0);

function createSurfaceNetworkSegmentCylinder(startPoint, endPoint, thicknessM, colorHex) {
    const start = startPoint.clone();
    const end = endPoint.clone();
    const delta = end.clone().sub(start);
    const height = delta.length();
    if (height <= 0.5) return null;
    const radius = Math.max(0.25, (Number(thicknessM) || 1) * 0.5);
    const geo = new THREE.CylinderGeometry(radius, radius, height, 12, 1, false);
    const color = new THREE.Color(colorHex || '#ffffff');
    const mat = new THREE.MeshPhongMaterial({
        color,
        emissive: color.clone().multiplyScalar(0.18),
        shininess: 40,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    const dir = delta.normalize();
    mesh.quaternion.setFromUnitVectors(SURFACE_NETWORK_UP, dir);
    return mesh;
}

function createSurfaceNetworkFrustumGeometry(topWidthM, topLengthM, bottomWidthM, bottomLengthM, heightM) {
    const halfTopW = topWidthM * 0.5;
    const halfTopL = topLengthM * 0.5;
    const halfBottomW = bottomWidthM * 0.5;
    const halfBottomL = bottomLengthM * 0.5;
    const halfH = heightM * 0.5;

    const positions = [
        -halfTopW, halfH, -halfTopL,   halfTopW, halfH, -halfTopL,   halfTopW, halfH, halfTopL,   -halfTopW, halfH, halfTopL,
        -halfBottomW, -halfH, -halfBottomL,   halfBottomW, -halfH, -halfBottomL,   halfBottomW, -halfH, halfBottomL,   -halfBottomW, -halfH, halfBottomL,
    ];

    const indices = [
        0, 1, 2,  0, 2, 3,      // top
        4, 6, 5,  4, 7, 6,      // bottom
        0, 4, 5,  0, 5, 1,      // side 1
        1, 5, 6,  1, 6, 2,      // side 2
        2, 6, 7,  2, 7, 3,      // side 3
        3, 7, 4,  3, 4, 0,      // side 4
    ];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

function getCustomSurfaceNetworksState() {
    return customSurfaceNetworks.map(n => ({
        id: n.id,
        name: n.name,
        local: {
            x: Number(n.local?.x) || 0,
            y: Number(n.local?.y) || 0,
            z: Number(n.local?.z) || 0,
        },
        rotationDeg: Number(n.rotationDeg) || 0,
        scale: Math.max(0.05, Number(n.scale) || 1),
        bodyHeightM: Math.max(10, Number(n.bodyHeightM) || 500),
        topWidthM: Math.max(10, Number(n.topWidthM) || 500),
        topLengthM: Math.max(10, Number(n.topLengthM) || 500),
        bottomWidthM: Math.max(10, Number(n.bottomWidthM) || 500),
        bottomLengthM: Math.max(10, Number(n.bottomLengthM) || 500),
        fillColor: n.fillColor,
        strokeColor: n.strokeColor,
        fillOpacity: Number.isFinite(Number(n.fillOpacity)) ? Number(n.fillOpacity) : 0.35,
        visible: n.visible !== false,
        showRisers: n.showRisers === true,
        showRiserBase: n.showRiserBase !== false,
        riserBaseHeightM: Number.isFinite(Number(n.riserBaseHeightM)) ? Number(n.riserBaseHeightM) : 0,
        riserColor: n.riserColor,
        riserThicknessM: Math.max(0.5, Number(n.riserThicknessM) || 12),
        riserSpreadM: Math.max(0, Number(n.riserSpreadM) || 0),
        riserBaseFillColor: n.riserBaseFillColor,
        riserBaseStrokeColor: n.riserBaseStrokeColor,
        riserBaseFillOpacity: Number.isFinite(Number(n.riserBaseFillOpacity)) ? THREE.MathUtils.clamp(Number(n.riserBaseFillOpacity), 0, 1) : 0.28,
        showConnectingPipe: n.showConnectingPipe === true,
        pipeBaseHeightM: Number.isFinite(Number(n.pipeBaseHeightM)) ? Number(n.pipeBaseHeightM) : 0,
        pipeColor: n.pipeColor,
        pipeThicknessM: Math.max(0.5, Number(n.pipeThicknessM) || 12),
    }));
}

function persistCustomSurfaceNetworksToStorage() {
    try {
        localStorage.setItem(CUSTOM_SURFACE_NETWORKS_STORAGE_KEY, JSON.stringify(getCustomSurfaceNetworksState()));
    } catch (e) {}
    pushCustomActionHistorySnapshot();
}

function getCustomSurfaceNetworkById(networkId) {
    return customSurfaceNetworks.find(n => n.id === networkId) || null;
}

function getCustomSurfaceNetworkPipeBaseHeightM(network) {
    if (!network) return 0;
    if (Number.isFinite(Number(network.pipeBaseHeightM))) return Number(network.pipeBaseHeightM);
    return Number(network.local?.y) || 0;
}

function clearCustomSurfaceNetworkMeshes() {
    while (customSurfaceNetworkGroup.children.length > 0) {
        const obj = customSurfaceNetworkGroup.children[0];
        customSurfaceNetworkGroup.remove(obj);
        obj.traverse?.((child) => {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material?.dispose();
        });
    }
}

function rebuildCustomSurfaceNetworks() {
    clearCustomSurfaceNetworkMeshes();
    if (customSurfaceNetworks.length === 0) return;

    for (const network of customSurfaceNetworks) {
        if (network.visible === false) continue;

        const x = Number(network.local?.x) || 0;
        const y = Number(network.local?.y) || 0;
        const z = Number(network.local?.z) || 0;
        const rotationDeg = Number(network.rotationDeg) || 0;
        const dims = readSurfaceNetworkDimensions(network);
        const scaledTopWidth = dims.topWidthM * dims.scale;
        const scaledTopLength = dims.topLengthM * dims.scale;
        const scaledBottomWidth = dims.bottomWidthM * dims.scale;
        const scaledBottomLength = dims.bottomLengthM * dims.scale;
        const scaledHeight = dims.bodyHeightM * dims.scale;
        const fillColor = new THREE.Color(network.fillColor || '#52d8ff');
        const strokeColor = new THREE.Color(network.strokeColor || '#ffffff');
        const rawOpacity = Number(network.fillOpacity);
        const fillOpacity = Number.isFinite(rawOpacity) ? THREE.MathUtils.clamp(rawOpacity, 0, 1) : 0.35;
        const riserPipe = readSurfaceNetworkRiserPipeSettings(network, y - scaledHeight * 0.5);
        const yScale = params.zScale || 1;
        const yCompensation = 1 / yScale;

        const container = new THREE.Group();
        container.position.set(x, y, z);
        container.rotation.y = THREE.MathUtils.degToRad(rotationDeg);
        container.userData = {
            isCustomSurfaceNetwork: true,
            customSurfaceNetworkId: network.id,
        };
        const visualsGroup = new THREE.Group();
        visualsGroup.scale.y = yCompensation;
        container.add(visualsGroup);

        const fillGeo = createSurfaceNetworkFrustumGeometry(
            scaledTopWidth,
            scaledTopLength,
            scaledBottomWidth,
            scaledBottomLength,
            scaledHeight
        );
        const fillMat = new THREE.MeshPhongMaterial({
            color: fillColor,
            emissive: fillColor.clone().multiplyScalar(0.2),
            transparent: true,
            opacity: fillOpacity,
            depthWrite: fillOpacity >= 0.99,
        });
        const cube = new THREE.Mesh(fillGeo, fillMat);
        cube.userData = {
            isCustomSurfaceNetwork: true,
            isCustomSurfaceNetworkBody: true,
            customSurfaceNetworkId: network.id,
        };
        visualsGroup.add(cube);

        const edgeGeo = new THREE.EdgesGeometry(fillGeo);
        const edgeMat = new THREE.LineBasicMaterial({ color: strokeColor });
        const edges = new THREE.LineSegments(edgeGeo, edgeMat);
        edges.userData = {
            isCustomSurfaceNetwork: true,
            isCustomSurfaceNetworkBody: true,
            customSurfaceNetworkId: network.id,
        };
        visualsGroup.add(edges);

        const halfBottomW = scaledBottomWidth * 0.5;
        const halfBottomL = scaledBottomLength * 0.5;
        const bottomY = -scaledHeight * 0.5;
        const pipeEndY = (riserPipe.pipeBaseHeightM - y) * yScale;

        if (riserPipe.showRisers) {
            const riserEndY = (riserPipe.riserBaseHeightM - y) * yScale;
            const riserSpread = Math.max(0, Number(riserPipe.riserSpreadM) || 0);
            const corners = [
                { x: -halfBottomW, z: -halfBottomL },
                { x: halfBottomW, z: -halfBottomL },
                { x: halfBottomW, z: halfBottomL },
                { x: -halfBottomW, z: halfBottomL },
            ];
            const riserBasePoints = corners.map(corner => {
                const dir = new THREE.Vector2(corner.x, corner.z).normalize();
                return new THREE.Vector3(
                    corner.x + dir.x * riserSpread,
                    riserEndY,
                    corner.z + dir.y * riserSpread
                );
            });

            corners.forEach((corner, idx) => {
                const startPoint = new THREE.Vector3(corner.x, bottomY, corner.z);
                const endPoint = riserBasePoints[idx];
                const riser = createSurfaceNetworkSegmentCylinder(
                    startPoint,
                    endPoint,
                    riserPipe.riserThicknessM,
                    riserPipe.riserColor
                );
                if (!riser) return;
                riser.userData = {
                    isCustomSurfaceNetwork: true,
                    isCustomSurfaceNetworkRiser: true,
                    customSurfaceNetworkId: network.id,
                };
                visualsGroup.add(riser);
            });

            if (riserPipe.showRiserBase !== false) {
                const baseGeo = new THREE.BufferGeometry();
                baseGeo.setAttribute(
                    'position',
                    new THREE.Float32BufferAttribute(
                        riserBasePoints.flatMap(p => [p.x, p.y, p.z]),
                        3
                    )
                );
                baseGeo.setIndex([0, 1, 2, 0, 2, 3]);
                baseGeo.computeVertexNormals();
                const baseFillOpacity = Number.isFinite(Number(riserPipe.riserBaseFillOpacity))
                    ? THREE.MathUtils.clamp(Number(riserPipe.riserBaseFillOpacity), 0, 1)
                    : 0.28;
                const baseFill = new THREE.Mesh(
                    baseGeo,
                    new THREE.MeshPhongMaterial({
                        color: new THREE.Color(riserPipe.riserBaseFillColor || '#1b2731'),
                        emissive: new THREE.Color(riserPipe.riserBaseFillColor || '#1b2731').multiplyScalar(0.15),
                        transparent: true,
                        opacity: baseFillOpacity,
                        depthWrite: baseFillOpacity >= 0.99,
                        side: THREE.DoubleSide,
                    })
                );
                baseFill.userData = {
                    isCustomSurfaceNetwork: true,
                    isCustomSurfaceNetworkRiserBase: true,
                    customSurfaceNetworkId: network.id,
                };
                visualsGroup.add(baseFill);

                const baseOutline = new THREE.LineLoop(
                    new THREE.BufferGeometry().setFromPoints(riserBasePoints),
                    new THREE.LineBasicMaterial({
                        color: new THREE.Color(riserPipe.riserBaseStrokeColor || '#d7ffb5'),
                    })
                );
                baseOutline.userData = {
                    isCustomSurfaceNetwork: true,
                    isCustomSurfaceNetworkRiserBase: true,
                    customSurfaceNetworkId: network.id,
                };
                visualsGroup.add(baseOutline);
            }
        }

        if (riserPipe.showConnectingPipe) {
            const pipe = createSurfaceNetworkSegmentCylinder(
                new THREE.Vector3(0, bottomY, 0),
                new THREE.Vector3(0, pipeEndY, 0),
                riserPipe.pipeThicknessM,
                riserPipe.pipeColor
            );
            if (pipe) {
                pipe.userData = {
                    isCustomSurfaceNetwork: true,
                    isCustomSurfaceNetworkPipe: true,
                    customSurfaceNetworkId: network.id,
                };
                visualsGroup.add(pipe);
            }
        }

        customSurfaceNetworkGroup.add(container);
    }
    rebuildCustomTieBackLines();
}

function removeCustomSurfaceNetworkById(networkId) {
    const idx = customSurfaceNetworks.findIndex(n => n.id === networkId);
    if (idx < 0) return;
    customSurfaceNetworks.splice(idx, 1);
    rebuildCustomSurfaceNetworkSerial();
    rebuildCustomSurfaceNetworks();
    rebuildCustomSurfaceNetworkControllers();
    rebuildCustomTieBackLineControllers();
    persistCustomSurfaceNetworksToStorage();
}

function clearAllCustomSurfaceNetworks() {
    customSurfaceNetworks.length = 0;
    rebuildCustomSurfaceNetworkSerial();
    rebuildCustomSurfaceNetworks();
    rebuildCustomSurfaceNetworkControllers();
    rebuildCustomTieBackLineControllers();
    persistCustomSurfaceNetworksToStorage();
}

function createCustomSurfaceNetwork() {
    const firstWell = customHorizonWells[0] || null;
    const defaultBaseHeight = Number(firstWell?.headLocal?.y) || 600;
    const defaultLocal = {
        x: Number(firstWell?.headLocal?.x) || 0,
        y: defaultBaseHeight + 300,
        z: Number(firstWell?.headLocal?.z) || 0,
    };
    const network = {
        id: `csn_${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
        name: nextCustomSurfaceNetworkName(),
        local: defaultLocal,
        rotationDeg: 0,
        scale: 1,
        bodyHeightM: 500,
        topWidthM: 500,
        topLengthM: 500,
        bottomWidthM: 500,
        bottomLengthM: 500,
        fillColor: '#52d8ff',
        strokeColor: '#ffffff',
        fillOpacity: 0.35,
        visible: true,
        showRisers: false,
        showRiserBase: true,
        riserBaseHeightM: defaultBaseHeight,
        riserColor: '#d7ffb5',
        riserThicknessM: 12,
        riserSpreadM: 0,
        riserBaseFillColor: '#1b2731',
        riserBaseStrokeColor: '#d7ffb5',
        riserBaseFillOpacity: 0.28,
        showConnectingPipe: false,
        pipeBaseHeightM: defaultBaseHeight,
        pipeColor: '#ffdd8a',
        pipeThicknessM: 12,
    };
    customSurfaceNetworks.push(network);
    rebuildCustomSurfaceNetworks();
    rebuildCustomSurfaceNetworkControllers();
    rebuildCustomTieBackLineControllers();
    persistCustomSurfaceNetworksToStorage();
    return network.id;
}

function setCustomSurfaceNetworksFromData(networks, options = {}) {
    const persist = options.persist === true;
    customSurfaceNetworks.length = 0;
    if (Array.isArray(networks)) {
        networks.forEach((raw, i) => {
            if (!raw) return;
            const safeName = typeof raw.name === 'string' && raw.name.trim()
                ? raw.name.trim()
                : `Surface Network ${i + 1}`;
            let uniqueName = safeName;
            let suffix = 2;
            while (customSurfaceNetworks.some(n => n.name === uniqueName)) {
                uniqueName = `${safeName} (${suffix++})`;
            }
            customSurfaceNetworks.push({
                id: typeof raw.id === 'string' && raw.id ? raw.id : `csn_${Date.now()}_${i}`,
                name: uniqueName,
                local: {
                    x: Number(raw.local?.x) || 0,
                    y: Number(raw.local?.y) || 0,
                    z: Number(raw.local?.z) || 0,
                },
                rotationDeg: Number(raw.rotationDeg) || 0,
                ...readSurfaceNetworkDimensions(raw),
                fillColor: typeof raw.fillColor === 'string' && raw.fillColor ? raw.fillColor : '#52d8ff',
                strokeColor: typeof raw.strokeColor === 'string' && raw.strokeColor ? raw.strokeColor : '#ffffff',
                fillOpacity: Number.isFinite(Number(raw.fillOpacity)) ? THREE.MathUtils.clamp(Number(raw.fillOpacity), 0, 1) : 0.35,
                visible: raw.visible !== false,
                ...readSurfaceNetworkRiserPipeSettings(raw, Number(raw.local?.y) || 0),
            });
        });
    }
    rebuildCustomSurfaceNetworkSerial();
    rebuildCustomSurfaceNetworks();
    rebuildCustomSurfaceNetworkControllers();
    rebuildCustomTieBackLineControllers();
    if (persist) persistCustomSurfaceNetworksToStorage();
}

function loadCustomSurfaceNetworksFromStorage() {
    const raw = localStorage.getItem(CUSTOM_SURFACE_NETWORKS_STORAGE_KEY);
    if (!raw) {
        setCustomSurfaceNetworksFromData([]);
        return;
    }
    try {
        const parsed = JSON.parse(raw);
        setCustomSurfaceNetworksFromData(parsed);
    } catch (e) {
        setCustomSurfaceNetworksFromData([]);
    }
}

function rebuildCustomSurfaceNetworkControllers() {
    if (!customSurfaceNetworkFolder) return;

    const guiRoot = customSurfaceNetworkFolder.domElement?.closest?.('.lil-gui') || null;
    const prevScrollTop = guiRoot ? guiRoot.scrollTop : 0;

    customSurfaceNetworkRowFolders.forEach(folder => folder.destroy());
    customSurfaceNetworkRowFolders = [];
    if (customSurfaceNetworkDeleteAllCtrl) {
        customSurfaceNetworkDeleteAllCtrl.destroy();
        customSurfaceNetworkDeleteAllCtrl = null;
    }

    if (!customSurfaceNetworkCreateCtrl) {
        customSurfaceNetworkCreateCtrl = customSurfaceNetworkFolder.add(customSurfaceNetworkUi, 'createNewNetwork').name('Create New Surface Network');
    }
    if (customSurfaceNetworks.length > 0) {
        customSurfaceNetworkDeleteAllCtrl = customSurfaceNetworkFolder.add(customSurfaceNetworkUi, 'deleteAll').name('Delete All Surface Networks');
    }

    customSurfaceNetworks.forEach(network => {
        const rowFolder = customSurfaceNetworkFolder.addFolder(network.name);
        _trackFolder(rowFolder, `custom-surface-network:${network.id}`);

        const rowNameModel = { name: network.name };
        const nameCtrl = rowFolder.add(rowNameModel, 'name').name('Name');
        nameCtrl.onFinishChange((value) => {
            const renamed = renameCustomSurfaceNetworkById(network.id, value);
            if (renamed) return;
            rowNameModel.name = network.name;
            nameCtrl.updateDisplay();
        });

        rowFolder.add(network, 'visible').name('Visible').onChange(() => {
            rebuildCustomSurfaceNetworks();
            persistCustomSurfaceNetworksToStorage();
        });
        bindSliderRealtime(
            rowFolder.add(network, 'scale', 0.05, 20, 0.05).name('Scale'),
            () => {
                rebuildCustomSurfaceNetworks();
            },
            () => {
                rebuildCustomSurfaceNetworks();
                persistCustomSurfaceNetworksToStorage();
            }
        );
        bindSliderRealtime(
            rowFolder.add(network, 'bodyHeightM', 10, 5000, 10).name('Body Height (m)'),
            () => {
                rebuildCustomSurfaceNetworks();
            },
            () => {
                rebuildCustomSurfaceNetworks();
                persistCustomSurfaceNetworksToStorage();
            }
        );
        bindSliderRealtime(
            rowFolder.add(network, 'topWidthM', 10, 5000, 10).name('Top Width (m)'),
            () => {
                rebuildCustomSurfaceNetworks();
            },
            () => {
                rebuildCustomSurfaceNetworks();
                persistCustomSurfaceNetworksToStorage();
            }
        );
        bindSliderRealtime(
            rowFolder.add(network, 'topLengthM', 10, 5000, 10).name('Top Length (m)'),
            () => {
                rebuildCustomSurfaceNetworks();
            },
            () => {
                rebuildCustomSurfaceNetworks();
                persistCustomSurfaceNetworksToStorage();
            }
        );
        bindSliderRealtime(
            rowFolder.add(network, 'bottomWidthM', 10, 5000, 10).name('Bottom Width (m)'),
            () => {
                rebuildCustomSurfaceNetworks();
            },
            () => {
                rebuildCustomSurfaceNetworks();
                persistCustomSurfaceNetworksToStorage();
            }
        );
        bindSliderRealtime(
            rowFolder.add(network, 'bottomLengthM', 10, 5000, 10).name('Bottom Length (m)'),
            () => {
                rebuildCustomSurfaceNetworks();
            },
            () => {
                rebuildCustomSurfaceNetworks();
                persistCustomSurfaceNetworksToStorage();
            }
        );
        rowFolder.addColor(network, 'fillColor').name('Fill Color').onChange(() => {
            rebuildCustomSurfaceNetworks();
            persistCustomSurfaceNetworksToStorage();
        });
        rowFolder.addColor(network, 'strokeColor').name('Stroke Color').onChange(() => {
            rebuildCustomSurfaceNetworks();
            persistCustomSurfaceNetworksToStorage();
        });
        const opacityModel = {
            fillOpacityPct: Math.round((Number.isFinite(Number(network.fillOpacity)) ? THREE.MathUtils.clamp(Number(network.fillOpacity), 0, 1) : 0.35) * 100),
        };
        bindSliderRealtime(
            rowFolder.add(opacityModel, 'fillOpacityPct', 0, 100, 1).name('Fill Opacity (%)'),
            (v) => {
                const pct = THREE.MathUtils.clamp(Number(v) || 0, 0, 100);
                opacityModel.fillOpacityPct = pct;
                network.fillOpacity = pct / 100;
                rebuildCustomSurfaceNetworks();
            },
            (v) => {
                const pct = THREE.MathUtils.clamp(Number(v) || 0, 0, 100);
                opacityModel.fillOpacityPct = pct;
                network.fillOpacity = pct / 100;
                rebuildCustomSurfaceNetworks();
                persistCustomSurfaceNetworksToStorage();
            }
        );

        const posModel = {
            eastWestM: Number(network.local?.x) || 0,
            northSouthM: -(Number(network.local?.z) || 0),
            heightM: Number(network.local?.y) || 0,
            rotationDeg: Number(network.rotationDeg) || 0,
        };
        bindSliderRealtime(
            rowFolder.add(posModel, 'eastWestM', -25000, 25000, 1).name('East/West (m)'),
            (v) => {
                network.local.x = Number(v) || 0;
                rebuildCustomSurfaceNetworks();
            },
            (v) => {
                network.local.x = Number(v) || 0;
                rebuildCustomSurfaceNetworks();
                persistCustomSurfaceNetworksToStorage();
            }
        );
        bindSliderRealtime(
            rowFolder.add(posModel, 'northSouthM', -25000, 25000, 1).name('North/South (m)'),
            (v) => {
                network.local.z = -(Number(v) || 0);
                rebuildCustomSurfaceNetworks();
            },
            (v) => {
                network.local.z = -(Number(v) || 0);
                rebuildCustomSurfaceNetworks();
                persistCustomSurfaceNetworksToStorage();
            }
        );
        bindSliderRealtime(
            rowFolder.add(posModel, 'heightM', -10000, 10000, 10).name('Height in Space (m)'),
            (v) => {
                network.local.y = Number(v) || 0;
                rebuildCustomSurfaceNetworks();
            },
            (v) => {
                network.local.y = Number(v) || 0;
                rebuildCustomSurfaceNetworks();
                persistCustomSurfaceNetworksToStorage();
            }
        );
        bindSliderRealtime(
            rowFolder.add(posModel, 'rotationDeg', -180, 180, 1).name('Rotation (°)'),
            (v) => {
                network.rotationDeg = Number(v) || 0;
                rebuildCustomSurfaceNetworks();
            },
            (v) => {
                network.rotationDeg = Number(v) || 0;
                rebuildCustomSurfaceNetworks();
                persistCustomSurfaceNetworksToStorage();
            }
        );

        rowFolder.add(network, 'showRisers').name('Show Risers').onChange(() => {
            rebuildCustomSurfaceNetworks();
            persistCustomSurfaceNetworksToStorage();
            rebuildCustomSurfaceNetworkControllers();
        });
        if (network.showRisers) {
            rowFolder.add(network, 'showRiserBase').name('Show Riser Base').onChange(() => {
                rebuildCustomSurfaceNetworks();
                persistCustomSurfaceNetworksToStorage();
                rebuildCustomSurfaceNetworkControllers();
            });
            bindSliderRealtime(
                rowFolder.add(network, 'riserBaseHeightM', -10000, 10000, 10).name('Riser Base Height (m)'),
                () => {
                    rebuildCustomSurfaceNetworks();
                },
                () => {
                    rebuildCustomSurfaceNetworks();
                    persistCustomSurfaceNetworksToStorage();
                }
            );
            bindSliderRealtime(
                rowFolder.add(network, 'riserSpreadM', 0, 5000, 1).name('Riser Spread (m)'),
                () => {
                    network.riserSpreadM = Math.max(0, Number(network.riserSpreadM) || 0);
                    rebuildCustomSurfaceNetworks();
                },
                () => {
                    network.riserSpreadM = Math.max(0, Number(network.riserSpreadM) || 0);
                    rebuildCustomSurfaceNetworks();
                    persistCustomSurfaceNetworksToStorage();
                }
            );
            rowFolder.addColor(network, 'riserColor').name('Riser Color').onChange(() => {
                rebuildCustomSurfaceNetworks();
                persistCustomSurfaceNetworksToStorage();
            });
            bindSliderRealtime(
                rowFolder.add(network, 'riserThicknessM', 0.5, 200, 0.5).name('Riser Thickness (m)'),
                () => {
                    network.riserThicknessM = Math.max(0.5, Number(network.riserThicknessM) || 0.5);
                    rebuildCustomSurfaceNetworks();
                },
                () => {
                    network.riserThicknessM = Math.max(0.5, Number(network.riserThicknessM) || 0.5);
                    rebuildCustomSurfaceNetworks();
                    persistCustomSurfaceNetworksToStorage();
                }
            );
            if (network.showRiserBase !== false) {
                rowFolder.addColor(network, 'riserBaseFillColor').name('Riser Base Fill Color').onChange(() => {
                    rebuildCustomSurfaceNetworks();
                    persistCustomSurfaceNetworksToStorage();
                });
                rowFolder.addColor(network, 'riserBaseStrokeColor').name('Riser Base Stroke Color').onChange(() => {
                    rebuildCustomSurfaceNetworks();
                    persistCustomSurfaceNetworksToStorage();
                });
                const riserBaseOpacityModel = {
                    riserBaseFillOpacityPct: Math.round((Number.isFinite(Number(network.riserBaseFillOpacity))
                        ? THREE.MathUtils.clamp(Number(network.riserBaseFillOpacity), 0, 1)
                        : 0.28) * 100),
                };
                bindSliderRealtime(
                    rowFolder.add(riserBaseOpacityModel, 'riserBaseFillOpacityPct', 0, 100, 1).name('Riser Base Fill Opacity (%)'),
                    (v) => {
                        const pct = THREE.MathUtils.clamp(Number(v) || 0, 0, 100);
                        riserBaseOpacityModel.riserBaseFillOpacityPct = pct;
                        network.riserBaseFillOpacity = pct / 100;
                        rebuildCustomSurfaceNetworks();
                    },
                    (v) => {
                        const pct = THREE.MathUtils.clamp(Number(v) || 0, 0, 100);
                        riserBaseOpacityModel.riserBaseFillOpacityPct = pct;
                        network.riserBaseFillOpacity = pct / 100;
                        rebuildCustomSurfaceNetworks();
                        persistCustomSurfaceNetworksToStorage();
                    }
                );
            }
        }

        rowFolder.add(network, 'showConnectingPipe').name('Show Connecting Pipe').onChange(() => {
            rebuildCustomSurfaceNetworks();
            persistCustomSurfaceNetworksToStorage();
            rebuildCustomSurfaceNetworkControllers();
        });
        if (network.showConnectingPipe) {
            bindSliderRealtime(
                rowFolder.add(network, 'pipeBaseHeightM', -10000, 10000, 10).name('Pipe Base Height (m)'),
                () => {
                    rebuildCustomSurfaceNetworks();
                },
                () => {
                    rebuildCustomSurfaceNetworks();
                    persistCustomSurfaceNetworksToStorage();
                }
            );
            rowFolder.addColor(network, 'pipeColor').name('Pipe Color').onChange(() => {
                rebuildCustomSurfaceNetworks();
                persistCustomSurfaceNetworksToStorage();
            });
            bindSliderRealtime(
                rowFolder.add(network, 'pipeThicknessM', 0.5, 200, 0.5).name('Pipe Thickness (m)'),
                () => {
                    network.pipeThicknessM = Math.max(0.5, Number(network.pipeThicknessM) || 0.5);
                    rebuildCustomSurfaceNetworks();
                },
                () => {
                    network.pipeThicknessM = Math.max(0.5, Number(network.pipeThicknessM) || 0.5);
                    rebuildCustomSurfaceNetworks();
                    persistCustomSurfaceNetworksToStorage();
                }
            );
        }

        const actions = {
            deleteNetwork: () => removeCustomSurfaceNetworkById(network.id),
        };
        rowFolder.add(actions, 'deleteNetwork').name('Delete');
        customSurfaceNetworkRowFolders.push(rowFolder);
    });

    if (guiRoot) {
        requestAnimationFrame(() => {
            guiRoot.scrollTop = prevScrollTop;
        });
    }
}

// ─────────────────────────────────────────────────────────────
// CUSTOM TIE BACK LINES
// ─────────────────────────────────────────────────────────────
const customTieBackLines = []; // { id, name, surfaceNetworkId, wellIds, showConnectingTieBacks, tieBackColor, tieBackThicknessM, tieBackLineStyle, tieBackDashLengthM, tieBackDashSpacingM, controlPointsByWellId:[{wellId, points:[{x,z}]}] }
let customTieBackLineSerial = 1;

const customTieBackLineUi = {
    createNewTieBackLine: () => openTieBackLinePickerModal(),
    deleteAll: () => clearAllCustomTieBackLines(),
};

function nextCustomTieBackLineName() {
    let name = `Tie Back Line ${customTieBackLineSerial++}`;
    while (customTieBackLines.some(line => line.name === name)) {
        name = `Tie Back Line ${customTieBackLineSerial++}`;
    }
    return name;
}

function rebuildCustomTieBackLineSerial() {
    customTieBackLineSerial = 1;
    customTieBackLines.forEach(line => {
        const m = /^Tie Back Line\s+(\d+)$/.exec(line.name || '');
        if (m) customTieBackLineSerial = Math.max(customTieBackLineSerial, Number.parseInt(m[1], 10) + 1);
    });
}

function makeUniqueCustomTieBackLineName(baseName, excludeLineId = null) {
    const trimmed = typeof baseName === 'string' ? baseName.trim() : '';
    if (!trimmed) return null;
    let uniqueName = trimmed;
    let suffix = 2;
    while (customTieBackLines.some(line => line.id !== excludeLineId && line.name === uniqueName)) {
        uniqueName = `${trimmed} (${suffix++})`;
    }
    return uniqueName;
}

function renameCustomTieBackLineById(lineId, proposedName) {
    const line = customTieBackLines.find(item => item.id === lineId);
    if (!line) return null;
    const uniqueName = makeUniqueCustomTieBackLineName(proposedName, lineId);
    if (!uniqueName) return null;
    if (uniqueName === line.name) return uniqueName;
    line.name = uniqueName;
    rebuildCustomTieBackLineSerial();
    rebuildCustomTieBackLineControllers();
    persistCustomTieBackLinesToStorage();
    return uniqueName;
}

function getCustomTieBackLineById(lineId) {
    return customTieBackLines.find(line => line.id === lineId) || null;
}

function getCustomTieBackLineControlEntry(line, representativeWellId, createIfMissing = false) {
    if (!line || typeof representativeWellId !== 'string' || !representativeWellId) return null;
    if (!Array.isArray(line.controlPointsByWellId)) line.controlPointsByWellId = [];
    let entry = line.controlPointsByWellId.find(item => item && item.wellId === representativeWellId);
    if (!entry && createIfMissing) {
        entry = { wellId: representativeWellId, points: [] };
        line.controlPointsByWellId.push(entry);
    }
    if (!entry) return null;
    if (!Array.isArray(entry.points)) entry.points = [];
    return entry;
}

function getCustomTieBackLineControlPoints(line, representativeWellId, createIfMissing = false) {
    const entry = getCustomTieBackLineControlEntry(line, representativeWellId, createIfMissing);
    return entry ? entry.points : [];
}

function insertCustomTieBackLineControlPoint(line, representativeWellId, insertIndex, localX, localZ) {
    const points = getCustomTieBackLineControlPoints(line, representativeWellId, true);
    const idx = Math.max(0, Math.min(points.length, Number(insertIndex) || 0));
    points.splice(idx, 0, {
        x: Number(localX) || 0,
        z: Number(localZ) || 0,
    });
    return idx;
}

function setCustomTieBackLineControlPoint(line, representativeWellId, pointIndex, localX, localZ) {
    const points = getCustomTieBackLineControlPoints(line, representativeWellId, true);
    const idx = Math.max(0, Math.min(points.length - 1, Number(pointIndex) || 0));
    if (!points[idx]) return;
    points[idx].x = Number(localX) || 0;
    points[idx].z = Number(localZ) || 0;
}

function sanitizeCustomTieBackLineControlPoints(rawControlPoints) {
    const out = [];
    const seenWellIds = new Set();
    for (const entry of Array.isArray(rawControlPoints) ? rawControlPoints : []) {
        if (!entry || typeof entry.wellId !== 'string' || !entry.wellId || seenWellIds.has(entry.wellId)) continue;
        seenWellIds.add(entry.wellId);
        const points = [];
        for (const point of Array.isArray(entry.points) ? entry.points : []) {
            points.push({
                x: Number(point?.x) || 0,
                z: Number(point?.z) || 0,
            });
        }
        out.push({
            wellId: entry.wellId,
            points,
        });
    }
    return out;
}

function getCustomTieBackLinesState() {
    return customTieBackLines.map(line => ({
        id: line.id,
        name: line.name,
        surfaceNetworkId: typeof line.surfaceNetworkId === 'string' ? line.surfaceNetworkId : '',
        wellIds: orderedUniqueCustomWellIds(line.wellIds),
        showConnectingTieBacks: line.showConnectingTieBacks !== false,
        tieBackColor: typeof line.tieBackColor === 'string' && line.tieBackColor ? line.tieBackColor : '#9be3ff',
        tieBackThicknessM: Math.max(0.5, Number(line.tieBackThicknessM) || 8),
        tieBackLineStyle: line.tieBackLineStyle === 'dashed' ? 'dashed' : 'solid',
        tieBackDashLengthM: Math.max(1, Number(line.tieBackDashLengthM) || 120),
        tieBackDashSpacingM: Math.max(1, Number(line.tieBackDashSpacingM) || 80),
        controlPointsByWellId: sanitizeCustomTieBackLineControlPoints(line.controlPointsByWellId),
    }));
}

function persistCustomTieBackLinesToStorage() {
    try {
        localStorage.setItem(CUSTOM_TIE_BACK_LINES_STORAGE_KEY, JSON.stringify(getCustomTieBackLinesState()));
    } catch (e) {}
    pushCustomActionHistorySnapshot();
}

function clearCustomTieBackLineMeshes() {
    while (customTieBackLineGroup.children.length > 0) {
        const obj = customTieBackLineGroup.children[0];
        customTieBackLineGroup.remove(obj);
        obj.traverse?.((child) => {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material?.dispose();
        });
    }
}

function getTieBackLineEndpointClusters(line) {
    const byPosition = new Map();
    orderedUniqueCustomWellIds(line.wellIds).forEach(wellId => {
        const well = getCustomHorizonWellById(wellId);
        if (!well) return;
        const head = {
            x: Number(well.headLocal?.x) || 0,
            y: Number(well.headLocal?.y) || 0,
            z: Number(well.headLocal?.z) || 0,
        };
        const locationKey = `${head.x.toFixed(3)}|${head.y.toFixed(3)}|${head.z.toFixed(3)}`;
        if (!byPosition.has(locationKey)) {
            byPosition.set(locationKey, {
                head,
                representativeWellId: wellId,
                wellIds: [wellId],
            });
            return;
        }
        const cluster = byPosition.get(locationKey);
        cluster.wellIds.push(wellId);
        if (wellId < cluster.representativeWellId) {
            cluster.representativeWellId = wellId;
        }
    });
    return [...byPosition.values()].sort((a, b) => a.representativeWellId.localeCompare(b.representativeWellId));
}

function rebuildCustomTieBackLines() {
    clearCustomTieBackLineMeshes();
    if (customTieBackLines.length === 0) return;

    let mutated = false;
    let needsControllerRefresh = false;

    customTieBackLines.forEach(line => {
        const validWellIds = orderedUniqueCustomWellIds(line.wellIds).filter(id => !!getCustomHorizonWellById(id));
        if (
            validWellIds.length !== (Array.isArray(line.wellIds) ? line.wellIds.length : 0) ||
            validWellIds.some((id, idx) => id !== line.wellIds[idx])
        ) {
            line.wellIds = validWellIds;
            mutated = true;
            needsControllerRefresh = true;
        }
        if (!getCustomSurfaceNetworkById(line.surfaceNetworkId)) {
            line.surfaceNetworkId = '';
            mutated = true;
            needsControllerRefresh = true;
        }

        if (line.showConnectingTieBacks === false) return;
        const network = getCustomSurfaceNetworkById(line.surfaceNetworkId);
        if (!network) return;
        if (network.visible === false) return;

        const startY = getCustomSurfaceNetworkPipeBaseHeightM(network);
        const start = new THREE.Vector3(
            Number(network.local?.x) || 0,
            startY,
            Number(network.local?.z) || 0
        );
        const clusters = getTieBackLineEndpointClusters(line);
        const validRepresentativeWellIds = new Set();
        const tieBackColor = new THREE.Color(line.tieBackColor || '#9be3ff');
        const tieBackThicknessM = Math.max(0.5, Number(line.tieBackThicknessM) || 8);
        const tieBackRadius = Math.max(0.25, tieBackThicknessM * 0.5);
        const tieBackLineStyle = line.tieBackLineStyle === 'dashed' ? 'dashed' : 'solid';
        const dashLengthM = Math.max(1, Number(line.tieBackDashLengthM) || 120);
        const dashSpacingM = Math.max(1, Number(line.tieBackDashSpacingM) || 80);

        clusters.forEach(cluster => {
            validRepresentativeWellIds.add(cluster.representativeWellId);
            const end = new THREE.Vector3(cluster.head.x, startY, cluster.head.z);
            if (start.distanceTo(end) <= 1) return;

            const controlPoints = getCustomTieBackLineControlPoints(line, cluster.representativeWellId, false);
            const points = [start.clone()];
            controlPoints.forEach(point => {
                points.push(new THREE.Vector3(
                    (Number(network.local?.x) || 0) + (Number(point.x) || 0),
                    startY,
                    (Number(network.local?.z) || 0) + (Number(point.z) || 0)
                ));
            });
            points.push(end.clone());

            const curve = points.length > 2
                ? new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5)
                : new THREE.LineCurve3(points[0], points[1]);
            const length = Math.max(1, curve.getLength());

            const addSegment = (a, b, segmentIndex) => {
                const seg = createSurfaceNetworkSegmentCylinder(a, b, tieBackThicknessM, line.tieBackColor);
                if (!seg) return;
                seg.userData = {
                    isCustomTieBackLine: true,
                    isCustomTieBackLinePath: true,
                    customTieBackLineId: line.id,
                    tieBackRepresentativeWellId: cluster.representativeWellId,
                    tieBackSegmentIndex: segmentIndex,
                };
                customTieBackLineGroup.add(seg);
            };

            if (tieBackLineStyle === 'dashed') {
                const step = dashLengthM + dashSpacingM;
                let cursor = 0;
                let segIdx = 0;
                while (cursor < length - 0.5) {
                    const fromL = cursor;
                    const toL = Math.min(length, cursor + dashLengthM);
                    if (toL - fromL > 0.5) {
                        const a = curve.getPointAt(fromL / length);
                        const b = curve.getPointAt(toL / length);
                        addSegment(a, b, segIdx++);
                    }
                    cursor += step;
                }
            } else if (points.length > 2) {
                const segCount = Math.max(8, Math.round(length / 40));
                const geo = new THREE.TubeGeometry(curve, segCount, tieBackRadius, 8, false);
                const mat = new THREE.MeshPhongMaterial({
                    color: tieBackColor,
                    emissive: tieBackColor.clone().multiplyScalar(0.14),
                    shininess: 45,
                });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.userData = {
                    isCustomTieBackLine: true,
                    isCustomTieBackLinePath: true,
                    customTieBackLineId: line.id,
                    tieBackRepresentativeWellId: cluster.representativeWellId,
                };
                customTieBackLineGroup.add(mesh);
            } else {
                addSegment(points[0], points[1], 0);
            }
        });

        const sanitizedControlEntries = sanitizeCustomTieBackLineControlPoints(line.controlPointsByWellId)
            .filter(entry => validRepresentativeWellIds.has(entry.wellId));
        if (JSON.stringify(sanitizedControlEntries) !== JSON.stringify(line.controlPointsByWellId || [])) {
            line.controlPointsByWellId = sanitizedControlEntries;
            mutated = true;
        }
    });

    if (mutated) {
        persistCustomTieBackLinesToStorage();
        if (needsControllerRefresh) rebuildCustomTieBackLineControllers();
    }
}

function getCustomTieBackLineConnectionSummary(line) {
    const networkName = getCustomSurfaceNetworkById(line.surfaceNetworkId)?.name || 'No surface network';
    const wellCount = orderedUniqueCustomWellIds(line.wellIds).filter(id => !!getCustomHorizonWellById(id)).length;
    const wellSummary = wellCount === 0 ? 'None' : `${wellCount} well${wellCount === 1 ? '' : 's'}`;
    return `${networkName} -> ${wellSummary}`;
}

function removeCustomTieBackLineById(lineId) {
    const idx = customTieBackLines.findIndex(line => line.id === lineId);
    if (idx < 0) return;
    customTieBackLines.splice(idx, 1);
    rebuildCustomTieBackLineSerial();
    rebuildCustomTieBackLines();
    rebuildCustomTieBackLineControllers();
    persistCustomTieBackLinesToStorage();
}

function clearAllCustomTieBackLines() {
    customTieBackLines.length = 0;
    rebuildCustomTieBackLineSerial();
    rebuildCustomTieBackLines();
    rebuildCustomTieBackLineControllers();
    persistCustomTieBackLinesToStorage();
}

function createCustomTieBackLine(surfaceNetworkId, wellIds) {
    const network = getCustomSurfaceNetworkById(surfaceNetworkId);
    const validWellIds = orderedUniqueCustomWellIds(wellIds).filter(id => !!getCustomHorizonWellById(id));
    if (!network || validWellIds.length === 0) return null;
    const line = {
        id: `ctbl_${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
        name: nextCustomTieBackLineName(),
        surfaceNetworkId,
        wellIds: validWellIds,
        showConnectingTieBacks: true,
        tieBackColor: '#9be3ff',
        tieBackThicknessM: 8,
        tieBackLineStyle: 'solid',
        tieBackDashLengthM: 120,
        tieBackDashSpacingM: 80,
        controlPointsByWellId: [],
    };
    customTieBackLines.push(line);
    rebuildCustomTieBackLines();
    rebuildCustomTieBackLineControllers();
    persistCustomTieBackLinesToStorage();
    return line.id;
}

function updateCustomTieBackLineConnections(lineId, surfaceNetworkId, wellIds) {
    const line = getCustomTieBackLineById(lineId);
    const network = getCustomSurfaceNetworkById(surfaceNetworkId);
    const validWellIds = orderedUniqueCustomWellIds(wellIds).filter(id => !!getCustomHorizonWellById(id));
    if (!line || !network || validWellIds.length === 0) return;
    line.surfaceNetworkId = surfaceNetworkId;
    line.wellIds = validWellIds;
    if (Array.isArray(line.controlPointsByWellId)) {
        line.controlPointsByWellId = line.controlPointsByWellId.filter(entry => validWellIds.includes(entry?.wellId));
    }
    rebuildCustomTieBackLines();
    rebuildCustomTieBackLineControllers();
    persistCustomTieBackLinesToStorage();
}

function setCustomTieBackLinesFromData(lines, options = {}) {
    const persist = options.persist === true;
    customTieBackLines.length = 0;
    if (Array.isArray(lines)) {
        lines.forEach((raw, idx) => {
            if (!raw) return;
            const baseName = typeof raw.name === 'string' && raw.name.trim()
                ? raw.name.trim()
                : `Tie Back Line ${idx + 1}`;
            let uniqueName = baseName;
            let suffix = 2;
            while (customTieBackLines.some(line => line.name === uniqueName)) {
                uniqueName = `${baseName} (${suffix++})`;
            }
            customTieBackLines.push({
                id: typeof raw.id === 'string' && raw.id ? raw.id : `ctbl_${Date.now()}_${idx}`,
                name: uniqueName,
                surfaceNetworkId: typeof raw.surfaceNetworkId === 'string' ? raw.surfaceNetworkId : '',
                wellIds: orderedUniqueCustomWellIds(raw.wellIds),
                showConnectingTieBacks: raw.showConnectingTieBacks !== false,
                tieBackColor: typeof raw.tieBackColor === 'string' && raw.tieBackColor ? raw.tieBackColor : '#9be3ff',
                tieBackThicknessM: Math.max(0.5, Number(raw.tieBackThicknessM) || 8),
                tieBackLineStyle: raw.tieBackLineStyle === 'dashed' ? 'dashed' : 'solid',
                tieBackDashLengthM: Math.max(1, Number(raw.tieBackDashLengthM) || 120),
                tieBackDashSpacingM: Math.max(1, Number(raw.tieBackDashSpacingM) || 80),
                controlPointsByWellId: sanitizeCustomTieBackLineControlPoints(raw.controlPointsByWellId),
            });
        });
    }
    rebuildCustomTieBackLineSerial();
    rebuildCustomTieBackLines();
    rebuildCustomTieBackLineControllers();
    if (persist) persistCustomTieBackLinesToStorage();
}

function loadCustomTieBackLinesFromStorage() {
    const raw = localStorage.getItem(CUSTOM_TIE_BACK_LINES_STORAGE_KEY);
    if (!raw) {
        const legacy = customSurfaceNetworks
            .filter(network =>
                Array.isArray(network.connectedWellIds) &&
                network.connectedWellIds.length > 0
            )
            .map((network, idx) => ({
                id: `ctbl_legacy_${Date.now()}_${idx}`,
                name: `Tie Back Line ${idx + 1}`,
                surfaceNetworkId: network.id,
                wellIds: orderedUniqueCustomWellIds(network.connectedWellIds),
                showConnectingTieBacks: network.showConnectingTieBacks !== false,
                tieBackColor: typeof network.tieBackColor === 'string' && network.tieBackColor ? network.tieBackColor : '#9be3ff',
                tieBackThicknessM: Math.max(0.5, Number(network.tieBackThicknessM) || 8),
                tieBackLineStyle: network.tieBackLineStyle === 'dashed' ? 'dashed' : 'solid',
                tieBackDashLengthM: Math.max(1, Number(network.tieBackDashLengthM) || 120),
                tieBackDashSpacingM: Math.max(1, Number(network.tieBackDashSpacingM) || 80),
                controlPointsByWellId: [],
            }));
        if (legacy.length > 0) {
            setCustomTieBackLinesFromData(legacy, { persist: true });
        } else {
            setCustomTieBackLinesFromData([]);
        }
        return;
    }
    try {
        const parsed = JSON.parse(raw);
        setCustomTieBackLinesFromData(parsed);
    } catch (e) {
        setCustomTieBackLinesFromData([]);
    }
}

function rebuildCustomTieBackLineControllers() {
    if (!customTieBackLineFolder) return;

    const guiRoot = customTieBackLineFolder.domElement?.closest?.('.lil-gui') || null;
    const prevScrollTop = guiRoot ? guiRoot.scrollTop : 0;

    customTieBackLineRowFolders.forEach(folder => folder.destroy());
    customTieBackLineRowFolders = [];
    if (customTieBackLineDeleteAllCtrl) {
        customTieBackLineDeleteAllCtrl.destroy();
        customTieBackLineDeleteAllCtrl = null;
    }

    if (!customTieBackLineCreateCtrl) {
        customTieBackLineCreateCtrl = customTieBackLineFolder.add(customTieBackLineUi, 'createNewTieBackLine').name('Create New Tie Back Line');
    }
    if (customTieBackLines.length > 0) {
        customTieBackLineDeleteAllCtrl = customTieBackLineFolder.add(customTieBackLineUi, 'deleteAll').name('Delete All Tie Back Lines');
    }

    customTieBackLines.forEach(line => {
        const rowFolder = customTieBackLineFolder.addFolder(line.name);
        _trackFolder(rowFolder, `custom-tie-back-line:${line.id}`);

        const nameModel = { name: line.name };
        const nameCtrl = rowFolder.add(nameModel, 'name').name('Name');
        nameCtrl.onFinishChange((value) => {
            const renamed = renameCustomTieBackLineById(line.id, value);
            if (renamed) return;
            nameModel.name = line.name;
            nameCtrl.updateDisplay();
        });

        const actions = {
            configureConnections: () => openTieBackLinePickerModal(line.id),
            deleteTieBackLine: () => removeCustomTieBackLineById(line.id),
        };
        rowFolder.add(actions, 'configureConnections').name(`Connect: ${getCustomTieBackLineConnectionSummary(line)}`);

        rowFolder.add(line, 'showConnectingTieBacks').name('Show Connecting Tie Backs').onChange(() => {
            rebuildCustomTieBackLines();
            persistCustomTieBackLinesToStorage();
            rebuildCustomTieBackLineControllers();
        });
        if (line.showConnectingTieBacks !== false) {
            rowFolder.addColor(line, 'tieBackColor').name('Tie Back Color').onChange(() => {
                rebuildCustomTieBackLines();
                persistCustomTieBackLinesToStorage();
            });
            bindSliderRealtime(
                rowFolder.add(line, 'tieBackThicknessM', 0.5, 200, 0.5).name('Tie Back Thickness (m)'),
                () => {
                    line.tieBackThicknessM = Math.max(0.5, Number(line.tieBackThicknessM) || 0.5);
                    rebuildCustomTieBackLines();
                },
                () => {
                    line.tieBackThicknessM = Math.max(0.5, Number(line.tieBackThicknessM) || 0.5);
                    rebuildCustomTieBackLines();
                    persistCustomTieBackLinesToStorage();
                }
            );
            rowFolder.add(line, 'tieBackLineStyle', {
                Solid: 'solid',
                Dashed: 'dashed',
            }).name('Tie Back Line Style').onChange((value) => {
                line.tieBackLineStyle = value === 'dashed' ? 'dashed' : 'solid';
                rebuildCustomTieBackLines();
                rebuildCustomTieBackLineControllers();
                persistCustomTieBackLinesToStorage();
            });
            if (line.tieBackLineStyle === 'dashed') {
                bindSliderRealtime(
                    rowFolder.add(line, 'tieBackDashLengthM', 1, 2000, 1).name('Dash Length (m)'),
                    () => {
                        line.tieBackDashLengthM = Math.max(1, Number(line.tieBackDashLengthM) || 1);
                        rebuildCustomTieBackLines();
                    },
                    () => {
                        line.tieBackDashLengthM = Math.max(1, Number(line.tieBackDashLengthM) || 1);
                        rebuildCustomTieBackLines();
                        persistCustomTieBackLinesToStorage();
                    }
                );
                bindSliderRealtime(
                    rowFolder.add(line, 'tieBackDashSpacingM', 1, 2000, 1).name('Dash Spacing (m)'),
                    () => {
                        line.tieBackDashSpacingM = Math.max(1, Number(line.tieBackDashSpacingM) || 1);
                        rebuildCustomTieBackLines();
                    },
                    () => {
                        line.tieBackDashSpacingM = Math.max(1, Number(line.tieBackDashSpacingM) || 1);
                        rebuildCustomTieBackLines();
                        persistCustomTieBackLinesToStorage();
                    }
                );
            }
        }

        rowFolder.add(actions, 'deleteTieBackLine').name('Delete');
        customTieBackLineRowFolders.push(rowFolder);
    });

    if (guiRoot) {
        requestAnimationFrame(() => {
            guiRoot.scrollTop = prevScrollTop;
        });
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
    .custom-target-context-menu {
        position: fixed;
        z-index: 2500;
        display: none;
        background: rgba(26, 26, 26, 0.95);
        border: 1px solid #3f3f3f;
        border-radius: 8px;
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.45);
        padding: 6px;
        min-width: 132px;
        backdrop-filter: blur(4px);
    }
    .custom-target-context-menu button {
        width: 100%;
        background: transparent;
        border: none;
        border-radius: 6px;
        color: #e7e7e7;
        text-align: left;
        padding: 7px 10px;
        cursor: pointer;
        font-size: 13px;
        font-family: sans-serif;
    }
    .custom-target-context-menu button:hover {
        background: rgba(255, 255, 255, 0.12);
    }
    .custom-well-target-dropdown {
        margin-bottom: 15px;
    }
    .custom-well-target-dropdown-toggle {
        width: 100%;
        text-align: left;
        background: #111;
        color: #ddd;
        border: 1px solid #444;
        border-radius: 4px;
        padding: 8px 10px;
        cursor: pointer;
        font-size: 13px;
    }
    .custom-well-target-dropdown-list {
        display: none;
        margin-top: 8px;
        max-height: 220px;
        overflow: auto;
        border: 1px solid #444;
        border-radius: 4px;
        background: #111;
        padding: 6px;
    }
    .custom-well-target-dropdown-list.open {
        display: block;
    }
    .custom-well-picker-item {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #ddd;
        font-size: 13px;
        padding: 5px 4px;
        border-radius: 4px;
        cursor: pointer;
    }
    .custom-well-picker-item:hover {
        background: rgba(255, 255, 255, 0.08);
    }
    .custom-well-picker-empty {
        color: #999;
        font-size: 12px;
        padding: 6px 4px;
    }
    .history-actions {
        position: fixed;
        top: 12px;
        right: 320px;
        z-index: 1800;
        display: flex;
        gap: 8px;
        align-items: center;
    }
    .history-btn {
        background: rgba(34, 34, 34, 0.88);
        border: 1px solid #4a4a4a;
        color: #e6e6e6;
        padding: 7px 11px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-family: sans-serif;
        min-width: 62px;
    }
    .history-btn:hover:not(:disabled) {
        background: rgba(56, 56, 56, 0.95);
    }
    .history-btn:disabled {
        opacity: 0.45;
        cursor: default;
    }
    /* ── Camera Flythrough Styles ──────────────────────────────────────────── */
    .icon-btn.flythrough-btn {
        background: linear-gradient(135deg, #1a3a5c, #1e88e5);
        color: #b8dcff;
        position: relative;
        overflow: hidden;
    }
    .icon-btn.flythrough-btn:hover {
        background: linear-gradient(135deg, #1e4a6e, #42a5f5);
        color: #fff;
    }
    .icon-btn.flythrough-btn.animating {
        background: linear-gradient(135deg, #b71c1c, #e53935);
        color: #fdd;
    }
    .flythrough-modal .modal {
        min-width: 380px;
        max-width: 420px;
    }
    .flythrough-form-group {
        margin-bottom: 14px;
    }
    .flythrough-form-group label {
        display: block;
        font-size: 12px;
        color: #aaa;
        margin-bottom: 5px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .flythrough-form-group select,
    .flythrough-form-group input[type="number"] {
        width: 100%;
        padding: 8px 10px;
        background: #111;
        border: 1px solid #444;
        color: #fff;
        border-radius: 4px;
        box-sizing: border-box;
        font-size: 13px;
    }
    .flythrough-form-group input[type="range"] {
        width: 100%;
        margin-top: 4px;
        accent-color: #42a5f5;
    }
    .flythrough-form-row {
        display: flex;
        gap: 12px;
    }
    .flythrough-form-row .flythrough-form-group {
        flex: 1;
    }
    .flythrough-easing-preview {
        height: 50px;
        background: #0a0a0a;
        border: 1px solid #333;
        border-radius: 4px;
        margin-top: 4px;
        position: relative;
        overflow: hidden;
    }
    .flythrough-easing-preview canvas {
        width: 100%;
        height: 100%;
    }
    .flythrough-hint {
        font-size: 11px;
        color: #777;
        margin-top: 4px;
    }
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
        <span style="width:1px; height:20px; background:#444; margin:0 4px;"></span>
        <button id="btnFlythrough" class="icon-btn flythrough-btn" title="Camera Flythrough">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
        </button>
    </div>
    <div class="history-actions" id="historyActions">
        <button id="btnUndoAction" class="history-btn" type="button" title="Undo" disabled>Undo</button>
        <button id="btnRedoAction" class="history-btn" type="button" title="Redo" disabled>Redo</button>
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

    <!-- Create Custom Well Modal -->
    <div id="createWellModal" class="modal-overlay">
        <div class="modal">
            <h3>Create Custom Horizon Well</h3>
            <div class="custom-well-target-dropdown">
                <button id="customWellTargetDropdownToggle" class="custom-well-target-dropdown-toggle" type="button">
                    <span id="customWellTargetDropdownLabel">Select target(s)</span>
                </button>
                <div id="customWellTargetDropdownList" class="custom-well-target-dropdown-list"></div>
            </div>
            <div class="modal-buttons">
                <button class="btn btn-cancel" onclick="closeModal('createWellModal')">Cancel</button>
                <button class="btn btn-primary" id="confirmCreateWell">Create Well</button>
            </div>
        </div>
    </div>

    <!-- Edit Custom Well Targets Modal -->
    <div id="editWellTargetsModal" class="modal-overlay">
        <div class="modal">
            <h3 id="editWellTargetsTitle">Edit Targets</h3>
            <div id="editWellTargetList" class="custom-well-target-dropdown-list open"></div>
            <div class="modal-buttons">
                <button class="btn btn-cancel" onclick="closeModal('editWellTargetsModal')">Cancel</button>
                <button class="btn btn-primary" id="confirmEditWellTargets">Apply</button>
            </div>
        </div>
    </div>

    <!-- Create / Edit Tie Back Line Modal -->
    <div id="createTieBackLineModal" class="modal-overlay">
        <div class="modal">
            <h3 id="createTieBackLineModalTitle">Create Tie Back Line</h3>
            <select id="tieBackLineSurfaceNetworkSelect" class="preset-select" style="width:100%; margin-bottom:10px;"></select>
            <div class="custom-well-target-dropdown">
                <button id="tieBackLineWellDropdownToggle" class="custom-well-target-dropdown-toggle" type="button">
                    <span id="tieBackLineWellDropdownLabel">Select one or more wells</span>
                </button>
                <div id="tieBackLineWellDropdownList" class="custom-well-target-dropdown-list"></div>
            </div>
            <div class="modal-buttons">
                <button class="btn btn-cancel" onclick="closeModal('createTieBackLineModal')">Cancel</button>
                <button class="btn btn-primary" id="confirmCreateTieBackLine">Create</button>
            </div>
        </div>
    </div>

    <!-- Camera Flythrough Modal -->
    <div id="flythroughModal" class="modal-overlay flythrough-modal">
        <div class="modal">
            <h3>🎬 Camera Flythrough</h3>
            <div class="flythrough-form-group">
                <label>Start Preset</label>
                <select id="flythroughStartPreset" class="preset-select" style="width:100%"></select>
            </div>
            <div class="flythrough-form-group">
                <label>End Preset</label>
                <select id="flythroughEndPreset" class="preset-select" style="width:100%"></select>
            </div>
            <div class="flythrough-form-row">
                <div class="flythrough-form-group">
                    <label>Duration (seconds)</label>
                    <input type="number" id="flythroughDuration" min="0.5" max="60" step="0.5" value="3">
                </div>
                <div class="flythrough-form-group">
                    <label>Easing Curve</label>
                    <select id="flythroughEasing">
                        <option value="easeInOutCubic" selected>Ease In-Out (Smooth)</option>
                        <option value="easeInOutQuad">Ease In-Out (Gentle)</option>
                        <option value="easeInOutQuart">Ease In-Out (Snappy)</option>
                        <option value="easeInOutQuint">Ease In-Out (Dramatic)</option>
                        <option value="easeOutCubic">Ease Out (Decelerate)</option>
                        <option value="easeInCubic">Ease In (Accelerate)</option>
                        <option value="linear">Linear</option>
                        <option value="easeInOutBack">Overshoot</option>
                        <option value="easeInOutElastic">Elastic</option>
                    </select>
                </div>
            </div>
            <div class="flythrough-form-group">
                <label>Preview Curve</label>
                <div class="flythrough-easing-preview" id="flythroughEasingPreview"><canvas></canvas></div>
            </div>
            <div class="flythrough-form-group">
                <label><input type="checkbox" id="flythroughLoop" style="margin-right:6px;">Loop (ping-pong)</label>
            </div>
            <div class="modal-buttons">
                <button class="btn btn-cancel" onclick="closeModal('flythroughModal')">Cancel</button>
                <button class="btn btn-primary" id="confirmFlythrough" style="background:linear-gradient(135deg,#1565c0,#42a5f5);">▶ Play</button>
            </div>
        </div>
    </div>
`;
document.body.appendChild(uiContainer);

const customTargetContextMenuEl = document.createElement('div');
customTargetContextMenuEl.className = 'custom-target-context-menu';
document.body.appendChild(customTargetContextMenuEl);

function hideCustomTargetContextMenu() {
    customTargetContextMenuEl.style.display = 'none';
    customTargetContextMenuEl.innerHTML = '';
}

function showCustomTargetContextMenu(clientX, clientY, items) {
    const menuItems = Array.isArray(items) ? items.filter(item =>
        item &&
        typeof item.label === 'string' &&
        typeof item.onSelect === 'function'
    ) : [];
    if (menuItems.length === 0) {
        hideCustomTargetContextMenu();
        return;
    }
    customTargetContextMenuEl.innerHTML = '';
    menuItems.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = item.label;
        btn.addEventListener('click', () => {
            hideCustomTargetContextMenu();
            item.onSelect();
        });
        customTargetContextMenuEl.appendChild(btn);
    });
    customTargetContextMenuEl.style.display = 'block';

    const pad = 8;
    const rect = customTargetContextMenuEl.getBoundingClientRect();
    const left = Math.min(window.innerWidth - rect.width - pad, Math.max(pad, clientX));
    const top = Math.min(window.innerHeight - rect.height - pad, Math.max(pad, clientY));
    customTargetContextMenuEl.style.left = `${left}px`;
    customTargetContextMenuEl.style.top = `${top}px`;
}

document.getElementById('customWellTargetDropdownToggle')?.addEventListener('click', () => {
    const listEl = document.getElementById('customWellTargetDropdownList');
    if (!listEl) return;
    listEl.classList.toggle('open');
});
document.getElementById('tieBackLineWellDropdownToggle')?.addEventListener('click', () => {
    const listEl = document.getElementById('tieBackLineWellDropdownList');
    if (!listEl) return;
    listEl.classList.toggle('open');
});
document.getElementById('tieBackLineSurfaceNetworkSelect')?.addEventListener('change', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLSelectElement)) return;
    tieBackLinePickerSelectedNetworkId = target.value || '';
});

document.getElementById('confirmCreateWell')?.addEventListener('click', () => {
    confirmCreateCustomHorizonWellFromModal();
});
document.getElementById('confirmEditWellTargets')?.addEventListener('click', () => {
    confirmEditCustomHorizonWellTargetsModal();
});
document.getElementById('confirmCreateTieBackLine')?.addEventListener('click', () => {
    confirmTieBackLinePickerModal();
});
document.getElementById('btnUndoAction')?.addEventListener('click', () => {
    undoCustomAction();
});
document.getElementById('btnRedoAction')?.addEventListener('click', () => {
    redoCustomAction();
});

document.addEventListener('pointerdown', (e) => {
    if (!(e.target instanceof Node)) return;
    if (customTargetContextMenuEl.style.display !== 'block') return;
    if (customTargetContextMenuEl.contains(e.target)) return;
    hideCustomTargetContextMenu();
}, true);

document.addEventListener('pointerdown', (e) => {
    const listEl = document.getElementById('customWellTargetDropdownList');
    const toggleEl = document.getElementById('customWellTargetDropdownToggle');
    if (!listEl || !toggleEl) return;
    if (!listEl.classList.contains('open')) return;
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (listEl.contains(t) || toggleEl.contains(t)) return;
    listEl.classList.remove('open');
}, true);

document.addEventListener('pointerdown', (e) => {
    const listEl = document.getElementById('tieBackLineWellDropdownList');
    const toggleEl = document.getElementById('tieBackLineWellDropdownToggle');
    if (!listEl || !toggleEl) return;
    if (!listEl.classList.contains('open')) return;
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (listEl.contains(t) || toggleEl.contains(t)) return;
    listEl.classList.remove('open');
}, true);

window.addEventListener('blur', hideCustomTargetContextMenu);
window.addEventListener('resize', hideCustomTargetContextMenu);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideCustomTargetContextMenu();
});



window.closeModal = (id) => {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
    if (id === 'createTieBackLineModal') {
        tieBackLinePickerTargetLineId = null;
        tieBackLinePickerSelectedNetworkId = '';
        tieBackLinePickerSelectedWellIds = new Set();
        const listEl = document.getElementById('tieBackLineWellDropdownList');
        if (listEl) listEl.classList.remove('open');
        const titleEl = document.getElementById('createTieBackLineModalTitle');
        if (titleEl) titleEl.textContent = 'Create Tie Back Line';
        const confirmBtn = document.getElementById('confirmCreateTieBackLine');
        if (confirmBtn) confirmBtn.textContent = 'Create';
    }
    if (id === 'editWellTargetsModal') {
        editWellTargetsTargetWellId = null;
        editWellTargetsSelectedTargetIds = new Set();
        const titleEl = document.getElementById('editWellTargetsTitle');
        if (titleEl) titleEl.textContent = 'Edit Targets';
        const listEl = document.getElementById('editWellTargetList');
        if (listEl) listEl.innerHTML = '';
    }
};

// ── Title click → hide all UI for clean screenshots ─────────────────────────
// Click the title to enter screenshot mode (all UI hidden).
// Click anywhere on the canvas to exit screenshot mode and restore UI.
let _uiHidden = false;

function hideAllUI() {
    _uiHidden = true;
    const guiEl   = document.querySelector('.lil-gui.root');
    const preBar  = document.getElementById('presetBar');
    const history = document.getElementById('historyActions');
    const compass = document.getElementById('compass-hud');
    const loading = document.getElementById('loading');
    const title   = document.querySelector('#ui-container h1');
    if (guiEl)   guiEl.style.display   = 'none';
    if (preBar)  preBar.style.display  = 'none';
    if (history) history.style.display = 'none';
    if (compass) compass.style.display = 'none';
    if (loading) loading.style.display = 'none';
    if (title)   title.style.display   = 'none';

    // One-shot click listener on the canvas to restore UI (skip during flythrough)
    if (!_flyAnim) {
        const canvas = document.querySelector('#canvas-container canvas') || document.getElementById('canvas-container');
        canvas.addEventListener('click', showAllUI, { once: true });
    }
}

function showAllUI() {
    _uiHidden = false;
    const guiEl   = document.querySelector('.lil-gui.root');
    const preBar  = document.getElementById('presetBar');
    const history = document.getElementById('historyActions');
    const compass = document.getElementById('compass-hud');
    const loading = document.getElementById('loading');
    const title   = document.querySelector('#ui-container h1');
    if (guiEl)   guiEl.style.display   = '';
    if (preBar)  preBar.style.display  = '';
    if (history) history.style.display = '';
    if (compass) compass.style.display = '';
    if (loading) loading.style.display = '';
    if (title)   title.style.display   = '';
    positionHistoryActions();
}

document.querySelector('#ui-container h1').addEventListener('click', hideAllUI);

// ... Rest of script ...
const PARAMS_STORAGE_KEY = 'geo_viewer_params';
const PANEL_STATE_KEY   = 'geo_viewer_panel_state';
const CUSTOM_TARGETS_STORAGE_KEY = 'geo_custom_horizon_targets';
const CUSTOM_HORIZON_WELLS_STORAGE_KEY = 'geo_custom_horizon_wells';
const CUSTOM_SURFACE_NETWORKS_STORAGE_KEY = 'geo_custom_surface_networks';
const CUSTOM_TIE_BACK_LINES_STORAGE_KEY = 'geo_custom_tie_back_lines';
const REGIONAL_CONTEXT_VISIBILITY_STORAGE_KEY = 'geo_regional_context_visibility';
const CUSTOM_ACTION_HISTORY_LIMIT = 250;

let customActionHistory = [];
let customActionHistoryIndex = -1;
let customActionHistoryInitialized = false;
let customActionHistoryApplying = false;

function captureCustomActionState() {
    return {
        targets: getCustomTargetsState(),
        wells: getCustomHorizonWellsState(),
        surfaceNetworks: getCustomSurfaceNetworksState(),
        tieBackLines: getCustomTieBackLinesState(),
    };
}

function serializeCustomActionState(state) {
    try {
        return JSON.stringify(state);
    } catch (e) {
        return '';
    }
}

function updateCustomActionButtons() {
    const undoBtn = document.getElementById('btnUndoAction');
    const redoBtn = document.getElementById('btnRedoAction');
    if (undoBtn) undoBtn.disabled = customActionHistoryIndex <= 0;
    if (redoBtn) redoBtn.disabled = customActionHistoryIndex >= customActionHistory.length - 1;
}

function positionHistoryActions() {
    const historyEl = document.getElementById('historyActions');
    if (!(historyEl instanceof HTMLElement)) return;
    const guiRoot = document.querySelector('.lil-gui.root');
    let rightPx = 16;
    if (
        guiRoot instanceof HTMLElement &&
        guiRoot.getClientRects().length > 0 &&
        getComputedStyle(guiRoot).display !== 'none'
    ) {
        const panelRect = guiRoot.getBoundingClientRect();
        // Keep at least a 16px gap from the panel's left edge.
        rightPx = Math.max(16, Math.ceil(window.innerWidth - panelRect.left + 16));
    }
    historyEl.style.right = `${rightPx}px`;
}

function pushCustomActionHistorySnapshot() {
    if (!customActionHistoryInitialized || customActionHistoryApplying) {
        updateCustomActionButtons();
        return;
    }

    const state = captureCustomActionState();
    const serialized = serializeCustomActionState(state);
    if (!serialized) return;

    const current = customActionHistory[customActionHistoryIndex];
    if (current?.serialized === serialized) {
        updateCustomActionButtons();
        return;
    }

    if (customActionHistoryIndex < customActionHistory.length - 1) {
        customActionHistory = customActionHistory.slice(0, customActionHistoryIndex + 1);
    }
    customActionHistory.push({
        state: JSON.parse(serialized),
        serialized,
    });
    if (customActionHistory.length > CUSTOM_ACTION_HISTORY_LIMIT) {
        const overflow = customActionHistory.length - CUSTOM_ACTION_HISTORY_LIMIT;
        customActionHistory.splice(0, overflow);
    }
    customActionHistoryIndex = customActionHistory.length - 1;
    updateCustomActionButtons();
}

function applyCustomActionState(state) {
    customActionHistoryApplying = true;
    try {
        const targets = Array.isArray(state?.targets) ? state.targets : [];
        const wells = Array.isArray(state?.wells) ? state.wells : [];
        const surfaceNetworks = Array.isArray(state?.surfaceNetworks) ? state.surfaceNetworks : [];
        const tieBackLines = Array.isArray(state?.tieBackLines) ? state.tieBackLines : [];
        setCustomTargetsFromData(targets, { persist: false });
        setCustomHorizonWellsFromData(wells, { persist: false });
        setCustomSurfaceNetworksFromData(surfaceNetworks, { persist: false });
        setCustomTieBackLinesFromData(tieBackLines, { persist: false });
        try { localStorage.setItem(CUSTOM_TARGETS_STORAGE_KEY, JSON.stringify(getCustomTargetsState())); } catch (e) {}
        try { localStorage.setItem(CUSTOM_HORIZON_WELLS_STORAGE_KEY, JSON.stringify(getCustomHorizonWellsState())); } catch (e) {}
        try { localStorage.setItem(CUSTOM_SURFACE_NETWORKS_STORAGE_KEY, JSON.stringify(getCustomSurfaceNetworksState())); } catch (e) {}
        try { localStorage.setItem(CUSTOM_TIE_BACK_LINES_STORAGE_KEY, JSON.stringify(getCustomTieBackLinesState())); } catch (e) {}
    } finally {
        customActionHistoryApplying = false;
    }
    updateCustomActionButtons();
}

function undoCustomAction() {
    if (customActionHistoryIndex <= 0) {
        updateCustomActionButtons();
        return;
    }
    customActionHistoryIndex -= 1;
    applyCustomActionState(customActionHistory[customActionHistoryIndex]?.state);
}

function redoCustomAction() {
    if (customActionHistoryIndex >= customActionHistory.length - 1) {
        updateCustomActionButtons();
        return;
    }
    customActionHistoryIndex += 1;
    applyCustomActionState(customActionHistory[customActionHistoryIndex]?.state);
}

function initializeCustomActionHistory() {
    customActionHistory = [];
    customActionHistoryIndex = -1;
    customActionHistoryInitialized = true;
    pushCustomActionHistorySnapshot();
    updateCustomActionButtons();
    positionHistoryActions();
}

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
    depthColorPerLayer: true,       // each horizon uses its own min/max depth
    faultSmoothIterations: 2,
    selectedColormap: 'Warm',
    showContours: false,
    contourInterval: 60.76,
    contourThickness: 0.99,
    contourOpacity: 0.1809,
    contourColor: '#111111',
    zScale: 1.3365,
    ambientIntensity: 2.62,
    sunIntensity: 0,
    headlampIntensity: 2.835,
    hemiIntensity: 0.74,
    lightingEnabled: true,
    backgroundColor: '#111111',

    faultColorMode: 'uniform',
    faultSingleColor: '#bafdef',
    regionalVisible: true,
    regionalOpacity: 0.08,
    regionalWireframe: false,
    regionalFitToBase: true,
    regionalBlendKm: 60,
    regionalTopologyFalloff: false,
    regionalFitBlendKm: 3,
    regionalShowContours: true,
    regionalContourInterval: 101,
    regionalContourThickness: 1,
    regionalContourOpacity: 0.36,
    regionalContourColor: '#95c0f9',
    regionalContourSmooth: 3,
    // ── Horizon footprint bounding boxes ─────────────────────────────────────
    norneBBoxVisible: false,
    volveBBoxVisible: false,
    horizonBBoxColor: '#ffffff',
    // ── Per-horizon depth exaggeration ───────────────────────────────────────
    horizonDepthExag: 1.95,
    // Seismic crossline panel
    seismicPanelVisible: false,
    seismicPanelOpacity: 0.8,
    // Crossline transparent pane
    crosslinePaneVisible: false,
    crosslinePaneOpacity: 0.25,
    crosslinePaneColor: '#4a90d9',
    crosslinePosition: -0.17,            // position along long axis (-0.5 to 0.5)
    // ── Survey position offset ───────────────────────────────────────────────
    surveyOffsetEastKm: -24,
    surveyOffsetNorthKm: 0,
    surveyRotationDeg: 34,
    norneDepthOffsetM: 330,
    volveOffsetEastKm: -30,
    volveOffsetNorthKm: -12,
    volveRotationDeg: 21,
    volveDepthOffsetM: -3000,
    norneScale: 1.2,
    volveScale: 2.1,
    regionalFitToVolve: true,
    // ── Well Trajectories ────────────────────────────────────────────────────
    showLateral1: false,
    showLateral2: false,
    showLateral3: true,
    showLateral4: true,
    lat1Color: '#95c0f9',
    lat2Color: '#95c0f9',
    lat3Color: '#cefd86',
    lat4Color: '#95c0f9',
    wellTubeRadius: 4,
    wellPathStyle: 'tube',
    wellDotSize: 4,
    wellDotSpacing: 40,
    wellheadConeVisible: true,
    wellheadConeColor: '#ffffff',
    wellheadConeScale: 1.0,
    wellShowTargets: true,
    showLat1Targets: true,
    showLat2Targets: true,
    wellTargetColor: '#cefd86',
    wellTargetSize: 75,
    wellTargetOpacity: 0.55,
    customTargetAddOnClick: true,
    customTargetColor: '#ffd166',
    customTargetSize: 75,
    customTargetOpacity: 0.65,
    customHorizonWellColor: '#7de2d1',
    customHorizonWellPathStyle: 'tube',
    customHorizonWellDoglegSeverity: 8,
    customHorizonWellTubeRadius: 4,
    customHorizonWellDotSize: 4,
    customHorizonWellDotSpacing: 40,
    customHorizonWellRingSizingMode: 'uniform',
    customHorizonWellRingSize: 12,
    customHorizonWellRingStartSize: 12,
    customHorizonWellRingEndSize: 24,
    customHorizonWellRingSpacing: 40,
    customHorizonWellRingColor: '#7de2d1',
    customHorizonWellRingOpacity: 0.65,
    customHorizonWellheadVisible: true,
    customHorizonWellheadScale: 1.0,
    wellOffsetEastKm: -15,
    wellOffsetNorthKm: -16.5,
    wellRotationDeg: 14,
    wellScale: 3.2,
    wellDepthOffsetM: -920,
    lat2RotationDeg: -29,
    lat1LP1Position: 4.8,
    lat1BHLPosition: 5,
    lat2LP2Position: 4,
    targetLP1YOffset: 0,   // Y offset in metres (positive = up/shallower)
    targetBHLYOffset: 0,
    targetLP2YOffset: 0,

    // ── Surface Grid ─────────────────────────────────────────────────────────
    surfaceGridVisible: true,
    surfaceGridOpacity: 0.25,
    surfaceGridColor: '#4a6a8a',
    surfaceGridWireframe: true,
    surfaceGridHeightOffsetM: 0,

    // ── Horizon Display Mode ─────────────────────────────────────────────────
    showHorizonDots: true,            // show point cloud overlay (independent of solid mesh)
    horizonDotSize: 8,                 // dot radius in scene metres
    horizonDotSkip: 1,                 // render every Nth vertex (1 = all)
    // ── 3D Dot Mode (fill between horizons) ──────────────────────────────────
    show3DDots: false,                  // fill dots between adjacent visible horizons
    threeDDotSize: 8,                   // sphere radius in scene metres
    threeDDotDensity: 1,                // vertical density multiplier (1 = grid spacing)
    // ── BCU Texture Overlay (Volve → Norne) ──────────────────────────────────
    bcuTextureIntensity: 50,            // scales BCU amplitude perturbation on Norne horizons (metres)
};

// Default layer overrides for specific layers (applied when no localStorage exists)
const DEFAULT_LAYER_OVERRIDES = {
    'Norne Base':    { visible: true, opacity: 0.7 },
    'Hugin Fm Base': { visible: true, opacity: 0.7 },
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

function persistRegionalContextVisibilityToStorage() {
    const state = {
        surfaceGridVisible: params.surfaceGridVisible !== false,
        regionalShowContours: params.regionalShowContours === true,
    };
    try {
        localStorage.setItem(REGIONAL_CONTEXT_VISIBILITY_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
}

function loadRegionalContextVisibilityFromStorage() {
    try {
        const raw = localStorage.getItem(REGIONAL_CONTEXT_VISIBILITY_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (typeof parsed?.surfaceGridVisible === 'boolean') {
            params.surfaceGridVisible = parsed.surfaceGridVisible;
        }
        if (typeof parsed?.regionalShowContours === 'boolean') {
            params.regionalShowContours = parsed.regionalShowContours;
        }
    } catch (e) {}
}

loadRegionalContextVisibilityFromStorage();


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
let crosslinePane = null;  // THREE.Mesh transparent colored crossline pane
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
    return { bbox, oCtrX, oCtrY, oCtrZ, rotY: Math.atan2(-az, ax), widthA, widthB, boxHeight, ax, az, cx, cz, minA, maxA, minB, maxB };
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
        refitNorneUVsToOBB();
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

// ── Refit Norne horizon UVs to OBB ──────────────────────────────────────────
// Projects each vertex onto the OBB primary (A) and secondary (B) axes and
// maps to 0→1 preserving the texture image aspect ratio.
// The image is rotated 90° so its long side matches the OBB long axis, then
// "cover" fitted (scaled up to fully cover the OBB, centred).
function refitNorneUVsToOBB() {
    if (!_obbState) return;
    const { ax, az, cx, cz, minA, maxA, minB, maxB } = _obbState;
    const bx = -az, bz = ax;
    const rangeA = maxA - minA || 1;
    const rangeB = maxB - minB || 1;

    // Image dimensions rotated 90°: long side (2166) → A axis, short side (1488) → B axis
    const imgW = 2166, imgH = 1488;
    const imgAR = imgW / imgH;       // rotated image aspect ratio
    const obbAR = rangeA / rangeB;   // OBB aspect ratio in world units

    // "Cover" fit: scale image to fully cover the OBB, preserving aspect ratio
    let fitA, fitB;
    if (obbAR > imgAR) {
        // OBB is wider — image must stretch to fill A axis
        fitA = rangeA;
        fitB = rangeA / imgAR;
    } else {
        // OBB is taller — image must stretch to fill B axis
        fitB = rangeB;
        fitA = rangeB * imgAR;
    }
    // Centre offsets (may be negative when image overflows OBB)
    const offsetA = (rangeA - fitA) * 0.5;
    const offsetB = (rangeB - fitB) * 0.5;

    norneSurveyGroup.children.forEach(mesh => {
        if (!mesh.userData.isHorizon || mesh.userData.isContour) return;
        if (!(mesh instanceof THREE.Mesh)) return;
        if (mesh.userData.isHorizonDots) return;

        const pos = mesh.geometry.attributes.position;
        const uvAttr = mesh.geometry.attributes.uv;
        if (!uvAttr) return;

        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i);
            const vz = pos.getZ(i);
            // Project onto OBB axes relative to centroid
            const dx = vx - cx, dz = vz - cz;
            const projA = dx * ax + dz * az;
            const projB = dx * bx + dz * bz;
            // Normalise to 0→1 within aspect-corrected, centred region
            // Swap U/V to rotate the image 90°: A-axis → V, B-axis → U
            const u = (projB - minB - offsetB) / fitB;
            const v = (projA - minA - offsetA) / fitA;
            uvAttr.setXY(i, u, v);
        }
        uvAttr.needsUpdate = true;
    });
}

// ── Seismic crossline panel ───────────────────────────────────────────────────
// Vertical plane spanning the full length × height of the OBB, textured with
// the user-provided seismic section image. Shares the OBB rotation.
const _seismicTexture = new THREE.TextureLoader().load('seismic_crossline.jpg');
_seismicTexture.wrapS = THREE.RepeatWrapping;
_seismicTexture.repeat.x = -1;   // flip horizontally
function buildSeismicPanel() {
    if (seismicPanel) {
        norneSurveyGroup.remove(seismicPanel);
        seismicPanel.geometry.dispose();
        seismicPanel.material.dispose();
        seismicPanel = null;
    }
    if (!_obbState) return;

    const { oCtrX, oCtrY, oCtrZ, rotY, widthA, widthB, boxHeight, ax, az } = _obbState;

    // Position along the long (A) axis using the slider param
    const posT = params.crosslinePosition;
    const eastX = oCtrX + (widthA * posT) * ax;
    const eastZ = oCtrZ + (widthA * posT) * az;

    const geo = new THREE.PlaneGeometry(widthB, boxHeight); // crossline = short axis
    const mat = new THREE.MeshBasicMaterial({
        map:         _seismicTexture,
        side:        THREE.DoubleSide,
        transparent: true,
        opacity:     params.seismicPanelOpacity,
        depthWrite:  true,   // write depth so panel occludes topology lines behind it
    });
    seismicPanel = new THREE.Mesh(geo, mat);
    seismicPanel.position.set(eastX, oCtrY, eastZ);
    seismicPanel.rotation.y = rotY + Math.PI / 2; // perpendicular to long axis = crossline
    seismicPanel.visible = params.seismicPanelVisible;
    seismicPanel.userData.isSeismicPanel = true;
    norneSurveyGroup.add(seismicPanel);

    // ── Transparent coloured pane (same geometry/position) ──
    if (crosslinePane) {
        norneSurveyGroup.remove(crosslinePane);
        crosslinePane.geometry.dispose();
        crosslinePane.material.dispose();
        crosslinePane = null;
    }
    const paneGeo = new THREE.PlaneGeometry(widthB, boxHeight);
    const paneMat = new THREE.MeshBasicMaterial({
        color:       params.crosslinePaneColor,
        side:        THREE.DoubleSide,
        transparent: true,
        opacity:     params.crosslinePaneOpacity,
        depthWrite:  false,
    });
    crosslinePane = new THREE.Mesh(paneGeo, paneMat);
    crosslinePane.position.set(eastX, oCtrY, eastZ);
    crosslinePane.rotation.y = rotY + Math.PI / 2;
    crosslinePane.visible = params.crosslinePaneVisible;
    crosslinePane.userData.isSeismicPanel = true;
    norneSurveyGroup.add(crosslinePane);
}

// Reposition both crossline meshes without rebuilding geometry
function updateCrosslinePosition() {
    if (!_obbState) return;
    const { oCtrX, oCtrZ, widthA, ax, az } = _obbState;
    const posT = params.crosslinePosition;
    const px = oCtrX + (widthA * posT) * ax;
    const pz = oCtrZ + (widthA * posT) * az;
    if (seismicPanel)  { seismicPanel.position.x  = px; seismicPanel.position.z  = pz; }
    if (crosslinePane) { crosslinePane.position.x = px; crosslinePane.position.z = pz; }
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
        for (let i = 0; i < raw.length; i += 3) {
            // Skip invalid placeholder vertices at origin
            if (raw[i] === 0 && raw[i + 1] === 0 && raw[i + 2] === 0) continue;
            sumY += raw[i + 1]; count++;
        }
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
    rebuildCustomTargets();
}

// Helper to add Horizons panel controls for bbox and depth exaggeration.
// Called once at startup and again in clearScene whenever horizonFolder is recreated.
function addHorizonPanelControls() {
    const depthExagFolder = horizonFolder.addFolder('Depth & Display');
    _trackFolder(depthExagFolder, 'Depth & Display');
    depthExagFolder.add(params, 'horizonDepthExag', 1.0, 5.0, 0.05)
        .name('Layer Spread (×)')
        .onChange(v => applyHorizonDepthExag(v));

    // BCU texture overlay (Volve seismic attribute → Norne horizon roughness)
    bindSliderRealtime(
        depthExagFolder.add(params, 'bcuTextureIntensity', 0, 80, 0.5).name('BCU Texture (m)'),
        () => { applyHorizonPositions(); },
        () => { applyHorizonPositions(); updateColoring(); buildHorizonBBox(); }
    );

    // Seismic crossline panel controls
    depthExagFolder.add(params, 'seismicPanelVisible').name('Crossline Panel')
        .onChange(v => { if (seismicPanel) seismicPanel.visible = v; });
    depthExagFolder.add(params, 'seismicPanelOpacity', 0.0, 1.0, 0.01).name('Panel Opacity')
        .onChange(v => { if (seismicPanel) { seismicPanel.material.opacity = v; seismicPanel.material.needsUpdate = true; } });
    depthExagFolder.add(params, 'crosslinePosition', -0.5, 0.5, 0.01).name('Crossline Position')
        .onChange(() => updateCrosslinePosition());

    // Crossline transparent pane controls
    depthExagFolder.add(params, 'crosslinePaneVisible').name('Crossline Pane')
        .onChange(v => { if (crosslinePane) crosslinePane.visible = v; });
    depthExagFolder.add(params, 'crosslinePaneOpacity', 0.0, 1.0, 0.01).name('Pane Opacity')
        .onChange(v => { if (crosslinePane) { crosslinePane.material.opacity = v; crosslinePane.material.needsUpdate = true; } });
    depthExagFolder.addColor(params, 'crosslinePaneColor').name('Pane Color')
        .onChange(v => { if (crosslinePane) { crosslinePane.material.color.set(v); crosslinePane.material.needsUpdate = true; } });
}


// Sample the BCU texture grid at fractional UV coordinates using bilinear interpolation.
// u, v are in [0, 1]; maps directly to the full BCU grid (no tiling).
function sampleBcuTexture(u, v) {
    if (!bcuTextureData) return 0;
    const { rows, cols, data, p5, p95 } = bcuTextureData;
    // Clamp UV coordinates to [0, 1]
    const cu = Math.max(0, Math.min(1, u));
    const cv = Math.max(0, Math.min(1, v));
    // Map to grid coordinates
    const gx = cu * (cols - 1);
    const gy = cv * (rows - 1);
    const ix = Math.floor(gx), iy = Math.floor(gy);
    const fx = gx - ix, fy = gy - iy;
    const ix1 = Math.min(ix + 1, cols - 1);
    const iy1 = Math.min(iy + 1, rows - 1);
    // Bilinear interpolation
    const v00 = data[iy][ix],   v10 = data[iy][ix1];
    const v01 = data[iy1][ix],  v11 = data[iy1][ix1];
    const val = v00 * (1-fx) * (1-fy) + v10 * fx * (1-fy) +
                v01 * (1-fx) * fy     + v11 * fx * fy;
    // Normalise to roughly ±1 using the p5/p95 range
    const range = (p95 - p5) || 1;
    return (val - (p5 + p95) * 0.5) / (range * 0.5);
}

// Reset horizon mesh vertex positions to raw + depth exaggeration shift + BCU texture.
function applyHorizonPositions() {
    const bcuIntensity = params.bcuTextureIntensity || 0;
    const hasBcu = bcuTextureData && bcuIntensity > 0;

    allSurveyChildren().forEach(mesh => {
        if (!mesh.userData.isHorizon || !mesh.userData.rawHorizonPos) return;
        if (!(mesh instanceof THREE.Mesh)) return;
        const pos = mesh.geometry.attributes.position;
        const raw = mesh.userData.rawHorizonPos;
        const exagShift = mesh.userData.exagShift || 0;

        // BCU texture only applies to Norne survey horizons
        const isNorne = norneSurveyGroup.children.includes(mesh);
        const applyBcu = hasBcu && isNorne && !mesh.userData.isContour;
        const uvAttr = applyBcu ? mesh.geometry.attributes.uv : null;

        for (let i = 0; i < pos.count; i++) {
            const rx = raw[i * 3], ry = raw[i * 3 + 1], rz = raw[i * 3 + 2];
            // Keep invalid placeholder vertices at origin (don't shift them)
            if (rx === 0 && ry === 0 && rz === 0) {
                pos.setXYZ(i, 0, 0, 0);
            } else {
                let yOffset = exagShift;
                if (applyBcu && uvAttr) {
                    const u = uvAttr.getX(i);
                    const v = uvAttr.getY(i);
                    yOffset += sampleBcuTexture(u, v) * bcuIntensity;
                }
                pos.setXYZ(i, rx, ry + yOffset, rz);
            }
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
        const _override = DEFAULT_LAYER_OVERRIDES[h.name];
        layerState[h.name] = {
            visible: _storedLayer?.visible ?? (_override?.visible ?? false),
            opacity: _storedLayer?.opacity ?? (_override?.opacity ?? 1.0),
        };

        // Initialise scene from stored state
        const _ls = layerState[h.name];
        allSurveyChildren().forEach(c => {
            if (c.userData.layerName === h.name) {
                if (c.userData.isContour) {
                    c.userData.layerVisible = _ls.visible;
                    c.visible = _ls.visible && params.showContours;
                } else {
                    c.visible = _ls.visible;
                    if (!c.userData.isHorizonDots) {
                        c.material.opacity = _ls.opacity;
                        c.material.transparent = _ls.opacity < 1;
                        c.material.depthWrite = _ls.opacity >= 1;
                        c.material.needsUpdate = true;
                    }
                }
            }
        });

        folder.add(layerState[h.name], 'visible').onChange(v => {
            allSurveyChildren().forEach(c => {
                if (c.userData.layerName === h.name) {
                    if (c.userData.isContour) { c.userData.layerVisible = v; c.visible = v && params.showContours; }
                    else if (c.userData.isHorizonDots) { c.visible = v && params.showHorizonDots; }
                    else if (c.userData.isHorizon) { c.visible = v; }
                    else { c.visible = v; }
                }
            });
            // Rebuild 3D dots when horizon visibility changes (pairs depend on which horizons are visible)
            if (params.show3DDots) rebuild3DDots();
            try { localStorage.setItem('geo_layer_' + h.name, JSON.stringify(layerState[h.name])); } catch(e) {}
        });

        folder.add(layerState[h.name], 'opacity', 0, 1).onChange(v => {
            allSurveyChildren().forEach(c => {
                if (c.userData.layerName === h.name && !c.userData.isHorizonDots) {
                    c.material.opacity = v;
                    c.material.transparent = v < 1;
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
            layerState[f.name] = { visible: _storedFault?.visible ?? false, opacity: _storedFault?.opacity ?? 0.75 };

            allSurveyChildren().forEach(c => {
                if (c.userData.layerName === f.name) {
                    c.visible = layerState[f.name].visible;
                    if (c.material) { c.material.transparent = true; c.material.opacity = 0.75; }
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
                } else if (c.userData.isHorizonDots) {
                    c.visible = s.visible && params.showHorizonDots;
                } else if (c.userData.isThreeDDots) {
                    c.visible = params.show3DDots;  // 3D dots visibility is global, not per-layer
                } else if (c.userData.isHorizon) {
                    c.visible = s.visible;
                    if (!c.userData.isHorizonDots) {
                        const op = s.opacity !== undefined ? s.opacity : 1;
                        c.material.opacity = op;
                        c.material.transparent = op < 1;
                        c.material.depthWrite = op >= 1;
                        c.material.needsUpdate = true;
                    }
                } else {
                    c.visible = s.visible;
                    const op = s.opacity !== undefined ? s.opacity : 1;
                    c.material.opacity = op;
                    c.material.transparent = op < 1;
                    c.material.depthWrite = op >= 1;
                    c.material.needsUpdate = true;
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
        if (!c.userData.isContour && !c.userData.isRegionalContour && !c.userData.isHorizonBBox) {
            c.material.wireframe = params.wireframe;
            c.material.depthWrite = !params.wireframe;
        }
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

    // Surface grid extras
    if (surfaceGridMesh) {
        surfaceGridMesh.visible = params.surfaceGridVisible && params.surfaceGridOpacity > 0;
        surfaceGridMesh.material.opacity = params.surfaceGridOpacity;
        surfaceGridMesh.material.wireframe = params.surfaceGridWireframe;
        surfaceGridMesh.material.color.set(params.surfaceGridColor);
        surfaceGridMesh.position.y = Number(params.surfaceGridHeightOffsetM) || 0;
        surfaceGridMesh.material.needsUpdate = true;
    }

    // Seismic crossline panel
    if (seismicPanel) {
        seismicPanel.visible = params.seismicPanelVisible;
        seismicPanel.material.opacity = params.seismicPanelOpacity;
        seismicPanel.material.needsUpdate = true;
    }
    if (crosslinePane) {
        crosslinePane.visible = params.crosslinePaneVisible;
        crosslinePane.material.opacity = params.crosslinePaneOpacity;
        crosslinePane.material.color.set(params.crosslinePaneColor);
        crosslinePane.material.needsUpdate = true;
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

    // Keep key regional visibility toggles persistent independent of preset state.
    persistRegionalContextVisibilityToStorage();
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
    _refreshFlythroughPresetDropdowns();
}

// ═══════════════════════════════════════════════════════════════
//  CAMERA FLYTHROUGH ANIMATION ENGINE
// ═══════════════════════════════════════════════════════════════

// ── Easing functions (t in [0,1] → [0,1]) ──────────────────────────────────
const _flythroughEasings = {
    linear:           t => t,
    easeInQuad:       t => t * t,
    easeOutQuad:      t => t * (2 - t),
    easeInOutQuad:    t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic:      t => t * t * t,
    easeOutCubic:     t => (--t) * t * t + 1,
    easeInOutCubic:   t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    easeInQuart:      t => t * t * t * t,
    easeOutQuart:     t => 1 - (--t) * t * t * t,
    easeInOutQuart:   t => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
    easeInQuint:      t => t * t * t * t * t,
    easeOutQuint:     t => 1 + (--t) * t * t * t * t,
    easeInOutQuint:   t => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t,
    easeInOutBack:    t => {
        const c1 = 1.70158, c2 = c1 * 1.525;
        return t < 0.5
            ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
            : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
    },
    easeInOutElastic: t => {
        const c5 = (2 * Math.PI) / 4.5;
        if (t === 0 || t === 1) return t;
        return t < 0.5
            ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
            :  (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
    },
};

// ── Animation state ─────────────────────────────────────────────────────────
let _flyAnim = null;  // { startCam, endCam, startTime, durationMs, easingFn, loop, direction }

/**
 * Start a camera flythrough animation between two camera states.
 * @param {Object} startCam - { px, py, pz, tx, ty, tz }
 * @param {Object} endCam   - { px, py, pz, tx, ty, tz }
 * @param {number} durationSec
 * @param {string} easingName
 * @param {boolean} loop - if true, ping-pong between start and end
 */
function startCameraFlythrough(startCam, endCam, durationSec, easingName, loop = false) {
    const easingFn = _flythroughEasings[easingName] || _flythroughEasings.easeInOutCubic;
    // Snap camera to start position first
    camera.position.set(startCam.px, startCam.py, startCam.pz);
    controls.target.set(startCam.tx, startCam.ty, startCam.tz);
    controls.update();

    // Convert camera positions to spherical coords relative to their targets
    // for smooth orbital interpolation
    const startOffset = new THREE.Vector3(
        startCam.px - startCam.tx,
        startCam.py - startCam.ty,
        startCam.pz - startCam.tz
    );
    const endOffset = new THREE.Vector3(
        endCam.px - endCam.tx,
        endCam.py - endCam.ty,
        endCam.pz - endCam.tz
    );

    const startSpherical = new THREE.Spherical().setFromVector3(startOffset);
    const endSpherical   = new THREE.Spherical().setFromVector3(endOffset);

    _flyAnim = {
        startCam,
        endCam,
        startSpherical,
        endSpherical,
        startTime: performance.now() + 1000, // 1s delay before motion begins
        durationMs: durationSec * 1000,
        easingFn,
        loop,
        direction: 1,  // 1 = forward, -1 = reverse (for ping-pong)
    };

    // Disable orbit controls during animation to prevent interference
    controls.enabled = false;

    // Hide all UI for clean screen recording
    hideAllUI();

    console.log(`🎬 Flythrough started: ${durationSec}s, easing=${easingName}, loop=${loop}`);
}

function stopCameraFlythrough() {
    if (!_flyAnim) return;
    _flyAnim = null;
    controls.enabled = true;

    // Restore UI after a brief delay for clean screen recording endings
    setTimeout(showAllUI, 1000);

    console.log('🎬 Flythrough stopped');
}

/**
 * Called every frame from animate(). Drives the flythrough interpolation.
 */
function _tickCameraFlythrough() {
    if (!_flyAnim) return;

    const { startCam, endCam, startSpherical, endSpherical, startTime, durationMs, easingFn, loop, direction } = _flyAnim;
    const elapsed = performance.now() - startTime;
    let rawT = Math.max(0, Math.min(elapsed / durationMs, 1.0));

    // Apply direction for ping-pong
    let t = direction === -1 ? 1 - rawT : rawT;
    // Apply easing
    const eased = easingFn(t);

    // Interpolate orbit target (LERP in world space)
    const tx = startCam.tx + (endCam.tx - startCam.tx) * eased;
    const ty = startCam.ty + (endCam.ty - startCam.ty) * eased;
    const tz = startCam.tz + (endCam.tz - startCam.tz) * eased;

    // Interpolate camera position in spherical coordinates for smooth orbital motion
    const radius = startSpherical.radius + (endSpherical.radius - startSpherical.radius) * eased;
    const phi    = startSpherical.phi    + (endSpherical.phi    - startSpherical.phi)    * eased;

    // Handle theta wrapping to always take the shortest rotational path
    let dTheta = endSpherical.theta - startSpherical.theta;
    if (dTheta > Math.PI)  dTheta -= 2 * Math.PI;
    if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
    const theta = startSpherical.theta + dTheta * eased;

    const interpSpherical = new THREE.Spherical(radius, phi, theta);
    const offset = new THREE.Vector3().setFromSpherical(interpSpherical);

    camera.position.set(tx + offset.x, ty + offset.y, tz + offset.z);
    controls.target.set(tx, ty, tz);
    controls.update();



    // Check completion
    if (rawT >= 1.0) {
        if (loop) {
            // Ping-pong: reverse direction and restart timer
            _flyAnim.direction = direction * -1;
            _flyAnim.startTime = performance.now();
        } else {
            // Animation complete — snap to end state
            camera.position.set(endCam.px, endCam.py, endCam.pz);
            controls.target.set(endCam.tx, endCam.ty, endCam.tz);
            controls.update();
            stopCameraFlythrough();
        }
    }
}

// ── ESC key to cancel flythrough ────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _flyAnim) {
        stopCameraFlythrough();
    }
});

// ── Easing curve preview canvas ─────────────────────────────────────────────
function _drawEasingPreview(easingName) {
    const container = document.getElementById('flythroughEasingPreview');
    if (!container) return;
    const canvas = container.querySelector('canvas');
    if (!canvas) return;

    // Set canvas size to match container
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    const easingFn = _flythroughEasings[easingName] || _flythroughEasings.easeInOutCubic;

    // Draw subtle grid
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5);
    ctx.moveTo(w * 0.5, 0); ctx.lineTo(w * 0.5, h);
    ctx.stroke();

    // Draw diagonal reference (linear)
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(8, h - 8);
    ctx.lineTo(w - 8, 8);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw easing curve
    const pad = 8;
    const plotW = w - pad * 2;
    const plotH = h - pad * 2;
    const steps = Math.max(100, Math.round(plotW));

    ctx.strokeStyle = '#42a5f5';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(66, 165, 245, 0.4)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const val = easingFn(t);
        const x = pad + t * plotW;
        const y = h - pad - val * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw endpoints
    ctx.fillStyle = '#64b5f6';
    ctx.beginPath(); ctx.arc(pad, h - pad, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w - pad, pad, 3, 0, Math.PI * 2); ctx.fill();
}

// ── Flythrough preset dropdown population ───────────────────────────────────
function _refreshFlythroughPresetDropdowns() {
    const startSel = document.getElementById('flythroughStartPreset');
    const endSel   = document.getElementById('flythroughEndPreset');
    if (!startSel || !endSel) return;

    // Build list: presets with camera data + "Current View"
    const options = [];
    options.push({ value: '__current__', label: '📍 Current View' });
    Object.keys(savedPresets).forEach(name => {
        const p = savedPresets[name];
        if (p && p.camera) {
            options.push({ value: name, label: name });
        }
    });

    const prevStart = startSel.value;
    const prevEnd   = endSel.value;

    startSel.innerHTML = '';
    endSel.innerHTML = '';
    options.forEach(o => {
        const opt1 = document.createElement('option');
        opt1.value = o.value;
        opt1.textContent = o.label;
        startSel.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = o.value;
        opt2.textContent = o.label;
        endSel.appendChild(opt2);
    });

    // Restore previous selections if still valid
    if (options.some(o => o.value === prevStart)) startSel.value = prevStart;
    if (options.some(o => o.value === prevEnd))   endSel.value = prevEnd;

    // Default: start = current view, end = first preset with camera data (if any)
    if (!prevStart) startSel.value = '__current__';
    if (!prevEnd && options.length > 1) endSel.value = options[1].value;
}

function _getCameraFromSelection(value) {
    if (value === '__current__') {
        return {
            px: camera.position.x, py: camera.position.y, pz: camera.position.z,
            tx: controls.target.x, ty: controls.target.y, tz: controls.target.z
        };
    }
    const preset = savedPresets[value];
    return preset?.camera || null;
}

// ── Wire up flythrough UI ───────────────────────────────────────────────────
let _flythroughUIWired = false;
function _wireFlythroughUI() {
    if (_flythroughUIWired) return;
    _flythroughUIWired = true;

    const btnFlythrough = document.getElementById('btnFlythrough');
    const easingSelect  = document.getElementById('flythroughEasing');

    // Open modal or stop animation
    btnFlythrough.addEventListener('click', () => {
        if (_flyAnim) {
            stopCameraFlythrough();
            return;
        }
        _refreshFlythroughPresetDropdowns();
        document.getElementById('flythroughModal').style.display = 'flex';
        // Draw initial easing preview
        requestAnimationFrame(() => _drawEasingPreview(easingSelect.value));
    });

    // Redraw preview when easing changes
    easingSelect.addEventListener('change', () => {
        _drawEasingPreview(easingSelect.value);
    });

    // Play button
    document.getElementById('confirmFlythrough').addEventListener('click', () => {
        const startVal = document.getElementById('flythroughStartPreset').value;
        const endVal   = document.getElementById('flythroughEndPreset').value;
        const duration = Math.max(0.5, Math.min(60, parseFloat(document.getElementById('flythroughDuration').value) || 3));
        const easing   = easingSelect.value;
        const loop     = document.getElementById('flythroughLoop').checked;

        const startCam = _getCameraFromSelection(startVal);
        const endCam   = _getCameraFromSelection(endVal);

        if (!startCam || !endCam) {
            return alert('Selected presets do not have saved camera positions.');
        }

        if (startVal === endVal && startVal !== '__current__') {
            return alert('Start and end presets are the same. Choose different presets.');
        }

        closeModal('flythroughModal');
        startCameraFlythrough(startCam, endCam, duration, easing, loop);
    });
}

// Wire once DOM is ready (styles + HTML already appended above)
_wireFlythroughUI();

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
let surfaceGridMesh = null;

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

    // Helper: gather ALL transformed vertices from a base mesh (includes interpolated/gap-filled)
    function gatherBaseVerts(layerName, surveyGroup) {
        const mesh = surveyGroup.children.find(m =>
            m.userData.isHorizon && m.userData.layerName === layerName && !m.userData.isContour);
        if (!mesh) return [];
        surveyGroup.updateMatrix();
        const mat4 = surveyGroup.matrix;
        const rawPos = mesh.userData.rawHorizonPos;
        const vertCount = rawPos.length / 3;
        const verts = [];
        const _v = new THREE.Vector3();
        for (let i = 0; i < vertCount; i++) {
            const rx = rawPos[i*3], ry = rawPos[i*3+1], rz = rawPos[i*3+2];
            // Skip invalid placeholder vertices (0,0,0) from unfilled grid cells
            if (rx === 0 && ry === 0 && rz === 0) continue;
            _v.set(rx, ry, rz);
            _v.applyMatrix4(mat4);
            verts.push({ x: _v.x, y: _v.y, z: _v.z });
        }
        console.log(`gatherBaseVerts(${layerName}): ${verts.length} valid / ${vertCount} total vertices`);
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
    regionalMesh.visible = params.regionalVisible && params.regionalOpacity > 0;
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

// ── Flat surface grid at well top depth ─────────────────────────────────────
// Covers the exact XZ footprint of the regional context mesh.
// Y is set to the wellGroup's current Y position (TVD=0 in well-local space).
function buildSurfaceGrid() {
    // Remove any previous grid
    if (surfaceGridMesh) {
        modelGroup.remove(surfaceGridMesh);
        surfaceGridMesh.geometry.dispose();
        surfaceGridMesh.material.dispose();
        surfaceGridMesh = null;
    }
    if (!regionalMesh) { console.warn('buildSurfaceGrid: no regionalMesh loaded'); return; }

    const { rxArr, rzArr } = regionalMesh.userData;
    // Find the XZ bounding box of the regional mesh
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < rxArr.length; i++) {
        if (rxArr[i] < minX) minX = rxArr[i];
        if (rxArr[i] > maxX) maxX = rxArr[i];
        if (rzArr[i] < minZ) minZ = rzArr[i];
        if (rzArr[i] > maxZ) maxZ = rzArr[i];
    }
    const width  = maxX - minX;
    const height = maxZ - minZ;
    const SUBDIVS = 100; // grid resolution

    // Well top depth: TVD=0 in well-local space → wellGroup.position.y in model space
    const gridY = wellGroup.position.y;

    const geo = new THREE.PlaneGeometry(width, height, SUBDIVS, SUBDIVS);
    // PlaneGeometry is XY by default — rotate to lie flat (XZ plane) then position
    geo.rotateX(-Math.PI / 2);
    // Shift so it covers [minX..maxX] × [minZ..maxZ] at the well top depth
    geo.translate((minX + maxX) / 2, gridY, (minZ + maxZ) / 2);

    const mat = new THREE.MeshPhongMaterial({
        color: params.surfaceGridColor,
        transparent: true,
        opacity: params.surfaceGridOpacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        wireframe: params.surfaceGridWireframe,
        shininess: 10,
    });

    surfaceGridMesh = new THREE.Mesh(geo, mat);
    surfaceGridMesh.userData.isSurfaceGrid = true;
    surfaceGridMesh.visible = params.surfaceGridVisible && params.surfaceGridOpacity > 0;
    surfaceGridMesh.position.y = Number(params.surfaceGridHeightOffsetM) || 0;
    modelGroup.add(surfaceGridMesh);
    console.log(`Surface grid built: ${width.toFixed(0)} × ${height.toFixed(0)} m at Y=${gridY.toFixed(1)}`);
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
        m.userData.isHorizonDots ||
        m.userData.isThreeDDots ||
        !(m instanceof THREE.Mesh)
    );

    const usingSemMap  = params.selectedColormap === 'SEM Map';
    const usingSpecD   = params.selectedColormap === 'Spec-D';
    const usingTexture = usingSemMap || usingSpecD;

    // ── First, clear any per-layer texture from ALL meshes (in case we're switching away) ──
    allSurveyChildren().forEach(mesh => {
        if (skip(mesh)) return;
        if (mesh.material.map) {
            // Only clear textures we manage (SEM or SpecD)
            const textureKey = getMeshTextureKey(mesh);
            if (semMapTextures[textureKey] === mesh.material.map ||
                specDTextures[textureKey] === mesh.material.map) {
                mesh.material.map = null;
                mesh.material.needsUpdate = true;
            }
        }
    });

    if (usingTexture && params.colorByDepth) {
        // ── Texture mode: apply per-layer texture to any mapped survey horizon, depth-colour the rest ──
        const texMap = usingSpecD ? specDTextures : semMapTextures;

        // Apply per-layer texture to mapped horizon meshes
        allSurveyChildren().forEach(mesh => {
            if (skip(mesh)) return;
            if (!mesh.userData.isHorizon) return;
            const tex = texMap[getMeshTextureKey(mesh)];
            if (tex) {
                mesh.material.vertexColors = false;
                mesh.material.map = tex;
                mesh.material.color.set(0xffffff);
                mesh.material.needsUpdate = true;
            }
        });

        // Depth-colour non-textured meshes with fallback colormap
        let minZ = Infinity, maxZ = -Infinity;
        allSurveyChildren().forEach(mesh => {
            if (skip(mesh) || texMap[getMeshTextureKey(mesh)]) return;
            const pos = mesh.geometry.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const y = pos.getY(i);
                if (!isNaN(y) && y !== 0) { if (y < minZ) minZ = y; if (y > maxZ) maxZ = y; }
            }
        });
        const range = maxZ - minZ || 1;
        allSurveyChildren().forEach(mesh => {
            if (skip(mesh) || texMap[getMeshTextureKey(mesh)]) return;
            const pos = mesh.geometry.attributes.position;
            const count = pos.count;
            const colors = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
                const t = (pos.getY(i) - minZ) / range;
                const c = getColormapColor('Warm', t);
                colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
            }
            mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            mesh.material.vertexColors = true;
            mesh.material.color.set(0xffffff);
            mesh.material.needsUpdate = true;
        });

    } else if (params.colorByDepth) {
        if (params.depthColorPerLayer) {
            // ── Per-layer mode: each horizon coloured relative to its own depth extents ──
            allSurveyChildren().forEach(mesh => {
                if (skip(mesh)) return;
                const pos = mesh.geometry.attributes.position;
                const count = pos.count;
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

    // Refresh dots if visible so they pick up the new colors
    if (params.showHorizonDots) {
        const hasDots = allSurveyChildren().some(c => c.userData.isHorizonDots);
        if (hasDots) rebuildHorizonDots();
    }
    // Refresh 3D dots too
    if (params.show3DDots) {
        const has3D = allSurveyChildren().some(c => c.userData.isThreeDDots);
        if (has3D) rebuild3DDots();
    }
}

// ── Horizon Dots Mode ──────────────────────────────────────────────────────
// Renders each horizon as a cloud of small spheres at grid vertices,
// allowing well targets underneath to be visible through the gaps.

function rebuildHorizonDots() {
    // Remove any existing dots meshes
    allSurveyChildren().forEach(c => {
        if (c.userData.isHorizonDots) {
            c.geometry.dispose();
            c.material.dispose();
            c.parent.remove(c);
        }
    });

    const dotGeo = new THREE.SphereGeometry(params.horizonDotSize, 6, 6);
    const skip = Math.max(1, Math.round(params.horizonDotSkip));
    const dummy = new THREE.Object3D();
    const yCompensation = 1 / (params.zScale || 1);

    allSurveyChildren().forEach(mesh => {
        if (!mesh.userData.isHorizon || mesh.userData.isContour) return;

        const posArr = mesh.geometry.attributes.position.array;
        const vertCount = posArr.length / 3;

        // Collect dot positions — one dot per mesh vertex (skip every Nth)
        let rawPositions = [];
        let rawIndices = [];

        for (let i = 0; i < vertCount; i += skip) {
            const x = posArr[i * 3], y = posArr[i * 3 + 1], z = posArr[i * 3 + 2];
            // Skip degenerate/gap-filled vertices at origin
            if (x === 0 && y === 0 && z === 0) continue;
            rawPositions.push(x, y, z);
            rawIndices.push(i);
        }

        // Outlier clamp: discard vertices whose Y is far from the bulk
        const rawCount = rawPositions.length / 3;
        if (rawCount > 10) {
            const ys = [];
            for (let d = 0; d < rawCount; d++) ys.push(rawPositions[d * 3 + 1]);
            ys.sort((a, b) => a - b);
            const q1 = ys[Math.floor(rawCount * 0.25)];
            const q3 = ys[Math.floor(rawCount * 0.75)];
            const iqr = q3 - q1;
            const lo = q1 - 3 * iqr;
            const hi = q3 + 3 * iqr;
            const positions = [];
            const vertexIndices = [];
            for (let d = 0; d < rawCount; d++) {
                const y = rawPositions[d * 3 + 1];
                if (y >= lo && y <= hi) {
                    positions.push(rawPositions[d * 3], y, rawPositions[d * 3 + 2]);
                    vertexIndices.push(rawIndices[d]);
                }
            }
            rawPositions = positions;
            rawIndices = vertexIndices;
        }
        const positions = rawPositions;
        const vertexIndices = rawIndices;

        const dotCount = positions.length / 3;
        if (dotCount === 0) return;

        // Use the horizon's current material color
        const color = mesh.material.color.clone();
        const dotMat = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color.clone().multiplyScalar(0.1),
            shininess: 40,
        });

        const instanced = new THREE.InstancedMesh(dotGeo, dotMat, dotCount);
        for (let d = 0; d < dotCount; d++) {
            dummy.position.set(positions[d * 3], positions[d * 3 + 1], positions[d * 3 + 2]);
            dummy.scale.set(1, yCompensation, 1);
            dummy.updateMatrix();
            instanced.setMatrixAt(d, dummy.matrix);
        }
        instanced.instanceMatrix.needsUpdate = true;

        // Colour dots — per-layer texture sampling for mapped survey meshes, or vertex colors for depth
        const isSemDots  = params.selectedColormap === 'SEM Map';
        const isSpecDots = params.selectedColormap === 'Spec-D';
        const canvasMap = isSemDots ? semMapCanvases : isSpecDots ? specDCanvases : null;
        const layerCanvas = canvasMap ? canvasMap[getMeshTextureKey(mesh)] : null;
        const useTextureDots = (isSemDots || isSpecDots)
            && params.colorByDepth
            && layerCanvas;

        if (useTextureDots) {
            // Sample per-layer texture image at each vertex's UV coordinate
            const uvAttr = mesh.geometry.attributes.uv;
            const instanceColor = new THREE.Color();
            const { canvas: texCanvas, ctx: texCtx } = layerCanvas;
            const w = texCanvas.width, h = texCanvas.height;
            for (let d = 0; d < dotCount; d++) {
                const srcIdx = vertexIndices[d];
                if (uvAttr && srcIdx < uvAttr.count) {
                    const u = uvAttr.getX(srcIdx);
                    const v = uvAttr.getY(srcIdx);
                    // UV (0,0) = bottom-left in Three.js; canvas (0,0) = top-left
                    const px = Math.min(Math.floor(u * w), w - 1);
                    const py = Math.min(Math.floor((1 - v) * h), h - 1);
                    const pixel = texCtx.getImageData(px, py, 1, 1).data;
                    instanceColor.setRGB(pixel[0] / 255, pixel[1] / 255, pixel[2] / 255);
                    instanced.setColorAt(d, instanceColor);
                }
            }
            if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
            // Use white base so instance colors show through
            dotMat.color.set(0xffffff);
            dotMat.emissive.set(0x000000);
        } else if (mesh.geometry.attributes.color) {
            // Use vertex colors from depth coloring
            const srcColors = mesh.geometry.attributes.color.array;
            const instanceColor = new THREE.Color();
            for (let d = 0; d < dotCount; d++) {
                const srcIdx = vertexIndices[d];
                if (srcIdx * 3 + 2 < srcColors.length) {
                    instanceColor.setRGB(srcColors[srcIdx * 3], srcColors[srcIdx * 3 + 1], srcColors[srcIdx * 3 + 2]);
                    instanced.setColorAt(d, instanceColor);
                }
            }
            if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
        }

        instanced.userData = {
            isHorizonDots: true,
            layerName: mesh.userData.layerName,
            survey: mesh.userData.survey,
        };

        // Visibility: only show if dots enabled AND layer is visible
        const ls = layerState[mesh.userData.layerName];
        instanced.visible = params.showHorizonDots && (ls ? ls.visible : true);

        // Add to same parent group
        mesh.parent.add(instanced);
    });

    dotGeo.dispose(); // shared geometry already cloned into each InstancedMesh
    console.log('Horizon dots rebuilt');
}

function toggleHorizonDots(show) {
    allSurveyChildren().forEach(c => {
        if (c.userData.isHorizonDots) {
            const ls = layerState[c.userData.layerName];
            c.visible = show && (ls ? ls.visible : true);
        }
    });

    // Build dots on first enable (or if they were cleaned up)
    if (show) {
        const hasDots = allSurveyChildren().some(c => c.userData.isHorizonDots);
        if (!hasDots) rebuildHorizonDots();
    }
}

// ── 3D Dot Mode ────────────────────────────────────────────────────────────
// Fills vertical dot columns between adjacent visible horizons on the same
// survey, using the same grid spacing as the normalised horizons.

function rebuild3DDots() {
    // 1. Remove any existing 3D dot meshes
    allSurveyChildren().forEach(c => {
        if (c.userData.isThreeDDots) {
            c.geometry.dispose();
            c.material.dispose();
            c.parent.remove(c);
        }
    });

    const dotGeo = new THREE.SphereGeometry(params.threeDDotSize, 6, 6);
    const dummy = new THREE.Object3D();
    const yCompensation = 1 / (params.zScale || 1);

    // Process each survey group independently
    [norneSurveyGroup, volveSurveyGroup].forEach(group => {
        // Collect visible horizon meshes in this survey
        const horizons = [];
        group.children.forEach(c => {
            if (!c.userData.isHorizon || c.userData.isContour ||
                c.userData.isHorizonDots || c.userData.isThreeDDots) return;
            const ls = layerState[c.userData.layerName];
            if (ls && !ls.visible) return;
            horizons.push(c);
        });

        if (horizons.length < 2) return;

        // Sort by average Y (ascending — most negative = deepest first, so shallowest last)
        horizons.sort((a, b) => {
            const avgY = mesh => {
                const pos = mesh.geometry.attributes.position;
                let sum = 0, cnt = 0;
                for (let i = 0; i < pos.count; i++) {
                    const y = pos.getY(i);
                    if (y !== 0) { sum += y; cnt++; }
                }
                return cnt > 0 ? sum / cnt : 0;
            };
            return avgY(b) - avgY(a);  // b-a so shallowest (highest Y) first
        });

        // Compute average horizontal grid cell spacing from the first horizon
        const refMesh = horizons[0];
        const refPos = refMesh.geometry.attributes.position;
        let cellSpacingSum = 0, cellSpacingCnt = 0;
        for (let i = 0; i < refPos.count - 1; i++) {
            const x0 = refPos.getX(i), z0 = refPos.getZ(i);
            const x1 = refPos.getX(i + 1), z1 = refPos.getZ(i + 1);
            if (x0 === 0 && z0 === 0) continue;
            if (x1 === 0 && z1 === 0) continue;
            const dx = x1 - x0, dz = z1 - z0;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 0 && dist < 500) { // reasonable cell size
                cellSpacingSum += dist;
                cellSpacingCnt++;
            }
            if (cellSpacingCnt > 50) break; // enough samples
        }
        const gridSpacing = cellSpacingCnt > 0 ? cellSpacingSum / cellSpacingCnt : 50;
        const vertSpacing = gridSpacing / Math.max(0.1, params.threeDDotDensity);

        // For each consecutive pair of horizons
        for (let hi = 0; hi < horizons.length - 1; hi++) {
            const upper = horizons[hi];     // shallowest (higher Y)
            const lower = horizons[hi + 1]; // deeper (lower Y)

            const upperPos = upper.geometry.attributes.position;
            const lowerPos = lower.geometry.attributes.position;

            // Both horizons must share the same vertex count (same grid)
            const vertCount = Math.min(upperPos.count, lowerPos.count);

            // ── Determine color source for each horizon ──
            // Texture modes (SEM Map / Spec-D): sample the per-layer offscreen canvas
            // Depth coloring: use vertex color attribute
            // Otherwise: use original horizon material color
            const isSem  = params.selectedColormap === 'SEM Map';
            const isSpec = params.selectedColormap === 'Spec-D';
            const canvasMap = isSem ? semMapCanvases : isSpec ? specDCanvases : null;

            const upperCanvas  = canvasMap ? canvasMap[getMeshTextureKey(upper)] : null;
            const lowerCanvas  = canvasMap ? canvasMap[getMeshTextureKey(lower)] : null;
            const useUpperTex  = (isSem || isSpec) && params.colorByDepth && upperCanvas;
            const useLowerTex  = (isSem || isSpec) && params.colorByDepth && lowerCanvas;

            const upperHasColors = upper.geometry.attributes.color;
            const lowerHasColors = lower.geometry.attributes.color;
            const upperUV = upper.geometry.attributes.uv;
            const lowerUV = lower.geometry.attributes.uv;

            // Original (non-white) horizon color for fallback
            const upperOrigColor = new THREE.Color(upper.userData.originalColor || 0xffffff);
            const lowerOrigColor = new THREE.Color(lower.userData.originalColor || 0xffffff);

            // Gather all dot positions and colors
            const positions = [];
            const colors = [];
            const tempColorUpper = new THREE.Color();
            const tempColorLower = new THREE.Color();
            const tempColorBlend = new THREE.Color();

            // Helper: sample color from a canvas at UV coords
            function sampleCanvas(canvasObj, uvAttr, vertIdx, outColor) {
                if (!canvasObj || !uvAttr || vertIdx >= uvAttr.count) return false;
                const { canvas: texCanvas, ctx: texCtx } = canvasObj;
                const w = texCanvas.width, h = texCanvas.height;
                const u = uvAttr.getX(vertIdx);
                const v = uvAttr.getY(vertIdx);
                const px = Math.min(Math.floor(u * w), w - 1);
                const py = Math.min(Math.floor((1 - v) * h), h - 1);
                const pixel = texCtx.getImageData(px, py, 1, 1).data;
                outColor.setRGB(pixel[0] / 255, pixel[1] / 255, pixel[2] / 255);
                return true;
            }

            for (let i = 0; i < vertCount; i++) {
                const ux = upperPos.getX(i), uy = upperPos.getY(i), uz = upperPos.getZ(i);
                const lx = lowerPos.getX(i), ly = lowerPos.getY(i), lz = lowerPos.getZ(i);

                // Skip if either vertex is invalid (0,0,0)
                if (ux === 0 && uy === 0 && uz === 0) continue;
                if (lx === 0 && ly === 0 && lz === 0) continue;

                // Use upper vertex's XZ position (horizons share the same grid)
                const dotX = ux;
                const dotZ = uz;

                // Vertical range (upper.y > lower.y since upper is shallower)
                const yTop = uy;
                const yBot = ly;
                if (yTop <= yBot) continue; // skip if upper isn't actually above lower here

                const span = yTop - yBot;
                const nSteps = Math.max(1, Math.round(span / vertSpacing));

                // Get upper color — texture → vertex colors → original color
                if (useUpperTex) {
                    if (!sampleCanvas(upperCanvas, upperUV, i, tempColorUpper)) {
                        tempColorUpper.copy(upperOrigColor);
                    }
                } else if (upperHasColors) {
                    const ca = upperHasColors.array;
                    tempColorUpper.setRGB(ca[i * 3], ca[i * 3 + 1], ca[i * 3 + 2]);
                } else {
                    tempColorUpper.copy(upperOrigColor);
                }

                // Get lower color — texture → vertex colors → original color
                if (useLowerTex) {
                    if (!sampleCanvas(lowerCanvas, lowerUV, i, tempColorLower)) {
                        tempColorLower.copy(lowerOrigColor);
                    }
                } else if (lowerHasColors) {
                    const ca = lowerHasColors.array;
                    tempColorLower.setRGB(ca[i * 3], ca[i * 3 + 1], ca[i * 3 + 2]);
                } else {
                    tempColorLower.copy(lowerOrigColor);
                }

                // Generate dots between horizons (excluding the horizon surfaces themselves)
                for (let s = 1; s < nSteps; s++) {
                    const t = s / nSteps;
                    const dotY = yTop + (yBot - yTop) * t;
                    positions.push(dotX, dotY, dotZ);

                    // Lerp color
                    tempColorBlend.copy(tempColorUpper).lerp(tempColorLower, t);
                    colors.push(tempColorBlend.r, tempColorBlend.g, tempColorBlend.b);
                }
            }

            const dotCount = positions.length / 3;
            if (dotCount === 0) continue;

            // Create InstancedMesh
            const dotMat = new THREE.MeshPhongMaterial({
                color: 0xffffff,
                shininess: 40,
            });

            const instanced = new THREE.InstancedMesh(dotGeo, dotMat, dotCount);
            for (let d = 0; d < dotCount; d++) {
                dummy.position.set(positions[d * 3], positions[d * 3 + 1], positions[d * 3 + 2]);
                dummy.scale.set(1, yCompensation, 1);
                dummy.updateMatrix();
                instanced.setMatrixAt(d, dummy.matrix);
            }
            instanced.instanceMatrix.needsUpdate = true;

            // Apply per-instance colors
            const instanceColor = new THREE.Color();
            for (let d = 0; d < dotCount; d++) {
                instanceColor.setRGB(colors[d * 3], colors[d * 3 + 1], colors[d * 3 + 2]);
                instanced.setColorAt(d, instanceColor);
            }
            if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;

            instanced.userData = {
                isThreeDDots: true,
                upperLayer: upper.userData.layerName,
                lowerLayer: lower.userData.layerName,
            };

            instanced.visible = params.show3DDots;
            group.add(instanced);
        }
    });

    dotGeo.dispose();
    console.log('3D dots rebuilt');
}

function toggle3DDots(show) {
    allSurveyChildren().forEach(c => {
        if (c.userData.isThreeDDots) {
            c.visible = show;
        }
    });

    // Build 3D dots on first enable (or if they were cleaned up)
    if (show) {
        const has3D = allSurveyChildren().some(c => c.userData.isThreeDDots);
        if (!has3D) rebuild3DDots();
    }
}


const vizFolder = gui.addFolder('Visualization');
_trackFolder(vizFolder, 'Visualization');

// Horizon dots controls (independent of solid mesh visibility)
vizFolder.add(params, 'showHorizonDots').name('Show Dots').onChange(v => {
    toggleHorizonDots(v);
});
vizFolder.add(params, 'horizonDotSize', 2, 30).name('Dot Size (m)').onChange(() => {
    if (params.showHorizonDots) rebuildHorizonDots();
});
vizFolder.add(params, 'horizonDotSkip', 1, 10, 1).name('Dot Skip').onChange(() => {
    if (params.showHorizonDots) rebuildHorizonDots();
});

// 3D Dot Mode controls (fill between horizons)
vizFolder.add(params, 'show3DDots').name('3D Dots').onChange(v => {
    toggle3DDots(v);
});
vizFolder.add(params, 'threeDDotSize', 2, 30).name('3D Dot Size (m)').onChange(() => {
    if (params.show3DDots) rebuild3DDots();
});
vizFolder.add(params, 'threeDDotDensity', 0.5, 4, 0.5).name('3D Dot Density').onChange(() => {
    if (params.show3DDots) rebuild3DDots();
});

vizFolder.add(params, 'zScale', 0.1, 10).name('Vertical Exaggeration').onChange(v => {
    modelGroup.scale.y = v;
    buildWellTrajectories(); // re-counter-scale spheres
    rebuildCustomTargets();
    rebuildCustomHorizonWells();
    rebuildCustomSurfaceNetworks();
});

vizFolder.add(params, 'wireframe').onChange((v) => {
    allSurveyChildren().forEach(c => {
        if (!c.userData.isContour && !c.userData.isRegionalContour && !c.userData.isHorizonBBox) {
            c.material.wireframe = v;
            c.material.depthWrite = !v;
        }
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

depthFolder.add(params, 'selectedColormap', [...Object.keys(ColormapRegistry), 'SEM Map', 'Spec-D']).name('Colormap').onChange(() => {
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
lightFolder.addColor(params, 'backgroundColor').name('Background').onChange(v => {
    scene.background = new THREE.Color(v);
});
// Apply initial background colour from (possibly restored) params
scene.background = new THREE.Color(params.backgroundColor);

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
    rebuildCustomTargets();
    rebuildCustomHorizonWells();
}
nornePosFolder.add(params, 'surveyOffsetEastKm', -30, 30, 0.5).name('East/West (km)').onChange(applyNorneSurveyOffset);
nornePosFolder.add(params, 'surveyOffsetNorthKm', -20, 20, 0.5).name('North/South (km)').onChange(applyNorneSurveyOffset);
nornePosFolder.add(params, 'surveyRotationDeg', -180, 180, 1).name('Rotation (°)').onChange(applyNorneSurveyOffset);
nornePosFolder.add(params, 'norneScale', 0.1, 5, 0.1).name('Scale').onChange(applyNorneSurveyOffset);
nornePosFolder.add(params, 'norneDepthOffsetM', -3000, 3000, 10).name('Depth Offset (m)').onChange(applyNorneSurveyOffset);
applyNorneSurveyOffset();
nornePosFolder.add(params, 'norneBBoxVisible').name('Footprint Box')
    .onChange(v => { if (horizonBBox) horizonBBox.visible = v; });
nornePosFolder.addColor(params, 'horizonBBoxColor').name('Box Color')
    .onChange(v => { if (horizonBBox) horizonBBox.material.color.set(v); if (volveBBox) volveBBox.material.color.set(v); });

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
    rebuildCustomTargets();
    rebuildCustomHorizonWells();
}
volvePosFolder.add(params, 'volveOffsetEastKm', -30, 30, 0.5).name('East/West (km)').onChange(applyVolveSurveyOffset);
volvePosFolder.add(params, 'volveOffsetNorthKm', -25, 25, 0.5).name('North/South (km)').onChange(applyVolveSurveyOffset);
volvePosFolder.add(params, 'volveRotationDeg', -180, 180, 1).name('Rotation (°)').onChange(applyVolveSurveyOffset);
volvePosFolder.add(params, 'volveScale', 0.1, 5, 0.1).name('Scale').onChange(applyVolveSurveyOffset);
volvePosFolder.add(params, 'volveDepthOffsetM', -3000, 3000, 10).name('Depth Offset (m)').onChange(applyVolveSurveyOffset);
applyVolveSurveyOffset();
volvePosFolder.add(params, 'volveBBoxVisible').name('Footprint Box')
    .onChange(v => { if (volveBBox) volveBBox.visible = v; });

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
    rebuildCustomHorizonWells();
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
wellTrajFolder.add(params, 'wellheadConeVisible').name('Wellhead Cone').onChange(v => {
    wellGroup.children.forEach(c => { if (c.userData.isWellheadCone) c.visible = v; });
});
wellTrajFolder.addColor(params, 'wellheadConeColor').name('Cone Color').onChange(() => buildWellTrajectories());
wellTrajFolder.add(params, 'wellheadConeScale', 0.2, 5, 0.1).name('Cone Scale').onChange(() => buildWellTrajectories());

const wellTargetFolder = wellFolder.addFolder('Targets');
wellTargetFolder.add(params, 'wellShowTargets').name('Show All Targets').onChange(() => buildWellTrajectories());
wellTargetFolder.add(params, 'showLat1Targets').name('Lat 1 Targets').onChange(() => buildWellTrajectories());
wellTargetFolder.add(params, 'showLat2Targets').name('Lat 2 Targets').onChange(() => buildWellTrajectories());
wellTargetFolder.addColor(params, 'wellTargetColor').name('Color').onChange(() => buildWellTrajectories());
wellTargetFolder.add(params, 'wellTargetSize', 10, 200, 5).name('Size (m)').onChange(() => buildWellTrajectories());
wellTargetFolder.add(params, 'wellTargetOpacity', 0.05, 0.8, 0.05).name('Opacity').onChange(() => buildWellTrajectories());
wellTargetFolder.add(params, 'lat1LP1Position', 0, 5, 0.1).name('LP1 Position').onChange(() => buildWellTrajectories());
wellTargetFolder.add(params, 'targetLP1YOffset', -300, 300, 5).name('LP1 Y Offset (m)').onChange(() => buildWellTrajectories());
wellTargetFolder.add(params, 'lat1BHLPosition', 0, 5, 0.1).name('BHL Position').onChange(() => buildWellTrajectories());
wellTargetFolder.add(params, 'targetBHLYOffset', -300, 300, 5).name('BHL Y Offset (m)').onChange(() => buildWellTrajectories());
wellTargetFolder.add(params, 'lat2LP2Position', 0, 4, 0.1).name('LP2 Position').onChange(() => buildWellTrajectories());
wellTargetFolder.add(params, 'targetLP2YOffset', -300, 300, 5).name('LP2 Y Offset (m)').onChange(() => buildWellTrajectories());

customTargetFolder = wellTargetFolder.addFolder('Custom Horizon Targets');
customTargetFolder.add(params, 'customTargetAddOnClick').name('Add On Horizon Right-Click');
customTargetFolder.addColor(params, 'customTargetColor').name('New Target Color');
customTargetFolder.add(params, 'customTargetSize', 5, 200, 1).name('New Target Size (m)');
customTargetFolder.add(params, 'customTargetOpacity', 0.05, 1.0, 0.05).name('New Target Opacity');
loadCustomTargetsFromStorage();

customHorizonWellFolder = wellFolder.addFolder('Custom Horizon Wells');
_trackFolder(customHorizonWellFolder, 'Custom Horizon Wells');
customHorizonWellFolder.addColor(params, 'customHorizonWellColor').name('New Well Color');
customHorizonWellFolder.add(params, 'customHorizonWellPathStyle', ['tube', 'dots', 'rings']).name('New Path Style');
customHorizonWellFolder.add(params, 'customHorizonWellDoglegSeverity', 1, 20, 0.1).name('New Dogleg Severity');
customHorizonWellFolder.add(params, 'customHorizonWellTubeRadius', 1, 30, 1).name('New Tube Radius (m)');
customHorizonWellFolder.add(params, 'customHorizonWellDotSize', 1, 15, 0.5).name('New Dot Size (m)');
customHorizonWellFolder.add(params, 'customHorizonWellDotSpacing', 5, 100, 1).name('New Dot Spacing (m)');
customHorizonWellFolder.addColor(params, 'customHorizonWellRingColor').name('New Ring Color');
customHorizonWellFolder.add(params, 'customHorizonWellRingOpacity', 0.05, 1, 0.05).name('New Ring Opacity');
customHorizonWellFolder.add(params, 'customHorizonWellRingSizingMode', ['uniform', 'grows_with_depth']).name('New Ring Sizing');
customHorizonWellFolder.add(params, 'customHorizonWellRingSize', 1, 200, 1).name('New Ring Size (m)');
customHorizonWellFolder.add(params, 'customHorizonWellRingStartSize', 1, 200, 1).name('New Ring Start Size (m)');
customHorizonWellFolder.add(params, 'customHorizonWellRingEndSize', 1, 200, 1).name('New Ring End Size (m)');
customHorizonWellFolder.add(params, 'customHorizonWellRingSpacing', 1, 200, 1).name('New Ring Spacing (m)');
customHorizonWellFolder.add(params, 'customHorizonWellheadVisible').name('New Show Wellhead');
customHorizonWellFolder.add(params, 'customHorizonWellheadScale', 0.2, 5, 0.1).name('New Wellhead Scale');
loadCustomHorizonWellsFromStorage();

customSurfaceNetworkFolder = wellFolder.addFolder('Custom Surface Networks');
_trackFolder(customSurfaceNetworkFolder, 'Custom Surface Networks');
loadCustomSurfaceNetworksFromStorage();
customTieBackLineFolder = customSurfaceNetworkFolder.addFolder('Custom Tie Back Lines');
_trackFolder(customTieBackLineFolder, 'Custom Tie Back Lines');
loadCustomTieBackLinesFromStorage();

initializeCustomActionHistory();



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
    if (regionalMesh) {
        regionalMesh.material.wireframe = v;
        regionalMesh.material.depthWrite = !v;
        regionalMesh.material.needsUpdate = true;
    }
});

// ── Surface Grid sub-folder ──────────────────────────────────────────────────
const surfaceGridFolder = regionalFolder.addFolder('Surface Grid');
_trackFolder(surfaceGridFolder, 'Surface Grid');
surfaceGridFolder.add(params, 'surfaceGridVisible').name('Show').onChange(v => {
    if (surfaceGridMesh) surfaceGridMesh.visible = v && params.surfaceGridOpacity > 0;
    persistRegionalContextVisibilityToStorage();
});
surfaceGridFolder.add(params, 'surfaceGridHeightOffsetM', -10000, 10000, 10).name('Height (m)').onChange(v => {
    if (surfaceGridMesh) {
        surfaceGridMesh.position.y = Number(v) || 0;
    }
});
surfaceGridFolder.add(params, 'surfaceGridOpacity', 0, 1, 0.01).name('Opacity').onChange(v => {
    if (surfaceGridMesh) {
        surfaceGridMesh.material.opacity = v;
        surfaceGridMesh.visible = params.surfaceGridVisible && v > 0;
        surfaceGridMesh.material.needsUpdate = true;
    }
});
surfaceGridFolder.addColor(params, 'surfaceGridColor').name('Color').onChange(v => {
    if (surfaceGridMesh) {
        surfaceGridMesh.material.color.set(v);
        surfaceGridMesh.material.needsUpdate = true;
    }
});
surfaceGridFolder.add(params, 'surfaceGridWireframe').name('Wireframe').onChange(v => {
    if (surfaceGridMesh) {
        surfaceGridMesh.material.wireframe = v;
        surfaceGridMesh.material.needsUpdate = true;
    }
});

const regionalTopoFolder = regionalFolder.addFolder('Topology Lines');
_trackFolder(regionalTopoFolder, 'Regional Topology Lines');

regionalTopoFolder.add(params, 'regionalContourSmooth', 0, 8, 1).name('Smoothing').onChange(v => {
    smoothRegionalContourY(v);
});

regionalTopoFolder.add(params, 'regionalShowContours').name('Enable').onChange(v => {
    if (regionalContourMesh) regionalContourMesh.visible = v;
    persistRegionalContextVisibilityToStorage();
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
            loadHorizon('Åre Fm Top',   'Norne_Are_Top_hires_regrid.csv',   0xFF6B6B),
            loadHorizon('Tilje Fm Top', 'Norne_Tilje_Top_hires_regrid.csv', 0xFFAA44),
            loadHorizon('Ile Fm Top',   'Norne_Ile_Top_hires_regrid.csv',   0xFFDD22),
            loadHorizon('Tofte Fm Top', 'Norne_Tofte_Top_hires_regrid.csv', 0x66CC66),
            loadHorizon('Garn Fm Top',  'Norne_Garn_Top_hires_regrid.csv',  0x4ECDC4),
            loadHorizon('Not Fm Top',   'Norne_Not_Top_hires_regrid.csv',   0x45B7D1),
            loadHorizon('Norne Base',   'Norne_Base_hires_regrid.csv',      0x9B59B6)
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

        // Erode the valid region by 2 rings: any valid vertex adjacent to an
        // invalid vertex is marked invalid.  This trims the noisy outermost
        // edge cells produced by convex-hull interpolation.
        for (let ring = 0; ring < 2; ring++) {
            const erodeSet = new Set();
            for (let ix = 0; ix < width; ix++) {
                for (let iy = 0; iy < height; iy++) {
                    const idx = iy * width + ix;
                    if (invalidIndices.has(idx)) continue;
                    let onEdge = false;
                    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
                        const nx = ix + dx, ny = iy + dy;
                        if (nx < 0 || nx >= width || ny < 0 || ny >= height) { onEdge = true; break; }
                        if (invalidIndices.has(ny * width + nx)) { onEdge = true; break; }
                    }
                    if (onEdge) erodeSet.add(idx);
                }
            }
            for (const idx of erodeSet) {
                invalidIndices.add(idx);
                posAttr.setXYZ(idx, 0, 0, 0);
            }
        }

        // Compute typical edge length BEFORE smoothing (smoothing compresses
        // boundary edges and would corrupt this measurement)
        let edgeLenSum = 0, edgeLenCnt = 0;
        for (let eix = 0; eix < width - 1; eix++) {
            for (let eiy = 0; eiy < height; eiy++) {
                const i0 = eiy * width + eix, i1 = eiy * width + (eix + 1);
                if (!invalidIndices.has(i0) && !invalidIndices.has(i1)) {
                    const edx = posAttr.getX(i1) - posAttr.getX(i0);
                    const edz = posAttr.getZ(i1) - posAttr.getZ(i0);
                    edgeLenSum += Math.sqrt(edx * edx + edz * edz);
                    edgeLenCnt++;
                    break;
                }
            }
            if (edgeLenCnt > 10) break;
        }
        const avgEdge = edgeLenCnt > 0 ? edgeLenSum / edgeLenCnt : 50;
        const maxEdgeLen = avgEdge * 3.0;

        // ── Laplacian smoothing of boundary vertex XZ positions ─────────────
        // The data footprint is rotated relative to the grid, so the boundary
        // follows a staircase pattern.  Smooth boundary vertices toward their
        // valid neighbours to create a clean, curved edge.
        try {
            const SMOOTH_ITERS = 5;
            const LAMBDA = 0.5;
            for (let iter = 0; iter < SMOOTH_ITERS; iter++) {
                // 1. Identify current boundary vertices
                const boundarySet = new Set();
                for (let bix = 0; bix < width; bix++) {
                    for (let biy = 0; biy < height; biy++) {
                        const bIdx = biy * width + bix;
                        if (invalidIndices.has(bIdx)) continue;
                        const neighbours = [[-1,0],[1,0],[0,-1],[0,1]];
                        for (let n = 0; n < neighbours.length; n++) {
                            const nnx = bix + neighbours[n][0], nny = biy + neighbours[n][1];
                            if (nnx < 0 || nnx >= width || nny < 0 || nny >= height ||
                                invalidIndices.has(nny * width + nnx)) {
                                boundarySet.add(bIdx);
                                break;
                            }
                        }
                    }
                }

                // 2. Compute smoothed XZ for each boundary vertex
                const smoothed = []; // [ {idx, x, z}, ... ]
                boundarySet.forEach(function(bIdx) {
                    const biy = Math.floor(bIdx / width);
                    const bix = bIdx % width;
                    var sumX = 0, sumZ = 0, cnt = 0;
                    const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
                    for (var d = 0; d < dirs.length; d++) {
                        const nnx = bix + dirs[d][0], nny = biy + dirs[d][1];
                        if (nnx < 0 || nnx >= width || nny < 0 || nny >= height) continue;
                        const nIdx = nny * width + nnx;
                        if (invalidIndices.has(nIdx)) continue;
                        sumX += posAttr.getX(nIdx);
                        sumZ += posAttr.getZ(nIdx);
                        cnt++;
                    }
                    if (cnt > 0) {
                        const curX = posAttr.getX(bIdx);
                        const curZ = posAttr.getZ(bIdx);
                        smoothed.push({
                            idx: bIdx,
                            x: curX + LAMBDA * (sumX / cnt - curX),
                            z: curZ + LAMBDA * (sumZ / cnt - curZ),
                        });
                    }
                });

                // 3. Apply smoothed positions (Y/depth unchanged)
                for (var s = 0; s < smoothed.length; s++) {
                    const entry = smoothed[s];
                    const curY = posAttr.getY(entry.idx);
                    posAttr.setXYZ(entry.idx, entry.x, curY, entry.z);
                }
            }
            console.log(`  Boundary smoothing: ${SMOOTH_ITERS} iters applied for ${h.name}`);
        } catch(e) {
            console.error('Boundary smoothing failed:', e);
        }

        // Remove degenerate triangles (invalid vertices + spatially stretched edges)

        // ── Remap UVs so the texture spans only the valid footprint ──
        // Default PlaneGeometry UVs cover the full grid (0→1). We remap to span
        // only the bounding box of valid (post-erosion) grid cells so the image
        // fills the actual horizon footprint instead of the larger rectangular grid.
        {
            const uvAttr = geometry.attributes.uv;
            let minIx = width, maxIx = -1, minIy = height, maxIy = -1;
            for (let ix = 0; ix < width; ix++) {
                for (let iy = 0; iy < height; iy++) {
                    if (!invalidIndices.has(iy * width + ix)) {
                        if (ix < minIx) minIx = ix;
                        if (ix > maxIx) maxIx = ix;
                        if (iy < minIy) minIy = iy;
                        if (iy > maxIy) maxIy = iy;
                    }
                }
            }
            const rangeIx = maxIx - minIx || 1;
            const rangeIy = maxIy - minIy || 1;
            for (let ix = 0; ix < width; ix++) {
                for (let iy = 0; iy < height; iy++) {
                    const idx = iy * width + ix;
                    const u = (ix - minIx) / rangeIx;
                    const v = (iy - minIy) / rangeIy;
                    uvAttr.setXY(idx, u, v);
                }
            }
            uvAttr.needsUpdate = true;
        }
        const rawIndices = geometry.index.array;
        let cleanIndices = [];
        for (let i = 0; i < rawIndices.length; i += 3) {
            const a = rawIndices[i], b = rawIndices[i + 1], c = rawIndices[i + 2];
            if (!invalidIndices.has(a) && !invalidIndices.has(b) && !invalidIndices.has(c)) {
                cleanIndices.push(a, b, c);
            }
        }

        // (avgEdge / maxEdgeLen already computed before smoothing — see above)

        // Second pass: cull triangles with stretched edges
        const finalIndices = [];
        let culledCount = 0;
        for (let i = 0; i < cleanIndices.length; i += 3) {
            const a = cleanIndices[i], b = cleanIndices[i + 1], c = cleanIndices[i + 2];

            // Check all 3 edges in XZ (horizontal) plane
            let tooLong = false;
            const pairs = [[a, b], [b, c], [c, a]];
            for (const [p, q] of pairs) {
                const dx = posAttr.getX(p) - posAttr.getX(q);
                const dz = posAttr.getZ(p) - posAttr.getZ(q);
                if (dx * dx + dz * dz > maxEdgeLen * maxEdgeLen) {
                    tooLong = true;
                    break;
                }
            }
            if (!tooLong) {
                finalIndices.push(a, b, c);
            } else {
                culledCount++;
            }
        }
        if (culledCount > 0) console.log(`  Culled ${culledCount} stretched edge triangles for ${h.name}`);
        geometry.setIndex(finalIndices);
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
    loadRegionalHorizon().then(() => buildSurfaceGrid()); // async — adds ghost surface once CSV loads, then builds flat grid


    // Apply ALL stored settings to the scene (wireframe, zScale, lighting,
    // flatShading, depth coloring, contour uniforms, layer visibility, etc.)
    applyState(getCurrentState());
    // Build dots on startup if default mode is 'dots'
    toggleHorizonDots(params.showHorizonDots);
    toggle3DDots(params.show3DDots);

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

    // Drive camera flythrough animation if active
    _tickCameraFlythrough();

    controls.update();

    // Dynamic near/far clipping: adjust every frame based on camera distance
    // to the orbit target so geometry is never clipped when zooming in or out.
    const dist = camera.position.distanceTo(controls.target);
    camera.near = Math.max(1, dist * 0.001);
    camera.far  = Math.max(200000, dist * 100);
    camera.updateProjectionMatrix();

    updateCompass();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    positionHistoryActions();
});

// ── Right-click menu for custom horizon targets ─────────────────────────────
const RIGHT_CLICK_DRAG_THRESHOLD_PX = 6;
let _rightClickDownPoint = null;
let _rightClickWasDrag = false;

function raycasterFromClientPoint(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    return raycaster;
}

function hitCustomTargetAtClientPoint(clientX, clientY) {
    if (customTargetGroup.children.length === 0) return null;
    const raycaster = raycasterFromClientPoint(clientX, clientY);
    const hits = raycaster.intersectObjects(customTargetGroup.children, false);
    if (hits.length === 0) return null;
    const targetId = hits[0]?.object?.userData?.targetId;
    if (typeof targetId !== 'string' || !targetId) return null;
    return { targetId };
}

function hitHorizonAtClientPoint(clientX, clientY) {
    const raycaster = raycasterFromClientPoint(clientX, clientY);
    const horizonMeshes = allSurveyChildren().filter(c =>
        c instanceof THREE.Mesh &&
        c.userData.isHorizon &&
        !c.userData.isContour &&
        c.visible
    );
    const hits = raycaster.intersectObjects(horizonMeshes, false);
    return hits.length > 0 ? hits[0] : null;
}

function hitCustomWellheadAtClientPoint(clientX, clientY) {
    const wellheads = customHorizonWellGroup.children.filter(c => c.userData?.isCustomHorizonWellhead);
    if (wellheads.length === 0) return null;
    const raycaster = raycasterFromClientPoint(clientX, clientY);
    const hits = raycaster.intersectObjects(wellheads, false);
    if (hits.length === 0) return null;
    const wellId = hits[0]?.object?.userData?.customHorizonWellId;
    if (typeof wellId !== 'string' || !wellId) return null;
    return { wellId, point: hits[0].point.clone() };
}

function hitCustomWellPathAtClientPoint(clientX, clientY) {
    const pathMeshes = customHorizonWellGroup.children.filter(c =>
        c.userData?.isCustomHorizonWell &&
        !c.userData?.isCustomHorizonWellhead
    );
    if (pathMeshes.length === 0) return null;
    const raycaster = raycasterFromClientPoint(clientX, clientY);
    const hits = raycaster.intersectObjects(pathMeshes, false);
    if (hits.length === 0) return null;
    const wellId = hits[0]?.object?.userData?.customHorizonWellId;
    if (typeof wellId !== 'string' || !wellId) return null;
    return { wellId };
}

function hitCustomSurfaceNetworkAtClientPoint(clientX, clientY) {
    if (customSurfaceNetworkGroup.children.length === 0) return null;
    const raycaster = raycasterFromClientPoint(clientX, clientY);
    const hits = raycaster.intersectObjects(customSurfaceNetworkGroup.children, true);
    const bodyHit = hits.find(hit => hit?.object?.userData?.isCustomSurfaceNetworkBody);
    if (!bodyHit) return null;
    const networkId = bodyHit?.object?.userData?.customSurfaceNetworkId;
    if (typeof networkId !== 'string' || !networkId) return null;
    return { networkId, point: bodyHit.point.clone() };
}

function hitCustomSurfaceNetworkTieBackPathAtClientPoint(clientX, clientY) {
    if (customTieBackLineGroup.children.length === 0) return null;
    const raycaster = raycasterFromClientPoint(clientX, clientY);
    const hits = raycaster.intersectObjects(customTieBackLineGroup.children, true);
    const pathHit = hits.find(hit => hit?.object?.userData?.isCustomTieBackLinePath);
    if (!pathHit) return null;
    const lineId = pathHit?.object?.userData?.customTieBackLineId;
    const representativeWellId = pathHit?.object?.userData?.tieBackRepresentativeWellId;
    if (typeof lineId !== 'string' || !lineId) return null;
    if (typeof representativeWellId !== 'string' || !representativeWellId) return null;
    return {
        lineId,
        representativeWellId,
        point: pathHit.point.clone(),
    };
}

function distancePointToSegmentXZ(point, segStart, segEnd) {
    const ax = segStart.x;
    const az = segStart.z;
    const bx = segEnd.x;
    const bz = segEnd.z;
    const px = point.x;
    const pz = point.z;
    const vx = bx - ax;
    const vz = bz - az;
    const wx = px - ax;
    const wz = pz - az;
    const c1 = vx * wx + vz * wz;
    const c2 = vx * vx + vz * vz;
    let t = c2 > 1e-6 ? (c1 / c2) : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + vx * t;
    const cz = az + vz * t;
    const dx = px - cx;
    const dz = pz - cz;
    return Math.sqrt(dx * dx + dz * dz);
}

let _customWellheadDragState = null; // { wellId, plane, grabOffset, pointerId }
let _customSurfaceNetworkDragState = null; // { networkId, plane, grabOffset, pointerId }
let _customTieBackLineControlDragState = null; // { lineId, representativeWellId, controlIndex, plane, grabOffset, pointerId }

function finishCustomWellheadDrag(persist) {
    if (!_customWellheadDragState) return;
    if (typeof _customWellheadDragState.pointerId === 'number' && renderer.domElement.hasPointerCapture?.(_customWellheadDragState.pointerId)) {
        renderer.domElement.releasePointerCapture(_customWellheadDragState.pointerId);
    }
    _customWellheadDragState = null;
    controls.enabled = true;
    renderer.domElement.style.cursor = '';
    if (persist) persistCustomHorizonWellsToStorage();
    rebuildCustomHorizonWellControllers();
}

function finishCustomSurfaceNetworkDrag(persist) {
    if (!_customSurfaceNetworkDragState) return;
    if (typeof _customSurfaceNetworkDragState.pointerId === 'number' && renderer.domElement.hasPointerCapture?.(_customSurfaceNetworkDragState.pointerId)) {
        renderer.domElement.releasePointerCapture(_customSurfaceNetworkDragState.pointerId);
    }
    _customSurfaceNetworkDragState = null;
    controls.enabled = true;
    renderer.domElement.style.cursor = '';
    if (persist) persistCustomSurfaceNetworksToStorage();
    rebuildCustomSurfaceNetworkControllers();
}

function finishCustomTieBackLineControlDrag(persist) {
    if (!_customTieBackLineControlDragState) return;
    if (
        typeof _customTieBackLineControlDragState.pointerId === 'number' &&
        renderer.domElement.hasPointerCapture?.(_customTieBackLineControlDragState.pointerId)
    ) {
        renderer.domElement.releasePointerCapture(_customTieBackLineControlDragState.pointerId);
    }
    _customTieBackLineControlDragState = null;
    controls.enabled = true;
    renderer.domElement.style.cursor = '';
    if (persist) persistCustomTieBackLinesToStorage();
}

renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button === 0) {
        const tieBackPathHit = hitCustomSurfaceNetworkTieBackPathAtClientPoint(e.clientX, e.clientY);
        if (tieBackPathHit) {
            const line = getCustomTieBackLineById(tieBackPathHit.lineId);
            if (!line) return;
            const network = getCustomSurfaceNetworkById(line.surfaceNetworkId);
            if (!network) return;
            const well = getCustomHorizonWellById(tieBackPathHit.representativeWellId);
            if (!well) return;

            const startY = getCustomSurfaceNetworkPipeBaseHeightM(network);
            const start = new THREE.Vector3(
                Number(network.local?.x) || 0,
                startY,
                Number(network.local?.z) || 0
            );
            const end = new THREE.Vector3(
                Number(well.headLocal?.x) || 0,
                startY,
                Number(well.headLocal?.z) || 0
            );
            const clickWorld = tieBackPathHit.point.clone();
            clickWorld.y = startY;

            const points = getCustomTieBackLineControlPoints(line, tieBackPathHit.representativeWellId, true);
            const existingDistances = points.map((pt, idx) => {
                const px = (Number(network.local?.x) || 0) + (Number(pt.x) || 0);
                const pz = (Number(network.local?.z) || 0) + (Number(pt.z) || 0);
                const dx = clickWorld.x - px;
                const dz = clickWorld.z - pz;
                return { idx, d: Math.sqrt(dx * dx + dz * dz) };
            });
            existingDistances.sort((a, b) => a.d - b.d);
            const nearestExisting = existingDistances[0] || null;
            const reuseExistingThreshold = Math.max(12, Number(line.tieBackThicknessM) * 2 || 12);

            let controlIndex = -1;
            if (nearestExisting && nearestExisting.d <= reuseExistingThreshold) {
                controlIndex = nearestExisting.idx;
            } else {
                const chain = [
                    start.clone(),
                    ...points.map(pt => new THREE.Vector3(
                        (Number(network.local?.x) || 0) + (Number(pt.x) || 0),
                        startY,
                        (Number(network.local?.z) || 0) + (Number(pt.z) || 0)
                    )),
                    end.clone(),
                ];
                let bestSegmentIndex = 0;
                let bestDistance = Infinity;
                for (let i = 0; i < chain.length - 1; i++) {
                    const d = distancePointToSegmentXZ(clickWorld, chain[i], chain[i + 1]);
                    if (d < bestDistance) {
                        bestDistance = d;
                        bestSegmentIndex = i;
                    }
                }
                const insertIdx = Math.max(0, Math.min(points.length, bestSegmentIndex));
                const clickLocal = wellGroup.worldToLocal(clickWorld.clone());
                controlIndex = insertCustomTieBackLineControlPoint(
                    line,
                    tieBackPathHit.representativeWellId,
                    insertIdx,
                    clickLocal.x - (Number(network.local?.x) || 0),
                    clickLocal.z - (Number(network.local?.z) || 0)
                );
            }

            const selectedPoint = getCustomTieBackLineControlPoints(line, tieBackPathHit.representativeWellId, true)[controlIndex];
            if (!selectedPoint) return;
            const controlWorld = wellGroup.localToWorld(new THREE.Vector3(
                (Number(network.local?.x) || 0) + (Number(selectedPoint.x) || 0),
                startY,
                (Number(network.local?.z) || 0) + (Number(selectedPoint.z) || 0)
            ));
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -startY);
            const raycaster = raycasterFromClientPoint(e.clientX, e.clientY);
            const onPlane = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(plane, onPlane)) {
                _customTieBackLineControlDragState = {
                    lineId: line.id,
                    representativeWellId: tieBackPathHit.representativeWellId,
                    controlIndex,
                    plane,
                    grabOffset: controlWorld.clone().sub(onPlane),
                    pointerId: e.pointerId,
                };
                renderer.domElement.setPointerCapture?.(e.pointerId);
                controls.enabled = false;
                renderer.domElement.style.cursor = 'grabbing';
                rebuildCustomTieBackLines();
            }
            return;
        }

        const networkHit = hitCustomSurfaceNetworkAtClientPoint(e.clientX, e.clientY);
        if (networkHit) {
            const network = getCustomSurfaceNetworkById(networkHit.networkId);
            if (network) {
                const networkWorld = wellGroup.localToWorld(new THREE.Vector3(
                    Number(network.local?.x) || 0,
                    Number(network.local?.y) || 0,
                    Number(network.local?.z) || 0
                ));
                const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -networkWorld.y);
                const raycaster = raycasterFromClientPoint(e.clientX, e.clientY);
                const onPlane = new THREE.Vector3();
                if (raycaster.ray.intersectPlane(plane, onPlane)) {
                    _customSurfaceNetworkDragState = {
                        networkId: networkHit.networkId,
                        plane,
                        grabOffset: networkWorld.clone().sub(onPlane),
                        pointerId: e.pointerId,
                    };
                    renderer.domElement.setPointerCapture?.(e.pointerId);
                    controls.enabled = false;
                    renderer.domElement.style.cursor = 'grabbing';
                }
            }
            return;
        }

        const hit = hitCustomWellheadAtClientPoint(e.clientX, e.clientY);
        if (hit) {
            const well = getCustomHorizonWellById(hit.wellId);
            if (well) {
                const headWorld = wellGroup.localToWorld(new THREE.Vector3(
                    Number(well.headLocal?.x) || 0,
                    Number(well.headLocal?.y) || 0,
                    Number(well.headLocal?.z) || 0
                ));
                const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -headWorld.y);
                const raycaster = raycasterFromClientPoint(e.clientX, e.clientY);
                const onPlane = new THREE.Vector3();
                if (raycaster.ray.intersectPlane(plane, onPlane)) {
                    _customWellheadDragState = {
                        wellId: hit.wellId,
                        plane,
                        grabOffset: headWorld.clone().sub(onPlane),
                        pointerId: e.pointerId,
                    };
                    renderer.domElement.setPointerCapture?.(e.pointerId);
                    controls.enabled = false;
                    renderer.domElement.style.cursor = 'grabbing';
                }
            }
            return;
        }
    }

    if (e.button !== 2) return;
    _rightClickDownPoint = { x: e.clientX, y: e.clientY };
    _rightClickWasDrag = false;
    hideCustomTargetContextMenu();
});

renderer.domElement.addEventListener('pointermove', (e) => {
    if (_customTieBackLineControlDragState) {
        const raycaster = raycasterFromClientPoint(e.clientX, e.clientY);
        const point = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(_customTieBackLineControlDragState.plane, point)) {
            const line = getCustomTieBackLineById(_customTieBackLineControlDragState.lineId);
            if (!line) return;
            const network = getCustomSurfaceNetworkById(line.surfaceNetworkId);
            if (!network) return;
            const nextWorld = point.add(_customTieBackLineControlDragState.grabOffset);
            const nextLocal = wellGroup.worldToLocal(nextWorld.clone());
            setCustomTieBackLineControlPoint(
                line,
                _customTieBackLineControlDragState.representativeWellId,
                _customTieBackLineControlDragState.controlIndex,
                nextLocal.x - (Number(network.local?.x) || 0),
                nextLocal.z - (Number(network.local?.z) || 0)
            );
            rebuildCustomTieBackLines();
        }
        return;
    }

    if (_customSurfaceNetworkDragState) {
        const raycaster = raycasterFromClientPoint(e.clientX, e.clientY);
        const point = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(_customSurfaceNetworkDragState.plane, point)) {
            const network = getCustomSurfaceNetworkById(_customSurfaceNetworkDragState.networkId);
            if (network) {
                const newWorld = point.add(_customSurfaceNetworkDragState.grabOffset);
                const newLocal = wellGroup.worldToLocal(newWorld.clone());
                network.local.x = newLocal.x;
                network.local.y = newLocal.y;
                network.local.z = newLocal.z;
                rebuildCustomSurfaceNetworks();
            }
        }
        return;
    }

    if (_customWellheadDragState) {
        const raycaster = raycasterFromClientPoint(e.clientX, e.clientY);
        const point = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(_customWellheadDragState.plane, point)) {
            const well = getCustomHorizonWellById(_customWellheadDragState.wellId);
            if (well) {
                const newHeadWorld = point.add(_customWellheadDragState.grabOffset);
                const newHeadLocal = wellGroup.worldToLocal(newHeadWorld.clone());
                well.headLocal.x = newHeadLocal.x;
                well.headLocal.y = newHeadLocal.y;
                well.headLocal.z = newHeadLocal.z;
                rebuildCustomHorizonWells();
            }
        }
        return;
    }

    if (!_rightClickDownPoint) return;
    const dx = e.clientX - _rightClickDownPoint.x;
    const dy = e.clientY - _rightClickDownPoint.y;
    if ((dx * dx + dy * dy) > (RIGHT_CLICK_DRAG_THRESHOLD_PX * RIGHT_CLICK_DRAG_THRESHOLD_PX)) {
        _rightClickWasDrag = true;
    }
});

renderer.domElement.addEventListener('pointerup', (e) => {
    if (e.button === 0 && _customTieBackLineControlDragState) {
        finishCustomTieBackLineControlDrag(true);
        return;
    }
    if (e.button === 0 && _customSurfaceNetworkDragState) {
        finishCustomSurfaceNetworkDrag(true);
        return;
    }
    if (e.button === 0 && _customWellheadDragState) {
        finishCustomWellheadDrag(true);
        return;
    }
    if (e.button !== 2) return;
    _rightClickDownPoint = null;
});

renderer.domElement.addEventListener('contextmenu', (e) => {
    e.preventDefault();

    const saveModal = document.getElementById('saveModal');
    const deleteModal = document.getElementById('deleteModal');
    const createWellModal = document.getElementById('createWellModal');
    const editWellTargetsModal = document.getElementById('editWellTargetsModal');
    const createTieBackLineModal = document.getElementById('createTieBackLineModal');
    if (
        saveModal?.style.display === 'flex' ||
        deleteModal?.style.display === 'flex' ||
        createWellModal?.style.display === 'flex' ||
        editWellTargetsModal?.style.display === 'flex' ||
        createTieBackLineModal?.style.display === 'flex'
    ) {
        hideCustomTargetContextMenu();
        return;
    }

    if (_rightClickWasDrag) {
        _rightClickWasDrag = false;
        hideCustomTargetContextMenu();
        return;
    }

    const targetHit = hitCustomTargetAtClientPoint(e.clientX, e.clientY);
    if (targetHit) {
        showCustomTargetContextMenu(e.clientX, e.clientY, [
            {
                label: 'Rename target',
                onSelect: () => promptRenameCustomTarget(targetHit.targetId),
            },
            {
                label: 'Create well',
                onSelect: () => openCreateCustomHorizonWellModal([targetHit.targetId]),
            },
            {
                label: 'Delete target',
                onSelect: () => removeCustomTargetById(targetHit.targetId),
            },
        ]);
        return;
    }

    const wellPathHit = hitCustomWellPathAtClientPoint(e.clientX, e.clientY);
    if (wellPathHit) {
        showCustomTargetContextMenu(e.clientX, e.clientY, [
            {
                label: 'Duplicate well',
                onSelect: () => duplicateCustomHorizonWellById(wellPathHit.wellId),
            },
        ]);
        return;
    }

    if (!params.customTargetAddOnClick) {
        hideCustomTargetContextMenu();
        return;
    }

    const horizonHit = hitHorizonAtClientPoint(e.clientX, e.clientY);
    if (!horizonHit) {
        hideCustomTargetContextMenu();
        return;
    }

    showCustomTargetContextMenu(e.clientX, e.clientY, [
        {
            label: 'Add target',
            onSelect: () => addCustomTargetFromIntersection(horizonHit),
        },
    ]);
});

renderer.domElement.addEventListener('pointercancel', () => {
    finishCustomTieBackLineControlDrag(false);
    finishCustomSurfaceNetworkDrag(false);
    finishCustomWellheadDrag(false);
    _rightClickDownPoint = null;
    _rightClickWasDrag = false;
    hideCustomTargetContextMenu();
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
        if (c.userData.layerName && !c.userData.isHorizonDots) {
            try {
                const saved = JSON.parse(localStorage.getItem('geo_layer_' + c.userData.layerName) || 'null');
                if (saved && saved.opacity !== undefined) {
                    c.material.opacity = saved.opacity;
                    c.material.transparent = saved.opacity < 1;
                    c.material.depthWrite = saved.opacity >= 1;
                    c.material.needsUpdate = true;
                }
            } catch(e) {}
        }
    });
})();
animate();
