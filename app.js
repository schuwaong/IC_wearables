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
const styleMoodSelect = document.getElementById("styleMoodSelect");
const styleFitSelect = document.getElementById("styleFitSelect");
const styleFrameSelect = document.getElementById("styleFrameSelect");
const styleBudgetSelect = document.getElementById("styleBudgetSelect");
const styleBackgroundSelect = document.getElementById("styleBackgroundSelect");
const generatePhotoButton = document.getElementById("generatePhotoButton");
const generationStatus = document.getElementById("generationStatus");
const generatedStyleImage = document.getElementById("generatedStyleImage");
const femaleLooksGrid = document.getElementById("femaleLooksGrid");
const resultsSeason = document.getElementById("resultsSeason");
const resultsConfidence = document.getElementById("resultsConfidence");
const resultsPaletteSwatches = document.getElementById("resultsPaletteSwatches");
const resultsStatus = document.getElementById("resultsStatus");
const resultsRunlog = document.getElementById("resultsRunlog");
const resultsRunlogSummary = document.getElementById("resultsRunlogSummary");
const productLibrarySummary = document.getElementById("productLibrarySummary");
const productLibraryList = document.getElementById("productLibraryList");
const locationStatus = document.getElementById("locationStatus");
const enableLocationButton = document.getElementById("enableLocationButton");

const STYLE_RUN_STORAGE_KEY = "icWearablesFemaleStyleRun";
const pathName = window.location.pathname.toLowerCase();
const isFemalePath = pathName.includes("/female/");
const isFemaleResultsPage = Boolean(femaleLooksGrid);

let latestFaceResult = null;
let latestFaceDataUrl = "";
let latestFaceReferenceDataUrl = "";
let styleImageRenderNonce = 0;
let shopperLocation = null;
const MIN_SKIN_SAMPLES_FOR_FACE = 24;
const MIN_SKIN_RATIO_FOR_FALLBACK = 0.04;
const WHITE_BALANCE_STRENGTH = 0.68;
const FACE_SCAN_READY_MESSAGE = "Face scan ready. Generate the locked five-look image.";
const FACE_SCAN_READY_FEMALE_MESSAGE =
  "Face scan ready. Adjust mood, fit, frame, and budget, then generate five fixed outfit looks.";
const FACE_SCAN_REQUIRED_MESSAGE = "Scan or upload a clear front-facing face photo first.";
const FACE_SCAN_ERROR_MESSAGE = "Face scan could not be completed. Upload a clear front-facing face photo and try again.";
const IMAGE_GENERATING_MESSAGE = "Generating a face-preserving five-look image...";
const IMAGE_SUCCESS_MESSAGE = "Five-look image generated with the scanned face reference.";
const IMAGE_ERROR_MESSAGE = "Face-preserving image generation is temporarily unavailable. Try again.";
const RESULTS_LIVE_MESSAGE = "Five generated looks are ready with live product links for each outfit piece.";
const RESULTS_PARTIAL_FALLBACK_MESSAGE =
  "Some exact product pages are unavailable right now. Search links are available for the remaining pieces.";
const RESULTS_FALLBACK_MESSAGE =
  "Exact product-page matches are temporarily unavailable. Showing colour-matched search links for your active market instead.";
const RESULTS_UNCONFIGURED_MESSAGE =
  "Live product links are not connected on this site yet.";
const RESULTS_SAMPLE_MESSAGE = "Showing sample looks. Run a new face scan for a personalised results set.";
const RESULTS_PROGRESS_MESSAGE = "Preparing 5 total looks and checking live product links.";
const RESULTS_IMAGE_FALLBACK_MESSAGE = "Some look images are unavailable. Check the generation trace for per-look provider failures.";
const RESULTS_COMBINED_FALLBACK_MESSAGE =
  "Some look images are unavailable or product matches are search-link fallbacks. Check the generation trace for per-look details.";
const IMAGE_REQUEST_TIMEOUT_MS = 45000;
const IMAGE_REFERENCE_MAX_COUNT = Math.max(
  1,
  Math.min(8, Number(window.IC_IMAGE_REFERENCE_MAX_COUNT || safeStorageValue("icImageReferenceMaxCount") || 5) || 5),
);
const IMAGE_REFERENCE_PROVIDER_ORDER = String(
  window.IC_IMAGE_REFERENCE_PROVIDER_ORDER ||
    safeStorageValue("icImageReferenceProviderOrder") ||
    "vertex,pollinations,local-template",
)
  .split(",")
  .map((provider) => provider.trim().toLowerCase())
  .filter(Boolean);
const IMAGE_REQUEST_MAX_CONCURRENCY = Math.max(
  1,
  Number(
    window.IC_FEMALE_IMAGE_MAX_CONCURRENCY ||
      safeStorageValue("icFemaleImageMaxConcurrency") ||
      2,
  ) || 2,
);
const PRODUCT_REQUEST_TIMEOUT_MS = 12000;
const LOOK_REFERENCE_WAIT_MS = 1500;
const PROJECT_ROOT_RELATIVE_PREFIX = pathName.includes("/female/") || pathName.includes("/men/") ? "../" : "";
const MENS_IMAGE_FALLBACK_URL = `${PROJECT_ROOT_RELATIVE_PREFIX}assets/ic-wearables-hero-premium-v2.png`;
const PRODUCT_LIBRARY_URL = window.IC_PRODUCT_LIBRARY_URL || "data/product-library.json";
const PRODUCT_LIBRARY_FALLBACK_URL = "assets/product-library.json";
const PRODUCT_COMBINATION_MANIFEST_URL =
  window.IC_PRODUCT_COMBINATION_MANIFEST_URL || "data/outfit-combination-crops/manifest.json";
const PRODUCT_COMBINATION_FALLBACK_URL = "assets/outfit-combinations/manifest.json";
const LOCATION_STORAGE_KEY = "icWearablesShopperLocation";
const LOOK_LOG_PHASE_LABELS = {
  queued: "Queued",
  products: "Products",
  rendering: "Rendering",
  success: "Ready",
  fallback: "Fallback",
  sample: "Sample",
  error: "Error",
};
const LOOK_LOG_PHASE_PRIORITY = {
  queued: 0,
  products: 1,
  rendering: 2,
  success: 3,
  fallback: 3,
  sample: 3,
  error: 3,
};
let activeImageGenerationJobs = 0;
const pendingImageGenerationJobs = [];
const femaleLookCardState = new Map();
let productCombinationManifestPromise = null;
let productLibraryDataPromise = null;
let productLibraryIndexPromise = null;
const MAX_AUTOMATIC_PRODUCT_REFERENCE_IMAGES = 1;

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

const femaleRunlogRows = new Map();
const CHROMA_GREEN_BACKGROUND_INSTRUCTION =
  "Use a flat, evenly lit chroma key green background (#00B140) behind the full body only. No scenery, room, street, furniture, shadows, gradients, props, text, logos, or patterned background. Keep clean separation around hair, shoulders, arms, clothing edges, shoes, and accessories so the subject can be cropped and the background can be replaced later.";

const mensBackgroundSets = {
  metropolitan: {
    label: "Metropolitan editorial",
    description: "glass towers, warm stone lobbies, clean storefronts, premium gym architecture, and private-club interiors",
    scenes: [
      "financial district boardroom with a long stone table, glass skyline, and disciplined daylight",
      "modern gallery cafe with warm timber, cream walls, and soft window light",
      "golden-hour city street with clean storefronts, polished pavement, and subtle motion",
      "architectural wellness studio with concrete, chrome, soft towels, and morning light",
      "quiet private members' lounge with travertine, walnut, linen curtains, and low natural light",
    ],
  },
  hotel: {
    label: "Luxury hotel circuit",
    description: "hotel lobby, terrace, city arrival, spa corridor, and suite settings",
    scenes: [
      "luxury hotel business lounge with marble columns, leather club chairs, and city views",
      "hotel terrace breakfast setting with clean stone, greenery, and relaxed daylight",
      "city hotel entrance with a tailored doorman awning, black car arrival, and evening pavement",
      "premium hotel gym corridor with glass, brushed steel, and soft indirect light",
      "minimal hotel suite with linen sofa, stone console, and warm residential light",
    ],
  },
  studio: {
    label: "Minimal studio",
    description: "controlled studio backgrounds that keep attention on face, colour, and silhouette",
    scenes: [
      "warm grey fashion studio with a low plinth, softbox light, and subtle business-office props",
      "cream studio corner with a single lounge chair, side table, and natural daylight",
      "charcoal studio street-set with concrete texture, soft shadows, and editorial floor marks",
      "clean performance studio with matte floor, minimal equipment, and crisp side light",
      "limestone-toned studio set with a sculptural chair, wool rug, and soft quiet-luxury shadows",
    ],
  },
};

const fixedStyleLooks = [
  {
    title: "Business formal",
    occasion: "business formal",
    tone: "sharp formal tailoring, executive polish, strongest near-face colour, disciplined proportions",
    description: "A formal work look with crisp structure, authority, and the strongest colour close to the face.",
    fallbackImage: "../assets/generated-results/female-look-boardroom.jpg",
    mensPieces: [
      { label: "Tailored suit", search: "men tailored suit" },
      { label: "Dress shirt", search: "men dress shirt" },
      { label: "Silk tie or pocket square", search: "men silk tie pocket square" },
      { label: "Oxford or derby shoe", search: "men oxford derby shoes" },
    ],
    femalePieces: [
      { label: "Tailored blazer", search: "women tailored blazer" },
      { label: "Near-face blouse", search: "women silk satin blouse" },
      { label: "Tailored trouser or skirt", search: "women tailored trousers pencil skirt" },
      { label: "Leather pump or loafer", search: "women leather pumps loafers" },
    ],
  },
  {
    title: "Smart casual",
    occasion: "smart casual",
    tone: "refined off-duty polish, relaxed tailoring, tactile layers, clean but not corporate",
    description: "An elevated daily look that feels easy but still intentional enough for dinner or meetings.",
    fallbackImage: "../assets/generated-results/female-look-travel.jpg",
    mensPieces: [
      { label: "Unstructured blazer", search: "men unstructured blazer" },
      { label: "Fine knit polo", search: "men fine knit polo" },
      { label: "Tailored chino", search: "men tailored chinos" },
      { label: "Suede loafer", search: "men suede loafers" },
    ],
    femalePieces: [
      { label: "Soft blazer", search: "women relaxed blazer" },
      { label: "Fine knit top", search: "women fine knit top" },
      { label: "Tailored denim or trouser", search: "women tailored jeans trousers" },
      { label: "Loafer or slingback", search: "women loafers slingback shoes" },
    ],
  },
  {
    title: "City casual",
    occasion: "city casual",
    tone: "relaxed city styling with elevated everyday textures and comfortable movement",
    description: "A clean street-ready outfit built around palette-safe layers and everyday movement.",
    fallbackImage: "../assets/generated-results/female-look-city.jpg",
    mensPieces: [
      { label: "Overshirt or jacket", search: "men overshirt casual jacket" },
      { label: "Premium tee", search: "men premium t shirt" },
      { label: "Straight denim or trouser", search: "men straight jeans trousers" },
      { label: "Minimal sneaker", search: "men minimal leather sneakers" },
    ],
    femalePieces: [
      { label: "Cropped jacket", search: "women cropped jacket" },
      { label: "Premium tee or knit", search: "women premium t shirt fine knit" },
      { label: "Straight denim or trouser", search: "women straight leg jeans trousers" },
      { label: "Clean sneaker", search: "women minimal leather sneakers" },
    ],
  },
  {
    title: "Athleisure",
    occasion: "athleisure",
    tone: "premium performance styling, clean technical layers, athletic ease, sharp colour blocking",
    description: "A polished active look that can move from travel, gym, errands, and coffee without looking sloppy.",
    fallbackImage: "../assets/generated-results/female-look-city.jpg",
    mensPieces: [
      { label: "Technical jacket", search: "men technical jacket" },
      { label: "Performance tee", search: "men performance t shirt" },
      { label: "Tailored jogger", search: "men tailored joggers" },
      { label: "Training sneaker", search: "men premium training sneakers" },
    ],
    femalePieces: [
      { label: "Technical jacket", search: "women technical jacket" },
      { label: "Performance tank or tee", search: "women performance tank t shirt" },
      { label: "Tailored legging or jogger", search: "women premium leggings joggers" },
      { label: "Training sneaker", search: "women premium training sneakers" },
    ],
  },
  {
    title: "Quiet luxury",
    occasion: "quiet luxury",
    tone: "understated luxury, fluid premium fabrics, tonal restraint, expensive but unbranded styling",
    description: "A restrained premium look focused on fabric, proportion, and subtle colour harmony.",
    fallbackImage: "../assets/generated-results/female-look-evening.jpg",
    mensPieces: [
      { label: "Cashmere knit", search: "men cashmere knit sweater" },
      { label: "Wool coat", search: "men wool overcoat" },
      { label: "Fluid trouser", search: "men wool pleated trousers" },
      { label: "Leather loafer", search: "men leather loafers" },
    ],
    femalePieces: [
      { label: "Cashmere knit", search: "women cashmere knit sweater" },
      { label: "Wool coat", search: "women wool coat" },
      { label: "Fluid trouser", search: "women fluid wool trousers" },
      { label: "Leather tote or loafer", search: "women leather tote loafers" },
    ],
  },
];

const femaleOutfitIdeas = [
  ...fixedStyleLooks.map((look, index) => ({
    title: look.title,
    occasion: look.occasion,
    background: mensBackgroundSets.metropolitan.scenes[index],
    tone: look.tone,
    description: look.description,
    fallbackImage: look.fallbackImage,
    pieces: look.femalePieces,
  })),
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
    mood: styleMoodSelect?.value || "quiet luxury",
    fit: styleFitSelect?.value || "balanced proportions",
    frame: styleFrameSelect?.value || "full body",
    budget: styleBudgetSelect?.value || "mid premium",
    backgroundSet: styleBackgroundSelect?.value || "metropolitan",
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
  const backgroundSet = mensBackgroundSets[selections.backgroundSet] || mensBackgroundSets.metropolitan;
  const panelLines = fixedStyleLooks.map((look, index) => {
    const pieces = look.mensPieces.map((piece) => piece.label).join(", ");
    return `Panel ${index + 1}: ${look.title} look on a flat chroma key green studio background. Styling direction: ${look.tone}. Outfit pieces: ${pieces}.`;
  });

  return [
    "High-end IC_wearables menswear editorial composite in one final image.",
    "Use Image 1 as the identity reference for the exact same man in every scene.",
    "Create one polished five-panel composite with the same man repeated consistently across all panels.",
    "Use a magazine contact-sheet layout: two panels on the top row, three panels on the bottom row, all inside one final image.",
    ...panelLines,
    `Background set label for later replacement: ${backgroundSet.label}. Do not render the described scene yet; render chroma green instead.`,
    CHROMA_GREEN_BACKGROUND_INSTRUCTION,
    "All five panels must be present in the same image. Do not collapse them into one background and do not omit any look.",
    `Style mood: ${selections.mood}. Fit goal: ${selections.fit}. Budget direction: ${selections.budget}.`,
    `Image frame: ${selections.frame}. In every panel, show a clear face and believable outfit proportions.`,
    `Colour profile: ${result.profile.name}. Palette hex colours for clothing, shoes, and accessories only: ${palette}.`,
    `Visual read: ${axisSummary}. Wardrobe direction: ${result.profile.wardrobe}.`,
    "Keep the exact same face identity, head shape, facial structure, jawline, cheekbones, eyes, brows, nose, lips, skin tone, hairstyle, hairline, hair length, hair volume, hair part, hair colour, facial hair, and expression as the reference photo in every panel.",
    "Keep the same face scale, the same head-to-body relationship, and the same hairstyle silhouette around the forehead, temples, ears, and shoulders in every panel.",
    "If the reference face is neutral or not smiling, keep it neutral in every panel. Do not add a smile, grin, visible teeth, or any new expression.",
    "Do not beautify, retouch, slim, widen, age, de-age, change ethnicity, stretch, warp, liquify, restyle the hair, change the hairline, change the hair part, add or remove hair volume, face-swap, or replace the face with a different model.",
    "Do not create five different men. It must be the same person with the same natural face in all five looks.",
    "If styling instructions conflict with identity or hairstyle preservation, identity preservation wins.",
    "Use realistic head size, camera perspective, and skin texture. No text, no logos, no watermark.",
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

function resizeImageDataUrl(dataUrl, maxSide = 1280, quality = 0.92) {
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

const TIMEZONE_COUNTRY_HINTS = {
  "Asia/Hong_Kong": "HK",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Singapore": "SG",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Taipei": "TW",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Europe/London": "GB",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "America/New_York": "US",
  "America/Los_Angeles": "US",
  "America/Toronto": "CA",
};

const COUNTRY_CURRENCY = {
  AE: "AED",
  AU: "AUD",
  BR: "BRL",
  CA: "CAD",
  CH: "CHF",
  CN: "CNY",
  DE: "EUR",
  ES: "EUR",
  FR: "EUR",
  GB: "GBP",
  HK: "HKD",
  ID: "IDR",
  IN: "INR",
  IT: "EUR",
  JP: "JPY",
  KR: "KRW",
  MX: "MXN",
  MY: "MYR",
  NL: "EUR",
  NZ: "NZD",
  PH: "PHP",
  SA: "SAR",
  SE: "SEK",
  SG: "SGD",
  TH: "THB",
  TW: "TWD",
  US: "USD",
};

const CLIENT_BUDGET_RANGES = {
  AED: {
    affordable: [150, 450],
    "mid premium": [450, 1100],
    "investment piece": [1100, 3200],
  },
  AUD: {
    affordable: [70, 180],
    "mid premium": [180, 420],
    "investment piece": [420, 1250],
  },
  BRL: {
    affordable: [220, 650],
    "mid premium": [650, 1500],
    "investment piece": [1500, 4500],
  },
  CAD: {
    affordable: [60, 160],
    "mid premium": [160, 380],
    "investment piece": [380, 1100],
  },
  CHF: {
    affordable: [40, 110],
    "mid premium": [110, 260],
    "investment piece": [260, 780],
  },
  CNY: {
    affordable: [280, 850],
    "mid premium": [850, 2200],
    "investment piece": [2200, 6500],
  },
  EUR: {
    affordable: [40, 110],
    "mid premium": [110, 260],
    "investment piece": [260, 780],
  },
  GBP: {
    affordable: [35, 95],
    "mid premium": [95, 220],
    "investment piece": [220, 650],
  },
  HKD: {
    affordable: [300, 850],
    "mid premium": [850, 2200],
    "investment piece": [2200, 6500],
  },
  IDR: {
    affordable: [650000, 1800000],
    "mid premium": [1800000, 4200000],
    "investment piece": [4200000, 12500000],
  },
  INR: {
    affordable: [3200, 9000],
    "mid premium": [9000, 22000],
    "investment piece": [22000, 65000],
  },
  JPY: {
    affordable: [6000, 17000],
    "mid premium": [17000, 42000],
    "investment piece": [42000, 125000],
  },
  KRW: {
    affordable: [55000, 150000],
    "mid premium": [150000, 360000],
    "investment piece": [360000, 1050000],
  },
  MXN: {
    affordable: [700, 1900],
    "mid premium": [1900, 4600],
    "investment piece": [4600, 13500],
  },
  MYR: {
    affordable: [180, 520],
    "mid premium": [520, 1300],
    "investment piece": [1300, 3800],
  },
  NZD: {
    affordable: [80, 200],
    "mid premium": [200, 460],
    "investment piece": [460, 1350],
  },
  PHP: {
    affordable: [2300, 6500],
    "mid premium": [6500, 16000],
    "investment piece": [16000, 47000],
  },
  SAR: {
    affordable: [150, 450],
    "mid premium": [450, 1100],
    "investment piece": [1100, 3200],
  },
  SEK: {
    affordable: [420, 1150],
    "mid premium": [1150, 2700],
    "investment piece": [2700, 8000],
  },
  SGD: {
    affordable: [55, 150],
    "mid premium": [150, 360],
    "investment piece": [360, 1050],
  },
  THB: {
    affordable: [1500, 4200],
    "mid premium": [4200, 10000],
    "investment piece": [10000, 30000],
  },
  TWD: {
    affordable: [1400, 3900],
    "mid premium": [3900, 9400],
    "investment piece": [9400, 28000],
  },
  USD: {
    affordable: [40, 120],
    "mid premium": [120, 280],
    "investment piece": [280, 850],
  },
};

function regionFromLocale(locale) {
  const match = String(locale || "").trim().match(/[-_]([A-Za-z]{2})$/);
  return match?.[1] ? match[1].toUpperCase() : "";
}

function inferredCountryCode() {
  const direct =
    String(window.IC_COUNTRY_CODE || "").trim().toUpperCase() ||
    String(safeStorageValue("icCountryCode") || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(direct)) return direct;

  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const hintedCountry = TIMEZONE_COUNTRY_HINTS[timezone] || "";
    if (hintedCountry) return hintedCountry;
  } catch {
    // Fall through to locale detection.
  }

  const localeCandidates = [navigator.language, ...(navigator.languages || [])];
  for (const locale of localeCandidates) {
    const region = regionFromLocale(locale);
    if (region) return region;
  }

  return "";
}

function readStoredLocation() {
  try {
    const stored = JSON.parse(localStorage.getItem(LOCATION_STORAGE_KEY) || "null");
    if (!Number.isFinite(stored?.latitude) || !Number.isFinite(stored?.longitude)) return null;
    if (stored.expiresAt && Date.now() > stored.expiresAt) return null;
    return {
      latitude: stored.latitude,
      longitude: stored.longitude,
      accuracy: stored.accuracy || 0,
      enabledAt: stored.enabledAt || "",
    };
  } catch {
    return null;
  }
}

function saveShopperLocation(position) {
  const coords = position?.coords || {};
  if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return null;
  const value = {
    latitude: Number(coords.latitude),
    longitude: Number(coords.longitude),
    accuracy: Number(coords.accuracy) || 0,
    enabledAt: new Date().toISOString(),
    expiresAt: Date.now() + 1000 * 60 * 60 * 6,
  };
  try {
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // The current page can still use the location even if storage is unavailable.
  }
  shopperLocation = value;
  return value;
}

function locationSummary(location = shopperLocation) {
  if (!location) return "Location off. Enable nearby stores to open map searches around you.";
  const accuracy = location.accuracy ? ` within about ${Math.round(location.accuracy)}m` : "";
  return `Nearby stores enabled${accuracy}. Coordinates stay in this browser and are only used to open map/store links.`;
}

function setLocationStatus(message = locationSummary()) {
  if (locationStatus) locationStatus.textContent = message;
  if (enableLocationButton) {
    enableLocationButton.textContent = shopperLocation ? "Refresh nearby stores" : "Enable nearby stores";
  }
}

function mapsNearbySearchUrl(product, piece, location = shopperLocation) {
  if (!location) return "";
  const query = [product.brand, piece?.label, "near me"].filter(Boolean).join(" ");
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", query);
  url.searchParams.set("center", `${location.latitude},${location.longitude}`);
  return url.toString();
}

function nearbyStoreUrl(product, piece, location = shopperLocation) {
  const mode = String(product.nearbyStoreMode || "").toLowerCase();
  if (location && mode !== "online") return mapsNearbySearchUrl(product, piece, location);
  return product.nearbyStoreUrl || "";
}

function nearbyStoreLabel(product, location = shopperLocation) {
  if (String(product.nearbyStoreMode || "").toLowerCase() === "online") return "Online only";
  if (location) return "Find nearby";
  return product.nearbyStoreLabel || "Store locator";
}

function applyNearbyLinks(root = document) {
  root.querySelectorAll("[data-nearby-product]").forEach((link) => {
    const product = {
      brand: link.dataset.nearbyBrand || "",
      nearbyStoreUrl: link.dataset.nearbyStoreUrl || "",
      nearbyStoreMode: link.dataset.nearbyStoreMode || "",
      nearbyStoreLabel: link.dataset.nearbyStoreLabel || "",
    };
    const piece = { label: link.dataset.nearbyPiece || "" };
    const href = nearbyStoreUrl(product, piece);
    if (href) {
      link.href = href;
      link.classList.remove("is-disabled");
      link.removeAttribute("aria-disabled");
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    } else {
      link.removeAttribute("href");
      link.classList.add("is-disabled");
      link.setAttribute("aria-disabled", "true");
    }
    link.textContent = nearbyStoreLabel(product);
  });
}

function enableNearbyStores() {
  if (!navigator.geolocation) {
    setLocationStatus("This browser does not support location. Store locator links are still available.");
    return;
  }

  setLocationStatus("Requesting location permission...");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      saveShopperLocation(position);
      setLocationStatus();
      applyNearbyLinks();
    },
    (error) => {
      const denied = error?.code === error?.PERMISSION_DENIED;
      setLocationStatus(
        denied
          ? "Location permission was not allowed. Store locator links are still available."
          : "Could not read location. Store locator links are still available.",
      );
    },
    { enableHighAccuracy: false, timeout: 9000, maximumAge: 1000 * 60 * 10 },
  );
}

function productOptionsPerPiece(countryCode) {
  switch (countryCode) {
    case "HK":
      return 3;
    default:
      return 1;
  }
}

function inferredCurrency(countryCode) {
  return COUNTRY_CURRENCY[countryCode] || "USD";
}

function marketLabel(countryCode = inferredCountryCode()) {
  switch (String(countryCode || "").trim().toUpperCase()) {
    case "HK":
      return "Hong Kong";
    case "MY":
      return "Malaysia";
    default:
      return "this region";
  }
}

function formatCurrencyAmount(amount, currency) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
  }).format(amount);
}

function localBudgetRange(selection, countryCode) {
  const normalizedSelection = String(selection || "mid premium").trim().toLowerCase();
  const currency = inferredCurrency(countryCode);
  const ranges = CLIENT_BUDGET_RANGES[currency] || CLIENT_BUDGET_RANGES.USD;
  const [min, max] = ranges[normalizedSelection] || ranges["mid premium"];
  return `${formatCurrencyAmount(min, currency)} - ${formatCurrencyAmount(max, currency)}`;
}

function looksLikeSpecificProductPage(rawUrl) {
  try {
    const url = new URL(rawUrl, window.location.href);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    if (host.includes("google.") && url.searchParams.get("tbm") === "shop") return false;
    if (["q", "query", "keyword", "search", "term"].some((key) => url.searchParams.has(key))) return false;
    if (/\/(search|sr|catalog)\b/.test(path)) return false;
    return true;
  } catch {
    return false;
  }
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
      rawBuyLink: String(product.buyLink || product.link || product.url || ""),
      productName: String(product.productName || product.name || "Matching product"),
      brand: String(product.brand || product.merchant || "Retail partner"),
      price: String(product.price || product.salePrice || "Live price"),
      imageUrl: String(product.imageUrl || product.image || ""),
      localImagePath: String(product.localImagePath || product.sourceImage || product.cropImage || ""),
      budgetRange: String(product.budgetRange || ""),
      buyLink: String(product.buyLink || product.link || product.url || ""),
      isFallback: Boolean(product.isFallback || product.source === "generic-search"),
      actionLabel: String(product.actionLabel || (product.isFallback ? "Search" : "Shop")),
      commissionable: Boolean(product.commissionable),
      affiliateNetwork: String(product.affiliateNetwork || ""),
      trackingStatus: String(product.trackingStatus || ""),
      trackingLabel: String(product.trackingLabel || ""),
      nearbyStoreUrl: String(product.nearbyStoreUrl || product.storeLocatorUrl || product.storeUrl || ""),
      nearbyStoreMode: String(product.nearbyStoreMode || ""),
      nearbyStoreLabel: String(product.nearbyStoreLabel || ""),
    }))
    .map((product) => ({
      ...product,
      imageUrl: normalizeProductImageUrl(product),
      exactProductPage: !product.isFallback && looksLikeSpecificProductPage(product.rawBuyLink),
    }));
}

function extractAffiliateBudgetRange(payload, fallbackSelection = "mid premium", countryCode = inferredCountryCode()) {
  return (
    String(payload?.budget?.rangeLabel || payload?.budgetRange || "").trim() ||
    localBudgetRange(fallbackSelection, countryCode)
  );
}

function affiliateFallbackMessage(kind) {
  switch (kind) {
    case "not-configured":
      return RESULTS_UNCONFIGURED_MESSAGE;
    case "no-products":
      return "No exact product-page matches were returned for this look yet.";
    default:
      return RESULTS_FALLBACK_MESSAGE;
  }
}

async function fetchMatchingClothes(searchQuery, colorSeason, options = {}) {
  const { endpoint, isExplicit } = getMatchingEndpointConfig();
  const countryCode = options.countryCode || inferredCountryCode();
  const budgetSelection = options.budget || "mid premium";
  const requireExactProductPages = options.requireProductPages !== false;
  const allowSearchFallback = options.allowSearchFallback !== false;
  if (!window.fetch || shouldSkipApiEndpoint(endpoint, isExplicit)) {
    return {
      products: [],
      usedAffiliate: false,
      budgetRange: localBudgetRange(budgetSelection, countryCode),
      reason: affiliateFallbackMessage("not-configured"),
    };
  }

  try {
    const controller = window.AbortController ? new AbortController() : null;
    const timeout = controller ? window.setTimeout(() => controller.abort(), PRODUCT_REQUEST_TIMEOUT_MS) : 0;
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchQuery,
          colorSeason,
          budget: budgetSelection,
          countryCode,
          allowSearchFallback,
          requireProductPages: requireExactProductPages,
        }),
        ...(controller ? { signal: controller.signal } : {}),
      });
    } finally {
      if (timeout) window.clearTimeout(timeout);
    }

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
        budgetRange: extractAffiliateBudgetRange(payload, budgetSelection, countryCode),
        reason: String(payload?.error || affiliateFallbackMessage("unavailable")),
      };
    }

    const products = normalizeAffiliateProducts(payload).filter((product) =>
      requireExactProductPages ? product.exactProductPage || product.isFallback : product.buyLink,
    );
    const budgetRange = extractAffiliateBudgetRange(payload, budgetSelection, countryCode);
    if (!products.length) {
      return {
        products: [],
        usedAffiliate: false,
        budgetRange,
        reason: affiliateFallbackMessage("no-products"),
      };
    }

    const hasLiveProducts = products.some((product) => !product.isFallback);
    return {
      products,
      usedAffiliate: hasLiveProducts,
      budgetRange,
      reason: hasLiveProducts ? "" : affiliateFallbackMessage("unavailable"),
    };
  } catch (error) {
    return {
      products: [],
      usedAffiliate: false,
      budgetRange: localBudgetRange(budgetSelection, countryCode),
      reason: error?.name === "AbortError" ? "Product matching timed out for this look." : affiliateFallbackMessage("unavailable"),
    };
  }
}

function shoppingSearchUrl(query) {
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}`;
}

function pieceSearchQuery(piece, run, idea = null) {
  const selections = { ...defaultStyleSelections(), ...(run.selections || {}) };
  const lookOccasion = String(idea?.occasion || selections.occasion || "").trim();
  return [
    piece.search,
    run.profile?.name,
    run.profile?.wardrobe,
    lookOccasion,
    selections.fit,
    selections.budget,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function unavailableProduct(piece, options = {}) {
  return {
    productName: `${piece.label} match unavailable`,
    brand: "Retail lookup",
    price: "Exact product page unavailable",
    imageUrl: "",
    budgetRange: String(options.budgetRange || ""),
    buyLink: "",
    isFallback: true,
    actionLabel: "Unavailable",
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
  const lookOccasion = String(idea.occasion || "business").trim();
  const lookBackground = String(idea.background || "editorial interior").trim();
  const frameInstruction =
    selections.frame === "half body"
      ? "Half body portrait crop with face, hair, neckline, upper outfit, and accessories clearly visible."
      : "Full body head-to-toe fashion image with clear face, shoes, silhouette, and outfit proportions visible.";

  return [
    "Photorealistic high-end female fashion editorial for IC_wearables. Same woman as the uploaded reference photo, not a new model.",
    `Look ${index + 1}: ${idea.title}. Direction: ${idea.tone}.`,
    `Locked occasion for this look: ${lookOccasion}. Background placeholder label for later replacement: ${lookBackground}. Do not render that scene yet; render chroma green instead.`,
    CHROMA_GREEN_BACKGROUND_INSTRUCTION,
    `Style mood: ${selections.mood}. Fit goal: ${selections.fit}. Budget direction: ${selections.budget}.`,
    "Use the colour palette only for clothing, shoes, bags, jewellery, and makeup harmony, not as an abstract background wash.",
    `Colour season: ${run.profile.name}. Palette hex colours: ${palette}. Wardrobe direction: ${run.profile.wardrobe}.`,
    `Outfit pieces to show: ${pieces}. ${frameInstruction}`,
    "Keep the exact same face identity, head shape, facial structure, jawline, cheekbones, eyes, brows, nose, lips, skin tone, hairline, hairstyle, hair length, hair volume, hair part, bangs or fringe, hair colour, and expression as the reference photo.",
    "Keep the same face scale and the same hairstyle silhouette around the forehead, temples, ears, neck, and shoulders as the reference photo.",
    "If the reference face is neutral or not smiling, do not add a smile, grin, visible teeth, or any new expression.",
    "Do not beautify, retouch, slim, widen, age, de-age, change ethnicity, warp, liquify, restyle the hair, change the hairline, change the hair part, add or remove hair volume, or swap in a different model.",
    "If outfit styling conflicts with identity or hairstyle preservation, identity preservation wins.",
    "Premium textures, realistic lighting, natural skin texture, clear full face, elegant styling, no text, no logos, no watermark.",
  ].join(" ");
}

function buildReferencedFemaleLookPrompt(run, idea, index, rows = []) {
  const liveRows = rows.filter(({ product }) => product.buyLink);
  const productSummary = liveRows
    .map(({ piece, product }) =>
      `${piece.label}: ${product.productName} from ${product.brand}${product.price ? ` (${product.price})` : ""}`,
    )
    .join("; ");
  const productImageCount = liveRows.filter(({ product }) => product.imageUrl).length;
  const budgetRange = rows.map(({ product }) => product.budgetRange).find(Boolean) || "";
  const hasFaceReference = Boolean(run.faceReferenceDataUrl);

  return [
    buildFemaleLookPrompt(run, idea, index),
    hasFaceReference
      ? "Use Image 1 as the only visual identity and hairstyle reference. Match the exact same woman's face, hairline, hairstyle, hair length, hair volume, hair part, hair colour, and current expression with very high fidelity."
      : "There is no face reference image for this render, so do not invent a stylised or exaggerated face.",
    productImageCount
      ? "Use Images 2 and later only as garment, shoe, bag, and accessory references. Copy clothing silhouette, fabric texture, colour blocking, and styling details from those product images. Ignore and do not copy any catalogue model face, body, pose, skin, hair, or identity from product images."
      : "If Image 2 is an IC_wearables outfit-combination board, use it only as a combined garment, shoe, bag, accessory, colour, and texture reference. Do not copy any board typography, layout, placeholder letters, catalogue model face, hair, body, pose, or identity. If no Image 2 exists, style the clothing from the matched product names, outfit piece labels, budget, look category, and colour-season guidance.",
    productSummary ? `Product references: ${productSummary}.` : "",
    budgetRange ? `Budget target for the shopper's region: ${budgetRange}. Keep the outfit realistically within that range.` : "",
    "Identity priority rule: Image 1 overrides every other image and every style instruction for the face, head, skin, hair, hairline, expression, and visible age. Images 2 and later are garments only. Never borrow a catalogue model's face, hair, pose identity, body identity, expression, smile, makeup style, or skin tone from product images.",
    "Do not change identity, do not create a different model, do not change hairstyle, do not change hairline, do not change expression, and do not add a smile. Preserve natural skin texture, facial asymmetry, uploaded face proportions, uploaded head shape, and the uploaded hair shape from Image 1. Avoid mannequin, catalogue cutout, distorted face, mismatched limbs, text, logos, or watermarks.",
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
        : RESULTS_PROGRESS_MESSAGE;
  }

  if (resultsRunlogSummary) {
    resultsRunlogSummary.textContent = run.sample
      ? "This sample run keeps the 5-look green-screen layout visible so you can preview business formal, smart casual, city casual, athleisure, and quiet luxury cards."
      : "Each look runs separately on chroma green so you can crop the subject, replace the background, and verify each style one by one.";
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

  const exactImageUrl = normalizeProductImageUrl(product);
  if (exactImageUrl) {
    const image = document.createElement("img");
    image.src = exactImageUrl;
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
  const pieceLabel = document.createElement("span");
  const brand = document.createElement("span");
  const title = document.createElement("strong");
  const price = document.createElement("small");
  const matchStatus = document.createElement("small");
  const budget = product.budgetRange ? document.createElement("small") : null;
  pieceLabel.className = "look-product-piece";
  pieceLabel.textContent = piece.label;
  brand.textContent = product.brand;
  title.textContent = product.productName;
  price.textContent = product.price;
  matchStatus.className = "look-product-budget";
  matchStatus.textContent = product.isFallback ? "Fallback search result" : "Exact product page";
  const trackingStatus = document.createElement("small");
  trackingStatus.className = "look-product-budget";
  trackingStatus.textContent =
    product.trackingLabel ||
    (product.commissionable
      ? `Affiliate tracked${product.affiliateNetwork ? ` via ${product.affiliateNetwork}` : ""}`
      : "Not affiliate tracked yet");
  if (budget) {
    budget.className = "look-product-budget";
    budget.textContent = `Budget target: ${product.budgetRange}`;
    copy.append(pieceLabel, brand, title, price, matchStatus, trackingStatus, budget);
  } else {
    copy.append(pieceLabel, brand, title, price, matchStatus, trackingStatus);
  }

  const actions = document.createElement("div");
  actions.className = "look-product-actions";

  const action = product.buyLink ? document.createElement("a") : document.createElement("span");
  action.className = "look-product-action";
  if (product.buyLink) {
    action.href = product.buyLink;
    action.target = "_blank";
    action.rel = "noopener noreferrer sponsored";
    action.setAttribute("aria-label", `Shop ${piece.label}`);
  } else {
    action.classList.add("is-disabled");
    action.setAttribute("aria-label", `${piece.label} product link unavailable`);
  }
  action.textContent = product.actionLabel || (product.buyLink ? "Shop" : "Unavailable");

  const nearbyAction = document.createElement("a");
  nearbyAction.className = "look-product-action look-product-nearby";
  nearbyAction.dataset.nearbyProduct = "true";
  nearbyAction.dataset.nearbyBrand = product.brand || "";
  nearbyAction.dataset.nearbyPiece = piece.label || "";
  nearbyAction.dataset.nearbyStoreUrl = product.nearbyStoreUrl || "";
  nearbyAction.dataset.nearbyStoreMode = product.nearbyStoreMode || "";
  nearbyAction.dataset.nearbyStoreLabel = product.nearbyStoreLabel || "";
  nearbyAction.setAttribute("aria-label", `Find nearby stores for ${product.brand || piece.label}`);
  actions.append(action, nearbyAction);

  row.append(copy, actions);
  applyNearbyLinks(row);
  return row;
}

function createProductMeta(message) {
  const meta = document.createElement("div");
  meta.className = "look-product-meta";
  meta.textContent = message;
  return meta;
}

function createProductNotice(message) {
  const notice = document.createElement("div");
  notice.className = "look-product-notice";
  notice.textContent = message;
  return notice;
}

function absoluteProjectUrl(rawUrl = "") {
  try {
    return new URL(rawUrl, window.location.href).toString();
  } catch {
    return rawUrl;
  }
}

function productAssetCandidates(...urls) {
  return urls
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .flatMap((value) => {
      const normalized = value.replace(/^\.?\//, "");
      const withPrefix = normalized.startsWith("../") ? normalized : `${PROJECT_ROOT_RELATIVE_PREFIX}${normalized}`;
      const candidates = [value, normalized, withPrefix];
      return candidates.filter((candidate, index, all) => all.indexOf(candidate) === index);
    });
}

function marketAssetCandidates(kind, countryCode = inferredCountryCode()) {
  const normalizedCountry = String(countryCode || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalizedCountry)) return [];

  if (kind === "library") {
    return productAssetCandidates(
      `data/product-library-${normalizedCountry.toLowerCase()}.json`,
      `assets/product-library-${normalizedCountry.toLowerCase()}.json`,
    );
  }

  if (kind === "combinations") {
    return productAssetCandidates(
      `data/outfit-combination-crops/${normalizedCountry.toLowerCase()}/manifest.json`,
      `assets/outfit-combinations/${normalizedCountry.toLowerCase()}/manifest.json`,
    );
  }

  return [];
}

async function fetchFirstJson(candidates) {
  let lastError = null;
  for (const candidate of candidates) {
    const href = absoluteProjectUrl(candidate);
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) throw new Error(`request failed with ${response.status}`);
      const payload = await response.json();
      return { payload, href, candidate };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No JSON candidate could be loaded.");
}

function normalizeProductImageUrl(product = {}) {
  const localPath = String(product.localImagePath || product.sourceImage || product.cropImage || "").trim();
  if (localPath) return absoluteProjectUrl(`${PROJECT_ROOT_RELATIVE_PREFIX}${localPath.replace(/^\.?\//, "")}`);
  const remoteUrl = String(product.imageUrl || "").trim();
  return /^https?:\/\//i.test(remoteUrl) ? remoteUrl : "";
}

function productLibraryCandidates() {
  return [
    ...marketAssetCandidates("library"),
    ...productAssetCandidates(PRODUCT_LIBRARY_URL, PRODUCT_LIBRARY_FALLBACK_URL),
  ].filter((candidate, index, all) => all.indexOf(candidate) === index);
}

function productCombinationCandidates() {
  return [
    ...marketAssetCandidates("combinations"),
    ...productAssetCandidates(PRODUCT_COMBINATION_MANIFEST_URL, PRODUCT_COMBINATION_FALLBACK_URL),
  ].filter((candidate, index, all) => all.indexOf(candidate) === index);
}

async function loadProductLibrary() {
  if (!productLibraryDataPromise) {
    productLibraryDataPromise = fetchFirstJson(productLibraryCandidates())
      .then(({ payload, href }) => ({
        ...payload,
        __resolvedHref: href,
      }))
      .catch(() => null);
  }
  return productLibraryDataPromise;
}

function productLibraryIndexKey(product = {}) {
  return [
    String(product.season || "").trim().toLowerCase(),
    String(product.look || "").trim().toLowerCase(),
    String(product.piece || "").trim().toLowerCase(),
    String(product.brand || "").trim().toLowerCase(),
  ].join("::");
}

function approvedBrandSetForCountry(countryCode = "") {
  switch (String(countryCode || "").trim().toUpperCase()) {
    case "HK":
      return new Set(["zalora hk", "taobao hk"]);
    case "MY":
      return new Set(["love bonito my", "jd sports my"]);
    default:
      return null;
  }
}

function approvedBrandNameForProduct(product = {}, countryCode = "") {
  const normalizedBrand = String(product.brand || "").trim().toLowerCase();
  const allowed = approvedBrandSetForCountry(countryCode);
  if (!allowed || allowed.has(normalizedBrand)) return normalizedBrand;

  const normalizedLink = String(product.buyLink || product.affiliateLink || "").trim().toLowerCase();
  if (String(countryCode || "").trim().toUpperCase() === "HK" && normalizedLink.includes("zalora.com.hk")) {
    return "zalora hk";
  }
  if (String(countryCode || "").trim().toUpperCase() === "HK" && normalizedLink.includes("taobao.com")) {
    return "taobao hk";
  }
  if (String(countryCode || "").trim().toUpperCase() === "MY") {
    if (normalizedLink.includes("lovebonito.com/my")) return "love bonito my";
    if (normalizedLink.includes("jdsports.my")) return "jd sports my";
  }
  return "";
}

async function loadProductLibraryIndex() {
  if (!productLibraryIndexPromise) {
    productLibraryIndexPromise = loadProductLibrary().then((library) => {
      const index = new Map();
      const products = Array.isArray(library?.products) ? library.products : [];
      products.forEach((product) => {
        const key = productLibraryIndexKey(product);
        if (!key || index.has(key)) return;
        index.set(key, product);
      });
      return index;
    });
  }
  return productLibraryIndexPromise;
}

async function hydrateProductsFromLibrary(rows = [], run = null, idea = null) {
  const index = await loadProductLibraryIndex().catch(() => new Map());
  return rows.map((row) => {
    const product = row?.product || {};
    const countryCode = String(product.countryCode || row?.countryCode || inferredCountryCode() || "").trim().toUpperCase();
    const approvedBrand = approvedBrandNameForProduct(product, countryCode);
    if (!approvedBrand) return row;
    const libraryKey = productLibraryIndexKey({
      season: run?.profile?.name || "",
      look: idea?.title || "",
      piece: row?.piece?.label || "",
      brand: approvedBrand,
    });
    const libraryMatch = index.get(libraryKey);
    if (!libraryMatch) return row;
    const hasExactProductPage = !product.isFallback && looksLikeSpecificProductPage(product.buyLink || product.affiliateLink || "");
    const shouldUpgrade = product.isFallback || !hasExactProductPage || !normalizeProductImageUrl(product);
    if (!shouldUpgrade) return row;
    return {
      ...row,
      usedAffiliate: !libraryMatch.isFallback,
      reason: libraryMatch.isFallback ? row.reason : "",
      product: {
        ...product,
        productName: libraryMatch.productName || product.productName || "",
        brand: libraryMatch.brand || product.brand || "",
        price: libraryMatch.price || product.price || "",
        budgetRange: libraryMatch.budgetRange || product.budgetRange || "",
        buyLink: libraryMatch.affiliateLink || libraryMatch.buyLink || product.buyLink || "",
        affiliateLink: libraryMatch.affiliateLink || libraryMatch.buyLink || product.affiliateLink || "",
        isFallback: Boolean(libraryMatch.isFallback),
        actionLabel:
          libraryMatch.actionLabel ||
          (!libraryMatch.isFallback && (libraryMatch.affiliateLink || libraryMatch.buyLink) ? "Shop" : product.actionLabel || "Search"),
        commissionable: Boolean(libraryMatch.commissionable),
        affiliateNetwork: libraryMatch.affiliateNetwork || product.affiliateNetwork || "",
        trackingStatus: libraryMatch.trackingStatus || product.trackingStatus || "",
        trackingLabel: libraryMatch.trackingLabel || product.trackingLabel || "",
        localImagePath: product.localImagePath || libraryMatch.localImagePath || libraryMatch.sourceImage || "",
        imageUrl: product.imageUrl || libraryMatch.imageUrl || "",
      },
    };
  });
}

function seasonFamilyName(seasonName) {
  const normalized = String(seasonName || "").toLowerCase();
  if (normalized.includes("spring")) return "Spring";
  if (normalized.includes("summer")) return "Summer";
  if (normalized.includes("autumn") || normalized.includes("fall")) return "Autumn";
  if (normalized.includes("winter")) return "Winter";
  return "";
}

async function productCombinationManifest() {
  if (!productCombinationManifestPromise) {
    productCombinationManifestPromise = fetchFirstJson(productCombinationCandidates())
      .then(({ payload, href }) => ({
        ...payload,
        __resolvedHref: href,
      }))
      .catch(() => null);
  }
  return productCombinationManifestPromise;
}

async function combinationBoardForLook(run, idea) {
  const manifest = await productCombinationManifest();
  const combinations = Array.isArray(manifest?.combinations) ? manifest.combinations : [];
  const countryCode = inferredCountryCode();
  const family = seasonFamilyName(run.profile?.name);
  const match =
    combinations.find(
      (combination) =>
        String(combination.countryCode || "").trim().toUpperCase() === countryCode &&
        combination.mode === "family" &&
        combination.seasonFamily === family &&
        combination.look === idea.title,
    ) ||
    combinations.find(
      (combination) =>
        String(combination.countryCode || "").trim().toUpperCase() === countryCode &&
        combination.season === run.profile?.name &&
        combination.look === idea.title,
    ) ||
    combinations.find((combination) => combination.mode === "family" && combination.seasonFamily === family && combination.look === idea.title) ||
    combinations.find((combination) => combination.season === run.profile?.name && combination.look === idea.title);
  if (!match?.boardImage) return null;
  if (Array.isArray(match.products) && match.products.length) {
    const allApproved = match.products.every((product) => approvedBrandNameForProduct(product, countryCode));
    if (!allApproved) return null;
  }
  const boardImage = normalizeProductImageUrl({ localImagePath: match.boardImage, imageUrl: match.boardImage });
  return {
    ...match,
    boardUrl: boardImage,
  };
}

function createLibraryProductRow(product) {
  const row = document.createElement("article");
  row.className = "library-product-row";
  if (product.isFallback) row.classList.add("is-fallback");

  const imageUrl = normalizeProductImageUrl(product);
  if (imageUrl) {
    const image = document.createElement("img");
    image.className = "library-product-image";
    image.src = imageUrl;
    image.alt = product.productName || "Product image";
    image.loading = "lazy";
    row.appendChild(image);
  } else {
    const marker = document.createElement("span");
    marker.className = "product-marker";
    marker.textContent = String(product.piece || product.brand || "P").slice(0, 1).toUpperCase();
    row.appendChild(marker);
  }

  const copy = document.createElement("div");
  const meta = document.createElement("span");
  const title = document.createElement("strong");
  const status = document.createElement("small");
  meta.textContent = [product.season, product.look, product.piece].filter(Boolean).join(" / ");
  title.textContent = `${product.productName || "Product"}${product.brand ? ` - ${product.brand}` : ""}`;
  status.textContent = [
    product.isFallback ? "Fallback search link" : "Exact product",
    product.trackingLabel || (product.commissionable ? "affiliate tracked" : "not affiliate tracked"),
    imageUrl ? "has exact image" : "no image",
    product.localImagePath ? `cached: ${product.localImagePath}` : product.imageCacheStatus,
  ]
    .filter(Boolean)
    .join(" | ");
  copy.append(meta, title, status);

  const action = product.affiliateLink ? document.createElement("a") : document.createElement("span");
  action.className = "look-product-action";
  action.textContent = product.actionLabel || (product.affiliateLink ? "Open" : "No link");
  if (product.affiliateLink) {
    action.href = product.affiliateLink;
    action.target = "_blank";
    action.rel = "noopener noreferrer sponsored";
  } else {
    action.classList.add("is-disabled");
  }

  row.append(copy, action);
  return row;
}

async function hydrateProductLibraryPanel() {
  if (!productLibrarySummary || !productLibraryList) return;
  try {
    const library = await loadProductLibrary();
    if (!library) throw new Error("Library request failed");
    const summary = library.summary || {};
    const diagnostics = Array.isArray(library.affiliateDiagnostics) ? library.affiliateDiagnostics : [];
    const products = Array.isArray(library.products) ? library.products : [];
    productLibrarySummary.textContent =
      `${summary.products || products.length || 0} rows loaded for ${library.countryCode || "HK"}: ${summary.exactProducts || 0} exact products, ${summary.fallbackSearchLinks || 0} fallback search links, ${summary.commissionableProducts || 0} affiliate-tracked links, ${summary.cachedImages || 0} cached images.`;

    const children = [];
    const openJson = document.createElement("a");
    openJson.className = "library-json-link";
    openJson.href = library.__resolvedHref || absoluteProjectUrl(PRODUCT_LIBRARY_URL);
    openJson.target = "_blank";
    openJson.rel = "noopener noreferrer";
    openJson.textContent = "Open raw product-library.json";
    children.push(openJson);

    if (diagnostics.length) {
      const diagnosticBox = document.createElement("div");
      diagnosticBox.className = "library-diagnostics";
      const title = document.createElement("strong");
      title.textContent = "Affiliate diagnostics";
      const list = document.createElement("ul");
      diagnostics.slice(0, 6).forEach((detail) => {
        const item = document.createElement("li");
        item.textContent = detail;
        list.appendChild(item);
      });
      diagnosticBox.append(title, list);
      children.push(diagnosticBox);
    }

    children.push(...products.slice(0, 24).map((product) => createLibraryProductRow(product)));
    productLibraryList.replaceChildren(...children);
  } catch (error) {
    productLibrarySummary.textContent =
      "Product library JSON is not published with this static site yet. You can still inspect it locally in data/product-library.json.";
    productLibraryList.replaceChildren();
  }
}

function createRunlogRow(idea, index) {
  const row = document.createElement("article");
  row.className = "results-runlog-row is-working";
  row.dataset.lookKey = idea.title;

  const indexChip = document.createElement("span");
  indexChip.className = "results-runlog-index";
  indexChip.textContent = `0${index + 1}`;

  const copy = document.createElement("div");
  const title = document.createElement("strong");
  const detail = document.createElement("p");
  title.textContent = idea.title;
  detail.textContent = "Queued for product matching and image generation.";
  copy.append(title, detail);

  const badge = document.createElement("span");
  badge.className = "results-runlog-badge";
  badge.textContent = LOOK_LOG_PHASE_LABELS.queued;

  row.append(indexChip, copy, badge);
  return { row, detail, badge };
}

function setRunlogState(lookKey, phase, message) {
  const entry = femaleRunlogRows.get(lookKey);
  if (!entry) return;
  const nextPriority = LOOK_LOG_PHASE_PRIORITY[phase] ?? 0;
  const currentPriority = LOOK_LOG_PHASE_PRIORITY[entry.phase] ?? -1;
  if (nextPriority < currentPriority) return;
  entry.phase = phase;
  entry.row.classList.remove("is-working", "is-success", "is-fallback", "is-error");

  const visualPhase =
    phase === "success" || phase === "sample"
      ? "is-success"
      : phase === "fallback"
        ? "is-fallback"
        : phase === "error"
          ? "is-error"
          : "is-working";

  entry.row.classList.add(visualPhase);
  entry.badge.textContent = LOOK_LOG_PHASE_LABELS[phase] || phase;
  entry.detail.textContent = message;
}

function initialiseFemaleRunlog() {
  if (!resultsRunlog) return;
  femaleRunlogRows.clear();
  resultsRunlog.innerHTML = "";
  femaleOutfitIdeas.forEach((idea, index) => {
    const entry = createRunlogRow(idea, index);
    entry.phase = "queued";
    femaleRunlogRows.set(idea.title, entry);
    resultsRunlog.appendChild(entry.row);
  });
}

async function generatedReferenceImage(prompt, options = {}) {
  const width = options.width || 800;
  const height = options.height || 1000;
  const maxReferenceImages = Math.max(1, Math.min(8, Number(options.maxReferenceImages) || IMAGE_REFERENCE_MAX_COUNT));
  const referenceImages = Array.isArray(options.referenceImages)
    ? options.referenceImages.filter(Boolean).slice(0, maxReferenceImages)
    : [];
  const allowTextFallback = options.allowTextFallback ?? referenceImages.length === 0;
  const explicitEndpoint =
    window.IC_IMAGE_GENERATION_ENDPOINT ||
    window.IC_IMAGE_ENDPOINT ||
    safeStorageValue("icImageGenerationEndpoint") ||
    safeStorageValue("icImageEndpoint") ||
    "";
  const { endpoint, isExplicit } = endpointConfig("/api/generate-style-image", explicitEndpoint);

  if (!window.fetch || shouldSkipApiEndpoint(endpoint, isExplicit)) {
    if (!allowTextFallback) {
      throw new Error("Reference-preserving image generation requires the backend image endpoint.");
    }
    return {
      imageUrl: generatedImageUrl(prompt, options),
      provider: "text-fallback",
      usedReferences: false,
    };
  }

  if (!referenceImages.length) {
    if (!allowTextFallback) {
      throw new Error("Reference image is required for this render.");
    }
    return {
      imageUrl: generatedImageUrl(prompt, options),
      provider: "text-fallback",
      usedReferences: false,
    };
  }

  const controller = window.AbortController ? new AbortController() : null;
  const timeout = controller ? window.setTimeout(() => controller.abort(), options.timeoutMs || IMAGE_REQUEST_TIMEOUT_MS) : 0;
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        width,
        height,
        seed: options.seed,
        referenceImages,
        providerOrder: options.providerOrder || IMAGE_REFERENCE_PROVIDER_ORDER,
        disallowLocalTemplate: options.disallowLocalTemplate === true,
      }),
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Image request timed out after ${options.timeoutMs || IMAGE_REQUEST_TIMEOUT_MS}ms.`);
    }
    throw error;
  } finally {
    if (timeout) window.clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const backendError = new Error(String(payload?.detail || payload?.error || "Reference image generation failed."));
    backendError.attempts = Array.isArray(payload?.attempts) ? payload.attempts : [];
    throw backendError;
  }

  const imageUrl = payload.imageUrl || payload.imageDataUrl;
  if (!imageUrl) throw new Error("Reference image generation returned no image.");
  return {
    imageUrl,
    provider: payload.provider || "reference-generation",
    usedReferences: true,
    attempts: Array.isArray(payload.attempts) ? payload.attempts : [],
    debug: payload.debug || null,
  };
}

function setLookImageStatus(statusElement, message) {
  if (!statusElement) return;
  statusElement.textContent = message;
}

function femaleLookStateKey(run, idea, index) {
  return `${run.profile?.name || "profile"}::${index}::${idea.title}`;
}

function setLookActionState(actionButton, label, disabled) {
  if (!actionButton) return;
  actionButton.textContent = label;
  actionButton.disabled = Boolean(disabled);
}

function setLookErrorState(cardState, message) {
  if (!cardState) return;
  cardState.image.removeAttribute("src");
  cardState.image.dataset.renderState = "error";
  cardState.image.setAttribute("aria-hidden", "true");
  setLookImageStatus(cardState.imageStatus, message);
  setLookActionState(cardState.regenerateButton, "Regenerate", false);
}

function setLookFallbackState(cardState, imageUrl, message) {
  if (!cardState) return;
  if (!imageUrl) {
    setLookErrorState(cardState, message);
    return;
  }
  cardState.image.dataset.renderState = "fallback";
  cardState.image.removeAttribute("aria-hidden");
  cardState.image.onload = null;
  cardState.image.onerror = () => {
    setLookErrorState(cardState, "Fallback image could not be displayed.");
  };
  cardState.image.src = imageUrl;
  setLookImageStatus(cardState.imageStatus, message);
  setLookActionState(cardState.regenerateButton, "Regenerate", false);
}

async function copyTextToClipboard(text) {
  const value = String(text || "");
  if (!value) throw new Error("Nothing to copy.");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const success = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!success) throw new Error("Clipboard copy is not available in this browser.");
}

function triggerDownload(url, filename) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function safeFileSlug(value, fallback = "reference") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function dataUrlExtension(dataUrl = "") {
  const match = String(dataUrl).match(/^data:image\/([a-z0-9.+-]+);base64,/i);
  if (!match) return "png";
  const subtype = match[1].toLowerCase();
  if (subtype.includes("jpeg") || subtype.includes("jpg")) return "jpg";
  if (subtype.includes("webp")) return "webp";
  return "png";
}

function geminiReferenceInstructions(lookTitle, referenceCount) {
  const garmentCount = Math.max(0, referenceCount - 1);
  return [
    "Gemini Flash handoff:",
    "Image 1 must be the face and hairstyle identity reference.",
    garmentCount
      ? `Images 2-${referenceCount} are garment-only references. They must influence clothing and accessories only, never the face or hair.`
      : "No garment reference image is attached, so style the outfit from the prompt text only.",
    "If the model starts changing the face, expression, or hairstyle, stop and rerun with identity preservation prioritized over outfit accuracy.",
  ].join("\n");
}

async function collectLookReferenceBundle(run, idea, rows = []) {
  const resolvedRows = Array.isArray(rows) ? rows : [];
  const faceReference = run.faceReferenceDataUrl || (await faceReferenceDataUrl()) || "";
  if (!faceReference) {
    throw new Error("No saved face reference is available for this look.");
  }

  const combinationBoard = await Promise.race([
    combinationBoardForLook(run, idea),
    delay(LOOK_REFERENCE_WAIT_MS).then(() => null),
  ]);

  const productImageUrls = resolvedRows
    .filter(({ product }) => product.buyLink && /^https?:\/\//i.test(product.imageUrl))
    .sort((left, right) => productReferencePriority(left) - productReferencePriority(right))
    .map(({ product }) => product.imageUrl)
    .filter((url, index, all) => all.indexOf(url) === index)
    .slice(0, MAX_AUTOMATIC_PRODUCT_REFERENCE_IMAGES);

  const garmentReferences = combinationBoard?.boardUrl ? [combinationBoard.boardUrl] : productImageUrls;
  return {
    faceReference,
    garmentReferences,
    combinationBoard,
    referenceImages: [faceReference, ...garmentReferences].filter(Boolean).slice(0, IMAGE_REFERENCE_MAX_COUNT),
  };
}

async function downloadLookReferenceBundle(run, idea, rows = []) {
  const bundle = await collectLookReferenceBundle(run, idea, rows);
  const lookSlug = safeFileSlug(idea.title, "look");

  triggerDownload(bundle.faceReference, `${lookSlug}-face-reference.${dataUrlExtension(bundle.faceReference)}`);
  bundle.garmentReferences.forEach((referenceUrl, index) => {
    const extension = /^data:/i.test(referenceUrl)
      ? dataUrlExtension(referenceUrl)
      : (() => {
          try {
            const pathname = new URL(referenceUrl, window.location.href).pathname;
            const match = pathname.match(/\.([a-z0-9]+)$/i);
            return match ? match[1].toLowerCase() : "png";
          } catch {
            return "png";
          }
        })();
    triggerDownload(referenceUrl, `${lookSlug}-reference-${index + 2}.${extension}`);
  });

  return bundle;
}

async function copyGeminiLookPrompt(run, idea, index, rows = []) {
  const bundle = await collectLookReferenceBundle(run, idea, rows);
  const prompt = buildReferencedFemaleLookPrompt(run, idea, index, rows);
  const handoffText = [
    prompt,
    "",
    geminiReferenceInstructions(idea.title, bundle.referenceImages.length),
  ].join("\n");
  await copyTextToClipboard(handoffText);
  return bundle;
}

function runQueuedImageGeneration(task) {
  return new Promise((resolve, reject) => {
    const launch = () => {
      activeImageGenerationJobs += 1;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          activeImageGenerationJobs = Math.max(0, activeImageGenerationJobs - 1);
          const next = pendingImageGenerationJobs.shift();
          if (next) next();
        });
    };

    if (activeImageGenerationJobs < IMAGE_REQUEST_MAX_CONCURRENCY) {
      launch();
      return;
    }

    pendingImageGenerationJobs.push(launch);
  });
}

function formatImageAttempts(attempts = []) {
  const failed = attempts
    .filter((attempt) => attempt?.status === "failed")
    .map((attempt) => `${attempt.provider}: ${attempt.detail}`)
    .filter(Boolean);
  const skipped = attempts
    .filter((attempt) => attempt?.status === "skipped")
    .map((attempt) => `${attempt.provider}: ${attempt.detail}`)
    .filter(Boolean);
  return { failed, skipped };
}

function createPromptInspector(prompt, providerOrder = IMAGE_REFERENCE_PROVIDER_ORDER) {
  const details = document.createElement("details");
  details.className = "look-prompt-inspector";
  const summary = document.createElement("summary");
  summary.textContent = "View exact generation prompt";
  const meta = document.createElement("p");
  meta.textContent = `Reference fallback order: ${providerOrder.join(" -> ") || "backend default"}`;
  const pre = document.createElement("pre");
  pre.textContent = prompt || "Prompt will appear when this look starts rendering.";
  details.append(summary, meta, pre);
  return details;
}

function upsertPromptInspector(cardState, prompt) {
  if (!cardState?.body) return;
  let inspector = cardState.body.querySelector(".look-prompt-inspector");
  if (!inspector) {
    inspector = createPromptInspector(prompt);
    const rackTitle = cardState.body.querySelector("h3");
    cardState.body.insertBefore(inspector, rackTitle || null);
    return;
  }
  const pre = inspector.querySelector("pre");
  if (pre) pre.textContent = prompt || "";
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function hydrateLookImage(run, idea, index, image, statusElement, rowsOrPromise = [], options = {}) {
  const cardState = options.cardState || null;
  const seed = hashText(`${run.profile.name}-${idea.title}-${JSON.stringify(run.selections)}`);
  let resolvedRows = [];
  if (rowsOrPromise && typeof rowsOrPromise.then === "function") {
    try {
      resolvedRows = await Promise.race([rowsOrPromise, delay(LOOK_REFERENCE_WAIT_MS).then(() => [])]);
    } catch (error) {
      resolvedRows = [];
    }
  } else {
    resolvedRows = Array.isArray(rowsOrPromise) ? rowsOrPromise : [];
  }
  resolvedRows = resolvedRows.map((row) => ({
    ...row,
    product: {
      ...row.product,
      imageUrl: normalizeProductImageUrl(row.product),
    },
  }));

  const productImageUrls = resolvedRows
    .filter(({ product }) => product.buyLink && /^https?:\/\//i.test(product.imageUrl))
    .sort((left, right) => productReferencePriority(left) - productReferencePriority(right))
    .map(({ product }) => product.imageUrl)
    .filter((url, index, all) => all.indexOf(url) === index)
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, MAX_AUTOMATIC_PRODUCT_REFERENCE_IMAGES);
  const combinationBoard = await Promise.race([
    combinationBoardForLook(run, idea),
    delay(LOOK_REFERENCE_WAIT_MS).then(() => null),
  ]);
  if (!run.faceReferenceDataUrl) {
    setLookFallbackState(cardState, idea.fallbackImage, "Face reference was unavailable, so a fallback look image is shown.");
    setRunlogState(idea.title, "fallback", "Face reference was unavailable, so the fallback look image is shown.");
    return {
      imageUsedReferences: false,
      productReferenceCount: productImageUrls.length,
      imageProvider: "fallback",
    };
  }
  const productReferenceImages = combinationBoard?.boardUrl ? [combinationBoard.boardUrl] : productImageUrls;
  const referenceImages = [run.faceReferenceDataUrl, ...productReferenceImages].filter(Boolean).slice(0, IMAGE_REFERENCE_MAX_COUNT);
  const prompt = buildReferencedFemaleLookPrompt(run, idea, index, resolvedRows);
  const fallbackImageUrl = idea.fallbackImage;
  upsertPromptInspector(cardState, prompt);

  setLookImageStatus(
    statusElement,
    run.faceReferenceDataUrl
      ? "Generating with scanned face reference..."
      : "Generating from colour profile...",
  );
  setRunlogState(
    idea.title,
    "rendering",
    combinationBoard?.boardUrl
      ? "Rendering with scanned face plus one outfit-combination board."
      : productImageUrls.length
        ? `Rendering with the scanned face plus ${productImageUrls.length} garment reference image${productImageUrls.length === 1 ? "" : "s"}.`
      : "Rendering with the scanned face and product text only.",
  );

  try {
    if (activeImageGenerationJobs >= IMAGE_REQUEST_MAX_CONCURRENCY) {
      setLookImageStatus(statusElement, "Waiting for an image generation slot...");
      setRunlogState(
        idea.title,
        "rendering",
        `Queued behind ${activeImageGenerationJobs} in-flight render${activeImageGenerationJobs === 1 ? "" : "s"} to avoid provider rate limits.`,
      );
    }
    const result = await runQueuedImageGeneration(() => {
      setLookImageStatus(statusElement, "Generating with scanned face reference...");
      if (cardState) {
        cardState.image.dataset.renderState = "loading";
        cardState.image.removeAttribute("aria-hidden");
        setLookActionState(cardState.regenerateButton, "Rendering...", true);
      }
      setRunlogState(
        idea.title,
        "rendering",
        combinationBoard?.boardUrl
          ? "Rendering now with Image 1 face plus Image 2 outfit-combination board."
          : productImageUrls.length
            ? `Rendering now with the scanned face plus ${productImageUrls.length} garment reference image${productImageUrls.length === 1 ? "" : "s"}.`
          : "Rendering now with the scanned face and product text only.",
      );
      return generatedReferenceImage(prompt, {
        width: 800,
        height: 1000,
        seed,
        referenceImages,
        maxReferenceImages: IMAGE_REFERENCE_MAX_COUNT,
        allowTextFallback: false,
        providerOrder: IMAGE_REFERENCE_PROVIDER_ORDER,
        disallowLocalTemplate: false,
      });
    });
    image.onload = () => {
      const attemptSummary = formatImageAttempts(result.attempts);
      if (cardState) {
        cardState.image.dataset.renderState = "ready";
        cardState.image.removeAttribute("aria-hidden");
        setLookActionState(cardState.regenerateButton, "Regenerate", false);
      }
      setLookImageStatus(
        statusElement,
        result.usedReferences
          ? productReferenceImages.length
            ? combinationBoard?.boardUrl
              ? "Generated from scanned face and outfit-combination board."
              : "Generated from scanned face and garment references."
            : "Generated from scanned face and product text."
          : "Generated from styling prompt.",
      );
      setRunlogState(
        idea.title,
        "success",
        result.usedReferences
          ? `Image ready via ${result.provider} with the scanned face${combinationBoard?.boardUrl ? " and outfit board" : productImageUrls.length ? " and garment references" : ""}.${attemptSummary.failed.length ? ` Earlier provider failures were skipped over automatically.` : ""}`
          : `Image ready via ${result.provider} without reference images.${attemptSummary.failed.length ? ` Earlier provider failures were skipped over automatically.` : ""}`,
      );
    };
    image.onerror = () => {
      setLookErrorState(cardState, "Image generation failed. The returned image could not be displayed.");
      setRunlogState(idea.title, "error", "The provider returned an unreadable image for this look.");
    };
    image.src = result.imageUrl;
    return {
      imageUsedReferences: result.usedReferences,
      productReferenceCount: productReferenceImages.length,
      combinationBoard: combinationBoard?.boardImage || "",
      imageProvider: result.provider,
    };
  } catch (error) {
    const attemptSummary = formatImageAttempts(error?.attempts || []);
    setLookFallbackState(
      cardState,
      fallbackImageUrl,
      "AI try-on failed, so a fallback look image is shown instead.",
    );
    setRunlogState(
      idea.title,
      "fallback",
      `All reference-capable providers failed, so the fallback look image is shown${attemptSummary.failed.length ? `: ${attemptSummary.failed.join(" | ")}` : error?.message ? `: ${error.message}` : "."}`,
    );
    return {
      imageUsedReferences: false,
      productReferenceCount: productReferenceImages.length,
      combinationBoard: combinationBoard?.boardImage || "",
      imageProvider: "fallback",
    };
  }
}

function productReferencePriority(row) {
  const label = `${row?.piece?.label || ""} ${row?.product?.productName || ""}`.toLowerCase();
  if (/(dress|coat|jacket|blazer|shirt|top|blouse|knit|sweater|cardigan|trouser|pants|jean|skirt|heel|shoe|boot)/.test(label)) {
    return 0;
  }
  if (/(bag|earring|necklace|ring|bracelet|watch|belt|scarf|jewell?ery)/.test(label)) return 2;
  return 1;
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
    image.removeAttribute("src");
    image.dataset.renderState = "error";
    image.setAttribute("aria-hidden", "true");
    imageStatus.textContent = "Image generation failed for this look.";
  };
  if (run.sample) image.src = idea.fallbackImage;
  image.alt = `${idea.title} generated outfit for ${run.profile.name}`;
  image.loading = index === 0 ? "eager" : "lazy";
  image.dataset.renderState = run.sample ? "sample" : "idle";
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

  const imageActions = document.createElement("div");
  imageActions.className = "generated-look-actions";
  const regenerateButton = document.createElement("button");
  regenerateButton.type = "button";
  regenerateButton.className = "generated-look-regenerate";
  regenerateButton.textContent = "Regenerate";
  regenerateButton.disabled = run.sample;
  imageActions.appendChild(regenerateButton);

  const copyPromptButton = document.createElement("button");
  copyPromptButton.type = "button";
  copyPromptButton.className = "generated-look-secondary";
  copyPromptButton.textContent = "Copy Gemini prompt";
  copyPromptButton.disabled = run.sample;
  imageActions.appendChild(copyPromptButton);

  const downloadRefsButton = document.createElement("button");
  downloadRefsButton.type = "button";
  downloadRefsButton.className = "generated-look-secondary";
  downloadRefsButton.textContent = "Download refs";
  downloadRefsButton.disabled = run.sample;
  imageActions.appendChild(downloadRefsButton);

  const rackTitle = document.createElement("h3");
  rackTitle.textContent = "Product links";

  const productList = document.createElement("div");
  productList.className = "look-product-list";
  productList.setAttribute("aria-label", `${idea.title} product links`);
  const loading = document.createElement("div");
  loading.className = "look-product-loading";
  loading.textContent = "Finding matching pieces...";
  productList.appendChild(loading);

  body.append(top, pieceList, imageActions, rackTitle, productList);
  card.append(media, body);
  return {
    card,
    body,
    productList,
    image,
    imageStatus,
    regenerateButton,
    copyPromptButton,
    downloadRefsButton,
  };
}

async function hydrateLookProducts(run, idea, productList) {
  const countryCode = inferredCountryCode();
  const maxProductsPerPiece = productOptionsPerPiece(countryCode);
  setRunlogState(idea.title, "products", "Matching product links for this look.");
  const pieceResults = await Promise.all(
    idea.pieces.map(async (piece) => {
      const query = pieceSearchQuery(piece, run, idea);
      const lookup = await fetchMatchingClothes(query, run.profile.name, {
        budget: run.selections?.budget,
        countryCode,
      });
      const liveProducts = lookup.products.slice(0, maxProductsPerPiece);
      const products = liveProducts.length
        ? liveProducts
        : [unavailableProduct(piece, { budgetRange: lookup.budgetRange })];
      return products.map((product) => ({
        piece,
        product,
        usedAffiliate: Boolean(liveProducts.length && !product.isFallback),
        reason: lookup.reason,
      }));
    }),
  );
  const rows = await hydrateProductsFromLibrary(pieceResults.flat(), run, idea);

  const affiliateCount = rows.filter((row) => row.usedAffiliate).length;
  const fallbackCount = rows.length - affiliateCount;
  const firstReason = rows.find((row) => row.reason)?.reason || "";
  const budgetRange = rows.map((row) => row.product.budgetRange).find(Boolean) || "";
  const children = [];

  if (budgetRange) {
    children.push(createProductMeta(`Budget target for this region: ${budgetRange}`));
  }

  if (maxProductsPerPiece > 1) {
    children.push(createProductMeta(`Showing up to ${maxProductsPerPiece} matched options per piece for ${marketLabel(countryCode)}.`));
  }

  if (fallbackCount > 0) {
    children.push(
      createProductNotice(
        affiliateCount > 0 ? RESULTS_PARTIAL_FALLBACK_MESSAGE : firstReason || RESULTS_FALLBACK_MESSAGE,
      ),
    );
  }

  children.push(...rows.map(({ product, piece }) => createProductRow(product, piece)));
  productList.replaceChildren(...children);
  if (fallbackCount && affiliateCount) {
    setRunlogState(
      idea.title,
      "products",
      `Found ${affiliateCount} live product link${affiliateCount === 1 ? "" : "s"} with ${fallbackCount} fallback item${fallbackCount === 1 ? "" : "s"}.`,
    );
  } else if (fallbackCount) {
    setRunlogState(idea.title, "products", "Product matching is using fallback items while image generation continues.");
  } else {
    setRunlogState(
      idea.title,
      "products",
      `Found ${affiliateCount} live product link${affiliateCount === 1 ? "" : "s"} for this look.`,
    );
  }
  return { affiliateCount, fallbackCount, totalCount: rows.length, rows };
}

function bindLookRegenerate(run, idea, index, cardState, productStatsPromise) {
  if (!cardState?.regenerateButton) return;
  const lookKey = femaleLookStateKey(run, idea, index);
  femaleLookCardState.set(lookKey, { run, idea, index, ...cardState, productStatsPromise });

  cardState.regenerateButton.addEventListener("click", async () => {
    setLookActionState(cardState.regenerateButton, "Rendering...", true);
    setLookImageStatus(cardState.imageStatus, "Retrying image generation...");
    setRunlogState(idea.title, "rendering", "Retrying this look image.");
    const productStats = await productStatsPromise.catch(() => ({ rows: [], affiliateCount: 0, fallbackCount: 0, totalCount: 0 }));
    await hydrateLookImage(run, idea, index, cardState.image, cardState.imageStatus, productStats.rows, { cardState });
  });

  cardState.copyPromptButton?.addEventListener("click", async () => {
    try {
      setLookImageStatus(cardState.imageStatus, "Copying Gemini handoff prompt...");
      const productStats = await productStatsPromise.catch(() => ({
        rows: [],
        affiliateCount: 0,
        fallbackCount: 0,
        totalCount: 0,
      }));
      const bundle = await copyGeminiLookPrompt(run, idea, index, productStats.rows);
      setLookImageStatus(
        cardState.imageStatus,
        `Gemini prompt copied. Use Image 1 for face identity and ${Math.max(0, bundle.referenceImages.length - 1)} garment reference image${Math.max(0, bundle.referenceImages.length - 1) === 1 ? "" : "s"}.`,
      );
      setRunlogState(idea.title, "success", "Copied a manual Gemini Flash handoff prompt for this look.");
    } catch (error) {
      setLookImageStatus(cardState.imageStatus, error?.message || "Could not copy the Gemini prompt.");
    }
  });

  cardState.downloadRefsButton?.addEventListener("click", async () => {
    try {
      setLookImageStatus(cardState.imageStatus, "Preparing downloadable references...");
      const productStats = await productStatsPromise.catch(() => ({
        rows: [],
        affiliateCount: 0,
        fallbackCount: 0,
        totalCount: 0,
      }));
      const bundle = await downloadLookReferenceBundle(run, idea, productStats.rows);
      setLookImageStatus(
        cardState.imageStatus,
        `Downloaded ${bundle.referenceImages.length} reference image${bundle.referenceImages.length === 1 ? "" : "s"} for manual Gemini use.`,
      );
      setRunlogState(idea.title, "success", "Downloaded the face and garment references for manual Gemini Flash rendering.");
    } catch (error) {
      setLookImageStatus(cardState.imageStatus, error?.message || "Could not download the reference images.");
    }
  });
}

function initFemaleResultsPage() {
  if (!femaleLooksGrid) return;

  const run = readFemaleStyleRun();
  renderResultsSummary(run);
  hydrateProductLibraryPanel();
  femaleLooksGrid.innerHTML = "";
  femaleLookCardState.clear();
  initialiseFemaleRunlog();

  const productJobs = femaleOutfitIdeas.map(async (idea, index) => {
    const { card, productList, image, imageStatus, regenerateButton } = renderFemaleLookCard(run, idea, index);
    femaleLooksGrid.appendChild(card);
    const productStatsPromise = hydrateLookProducts(run, idea, productList);
    bindLookRegenerate(run, idea, index, { card, image, imageStatus, regenerateButton, productList }, productStatsPromise);
    const imageStatsPromise = run.sample
      ? (() => {
          setRunlogState(idea.title, "sample", "Sample mode is showing the placeholder look without calling the image backend.");
          return Promise.resolve({ imageUsedReferences: false, productReferenceCount: 0, imageProvider: "sample" });
        })()
      : hydrateLookImage(run, idea, index, image, imageStatus, productStatsPromise.then((stats) => stats.rows), {
          cardState: { card, image, imageStatus, regenerateButton, productList },
        });

    const [productStats, imageStats] = await Promise.all([productStatsPromise, imageStatsPromise]);
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
    const productFallbackCount = stats.reduce((sum, stat) => sum + stat.fallbackCount, 0);
    const imageFallbackCount = stats.filter((stat) => stat.imageProvider === "fallback" || stat.imageProvider === "error").length;

    if (imageFallbackCount && (productFallbackCount || affiliateCount)) {
      resultsStatus.textContent = RESULTS_COMBINED_FALLBACK_MESSAGE;
      return;
    }

    if (imageFallbackCount) {
      resultsStatus.textContent = RESULTS_IMAGE_FALLBACK_MESSAGE;
      return;
    }

    if (productFallbackCount && affiliateCount) {
      resultsStatus.textContent = RESULTS_PARTIAL_FALLBACK_MESSAGE;
      return;
    }

    if (productFallbackCount) {
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
      if (generationStatus) generationStatus.textContent = "Opening five-look results page...";
      window.setTimeout(openFemaleResultsPage, 120);
    } catch (error) {
      if (generationStatus) generationStatus.textContent = "Could not save this scan. Try again.";
      if (generatePhotoButton) generatePhotoButton.disabled = false;
    }
    return;
  }

  const prompt = buildStyleImagePrompt(latestFaceResult);
  if (generationStatus) generationStatus.textContent = IMAGE_GENERATING_MESSAGE;
  if (generatePhotoButton) {
    generatePhotoButton.disabled = true;
    generatePhotoButton.textContent = "Generating...";
  }
  if (generatedStyleImage) {
    try {
      const faceReference = await faceReferenceDataUrl();
      if (!faceReference) throw new Error("Face reference image is unavailable.");

      const result = await generatedReferenceImage(prompt, {
        width: 1200,
        height: 1200,
        seed: hashText(`${latestFaceResult.profile?.name || ""}-${JSON.stringify(currentStyleSelections())}-${styleImageRenderNonce}`),
        referenceImages: [faceReference],
        allowTextFallback: false,
        providerOrder: IMAGE_REFERENCE_PROVIDER_ORDER,
        disallowLocalTemplate: false,
      });

      generatedStyleImage.onload = () => {
        if (generationStatus) generationStatus.textContent = IMAGE_SUCCESS_MESSAGE;
        if (generatePhotoButton) {
          generatePhotoButton.disabled = false;
          generatePhotoButton.textContent = "Regenerate five-look image";
        }
      };
      generatedStyleImage.onerror = () => {
        if (generationStatus) generationStatus.textContent = IMAGE_ERROR_MESSAGE;
        if (generatePhotoButton) {
          generatePhotoButton.disabled = false;
          generatePhotoButton.textContent = "Regenerate five-look image";
        }
      };
      generatedStyleImage.src = result.imageUrl;
      styleImageRenderNonce += 1;
    } catch (error) {
      generatedStyleImage.src = MENS_IMAGE_FALLBACK_URL;
      if (generationStatus) {
        generationStatus.textContent =
          "AI try-on failed, so a sample five-look image is shown instead.";
      }
      if (generatePhotoButton) {
        generatePhotoButton.disabled = false;
        generatePhotoButton.textContent = "Regenerate five-look image";
      }
    }
  }
}

function initFaceColourStudio() {
  if (!faceUpload) return;
  faceUpload.addEventListener("change", (event) => {
    handleFaceUpload(event.target.files?.[0]);
  });
  generatePhotoButton?.addEventListener("click", generateStylePhoto);
}

function initLocationSettings() {
  shopperLocation = readStoredLocation();
  setLocationStatus();
  applyNearbyLinks();
  enableLocationButton?.addEventListener("click", enableNearbyStores);
}

updateHeader();
initProgressObserver();
initWaitlistForm();
initFaceColourStudio();
initLocationSettings();
initFemaleResultsPage();

window.addEventListener("scroll", updateHeader, { passive: true });
