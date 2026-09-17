import type * as zarr from "zarrita";

/** An RGB color, each component in the range 0-255. */
export type Color = [number, number, number];

/**
 * A color LUT (a color per scaled value, e.g. 256 entries) or a color map (a
 * color per raw pixel value), as used by the omero channels.
 *
 * Unlike {@link Color}, the colors may carry an alpha component, e.g. to render
 * unmapped label values transparently.
 */
export type LUTOrColorMap =
  | (Color | [number, number, number, number])[]
  | Map<number, Color | [number, number, number, number]>;

const blobUrls = new WeakMap<Blob, string>();

/**
 * Resolves a URL against the document base URL.
 *
 * A `Blob` (e.g. a `File`) resolves to an object URL (`blob:`), created once
 * per `Blob` instance (and never revoked) so that tile sources for the same
 * `Blob` share a URL.
 *
 * @param url - URL of the OME-Zarr image, as a string or a `URL`, or a `Blob`
 * @returns The absolute URL
 * @throws If the URL is relative and there is no document base URL
 */
export function resolveUrl(url: string | URL | Blob): URL {
  if (url instanceof Blob) {
    let blobUrl = blobUrls.get(url);
    if (blobUrl === undefined) {
      blobUrl = URL.createObjectURL(url);
      blobUrls.set(url, blobUrl);
    }
    return new URL(blobUrl);
  }
  return new URL(url, globalThis.document?.baseURI);
}

/**
 * Whether a URL points to a zipped OME-Zarr file (`.ozx` path suffix, ignoring
 * any query and fragment).
 *
 * @param url - URL to check, as a string or a `URL`
 * @returns Whether the URL path ends in `.ozx`
 */
export function isOZX(url: string | URL): boolean {
  try {
    return resolveUrl(url).pathname.endsWith(".ozx");
  } catch {
    return url.toString().endsWith(".ozx"); // not a URL (e.g. an unrelated tile source)
  }
}

/**
 * Value range of a chunk's data type, used when a channel has no window.
 *
 * @param chunk - Chunk to get the data type range of
 * @returns The minimum and maximum value of the data type (`[0, 1]` for
 *   floating point and boolean data)
 */
export function getDataTypeRange(
  chunk: zarr.Chunk<zarr.NumberDataType | zarr.BigintDataType>,
): [number, number] {
  const { data } = chunk;
  if (data instanceof Int8Array) {
    return [-128, 127];
  }
  if (data instanceof Uint8Array) {
    return [0, 255];
  }
  if (data instanceof Int16Array) {
    return [-32768, 32767];
  }
  if (data instanceof Uint16Array) {
    return [0, 65535];
  }
  if (data instanceof Int32Array) {
    return [-2147483648, 2147483647];
  }
  if (data instanceof Uint32Array) {
    return [0, 4294967295];
  }
  if (data instanceof BigInt64Array) {
    return [-(2 ** 63), 2 ** 63 - 1]; // not exactly representable as number
  }
  if (data instanceof BigUint64Array) {
    return [0, 2 ** 64 - 1]; // not exactly representable as number
  }
  return [0, 1]; // floating point (and bool)
}

/**
 * 32-bit FNV-1a hash of a string, over its UTF-16 code units.
 *
 * @param text - Text to hash
 * @returns The hash, as an unsigned 32-bit integer
 */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5 >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }
  return hash >>> 0;
}
