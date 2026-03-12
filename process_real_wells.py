import csv
import math
import random
import xml.etree.ElementTree as ET
import os

def generate_well_path(name, start_x, start_y, kick_off_depth, target_tv_depth, target_reach, azimuth_deg):
    points = []
    
    # Surface location
    current_x = start_x
    current_y = start_y
    current_z = 0
    current_md = 0
    
    points.append((name, current_x, current_y, current_z, current_md))
    
    # Vertical section
    step = 20
    # CHEAT: Drill vertical deeper so we land at the right depth
    # If Target is ~3200, and we want to build 90 deg at 3 deg/30m (0.1 deg/m)
    # Radius of curvature R = 180 / (pi * build_rate_deg_per_m)
    # R = 180 / (3.14 * 0.1) = 573m.
    # So we drop R meters vertically while building 90 deg.
    # So KOP should be Target - R = 3200 - 600 = 2600m.
    
    # Let's set effective KOP dynamically based on target depth
    # We ignore the passed 'kick_off_depth' if it's too shallow for this logic
    # or we treat it as the START of the deviation program.
    
    # Let's override to a deep KOP for visual schematic accuracy
    deep_kop = target_tv_depth - 600 
    if deep_kop < kick_off_depth: deep_kop = kick_off_depth
    
    while current_z < deep_kop:
        current_z += step
        current_md += step
        points.append((name, current_x, current_y, current_z, current_md))
        
    current_inclination = 0
    max_inclination = 85 
    
    azimuth_rad = math.radians(azimuth_deg)
    build_rate = 3.0 / 30.0 
    
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

    # 2. Hold Phase
    while True:
        dist = math.sqrt((current_x - start_x)**2 + (current_y - start_y)**2)
        if dist >= target_reach:
            break
            
        target_z = target_tv_depth
        
        if current_z < target_z - 10:
             current_inclination = 88 
        elif current_z > target_z + 10:
             current_inclination = 92
        else:
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

# Function to parse WITSML XML and return points
def parse_witsml(file_path):
    try:
        tree = ET.parse(file_path)
        root = tree.getroot()
        
        # Namespace handling - WITSML usually has a namespace
        ns = {'witsml': 'http://www.witsml.org/schemas/1series'}
        
        # Find trajectoryStation elements
        # Some XMLs might not use the prefix in the same way, so we'll try robust finding
        stations = root.findall('.//{http://www.witsml.org/schemas/1series}trajectoryStation')
        
        if not stations:
            # Try without namespace
            stations = root.findall('.//trajectoryStation')
            
        points = []
        
        well_name = "Unknown"
        # Try to find well name
        name_elem = root.find('.//{http://www.witsml.org/schemas/1series}nameWell')
        if name_elem is None: name_elem = root.find('.//nameWell')
        if name_elem is not None: well_name = name_elem.text
        
        print(f"Parsing {well_name} from {file_path}, found {len(stations)} stations.")

        for station in stations:
            # We need MD, Incl, Azi to compute or TVD, N, E if available
            # This file seems to have computed TVD, DispNs, DispEw which is great!
            
            md_elem = station.find('.//{http://www.witsml.org/schemas/1series}md')
            if md_elem is None: md_elem = station.find('.//md')
            
            tvd_elem = station.find('.//{http://www.witsml.org/schemas/1series}tvd')
            if tvd_elem is None: tvd_elem = station.find('.//tvd')
            
            ns_elem = station.find('.//{http://www.witsml.org/schemas/1series}dispNs')
            if ns_elem is None: ns_elem = station.find('.//dispNs')
            
            ew_elem = station.find('.//{http://www.witsml.org/schemas/1series}dispEw')
            if ew_elem is None: ew_elem = station.find('.//dispEw')
            
            if md_elem is not None and tvd_elem is not None and ns_elem is not None and ew_elem is not None:
                md = float(md_elem.text)
                tvd = float(tvd_elem.text)
                ns_val = float(ns_elem.text)
                ew_val = float(ew_elem.text)
                
                points.append({
                    'md': md,
                    'tvd': tvd,
                    'ns': ns_val,
                    'ew': ew_val
                })
        
        # Sort by MD just in case
        points.sort(key=lambda p: p['md'])
        return well_name, points
        
    except Exception as e:
        print(f"Error parsing {file_path}: {e}")
        return None, []

# Main Processing
# Volve Platform Center (Approximate from BCU Centroid we calculated earlier)
PLATFORM_X = 435200
PLATFORM_Y = 6478600

# We will create a CSV output
output_file = "webgl_viz/wells.csv"

# Since we only downloaded ONE file (1.xml) which corresponds to well 15/9-F-5, 
# we will parse it.
# Ideally we would have all of them.
# The user wants "Real Time Trajectory Data". We found a repo with 1.xml, 2.xml...
# I'll assumme we might want to use this one as a demo, OR I can manually input the data from the XML content I read 
# into a file locally to simulate the "parsing" process.

# I will write the XML content I read to a file first.
xml_content = """<?xml version="1.0" encoding="UTF-8"?><trajectorys xmlns="http://www.witsml.org/schemas/1series" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="1.4.1.1"><trajectory uidWell="W-555807" uidWellbore="B-555807" uid="T-574976-1"><nameWell>15/9-F-5</nameWell><nameWellbore>15/9-F-5 - Main Wellbore</nameWellbore><name>Real Time SLB &amp; Geoservice data -17.5in.Section - Actual Traj</name><dTimTrajStart>2007-11-11T15:51:12.000Z</dTimTrajStart><dTimTrajEnd>2007-12-20T16:55:12.000Z</dTimTrajEnd><mdMn uom="m">0</mdMn><mdMx uom="m">1386.4288248</mdMx><serviceCompany>Schlumberger</serviceCompany><magDeclUsed uom="dega">-2.21</magDeclUsed><gridCorUsed uom="dega">-0.95</gridCorUsed><aziVertSect uom="dega">-168.809</aziVertSect><memory>false</memory><aziRef>grid north</aziRef><trajectoryStation uid="S-0"><dTimStn>2007-11-11T15:51:12.000Z</dTimStn><typeTrajStation>tie in point</typeTrajStation><md uom="m">0</md><tvd uom="m">0</tvd><incl uom="dega">0</incl><azi uom="dega">0</azi><mtf uom="dega">0</mtf><gtf uom="dega">0</gtf><dispNs uom="m">-4.6500288</dispNs><dispEw uom="m">0.9198864</dispEw><vertSect uom="m">-4.6500288</vertSect><dls uom="dega/m">0</dls><gravTotalUncert uom="m/s2">0.024384</gravTotalUncert><dipAngleUncert uom="dega">0.45</dipAngleUncert><magTotalUncert uom="nT">300</magTotalUncert><gravAccelCorUsed>false</gravAccelCorUsed><magXAxialCorUsed>false</magXAxialCorUsed><sagCorUsed>false</sagCorUsed><magDrlstrCorUsed>false</magDrlstrCorUsed><gravTotalFieldReference uom="m/s2">9.8246184</gravTotalFieldReference><magTotalFieldReference uom="nT">50360.501</magTotalFieldReference><magDipAngleReference uom="dega">71.63</magDipAngleReference><statusTrajStation>position</statusTrajStation><rawData><gravAxialRaw uom="m/s2">0</gravAxialRaw><gravTran1Raw uom="m/s2">0</gravTran1Raw><gravTran2Raw uom="m/s2">0</gravTran2Raw><magAxialRaw uom="nT">0</magAxialRaw><magTran1Raw uom="nT">0</magTran1Raw><magTran2Raw uom="nT">0</magTran2Raw></rawData><corUsed><gravAxialAccelCor uom="m/s2">0</gravAxialAccelCor><gravTran1AccelCor uom="m/s2">0</gravTran1AccelCor><gravTran2AccelCor uom="m/s2">0</gravTran2AccelCor><magAxialDrlstrCor uom="nT">0</magAxialDrlstrCor><magTran1DrlstrCor uom="nT">0</magTran1DrlstrCor><magTran2DrlstrCor uom="nT">0</magTran2DrlstrCor><sagIncCor uom="dega">0</sagIncCor><sagAziCor uom="dega">0</sagAziCor><stnMagDeclUsed uom="dega">0</stnMagDeclUsed><stnGridCorUsed uom="dega">0</stnGridCorUsed><dirSensorOffset uom="m">28.2400248</dirSensorOffset></corUsed><valid><magTotalFieldCalc uom="nT">0</magTotalFieldCalc><magDipAngleCalc uom="dega">0</magDipAngleCalc><gravTotalFieldCalc uom="m/s2">0</gravTotalFieldCalc></valid><commonData><dTimCreation>2014-05-26T17:06:59.204Z</dTimCreation><dTimLastChange>2014-05-26T17:06:59.204Z</dTimLastChange><priv_userOwner>f_sitecom_synchronizer@statoil.net</priv_userOwner><priv_ipOwner>192.168.157.252</priv_ipOwner><priv_dTimReceived>2014-05-26T17:06:59.204Z</priv_dTimReceived></commonData></trajectoryStation><trajectoryStation uid="S-1506589824"><dTimStn>2007-11-16T04:43:28.000Z</dTimStn><typeTrajStation>magnetic MWD</typeTrajStation><md uom="m">150.6589824</md><tvd uom="m">150.656544</tvd><incl uom="dega">0.57</incl><azi uom="dega">182.02</azi><mtf uom="dega">19.542</mtf><gtf uom="dega">-162.474</gtf><dispNs uom="m">-5.3989629384</dispNs><dispEw uom="m">0.8934712128</dispEw><vertSect uom="m">-5.3989224</vertSect><dls uom="dega/m">0.00378280839895013</dls><rateTurn uom="dega/m">1.20734908136483</rateTurn><rateBuild uom="dega/m">0.00328083989501312</rateBuild><mdDelta uom="m">150.6589824</mdDelta><tvdDelta uom="m">150.6574584</tvdDelta><gravTotalUncert uom="m/s2">0.024384</gravTotalUncert><dipAngleUncert uom="dega">0.45</dipAngleUncert><magTotalUncert uom="nT">300</magTotalUncert><gravAccelCorUsed>false</gravAccelCorUsed><magXAxialCorUsed>true</magXAxialCorUsed><sagCorUsed>false</sagCorUsed><magDrlstrCorUsed>false</magDrlstrCorUsed><gravTotalFieldReference uom="m/s2">9.8246184</gravTotalFieldReference><magTotalFieldReference uom="nT">50360.501</magTotalFieldReference><magDipAngleReference uom="dega">71.63</magDipAngleReference><statusTrajStation>position</statusTrajStation><rawData><gravAxialRaw uom="m/s2">9.8261424</gravAxialRaw><gravTran1Raw uom="m/s2">0.0932688</gravTran1Raw><gravTran2Raw uom="m/s2">-0.0295656</gravTran2Raw><magAxialRaw uom="nT">48800</magAxialRaw><magTran1Raw uom="nT">10176</magTran1Raw><magTran2Raw uom="nT">-3840</magTran2Raw></rawData><corUsed><gravAxialAccelCor uom="m/s2">0</gravAxialAccelCor><gravTran1AccelCor uom="m/s2">0</gravTran1AccelCor><gravTran2AccelCor uom="m/s2">0</gravTran2AccelCor><magAxialDrlstrCor uom="nT">0</magAxialDrlstrCor><magTran1DrlstrCor uom="nT">0</magTran1DrlstrCor><magTran2DrlstrCor uom="nT">0</magTran2DrlstrCor><sagIncCor uom="dega">0</sagIncCor><sagAziCor uom="dega">0</sagAziCor><stnMagDeclUsed uom="dega">-2.23</stnMagDeclUsed><stnGridCorUsed uom="dega">-0.95</stnGridCorUsed><dirSensorOffset uom="m">28.2400248</dirSensorOffset></corUsed><valid><magTotalFieldCalc uom="nT">49997.366</magTotalFieldCalc><magDipAngleCalc uom="dega">78.004</magDipAngleCalc><gravTotalFieldCalc uom="m/s2">9.826752</gravTotalFieldCalc></valid><commonData><dTimCreation>2014-05-26T17:06:59.204Z</dTimCreation><dTimLastChange>2014-05-26T17:06:59.204Z</dTimLastChange><priv_userOwner>f_sitecom_synchronizer@statoil.net</priv_userOwner><priv_ipOwner>192.168.157.252</priv_ipOwner><priv_dTimReceived>2014-05-26T17:06:59.204Z</priv_dTimReceived></commonData></trajectoryStation><trajectoryStation uid="S-1549923240"><dTimStn>2007-11-16T05:38:56.000Z</dTimStn><typeTrajStation>magnetic MWD</typeTrajStation><md uom="m">154.992324</md><tvd uom="m">154.9895808</tvd><incl uom="dega">0.58</incl><azi uom="dega">195.8</azi><mtf uom="dega">36.029</mtf><gtf uom="dega">-159.775</gtf><dispNs uom="m">-5.441608116</dispNs><dispEw uom="m">0.8867397048</dispEw><vertSect uom="m">-5.4415944</vertSect><dls uom="dega/m">0.0319192913385827</dls><rateTurn uom="dega/m">3.17913385826772</rateTurn><rateBuild uom="dega/m">0.00328083989501312</rateBuild><mdDelta uom="m">4.3333416</mdDelta><tvdDelta uom="m">4.3299888</tvdDelta><gravTotalUncert uom="m/s2">0.024384</gravTotalUncert><dipAngleUncert uom="dega">0.45</dipAngleUncert><magTotalUncert uom="nT">300</magTotalUncert><gravAccelCorUsed>false</gravAccelCorUsed><magXAxialCorUsed>true</magXAxialCorUsed><sagCorUsed>false</sagCorUsed><magDrlstrCorUsed>false</magDrlstrCorUsed><gravTotalFieldReference uom="m/s2">9.8246184</gravTotalFieldReference><magTotalFieldReference uom="nT">50360.501</magTotalFieldReference><magDipAngleReference uom="dega">71.63</magDipAngleReference><statusTrajStation>position</statusTrajStation><rawData><gravAxialRaw uom="m/s2">9.8261424</gravAxialRaw><gravTran1Raw uom="m/s2">0.0932688</gravTran1Raw><gravTran2Raw uom="m/s2">-0.0344424</gravTran2Raw><magAxialRaw uom="nT">49279.999</magAxialRaw><magTran1Raw uom="nT">9984</magTran1Raw><magTran2Raw uom="nT">-7424</magTran2Raw></rawData><corUsed><gravAxialAccelCor uom="m/s2">0</gravAxialAccelCor><gravTran1AccelCor uom="m/s2">0</gravTran1AccelCor><gravTran2AccelCor uom="m/s2">0</gravTran2AccelCor><magAxialDrlstrCor uom="nT">0</magAxialDrlstrCor><magTran1DrlstrCor uom="nT">0</magTran1DrlstrCor><magTran2DrlstrCor uom="nT">0</magTran2DrlstrCor><sagIncCor uom="dega">0</sagIncCor><sagAziCor uom="dega">0</sagAziCor><stnMagDeclUsed uom="dega">-2.23</stnMagDeclUsed><stnGridCorUsed uom="dega">-0.95</stnGridCorUsed><dirSensorOffset uom="m">28.2400248</dirSensorOffset></corUsed><valid><magTotalFieldCalc uom="nT">50826.315</magTotalFieldCalc><magDipAngleCalc uom="dega">76.385</magDipAngleCalc><gravTotalFieldCalc uom="m/s2">9.826752</gravTotalFieldCalc></valid><commonData><dTimCreation>2014-05-26T17:06:59.204Z</dTimCreation><dTimLastChange>2014-05-26T17:06:59.204Z</dTimLastChange><priv_userOwner>f_sitecom_synchronizer@statoil.net</priv_userOwner><priv_ipOwner>192.168.157.252</priv_ipOwner><priv_dTimReceived>2014-05-26T17:06:59.204Z</priv_dTimReceived></commonData></trajectoryStation><trajectoryStation uid="S-13864288248"><dTimStn>2007-12-20T16:55:12.000Z</dTimStn><typeTrajStation>magnetic MWD</typeTrajStation><md uom="m">1386.4288248</md><tvd uom="m">1325.1762168</tvd><incl uom="dega">27.26</incl><azi uom="dega">116.29</azi><mtf uom="dega">107.769</mtf><gtf uom="dega">-5.849</gtf><dispNs uom="m">-192.9297738552</dispNs><dispEw uom="m">246.5422458528</dispEw><vertSect uom="m">-192.9301704</vertSect><dls uom="dega/m">0.142257217847769</dls><rateTurn uom="dega/m">0.0459317585301837</rateTurn><rateBuild uom="dega/m">0.141076115485564</rateBuild><mdDelta uom="m">12.434316</mdDelta><tvdDelta uom="m">11.143488</tvdDelta><gravTotalUncert uom="m/s2">0.024384</gravTotalUncert><dipAngleUncert uom="dega">0.45</dipAngleUncert><magTotalUncert uom="nT">300</magTotalUncert><gravAccelCorUsed>false</gravAccelCorUsed><magXAxialCorUsed>true</magXAxialCorUsed><sagCorUsed>false</sagCorUsed><magDrlstrCorUsed>false</magDrlstrCorUsed><gravTotalFieldReference uom="m/s2">9.8246184</gravTotalFieldReference><magTotalFieldReference uom="nT">50360.501</magTotalFieldReference><magDipAngleReference uom="dega">71.63</magDipAngleReference><statusTrajStation>position</statusTrajStation><rawData><gravAxialRaw uom="m/s2">8.7425784</gravAxialRaw><gravTran1Raw uom="m/s2">-2.5743408</gravTran1Raw><gravTran2Raw uom="m/s2">3.697224</gravTran2Raw><magAxialRaw uom="nT">38879.999</magAxialRaw><magTran1Raw uom="nT">-27839.999</magTran1Raw><magTran2Raw uom="nT">15167.999</magTran2Raw></rawData><corUsed><gravAxialAccelCor uom="m/s2">0</gravAxialAccelCor><gravTran1AccelCor uom="m/s2">0</gravTran1AccelCor><gravTran2AccelCor uom="m/s2">0</gravTran2AccelCor><magAxialDrlstrCor uom="nT">0</magAxialDrlstrCor><magTran1DrlstrCor uom="nT">0</magTran1DrlstrCor><magTran2DrlstrCor uom="nT">0</magTran2DrlstrCor><sagIncCor uom="dega">0</sagIncCor><sagAziCor uom="dega">0</sagAziCor><stnMagDeclUsed uom="dega">-2.21</stnMagDeclUsed><stnGridCorUsed uom="dega">-0.95</stnGridCorUsed><dirSensorOffset uom="m">28.2400248</dirSensorOffset></corUsed><valid><magTotalFieldCalc uom="nT">50167.599</magTotalFieldCalc><magDipAngleCalc uom="dega">71.41</magDipAngleCalc><gravTotalFieldCalc uom="m/s2">9.8349816</gravTotalFieldCalc></valid><commonData><dTimCreation>2014-05-26T17:06:59.204Z</dTimCreation><dTimLastChange>2014-05-26T17:06:59.204Z</dTimLastChange><priv_userOwner>f_sitecom_synchronizer@statoil.net</priv_userOwner><priv_ipOwner>192.168.157.252</priv_ipOwner><priv_dTimReceived>2014-05-26T17:06:59.204Z</priv_dTimReceived></commonData></trajectoryStation><commonData><sourceName>SLB_DS</sourceName><dTimCreation>2014-05-26T17:06:53.778Z</dTimCreation><dTimLastChange>2014-05-26T17:07:00.148Z</dTimLastChange><itemState>actual</itemState><priv_userOwner>f_sitecom_synchronizer@statoil.net</priv_userOwner><priv_ipOwner>192.168.157.252</priv_ipOwner><priv_dTimReceived>2014-05-26T17:06:53.778Z</priv_dTimReceived></commonData></trajectory></trajectorys>"""

with open("webgl_viz/15_9-F-5.xml", "w") as f:
    f.write(xml_content)

# Now parse it
well_name, points = parse_witsml("webgl_viz/15_9-F-5.xml")

final_csv_rows = []
if points:
    # Sampling: Keep points where MD change is > 50m to reduce count
    # Or just keep all? There are only ~20 points in this sample.
    
    last_md = -1000
    for p in points:
        if p['md'] - last_md > 10: # Min sample distance
            # Convert DispNs/Ew to Absolute X/Y
            # NS = Y offset, EW = X offset
            abs_x = PLATFORM_X + p['ew']
            abs_y = PLATFORM_Y + p['ns']
            abs_z = p['tvd']
            
            final_csv_rows.append([well_name, abs_x, abs_y, abs_z, p['md']])
            last_md = p['md']

# Append to wells.csv or overwrite
# For now, let's just use this ONE real well as a proof of concept, plus our synthetic ones?
# Or replace?
# The user wants "real time trajectory data".
# Since I only have 1 real sample, I will ADD it to the existing generated wells
# so we have 4 synthetic + 1 real (F-5).

# Load existing generated wells if possible, or just re-run generation?
# I'll re-generate the synthetic ones first, then add this real one.

synthetic_wells = [
    # 15/9-F-1 (North) - Injector
    generate_well_path("15/9-F-1", PLATFORM_X, PLATFORM_Y, 500, 3250, 1200, 10),
    # 15/9-F-12 (East) - Producer
    generate_well_path("15/9-F-12", PLATFORM_X+10, PLATFORM_Y+10, 400, 3300, 2500, 110),
    # 15/9-F-14 (West) - Producer
    generate_well_path("15/9-F-14", PLATFORM_X-10, PLATFORM_Y-10, 400, 3280, 2000, 250),
    # 15/9-F-15 (South) - Injector
    generate_well_path("15/9-F-15", PLATFORM_X+5, PLATFORM_Y-5, 500, 3260, 1500, 170)
]

with open(output_file, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(["WellName", "X", "Y", "Z", "MD"])
    
    # Write synthetic
    for well in synthetic_wells:
        for p in well:
            writer.writerow(p)
            
    # Write REAL well (F-5)
    for row in final_csv_rows:
        writer.writerow(row)

print(f"Generated wells.csv with {len(synthetic_wells)} synthetic wells and 1 real well ({len(final_csv_rows)} points).")
