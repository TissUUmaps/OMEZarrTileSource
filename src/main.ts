import { OMEZarrTileSource } from "./OMEZarrTileSource";

export {
  OMEZarrTileSource,
  type OMEZarrTileSourceOptions,
} from "./OMEZarrTileSource";

if (globalThis.OpenSeadragon) {
  OMEZarrTileSource.enable(globalThis.OpenSeadragon);
}
