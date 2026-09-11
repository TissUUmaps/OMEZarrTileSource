import { ZipFileStore } from "@zarrita/storage";
import {
  type Channel,
  NgffImage,
  type Omero,
  getSlices,
  renderChunks,
} from "ome-zarr.js";
import OpenSeadragon from "openseadragon";
import * as zarr from "zarrita";

export interface OMEZarrTileSourceOptions {
  type?: "ome-zarr";
  url: string; // TileSource.url
  zip?: boolean;
  c?: number;
  z?: number;
  t?: number;
  dataType?: "ome-zarr" | "context2d"; // default: "context2d"
  autoBoost?: boolean; // boost brightness of dark tiles (see renderChunks)
}

export interface OMEZarrTileData {
  chunk: zarr.Chunk<zarr.NumberDataType | zarr.BigintDataType>; // (y, x) chunk
  channel: Channel; // omero channel (required for rendering at conversion time)
  autoBoost?: boolean; // boost brightness of dark tiles (see renderChunks)
}

export class OMEZarrTileSource extends OpenSeadragon.TileSource {
  declare readonly url: string;
  readonly zip?: boolean;
  readonly c?: number;
  readonly z?: number;
  readonly t?: number;
  readonly dataType: "ome-zarr" | "context2d";
  readonly autoBoost?: boolean;

  width: number = 10;
  height: number = 10;
  private _image?: NgffImage;
  private _arrays?: zarr.Array<zarr.NumberDataType | zarr.BigintDataType>[];
  private readonly _readyPromise = new Promise<this>((resolve, reject) => {
    this.addOnceHandler("ready", () => resolve(this));
    this.addOnceHandler("open-failed", (e) => reject(new Error(e.message)));
  });

  static {
    OMEZarrTileSource._learnConverters(OpenSeadragon);
  }

  static open(
    config: string | OMEZarrTileSourceOptions,
  ): Promise<OMEZarrTileSource> {
    return new OMEZarrTileSource(
      config as OMEZarrTileSourceOptions,
    ).whenReady();
  }

  constructor(url: string);
  constructor(options: OMEZarrTileSourceOptions);
  constructor(config: string | OMEZarrTileSourceOptions) {
    if (typeof config === "string") {
      super(config); // invokes getImageInfo
      this.url = config;
      this.dataType = "context2d";
    } else {
      super(config.url); // invokes getImageInfo
      this.url = config.url;
      this.zip = config.zip;
      this.c = config.c;
      this.z = config.z;
      this.t = config.t;
      this.dataType = config.dataType ?? "context2d";
      this.autoBoost = config.autoBoost;
    }
    this._readyPromise.catch(() => {}); // avoid unhandled rejections
  }

  get image(): NgffImage {
    if (this._image === undefined) {
      throw new Error("tile source not ready");
    }
    return this._image;
  }

  get arrays(): zarr.Array<zarr.NumberDataType | zarr.BigintDataType>[] {
    if (this._arrays === undefined) {
      throw new Error("tile source not ready");
    }
    return this._arrays;
  }

  whenReady(): Promise<this> {
    return this._readyPromise;
  }

  supports(data: string | object | object[] | Document): boolean {
    if (Array.isArray(data) || data instanceof Document) {
      return false;
    }
    if (typeof data === "string") {
      return data.endsWith(".ozx");
    }
    return "type" in data && data.type === "ome-zarr";
  }

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

  equals(other: OpenSeadragon.TileSource): boolean {
    return (
      other instanceof OMEZarrTileSource &&
      this.url === other.url &&
      this.zip === other.zip &&
      this.c === other.c &&
      this.z === other.z &&
      this.t === other.t &&
      this.dataType === other.dataType &&
      this.autoBoost === other.autoBoost
    );
  }

  getImageInfo(url: string): void {
    NgffImage.load(
      this.zip || (this.zip === undefined && url.endsWith(".ozx"))
        ? ZipFileStore.fromUrl(url)
        : url,
    )
      .then(async (image) => {
        const axisNames = image.getAxesNames();
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
        const arrays = await Promise.all(
          image.paths.map(
            (path) =>
              image.openArray(path) as Promise<
                zarr.Array<zarr.NumberDataType | zarr.BigintDataType>
              >,
          ),
        );
        const tAxis = axisNames.indexOf("t");
        const sizeT = tAxis >= 0 ? arrays[0]!.shape[tAxis]! : 1;
        if (this.t !== undefined && (this.t < 0 || this.t >= sizeT)) {
          throw new Error(
            `Invalid t index ${this.t} for image with ${sizeT} timepoints`,
          );
        }
        const zAxis = axisNames.indexOf("z");
        const sizeZ = zAxis >= 0 ? arrays[0]!.shape[zAxis]! : 1;
        if (this.z !== undefined && (this.z < 0 || this.z >= sizeZ)) {
          throw new Error(
            `Invalid z index ${this.z} for image with ${sizeZ} z-slices`,
          );
        }
        const cAxis = axisNames.indexOf("c");
        const sizeC = cAxis >= 0 ? arrays[0]!.shape[cAxis]! : 1;
        if (this.c !== undefined && (this.c < 0 || this.c >= sizeC)) {
          throw new Error(
            `Invalid c index ${this.c} for image with ${sizeC} channels`,
          );
        }
        if (
          this.dataType !== "context2d" &&
          this.c === undefined &&
          sizeC > 1
        ) {
          throw new Error(
            `Multi-channel image with ${sizeC} channels; specify c or render as "context2d"`,
          );
        }
        const omero = image.checkChannelIndex(this.c ?? 0);
        if (omero.channels.length !== sizeC) {
          throw new Error(
            `OME-Zarr metadata lists ${omero.channels.length} channels, but the image has ${sizeC}`,
          );
        }
        if (this._getActiveChannelIndices(omero).length === 0) {
          throw new Error(
            "No active channels; specify c or activate channels in the OME-Zarr metadata",
          );
        }
        this._image = image;
        this._arrays = arrays;
        this.width = arrays[0]!.shape[axisNames.indexOf("x")]!;
        this.height = arrays[0]!.shape[axisNames.indexOf("y")]!;
        this.maxLevel = arrays.length - 1;
        this.raiseEvent("ready", { tileSource: this });
      })
      .catch((error) => {
        this._image = undefined;
        this._arrays = undefined;
        this.width = 10;
        this.height = 10;
        this.maxLevel = 0;
        this.raiseEvent("open-failed", {
          message: `failed to get image info for ${url}: ${error}`,
          source: url,
        });
      });
  }

  getTileWidth(level: number): number {
    if (this._image === undefined || this._arrays === undefined) {
      throw new Error("tile source not ready");
    }
    if (level < 0 || level > this.maxLevel) {
      throw new Error("level out of bounds");
    }
    const array = this._arrays[this.maxLevel - level]!;
    return array.chunks[this._image.getAxesNames().indexOf("x")]!;
  }

  getTileHeight(level: number): number {
    if (this._image === undefined || this._arrays === undefined) {
      throw new Error("tile source not ready");
    }
    if (level < 0 || level > this.maxLevel) {
      throw new Error("level out of bounds");
    }
    const array = this._arrays[this.maxLevel - level]!;
    return array.chunks[this._image.getAxesNames().indexOf("y")]!;
  }

  getLevelScale(level: number): number {
    if (this._image === undefined || this._arrays === undefined) {
      throw new Error("tile source not ready");
    }
    if (level < 0 || level > this.maxLevel) {
      throw new Error("level out of bounds");
    }
    const array = this._arrays[this.maxLevel - level]!;
    const width = array.shape[this._image.getAxesNames().indexOf("x")]!;
    return width / this.width;
  }

  getTileUrl(level: number, x: number, y: number): string {
    const urlSearchParams = new URLSearchParams();
    urlSearchParams.append("level", level.toString());
    urlSearchParams.append("x", x.toString());
    urlSearchParams.append("y", y.toString());
    return urlSearchParams.toString();
  }

  getTileHashKey(level: number, x: number, y: number): string {
    const url = new URL(this.url);
    url.searchParams.append("level", level.toString());
    url.searchParams.append("x", x.toString());
    url.searchParams.append("y", y.toString());
    if (this.zip !== undefined) {
      url.searchParams.append("zip", this.zip.toString());
    }
    if (this.c !== undefined) {
      url.searchParams.append("c", this.c.toString());
    }
    if (this.z !== undefined) {
      url.searchParams.append("z", this.z.toString());
    }
    if (this.t !== undefined) {
      url.searchParams.append("t", this.t.toString());
    }
    url.searchParams.append("dataType", this.dataType);
    if (this.autoBoost !== undefined) {
      url.searchParams.append("autoBoost", this.autoBoost.toString());
    }
    return url.toString();
  }

  downloadTileStart(context: OpenSeadragon.ImageJob): void {
    const userData = context.userData as { abortController?: AbortController };
    const abortController = new AbortController();
    userData.abortController = abortController;
    const urlSearchParams = new URLSearchParams(context.src);
    const level = +urlSearchParams.get("level")!;
    const x = +urlSearchParams.get("x")!;
    const y = +urlSearchParams.get("y")!;
    try {
      if (this._image === undefined || this._arrays === undefined) {
        throw new Error("tile source not ready");
      }
      const array = this._arrays[this.maxLevel - level]!;
      const omero = this._image.checkChannelIndex(this.c ?? 0);
      const activeChannelIndices = this._getActiveChannelIndices(omero);
      const channels = activeChannelIndices.map((i) => omero.channels[i]!);
      const tileWidth = this.getTileWidth(level);
      const tileHeight = this.getTileHeight(level);
      const selections = getSlices(
        activeChannelIndices,
        array.shape,
        this._image.getAxesNames(),
        {
          x: [x * tileWidth, (x + 1) * tileWidth], // clamped by zarrita
          y: [y * tileHeight, (y + 1) * tileHeight], // clamped by zarrita
          z: this.z ?? omero.rdefs?.defaultZ, // undefined = middle plane
          t: this.t ?? omero.rdefs?.defaultT, // undefined = middle plane
        },
      ) as (number | zarr.Slice | null)[][];
      Promise.all(
        selections.map((selection) =>
          zarr.get(array, selection, { signal: abortController.signal }),
        ),
      )
        .then((chunks) => {
          // no abort check needed: finish() is a no-op after abort()
          if (this.dataType === "context2d") {
            const ctx = OMEZarrTileSource._render(
              chunks,
              channels,
              this.autoBoost,
            );
            context.finish(ctx, null, "context2d");
          } else {
            const data: OMEZarrTileData = {
              chunk: chunks[0]!,
              channel: channels[0]!,
              autoBoost: this.autoBoost,
            };
            context.finish(data, null, "ome-zarr");
          }
        })
        .catch((error) => {
          const aborted = abortController.signal.aborted;
          abortController.abort(); // cancel the remaining channel requests
          if (!aborted) {
            context.fail(
              `failed to render tile for level=${level}, x=${x}, y=${y}: ${String(error)}`,
              null,
            );
          }
        });
    } catch (error) {
      context.fail(
        `failed to download tile for level=${level}, x=${x}, y=${y}: ${String(error)}`,
        null,
      );
    }
  }

  downloadTileAbort(context: OpenSeadragon.ImageJob): void {
    const userData = context.userData as { abortController?: AbortController };
    if (userData.abortController !== undefined) {
      userData.abortController.abort();
      userData.abortController = undefined;
    }
  }

  static enable(os: typeof OpenSeadragon = OpenSeadragon): void {
    Object.assign(os, { OMEZarrTileSource });
    OMEZarrTileSource._learnConverters(os);
  }

  private static _learnConverters(os: typeof OpenSeadragon): void {
    if (os.converter.existsType("ome-zarr")) {
      return;
    }
    os.converter.learn(
      "ome-zarr",
      "context2d",
      (_tile, { chunk, channel, autoBoost }: OMEZarrTileData) =>
        OMEZarrTileSource._render([chunk], [channel], autoBoost),
      1,
      1,
    );
    os.converter.learn(
      "ome-zarr",
      "ome-zarr",
      (_tile, data: OMEZarrTileData) => ({
        ...data,
        chunk: { ...data.chunk, data: data.chunk.data.slice() },
      }),
    );
  }

  private _getActiveChannelIndices(omero: Omero): number[] {
    if (this.c !== undefined || this.dataType !== "context2d") {
      return [this.c ?? 0];
    }
    return omero.channels.flatMap((channel, i) =>
      channel.active !== false ? [i] : [],
    );
  }

  private static _render(
    chunks: zarr.Chunk<zarr.NumberDataType | zarr.BigintDataType>[],
    channels: Channel[],
    autoBoost?: boolean,
  ): CanvasRenderingContext2D {
    const channelColors = channels.map((channel): [number, number, number] => {
      const hex = channel.color.replace(/^#/, "");
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    });
    const channelContrastLimits = channels.map(
      (channel, i): [number, number] => {
        const [vmin, vmax] =
          channel.window.start !== undefined && channel.window.end !== undefined
            ? [channel.window.start, channel.window.end]
            : OMEZarrTileSource._getDataTypeRange(chunks[i]!);
        return vmin < vmax ? [vmin, vmax] : [vmin, vmin + 1];
      },
    );
    const rgba = renderChunks(
      chunks,
      channelContrastLimits,
      channelColors,
      channels.map((channel) => channel.lut ?? channel.colorMap),
      channels.map((channel) => channel.inverted === true),
      autoBoost,
    ) as Uint8ClampedArray<ArrayBuffer>;
    const width = chunks[0]!.shape[1]!;
    const height = chunks[0]!.shape[0]!;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("failed to get 2D canvas context");
    }
    const data = new ImageData(rgba, width, height);
    ctx.putImageData(data, 0, 0);
    return ctx;
  }

  private static _getDataTypeRange(
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
}
