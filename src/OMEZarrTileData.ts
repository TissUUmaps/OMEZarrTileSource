import type * as zarr from "zarrita";

import type { Color, LUTOrColorMap } from "./utils";

/**
 * Tile data of the OpenSeadragon data type `ome-zarr`.
 *
 * Every tile is finished with this raw data type; the converter registered by
 * {@link OMEZarrTileSource.enable} (and on import) renders it to `context2d`
 * on demand, so cached tiles can be re-rendered without re-downloading them.
 *
 * The rendering settings are the arguments of ome-zarr.js `renderChunks`, one
 * entry per chunk, fully resolved from the tile source configuration and the
 * omero metadata when the tile was downloaded — so changing either requires
 * re-downloading the tiles.
 */
export interface OMEZarrTileData {
  /** One (y, x) chunk per rendered channel, in {@link OMEZarrTileSource.cs} order */
  chunks: zarr.Chunk<zarr.NumberDataType | zarr.BigintDataType>[];

  /**
   * The contrast limits (`[min, max]`) of each chunk
   * ({@link OMEZarrTileSource.ranges}), falling back to the data type range of
   * the chunk. `min` is always less than `max`.
   */
  ranges: [number, number][];

  /**
   * The RGB color of each chunk ({@link OMEZarrTileSource.colors}), falling
   * back to white. Unused for chunks with a LUT or a color map.
   */
  colors: Color[];

  /**
   * The color LUT or color map of each chunk
   * ({@link OMEZarrTileSource.lutsOrColorMaps}). `undefined` entries are
   * rendered with their {@link colors} entry instead.
   */
  lutsOrColorMaps: (LUTOrColorMap | undefined)[];

  /**
   * Whether to invert each chunk ({@link OMEZarrTileSource.inverteds}), falling
   * back to `false`.
   */
  inverteds: boolean[];

  /** Boost the brightness of dark tiles (ome-zarr.js `renderChunks` option) */
  autoBoost: boolean;
}
