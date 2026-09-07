import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

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
      plugins: [dts({ bundleTypes: true })],
    };
  }
  return {
    base: "",
    build: {
      chunkSizeWarningLimit: 2048,
    },
  };
});
