import type { NgffImage } from "ome-zarr.js";
import type * as zarr from "zarrita";

/**
 * A loaded OME-Zarr image: the ome-zarr.js {@link NgffImage} holding the
 * metadata and the opened zarrita arrays of its multiscale pyramid.
 *
 * Created by {@link OMEZarrTileSource.loadOMEZarr} and exposed by
 * {@link OMEZarrTileSource.loaded}. Can be passed to the constructor or to
 * {@link OMEZarrTileSource.open} to share one metadata load across several
 * tile sources for the same URL. The tile source never modifies it.
 */
export type OMEZarr = {
  /** OME-Zarr metadata (multiscales, axes, omero) */
  image: NgffImage;

  /** One array per resolution level, highest resolution first */
  arrays: zarr.Array<zarr.NumberDataType | zarr.BigintDataType>[];
};
