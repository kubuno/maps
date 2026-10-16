//! Geodesic geometry on a sphere, ported from the web's `mapSketch.ts`, `greatCircle.ts` and `navigation.ts`.
//!
//! The sketch tool (measure a distance, an area, draw a circle), the plane route mode (great-circle arc) and the
//! turn-by-turn navigation projection all run the same spherical maths. They are pure, so they move here and the
//! web, desktop and mobile clients all agree to the metre.

/// Mean Earth radius in metres (the web's `R` / `EARTH_RADIUS_M`).
pub const EARTH_RADIUS_M: f64 = 6_371_000.0;

/// Indicative cruise speed used for the plane-mode flight-time estimate, km/h (the web's `CRUISE_SPEED_KMH`).
pub const CRUISE_SPEED_KMH: f64 = 800.0;

/// A geographic point as `[lng, lat]` in degrees - the `[number, number]` order the web uses everywhere
/// (MapLibre / GeoJSON order), kept so ports read one-to-one against the TypeScript.
pub type LngLat = [f64; 2];

/// Haversine great-circle distance between two `[lng, lat]` points, in metres (the web's `haversine`).
pub fn haversine(a: LngLat, b: LngLat) -> f64 {
    let d_lat = (b[1] - a[1]).to_radians();
    let d_lng = (b[0] - a[0]).to_radians();
    let la1 = a[1].to_radians();
    let la2 = b[1].to_radians();
    let h = (d_lat / 2.0).sin().powi(2) + la1.cos() * la2.cos() * (d_lng / 2.0).sin().powi(2);
    2.0 * EARTH_RADIUS_M * h.sqrt().asin()
}

/// Cumulative length of a polyline in metres (the web's `pathDistance`).
pub fn path_distance(coords: &[LngLat]) -> f64 {
    coords.windows(2).map(|w| haversine(w[0], w[1])).sum()
}

/// Geodesic area of a polygon ring in square metres, using the spherical-excess formula (the web's
/// `polygonArea`). The ring is treated as closed (last vertex joined back to the first).
pub fn polygon_area(coords: &[LngLat]) -> f64 {
    if coords.len() < 3 {
        return 0.0;
    }
    let rad = std::f64::consts::PI / 180.0;
    let mut total = 0.0;
    for i in 0..coords.len() {
        let [lng1, lat1] = coords[i];
        let [lng2, lat2] = coords[(i + 1) % coords.len()];
        total += (lng2 - lng1) * rad * (2.0 + (lat1 * rad).sin() + (lat2 * rad).sin());
    }
    (total * EARTH_RADIUS_M * EARTH_RADIUS_M / 2.0).abs()
}

/// Initial bearing from `a` to `b` in degrees, `[0, 360)` (the web's `bearing` in `navigation.ts`).
pub fn bearing(a: LngLat, b: LngLat) -> f64 {
    let phi1 = a[1].to_radians();
    let phi2 = b[1].to_radians();
    let d_lambda = (b[0] - a[0]).to_radians();
    let y = d_lambda.sin() * phi2.cos();
    let x = phi1.cos() * phi2.sin() - phi1.sin() * phi2.cos() * d_lambda.cos();
    (y.atan2(x).to_degrees() + 360.0) % 360.0
}

/// Destination point from `[lng, lat]` given a bearing (degrees) and distance (metres) - the web's private
/// `destination` helper behind `circleRing`.
fn destination(lng: f64, lat: f64, bearing_deg: f64, dist_m: f64) -> LngLat {
    let d = dist_m / EARTH_RADIUS_M;
    let br = bearing_deg.to_radians();
    let la1 = lat.to_radians();
    let lo1 = lng.to_radians();
    let la2 = (la1.sin() * d.cos() + la1.cos() * d.sin() * br.cos()).asin();
    let lo2 = lo1
        + (br.sin() * d.sin() * la1.cos()).atan2(d.cos() - la1.sin() * la2.sin());
    [lo2.to_degrees(), la2.to_degrees()]
}

/// Closed polygon approximation of a circle of radius `radius_m` metres around `center` (the web's
/// `circleRing`); `steps` segments plus the repeated first point.
pub fn circle_ring(center: LngLat, radius_m: f64, steps: usize) -> Vec<LngLat> {
    (0..=steps)
        .map(|i| destination(center[0], center[1], (i as f64 / steps as f64) * 360.0, radius_m))
        .collect()
}

/// Points of the great-circle arc from `a` to `b` as `[lng, lat]` pairs (the web's `greatCirclePoints`),
/// spherical-linear-interpolated on unit vectors with longitudes unwrapped across the antimeridian.
pub fn great_circle_points(a: LngLat, b: LngLat, segments: usize) -> Vec<LngLat> {
    let (phi1, lam1) = (a[1].to_radians(), a[0].to_radians());
    let (phi2, lam2) = (b[1].to_radians(), b[0].to_radians());
    let v1 = [phi1.cos() * lam1.cos(), phi1.cos() * lam1.sin(), phi1.sin()];
    let v2 = [phi2.cos() * lam2.cos(), phi2.cos() * lam2.sin(), phi2.sin()];
    let dot = (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]).clamp(-1.0, 1.0);
    let d = dot.acos();
    // Coincident or antipodal points: no unique arc, draw the straight segment.
    if d < 1e-9 || (std::f64::consts::PI - d).abs() < 1e-9 {
        return vec![a, b];
    }
    let mut out = Vec::with_capacity(segments + 1);
    let mut prev_lng = a[0];
    for i in 0..=segments {
        let f = i as f64 / segments as f64;
        let s1 = ((1.0 - f) * d).sin() / d.sin();
        let s2 = (f * d).sin() / d.sin();
        let x = s1 * v1[0] + s2 * v2[0];
        let y = s1 * v1[1] + s2 * v2[1];
        let z = s1 * v1[2] + s2 * v2[2];
        let mut lng = y.atan2(x).to_degrees();
        let lat = z.atan2((x * x + y * y).sqrt()).to_degrees();
        while lng - prev_lng > 180.0 {
            lng -= 360.0;
        }
        while lng - prev_lng < -180.0 {
            lng += 360.0;
        }
        out.push([lng, lat]);
        prev_lng = lng;
    }
    out
}

/// Seconds of flight for `distance_m` metres at the indicative cruise speed (the web's `flightSeconds`).
pub fn flight_seconds(distance_m: f64) -> f64 {
    distance_m / (CRUISE_SPEED_KMH * 1000.0 / 3600.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Paris (Notre-Dame) → London (Big Ben) is ~343 km.
    const PARIS: LngLat = [2.3499, 48.8530];
    const LONDON: LngLat = [-0.1246, 51.5007];

    #[test]
    fn haversine_paris_london() {
        let d = haversine(PARIS, LONDON);
        assert!((d - 343_000.0).abs() < 5_000.0, "got {d} m");
    }

    #[test]
    fn path_distance_sums_segments() {
        let pts = [PARIS, LONDON, PARIS];
        let expected = 2.0 * haversine(PARIS, LONDON);
        assert!((path_distance(&pts) - expected).abs() < 1e-6);
    }

    #[test]
    fn bearing_north_is_zero() {
        // Due north from the equator.
        let b = bearing([0.0, 0.0], [0.0, 1.0]);
        assert!(b < 0.001 || b > 359.999, "got {b}");
    }

    #[test]
    fn polygon_area_of_small_square() {
        // ~0.01° square near the equator: roughly (0.01° * 111_320 m)² ≈ 1.24e6 m².
        let ring = [[0.0, 0.0], [0.01, 0.0], [0.01, 0.01], [0.0, 0.01]];
        let a = polygon_area(&ring);
        assert!(a > 1.0e6 && a < 1.5e6, "got {a} m²");
    }

    #[test]
    fn circle_ring_is_closed() {
        let ring = circle_ring([2.35, 48.85], 1000.0, 64);
        assert_eq!(ring.len(), 65);
        assert_eq!(ring[0], ring[64]);
    }

    #[test]
    fn great_circle_endpoints_match() {
        let arc = great_circle_points(PARIS, LONDON, 64);
        assert_eq!(arc.len(), 65);
        assert!((arc[0][0] - PARIS[0]).abs() < 1e-6);
        assert!((arc[64][0] - LONDON[0]).abs() < 1e-3);
    }
}
