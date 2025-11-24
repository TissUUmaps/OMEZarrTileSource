# OMEZarrTileSource

[![Release](https://img.shields.io/github/v/release/TissUUmaps/OMEZarrTileSource?label=release)](https://github.com/TissUUmaps/OMEZarrTileSource/releases)
[![Issues](https://img.shields.io/github/issues/TissUUmaps/OMEZarrTileSource?label=issues)](https://github.com/TissUUmaps/OMEZarrTileSource/issues)
[![Pull requests](https://img.shields.io/github/issues-pr/TissUUmaps/OMEZarrTileSource?label=pr)](https://github.com/TissUUmaps/OMEZarrTileSource/pulls)
[![Pages](https://img.shields.io/github/actions/workflow/status/TissUUmaps/OMEZarrTileSource/pages.yml?label=pages)](https://github.com/TissUUmaps/OMEZarrTileSource/actions/workflows/pages.yaml)
[![Release](https://img.shields.io/github/actions/workflow/status/TissUUmaps/OMEZarrTileSource/release.yml?label=release)](https://github.com/TissUUmaps/OMEZarrTileSource/actions/workflows/release.yaml)
[![NPM version](https://img.shields.io/npm/v/OMEZarrTileSource?label=npm)](https://www.npmjs.com/package/OMEZarrTileSource)
[![License](https://img.shields.io/github/license/TissUUmaps/OMEZarrTileSource?label=license)](LICENSE)

An OpenSeadragon tile source for the OME-Zarr bioimage file format.

## Installation

Using npm:

```sh
npm install omezarr-tilesource
```

## Usage

```javascript
import OpenSeadragon from "openseadragon";
import { OMEZarrTileSource } from "omezarr-tilesource";

const url = ...;

// only necessary when using inline tile source configuration (see below)
OMEZarrTileSource.enable(OpenSeadragon);

const viewer = OpenSeadragon(
    ...
    tileSources: [
        // configuration with a URL string (only works with OME-Zarr ZIP URLs ending with .ozx)
        url,
        // inline configuration with an options object (requires prior enabling, see above)
        {
            type: "ome-zarr",
            url: url,
            // zip: undefined,  // undefined = OME-Zarr ZIP auto-detection based on .ozx suffix
            // t: undefined,
            // c: undefined,
            // z: undefined
        }
        // direct instantiation with a URL string (works with any OME-Zarr storage backend)
        new OMEZarrTileSource(url),
        // direct instantiation with an options object (no prior enabling required)
        new OMEZarrTileSource({
            url: url,
            // zip: undefined,  // undefined = OME-Zarr ZIP auto-detection based on .ozx suffix
            // t: undefined,
            // c: undefined,
            // z: undefined
        })
    ]
);
```

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
