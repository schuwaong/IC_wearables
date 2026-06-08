import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const ENV_FILES = [
  process.env.PRODUCT_LIBRARY_ENV_FILE,
  path.join(PROJECT_ROOT, ".env.local"),
  path.join(PROJECT_ROOT, ".env"),
].filter(Boolean);

await loadEnvFiles(ENV_FILES);

const USE_LOCAL_AFFILIATE_BACKEND = process.env.PRODUCT_LIBRARY_USE_LOCAL_BACKEND !== "false";
const BACKEND_BASE_URL = (process.env.IC_BACKEND_BASE_URL || "https://ic-wearables.vercel.app").replace(/\/$/, "");
const COUNTRY_CODE = (process.env.IC_COUNTRY_CODE || "HK").trim().toUpperCase();
const OUTPUT_PATH = process.env.PRODUCT_LIBRARY_OUTPUT || "data/product-library.json";
const REQUIRE_PRODUCT_PAGES = process.env.PRODUCT_LIBRARY_REQUIRE_PRODUCT_PAGES === "true";
const ALLOW_SEARCH_FALLBACK = process.env.PRODUCT_LIBRARY_ALLOW_SEARCH_FALLBACK !== "false";
const MAX_PRODUCTS_PER_PIECE = Math.max(1, Math.min(8, Number(process.env.PRODUCT_LIBRARY_MAX_PRODUCTS) || 2));
const MAX_LOOKUPS = Math.max(1, Number(process.env.PRODUCT_LIBRARY_MAX_LOOKUPS) || 80);
const REQUEST_TIMEOUT_MS = Math.max(3000, Number(process.env.PRODUCT_LIBRARY_TIMEOUT_MS) || 15000);
const CACHE_IMAGES = process.env.PRODUCT_LIBRARY_CACHE_IMAGES === "true";
const CACHE_FALLBACK_IMAGES = process.env.PRODUCT_LIBRARY_CACHE_FALLBACK_IMAGES === "true";
const IMAGE_OUTPUT_DIR = process.env.PRODUCT_LIBRARY_IMAGE_OUTPUT_DIR || "data/product-images";
const IMAGE_PUBLIC_BASE_PATH = (process.env.PRODUCT_LIBRARY_IMAGE_PUBLIC_BASE_PATH || IMAGE_OUTPUT_DIR).replace(/\\/g, "/").replace(/\/$/, "");
const IMAGE_TIMEOUT_MS = Math.max(3000, Number(process.env.PRODUCT_LIBRARY_IMAGE_TIMEOUT_MS) || REQUEST_TIMEOUT_MS);
const IMAGE_MAX_BYTES = Math.max(100000, Number(process.env.PRODUCT_LIBRARY_IMAGE_MAX_BYTES) || 6000000);
const IMAGE_OVERWRITE = process.env.PRODUCT_LIBRARY_IMAGE_OVERWRITE === "true";
const IMAGE_CONTENT_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);
const localAffiliateBackend = USE_LOCAL_AFFILIATE_BACKEND
  ? await import("../api/affiliate-products.js").catch((error) => {
      console.warn(`[product-library] Local affiliate backend unavailable; using HTTP backend: ${error.message}`);
      return null;
    })
  : null;

const seasons = [
  { name: "Light Spring", palette: ["#f8e7b8", "#f5bc6b", "#ff9d89", "#91d2bd", "#83abd7", "#fff4dc"] },
  { name: "True Spring", palette: ["#ffd166", "#ff8c69", "#36b37e", "#41c7c7", "#fff2c2", "#d98c28"] },
  { name: "Bright Spring", palette: ["#ff4f8b", "#00b8a9", "#ffe066", "#2f80ed", "#111827", "#fff7ef"] },
  { name: "Light Summer", palette: ["#c7d8ed", "#e8c6d0", "#d8d6ec", "#edf1f3", "#9fb6c8", "#b9d8cf"] },
  { name: "True Summer", palette: ["#7f95ad", "#c9a7b7", "#6b778d", "#e6e9ed", "#8d6f8b", "#b7c7d9"] },
  { name: "Soft Summer", palette: ["#8fa4a8", "#c6b2bd", "#747d8c", "#dcd8d5", "#9c8796", "#a7b39f"] },
  { name: "Soft Autumn", palette: ["#8b5e3c", "#c28057", "#6f7557", "#d6b073", "#f1dcc0", "#154f5b"] },
  { name: "True Autumn", palette: ["#7a4a28", "#b85c38", "#6b7a3b", "#c59b42", "#2f5d50", "#efd8ac"] },
  { name: "Dark Autumn", palette: ["#2a1f1a", "#5a3a21", "#8a3f2d", "#174c49", "#b98233", "#dfc39b"] },
  { name: "Dark Winter", palette: ["#111827", "#f7f8fb", "#0f5b76", "#8f1d3f", "#4b5563", "#0b3b3e"] },
  { name: "True Winter", palette: ["#050505", "#ffffff", "#0b5fff", "#c1121f", "#008f7a", "#7b2cbf"] },
  { name: "Bright Winter", palette: ["#09090b", "#ffffff", "#ff006e", "#00c2ff", "#6dff8f", "#ffdd00"] },
];

const looks = [
  {
    title: "Business formal",
    occasion: "business formal",
    pieces: [
      { label: "Tailored blazer", search: "women tailored blazer" },
      { label: "Near-face blouse", search: "women silk satin blouse" },
      { label: "Tailored trouser or skirt", search: "women tailored trousers pencil skirt" },
      { label: "Leather pump or loafer", search: "women leather pumps loafers" },
    ],
  },
  {
    title: "Smart casual",
    occasion: "smart casual",
    pieces: [
      { label: "Soft blazer", search: "women relaxed blazer" },
      { label: "Fine knit top", search: "women fine knit top" },
      { label: "Tailored denim or trouser", search: "women tailored jeans trousers" },
      { label: "Loafer or slingback", search: "women loafers slingback shoes" },
    ],
  },
  {
    title: "City casual",
    occasion: "city casual",
    pieces: [
      { label: "Cropped jacket", search: "women cropped jacket" },
      { label: "Premium tee or knit", search: "women premium t shirt fine knit" },
      { label: "Straight denim or trouser", search: "women straight leg jeans trousers" },
      { label: "Clean sneaker", search: "women minimal leather sneakers" },
    ],
  },
  {
    title: "Athleisure",
    occasion: "athleisure",
    pieces: [
      { label: "Technical jacket", search: "women technical jacket" },
      { label: "Performance tank or tee", search: "women performance tank t shirt" },
      { label: "Tailored legging or jogger", search: "women premium leggings joggers" },
      { label: "Training sneaker", search: "women premium training sneakers" },
    ],
  },
  {
    title: "Quiet luxury",
    occasion: "quiet luxury",
    pieces: [
      { label: "Cashmere knit", search: "women cashmere knit sweater" },
      { label: "Wool coat", search: "women wool coat" },
      { label: "Fluid trouser", search: "women fluid wool trousers" },
      { label: "Leather tote or loafer", search: "women leather tote loafers" },
    ],
  },
];

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function loadEnvFiles(filePaths) {
  for (const filePath of filePaths) {
    let content = "";
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.warn(`[product-library] Could not read env file ${filePath}: ${error.message}`);
      }
      continue;
    }

    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;
      process.env[key] = parseEnvValue(rawValue);
    }
  }
}

function parseEnvValue(value) {
  const trimmed = String(value || "").trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    const inner = trimmed.slice(1, -1);
    return quote === '"' ? inner.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\") : inner;
  }
  const commentIndex = trimmed.search(/\s+#/);
  return commentIndex === -1 ? trimmed : trimmed.slice(0, commentIndex).trim();
}

function portablePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 14);
}

function extensionFromImageResponse(contentType, imageUrl) {
  const mime = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (IMAGE_CONTENT_TYPES.has(mime)) return IMAGE_CONTENT_TYPES.get(mime);

  try {
    const ext = path.extname(new URL(imageUrl).pathname).replace(".", "").toLowerCase();
    if (ext === "jpeg") return "jpg";
    if (["jpg", "png", "webp", "avif"].includes(ext)) return ext;
  } catch {
    // Fall through to unsupported type.
  }
  return "";
}

function imageCachePath(product, extension) {
  const folder = path.join(
    IMAGE_OUTPUT_DIR,
    slug(product.countryCode || COUNTRY_CODE),
    slug(product.season),
    slug(product.look)
  );
  const baseName = [
    slug(product.piece),
    slug(product.brand),
    slug(product.productName),
    hash(`${product.id}|${product.imageUrl}`),
  ]
    .filter(Boolean)
    .join("__")
    .slice(0, 170);

  const filename = `${baseName || hash(product.imageUrl)}.${extension}`;
  const absolutePath = path.join(folder, filename);
  const localImagePath = portablePath(path.join(IMAGE_PUBLIC_BASE_PATH, slug(product.countryCode || COUNTRY_CODE), slug(product.season), slug(product.look), filename));
  return { absolutePath, localImagePath };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function emptyImageCache(status, error = "") {
  return {
    localImagePath: "",
    imageCacheStatus: status,
    imageCacheError: error,
    imageContentType: "",
    imageBytes: 0,
  };
}

async function cacheProductImage(product) {
  if (!CACHE_IMAGES) return emptyImageCache("disabled");
  if (!product.imageUrl) return emptyImageCache("skipped:no-image-url");
  if (product.isFallback && !CACHE_FALLBACK_IMAGES) return emptyImageCache("skipped:fallback-product");

  let imageUrl;
  try {
    imageUrl = new URL(product.imageUrl);
  } catch {
    return emptyImageCache("skipped:invalid-url", "imageUrl is not a valid URL");
  }

  if (!["http:", "https:"].includes(imageUrl.protocol)) {
    return emptyImageCache("skipped:invalid-url", "imageUrl must use http or https");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(imageUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1",
        "User-Agent": "IC-wearables-product-library/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (error) {
    return emptyImageCache(
      "failed:request",
      error?.name === "AbortError" ? `image download timed out after ${IMAGE_TIMEOUT_MS}ms` : error.message
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return emptyImageCache("failed:http", `image request failed with ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const extension = extensionFromImageResponse(contentType, imageUrl.href);
  if (!extension) {
    return emptyImageCache("skipped:unsupported-type", `unsupported content-type: ${contentType || "unknown"}`);
  }

  const contentLength = Number(response.headers.get("content-length")) || 0;
  if (contentLength > IMAGE_MAX_BYTES) {
    return emptyImageCache("skipped:too-large", `content-length ${contentLength} exceeds ${IMAGE_MAX_BYTES}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > IMAGE_MAX_BYTES) {
    return emptyImageCache("skipped:too-large", `downloaded ${buffer.byteLength} bytes exceeds ${IMAGE_MAX_BYTES}`);
  }

  const { absolutePath, localImagePath } = imageCachePath(product, extension);
  if (!IMAGE_OVERWRITE && (await fileExists(absolutePath))) {
    return {
      localImagePath,
      imageCacheStatus: "cached:existing",
      imageCacheError: "",
      imageContentType: contentType,
      imageBytes: buffer.byteLength,
    };
  }

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return {
    localImagePath,
    imageCacheStatus: "cached",
    imageCacheError: "",
    imageContentType: contentType,
    imageBytes: buffer.byteLength,
  };
}

async function fetchProducts({ season, look, piece }) {
  const searchQuery = [piece.search, season.name, look.occasion].join(" ");
  if (localAffiliateBackend?.processRequest) {
    try {
      const payload = await localAffiliateBackend.processRequest({
        searchQuery,
        colorSeason: season.name,
        countryCode: COUNTRY_CODE,
        allowSearchFallback: ALLOW_SEARCH_FALLBACK,
        requireProductPages: REQUIRE_PRODUCT_PAGES,
      }, { includeDiagnostics: true });
      return {
        products: Array.isArray(payload.products) ? payload.products.slice(0, MAX_PRODUCTS_PER_PIECE) : [],
        error: "",
        budget: payload.budget || null,
        details: Array.isArray(payload?.details) ? payload.details : [],
      };
    } catch (error) {
      return {
        products: [],
        error: error?.details?.length ? `${error.message} | ${error.details.join(" | ")}` : error.message,
        budget: error?.budget || null,
        details: Array.isArray(error?.details) ? error.details : [],
      };
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${BACKEND_BASE_URL}/api/fetch-matching-clothes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchQuery,
        colorSeason: season.name,
        countryCode: COUNTRY_CODE,
        allowSearchFallback: ALLOW_SEARCH_FALLBACK,
        requireProductPages: REQUIRE_PRODUCT_PAGES,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    return {
      products: [],
      error: error?.name === "AbortError" ? `lookup timed out after ${REQUEST_TIMEOUT_MS}ms` : error.message,
      budget: null,
    };
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      products: [],
      error: payload?.error || `lookup failed with ${response.status}`,
      budget: payload?.budget || null,
      details: Array.isArray(payload?.details) ? payload.details : [],
    };
  }
  return {
    products: Array.isArray(payload.products) ? payload.products.slice(0, MAX_PRODUCTS_PER_PIECE) : [],
    error: "",
    budget: payload.budget || null,
    details: Array.isArray(payload?.details) ? payload.details : [],
  };
}

function normalizeProduct(product, context, index) {
  const id = [
    context.countryCode,
    context.season.name,
    context.look.title,
    context.piece.label,
    product.brand,
    product.productName,
    index + 1,
  ]
    .map(slug)
    .filter(Boolean)
    .join("__");

  return {
    id,
    countryCode: context.countryCode,
    season: context.season.name,
    palette: context.season.palette,
    look: context.look.title,
    occasion: context.look.occasion,
    piece: context.piece.label,
    query: context.query,
    productName: product.productName || "",
    brand: product.brand || "",
    price: product.price || "",
    budgetRange: product.budgetRange || context.budget?.rangeLabel || "",
    affiliateLink: product.buyLink || "",
    imageUrl: product.imageUrl || "",
    localImagePath: "",
    imageCacheStatus: "not-attempted",
    imageCacheError: "",
    imageContentType: "",
    imageBytes: 0,
    isFallback: Boolean(product.isFallback),
    source: product.source || "",
    actionLabel: product.actionLabel || (product.buyLink ? "Shop" : "Unavailable"),
    nearbyStoreUrl: product.nearbyStoreUrl || "",
    nearbyStoreMode: product.nearbyStoreMode || "",
    nearbyStoreLabel: product.nearbyStoreLabel || "",
  };
}

async function attachImageCache(products) {
  const summary = {
    enabled: CACHE_IMAGES,
    outputDir: portablePath(IMAGE_OUTPUT_DIR),
    publicBasePath: IMAGE_PUBLIC_BASE_PATH,
    fallbackImagesEnabled: CACHE_FALLBACK_IMAGES,
    maxBytes: IMAGE_MAX_BYTES,
    cached: 0,
    existing: 0,
    skipped: 0,
    failed: 0,
    disabled: 0,
  };

  for (const product of products) {
    const result = await cacheProductImage(product);
    Object.assign(product, result);

    if (result.imageCacheStatus === "cached") summary.cached += 1;
    else if (result.imageCacheStatus === "cached:existing") summary.existing += 1;
    else if (result.imageCacheStatus === "disabled") summary.disabled += 1;
    else if (result.imageCacheStatus.startsWith("failed:")) summary.failed += 1;
    else summary.skipped += 1;
  }

  return summary;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const products = [];
  const failures = [];
  const affiliateDiagnostics = [];
  let lookupCount = 0;

  for (const season of seasons) {
    for (const look of looks) {
      for (const piece of look.pieces) {
        if (lookupCount >= MAX_LOOKUPS) break;
        lookupCount += 1;
        const query = [piece.search, season.name, look.occasion].join(" ");
        const result = await fetchProducts({ season, look, piece });
        for (const detail of result.details || []) {
          affiliateDiagnostics.push(detail);
        }
        if (result.error) {
          failures.push({
            countryCode: COUNTRY_CODE,
            season: season.name,
            look: look.title,
            piece: piece.label,
            query,
            error: result.error,
            details: result.details || [],
          });
        }
        result.products.forEach((product, index) => {
          products.push(normalizeProduct(product, { countryCode: COUNTRY_CODE, season, look, piece, query, budget: result.budget }, index));
        });
      }
      if (lookupCount >= MAX_LOOKUPS) break;
    }
    if (lookupCount >= MAX_LOOKUPS) break;
  }

  const exactCount = products.filter((product) => !product.isFallback).length;
  const fallbackCount = products.length - exactCount;
  const imageCache = await attachImageCache(products);
  const library = {
    generatedAt,
    backendBaseUrl: BACKEND_BASE_URL,
    countryCode: COUNTRY_CODE,
    requireProductPages: REQUIRE_PRODUCT_PAGES,
    allowSearchFallback: ALLOW_SEARCH_FALLBACK,
    maxProductsPerPiece: MAX_PRODUCTS_PER_PIECE,
    maxLookups: MAX_LOOKUPS,
    lookupMode: localAffiliateBackend?.processRequest ? "local-backend" : "http-backend",
    summary: {
      seasons: seasons.length,
      looks: looks.length,
      products: products.length,
      exactProducts: exactCount,
      fallbackSearchLinks: fallbackCount,
      failures: failures.length,
      cachedImages: imageCache.cached + imageCache.existing,
      imageCacheFailures: imageCache.failed,
    },
    imageCache,
    affiliateDiagnostics: [...new Set(affiliateDiagnostics)].slice(0, 40),
    usageNote:
      "This library stores affiliate links, remote product image URLs, and optional local image cache paths. Download and commit product photos only when the affiliate programme/feed terms allow local hosting.",
    products,
    failures,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(library, null, 2)}\n`);
  console.log(JSON.stringify(library.summary, null, 2));
  if (library.affiliateDiagnostics.length) {
    console.log("Affiliate diagnostics:");
    for (const detail of library.affiliateDiagnostics.slice(0, 8)) console.log(`- ${detail}`);
  }
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
