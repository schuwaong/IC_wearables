import sharp from "sharp";

export const config = {
  maxDuration: 30,
};

const MAX_UPLOAD_BYTES = Number(process.env.COLOUR_PROFILE_MAX_UPLOAD_BYTES || 9 * 1024 * 1024);
const ANALYSIS_SIZE = 180;
const MIN_SKIN_SAMPLES_FOR_FACE = 24;
const MIN_SKIN_RATIO_FOR_FALLBACK = 0.04;
const WHITE_BALANCE_STRENGTH = 0.68;

const seasonProfiles = [
  {
    name: "Light Spring",
    axes: { temperature: 0.65, value: -0.78, chroma: 0.42, contrast: -0.35 },
    palette: ["#f8e7b8", "#f5bc6b", "#ff9d89", "#91d2bd", "#83abd7", "#fff4dc"],
    wardrobe: "light warm neutrals, honey beige, pale turquoise, peach, warm ivory",
  },
  {
    name: "True Spring",
    axes: { temperature: 1, value: -0.22, chroma: 0.78, contrast: 0 },
    palette: ["#ffd166", "#ff8c69", "#36b37e", "#41c7c7", "#fff2c2", "#d98c28"],
    wardrobe: "clear warm colours, golden tan, fresh teal, coral, warm cream",
  },
  {
    name: "Bright Spring",
    axes: { temperature: 0.35, value: -0.02, chroma: 1, contrast: 0.72 },
    palette: ["#ff4f8b", "#00b8a9", "#ffe066", "#2f80ed", "#111827", "#fff7ef"],
    wardrobe: "bright clean accents, blackened navy, crisp ivory, vivid teal, clear pink-red",
  },
  {
    name: "Light Summer",
    axes: { temperature: -0.42, value: -0.78, chroma: -0.2, contrast: -0.45 },
    palette: ["#c7d8ed", "#e8c6d0", "#d8d6ec", "#edf1f3", "#9fb6c8", "#b9d8cf"],
    wardrobe: "cool pale blues, mist grey, dusty rose, soft white, washed denim",
  },
  {
    name: "True Summer",
    axes: { temperature: -1, value: -0.24, chroma: -0.55, contrast: -0.15 },
    palette: ["#7f95ad", "#c9a7b7", "#6b778d", "#e6e9ed", "#8d6f8b", "#b7c7d9"],
    wardrobe: "blue-grey, slate, cool rose, soft navy, brushed silver",
  },
  {
    name: "Soft Summer",
    axes: { temperature: -0.38, value: -0.08, chroma: -1, contrast: -0.58 },
    palette: ["#8fa4a8", "#c6b2bd", "#747d8c", "#dcd8d5", "#9c8796", "#a7b39f"],
    wardrobe: "muted cool neutrals, dusty sage, taupe, soft denim, pewter",
  },
  {
    name: "Soft Autumn",
    axes: { temperature: 0.38, value: 0.08, chroma: -1, contrast: -0.48 },
    palette: ["#8b5e3c", "#c28057", "#6f7557", "#d6b073", "#f1dcc0", "#154f5b"],
    wardrobe: "muted olive, camel, warm taupe, deep teal, brushed gold",
  },
  {
    name: "True Autumn",
    axes: { temperature: 1, value: 0.36, chroma: -0.42, contrast: 0.08 },
    palette: ["#7a4a28", "#b85c38", "#6b7a3b", "#c59b42", "#2f5d50", "#efd8ac"],
    wardrobe: "rich earth tones, tobacco brown, forest, burnt orange, antique gold",
  },
  {
    name: "Dark Autumn",
    axes: { temperature: 0.48, value: 0.86, chroma: -0.1, contrast: 0.45 },
    palette: ["#2a1f1a", "#5a3a21", "#8a3f2d", "#174c49", "#b98233", "#dfc39b"],
    wardrobe: "espresso, deep olive, dark teal, oxblood, warm metal accents",
  },
  {
    name: "Dark Winter",
    axes: { temperature: -0.5, value: 0.88, chroma: 0.25, contrast: 0.72 },
    palette: ["#111827", "#f7f8fb", "#0f5b76", "#8f1d3f", "#4b5563", "#0b3b3e"],
    wardrobe: "black, optic white, deep burgundy, petrol blue, cool charcoal",
  },
  {
    name: "True Winter",
    axes: { temperature: -1, value: 0.34, chroma: 0.68, contrast: 1 },
    palette: ["#050505", "#ffffff", "#0b5fff", "#c1121f", "#008f7a", "#7b2cbf"],
    wardrobe: "black, white, crisp blue, clean red, silver, sharp contrast",
  },
  {
    name: "Bright Winter",
    axes: { temperature: -0.35, value: 0.15, chroma: 1, contrast: 0.95 },
    palette: ["#09090b", "#ffffff", "#ff006e", "#00c2ff", "#6dff8f", "#ffdd00"],
    wardrobe: "electric accents, black and white, icy blue, vivid fuchsia, clean green",
  },
];

function clamp(value, min = -1, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function clampChannel(value) {
  return Math.round(Math.max(0, Math.min(255, value)));
}

function axisLabel(axis, value) {
  if (axis === "temperature") return value > 0.2 ? "warm" : value < -0.2 ? "cool" : "neutral";
  if (axis === "value") return value > 0.28 ? "deep" : value < -0.28 ? "light" : "medium-depth";
  if (axis === "chroma") return value > 0.25 ? "bright" : value < -0.25 ? "soft" : "moderate-chroma";
  if (axis === "contrast") return value > 0.25 ? "high-contrast" : value < -0.25 ? "low-contrast" : "medium-contrast";
  return "balanced";
}

function pixelStats(r, g, b) {
  return {
    luma: 0.2126 * r + 0.7152 * g + 0.0722 * b,
    range: Math.max(r, g, b) - Math.min(r, g, b),
    cb: 128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    cr: 128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
  };
}

function applyRgbGains(r, g, b, gains) {
  return {
    r: clampChannel(r * gains.r),
    g: clampChannel(g * gains.g),
    b: clampChannel(b * gains.b),
  };
}

function pixelAt(pixels, x, y, size) {
  const index = (y * size + x) * 4;
  return {
    r: pixels[index],
    g: pixels[index + 1],
    b: pixels[index + 2],
    alpha: pixels[index + 3],
  };
}

function estimateWhiteBalanceGains(pixels, size) {
  const neutralSamples = [];

  for (let y = 0; y < size; y += 4) {
    for (let x = 0; x < size; x += 4) {
      const isBorderReference = x < size * 0.18 || x > size * 0.82 || y < size * 0.14 || y > size * 0.9;
      if (!isBorderReference) continue;

      const { r, g, b, alpha } = pixelAt(pixels, x, y, size);
      if (alpha < 200) continue;

      const stats = pixelStats(r, g, b);
      if (stats.luma < 78 || stats.luma > 238) continue;
      if (stats.range > 105) continue;
      neutralSamples.push({ r, g, b });
    }
  }

  if (neutralSamples.length < 80) {
    return {
      applied: false,
      sampleCount: neutralSamples.length,
      gains: { r: 1, g: 1, b: 1 },
      note: "No stable neutral background reference was found.",
    };
  }

  const avg = {
    r: neutralSamples.reduce((sum, pixel) => sum + pixel.r, 0) / neutralSamples.length,
    g: neutralSamples.reduce((sum, pixel) => sum + pixel.g, 0) / neutralSamples.length,
    b: neutralSamples.reduce((sum, pixel) => sum + pixel.b, 0) / neutralSamples.length,
  };
  const target = (avg.r + avg.g + avg.b) / 3;
  const rawGains = {
    r: target / Math.max(avg.r, 1),
    g: target / Math.max(avg.g, 1),
    b: target / Math.max(avg.b, 1),
  };

  return {
    applied: true,
    sampleCount: neutralSamples.length,
    referenceAverage: avg,
    gains: {
      r: clamp(1 + (rawGains.r - 1) * WHITE_BALANCE_STRENGTH, 0.78, 1.22),
      g: clamp(1 + (rawGains.g - 1) * WHITE_BALANCE_STRENGTH, 0.78, 1.22),
      b: clamp(1 + (rawGains.b - 1) * WHITE_BALANCE_STRENGTH, 0.78, 1.22),
    },
    note: "Applied conservative white-balance correction from neutral border/background pixels.",
  };
}

function isSkinTonePixel(r, g, b, stats) {
  if (stats.luma < 35 || stats.luma > 245) return false;
  if (stats.cb < 72 || stats.cb > 146) return false;
  if (stats.cr < 118 || stats.cr > 186) return false;

  const rgRatio = r / Math.max(g, 1);
  const bgRatio = b / Math.max(g, 1);
  if (rgRatio < 0.72 || rgRatio > 1.65) return false;
  if (bgRatio < 0.45 || bgRatio > 1.38) return false;

  return stats.range <= 145;
}

function seasonalFamilyAdjustment(profileName, axes) {
  let adjustment = 0;

  if (axes.temperature <= 0.08 && axes.chroma < -0.2 && axes.contrast < 0.48 && axes.value < 0.36) {
    if (profileName.includes("Summer")) adjustment += 14;
    if (profileName.includes("Autumn")) adjustment -= 7;
  }

  if (axes.temperature <= -0.18 && axes.contrast > 0.5) {
    if (profileName.includes("Winter")) adjustment += 9;
    if (profileName.includes("Autumn")) adjustment -= 5;
  }

  if (axes.temperature >= 0.18 && axes.value < 0.28 && axes.contrast < 0.44) {
    if (profileName.includes("Spring")) adjustment += 16;
    if (profileName.includes("Autumn")) adjustment -= 10;
  }

  if (axes.temperature >= 0.24 && axes.value >= 0.28 && axes.contrast >= 0.36) {
    if (profileName.includes("Autumn")) adjustment += 6;
    if (profileName.includes("Spring") && axes.chroma < 0.15) adjustment -= 4;
  }

  return adjustment;
}

function scoreSeasons(axes) {
  const weights = { temperature: 1.25, value: 0.85, chroma: 1.05, contrast: 0.82 };
  return seasonProfiles
    .map((profile) => {
      const distance = Object.entries(weights).reduce((sum, [axis, weight]) => {
        return sum + weight * (axes[axis] - profile.axes[axis]) ** 2;
      }, 0);
      return {
        ...profile,
        score: Math.max(
          0,
          Math.round((100 - Math.sqrt(distance) * 37 + seasonalFamilyAdjustment(profile.name, axes)) * 10) / 10,
        ),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function buildDecisionExplanation(result) {
  const axes = result.axes;
  const top = result.profile;
  const runnerUp = result.ranked?.[1];
  const sampling = result.sampling || {};
  const appearance = result.appearance || {};
  const whiteBalance = sampling.whiteBalance || {};
  const signals = [
    `${axisLabel("temperature", axes.temperature)} undertone (${axes.temperature >= 0 ? "+" : ""}${axes.temperature.toFixed(2)})`,
    `${axisLabel("value", axes.value)} value (${axes.value >= 0 ? "+" : ""}${axes.value.toFixed(2)})`,
    `${axisLabel("chroma", axes.chroma)} chroma (${axes.chroma >= 0 ? "+" : ""}${axes.chroma.toFixed(2)})`,
    `${axisLabel("contrast", axes.contrast)} contrast (${axes.contrast >= 0 ? "+" : ""}${axes.contrast.toFixed(2)})`,
  ];
  const runnerText = runnerUp ? ` The next closest season was ${runnerUp.name} at ${Math.round(runnerUp.score)}%.` : "";
  const count = result.sampleCount || result.count || 0;

  return `${top.name} was selected because the face sample measured ${signals.join(", ")}. The closest profile match scored ${Math.round(
    top.score || 0,
  )}%.${runnerText} The scan used ${count} weighted pixels from a ${
    sampling.method || "central face oval"
  } and rejected ${sampling.rejectedNonSkinPixels || 0} non-skin/background-like pixels. It also used ${
    appearance.hairSampleCount || 0
  } hair/eyebrow-region pixels for appearance contrast${whiteBalance.applied ? " after white-balance correction" : ""}.`;
}

async function pixelsFromImageBytes(imageBytes) {
  const { data, info } = await sharp(imageBytes, { failOn: "none" })
    .rotate()
    .resize(ANALYSIS_SIZE, ANALYSIS_SIZE, { fit: "cover", position: "centre" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== ANALYSIS_SIZE || info.height !== ANALYSIS_SIZE || info.channels !== 4) {
    throw new Error("Could not prepare image pixels for analysis.");
  }

  return data;
}

function sampleFacePixels(pixels, size = ANALYSIS_SIZE) {
  const whiteBalance = estimateWhiteBalanceGains(pixels, size);
  const gains = whiteBalance.gains;
  let samples = [];
  const skinSamples = [];
  const fallbackSamples = [];
  const centerX = size / 2;
  const centerY = size * 0.43;
  const radiusX = size * 0.23;
  const radiusY = size * 0.3;
  let rejectedNonSkin = 0;
  let rejectedExposure = 0;

  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const normalized = ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2;
      if (normalized > 1) continue;

      const { r, g, b, alpha } = pixelAt(pixels, x, y, size);
      if (alpha < 200) continue;

      const corrected = applyRgbGains(r, g, b, gains);
      const stats = pixelStats(corrected.r, corrected.g, corrected.b);
      if (stats.luma < 35 || stats.luma > 245) {
        rejectedExposure += 1;
        continue;
      }

      const sample = {
        r: corrected.r,
        g: corrected.g,
        b: corrected.b,
        luma: stats.luma,
        range: stats.range,
        weight: 1 - normalized * 0.55,
      };
      fallbackSamples.push(sample);

      if (isSkinTonePixel(corrected.r, corrected.g, corrected.b, stats)) {
        skinSamples.push(sample);
      } else {
        rejectedNonSkin += 1;
      }
    }
  }

  const usedSkinMask = skinSamples.length >= MIN_SKIN_SAMPLES_FOR_FACE;
  const fallbackSkinRatio = fallbackSamples.length ? skinSamples.length / fallbackSamples.length : 0;
  const noFaceDetected =
    !usedSkinMask &&
    (skinSamples.length < MIN_SKIN_SAMPLES_FOR_FACE || fallbackSkinRatio < MIN_SKIN_RATIO_FOR_FALLBACK);

  if (noFaceDetected) {
    const error = new Error("No face detected. Upload a clear front-facing face photo.");
    error.status = 422;
    throw error;
  }

  samples = usedSkinMask ? skinSamples : fallbackSamples;
  if (!samples.length) {
    const error = new Error("Could not sample enough face pixels. Try a clearer front-facing photo.");
    error.status = 422;
    throw error;
  }

  const count = samples.length;
  const totalWeight = samples.reduce((sum, pixel) => sum + pixel.weight, 0);
  const avg = {
    r: samples.reduce((sum, pixel) => sum + pixel.r * pixel.weight, 0) / totalWeight,
    g: samples.reduce((sum, pixel) => sum + pixel.g * pixel.weight, 0) / totalWeight,
    b: samples.reduce((sum, pixel) => sum + pixel.b * pixel.weight, 0) / totalWeight,
    luma: samples.reduce((sum, pixel) => sum + pixel.luma * pixel.weight, 0) / totalWeight,
    saturation: samples.reduce((sum, pixel) => sum + pixel.range * pixel.weight, 0) / totalWeight / 255,
  };
  const variance = samples.reduce((sum, pixel) => sum + pixel.weight * (pixel.luma - avg.luma) ** 2, 0) / totalWeight;
  const lumaStd = Math.sqrt(variance);

  const hairSamples = [];
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const normalized = ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2;
      if (normalized <= 1.08) continue;

      const inHairZone = y < size * 0.39 || (Math.abs(x - centerX) > radiusX * 0.95 && y < size * 0.76);
      if (!inHairZone) continue;

      const { r, g, b, alpha } = pixelAt(pixels, x, y, size);
      if (alpha < 200) continue;

      const corrected = applyRgbGains(r, g, b, gains);
      const stats = pixelStats(corrected.r, corrected.g, corrected.b);
      if (stats.luma > avg.luma - 14 && stats.luma > 118) continue;
      if (stats.luma < 8 || stats.luma > 190) continue;
      if (isSkinTonePixel(corrected.r, corrected.g, corrected.b, stats)) continue;

      hairSamples.push({
        r: corrected.r,
        g: corrected.g,
        b: corrected.b,
        luma: stats.luma,
        range: stats.range,
        weight: 1,
      });
    }
  }

  const hairTotalWeight = hairSamples.reduce((sum, pixel) => sum + pixel.weight, 0);
  const hairAvg = hairTotalWeight
    ? {
        r: hairSamples.reduce((sum, pixel) => sum + pixel.r * pixel.weight, 0) / hairTotalWeight,
        g: hairSamples.reduce((sum, pixel) => sum + pixel.g * pixel.weight, 0) / hairTotalWeight,
        b: hairSamples.reduce((sum, pixel) => sum + pixel.b * pixel.weight, 0) / hairTotalWeight,
        luma: hairSamples.reduce((sum, pixel) => sum + pixel.luma * pixel.weight, 0) / hairTotalWeight,
        saturation: hairSamples.reduce((sum, pixel) => sum + pixel.range * pixel.weight, 0) / hairTotalWeight / 255,
      }
    : null;

  const skinTemperature = clamp((avg.r - avg.b - 42) / 42);
  const skinValue = clamp((145 - avg.luma) / 85);
  const skinChroma = clamp((avg.saturation - 0.27) / 0.24);
  const localContrast = clamp((lumaStd - 34) / 28);
  const hairReliability = clamp(hairSamples.length / 650, 0, 1);
  const hairTemperature = hairAvg ? clamp((hairAvg.r - hairAvg.b - 12) / 52) : 0;
  const hairValue = hairAvg ? clamp((138 - hairAvg.luma) / 96) : skinValue;
  const rawAppearanceContrast = hairAvg ? clamp((avg.luma - hairAvg.luma - 34) / 72) : localContrast;
  const appearanceContrast = localContrast * (1 - hairReliability) + rawAppearanceContrast * hairReliability;
  const highContrastCoolBias =
    hairReliability > 0.55 && rawAppearanceContrast > 0.72 && hairTemperature < 0.12 ? -0.48 : 0;
  const hairValueWeight = 0.42 * hairReliability;

  return {
    count,
    sampleCount: count,
    axes: {
      temperature: clamp(skinTemperature * 0.82 + hairTemperature * 0.18 * hairReliability + highContrastCoolBias),
      value: clamp(skinValue * (1 - hairValueWeight) + hairValue * hairValueWeight),
      chroma: skinChroma,
      contrast: clamp(localContrast * 0.42 + appearanceContrast * 0.62),
    },
    average: avg,
    appearance: {
      hairSampleCount: hairSamples.length,
      hairAverage: hairAvg,
      hairReliability,
      skinTemperature,
      hairTemperature,
      appearanceContrast,
      rawAppearanceContrast,
      localContrast,
      highContrastCoolBias,
    },
    sampling: {
      method: "skin-masked central face oval",
      usedSkinMask,
      skinSampleCount: usedSkinMask ? skinSamples.length : 0,
      fallbackSampleCount: fallbackSamples.length,
      rejectedNonSkinPixels: rejectedNonSkin,
      rejectedExposurePixels: rejectedExposure,
      whiteBalance,
      note: usedSkinMask
        ? "Sampled skin-tone pixels, applied conservative white balance when possible, and blended hair/eyebrow contrast."
        : "Skin mask found too few pixels, so the scan used the central face oval fallback.",
    },
  };
}

async function analyzeImageBytes(imageBytes) {
  if (!imageBytes?.length) {
    const error = new Error("Missing imageDataUrl");
    error.status = 400;
    throw error;
  }
  if (imageBytes.length > MAX_UPLOAD_BYTES) {
    const error = new Error("Image is too large for this endpoint.");
    error.status = 413;
    throw error;
  }

  const sample = sampleFacePixels(await pixelsFromImageBytes(imageBytes));
  const ranked = scoreSeasons(sample.axes);
  const gap = Math.max(0, ranked[0].score - ranked[1].score);
  const confidence = Math.round(clamp(58 + gap * 1.4 + Math.min(sample.count / 120, 14), 45, 88));
  const result = {
    ...sample,
    source: "backend",
    ranked,
    profile: ranked[0],
    confidence,
  };
  result.explanation = buildDecisionExplanation(result);
  return result;
}

function parseBody(rawBody) {
  if (!rawBody) return {};
  if (typeof rawBody === "object") return rawBody;
  return JSON.parse(rawBody);
}

function imageBytesFromDataUrl(value) {
  const dataUrl = String(value || "");
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) {
    const error = new Error("imageDataUrl must be a base64 data URL.");
    error.status = 400;
    throw error;
  }

  if (!match[1].startsWith("image/")) {
    const error = new Error("imageDataUrl must contain an image.");
    error.status = 400;
    throw error;
  }

  return Buffer.from(match[2], "base64");
}

async function processRequest(rawBody) {
  const body = parseBody(rawBody);
  return analyzeImageBytes(imageBytesFromDataUrl(body.imageDataUrl || body.image));
}

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function jsonResponse(res, status, payload) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(payload);
}

function netlifyResponse(status, payload) {
  return {
    statusCode: status,
    headers: {
      "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return netlifyResponse(204, {});
  if (event.httpMethod !== "POST") return netlifyResponse(405, { error: "Method not allowed" });

  try {
    return netlifyResponse(200, await processRequest(event.body));
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    return netlifyResponse(status, {
      error: status === 500 ? "Could not analyse image." : error.message,
    });
  }
}

export default async function vercelHandler(req, res) {
  corsHeaders(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return jsonResponse(res, 405, { error: "Method not allowed" });

  try {
    return jsonResponse(res, 200, await processRequest(req.body));
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    return jsonResponse(res, status, {
      error: status === 500 ? "Could not analyse image." : error.message,
    });
  }
}
