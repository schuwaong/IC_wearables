const CJ_PRODUCT_SEARCH_ENDPOINT =
  process.env.CJ_PRODUCT_SEARCH_ENDPOINT || "https://ads.api.cj.com/query";
const INVOLVE_ASIA_PRODUCT_SEARCH_ENDPOINT =
  process.env.INVOLVE_ASIA_PRODUCT_SEARCH_ENDPOINT || process.env.INVOLVE_ASIA_API_ENDPOINT || "";
const MAX_RESULTS = Math.max(1, Math.min(12, Number(process.env.AFFILIATE_MAX_RESULTS) || 4));

const COUNTRY_CURRENCY = {
  AU: "AUD",
  CA: "CAD",
  GB: "GBP",
  HK: "HKD",
  SG: "SGD",
  US: "USD",
};

const MARKET_CONFIG = {
  HK: {
    countryCode: "HK",
    currency: "HKD",
    network: "hk-local",
    retailerKeywords: ["Zalora HK", "ITeSHOP HK", "ASOS HK"],
    cjAdvertiserIds: process.env.CJ_HK_ADVERTISER_IDS || process.env.CJ_ADVERTISER_IDS || "joined",
    cjCategory: process.env.CJ_HK_CATEGORY || process.env.CJ_CATEGORY || "",
    cjCurrency: process.env.CJ_HK_CURRENCY || "HKD",
    fallbackRetailers: [
      { brand: "Zalora HK", url: "https://www.zalora.com.hk/catalog/?q=" },
      { brand: "ITeSHOP HK", url: "https://www.iteshop.com/hk/search?q=" },
      { brand: "ASOS HK", url: "https://www.asos.com/search/?q=" },
    ],
  },
  GLOBAL: {
    countryCode: "US",
    currency: "USD",
    network: "global-cj",
    retailerKeywords: ["Nordstrom", "ASOS US", "Saks Fifth Avenue"],
    cjAdvertiserIds: process.env.CJ_GLOBAL_ADVERTISER_IDS || process.env.CJ_ADVERTISER_IDS || "joined",
    cjCategory: process.env.CJ_GLOBAL_CATEGORY || process.env.CJ_CATEGORY || "",
    cjCurrency: process.env.CJ_GLOBAL_CURRENCY || process.env.CJ_CURRENCY || "USD",
    fallbackRetailers: [
      { brand: "Nordstrom", url: "https://www.nordstrom.com/sr?keyword=" },
      { brand: "ASOS US", url: "https://www.asos.com/us/search/?q=" },
      { brand: "Saks Fifth Avenue", url: "https://www.saksfifthavenue.com/search?q=" },
    ],
  },
};

// Serverless-safe endpoint for Vercel/Netlify/AWS Lambda style runtimes.
// Keep affiliate API keys in deployment environment variables, never in GitHub Pages.
function jsonResponse(res, status, payload) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
  res.status(status).json(payload);
}

function netlifyResponse(status, payload) {
  return {
    statusCode: status,
    headers: {
      "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "s-maxage=300, stale-while-revalidate=900",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };
}

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function parseBody(rawBody) {
  if (!rawBody) return {};
  if (typeof rawBody === "object") return rawBody;
  return JSON.parse(rawBody);
}

function validatePayload(body) {
  const searchQuery = String(body.searchQuery || "").trim();
  const colorSeason = String(body.colorSeason || "").trim();
  if (!searchQuery) {
    const error = new Error("searchQuery is required");
    error.status = 400;
    throw error;
  }
  return { searchQuery, colorSeason };
}

function getHeader(headers = {}, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";

  const direct = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  if (Array.isArray(direct)) return direct[0] || "";
  if (direct) return String(direct);

  const normalizedName = name.toLowerCase();
  const foundKey = Object.keys(headers).find((key) => key.toLowerCase() === normalizedName);
  const value = foundKey ? headers[foundKey] : "";
  return Array.isArray(value) ? value[0] || "" : String(value || "");
}

function normalizeCountryCode(value) {
  const countryCode = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(countryCode) ? countryCode : "US";
}

function detectCountryCode({ headers = {}, geo = {} } = {}) {
  return normalizeCountryCode(
    getHeader(headers, "x-vercel-ip-country") ||
      getHeader(headers, "x-country-code") ||
      geo?.country?.code ||
      geo?.country?.country_code ||
      "US",
  );
}

function marketForCountry(countryCode) {
  switch (countryCode) {
    case "HK":
      return MARKET_CONFIG.HK;
    default:
      const localCurrency = COUNTRY_CURRENCY[countryCode] || MARKET_CONFIG.GLOBAL.currency;
      return {
        ...MARKET_CONFIG.GLOBAL,
        countryCode,
        currency: localCurrency,
        cjCurrency: process.env.CJ_GLOBAL_CURRENCY || process.env.CJ_CURRENCY || localCurrency,
      };
  }
}

function globalMarket() {
  return { ...MARKET_CONFIG.GLOBAL };
}

function buildMarketKeywords(searchQuery, colorSeason, market) {
  return [
    searchQuery,
    colorSeason,
    "fashion",
    "clothing",
    ...market.retailerKeywords,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildCjLegacyProductSearchUrl(searchQuery, colorSeason, market) {
  // CJ Product Search uses website-id to generate publisher-tracked buy URLs.
  const params = new URLSearchParams({
    "website-id": process.env.CJ_WEBSITE_ID,
    keywords: buildMarketKeywords(searchQuery, colorSeason, market),
    "advertiser-ids": market.cjAdvertiserIds,
    "records-per-page": String(MAX_RESULTS),
    "page-number": "1",
  });

  if (market.cjCategory) params.set("category", market.cjCategory);
  if (market.cjCurrency) params.set("currency", market.cjCurrency);

  return `${CJ_PRODUCT_SEARCH_ENDPOINT}?${params.toString()}`;
}

function cjCompanyId() {
  return (
    process.env.CJ_COMPANY_ID ||
    process.env.CJ_CID ||
    process.env.CJ_PUBLISHER_ID ||
    ""
  );
}

function buildCjGraphqlPayload(searchQuery, colorSeason, market) {
  const companyId = cjCompanyId();
  if (!companyId) {
    throw new Error("CJ_COMPANY_ID must be configured for CJ GraphQL product search");
  }

  const keywords = [searchQuery, colorSeason, "fashion", "clothing"].filter(Boolean);
  const query = `
    query ShoppingProducts(
      $companyId: ID!
      $keywords: [String!]
      $partnerStatus: PartnerStatus
      $limit: Int
      $currency: String
      $advertiserCountries: [String!]
    ) {
      shoppingProducts(
        companyId: $companyId
        keywords: $keywords
        partnerStatus: $partnerStatus
        limit: $limit
        currency: $currency
        advertiserCountries: $advertiserCountries
      ) {
        count
        totalCount
        resultList {
          id
          title
          advertiserName
          brand
          imageLink
          price {
            amount
            currency
          }
          salePrice {
            amount
            currency
          }
          linkCode(pid: "${process.env.CJ_WEBSITE_ID}") {
            clickUrl
            imageUrl
          }
          color
          gender
          material
          size
        }
      }
    }
  `;

  return {
    query,
    variables: {
      companyId,
      keywords,
      partnerStatus: "JOINED",
      limit: MAX_RESULTS,
      currency: market.cjCurrency,
      advertiserCountries: [market.countryCode],
    },
  };
}

function isCjGraphqlEndpoint() {
  return /ads\.api\.cj\.com\/query/i.test(CJ_PRODUCT_SEARCH_ENDPOINT);
}

function bearerToken(value = "") {
  return value.match(/^Bearer\s+/i) ? value : `Bearer ${value}`;
}

async function searchCjProducts(searchQuery, colorSeason, market) {
  const apiKey = process.env.CJ_API_KEY;
  const websiteId = process.env.CJ_WEBSITE_ID;
  if (!apiKey || !websiteId) {
    throw new Error("CJ_API_KEY and CJ_WEBSITE_ID must be configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.CJ_TIMEOUT_MS || 9000));

  try {
    const request =
      isCjGraphqlEndpoint()
        ? {
            url: CJ_PRODUCT_SEARCH_ENDPOINT,
            options: {
              method: "POST",
              headers: {
                Authorization: bearerToken(apiKey),
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify(buildCjGraphqlPayload(searchQuery, colorSeason, market)),
              signal: controller.signal,
            },
          }
        : {
            url: buildCjLegacyProductSearchUrl(searchQuery, colorSeason, market),
            options: {
              method: "GET",
              headers: {
                Authorization: bearerToken(apiKey),
                Accept: "application/xml, text/xml, application/json",
              },
              signal: controller.signal,
            },
          };

    const response = await fetch(request.url, request.options);

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`CJ Product Search failed with ${response.status}: ${raw.slice(0, 300)}`);
    }

    return normalizeProducts(raw, { searchQuery, colorSeason, market, source: "cj" });
  } finally {
    clearTimeout(timeout);
  }
}

function buildInvolveAsiaUrl(searchQuery, colorSeason, market) {
  const url = new URL(INVOLVE_ASIA_PRODUCT_SEARCH_ENDPOINT);
  url.searchParams.set("keyword", buildMarketKeywords(searchQuery, colorSeason, market));
  url.searchParams.set("limit", String(MAX_RESULTS));
  url.searchParams.set("country", market.countryCode);
  url.searchParams.set("currency", market.currency);
  return url.toString();
}

function buildInvolveAsiaPayload(searchQuery, colorSeason, market) {
  return {
    keyword: buildMarketKeywords(searchQuery, colorSeason, market),
    limit: MAX_RESULTS,
    country: market.countryCode,
    currency: market.currency,
  };
}

async function searchInvolveAsiaProducts(searchQuery, colorSeason, market) {
  const apiKey = process.env.INVOLVE_ASIA_API_KEY || process.env.INVOLVE_ASIA_TOKEN;
  if (!INVOLVE_ASIA_PRODUCT_SEARCH_ENDPOINT || !apiKey) {
    throw new Error("Involve Asia endpoint and API key are not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.INVOLVE_ASIA_TIMEOUT_MS || 9000));
  const authHeaderName = process.env.INVOLVE_ASIA_AUTH_HEADER || "Authorization";
  const method = String(process.env.INVOLVE_ASIA_METHOD || "GET").toUpperCase();
  const url =
    method === "GET"
      ? buildInvolveAsiaUrl(searchQuery, colorSeason, market)
      : INVOLVE_ASIA_PRODUCT_SEARCH_ENDPOINT;
  const headers = {
    [authHeaderName]: authHeaderName.toLowerCase() === "authorization" ? bearerToken(apiKey) : apiKey,
    Accept: "application/json",
  };
  if (method !== "GET") headers["Content-Type"] = "application/json";

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(buildInvolveAsiaPayload(searchQuery, colorSeason, market)),
      signal: controller.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Involve Asia lookup failed with ${response.status}: ${raw.slice(0, 300)}`);
    }

    return normalizeProducts(raw, { searchQuery, colorSeason, market, source: "involve-asia" });
  } finally {
    clearTimeout(timeout);
  }
}

async function searchHongKongProducts(searchQuery, colorSeason, market) {
  const attempts = [];

  if (INVOLVE_ASIA_PRODUCT_SEARCH_ENDPOINT) {
    attempts.push(() => searchInvolveAsiaProducts(searchQuery, colorSeason, market));
  }
  attempts.push(() => searchCjProducts(searchQuery, colorSeason, market));

  for (const attempt of attempts) {
    try {
      const products = preferMarketRetailers(await attempt(), market);
      if (products.length) return products;
    } catch (error) {
      console.warn(`[affiliate] HK market lookup failed: ${error.message}`);
    }
  }

  throw new Error("HK market lookup failed");
}

async function searchMarketProducts(searchQuery, colorSeason, market) {
  if (market.countryCode === "HK") {
    return searchHongKongProducts(searchQuery, colorSeason, market);
  }

  const products = preferMarketRetailers(await searchCjProducts(searchQuery, colorSeason, market), market);
  if (products.length) return products;
  throw new Error("Global CJ lookup returned no products");
}

function normalizeProducts(raw, context) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return normalizeJsonProducts(JSON.parse(trimmed), context);
  }

  return normalizeXmlProducts(trimmed, context);
}

function normalizeJsonProducts(payload, context) {
  const products = firstArray(
    payload,
    "products",
    "items",
    "resultList",
    "results",
    "data.products",
    "data.items",
    "data.resultList",
    "data.results",
    "data.shoppingProducts.resultList",
    "data.shoppingProducts.products",
  );

  return products.slice(0, MAX_RESULTS).map((item) => normalizeProduct(item, context)).filter(Boolean);
}

function normalizeXmlProducts(xml, context) {
  const productBlocks = [...xml.matchAll(/<product\b[^>]*>[\s\S]*?<\/product>/gi)].map((match) => match[0]);
  return productBlocks.slice(0, MAX_RESULTS).map((block) => normalizeXmlProduct(block, context)).filter(Boolean);
}

function normalizeXmlProduct(block, context) {
  const item = {
    productName: firstXmlTag(block, ["name", "title", "product-name"]),
    brand: firstXmlTag(block, ["brand", "advertiser-name", "manufacturer-name", "merchant-name"]),
    price: firstXmlTag(block, ["price", "sale-price", "retail-price"]),
    currency: firstXmlTag(block, ["currency"]),
    imageUrl: firstXmlTag(block, ["image-url", "image-link", "thumbnail-url"]),
    buyLink: firstXmlTag(block, ["buy-url", "click-url", "link", "destination-url"]),
  };
  return normalizeProduct(item, context);
}

function firstArray(payload, ...paths) {
  if (Array.isArray(payload)) return payload;

  for (const path of paths) {
    const value = path.split(".").reduce((current, key) => current?.[key], payload);
    if (Array.isArray(value)) return value;
  }

  return [];
}

function firstValue(item, keys) {
  for (const key of keys) {
    const value = key.split(".").reduce((current, part) => current?.[part], item);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function normalizeProduct(item, context) {
  const { market } = context;
  const productName = firstValue(item, [
    "productName",
    "product_name",
    "name",
    "title",
    "productTitle",
    "product_title",
  ]);
  const brand =
    firstValue(item, [
      "brand",
      "brandName",
      "brand_name",
      "advertiserName",
      "advertiser_name",
      "merchant",
      "merchantName",
      "merchant_name",
      "store",
    ]) || "Retail partner";
  const price = formatPrice(
    firstValue(item, ["price", "salePrice", "sale_price", "retailPrice", "retail_price", "price.amount"]),
    firstValue(item, ["currency", "price.currency"]),
    market,
  );
  const imageUrl = firstValue(item, [
    "imageUrl",
    "image_url",
    "imageLink",
    "image_link",
    "image",
    "thumbnailUrl",
    "thumbnail_url",
  ]);
  const rawBuyLink = firstValue(item, [
    "buyLink",
    "buy_link",
    "clickUrl",
    "click_url",
    "clickURL",
    "trackingLink",
    "tracking_link",
    "affiliateLink",
    "affiliate_link",
    "linkCode.clickUrl",
    "link",
    "productUrl",
    "product_url",
    "url",
  ]);

  if (!productName || !rawBuyLink) return null;

  return {
    productName: String(productName),
    brand: String(brand),
    price,
    imageUrl: String(imageUrl || ""),
    buyLink: appendAffiliateTracking(String(rawBuyLink), context),
  };
}

function preferMarketRetailers(products, market) {
  if (!market.retailerKeywords?.length) return products;

  const normalizedKeywords = market.retailerKeywords.map(slug);
  const preferred = products.filter((product) => {
    const haystack = slug(`${product.brand} ${product.productName} ${product.buyLink}`);
    return normalizedKeywords.some((keyword) => haystack.includes(keyword));
  });

  return preferred.length ? preferred : products;
}

function firstXmlTag(block, tagNames) {
  for (const tagName of tagNames) {
    const match = block.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
    if (match?.[1]) return decodeXml(match[1].trim());
  }
  return "";
}

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function formatPrice(price, currency, market) {
  const fallbackCurrency = normalizeCurrency(currency, market.currency);
  if (price === undefined || price === null || price === "") return `${fallbackCurrency} price on site`;

  const text = String(price).trim();
  if (!text) return `${fallbackCurrency} price on site`;
  if (/price on site/i.test(text)) return `${fallbackCurrency} price on site`;

  const detectedCurrency = currencyFromText(text) || fallbackCurrency;
  const cleaned = text
    .replace(/HK\$/gi, "")
    .replace(/US\$/gi, "")
    .replace(/\b(HKD|USD|GBP|EUR|CAD|AUD|SGD)\b/gi, "")
    .replace(/[$€£]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? `${detectedCurrency} ${cleaned}` : `${detectedCurrency} price on site`;
}

function normalizeCurrency(value, fallback = "USD") {
  const currency = String(value || "").trim().toUpperCase();
  if (currency === "HK$") return "HKD";
  if (currency === "US$") return "USD";
  return /^[A-Z]{3}$/.test(currency) ? currency : fallback;
}

function currencyFromText(text) {
  if (/HK\$|\bHKD\b/i.test(text)) return "HKD";
  if (/US\$|\bUSD\b/i.test(text)) return "USD";
  if (/\bGBP\b|£/i.test(text)) return "GBP";
  if (/\bEUR\b|€/i.test(text)) return "EUR";
  if (/\bCAD\b/i.test(text)) return "CAD";
  if (/\bAUD\b/i.test(text)) return "AUD";
  if (/\bSGD\b/i.test(text)) return "SGD";
  return "";
}

function appendAffiliateTracking(rawUrl, { searchQuery, colorSeason, market }) {
  try {
    const url = new URL(rawUrl);
    if (!url.searchParams.has("sid")) {
      url.searchParams.set("sid", trackingId(searchQuery, colorSeason, market));
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function trackingId(searchQuery, colorSeason, market) {
  return ["icw", market.countryCode, colorSeason, searchQuery]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "icw";
}

function buildRetailerSearchFallback(searchQuery, colorSeason, market) {
  const query = [searchQuery, colorSeason].filter(Boolean).join(" ");
  return market.fallbackRetailers.slice(0, MAX_RESULTS).map((retailer) => {
    const buyLink = `${retailer.url}${encodeURIComponent(query)}`;
    return {
      productName: `${query} search results`,
      brand: retailer.brand,
      price: `${market.currency} price on site`,
      imageUrl: "",
      buyLink: appendAffiliateTracking(buyLink, { searchQuery, colorSeason, market }),
    };
  });
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cleanProducts(products) {
  return products.slice(0, MAX_RESULTS).map((product) => ({
    productName: product.productName,
    brand: product.brand,
    price: product.price,
    imageUrl: product.imageUrl,
    buyLink: product.buyLink,
  }));
}

async function processRequest(body, requestMeta = {}) {
  const { searchQuery, colorSeason } = validatePayload(body);
  const countryCode = detectCountryCode(requestMeta);
  const market = marketForCountry(countryCode);

  try {
    return cleanProducts(await searchMarketProducts(searchQuery, colorSeason, market));
  } catch (marketError) {
    console.warn(`[affiliate] ${market.countryCode} lookup failed; trying global US fallback: ${marketError.message}`);
  }

  const fallbackMarket = globalMarket();
  try {
    return cleanProducts(await searchMarketProducts(searchQuery, colorSeason, fallbackMarket));
  } catch (globalError) {
    console.warn(`[affiliate] Global affiliate lookup failed; returning search fallback: ${globalError.message}`);
    return buildRetailerSearchFallback(searchQuery, colorSeason, fallbackMarket);
  }
}

async function vercelHandler(req, res) {
  corsHeaders(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return jsonResponse(res, 405, { error: "Method not allowed" });

  try {
    return jsonResponse(
      res,
      200,
      await processRequest(parseBody(req.body), { headers: req.headers }),
    );
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    return jsonResponse(res, status, {
      error: status === 500 ? "Affiliate product lookup failed" : error.message,
    });
  }
}

export async function handler(event, context = {}) {
  if (event.httpMethod === "OPTIONS") return netlifyResponse(204, {});
  if (event.httpMethod !== "POST") return netlifyResponse(405, { error: "Method not allowed" });

  try {
    return netlifyResponse(
      200,
      await processRequest(parseBody(event.body), {
        headers: event.headers,
        geo: context.geo,
      }),
    );
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    return netlifyResponse(status, {
      error: status === 500 ? "Affiliate product lookup failed" : error.message,
    });
  }
}

export default vercelHandler;
