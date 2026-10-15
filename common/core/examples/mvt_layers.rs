//! List the layers of a vector tile: `cargo run --example mvt_layers -- <tile.pbf>`.
fn main() {
    let path = std::env::args().nth(1).expect("usage: mvt_layers <tile.pbf>");
    let tile = kubuno_maps_core::mvt::decode(&std::fs::read(path).expect("read")).expect("decode");
    for l in &tile.layers {
        let mut classes: Vec<&str> = l.features.iter().filter_map(|f| l.str(f, "class")).collect();
        classes.sort_unstable();
        classes.dedup();
        println!("{:<20} {:>5} features  classes: {}", l.name, l.features.len(), classes.join(","));
    }
}
