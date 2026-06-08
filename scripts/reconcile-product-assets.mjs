import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const INPUT_PATH = process.env.PRODUCT_RECONCILE_INPUT || "data/product-library.json";
const OUTPUT_PATH = process.env.PRODUCT_RECONCILE_OUTPUT || INPUT_PATH;
const IMAGE_DIR = process.env.PRODUCT_RECONCILE_IMAGE_DIR || "data/product-images";

function resolveProjectPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
}

function portablePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(fullPath)));
    else files.push(fullPath);
  }
  return files;
}

function bestMatch(product, files) {
  const piece = slug(product.piece);
  const brand = slug(product.brand);
  const name = slug(product.productName).slice(0, 72);
  const look = slug(product.look);
  const season = slug(product.season);

  return files.find((file) => {
    const normalized = portablePath(file).toLowerCase();
    return (
      normalized.includes(`/${season}/`) &&
      normalized.includes(`/${look}/`) &&
      normalized.includes(`${piece}__${brand}__`) &&
      normalized.includes(name.slice(0, 28))
    );
  });
}

async function main() {
  const libraryPath = resolveProjectPath(INPUT_PATH);
  const imageDir = resolveProjectPath(IMAGE_DIR);
  const library = JSON.parse(await fs.readFile(libraryPath, "utf8"));
  const products = Array.isArray(library.products) ? library.products : [];
  const files = (await walkFiles(imageDir)).filter((file) => /\.(png|jpe?g|webp|avif)$/i.test(file));
  let reconciled = 0;

  for (const product of products) {
    if (product.localImagePath) continue;
    const match = bestMatch(product, files);
    if (!match) continue;
    const stat = await fs.stat(match);
    product.localImagePath = portablePath(path.relative(PROJECT_ROOT, match));
    product.imageCaptureSource = product.imageCaptureSource || "reconciled-local-file";
    product.imageCacheStatus = product.imageCacheStatus === "failed:capture" ? "screenshot:reconciled" : product.imageCacheStatus || "screenshot:reconciled";
    product.imageCacheError = "";
    product.imageBytes = stat.size;
    reconciled += 1;
  }

  const captured = products.filter((product) => product.localImagePath).length;
  if (library.summary) {
    library.summary.cachedImages = captured;
    library.summary.imageCacheFailures = products.filter((product) => product.imageCacheStatus === "failed:capture").length;
  }
  library.reconcileSummary = {
    generatedAt: new Date().toISOString(),
    imageDir: IMAGE_DIR,
    imageFiles: files.length,
    reconciled,
    capturedProductImages: captured,
  };

  await fs.writeFile(resolveProjectPath(OUTPUT_PATH), `${JSON.stringify(library, null, 2)}\n`);
  console.log(JSON.stringify(library.reconcileSummary, null, 2));
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
