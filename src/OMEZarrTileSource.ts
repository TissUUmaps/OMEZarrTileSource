import * as zarr from "zarrita";
import { renderImage, type Multiscale, type Omero } from "ome-zarr.js";
import { ZipFileStore } from "@zarrita/storage";
import OpenSeadragon from "openseadragon";

export interface OMEZarrTileSourceOptions {
  type?: "ome-zarr";
  url: string; // TileSource.url
  zip?: boolean;
  t?: number;
  c?: number;
  z?: number;
}

export class OMEZarrTileSource extends OpenSeadragon.TileSource {
  static readonly DUMMY_XHR = new XMLHttpRequest();

  // properties inherited from/required by OpenSeadragon.TileSource
  readonly url: string;
  aspectRatio: number = 1;
  dimensions: OpenSeadragon.Point = new OpenSeadragon.Point(10, 10);
  maxLevel: number = 0;
  ready: boolean = false;

  readonly zip?: boolean;
  readonly t?: number;
  readonly c?: number;
  readonly z?: number;
  private _omero?: Omero;
  private _multiscale?: Multiscale;
  private _axisIndices?: {
    t?: number;
    c?: number;
    z?: number;
    y: number;
    x: number;
  };
  private _arrays?: zarr.Array<zarr.DataType>[];

  constructor(url: string);
  constructor(options: OMEZarrTileSourceOptions);
  constructor(config: string | OMEZarrTileSourceOptions) {
    if (typeof config === "string") {
      super(
        // @ts-ignore URL string
        config
      ); // invokes getImageInfo
      this.url = config;
    } else {
      super(
        // @ts-ignore URL string
        config.url
      ); // invokes getImageInfo
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
    postData: string | null = null
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
    zarr
      .open(store, { kind: "group" })
      .then(async (group) => {
        console.debug(`opened group for ${url}: ${group}`);
        const { multiscale, omero } = OMEZarrTileSource._getMultiscale(group);
        const axisIndices = OMEZarrTileSource._getAxisIndices(multiscale);
        const arrays = await Promise.all(
          multiscale.datasets.map((dataset) =>
            zarr.open(group.resolve(dataset.path), { kind: "array" })
          )
        );
        console.debug(`opened ${arrays.length} arrays for ${url}`);
        const maxWidth = arrays[0]!.shape[axisIndices.x]!;
        const maxHeight = arrays[0]!.shape[axisIndices.y]!;
        this._omero = omero;
        this._multiscale = multiscale;
        this._axisIndices = axisIndices;
        this._arrays = arrays;
        this.aspectRatio = maxWidth / maxHeight;
        this.dimensions = new OpenSeadragon.Point(maxWidth, maxHeight);
        this.maxLevel = arrays.length - 1;
        this.ready = true;
        console.debug(`ready for ${url}`);
        this.raiseEvent("ready", { tileSource: this });
      })
      .catch((reason) => {
        this._omero = undefined;
        this._multiscale = undefined;
        this._axisIndices = undefined;
        this._arrays = undefined;
        this.aspectRatio = 1;
        this.dimensions = new OpenSeadragon.Point(10, 10);
        this.maxLevel = 0;
        this.ready = false;
        const message = `failed to get image info for ${url}: ${reason}`;
        console.error(message);
        this.raiseEvent("open-failed", { message, source: url });
      });
  }

  getTileWidth(level: number): number {
    if (this._axisIndices === undefined || this._arrays === undefined) {
      throw new Error("tile source not ready");
    }
    if (level < 0 || level > this.maxLevel) {
      throw new Error("level out of bounds");
    }
    const array = this._arrays[this.maxLevel - level]!;
    return array.chunks[this._axisIndices.x]!;
  }

  getTileHeight(level: number): number {
    if (this._axisIndices === undefined || this._arrays === undefined) {
      throw new Error("tile source not ready");
    }
    if (level < 0 || level > this.maxLevel) {
      throw new Error("level out of bounds");
    }
    const array = this._arrays[this.maxLevel - level]!;
    return array.chunks[this._axisIndices.y]!;
  }

  getLevelScale(level: number): number {
    if (this._axisIndices === undefined || this._arrays === undefined) {
      throw new Error("tile source not ready");
    }
    if (level < 0 || level > this.maxLevel) {
      throw new Error("level out of bounds");
    }
    const array = this._arrays[this.maxLevel - level]!;
    const arrayWidth = array.shape[this._axisIndices.x]!;
    const maxWidth = this._arrays[0]!.shape[this._axisIndices.x]!;
    return arrayWidth / maxWidth;
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
    const abortController = new AbortController();
    context.userData.abortController = abortController;
    const urlSearchParams = new URLSearchParams(
      // @ts-ignore OpenSeadragon.ImageJob.src
      context.src
    );
    const level = +urlSearchParams.get("level")!;
    const x = +urlSearchParams.get("x")!;
    const y = +urlSearchParams.get("y")!;
    try {
      if (
        this._multiscale === undefined ||
        this._axisIndices === undefined ||
        this._arrays === undefined
      ) {
        throw new Error("tile source not ready");
      }
      console.debug(
        `downloading tile for level=${level}, x=${x}, y=${y} from dataset ${
          this.maxLevel - level
        }`
      );
      const tileWidth = this.getTileWidth(level);
      const tileHeight = this.getTileHeight(level);
      const array = this._arrays[this.maxLevel - level]!;
      const maxTileWidth = array.shape[this._axisIndices.x]!;
      const maxTileHeight = array.shape[this._axisIndices.y]!;
      renderImage(array, this._multiscale.axes, this._omero, {
        x: [x * tileWidth, Math.min((x + 1) * tileWidth, maxTileWidth)],
        y: [y * tileHeight, Math.min((y + 1) * tileHeight, maxTileHeight)],
        z: this.z,
        c: this.c,
        t: this.t,
      }) // TODO https://github.com/BioNGFF/ome-zarr.js/pull/26
        .then(async (dataUrl) => {
          abortController.signal.throwIfAborted();
          console.debug(`rendered tile for level=${level}, x=${x}, y=${y}`);
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            context.userData.img = img;
            img.onload = () => resolve(img);
            img.onerror = (reason) => reject(reason);
            img.onabort = () => {
              if (!abortController.signal.aborted) {
                abortController.abort();
              }
              reject(abortController.signal.reason);
            };
            img.src = dataUrl;
          });
          abortController.signal.throwIfAborted();
          console.debug(`loaded tile for level=${level}, x=${x}, y=${y}`);
          context.finish(img, OMEZarrTileSource.DUMMY_XHR, "");
        })
        .catch((reason) => {
          if (abortController.signal.aborted) {
            console.debug(
              `aborted tile rendering for level=${level}, x=${x}, y=${y}`
            );
          } else {
            const message = `failed to render tile for level=${level}, x=${x}, y=${y}: ${reason}`;
            console.error(message);
            context.finish(null, OMEZarrTileSource.DUMMY_XHR, message);
          }
        });
    } catch (error) {
      const message = `failed to download tile for level=${level}, x=${x}, y=${y}: ${error}`;
      console.error(message);
      context.finish(null, OMEZarrTileSource.DUMMY_XHR, message);
    }
  }

  downloadTileAbort(context: OpenSeadragon.ImageJob): void {
    if (context.userData.abortController !== undefined) {
      (context.userData.abortController as AbortController).abort();
      context.userData.abortController = undefined;
    }
    if (context.userData.img !== undefined) {
      (context.userData.img as HTMLImageElement).src = "";
      context.userData.img = undefined;
    }
  }

  static enable(os: typeof OpenSeadragon = OpenSeadragon): void {
    (os as any).OMEZarrTileSource = OMEZarrTileSource;
  }

  // TODO https://github.com/BioNGFF/ome-zarr.js/pull/27
  private static _getMultiscale<T extends zarr.Readable>(
    group: zarr.Group<T>
  ): { multiscale: Multiscale; omero?: Omero } {
    if (!("ome" in group.attrs)) {
      throw new Error("missing OME-Zarr metadata in attributes");
    }
    const ome = group.attrs["ome"] as Record<string, unknown>;
    if (!("multiscales" in ome)) {
      throw new Error("missing multiscales metadata in OME-Zarr metadata");
    }
    const multiscales = ome["multiscales"] as Multiscale[];
    if (multiscales.length === 0) {
      throw new Error("empty multiscales metadata in OME-Zarr metadata");
    }
    const multiscale = multiscales[0]!;
    const omero = "omero" in ome ? (ome["omero"] as Omero) : undefined;
    return { multiscale, omero };
  }

  private static _getAxisIndices(multiscale: Multiscale): {
    t?: number;
    c?: number;
    z?: number;
    y: number;
    x: number;
  } {
    let t: number | undefined = undefined;
    let c: number | undefined = undefined;
    let z: number | undefined = undefined;
    let y: number | undefined = undefined;
    let x: number | undefined = undefined;
    for (let i = 0; i < multiscale.axes.length; i++) {
      const axis = multiscale.axes[i]!;
      switch (axis.name) {
        case "t":
          t = i;
          break;
        case "c":
          c = i;
          break;
        case "z":
          z = i;
          break;
        case "y":
          y = i;
          break;
        case "x":
          x = i;
          break;
        default:
          throw new Error(`unsupported axis: ${axis.name}`);
      }
    }
    if (x === undefined || y === undefined) {
      throw new Error("missing X or Y axis");
    }
    return { t, c, z, y, x };
  }
}
