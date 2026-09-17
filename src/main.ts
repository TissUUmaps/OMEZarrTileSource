import { OMEZarrTileSource } from "./OMEZarrTileSource";

export type { OMEZarr } from "./OMEZarr";
export { OMEZarrTileSource } from "./OMEZarrTileSource";
export type { OMEZarrTileData } from "./OMEZarrTileData";
export type { OMEZarrTileSourceOptions } from "./OMEZarrTileSourceOptions";
export {
  type Color,
  type LUTOrColorMap,
  fnv1a,
  getDataTypeRange,
  isOZX,
  resolveUrl,
} from "./utils";

if (globalThis.OpenSeadragon) {
  OMEZarrTileSource.enable(globalThis.OpenSeadragon);
}
