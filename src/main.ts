import { OMEZarrTileSource } from "./OMEZarrTileSource";

export {
  OMEZarrTileSource,
  type OMEZarrTileData,
  type OMEZarrTileSourceOptions,
} from "./OMEZarrTileSource";

if (globalThis.OpenSeadragon) {
  OMEZarrTileSource.enable(globalThis.OpenSeadragon);
}
