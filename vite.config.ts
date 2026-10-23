import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";

// Owlbear resolves extension paths from the site root, so a GitHub Pages build needs BASE_PATH=/repo/
const base = process.env.BASE_PATH ?? "/";

function owlbearManifest(): Plugin {
  const render = () => readFileSync(resolve(__dirname, "manifest.template.json"), "utf8").replaceAll("{{base}}", base);
  return {
    name: "owlbear-manifest",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== `${base}manifest.json`) return next();
        res.setHeader("Content-Type", "application/json");
        res.end(render());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "manifest.json", source: render() });
    },
  };
}

export default defineConfig({
  base,
  plugins: [preact(), owlbearManifest()],
  server: { cors: { origin: /^https:\/\/(www\.)?owlbear\.rodeo$/ } },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        obr: resolve(__dirname, "obr.html"),
      },
    },
  },
});
