# IC_wearables

Premium landing page for IC_wearables.

The primary landing-page CTA opens the on-page scan flow:

`https://schuwaong.github.io/IC_wearables/#face-lab`

The men's landing page now generates one locked five-look composite image:

- business formal
- smart casual
- city casual
- athleisure
- quiet luxury

The look categories are fixed, but the male page includes pre-generated
background-set directions that can be changed before regenerating. One
generation must include all five looks in the same image while keeping the
uploaded face unchanged.

The women's landing page uses the same on-page scan and then opens:

`https://schuwaong.github.io/IC_wearables/female/results.html`

The women's generator now always produces five fixed looks:

- business formal
- smart casual
- city casual
- athleisure
- quiet luxury

Occasion and background are no longer user-selectable in that flow; each look
has its own locked category/background pairing so the five generated results
cover the full set automatically.

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

The HK market config now expands retailer hints and fallback search coverage for
Zalora HK, ITeSHOP, ZARA HK, H&M HK, UNIQLO HK, COS HK, HBX HK, Kapok HK,
6ixty8ight HK, Marks & Spencer HK, ASOS, Lane Crawford, FARFETCH HK,
NET-A-PORTER HK, MR PORTER HK, Harvey Nichols, and eBay HK. The backend/library
can return up to eight HK retailer options per query, while the women's results
page shows up to three per outfit piece to keep the page readable.

Additional product-library providers:

```text
# Search order. SEA markets default to feed,involve-asia,cj,rakuten,ebay.
AFFILIATE_PROVIDER_ORDER=feed,cj,rakuten,ebay,involve-asia

# Optional market-specific override. Useful when Hong Kong should prefer local
# fashion feeds before global networks.
HK_AFFILIATE_PROVIDER_ORDER=feed,involve-asia,cj,rakuten,ebay
HK_AFFILIATE_MAX_RESULTS=8

# Product feed ingestion for Awin, Impact, Rakuten feeds, Skimlinks/Sovrn,
# or direct merchant CSV/TSV/JSON/XML feeds.
AFFILIATE_PRODUCT_FEED_URLS=awin-retailer|https://example.com/products.csv;impact-retailer|https://example.com/products.json
DIRECT_PRODUCT_FEED_URLS=merchant-direct|https://example.com/merchant-feed.csv
AFFILIATE_FEED_MAX_ROWS=1200
AFFILIATE_FEED_CACHE_MS=1800000

# Hong Kong-specific fashion feeds. These are checked before the global feed
# list for HK requests, so you can wire HK clothing merchants without affecting
# other markets.
HK_AFFILIATE_PRODUCT_FEED_URLS=hk-fashion|https://example.com/hk-fashion.csv
HK_DIRECT_PRODUCT_FEED_URLS=hk-merchant|https://example.com/hk-merchant-feed.csv
HK_AWIN_PRODUCT_FEED_URLS=hk-awin|https://example.com/hk-awin.csv
HK_IMPACT_PRODUCT_FEED_URLS=hk-impact|https://example.com/hk-impact.json
HK_SKIMLINKS_PRODUCT_FEED_URLS=hk-skimlinks|https://example.com/hk-skimlinks.csv
HK_SOVRN_PRODUCT_FEED_URLS=hk-sovrn|https://example.com/hk-sovrn.csv

# Rakuten Advertising Product Search.
RAKUTEN_BEARER_TOKEN=your_rakuten_token
RAKUTEN_ADVERTISER_MIDS=optional_comma_or_space_filtered_mids

# eBay Partner Network via Browse API.
EBAY_ACCESS_TOKEN=your_ebay_oauth_token
EBAY_CAMPAIGN_ID=your_epn_campaign_id
EBAY_MARKETPLACE_ID=optional_marketplace_override
```

See `affiliate-programmes.md` for the country-by-country programme table and
the fastest signup order.

Optional generic fallback:

```text
AFFILIATE_ALLOW_GENERIC_SEARCH_FALLBACK=true
```

Generic fallback returns retailer search links when CJ/Involve Asia/feed lookups
fail. Exact direct product pages still require working affiliate credentials or
approved product feed URLs.

Nearby-store links are opt-in on the results page. The browser asks for location
only after the shopper clicks **Enable nearby stores**. Coordinates are stored
in the browser for a short session and used only to open Google Maps or retailer
store-locator links; they are not sent to the IC_wearables backend.

## Product Library

Build a season/look/piece product manifest from the affiliate backend:

```powershell
node scripts/build-product-library.mjs
```

This writes `data/product-library.json` locally with:

- season and palette category
- look category
- outfit piece
- product name, brand, price, affiliate link, image URL
- exact-vs-fallback status

The generated JSON and any downloaded product images are ignored by Git by
default. Commit product image files only when the affiliate programme or product
feed terms explicitly allow local hosting. Otherwise, use the remote image URLs
from the manifest at runtime.

To build the same manifest and cache product images locally, enable the opt-in
download flag:

```powershell
$env:PRODUCT_LIBRARY_CACHE_IMAGES='true'
node scripts/build-product-library.mjs
```

By default, the cache only downloads exact product image URLs from affiliate
feeds and skips generic fallback search results. The script records
`localImagePath`, `imageCacheStatus`, `imageCacheError`, `imageContentType`, and
`imageBytes` for every product so you can see exactly what happened.

Useful cache controls:

```text
PRODUCT_LIBRARY_IMAGE_OUTPUT_DIR=data/product-images
PRODUCT_LIBRARY_IMAGE_PUBLIC_BASE_PATH=data/product-images
PRODUCT_LIBRARY_IMAGE_MAX_BYTES=6000000
PRODUCT_LIBRARY_IMAGE_TIMEOUT_MS=15000
PRODUCT_LIBRARY_IMAGE_OVERWRITE=false
PRODUCT_LIBRARY_CACHE_FALLBACK_IMAGES=false
```

Keep `PRODUCT_LIBRARY_CACHE_FALLBACK_IMAGES=false` unless the fallback provider
is returning real product image URLs that you are allowed to cache.

Build outfit-combination reference boards from the library:

```powershell
node scripts/build-product-combinations.mjs
```

This writes:

```text
assets/outfit-combinations/manifest.json
assets/outfit-combinations/families/{spring|summer|autumn|winter}__{look}.png
```

The female image flow can use these boards as Image 2:

```text
Image 1 = scanned face
Image 2 = outfit-combination board
```

The board is a product/garment reference only. The prompt tells the image model
not to copy typography, catalogue-model identity, face, hair, body, expression,
or pose from the board. When exact affiliate product images are available and
cached, the board builder will include them automatically; until then it creates
palette/product placeholder boards from the JSON rows.

Capture local product image assets:

```powershell
$env:PRODUCT_CAPTURE_MAX_PRODUCTS='24'
node scripts/capture-product-assets.mjs
```

If products have real `imageUrl` values, this downloads those images into
`data/product-images/` and updates `data/product-library.json`.

Screenshot capture is intentionally opt-in because retailer pages can show bot
walls, cookie gates, search pages, or copyrighted product photos:

```powershell
$env:PRODUCT_CAPTURE_ALLOW_FALLBACK='true'
$env:PRODUCT_CAPTURE_ALLOW_SCREENSHOTS='true'
node scripts/capture-product-assets.mjs
```

The screenshot mode uses local Chrome headless, crops the page into a product
asset, and rejects likely blank/bot-check captures. Keep screenshot/downloaded
retailer photos local unless your affiliate/feed terms allow you to host them.
After valid assets are captured, rebuild the board images:

```powershell
node scripts/build-product-combinations.mjs
```

Generate cleaner palette-aware outfit crop boards:

```powershell
npm run generate:outfits
```

This reads `data/product-library.json`, crops garment/product areas from
`data/product-images/`, scores candidate crops against the product's seasonal
colour palette and piece type, then writes one combined Image 2 reference board
per season/look:

```text
data/outfit-combination-crops/manifest.json
data/outfit-combination-crops/boards/{season}/{season}__{look}.png
data/outfit-combination-crops/crops/{season}/{look}/{piece}.png
```

Useful controls:

```text
OUTFIT_COMBO_INPUT=data/product-library.json
OUTFIT_COMBO_OUTPUT_DIR=data/outfit-combination-crops
OUTFIT_COMBO_GROUP_BY=season
OUTFIT_COMBO_MAX_PRODUCTS=4
OUTFIT_COMBO_LABELS=false
OUTFIT_COMBO_ALLOW_REMOTE_IMAGES=false
```

Use these generated boards as the second image sent to the image model:
`Image 1 = scanned face`, `Image 2 = combined outfit board`. The crop boards
are better for image-to-image generation than raw search-page screenshots, but
they should remain local unless your retailer/affiliate terms allow hosting
cropped product imagery.

## Image Generation Backend

The outfit images can be generated through:

`/api/generate-style-image`

Provider order defaults to:

```text
dashscope,vertex,gemini,cloudflare,pollinations,local-template
```

Alibaba DashScope/Qwen Image is tried first, Gemini can be enabled as a
higher-quality reference-image fallback, Vertex AI can be enabled as a second
Google-hosted fallback for face-preserving renders, Cloudflare Workers AI
remains the free-tier text-only fallback, Pollinations can be used through its
current key-based API, and `local-template` is the built-in zero-key safety
net that still returns an on-brand image when remote providers fail.

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

Gemini image fallback env vars:

```text
GEMINI_API_KEY=your_gemini_api_key
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
```

Vertex AI image fallback env vars:

```text
VERTEX_AI_PROJECT_ID=your_gcp_project_id
VERTEX_AI_LOCATION=global
VERTEX_AI_IMAGE_MODEL=gemini-2.5-flash-image
VERTEX_AI_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","token_uri":"https://oauth2.googleapis.com/token"}
```

Alternative Vertex auth options:

```text
VERTEX_AI_ACCESS_TOKEN=ya29.your_short_lived_token
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

For local development, the backend also accepts the standard Google ADC file
created by:

```text
gcloud auth application-default login
```

`gemini-2.5-flash-image` is the safe documented default for Vertex image
generation in this backend. If Google enables a newer image-capable Gemini
model in your project, set `VERTEX_AI_IMAGE_MODEL` to that model id without
changing code.

Pollinations image fallback env vars:

```text
POLLINATIONS_API_KEY=your_pollinations_key
POLLINATIONS_BASE_URL=https://gen.pollinations.ai
POLLINATIONS_IMAGE_MODELS=flux,qwen-image,zimage
```

The backend can also try provider aliases such as
`pollinations-flux,pollinations-qwen,pollinations-zimage` in
`IMAGE_PROVIDER_ORDER` if you want to force a specific Pollinations model.

Optional controls:

```text
IMAGE_PROVIDER_ORDER=dashscope,vertex,gemini,cloudflare,pollinations,local-template
IMAGE_NEGATIVE_PROMPT=low quality, distorted face, warped face, changed identity, different face in each panel, changed expression, added smile, grin, text, logo, watermark
DASHSCOPE_PROMPT_EXTEND=false
VERTEX_AI_TIMEOUT_MS=30000
IMAGE_REFERENCE_MAX_COUNT=5
```

For face-preserving generations, keep a reference-capable provider such as
DashScope or Gemini enabled. The frontend now refuses text-only fallbacks when
the scanned face reference is required, because those fallbacks can change
identity or expression.

The female generated-look flow sends Image 1 as the scanned face identity
reference, then can send product images as Images 2+ for garments, shoes, bags,
and accessories. The default cap is 5 total reference images, configurable with
`IMAGE_REFERENCE_MAX_COUNT` on the backend and `window.IC_IMAGE_REFERENCE_MAX_COUNT`
on the frontend.

The men's composite generator depends on that same reference lock because the
same face has to stay consistent across all five looks in one image.

If every remote provider fails, `local-template` generates a deterministic
fallback image locally with `sharp`. When a face reference is present, it keeps
the exact uploaded face and builds a branded editorial board around it instead
of failing the request.

For GitHub Pages, point the frontend at the deployed Vercel endpoint:

```js
window.IC_BACKEND_BASE_URL = "https://your-vercel-project.vercel.app";
```

When served directly from Vercel, the frontend uses `/api/generate-style-image`
automatically.
