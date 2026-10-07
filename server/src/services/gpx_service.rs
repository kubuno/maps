use chrono::{DateTime, Utc};
use quick_xml::events::{BytesRef, BytesText, Event};
use quick_xml::Reader;

use crate::errors::{MapsError, Result};
use crate::models::gpx::{GpxFile, GpxPoint, GpxStats, GpxTrack};

/// Character data of a `Text` event: decoded, line-end normalised, entities
/// resolved. A malformed entity falls back to the decoded form rather than
/// discarding the whole node.
fn text_content(e: &BytesText) -> String {
    match e.xml10_content() {
        Ok(decoded) => match quick_xml::escape::unescape(&decoded) {
            Ok(unescaped) => unescaped.into_owned(),
            Err(_) => decoded.into_owned(),
        },
        Err(_) => String::new(),
    }
}

/// Character data a `GeneralRef` event stands for: `amp` -> `&`, `#10` -> newline.
/// An unknown entity keeps its source form instead of vanishing.
fn ref_content(e: &BytesRef) -> String {
    match e.decode() {
        Ok(name) => {
            let source = format!("&{name};");
            quick_xml::escape::unescape(&source).map_or(source.clone(), |r| r.into_owned())
        }
        Err(_) => String::new(),
    }
}

pub fn parse_gpx(content: &[u8]) -> Result<GpxFile> {
    let mut reader = Reader::from_reader(content);
    // NOT trim_text(true): since quick-xml 0.41 an entity is its own event, so
    // `A &amp; B` arrives in three pieces. Trimming each piece separately would
    // weld them together. The assembled value is trimmed once, at the end tag.
    reader.config_mut().trim_text(false);

    let mut buf = Vec::new();
    // Character data of the element being read, reassembled from `Text` and
    // `GeneralRef` events and consumed at the matching end tag.
    let mut text_acc = String::new();

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
                text_acc.clear();
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
                        else                  { in_name = !in_trk; }
                    }
                    "desc" if !in_trkpt && !in_wpt => { in_desc = true; }
                    "ele"      => { in_ele = true; }
                    "time"     => { in_time = true; }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                let tag = std::str::from_utf8(e.local_name().as_ref()).unwrap_or("").to_string();
                // The element is finished, so its character data is complete:
                // trim once, here, rather than fragment by fragment.
                let text = std::mem::take(&mut text_acc).trim().to_string();
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
            Ok(Event::Text(ref e)) => text_acc.push_str(&text_content(e)),
            // Since quick-xml 0.41 an entity is reported separately from the
            // text around it. Ignoring it would drop the character it stands
            // for and, because each text event was assigned on its own, lose
            // everything read before it.
            Ok(Event::GeneralRef(ref e)) => text_acc.push_str(&ref_content(e)),
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

/// Construit le profil d'une trace : série (lat,lng,élévation,distance cumulée)
/// rééchantillonnée à `max_points`, plus des statistiques détaillées (D+, D−,
/// min/max élévation, durée, vitesse moyenne).
pub fn track_data(file: &GpxFile, max_points: usize) -> crate::models::gpx::TrackData {
    use crate::models::gpx::{TrackData, TrackPoint};

    // Concatène tous les points des segments de trace, dans l'ordre.
    let mut pts: Vec<&GpxPoint> = Vec::new();
    for track in &file.tracks {
        for seg in &track.segments {
            pts.extend(seg.iter());
        }
    }

    let mut series: Vec<TrackPoint> = Vec::with_capacity(pts.len());
    let mut distance = 0.0f64;
    let mut gain = 0.0f64;
    let mut loss = 0.0f64;
    let mut min_ele: Option<f64> = None;
    let mut max_ele: Option<f64> = None;
    let mut min_lat = 90.0f64;
    let mut max_lat = -90.0f64;
    let mut min_lng = 180.0f64;
    let mut max_lng = -180.0f64;

    for (i, pt) in pts.iter().enumerate() {
        if i > 0 {
            let prev = pts[i - 1];
            distance += haversine(prev.lat, prev.lng, pt.lat, pt.lng);
            if let (Some(pe), Some(ce)) = (prev.elevation, pt.elevation) {
                let d = ce - pe;
                if d > 0.0 { gain += d; } else { loss += -d; }
            }
        }
        if let Some(e) = pt.elevation {
            min_ele = Some(min_ele.map_or(e, |m| m.min(e)));
            max_ele = Some(max_ele.map_or(e, |m| m.max(e)));
        }
        min_lat = min_lat.min(pt.lat); max_lat = max_lat.max(pt.lat);
        min_lng = min_lng.min(pt.lng); max_lng = max_lng.max(pt.lng);

        series.push(TrackPoint { lat: pt.lat, lng: pt.lng, ele: pt.elevation, dist: distance, time: pt.time });
    }

    // Durée + vitesse moyenne si la trace est horodatée.
    let duration_secs = match (series.first().and_then(|p| p.time), series.last().and_then(|p| p.time)) {
        (Some(a), Some(b)) => Some((b - a).num_seconds()),
        _ => None,
    };
    let avg_speed_ms = match duration_secs {
        Some(d) if d > 0 => Some(distance / d as f64),
        _ => None,
    };

    let point_count = series.len() as u32;

    // Rééchantillonnage : garde au plus `max_points` points (toujours le dernier).
    if max_points > 0 && series.len() > max_points {
        let step = series.len().div_ceil(max_points);
        let last = series.last().cloned();
        series = series.into_iter().step_by(step).collect();
        if let Some(l) = last {
            if series.last().map(|p| p.dist) != Some(l.dist) { series.push(l); }
        }
    }

    if point_count == 0 {
        min_lat = 0.0; max_lat = 0.0; min_lng = 0.0; max_lng = 0.0;
    }

    TrackData {
        points: series,
        distance_meters: distance,
        elevation_gain: gain,
        elevation_loss: loss,
        min_elevation: min_ele,
        max_elevation: max_ele,
        duration_secs,
        avg_speed_ms,
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

#[cfg(test)]
mod tests {
    use super::*;

    /// An ampersand in a waypoint name must survive the round trip.
    ///
    /// quick-xml reports an entity as its own event since 0.38, so `A &amp; B`
    /// arrives as three events rather than one. A parser that only looks at
    /// `Event::Text` silently drops the entity — and, worse here, the second
    /// text event overwrites the first, so the name loses everything before
    /// the `&`.
    #[test]
    fn an_entity_does_not_truncate_a_waypoint_name() {
        let gpx = br#"<?xml version="1.0"?>
<gpx version="1.1">
  <wpt lat="1.0" lon="2.0">
    <name>Tom &amp; Jerry</name>
  </wpt>
</gpx>"#;
        let parsed = parse_gpx(gpx).expect("le GPX doit être lu");
        assert_eq!(parsed.waypoints.len(), 1);
        assert_eq!(parsed.waypoints[0].name.as_deref(), Some("Tom & Jerry"));
    }
}
