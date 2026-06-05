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
const creatorPrompt = document.getElementById("creatorPrompt");
const copyPromptButton = document.getElementById("copyPromptButton");

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
    const interest = String(data.get("interest") || "demo");

    if (!email) {
      formStatus.textContent = "Add an email to request access.";
      return;
    }

    const label = {
      demo: "retail demo",
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

function scoreSeasons(axes) {
  const weights = { temperature: 1.25, value: 0.85, chroma: 1.05, contrast: 0.82 };
  return seasonProfiles
    .map((profile) => {
      const distance = Object.entries(weights).reduce((sum, [axis, weight]) => {
        return sum + weight * (axes[axis] - profile.axes[axis]) ** 2;
      }, 0);
      return {
        ...profile,
        score: Math.max(0, Math.round((100 - Math.sqrt(distance) * 37) * 10) / 10),
      };
    })
    .sort((a, b) => b.score - a.score);
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
  const samples = [];
  const centerX = size / 2;
  const centerY = size * 0.43;
  const radiusX = size * 0.28;
  const radiusY = size * 0.34;

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
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const range = Math.max(r, g, b) - Math.min(r, g, b);
      if (luma < 35 || luma > 245 || range > 170) continue;
      samples.push({ r, g, b, luma, range });
    }
  }

  if (!samples.length) {
    throw new Error("Could not sample enough face pixels. Try a clearer front-facing photo.");
  }

  const totals = samples.reduce(
    (sum, pixel) => ({
      r: sum.r + pixel.r,
      g: sum.g + pixel.g,
      b: sum.b + pixel.b,
      luma: sum.luma + pixel.luma,
      range: sum.range + pixel.range,
    }),
    { r: 0, g: 0, b: 0, luma: 0, range: 0 },
  );

  const count = samples.length;
  const avg = {
    r: totals.r / count,
    g: totals.g / count,
    b: totals.b / count,
    luma: totals.luma / count,
    saturation: totals.range / count / 255,
  };
  const variance = samples.reduce((sum, pixel) => sum + (pixel.luma - avg.luma) ** 2, 0) / count;
  const lumaStd = Math.sqrt(variance);

  return {
    count,
    axes: {
      temperature: clamp((avg.r - avg.b) / 55),
      value: clamp((145 - avg.luma) / 85),
      chroma: clamp((avg.saturation - 0.24) / 0.22),
      contrast: clamp((lumaStd - 34) / 28),
    },
    average: avg,
  };
}

function buildCreatorPrompt(result) {
  const palette = result.profile.palette.join(", ");
  const axisSummary = [
    axisLabel("temperature", result.axes.temperature),
    axisLabel("value", result.axes.value),
    axisLabel("chroma", result.axes.chroma),
    axisLabel("contrast", result.axes.contrast),
  ].join(", ");

  return [
    "Use the uploaded face photo as the identity reference. Create a sleek men's fashion portrait using the styling direction below.",
    "",
    `Colour profile: ${result.profile.name}. Palette hex colours: ${palette}. Visual read: ${axisSummary}.`,
    `Wardrobe direction: ${result.profile.wardrobe}. Use a polished night-out / luxury menswear feel with tailored clothing, controlled lighting, and premium textures.`,
    "",
    "Identity preservation rules:",
    "- Keep the exact same face identity, face shape, head shape, jawline, cheekbones, forehead, eye shape, eye spacing, nose shape, mouth shape, ears, hairline, hairstyle, facial hair, skin tone, age, and expression.",
    "- Do not beautify, slim, widen, age, de-age, change ethnicity, change eye colour, change hairstyle, change facial hair, or alter the natural face proportions.",
    "- Keep the face angle, camera perspective, and head size close to the reference photo. Do not stretch, warp, liquify, smooth too much, or make the face look like a different person.",
    "- Only change styling elements: outfit, background, lighting, colour palette, accessories, and overall fashion mood.",
    "",
    "Image direction:",
    "A realistic high-end men's style editorial portrait. Tailored fit, clean collar, season-safe near-face colour, subtle luxury styling, natural skin texture, sharp but believable lighting, premium boutique or evening lounge background. Photorealistic, no logos, no text, no watermark.",
    "",
    "Negative prompt:",
    "warped face, changed identity, different person, altered facial structure, distorted eyes, uneven eyes, changed nose, changed lips, changed jawline, plastic skin, over-smoothed face, exaggerated muscles, cartoon, low detail, blurry face, extra fingers, bad hands, watermark, text.",
  ].join("\n");
}

function createBrowserResult(sample) {
  const ranked = scoreSeasons(sample.axes);
  const gap = Math.max(0, ranked[0].score - ranked[1].score);
  const confidence = Math.round(clamp(58 + gap * 1.4 + Math.min(sample.count / 120, 14), 45, 88));
  return {
    ...sample,
    source: "browser",
    ranked,
    profile: ranked[0],
    confidence,
  };
}

function renderFaceResult(result) {
  const topProfiles = result.ranked.slice(0, 3);
  const top = result.profile;
  const sourceLabel = result.source === "python" ? "Python demo backend estimate" : "browser estimate";
  faceSeasonResult.textContent = top.name;
  faceConfidence.textContent = `${result.confidence}%`;
  faceStatus.textContent =
    result.source === "python" ? "Colour profile generated by demo backend" : "Colour profile generated";
  faceSeasonReason.textContent = `${top.name} is the strongest match from sampled ${axisLabel(
    "temperature",
    result.axes.temperature,
  )}, ${axisLabel("value", result.axes.value)}, ${axisLabel("chroma", result.axes.chroma)}, and ${axisLabel(
    "contrast",
    result.axes.contrast,
  )} signals. This is a ${sourceLabel}, so natural-light face photos improve accuracy.`;

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

  creatorPrompt.value = result.prompt || buildCreatorPrompt(result);
}

async function analyzeFaceWithBackend(dataUrl) {
  if (!window.fetch || !window.AbortController) return null;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch("/api/colour-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: dataUrl }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const result = await response.json();
    if (!result?.profile?.name || !Array.isArray(result.ranked)) return null;
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
  faceStatus.textContent = "Analysing face colour...";

  try {
    const backendResult = await analyzeFaceWithBackend(dataUrl);
    if (backendResult) {
      renderFaceResult(backendResult);
      return;
    }
  } catch (error) {
    // Static hosting falls back here because it does not expose the demo API.
  }

  try {
    const browserResult = await analyzeFaceInBrowser(dataUrl);
    renderFaceResult(browserResult);
  } catch (error) {
    faceStatus.textContent = error.message;
  }
}

function handleFaceUpload(file) {
  if (!file || !file.type.startsWith("image/")) return;
  faceStatus.textContent = "Reading face photo...";
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || "");
    facePreview.src = dataUrl;
    faceDrop.classList.add("has-image");
    analyzeFaceDataUrl(dataUrl);
  };
  reader.readAsDataURL(file);
}

function copyPrompt() {
  if (!creatorPrompt?.value) return;
  const original = copyPromptButton.textContent;
  const fallback = () => {
    creatorPrompt.focus();
    creatorPrompt.select();
    document.execCommand("copy");
  };

  const copied = navigator.clipboard?.writeText(creatorPrompt.value) || Promise.resolve().then(fallback);
  copied
    .then(() => {
      copyPromptButton.textContent = "Copied";
      window.setTimeout(() => {
        copyPromptButton.textContent = original;
      }, 1400);
    })
    .catch(() => {
      fallback();
      copyPromptButton.textContent = "Copied";
    });
}

function initFaceColourStudio() {
  if (!faceUpload || !copyPromptButton) return;
  faceUpload.addEventListener("change", (event) => {
    handleFaceUpload(event.target.files?.[0]);
  });
  copyPromptButton.addEventListener("click", copyPrompt);
}

updateHeader();
initProgressObserver();
initWaitlistForm();
initFaceColourStudio();

window.addEventListener("scroll", updateHeader, { passive: true });
