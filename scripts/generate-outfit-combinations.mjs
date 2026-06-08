import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");

const INPUT_PATH = process.env.OUTFIT_COMBO_INPUT || "data/product-library.json";
const OUTPUT_DIR = process.env.OUTFIT_COMBO_OUTPUT_DIR || "data/outfit-combination-crops";
const MANIFEST_PATH = process.env.OUTFIT_COMBO_MANIFEST || path.join(OUTPUT_DIR, "manifest.json");
const GROUP_BY = String(process.env.OUTFIT_COMBO_GROUP_BY || "season").trim().toLowerCase();
const MAX_PRODUCTS = Math.max(1, Math.min(6, Number(process.env.OUTFIT_COMBO_MAX_PRODUCTS) || 4));
const BOARD_WIDTH = Math.max(900, Number(process.env.OUTFIT_COMBO_WIDTH) || 1200);
const BOARD_HEIGHT = Math.max(1200, Number(process.env.OUTFIT_COMBO_HEIGHT) || 1600);
const CARD_BACKGROUND = process.env.OUTFIT_COMBO_CARD_BACKGROUND || "#ffffff";
const BOARD_BACKGROUND = process.env.OUTFIT_COMBO_BACKGROUND || "#f5efe5";
const WRITE_CROPS = process.env.OUTFIT_COMBO_WRITE_CROPS !== "false";
const INCLUDE_LABELS = process.env.OUTFIT_COMBO_LABELS === "true";
const ALLOW_REMOTE_IMAGES = process.env.OUTFIT_COMBO_ALLOW_REMOTE_IMAGES === "true";
const IGNORE_LEFT_RATIO = Math.min(0.5, Math.max(0, Number(process.env.OUTFIT_COMBO_IGNORE_LEFT_RATIO) || 0.24));
const TILE_COLUMNS = Math.max(1, Math.min(5, Number(process.env.OUTFIT_COMBO_TILE_COLUMNS) || 3));
const MIN_CONTENT_PIXELS = Math.max(120, Number(process.env.OUTFIT_COMBO_MIN_CONTENT_PIXELS) || 700);
const MIN_CONTENT_BOX = Math.max(20, Number(process.env.OUTFIT_COMBO_MIN_CONTENT_BOX) || 42);
const PALETTE_WEIGHT = Number(process.env.OUTFIT_COMBO_PALETTE_WEIGHT) || 0.34;
const PIECE_WEIGHT = Number(process.env.OUTFIT_COMBO_PIECE_WEIGHT) || 0.22;
const AREA_WEIGHT = Number(process.env.OUTFIT_COMBO_AREA_WEIGHT) || 0.12;
const TILE_ROLE_WEIGHT = Number(process.env.OUTFIT_COMBO_TILE_ROLE_WEIGHT) || 0.24;

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

function seasonFamily(season) {
  const normalized = String(season || "").toLowerCase();
  if (normalized.includes("spring")) return "Spring";
  if (normalized.includes("summer")) return "Summer";
  if (normalized.includes("autumn") || normalized.includes("fall")) return "Autumn";
  if (normalized.includes("winter")) return "Winter";
  return "Season";
}

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

function paletteForGroup(product, family) {
  const productPalette = Array.isArray(product?.palette) ? product.palette.filter(Boolean) : [];
  if (GROUP_BY === "family") return FAMILY_PALETTES[family] || productPalette;
  return productPalette.length ? productPalette : FAMILY_PALETTES[family] || [];
}

function colorDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function distanceToPalette(rgb, palette) {
  if (!palette.length) return 160;
  let best = Number.POSITIVE_INFINITY;
  for (const color of palette) best = Math.min(best, colorDistance(rgb, color));
  return best;
}

function isNearWhite(r, g, b) {
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return r > 242 && g > 242 && b > 242 && spread < 26;
}

function isLikelyScreenshot(product, info) {
  if (String(product.imageCaptureSource || "").includes("screenshot")) return true;
  if (String(product.imageCacheStatus || "").includes("screenshot")) return true;
  if (String(product.source || "").includes("search")) return true;
  return info.width > info.height * 1.15;
}

function hashBuffer(buffer) {
  return crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 12);
}

function clampBox(box, info) {
  const left = Math.max(0, Math.min(info.width - 1, Math.round(box.left)));
  const top = Math.max(0, Math.min(info.height - 1, Math.round(box.top)));
  const width = Math.max(1, Math.min(info.width - left, Math.round(box.width)));
  const height = Math.max(1, Math.min(info.height - top, Math.round(box.height)));
  return { left, top, width, height };
}

function expandBox(box, info, padding) {
  const left = Math.max(0, box.left - padding);
  const top = Math.max(0, box.top - padding);
  const right = Math.min(info.width, box.left + box.width + padding);
  const bottom = Math.min(info.height, box.top + box.height + padding);
  return clampBox({ left, top, width: right - left, height: bottom - top }, info);
}

function contentStats(raw, palette, box) {
  const { data, info } = raw;
  const channelCount = info.channels;
  const sourceBox = clampBox(box, info);
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let contentPixels = 0;
  let distanceSum = 0;

  for (let y = sourceBox.top; y < sourceBox.top + sourceBox.height; y += 1) {
    for (let x = sourceBox.left; x < sourceBox.left + sourceBox.width; x += 1) {
      const index = (y * info.width + x) * channelCount;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      if (isNearWhite(r, g, b)) continue;

      contentPixels += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      distanceSum += distanceToPalette({ r, g, b }, palette);
    }
  }

  if (!contentPixels) {
    return {
      contentPixels: 0,
      contentBox: null,
      paletteScore: 0,
      contentRatio: 0,
      aspect: 1,
    };
  }

  const contentBox = {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
  const avgDistance = distanceSum / contentPixels;
  const paletteScore = Math.max(0, Math.min(1, 1 - avgDistance / 310));
  const contentRatio = contentPixels / Math.max(1, contentBox.width * contentBox.height);
  const aspect = contentBox.width / Math.max(1, contentBox.height);

  return {
    contentPixels,
    contentBox,
    paletteScore,
    contentRatio,
    aspect,
  };
}

function pieceKind(piece) {
  const value = String(piece || "").toLowerCase();
  if (/(shoe|sneaker|loafer|pump|boot|trainer|sand(al|le))/.test(value)) return "shoe";
  if (/(bag|tote|purse|belt|watch|jewel|jewellery|jewelry|earring|necklace|bracelet|accessor)/.test(value)) return "accessory";
  if (/(pant|trouser|denim|jean|legging|jogger|skirt|short)/.test(value)) return "bottom";
  if (/(coat|jacket|blazer|cardigan|outerwear)/.test(value)) return "outerwear";
  if (/(tee|t-shirt|shirt|blouse|top|knit|tank|sweater|cashmere)/.test(value)) return "top";
  return "garment";
}

function pieceShapeScore(piece, stats) {
  const kind = pieceKind(piece);
  const aspect = stats.aspect;
  const ratio = stats.contentRatio;
  const largeEnough = Math.min(1, Math.sqrt(stats.contentPixels / 18000));

  if (kind === "shoe") {
    const aspectFit = aspect >= 1.45 ? 1 : Math.max(0, aspect / 1.45);
    return Math.max(0.2, Math.min(1, aspectFit * 0.78 + largeEnough * 0.22));
  }

  if (kind === "bottom") {
    const tallFit = aspect <= 0.82 ? 1 : Math.max(0, 1.6 - aspect);
    return Math.max(0.2, Math.min(1, tallFit * 0.7 + largeEnough * 0.3));
  }

  if (kind === "accessory") {
    const notTooLarge = stats.contentPixels < 42000 ? 1 : Math.max(0.25, 1 - (stats.contentPixels - 42000) / 90000);
    return Math.max(0.2, Math.min(1, notTooLarge * 0.55 + ratio * 0.2 + largeEnough * 0.25));
  }

  if (kind === "outerwear" || kind === "top" || kind === "garment") {
    const torsoAspectFit = aspect > 0.45 && aspect < 1.35 ? 1 : Math.max(0.18, 1 - Math.abs(aspect - 0.85) / 1.7);
    return Math.max(0.2, Math.min(1, torsoAspectFit * 0.7 + largeEnough * 0.3));
  }

  return 0.5;
}

function tilePositionForBox(product, info, box) {
  if (!isLikelyScreenshot(product, info)) return null;
  const rows = Math.max(1, Math.min(4, Math.round(info.height / 310)));
  const left = Math.round(info.width * IGNORE_LEFT_RATIO);
  const right = Math.round(info.width * 0.965);
  const gridWidth = Math.max(1, right - left);
  const centerX = box.left + box.width / 2;
  const centerY = box.top + box.height / 2;
  if (centerX < left || centerX > right) return null;
  return {
    row: Math.max(0, Math.min(rows - 1, Math.floor(centerY / (info.height / rows)))),
    column: Math.max(0, Math.min(TILE_COLUMNS - 1, Math.floor((centerX - left) / (gridWidth / TILE_COLUMNS)))),
  };
}

function pieceTileRoleScore(piece, tilePosition) {
  if (!tilePosition) return 0.55;
  const kind = pieceKind(piece);
  const cell = `${tilePosition.row}:${tilePosition.column}`;

  if (kind === "shoe") {
    if (cell === "0:0") return 1;
    if (tilePosition.row === 0) return 0.48;
    return 0.18;
  }

  if (kind === "accessory") {
    if (cell === "1:2") return 1;
    if (tilePosition.column === 2) return 0.7;
    return 0.28;
  }

  if (kind === "outerwear") {
    if (cell === "1:1") return 1;
    if (cell === "0:1") return 0.88;
    if (cell === "1:0") return 0.62;
    return 0.38;
  }

  if (kind === "top") {
    if (cell === "1:0") return 1;
    if (cell === "0:2") return 0.88;
    if (cell === "0:1") return 0.8;
    return 0.42;
  }

  if (kind === "bottom") {
    if (cell === "1:1") return 0.82;
    if (cell === "1:0") return 0.66;
    if (cell === "0:1") return 0.52;
    return 0.34;
  }

  return 0.55;
}

function scoreCandidate(product, stats, options = {}) {
  const areaScore = Math.min(1, Math.sqrt(stats.contentPixels / 36000));
  const pieceScore = pieceShapeScore(product.piece, stats);
  const tileRoleScore = options.tileRoleScore ?? 0.55;
  const sourceBoost = options.sourceBoost || 0;
  const score =
    stats.paletteScore * PALETTE_WEIGHT +
    pieceScore * PIECE_WEIGHT +
    areaScore * AREA_WEIGHT +
    tileRoleScore * TILE_ROLE_WEIGHT +
    sourceBoost;
  return {
    areaScore,
    pieceScore,
    tileRoleScore,
    score: Math.max(0, Math.min(1, score)),
  };
}

function isValidCandidate(stats) {
  if (!stats.contentBox) return false;
  if (stats.contentPixels < MIN_CONTENT_PIXELS) return false;
  if (stats.contentBox.width < MIN_CONTENT_BOX || stats.contentBox.height < MIN_CONTENT_BOX) return false;
  if (stats.contentRatio < 0.015) return false;
  return true;
}

function boxOverlapRatio(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  const overlapWidth = Math.max(0, right - left);
  const overlapHeight = Math.max(0, bottom - top);
  const overlapArea = overlapWidth * overlapHeight;
  if (!overlapArea) return 0;
  const smallerArea = Math.min(a.width * a.height, b.width * b.height);
  return overlapArea / Math.max(1, smallerArea);
}

function isSimilarCropPosition(candidate, usedBoxes) {
  return usedBoxes.some((box) => boxOverlapRatio(candidate.cropBox, box) > 0.62);
}

function makeCandidate(product, raw, palette, sourceHash, baseBox, type, index) {
  const stats = contentStats(raw, palette, baseBox);
  if (!isValidCandidate(stats)) return null;

  const padding = type === "tile" ? 28 : 34;
  const cropBox = expandBox(stats.contentBox, raw.info, padding);
  const tilePosition = tilePositionForBox(product, raw.info, cropBox);
  const tileRoleScore = pieceTileRoleScore(product.piece, tilePosition);
  const scored = scoreCandidate(product, stats, {
    tileRoleScore,
    sourceBoost: type === "component" ? 0.055 : -0.02,
  });

  return {
    type,
    index,
    tilePosition,
    baseBox: clampBox(baseBox, raw.info),
    cropBox,
    contentBox: stats.contentBox,
    contentPixels: stats.contentPixels,
    contentRatio: Number(stats.contentRatio.toFixed(4)),
    aspect: Number(stats.aspect.toFixed(3)),
    paletteScore: Number(stats.paletteScore.toFixed(3)),
    pieceScore: Number(scored.pieceScore.toFixed(3)),
    tileRoleScore: Number(scored.tileRoleScore.toFixed(3)),
    areaScore: Number(scored.areaScore.toFixed(3)),
    score: Number(scored.score.toFixed(3)),
    signature: `${sourceHash}:${cropBox.left}:${cropBox.top}:${cropBox.width}:${cropBox.height}`,
    positionSignature: `${Math.round((cropBox.left + cropBox.width / 2) / 34)}:${Math.round((cropBox.top + cropBox.height / 2) / 34)}:${Math.round(cropBox.width / 34)}:${Math.round(cropBox.height / 34)}`,
  };
}

function tileBoxes(product, info) {
  if (!isLikelyScreenshot(product, info)) {
    return [{ left: 0, top: 0, width: info.width, height: info.height }];
  }

  const rows = Math.max(1, Math.min(4, Math.round(info.height / 310)));
  const left = Math.round(info.width * IGNORE_LEFT_RATIO);
  const right = Math.round(info.width * 0.965);
  const gridWidth = Math.max(1, right - left);
  const rowHeight = info.height / rows;
  const columnWidth = gridWidth / TILE_COLUMNS;
  const boxes = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < TILE_COLUMNS; column += 1) {
      const box = {
        left: left + columnWidth * column + columnWidth * 0.04,
        top: rowHeight * row + rowHeight * 0.06,
        width: columnWidth * 0.92,
        height: rowHeight * 0.66,
      };
      boxes.push(clampBox(box, info));
    }
  }

  return boxes;
}

function componentBoxes(raw, product) {
  const { data, info } = raw;
  const channelCount = info.channels;
  const total = info.width * info.height;
  const mask = new Uint8Array(total);
  const queue = new Int32Array(total);
  const leftLimit = isLikelyScreenshot(product, info) ? Math.round(info.width * IGNORE_LEFT_RATIO) : 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = leftLimit; x < info.width; x += 1) {
      const index = y * info.width + x;
      const dataIndex = index * channelCount;
      const r = data[dataIndex];
      const g = data[dataIndex + 1];
      const b = data[dataIndex + 2];
      if (!isNearWhite(r, g, b)) mask[index] = 1;
    }
  }

  const components = [];
  for (let start = 0; start < total; start += 1) {
    if (!mask[start]) continue;

    let head = 0;
    let tail = 0;
    let area = 0;
    let minX = info.width;
    let minY = info.height;
    let maxX = 0;
    let maxY = 0;

    mask[start] = 0;
    queue[tail] = start;
    tail += 1;

    while (head < tail) {
      const current = queue[head];
      head += 1;
      area += 1;

      const x = current % info.width;
      const y = Math.floor(current / info.width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const neighbours = [current - 1, current + 1, current - info.width, current + info.width];
      for (const next of neighbours) {
        if (next < 0 || next >= total || !mask[next]) continue;
        const nx = next % info.width;
        if (Math.abs(nx - x) > 1) continue;
        mask[next] = 0;
        queue[tail] = next;
        tail += 1;
      }
    }

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    if (area < MIN_CONTENT_PIXELS || width < MIN_CONTENT_BOX || height < MIN_CONTENT_BOX) continue;
    components.push({ left: minX, top: minY, width, height, area });
  }

  return components
    .sort((a, b) => b.area - a.area)
    .slice(0, 18)
    .map((component) => clampBox(component, info));
}

async function loadProductImage(product) {
  if (product.localImagePath) {
    const localPath = resolveProjectPath(product.localImagePath);
    if (await fileExists(localPath)) {
      return {
        buffer: await fs.readFile(localPath),
        sourcePath: portablePath(path.relative(PROJECT_ROOT, localPath)),
        source: "local",
      };
    }
  }

  if (!ALLOW_REMOTE_IMAGES || !product.imageUrl) return null;

  const response = await fetch(product.imageUrl, {
    headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/*" },
  });
  if (!response.ok) throw new Error(`remote image failed with ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`remote image returned ${contentType || "non-image"}`);
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    sourcePath: product.imageUrl,
    source: "remote",
  };
}

async function rawImage(buffer) {
  const image = sharp(buffer).rotate().flatten({ background: CARD_BACKGROUND }).removeAlpha();
  return image.raw().toBuffer({ resolveWithObject: true });
}

async function candidatesForProduct(product, palette, image) {
  const raw = await rawImage(image.buffer);
  const paletteRgb = palette.map(hexToRgb).filter(Boolean);
  const sourceHash = hashBuffer(image.buffer);
  const candidates = [];
  let index = 0;

  for (const box of tileBoxes(product, raw.info)) {
    const candidate = makeCandidate(product, raw, paletteRgb, sourceHash, box, "tile", index);
    if (candidate) candidates.push(candidate);
    index += 1;
  }

  for (const box of componentBoxes(raw, product)) {
    const candidate = makeCandidate(product, raw, paletteRgb, sourceHash, box, "component", index);
    if (candidate) candidates.push(candidate);
    index += 1;
  }

  const unique = new Map();
  for (const candidate of candidates) {
    const existing = unique.get(candidate.signature);
    if (!existing || candidate.score > existing.score) unique.set(candidate.signature, candidate);
  }

  return [...unique.values()].sort((a, b) => b.score - a.score);
}

function cleanProductTitle(product) {
  const season = String(product.season || "").trim();
  const occasion = String(product.occasion || "").trim();
  return String(product.productName || product.piece || "Product")
    .replace(/\s+search results$/i, "")
    .replace(new RegExp(`\\s+${season.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "")
    .replace(new RegExp(`\\s+${occasion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapText(value, maxChars, maxLines = 2) {
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
  return lines;
}

function swatchSvg(palette, x, y) {
  return palette
    .slice(0, 6)
    .map(
      (color, index) =>
        `<rect x="${x + index * 46}" y="${y}" width="34" height="34" rx="11" fill="${escapeXml(color)}" stroke="rgba(34,31,26,0.18)" />`,
    )
    .join("");
}

function boardSlots(count) {
  const gap = 34;
  const margin = 70;
  const top = INCLUDE_LABELS ? 245 : 180;
  const cardWidth = Math.floor((BOARD_WIDTH - margin * 2 - gap) / 2);
  const cardHeight = INCLUDE_LABELS ? 520 : 590;
  const slots = [
    { left: margin, top, width: cardWidth, height: cardHeight },
    { left: margin + cardWidth + gap, top, width: cardWidth, height: cardHeight },
    { left: margin, top: top + cardHeight + gap, width: cardWidth, height: cardHeight },
    { left: margin + cardWidth + gap, top: top + cardHeight + gap, width: cardWidth, height: cardHeight },
  ];

  if (count === 1) {
    return [{ left: 180, top: top + 120, width: BOARD_WIDTH - 360, height: 760 }];
  }

  if (count === 3) {
    return [
      slots[0],
      slots[1],
      { left: Math.round((BOARD_WIDTH - cardWidth) / 2), top: top + cardHeight + gap, width: cardWidth, height: cardHeight },
    ];
  }

  return slots.slice(0, count);
}

function boardBackgroundSvg(combination, entries) {
  const title = `${combination.season} / ${combination.look}`;
  const labelSvg = INCLUDE_LABELS
    ? `
      <text x="70" y="86" fill="#26231f" font-size="26" font-weight="900" letter-spacing="4">IC_WEARABLES PRODUCT COMBO</text>
      <text x="70" y="144" fill="#26231f" font-size="54" font-weight="950">${escapeXml(title)}</text>
      <text x="70" y="188" fill="rgba(38,35,31,0.62)" font-size="22" font-weight="750">Palette-aware crops. Use this as Image 2 with the scanned face as Image 1.</text>
    `
    : "";

  const slots = boardSlots(entries.length);
  const cards = slots
    .map((slot, index) => {
      const entry = entries[index];
      const text = INCLUDE_LABELS
        ? wrapText(`${entry.product.piece}: ${cleanProductTitle(entry.product)}`, 36, 2)
            .map(
              (line, lineIndex) =>
                `<text x="${slot.left + 24}" y="${slot.top + slot.height - 50 + lineIndex * 24}" fill="rgba(38,35,31,0.72)" font-size="18" font-weight="760">${escapeXml(line)}</text>`,
            )
            .join("")
        : "";
      return `
        <rect x="${slot.left}" y="${slot.top}" width="${slot.width}" height="${slot.height}" rx="34" fill="${CARD_BACKGROUND}" stroke="rgba(38,35,31,0.10)" />
        ${text}
      `;
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${BOARD_WIDTH}" height="${BOARD_HEIGHT}" viewBox="0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}">
      <defs>
        <radialGradient id="glow" cx="0.18" cy="0.05" r="0.92">
          <stop offset="0" stop-color="${escapeXml(combination.palette[0] || "#e0b665")}" stop-opacity="0.28"/>
          <stop offset="0.55" stop-color="${escapeXml(combination.palette[2] || "#ffffff")}" stop-opacity="0.12"/>
          <stop offset="1" stop-color="${BOARD_BACKGROUND}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${BOARD_WIDTH}" height="${BOARD_HEIGHT}" fill="${BOARD_BACKGROUND}" />
      <rect width="${BOARD_WIDTH}" height="${BOARD_HEIGHT}" fill="url(#glow)" />
      ${labelSvg}
      ${swatchSvg(combination.palette, 70, INCLUDE_LABELS ? 206 : 72)}
      ${cards}
    </svg>
  `;
}

async function writeCrop(entry, combination, index) {
  const cropDir = path.join(OUTPUT_DIR, "crops", slug(combination.season), slug(combination.look));
  const cropPath = path.join(cropDir, `${String(index + 1).padStart(2, "0")}__${slug(entry.product.piece || "piece")}.png`);
  await fs.mkdir(resolveProjectPath(cropDir), { recursive: true });
  await sharp(entry.image.buffer)
    .extract(entry.candidate.cropBox)
    .flatten({ background: CARD_BACKGROUND })
    .resize(560, 560, { fit: "contain", background: CARD_BACKGROUND, withoutEnlargement: true })
    .png()
    .toFile(resolveProjectPath(cropPath));
  return portablePath(cropPath);
}

async function cropBuffer(entry, slot) {
  const imageHeight = INCLUDE_LABELS ? slot.height - 120 : slot.height - 54;
  return sharp(entry.image.buffer)
    .extract(entry.candidate.cropBox)
    .flatten({ background: CARD_BACKGROUND })
    .resize(slot.width - 54, imageHeight, { fit: "contain", background: CARD_BACKGROUND, withoutEnlargement: true })
    .png()
    .toBuffer();
}

async function writeBoard(combination, entries) {
  const boardDir = path.join(OUTPUT_DIR, "boards", GROUP_BY === "family" ? "families" : slug(combination.season));
  const boardPath = path.join(boardDir, `${slug(combination.season)}__${slug(combination.look)}.png`);
  await fs.mkdir(resolveProjectPath(boardDir), { recursive: true });

  const slots = boardSlots(entries.length);
  const composites = [];
  for (const [index, entry] of entries.entries()) {
    const slot = slots[index];
    composites.push({
      input: await cropBuffer(entry, slot),
      left: Math.round(slot.left + 27),
      top: Math.round(slot.top + 27),
    });
  }

  await sharp(Buffer.from(boardBackgroundSvg(combination, entries)))
    .composite(composites)
    .png()
    .toFile(resolveProjectPath(boardPath));

  return portablePath(boardPath);
}

function firstProductForPiece(products, piece) {
  const candidates = products.filter((product) => product.piece === piece);
  return (
    candidates.find((product) => !product.isFallback && product.localImagePath) ||
    candidates.find((product) => product.localImagePath) ||
    candidates.find((product) => !product.isFallback && product.imageUrl) ||
    candidates.find((product) => product.imageUrl) ||
    candidates[0] ||
    null
  );
}

function selectProducts(products) {
  const pieces = [...new Set(products.map((product) => product.piece).filter(Boolean))];
  return pieces
    .map((piece) => firstProductForPiece(products, piece))
    .filter(Boolean)
    .filter((product) => product.localImagePath || (ALLOW_REMOTE_IMAGES && product.imageUrl))
    .slice(0, MAX_PRODUCTS);
}

function groupProducts(products) {
  const groups = new Map();
  for (const product of products) {
    if (!product.season || !product.look) continue;
    if (!product.localImagePath && !(ALLOW_REMOTE_IMAGES && product.imageUrl)) continue;
    const family = seasonFamily(product.season);
    const groupSeason = GROUP_BY === "family" ? family : product.season;
    const key = `${GROUP_BY === "family" ? "family" : "season"}::${family}::${groupSeason}::${product.look}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  }
  return groups;
}

async function selectCrops(combination, products) {
  const used = new Set();
  const usedPositions = new Map();
  const usedBoxes = [];
  const entries = [];
  for (const product of products) {
    const image = await loadProductImage(product);
    if (!image) continue;
    const candidates = await candidatesForProduct(product, combination.palette, image);
    if (!candidates.length) continue;

    let candidate = candidates.find(
      (item) => !used.has(item.signature) && !usedPositions.has(item.positionSignature) && !isSimilarCropPosition(item, usedBoxes),
    );
    if (!candidate) candidate = candidates.find((item) => !used.has(item.signature));
    if (!candidate) candidate = candidates.find((item) => !usedPositions.has(item.positionSignature));
    if (!candidate) candidate = candidates[0];
    used.add(candidate.signature);
    usedPositions.set(candidate.positionSignature, product.piece || "piece");
    usedBoxes.push(candidate.cropBox);
    entries.push({ product, image, candidate });
  }
  return entries;
}

async function main() {
  const inputPath = resolveProjectPath(INPUT_PATH);
  const library = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const products = Array.isArray(library.products) ? library.products : [];
  const combinations = [];

  for (const [key, group] of groupProducts(products)) {
    const [, family, season, look] = key.split("::");
    const selectedProducts = selectProducts(group);
    if (!selectedProducts.length) continue;

    const palette = paletteForGroup(selectedProducts[0], family);
    const combination = {
      id: `${slug(GROUP_BY)}__${slug(season)}__${slug(look)}`,
      mode: GROUP_BY,
      seasonFamily: family,
      season,
      look,
      palette,
    };
    const entries = await selectCrops(combination, selectedProducts);
    if (!entries.length) continue;

    for (const [index, entry] of entries.entries()) {
      if (WRITE_CROPS) entry.cropImage = await writeCrop(entry, combination, index);
    }

    const boardImage = await writeBoard(combination, entries);
    combinations.push({
      ...combination,
      boardImage,
      productCount: selectedProducts.length,
      cropCount: entries.length,
      products: entries.map((entry) => ({
        piece: entry.product.piece,
        productName: entry.product.productName,
        brand: entry.product.brand,
        price: entry.product.price,
        affiliateLink: entry.product.affiliateLink,
        sourceImage: entry.image.sourcePath,
        cropImage: entry.cropImage || "",
        crop: entry.candidate.cropBox,
        cropScore: entry.candidate.score,
        paletteScore: entry.candidate.paletteScore,
        pieceScore: entry.candidate.pieceScore,
        candidateType: entry.candidate.type,
        isFallback: Boolean(entry.product.isFallback),
      })),
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceLibrary: portablePath(path.relative(PROJECT_ROOT, inputPath)),
    outputDir: portablePath(path.relative(PROJECT_ROOT, resolveProjectPath(OUTPUT_DIR))),
    summary: {
      combinations: combinations.length,
      totalCrops: combinations.reduce((total, combination) => total + combination.cropCount, 0),
      seasons: [...new Set(combinations.map((combination) => combination.season))].length,
      looks: [...new Set(combinations.map((combination) => combination.look))].length,
    },
    usageNote:
      "Use each board as Image 2. Image 1 should be the scanned face. The board is only a cropped product/outfit reference selected by palette fit and product-piece shape.",
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
