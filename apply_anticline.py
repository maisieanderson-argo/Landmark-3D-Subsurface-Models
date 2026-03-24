#!/usr/bin/env python3
"""
apply_anticline.py  – Reshape the regional surface so the Norne field sits on
a structural high (anticline), as expected for a hydrocarbon trap.

Problem: The Are formation topology (Z_CONFORM) has shallow values (~1000m) at
the grid edges and deeper values (~2400m) near the survey.  This makes the Norne
survey area sit in a visual basin/syncline.

Solution: Two adjustments applied to the *backup* (original) CSV data:

1. Z_CONFORM  – Add an "inverted Gaussian" offset that pushes the SURROUNDING
   hills deeper while leaving the survey area untouched.  This eliminates the
   towering hills around the survey.  offset = BASIN_FILL * (1 - gaussian)

2. Z_POLY     – Add a standard Gaussian dome that makes the smooth trend
   shallower at the survey center, creating a gentle anticline crest.

Usage:
    cd webgl_viz
    python3 apply_anticline.py
"""

import csv
import math
import shutil
import os

# ── Configuration ────────────────────────────────────────────────────────────
CSV_FILE    = "Norne_Are_Regional.csv"
BACKUP_FILE = "Norne_Are_Regional.csv.bak"

# Survey center (where DIST ≈ 0 in the existing CSV)
CENTER_X = 453762.0
CENTER_Y = 7316123.7

# ── Z_CONFORM: push surrounding hills deeper ────────────────────────────────
# At far edges: Z_CONFORM increases by BASIN_FILL (deeper = sits lower in 3D)
# At survey center: no change (gaussian = 1, so 1 - 1 = 0)
BASIN_FILL       = 1400.0   # metres added to Z_CONFORM at the farthest edges
BASIN_SIGMA      = 10000.0  # Gaussian sigma for the transition (10 km)

# ── Z_POLY: create an anticline dome on the smooth trend ─────────────────────
DOME_AMPLITUDE   = 1200.0   # metres Z_POLY is reduced at the crest
DOME_SIGMA       = 12000.0  # Gaussian sigma (12 km radius)


def main():
    # 1. Read from BACKUP (original untouched data) if it exists, else from CSV
    source = BACKUP_FILE if os.path.exists(BACKUP_FILE) else CSV_FILE
    rows = []
    with open(source, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            rows.append(row)
    print(f"Read {len(rows)} rows from {source}")

    # 2. Create backup of the very first original if needed
    if not os.path.exists(BACKUP_FILE):
        shutil.copy2(CSV_FILE, BACKUP_FILE)
        print(f"Backed up original to {BACKUP_FILE}")

    # 3. Apply adjustments
    for row in rows:
        x  = float(row["X"])
        y  = float(row["Y"])
        dx = x - CENTER_X
        dy = y - CENTER_Y
        r2 = dx * dx + dy * dy

        # ── Z_CONFORM: inverted Gaussian (push far areas deeper) ─────────
        gauss_basin = math.exp(-r2 / (2.0 * BASIN_SIGMA ** 2))
        conform_offset = BASIN_FILL * (1.0 - gauss_basin)
        old_zc = float(row["Z_CONFORM"])
        row["Z_CONFORM"] = f"{old_zc + conform_offset:.2f}"

        # ── Z_POLY: standard Gaussian dome (make center shallower) ───────
        gauss_dome = math.exp(-r2 / (2.0 * DOME_SIGMA ** 2))
        dome_delta = DOME_AMPLITUDE * gauss_dome
        old_zp = float(row["Z_POLY"])
        row["Z_POLY"] = f"{old_zp - dome_delta:.2f}"

    # 4. Stats
    zc_vals = [float(r["Z_CONFORM"]) for r in rows]
    zp_vals = [float(r["Z_POLY"]) for r in rows]
    print(f"Z_CONFORM range: {min(zc_vals):.0f} – {max(zc_vals):.0f}")
    print(f"Z_POLY range:    {min(zp_vals):.0f} – {max(zp_vals):.0f}")

    # 5. Write
    with open(CSV_FILE, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote modified {CSV_FILE}")
    print("Refresh the viewer to see the anticline.")


if __name__ == "__main__":
    main()
