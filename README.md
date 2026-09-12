# OMEZarrTileSource

[![Release](https://img.shields.io/github/v/release/TissUUmaps/OMEZarrTileSource?label=release)](https://github.com/TissUUmaps/OMEZarrTileSource/releases)
[![Issues](https://img.shields.io/github/issues/TissUUmaps/OMEZarrTileSource?label=issues)](https://github.com/TissUUmaps/OMEZarrTileSource/issues)
[![Pull requests](https://img.shields.io/github/issues-pr/TissUUmaps/OMEZarrTileSource?label=pr)](https://github.com/TissUUmaps/OMEZarrTileSource/pulls)
[![Deploy](https://img.shields.io/github/actions/workflow/status/TissUUmaps/OMEZarrTileSource/deploy.yml?label=deploy)](https://github.com/TissUUmaps/OMEZarrTileSource/actions/workflows/deploy.yml)
[![Publish](https://img.shields.io/github/actions/workflow/status/TissUUmaps/OMEZarrTileSource/publish.yml?label=publish)](https://github.com/TissUUmaps/OMEZarrTileSource/actions/workflows/publish.yml)
[![NPM version](https://img.shields.io/npm/v/omezarr-tilesource?label=npm)](https://www.npmjs.com/package/omezarr-tilesource)
[![License](https://img.shields.io/github/license/TissUUmaps/OMEZarrTileSource?label=license)](LICENSE)

An OpenSeadragon tile source for the OME-Zarr bioimage file format

## Prerequisites

OpenSeadragon 6 or newer

## Installation

Using pnpm:

```sh
pnpm add omezarr-tilesource
```

The package is distributed as an ES module for use with a bundler (e.g. Vite).
Its runtime dependencies ([zarrita](https://github.com/manzt/zarrita.js),
[@zarrita/storage](https://github.com/manzt/zarrita.js) and
[ome-zarr.js](https://github.com/BioNGFF/ome-zarr.js)) are installed alongside
it and are not bundled, so the app can import them (e.g. `NgffImage` from
ome-zarr.js) and share a single copy with the tile source.

## Usage

```javascript
import OpenSeadragon from "openseadragon";
import { OMEZarrTileSource } from "omezarr-tilesource";

const url = ...;

// configuration with URL (only works with zipped OME-Zarr URLs ending with .ozx)
const tileSource1 = url;

// inline configuration with options object (requires prior enabling, see below)
OMEZarrTileSource.enable(OpenSeadragon);
const tileSource2 = {
    type: "ome-zarr",
    url: url,
    // zip: undefined,  // undefined = OME-Zarr ZIP auto-detection based on .ozx suffix
    // c: undefined,  // undefined = composite of all active channels (requires dataType "context2d")
    // z: undefined,  // undefined = omero rdefs default (middle z-slice if missing)
    // t: undefined,  // undefined = omero rdefs default (middle timepoint if missing)
    // dataType: undefined,  // "context2d" (default, rendered tiles) or "ome-zarr" (raw single-channel chunks)
    // autoBoost: undefined  // boost brightness of dark tiles (default false)
};

// direct instantiation with URL (works with any OME-Zarr storage backend)
const tileSource3 = new OMEZarrTileSource(url);

// direct instantiation with options object (no prior enabling required)
const tileSource4 = new OMEZarrTileSource({
    url: url,
    // zip: undefined,  // undefined = OME-Zarr ZIP auto-detection based on .ozx suffix
    // c: undefined,  // undefined = composite of all active channels (requires dataType "context2d")
    // z: undefined,  // undefined = omero rdefs default (middle z-slice if missing)
    // t: undefined,  // undefined = omero rdefs default (middle timepoint if missing)
    // dataType: undefined,  // "context2d" (default, rendered tiles) or "ome-zarr" (raw single-channel chunks)
    // autoBoost: undefined  // boost brightness of dark tiles (default false)
});

const viewer = OpenSeadragon(
    ...
    tileSources: [
        tileSource1,
        tileSource2,
        tileSource3,
        tileSource4
    ]
);
```

### Accessing OME-Zarr metadata

Directly instantiated tile sources start loading the OME-Zarr metadata
immediately. Await `whenReady()` (or use the `OMEZarrTileSource.open` shortcut)
to access the `NgffImage` instance (ome-zarr.js) and the opened zarrita arrays
(one per resolution level) before adding the tile source to a viewer:

```javascript
const tileSource = await OMEZarrTileSource.open({ url: url, c: 0 });
// equivalent: await new OMEZarrTileSource({ url: url, c: 0 }).whenReady();

console.log(tileSource.image.getAxesNames()); // e.g. ["t", "z", "c", "y", "x"]
console.log(tileSource.image.omero?.channels); // omero channel metadata
console.log(tileSource.arrays[0].shape); // full-resolution array shape

viewer.addTiledImage({ tileSource: tileSource }); // no second metadata request
```

The metadata is loaded once per tile source instance: OpenSeadragon reuses a
tile source instance passed to it as-is (waiting for it to become ready if
necessary), whereas a URL or an inline configuration object makes OpenSeadragon
create (and load) a new instance. `whenReady()` rejects (and `image`/`arrays`
throw) if loading fails.

### Sharing OME-Zarr metadata between tile sources

A loaded `NgffImage` can be reused by other directly instantiated tile sources
for the same URL (e.g. one tile source per channel) by passing it as the second
constructor argument (also supported by `OMEZarrTileSource.open`). This skips
loading the OME-Zarr metadata (the `zip` option is ignored) and reuses the
opened zarrita arrays, which ome-zarr.js caches on the `NgffImage` instance.
The tile source never modifies the `NgffImage`, so sharing is safe:

```javascript
import { NgffImage } from "ome-zarr.js";

// reuse the image loaded by a first tile source
const tileSource1 = await OMEZarrTileSource.open({ url: url, c: 0 });
const tileSource2 = new OMEZarrTileSource(
  { url: url, c: 1 },
  tileSource1.image,
);

// or load the image with the app's own ome-zarr.js import
const image = await NgffImage.load(url);
const tileSource3 = new OMEZarrTileSource({ url: url, c: 2 }, image);
```

## Data pipeline

By default (`dataType: "context2d"`), tiles are rendered by the tile source and
passed to OpenSeadragon as 2D canvas contexts, using the rendering settings
(color, color LUT/map, contrast limits, inversion) from the omero metadata. For
multi-channel images without `c`, all active channels are rendered into a
composite image.

Contrast limits are taken from the omero channel windows (`window.start`,
`window.end`). Channels without them are rendered using the data type range
for integer types (e.g. `[0, 65535]` for `uint16`) and `[0, 1]` for floating
point types.

With `dataType: "ome-zarr"`, tiles are instead downloaded as raw single-channel
zarrita chunks and passed to OpenSeadragon with the data type `ome-zarr` (see
the `OMEZarrTileData` type). Multi-channel images therefore require the `c`
option. A converter from `ome-zarr` to `context2d` is registered on
`OpenSeadragon.converter` when the module is imported (and by
`OMEZarrTileSource.enable`). It reads the rendering settings at conversion time
from the omero channel referenced by the tile data (`OMEZarrTileData.channel`).
The channel object is shared by all tiles of a tile source, so advanced users
may modify it (e.g. from a `tile-invalidated` handler) and re-render the cached
tiles using `viewer.requestInvalidate()`.

## Example

[Example](https://tissuumaps.github.io/OMEZarrTileSource)

[Source code](index.html)

## Authors

[Jonas Windhager](https://github.com/jwindhager)

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## Acknowledgments

This project was initially [started by Will Moore](https://github.com/BioNGFF/ome-zarr.js/pull/22) at the [2025 OME-NGFF Workflows Hackathon](https://biovisioncenter.notion.site/2025-OME-NGFF-Workflows-Hackathon-25662fc04eb38148885ec0fee3ff8539) in Zurich, Switzerland.

## License

[MIT](LICENSE)
