import ZipFileStore from "@zarrita/storage/zip";
import * as zarr from "zarrita";

/** A zarr array with numeric (or bigint) pixel data. */
export type ZarrArray = zarr.Array<zarr.NumberDataType | zarr.BigintDataType>;

/** In-memory data read from a {@link ZarrArray}. */
export type ZarrChunk = zarr.Chunk<zarr.NumberDataType | zarr.BigintDataType>;

/**
 * Opens a read-only store for `url`: a zipped OME-Zarr read via HTTP range
 * requests if `zip` is set (or the URL ends with `.ozx`), an HTTP store
 * otherwise.
 */
export function openStore(
  url: string,
  zip: boolean = url.endsWith(".ozx"),
): zarr.Readable {
  return zip ? ZipFileStore.fromUrl(url) : new zarr.FetchStore(url);
}

/** Deep copy of `chunk`. */
export function copyChunk(chunk: ZarrChunk): ZarrChunk {
  return {
    data: chunk.data.slice(),
    shape: [...chunk.shape],
    stride: [...chunk.stride],
  };
}

/**
 * The 2D (y, x) plane of a C-ordered `chunk` starting at element `offset`.
 * The plane shares its memory with the chunk.
 */
export function getPlane(
  chunk: ZarrChunk,
  offset: number,
  height: number,
  width: number,
): ZarrChunk {
  return {
    data: chunk.data.subarray(offset, offset + width * height),
    shape: [height, width],
    stride: [width, 1],
  };
}
