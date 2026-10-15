//! Distance / area / duration formatters, ported from the web's `mapSketch.ts` and `routing.ts`.
//!
//! These are the human-readable strings the sketch measurements and the route panel show. They are pure string
//! formatting, shared so every client reads a distance the same way. Locale-specific unit words (km / mi / ft)
//! follow the web exactly; the caller passes the chosen unit system.

/// Metres per statute mile (the web's `METERS_PER_MILE`).
pub const METERS_PER_MILE: f64 = 1609.344;

/// The distance unit system the user picked (`prefs.units`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DistanceUnits {
    Kilometers,
    Miles,
}

/// A sketch length: metres, or kilometres above 1 km (the web's `fmtLen`).
pub fn fmt_len(m: f64) -> String {
    if m >= 1000.0 {
        let km = m / 1000.0;
        if m >= 10_000.0 {
            format!("{:.0} km", km)
        } else {
            format!("{:.2} km", km)
        }
    } else {
        format!("{} m", m.round() as i64)
    }
}

/// A sketch area: m², hectares above 1 ha, km² above 1 km² (the web's `fmtArea`).
pub fn fmt_area(m2: f64) -> String {
    if m2 >= 1_000_000.0 {
        format!("{:.2} km²", m2 / 1_000_000.0)
    } else if m2 >= 10_000.0 {
        format!("{:.2} ha", m2 / 10_000.0)
    } else {
        format!("{} m²", m2.round() as i64)
    }
}

/// A route distance in metric (the web's `fmtDistance`): metres, or km (1 decimal below 10 km, none above).
pub fn fmt_distance(m: f64) -> String {
    if m >= 1000.0 {
        let km = m / 1000.0;
        if m >= 10_000.0 {
            format!("{:.0} km", km)
        } else {
            format!("{:.1} km", km)
        }
    } else {
        format!("{} m", m.round() as i64)
    }
}

/// A route distance in the user's units (the web's `fmtDistanceIn`); below 0.1 mi it falls back to feet.
pub fn fmt_distance_in(m: f64, units: DistanceUnits) -> String {
    if units != DistanceUnits::Miles {
        return fmt_distance(m);
    }
    let mi = m / METERS_PER_MILE;
    if mi < 0.1 {
        format!("{} ft", (m * 3.28084).round() as i64)
    } else if mi >= 10.0 {
        format!("{:.0} mi", mi)
    } else {
        format!("{:.1} mi", mi)
    }
}

/// A route duration (the web's `fmtDurationShort`): `< 1 min`, `N min`, or `H h MM`.
pub fn fmt_duration_short(s: f64) -> String {
    if s < 60.0 {
        return "< 1 min".to_string();
    }
    let h = (s / 3600.0).floor() as i64;
    let m = ((s % 3600.0) / 60.0).round() as i64;
    if h > 0 {
        format!("{} h {:02}", h, m)
    } else {
        format!("{} min", m)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lengths() {
        assert_eq!(fmt_len(250.0), "250 m");
        assert_eq!(fmt_len(1500.0), "1.50 km");
        assert_eq!(fmt_len(12_000.0), "12 km");
    }

    #[test]
    fn areas() {
        assert_eq!(fmt_area(500.0), "500 m²");
        assert_eq!(fmt_area(25_000.0), "2.50 ha");
        assert_eq!(fmt_area(5_000_000.0), "5.00 km²");
    }

    #[test]
    fn distances() {
        assert_eq!(fmt_distance(800.0), "800 m");
        assert_eq!(fmt_distance(2500.0), "2.5 km");
        assert_eq!(fmt_distance(42_000.0), "42 km");
        assert_eq!(fmt_distance_in(2500.0, DistanceUnits::Miles), "1.6 mi");
        assert_eq!(fmt_distance_in(100.0, DistanceUnits::Miles), "328 ft");
    }

    #[test]
    fn durations() {
        assert_eq!(fmt_duration_short(30.0), "< 1 min");
        assert_eq!(fmt_duration_short(600.0), "10 min");
        assert_eq!(fmt_duration_short(3_900.0), "1 h 05");
    }
}
