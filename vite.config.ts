import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig(({ mode }) => {
  if (mode === "library") {
    return {
      build: {
        lib: {
          entry: "src/main.ts",
          name: "OMEZarrTileSource",
          fileName: "omezarr-tilesource",
        },
        rollupOptions: {
          external: ["openseadragon"],
          output: {
            globals: {
              openseadragon: "OpenSeadragon",
            },
          },
        },
        chunkSizeWarningLimit: 2048,
      },
      plugins: [nodePolyfills()],
    };
  }
  return {
    base: "",
    build: {
      chunkSizeWarningLimit: 2048,
    },
    plugins: [nodePolyfills()],
  };
});
