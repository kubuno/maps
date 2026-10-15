//! The app itself: the launch options, the entry point ([`run`]) and the portable text UI host.
//!
//! An OS front end builds a [`crate::platform::Platform`] and a [`crate::platform::UiHost`] and calls [`run`];
//! with nothing overridden, [`run`] falls back to [`TextUi`], which prints the opening view as text so the
//! portable crate is runnable (and testable) without a window.

use crate::platform::{Platform, UiHost};
use crate::state::MapView;

/// The program name (the web module id), used in the window title and the usage line.
pub const PROGRAM: &str = "kubuno-maps";

/// The parsed launch options.
#[derive(Debug, Clone, PartialEq)]
pub struct Options {
    /// Show the offline sample dataset instead of the account's data.
    pub sample: bool,
    /// Dark surface theme.
    pub dark: bool,
    /// UI culture (`"fr"` / `"en"`).
    pub culture: String,
    /// The opening map view.
    pub view: MapView,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            sample: false,
            dark: false,
            culture: "fr".to_string(),
            view: MapView::default(),
        }
    }
}

impl Options {
    /// Reads the options from a command line (`args` includes the program name), given the platform's launch
    /// rules. Only the flags the first increment needs are parsed; unknown flags are ignored.
    pub fn from_args(platform: &Platform, args: &[String]) -> Options {
        let mut o = Options {
            sample: platform.launch.sample_requested(args),
            ..Options::default()
        };
        let mut it = args.iter().skip(1);
        while let Some(a) = it.next() {
            match a.as_str() {
                "--dark" => o.dark = true,
                "--culture" => {
                    if let Some(c) = it.next() {
                        o.culture = c.clone();
                    }
                }
                _ => {}
            }
        }
        o
    }
}

/// Runs the app with a platform and a UI host, returning the process exit code.
pub fn run(_platform: Platform, ui: &dyn UiHost) -> i32 {
    let args: Vec<String> = std::env::args().collect();
    let options = Options::from_args(&_platform, &args);
    ui.run(&options)
}

/// The portable fallback UI host: prints the opening view as text. An OS front end replaces it with a window.
#[derive(Debug, Default, Clone, Copy)]
pub struct TextUi;

impl UiHost for TextUi {
    fn run(&self, options: &Options) -> i32 {
        let v = &options.view;
        println!(
            "{PROGRAM}: {} — centre [{:.4}, {:.4}] z{:.1} ({} overlay(s), labels {})",
            v.basemap.id(),
            v.center[0],
            v.center[1],
            v.zoom,
            v.overlays.len(),
            if v.labels { "on" } else { "off" },
        );
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_flags() {
        let args = vec![
            PROGRAM.to_string(),
            "--dark".to_string(),
            "--culture".to_string(),
            "en".to_string(),
            "--sample".to_string(),
        ];
        let o = Options::from_args(&Platform::default(), &args);
        assert!(o.dark);
        assert!(o.sample);
        assert_eq!(o.culture, "en");
    }

    #[test]
    fn text_host_runs() {
        assert_eq!(TextUi.run(&Options::default()), 0);
    }
}
