use chrono::{DateTime, Utc};
use quick_xml::events::Event;
use quick_xml::Reader;

use crate::errors::{MapsError, Result};
use crate::models::gpx::{GpxFile, GpxPoint, GpxStats, GpxTrack};

pub fn parse_gpx(content: &[u8]) -> Result<GpxFile> {
    let mut reader = Reader::from_reader(content);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();

    let mut file = GpxFile {
        name:        None,
        description: None,
        waypoints:   Vec::new(),
        tracks:      Vec::new(),
    };

    // Parser state
    let mut in_metadata   = false;
    let mut in_trk        = false;
    let mut _in_trkseg     = false;
    let mut in_trkpt      = false;
    let mut in_wpt        = false;
    let mut in_name       = false;
    let mut in_desc       = false;
    let mut in_ele        = false;
    let mut in_time       = false;
    let mut in_pt_name    = false;

    let mut current_point: Option<GpxPoint> = None;
    let mut current_track: Option<GpxTrack>  = None;
    let mut current_seg:   Vec<GpxPoint>     = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let tag = std::str::from_utf8(e.local_name().as_ref()).unwrap_or("").to_string();
                match tag.as_str() {
                    "metadata" => { in_metadata = true; }
                    "trk"      => {
                        in_trk = true;
                        current_track = Some(GpxTrack { name: None, segments: Vec::new() });
                    }
                    "trkseg"   => { _in_trkseg = true; }
                    "trkpt"    => {
                        in_trkpt = true;
                        let (lat, lon) = extract_lat_lon(e)?;
                        current_point = Some(GpxPoint { lat, lng: lon, elevation: None, time: None, name: None });
                    }
                    "wpt"      => {
                        in_wpt = true;
                        let (lat, lon) = extract_lat_lon(e)?;
                        current_point = Some(GpxPoint { lat, lng: lon, elevation: None, time: None, name: None });
                    }
                    "name"     => {
                        if in_trkpt || in_wpt { in_pt_name = true; }
                        else if in_trk        { in_name = false; }
                        else                  { in_name = true; }
                    }
                    "desc"     => { if !in_trkpt && !in_wpt { in_desc = true; } }
                    "ele"      => { in_ele = true; }
                    "time"     => { in_time = true; }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                let tag = std::str::from_utf8(e.local_name().as_ref()).unwrap_or("").to_string();
                match tag.as_str() {
                    "metadata" => { in_metadata = false; }
                    "trk"      => {
                        in_trk = false;
                        if let Some(mut track) = current_track.take() {
                            if !current_seg.is_empty() {
                                track.segments.push(std::mem::take(&mut current_seg));
                            }
                            file.tracks.push(track);
                        }
                    }
                    "trkseg"   => {
                        _in_trkseg = false;
                        if !current_seg.is_empty() {
                            if let Some(track) = current_track.as_mut() {
                                track.segments.push(std::mem::take(&mut current_seg));
                            }
                        }
                    }
                    "trkpt"    => {
                        in_trkpt = false;
                        if let Some(pt) = current_point.take() {
                            current_seg.push(pt);
                        }
                    }
                    "wpt"      => {
                        in_wpt = false;
                        if let Some(pt) = current_point.take() {
                            file.waypoints.push(pt);
                        }
                    }
                    "name"     => { in_name = false; in_pt_name = false; }
                    "desc"     => { in_desc = false; }
                    "ele"      => { in_ele = false; }
                    "time"     => { in_time = false; }
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                let text = e.unescape().unwrap_or_default().to_string();
                if in_ele {
                    if let (Some(pt), Ok(elev)) = (current_point.as_mut(), text.trim().parse::<f64>()) {
                        pt.elevation = Some(elev);
                    }
                } else if in_time {
                    let parsed = text.trim().parse::<DateTime<Utc>>().ok();
                    if in_trkpt || in_wpt {
                        if let Some(pt) = current_point.as_mut() {
                            pt.time = parsed;
                        }
                    }
                } else if in_pt_name {
                    if let Some(pt) = current_point.as_mut() {
                        pt.name = Some(text.clone());
                    }
                } else if in_name {
                    if in_trk {
                        if let Some(track) = current_track.as_mut() {
                            track.name = Some(text.clone());
                        }
                    } else if !in_metadata {
                        // top-level gpx name
                    } else {
                        file.name = Some(text.clone());
                    }
                } else if in_desc && !in_metadata {
                    // skip
                } else if in_desc {
                    file.description = Some(text.clone());
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(MapsError::InvalidGpx(e.to_string())),
            _ => {}
        }
        buf.clear();
    }

    Ok(file)
}

fn extract_lat_lon(e: &quick_xml::events::BytesStart<'_>) -> Result<(f64, f64)> {
    let mut lat = None;
    let mut lon = None;
    for attr in e.attributes() {
        let attr = attr.map_err(|e| MapsError::InvalidGpx(e.to_string()))?;
        let local_name = attr.key.local_name();
        let key_bytes = local_name.as_ref();
        let key = std::str::from_utf8(key_bytes).unwrap_or("").to_string();
        let val = std::str::from_utf8(&attr.value).unwrap_or("").to_string();
        match key.as_str() {
            "lat" => lat = val.parse::<f64>().ok(),
            "lon" => lon = val.parse::<f64>().ok(),
            _ => {}
        }
    }
    let lat = lat.ok_or_else(|| MapsError::InvalidGpx("Attribut lat manquant".into()))?;
    let lon = lon.ok_or_else(|| MapsError::InvalidGpx("Attribut lon manquant".into()))?;
    Ok((lat, lon))
}

pub fn compute_stats(file: &GpxFile) -> GpxStats {
    let mut distance_meters = 0.0f64;
    let mut elevation_gain  = 0.0f64;
    let mut elevation_loss  = 0.0f64;
    let mut point_count     = 0u32;
    let mut min_lat =  90.0f64;
    let mut max_lat = -90.0f64;
    let mut min_lng = 180.0f64;
    let mut max_lng = -180.0f64;

    let mut all_points: Vec<&GpxPoint> = Vec::new();
    for wpt in &file.waypoints {
        all_points.push(wpt);
    }
    for track in &file.tracks {
        for seg in &track.segments {
            for pt in seg {
                all_points.push(pt);
            }
        }
    }

    for track in &file.tracks {
        for seg in &track.segments {
            let pts = seg.as_slice();
            for (i, pt) in pts.iter().enumerate() {
                point_count += 1;
                if pt.lat < min_lat { min_lat = pt.lat; }
                if pt.lat > max_lat { max_lat = pt.lat; }
                if pt.lng < min_lng { min_lng = pt.lng; }
                if pt.lng > max_lng { max_lng = pt.lng; }

                if i > 0 {
                    let prev = &pts[i - 1];
                    distance_meters += haversine(prev.lat, prev.lng, pt.lat, pt.lng);

                    if let (Some(prev_ele), Some(cur_ele)) = (prev.elevation, pt.elevation) {
                        let diff = cur_ele - prev_ele;
                        if diff > 0.0 { elevation_gain += diff; }
                        else          { elevation_loss += -diff; }
                    }
                }
            }
        }
    }

    for wpt in &file.waypoints {
        if wpt.lat < min_lat { min_lat = wpt.lat; }
        if wpt.lat > max_lat { max_lat = wpt.lat; }
        if wpt.lng < min_lng { min_lng = wpt.lng; }
        if wpt.lng > max_lng { max_lng = wpt.lng; }
    }

    if point_count == 0 {
        min_lat = 0.0; max_lat = 0.0; min_lng = 0.0; max_lng = 0.0;
    }

    GpxStats {
        distance_meters,
        elevation_gain,
        elevation_loss,
        point_count,
        bbox: [min_lat, min_lng, max_lat, max_lng],
    }
}

fn haversine(lat1: f64, lng1: f64, lat2: f64, lng2: f64) -> f64 {
    const R: f64 = 6_371_000.0;
    let d_lat = (lat2 - lat1).to_radians();
    let d_lng = (lng2 - lng1).to_radians();
    let a = (d_lat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (d_lng / 2.0).sin().powi(2);
    2.0 * R * a.sqrt().asin()
}
