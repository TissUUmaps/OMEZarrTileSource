import { NgffImage, getMinMaxValues } from "ome-zarr.js";
import OpenSeadragon from "openseadragon";
import * as zarr from "zarrita";

import { toContext2D } from "./utils/canvas";
import {
  type Axis,
  getActiveChannels,
  isAxis,
  renderPlanes,
} from "./utils/ngff";
import {
  type ZarrArray,
  type ZarrChunk,
  copyChunk,
  getPlane,
  openStore,
} from "./utils/zarr";

/** Constructor type of {@link OMEZarrTileSource}. */
export type OMEZarrTileSourceClass = typeof OMEZarrTileSource;
declare module "openseadragon" {
  /** Set by {@link OMEZarrTileSource.enable}. */
  let OMEZarrTileSource: OMEZarrTileSourceClass;
}

/** Options for {@link OMEZarrTileSource}. */
export interface OMEZarrTileSourceOptions {
  /** Tile source type, required for inline configuration in OpenSeadragon. */
  type?: "ome-zarr";
  /** URL of the OME-Zarr image, i.e. the group holding the `multiscales` metadata. */
  url: string;
  /**
   * Whether the image is a zipped OME-Zarr (`.ozx`) to be read via HTTP range
   * requests. Detected from the `.ozx` suffix if omitted.
   */
  zip?: boolean;
  /** Time point to show; the omero default or the middle plane if omitted. */
  t?: number;
  /** Channel to render; all channels marked active in the omero metadata if omitted. */
  c?: number;
  /** Z-slice to show; the omero default or the middle plane if omitted. */
  z?: number;
  /**
   * Data type produced per tile:
   * - `"context2d"` (default): tiles rendered by ome-zarr.js according to the
   *   omero metadata, as `CanvasRenderingContext2D`.
   * - `"zarrChunk"`: raw zarrita chunks of the tile region, with the same rank
   *   as the image arrays (fixed t/z/c axes have length 1). OpenSeadragon
   *   renders them via the converter learned by
   *   {@link OMEZarrTileSource.learnDataTypes}.
   */
  dataType?: "context2d" | "zarrChunk";
}

/** Per-tile state stored on OpenSeadragon's ImageJob. */
type UserData = {
  abortController?: AbortController;
};

/** OpenSeadragon instances whose converter already knows the data types. */
const learnedOpenSeadragons = new WeakSet<typeof OpenSeadragon>();

/**
 * OpenSeadragon tile source for OME-Zarr images (v0.4 and v0.5).
 *
 * Each resolution level of the image is one OpenSeadragon level (level 0 being
 * the smallest), tiled by the zarr chunk size. Tiles are either rendered with
 * ome-zarr.js or delivered as raw zarrita chunks, see
 * {@link OMEZarrTileSourceOptions.dataType}.
 */
export class OMEZarrTileSource extends OpenSeadragon.TileSource {
  // properties inherited from/required by OpenSeadragon.TileSource
  readonly url: string;
  width: number = 10; // required starting from OpenSeadragon 6 (previously optional)
  height: number = 10; // required starting from OpenSeadragon 6 (previously optional)
  aspectRatio: number = 1;
  dimensions: OpenSeadragon.Point = new OpenSeadragon.Point(10, 10);
  maxLevel: number = 0;
  ready: boolean = false;

  /** See {@link OMEZarrTileSourceOptions.zip}. */
  readonly zip?: boolean;
  /** See {@link OMEZarrTileSourceOptions.t}. */
  readonly t?: number;
  /** See {@link OMEZarrTileSourceOptions.c}. */
  readonly c?: number;
  /** See {@link OMEZarrTileSourceOptions.z}. */
  readonly z?: number;
  /** See {@link OMEZarrTileSourceOptions.dataType}. */
  readonly dataType: "context2d" | "zarrChunk";
  /** Loaded image, its axes and arrays by level (smallest first); set once ready. */
  private _image?: {
    img: NgffImage;
    axes: Axis[];
    arrays: ZarrArray[];
  };

  /**
   * Creates a tile source and starts loading the image, see
   * {@link getImageInfo}.
   */
  constructor(url: string);
  constructor(options: OMEZarrTileSourceOptions);
  constructor(config: string | OMEZarrTileSourceOptions) {
    const options = typeof config === "string" ? { url: config } : config;
    super(options.url); // invokes getImageInfo
    this.url = options.url;
    this.zip = options.zip;
    this.t = options.t;
    this.c = options.c;
    this.z = options.z;
    this.dataType = options.dataType ?? "context2d";
    OMEZarrTileSource.learnDataTypes();
  }

  /** Whether `data` is a `.ozx` URL or an inline `{ type: "ome-zarr" }` configuration. */
  supports(data: string | object | object[] | Document): boolean {
    if (Array.isArray(data) || data instanceof Document) {
      return false;
    }
    if (typeof data === "string") {
      return data.endsWith(".ozx");
    }
    return "type" in data && data.type === "ome-zarr";
  }

  /** Normalizes a supported inline configuration to {@link OMEZarrTileSourceOptions}. */
  configure(
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

  /** Whether `other` is an OME-Zarr tile source with the same options. */
  equals(other: OpenSeadragon.TileSource): boolean {
    return (
      other instanceof OMEZarrTileSource &&
      this.url === other.url &&
      this.zip === other.zip &&
      this.t === other.t &&
      this.c === other.c &&
      this.z === other.z &&
      this.dataType === other.dataType
    );
  }

  /**
   * Loads the image metadata and arrays, then raises `ready`, or `open-failed`
   * on error. Called by OpenSeadragon upon construction.
   */
  getImageInfo(url: string): void {
    console.debug(`getting image info for ${url}`);
    this._open(url)
      .then(() => {
        console.debug(`ready for ${url}`);
        this.raiseEvent("ready", { tileSource: this });
      })
      .catch((reason) => {
        this._image = undefined;
        this.ready = false;
        const message = `failed to get image info for ${url}: ${reason}`;
        console.error(message);
        this.raiseEvent("open-failed", { message, source: url });
      });
  }

  /** Tile width at `level`, i.e. the chunk size of its array along x. */
  getTileWidth(level: number): number {
    return this._getArray(level).chunks[this._axis("x")]!;
  }

  /** Tile height at `level`, i.e. the chunk size of its array along y. */
  getTileHeight(level: number): number {
    return this._getArray(level).chunks[this._axis("y")]!;
  }

  /** Width of `level` relative to the full resolution. */
  getLevelScale(level: number): number {
    return this._getSize(level, "x") / this._getSize(this.maxLevel, "x");
  }

  /** Tile identifier (`level=…&x=…&y=…`), parsed again by {@link downloadTileStart}. */
  getTileUrl(level: number, x: number, y: number): string {
    return new URLSearchParams({
      level: `${level}`,
      x: `${x}`,
      y: `${y}`,
    }).toString();
  }

  /** Cache key: the image URL plus tile coordinates, plane and data type. */
  getTileHashKey(level: number, x: number, y: number): string {
    const url = new URL(this.url);
    const params = { level, x, y, z: this.z, c: this.c, t: this.t };
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.append(name, `${value}`);
      }
    }
    url.searchParams.append("dataType", this.dataType);
    return url.toString();
  }

  /**
   * Loads the tile identified by `context.src` and finishes the job with data
   * of type {@link dataType}. Abortable via {@link downloadTileAbort}.
   */
  downloadTileStart(context: OpenSeadragon.ImageJob): void {
    const abortController = new AbortController();
    (context.userData as UserData).abortController = abortController;
    const params = new URLSearchParams(context.src);
    const level = Number(params.get("level"));
    const x = Number(params.get("x"));
    const y = Number(params.get("y"));
    const tile = `level=${level}, x=${x}, y=${y}`;
    console.debug(`downloading tile for ${tile}`);
    this._downloadTile(level, x, y, abortController.signal)
      .then((data) => {
        abortController.signal.throwIfAborted();
        context.finish(data, null, this.dataType);
      })
      .catch((reason) => {
        if (abortController.signal.aborted) {
          console.debug(`aborted tile for ${tile}`);
          return;
        }
        const message = `failed to download tile for ${tile}: ${reason}`;
        console.error(message);
        context.fail(message, null);
      });
  }

  /** Aborts a tile download started by {@link downloadTileStart}. */
  downloadTileAbort(context: OpenSeadragon.ImageJob): void {
    (context.userData as UserData).abortController?.abort();
  }

  /**
   * Registers the class as `OpenSeadragon.OMEZarrTileSource`, enabling inline
   * `{ type: "ome-zarr" }` configuration, and learns the data types.
   */
  static enable(os: typeof OpenSeadragon = OpenSeadragon): void {
    os.OMEZarrTileSource = OMEZarrTileSource;
    OMEZarrTileSource.learnDataTypes(os);
  }

  /**
   * Teaches OpenSeadragon's data type converter the `"zarrChunk"` data type
   * (see {@link OMEZarrTileSourceOptions.dataType}): how to copy it and how to
   * render it to a `"context2d"` using the omero metadata of the tile's
   * source. Called by the constructor and by {@link enable}; idempotent.
   */
  static learnDataTypes(os: typeof OpenSeadragon = OpenSeadragon): void {
    if (learnedOpenSeadragons.has(os)) {
      return;
    }
    learnedOpenSeadragons.add(os);
    os.converter.learn(
      "zarrChunk",
      "context2d",
      (tile: OpenSeadragon.Tile, chunk: ZarrChunk) => {
        const source = tile.tiledImage?.source;
        if (!(source instanceof OMEZarrTileSource)) {
          throw new Error("zarrChunk does not belong to an OME-Zarr tile");
        }
        return source._renderChunk(chunk);
      },
      1,
      2,
    );
    os.converter.learn(
      "zarrChunk",
      "zarrChunk",
      (_tile: OpenSeadragon.Tile, chunk: ZarrChunk) => copyChunk(chunk),
      1,
      1,
    );
  }

  /** Opens the image and its arrays and initializes the tile source from them. */
  private async _open(url: string): Promise<void> {
    const img = await NgffImage.load(openStore(url, this.zip));
    const axes = img.getAxesNames();
    if (!axes.every(isAxis) || !axes.includes("x") || !axes.includes("y")) {
      throw new Error(`unsupported axes: ${axes.join(", ")}`);
    }
    const arrays = await Promise.all(
      img.paths.map((_, i) => img.openArray(i) as Promise<ZarrArray>),
    );
    console.debug(`opened ${arrays.length} arrays for ${url}`);
    this._image = { img, axes, arrays: arrays.reverse() };
    this.maxLevel = arrays.length - 1;
    await this._completeChannelWindows();
    this.width = this._getSize(this.maxLevel, "x");
    this.height = this._getSize(this.maxLevel, "y");
    this.aspectRatio = this.width / this.height;
    this.dimensions = new OpenSeadragon.Point(this.width, this.height);
    this.ready = true;
  }

  /**
   * Fills in missing channel window start/end values once from the smallest
   * resolution level, so that all tiles are rendered with the same range.
   */
  private async _completeChannelWindows(): Promise<void> {
    const channels = this._loaded.img.omero?.channels ?? [];
    await Promise.all(
      channels.map(async ({ window }, c) => {
        if (window.start === undefined || window.end === undefined) {
          const selection = this._getSelection(0, { c });
          const plane = await zarr.get(this._getArray(0), selection);
          const [min, max] = getMinMaxValues(plane);
          window.start ??= min;
          window.end ??= Math.max(max, window.start + 1);
        }
      }),
    );
  }

  /** Loads the data of a tile as {@link dataType}. */
  private async _downloadTile(
    level: number,
    x: number,
    y: number,
    signal: AbortSignal,
  ) {
    const array = this._getArray(level);
    if (this.dataType === "zarrChunk") {
      return zarr.get(array, this._getSelection(level, { x, y }), { signal });
    }
    const { data, width, height } = await this._loaded.img.renderArray({
      arr: array,
      slices: {
        x: this._getTileRange(level, "x", x),
        y: this._getTileRange(level, "y", y),
        z: this.z,
        t: this.t,
      },
      channels: this._getChannels(),
      signal,
    });
    return toContext2D(data, width, height);
  }

  /** Renders a `"zarrChunk"` tile of this tile source to a 2D context. */
  private _renderChunk(chunk: ZarrChunk): CanvasRenderingContext2D {
    const height = chunk.shape[this._axis("y")]!;
    const width = chunk.shape[this._axis("x")]!;
    const channels = getActiveChannels(this._getChannels());
    // the chunk's c axis holds either all channels or only channel `c`
    const stride =
      this.c === undefined ? (chunk.stride[this._axis("c")] ?? 0) : 0;
    const planes = channels.map(({ index }) =>
      getPlane(chunk, index * stride, height, width),
    );
    return toContext2D(renderPlanes(planes, channels), width, height);
  }

  /** Omero channels of the image; only channel {@link c} is active if set. */
  private _getChannels() {
    const channels = this._loaded.img.omero?.channels ?? [];
    return this.c === undefined
      ? channels
      : channels.map((channel, i) => ({ ...channel, active: i === this.c }));
  }

  /**
   * Full-rank zarrita selection of a tile at `level`, or of the whole plane if
   * the tile coordinates are omitted. Fixed t/z/c axes are sliced to length 1,
   * other axes are selected entirely.
   */
  private _getSelection(
    level: number,
    { x, y, c = this.c }: { x?: number; y?: number; c?: number } = {},
  ): (zarr.Slice | null)[] {
    const range = (start: number, stop = start + 1) => zarr.slice(start, stop);
    return this._loaded.axes.map((axis) => {
      switch (axis) {
        case "x":
          return x === undefined
            ? null
            : range(...this._getTileRange(level, "x", x));
        case "y":
          return y === undefined
            ? null
            : range(...this._getTileRange(level, "y", y));
        case "c":
          return c === undefined ? null : range(c);
        default:
          return range(this._getPlaneIndex(level, axis));
      }
    });
  }

  /**
   * Index of the t/z plane to show at `level`: the configured or omero default
   * index, rescaled like ome-zarr.js does if the level has a different size
   * along that axis, or the middle plane if unspecified.
   */
  private _getPlaneIndex(level: number, axis: "t" | "z"): number {
    const rdefs = this._loaded.img.omero?.rdefs;
    const index =
      axis === "z" ? (this.z ?? rdefs?.defaultZ) : (this.t ?? rdefs?.defaultT);
    const size = this._getSize(level, axis);
    if (index === undefined) {
      return Math.floor(size / 2);
    }
    return Math.floor((index * size) / this._getSize(this.maxLevel, axis));
  }

  /** Pixel range `[start, stop)` covered by tile `index` along `axis` at `level`. */
  private _getTileRange(
    level: number,
    axis: "x" | "y",
    index: number,
  ): [number, number] {
    const tileSize =
      axis === "x" ? this.getTileWidth(level) : this.getTileHeight(level);
    const size = this._getSize(level, axis);
    return [index * tileSize, Math.min((index + 1) * tileSize, size)];
  }

  /** Size of the array at `level` along `axis`. */
  private _getSize(level: number, axis: Axis): number {
    return this._getArray(level).shape[this._axis(axis)]!;
  }

  /** Array of the given level. */
  private _getArray(level: number): ZarrArray {
    const array = this._loaded.arrays[level];
    if (array === undefined) {
      throw new Error("level out of bounds");
    }
    return array;
  }

  /** Index of the named axis, or -1 if the image has no such axis. */
  private _axis(name: Axis): number {
    return this._loaded.axes.indexOf(name);
  }

  /** The loaded image state; throws if the tile source is not ready. */
  private get _loaded() {
    if (this._image === undefined) {
      throw new Error("tile source not ready");
    }
    return this._image;
  }
}
