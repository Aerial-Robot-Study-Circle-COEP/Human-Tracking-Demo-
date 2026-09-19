import os
import csv
import math
import itertools
import tempfile
from datetime import datetime
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask import Flask, render_template

import time

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app, resources={r"/*": {"origins": "*"}})

UPLOAD_FOLDER = "./received_csvs"
MISSION_FOLDER = "./generated_missions"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(MISSION_FOLDER, exist_ok=True)

# Store latest received CSV
latest_csv = None
current_detections = []  # Accumulate all people across exports

# ================= TSP FUNCTIONS =================
def haversine(p1, p2):
    """Calculate distance between two lat/lon points in meters"""
    R = 6371000.0
    lat1, lon1 = math.radians(p1[0]), math.radians(p1[1])
    lat2, lon2 = math.radians(p2[0]), math.radians(p2[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2)**2 + \
        math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def path_distance(start, path):
    """Calculate total path distance"""
    dist = 0.0
    cur = start
    for p in path:
        dist += haversine(cur, p)
        cur = p
    return dist

def brute_force_tsp(home, points):
    """Solve TSP using brute force"""
    if len(points) > 10:
        print(f"[WARN] {len(points)} points is too many for brute force, using as-is")
        return path_distance(home, points), points
    
    best_dist = float("inf")
    best_path = None
    for perm in itertools.permutations(points):
        d = path_distance(home, perm)
        if d < best_dist:
            best_dist = d
            best_path = perm
    return best_dist, best_path

def load_coords_from_csv(filepath):
    """Load coordinates from final_person_geotags.csv"""
    coords = []
    with open(filepath, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            lat = float(row["Final_Lat"])
            lon = float(row["Final_Lon"])
            coords.append((lat, lon))
    return coords

def generate_waypoints(home, path, altitude=15, hold_time=3):
    """Generate QGC waypoint file"""
    lines = ["QGC WPL 110"]
    seq = 0
    home_lat, home_lon = home
    
    # HOME
    lines.append(f"{seq}\t1\t0\t16\t0\t0\t0\t0\t{home_lat:.7f}\t{home_lon:.7f}\t{altitude}\t1")
    seq += 1
    
    # TAKEOFF
    lines.append(f"{seq}\t0\t3\t22\t0\t0\t0\t0\t{home_lat:.7f}\t{home_lon:.7f}\t{altitude}\t1")
    seq += 1
    
    # WAYPOINTS
    for lat, lon in path:
        lines.append(
            f"{seq}\t0\t3\t16\t{hold_time}\t0\t0\t0\t{lat:.7f}\t{lon:.7f}\t{altitude}\t1"
        )
        seq += 1
    
    # RTL
    lines.append(
        f"{seq}\t0\t3\t21\t0\t0\t0\t0\t{home_lat:.7f}\t{home_lon:.7f}\t{altitude}\t1"
    )
    
    return "\n".join(lines)


# Serve the main dashboard
@app.route('/')
def index():
    return render_template('index.html')  # your frontend HTML

@app.route('/upload_csv', methods=['POST'])
def upload_csv():
    """Receive CSV from Drone 1 - REPLACES previous detections"""
    global latest_csv, current_detections
    
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "Empty filename"}), 400
    
    # Save received CSV
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"received_{timestamp}.csv"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)
    
    latest_csv = filepath
    
    print(f"[GCS] Received CSV: {filepath}")
    
    # CLEAR previous detections and load new ones
    try:
        current_detections = load_coords_from_csv(filepath)
        
        print(f"[GCS] Loaded {len(current_detections)} people (previous cleared)")
        
        return jsonify({
            "message": "CSV received successfully",
            "filename": filename,
            "people_detected": len(current_detections)
        })
    except Exception as e:
        return jsonify({"error": f"Invalid CSV: {str(e)}"}), 400

@app.route('/optimize_mission', methods=['POST'])
def optimize_mission():
    """Optimize path using current detections"""
    global current_detections
    
    if len(current_detections) == 0:
        return jsonify({"error": "No people detected yet. Upload CSV first."}), 404
    
    try:
        # Get parameters
        data = request.json or {}
        home_lat = data.get("home_lat")
        home_lon = data.get("home_lon")
        altitude = data.get("altitude", 15)
        hold_time = data.get("hold_time", 3)
        
        if home_lat is None or home_lon is None:
            return jsonify({"error": "home_lat and home_lon required"}), 400
        
        home = (float(home_lat), float(home_lon))
        
        print(f"[GCS] Optimizing path for {len(current_detections)} people...")
        
        # Run TSP optimization
        best_dist, best_path = brute_force_tsp(home, current_detections)
        
        print(f"[GCS] Optimal path: {best_dist:.2f}m")
        
        # Generate mission file
        mission_text = generate_waypoints(home, best_path, altitude, hold_time)
        
        # Save mission file
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        mission_filename = f"optimized_mission_{timestamp}.waypoints"
        mission_filepath = os.path.join(MISSION_FOLDER, mission_filename)
        
        with open(mission_filepath, 'w') as f:
            f.write(mission_text)
        
        print(f"[GCS] Mission saved: {mission_filepath}")
        
        # Return mission file
        return send_file(
            mission_filepath,
            as_attachment=True,
            download_name="optimized_mission.waypoints",
            mimetype="text/plain"
        )
        
    except Exception as e:
        print(f"[ERROR] Optimization failed: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
        
        
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

