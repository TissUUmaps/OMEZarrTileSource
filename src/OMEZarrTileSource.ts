import { ZipFileStore } from "@zarrita/storage";
import {
  type Channel,
  NgffImage,
  getMinMaxValues,
  getSlices,
  renderChunks,
} from "ome-zarr.js";
import OpenSeadragon from "openseadragon";
import * as zarr from "zarrita";

export interface OMEZarrTileSourceOptions {
  type?: "ome-zarr";
  url: string; // TileSource.url
  c?: number;
  z?: number;
  t?: number;
  zip?: boolean;
  color?: Channel["color"];
  colorLUT?: Channel["lut"];
  colorMap?: Channel["colorMap"];
  contrastLimits?: [number, number];
  inverted?: Channel["inverted"];
  autoBoost?: boolean; // boost brightness of dark tiles (see renderChunks)
}

export interface OMEZarrTileData {
  chunk: zarr.Chunk<zarr.NumberDataType | zarr.BigintDataType>; // (y, x) chunk
  channel: Channel; // omero channel (required for rendering at conversion time)
  autoBoost?: boolean; // boost brightness of dark tiles (see renderChunks)
}

export class OMEZarrTileSource extends OpenSeadragon.TileSource {
  declare readonly url: string;

  readonly c?: number;
  readonly z?: number;
  readonly t?: number;
  readonly zip?: boolean;
  readonly color?: Channel["color"];
  readonly colorLUT?: Channel["lut"];
  readonly colorMap?: Channel["colorMap"];
  readonly contrastLimits?: [number, number];
  readonly inverted?: Channel["inverted"];
  readonly autoBoost?: boolean;

  width: number = 10;
  height: number = 10;
  private _image?: NgffImage;
  private _arrays?: zarr.Array<zarr.NumberDataType | zarr.BigintDataType>[];

  static {
    OMEZarrTileSource._learnConverters(OpenSeadragon);
  }

  constructor(url: string);
  constructor(options: OMEZarrTileSourceOptions);
  constructor(config: string | OMEZarrTileSourceOptions) {
    if (typeof config === "string") {
      super(config); // invokes getImageInfo
      this.url = config;
    } else {
      super(config.url); // invokes getImageInfo
      this.url = config.url;
      this.c = config.c;
      this.z = config.z;
      this.t = config.t;
      this.zip = config.zip;
      this.color = config.color;
      this.colorLUT = config.colorLUT;
      this.colorMap = config.colorMap;
      this.contrastLimits = config.contrastLimits;
      this.inverted = config.inverted;
      this.autoBoost = config.autoBoost;
    }
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
      this.c === other.c &&
      this.z === other.z &&
      this.t === other.t &&
      this.zip === other.zip &&
      this.color === other.color &&
      this.colorLUT === other.colorLUT && // deliberately by reference
      this.colorMap === other.colorMap && // deliberately by reference
      this.contrastLimits?.[0] === other.contrastLimits?.[0] &&
      this.contrastLimits?.[1] === other.contrastLimits?.[1] &&
      this.inverted === other.inverted &&
      this.autoBoost === other.autoBoost
    );
  }

  getImageInfo(url: string): void {
    const store =
      this.zip || (this.zip === undefined && url.endsWith(".ozx"))
        ? ZipFileStore.fromUrl(url)
        : url;
    NgffImage.load(store)
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
        const arrays = await Promise.all(
          image.paths.map((path) => image.openArray(path)),
        );
        const channelAxis = axisNames.indexOf("c");
        const numChannels =
          channelAxis >= 0 ? arrays[0]!.shape[channelAxis]! : 1;
        if (this.c === undefined && numChannels > 1) {
          throw new Error(`Image with ${numChannels} channels; specify c`);
        }
        const channelIndex = this.c ?? 0;
        image.checkChannelIndex(channelIndex);
        if (this.z !== undefined) {
          image.setZIndex(this.z);
        }
        if (this.t !== undefined) {
          image.setTIndex(this.t);
        }
        if (this.color !== undefined) {
          image.setChannelColor(channelIndex, this.color);
        }
        if (this.colorLUT !== undefined) {
          image.setChannelLut(channelIndex, this.colorLUT);
        }
        if (this.colorMap !== undefined) {
          image.setChannelColorMap(channelIndex, this.colorMap);
        }
        if (this.contrastLimits !== undefined) {
          image.setChannelStart(channelIndex, this.contrastLimits[0]);
          image.setChannelEnd(channelIndex, this.contrastLimits[1]);
        }
        if (this.inverted !== undefined) {
          image.setChannelInverted(channelIndex, this.inverted);
        }
        const width = arrays[0]!.shape[axisNames.indexOf("x")]!;
        const height = arrays[0]!.shape[axisNames.indexOf("y")]!;
        this._image = image;
        this._arrays = arrays;
        this.width = width;
        this.height = height;
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
    if (this.c !== undefined) {
      url.searchParams.append("c", this.c.toString());
    }
    if (this.z !== undefined) {
      url.searchParams.append("z", this.z.toString());
    }
    if (this.t !== undefined) {
      url.searchParams.append("t", this.t.toString());
    }
    if (this.zip !== undefined) {
      url.searchParams.append("zip", this.zip.toString());
    }
    if (this.color !== undefined) {
      url.searchParams.append("color", this.color);
    }
    if (this.colorLUT !== undefined) {
      url.searchParams.append("lut", OMEZarrTileSource._digest(this.colorLUT));
    }
    if (this.colorMap !== undefined) {
      url.searchParams.append(
        "colorMap",
        OMEZarrTileSource._digest([...this.colorMap]),
      );
    }
    if (this.contrastLimits !== undefined) {
      url.searchParams.append(
        "contrastLimits",
        `${this.contrastLimits[0]},${this.contrastLimits[1]}`,
      );
    }
    if (this.inverted !== undefined) {
      url.searchParams.append("inverted", this.inverted.toString());
    }
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
      const tileWidth = this.getTileWidth(level);
      const tileHeight = this.getTileHeight(level);
      const selection = getSlices(
        [this.c ?? 0],
        array.shape,
        this._image.getAxesNames(),
        {
          x: [x * tileWidth, (x + 1) * tileWidth], // clamped by zarrita
          y: [y * tileHeight, (y + 1) * tileHeight], // clamped by zarrita
          z: omero.rdefs.defaultZ,
          t: omero.rdefs.defaultT,
        },
      )[0] as (number | zarr.Slice | null)[];
      zarr.get(array, selection, { signal: abortController.signal }).then(
        (chunk) => {
          // no abort check needed: finish() is a no-op after abort()
          const data: OMEZarrTileData = {
            chunk,
            channel: omero.channels[this.c ?? 0]!,
            autoBoost: this.autoBoost,
          };
          context.finish(data, null, "ome-zarr");
        },
        (error) => {
          if (!abortController.signal.aborted) {
            context.fail(
              `failed to render tile for level=${level}, x=${x}, y=${y}: ${error}`,
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
      (_tile, { chunk, channel, autoBoost }: OMEZarrTileData) => {
        const hex = channel.color.replace(/^#/, "");
        const channelColor: [number, number, number] = [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
        ];
        const [vmin, vmax] =
          channel.window.start !== undefined && channel.window.end !== undefined
            ? [channel.window.start, channel.window.end]
            : getMinMaxValues(chunk);
        const channelContrastLimits: [number, number] =
          vmin < vmax ? [vmin, vmax] : [vmin, vmin + 1];
        const rgba = renderChunks(
          [chunk],
          [channelContrastLimits],
          [channelColor],
          [channel.lut ?? channel.colorMap],
          [channel.inverted === true],
          autoBoost,
        );
        return OMEZarrTileSource._toContext2D(
          rgba as Uint8ClampedArray<ArrayBuffer>,
          chunk.shape[1]!,
          chunk.shape[0]!,
        );
      },
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

  private static _toContext2D(
    rgba: Uint8ClampedArray<ArrayBuffer>,
    width: number,
    height: number,
  ): CanvasRenderingContext2D {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("failed to get 2D canvas context");
    }
    ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
    return ctx;
  }

  // FNV-1a hash of the JSON representation (short, stable key for large objects)
  private static _digest(value: unknown): string {
    let hash = 0x811c9dc5;
    for (const char of JSON.stringify(value)) {
      hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
    }
    return hash.toString(16);
  }
}
