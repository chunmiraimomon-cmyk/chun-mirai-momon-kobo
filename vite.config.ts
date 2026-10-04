import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { legacyEvolutionAdapterPlugin } from "./lib/legacy-evolution-adapter.mjs";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const normalizedRoot = projectRoot.replaceAll("\\", "/");

// The archived game sources deliberately remain unchanged. Their public asset
// literals are remapped in this export's build, including lazy legacy modules.
function githubPagesAssetPaths(): Plugin {
  let basePath = "/";
  return {
    name: "github-pages-asset-paths",
    enforce: "pre",
    configResolved(config) {
      basePath = config.base;
      if (!basePath.startsWith("/") || !basePath.endsWith("/")) {
        throw new Error("GitHub Pages base must start and end with a slash");
      }
    },
    transform(source, id) {
      const normalizedId = id.replaceAll("\\", "/");
      if (!normalizedId.startsWith(normalizedRoot) || !/\.[cm]?[jt]sx?(?:\?|$)/.test(id)) return null;
      const code = source.replace(/(["'`])\/(textures|data|drivers)\//g, (_, quote, directory) => (
        `${quote}${basePath}${directory}/`
      ));
      return code === source ? null : { code, map: null };
    },
  };
}

export default defineConfig({
  root: projectRoot,
  base: process.env.PAGES_BASE_PATH ?? "/chun-mirai-momon-kobo/",
  plugins: [legacyEvolutionAdapterPlugin(), githubPagesAssetPaths(), react()],
  resolve: { alias: { "@": projectRoot } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
