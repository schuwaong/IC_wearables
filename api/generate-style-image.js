import { createHash, createSign } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";

export const config = {
  maxDuration: 60,
};

const DEFAULT_PROVIDER_ORDER = "dashscope,vertex,gemini,cloudflare,pollinations,local-template";
const DEFAULT_REFERENCE_PROVIDER_ORDER = "vertex,gemini,pollinations,dashscope,local-template";
const DEFAULT_NEGATIVE_PROMPT =
  "low resolution, low quality, distorted face, warped face, changed identity, different person, different face in each panel, changed expression, added smile, grin, visible teeth when not in reference, changed hairstyle, different hairstyle, changed hairline, changed hair length, changed hair colour, face swap, beauty filter, face retouching, warped body, bad hands, extra fingers, plastic skin, over-smoothed face, text, logo, watermark";
const MAX_REFERENCE_IMAGE_BYTES = Math.max(
  512000,
  Math.min(8_000_000, Number(process.env.IMAGE_REFERENCE_MAX_BYTES) || 4_000_000),
);
const MAX_REFERENCE_IMAGES = Math.max(1, Math.min(8, Number(process.env.IMAGE_REFERENCE_MAX_COUNT) || 5));
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "..");
const LOCAL_DEFAULT_PALETTE = ["#f0d28d", "#7a1f2b", "#1d2d44", "#f8f1e6"];
const CHROMA_GREEN = "#00B140";
const LOCAL_SCENE_TONES = [
  { key: "business", base: "#1f2e43", glow: "#c89e5a" },
  { key: "smart", base: "#6a563f", glow: "#e5c489" },
  { key: "city", base: "#8f5524", glow: "#f2c879" },
  { key: "athleisure", base: "#29464d", glow: "#8fc3cc" },
  { key: "quiet", base: "#4f4638", glow: "#d7c3a1" },
];
const POLLINATIONS_DEFAULT_MODELS = "flux,qwen-image,zimage";
const POLLINATIONS_DEFAULT_EDIT_MODELS = "gptimage,p-image-edit,kontext,gpt-image-2,nanobanana";
const POLLINATIONS_PROVIDER_MODEL_MAP = {
  "pollinations-flux": ["flux"],
  "pollinations-qwen": ["qwen-image"],
  "pollinations-zimage": ["zimage"],
  "pollinations-kontext": ["kontext"],
  "pollinations-edit": ["p-image-edit"],
  "pollinations-gptimage": ["gptimage"],
};
const DEFAULT_PROVIDER_TIMEOUT_MS = Math.max(5000, Number(process.env.IMAGE_PROVIDER_TIMEOUT_MS) || 30000);
const PROVIDER_TIMEOUT_ENV_MAP = {
  dashscope: "DASHSCOPE_TIMEOUT_MS",
  gemini: "GEMINI_TIMEOUT_MS",
  vertex: "VERTEX_AI_TIMEOUT_MS",
  cloudflare: "CLOUDFLARE_TIMEOUT_MS",
  pollinations: "POLLINATIONS_TIMEOUT_MS",
};
const VERTEX_DEFAULT_MODEL = "gemini-2.5-flash-image";
const VERTEX_OAUTH_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const LOCAL_MENS_SCENE_ASSETS = [
  path.join(PROJECT_ROOT, "assets", "mens-suit-shop.jpg"),
  path.join(PROJECT_ROOT, "assets", "mens-fitting-room.jpg"),
  path.join(PROJECT_ROOT, "assets", "mens-phone-style.jpg"),
  path.join(PROJECT_ROOT, "assets", "mens-black-suit.jpg"),
  path.join(PROJECT_ROOT, "assets", "mens-fitting-room.jpg"),
];
const LOCAL_FEMALE_SCENE_ASSETS = {
  business: path.join(PROJECT_ROOT, "assets", "generated-results", "female-look-boardroom.jpg"),
  smart: path.join(PROJECT_ROOT, "assets", "generated-results", "female-look-travel.jpg"),
  city: path.join(PROJECT_ROOT, "assets", "generated-results", "female-look-city.jpg"),
  athleisure: path.join(PROJECT_ROOT, "assets", "generated-results", "female-look-city.jpg"),
  quiet: path.join(PROJECT_ROOT, "assets", "generated-results", "female-look-evening.jpg"),
};
let vertexAccessTokenCache = {
  token: "",
  expiresAt: 0,
};
const execFileAsync = promisify(execFile);

class BadRequestError extends Error {}

function getPrompt(req) {
  const url = new URL(req.url || "", "https://ic-wearables.local");
  return String(url.searchParams.get("prompt") || "").trim();
}

function getNumber(req, name, fallback) {
  const url = new URL(req.url || "", "https://ic-wearables.local");
  const value = Number(url.searchParams.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getSeed(req) {
  const url = new URL(req.url || "", "https://ic-wearables.local");
  const value = Number(url.searchParams.get("seed"));
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

function parseBody(rawBody) {
  if (!rawBody) return {};
  if (typeof rawBody === "object") return rawBody;
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new BadRequestError("Request body must be valid JSON");
  }
}

function cleanReferenceImages(value) {
  const images = Array.isArray(value) ? value : [];
  return images
    .map((image) => String(image || "").trim())
    .filter((image) => /^data:image\/[a-z0-9.+-]+;base64,/i.test(image) || /^https?:\/\//i.test(image))
    .slice(0, MAX_REFERENCE_IMAGES);
}

function cleanProviderOrder(value) {
  return String(value || "")
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean)
    .filter((provider, index, all) => all.indexOf(provider) === index);
}

function getPostPayload(req) {
  const body = parseBody(req.body);
  return {
    prompt: String(body.prompt || "").trim(),
    width: Number.isFinite(Number(body.width)) ? Number(body.width) : 800,
    height: Number.isFinite(Number(body.height)) ? Number(body.height) : 1000,
    seed: Number.isInteger(Number(body.seed)) && Number(body.seed) >= 0 ? Number(body.seed) : undefined,
    referenceImages: cleanReferenceImages(body.referenceImages),
    disallowLocalTemplate: body.disallowLocalTemplate === true,
    providerOrder: cleanProviderOrder(body.providerOrder),
  };
}

function normalizedSize(width, height) {
  const safeWidth = Math.max(512, Math.min(2048, Math.round(width / 8) * 8));
  const safeHeight = Math.max(512, Math.min(2048, Math.round(height / 8) * 8));
  return { width: safeWidth, height: safeHeight };
}

function dashScopeSize(width, height) {
  const model = process.env.DASHSCOPE_IMAGE_MODEL || "qwen-image-2.0";
  if (process.env.DASHSCOPE_IMAGE_SIZE) return process.env.DASHSCOPE_IMAGE_SIZE;

  if (model.includes("qwen-image-2.0")) {
    const { width: safeWidth, height: safeHeight } = normalizedSize(width, height);
    return `${safeWidth}*${safeHeight}`;
  }

  return height > width ? "928*1664" : width > height ? "1664*928" : "1328*1328";
}

function bearer(value = "") {
  return value.match(/^Bearer\s+/i) ? value : `Bearer ${value}`;
}

function providerOrder(override = [], hasReferenceImages = false) {
  const requestOrder = Array.isArray(override) ? override : cleanProviderOrder(override);
  if (requestOrder.length) return requestOrder;
  return cleanProviderOrder(
    hasReferenceImages
      ? process.env.IMAGE_REFERENCE_PROVIDER_ORDER || DEFAULT_REFERENCE_PROVIDER_ORDER
      : process.env.IMAGE_PROVIDER_ORDER || DEFAULT_PROVIDER_ORDER,
  );
}

function debugEnabled(req) {
  const url = new URL(req.url || "", "https://ic-wearables.local");
  const queryValue = String(url.searchParams.get("debug") || "").trim().toLowerCase();
  return (
    ["1", "true", "yes"].includes(queryValue) ||
    String(process.env.IMAGE_DEBUG_RESPONSE || "").trim().toLowerCase() === "true"
  );
}

function promptDebugPayload(prompt, referenceImages = []) {
  const lockedPrompt = promptWithReferenceLock(prompt, referenceImages);
  return {
    prompt,
    dashscopePrompt: lockedPrompt,
    referenceProviderOrder: providerOrder([], referenceImages.length > 0),
    referenceImageCount: referenceImages.length,
    promptLength: String(prompt || "").length,
    dashscopePromptLength: lockedPrompt.length,
  };
}

function pollinationsApiKey() {
  return (
    process.env.POLLINATIONS_API_KEY ||
    process.env.POLLINATIONS_TOKEN ||
    process.env.POLLINATIONS_PUBLISHABLE_KEY ||
    ""
  ).trim();
}

function pollinationsModelOrder(preferred = []) {
  const defaults = String(process.env.POLLINATIONS_IMAGE_MODELS || POLLINATIONS_DEFAULT_MODELS)
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return [...preferred, ...defaults].filter((model, index, all) => all.indexOf(model) === index);
}

function pollinationsEditModelOrder(preferred = []) {
  const defaults = String(process.env.POLLINATIONS_IMAGE_EDIT_MODELS || POLLINATIONS_DEFAULT_EDIT_MODELS)
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return [...preferred, ...defaults].filter((model, index, all) => all.indexOf(model) === index);
}

function vertexProjectId() {
  return (
    process.env.VERTEX_AI_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_PROJECT_ID ||
    ""
  ).trim();
}

function vertexLocation() {
  return (
    process.env.VERTEX_AI_LOCATION ||
    process.env.GOOGLE_CLOUD_LOCATION ||
    process.env.GOOGLE_LOCATION ||
    "global"
  ).trim();
}

function vertexModel() {
  return (process.env.VERTEX_AI_IMAGE_MODEL || VERTEX_DEFAULT_MODEL).trim();
}

function vertexBaseUrl() {
  const explicit = String(process.env.VERTEX_AI_BASE_URL || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const location = vertexLocation();
  return location === "global" ? "https://aiplatform.googleapis.com/v1" : `https://${location}-aiplatform.googleapis.com/v1`;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function vertexAspectRatio(width, height) {
  const ratio = width / Math.max(height, 1);
  const candidates = [
    { label: "1:1", value: 1 },
    { label: "4:5", value: 4 / 5 },
    { label: "3:4", value: 3 / 4 },
    { label: "9:16", value: 9 / 16 },
    { label: "16:9", value: 16 / 9 },
  ];
  return candidates
    .slice()
    .sort((left, right) => Math.abs(left.value - ratio) - Math.abs(right.value - ratio))[0]?.label || "4:5";
}

async function loadVertexCredentialConfig() {
  const inlineJson =
    process.env.VERTEX_AI_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    "";
  if (inlineJson.trim()) {
    return JSON.parse(inlineJson);
  }

  const inlineBase64 =
    process.env.VERTEX_AI_SERVICE_ACCOUNT_JSON_BASE64 ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 ||
    "";
  if (inlineBase64.trim()) {
    return JSON.parse(Buffer.from(inlineBase64, "base64").toString("utf8"));
  }

  const credentialsPath =
    process.env.VERTEX_AI_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    "";
  const candidatePaths = credentialsPath.trim()
    ? [credentialsPath.trim()]
    : [
        process.env.APPDATA ? path.join(process.env.APPDATA, "gcloud", "application_default_credentials.json") : "",
        path.join(os.homedir(), ".config", "gcloud", "application_default_credentials.json"),
      ].filter(Boolean);

  for (const candidatePath of candidatePaths) {
    try {
      const raw = await fs.readFile(candidatePath, "utf8");
      return JSON.parse(raw);
    } catch (error) {
      if (credentialsPath.trim()) throw error;
    }
  }

  return null;
}

async function vertexRefreshUserAccessToken(credentials) {
  const response = await fetchWithTimeout(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: String(credentials.client_id || ""),
        client_secret: String(credentials.client_secret || ""),
        refresh_token: String(credentials.refresh_token || ""),
        grant_type: "refresh_token",
      }),
    },
    providerTimeoutMs("vertex"),
    "Vertex AI user credential refresh",
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    throw new Error(`Vertex AI auth failed: ${payload?.error_description || payload?.error || response.status}`);
  }
  return payload;
}

async function vertexAccessTokenFromGcloudCli() {
  const gcloudCandidates = process.platform === "win32"
    ? [
        process.env.GCLOUD_BIN || "",
        process.env.GCLOUD_CMD || "",
        path.join(process.env.LOCALAPPDATA || "", "Google", "Cloud SDK", "google-cloud-sdk", "bin", "gcloud.cmd"),
        path.join(process.env.LOCALAPPDATA || "", "Google", "Cloud SDK", "google-cloud-sdk", "bin", "gcloud"),
        "gcloud.cmd",
        "gcloud",
      ]
    : [process.env.GCLOUD_BIN || "", "gcloud"];
  const commands = [
    ["auth", "application-default", "print-access-token"],
    ["auth", "print-access-token", "--quiet"],
  ];

  for (const command of gcloudCandidates.filter(Boolean)) {
    for (const args of commands) {
      try {
        const { stdout } = await execFileAsync(command, args, {
          timeout: providerTimeoutMs("vertex"),
          windowsHide: true,
          shell: process.platform === "win32",
        });
        const token = String(stdout || "").trim();
        if (token) return token;
      } catch (error) {
        continue;
      }
    }
  }

  throw new Error("gcloud CLI token lookup failed");
}

async function vertexAccessToken() {
  const directToken =
    process.env.VERTEX_AI_ACCESS_TOKEN ||
    process.env.GOOGLE_CLOUD_ACCESS_TOKEN ||
    process.env.GOOGLE_ACCESS_TOKEN ||
    "";
  if (directToken.trim()) return directToken.trim();

  const now = Math.floor(Date.now() / 1000);
  if (vertexAccessTokenCache.token && vertexAccessTokenCache.expiresAt - 60 > now) {
    return vertexAccessTokenCache.token;
  }

  const credentials = await loadVertexCredentialConfig();
  if (!credentials) {
    throw new Error(
      "Vertex AI credentials are not configured. Set VERTEX_AI_ACCESS_TOKEN, VERTEX_AI_SERVICE_ACCOUNT_JSON, GOOGLE_APPLICATION_CREDENTIALS, or run gcloud auth application-default login locally.",
    );
  }

  if (credentials.type === "authorized_user" && credentials.refresh_token && credentials.client_id && credentials.client_secret) {
    try {
      const payload = await vertexRefreshUserAccessToken(credentials);
      vertexAccessTokenCache = {
        token: String(payload.access_token),
        expiresAt: now + Math.max(300, Number(payload.expires_in) || 3600),
      };
      return vertexAccessTokenCache.token;
    } catch (error) {
      const token = await vertexAccessTokenFromGcloudCli();
      vertexAccessTokenCache = {
        token,
        expiresAt: now + 3000,
      };
      return vertexAccessTokenCache.token;
    }
  }

  if (!credentials?.client_email || !credentials?.private_key) {
    const token = await vertexAccessTokenFromGcloudCli();
    vertexAccessTokenCache = {
      token,
      expiresAt: now + 3000,
    };
    return vertexAccessTokenCache.token;
  }

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: credentials.client_email,
      sub: credentials.client_email,
      aud: "https://oauth2.googleapis.com/token",
      scope: VERTEX_OAUTH_SCOPE,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsignedAssertion = `${header}.${claimSet}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedAssertion);
  signer.end();
  const signature = signer.sign(credentials.private_key).toString("base64url");
  const assertion = `${unsignedAssertion}.${signature}`;

  const response = await fetchWithTimeout(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    },
    providerTimeoutMs("vertex"),
    "Vertex AI OAuth token exchange",
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    throw new Error(`Vertex AI auth failed: ${payload?.error_description || payload?.error || response.status}`);
  }

  vertexAccessTokenCache = {
    token: String(payload.access_token),
    expiresAt: now + Math.max(300, Number(payload.expires_in) || 3600),
  };
  return vertexAccessTokenCache.token;
}

function pollinationsUrl(prompt, width, height, seed, model) {
  const baseUrl = process.env.POLLINATIONS_BASE_URL || "https://gen.pollinations.ai";
  const url = new URL(`/image/${encodeURIComponent(prompt)}`, baseUrl);
  url.searchParams.set("width", String(width));
  url.searchParams.set("height", String(height));
  url.searchParams.set("nologo", "true");
  if (model) url.searchParams.set("model", model);
  if (seed !== undefined) url.searchParams.set("seed", String(seed));
  return url;
}

function pollinationsApiBaseUrl() {
  return String(process.env.POLLINATIONS_API_BASE_URL || process.env.POLLINATIONS_OPENAI_BASE_URL || "https://gen.pollinations.ai")
    .trim()
    .replace(/\/$/, "");
}

function mimeExtension(contentType = "image/png") {
  const normalized = String(contentType || "").toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("avif")) return "avif";
  return "png";
}

function pollinationsEditEndpoint() {
  const explicit = String(process.env.POLLINATIONS_IMAGE_EDIT_ENDPOINT || "").trim();
  if (explicit) return explicit;
  return `${pollinationsApiBaseUrl()}/v1/images/edits`;
}

function providerTimeoutMs(provider) {
  const envName = PROVIDER_TIMEOUT_ENV_MAP[provider];
  const specificTimeout = Number(envName ? process.env[envName] : 0);
  return Number.isFinite(specificTimeout) && specificTimeout >= 1000 ? specificTimeout : DEFAULT_PROVIDER_TIMEOUT_MS;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS, label = "Request") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function compactErrorMessage(error) {
  return String(error?.message || error || "Unknown error")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function promptWithReferenceLock(prompt, referenceImages = []) {
  const cleanPrompt = String(prompt || "").trim();
  if (!referenceImages.length) return cleanPrompt;
  return [
    cleanPrompt,
    "Hard reference lock: Image 1 is the only identity source and the only hair source. The generated person must be the exact same person from Image 1, not a similar model, not a beautified version, and not a catalogue model. Preserve the exact facial identity, head shape, facial proportions, jawline, cheekbones, eyes, brows, nose, lips, skin tone, facial asymmetry, natural skin texture, hairstyle, hairline, hair length, hair volume, hair part, bangs or fringe, hair colour, facial hair, and current expression. If the reference is neutral or unsmiling, keep it neutral. Do not add a smile or visible teeth unless already present in Image 1. Do not beautify, retouch, warp, liquify, stretch, slim, age-shift, face-swap, hair-swap, restyle the hair, change the hairline, or replace the face.",
    "Garment reference rule: Images 2 and later are clothing, shoe, bag, accessory, colour, silhouette, and texture references only. They must never influence face, hair, head shape, expression, skin tone, pose identity, body identity, age, ethnicity, or makeup style. If any garment image contains a person, ignore that person's body, face, hair, and pose identity completely.",
  ].join(" ");
}

function dataUrlToBinary(image) {
  const match = String(image || "").match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > MAX_REFERENCE_IMAGE_BYTES) {
    throw new Error("Reference image is too large");
  }
  return {
    buffer,
    contentType: match[1],
    base64: match[2],
  };
}

async function remoteImageToBinary(image) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.REFERENCE_IMAGE_TIMEOUT_MS || 9000));
  try {
    const response = await fetch(image, {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/*" },
      signal: controller.signal,
    });
    const contentType = (response.headers.get("content-type") || "image/jpeg").split(";")[0];
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
      throw new Error(`reference image download failed with ${response.status}`);
    }
    if (!contentType.startsWith("image/")) {
      throw new Error("Reference URL did not return an image");
    }
    if (buffer.byteLength > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error("Reference image is too large");
    }
    return { buffer, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

async function referenceImageToBinary(image) {
  const dataUrlBinary = dataUrlToBinary(image);
  if (dataUrlBinary) return dataUrlBinary;
  if (/^https?:\/\//i.test(image)) return remoteImageToBinary(image);
  throw new Error("Unsupported reference image format");
}

function extractPalette(prompt) {
  const matches = String(prompt || "").match(/#[0-9a-f]{6}/gi) || [];
  const unique = matches.map((color) => color.toLowerCase()).filter((color, index, all) => all.indexOf(color) === index);
  return [...unique, ...LOCAL_DEFAULT_PALETTE].slice(0, 6);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hashNumber(value) {
  return parseInt(createHash("sha1").update(String(value)).digest("hex").slice(0, 8), 16) >>> 0;
}

function svgBuffer(svg) {
  return Buffer.from(svg);
}

function roundedRectMask(width, height, radius) {
  return svgBuffer(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );
}

function sceneGradientSvg(width, height, palette, tone, seedValue) {
  if (isChromaGreenPrompt(seedValue)) {
    return svgBuffer(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="${width}" height="${height}" rx="0" fill="${CHROMA_GREEN}"/>
      </svg>
    `);
  }

  const seed = hashNumber(seedValue);
  const primary = palette[seed % palette.length];
  const secondary = palette[(seed + 1) % palette.length];
  const tertiary = palette[(seed + 2) % palette.length];
  const glowX = 25 + (seed % 50);
  const glowY = 18 + ((seed >> 3) % 54);
  const stripeOpacity = 0.08 + ((seed % 5) * 0.02);

  return svgBuffer(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${escapeXml(tone.base)}"/>
          <stop offset="55%" stop-color="${escapeXml(primary)}"/>
          <stop offset="100%" stop-color="${escapeXml(secondary)}"/>
        </linearGradient>
        <radialGradient id="glow" cx="${glowX}%" cy="${glowY}%" r="68%">
          <stop offset="0%" stop-color="${escapeXml(tone.glow)}" stop-opacity="0.9"/>
          <stop offset="55%" stop-color="${escapeXml(tertiary)}" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="${escapeXml(tone.base)}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" rx="30" fill="url(#bg)"/>
      <rect width="${width}" height="${height}" rx="30" fill="rgba(8,8,7,0.42)"/>
      <circle cx="${glowX}%" cy="${glowY}%" r="${Math.round(Math.max(width, height) * 0.38)}" fill="url(#glow)"/>
      <rect x="-${Math.round(width * 0.12)}" y="${Math.round(height * 0.7)}" width="${Math.round(width * 1.3)}" height="${Math.round(height * 0.28)}" fill="rgba(248,241,230,${stripeOpacity.toFixed(2)})" transform="rotate(-9 ${Math.round(width / 2)} ${Math.round(height / 2)})"/>
    </svg>
  `);
}

function isChromaGreenPrompt(prompt) {
  return /(chroma key green|#00b140|green background|background can be replaced|crop)/i.test(String(prompt || ""));
}

function swatchStripSvg(width, height, palette) {
  const gap = 8;
  const swatchWidth = Math.max(16, Math.floor((width - gap * (palette.length - 1)) / palette.length));
  const rects = palette
    .slice(0, 4)
    .map((color, index) => {
      const x = index * (swatchWidth + gap);
      return `<rect x="${x}" y="0" width="${swatchWidth}" height="${height}" rx="${Math.round(height / 2)}" fill="${escapeXml(color)}"/>`;
    })
    .join("");
  return svgBuffer(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects}</svg>`);
}

function cardFrameSvg(width, height, radius, palette, tone) {
  if (tone?.chromaGreen) {
    return svgBuffer(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`);
  }

  return svgBuffer(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" rx="${radius}" fill="rgba(8,8,7,0.18)"/>
      <rect x="6" y="6" width="${width - 12}" height="${height - 12}" rx="${Math.max(0, radius - 6)}" fill="none" stroke="rgba(248,241,230,0.28)" stroke-width="2"/>
      <rect x="18" y="${height - 36}" width="${Math.max(0, width - 36)}" height="18" rx="9" fill="rgba(8,8,7,0.3)"/>
      <rect x="18" y="18" width="${Math.max(0, width * 0.46)}" height="12" rx="6" fill="${escapeXml(tone.glow)}" fill-opacity="0.7"/>
      <rect x="${Math.max(18, width - 70)}" y="18" width="52" height="12" rx="6" fill="${escapeXml(palette[1] || palette[0])}" fill-opacity="0.6"/>
    </svg>
  `);
}

async function buildSubjectCard(referenceImage, width, height, palette, tone) {
  if (!referenceImage) {
    const placeholder = sceneGradientSvg(width, height, palette, tone, `${tone.key}-placeholder`);
    return sharp(placeholder).png().toBuffer();
  }

  const { buffer } = referenceImage;
  const radius = Math.round(Math.min(width, height) * 0.08);
  const portrait = await sharp(buffer)
    .rotate()
    .resize(width, height, { fit: "cover", position: "attention" })
    .composite([{ input: roundedRectMask(width, height, radius), blend: "dest-in" }])
    .png()
    .toBuffer();

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: portrait, top: 0, left: 0 },
      { input: cardFrameSvg(width, height, radius, palette, tone), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}

async function loadSceneBackground(assetPath, width, height, palette, tone, seedValue) {
  const fallback = sceneGradientSvg(width, height, palette, tone, seedValue);
  if (isChromaGreenPrompt(seedValue)) return sharp(fallback).png().toBuffer();
  if (!assetPath) return sharp(fallback).png().toBuffer();

  try {
    return await sharp(assetPath)
      .rotate()
      .resize(width, height, { fit: "cover", position: "attention" })
      .modulate({ saturation: 1.06, brightness: 0.9 })
      .composite([
        { input: fallback, blend: "soft-light" },
        {
          input: svgBuffer(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="30" fill="rgba(8,8,7,0.42)"/></svg>`,
          ),
          blend: "over",
        },
      ])
      .png()
      .toBuffer();
  } catch {
    return sharp(fallback).png().toBuffer();
  }
}

function isFourSceneCompositePrompt(prompt) {
  return /(four-panel composite|five-panel composite|panel 1:|all (four|five) panels must be present)/i.test(String(prompt || ""));
}

function isFemalePrompt(prompt) {
  return /(same woman|female fashion|women|business formal|smart casual|city casual|athleisure|quiet luxury|boardroom polish|evening edit|travel capsule)/i.test(
    String(prompt || ""),
  );
}

function femaleSceneKey(prompt) {
  const lower = String(prompt || "").toLowerCase();
  if (/(business formal|boardroom|business)/.test(lower)) return "business";
  if (/(smart casual)/.test(lower)) return "smart";
  if (/(city casual|city street)/.test(lower)) return "city";
  if (/(athleisure|performance|technical|training)/.test(lower)) return "athleisure";
  if (/(quiet luxury|evening|date night|lounge)/.test(lower)) return "quiet";
  return "business";
}

function localSceneAssets(prompt) {
  if (isFourSceneCompositePrompt(prompt)) {
    if (isFemalePrompt(prompt)) {
      return [
        LOCAL_FEMALE_SCENE_ASSETS.business,
        LOCAL_FEMALE_SCENE_ASSETS.smart,
        LOCAL_FEMALE_SCENE_ASSETS.city,
        LOCAL_FEMALE_SCENE_ASSETS.athleisure,
        LOCAL_FEMALE_SCENE_ASSETS.quiet,
      ];
    }
    return LOCAL_MENS_SCENE_ASSETS;
  }

  if (isFemalePrompt(prompt)) {
    const scene = femaleSceneKey(prompt);
    return [LOCAL_FEMALE_SCENE_ASSETS[scene]];
  }

  const lower = String(prompt || "").toLowerCase();
  if (/(quiet luxury|evening|date night|lounge)/.test(lower)) return [LOCAL_MENS_SCENE_ASSETS[4]];
  if (/(athleisure|performance|technical|training)/.test(lower)) return [LOCAL_MENS_SCENE_ASSETS[3]];
  if (/(city|street)/.test(lower)) return [LOCAL_MENS_SCENE_ASSETS[2]];
  if (/(smart casual|casual)/.test(lower)) return [LOCAL_MENS_SCENE_ASSETS[1]];
  return [LOCAL_MENS_SCENE_ASSETS[0]];
}

async function buildLocalCompositeImage(prompt, width, height, referenceImages = []) {
  const palette = extractPalette(prompt);
  const referenceImage = referenceImages[0] ? await referenceImageToBinary(referenceImages[0]) : null;
  const backgrounds = localSceneAssets(prompt);
  const padding = Math.round(Math.min(width, height) * 0.03);
  const gap = Math.round(Math.min(width, height) * 0.022);
  const panelCount = Math.max(1, Math.min(5, backgrounds.length || LOCAL_SCENE_TONES.length));
  const isFivePanel = panelCount >= 5;
  const topColumns = isFivePanel ? 2 : 2;
  const bottomColumns = isFivePanel ? 3 : 2;
  const topPanelWidth = Math.floor((width - padding * 2 - gap * (topColumns - 1)) / topColumns);
  const bottomPanelWidth = Math.floor((width - padding * 2 - gap * (bottomColumns - 1)) / bottomColumns);
  const panelHeight = Math.floor((height - padding * 2 - gap) / 2);
  const panelsMeta = Array.from({ length: panelCount }, (_, index) => {
    if (!isFivePanel) {
      const column = index % 2;
      const row = Math.floor(index / 2);
      return {
        width: topPanelWidth,
        height: panelHeight,
        left: padding + column * (topPanelWidth + gap),
        top: padding + row * (panelHeight + gap),
      };
    }

    if (index < 2) {
      const totalTopWidth = topPanelWidth * topColumns + gap * (topColumns - 1);
      const leftInset = padding + Math.floor((width - padding * 2 - totalTopWidth) / 2);
      return {
        width: topPanelWidth,
        height: panelHeight,
        left: leftInset + index * (topPanelWidth + gap),
        top: padding,
      };
    }

    const bottomIndex = index - 2;
    return {
      width: bottomPanelWidth,
      height: panelHeight,
      left: padding + bottomIndex * (bottomPanelWidth + gap),
      top: padding + panelHeight + gap,
    };
  });

  const sceneJobs = panelsMeta.map(async (meta, index) => {
    const chromaGreen = isChromaGreenPrompt(prompt);
    const tone = { ...(LOCAL_SCENE_TONES[index] || LOCAL_SCENE_TONES[0]), chromaGreen };
    const background = await loadSceneBackground(
      backgrounds[index],
      meta.width,
      meta.height,
      palette,
      tone,
      `${prompt}-${tone.key}-${index}`,
    );
    const subjectWidth = Math.round(meta.width * (isFivePanel && index >= 2 ? 0.7 : 0.74));
    const subjectHeight = Math.round(meta.height * 0.72);
    const subject = await buildSubjectCard(referenceImage, subjectWidth, subjectHeight, palette, tone);
    const swatches = chromaGreen ? null : swatchStripSvg(Math.round(meta.width * 0.44), 14, palette);

    return sharp(background)
      .composite([
        {
          input: subject,
          left: Math.round((meta.width - subjectWidth) / 2),
          top: Math.round(meta.height * 0.12),
        },
        ...(swatches
          ? [
              {
                input: swatches,
                left: Math.round(meta.width * 0.08),
                top: meta.height - 34,
              },
            ]
          : []),
      ])
      .png()
      .toBuffer();
  });

  const chromaGreen = isChromaGreenPrompt(prompt);
  const panels = await Promise.all(sceneJobs);
  const base = await sharp(sceneGradientSvg(width, height, palette, LOCAL_SCENE_TONES[0], `${prompt}-board`))
    .composite(
      chromaGreen
        ? []
        : [
            {
              input: svgBuffer(
                `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="${padding / 2}" y="${padding / 2}" width="${width - padding}" height="${height - padding}" rx="34" fill="none" stroke="rgba(248,241,230,0.16)" stroke-width="2"/></svg>`,
              ),
            },
          ],
    )
    .png()
    .toBuffer();

  return sharp(base)
    .composite([
      ...panels.map((panel, index) => ({
        input: panel,
        left: panelsMeta[index].left,
        top: panelsMeta[index].top,
      })),
    ])
    .png()
    .toBuffer();
}

async function buildLocalPortraitImage(prompt, width, height, referenceImages = []) {
  const palette = extractPalette(prompt);
  const referenceImage = referenceImages[0] ? await referenceImageToBinary(referenceImages[0]) : null;
  const chromaGreen = isChromaGreenPrompt(prompt);
  const tone = { ...LOCAL_SCENE_TONES[hashNumber(prompt) % LOCAL_SCENE_TONES.length], chromaGreen };
  const [backgroundAsset] = localSceneAssets(prompt);
  const background = await loadSceneBackground(backgroundAsset, width, height, palette, tone, `${prompt}-portrait`);
  const subjectWidth = Math.round(width * 0.72);
  const subjectHeight = Math.round(height * 0.7);
  const subject = await buildSubjectCard(referenceImage, subjectWidth, subjectHeight, palette, tone);
  const swatches = chromaGreen ? null : swatchStripSvg(Math.round(width * 0.46), 18, palette);

  return sharp(background)
    .composite([
      {
        input: subject,
        left: Math.round((width - subjectWidth) / 2),
        top: Math.round(height * 0.11),
      },
      ...(swatches
        ? [
            {
              input: swatches,
              left: Math.round(width * 0.08),
              top: height - 40,
            },
            {
              input: svgBuffer(
                `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
                  <rect x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.08)}" width="${Math.round(width * 0.86)}" height="${Math.round(height * 0.8)}" rx="34" fill="none" stroke="rgba(248,241,230,0.14)" stroke-width="2"/>
                </svg>`,
              ),
            },
          ]
        : []),
    ])
    .png()
    .toBuffer();
}

async function callLocalTemplate(prompt, width, height, referenceImages = []) {
  const { width: safeWidth, height: safeHeight } = normalizedSize(width, height);
  const buffer = isFourSceneCompositePrompt(prompt)
    ? await buildLocalCompositeImage(prompt, safeWidth, safeHeight, referenceImages)
    : await buildLocalPortraitImage(prompt, safeWidth, safeHeight, referenceImages);
  return {
    type: "buffer",
    buffer,
    contentType: "image/png",
    provider: "local-template",
  };
}

async function callDashScope(prompt, width, height, seed, referenceImages = []) {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.ALIBABA_DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY is not configured");

  const baseUrl = (process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/api/v1").replace(/\/$/, "");
  const model = process.env.DASHSCOPE_IMAGE_MODEL || "qwen-image-2.0";
  const lockedPrompt = promptWithReferenceLock(prompt, referenceImages);
  const content = [
    ...referenceImages.map((image) => ({ image })),
    { text: lockedPrompt },
  ];
  const response = await fetchWithTimeout(
    `${baseUrl}/services/aigc/multimodal-generation/generation`,
    {
      method: "POST",
      headers: {
        Authorization: bearer(apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: {
          messages: [
            {
              role: "user",
              content,
            },
          ],
        },
        parameters: {
          negative_prompt: process.env.IMAGE_NEGATIVE_PROMPT || DEFAULT_NEGATIVE_PROMPT,
          prompt_extend: process.env.DASHSCOPE_PROMPT_EXTEND === "true",
          watermark: false,
          size: dashScopeSize(width, height),
          ...(seed === undefined ? {} : { seed }),
        },
      }),
    },
    providerTimeoutMs("dashscope"),
    "DashScope image generation",
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`DashScope image generation failed: ${payload.message || response.status}`);
  }

  const imageUrl = payload?.output?.choices?.[0]?.message?.content?.find?.((item) => item.image)?.image;
  if (!imageUrl) throw new Error("DashScope returned no image URL");
  return { type: "redirect", url: imageUrl, provider: "dashscope" };
}

function geminiApiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    ""
  ).trim();
}

function dataUrlToGeminiPart(image) {
  const binary = dataUrlToBinary(image);
  if (!binary) return null;
  return {
    inlineData: {
      mimeType: binary.contentType,
      data: binary.base64,
    },
  };
}

async function remoteImageToGeminiPart(image) {
  const binary = await remoteImageToBinary(image);
  return {
    inlineData: {
      mimeType: binary.contentType,
      data: binary.buffer.toString("base64"),
    },
  };
}

async function referenceImageToGeminiPart(image) {
  const dataUrlPart = dataUrlToGeminiPart(image);
  if (dataUrlPart) return dataUrlPart;
  if (/^https?:\/\//i.test(image)) return remoteImageToGeminiPart(image);
  throw new Error("Unsupported Gemini reference image format");
}

async function callGemini(prompt, width, height, seed, referenceImages = []) {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const endpoint =
    process.env.GEMINI_IMAGE_ENDPOINT ||
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const url = new URL(endpoint);
  if (!url.searchParams.has("key")) url.searchParams.set("key", apiKey);
  const referenceParts = await Promise.all(referenceImages.map((image) => referenceImageToGeminiPart(image)));
  const lockedPrompt = promptWithReferenceLock(prompt, referenceImages);

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              ...referenceParts,
              {
                text: [
                  lockedPrompt,
                  `Render at approximately ${width}x${height}.`,
                  seed === undefined ? "" : `Use seed ${seed} when supported.`,
                ]
                  .filter(Boolean)
                  .join(" "),
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    },
    providerTimeoutMs("gemini"),
    "Gemini image generation",
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Gemini image generation failed: ${payload.error?.message || response.status}`);
  }

  const part = payload?.candidates?.[0]?.content?.parts?.find?.(
    (candidate) => candidate.inlineData?.data || candidate.inline_data?.data,
  );
  const imageData = part?.inlineData?.data || part?.inline_data?.data;
  const contentType = part?.inlineData?.mimeType || part?.inline_data?.mime_type || "image/png";
  if (!imageData) throw new Error("Gemini returned no image bytes");
  return { type: "buffer", buffer: Buffer.from(imageData, "base64"), contentType, provider: "gemini" };
}

async function callVertex(prompt, width, height, seed, referenceImages = []) {
  const projectId = vertexProjectId();
  if (!projectId) {
    throw new Error("VERTEX_AI_PROJECT_ID is not configured");
  }

  const accessToken = await vertexAccessToken();
  const model = vertexModel();
  const location = vertexLocation();
  const endpoint = `${vertexBaseUrl()}/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
  const referenceParts = await Promise.all(referenceImages.map((image) => referenceImageToGeminiPart(image)));
  const lockedPrompt = promptWithReferenceLock(prompt, referenceImages);
  const { width: safeWidth, height: safeHeight } = normalizedSize(width, height);

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: bearer(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              ...referenceParts,
              {
                text: [
                  lockedPrompt,
                  `Render at approximately ${safeWidth}x${safeHeight}.`,
                  `Prefer aspect ratio ${vertexAspectRatio(safeWidth, safeHeight)}.`,
                  seed === undefined ? "" : `Use seed ${seed} when supported.`,
                ]
                  .filter(Boolean)
                  .join(" "),
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          candidateCount: 1,
          imageConfig: {
            aspectRatio: vertexAspectRatio(safeWidth, safeHeight),
          },
        },
      }),
    },
    providerTimeoutMs("vertex"),
    "Vertex AI image generation",
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Vertex AI image generation failed: ${payload?.error?.message || payload?.error || response.status}`);
  }

  const part = payload?.candidates?.[0]?.content?.parts?.find?.(
    (candidate) => candidate.inlineData?.data || candidate.inline_data?.data,
  );
  const imageData = part?.inlineData?.data || part?.inline_data?.data;
  const contentType = part?.inlineData?.mimeType || part?.inline_data?.mime_type || "image/png";
  if (!imageData) throw new Error("Vertex AI returned no image bytes");
  return {
    type: "buffer",
    buffer: Buffer.from(imageData, "base64"),
    contentType,
    provider: `vertex:${model}`,
  };
}

async function callCloudflare(prompt, width, height) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_WORKERS_AI_TOKEN;
  if (!accountId || !apiToken) throw new Error("Cloudflare Workers AI credentials are not configured");

  const model = process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/stabilityai/stable-diffusion-xl-base-1.0";
  const { width: safeWidth, height: safeHeight } = normalizedSize(width, height);
  const response = await fetchWithTimeout(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${encodeURIComponent(model)}`,
    {
      method: "POST",
      headers: {
        Authorization: bearer(apiToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        negative_prompt: process.env.IMAGE_NEGATIVE_PROMPT || DEFAULT_NEGATIVE_PROMPT,
        width: safeWidth,
        height: safeHeight,
      }),
    },
    providerTimeoutMs("cloudflare"),
    "Cloudflare image generation",
  );

  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(`Cloudflare image generation failed: ${buffer.toString("utf8").slice(0, 240)}`);
  }

  if (contentType.includes("application/json")) {
    const payload = JSON.parse(buffer.toString("utf8"));
    const base64 = payload?.result?.image || payload?.result;
    if (!base64 || typeof base64 !== "string") throw new Error("Cloudflare returned no image bytes");
    return { type: "buffer", buffer: Buffer.from(base64, "base64"), contentType: "image/png", provider: "cloudflare" };
  }

  return { type: "buffer", buffer, contentType, provider: "cloudflare" };
}

async function callPollinations(prompt, width, height, seed, preferredModels = []) {
  const apiKey = pollinationsApiKey();
  if (!apiKey) {
    throw new Error("POLLINATIONS_API_KEY is not configured");
  }

  const { width: safeWidth, height: safeHeight } = normalizedSize(width, height);
  const errors = [];
  for (const model of pollinationsModelOrder(preferredModels)) {
    const url = pollinationsUrl(prompt, safeWidth, safeHeight, seed, model);
    try {
      const response = await fetchWithTimeout(
        url.toString(),
        {
          headers: {
            Authorization: bearer(apiKey),
            Accept: "image/avif,image/webp,image/png,image/jpeg,image/*",
          },
        },
        providerTimeoutMs("pollinations"),
        `Pollinations image generation (${model})`,
      );
      const contentType = response.headers.get("content-type") || "image/jpeg";
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!response.ok) {
        throw new Error(buffer.toString("utf8").slice(0, 240) || String(response.status));
      }
      if (!contentType.startsWith("image/")) {
        throw new Error("Pollinations returned a non-image response");
      }
      if (!buffer.byteLength) throw new Error("Pollinations returned no image bytes");
      return {
        type: "buffer",
        buffer,
        contentType,
        provider: `pollinations:${model}`,
      };
    } catch (error) {
      errors.push(`${model}: ${error.message}`);
    }
  }

  throw new Error(`Pollinations image generation failed: ${errors.join(" | ") || "no models available"}`);
}

async function callPollinationsEdit(prompt, width, height, seed, referenceImages = [], preferredModels = []) {
  const apiKey = pollinationsApiKey();
  if (!apiKey) {
    throw new Error("POLLINATIONS_API_KEY is not configured");
  }
  if (!referenceImages.length) return callPollinations(prompt, width, height, seed, preferredModels);

  const { width: safeWidth, height: safeHeight } = normalizedSize(width, height);
  const lockedPrompt = promptWithReferenceLock(prompt, referenceImages);
  const referenceFiles = await Promise.all(referenceImages.map((image) => referenceImageToBinary(image)));
  const errors = [];

  for (const model of pollinationsEditModelOrder(preferredModels)) {
    const formData = new FormData();
    formData.set("model", model);
    formData.set("prompt", [
      lockedPrompt,
      `Render at approximately ${safeWidth}x${safeHeight}.`,
      seed === undefined ? "" : `Use seed ${seed} when supported.`,
    ]
      .filter(Boolean)
      .join(" "));
    formData.set("n", "1");
    formData.set("size", `${safeWidth}x${safeHeight}`);
    formData.set("width", String(safeWidth));
    formData.set("height", String(safeHeight));
    if (seed !== undefined) formData.set("seed", String(seed));

    referenceFiles.forEach((file, index) => {
      const contentType = file.contentType || "image/png";
      const blob = new Blob([file.buffer], { type: contentType });
      formData.append("image", blob, `reference-${index + 1}.${mimeExtension(contentType)}`);
    });

    try {
      const response = await fetchWithTimeout(
        pollinationsEditEndpoint(),
        {
          method: "POST",
          headers: {
            Authorization: bearer(apiKey),
            Accept: "application/json,image/avif,image/webp,image/png,image/jpeg,image/*",
          },
          body: formData,
        },
        providerTimeoutMs("pollinations"),
        `Pollinations image edit (${model})`,
      );
      const contentType = response.headers.get("content-type") || "";
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!response.ok) {
        throw new Error(buffer.toString("utf8").slice(0, 240) || String(response.status));
      }

      if (contentType.startsWith("image/")) {
        if (!buffer.byteLength) throw new Error("Pollinations returned no image bytes");
        return {
          type: "buffer",
          buffer,
          contentType,
          provider: `pollinations-edit:${model}`,
        };
      }

      const payload = JSON.parse(buffer.toString("utf8") || "{}");
      const firstImage = payload?.data?.[0] || payload?.images?.[0] || payload;
      const imageUrl = firstImage?.url || firstImage?.imageUrl || firstImage?.image_url || payload?.url || payload?.imageUrl;
      const base64Image =
        firstImage?.b64_json ||
        firstImage?.b64Json ||
        firstImage?.base64 ||
        firstImage?.image ||
        payload?.b64_json ||
        payload?.base64;

      if (imageUrl) {
        return {
          type: "redirect",
          url: imageUrl,
          provider: `pollinations-edit:${model}`,
        };
      }

      if (base64Image) {
        const cleanBase64 = String(base64Image).replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
        return {
          type: "buffer",
          buffer: Buffer.from(cleanBase64, "base64"),
          contentType: firstImage?.mimeType || firstImage?.mime_type || "image/png",
          provider: `pollinations-edit:${model}`,
        };
      }

      throw new Error("Pollinations returned no image URL or bytes");
    } catch (error) {
      errors.push(`${model}: ${error.message}`);
    }
  }

  throw new Error(`Pollinations image edit failed: ${errors.join(" | ") || "no models available"}`);
}

async function generateImage(prompt, width, height, seed, referenceImages = [], options = {}) {
  const errors = [];
  const hasReferenceImages = referenceImages.length > 0;
  const attempts = [];
  const disallowLocalTemplate = options.disallowLocalTemplate === true;

  function localTemplateBlocked(providerKey) {
    if (!disallowLocalTemplate) return false;
    attempts.push({ provider: providerKey, status: "skipped", detail: "Local template fallback is disabled for this request." });
    return true;
  }

  for (const provider of providerOrder(options.providerOrder, hasReferenceImages)) {
    try {
      if (provider === "dashscope" || provider === "alibaba") {
        const result = await callDashScope(prompt, width, height, seed, referenceImages);
        attempts.push({ provider, status: "success", resolvedProvider: result.provider });
        return { ...result, attempts };
      }
      if (provider === "gemini" || provider === "google") {
        const result = await callGemini(prompt, width, height, seed, referenceImages);
        attempts.push({ provider, status: "success", resolvedProvider: result.provider });
        return { ...result, attempts };
      }
      if (provider === "vertex" || provider === "vertex-ai" || provider === "vertex-gemini") {
        const result = await callVertex(prompt, width, height, seed, referenceImages);
        attempts.push({ provider, status: "success", resolvedProvider: result.provider });
        return { ...result, attempts };
      }
      if (provider === "local" || provider === "local-template" || provider === "local-editorial") {
        if (localTemplateBlocked(provider)) continue;
        const result = await callLocalTemplate(prompt, width, height, referenceImages);
        attempts.push({ provider, status: "success", resolvedProvider: result.provider });
        return { ...result, attempts };
      }
      if (provider === "cloudflare") {
        if (hasReferenceImages) {
          attempts.push({ provider, status: "skipped", detail: "Reference images are not supported by this provider." });
          continue;
        }
        const result = await callCloudflare(prompt, width, height);
        attempts.push({ provider, status: "success", resolvedProvider: result.provider });
        return { ...result, attempts };
      }
      if (provider === "pollinations") {
        const result = hasReferenceImages
          ? await callPollinationsEdit(prompt, width, height, seed, referenceImages)
          : await callPollinations(prompt, width, height, seed);
        attempts.push({ provider, status: "success", resolvedProvider: result.provider });
        return { ...result, attempts };
      }
      if (provider in POLLINATIONS_PROVIDER_MODEL_MAP) {
        const preferredModels = POLLINATIONS_PROVIDER_MODEL_MAP[provider];
        const result = hasReferenceImages
          ? await callPollinationsEdit(prompt, width, height, seed, referenceImages, preferredModels)
          : await callPollinations(prompt, width, height, seed, preferredModels);
        attempts.push({ provider, status: "success", resolvedProvider: result.provider });
        return { ...result, attempts };
      }
      if (provider.includes("local")) {
        if (localTemplateBlocked(provider)) continue;
      }
      attempts.push({ provider, status: "skipped", detail: "Unknown provider key." });
    } catch (error) {
      const detail = compactErrorMessage(error);
      attempts.push({ provider, status: "failed", detail });
      errors.push(`${provider}: ${detail}`);
    }
  }

  const failure = new Error(errors.join(" | ") || "No image provider configured");
  failure.attempts = attempts;
  throw failure;
}

function setCommonHeaders(res, provider) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
  if (provider) res.setHeader("X-IC-Image-Provider", provider);
}

export default async function handler(req, res) {
  setCommonHeaders(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let debug = null;

  try {
    const payload =
      req.method === "POST"
        ? getPostPayload(req)
        : {
            prompt: getPrompt(req),
            width: getNumber(req, "width", 800),
            height: getNumber(req, "height", 1000),
            seed: getSeed(req),
            referenceImages: [],
          };
    const prompt = payload.prompt;
    if (!prompt) return res.status(400).json({ error: "prompt is required" });
    const includeDebug = req.method === "POST" && debugEnabled(req);
    debug = includeDebug ? promptDebugPayload(prompt, payload.referenceImages) : null;

    const result = await generateImage(
      prompt,
      payload.width,
      payload.height,
      payload.seed,
      payload.referenceImages,
      { disallowLocalTemplate: payload.disallowLocalTemplate, providerOrder: payload.providerOrder },
    );
    setCommonHeaders(res, result.provider);

    if (req.method === "POST") {
      if (result.type === "redirect") {
        return res.status(200).json({
          imageUrl: result.url,
          provider: result.provider,
          attempts: result.attempts || [],
          ...(debug ? { debug } : {}),
        });
      }

      return res.status(200).json({
        imageDataUrl: `data:${result.contentType || "image/png"};base64,${result.buffer.toString("base64")}`,
        provider: result.provider,
        attempts: result.attempts || [],
        ...(debug ? { debug } : {}),
      });
    }

    if (result.type === "redirect") {
      res.setHeader("Location", result.url);
      return res.status(302).end();
    }

    res.setHeader("Content-Type", result.contentType || "image/png");
    return res.status(200).send(result.buffer);
  } catch (error) {
    if (error instanceof BadRequestError) {
      return res.status(400).json({
        error: "Invalid request",
        detail: error.message,
      });
    }

    return res.status(502).json({
      error: "Image generation failed",
      detail: error.message,
      attempts: Array.isArray(error?.attempts) ? error.attempts : [],
      ...(debug ? { debug } : {}),
    });
  }
}
