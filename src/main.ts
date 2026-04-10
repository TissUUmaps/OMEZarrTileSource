import { OMEZarrTileSource } from "./OMEZarrTileSource";

export {
  OMEZarrTileSource,
  type OMEZarrTileSourceClass,
  type OMEZarrTileSourceOptions,
} from "./OMEZarrTileSource";

if (globalThis.OpenSeadragon) {
  OMEZarrTileSource.enable(globalThis.OpenSeadragon);
}
