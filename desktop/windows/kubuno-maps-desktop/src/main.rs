//! Kubuno Maps for Windows (`kubuno-maps.exe`) — `Program.cs`: the app of desktop/common with the Windows
//! platform registered and the Win32 window as its user interface.
//!
//! `kubuno-maps [--dark] [--culture fr|en] [--sample | --live]`

// A GUI application: no console window, in Debug too.
#![windows_subsystem = "windows"]

fn main() {
    let code = kubuno_maps_desktop_common::app::run(
        kubuno_maps_desktop::platform::platform(),
        &kubuno_maps_desktop::WindowsUi,
    );
    std::process::exit(code);
}
