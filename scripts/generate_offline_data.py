#!/usr/bin/env python3
import os
import csv
import json

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(BASE_DIR, 'output')
OFFLINE_DATA_DIR = os.path.join(BASE_DIR, 'offline-ui', 'data')

def ensure_dirs():
    os.makedirs(OFFLINE_DATA_DIR, exist_ok=True)

def read_csv(filename):
    path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(path):
        # Fall back to sample_data if output doesn't exist
        path = os.path.join(BASE_DIR, 'sample_data', filename.replace('.csv', '_sample.csv'))
        if not os.path.exists(path):
            print(f"Warning: File {filename} not found.")
            return []
    
    data = []
    with open(path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            data.append(row)
    return data

def process_catalog():
    print("Processing pulsar catalog...")
    catalog = read_csv('pulsar_catalog.csv')
    processed = []
    for row in catalog:
        try:
            processed.append({
                'name': row.get('name', ''),
                'ra': row.get('ra', ''),
                'dec': row.get('dec', ''),
                'ra_deg': float(row.get('ra_deg', 0)) if row.get('ra_deg') else 0.0,
                'dec_deg': float(row.get('dec_deg', 0)) if row.get('dec_deg') else 0.0,
                'f0': float(row.get('f0', 0)) if row.get('f0') else 0.0,
                'f1': float(row.get('f1', 0)) if row.get('f1') else 0.0,
                'pepoch': float(row.get('pepoch', 0)) if row.get('pepoch') else 0.0,
                'dm': float(row.get('dm', 0)) if row.get('dm') else 0.0,
                'start_mjd': float(row.get('start_mjd', 0)) if row.get('start_mjd') else 0.0,
                'finish_mjd': float(row.get('finish_mjd', 0)) if row.get('finish_mjd') else 0.0,
            })
        except ValueError as e:
            print(f"Error parsing row: {row}, error: {e}")
            
    out_path = os.path.join(OFFLINE_DATA_DIR, 'pulsar_catalog.js')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(f"// Precompiled Pulsar Catalog Data\nconst PULSAR_CATALOG_DATA = {json.dumps(processed, indent=2)};\n")
    print(f"Wrote {len(processed)} pulsars to {out_path}")

def process_ranked_pulsars():
    print("Processing ranked pulsars...")
    ranked = read_csv('ranked_pulsars.csv')
    processed = []
    for row in ranked:
        try:
            processed.append({
                'name': row.get('name', ''),
                'score': float(row.get('score', 0)) if row.get('score') else 0.0,
                'measurement_score': float(row.get('measurement_score', 0)) if row.get('measurement_score') else 0.0,
                'duration_score': float(row.get('duration_score', 0)) if row.get('duration_score') else 0.0,
                'toa_count_score': float(row.get('toa_count_score', 0)) if row.get('toa_count_score') else 0.0,
                'spin_stability_score': float(row.get('spin_stability_score', 0)) if row.get('spin_stability_score') else 0.0,
                'sky_distribution_score': float(row.get('sky_distribution_score', 0)) if row.get('sky_distribution_score') else 0.0,
                'n_toas': int(row.get('n_toas', 0)) if row.get('n_toas') else 0,
                'duration_days': float(row.get('duration_days', 0)) if row.get('duration_days') else 0.0,
                'median_error_us': float(row.get('median_error_us', 0)) if row.get('median_error_us') else 0.0,
                'ra_deg': float(row.get('ra_deg', 0)) if row.get('ra_deg') else 0.0,
                'dec_deg': float(row.get('dec_deg', 0)) if row.get('dec_deg') else 0.0,
                'x': float(row.get('x', 0)) if row.get('x') else 0.0,
                'y': float(row.get('y', 0)) if row.get('y') else 0.0,
                'z': float(row.get('z', 0)) if row.get('z') else 0.0,
            })
        except ValueError as e:
            print(f"Error parsing row: {row}, error: {e}")
            
    out_path = os.path.join(OFFLINE_DATA_DIR, 'ranked_pulsars.js')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(f"// Precompiled Ranked Pulsars Data\nconst RANKED_PULSARS_DATA = {json.dumps(processed, indent=2)};\n")
    print(f"Wrote {len(processed)} ranked pulsars to {out_path}")

def process_navigation_summary():
    print("Processing navigation summary...")
    summary = read_csv('navigation_lab_summary.csv')
    processed = []
    for row in summary:
        try:
            processed.append({
                'noise_ns': float(row.get('noise_ns', 0)) if row.get('noise_ns') else 0.0,
                'pulsar_count': int(row.get('pulsar_count', 0)) if row.get('pulsar_count') else 0,
                'mean_error_km': float(row.get('mean_error_km', 0)) if row.get('mean_error_km') else 0.0,
                'median_error_km': float(row.get('median_error_km', 0)) if row.get('median_error_km') else 0.0,
                'p95_error_km': float(row.get('p95_error_km', 0)) if row.get('p95_error_km') else 0.0,
                'max_error_km': float(row.get('max_error_km', 0)) if row.get('max_error_km') else 0.0,
                'trials': int(row.get('trials', 0)) if row.get('trials') else 0,
            })
        except ValueError as e:
            print(f"Error parsing row: {row}, error: {e}")
            
    out_path = os.path.join(OFFLINE_DATA_DIR, 'navigation_summary.js')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(f"// Precompiled Navigation Lab Summary Data\nconst NAVIGATION_SUMMARY_DATA = {json.dumps(processed, indent=2)};\n")
    print(f"Wrote {len(processed)} simulation records to {out_path}")

def process_trajectory():
    print("Processing spacecraft trajectory (downsampling)...")
    results_path = os.path.join(OUTPUT_DIR, 'spacecraft_positions.csv')
    if not os.path.exists(results_path):
        results_path = os.path.join(BASE_DIR, 'sample_data', 'spacecraft_positions.csv')
        if not os.path.exists(results_path):
            print("Warning: spacecraft_positions.csv not found.")
            return

    trajectories = {
        'earth_orbit': [],
        'earth_moon': [],
        'deep_space': []
    }
    
    # Read the file
    all_rows = []
    with open(results_path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            all_rows.append(row)
            
    print(f"Total orbital rows read: {len(all_rows)}")
    
    for region in trajectories.keys():
        region_rows = [r for r in all_rows if r.get('region') == region]
        if not region_rows:
            continue
            
        # Downsample to ~150 points
        step = max(1, len(region_rows) // 150)
        sampled = region_rows[::step][:150]
        
        for idx, row in enumerate(sampled):
            try:
                true_x = float(row.get('true_x_km') or row.get('true_x') or 0.0)
                true_y = float(row.get('true_y_km') or row.get('true_y') or 0.0)
                true_z = float(row.get('true_z_km') or row.get('true_z') or 0.0)
                
                trajectories[region].append({
                    'epoch': idx,
                    'true_x': true_x,
                    'true_y': true_y,
                    'true_z': true_z
                })
            except ValueError as e:
                print(f"Error parsing row: {row}, error: {e}")
                
    out_path = os.path.join(OFFLINE_DATA_DIR, 'spacecraft_trajectory.js')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(f"// Precompiled Spacecraft Trajectories\nconst SPACECRAFT_TRAJECTORY_DATA = {json.dumps(trajectories, indent=2)};\n")
    print(f"Wrote trajectories downsampled to {out_path}:")
    for reg, pts in trajectories.items():
        print(f"  - {reg}: {len(pts)} points")

def process_validation():
    print("Processing EKF validation trajectory...")
    val_path = os.path.join(OUTPUT_DIR, 'xray_nav_validation.csv')
    if not os.path.exists(val_path):
        print("Warning: xray_nav_validation.csv not found, checking sample_data...")
        val_path = os.path.join(BASE_DIR, 'sample_data', 'xray_nav_validation.csv')
        if not os.path.exists(val_path):
            print("Warning: Validation CSV file not found.")
            return

    processed = []
    with open(val_path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            try:
                processed.append({
                    'time_s': float(row.get('time_s', 0)) if row.get('time_s') else 0.0,
                    'true_x': float(row.get('true_x', 0)) if row.get('true_x') else 0.0,
                    'true_y': float(row.get('true_y', 0)) if row.get('true_y') else 0.0,
                    'true_z': float(row.get('true_z', 0)) if row.get('true_z') else 0.0,
                    'est_x': float(row.get('est_x', 0)) if row.get('est_x') else 0.0,
                    'est_y': float(row.get('est_y', 0)) if row.get('est_y') else 0.0,
                    'est_z': float(row.get('est_z', 0)) if row.get('est_z') else 0.0,
                    'pos_error_km': float(row.get('pos_error_km', 0)) if row.get('pos_error_km') else 0.0,
                    'vel_error_km_s': float(row.get('vel_error_km_s', 0)) if row.get('vel_error_km_s') else 0.0,
                    'cov_pos_km': float(row.get('cov_pos_km', 0)) if row.get('cov_pos_km') else 0.0,
                })
            except ValueError as e:
                print(f"Error parsing validation row: {row}, error: {e}")

    out_path = os.path.join(OFFLINE_DATA_DIR, 'xray_nav_validation.js')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(f"// Precompiled EKF Validation Data\nconst XRAY_NAV_VALIDATION_DATA = {json.dumps(processed, indent=2)};\n")
    print(f"Wrote {len(processed)} validation steps to {out_path}")

if __name__ == '__main__':
    ensure_dirs()
    process_catalog()
    process_ranked_pulsars()
    process_navigation_summary()
    process_trajectory()
    process_validation()
    print("Done generating offline datasets!")
