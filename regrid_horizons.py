#!/usr/bin/env python3
"""
Regrid Norne horizon CSVs to a uniform XY grid.

Reads each Norne_*_hires.csv (which has non-uniform XY spacing due to the
seismic survey geometry), interpolates Z onto a regular rectangular XY grid,
and writes *_hires_regrid.csv with perfectly even spacing.

Only grid cells inside the convex hull of the original data footprint are
output — the horizon boundary is preserved faithfully.
"""

import csv
import numpy as np
from scipy.interpolate import griddata
from scipy.spatial import ConvexHull


# All 7 Norne horizon hires files
HORIZON_FILES = [
    'Norne_Are_Top_hires.csv',
    'Norne_Tilje_Top_hires.csv',
    'Norne_Ile_Top_hires.csv',
    'Norne_Tofte_Top_hires.csv',
    'Norne_Garn_Top_hires.csv',
    'Norne_Not_Top_hires.csv',
    'Norne_Base_hires.csv',
]

# Target grid spacing in metres (~25m matches average original spacing)
GRID_SPACING = 25.0


def point_in_hull(points, hull, tolerance=1e-6):
    """
    Test which of `points` are inside the convex hull.
    Returns a boolean array.
    """
    A = hull.equations[:, :-1]
    b = hull.equations[:, -1]
    return np.all(points @ A.T + b <= tolerance, axis=1)


def regrid_horizon(input_file, output_file, spacing=GRID_SPACING):
    """Read a horizon CSV, regrid to uniform XY, and write the result."""
    print(f'\n{"="*60}')
    print(f'Processing: {input_file}')
    print(f'{"="*60}')

    # ── 1. Read original data ──
    xs, ys, zs = [], [], []
    with open(input_file) as f:
        reader = csv.DictReader(f)
        for row in reader:
            xs.append(float(row['X']))
            ys.append(float(row['Y']))
            zs.append(float(row['Z']))

    xs = np.array(xs)
    ys = np.array(ys)
    zs = np.array(zs)
    n_orig = len(xs)
    print(f'  Original points: {n_orig}')
    print(f'  X range: {xs.min():.1f} – {xs.max():.1f}  (span {xs.max()-xs.min():.1f}m)')
    print(f'  Y range: {ys.min():.1f} – {ys.max():.1f}  (span {ys.max()-ys.min():.1f}m)')
    print(f'  Z range: {zs.min():.1f} – {zs.max():.1f}')

    # ── 2. Build convex hull of original XY footprint ──
    xy_orig = np.column_stack([xs, ys])
    hull = ConvexHull(xy_orig)
    print(f'  Convex hull: {len(hull.vertices)} vertices')

    # ── 3. Create regular XY grid ──
    x_min, x_max = xs.min(), xs.max()
    y_min, y_max = ys.min(), ys.max()

    # Add a small margin so edge points aren't clipped
    margin = spacing * 0.5
    grid_x = np.arange(x_min - margin, x_max + margin + spacing, spacing)
    grid_y = np.arange(y_min - margin, y_max + margin + spacing, spacing)
    n_ix = len(grid_x)
    n_iy = len(grid_y)
    print(f'  Regular grid: {n_ix} x {n_iy} = {n_ix * n_iy} cells @ {spacing}m spacing')

    gx, gy = np.meshgrid(grid_x, grid_y)  # shape (n_iy, n_ix)
    grid_points = np.column_stack([gx.ravel(), gy.ravel()])

    # ── 4. Mask grid points to original footprint ──
    inside = point_in_hull(grid_points, hull, tolerance=spacing * 0.1)
    print(f'  Points inside hull: {inside.sum()} / {len(inside)}')

    # ── 5. Interpolate Z values ──
    # Linear interpolation with nearest-neighbor fallback for edges
    z_linear = griddata(xy_orig, zs, grid_points, method='linear')
    z_nearest = griddata(xy_orig, zs, grid_points, method='nearest')

    # Use linear where available, nearest for NaN edges
    z_grid = np.where(np.isnan(z_linear), z_nearest, z_linear)

    # ── 5b. Two-pass edge clamping ──
    from scipy.spatial import cKDTree
    inside_2d = inside.reshape(n_iy, n_ix)
    z_2d = z_grid.reshape(n_iy, n_ix)

    # Pass 1: Snap NN-fallback cells to nearest linearly-interpolated cell
    nn_fallback = np.isnan(z_linear) & inside
    has_linear  = ~np.isnan(z_linear) & inside
    n_fallback = nn_fallback.sum()
    print(f'  Linear interp cells: {has_linear.sum()}, NN-fallback cells: {n_fallback}')

    if n_fallback > 0 and has_linear.sum() > 0:
        has_linear_2d = has_linear.reshape(n_iy, n_ix)
        nn_fallback_2d = nn_fallback.reshape(n_iy, n_ix)
        lin_ys, lin_xs = np.where(has_linear_2d)
        fb_ys, fb_xs = np.where(nn_fallback_2d)
        tree = cKDTree(np.column_stack([lin_xs, lin_ys]))
        _, nearest_idx = tree.query(np.column_stack([fb_xs, fb_ys]))
        for i in range(len(fb_ys)):
            z_2d[fb_ys[i], fb_xs[i]] = z_2d[lin_ys[nearest_idx[i]], lin_xs[nearest_idx[i]]]
        print(f'  Pass 1: {n_fallback} NN-fallback cells clamped')

    # Pass 2: Iteratively snap boundary rings to nearest interior cell.
    # Each pass peels one ring from the edge and clamps it, going 3 rings deep.
    EDGE_RINGS = 3
    remaining_inside = inside_2d.copy()
    total_edge_clamped = 0

    for ring in range(EDGE_RINGS):
        edge_mask = np.zeros_like(remaining_inside, dtype=bool)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                shifted = np.zeros_like(remaining_inside)
                src_y = slice(max(0, -dy), n_iy + min(0, -dy))
                src_x = slice(max(0, -dx), n_ix + min(0, -dx))
                dst_y = slice(max(0, dy), n_iy + min(0, dy))
                dst_x = slice(max(0, dx), n_ix + min(0, dx))
                shifted[dst_y, dst_x] = remaining_inside[src_y, src_x]
                edge_mask |= (remaining_inside & ~shifted)

        n_edge = edge_mask.sum()
        if n_edge == 0:
            break

        interior_mask = remaining_inside & ~edge_mask
        if interior_mask.sum() == 0:
            break

        interior_ys, interior_xs = np.where(interior_mask)
        edge_ys, edge_xs = np.where(edge_mask)
        tree = cKDTree(np.column_stack([interior_xs, interior_ys]))
        _, nearest_idx = tree.query(np.column_stack([edge_xs, edge_ys]))
        for i in range(len(edge_ys)):
            z_2d[edge_ys[i], edge_xs[i]] = z_2d[interior_ys[nearest_idx[i]], interior_xs[nearest_idx[i]]]
        total_edge_clamped += n_edge

        # Peel this ring off for the next iteration
        remaining_inside = interior_mask

    if total_edge_clamped > 0:
        print(f'  Pass 2: {total_edge_clamped} boundary cells clamped ({EDGE_RINGS} rings)')

    z_grid = z_2d.ravel()

    # ── 6. Write output CSV ──
    n_written = 0
    with open(output_file, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['IL', 'XL', 'X', 'Y', 'Z'])

        for i in range(len(grid_points)):
            if not inside[i]:
                continue

            # Grid indices (row = IL, col = XL)
            row_idx = i // n_ix  # which Y row
            col_idx = i % n_ix   # which X column

            x_val = grid_points[i, 0]
            y_val = grid_points[i, 1]
            z_val = z_grid[i]

            writer.writerow([col_idx, row_idx,
                             f'{x_val:.2f}', f'{y_val:.2f}', f'{z_val:.3f}'])
            n_written += 1

    print(f'  Written: {n_written} points → {output_file}')
    print(f'  Ratio: {n_written/n_orig:.2f}x original count')
    return n_written


def main():
    total = 0
    for fname in HORIZON_FILES:
        out_fname = fname.replace('_hires.csv', '_hires_regrid.csv')
        n = regrid_horizon(fname, out_fname)
        total += n

    print(f'\n{"="*60}')
    print(f'Done! Regridded {len(HORIZON_FILES)} horizons, {total} total points.')
    print(f'{"="*60}')


if __name__ == '__main__':
    main()
