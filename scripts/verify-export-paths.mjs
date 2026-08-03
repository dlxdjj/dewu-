import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function normalizeBasePath(value) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function collectHtmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectHtmlFiles(path);
    return entry.name.endsWith(".html") ? [path] : [];
  });
}

const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);
if (!basePath) {
  throw new Error("NEXT_PUBLIC_BASE_PATH must be set for the Pages export audit");
}

const htmlFiles = collectHtmlFiles("out");
if (!htmlFiles.length) throw new Error("No exported HTML files found in out/");

const forbiddenRootAsset = /(?:src|href)="\/(?:_next\/|manifest\.webmanifest|icons\/|favicon\.|apple-icon)/;
const invalidHtml = htmlFiles.filter((file) =>
  forbiddenRootAsset.test(readFileSync(file, "utf8")),
);

if (invalidHtml.length) {
  throw new Error(`Root-relative assets remain in: ${invalidHtml.join(", ")}`);
}

const indexHtml = readFileSync("out/index.html", "utf8");
if (!indexHtml.includes(`${basePath}/_next/`)) {
  throw new Error(`Exported scripts are not prefixed with ${basePath}`);
}
if (!indexHtml.includes(`${basePath}/manifest.webmanifest`)) {
  throw new Error(`Manifest link is not prefixed with ${basePath}`);
}

const manifest = JSON.parse(readFileSync("out/manifest.webmanifest", "utf8"));
const expectedRoot = `${basePath}/`;
if (manifest.start_url !== expectedRoot || manifest.scope !== expectedRoot) {
  throw new Error("Manifest start_url or scope does not match the Pages base path");
}
if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
  throw new Error("Manifest must include at least one icon");
}
if (manifest.icons.some((icon) => !icon.src.startsWith(`${basePath}/icons/`))) {
  throw new Error("Manifest icon paths do not match the Pages base path");
}

console.log(`Verified ${htmlFiles.length} HTML files for base path ${basePath}`);
