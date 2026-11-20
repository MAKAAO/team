const esbuild = require("esbuild");
const path = require("path");
const here = __dirname;
Promise.all([
  esbuild.build({
    entryPoints: [path.join(here, "preload.js")],
    bundle: true,
    platform: "node",
    target: "node20",
    external: ["electron"],
    outfile: path.join(here, "preload.bundle.js")
  }),
  esbuild.build({
    entryPoints: [path.join(here, "renderer.js")],
    bundle: true,
    platform: "browser",
    target: ["chrome120"],
    outfile: path.join(here, "renderer.bundle.js")
  })
]).catch(error => { console.error(error); process.exit(1); });
