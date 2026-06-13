import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const INPUT_PATH = process.env.PRODUCT_COMBINATION_INPUT || "assets/product-library.json";
const OUTPUT_DIR = process.env.PRODUCT_COMBINATION_OUTPUT_DIR || "assets/outfit-combinations";
const MANIFEST_PATH = process.env.PRODUCT_COMBINATION_MANIFEST || path.join(OUTPUT_DIR, "manifest.json");
const GROUP_BY = String(process.env.PRODUCT_COMBINATION_GROUP_BY || "family").trim().toLowerCase();
const BOARD_WIDTH = Math.max(900, Number(process.env.PRODUCT_COMBINATION_WIDTH) || 1200);
const BOARD_HEIGHT = Math.max(1200, Number(process.env.PRODUCT_COMBINATION_HEIGHT) || 1600);
const MAX_PRODUCTS_PER_COMBINATION = Math.max(3, Math.min(8, Number(process.env.PRODUCT_COMBINATION_MAX_PRODUCTS) || 4));
const VARIANTS_PER_GROUP = Math.max(1, Math.min(20, Number(process.env.PRODUCT_COMBINATION_VARIANTS) || 10));
const SEASON_FILTER = String(process.env.PRODUCT_COMBINATION_SEASON_FILTER || "").trim().toLowerCase();
const FAMILY_FILTER = String(process.env.PRODUCT_COMBINATION_FAMILY_FILTER || "").trim().toLowerCase();
const LOOK_FILTER = String(process.env.PRODUCT_COMBINATION_LOOK_FILTER || "").trim().toLowerCase();
const ALLOW_REMOTE_IMAGES = process.env.PRODUCT_COMBINATION_ALLOW_REMOTE_IMAGES === "true";
const REQUIRE_EXACT_PRODUCTS = process.env.PRODUCT_COMBINATION_REQUIRE_EXACT !== "false";
const REQUIRE_PRODUCT_MEDIA = process.env.PRODUCT_COMBINATION_REQUIRE_MEDIA !== "false";
const FAMILY_PALETTES = {
  Spring: ["#ffd166", "#ff8c69", "#36b37e", "#41c7c7", "#fff2c2", "#d98c28"],
  Summer: ["#7f95ad", "#c9a7b7", "#6b778d", "#e6e9ed", "#8d6f8b", "#b7c7d9"],
  Autumn: ["#8b5e3c", "#c28057", "#6f7557", "#d6b073", "#f1dcc0", "#154f5b"],
  Winter: ["#050505", "#ffffff", "#0b5fff", "#c1121f", "#008f7a", "#7b2cbf"],
};

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function resolveProjectPath(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  return path.isAbsolute(normalized) ? normalized : path.join(PROJECT_ROOT, normalized);
}

function portablePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function seasonFamily(season) {
  const normalized = String(season || "").toLowerCase();
  if (normalized.includes("spring")) return "Spring";
  if (normalized.includes("summer")) return "Summer";
  if (normalized.includes("autumn") || normalized.includes("fall")) return "Autumn";
  if (normalized.includes("winter")) return "Winter";
  return "Season";
}

function wrapText(value, maxChars, maxLines = 3) {
  const words = String(value || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = next;
    }
  }

  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.,;:!?-]+$/, "")}...`;
  }
  return lines;
}

function cleanProductTitle(product) {
  const season = String(product.season || "").trim();
  const occasion = String(product.occasion || "").trim();
  return String(product.productName || "Product match")
    .replace(/\s+search results$/i, "")
    .replace(new RegExp(`\\s+${season.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "")
    .replace(new RegExp(`\\s+${occasion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "")
    .replace(/\s+/g, " ")
    .trim();
}

function textLines(value, x, y, options = {}) {
  const {
    maxChars = 30,
    maxLines = 3,
    lineHeight = 28,
    size = 22,
    weight = 700,
    fill = "#f8f1e6",
    opacity = 1,
    anchor = "start",
    letterSpacing = 0,
  } = options;

  return wrapText(value, maxChars, maxLines)
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" text-anchor="${anchor}" fill="${fill}" opacity="${opacity}" font-size="${size}" font-weight="${weight}" letter-spacing="${letterSpacing}">${escapeXml(line)}</text>`,
    )
    .join("");
}

function firstProductForPiece(products, piece) {
  const candidates = products.filter((product) => product.piece === piece);
  return (
    candidates.find((product) => !product.isFallback && (product.localImagePath || product.imageUrl)) ||
    candidates.find((product) => !product.isFallback) ||
    candidates.find((product) => product.localImagePath || product.imageUrl) ||
    candidates[0] ||
    null
  );
}

function rankedProductsForPiece(products, piece) {
  return products
    .filter((product) => product.piece === piece)
    .filter((product) => !REQUIRE_EXACT_PRODUCTS || !product.isFallback)
    .filter((product) => !REQUIRE_PRODUCT_MEDIA || product.localImagePath || product.imageUrl || product.affiliateLink)
    .slice()
    .sort((left, right) => {
      const leftScore = Number(!left.isFallback) * 8 + Number(Boolean(left.localImagePath || left.imageUrl)) * 4 + Number(Boolean(left.affiliateLink)) * 2;
      const rightScore = Number(!right.isFallback) * 8 + Number(Boolean(right.localImagePath || right.imageUrl)) * 4 + Number(Boolean(right.affiliateLink)) * 2;
      if (rightScore !== leftScore) return rightScore - leftScore;
      return String(left.productName || "").localeCompare(String(right.productName || ""));
    });
}

function candidatesByPiece(products) {
  const pieces = [...new Set(products.map((product) => product.piece).filter(Boolean))];
  return pieces
    .map((piece) => [piece, rankedProductsForPiece(products, piece)])
    .filter(([, candidates]) => candidates.length);
}

function combinationCountForGroup(products) {
  const groupedCandidates = candidatesByPiece(products).slice(0, MAX_PRODUCTS_PER_COMBINATION);
  if (groupedCandidates.length < Math.min(3, MAX_PRODUCTS_PER_COMBINATION)) return 0;
  return groupedCandidates.reduce((total, [, candidates]) => total * Math.max(1, candidates.length), 1);
}

function pickCombinationProducts(products, variantIndex = 0) {
  const groupedCandidates = candidatesByPiece(products).slice(0, MAX_PRODUCTS_PER_COMBINATION);
  if (groupedCandidates.length < Math.min(3, MAX_PRODUCTS_PER_COMBINATION)) return [];
  let divisor = 1;
  return groupedCandidates
    .map(([, candidates]) => {
      const index = Math.floor(variantIndex / divisor) % candidates.length;
      divisor *= Math.max(1, candidates.length);
      return candidates[index] || candidates[0];
    })
    .filter(Boolean);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function imageDataUri(product) {
  const localPath = product.localImagePath ? resolveProjectPath(product.localImagePath) : "";
  if (localPath && (await fileExists(localPath))) {
    const buffer = await sharp(await fs.readFile(localPath)).png().toBuffer();
    return `data:image/png;base64,${buffer.toString("base64")}`;
  }

  if (!ALLOW_REMOTE_IMAGES) return "";
  if (!product.imageUrl && product.affiliateLink) {
    product.imageUrl = await productPageImageUrl(product.affiliateLink);
  }
  if (!product.imageUrl) return "";
  try {
    const response = await fetch(product.imageUrl, {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/*" },
    });
    if (!response.ok && product.affiliateLink) {
      const fallbackImageUrl = await productPageImageUrl(product.affiliateLink);
      if (fallbackImageUrl && fallbackImageUrl !== product.imageUrl) {
        product.imageUrl = fallbackImageUrl;
        return imageDataUri(product);
      }
      return "";
    }
    if (!response.ok) return "";
    const contentType = (response.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!contentType.startsWith("image/")) return "";
    const buffer = await sharp(Buffer.from(await response.arrayBuffer())).png().toBuffer();
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
}

async function productPageImageUrl(url) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0",
      },
    });
    if (!response.ok) return "";
    const html = await response.text();
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)/i);
    if (!match?.[1]) return "";
    return new URL(match[1].replace(/&amp;/g, "&"), response.url).toString();
  } catch {
    return "";
  }
}

function paletteSwatches(palette, x, y) {
  return palette
    .slice(0, 6)
    .map(
      (color, index) =>
        `<rect x="${x + index * 58}" y="${y}" width="44" height="44" rx="14" fill="${escapeXml(color)}" stroke="rgba(248,241,230,0.24)" />`,
    )
    .join("");
}

async function productCardSvg(product, index, x, y, width, height) {
  const imageUri = await imageDataUri(product);
  const imageBoxHeight = Math.round(height * 0.54);
  const slot = String(index + 1).padStart(2, "0");
  const status = [
    product.isFallback ? "Fallback search" : "Exact product",
    product.localImagePath ? "cached image" : product.imageUrl ? "remote image" : "no image yet",
  ].join(" / ");

  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="30" fill="rgba(248,241,230,0.055)" stroke="rgba(248,241,230,0.14)" />
      <rect x="${x + 18}" y="${y + 18}" width="${width - 36}" height="${imageBoxHeight}" rx="24" fill="rgba(224,182,101,0.10)" stroke="rgba(248,241,230,0.12)" />
      ${
        imageUri
          ? `<image href="${imageUri}" x="${x + 18}" y="${y + 18}" width="${width - 36}" height="${imageBoxHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#imageClip${index})" />`
          : `<text x="${x + width / 2}" y="${y + 18 + imageBoxHeight / 2 - 8}" text-anchor="middle" fill="#e0b665" font-size="58" font-weight="950">${escapeXml(product.piece || slot).slice(0, 1)}</text>
             <text x="${x + width / 2}" y="${y + 18 + imageBoxHeight / 2 + 32}" text-anchor="middle" fill="rgba(248,241,230,0.62)" font-size="18" font-weight="850" letter-spacing="3">${escapeXml(product.piece || "PRODUCT").toUpperCase()}</text>`
      }
      <text x="${x + 24}" y="${y + imageBoxHeight + 62}" fill="rgba(248,241,230,0.52)" font-size="17" font-weight="900" letter-spacing="2">${slot} / ${escapeXml(product.piece || "Piece").toUpperCase()}</text>
      ${textLines(cleanProductTitle(product), x + 24, y + imageBoxHeight + 96, {
        maxChars: 29,
        maxLines: 2,
        lineHeight: 28,
        size: 22,
        weight: 850,
      })}
      ${textLines(product.brand || "Retail partner", x + 24, y + height - 48, {
        maxChars: 30,
        maxLines: 1,
        size: 18,
        weight: 800,
        fill: "#e0b665",
      })}
      ${textLines(status, x + 24, y + height - 22, {
        maxChars: 38,
        maxLines: 1,
        size: 14,
        weight: 700,
        fill: "rgba(248,241,230,0.58)",
      })}
    </g>
  `;
}

async function boardSvg(combination) {
  const { season, seasonFamily: family, look, palette, products } = combination;
  const cardWidth = Math.floor((BOARD_WIDTH - 112) / 2);
  const cardHeight = 440;
  const left = 42;
  const gap = 28;
  const startY = 352;
  const cardSvgs = [];

  for (const [index, product] of products.entries()) {
    const x = left + (index % 2) * (cardWidth + gap);
    const y = startY + Math.floor(index / 2) * (cardHeight + gap);
    cardSvgs.push(await productCardSvg(product, index, x, y, cardWidth, cardHeight));
  }

  const clips = products
    .map((_, index) => {
      const x = left + (index % 2) * (cardWidth + gap) + 18;
      const y = startY + Math.floor(index / 2) * (cardHeight + gap) + 18;
      return `<clipPath id="imageClip${index}"><rect x="${x}" y="${y}" width="${cardWidth - 36}" height="${Math.round(cardHeight * 0.54)}" rx="24" /></clipPath>`;
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${BOARD_WIDTH}" height="${BOARD_HEIGHT}" viewBox="0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}">
      <defs>
        ${clips}
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#111827"/>
          <stop offset="0.55" stop-color="#17130f"/>
          <stop offset="1" stop-color="#2a1f1a"/>
        </linearGradient>
        <radialGradient id="glow" cx="0.15" cy="0.04" r="0.8">
          <stop offset="0" stop-color="${escapeXml(palette[0] || "#e0b665")}" stop-opacity="0.26"/>
          <stop offset="0.48" stop-color="${escapeXml(palette[2] || "#24464a")}" stop-opacity="0.10"/>
          <stop offset="1" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${BOARD_WIDTH}" height="${BOARD_HEIGHT}" fill="url(#bg)" />
      <rect width="${BOARD_WIDTH}" height="${BOARD_HEIGHT}" fill="url(#glow)" />
      <rect x="28" y="28" width="${BOARD_WIDTH - 56}" height="${BOARD_HEIGHT - 56}" rx="44" fill="none" stroke="rgba(248,241,230,0.12)" />
      <text x="48" y="88" fill="#e0b665" font-size="22" font-weight="950" letter-spacing="5">IC_WEARABLES OUTFIT REFERENCE</text>
      <text x="48" y="152" fill="#f8f1e6" font-size="62" font-weight="950">${escapeXml(family)} / ${escapeXml(season)}</text>
      <text x="48" y="204" fill="rgba(248,241,230,0.72)" font-size="34" font-weight="850">${escapeXml(look)}</text>
      ${paletteSwatches(palette, 48, 236)}
      <text x="48" y="${BOARD_HEIGHT - 96}" fill="rgba(248,241,230,0.74)" font-size="22" font-weight="800">Use as Image 2 only. Copy garment shapes, palette, fabric direction, shoes, bags, and accessories.</text>
      <text x="48" y="${BOARD_HEIGHT - 58}" fill="rgba(248,241,230,0.52)" font-size="18" font-weight="700">Never copy a catalogue model face, hair, body identity, expression, or pose from this board.</text>
      ${cardSvgs.join("")}
    </svg>
  `;
}

async function writeBoard(combination) {
  const countrySlug = slug(combination.countryCode || "global");
  const familySlug = slug(combination.seasonFamily);
  const seasonSlug = slug(combination.mode === "family" ? combination.seasonFamily : combination.season);
  const lookSlug = slug(combination.look);
  const variantSuffix = combination.variant ? `__v${combination.variant}` : "";
  const filename = `${seasonSlug}__${lookSlug}${variantSuffix}.png`;
  const outputPath = path.join(
    OUTPUT_DIR,
    countrySlug,
    combination.mode === "family" ? "families" : familySlug,
    filename,
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const svg = await boardSvg(combination);
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  return portablePath(path.relative(PROJECT_ROOT, outputPath));
}

function groupProducts(products) {
  const groups = new Map();
  for (const product of products) {
    if (!product.season || !product.look || !product.countryCode) continue;
    const family = seasonFamily(product.season);
    const groupSeason = GROUP_BY === "season" ? product.season : family;
    const key = `${String(product.countryCode || "").trim().toUpperCase()}::${GROUP_BY === "season" ? "season" : "family"}::${family}::${groupSeason}::${product.look}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  }
  return groups;
}

async function main() {
  const inputPath = resolveProjectPath(INPUT_PATH);
  const library = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const products = Array.isArray(library.products) ? library.products : [];
  const combinations = [];

  for (const [key, group] of groupProducts(products)) {
    const [countryCode, mode, family, season, look] = key.split("::");
    if (SEASON_FILTER && String(season || "").toLowerCase() !== SEASON_FILTER) continue;
    if (FAMILY_FILTER && String(family || "").toLowerCase() !== FAMILY_FILTER) continue;
    if (LOOK_FILTER && String(look || "").toLowerCase() !== LOOK_FILTER) continue;

    const groupVariantCount = Math.min(VARIANTS_PER_GROUP, combinationCountForGroup(group));
    for (let variantIndex = 0; variantIndex < groupVariantCount; variantIndex += 1) {
      const selectedProducts = pickCombinationProducts(group, variantIndex);
      if (!selectedProducts.length) continue;

      const combination = {
        id: `${slug(countryCode)}__${slug(mode)}__${slug(season)}__${slug(look)}__v${variantIndex + 1}`,
        countryCode,
        mode,
        seasonFamily: family,
        season,
        palette: mode === "family" ? FAMILY_PALETTES[family] || selectedProducts[0]?.palette || [] : selectedProducts[0]?.palette || [],
        look,
        occasion: selectedProducts[0]?.occasion || "",
        variant: variantIndex + 1,
        products: selectedProducts,
      };
      combination.boardImage = await writeBoard(combination);
      combination.productCount = selectedProducts.length;
      combination.productImageCount = selectedProducts.filter((product) => product.localImagePath || product.imageUrl).length;
      combination.exactProductCount = selectedProducts.filter((product) => !product.isFallback).length;
      combination.products = selectedProducts.map((product) => ({
        piece: product.piece,
        productName: product.productName,
        brand: product.brand,
        price: product.price,
        affiliateLink: product.affiliateLink,
        imageUrl: product.imageUrl,
        localImagePath: product.localImagePath,
        isFallback: Boolean(product.isFallback),
        source: product.source,
      }));
      combinations.push(combination);
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceLibrary: portablePath(path.relative(PROJECT_ROOT, inputPath)),
    outputDir: portablePath(path.relative(PROJECT_ROOT, resolveProjectPath(OUTPUT_DIR))),
    summary: {
      combinations: combinations.length,
      countries: [...new Set(combinations.map((combination) => combination.countryCode))].length,
      families: [...new Set(combinations.map((combination) => combination.seasonFamily))].length,
      variantsPerGroup: VARIANTS_PER_GROUP,
      exactProductCombinations: combinations.filter((combination) => combination.exactProductCount > 0).length,
      combinationsWithProductImages: combinations.filter((combination) => combination.productImageCount > 0).length,
    },
    usageNote:
      "Send Image 1 as the scanned face and Image 2 as the outfit combination board. The board is a garment/product reference only and must not change face, hair, expression, or identity.",
    combinations,
  };

  await fs.mkdir(path.dirname(resolveProjectPath(MANIFEST_PATH)), { recursive: true });
  await fs.writeFile(resolveProjectPath(MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest.summary, null, 2));
  console.log(`Wrote ${MANIFEST_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
