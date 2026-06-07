export const config = {
  maxDuration: 60,
};

const DEFAULT_PROVIDER_ORDER = "dashscope,cloudflare,pollinations";
const DEFAULT_NEGATIVE_PROMPT =
  "low resolution, low quality, distorted face, changed identity, warped body, bad hands, extra fingers, plastic skin, over-smoothed face, text, logo, watermark";

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
  return JSON.parse(rawBody);
}

function cleanReferenceImages(value) {
  const images = Array.isArray(value) ? value : [];
  return images
    .map((image) => String(image || "").trim())
    .filter((image) => /^data:image\/[a-z0-9.+-]+;base64,/i.test(image) || /^https?:\/\//i.test(image))
    .slice(0, 3);
}

function getPostPayload(req) {
  const body = parseBody(req.body);
  return {
    prompt: String(body.prompt || "").trim(),
    width: Number.isFinite(Number(body.width)) ? Number(body.width) : 800,
    height: Number.isFinite(Number(body.height)) ? Number(body.height) : 1000,
    seed: Number.isInteger(Number(body.seed)) && Number(body.seed) >= 0 ? Number(body.seed) : undefined,
    referenceImages: cleanReferenceImages(body.referenceImages),
  };
}

function normalizedSize(width, height) {
  const safeWidth = Math.max(512, Math.min(2048, Math.round(width / 8) * 8));
  const safeHeight = Math.max(512, Math.min(2048, Math.round(height / 8) * 8));
  return { width: safeWidth, height: safeHeight };
}

function dashScopeSize(width, height) {
  const model = process.env.DASHSCOPE_IMAGE_MODEL || "qwen-image-2.0-pro";
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

function providerOrder() {
  return String(process.env.IMAGE_PROVIDER_ORDER || DEFAULT_PROVIDER_ORDER)
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);
}

function pollinationsUrl(prompt, width, height, seed) {
  const seedQuery = seed === undefined ? "" : `&seed=${encodeURIComponent(String(seed))}`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true${seedQuery}`;
}

async function callDashScope(prompt, width, height, seed, referenceImages = []) {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.ALIBABA_DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY is not configured");

  const baseUrl = (process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/api/v1").replace(/\/$/, "");
  const model = process.env.DASHSCOPE_IMAGE_MODEL || "qwen-image-2.0-pro";
  const content = [
    ...referenceImages.map((image) => ({ image })),
    { text: prompt },
  ];
  const response = await fetch(`${baseUrl}/services/aigc/multimodal-generation/generation`, {
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
        prompt_extend: process.env.DASHSCOPE_PROMPT_EXTEND !== "false",
        watermark: false,
        size: dashScopeSize(width, height),
        ...(seed === undefined ? {} : { seed }),
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`DashScope image generation failed: ${payload.message || response.status}`);
  }

  const imageUrl = payload?.output?.choices?.[0]?.message?.content?.find?.((item) => item.image)?.image;
  if (!imageUrl) throw new Error("DashScope returned no image URL");
  return { type: "redirect", url: imageUrl, provider: "dashscope" };
}

async function callCloudflare(prompt, width, height) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_WORKERS_AI_TOKEN;
  if (!accountId || !apiToken) throw new Error("Cloudflare Workers AI credentials are not configured");

  const model = process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/stabilityai/stable-diffusion-xl-base-1.0";
  const { width: safeWidth, height: safeHeight } = normalizedSize(width, height);
  const response = await fetch(
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

async function generateImage(prompt, width, height, seed, referenceImages = []) {
  const errors = [];
  const hasReferenceImages = referenceImages.length > 0;

  for (const provider of providerOrder()) {
    try {
      if (provider === "dashscope" || provider === "alibaba") {
        return await callDashScope(prompt, width, height, seed, referenceImages);
      }
      if (hasReferenceImages) continue;
      if (provider === "cloudflare") {
        return await callCloudflare(prompt, width, height);
      }
      if (provider === "pollinations") {
        return { type: "redirect", url: pollinationsUrl(prompt, width, height, seed), provider: "pollinations" };
      }
    } catch (error) {
      errors.push(`${provider}: ${error.message}`);
    }
  }

  throw new Error(errors.join(" | ") || "No image provider configured");
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

  try {
    const result = await generateImage(
      prompt,
      payload.width,
      payload.height,
      payload.seed,
      payload.referenceImages,
    );
    setCommonHeaders(res, result.provider);

    if (req.method === "POST") {
      if (result.type === "redirect") {
        return res.status(200).json({ imageUrl: result.url, provider: result.provider });
      }

      return res.status(200).json({
        imageDataUrl: `data:${result.contentType || "image/png"};base64,${result.buffer.toString("base64")}`,
        provider: result.provider,
      });
    }

    if (result.type === "redirect") {
      res.setHeader("Location", result.url);
      return res.status(302).end();
    }

    res.setHeader("Content-Type", result.contentType || "image/png");
    return res.status(200).send(result.buffer);
  } catch (error) {
    return res.status(502).json({
      error: "Image generation failed",
      detail: error.message,
    });
  }
}
