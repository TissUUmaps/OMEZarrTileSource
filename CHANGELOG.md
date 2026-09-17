# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `url` (option, constructor argument, and `OMEZarrTileSource.open` / `loadOMEZarr` argument) accepts a `Blob` (e.g. a `File`) holding a zipped OME-Zarr file, read with the zarrita `ZipFileStore.fromBlob` store; `zip` defaults to `true` for a `Blob` and `zip: false` is rejected
- `blob` property holding the configured `Blob`, if any; `url` is then an object URL created once per `Blob` instance (`resolveUrl` accepts a `Blob`), so tile sources for the same `Blob` compare equal and share cached tiles

### Changed

### Fixed

### Removed

## [0.6.0] - 2026-09-17

### Added

- `OMEZarrTileSource.loadOMEZarr(url, zip?, { signal })` loads the OME-Zarr metadata and opens the arrays of all resolution levels; the result (`OMEZarr`, `{ image, arrays }`) can be passed to the constructor or to `OMEZarrTileSource.open` to share one load across tile sources
- `loaded` getter returning the `OMEZarr` (throws until ready)
- `t`, `z` and `cs` getters returning the resolved indices (omero defaults or active channels if not configured), and `channels` getter returning the corresponding omero channel objects
- `getWidth(level)` and `getHeight(level)` returning the pixel size of a resolution level (default: full resolution)
- `loadChunks(level, tile, { signal })` loading the zarrita chunks of the rendered channels for one tile or the whole level plane
- `OMEZarrTileSource.render(tileData)` compositing `ome-zarr` tile data into a 2D canvas context; used by the `ome-zarr` to `context2d` converter and usable directly for chunks loaded with `loadChunks`
- `range`, `color`, `lutOrColorMap` and `inverted` options: a single value for all rendered channels, or one value per rendered channel, overriding the contrast window, color, LUT/color map and inversion of the omero channels; an `undefined` entry falls back to the omero value of that channel
- `ranges`, `colors`, `lutsOrColorMaps` and `inverteds` getters returning the resolved rendering settings, one entry per rendered channel
- `LUTOrColorMap` type export (a color LUT or a color map, with optional alpha)
- `signal` option (`AbortSignal`) for `OMEZarrTileSource.open`
- `OMEZarr` and `Color` type exports
- `resolveUrl(url)`, `isOZX(url)` and `getDataTypeRange(chunk)` helpers, previously private statics of the tile source, and an `fnv1a(text)` string hash
- TSDoc comments for the public API

### Changed

- **Breaking:** the `c` option now also accepts an array of channel indices that are composited in the given order, and the resolved indices are exposed by the new `cs` getter (always an array); `undefined` still renders all channels marked active in the omero metadata. An empty array is rejected
- **Breaking:** tiles are always passed to OpenSeadragon as raw `ome-zarr` data and rendered by the registered converter; `OMEZarrTileData` now holds one chunk per rendered channel (`chunks`) and the fully resolved `renderChunks` arguments for that tile (`ranges`, `colors`, `lutsOrColorMaps`, `inverteds`) instead of a single `chunk`/`channel`
- **Breaking:** the second argument of the constructor and of `OMEZarrTileSource.open` is an `OMEZarr` (`{ image, arrays }`) instead of an `NgffImage`
- **Breaking:** `url` is resolved against the document base URL when the tile source is created, so `tileSource.url` (used for loading, tile cache keys and `equals`) is always an absolute URL string; the constructor throws for relative URLs that cannot be resolved
- The `url` option, the constructor, `OMEZarrTileSource.open` and `OMEZarrTileSource.loadOMEZarr` accept a `URL` object in addition to a string
- The constructor validates `c` and the rendering settings (and resolves the URL) before scheduling the metadata load, so an invalid configuration throws synchronously without starting a request
- Explicit `c` no longer requires channels to be marked active in the omero metadata; the "No active channels" check only applies when `c` is not given
- **Breaking:** all rendering settings are resolved when a tile is downloaded instead of when it is rendered, and `OMEZarrTileData.channels` has been removed; editing the omero channels of a loaded image no longer affects cached tiles, with or without `viewer.requestInvalidate()`
- **Breaking:** `equals` and the tile cache key take the configured rendering settings into account, so tile sources of the same image that render it differently no longer share cached tiles
- Images without omero metadata are accepted when passed as an `OMEZarr` and rendered in white using the data type range
- The level scale and the number of tiles per level (`getNumTiles`) are derived from the actual array shape of each resolution level instead of the width-based scale; tile requests outside a level are rejected
- `equals` compares the URL, `zip`, the resolved `t`, `z` and `cs` and the hash of the configured rendering settings, i.e. exactly the components of the tile cache key
- The tile cache key includes the resolved `t`, `z` and `c` and the `zip` flag, so tile sources rendering the same data share cached tiles
- `zip` is auto-detected from the `.ozx` suffix of the URL path (ignoring any query and fragment) in all constructor forms and defaults to `false` instead of `undefined`

### Fixed

- Color LUTs are copied before rendering, so that the in-place `reverse()` of ome-zarr.js `renderChunks` no longer corrupts the LUT of an inverted channel

### Removed

- **Breaking:** `dataType` option; every tile is `ome-zarr` data (see above)
- **Breaking:** `image` and `arrays` getters; use `loaded.image` and `loaded.arrays`

## [0.5.0] - 2026-09-12

### Changed

- The package is now a pure ES module library: the `main` field and the `require` export condition have been dropped along with the UMD build
- `zarrita`, `@zarrita/storage` and `ome-zarr.js` are now peer dependencies (with version ranges) instead of regular dependencies, so that the app and the tile source resolve a single module instance

### Fixed

- The runtime dependencies `zarrita`, `@zarrita/storage` and `ome-zarr.js` are no longer bundled into the library build but imported from the consuming app's installation, so that a single copy is shared (required for passing `NgffImage` instances created by the app, and reduces the bundle from ~1.5 MB to ~9 kB)

### Removed

- UMD build (`dist/omezarr-tilesource.umd.cjs`)

## [0.4.0] - 2026-09-12

### Added

- Optional `image` argument of the constructor and `OMEZarrTileSource.open` to reuse a loaded `NgffImage` (and its opened arrays) across tile sources for the same URL, e.g. one tile source per channel
- `whenReady()` method returning a promise that resolves with the tile source once the OME-Zarr metadata has been loaded (and rejects on failure), and static `OMEZarrTileSource.open` shortcut that constructs a tile source and awaits it
- `image` (ome-zarr.js `NgffImage`) and `arrays` (zarrita arrays, one per resolution level) getters for accessing OME-Zarr metadata, e.g. before adding the tile source to a viewer

### Changed

- Channels without `window.start`/`window.end` in the omero metadata are now rendered using the data type range (integer types) or `[0, 1]` (floating point types) instead of the per-tile minimum/maximum
- The OME-Zarr metadata (`image`) is treated as read-only: the `z` and `t` options are applied when requesting tiles instead of modifying the omero `rdefs`
- The `c`, `z` and `t` options are validated against the image shape when loading the image; invalid indices fail with `open-failed` instead of failing individual tiles

### Fixed

- Errors thrown while rendering a tile (e.g. failing to get a 2D canvas context) now fail the tile download instead of leaving the tile pending with an unhandled promise rejection
- Images whose omero metadata lacks `rdefs` can now be rendered (the middle z-slice/timepoint is used unless `z`/`t` are specified)

## [0.3.0] - 2026-09-11

### Added

- OpenSeadragon data type `ome-zarr` (see `OMEZarrTileData`) with converters to `context2d` and for copying
- Option `dataType` to choose between `context2d` tiles rendered by the tile source (default; composite of all active channels for multi-channel images without `c`) and raw `ome-zarr` tile data
- Option `autoBoost` to boost the brightness of dark tiles (ome-zarr.js `renderChunks` autoBoost)

### Changed

- Require OpenSeadragon 6 or newer (peer dependency `>=6.0.0 <7.0.0`)
- Updated OpenSeadragon to 6.1.1
- Updated ome-zarr.js to 0.0.20 and zarrita to 0.7.5
- Switched from the deprecated `renderImage` function to `NgffImage` for loading and `getSlices`/`renderChunks` for rendering
- Tiles are rendered by the tile source (`dataType` `"context2d"`, default) or downloaded as raw single-channel zarrita chunks (`dataType` `"ome-zarr"`) that are rendered to `context2d` by a registered converter, so tiles can be re-rendered from cache without re-downloading
- Images with the X axis before the Y axis are rejected
- Images whose omero metadata lists a different number of channels than the image has are rejected
- Multi-channel images require the `c` option for `dataType` `"ome-zarr"`
- Aborted tile downloads now also cancel the underlying chunk requests

### Fixed

- The `c` option now selects the channel to render (previously ignored)

### Removed

- Support for OpenSeadragon 5
- `OMEZarrTileSource.DUMMY_XHR`; tile jobs now finish and fail with a `null` request
- `OMEZarrTileSourceClass` type export and the `OpenSeadragon.OMEZarrTileSource` module augmentation

## [0.2.0] - 2026-05-25

### Added

- Support for OpenSeadragon 6

## [0.1.2] - 2026-05-25

### Added

- Support for pnpm 11
- Support for OME-Zarr v0.5

## [0.1.1] - 2026-04-10

### Added

- CI workflow
- Emit type declarations
- pnpm, eslint, prettier, vitest + coverage, husky + lint-staged

### Changed

- Updated dependencies
- Fixed linting errors
- Formatted code base

### Removed

- Increased Vite chunk size warning limit when building

## [0.0.3] - 2025-11-25

### Changed

- [#2](https://github.com/TissUUmaps/OMEZarrTileSource/pull/2) Fix CDN usage

## [0.0.2] - 2025-11-25

### Changed

Complete package.json

## [0.0.1] - 2025-11-24

### Added

Initial release

[unreleased]: https://github.com/TissUUmaps/OMEZarrTileSource/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/TissUUmaps/OMEZarrTileSource/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/TissUUmaps/OMEZarrTileSource/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/TissUUmaps/OMEZarrTileSource/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/TissUUmaps/OMEZarrTileSource/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/TissUUmaps/OMEZarrTileSource/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/TissUUmaps/OMEZarrTileSource/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/TissUUmaps/OMEZarrTileSource/compare/v0.0.3...v0.1.1
[0.0.3]: https://github.com/TissUUmaps/OMEZarrTileSource/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/TissUUmaps/OMEZarrTileSource/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/TissUUmaps/OMEZarrTileSource/releases/tag/v0.0.1
