import { ZipFileStore } from "@zarrita/storage";
import { NgffImage } from "ome-zarr.js";
import OpenSeadragon from "openseadragon";
import * as zarr from "zarrita";

export type OMEZarrTileSourceClass = typeof OMEZarrTileSource;
declare module "openseadragon" {
  let OMEZarrTileSource: OMEZarrTileSourceClass;
}

type UserData = {
  abortController?: AbortController;
};

export interface OMEZarrTileSourceOptions {
  type?: "ome-zarr";
  url: string; // TileSource.url
  zip?: boolean;
  t?: number;
  c?: number;
  z?: number;
}

export class OMEZarrTileSource extends OpenSeadragon.TileSource {
  declare readonly url: string;

  readonly zip?: boolean;
  readonly t?: number;
  readonly c?: number;
  readonly z?: number;

  width: number = 10;
  height: number = 10;
  private _image?: NgffImage;
  private _arrays?: zarr.Array<zarr.DataType>[];

  constructor(url: string);
  constructor(options: OMEZarrTileSourceOptions);
  constructor(config: string | OMEZarrTileSourceOptions) {
    if (typeof config === "string") {
      super(config); // invokes getImageInfo
      this.url = config;
    } else {
      super(config.url); // invokes getImageInfo
      this.url = config.url;
      this.zip = config.zip;
      this.t = config.t;
      this.c = config.c;
      this.z = config.z;
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
      this.zip === other.zip &&
      this.t === other.t &&
      this.c === other.c &&
      this.z === other.z
    );
  }

  getImageInfo(url: string): void {
    console.debug(`getting image info for ${url}`);
    const store =
      this.zip || (this.zip === undefined && url.endsWith(".ozx"))
        ? ZipFileStore.fromUrl(url)
        : new zarr.FetchStore(url);
    NgffImage.load(store)
      .then(async (image) => {
        console.debug(`loaded image for ${url}`);
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
        console.debug(`opened ${arrays.length} arrays for ${url}`);
        if (this.c !== undefined) {
          image.checkChannelIndex(this.c).channels.forEach((_, i) => {
            image.setChannelActive(i, i === this.c);
          });
        }
        if (this.z !== undefined) {
          image.setZIndex(this.z);
        }
        if (this.t !== undefined) {
          image.setTIndex(this.t);
        }
        const width = arrays[0]!.shape[axisNames.indexOf("x")]!;
        const height = arrays[0]!.shape[axisNames.indexOf("y")]!;
        this._image = image;
        this._arrays = arrays;
        this.width = width;
        this.height = height;
        this.maxLevel = arrays.length - 1;
        console.debug(`ready for ${url}`);
        this.raiseEvent("ready", { tileSource: this });
      })
      .catch((reason) => {
        this._image = undefined;
        this._arrays = undefined;
        this.width = 10;
        this.height = 10;
        this.maxLevel = 0;
        const message = `failed to get image info for ${url}: ${reason}`;
        console.error(message);
        this.raiseEvent("open-failed", { message, source: url });
      });
  }

  getTileWidth(level: number): number {
    if (this._image === undefined || this._arrays === undefined) {
      throw new Error("tile source not ready");
    }
    if (level < 0 || level > this.maxLevel) {
      throw new Error("level out of bounds");
    }
    const levelArray = this._arrays[this.maxLevel - level]!;
    return levelArray.chunks[this._image.getAxesNames().indexOf("x")]!;
  }

  getTileHeight(level: number): number {
    if (this._image === undefined || this._arrays === undefined) {
      throw new Error("tile source not ready");
    }
    if (level < 0 || level > this.maxLevel) {
      throw new Error("level out of bounds");
    }
    const levelArray = this._arrays[this.maxLevel - level]!;
    return levelArray.chunks[this._image.getAxesNames().indexOf("y")]!;
  }

  getLevelScale(level: number): number {
    if (this._image === undefined || this._arrays === undefined) {
      throw new Error("tile source not ready");
    }
    if (level < 0 || level > this.maxLevel) {
      throw new Error("level out of bounds");
    }
    const xAxisIndex = this._image.getAxesNames().indexOf("x");
    const levelArray = this._arrays[this.maxLevel - level]!;
    const levelWidth = levelArray.shape[xAxisIndex]!;
    const width = this._arrays[0]!.shape[xAxisIndex]!;
    return levelWidth / width;
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
    if (this.z !== undefined) {
      url.searchParams.append("z", this.z.toString());
    }
    if (this.c !== undefined) {
      url.searchParams.append("c", this.c.toString());
    }
    if (this.t !== undefined) {
      url.searchParams.append("t", this.t.toString());
    }
    return url.toString();
  }

  downloadTileStart(context: OpenSeadragon.ImageJob): void {
    const userData = context.userData as UserData;
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
      console.debug(
        `downloading tile for level=${level}, x=${x}, y=${y} from dataset ${this.maxLevel - level}`,
      );
      const tileWidth = this.getTileWidth(level);
      const tileHeight = this.getTileHeight(level);
      this._image
        .renderArray({
          arr: this._arrays[this.maxLevel - level]!,
          slices: {
            x: [x * tileWidth, (x + 1) * tileWidth],
            y: [y * tileHeight, (y + 1) * tileHeight],
          },
          signal: abortController.signal,
        })
        .then(({ data, width, height }) => {
          abortController.signal.throwIfAborted();
          console.debug(`rendered tile for level=${level}, x=${x}, y=${y}`);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx === null) {
            throw new Error("failed to get 2D canvas context");
          }
          ctx.putImageData(
            new ImageData(
              data as Uint8ClampedArray<ArrayBuffer>,
              width,
              height,
            ),
            0,
            0,
          );
          context.finish(ctx, null, "context2d");
        })
        .catch((reason) => {
          if (abortController.signal.aborted) {
            console.debug(
              `aborted tile rendering for level=${level}, x=${x}, y=${y}`,
            );
          } else {
            const message = `failed to render tile for level=${level}, x=${x}, y=${y}: ${reason}`;
            console.error(message);
            context.fail(message, null);
          }
        });
    } catch (error) {
      const message = `failed to download tile for level=${level}, x=${x}, y=${y}: ${String(error)}`;
      console.error(message);
      context.fail(message, null);
    }
  }

  downloadTileAbort(context: OpenSeadragon.ImageJob): void {
    const userData = context.userData as UserData;
    if (userData.abortController !== undefined) {
      userData.abortController.abort();
      userData.abortController = undefined;
    }
  }

  static enable(os: typeof OpenSeadragon = OpenSeadragon): void {
    os.OMEZarrTileSource = OMEZarrTileSource;
  }
}
