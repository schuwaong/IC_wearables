# IC_wearables

Premium landing page for IC_wearables.

The primary landing-page CTA opens the on-page scan flow:

`https://schuwaong.github.io/IC_wearables/#face-lab`

The women's landing page uses the same on-page scan and then opens:

`https://schuwaong.github.io/IC_wearables/female/results.html`

## Face Colour Demo

Run the local backend demo:

```powershell
python -m pip install pillow
python demo_backend.py --port 5189
```

Then open:

`http://127.0.0.1:5189/`

The landing page posts uploaded face images to `/api/colour-profile`. If the
API is unavailable, the page falls back to the browser-side analyser.

The analyser samples a skin-masked central face oval and returns an
`explanation` field showing the measured undertone, value, chroma, contrast,
runner-up season, and how many non-skin/background pixels were rejected. It is
still an estimate, so natural light and a clear front-facing photo matter.

Run the analyser directly:

```powershell
python colour_profile.py .\assets\mens-black-suit.jpg --pretty
```

The deployed serverless backend also exposes:

`/api/colour-profile`

It accepts JSON:

```json
{ "imageDataUrl": "data:image/jpeg;base64,..." }
```

The Node endpoint uses `sharp` to decode the uploaded image and returns the
same profile shape that the browser fallback expects.

## GitHub Pages + Backend

GitHub Pages only serves static files. It does not run files under `api/`.
Deploy this repo to Vercel for the backend routes, then set the GitHub Pages
frontend backend base in `config.js`:

```js
window.IC_BACKEND_BASE_URL = "https://your-vercel-project.vercel.app";
```

That one base URL powers:

```text
/api/colour-profile
/api/generate-style-image
/api/fetch-matching-clothes
```

For temporary testing without editing `config.js`, set it in the browser:

```js
localStorage.setItem("icBackendBaseUrl", "https://your-vercel-project.vercel.app");
```

## Capsule Outfit Generator

Build a static affiliate outfit rack from a CSV feed:

```powershell
python -m pip install requests beautifulsoup4 pandas
python capsule_outfit_generator.py --feed .\feed.csv --season "True Autumn" --affiliate-id YOUR_ID --network involve_asia --output .\outfits_rack.html
```

The script can also scrape a product/category URL with `--url`, then writes
downloaded product images into `images/` and renders shoppable outfit cards.

## Affiliate Backend

The shoppable outfit rows call a serverless endpoint:

`/api/fetch-matching-clothes`

Required Vercel environment variables for CJ:

```text
CJ_PERSONAL_ACCESS_TOKEN=your_cj_personal_access_token
# optional alias:
CJ_PAT=your_cj_personal_access_token
CJ_WEBSITE_ID=your_cj_property_id
CJ_COMPANY_ID=your_cj_company_id
```

The backend uses CJ's current GraphQL product endpoint at `https://ads.api.cj.com/query`.
Do not use an old CJ developer key with this GraphQL endpoint; use a Personal
Access Token from the CJ Developer Portal.

Optional HK/Involve Asia variables:

```text
INVOLVE_ASIA_PRODUCT_SEARCH_ENDPOINT=your_involve_product_search_endpoint
INVOLVE_ASIA_API_KEY=your_involve_api_key
INVOLVE_ASIA_METHOD=GET
INVOLVE_ASIA_AUTH_HEADER=Authorization
```

Optional generic fallback:

```text
AFFILIATE_ALLOW_GENERIC_SEARCH_FALLBACK=true
```

If this flag is not set, the backend returns a real error when CJ/Involve Asia
fail instead of silently downgrading to generic retailer search cards.

## Image Generation Backend

The outfit images can be generated through:

`/api/generate-style-image`

Provider order defaults to:

```text
dashscope,cloudflare,pollinations
```

This avoids OpenAI and Google image APIs. Alibaba DashScope/Qwen Image is tried
first, Cloudflare Workers AI is the free-tier fallback, and Pollinations remains
the no-key fallback.

Alibaba DashScope / Qwen Image env vars:

```text
DASHSCOPE_API_KEY=your_alibaba_model_studio_api_key
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/api/v1
DASHSCOPE_IMAGE_MODEL=qwen-image-2.0-pro
```

If your DashScope account is in Singapore, use the regional Model Studio base
URL from Alibaba Cloud instead of the Beijing default.

Cloudflare Workers AI fallback env vars:

```text
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
CLOUDFLARE_API_TOKEN=your_workers_ai_api_token
CLOUDFLARE_IMAGE_MODEL=@cf/stabilityai/stable-diffusion-xl-base-1.0
```

Optional controls:

```text
IMAGE_PROVIDER_ORDER=dashscope,cloudflare,pollinations
IMAGE_NEGATIVE_PROMPT=low quality, distorted face, text, logo, watermark
DASHSCOPE_PROMPT_EXTEND=true
```

For GitHub Pages, point the frontend at the deployed Vercel endpoint:

```js
window.IC_BACKEND_BASE_URL = "https://your-vercel-project.vercel.app";
```

When served directly from Vercel, the frontend uses `/api/generate-style-image`
automatically.
