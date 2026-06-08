import fs from "node:fs/promises";
import path from "node:path";

const BACKEND_BASE_URL = (process.env.IC_BACKEND_BASE_URL || "https://ic-wearables.vercel.app").replace(/\/$/, "");
const COUNTRY_CODE = (process.env.IC_COUNTRY_CODE || "HK").trim().toUpperCase();
const OUTPUT_PATH = process.env.PRODUCT_LIBRARY_OUTPUT || "data/product-library.json";
const REQUIRE_PRODUCT_PAGES = process.env.PRODUCT_LIBRARY_REQUIRE_PRODUCT_PAGES === "true";
const ALLOW_SEARCH_FALLBACK = process.env.PRODUCT_LIBRARY_ALLOW_SEARCH_FALLBACK !== "false";
const MAX_PRODUCTS_PER_PIECE = Math.max(1, Math.min(8, Number(process.env.PRODUCT_LIBRARY_MAX_PRODUCTS) || 2));
const MAX_LOOKUPS = Math.max(1, Number(process.env.PRODUCT_LIBRARY_MAX_LOOKUPS) || 80);
const REQUEST_TIMEOUT_MS = Math.max(3000, Number(process.env.PRODUCT_LIBRARY_TIMEOUT_MS) || 15000);

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

async function fetchProducts({ season, look, piece }) {
  const searchQuery = [piece.search, season.name, look.occasion].join(" ");
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
    };
  }
  return {
    products: Array.isArray(payload.products) ? payload.products.slice(0, MAX_PRODUCTS_PER_PIECE) : [],
    error: "",
    budget: payload.budget || null,
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
    isFallback: Boolean(product.isFallback),
    source: product.source || "",
    actionLabel: product.actionLabel || (product.buyLink ? "Shop" : "Unavailable"),
  };
}

async function main() {
  const generatedAt = new Date().toISOString();
  const products = [];
  const failures = [];
  let lookupCount = 0;

  for (const season of seasons) {
    for (const look of looks) {
      for (const piece of look.pieces) {
        if (lookupCount >= MAX_LOOKUPS) break;
        lookupCount += 1;
        const query = [piece.search, season.name, look.occasion].join(" ");
        const result = await fetchProducts({ season, look, piece });
        if (result.error) {
          failures.push({
            countryCode: COUNTRY_CODE,
            season: season.name,
            look: look.title,
            piece: piece.label,
            query,
            error: result.error,
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
  const library = {
    generatedAt,
    backendBaseUrl: BACKEND_BASE_URL,
    countryCode: COUNTRY_CODE,
    requireProductPages: REQUIRE_PRODUCT_PAGES,
    allowSearchFallback: ALLOW_SEARCH_FALLBACK,
    maxProductsPerPiece: MAX_PRODUCTS_PER_PIECE,
    maxLookups: MAX_LOOKUPS,
    summary: {
      seasons: seasons.length,
      looks: looks.length,
      products: products.length,
      exactProducts: exactCount,
      fallbackSearchLinks: fallbackCount,
      failures: failures.length,
    },
    usageNote:
      "This library stores affiliate links and remote product image URLs. Download and commit product photos only when the affiliate programme/feed terms allow local hosting.",
    products,
    failures,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(library, null, 2)}\n`);
  console.log(JSON.stringify(library.summary, null, 2));
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
