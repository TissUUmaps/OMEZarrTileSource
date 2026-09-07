import { OMEZarrTileSource } from "./OMEZarrTileSource";

export {
  OMEZarrTileSource,
  type OMEZarrTileSourceClass,
  type OMEZarrTileSourceOptions,
} from "./OMEZarrTileSource";

// enable automatically when OpenSeadragon is loaded globally, e.g. via CDN
if (globalThis.OpenSeadragon) {
  OMEZarrTileSource.enable(globalThis.OpenSeadragon);
}
