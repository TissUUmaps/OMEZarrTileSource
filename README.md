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
    // t: undefined,
    // c: undefined,
    // z: undefined
};

// direct instantiation with URL (works with any OME-Zarr storage backend)
const tileSource3 = new OMEZarrTileSource(url);

// direct instantiation with options object (no prior enabling required)
const tileSource4 = new OMEZarrTileSource({
    url: url,
    // zip: undefined,  // undefined = OME-Zarr ZIP auto-detection based on .ozx suffix
    // t: undefined,
    // c: undefined,
    // z: undefined
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

### Options

| Option     | Default       | Description                                                                                                  |
| ---------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| `url`      | required      | URL of the OME-Zarr image (group containing the `multiscales` metadata)                                      |
| `zip`      | `undefined`   | Read a zipped OME-Zarr (`.ozx`) via HTTP range requests; `undefined` auto-detects based on the `.ozx` suffix |
| `t`, `z`   | `undefined`   | Time point / z-slice to show; defaults to the omero `rdefs` defaults (the middle plane if not available)     |
| `c`        | `undefined`   | Render only this channel; by default all channels marked as active in the omero metadata are rendered        |
| `dataType` | `"context2d"` | Data type produced per tile, see below                                                                       |

### Data types

OMEZarrTileSource is built on the [OpenSeadragon 6 data pipeline](https://openseadragon.github.io/examples/data-types/) and can produce tiles as one of two data types:

- `"context2d"` (default): tiles are rendered by [ome-zarr.js](https://github.com/BioNGFF/ome-zarr.js) according to the omero metadata (channel colors, windows, LUTs) and delivered as `CanvasRenderingContext2D` objects, which OpenSeadragon draws directly. Only the active channels are fetched.
- `"zarrChunk"`: tiles are delivered as raw [zarrita](https://zarrita.dev) chunks (`{ data, shape, stride }`), covering the tile region in x/y, the selected `t`/`z`/`c` plane (length 1) and, if `c` is not set, _all_ channels. The chunk has the same rank as the underlying array, i.e. `chunk.shape` aligns with the `axes` of the OME-Zarr `multiscales` metadata. OpenSeadragon renders such tiles through the `zarrChunk` → `context2d` converter registered by OMEZarrTileSource, so the image still shows up without further work.

Access the data in a [`tile-invalidated`](https://openseadragon.github.io/examples/data-modifications/) handler:

```javascript
const viewer = OpenSeadragon({
    ...
    tileSources: { type: "ome-zarr", url: url, dataType: "zarrChunk" },
});

viewer.addHandler("tile-invalidated", async (event) => {
    const chunk = await event.getData("zarrChunk"); // raw pixel values
    const ctx = await event.getData("context2d"); // rendered tile
    // e.g. custom rendering:
    // await event.setData(myCanvas.getContext("2d"), "context2d");
});
```

Notes:

- OpenSeadragon keeps a single data type per cache record. The raw chunk is always available to `tile-invalidated` handlers when a tile is loaded; it is kept afterwards (e.g. for `viewer.requestInvalidate()`) only if a handler accessed or modified the data, otherwise OpenSeadragon converts it in place to the drawer's type.
- If a channel window has no `start`/`end`, they are derived once from the smallest resolution level when the image is opened, so all tiles share the same range.

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
