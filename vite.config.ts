import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig(({ mode }) => {
  if (mode === "library") {
    // ES module library build: runtime dependencies (zarrita, ome-zarr.js,
    // @zarrita/storage) are left external so that the consuming app installs
    // and shares a single copy of them (e.g. to pass NgffImage instances).
    return {
      build: {
        lib: {
          formats: ["es"],
          entry: "src/main.ts",
          fileName: "omezarr-tilesource",
        },
        rolldownOptions: {
          external: [
            "@zarrita/storage/zip",
            "ome-zarr.js",
            "openseadragon",
            "zarrita",
          ],
          checks: {
            pluginTimings: false,
          },
        },
        copyPublicDir: false,
      },
      plugins: [dts({ bundleTypes: true })],
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
