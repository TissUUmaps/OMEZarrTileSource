import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig(({ mode }) => {
  const sharedConfig = {
    plugins: [nodePolyfills()],
  };
  if (mode === "library") {
    return {
      ...sharedConfig,
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
      },
    };
  }
  return {
    ...sharedConfig,
    base: "",
  };
});
