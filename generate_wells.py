import csv
import math
import random

def generate_well_path(name, start_x, start_y, kick_off_depth, target_tv_depth, target_reach, azimuth_deg):
    points = []
    
    # Surface location
    current_x = start_x
    current_y = start_y
    current_z = 0
    current_md = 0
    
    points.append((name, current_x, current_y, current_z, current_md))
    
    # Vertical section (Drill straight down to KOP)
    step = 20
    while current_z < kick_off_depth:
        current_z += step
        current_md += step
        points.append((name, current_x, current_y, current_z, current_md))
        
    # Build Section (Build angle to hit target depth at reasonable angle)
    # We want to build to near horizontal (approx 80-90 deg) by the time we hit target TVD?
    # Actually, simpler: Build to ~85 degrees, then Hold.
    
    current_inclination = 0
    max_inclination = 85 # High angle to get horizontal reach
    
    azimuth_rad = math.radians(azimuth_deg)
    build_rate = 3.0 / 30.0 # 3 deg per 30m
    
    # 1. Build Phase
    while current_inclination < max_inclination:
        current_inclination += build_rate * step
        if current_inclination > max_inclination: current_inclination = max_inclination
        
        inclination_rad = math.radians(current_inclination)
        
        dz = step * math.cos(inclination_rad)
        d_horiz = step * math.sin(inclination_rad)
        
        dx = d_horiz * math.sin(azimuth_rad)
        dy = d_horiz * math.cos(azimuth_rad)
        
        current_x += dx
        current_y += dy
        current_z += dz
        current_md += step
        
        points.append((name, current_x, current_y, current_z, current_md))

    # 2. Hold Phase (Drill until Target Reach is achieved)
    # Target Reach is radial distance from center
    
    while True:
        # Calculate current displacement from start
        dist = math.sqrt((current_x - start_x)**2 + (current_y - start_y)**2)
        if dist >= target_reach:
            break
            
        # Check if we are too deep?
        # Simulate geosteering: If we go below target_tv_depth, we drop angle (steer up)
        # If we are above, we build (steer down)
        # Simple clamp logic for visual schematic:
        
        # If we are getting too deep (approaching 3150), level off to 90
        # If we are shallow (above 3000), drop to 85
        
        # Simple visual logic: stay between target_tv_depth +/- 20m
        # Let's just drift slightly down then hold flat at Target TVD
        
        target_z = target_tv_depth
        
        if current_z < target_z - 10:
             # Too shallow, dive
             current_inclination = 88 
        elif current_z > target_z + 10:
             # Too deep, climb
             current_inclination = 92
        else:
             # On target, horizontal
             current_inclination = 90
             
        inclination_rad = math.radians(current_inclination)
        
        dz = step * math.cos(inclination_rad)
        d_horiz = step * math.sin(inclination_rad)
        
        dx = d_horiz * math.sin(azimuth_rad)
        dy = d_horiz * math.cos(azimuth_rad)
        
        current_x += dx
        current_y += dy
        current_z += dz
        current_md += step
        
        points.append((name, current_x, current_y, current_z, current_md))

    return points

wells = []

# Platform Center (BCU Centroid)
px = 435200
py = 6478600

# Average Reservoir Depth ~3100m
res_depth = 3100 

# Well 1: 15/9-F-1 (North Injector)
# Target: North. Reach ~1200m
wells.extend(generate_well_path("15/9-F-1", px, py, 500, res_depth, 1200, 10))

# Well 2: 15/9-F-12 (Main Producer - East)
# Target: East-Southeast. Reach ~2500m (Long reach)
wells.extend(generate_well_path("15/9-F-12", px+10, py+10, 400, res_depth, 2500, 110))

# Well 3: 15/9-F-14 (Main Producer - West)
# Target: West-Southwest. Reach ~2000m
wells.extend(generate_well_path("15/9-F-14", px-10, py-10, 400, res_depth, 2000, 250))

# Well 4: 15/9-F-15 (South Injector)
# Target: South. Reach ~1500m
wells.extend(generate_well_path("15/9-F-15", px+5, py-5, 500, res_depth, 1500, 170))

with open('wells.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(["WellName", "X", "Y", "Z", "MD"])
    for p in wells:
        writer.writerow(p)

print("wells.csv generated with", len(wells), "points.")
