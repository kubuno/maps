# Kubuno Maps — mobile app

The Android and iOS app of Kubuno Maps, written in Rust and laid out like the desktop app (`../desktop`): one Cargo
workspace (`Cargo.toml`), one folder per role.

```
mobile/
├── Cargo.toml                                   the mobile Cargo workspace
├── common/kubuno-maps-mobile-common/            the complete app, portable
│   ├── src/views/*.kbview                       the screens (home, directions, layers, library, navigation,
│   │                                            place, search, track), edited in Visual Studio
│   ├── src/controls/map_view.rs                 the interactive themed map (a host control of the renderer)
│   ├── src/assets/maps/                         the themed basemap snapshots + the demo route (see its README)
│   └── examples/                                render the screens / the map gestures to PNG, no device needed
├── android/kubuno-maps-mobile-android/          the APK's entry point (package com.kubuno.maps, launcher icon)
└── ios/kubuno-maps-mobile-ios/                  the iOS app's entry point
```

The screens are rendered by the **shared Kubuno mobile renderer** and run by the **shared Android / iOS shells** —
both in the core repository (`core/mobile`), common to every module's mobile app. This repository holds the Maps
app only: its screens, its `MapView` control and its data. The map maths (Web Mercator projection) come from the
module's shared engine, `../common/core` (`kubuno-maps-core`), like the desktop app and the web.

In Visual Studio the projects are in `Kubuno.Maps.slnx`, under `Mobile/Common`, `Mobile/Android` and `Mobile/iOS`.

## Build

The core repository is expected next to this one (`../../core`), until core publishes a mobile tag.

```bash
# Portable app: tests, and the screens rendered to PNG files (any OS).
cargo test -p kubuno-maps-mobile-common
cargo run  -p kubuno-maps-mobile-common --example render_views -- <font.ttf> <out-dir>
cargo run  -p kubuno-maps-mobile-common --example map_zoom_demo -- <font.ttf> <out-dir>

# Android APK (needs the Android SDK + NDK and cargo-apk).
cd android/kubuno-maps-mobile-android && cargo apk build --target x86_64-linux-android

# iOS (on a Mac with the iOS SDK).
cargo build -p kubuno-maps-mobile-ios --target aarch64-apple-ios-sim
```

The previous Kotlin/Jetpack Compose app (MapLibre Native) that lived here is retired; it remains in the git history.
