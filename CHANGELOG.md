# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[unreleased]: https://github.com/TissUUmaps/OMEZarrTileSource/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/TissUUmaps/OMEZarrTileSource/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/TissUUmaps/OMEZarrTileSource/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/TissUUmaps/OMEZarrTileSource/compare/v0.0.3...v0.1.1
[0.0.3]: https://github.com/TissUUmaps/OMEZarrTileSource/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/TissUUmaps/OMEZarrTileSource/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/TissUUmaps/OMEZarrTileSource/releases/tag/v0.0.1
