import {
  OMEZarrTileSource,
  type OMEZarrTileSourceOptions,
} from "./OMEZarrTileSource";
export { OMEZarrTileSource, type OMEZarrTileSourceOptions };

if (globalThis.OpenSeadragon) {
  OMEZarrTileSource.enable(globalThis.OpenSeadragon);
}
