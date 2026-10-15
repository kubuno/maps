//! Live basemap tiles, fetched in the background and kept in a memory and a disk cache.
//!
//! Two kinds of source: the **OpenFreeMap vector tiles** the web basemap draws (« Plan » and « Clair »), decoded with
//! the module's shared engine (`kubuno_maps_core::mvt`), and the **raster** sources of the shared catalogue
//! (`kubuno_maps_core::basemap`: OpenTopoMap « Relief », Esri imagery « Satellite »), kept as image files the native
//! surface draws. An **offline** store reads the disk cache only and never touches the network — the « Hors ligne »
//! basemap is the vector map of the places already visited, so OpenStreetMap's own tile servers are never used (their
//! policy forbids bulk downloading).
//!
//! Portable (any OS): the native map surface asks for the tiles of the current view ([`TileStore::set_wanted`],
//! nearest first) and paints those already available ([`TileStore::tile`]); worker threads fetch the rest — the most
//! recently wanted first, so a fast pan never waits behind tiles already off screen — and call the `notify` hook when
//! one arrives, so the surface repaints.

use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use kubuno_maps_core::basemap::TileSource;
use kubuno_maps_core::mvt::{self, Tile};

/// A tile address: zoom, column, row.
pub type TileKey = (u8, u32, u32);

/// The TileJSON describing the OpenFreeMap planet tiles (its `tiles` template carries the data version).
pub const TILEJSON_URL: &str = "https://tiles.openfreemap.org/planet";
/// The deepest zoom the vector tiles exist at; deeper views over-zoom these.
pub const MAX_ZOOM: u8 = 14;
/// The deepest zoom of a raster source that does not state its own.
const RASTER_MAX_ZOOM: u8 = 19;
/// How many tiles stay in memory.
const MEMORY_TILES: usize = 384;
/// Parallel downloads.
const WORKERS: usize = 4;
/// A failed tile is retried after this long (e.g. the network came back).
const RETRY_AFTER: Duration = Duration::from_secs(30);
const USER_AGENT: &str = concat!("KubunoMaps/", env!("CARGO_PKG_VERSION"), " (desktop; +https://github.com/kubuno/maps)");

/// Where a store's tiles come from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    /// The OpenFreeMap vector tiles (OpenMapTiles schema), decoded.
    Vector,
    /// A raster source of the shared catalogue, its images kept as files.
    Raster(TileSource),
}

impl Source {
    /// The deepest zoom tiles exist at.
    pub fn max_zoom(self) -> u8 {
        match self {
            Source::Vector => MAX_ZOOM,
            Source::Raster(s) => s.max_zoom.map_or(RASTER_MAX_ZOOM, |z| z.min(u32::from(RASTER_MAX_ZOOM)) as u8),
        }
    }

    /// The tile size in screen pixels at its own zoom (MapLibre: 512 for vector tiles, 256 for raster tiles).
    pub fn tile_size(self) -> f64 {
        match self {
            Source::Vector => 512.0,
            Source::Raster(_) => 256.0,
        }
    }
}

/// A tile, ready to paint.
#[derive(Debug)]
pub enum TileData {
    Vector(Tile),
    /// The image file (PNG or JPEG) in the disk cache.
    Raster(PathBuf),
}

enum Entry {
    Ready(Arc<TileData>),
    Failed(Instant),
}

#[derive(Default)]
struct State {
    entries: HashMap<TileKey, Entry>,
    /// Least recently used first, for the memory bound.
    lru: VecDeque<TileKey>,
    /// Wanted and not yet fetched, nearest the centre first.
    queue: VecDeque<TileKey>,
    inflight: HashSet<TileKey>,
    /// The resolved vector `{z}/{x}/{y}` template.
    template: Option<String>,
    shutdown: bool,
}

struct Inner {
    source: Source,
    offline: bool,
    state: Mutex<State>,
    work: Condvar,
    notify: Box<dyn Fn() + Send + Sync>,
    cache_dir: Option<PathBuf>,
}

impl Inner {
    fn lock(&self) -> MutexGuard<'_, State> {
        // A worker that panicked mid-update leaves consistent-enough state: keep serving.
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// The background tile fetcher and cache of one source (see the module doc). Dropping it stops the workers.
pub struct TileStore {
    inner: Arc<Inner>,
}

impl TileStore {
    /// Start the workers for `source`. `cache_dir` keeps the downloaded tiles between runs (none = memory only); an
    /// `offline` store only reads that cache. `notify` is called from a worker thread each time a tile arrives.
    pub fn new(source: Source, offline: bool, cache_dir: Option<PathBuf>, notify: impl Fn() + Send + Sync + 'static) -> Self {
        let inner = Arc::new(Inner {
            source,
            offline,
            state: Mutex::new(State::default()),
            work: Condvar::new(),
            notify: Box::new(notify),
            cache_dir,
        });
        let http = if offline {
            None
        } else {
            reqwest::blocking::Client::builder().user_agent(USER_AGENT).timeout(Duration::from_secs(20)).build().ok()
        };
        for i in 0..WORKERS {
            let (inner, http) = (inner.clone(), http.clone());
            let spawned = std::thread::Builder::new().name(format!("maps-tiles-{i}")).spawn(move || worker(&inner, http.as_ref()));
            if let Err(e) = spawned {
                tracing::error!("[maps] cannot start a tile worker: {e}");
            }
        }
        Self { inner }
    }

    /// The source this store serves.
    pub fn source(&self) -> Source {
        self.inner.source
    }

    /// The tile, if it is in memory.
    pub fn tile(&self, key: TileKey) -> Option<Arc<TileData>> {
        let mut s = self.inner.lock();
        let tile = match s.entries.get(&key) {
            Some(Entry::Ready(t)) => Some(t.clone()),
            _ => None,
        };
        if tile.is_some() {
            if let Some(i) = s.lru.iter().position(|k| *k == key) {
                s.lru.remove(i);
            }
            s.lru.push_back(key);
        }
        tile
    }

    /// The tiles the view needs, most important first: those not yet available are queued (replacing what the
    /// previous view wanted), the rest left alone.
    pub fn set_wanted(&self, keys: &[TileKey]) {
        let mut s = self.inner.lock();
        let now = Instant::now();
        let missing: VecDeque<TileKey> = keys
            .iter()
            .copied()
            .filter(|k| !s.inflight.contains(k))
            .filter(|k| match s.entries.get(k) {
                Some(Entry::Ready(_)) => false,
                Some(Entry::Failed(at)) => now.duration_since(*at) >= RETRY_AFTER,
                None => true,
            })
            .collect();
        s.queue = missing;
        drop(s);
        self.inner.work.notify_all();
    }
}

impl Drop for TileStore {
    fn drop(&mut self) {
        self.inner.lock().shutdown = true;
        self.inner.work.notify_all();
    }
}

/// The per-user cache folder for downloaded tiles.
pub fn default_cache_dir() -> Option<PathBuf> {
    let base = if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("Kubuno").join("Maps"))
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Caches/Kubuno/Maps"))
    } else {
        std::env::var_os("XDG_CACHE_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".cache")))
            .map(|d| d.join("kubuno").join("maps"))
    };
    base.map(|b| b.join("tiles"))
}

fn worker(inner: &Inner, http: Option<&reqwest::blocking::Client>) {
    loop {
        let key = {
            let mut s = inner.lock();
            loop {
                if s.shutdown {
                    return;
                }
                if let Some(k) = s.queue.pop_front() {
                    s.inflight.insert(k);
                    break k;
                }
                s = inner.work.wait(s).unwrap_or_else(|e| e.into_inner());
            }
        };
        let result = match inner.source {
            Source::Vector => vector_template(inner, http).and_then(|t| load_vector(inner, http, &t, key)).map(TileData::Vector),
            Source::Raster(src) => load_raster(inner, http, src, key).map(TileData::Raster),
        };
        let mut s = inner.lock();
        s.inflight.remove(&key);
        let arrived = match result {
            Some(tile) => {
                s.entries.insert(key, Entry::Ready(Arc::new(tile)));
                s.lru.push_back(key);
                while s.lru.len() > MEMORY_TILES {
                    if let Some(old) = s.lru.pop_front() {
                        s.entries.remove(&old);
                    }
                }
                true
            }
            None => {
                s.entries.insert(key, Entry::Failed(Instant::now()));
                false
            }
        };
        drop(s);
        if arrived {
            (inner.notify)();
        }
    }
}

/// The vector tile URL template: from memory, else a recently remembered one, else the TileJSON (remembered on disk
/// for offline starts; an offline store uses whatever it remembers).
fn vector_template(inner: &Inner, http: Option<&reqwest::blocking::Client>) -> Option<String> {
    if let Some(t) = inner.lock().template.clone() {
        return Some(t);
    }
    let remembered = inner.cache_dir.as_ref().map(|d| d.join("tilejson-template.txt"));
    let read = |p: &PathBuf| std::fs::read_to_string(p).ok().map(|t| t.trim().to_string()).filter(|t| !t.is_empty());
    // A template remembered less than a day ago is used as is (the planet data is rebuilt about weekly).
    let fresh = remembered.as_ref().filter(|p| {
        inner.offline
            || std::fs::metadata(p).and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok()).is_some_and(|age| age < Duration::from_secs(86_400))
    });
    let t = if let Some(t) = fresh.and_then(read) {
        t
    } else {
        let fetched = http.and_then(|c| {
            let json: serde_json::Value = c.get(TILEJSON_URL).send().ok()?.error_for_status().ok()?.json().ok()?;
            json["tiles"][0].as_str().map(str::to_string)
        });
        match fetched {
            Some(t) => {
                if let Some(p) = &remembered {
                    write_atomic(p, t.as_bytes());
                }
                t
            }
            None => read(remembered.as_ref()?)?,
        }
    };
    inner.lock().template = Some(t.clone());
    Some(t)
}

fn fill_template(template: &str, (z, x, y): TileKey) -> String {
    template.replace("{z}", &z.to_string()).replace("{x}", &x.to_string()).replace("{y}", &y.to_string())
}

fn download(http: Option<&reqwest::blocking::Client>, url: &str, what: &str) -> Option<Vec<u8>> {
    match http?.get(url).send().and_then(|r| r.error_for_status()).and_then(|r| r.bytes()) {
        Ok(b) => Some(b.to_vec()),
        Err(e) => {
            tracing::warn!("[maps] tile {what}: {e}");
            None
        }
    }
}

/// One vector tile from the disk cache, else the network (then cached). `None` on failure.
fn load_vector(inner: &Inner, http: Option<&reqwest::blocking::Client>, template: &str, key: TileKey) -> Option<Tile> {
    let (z, x, y) = key;
    // The data version (the path segment before `{z}`) keys the disk cache, so a new planet build is not mixed in.
    let version = template.split("/{z}").next().and_then(|p| p.rsplit('/').next()).unwrap_or("planet");
    let file = inner.cache_dir.as_ref().map(|d| d.join(version).join(z.to_string()).join(x.to_string()).join(format!("{y}.pbf")));
    if let Some(bytes) = file.as_ref().and_then(|f| std::fs::read(f).ok()) {
        if let Ok(tile) = mvt::decode(&bytes) {
            return Some(tile);
        }
    }
    let bytes = download(http, &fill_template(template, key), &format!("{z}/{x}/{y}"))?;
    let tile = match mvt::decode(&bytes) {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!("[maps] tile {z}/{x}/{y}: {e}");
            return None;
        }
    };
    if let Some(f) = &file {
        write_atomic(f, &bytes);
    }
    Some(tile)
}

/// The image type of `bytes` from its signature, as a file extension.
fn image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        Some("png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else {
        None
    }
}

/// One raster tile as a cached image file, downloading it first when needed. `None` on failure.
fn load_raster(inner: &Inner, http: Option<&reqwest::blocking::Client>, src: TileSource, key: TileKey) -> Option<PathBuf> {
    let (z, x, y) = key;
    let dir = inner.cache_dir.as_ref()?.join(src.id).join(z.to_string()).join(x.to_string());
    for ext in ["png", "jpg"] {
        let f = dir.join(format!("{y}.{ext}"));
        if f.is_file() {
            return Some(f);
        }
    }
    // Spread over the source's mirrors (round-robin by tile, like the web).
    let template = *src.tiles.get((x as usize + y as usize) % src.tiles.len().max(1))?;
    let bytes = download(http, &fill_template(template, key), &format!("{}/{z}/{x}/{y}", src.id))?;
    let Some(ext) = image_extension(&bytes) else {
        tracing::warn!("[maps] tile {}/{z}/{x}/{y}: not an image", src.id);
        return None;
    };
    let f = dir.join(format!("{y}.{ext}"));
    write_atomic(&f, &bytes);
    f.is_file().then_some(f)
}

/// Write through a temporary file and rename, so a crash never leaves a truncated tile in the cache.
fn write_atomic(path: &Path, bytes: &[u8]) {
    let Some(dir) = path.parent() else { return };
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }
    let tmp = path.with_extension(format!("tmp{}", std::process::id()));
    if std::fs::write(&tmp, bytes).is_ok() && std::fs::rename(&tmp, path).is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    const PARIS_Z11: &[u8] = include_bytes!("../../../../common/core/tests/fixtures/paris-11-1037-704.pbf");

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("kubuno-maps-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn wait_for(store: &TileStore, key: TileKey) -> Option<Arc<TileData>> {
        store.set_wanted(&[key]);
        let deadline = Instant::now() + Duration::from_secs(10);
        while Instant::now() < deadline {
            if let Some(t) = store.tile(key) {
                return Some(t);
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        None
    }

    /// A store whose cache already holds the template and one tile serves it without any request, and notifies.
    #[test]
    fn serves_a_cached_vector_tile_offline_and_notifies() {
        let dir = temp_dir("vector");
        write_atomic(&dir.join("tilejson-template.txt"), b"https://tiles.invalid/planet/v1/{z}/{x}/{y}.pbf");
        write_atomic(&dir.join("v1/11/1037/704.pbf"), PARIS_Z11);
        let hits = Arc::new(AtomicUsize::new(0));
        let counter = hits.clone();
        let store = TileStore::new(Source::Vector, true, Some(dir.clone()), move || {
            counter.fetch_add(1, Ordering::SeqCst);
        });
        let key = (11, 1037, 704);
        assert!(store.tile(key).is_none(), "nothing in memory before it is wanted");
        let tile = wait_for(&store, key).expect("decoded from the disk cache");
        assert!(matches!(&*tile, TileData::Vector(t) if t.layer("place").is_some()));
        assert!(hits.load(Ordering::SeqCst) >= 1, "the surface is told to repaint");
        // Offline, a tile the cache does not hold is never fetched: it simply stays missing.
        assert!(wait_for_none(&store, (11, 1036, 704)));
        drop(store);
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn wait_for_none(store: &TileStore, key: TileKey) -> bool {
        store.set_wanted(&[key]);
        std::thread::sleep(Duration::from_millis(300));
        store.tile(key).is_none()
    }

    #[test]
    fn serves_a_cached_raster_tile_as_its_file() {
        let dir = temp_dir("raster");
        let src = kubuno_maps_core::basemap::BaseMap::Terrain.raster_sources()[0];
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        write_atomic(&dir.join(src.id).join("5/16/11.png"), &png);
        let store = TileStore::new(Source::Raster(src), true, Some(dir.clone()), || {});
        let tile = wait_for(&store, (5, 16, 11)).expect("cached raster");
        assert!(matches!(&*tile, TileData::Raster(p) if p.extension().is_some_and(|e| e == "png")));
        assert_eq!(store.source().tile_size(), 256.0);
        assert_eq!(Source::Raster(src).max_zoom(), 17);
        drop(store);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn image_signatures() {
        assert_eq!(image_extension(&[0x89, b'P', b'N', b'G']), Some("png"));
        assert_eq!(image_extension(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("jpg"));
        assert_eq!(image_extension(b"<html>"), None);
    }

    #[test]
    fn cache_dir_is_per_user() {
        if let Some(d) = default_cache_dir() {
            assert!(d.ends_with("tiles"));
        }
    }
}
