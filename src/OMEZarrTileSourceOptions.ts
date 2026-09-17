import type { Color, LUTOrColorMap } from "./utils";

/**
 * Configuration of an {@link OMEZarrTileSource}.
 *
 * Also accepted by OpenSeadragon as an inline tile source configuration
 * (`tileSources: { type: "ome-zarr", url, ... }`) once the tile source has been
 * registered with {@link OMEZarrTileSource.enable}.
 */
export interface OMEZarrTileSourceOptions {
  /** Tile source type for inline OpenSeadragon configurations */
  type?: "ome-zarr";

  /**
   * URL of the OME-Zarr image (group) or of a zipped OME-Zarr file, as a
   * string or a `URL`.
   *
   * Relative URLs are resolved against the document base URL.
   */
  url: string | URL;

  /**
   * Whether the URL points to a zipped OME-Zarr file.
   *
   * Defaults to `true` for URLs whose path ends in `.ozx` (ignoring any query
   * and fragment) and `false` otherwise.
   */
  zip?: boolean;

  /**
   * Timepoint index (0-based) to render.
   *
   * Defaults to the omero `rdefs.defaultT`, or to the middle timepoint if the
   * metadata has none. Validated against the image shape when the image is
   * loaded.
   */
  t?: number;

  /**
   * Z-slice index (0-based) to render.
   *
   * Defaults to the omero `rdefs.defaultZ`, or to the middle z-slice if the
   * metadata has none. Validated against the image shape when the image is
   * loaded.
   */
  z?: number;

  /**
   * Channel index or indices (0-based) to render, composited in the given
   * order.
   *
   * A single index is equivalent to an array with one element; arrays must be
   * non-empty. Defaults to all channels marked active in the omero metadata
   * (or to all channels if the metadata has no omero section). Validated
   * against the image shape when the image is loaded.
   */
  c?: number | number[];

  /**
   * Contrast limits (`[min, max]`) to render the channels ({@link c}) with,
   * overriding the omero channel windows.
   *
   * A single range applies to all rendered channels; arrays must have one
   * entry per rendered channel, which is only checked against {@link c} if
   * that is configured too. `undefined` entries fall back to the omero channel
   * window (`window.start`, `window.end`), as does the default, and to the
   * data type range if the metadata has none. Ignored for channels rendered
   * with a color map.
   */
  range?: [number, number] | ([number, number] | undefined)[];

  /**
   * RGB color to render the channels ({@link c}) with, overriding the omero
   * channel colors.
   *
   * A single color applies to all rendered channels; arrays must have one
   * color per rendered channel, which is only checked against {@link c} if
   * that is configured too. `undefined` entries fall back to the omero channel
   * color, as does the default, and to white if the metadata has none. Ignored
   * for channels rendered with a LUT or color map.
   */
  color?: Color | (Color | undefined)[];

  /**
   * Color LUT or color map to render the channels ({@link c}) with, overriding
   * the omero channel LUTs and color maps.
   *
   * A single LUT or color map applies to all rendered channels; arrays must
   * have one entry per rendered channel, which is only checked against
   * {@link c} if that is configured too. `undefined` entries fall back to the
   * omero channel LUT or color map, as does the default, and to rendering with
   * {@link color} if the metadata has none. A color map also overrides
   * {@link range} and {@link inverted}.
   */
  lutOrColorMap?: LUTOrColorMap | (LUTOrColorMap | undefined)[];

  /**
   * Whether to invert the channels ({@link c}), overriding the omero channel
   * inversion.
   *
   * A single value applies to all rendered channels; arrays must have one
   * entry per rendered channel, which is only checked against {@link c} if
   * that is configured too. `undefined` entries fall back to the omero channel
   * inversion, as does the default, and to `false` if the metadata has none.
   * Ignored for channels rendered with a color map.
   */
  inverted?: boolean | (boolean | undefined)[];

  /**
   * Boost the brightness of dark tiles (ome-zarr.js `renderChunks` option).
   *
   * Defaults to `false`.
   */
  autoBoost?: boolean;
}
