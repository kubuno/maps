//! Mapbox Vector Tile (MVT v2) decoding — the format of the OpenFreeMap / OpenMapTiles tiles the web basemap draws.
//!
//! A minimal, dependency-free protobuf reader for the four messages of the spec (`Tile`, `Layer`, `Feature`,
//! `Value`) and the geometry command stream (`MoveTo` / `LineTo` / `ClosePath`, zig-zag deltas). Sans-IO: bytes in,
//! decoded layers out — the network fetch and the cache belong to each client. Geometry is returned in
//! tile-normalised coordinates (`0.0..=1.0` across the tile, y growing southwards; features may slightly overflow
//! the tile through its buffer), ready for any renderer.

use std::fmt;

/// A decoding failure (truncated or malformed protobuf).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MvtError(&'static str);

impl fmt::Display for MvtError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "invalid vector tile: {}", self.0)
    }
}

impl std::error::Error for MvtError {}

type Result<T> = std::result::Result<T, MvtError>;

/// A point in tile-normalised coordinates.
pub type Point = [f32; 2];

/// A decoded tile: its layers, in file order.
#[derive(Debug, Clone, Default)]
pub struct Tile {
    pub layers: Vec<Layer>,
}

impl Tile {
    /// The layer named `name` (OpenMapTiles: `water`, `landcover`, `transportation`, `place`…).
    pub fn layer(&self, name: &str) -> Option<&Layer> {
        self.layers.iter().find(|l| l.name == name)
    }
}

/// One layer: its features and the key/value tables their tags index.
#[derive(Debug, Clone, Default)]
pub struct Layer {
    pub name: String,
    /// Tile-local coordinate extent (4096 by default); geometry is already divided by it.
    pub extent: u32,
    pub features: Vec<Feature>,
    pub keys: Vec<String>,
    pub values: Vec<Value>,
}

impl Layer {
    /// The value of property `key` on `feature`.
    pub fn property<'a>(&'a self, feature: &Feature, key: &str) -> Option<&'a Value> {
        feature.tags.as_chunks::<2>().0.iter().find_map(|kv| {
            (self.keys.get(kv[0] as usize).map(String::as_str) == Some(key)).then(|| self.values.get(kv[1] as usize)).flatten()
        })
    }

    /// The string value of property `key` on `feature` (`class`, `name`…).
    pub fn str<'a>(&'a self, feature: &Feature, key: &str) -> Option<&'a str> {
        self.property(feature, key).and_then(Value::as_str)
    }

    /// The numeric value of property `key` on `feature` (`admin_level`, `rank`…).
    pub fn number(&self, feature: &Feature, key: &str) -> Option<f64> {
        self.property(feature, key).and_then(Value::as_f64)
    }
}

/// A property value.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    String(String),
    Float(f32),
    Double(f64),
    Int(i64),
    Uint(u64),
    Sint(i64),
    Bool(bool),
}

impl Value {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match *self {
            Value::Float(v) => Some(f64::from(v)),
            Value::Double(v) => Some(v),
            Value::Int(v) | Value::Sint(v) => Some(v as f64),
            Value::Uint(v) => Some(v as f64),
            Value::Bool(_) | Value::String(_) => None,
        }
    }
}

/// A feature's geometry, decoded and grouped.
#[derive(Debug, Clone, PartialEq)]
pub enum Geometry {
    Points(Vec<Point>),
    /// Line strings.
    Lines(Vec<Vec<Point>>),
    /// Polygons, each an exterior ring followed by its holes (rings are closed implicitly).
    Polygons(Vec<Vec<Vec<Point>>>),
    /// An unknown geometry type.
    Unknown,
}

/// One feature: its id, its tags (pairs of indices into the layer's `keys` / `values`) and its geometry.
#[derive(Debug, Clone)]
pub struct Feature {
    pub id: Option<u64>,
    pub tags: Vec<u32>,
    pub geometry: Geometry,
}

/// Decode a vector tile. The bytes must be the raw (decompressed) protobuf.
pub fn decode(bytes: &[u8]) -> Result<Tile> {
    let mut r = Reader::new(bytes);
    let mut tile = Tile::default();
    while let Some((field, wire)) = r.key()? {
        match (field, wire) {
            (3, WIRE_LEN) => tile.layers.push(decode_layer(r.bytes()?)?),
            _ => r.skip(wire)?,
        }
    }
    Ok(tile)
}

fn decode_layer(bytes: &[u8]) -> Result<Layer> {
    let mut r = Reader::new(bytes);
    let mut layer = Layer { extent: 4096, ..Layer::default() };
    // Features are decoded after the extent is known (it may come after them in the stream).
    let mut raw_features: Vec<&[u8]> = Vec::new();
    while let Some((field, wire)) = r.key()? {
        match (field, wire) {
            (1, WIRE_LEN) => layer.name = r.string()?,
            (2, WIRE_LEN) => raw_features.push(r.bytes()?),
            (3, WIRE_LEN) => layer.keys.push(r.string()?),
            (4, WIRE_LEN) => layer.values.push(decode_value(r.bytes()?)?),
            (5, WIRE_VARINT) => layer.extent = (r.varint()? as u32).max(1),
            _ => r.skip(wire)?,
        }
    }
    let extent = layer.extent as f32;
    layer.features = raw_features.into_iter().map(|b| decode_feature(b, extent)).collect::<Result<_>>()?;
    Ok(layer)
}

fn decode_value(bytes: &[u8]) -> Result<Value> {
    let mut r = Reader::new(bytes);
    let mut value = Value::Bool(false);
    while let Some((field, wire)) = r.key()? {
        value = match (field, wire) {
            (1, WIRE_LEN) => Value::String(r.string()?),
            (2, WIRE_32) => Value::Float(f32::from_bits(r.fixed32()?)),
            (3, WIRE_64) => Value::Double(f64::from_bits(r.fixed64()?)),
            (4, WIRE_VARINT) => Value::Int(r.varint()? as i64),
            (5, WIRE_VARINT) => Value::Uint(r.varint()?),
            (6, WIRE_VARINT) => Value::Sint(zigzag(r.varint()?)),
            (7, WIRE_VARINT) => Value::Bool(r.varint()? != 0),
            _ => {
                r.skip(wire)?;
                continue;
            }
        };
    }
    Ok(value)
}

fn decode_feature(bytes: &[u8], extent: f32) -> Result<Feature> {
    let mut r = Reader::new(bytes);
    let (mut id, mut tags, mut kind, mut commands) = (None, Vec::new(), 0u64, Vec::new());
    while let Some((field, wire)) = r.key()? {
        match (field, wire) {
            (1, WIRE_VARINT) => id = Some(r.varint()?),
            (2, WIRE_LEN) => tags = r.packed_u32()?,
            (3, WIRE_VARINT) => kind = r.varint()?,
            (4, WIRE_LEN) => commands = r.packed_u32()?,
            _ => r.skip(wire)?,
        }
    }
    Ok(Feature { id, tags, geometry: decode_geometry(kind, &commands, extent)? })
}

/// Run the command stream into paths (each `MoveTo` starts one).
fn decode_paths(commands: &[u32], extent: f32) -> Result<Vec<Vec<Point>>> {
    let (mut x, mut y) = (0i64, 0i64);
    let mut paths: Vec<Vec<Point>> = Vec::new();
    let mut i = 0;
    while i < commands.len() {
        let (id, count) = (commands[i] & 0x7, (commands[i] >> 3) as usize);
        i += 1;
        match id {
            1 | 2 => {
                if i + 2 * count > commands.len() {
                    return Err(MvtError("geometry runs past its end"));
                }
                for _ in 0..count {
                    x += zigzag(u64::from(commands[i]));
                    y += zigzag(u64::from(commands[i + 1]));
                    i += 2;
                    let p = [x as f32 / extent, y as f32 / extent];
                    if id == 1 || paths.is_empty() {
                        paths.push(vec![p]);
                    } else if let Some(path) = paths.last_mut() {
                        path.push(p);
                    }
                }
            }
            7 => {} // ClosePath: rings are closed implicitly.
            _ => return Err(MvtError("unknown geometry command")),
        }
    }
    Ok(paths)
}

fn decode_geometry(kind: u64, commands: &[u32], extent: f32) -> Result<Geometry> {
    let paths = decode_paths(commands, extent)?;
    Ok(match kind {
        1 => Geometry::Points(paths.into_iter().flatten().collect()),
        2 => Geometry::Lines(paths),
        3 => {
            // MVT v2: an exterior ring has a positive signed area in tile coordinates (y down), a hole a negative one.
            let mut polygons: Vec<Vec<Vec<Point>>> = Vec::new();
            for ring in paths {
                let area = signed_area(&ring);
                if area > 0.0 || polygons.is_empty() {
                    polygons.push(vec![ring]);
                } else if area < 0.0 {
                    if let Some(poly) = polygons.last_mut() {
                        poly.push(ring);
                    }
                }
            }
            Geometry::Polygons(polygons)
        }
        _ => Geometry::Unknown,
    })
}

/// Twice the signed area of a ring (shoelace), positive for a clockwise ring in y-down coordinates.
fn signed_area(ring: &[Point]) -> f32 {
    ring.iter().zip(ring.iter().cycle().skip(1)).map(|(a, b)| a[0] * b[1] - b[0] * a[1]).sum()
}

fn zigzag(n: u64) -> i64 {
    ((n >> 1) as i64) ^ -((n & 1) as i64)
}

// ── Protobuf wire reader ─────────────────────────────────────────────────────────────────────────────────────────

const WIRE_VARINT: u8 = 0;
const WIRE_64: u8 = 1;
const WIRE_LEN: u8 = 2;
const WIRE_32: u8 = 5;

struct Reader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn new(buf: &'a [u8]) -> Self {
        Self { buf, pos: 0 }
    }

    /// The next field's (number, wire type), or `None` at the end of the message.
    fn key(&mut self) -> Result<Option<(u32, u8)>> {
        if self.pos >= self.buf.len() {
            return Ok(None);
        }
        let k = self.varint()?;
        Ok(Some(((k >> 3) as u32, (k & 0x7) as u8)))
    }

    fn varint(&mut self) -> Result<u64> {
        let mut v = 0u64;
        for shift in (0..64).step_by(7) {
            let b = *self.buf.get(self.pos).ok_or(MvtError("truncated varint"))?;
            self.pos += 1;
            v |= u64::from(b & 0x7f) << shift;
            if b & 0x80 == 0 {
                return Ok(v);
            }
        }
        Err(MvtError("varint too long"))
    }

    fn take(&mut self, n: usize) -> Result<&'a [u8]> {
        let end = self.pos.checked_add(n).filter(|&e| e <= self.buf.len()).ok_or(MvtError("truncated field"))?;
        let s = &self.buf[self.pos..end];
        self.pos = end;
        Ok(s)
    }

    fn bytes(&mut self) -> Result<&'a [u8]> {
        let n = usize::try_from(self.varint()?).map_err(|_| MvtError("field too long"))?;
        self.take(n)
    }

    fn string(&mut self) -> Result<String> {
        Ok(String::from_utf8_lossy(self.bytes()?).into_owned())
    }

    fn fixed32(&mut self) -> Result<u32> {
        let b = self.take(4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    fn fixed64(&mut self) -> Result<u64> {
        let b = self.take(8)?;
        Ok(u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]))
    }

    fn packed_u32(&mut self) -> Result<Vec<u32>> {
        let mut r = Reader::new(self.bytes()?);
        let mut out = Vec::new();
        while r.pos < r.buf.len() {
            out.push(r.varint()? as u32);
        }
        Ok(out)
    }

    fn skip(&mut self, wire: u8) -> Result<()> {
        match wire {
            WIRE_VARINT => self.varint().map(drop),
            WIRE_64 => self.take(8).map(drop),
            WIRE_LEN => self.bytes().map(drop),
            WIRE_32 => self.take(4).map(drop),
            _ => Err(MvtError("unsupported wire type")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PARIS_Z11: &[u8] = include_bytes!("../tests/fixtures/paris-11-1037-704.pbf");

    #[test]
    fn decodes_the_openmaptiles_layers() {
        let tile = decode(PARIS_Z11).expect("decode");
        // (Buildings only appear from zoom 13; this tile is zoom 11.)
        for name in ["water", "waterway", "landcover", "landuse", "park", "transportation", "transportation_name", "place"] {
            let layer = tile.layer(name).unwrap_or_else(|| panic!("layer {name}"));
            assert!(!layer.features.is_empty(), "{name} has features");
            assert_eq!(layer.extent, 4096);
        }
    }

    #[test]
    fn geometry_types_match_the_layers() {
        let tile = decode(PARIS_Z11).expect("decode");
        let water = tile.layer("water").expect("water");
        assert!(water.features.iter().all(|f| matches!(f.geometry, Geometry::Polygons(_))));
        let roads = tile.layer("transportation").expect("transportation");
        assert!(roads.features.iter().any(|f| matches!(f.geometry, Geometry::Lines(_))));
        let places = tile.layer("place").expect("place");
        assert!(places.features.iter().all(|f| matches!(f.geometry, Geometry::Points(_))));
    }

    #[test]
    fn properties_resolve_and_paris_is_labelled() {
        let tile = decode(PARIS_Z11).expect("decode");
        let places = tile.layer("place").expect("place");
        let paris = places.features.iter().find(|f| places.str(f, "name") == Some("Paris")).expect("Paris");
        assert!(places.str(paris, "class").is_some());
        // The label point is inside (or on the buffer edge of) the tile.
        if let Geometry::Points(p) = &paris.geometry {
            assert!(p.iter().all(|q| (-0.1..=1.1).contains(&q[0]) && (-0.1..=1.1).contains(&q[1])));
        }
        let roads = tile.layer("transportation").expect("transportation");
        assert!(roads.features.iter().any(|f| roads.str(f, "class") == Some("motorway")));
    }

    #[test]
    fn rejects_truncated_input() {
        assert!(decode(&PARIS_Z11[..PARIS_Z11.len() / 2]).is_err());
        assert!(decode(&[]).expect("empty tile").layers.is_empty());
    }

    #[test]
    fn zigzag_and_area_conventions() {
        assert_eq!((zigzag(0), zigzag(1), zigzag(2), zigzag(3)), (0, -1, 1, -2));
        // Clockwise in y-down coordinates → positive (an exterior ring).
        assert!(signed_area(&[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]) > 0.0);
    }
}
