import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");

const INPUT_PATH = process.env.PRODUCT_CAPTURE_INPUT || "assets/product-library.json";
const OUTPUT_PATH = process.env.PRODUCT_CAPTURE_OUTPUT || "data/product-library.json";
const IMAGE_OUTPUT_DIR = process.env.PRODUCT_CAPTURE_IMAGE_OUTPUT_DIR || "data/product-images";
const SCREENSHOT_OUTPUT_DIR = process.env.PRODUCT_CAPTURE_SCREENSHOT_OUTPUT_DIR || "data/product-screenshots";
const PUBLIC_BASE_PATH = (process.env.PRODUCT_CAPTURE_PUBLIC_BASE_PATH || IMAGE_OUTPUT_DIR).replace(/\\/g, "/").replace(/\/$/, "");
const MAX_PRODUCTS = Math.max(1, Number(process.env.PRODUCT_CAPTURE_MAX_PRODUCTS) || 24);
const OVERWRITE = process.env.PRODUCT_CAPTURE_OVERWRITE === "true";
const ALLOW_FALLBACK_PRODUCTS = process.env.PRODUCT_CAPTURE_ALLOW_FALLBACK === "true";
const ALLOW_SCREENSHOTS = process.env.PRODUCT_CAPTURE_ALLOW_SCREENSHOTS === "true";
const SCREENSHOT_WIDTH = Math.max(900, Number(process.env.PRODUCT_CAPTURE_SCREENSHOT_WIDTH) || 1365);
const SCREENSHOT_HEIGHT = Math.max(900, Number(process.env.PRODUCT_CAPTURE_SCREENSHOT_HEIGHT) || 1600);
const SCREENSHOT_TOP = Math.max(0, Number(process.env.PRODUCT_CAPTURE_SCREENSHOT_TOP) || 260);
const SCREENSHOT_CROP_HEIGHT = Math.max(400, Number(process.env.PRODUCT_CAPTURE_SCREENSHOT_CROP_HEIGHT) || 920);
const SCREENSHOT_VIRTUAL_TIME_MS = Math.max(1000, Number(process.env.PRODUCT_CAPTURE_VIRTUAL_TIME_MS) || 8000);
const CAPTURE_TIMEOUT_MS = Math.max(8000, Number(process.env.PRODUCT_CAPTURE_TIMEOUT_MS) || 30000);
const MAX_IMAGE_BYTES = Math.max(100000, Number(process.env.PRODUCT_CAPTURE_MAX_IMAGE_BYTES) || 8000000);

const IMAGE_CONTENT_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 14);
}

function portablePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function resolveProjectPath(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  return path.isAbsolute(normalized) ? normalized : path.join(PROJECT_ROOT, normalized);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function extensionFromResponse(contentType, imageUrl) {
  const mime = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (IMAGE_CONTENT_TYPES.has(mime)) return IMAGE_CONTENT_TYPES.get(mime);
  try {
    const ext = path.extname(new URL(imageUrl).pathname).replace(".", "").toLowerCase();
    if (ext === "jpeg") return "jpg";
    if (["jpg", "png", "webp", "avif"].includes(ext)) return ext;
  } catch {
    return "";
  }
  return "";
}

function productFolder(product, baseDir) {
  return path.join(
    baseDir,
    slug(product.countryCode || "hk"),
    slug(product.seasonFamily || product.season || "season"),
    slug(product.look || "look"),
  );
}

function productBaseName(product) {
  return [
    slug(product.piece || "piece"),
    slug(product.brand || "brand"),
    slug(product.productName || "product"),
    hash(`${product.id}|${product.affiliateLink}|${product.imageUrl}`),
  ]
    .filter(Boolean)
    .join("__")
    .slice(0, 170);
}

function localImagePath(product, extension = "png") {
  const filename = `${productBaseName(product)}.${extension}`;
  const absolutePath = path.join(productFolder(product, IMAGE_OUTPUT_DIR), filename);
  const publicPath = portablePath(path.join(PUBLIC_BASE_PATH, slug(product.countryCode || "hk"), slug(product.seasonFamily || product.season || "season"), slug(product.look || "look"), filename));
  return { absolutePath, publicPath };
}

function localScreenshotPath(product) {
  const filename = `${productBaseName(product)}__page.png`;
  return resolveProjectPath(path.join(productFolder(product, SCREENSHOT_OUTPUT_DIR), filename));
}

function chromeCandidates() {
  return [
    process.env.PRODUCT_CAPTURE_CHROME_PATH,
    process.env.CHROME_PATH,
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe") : "",
    process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "Google", "Chrome", "Application", "chrome.exe") : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : "",
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "Microsoft", "Edge", "Application", "msedge.exe") : "",
    "chrome",
    "chrome.exe",
    "msedge",
    "msedge.exe",
  ].filter(Boolean);
}

async function findChrome() {
  for (const candidate of chromeCandidates()) {
    if (candidate.includes("\\") || candidate.includes("/")) {
      if (await fileExists(candidate)) return candidate;
      continue;
    }
    return candidate;
  }
  throw new Error("Chrome or Edge was not found. Set PRODUCT_CAPTURE_CHROME_PATH.");
}

async function downloadImage(product) {
  if (!product.imageUrl) return null;
  const response = await fetch(product.imageUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*",
      "User-Agent": "IC-wearables-product-capture/1.0",
    },
    redirect: "follow",
  });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) throw new Error(`image download failed with ${response.status}`);
  if (!contentType.toLowerCase().startsWith("image/")) throw new Error(`imageUrl returned ${contentType || "non-image"}`);
  const contentLength = Number(response.headers.get("content-length")) || 0;
  if (contentLength > MAX_IMAGE_BYTES) throw new Error(`image too large: ${contentLength} bytes`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error(`image too large: ${buffer.byteLength} bytes`);

  const extension = extensionFromResponse(contentType, product.imageUrl) || "png";
  const { absolutePath, publicPath } = localImagePath(product, extension);
  if (!OVERWRITE && (await fileExists(absolutePath))) {
    return { localImagePath: publicPath, status: "downloaded:existing", bytes: buffer.byteLength };
  }
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return { localImagePath: publicPath, status: "downloaded:image-url", bytes: buffer.byteLength };
}

async function captureScreenshotCrop(product, chromePath) {
  if (!ALLOW_SCREENSHOTS) return null;
  if (!product.affiliateLink) throw new Error("no affiliateLink to screenshot");

  const screenshotPath = localScreenshotPath(product);
  const { absolutePath, publicPath } = localImagePath(product, "png");
  if (!OVERWRITE && (await fileExists(absolutePath))) {
    return { localImagePath: publicPath, status: "screenshot:existing", screenshotPath: portablePath(screenshotPath), bytes: 0 };
  }

  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "icw-product-capture-"));
  try {
    await execFileAsync(
      chromePath,
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-notifications",
        "--disable-popup-blocking",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--run-all-compositor-stages-before-draw",
        `--user-data-dir=${userDataDir}`,
        `--window-size=${SCREENSHOT_WIDTH},${SCREENSHOT_HEIGHT}`,
        `--virtual-time-budget=${SCREENSHOT_VIRTUAL_TIME_MS}`,
        `--screenshot=${path.resolve(screenshotPath)}`,
        product.affiliateLink,
      ],
      { timeout: CAPTURE_TIMEOUT_MS, windowsHide: true },
    );
  } finally {
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }

  if (!(await fileExists(screenshotPath))) {
    throw new Error("Chrome completed without writing a screenshot file");
  }

  const metadata = await sharp(screenshotPath).metadata();
  const width = Math.min(SCREENSHOT_WIDTH, metadata.width || SCREENSHOT_WIDTH);
  const top = Math.min(SCREENSHOT_TOP, Math.max(0, (metadata.height || SCREENSHOT_HEIGHT) - 1));
  const height = Math.min(SCREENSHOT_CROP_HEIGHT, Math.max(1, (metadata.height || SCREENSHOT_HEIGHT) - top));
  await sharp(screenshotPath)
    .extract({ left: 0, top, width, height })
    .resize(900, 900, { fit: "inside", withoutEnlargement: true })
    .png()
    .toFile(absolutePath);
  await rejectLikelyBotWall(absolutePath);
  const stat = await fs.stat(absolutePath);
  return {
    localImagePath: publicPath,
    status: "screenshot:captured",
    screenshotPath: portablePath(path.relative(PROJECT_ROOT, screenshotPath)),
    bytes: stat.size,
  };
}

async function rejectLikelyBotWall(filePath) {
  const image = sharp(filePath).ensureAlpha().resize(64, 64, { fit: "fill" });
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  let grayPixels = 0;
  let whitePixels = 0;
  const total = data.length / 4;
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread < 10 && r > 130 && r < 210) grayPixels += 1;
    if (spread < 12 && r > 235) whitePixels += 1;
  }

  const grayRatio = grayPixels / total;
  const whiteRatio = whitePixels / total;
  if (grayRatio > 0.72 || (grayRatio > 0.42 && whiteRatio > 0.08)) {
    await fs.rm(filePath, { force: true }).catch(() => {});
    throw new Error("screenshot looks like a bot-check or blank interstitial, not a product image");
  }
}

function shouldAttempt(product) {
  if (product.isFallback && !ALLOW_FALLBACK_PRODUCTS) return false;
  return Boolean(product.imageUrl || (ALLOW_SCREENSHOTS && product.affiliateLink));
}

function applyCapture(product, result) {
  product.localImagePath = result.localImagePath || product.localImagePath || "";
  product.imageCacheStatus = result.status || product.imageCacheStatus || "";
  product.imageCacheError = "";
  product.imageCaptureSource = result.status?.startsWith("screenshot") ? "screenshot" : "image-url";
  product.imageBytes = result.bytes || product.imageBytes || 0;
  if (result.screenshotPath) product.screenshotPath = result.screenshotPath;
}

async function main() {
  const libraryPath = resolveProjectPath(INPUT_PATH);
  const library = JSON.parse(await fs.readFile(libraryPath, "utf8"));
  const products = Array.isArray(library.products) ? library.products : [];
  const summary = {
    attempted: 0,
    downloaded: 0,
    screenshots: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  const chromePath = ALLOW_SCREENSHOTS ? await findChrome() : "";

  for (const product of products) {
    if (summary.attempted >= MAX_PRODUCTS) break;
    if (!OVERWRITE && product.localImagePath && (await fileExists(resolveProjectPath(product.localImagePath)))) {
      summary.skipped += 1;
      continue;
    }
    if (!(await shouldAttempt(product))) {
      summary.skipped += 1;
      continue;
    }

    summary.attempted += 1;
    try {
      const result = (await downloadImage(product)) || (await captureScreenshotCrop(product, chromePath));
      if (!result) {
        summary.skipped += 1;
        continue;
      }
      applyCapture(product, result);
      if (result.status.startsWith("downloaded")) summary.downloaded += 1;
      if (result.status.startsWith("screenshot")) summary.screenshots += 1;
      console.log(`${result.status}: ${product.piece} / ${product.brand} -> ${result.localImagePath}`);
    } catch (error) {
      product.imageCacheStatus = "failed:capture";
      product.imageCacheError = error.message;
      summary.failed += 1;
      summary.errors.push(`${product.id || product.productName}: ${error.message}`);
      console.warn(`failed: ${product.piece} / ${product.brand}: ${error.message}`);
    }
  }

  const captured = products.filter((product) => product.localImagePath).length;
  library.captureSummary = {
    ...summary,
    capturedProductImages: captured,
    allowScreenshots: ALLOW_SCREENSHOTS,
    allowFallbackProducts: ALLOW_FALLBACK_PRODUCTS,
    outputDir: IMAGE_OUTPUT_DIR,
    screenshotOutputDir: SCREENSHOT_OUTPUT_DIR,
    generatedAt: new Date().toISOString(),
  };
  if (library.summary) {
    library.summary.cachedImages = captured;
    library.summary.imageCacheFailures = products.filter((product) => product.imageCacheStatus === "failed:capture").length;
  }

  await fs.mkdir(path.dirname(resolveProjectPath(OUTPUT_PATH)), { recursive: true });
  await fs.writeFile(resolveProjectPath(OUTPUT_PATH), `${JSON.stringify(library, null, 2)}\n`);
  console.log(JSON.stringify(library.captureSummary, null, 2));
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
