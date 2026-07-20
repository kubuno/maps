//! Multi-resolution texture server for the 3D solar-system ("cosmos") view.
//!
//! A Rust port of the original PHP `texture.php`: equirectangular planet maps
//! ship at full resolution (up to 8K) and are downscaled on demand into a disk
//! cache, so the WebGL client can stream just the resolution each body needs at
//! its current apparent size. The star/constellation catalogs are served as-is.
//!
//! Resizing uses the pure-Rust `image` crate — no native subprocess — so it
//! stays within the module's seccomp no-execve policy.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::config::CosmosSettings;

/// Resolution ladder offered to the client (px, longest side). Mirrors the PHP
/// `$SIZES`. A request outside this set is rejected.
pub const SIZES: [u32; 6] = [256, 512, 1024, 2048, 4096, 8192];

/// Data files the `/cosmos/data/:file` route is allowed to serve.
pub const DATA_FILES: [&str; 2] = ["stars.6.json", "constellations.lines.json"];

/// Located cosmos assets plus the writable resize cache.
pub struct CosmosAssets {
    pub textures_dir: PathBuf,
    pub data_dir:     PathBuf,
    pub cache_dir:    PathBuf,
    /// Texture filename → original width (px). Lets the client know how far each
    /// map can be pushed without a probe request (the PHP `$manifest`).
    pub manifest:     HashMap<String, u32>,
}

/// Why a texture couldn't be produced.
#[derive(Debug)]
pub enum TexError {
    NotFound,
    Decode,
    Io,
}

impl CosmosAssets {
    /// Locate the assets and prepare the cache. Returns `None` (with a warning)
    /// when the texture directory can't be found — the cosmos view then falls
    /// back to whatever lower-resolution maps the client already has.
    pub fn load(settings: &CosmosSettings) -> Option<Self> {
        let assets = resolve_assets_dir(settings.assets_dir.as_deref())?;
        let textures_dir = assets.join("textures");
        let data_dir = assets.join("data");
        if !textures_dir.is_dir() {
            tracing::warn!(?textures_dir, "Cosmos textures directory missing — 3D textures disabled");
            return None;
        }

        let cache_dir = resolve_cache_dir(settings.cache_dir.as_deref());
        if let Err(e) = std::fs::create_dir_all(&cache_dir) {
            tracing::warn!(?cache_dir, error = %e, "Cosmos cache directory not writable");
        }

        // Build the manifest by reading only each image header (cheap).
        let mut manifest = HashMap::new();
        if let Ok(entries) = std::fs::read_dir(&textures_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !valid_texture_name(&name) {
                    continue;
                }
                match image::image_dimensions(entry.path()) {
                    Ok((w, _)) => {
                        manifest.insert(name, w);
                    }
                    Err(e) => tracing::warn!(%name, error = %e, "Cosmos texture unreadable"),
                }
            }
        }

        tracing::info!(
            textures = manifest.len(),
            ?textures_dir,
            ?cache_dir,
            "Cosmos assets loaded — /cosmos texture service enabled",
        );
        Some(Self { textures_dir, data_dir, cache_dir, manifest })
    }

    fn is_png(file: &str) -> bool {
        file.to_ascii_lowercase().ends_with(".png")
    }

    /// Resolve the on-disk path to serve `file` at `size` px wide, generating and
    /// caching a downscaled copy when needed. When `size` meets or exceeds the
    /// source width the original is served untouched.
    ///
    /// Blocking (image decode + disk I/O): call from a blocking context.
    pub fn texture_path(&self, file: &str, size: u32) -> Result<PathBuf, TexError> {
        let src = self.textures_dir.join(file);
        if !src.is_file() {
            return Err(TexError::NotFound);
        }

        // At (or above) the native resolution, serve the original as-is.
        let src_w = self.manifest.get(file).copied().unwrap_or(0);
        if src_w != 0 && size >= src_w {
            return Ok(src);
        }

        let out = self.cache_dir.join(format!("{size}_{file}"));
        if out.is_file() {
            return Ok(out);
        }

        let img = image::open(&src).map_err(|e| {
            tracing::error!(%file, error = %e, "Cosmos texture decode failed");
            TexError::Decode
        })?;
        let (w, h) = (img.width().max(1), img.height().max(1));
        let nh = (((size as u64) * (h as u64)) / (w as u64)).max(1) as u32;
        // Lanczos3: best quality for the one-off 8K→N downscale that gets cached.
        let scaled = img.resize_exact(size, nh, image::imageops::FilterType::Lanczos3);

        // Atomic write: a concurrent request generating the same tier must never
        // observe a half-written file (matches the PHP tmp+rename).
        let tmp = self.cache_dir.join(format!("{size}_{file}.tmp.{}", std::process::id()));
        {
            let f = std::fs::File::create(&tmp).map_err(|e| {
                tracing::error!(?tmp, error = %e, "Cosmos cache write failed");
                TexError::Io
            })?;
            let mut writer = std::io::BufWriter::new(f);
            let res = if Self::is_png(file) {
                use image::ImageEncoder;
                image::codecs::png::PngEncoder::new(&mut writer)
                    .write_image(scaled.as_bytes(), scaled.width(), scaled.height(), scaled.color().into())
            } else {
                // JPEG quality 85, as in the PHP original.
                let rgb = scaled.to_rgb8();
                image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, 85)
                    .encode_image(&rgb)
            };
            res.map_err(|e| {
                tracing::error!(%file, error = %e, "Cosmos texture encode failed");
                TexError::Io
            })?;
        }
        std::fs::rename(&tmp, &out).map_err(|e| {
            let _ = std::fs::remove_file(&tmp);
            tracing::error!(?out, error = %e, "Cosmos cache rename failed");
            TexError::Io
        })?;
        Ok(out)
    }

    /// Path of an allowed catalog data file, if present.
    pub fn data_path(&self, file: &str) -> Option<PathBuf> {
        if !DATA_FILES.contains(&file) {
            return None;
        }
        let p = self.data_dir.join(file);
        p.is_file().then_some(p)
    }
}

/// Validate a texture filename: `^[a-z0-9_]+\.(jpg|jpeg|png)$` (case-insensitive),
/// which also guards against path traversal.
pub fn valid_texture_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    let Some((stem, ext)) = lower.rsplit_once('.') else {
        return false;
    };
    if !matches!(ext, "jpg" | "jpeg" | "png") {
        return false;
    }
    !stem.is_empty() && stem.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
}

fn resolve_assets_dir(configured: Option<&str>) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(c) = configured {
        candidates.push(PathBuf::from(c));
    }
    candidates.push(PathBuf::from("/usr/lib/kubuno/modules/maps/cosmos"));
    candidates.push(PathBuf::from("./cosmos"));
    candidates.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("cosmos"));

    for c in candidates {
        if c.join("textures").is_dir() {
            return Some(c);
        }
    }
    tracing::warn!("Cosmos assets directory not found — 3D textures disabled");
    None
}

fn resolve_cache_dir(configured: Option<&str>) -> PathBuf {
    if let Some(c) = configured {
        return PathBuf::from(c);
    }
    let preferred = PathBuf::from("/var/lib/kubuno/modules/maps/cosmos-cache");
    if std::fs::create_dir_all(&preferred).is_ok() {
        return preferred;
    }
    PathBuf::from("./data/cosmos-cache")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_expected_texture_names() {
        assert!(valid_texture_name("8k_earth_daymap.jpg"));
        assert!(valid_texture_name("jup_io_norm.jpg"));
        assert!(valid_texture_name("8k_saturn_ring_alpha.png"));
        assert!(valid_texture_name("2K_URANUS.JPG"));
    }

    #[test]
    fn rejects_traversal_and_bad_extensions() {
        assert!(!valid_texture_name("../secret.jpg"));
        assert!(!valid_texture_name("a/b.jpg"));
        assert!(!valid_texture_name("evil.php"));
        assert!(!valid_texture_name("no-dash.jpg")); // '-' not allowed
        assert!(!valid_texture_name(".jpg"));
    }
}
