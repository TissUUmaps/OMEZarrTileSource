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
[zarrita](https://github.com/manzt/zarrita.js),
[@zarrita/storage](https://github.com/manzt/zarrita.js) and
[ome-zarr.js](https://github.com/BioNGFF/ome-zarr.js) are peer dependencies
(installed automatically by pnpm and npm 7 or newer) and are not bundled, so
the app and the tile source share a single copy, e.g. for passing `NgffImage`
instances loaded by the app.

## Usage

```javascript
import OpenSeadragon from "openseadragon";
import { OMEZarrTileSource } from "omezarr-tilesource";

const url = ...;

// register the tile source and its data type converters with OpenSeadragon
// (required for inline configurations and URLs, see "Data pipeline" below)
OMEZarrTileSource.enable(OpenSeadragon);

// configuration with URL (only works with zipped OME-Zarr URLs, path ending in .ozx)
const tileSource1 = url;

// inline configuration with options object
const tileSource2 = {
    type: "ome-zarr",
    url: url,
    // zip: undefined,  // undefined = OME-Zarr ZIP auto-detection based on .ozx path suffix
    // t: undefined,  // undefined = omero rdefs default (middle timepoint if missing)
    // z: undefined,  // undefined = omero rdefs default (middle z-slice if missing)
    // c: undefined,  // channel index or array of indices; undefined = all active channels
    // range: undefined,  // contrast limits [min, max] or array thereof; undefined = omero windows
    // color: undefined,  // RGB color or array of colors; undefined = omero channel colors
    // lutOrColorMap: undefined,  // LUT/color map or array thereof; undefined = omero LUTs
    // inverted: undefined,  // boolean or array of booleans; undefined = omero inversion
    // autoBoost: undefined  // boost brightness of dark tiles (default false)
};

// direct instantiation with URL (works with any OME-Zarr storage backend)
const tileSource3 = new OMEZarrTileSource(url);

// direct instantiation with options object
const tileSource4 = new OMEZarrTileSource({
    url: url,
    // zip: undefined,  // undefined = OME-Zarr ZIP auto-detection based on .ozx path suffix
    // t: undefined,  // undefined = omero rdefs default (middle timepoint if missing)
    // z: undefined,  // undefined = omero rdefs default (middle z-slice if missing)
    // c: undefined,  // channel index or array of indices; undefined = all active channels
    // range: undefined,  // contrast limits [min, max] or array thereof; undefined = omero windows
    // color: undefined,  // RGB color or array of colors; undefined = omero channel colors
    // lutOrColorMap: undefined,  // LUT/color map or array thereof; undefined = omero LUTs
    // inverted: undefined,  // boolean or array of booleans; undefined = omero inversion
    // autoBoost: undefined  // boost brightness of dark tiles (default false)
});

const viewer = OpenSeadragon({
    ...
    tileSources: [
        tileSource1,
        tileSource2,
        tileSource3,
        tileSource4
    ]
});
```

### Options

| Option          | Type                                                    | Default                                                                        | Description                                                                                                                                                                             |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`           | `string \| URL`                                         | (required)                                                                     | URL of the OME-Zarr image (group) or of a zipped OME-Zarr file, relative to the document base URL                                                                                       |
| `zip`           | `boolean`                                               | `true` if the `url` path ends with `.ozx`                                      | Whether `url` points to a zipped OME-Zarr file                                                                                                                                          |
| `t`             | `number`                                                | omero `rdefs.defaultT`, else middle plane                                      | Timepoint index (0-based)                                                                                                                                                               |
| `z`             | `number`                                                | omero `rdefs.defaultZ`, else middle plane                                      | Z-slice index (0-based)                                                                                                                                                                 |
| `c`             | `number \| number[]`                                    | all channels marked active in omero                                            | Channel index or indices (0-based) to render, composited in the given order. Arrays must be non-empty                                                                                   |
| `range`         | `[number, number] \| ([number, number] \| undefined)[]` | omero channel windows (`window.start`, `window.end`), else the data type range | Contrast limits (`[min, max]`) to render the channels with. Ignored for channels rendered with a color map                                                                              |
| `color`         | `Color \| (Color \| undefined)[]`                       | colors of the rendered omero channels, else white                              | RGB color or colors (`[r, g, b]`, 0-255) to render the channels with. Ignored for channels rendered with a LUT or color map                                                             |
| `lutOrColorMap` | `LUTOrColorMap \| (LUTOrColorMap \| undefined)[]`       | omero channel LUTs and color maps, else none                                   | Color LUT (a color per scaled value) or color map (a color per raw value, `Map`) to render the channels with; colors may carry alpha. A color map also overrides `range` and `inverted` |
| `inverted`      | `boolean \| (boolean \| undefined)[]`                   | omero channel inversion, else `false`                                          | Whether to invert the channels. Ignored for channels rendered with a color map                                                                                                          |
| `autoBoost`     | `boolean`                                               | `false`                                                                        | Boost the brightness of dark tiles (ome-zarr.js `renderChunks` option)                                                                                                                  |

`range`, `color`, `lutOrColorMap` and `inverted` take a single value, which
applies to all rendered channels, or one entry per rendered channel. An
`undefined` entry falls back to the omero metadata of that channel, as does the
option as a whole. The `ranges`, `colors`, `lutsOrColorMaps` and `inverteds`
getters return the resolved per-channel arrays.

`t`, `z` and `c` are validated against the image shape when the OME-Zarr
metadata is loaded; invalid indices fail with `open-failed`. Images without
`c` fail if the omero metadata marks no channel as active. An invalid `c`,
`url` or rendering setting is rejected by the constructor, which throws
synchronously before any request is made; the length of a rendering setting
array is only checked against `c` if that is configured too.

`url` is resolved against the document base URL when the tile source is
created; the resolved absolute URL is available as `tileSource.url` (always a
string) and is used for loading, for the tile cache keys and for comparing tile
sources.

### Accessing OME-Zarr metadata

Directly instantiated tile sources start loading the OME-Zarr metadata
immediately. Await `whenReady()` (or use the `OMEZarrTileSource.open` shortcut)
to access the loaded image (`loaded.image`, an ome-zarr.js `NgffImage`) and the
opened zarrita arrays (`loaded.arrays`, one per resolution level, highest
resolution first) before adding the tile source to a viewer:

```javascript
const tileSource = await OMEZarrTileSource.open({ url: url, c: 0 });
// equivalent: await new OMEZarrTileSource({ url: url, c: 0 }).whenReady();

console.log(tileSource.loaded.image.getAxesNames()); // e.g. ["t", "c", "z", "y", "x"]
console.log(tileSource.loaded.image.omero?.channels); // omero channel metadata
console.log(tileSource.loaded.arrays[0].shape); // full-resolution array shape

console.log(tileSource.t, tileSource.z, tileSource.cs); // resolved indices
console.log(tileSource.channels); // omero channels of the rendered channel indices
console.log(tileSource.ranges, tileSource.colors); // resolved rendering settings
console.log(tileSource.lutsOrColorMaps, tileSource.inverteds);
console.log(tileSource.getWidth(), tileSource.getHeight()); // full resolution
console.log(tileSource.getWidth(0), tileSource.getHeight(0)); // lowest resolution

viewer.addTiledImage({ tileSource: tileSource }); // no second metadata request
```

`OMEZarrTileSource.open` accepts an `AbortSignal` as `signal` in its third
argument to cancel loading. The metadata is loaded once per tile source
instance: OpenSeadragon reuses a tile source instance passed to it as-is
(waiting for it to become ready if necessary), whereas a URL or an inline
configuration object makes OpenSeadragon create (and load) a new instance.
`whenReady()` rejects (and `loaded` throws) if loading or validation fails.

The `t`, `z` and `cs` getters return the resolved values (the omero defaults or
active channels if the option was not given); `cs` is always an array (the
`c` option may be a single index), and `channels` returns the omero channel
objects for `cs`. Before the tile source is ready, they return the configured
options. The `ranges`, `colors`, `lutsOrColorMaps` and `inverteds` getters
return the resolved rendering settings of the rendered channels, merging the
configured values with the omero metadata per channel: `undefined` before the
tile source is ready or if the image has no omero metadata, like `channels`.
Entries that are still `undefined` fall back at render time to the data type
range, white, no LUT and not inverted.

### Sharing OME-Zarr metadata between tile sources

The loaded image and arrays (`OMEZarr`) can be reused by other directly
instantiated tile sources for the same URL (e.g. one tile source per channel)
by passing them as the second constructor argument (also supported by
`OMEZarrTileSource.open`). This skips loading the OME-Zarr metadata (the `zip`
option is ignored) and reuses the opened zarrita arrays. The tile source never
modifies the loaded image, so sharing is safe:

```javascript
// load once with the tile source's loader ...
const loaded = await OMEZarrTileSource.loadOMEZarr(url);
const tileSources = loaded.image.omero.channels.map(
  (_, c) => new OMEZarrTileSource({ url: url, c: c }, loaded),
);

// ... or reuse what a first tile source has loaded
const tileSource1 = await OMEZarrTileSource.open({ url: url, c: 0 });
const tileSource2 = new OMEZarrTileSource(
  { url: url, c: 1 },
  tileSource1.loaded,
);
```

`loadOMEZarr(url, zip?, { signal })` loads the metadata with ome-zarr.js and
opens the arrays of all resolution levels. An `OMEZarr` can also be assembled
from an `NgffImage` loaded by the app, as long as `arrays` lists the
opened arrays of `image.paths` in order. It is not checked against the URL of
the tile source it is passed to.

### Loading chunks directly

`loadChunks(level, tile, { signal })` returns the (y, x) zarrita chunks of the
rendered channels at the rendered timepoint and z-slice, either for one tile
(`{ x, y }` tile coordinates, as passed to OpenSeadragon) or for the whole
level plane (`tile` `undefined`):

```javascript
const chunks = await tileSource.loadChunks(tileSource.maxLevel, { x: 0, y: 0 });
const plane = await tileSource.loadChunks(0, undefined); // lowest resolution
```

`OMEZarrTileSource.render(tileData)` composites such chunks into a 2D canvas
context, the same way the `ome-zarr` to `context2d` converter does:

```javascript
import { getDataTypeRange } from "omezarr-tilesource";

const ctx = OMEZarrTileSource.render({
  chunks: plane,
  // the tile data holds the renderChunks arguments, one per chunk, with the
  // defaults of the tile source getters applied
  ranges: plane.map(
    (chunk, c) => tileSource.ranges?.[c] ?? getDataTypeRange(chunk),
  ),
  colors: plane.map((_, c) => tileSource.colors?.[c] ?? [255, 255, 255]),
  lutsOrColorMaps: plane.map((_, c) => tileSource.lutsOrColorMaps?.[c]),
  inverteds: plane.map((_, c) => tileSource.inverteds?.[c] ?? false),
  autoBoost: tileSource.autoBoost,
});
```

## Data pipeline

Tiles are downloaded as raw zarrita chunks, one per rendered channel, together
with the rendering settings resolved for that tile, and passed to OpenSeadragon
with the data type `ome-zarr` (see the `OMEZarrTileData` type: `chunks`,
`ranges`, `colors`, `lutsOrColorMaps`, `inverteds` and `autoBoost` — the
arguments of ome-zarr.js `renderChunks`, one entry per chunk). A converter from
`ome-zarr` to `context2d` calls `OMEZarrTileSource.render` on demand, which
composites them into a 2D canvas context. Because the raw chunks stay in the
tile cache, tiles can be re-rendered without re-downloading them.

Settings that are neither configured nor in the omero metadata are resolved
when the tile is downloaded: to the data type range for integer types (e.g.
`[0, 65535]` for `uint16`) and `[0, 1]` for floating point types, to white, to
no LUT and to not inverted — so an image without omero metadata is rendered in
white over its full data type range.

The converters are registered on `OpenSeadragon.converter` when the module is
imported (for the OpenSeadragon instance it imports, and for a global
`OpenSeadragon` if present) and by `OMEZarrTileSource.enable`. Tiles cannot be
rendered without them, so call `enable` if the app uses a different
OpenSeadragon instance than the one resolved by this module (e.g. a separately
bundled copy).

All rendering settings in `OMEZarrTileData` are plain values, resolved from the
tile source configuration and the omero metadata when the tile is downloaded.
Editing the omero channels of a loaded image therefore does not affect tiles
that are already cached, with or without `viewer.requestInvalidate()`; render
them differently by creating a tile source with the corresponding options
instead. Tile sources that configure rendering settings do not share cached
tiles with tile sources that configure different ones.

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
