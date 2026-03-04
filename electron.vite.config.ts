import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    main: {
        build: {
            sourcemap: true,
        },
    },
    preload: {
        build: {
            sourcemap: true,
        },
    },
    renderer: {
        build: {
            sourcemap: true,
        },
        resolve: {
            alias: {
                "@renderer": resolve("src/renderer/src"),
            },
        },
        plugins: [react()],
    },
});
