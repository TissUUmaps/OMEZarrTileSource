import ZipFileStore from "@zarrita/storage/zip";
import { type Channel, NgffImage, getSlices, renderChunks } from "ome-zarr.js";
import OpenSeadragon from "openseadragon";
import * as zarr from "zarrita";

import type { OMEZarr } from "./OMEZarr";
import type { OMEZarrTileData } from "./OMEZarrTileData";
import type { OMEZarrTileSourceOptions } from "./OMEZarrTileSourceOptions";
import {
  type Color,
  type LUTOrColorMap,
  fnv1a,
  getDataTypeRange,
  isOZX,
  resolveUrl,
} from "./utils";

/**
 * OpenSeadragon tile source for the OME-Zarr bioimage file format.
 *
 * Tiles correspond to the chunks of the multiscale pyramid stored in the
 * OME-Zarr image; OpenSeadragon level 0 is the lowest resolution and
 * `maxLevel` the highest. Tiles are delivered as raw `ome-zarr` data (see
 * {@link OMEZarrTileData}) and rendered by a registered converter.
 *
 * Constructing a tile source starts loading the OME-Zarr metadata
 * asynchronously (unless an {@link OMEZarr} is passed). Await
 * {@link OMEZarrTileSource.whenReady} or use {@link OMEZarrTileSource.open}
 * before accessing {@link OMEZarrTileSource.loaded} and the resolved
 * {@link OMEZarrTileSource.t}, {@link OMEZarrTileSource.z},
 * {@link OMEZarrTileSource.cs}, {@link OMEZarrTileSource.channels},
 * {@link OMEZarrTileSource.ranges}, {@link OMEZarrTileSource.colors},
 * {@link OMEZarrTileSource.lutsOrColorMaps} and
 * {@link OMEZarrTileSource.inverteds}.
 *
 * Importing this module registers the `ome-zarr` converters on the imported
 * OpenSeadragon instance (and on a global `OpenSeadragon`, if present). Call
 * {@link OMEZarrTileSource.enable} for any other OpenSeadragon instance, and to
 * register the tile source for inline configurations.
 */
export class OMEZarrTileSource extends OpenSeadragon.TileSource {
  declare readonly url: string;
  readonly blob?: Blob;
  readonly zip: boolean = false;
  private readonly _t?: number;
  private readonly _z?: number;
  private readonly _c?: number[];
  private readonly _renderSettings: {
    ranges?: ([number, number] | undefined)[];
    colors?: (Color | undefined)[];
    lutsOrColorMaps?: (LUTOrColorMap | undefined)[];
    inverteds?: (boolean | undefined)[];
    autoBoost: boolean;
  };
  private readonly _renderSettingsHash: number;

  width: number = 10;
  height: number = 10;
  private _loaded?: OMEZarr;
  private readonly _readyPromise = new Promise<this>((resolve, reject) => {
    this.addOnceHandler("ready", () => resolve(this));
    this.addOnceHandler("open-failed", (event) =>
      reject(new Error(event.message)),
    );
  });

  static {
    OMEZarrTileSource._learnConverters(OpenSeadragon);
  }

  /**
   * Registers the tile source and its `ome-zarr` data type converters with an
   * OpenSeadragon instance.
   *
   * Required for inline configurations (`{ type: "ome-zarr", ... }`) and for
   * rendering tiles with an OpenSeadragon instance other than the one imported
   * by this module.
   *
   * @param os - The OpenSeadragon module to register with
   */
  static enable(os: typeof OpenSeadragon = OpenSeadragon): void {
    Object.assign(os, { OMEZarrTileSource });
    OMEZarrTileSource._learnConverters(os);
  }

  /**
   * Loads the OME-Zarr metadata and opens the arrays of all resolution levels.
   *
   * The result can be passed to the constructor or to {@link open} to share one
   * metadata load across several tile sources for the same URL.
   *
   * @param url - URL of the OME-Zarr image or zipped OME-Zarr file, as a string
   *   or a `URL` (relative URLs are resolved against the document base URL),
   *   or a `Blob` (e.g. a `File`) holding a zipped OME-Zarr file
   * @param zip - Whether the URL points to a zipped OME-Zarr file; defaults to
   *   `true` for URLs whose path ends in `.ozx` and for `Blob`s
   * @param options - `signal` aborts the load
   * @returns The loaded image and its arrays, highest resolution first
   * @throws If the URL is relative and there is no document base URL, or if
   *   `zip` is `false` for a `Blob`
   */
  static async loadOMEZarr(
    url: string | URL | Blob,
    zip?: boolean,
    options?: { signal?: AbortSignal },
  ): Promise<OMEZarr> {
    const { signal } = options ?? {};
    signal?.throwIfAborted();
    let store: ZipFileStore | string;
    if (url instanceof Blob) {
      if (zip === false) {
        throw new Error("only zipped OME-Zarr files can be loaded from a Blob");
      }
      store = ZipFileStore.fromBlob(url);
    } else {
      const resolvedUrl = resolveUrl(url);
      store =
        (zip ?? isOZX(resolvedUrl))
          ? ZipFileStore.fromUrl(resolvedUrl)
          : url.toString();
    }
    const image = await NgffImage.load(store, { signal });
    const arrays = await Promise.all(
      image.paths.map(
        (resolution) =>
          image.openArray(resolution, { signal }) as Promise<
            zarr.Array<zarr.NumberDataType | zarr.BigintDataType>
          >,
      ),
    );
    return { image, arrays };
  }

  /**
   * Constructs a tile source and waits until its OME-Zarr metadata is loaded.
   *
   * Equivalent to `new OMEZarrTileSource(config, loaded).whenReady()`, except
   * that loading the metadata can be aborted with `signal`.
   *
   * @param config - URL, `Blob` or {@link OMEZarrTileSourceOptions}
   * @param loaded - Previously loaded image of the same URL to reuse instead of
   *   loading it
   * @param options - `signal` aborts the load
   * @returns The ready tile source; rejects if loading or validation fails
   */
  static async open(
    config: string | URL | Blob | OMEZarrTileSourceOptions,
    loaded?: OMEZarr,
    options?: { signal?: AbortSignal },
  ): Promise<OMEZarrTileSource> {
    const { signal } = options ?? {};
    signal?.throwIfAborted();
    loaded ??=
      typeof config === "string" ||
      config instanceof URL ||
      config instanceof Blob
        ? await OMEZarrTileSource.loadOMEZarr(config, undefined, { signal })
        : await OMEZarrTileSource.loadOMEZarr(config.url, config.zip, {
            signal,
          });
    return new OMEZarrTileSource(
      config as OMEZarrTileSourceOptions,
      loaded,
    ).whenReady();
  }

  /**
   * Renders `ome-zarr` tile data into a composite 2D canvas context.
   *
   * Called by the `ome-zarr` to `context2d` converter registered by
   * {@link enable} (and on import), and usable directly for rendering chunks
   * loaded with {@link loadChunks} outside of OpenSeadragon.
   *
   * The tile data holds the rendering settings exactly as passed to ome-zarr.js
   * `renderChunks`: each chunk is scaled to its {@link OMEZarrTileData.ranges}
   * entry, colorized with its {@link OMEZarrTileData.colors} entry or with its
   * {@link OMEZarrTileData.lutsOrColorMaps} entry, inverted if its
   * {@link OMEZarrTileData.inverteds} entry is set, and the results are blended
   * additively. Color maps ignore the range and the inversion.
   *
   * @param tileData - Chunks and rendering settings of one tile
   * @returns A 2D canvas context of the chunk size holding the composite
   * @throws If the chunks are empty or no 2D canvas context is available
   */
  static render(tileData: OMEZarrTileData): CanvasRenderingContext2D {
    const { chunks, ranges, colors, lutsOrColorMaps, inverteds, autoBoost } =
      tileData;
    const chunkWidth = chunks[0]!.shape[1]!;
    const chunkHeight = chunks[0]!.shape[0]!;
    const canvas = document.createElement("canvas");
    canvas.width = chunkWidth;
    canvas.height = chunkHeight;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("failed to get 2D canvas context");
    }
    // renderChunks reverses LUT arrays in place for inverted channels
    const lutOrColorMapCopies = lutsOrColorMaps.map((lutOrColorMap) =>
      Array.isArray(lutOrColorMap) ? [...lutOrColorMap] : lutOrColorMap,
    );
    const data = renderChunks(
      chunks,
      ranges,
      colors,
      lutOrColorMapCopies,
      inverteds,
      autoBoost,
    ) as Uint8ClampedArray<ArrayBuffer>;
    const img = new ImageData(data, chunkWidth, chunkHeight);
    ctx.putImageData(img, 0, 0);
    return ctx;
  }

  /**
   * Creates a tile source and starts loading the OME-Zarr metadata (unless
   * `loaded` is given), raising `ready` or `open-failed` asynchronously.
   *
   * @param url - URL of the OME-Zarr image, as a string or a `URL`, resolved
   *   against the document base URL (zipped files are detected by the `.ozx`
   *   path suffix), or a `Blob` (e.g. a `File`) holding a zipped OME-Zarr file
   * @param loaded - Previously loaded image of the same URL to reuse instead of
   *   loading it
   * @throws If the URL cannot be resolved
   */
  constructor(url: string | URL | Blob, loaded?: OMEZarr);
  /**
   * Creates a tile source and starts loading the OME-Zarr metadata (unless
   * `loaded` is given), raising `ready` or `open-failed` asynchronously.
   *
   * @param options - Tile source configuration
   * @param loaded - Previously loaded image of the same URL to reuse instead of
   *   loading it
   * @throws If the configuration is invalid (e.g. `zip: false` with a `Blob`)
   *   or the URL cannot be resolved */
  constructor(options: OMEZarrTileSourceOptions, loaded?: OMEZarr);
  constructor(
    config: string | URL | Blob | OMEZarrTileSourceOptions,
    loaded?: OMEZarr,
  ) {
    // validated before super(), which schedules getImageInfo (async)
    const options: OMEZarrTileSourceOptions =
      typeof config === "string" ||
      config instanceof URL ||
      config instanceof Blob
        ? { url: config }
        : config;
    const url = resolveUrl(options.url);
    if (options.url instanceof Blob && options.zip === false) {
      throw new Error(
        "zip must not be false for a Blob (only zipped OME-Zarr files can be loaded from a Blob)",
      );
    }
    let c: number[] | undefined;
    if (options.c !== undefined) {
      if (Array.isArray(options.c)) {
        if (options.c.length === 0) {
          throw new Error("c array must be non-empty");
        }
        c = options.c;
      } else {
        c = [options.c];
      }
    }
    const ranges = OMEZarrTileSource._normalize<[number, number]>(
      options,
      "range",
      (range) =>
        Array.isArray(range) &&
        range.length === 2 &&
        range.every((bound) => typeof bound === "number"),
      c,
    );
    const colors = OMEZarrTileSource._normalize<Color>(
      options,
      "color",
      (color) =>
        Array.isArray(color) &&
        color.length === 3 &&
        color.every((component) => typeof component === "number"),
      c,
    );
    const lutsOrColorMaps = OMEZarrTileSource._normalize<LUTOrColorMap>(
      options,
      "lutOrColorMap",
      (lutOrColorMap) =>
        lutOrColorMap instanceof Map ||
        (Array.isArray(lutOrColorMap) &&
          lutOrColorMap.length > 0 &&
          lutOrColorMap.every(
            (colorOrRGBA) =>
              Array.isArray(colorOrRGBA) &&
              (colorOrRGBA.length === 3 || colorOrRGBA.length === 4) &&
              colorOrRGBA.every((component) => typeof component === "number"),
          )),
      c,
    );
    const inverteds = OMEZarrTileSource._normalize<boolean>(
      options,
      "inverted",
      (inverted) => typeof inverted === "boolean",
      c,
    );
    super(url.toString());
    this.url = url.toString();
    this.blob = options.url instanceof Blob ? options.url : undefined;
    this.zip = options.zip ?? (this.blob !== undefined || isOZX(url));
    this._t = options.t;
    this._z = options.z;
    this._c = c;
    this._renderSettings = {
      ranges,
      colors,
      lutsOrColorMaps,
      inverteds,
      autoBoost: options.autoBoost ?? false,
    };
    this._renderSettingsHash = fnv1a(
      JSON.stringify({
        ...this._renderSettings,
        lutsOrColorMaps: lutsOrColorMaps?.map((lutOrColorMap) =>
          lutOrColorMap instanceof Map
            ? [...lutOrColorMap].sort(
                ([value], [otherValue]) => value - otherValue,
              )
            : lutOrColorMap,
        ),
      }),
    );
    this._loaded = loaded;
    this._readyPromise.catch(() => {}); // avoid unhandled rejections
  }

  /**
   * The loaded OME-Zarr image and arrays.
   *
   * @throws If the tile source is not ready yet (or failed to load)
   */
  get loaded(): OMEZarr {
    if (this._loaded === undefined) {
      throw new Error("tile source not ready");
    }
    return this._loaded;
  }

  /**
   * The rendered timepoint index: the configured `t`, otherwise the omero
   * `rdefs.defaultT` once loaded, otherwise `undefined` (middle timepoint).
   */
  get t(): number | undefined {
    if (this._t === undefined) {
      return this._loaded?.image.omero?.rdefs?.defaultT;
    }
    return this._t;
  }

  /**
   * The rendered z-slice index: the configured `z`, otherwise the omero
   * `rdefs.defaultZ` once loaded, otherwise `undefined` (middle z-slice).
   */
  get z(): number | undefined {
    if (this._z === undefined) {
      return this._loaded?.image.omero?.rdefs?.defaultZ;
    }
    return this._z;
  }

  /**
   * The rendered channel indices: the configured `c` option (as an array, even if a
   * single index was configured), otherwise the indices of all channels marked
   * active in the omero metadata once loaded, otherwise `undefined` (all
   * channels).
   */
  get cs(): number[] | undefined {
    if (this._c === undefined) {
      return this._loaded?.image.omero?.channels?.flatMap((channel, c) =>
        channel.active !== false ? [c] : [],
      );
    }
    return this._c;
  }

  /**
   * The omero channels of the rendered channels ({@link cs}): one entry per
   * rendered channel, `undefined` for channels that the omero metadata does
   * not cover.
   *
   * `undefined` instead of the whole array if `c` was not configured and the
   * tile source is not ready or the image has no omero metadata.
   */
  get channels(): (Channel | undefined)[] | undefined {
    if (this._c === undefined) {
      return this._loaded?.image.omero?.channels?.filter(
        (channel) => channel.active !== false,
      );
    }
    return this._c.map((c) => this._loaded?.image.omero?.channels?.[c]);
  }

  /**
   * The contrast limits (`[min, max]`) of the rendered channels ({@link cs}):
   * the configured `ranges` (as an array, even if a single range was
   * configured), otherwise the windows of the corresponding omero
   * {@link channels}, and `undefined` wherever those are.
   *
   * Channels without contrast limits (`undefined` entries, or `undefined`
   * instead of the whole array) are rendered with their data type range.
   */
  get ranges(): ([number, number] | undefined)[] | undefined {
    const channels = this.channels;
    const omeroRange = (
      channel: Channel | undefined,
    ): [number, number] | undefined => {
      if (
        channel?.window?.start !== undefined &&
        channel?.window?.end !== undefined
      ) {
        return [channel.window.start, channel.window.end];
      }
      return undefined;
    };
    const ranges = OMEZarrTileSource._repeat(
      this._renderSettings.ranges,
      channels,
    );
    return ranges?.map((range, i) => range ?? omeroRange(channels?.[i]));
  }

  /**
   * The RGB colors of the rendered channels ({@link cs}): the configured
   * `colors` (as an array, even if a single color was configured), otherwise
   * the colors of the corresponding omero {@link channels} (six-digit hex
   * strings, with or without a leading `#`), and `undefined` wherever those
   * are missing or malformed.
   *
   * Channels without a color (`undefined` entries, or `undefined` instead of
   * the whole array) are rendered in white.
   */
  get colors(): (Color | undefined)[] | undefined {
    const channels = this.channels;
    const omeroColor = (channel: Channel | undefined): Color | undefined => {
      if (channel?.color === undefined) {
        return undefined;
      }
      const hex = /^#?([0-9A-Fa-f]{6})$/.exec(channel.color)?.[1];
      if (hex === undefined) {
        return undefined;
      }
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    };
    const colors = OMEZarrTileSource._repeat(
      this._renderSettings.colors,
      channels,
    );
    return colors?.map((color, i) => color ?? omeroColor(channels?.[i]));
  }

  /**
   * The color LUTs and color maps of the rendered channels ({@link cs}): the
   * configured `lutsOrColorMaps` (as an array, even if a single LUT or color
   * map was configured), otherwise those of the corresponding omero
   * {@link channels}, and `undefined` wherever those are.
   *
   * Channels without a LUT or color map (`undefined` entries, or `undefined`
   * instead of the whole array) are rendered with their {@link colors} entry.
   */
  get lutsOrColorMaps(): (LUTOrColorMap | undefined)[] | undefined {
    const channels = this.channels;
    const omeroLUTOrColorMap = (
      channel: Channel | undefined,
    ): LUTOrColorMap | undefined => channel?.lut ?? channel?.colorMap;
    const lutsOrColorMaps = OMEZarrTileSource._repeat(
      this._renderSettings.lutsOrColorMaps,
      channels,
    );
    return lutsOrColorMaps?.map(
      (lutOrColorMap, i) => lutOrColorMap ?? omeroLUTOrColorMap(channels?.[i]),
    );
  }

  /**
   * Whether the rendered channels ({@link cs}) are inverted: the configured
   * `inverteds` (as an array, even if a single value was configured),
   * otherwise the inversion of the corresponding omero {@link channels}, and
   * `undefined` wherever those are.
   *
   * Channels without an inversion (`undefined` entries, or `undefined` instead
   * of the whole array) are not inverted.
   */
  get inverteds(): (boolean | undefined)[] | undefined {
    const channels = this.channels;
    const inverteds = OMEZarrTileSource._repeat(
      this._renderSettings.inverteds,
      channels,
    );
    return inverteds?.map((inverted, i) => inverted ?? channels?.[i]?.inverted);
  }

  /** Whether the brightness of dark tiles is boosted (the configured `autoBoost`) */
  get autoBoost(): boolean {
    return this._renderSettings.autoBoost;
  }

  /**
   * Waits until the OME-Zarr metadata is loaded and validated.
   *
   * @returns The tile source once `ready` has been raised; rejects with the
   *   `open-failed` message otherwise
   */
  whenReady(): Promise<this> {
    return this._readyPromise;
  }

  /**
   * Width in pixels of a resolution level.
   *
   * @param level - OpenSeadragon level (0 = lowest resolution); defaults to
   *   `maxLevel` (full resolution)
   * @throws If the tile source is not ready or the level is out of bounds
   */
  getWidth(level: number = this.maxLevel): number {
    if (level < 0 || level > this.maxLevel) {
      throw new Error("level out of bounds");
    }
    return OMEZarrTileSource._getAxisSize(
      this.loaded,
      "x",
      this.maxLevel - level,
    );
  }

  /**
   * Height in pixels of a resolution level.
   *
   * @param level - OpenSeadragon level (0 = lowest resolution); defaults to
   *   `maxLevel` (full resolution)
   * @throws If the tile source is not ready or the level is out of bounds
   */
  getHeight(level: number = this.maxLevel): number {
    if (level < 0 || level > this.maxLevel) {
      throw new Error("level out of bounds");
    }
    return OMEZarrTileSource._getAxisSize(
      this.loaded,
      "y",
      this.maxLevel - level,
    );
  }

  /**
   * Loads the (y, x) chunks of the rendered channels ({@link cs}) at the rendered
   * timepoint and z-slice ({@link t}, {@link z}).
   *
   * @param level - OpenSeadragon level (0 = lowest resolution)
   * @param tile - Tile coordinates within the level, or `undefined` to load the
   *   whole level plane
   * @param options - `signal` aborts the chunk requests
   * @returns One chunk per rendered channel, in {@link cs} order
   * @throws If the tile source is not ready or the level or tile is out of
   *   bounds
   */
  loadChunks(
    level: number,
    tile: { x: number; y: number } | undefined,
    options?: { signal?: AbortSignal },
  ): Promise<zarr.Chunk<zarr.NumberDataType | zarr.BigintDataType>[]> {
    const indices: { [k: string]: number | [number, number] | undefined } = {
      t: this.t, // undefined = middle plane
      z: this.z, // undefined = middle plane
    };
    if (tile !== undefined) {
      const { x: nx, y: ny } = this.getNumTiles(level);
      if (tile.x < 0 || tile.x >= nx || tile.y < 0 || tile.y >= ny) {
        throw new Error("tile out of bounds");
      }
      const tileWidth = this.getTileWidth(level);
      const tileHeight = this.getTileHeight(level);
      indices.x = [tile.x * tileWidth, (tile.x + 1) * tileWidth]; // clamped by zarrita
      indices.y = [tile.y * tileHeight, (tile.y + 1) * tileHeight]; // clamped by zarrita
    }
    const sizeC = OMEZarrTileSource._getAxisSize(this.loaded, "c");
    const channelSlices = getSlices(
      this.cs ?? Array.from({ length: sizeC }, (_, i) => i),
      this.loaded.arrays[this.maxLevel - level]!.shape,
      this.loaded.image.getAxesNames(),
      indices,
    ) as (number | zarr.Slice)[][];
    return Promise.all(
      channelSlices.map((channelSlice) =>
        zarr.get(
          this.loaded.arrays[this.maxLevel - level]!,
          channelSlice,
          options,
        ),
      ),
    );
  }

  /**
   * Whether OpenSeadragon should use this tile source for a configuration:
   * URLs whose path ends in `.ozx` and objects with `type: "ome-zarr"`.
   */
  override supports(data: string | object | object[] | Document): boolean {
    if (Array.isArray(data) || data instanceof Document) {
      return false;
    }
    if (typeof data === "string") {
      return isOZX(data);
    }
    return "type" in data && data.type === "ome-zarr";
  }

  /**
   * Normalizes an OpenSeadragon configuration into
   * {@link OMEZarrTileSourceOptions}.
   *
   * @throws For array, XML document and POST data configurations
   */
  override configure(
    data: string | object | object[] | Document,
    _url: string,
    postData: string | null = null,
  ): OMEZarrTileSourceOptions {
    if (Array.isArray(data)) {
      throw new Error("configuration from array is not supported");
    }
    if (data instanceof Document) {
      throw new Error("configuration from XML Document is not supported");
    }
    if (postData) {
      throw new Error("configuration with postData is not supported");
    }
    if (typeof data === "string") {
      return { type: "ome-zarr", url: data };
    }
    return { type: "ome-zarr", ...(data as OMEZarrTileSourceOptions) };
  }

  /**
   * Whether another tile source renders the same data: the URL, `zip`, the
   * resolved {@link t}, {@link z} and {@link cs}, and the hash of the
   * configured rendering settings.
   *
   * These are the components of {@link getTileHashKey}, so tile sources compare
   * equal exactly when they share cached tiles. The resolved indices depend on
   * the loaded metadata, so tile sources that are not ready yet compare by
   * their configured indices.
   */
  override equals(other: OpenSeadragon.TileSource): boolean {
    return (
      other instanceof OMEZarrTileSource &&
      this.url === other.url &&
      this.zip === other.zip &&
      this.t === other.t &&
      this.z === other.z &&
      this.cs?.join(",") === other.cs?.join(",") &&
      this._renderSettingsHash === other._renderSettingsHash
    );
  }

  /**
   * Loads (or reuses) the OME-Zarr metadata, validates it against the
   * configuration and raises `ready`, or raises `open-failed` on error.
   *
   * Called asynchronously by the OpenSeadragon `TileSource` constructor. Loads
   * from {@link blob} if configured, otherwise from the URL.
   */
  override getImageInfo(url: string): void {
    Promise.resolve(
      this._loaded ?? OMEZarrTileSource.loadOMEZarr(this.blob ?? url, this.zip),
    )
      .then((loaded) => {
        const axisNames = loaded.image.getAxesNames();
        for (const axisName of axisNames) {
          if (!["t", "c", "z", "y", "x"].includes(axisName)) {
            throw new Error(`unsupported axis: ${axisName}`);
          }
        }
        if (!axisNames.includes("x") || !axisNames.includes("y")) {
          throw new Error("missing X or Y axis");
        }
        if (axisNames.indexOf("y") > axisNames.indexOf("x")) {
          throw new Error("X axis must come after Y axis");
        }
        const sizeT = OMEZarrTileSource._getAxisSize(loaded, "t");
        if (this._t !== undefined && (this._t < 0 || this._t >= sizeT)) {
          throw new Error(
            `Invalid t index ${this._t} for image with ${sizeT} timepoints`,
          );
        }
        const sizeZ = OMEZarrTileSource._getAxisSize(loaded, "z");
        if (this._z !== undefined && (this._z < 0 || this._z >= sizeZ)) {
          throw new Error(
            `Invalid z index ${this._z} for image with ${sizeZ} z-slices`,
          );
        }
        const sizeC = OMEZarrTileSource._getAxisSize(loaded, "c");
        if (this._c !== undefined && this._c.some((c) => c < 0 || c >= sizeC)) {
          throw new Error(
            `Invalid c indices [${this._c?.join(", ")}] for image with ${sizeC} channels`,
          );
        }
        if (
          loaded.image.omero !== undefined &&
          loaded.image.omero.channels !== undefined &&
          loaded.image.omero.channels.length !== sizeC
        ) {
          throw new Error(
            `OME-Zarr metadata lists ${loaded.image.omero.channels.length} channels, but the image has ${sizeC}`,
          );
        }
        if (
          this._c === undefined &&
          loaded.image.omero !== undefined &&
          loaded.image.omero.channels !== undefined &&
          !loaded.image.omero.channels.some(
            (channel) => channel.active !== false,
          )
        ) {
          throw new Error(
            "No active channels; specify c or activate channels in the OME-Zarr metadata",
          );
        }
        this._loaded = loaded;
        this.width = loaded.arrays[0]!.shape[axisNames.indexOf("x")]!;
        this.height = loaded.arrays[0]!.shape[axisNames.indexOf("y")]!;
        this.maxLevel = loaded.arrays.length - 1;
        this.raiseEvent("ready", { tileSource: this });
      })
      .catch((error) => {
        this._loaded = undefined;
        this.width = 10;
        this.height = 10;
        this.maxLevel = 0;
        this.raiseEvent("open-failed", {
          message: `failed to get image info for ${url}: ${error}`,
          source: url,
        });
      });
  }

  /** Chunk width of a resolution level in pixels. */
  override getTileWidth(level: number): number {
    // destructure loaded early to ensure maxLevel is defined
    const { image, arrays } = this.loaded;
    if (level < 0 || level > this.maxLevel) {
      throw new Error("level out of bounds");
    }
    const array = arrays[this.maxLevel - level]!;
    return array.chunks[image.getAxesNames().indexOf("x")]!;
  }

  /** Chunk height of a resolution level in pixels. */
  override getTileHeight(level: number): number {
    // destructure loaded early to ensure maxLevel is defined
    const { image, arrays } = this.loaded;
    if (level < 0 || level > this.maxLevel) {
      throw new Error("level out of bounds");
    }
    const array = arrays[this.maxLevel - level]!;
    return array.chunks[image.getAxesNames().indexOf("y")]!;
  }

  /** Width of a resolution level relative to the full resolution. */
  override getLevelScale(level: number): number {
    if (level < 0 || level > this.maxLevel) {
      throw new Error("level out of bounds");
    }
    return this.getWidth(level) / this.width;
  }

  /** Number of tiles (chunks) per axis of a resolution level. */
  override getNumTiles(level: number): OpenSeadragon.Point {
    if (level < 0 || level > this.maxLevel) {
      throw new Error("level out of bounds");
    }
    return new OpenSeadragon.Point(
      Math.ceil(this.getWidth(level) / this.getTileWidth(level)),
      Math.ceil(this.getHeight(level) / this.getTileHeight(level)),
    );
  }

  /**
   * Encodes the tile coordinates as `level=…&x=…&y=…` for
   * {@link downloadTileStart}; no network URL is involved.
   */
  override getTileUrl(level: number, x: number, y: number): string {
    const urlSearchParams = new URLSearchParams();
    urlSearchParams.append("level", level.toString());
    urlSearchParams.append("x", x.toString());
    urlSearchParams.append("y", y.toString());
    return urlSearchParams.toString();
  }

  /**
   * Cache key of a tile: the image URL (the object URL of a configured
   * {@link blob}) plus the resolved data parameters
   * (`zip`, {@link t}, {@link z}, {@link cs}) and tile coordinates, and an
   * FNV-1a hash of the rendering settings (the configured `ranges`, `colors`,
   * `lutsOrColorMaps` and `inverteds`, and `autoBoost`), so that tile sources
   * rendering the same data share cached tiles.
   *
   * Rendering settings that are not configured are omitted from the hash, as
   * they resolve to the same omero values for the same image.
   */
  override getTileHashKey(level: number, x: number, y: number): string {
    const url = new URL(this.url);
    url.searchParams.append("zip", this.zip.toString());
    if (this.t !== undefined) {
      url.searchParams.append("t", this.t.toString());
    }
    if (this.z !== undefined) {
      url.searchParams.append("z", this.z.toString());
    }
    if (this.cs !== undefined) {
      url.searchParams.append("c", this.cs.join(","));
    }
    url.searchParams.append("y", y.toString());
    url.searchParams.append("x", x.toString());
    url.searchParams.append("level", level.toString());
    url.searchParams.append("render", this._renderSettingsHash.toString(16));
    return url.toString();
  }

  /**
   * Loads the chunks of a tile and finishes the job with `ome-zarr` data
   * ({@link OMEZarrTileData}); fails the job if loading fails.
   */
  override downloadTileStart(context: OpenSeadragon.ImageJob): void {
    const userData = context.userData as { abortController?: AbortController };
    const abortController = new AbortController();
    userData.abortController = abortController;
    const urlSearchParams = new URLSearchParams(context.src);
    const level = +urlSearchParams.get("level")!;
    const x = +urlSearchParams.get("x")!;
    const y = +urlSearchParams.get("y")!;
    try {
      this.loadChunks(level, { x, y }, { signal: abortController.signal }).then(
        (chunks) => {
          const ranges = this.ranges;
          const colors = this.colors;
          const inverteds = this.inverteds;
          const lutsOrColorMaps = this.lutsOrColorMaps;
          const autoBoost = this.autoBoost;
          const data: OMEZarrTileData = {
            chunks: chunks,
            ranges: chunks.map((chunk, i) => {
              const [vmin, vmax] = ranges?.[i] ?? getDataTypeRange(chunk);
              return vmin < vmax ? [vmin, vmax] : [vmin, vmin + 1];
            }),
            colors: chunks.map((_, i) => colors?.[i] ?? [255, 255, 255]),
            lutsOrColorMaps: chunks.map((_, i) => lutsOrColorMaps?.[i]),
            inverteds: chunks.map((_, i) => inverteds?.[i] ?? false),
            autoBoost,
          };
          userData.abortController = undefined;
          context.finish(data, null, "ome-zarr");
        },
        (error) => {
          const aborted = abortController.signal.aborted;
          abortController.abort(); // cancel the remaining channel requests
          if (!aborted) {
            context.fail(
              `failed to load chunks for level=${level}, x=${x}, y=${y}: ${String(error)}`,
              null,
            );
          }
        },
      );
    } catch (error) {
      context.fail(
        `failed to download tile for level=${level}, x=${x}, y=${y}: ${String(error)}`,
        null,
      );
    }
  }

  /** Aborts the chunk requests of a pending tile download. */
  override downloadTileAbort(context: OpenSeadragon.ImageJob): void {
    const userData = context.userData as { abortController?: AbortController };
    if (userData.abortController !== undefined) {
      userData.abortController.abort();
      userData.abortController = undefined;
    }
  }

  /**
   * Normalizes a configured rendering setting into one entry per rendered
   * channel.
   *
   * @param options - The tile source configuration
   * @param name - Name of the rendering setting to normalize
   * @param isValue - Whether a value is a single value rather than an array of
   *   values
   * @param c - The normalized `c` option, to validate the length against and to
   *   repeat a single value for
   * @returns One entry per rendered channel (`undefined` entries fall back to
   *   the omero metadata), or `undefined` if the setting is not configured; a
   *   single value is repeated for every channel in `c`, or kept as the only
   *   entry if `c` is not configured, in which case the getters repeat it
   * @throws If the setting is neither a value nor a non-empty array of values,
   *   or if its length does not match `c`
   */
  private static _normalize<T>(
    options: OMEZarrTileSourceOptions,
    name: "range" | "color" | "lutOrColorMap" | "inverted",
    isValue: (value: unknown) => boolean,
    c: number[] | undefined,
  ): (T | undefined)[] | undefined {
    const valueOrValues = options[name];
    if (valueOrValues === undefined) {
      return undefined;
    }
    if (isValue(valueOrValues)) {
      const value = valueOrValues as T;
      return c === undefined ? [value] : c.map(() => value);
    }
    if (
      !Array.isArray(valueOrValues) ||
      !valueOrValues.every((entry) => entry === undefined || isValue(entry))
    ) {
      throw new Error(`${name} must be a value or an array of values`);
    }
    if (valueOrValues.length === 0) {
      throw new Error(`${name} array must be non-empty`);
    }
    if (c !== undefined && valueOrValues.length !== c.length) {
      throw new Error(
        `${name} array length ${valueOrValues.length} does not match number of channels ${c.length} in c`,
      );
    }
    return valueOrValues as (T | undefined)[];
  }

  /**
   * Spreads a normalized rendering setting over the rendered channels.
   *
   * @param values - The normalized rendering setting, if configured
   * @param channels - The omero channels of the rendered channels, if known
   * @returns One entry per rendered channel: the configured entries, a single
   *   configured entry repeated for every rendered channel, or one `undefined`
   *   entry per rendered channel if the setting is not configured
   */
  private static _repeat<T>(
    values: (T | undefined)[] | undefined,
    channels: (Channel | undefined)[] | undefined,
  ): (T | undefined)[] | undefined {
    if (values === undefined) {
      return channels?.map(() => undefined);
    }
    if (values.length === 1 && channels !== undefined) {
      return channels.map(() => values[0]);
    }
    return values;
  }

  /** Registers the `ome-zarr` → `context2d` and copy converters (once). */
  private static _learnConverters(os: typeof OpenSeadragon): void {
    if (os.converter.existsType("ome-zarr")) {
      return;
    }
    os.converter.learn(
      "ome-zarr",
      "context2d",
      (_tile, data: OMEZarrTileData) => OMEZarrTileSource.render(data),
      1,
      1,
    );
    os.converter.learn(
      "ome-zarr",
      "ome-zarr",
      (_tile, data: OMEZarrTileData) => ({
        ...data,
        chunks: data.chunks.map((chunk) => ({
          ...chunk,
          data: chunk.data.slice(),
        })),
      }),
    );
  }

  /** Size of a named axis at a resolution level (`1` if the axis is absent). */
  private static _getAxisSize(
    loaded: OMEZarr,
    axisName: string,
    resolution: number = 0,
  ): number {
    const axis = loaded.image.getAxesNames().indexOf(axisName);
    return axis >= 0 ? loaded.arrays[resolution]!.shape[axis]! : 1;
  }
}
