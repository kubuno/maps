//! The platform extension points of Kubuno Maps.
//!
//! Everything the app does is written once, in `desktop/common`; what only an operating system can do goes
//! through the traits below, each with a portable default, so the app builds and runs on any system with nothing
//! registered. An OS folder overrides only what it does better, in the [`Platform`] its entry point hands to
//! [`crate::app::run`].
//!
//! | Extension point | Portable default | Windows override (`desktop/windows`) |
//! |---|---|---|
//! | [`LaunchRules`] | `--sample` asks for the offline sample | also a Debug build under a debugger without `--live` |
//! | [`Clock`]       | UTC from the system time | the local date, time and zone offset |
//! | [`UiHost`]      | the view as text ([`crate::app::TextUi`]) | the Win32 window |
//! | [`MapSurface`]  | none (text host draws no map) | the native map surface (see `DESKTOP-CONVERSION.md`) |

/// How the command line is read where a system adds its own rules.
pub trait LaunchRules: Send + Sync {
    /// Whether the app shows the offline sample instead of the account's data. `args` includes the program name.
    fn sample_requested(&self, args: &[String]) -> bool {
        args.iter().skip(1).any(|a| a == "--sample")
    }
}

/// The local wall-clock the app reads « now » from (ETA estimates, a last-updated label). The portable default
/// is UTC; a system override returns the viewer's local zone.
pub trait Clock: Send + Sync {
    fn now_ms(&self) -> i64 {
        now_ms()
    }

    /// Minutes east of UTC of the viewer's local zone. The portable default is UTC (0).
    fn utc_offset_minutes(&self) -> i32 {
        0
    }
}

/// The system time in Unix milliseconds.
pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// The map rendering surface. The web draws with MapLibre GL; a native OS front end draws the tiles itself (the
/// renderer choice is recorded in `DESKTOP-CONVERSION.md`). The portable crate names the extension point so the
/// app can drive a camera without owning a renderer; the default is `None` (the text host shows no map).
pub trait MapSurface {
    /// Moves the camera to a centre `[lng, lat]` and zoom. A no-op for a host that draws no map.
    fn set_camera(&self, center: [f64; 2], zoom: f64);
}

/// The user interface: runs the app for these options until it closes, and returns the exit code.
pub trait UiHost {
    fn run(&self, options: &crate::app::Options) -> i32;
}

/// The portable defaults of the command-line and clock extension points.
#[derive(Debug, Default, Clone, Copy)]
pub struct Portable;

impl LaunchRules for Portable {}
impl Clock for Portable {}

/// What an OS entry point hands to [`crate::app::run`]: the launch rules and the clock it overrides. The UI host
/// is passed separately (it is not `Send + Sync`, because a native window is thread-affine).
pub struct Platform {
    /// A short identifier for the running platform (`"portable"`, `"windows"`), for logs and the window title.
    pub name: &'static str,
    pub launch: Box<dyn LaunchRules>,
    pub clock: Box<dyn Clock>,
}

impl Default for Platform {
    fn default() -> Self {
        Platform {
            name: "portable",
            launch: Box::new(Portable),
            clock: Box::new(Portable),
        }
    }
}
