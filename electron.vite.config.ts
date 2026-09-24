import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

/**
 * Version shown in the interface, read from package.json at build time.
 * Prevents a hard-coded number from drifting away from the actually published version.
 */
const { version } = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
  version: string;
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve("src/main/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve("src/preload/index.ts") },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@shared": resolve("src/shared"),
        // Single source for the app icon: the renderer imports the very file that
        // electron-builder ships, so the sidebar can never drift from the installer.
        "@resources": resolve("resources"),
      },
    },
    // `resources/` sits outside the renderer root, so the dev server has to be
    // allowed to serve it.
    server: { fs: { allow: [resolve(".")] } },
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    build: {
      rollupOptions: {
        input: { index: resolve("src/renderer/index.html") },
      },
    },
  },
});
