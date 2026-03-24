#!/usr/bin/env python3
"""
expand_regional.py  – Expand the Norne regional context surface from 51×51 (50km)
to 101×101 (100km), centered on the Norne survey area.

For grid cells within the original 51×51 extent, original Z_CONFORM values are
preserved.  For cells outside, the topology deviation (Z_CONFORM - Z_POLY) from
the original data is mirror-tiled to fill the expanded area with realistic
geological texture.

After expansion, the anticline dome adjustments are applied.

Usage:
    cd webgl_viz
    python3 expand_regional.py
"""

import csv
import math
import os
import shutil

# ── Configuration ────────────────────────────────────────────────────────────
CSV_FILE    = "Norne_Are_Regional.csv"
BACKUP_FILE = "Norne_Are_Regional.csv.bak"
OUTPUT_FILE = "Norne_Are_Regional.csv"

# New grid dimensions
NEW_SIZE    = 101          # 101×101 grid
CELL_SIZE   = 1000.0       # 1 km spacing (same as original)

# Center the new grid on the survey center
SURVEY_CENTER_X = 453762.0
SURVEY_CENTER_Y = 7316123.7

NEW_ORIGIN_X = SURVEY_CENTER_X - 50 * CELL_SIZE   # 403762.0
NEW_ORIGIN_Y = SURVEY_CENTER_Y - 50 * CELL_SIZE   # 7266123.7

# ── Anticline dome parameters ────────────────────────────────────────────────
BASIN_FILL     = 1400.0
BASIN_SIGMA    = 10000.0
DOME_AMPLITUDE = 1200.0
DOME_SIGMA     = 12000.0

# Original grid dimensions
ORIG_SIZE = 51


def mirror_index(idx, size):
    """Mirror idx into [0, size-1] using reflection at boundaries."""
    period = 2 * (size - 1)
    if period == 0:
        return 0
    idx = idx % period
    if idx < 0:
        idx += period
    if idx >= size:
        idx = period - idx
    return max(0, min(idx, size - 1))


def main():
    # 1. Read original data from backup
    source = BACKUP_FILE if os.path.exists(BACKUP_FILE) else CSV_FILE
    orig_list = []
    with open(source, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            orig_list.append(row)
    print(f"Read {len(orig_list)} original rows from {source}")

    # 2. Build original grid arrays (51×51)
    orig_zc   = [[0.0]*ORIG_SIZE for _ in range(ORIG_SIZE)]  # [xl][il]
    orig_zp   = [[0.0]*ORIG_SIZE for _ in range(ORIG_SIZE)]
    orig_dist = [[0.0]*ORIG_SIZE for _ in range(ORIG_SIZE)]
    orig_x    = [[0.0]*ORIG_SIZE for _ in range(ORIG_SIZE)]
    orig_y    = [[0.0]*ORIG_SIZE for _ in range(ORIG_SIZE)]

    for row in orig_list:
        il = int(row["IL"])
        xl = int(row["XL"])
        orig_zc[xl][il]   = float(row["Z_CONFORM"])
        orig_zp[xl][il]   = float(row["Z_POLY"])
        orig_dist[xl][il] = float(row["DIST"])
        orig_x[xl][il]    = float(row["X"])
        orig_y[xl][il]    = float(row["Y"])

    # 3. Compute topology deviation grid: delta = Z_CONFORM - Z_POLY
    #    This captures the "texture" of the Are formation topology
    #    independent of the smooth depth trend.
    topo_delta = [[0.0]*ORIG_SIZE for _ in range(ORIG_SIZE)]
    for xl in range(ORIG_SIZE):
        for il in range(ORIG_SIZE):
            topo_delta[xl][il] = orig_zc[xl][il] - orig_zp[xl][il]

    # Stats on topology deviation
    all_deltas = [topo_delta[xl][il] for xl in range(ORIG_SIZE) for il in range(ORIG_SIZE)]
    print(f"Topology deviation range: {min(all_deltas):.0f} to {max(all_deltas):.0f} m")

    # 4. Determine where original data sits in the new grid
    #    Original X starts at 433762, new grid starts at 403762
    #    So original IL=0 maps to new IL = (433762 - 403762)/1000 = 30
    orig_il_offset = round((orig_x[0][0] - NEW_ORIGIN_X) / CELL_SIZE)
    orig_xl_offset = round((orig_y[0][0] - NEW_ORIGIN_Y) / CELL_SIZE)
    print(f"Original data offset in new grid: IL={orig_il_offset}, XL={orig_xl_offset}")

    # 5. Fit linear trend for Z_POLY extrapolation
    xs, ys, zps = [], [], []
    for row in orig_list:
        xs.append(float(row["X"]))
        ys.append(float(row["Y"]))
        zps.append(float(row["Z_POLY"]))

    n = len(xs)
    mx, my, mz = sum(xs)/n, sum(ys)/n, sum(zps)/n
    sxx = sum((x - mx)**2 for x in xs)
    syy = sum((y - my)**2 for y in ys)
    sxy = sum((x - mx)*(y - my) for x, y in zip(xs, ys))
    sxz = sum((x - mx)*(z - mz) for x, z in zip(xs, zps))
    syz = sum((y - my)*(z - mz) for y, z in zip(ys, zps))

    det = sxx * syy - sxy * sxy
    if abs(det) > 1e-10:
        b = (syy * sxz - sxy * syz) / det
        c = (sxx * syz - sxy * sxz) / det
    else:
        b, c = 0.0, 0.0
    a = mz

    def zpoly_at(x, y):
        return a + b * (x - mx) + c * (y - my)

    # Boundary clamping for Z_POLY extrapolation
    orig_x_min, orig_x_max = orig_x[0][0], orig_x[0][ORIG_SIZE-1]
    orig_y_min, orig_y_max = orig_y[0][0], orig_y[ORIG_SIZE-1][0]
    EXTRAP_DECAY_M = 15000.0

    def zpoly_extrapolate(x, y):
        dx_out = max(0, orig_x_min - x, x - orig_x_max)
        dy_out = max(0, orig_y_min - y, y - orig_y_max)
        dist_outside = math.sqrt(dx_out**2 + dy_out**2)
        t = min(dist_outside / EXTRAP_DECAY_M, 1.0)
        t = t * t * (3 - 2 * t)  # smoothstep

        zp_linear = zpoly_at(x, y)
        cx = max(orig_x_min, min(x, orig_x_max))
        cy = max(orig_y_min, min(y, orig_y_max))
        zp_boundary = zpoly_at(cx, cy)
        return zp_linear * (1 - t) + zp_boundary * t

    # 6. Generate expanded grid
    SURVEY_RADIUS = 3500.0
    new_rows = []

    # Blend zone: within this many cells of the original boundary,
    # smoothly transition from original data to mirrored data.
    BLEND_CELLS = 5  # 5 km blend zone

    for xl in range(NEW_SIZE):
        for il in range(NEW_SIZE):
            x = NEW_ORIGIN_X + il * CELL_SIZE
            y = NEW_ORIGIN_Y + xl * CELL_SIZE

            # Position relative to original grid
            orig_il = il - orig_il_offset
            orig_xl = xl - orig_xl_offset
            in_original = (0 <= orig_il < ORIG_SIZE and 0 <= orig_xl < ORIG_SIZE)

            # Compute mirrored topology value (used for outer cells AND blending)
            mir_il = mirror_index(orig_il, ORIG_SIZE)
            mir_xl = mirror_index(orig_xl, ORIG_SIZE)
            delta = topo_delta[mir_xl][mir_il]

            # Distance from survey center (used for DIST column)
            ddx = x - SURVEY_CENTER_X
            ddy = y - SURVEY_CENTER_Y
            dist_from_center = math.sqrt(ddx*ddx + ddy*ddy)

            # Z_POLY for this position
            if in_original:
                zp_orig = orig_zp[orig_xl][orig_il]
            else:
                zp_orig = None
            zp_extrap = zpoly_extrapolate(x, y)
            zp_extrap = max(zp_extrap, 500.0)

            # The mirrored Z_CONFORM: extrapolated Z_POLY + topology delta
            zc_mirrored = zp_extrap + delta

            if in_original:
                # Compute distance from the original grid boundary (in cells)
                dist_to_edge = min(orig_il, ORIG_SIZE - 1 - orig_il,
                                   orig_xl, ORIG_SIZE - 1 - orig_xl)

                if dist_to_edge >= BLEND_CELLS:
                    # Deep inside original: use original data as-is
                    zc = orig_zc[orig_xl][orig_il]
                    zp = zp_orig
                else:
                    # Near the boundary: blend original → mirrored
                    blend_t = dist_to_edge / BLEND_CELLS
                    blend_t = blend_t * blend_t * (3 - 2 * blend_t)  # smoothstep

                    zc = blend_t * orig_zc[orig_xl][orig_il] + (1 - blend_t) * zc_mirrored
                    zp = blend_t * zp_orig + (1 - blend_t) * zp_extrap

                dist = orig_dist[orig_xl][orig_il]
            else:
                zc = zc_mirrored
                zp = zp_extrap
                dist = max(0.0, dist_from_center - SURVEY_RADIUS)

            new_rows.append({
                "IL": il, "XL": xl,
                "X": f"{x:.1f}", "Y": f"{y:.1f}",
                "Z_CONFORM": f"{zc:.2f}",
                "Z_POLY": f"{zp:.2f}",
                "DIST": f"{dist:.1f}",
            })

    print(f"Generated {len(new_rows)} cells")

    # 7. Apply anticline dome adjustments
    for row in new_rows:
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

    # 8. Write
    fieldnames = ["IL", "XL", "X", "Y", "Z_CONFORM", "Z_POLY", "DIST"]
    with open(OUTPUT_FILE, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(new_rows)

    zc_vals = [float(r["Z_CONFORM"]) for r in new_rows]
    zp_vals = [float(r["Z_POLY"]) for r in new_rows]
    print(f"Z_CONFORM range: {min(zc_vals):.0f} – {max(zc_vals):.0f}")
    print(f"Z_POLY range:    {min(zp_vals):.0f} – {max(zp_vals):.0f}")
    print(f"Wrote {len(new_rows)} rows to {OUTPUT_FILE}")
    print(f"Grid: {NEW_SIZE}×{NEW_SIZE}, extent: {(NEW_SIZE-1)*CELL_SIZE/1000:.0f}km × {(NEW_SIZE-1)*CELL_SIZE/1000:.0f}km")


if __name__ == "__main__":
    main()
