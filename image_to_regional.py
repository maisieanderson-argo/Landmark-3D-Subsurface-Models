#!/usr/bin/env python3
"""
image_to_regional.py  – Multi-resolution depth map from a topology image.

Uses a Laplacian-pyramid approach to decompose the image into frequency bands:
  - Broad pass  (very blurred): large rolling hills, high amplitude
  - Medium pass (moderately blurred): regional ridges/valleys, medium amplitude
  - Fine pass   (original detail): small texture features, low amplitude

Each band isolates features at that spatial scale.  They are summed with
configurable weights to produce the final Z_CONFORM depth surface.

The anticline dome is applied on top so the Norne survey sits on a structural high.

Usage:
    cd webgl_viz
    python3 image_to_regional.py
"""

import csv
import math
import numpy as np
from PIL import Image, ImageFilter

# ── Configuration ────────────────────────────────────────────────────────────
IMAGE_FILE  = "topology-map.png"
CSV_FILE    = "Norne_Are_Regional.csv"

# Output grid
GRID_SIZE = 101
CELL_SIZE = 1000.0  # 1 km

# Center on Norne survey
SURVEY_CENTER_X = 453762.0
SURVEY_CENTER_Y = 7316123.7
ORIGIN_X = SURVEY_CENTER_X - 50 * CELL_SIZE
ORIGIN_Y = SURVEY_CENTER_Y - 50 * CELL_SIZE

# ── Image offset & rotation ──────────────────────────────────────────────────
# Shift the topology relative to the survey (in km)
IMAGE_OFFSET_X_KM = 0.0    # negative = shift topology west (survey moves east in image)
IMAGE_OFFSET_Y_KM = 0.0    # negative = shift topology south (survey moves north in image)
IMAGE_ROTATION_DEG = 0.0    # negative = clockwise rotation of topology

# ── Multi-resolution pyramid ─────────────────────────────────────────────────
# Each level: (downsample_size, depth_amplitude_metres)
#   - downsample_size: image is resized to this before resampling to GRID_SIZE
#     Smaller → more blurring → captures only broad features
#   - depth_amplitude: metres of depth variation for this frequency band
#
# The base depth around which features are centered:
Z_BASE = 2700.0  # metres — mid-depth

PYRAMID_LEVELS = [
    # (downsample_px,  amplitude_m,  description)
    (8,                1300.0,       "Broad rolling hills"),
    (25,               455.0,        "Regional ridges & valleys"),
    (80,               260.0,        "Medium-scale features"),
    (GRID_SIZE,        130.0,        "Fine texture detail"),
]

# ── Anticline dome ───────────────────────────────────────────────────────────
BASIN_FILL     = 1400.0
BASIN_SIGMA    = 10000.0
DOME_AMPLITUDE = 1200.0
DOME_SIGMA     = 12000.0

SURVEY_RADIUS  = 3500.0


def image_to_grid(img_gray, downsample_size, grid_size):
    """
    Downsample an image to downsample_size, then resize to grid_size.
    Returns a numpy array [grid_size, grid_size] of normalised values [0..1].
    """
    # Downsample (captures only low-frequency features at this scale)
    small = img_gray.resize((downsample_size, downsample_size), Image.LANCZOS)
    # Resize back to grid — interpolation fills in smooth values
    grid_img = small.resize((grid_size, grid_size), Image.LANCZOS)
    arr = np.array(grid_img, dtype=np.float64) / 255.0
    return arr


def main():
    # 1. Load image as grayscale, apply offset and rotation
    img = Image.open(IMAGE_FILE).convert("L")
    w, h = img.size
    print(f"Loaded {IMAGE_FILE}: {w}×{h}")

    # Apply rotation (positive = counter-clockwise in PIL, so negate for CW)
    if abs(IMAGE_ROTATION_DEG) > 0.01:
        img = img.rotate(IMAGE_ROTATION_DEG, resample=Image.BICUBIC, expand=False,
                         fillcolor=int(np.mean(np.array(img))))
        print(f"Rotated {IMAGE_ROTATION_DEG:.1f}° (positive=CCW, negative=CW)")

    # Apply offset by cropping/shifting the image
    # Convert km offset to pixel offset (image covers 100km at w pixels)
    px_per_km = w / 100.0
    shift_px_x = int(round(IMAGE_OFFSET_X_KM * px_per_km))
    shift_px_y = int(round(-IMAGE_OFFSET_Y_KM * px_per_km))  # negate: image Y is top-down
    if shift_px_x != 0 or shift_px_y != 0:
        from PIL import ImageChops
        fill_val = int(np.mean(np.array(img)))
        shifted = Image.new("L", (w, h), fill_val)
        shifted.paste(img, (shift_px_x, shift_px_y))
        img = shifted
        print(f"Offset: {IMAGE_OFFSET_X_KM:+.1f}km X, {IMAGE_OFFSET_Y_KM:+.1f}km Y "
              f"({shift_px_x:+d}px, {shift_px_y:+d}px)")

    # 2. Build Laplacian pyramid
    #    Each level's contribution = (this_level - coarser_level) * amplitude
    #    The coarsest level IS the base.
    print(f"\n{'Level':<6} {'Size':>5} {'Amplitude':>10}  Description")
    print("-" * 55)

    # Sort levels from coarsest to finest
    levels = sorted(PYRAMID_LEVELS, key=lambda l: l[0])

    # Generate grids at each resolution
    grids = []
    for size, amp, desc in levels:
        grid = image_to_grid(img, size, GRID_SIZE)
        grids.append((grid, amp, desc, size))
        print(f"  {len(grids):<4} {size:>5}  {amp:>8.0f} m   {desc}")

    # Build the Laplacian bands
    # Band 0 (coarsest) = the full contribution of the coarsest grid
    # Band i (i>0) = grid[i] - grid[i-1]  (the detail added at this resolution)
    depth_surface = np.full((GRID_SIZE, GRID_SIZE), Z_BASE)

    for i, (grid, amp, desc, size) in enumerate(grids):
        if i == 0:
            # Coarsest level: use directly, centered around 0
            band = grid - np.mean(grid)
        else:
            # Higher levels: subtract the coarser level to isolate new detail
            coarser_grid = grids[i - 1][0]
            band = grid - coarser_grid
            # band is already zero-mean (difference of two normalised grids)

        # Normalise band to [-1, 1] range for consistent amplitude control
        band_max = np.max(np.abs(band))
        if band_max > 1e-6:
            band_norm = band / band_max
        else:
            band_norm = band

        # Apply: bright (positive) → shallower (subtract depth),
        #         dark (negative) → deeper (add depth)
        depth_surface -= band_norm * amp

        print(f"  Band {i}: raw range [{band.min():.3f}, {band.max():.3f}], "
              f"applied ±{amp:.0f}m")

    print(f"\nPre-dome Z_CONFORM range: {depth_surface.min():.0f} – {depth_surface.max():.0f}")

    # 3. Generate CSV rows
    rows = []
    for xl in range(GRID_SIZE):
        for il in range(GRID_SIZE):
            x = ORIGIN_X + il * CELL_SIZE
            y = ORIGIN_Y + xl * CELL_SIZE

            # Image Y is top-down, grid Y is bottom-up → flip
            img_row = GRID_SIZE - 1 - xl
            img_col = il

            z_conform = depth_surface[img_row, img_col]
            z_poly = z_conform  # baseline = same

            dx = x - SURVEY_CENTER_X
            dy = y - SURVEY_CENTER_Y
            dist_from_center = math.sqrt(dx*dx + dy*dy)
            dist = max(0.0, dist_from_center - SURVEY_RADIUS)

            rows.append({
                "IL": il, "XL": xl,
                "X": f"{x:.1f}", "Y": f"{y:.1f}",
                "Z_CONFORM": f"{z_conform:.2f}",
                "Z_POLY": f"{z_poly:.2f}",
                "DIST": f"{dist:.1f}",
            })

    # 4. Apply anticline dome
    for row in rows:
        x  = float(row["X"])
        y  = float(row["Y"])
        dx = x - SURVEY_CENTER_X
        dy = y - SURVEY_CENTER_Y
        r2 = dx * dx + dy * dy

        gauss_basin = math.exp(-r2 / (2.0 * BASIN_SIGMA**2))
        conform_offset = BASIN_FILL * (1.0 - gauss_basin)
        old_zc = float(row["Z_CONFORM"])
        row["Z_CONFORM"] = f"{old_zc + conform_offset:.2f}"

        gauss_dome = math.exp(-r2 / (2.0 * DOME_SIGMA**2))
        dome_delta = DOME_AMPLITUDE * gauss_dome
        old_zp = float(row["Z_POLY"])
        row["Z_POLY"] = f"{old_zp - dome_delta:.2f}"

    # 5. Write CSV
    fieldnames = ["IL", "XL", "X", "Y", "Z_CONFORM", "Z_POLY", "DIST"]
    with open(CSV_FILE, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    zc_vals = [float(r["Z_CONFORM"]) for r in rows]
    zp_vals = [float(r["Z_POLY"]) for r in rows]
    print(f"\nFinal Z_CONFORM range: {min(zc_vals):.0f} – {max(zc_vals):.0f}")
    print(f"Final Z_POLY range:    {min(zp_vals):.0f} – {max(zp_vals):.0f}")
    print(f"Wrote {len(rows)} rows to {CSV_FILE}")


if __name__ == "__main__":
    main()
