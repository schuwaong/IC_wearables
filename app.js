const header = document.querySelector("[data-site-header]");
const form = document.querySelector("[data-waitlist-form]");
const formStatus = document.querySelector("[data-form-status]");
const progressLinks = [...document.querySelectorAll("[data-nav-section]")];
const sceneSections = [...document.querySelectorAll("[data-scene-section]")];
const faceUpload = document.getElementById("faceUpload");
const facePreview = document.getElementById("facePreview");
const faceDrop = document.querySelector(".face-drop");
const faceStatus = document.getElementById("faceStatus");
const faceSeasonResult = document.getElementById("faceSeasonResult");
const faceConfidence = document.getElementById("faceConfidence");
const faceSeasonReason = document.getElementById("faceSeasonReason");
const facePaletteSwatches = document.getElementById("facePaletteSwatches");
const seasonCandidates = document.getElementById("seasonCandidates");
const styleOccasionSelect = document.getElementById("styleOccasionSelect");
const styleBackgroundSelect = document.getElementById("styleBackgroundSelect");
const styleMoodSelect = document.getElementById("styleMoodSelect");
const styleFitSelect = document.getElementById("styleFitSelect");
const styleFrameSelect = document.getElementById("styleFrameSelect");
const styleBudgetSelect = document.getElementById("styleBudgetSelect");
const generatePhotoButton = document.getElementById("generatePhotoButton");
const generationStatus = document.getElementById("generationStatus");
const generatedStyleImage = document.getElementById("generatedStyleImage");
const femaleLooksGrid = document.getElementById("femaleLooksGrid");
const resultsSeason = document.getElementById("resultsSeason");
const resultsConfidence = document.getElementById("resultsConfidence");
const resultsPaletteSwatches = document.getElementById("resultsPaletteSwatches");
const resultsStatus = document.getElementById("resultsStatus");

const STYLE_RUN_STORAGE_KEY = "icWearablesFemaleStyleRun";
const pathName = window.location.pathname.toLowerCase();
const isFemalePath = pathName.includes("/female/");
const isFemaleResultsPage = Boolean(femaleLooksGrid);

let latestFaceResult = null;
let latestFaceDataUrl = "";
let latestFaceReferenceDataUrl = "";
const MIN_SKIN_SAMPLES_FOR_FACE = 24;
const MIN_SKIN_RATIO_FOR_FALLBACK = 0.04;
const WHITE_BALANCE_STRENGTH = 0.68;
const FACE_SCAN_READY_MESSAGE = "Face scan ready. Adjust the styling controls, then generate the look.";
const FACE_SCAN_READY_FEMALE_MESSAGE = "Face scan ready. Adjust the styling controls, then generate four outfit ideas.";
const FACE_SCAN_REQUIRED_MESSAGE = "Scan or upload a clear front-facing face photo first.";
const FACE_SCAN_ERROR_MESSAGE = "Face scan could not be completed. Upload a clear front-facing face photo and try again.";
const IMAGE_GENERATING_MESSAGE = "Generating look...";
const IMAGE_SUCCESS_MESSAGE = "Look generated. Adjust the controls to try another direction.";
const IMAGE_ERROR_MESSAGE = "Image generation is temporarily unavailable. Try again.";
const RESULTS_LIVE_MESSAGE = "Four generated looks are ready with live product links for each outfit piece.";
const RESULTS_PARTIAL_FALLBACK_MESSAGE =
  "Some live product links are unavailable right now. Showing shopping-search fallback links for the remaining pieces.";
const RESULTS_FALLBACK_MESSAGE =
  "Live product links are temporarily unavailable. Showing shopping-search fallback links. Refresh to retry.";
const RESULTS_UNCONFIGURED_MESSAGE =
  "Live product links are not connected on this site yet. Showing shopping-search fallback links until the backend endpoint is set.";
const RESULTS_SAMPLE_MESSAGE = "Showing sample looks. Run a new face scan for a personalised results set.";

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

const femaleOutfitIdeas = [
  {
    title: "Boardroom polish",
    tone: "tailored, intelligent, premium business styling",
    description: "A composed work look with the strongest colour closest to the face and clean vertical lines.",
    fallbackImage: "../assets/generated-results/female-look-boardroom.jpg",
    pieces: [
      { label: "Near-face blouse", search: "women silk satin blouse" },
      { label: "Tailored blazer", search: "women tailored blazer" },
      { label: "Wide-leg trouser", search: "women wide leg tailored trousers" },
      { label: "Leather pump or loafer", search: "women leather pumps loafers" },
    ],
  },
  {
    title: "City casual",
    tone: "relaxed city styling with elevated everyday textures",
    description: "A soft but intentional daytime outfit built around palette-safe layers and comfortable movement.",
    fallbackImage: "../assets/generated-results/female-look-city.jpg",
    pieces: [
      { label: "Fine knit top", search: "women fine knit top" },
      { label: "Cropped jacket", search: "women cropped jacket" },
      { label: "Straight denim or trouser", search: "women straight leg jeans trousers" },
      { label: "Clean sneaker", search: "women minimal leather sneakers" },
    ],
  },
  {
    title: "Evening edit",
    tone: "date night, elegant, face-brightening eveningwear",
    description: "A more striking look that keeps the colour story flattering under evening lighting.",
    fallbackImage: "../assets/generated-results/female-look-evening.jpg",
    pieces: [
      { label: "Statement top", search: "women evening top satin knit" },
      { label: "Midi skirt or dress", search: "women midi skirt dress" },
      { label: "Small shoulder bag", search: "women small shoulder bag" },
      { label: "Jewellery accent", search: "women earrings necklace" },
    ],
  },
  {
    title: "Travel capsule",
    tone: "comfortable, refined travel capsule with mixable pieces",
    description: "A practical outfit that photographs well and stays easy to repeat with nearby shopping options.",
    fallbackImage: "../assets/generated-results/female-look-travel.jpg",
    pieces: [
      { label: "Layering tank or tee", search: "women premium tank tee" },
      { label: "Soft outer layer", search: "women cardigan trench lightweight jacket" },
      { label: "Relaxed trouser", search: "women relaxed trousers" },
      { label: "Crossbody bag", search: "women crossbody bag" },
    ],
  },
];

function updateHeader() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 24);
}

function setActiveSection(sectionId) {
  progressLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.navSection === sectionId);
  });
}

function initProgressObserver() {
  if (!progressLinks.length || !sceneSections.length || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target?.id) {
        setActiveSection(visible.target.id);
      }
    },
    {
      rootMargin: "-30% 0px -45% 0px",
      threshold: [0.18, 0.32, 0.48],
    },
  );

  sceneSections.forEach((section) => observer.observe(section));
}

function initWaitlistForm() {
  if (!form || !formStatus) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim();
    const interest = String(data.get("interest") || "scan");

    if (!email) {
      formStatus.textContent = "Add an email to request access.";
      return;
    }

    const label = {
      demo: "live scan access",
      scan: "live scan access",
      beta: "private beta",
      partnership: "partnership",
    }[interest] || "private beta";

    formStatus.textContent = `Request noted for ${label}.`;
    form.reset();
  });
}

function clamp(value, min = -1, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function axisLabel(axis, value) {
  if (axis === "temperature") return value > 0.2 ? "warm" : value < -0.2 ? "cool" : "neutral";
  if (axis === "value") return value > 0.28 ? "deep" : value < -0.28 ? "light" : "medium-depth";
  if (axis === "chroma") return value > 0.25 ? "bright" : value < -0.25 ? "soft" : "moderate-chroma";
  if (axis === "contrast") return value > 0.25 ? "high-contrast" : value < -0.25 ? "low-contrast" : "medium-contrast";
  return "balanced";
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

function pixelStats(r, g, b) {
  return {
    luma: 0.2126 * r + 0.7152 * g + 0.0722 * b,
    range: Math.max(r, g, b) - Math.min(r, g, b),
    cb: 128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    cr: 128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
  };
}

function clampChannel(value) {
  return Math.round(Math.max(0, Math.min(255, value)));
}

function applyRgbGains(r, g, b, gains) {
  return {
    r: clampChannel(r * gains.r),
    g: clampChannel(g * gains.g),
    b: clampChannel(b * gains.b),
  };
}

function estimateWhiteBalanceGains(pixels, size) {
  const neutralSamples = [];

  for (let y = 0; y < size; y += 4) {
    for (let x = 0; x < size; x += 4) {
      const isBorderReference = x < size * 0.18 || x > size * 0.82 || y < size * 0.14 || y > size * 0.9;
      if (!isBorderReference) continue;

      const index = (y * size + x) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const alpha = pixels[index + 3];
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

function sampleFaceImage(image) {
  const size = 180;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = size;
  canvas.height = size;

  const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const dx = (size - drawWidth) / 2;
  const dy = (size - drawHeight) / 2;
  context.drawImage(image, dx, dy, drawWidth, drawHeight);

  const pixels = context.getImageData(0, 0, size, size).data;
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
      const index = (y * size + x) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const alpha = pixels[index + 3];
      if (alpha < 200) continue;
      const corrected = applyRgbGains(r, g, b, gains);
      const correctedR = corrected.r;
      const correctedG = corrected.g;
      const correctedB = corrected.b;
      const stats = pixelStats(correctedR, correctedG, correctedB);
      if (stats.luma < 35 || stats.luma > 245) {
        rejectedExposure += 1;
        continue;
      }
      const sample = {
        r: correctedR,
        g: correctedG,
        b: correctedB,
        luma: stats.luma,
        range: stats.range,
        weight: 1 - normalized * 0.55,
      };
      fallbackSamples.push(sample);
      if (isSkinTonePixel(correctedR, correctedG, correctedB, stats)) {
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
    throw new Error("No face detected. Upload a clear front-facing face photo.");
  }

  samples = usedSkinMask ? skinSamples : fallbackSamples;

  if (!samples.length) {
    throw new Error("Could not sample enough face pixels. Try a clearer front-facing photo.");
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

      const index = (y * size + x) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const alpha = pixels[index + 3];
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

function currentStyleSelections() {
  return {
    occasion: styleOccasionSelect?.value || "business",
    background: styleBackgroundSelect?.value || "premium boutique studio",
    mood: styleMoodSelect?.value || "quiet luxury",
    fit: styleFitSelect?.value || "balanced proportions",
    frame: styleFrameSelect?.value || "full body",
    budget: styleBudgetSelect?.value || "mid premium",
  };
}

function buildStyleImagePrompt(result) {
  const palette = result.profile.palette.join(", ");
  const axisSummary = [
    axisLabel("temperature", result.axes.temperature),
    axisLabel("value", result.axes.value),
    axisLabel("chroma", result.axes.chroma),
    axisLabel("contrast", result.axes.contrast),
  ].join(", ");
  const selections = currentStyleSelections();

  return [
    "High-end IC_wearables fashion editorial image.",
    `Occasion: ${selections.occasion}. Background: ${selections.background}.`,
    `Style mood: ${selections.mood}. Fit goal: ${selections.fit}. Budget direction: ${selections.budget}.`,
    `Image frame: ${selections.frame}, show a clear face and complete outfit proportions when full body is selected.`,
    `Colour profile: ${result.profile.name}. Palette hex colours for clothing, shoes, and accessories only: ${palette}.`,
    `Visual read: ${axisSummary}. Wardrobe direction: ${result.profile.wardrobe}.`,
    "Show a clear full face, premium textures, tailored outfit, clean realistic lighting, photorealistic skin texture, no text, no logos, no watermark.",
  ].join(" ");
}

function createBrowserResult(sample) {
  const ranked = scoreSeasons(sample.axes);
  const gap = Math.max(0, ranked[0].score - ranked[1].score);
  const confidence = Math.round(clamp(58 + gap * 1.4 + Math.min(sample.count / 120, 14), 45, 88));
  const result = {
    ...sample,
    source: "browser",
    ranked,
    profile: ranked[0],
    confidence,
  };
  result.explanation = buildDecisionExplanation(result);
  return result;
}

function renderFaceResult(result) {
  latestFaceResult = result;
  const topProfiles = result.ranked.slice(0, 3);
  const top = result.profile;
  faceSeasonResult.textContent = top.name;
  faceConfidence.textContent = `${result.confidence}%`;
  faceStatus.textContent = "Colour profile ready.";
  faceSeasonReason.textContent =
    result.explanation ||
    `${top.name} is the strongest match from sampled ${axisLabel("temperature", result.axes.temperature)}, ${axisLabel(
      "value",
      result.axes.value,
    )}, ${axisLabel("chroma", result.axes.chroma)}, and ${axisLabel(
      "contrast",
      result.axes.contrast,
    )} signals. Natural-light face photos improve accuracy.`;

  facePaletteSwatches.innerHTML = "";
  top.palette.forEach((color) => {
    const swatch = document.createElement("span");
    swatch.style.setProperty("--swatch", color);
    swatch.title = color;
    facePaletteSwatches.appendChild(swatch);
  });

  seasonCandidates.innerHTML = "";
  topProfiles.forEach((profile) => {
    const item = document.createElement("article");
    const label = document.createElement("span");
    const score = document.createElement("strong");
    label.textContent = profile.name;
    score.textContent = `${Math.round(profile.score)}%`;
    item.append(label, score);
    seasonCandidates.appendChild(item);
  });

  if (generationStatus) {
    generationStatus.textContent = isFemalePath
      ? FACE_SCAN_READY_FEMALE_MESSAGE
      : FACE_SCAN_READY_MESSAGE;
  }
}

async function analyzeFaceWithBackend(dataUrl) {
  if (!window.fetch || !window.AbortController) return null;
  const { endpoint, isExplicit } = endpointConfig("/api/colour-profile");
  if (shouldSkipApiEndpoint(endpoint, isExplicit)) return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: dataUrl }),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(String(result?.error || `Face analysis failed (${response.status}).`));
    }
    if (!result?.profile?.name || !Array.isArray(result.ranked)) {
      throw new Error("Face analysis returned an incomplete result.");
    }

    const sampling = result.sampling || {};
    const noFaceDetected =
      !sampling.usedSkinMask &&
      (sampling.skinSampleCount || 0) < MIN_SKIN_SAMPLES_FOR_FACE &&
      (sampling.fallbackSampleCount || 0) > 0 &&
      (sampling.skinSampleCount || 0) / (sampling.fallbackSampleCount || 1) < MIN_SKIN_RATIO_FOR_FALLBACK;
    if (noFaceDetected) {
      throw new Error("No face detected. Upload a clear front-facing face photo.");
    }

    return result;
  } finally {
    window.clearTimeout(timeout);
  }
}

function analyzeFaceInBrowser(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        resolve(createBrowserResult(sampleFaceImage(image)));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => {
      reject(new Error("Could not read that image. Try another face photo."));
    };
    image.src = dataUrl;
  });
}

async function analyzeFaceDataUrl(dataUrl) {
  faceStatus.textContent = "Scanning face and building the colour profile...";
  let backendError = null;

  try {
    const backendResult = await analyzeFaceWithBackend(dataUrl);
    if (backendResult) {
      renderFaceResult(backendResult);
      return;
    }
  } catch (error) {
    backendError = error instanceof Error ? error : new Error("Face analysis failed.");
    if (backendError.message.includes("No face detected")) {
      latestFaceResult = null;
      faceStatus.textContent = backendError.message;
      if (generationStatus) generationStatus.textContent = FACE_SCAN_REQUIRED_MESSAGE;
      return;
    }
  }

  try {
    const browserResult = await analyzeFaceInBrowser(dataUrl);
    renderFaceResult(browserResult);
  } catch (error) {
    latestFaceResult = null;
    faceStatus.textContent = (error instanceof Error ? error.message : "Could not analyse face photo.") || backendError?.message || "";
    if (generationStatus) generationStatus.textContent = FACE_SCAN_ERROR_MESSAGE;
  }
}

function handleFaceUpload(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    latestFaceResult = null;
    latestFaceDataUrl = "";
    latestFaceReferenceDataUrl = "";
    faceStatus.textContent = "Please upload a valid image before scanning.";
    if (generationStatus) generationStatus.textContent = FACE_SCAN_REQUIRED_MESSAGE;
    return;
  }

  latestFaceResult = null;
  latestFaceDataUrl = "";
  latestFaceReferenceDataUrl = "";
  faceStatus.textContent = "Reading face photo...";
  if (generationStatus) generationStatus.textContent = "Preparing the face scan...";
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || "");
    latestFaceDataUrl = dataUrl;
    facePreview.src = dataUrl;
    faceDrop.classList.add("has-image");
    resizeImageDataUrl(dataUrl).then((referenceDataUrl) => {
      if (latestFaceDataUrl === dataUrl) latestFaceReferenceDataUrl = referenceDataUrl;
    });
    analyzeFaceDataUrl(dataUrl);
  };
  reader.readAsDataURL(file);
}

function resizeImageDataUrl(dataUrl, maxSide = 960, quality = 0.86) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = width;
        canvas.height = height;
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("Could not prepare face reference image."));
    image.src = dataUrl;
  });
}

function generatedImageUrl(prompt, options = {}) {
  const width = options.width || 800;
  const height = options.height || 1000;
  const seed = options.seed ? `&seed=${encodeURIComponent(String(options.seed))}` : "";
  const explicitEndpoint =
    window.IC_IMAGE_GENERATION_ENDPOINT ||
    window.IC_IMAGE_ENDPOINT ||
    safeStorageValue("icImageGenerationEndpoint") ||
    safeStorageValue("icImageEndpoint") ||
    "";
  const { endpoint, isExplicit } = endpointConfig("/api/generate-style-image", explicitEndpoint);

  if (!shouldSkipApiEndpoint(endpoint, isExplicit)) {
    const url = new URL(endpoint, window.location.href);
    url.searchParams.set("prompt", prompt);
    url.searchParams.set("width", String(width));
    url.searchParams.set("height", String(height));
    if (options.seed) url.searchParams.set("seed", String(options.seed));
    return url.toString();
  }

  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true${seed}`;
}

function hashText(value) {
  return [...String(value)].reduce((hash, character) => {
    return (hash * 31 + character.charCodeAt(0)) >>> 0;
  }, 17);
}

function defaultStyleSelections() {
  return {
    occasion: "business",
    background: "premium boutique studio",
    mood: "quiet luxury",
    fit: "balanced proportions",
    frame: "full body",
    budget: "mid premium",
  };
}

function compactProfile(profile) {
  return {
    name: profile.name,
    axes: profile.axes,
    palette: profile.palette,
    wardrobe: profile.wardrobe,
  };
}

async function faceReferenceDataUrl() {
  if (latestFaceReferenceDataUrl) return latestFaceReferenceDataUrl;
  if (!latestFaceDataUrl) return "";
  latestFaceReferenceDataUrl = await resizeImageDataUrl(latestFaceDataUrl);
  return latestFaceReferenceDataUrl;
}

function saveFemaleStyleRun(result, faceReference = "") {
  const payload = {
    profile: compactProfile(result.profile),
    confidence: result.confidence,
    axes: result.axes,
    ranked: result.ranked.slice(0, 3).map((profile) => ({
      name: profile.name,
      score: profile.score,
      palette: profile.palette,
    })),
    selections: currentStyleSelections(),
    faceReferenceDataUrl: faceReference,
    createdAt: new Date().toISOString(),
  };

  sessionStorage.setItem(STYLE_RUN_STORAGE_KEY, JSON.stringify(payload));
  return payload;
}

function openFemaleResultsPage() {
  const url = new URL("results.html", window.location.href);
  window.location.assign(url.toString());
}

function normalizeBackendBaseUrl(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    return new URL(trimmed, window.location.href).toString().replace(/\/+$/, "");
  } catch (error) {
    return "";
  }
}

function safeStorageValue(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function configuredBackendBaseUrl() {
  return normalizeBackendBaseUrl(
    window.IC_BACKEND_BASE_URL ||
      window.IC_API_BASE_URL ||
      safeStorageValue("icBackendBaseUrl") ||
      safeStorageValue("icApiBaseUrl"),
  );
}

function backendUrl(path) {
  const baseUrl = configuredBackendBaseUrl();
  if (!baseUrl) return "";
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function endpointConfig(path, explicitEndpoint = "") {
  const explicit = String(explicitEndpoint || "").trim();
  if (explicit) {
    return {
      endpoint: new URL(explicit, window.location.href).toString(),
      isExplicit: true,
    };
  }

  const endpoint = backendUrl(path);
  if (endpoint) {
    return {
      endpoint,
      isExplicit: true,
    };
  }

  return {
    endpoint: path,
    isExplicit: false,
  };
}

function shouldSkipApiEndpoint(endpoint, isExplicit) {
  if (isExplicit) return false;
  if (!endpoint.startsWith("/api/")) return false;
  const host = window.location.hostname;
  return !host || host.endsWith("github.io");
}

function getMatchingEndpointConfig() {
  const explicit =
    window.IC_MATCHING_CLOTHES_ENDPOINT ||
    window.IC_AFFILIATE_ENDPOINT ||
    safeStorageValue("icMatchingClothesEndpoint") ||
    safeStorageValue("icAffiliateEndpoint") ||
    "";

  return endpointConfig("/api/fetch-matching-clothes", explicit);
}

function normalizeAffiliateProducts(payload) {
  const products = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.products)
      ? payload.products
      : Array.isArray(payload.data)
        ? payload.data
        : [];

  return products
    .map((product) => ({
      productName: String(product.productName || product.name || "Matching product"),
      brand: String(product.brand || product.merchant || "Retail partner"),
      price: String(product.price || product.salePrice || "Live price"),
      imageUrl: String(product.imageUrl || product.image || ""),
      buyLink: String(product.buyLink || product.link || product.url || ""),
      isFallback: Boolean(product.isFallback || product.source === "generic-search"),
      actionLabel: String(product.actionLabel || (product.isFallback ? "Search" : "Shop")),
    }))
    .filter((product) => product.buyLink);
}

function affiliateFallbackMessage(kind) {
  switch (kind) {
    case "not-configured":
      return RESULTS_UNCONFIGURED_MESSAGE;
    case "no-products":
      return "No live product matches were returned for this look. Showing shopping-search fallback links.";
    default:
      return RESULTS_FALLBACK_MESSAGE;
  }
}

async function fetchMatchingClothes(searchQuery, colorSeason) {
  const { endpoint, isExplicit } = getMatchingEndpointConfig();
  if (!window.fetch || shouldSkipApiEndpoint(endpoint, isExplicit)) {
    return {
      products: [],
      usedAffiliate: false,
      reason: affiliateFallbackMessage("not-configured"),
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ searchQuery, colorSeason }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      return {
        products: [],
        usedAffiliate: false,
        reason: String(payload?.error || affiliateFallbackMessage("unavailable")),
      };
    }

    const products = normalizeAffiliateProducts(payload);
    if (!products.length) {
      return {
        products: [],
        usedAffiliate: false,
        reason: affiliateFallbackMessage("no-products"),
      };
    }

    const hasLiveProducts = products.some((product) => !product.isFallback);
    return {
      products,
      usedAffiliate: hasLiveProducts,
      reason: hasLiveProducts ? "" : affiliateFallbackMessage("unavailable"),
    };
  } catch (error) {
    return {
      products: [],
      usedAffiliate: false,
      reason: affiliateFallbackMessage("unavailable"),
    };
  }
}

function shoppingSearchUrl(query) {
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}`;
}

function pieceSearchQuery(piece, run) {
  const selections = { ...defaultStyleSelections(), ...(run.selections || {}) };
  return [
    piece.search,
    run.profile?.name,
    run.profile?.wardrobe,
    selections.occasion,
    selections.fit,
    selections.budget,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackProduct(piece, query) {
  return {
    productName: piece.label,
    brand: "Shopping search",
    price: "Live price",
    imageUrl: "",
    buyLink: shoppingSearchUrl(query),
    isFallback: true,
    actionLabel: "Search",
  };
}

function defaultFemaleStyleRun() {
  const profile = seasonProfiles.find((season) => season.name === "Soft Autumn") || seasonProfiles[0];
  return {
    profile: compactProfile(profile),
    confidence: 72,
    axes: profile.axes,
    ranked: [{ name: profile.name, score: 72, palette: profile.palette }],
    selections: defaultStyleSelections(),
    faceReferenceDataUrl: "",
    sample: true,
  };
}

function readFemaleStyleRun() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STYLE_RUN_STORAGE_KEY) || "null");
    if (!stored?.profile?.name || !Array.isArray(stored.profile.palette)) return defaultFemaleStyleRun();
    return {
      ...defaultFemaleStyleRun(),
      ...stored,
      profile: { ...defaultFemaleStyleRun().profile, ...stored.profile },
      selections: { ...defaultStyleSelections(), ...(stored.selections || {}) },
      sample: false,
    };
  } catch (error) {
    return defaultFemaleStyleRun();
  }
}

function buildFemaleLookPrompt(run, idea, index) {
  const selections = { ...defaultStyleSelections(), ...(run.selections || {}) };
  const palette = run.profile.palette.join(", ");
  const pieces = idea.pieces.map((piece) => piece.label).join(", ");
  const frameInstruction =
    selections.frame === "half body"
      ? "Half body portrait crop with face, hair, neckline, upper outfit, and accessories clearly visible."
      : "Full body head-to-toe fashion image with clear face, shoes, silhouette, and outfit proportions visible.";

  return [
    "Photorealistic high-end female fashion editorial for IC_wearables.",
    `Look ${index + 1}: ${idea.title}. Direction: ${idea.tone}.`,
    `Occasion: ${selections.occasion}. Style mood: ${selections.mood}. Fit goal: ${selections.fit}. Budget direction: ${selections.budget}.`,
    `Background style: ${selections.background}. Do not use the colour palette for the background; use it only for clothing, shoes, bags, jewellery, and makeup harmony.`,
    `Colour season: ${run.profile.name}. Palette hex colours: ${palette}. Wardrobe direction: ${run.profile.wardrobe}.`,
    `Outfit pieces to show: ${pieces}. ${frameInstruction}`,
    "Premium textures, realistic lighting, clear full face, elegant styling, no text, no logos, no watermark.",
  ].join(" ");
}

function buildReferencedFemaleLookPrompt(run, idea, index, rows = []) {
  const productSummary = rows
    .map(({ piece, product }) => `${piece.label}: ${product.productName} from ${product.brand}`)
    .join("; ");
  const productImageCount = rows.filter(({ product }) => product.imageUrl).length;

  return [
    buildFemaleLookPrompt(run, idea, index),
    "Use Image 1 as the identity reference. Preserve the same person's face, facial structure, hair, skin tone, and expression as closely as possible.",
    productImageCount
      ? "Use the later reference images as clothing and accessory references. Dress the person in those product-inspired pieces while keeping a natural, realistic full outfit."
      : "Affiliate product image references are unavailable for this look, so style the person using the product names and colour-season guidance.",
    productSummary ? `Product references: ${productSummary}.` : "",
    "Do not change identity. Do not create a different model. Avoid mannequin, catalogue cutout, distorted face, mismatched limbs, text, logos, or watermarks.",
  ]
    .filter(Boolean)
    .join(" ");
}

function renderResultsSummary(run) {
  if (resultsSeason) resultsSeason.textContent = run.profile.name;
  if (resultsConfidence) resultsConfidence.textContent = run.sample ? "Sample" : `${run.confidence}%`;
  if (resultsStatus) {
    const endpointConfig = getMatchingEndpointConfig();
    const endpointSkipped = shouldSkipApiEndpoint(endpointConfig.endpoint, endpointConfig.isExplicit);
    resultsStatus.textContent = run.sample
      ? RESULTS_SAMPLE_MESSAGE
      : endpointSkipped
        ? RESULTS_UNCONFIGURED_MESSAGE
        : "Generating looks and checking live product links.";
  }

  if (!resultsPaletteSwatches) return;
  resultsPaletteSwatches.innerHTML = "";
  run.profile.palette.forEach((color) => {
    const swatch = document.createElement("span");
    swatch.style.setProperty("--swatch", color);
    swatch.title = color;
    resultsPaletteSwatches.appendChild(swatch);
  });
}

function createProductRow(product, piece) {
  const row = document.createElement("article");
  row.className = "look-product-row";
  if (product.isFallback) row.classList.add("is-fallback");

  if (product.imageUrl) {
    const image = document.createElement("img");
    image.src = product.imageUrl;
    image.alt = product.productName;
    image.loading = "lazy";
    row.appendChild(image);
  } else {
    const marker = document.createElement("span");
    marker.className = "product-marker";
    marker.textContent = piece.label.slice(0, 1).toUpperCase();
    row.appendChild(marker);
  }

  const copy = document.createElement("div");
  const brand = document.createElement("span");
  const title = document.createElement("strong");
  const price = document.createElement("small");
  brand.textContent = product.brand;
  title.textContent = product.productName;
  price.textContent = product.price;
  copy.append(brand, title, price);

  const link = document.createElement("a");
  link.className = "look-product-action";
  link.href = product.buyLink;
  link.target = "_blank";
  link.rel = "noopener noreferrer sponsored";
  link.textContent = product.actionLabel || "Shop";
  link.setAttribute("aria-label", `Shop ${piece.label}`);

  row.append(copy, link);
  return row;
}

function createProductNotice(message) {
  const notice = document.createElement("div");
  notice.className = "look-product-notice";
  notice.textContent = message;
  return notice;
}

async function generatedReferenceImage(prompt, options = {}) {
  const width = options.width || 800;
  const height = options.height || 1000;
  const referenceImages = Array.isArray(options.referenceImages) ? options.referenceImages.filter(Boolean).slice(0, 3) : [];
  const explicitEndpoint =
    window.IC_IMAGE_GENERATION_ENDPOINT ||
    window.IC_IMAGE_ENDPOINT ||
    safeStorageValue("icImageGenerationEndpoint") ||
    safeStorageValue("icImageEndpoint") ||
    "";
  const { endpoint, isExplicit } = endpointConfig("/api/generate-style-image", explicitEndpoint);

  if (!window.fetch || shouldSkipApiEndpoint(endpoint, isExplicit)) {
    return {
      imageUrl: generatedImageUrl(prompt, options),
      provider: "text-fallback",
      usedReferences: false,
    };
  }

  if (!referenceImages.length) {
    return {
      imageUrl: generatedImageUrl(prompt, options),
      provider: "text-fallback",
      usedReferences: false,
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      width,
      height,
      seed: options.seed,
      referenceImages,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.detail || payload?.error || "Reference image generation failed."));
  }

  const imageUrl = payload.imageUrl || payload.imageDataUrl;
  if (!imageUrl) throw new Error("Reference image generation returned no image.");
  return {
    imageUrl,
    provider: payload.provider || "reference-generation",
    usedReferences: true,
  };
}

function setLookImageStatus(statusElement, message) {
  if (!statusElement) return;
  statusElement.textContent = message;
}

async function hydrateLookImage(run, idea, index, image, statusElement, rows) {
  const seed = hashText(`${run.profile.name}-${idea.title}-${JSON.stringify(run.selections)}`);
  const productImageUrls = rows
    .map(({ product }) => product.imageUrl)
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, 2);
  const referenceImages = [run.faceReferenceDataUrl, ...productImageUrls].filter(Boolean).slice(0, 3);
  const prompt = buildReferencedFemaleLookPrompt(run, idea, index, rows);

  setLookImageStatus(
    statusElement,
    run.faceReferenceDataUrl
      ? "Generating with scanned face reference..."
      : "Generating from colour profile...",
  );

  try {
    const result = await generatedReferenceImage(prompt, {
      width: 800,
      height: 1000,
      seed,
      referenceImages,
    });
    image.onload = () => {
      setLookImageStatus(
        statusElement,
        result.usedReferences
          ? productImageUrls.length
            ? "Generated from face and product references."
            : "Generated from scanned face and product text."
          : "Generated from styling prompt.",
      );
    };
    image.onerror = () => {
      image.src = idea.fallbackImage;
      setLookImageStatus(statusElement, "Reference generation failed. Showing fallback look.");
    };
    image.src = result.imageUrl;
    return {
      imageUsedReferences: result.usedReferences,
      productReferenceCount: productImageUrls.length,
      imageProvider: result.provider,
    };
  } catch (error) {
    image.src = idea.fallbackImage;
    setLookImageStatus(statusElement, "Reference generation failed. Showing fallback look.");
    return {
      imageUsedReferences: false,
      productReferenceCount: productImageUrls.length,
      imageProvider: "fallback",
    };
  }
}

function renderFemaleLookCard(run, idea, index) {
  const card = document.createElement("article");
  card.className = "generated-look-card";

  const media = document.createElement("div");
  media.className = "generated-look-media";
  const image = document.createElement("img");
  const imageStatus = document.createElement("span");
  imageStatus.className = "generated-look-image-status";
  imageStatus.textContent = run.sample ? "Sample look image." : "Preparing AI try-on image...";
  image.onerror = () => {
    if (image.dataset.fallbackApplied === "true") return;
    image.dataset.fallbackApplied = "true";
    image.src = idea.fallbackImage;
    imageStatus.textContent = "Reference generation failed. Showing fallback look.";
  };
  if (run.sample) image.src = idea.fallbackImage;
  image.alt = `${idea.title} generated outfit for ${run.profile.name}`;
  image.loading = index === 0 ? "eager" : "lazy";
  media.append(image, imageStatus);

  const body = document.createElement("div");
  body.className = "generated-look-body";

  const top = document.createElement("div");
  top.className = "generated-look-top";
  const label = document.createElement("span");
  const title = document.createElement("h2");
  const description = document.createElement("p");
  label.textContent = `Look 0${index + 1}`;
  title.textContent = idea.title;
  description.textContent = idea.description;
  top.append(label, title, description);

  const pieceList = document.createElement("div");
  pieceList.className = "look-piece-list";
  idea.pieces.forEach((piece) => {
    const chip = document.createElement("span");
    chip.textContent = piece.label;
    pieceList.appendChild(chip);
  });

  const rackTitle = document.createElement("h3");
  rackTitle.textContent = "Product links";

  const productList = document.createElement("div");
  productList.className = "look-product-list";
  productList.setAttribute("aria-label", `${idea.title} product links`);
  const loading = document.createElement("div");
  loading.className = "look-product-loading";
  loading.textContent = "Finding matching pieces...";
  productList.appendChild(loading);

  body.append(top, pieceList, rackTitle, productList);
  card.append(media, body);
  return { card, productList, image, imageStatus };
}

async function hydrateLookProducts(run, idea, productList) {
  const rows = await Promise.all(
    idea.pieces.map(async (piece) => {
      const query = pieceSearchQuery(piece, run);
      const lookup = await fetchMatchingClothes(query, run.profile.name);
      const product = lookup.products[0] || fallbackProduct(piece, query);
      return {
        piece,
        product,
        usedAffiliate: Boolean(lookup.products[0] && !product.isFallback),
        reason: lookup.reason,
      };
    }),
  );

  const affiliateCount = rows.filter((row) => row.usedAffiliate).length;
  const fallbackCount = rows.length - affiliateCount;
  const firstReason = rows.find((row) => row.reason)?.reason || "";
  const children = [];

  if (fallbackCount > 0) {
    children.push(
      createProductNotice(
        affiliateCount > 0 ? RESULTS_PARTIAL_FALLBACK_MESSAGE : firstReason || RESULTS_FALLBACK_MESSAGE,
      ),
    );
  }

  children.push(...rows.map(({ product, piece }) => createProductRow(product, piece)));
  productList.replaceChildren(...children);
  return { affiliateCount, fallbackCount, totalCount: rows.length, rows };
}

function initFemaleResultsPage() {
  if (!femaleLooksGrid) return;

  const run = readFemaleStyleRun();
  renderResultsSummary(run);
  femaleLooksGrid.innerHTML = "";

  const productJobs = femaleOutfitIdeas.map(async (idea, index) => {
    const { card, productList, image, imageStatus } = renderFemaleLookCard(run, idea, index);
    femaleLooksGrid.appendChild(card);
    const productStats = await hydrateLookProducts(run, idea, productList);
    const imageStats = run.sample
      ? { imageUsedReferences: false, productReferenceCount: 0, imageProvider: "sample" }
      : await hydrateLookImage(run, idea, index, image, imageStatus, productStats.rows);
    return { ...productStats, ...imageStats };
  });

  Promise.allSettled(productJobs).then((outcomes) => {
    if (!resultsStatus) return;
    if (run.sample) {
      resultsStatus.textContent = RESULTS_SAMPLE_MESSAGE;
      return;
    }

    const stats = outcomes
      .filter((outcome) => outcome.status === "fulfilled")
      .map((outcome) => outcome.value);
    const affiliateCount = stats.reduce((sum, stat) => sum + stat.affiliateCount, 0);
    const fallbackCount = stats.reduce((sum, stat) => sum + stat.fallbackCount, 0);

    if (fallbackCount && affiliateCount) {
      resultsStatus.textContent = RESULTS_PARTIAL_FALLBACK_MESSAGE;
      return;
    }

    if (fallbackCount) {
      const endpointConfig = getMatchingEndpointConfig();
      resultsStatus.textContent = shouldSkipApiEndpoint(endpointConfig.endpoint, endpointConfig.isExplicit)
        ? RESULTS_UNCONFIGURED_MESSAGE
        : RESULTS_FALLBACK_MESSAGE;
      return;
    }

    resultsStatus.textContent = RESULTS_LIVE_MESSAGE;
  });
}

async function generateStylePhoto() {
  if (!latestFaceResult) {
    if (generationStatus) generationStatus.textContent = FACE_SCAN_REQUIRED_MESSAGE;
    faceUpload?.focus();
    return;
  }

  if (isFemalePath && !isFemaleResultsPage) {
    try {
      if (generatePhotoButton) generatePhotoButton.disabled = true;
      if (generationStatus) generationStatus.textContent = "Saving face reference for AI try-on...";
      const faceReference = await faceReferenceDataUrl();
      saveFemaleStyleRun(latestFaceResult, faceReference);
      if (generationStatus) generationStatus.textContent = "Opening four-look results page...";
      window.setTimeout(openFemaleResultsPage, 120);
    } catch (error) {
      if (generationStatus) generationStatus.textContent = "Could not save this scan. Try again.";
      if (generatePhotoButton) generatePhotoButton.disabled = false;
    }
    return;
  }

  const prompt = buildStyleImagePrompt(latestFaceResult);
  if (generationStatus) generationStatus.textContent = IMAGE_GENERATING_MESSAGE;
  if (generatePhotoButton) generatePhotoButton.disabled = true;
  if (generatedStyleImage) {
    generatedStyleImage.onload = () => {
      if (generationStatus) generationStatus.textContent = IMAGE_SUCCESS_MESSAGE;
      if (generatePhotoButton) generatePhotoButton.disabled = false;
    };
    generatedStyleImage.onerror = () => {
      if (generationStatus) generationStatus.textContent = IMAGE_ERROR_MESSAGE;
      if (generatePhotoButton) generatePhotoButton.disabled = false;
    };
    generatedStyleImage.src = generatedImageUrl(prompt);
  }
}

function initFaceColourStudio() {
  if (!faceUpload) return;
  faceUpload.addEventListener("change", (event) => {
    handleFaceUpload(event.target.files?.[0]);
  });
  generatePhotoButton?.addEventListener("click", generateStylePhoto);
}

updateHeader();
initProgressObserver();
initWaitlistForm();
initFaceColourStudio();
initFemaleResultsPage();

window.addEventListener("scroll", updateHeader, { passive: true });
