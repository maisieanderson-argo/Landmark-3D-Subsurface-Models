#!/usr/bin/env python3
"""
Regrid Volve horizon CSVs to a uniform XY grid.

Same approach as regrid_horizons.py (Norne), applied to the 3 Volve horizons:
  BCU.csv, Hugin_Fm_Top.csv, Hugin_Fm_Base.csv

Interpolates Z onto a regular 12.5m XY grid (matching the ~12.5m average
nearest-neighbor distance in the original data), masks to the convex hull
of the original footprint, and clamps edge-dot Z values to nearest interior
cell to eliminate spike fringe.
"""

import csv
import numpy as np
from scipy.interpolate import griddata
from scipy.spatial import ConvexHull, cKDTree


# Volve horizon files
HORIZON_FILES = [
    'BCU.csv',
    'Hugin_Fm_Top.csv',
    'Hugin_Fm_Base.csv',
]

# Target grid spacing in metres (~12.5m matches avg original spacing)
GRID_SPACING = 12.5


def point_in_hull(points, hull, tolerance=1e-6):
    """Test which points are inside the convex hull. Returns bool array."""
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
    z_linear = griddata(xy_orig, zs, grid_points, method='linear')
    z_nearest = griddata(xy_orig, zs, grid_points, method='nearest')
    z_grid = np.where(np.isnan(z_linear), z_nearest, z_linear)

    # ── 5b. Two-pass edge clamping ──
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

    # Pass 2: Snap boundary-ring cells to nearest interior cell
    edge_mask = np.zeros_like(inside_2d, dtype=bool)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            shifted = np.zeros_like(inside_2d)
            src_y = slice(max(0, -dy), n_iy + min(0, -dy))
            src_x = slice(max(0, -dx), n_ix + min(0, -dx))
            dst_y = slice(max(0, dy), n_iy + min(0, dy))
            dst_x = slice(max(0, dx), n_ix + min(0, dx))
            shifted[dst_y, dst_x] = inside_2d[src_y, src_x]
            edge_mask |= (inside_2d & ~shifted)

    n_edge = edge_mask.sum()
    if n_edge > 0:
        interior_mask = inside_2d & ~edge_mask
        interior_ys, interior_xs = np.where(interior_mask)
        edge_ys, edge_xs = np.where(edge_mask)
        tree = cKDTree(np.column_stack([interior_xs, interior_ys]))
        _, nearest_idx = tree.query(np.column_stack([edge_xs, edge_ys]))
        for i in range(len(edge_ys)):
            z_2d[edge_ys[i], edge_xs[i]] = z_2d[interior_ys[nearest_idx[i]], interior_xs[nearest_idx[i]]]
        print(f'  Pass 2: {n_edge} boundary-ring cells clamped')

    z_grid = z_2d.ravel()

    # ── 6. Write output CSV ──
    n_written = 0
    with open(output_file, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['IL', 'XL', 'X', 'Y', 'Z'])

        for i in range(len(grid_points)):
            if not inside[i]:
                continue

            row_idx = i // n_ix  # Y row
            col_idx = i % n_ix   # X column

            writer.writerow([col_idx, row_idx,
                             f'{grid_points[i, 0]:.2f}',
                             f'{grid_points[i, 1]:.2f}',
                             f'{z_grid[i]:.3f}'])
            n_written += 1

    print(f'  Written: {n_written} points → {output_file}')
    print(f'  Ratio: {n_written/n_orig:.2f}x original count')
    return n_written


def main():
    total = 0
    for fname in HORIZON_FILES:
        base = fname.replace('.csv', '')
        out_fname = f'{base}_regrid.csv'
        n = regrid_horizon(fname, out_fname)
        total += n

    print(f'\n{"="*60}')
    print(f'Done! Regridded {len(HORIZON_FILES)} Volve horizons, {total} total points.')
    print(f'{"="*60}')


if __name__ == '__main__':
    main()
