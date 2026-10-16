# Cosmos assets - celestial-body 3D models and surface maps

The 3D models of the celestial bodies shown in the Maps "solar system" view, and their surface maps, as separate
files - one source of truth shared by the web app (`maps/web`, three.js) and the native desktop renderer
(`maps/desktop`, wgpu). Before this, the geometry was built procedurally in code and the textures were loaded from a
CDN at runtime; now each body is a real model file with its texture maps beside it.

## Layout

```
cosmos.json            Manifest: every body → its model, material, texture maps and physical radius.
models/<id>.obj        The body: a unit-radius equirectangular UV sphere (the renderer scales it to size).
models/<id>-ring.obj   A ringed planet's ring: a flat annulus (Jupiter, Saturn, Uranus).
materials/<id>.mtl     Binds the body's texture maps (and its ring material) onto the model.
textures/<id>/
    color.jpg          The surface colour map (equirectangular).
    bump.jpg|png       The relief / bump map, where the body has one.
    clouds.jpg         Earth's translucent cloud layer.
    ring.jpg           Saturn's ring colour strip (mapped across the ring radially).
```

The sphere maps longitude → U (0 → 1 eastward) and latitude → V, with the north pole at the top of the image - the
layout every texture here uses, so a body's `color.jpg` wraps onto its sphere directly.

## Regenerating the geometry

The `.obj` and `.mtl` files are generated - never hand-edit them. After changing the body table (segments, which
maps a body has, a ring's radii), rerun:

```bash
cd tools && node gen_cosmos_obj.mjs
```

Pure Node, no dependencies. It writes only `models/` and `materials/`; it does not touch the textures.

## Texture sources and licences

The surface maps are bundled here (no runtime CDN dependency). Their sources:

- **Planet maps** (Sun, Mercury, Venus, Moon, Mars, Jupiter, Saturn, Uranus, Neptune, their bump maps and Saturn's
  ring): James Hastings-Trew, <https://planetpixelemporium.com>, via the `threex.planets` collection. His stated
  usage policy allows free use, including in commercial projects, without asking permission.
- **Earth** colour (`earth/color.jpg`, NASA "Blue Marble") and relief (`earth/bump.png`, NASA topography): NASA
  imagery (public domain), via the `three-globe` examples.

The maps were downsized for in-app use; the originals are the upstream files above. Keep this attribution in the
app's credits.
