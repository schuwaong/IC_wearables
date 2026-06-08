const CJ_PRODUCT_SEARCH_ENDPOINT =
  process.env.CJ_PRODUCT_SEARCH_ENDPOINT || "https://ads.api.cj.com/query";
const INVOLVE_ASIA_PRODUCT_SEARCH_ENDPOINT =
  process.env.INVOLVE_ASIA_PRODUCT_SEARCH_ENDPOINT || process.env.INVOLVE_ASIA_API_ENDPOINT || "";
const RAKUTEN_PRODUCT_SEARCH_ENDPOINT =
  process.env.RAKUTEN_PRODUCT_SEARCH_ENDPOINT || "https://api.linksynergy.com/productsearch/1.0";
const EBAY_BROWSE_SEARCH_ENDPOINT =
  process.env.EBAY_BROWSE_SEARCH_ENDPOINT || "https://api.ebay.com/buy/browse/v1/item_summary/search";
const DEFAULT_MAX_RESULTS = Number(process.env.AFFILIATE_MAX_RESULTS) || 4;
const HK_MAX_RESULTS = Number(process.env.HK_AFFILIATE_MAX_RESULTS) || Math.max(DEFAULT_MAX_RESULTS, 8);
const MAX_RESULTS = Math.max(1, Math.min(12, DEFAULT_MAX_RESULTS));
const FEED_MAX_ROWS = Math.max(25, Math.min(5000, Number(process.env.AFFILIATE_FEED_MAX_ROWS) || 1200));
const FEED_CACHE_MS = Math.max(60000, Number(process.env.AFFILIATE_FEED_CACHE_MS) || 1000 * 60 * 30);
const ALLOW_GENERIC_SEARCH_FALLBACK =
  String(process.env.AFFILIATE_ALLOW_GENERIC_SEARCH_FALLBACK || "true").trim().toLowerCase() !== "false";
const USE_INVOLVE_ASIA_FALLBACK_FOR_GLOBAL =
  String(
    process.env.INVOLVE_ASIA_FALLBACK_FOR_GLOBAL || process.env.INVOLVE_ASIA_GLOBAL_FALLBACK || "true",
  )
    .trim()
    .toLowerCase() === "true";
const INVOLVE_ASIA_SEARCH_PARAM = process.env.INVOLVE_ASIA_SEARCH_PARAM || "keyword";
const INVOLVE_ASIA_SEARCH_BODY_PARAM = process.env.INVOLVE_ASIA_SEARCH_BODY_PARAM || INVOLVE_ASIA_SEARCH_PARAM;
const INVOLVE_ASIA_TRACKING_PARAM = process.env.INVOLVE_ASIA_TRACKING_PARAM || "sid";
const INVOLVE_ASIA_TRACKING_VALUE =
  process.env.INVOLVE_ASIA_TRACKING_VALUE || process.env.INVOLVE_ASIA_AFFILIATE_ID || "icw";
const DEFAULT_AFFILIATE_PROVIDER_ORDER = "feed,cj,rakuten,ebay,involve-asia";
const SEA_PROVIDER_ORDER = "feed,involve-asia,cj,rakuten,ebay";

const EBAY_MARKETPLACE_BY_COUNTRY = {
  AU: "EBAY_AU",
  CA: "EBAY_CA",
  DE: "EBAY_DE",
  ES: "EBAY_ES",
  FR: "EBAY_FR",
  GB: "EBAY_GB",
  HK: "EBAY_HK",
  IT: "EBAY_IT",
  NL: "EBAY_NL",
  US: "EBAY_US",
};

const feedCache = globalThis.__icWearablesAffiliateFeedCache || new Map();
globalThis.__icWearablesAffiliateFeedCache = feedCache;

function isInvolveAsiaConfigured() {
  return Boolean(
    INVOLVE_ASIA_PRODUCT_SEARCH_ENDPOINT &&
      (process.env.INVOLVE_ASIA_API_KEY || process.env.INVOLVE_ASIA_TOKEN),
  );
}

function isRakutenConfigured() {
  return Boolean(rakutenToken());
}

function isEbayConfigured(market) {
  return Boolean(ebayToken() && ebayCampaignId() && ebayMarketplaceId(market));
}

function marketFeedEnvPrefix(market) {
  const countryCode = String(market?.countryCode || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(countryCode) ? `${countryCode}_` : "";
}

function mergeUniqueFeedSources(sources) {
  return sources.filter((entry, index, all) => all.findIndex((item) => item.url === entry.url) === index);
}

function productFeedSources(market = null) {
  const prefix = marketFeedEnvPrefix(market);
  return mergeUniqueFeedSources([
    ...splitFeedSources(
      process.env[`${prefix}AFFILIATE_PRODUCT_FEED_URLS`] || process.env[`${prefix}AFFILIATE_FEED_URLS`],
      "feed",
    ),
    ...splitFeedSources(process.env[`${prefix}DIRECT_PRODUCT_FEED_URLS`], "direct-feed"),
    ...splitFeedSources(process.env[`${prefix}AWIN_PRODUCT_FEED_URLS`], "awin-feed"),
    ...splitFeedSources(process.env[`${prefix}RAKUTEN_PRODUCT_FEED_URLS`], "rakuten-feed"),
    ...splitFeedSources(process.env[`${prefix}IMPACT_PRODUCT_FEED_URLS`], "impact-feed"),
    ...splitFeedSources(process.env[`${prefix}SKIMLINKS_PRODUCT_FEED_URLS`], "skimlinks-feed"),
    ...splitFeedSources(process.env[`${prefix}SOVRN_PRODUCT_FEED_URLS`], "sovrn-feed"),
    ...splitFeedSources(process.env.AFFILIATE_PRODUCT_FEED_URLS || process.env.AFFILIATE_FEED_URLS, "feed"),
    ...splitFeedSources(process.env.DIRECT_PRODUCT_FEED_URLS, "direct-feed"),
    ...splitFeedSources(process.env.AWIN_PRODUCT_FEED_URLS, "awin-feed"),
    ...splitFeedSources(process.env.RAKUTEN_PRODUCT_FEED_URLS, "rakuten-feed"),
    ...splitFeedSources(process.env.IMPACT_PRODUCT_FEED_URLS, "impact-feed"),
    ...splitFeedSources(process.env.SKIMLINKS_PRODUCT_FEED_URLS, "skimlinks-feed"),
    ...splitFeedSources(process.env.SOVRN_PRODUCT_FEED_URLS, "sovrn-feed"),
  ]);
}

function splitFeedSources(value, defaultSource) {
  return String(value || "")
    .split(/[\n;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf("|");
      if (separator === -1) return { source: defaultSource, url: entry };
      return {
        source: entry.slice(0, separator).trim() || defaultSource,
        url: entry.slice(separator + 1).trim(),
      };
    })
    .filter((entry) => /^https?:\/\//i.test(entry.url));
}

function isProductFeedConfigured(market = null) {
  return productFeedSources(market).length > 0;
}

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

const BUDGET_LABELS = {
  affordable: "Affordable",
  "mid premium": "Mid premium",
  "investment piece": "Investment piece",
};

const BUDGET_RANGES_BY_CURRENCY = {
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

const MARKET_CONFIG = {
  HK: {
    countryCode: "HK",
    currency: "HKD",
    network: "hk-local",
    searchHints: ["Hong Kong", "HK", "ships to Hong Kong", "HKD"],
    retailerKeywords: [
      "Zalora HK",
      "ITeSHOP HK",
      "ASOS HK",
      "Lane Crawford",
      "ZARA Hong Kong",
      "H&M Hong Kong",
      "UNIQLO Hong Kong",
      "COS Hong Kong",
      "HBX Hong Kong",
      "Kapok Hong Kong",
      "6ixty8ight Hong Kong",
      "Marks & Spencer Hong Kong",
      "NET-A-PORTER HK",
      "MR PORTER HK",
      "Farfetch HK",
      "Harvey Nichols Hong Kong",
      "eBay HK",
    ],
    cjAdvertiserIds: process.env.CJ_HK_ADVERTISER_IDS || process.env.CJ_ADVERTISER_IDS || "joined",
    cjCategory: process.env.CJ_HK_CATEGORY || process.env.CJ_CATEGORY || "",
    cjCurrency: process.env.CJ_HK_CURRENCY || "HKD",
    fallbackRetailers: [
      { brand: "Zalora HK", url: "https://www.zalora.com.hk/catalog/?q=" },
      { brand: "ITeSHOP HK", url: "https://www.iteshop.com/hk/search?q=" },
      { brand: "ZARA HK", url: "https://www.zara.com/hk/en/search?searchTerm=" },
      { brand: "H&M HK", url: "https://www2.hm.com/en_hk/search-results.html?q=" },
      { brand: "UNIQLO HK", url: "https://www.uniqlo.com.hk/en/search?q=" },
      { brand: "COS HK", url: "https://www.cos.com/en-hk/search?query=" },
      { brand: "HBX HK", url: "https://hbx.com/women/search?q=" },
      { brand: "Kapok HK", url: "https://ka-pok.com/search?q=" },
      { brand: "6ixty8ight HK", url: "https://www.6ixty8ight.com/hk/search?q=" },
      { brand: "Marks & Spencer HK", url: "https://www.marksandspencer.com/hk/search?q=" },
      { brand: "ASOS HK", url: "https://www.asos.com/search/?q=" },
      { brand: "Lane Crawford", url: "https://www.lanecrawford.com/search/?text=" },
      { brand: "FARFETCH HK", url: "https://www.farfetch.com/hk/shopping/search/items.aspx?q=" },
      { brand: "NET-A-PORTER HK", url: "https://www.net-a-porter.com/en-hk/shop/search/" },
      { brand: "MR PORTER HK", url: "https://www.mrporter.com/en-hk/mens/search/" },
      { brand: "Harvey Nichols", url: "https://www.harveynichols.com/search/?q=" },
      { brand: "eBay HK", url: "https://www.ebay.com.hk/sch/i.html?_nkw=" },
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

const HK_STORE_LOCATORS = [
  { match: /zalora/i, url: "https://www.zalora.com.hk/", mode: "map" },
  { match: /iteshop|i\.t/i, url: "https://www.iteshop.com/hk/", mode: "map" },
  { match: /zara/i, url: "https://www.zara.com/hk/en/z-stores-st1404.html", mode: "locator" },
  { match: /h&m|hennes/i, url: "https://www2.hm.com/en_hk/customer-service/shopping-at-hm/store-locator.html", mode: "locator" },
  { match: /uniqlo/i, url: "https://www.uniqlo.com.hk/en/stores", mode: "locator" },
  { match: /\bcos\b/i, url: "https://www.cos.com/en-hk/customer-service/store-locator.html", mode: "locator" },
  { match: /hbx/i, url: "https://hbx.com/", mode: "map" },
  { match: /kapok/i, url: "https://ka-pok.com/pages/stores", mode: "locator" },
  { match: /6ixty8ight/i, url: "https://www.6ixty8ight.com/hk/store-locator", mode: "locator" },
  { match: /marks\s*&?\s*spencer|m&s/i, url: "https://www.marksandspencer.com/hk/store-locator", mode: "locator" },
  { match: /asos|farfetch|net-a-porter|mr porter|ebay/i, url: "", mode: "online" },
  { match: /lane crawford/i, url: "https://www.lanecrawford.com.hk/store-locator/", mode: "locator" },
  { match: /harvey nichols/i, url: "https://www.harveynichols.com.hk/store-locator/", mode: "locator" },
];

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
  return {
    searchQuery,
    colorSeason,
    budget: normalizeBudget(body.budget),
    requestedCountryCode: requestedCountryCode(body.countryCode),
    allowSearchFallback: normalizeBoolean(body.allowSearchFallback),
    requireProductPages: normalizeBoolean(body.requireProductPages, true),
  };
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

function requestedCountryCode(value) {
  const countryCode = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(countryCode) ? countryCode : "";
}

function normalizeBudget(value) {
  const budget = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(BUDGET_LABELS, budget) ? budget : "mid premium";
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return fallback;
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

function budgetRangeForSelection(selection, market) {
  const currency = normalizeCurrency(market.currency, MARKET_CONFIG.GLOBAL.currency);
  const rangeTable = BUDGET_RANGES_BY_CURRENCY[currency] || BUDGET_RANGES_BY_CURRENCY.USD;
  const [min, max] = rangeTable[selection] || rangeTable["mid premium"];
  return {
    selection,
    currency,
    min,
    max,
    label: `${formatCurrencyAmount(min, currency)} - ${formatCurrencyAmount(max, currency)}`,
  };
}

function formatCurrencyAmount(amount, currency) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
  }).format(amount);
}

function buildMarketKeywords(searchQuery, colorSeason, market) {
  return [
    searchQuery,
    colorSeason,
    "fashion",
    "clothing",
    ...(market.searchHints || []),
    ...market.retailerKeywords,
  ]
    .filter(Boolean)
    .join(" ");
}

function keywordTokens(...parts) {
  return parts
    .flatMap((part) => String(part || "").split(/[^A-Za-z0-9#+.-]+/))
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

function buildCjKeywordPhrase(searchQuery, colorSeason, market) {
  const tokens = keywordTokens(
    searchQuery,
    colorSeason,
    ...(market.searchHints || []).slice(0, 2),
    "fashion",
    "clothing",
  );
  const unique = tokens.filter((token, index, all) => all.indexOf(token) === index);
  return unique.slice(0, 10).join(" ");
}

function buildCjKeywordList(searchQuery, colorSeason, market) {
  return buildCjKeywordPhrase(searchQuery, colorSeason, market)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10);
}

function affiliateProviderOrder(market) {
  const defaultOrder = ["HK", "SG", "MY", "ID", "PH", "TH", "VN", "TW"].includes(market.countryCode)
    ? SEA_PROVIDER_ORDER
    : DEFAULT_AFFILIATE_PROVIDER_ORDER;
  const raw = process.env[`${market.countryCode}_AFFILIATE_PROVIDER_ORDER`] || process.env.AFFILIATE_PROVIDER_ORDER || defaultOrder;
  const providers = String(raw)
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(providers)].filter((provider) => canAttemptProvider(provider, market));
}

function canAttemptProvider(provider, market) {
  switch (provider) {
    case "feed":
    case "feeds":
    case "product-feed":
      return isProductFeedConfigured(market);
    case "involve-asia":
    case "involve":
      return isInvolveAsiaConfigured();
    case "rakuten":
    case "linkshare":
      return isRakutenConfigured();
    case "ebay":
    case "epn":
      return isEbayConfigured(market);
    case "cj":
      return true;
    default:
      return false;
  }
}

function buildCjLegacyProductSearchUrl(searchQuery, colorSeason, market) {
  // CJ Product Search uses website-id to generate publisher-tracked buy URLs.
  const params = new URLSearchParams({
    "website-id": process.env.CJ_WEBSITE_ID,
    keywords: buildCjKeywordPhrase(searchQuery, colorSeason, market),
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

function cjCredential() {
  return (
    process.env.CJ_PERSONAL_ACCESS_TOKEN ||
    process.env.CJ_PAT ||
    process.env.CJ_API_KEY ||
    ""
  ).trim();
}

function isLikelyPersonalAccessToken(value = "") {
  return /^P[-_][A-Za-z0-9]/.test(String(value).trim());
}

function buildCjGraphqlPayload(searchQuery, colorSeason, market) {
  const companyId = cjCompanyId();
  if (!companyId) {
    throw new Error("CJ_COMPANY_ID must be configured for CJ GraphQL product search");
  }

  const keywords = buildCjKeywordList(searchQuery, colorSeason, market);
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

async function searchCjProducts(searchQuery, colorSeason, market, options = {}) {
  const apiKey = cjCredential();
  const websiteId = process.env.CJ_WEBSITE_ID;
  if (!apiKey || !websiteId) {
    throw new Error("CJ personal access token and CJ_WEBSITE_ID must be configured");
  }

  if (isCjGraphqlEndpoint() && !isLikelyPersonalAccessToken(apiKey)) {
    throw new Error(
      "CJ GraphQL product search requires a CJ Personal Access Token. Set CJ_PERSONAL_ACCESS_TOKEN or CJ_PAT instead of an old developer key.",
    );
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

    return normalizeProducts(raw, { searchQuery, colorSeason, market, source: "cj", ...options });
  } finally {
    clearTimeout(timeout);
  }
}

function buildInvolveAsiaUrl(searchQuery, colorSeason, market) {
  const url = new URL(INVOLVE_ASIA_PRODUCT_SEARCH_ENDPOINT);
  url.searchParams.set(INVOLVE_ASIA_SEARCH_PARAM, buildMarketKeywords(searchQuery, colorSeason, market));
  url.searchParams.set("limit", String(MAX_RESULTS));
  url.searchParams.set("country", market.countryCode);
  url.searchParams.set("currency", market.currency);
  url.searchParams.set("retailers", market.retailerKeywords.join(","));
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

async function searchInvolveAsiaProducts(searchQuery, colorSeason, market, options = {}) {
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
      body:
        method === "GET"
          ? undefined
          : JSON.stringify({
              ...buildInvolveAsiaPayload(searchQuery, colorSeason, market),
              [INVOLVE_ASIA_SEARCH_BODY_PARAM]: buildMarketKeywords(searchQuery, colorSeason, market),
            }),
      signal: controller.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Involve Asia lookup failed with ${response.status}: ${raw.slice(0, 300)}`);
    }

    return normalizeProducts(raw, { searchQuery, colorSeason, market, source: "involve-asia", ...options });
  } finally {
    clearTimeout(timeout);
  }
}

function marketSearchProviders(market) {
  return affiliateProviderOrder(market).filter((provider) => {
    if ((provider === "involve" || provider === "involve-asia") && !USE_INVOLVE_ASIA_FALLBACK_FOR_GLOBAL) {
      return market.countryCode === "HK";
    }
    return true;
  });
}

function rakutenToken() {
  return (
    process.env.RAKUTEN_BEARER_TOKEN ||
    process.env.RAKUTEN_ACCESS_TOKEN ||
    process.env.RAKUTEN_API_TOKEN ||
    ""
  ).trim();
}

function buildRakutenProductSearchUrl(searchQuery, colorSeason, market) {
  const url = new URL(RAKUTEN_PRODUCT_SEARCH_ENDPOINT);
  url.searchParams.set("keyword", sanitizeRakutenKeyword(buildMarketKeywords(searchQuery, colorSeason, market)));
  url.searchParams.set("max", String(Math.min(100, Math.max(MAX_RESULTS, 10))));
  url.searchParams.set("pagenumber", "1");
  if (process.env.RAKUTEN_LANGUAGE) url.searchParams.set("language", process.env.RAKUTEN_LANGUAGE);
  if (process.env.RAKUTEN_ADVERTISER_MIDS) url.searchParams.set("mid", process.env.RAKUTEN_ADVERTISER_MIDS);
  return url.toString();
}

function sanitizeRakutenKeyword(value) {
  return String(value || "")
    .replace(/[&=?{}\\()[\]\-;~|$!><*%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchRakutenProducts(searchQuery, colorSeason, market, options = {}) {
  const token = rakutenToken();
  if (!token) throw new Error("Rakuten Product Search bearer token is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.RAKUTEN_TIMEOUT_MS || 9000));

  try {
    const response = await fetch(buildRakutenProductSearchUrl(searchQuery, colorSeason, market), {
      method: "GET",
      headers: {
        Authorization: bearerToken(token),
        Accept: "application/xml, text/xml",
      },
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Rakuten Product Search failed with ${response.status}: ${raw.slice(0, 300)}`);
    }
    return normalizeProducts(raw, { searchQuery, colorSeason, market, source: "rakuten", ...options });
  } finally {
    clearTimeout(timeout);
  }
}

function ebayToken() {
  return (
    process.env.EBAY_ACCESS_TOKEN ||
    process.env.EBAY_OAUTH_TOKEN ||
    process.env.EBAY_BROWSE_ACCESS_TOKEN ||
    ""
  ).trim();
}

function ebayCampaignId() {
  return (
    process.env.EBAY_CAMPAIGN_ID ||
    process.env.EBAY_EPN_CAMPAIGN_ID ||
    process.env.EBAY_PARTNER_NETWORK_CAMPAIGN_ID ||
    ""
  ).trim();
}

function ebayMarketplaceId(market) {
  return process.env.EBAY_MARKETPLACE_ID || EBAY_MARKETPLACE_BY_COUNTRY[market.countryCode] || "";
}

function buildEbaySearchUrl(searchQuery, colorSeason) {
  const url = new URL(EBAY_BROWSE_SEARCH_ENDPOINT);
  url.searchParams.set("q", [searchQuery, colorSeason, "fashion clothing"].filter(Boolean).join(" "));
  url.searchParams.set("limit", String(Math.min(50, Math.max(MAX_RESULTS, 10))));
  url.searchParams.set("filter", "buyingOptions:{FIXED_PRICE}");
  return url.toString();
}

async function searchEbayProducts(searchQuery, colorSeason, market, options = {}) {
  const token = ebayToken();
  const campaignId = ebayCampaignId();
  const marketplaceId = ebayMarketplaceId(market);
  if (!token || !campaignId || !marketplaceId) {
    throw new Error("eBay Browse API token, ePN campaign ID, and marketplace ID must be configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.EBAY_TIMEOUT_MS || 9000));
  const referenceId = trackingId(searchQuery, colorSeason, market);

  try {
    const response = await fetch(buildEbaySearchUrl(searchQuery, colorSeason), {
      method: "GET",
      headers: {
        Authorization: bearerToken(token),
        Accept: "application/json",
        "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
        "X-EBAY-C-ENDUSERCTX": `affiliateCampaignId=${campaignId},affiliateReferenceId=${referenceId}`,
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`eBay Browse search failed with ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
    }

    return normalizeJsonProducts(
      {
        products: (payload.itemSummaries || []).map((item) => ({
          productName: item.title,
          brand: item.seller?.username || item.itemLocation?.country || "eBay",
          price: item.price?.value,
          currency: item.price?.currency,
          imageUrl: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl,
          buyLink: item.itemAffiliateWebUrl || item.itemWebUrl,
        })),
      },
      { searchQuery, colorSeason, market, source: "ebay", ...options },
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function searchProductFeedProducts(searchQuery, colorSeason, market, options = {}) {
  const sources = productFeedSources(market);
  if (!sources.length) throw new Error("No affiliate product feed URLs are configured");

  const allProducts = [];
  const failures = [];
  for (const source of sources) {
    try {
      const raw = await loadProductFeed(source);
      allProducts.push(
        ...normalizeFeedProducts(raw, {
          searchQuery,
          colorSeason,
          market,
          source: source.source,
          ...options,
        }),
      );
    } catch (error) {
      failures.push(`${source.source}: ${error.message}`);
    }
  }

  const ranked = rankProductsForQuery(allProducts, searchQuery, colorSeason);
  if (ranked.length) return ranked;
  if (failures.length) throw new Error(`Product feeds returned no matches | ${failures.join(" | ")}`);
  return [];
}

async function loadProductFeed(source) {
  const cached = feedCache.get(source.url);
  if (cached && Date.now() - cached.createdAt < FEED_CACHE_MS) return cached.raw;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AFFILIATE_FEED_TIMEOUT_MS || 9000));
  try {
    const response = await fetch(source.url, {
      headers: { Accept: "application/json, text/csv, text/xml, application/xml, text/plain" },
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`feed download failed with ${response.status}: ${raw.slice(0, 240)}`);
    }
    feedCache.set(source.url, { raw, createdAt: Date.now() });
    return raw;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeFeedProducts(raw, context) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith("<")) {
    return normalizeProducts(trimmed, context);
  }
  return normalizeDelimitedProducts(trimmed, context);
}

function normalizeDelimitedProducts(raw, context) {
  const rows = parseDelimitedRows(raw).slice(0, FEED_MAX_ROWS + 1);
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => normalizeFeedHeader(header));
  return rows
    .slice(1)
    .map((row) =>
      row.reduce((item, value, index) => {
        if (headers[index]) item[headers[index]] = value;
        return item;
      }, {}),
    )
    .map((item) => normalizeProduct(item, context))
    .filter(Boolean);
}

function parseDelimitedRows(raw) {
  const delimiter = raw.includes("\t") && !raw.includes(",") ? "\t" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    const next = raw[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((currentRow) => currentRow.some((value) => String(value || "").trim()));
}

function normalizeFeedHeader(value) {
  return String(value || "")
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .toLowerCase();
}

function rankProductsForQuery(products, searchQuery, colorSeason) {
  const terms = `${searchQuery} ${colorSeason}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !["the", "and", "for", "with", "fashion", "clothing"].includes(term));

  return products
    .map((product) => {
      const haystack = `${product.productName} ${product.brand} ${product.buyLink}`.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { product, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.product)
    .slice(0, MAX_RESULTS);
}

async function searchProviderProducts(provider, searchQuery, colorSeason, market, options) {
  switch (provider) {
    case "feed":
    case "feeds":
    case "product-feed":
      return searchProductFeedProducts(searchQuery, colorSeason, market, options);
    case "involve":
    case "involve-asia":
      return searchInvolveAsiaProducts(searchQuery, colorSeason, market, options);
    case "rakuten":
    case "linkshare":
      return searchRakutenProducts(searchQuery, colorSeason, market, options);
    case "ebay":
    case "epn":
      return searchEbayProducts(searchQuery, colorSeason, market, options);
    case "cj":
      return searchCjProducts(searchQuery, colorSeason, market, options);
    default:
      throw new Error(`Unsupported affiliate provider: ${provider}`);
  }
}

async function searchMarketProducts(searchQuery, colorSeason, market, options = {}) {
  const attempts = marketSearchProviders(market);
  const providerFailures = [];

  if (!attempts.length) {
    throw new Error(`${market.countryCode} market has no configured providers`);
  }

  for (const provider of attempts) {
    try {
      const results = preferMarketRetailers(
        await searchProviderProducts(provider, searchQuery, colorSeason, market, options),
        market,
      );
      const prioritizedResults = applyBudgetPreference(results, options.budgetRange);
      if (prioritizedResults.length) return prioritizedResults;
      providerFailures.push(`${provider}: no products`);
      console.warn(`[affiliate] ${market.countryCode} ${provider} returned no products`);
    } catch (error) {
      providerFailures.push(`${provider}: ${error.message}`);
      console.warn(`[affiliate] ${market.countryCode} ${provider} lookup failed: ${error.message}`);
    }
  }

  const error = new Error(`Affiliate providers unavailable for ${market.countryCode}`);
  error.details = providerFailures;
  throw error;
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
    "itemSummaries",
  );

  return products
    .slice(0, MAX_RESULTS)
    .map((item) => normalizeProduct(item, context))
    .filter(Boolean);
}

function normalizeXmlProducts(xml, context) {
  const productBlocks = [...xml.matchAll(/<(product|item)\b[^>]*>[\s\S]*?<\/\1>/gi)].map((match) => match[0]);
  return productBlocks.slice(0, MAX_RESULTS).map((block) => normalizeXmlProduct(block, context)).filter(Boolean);
}

function normalizeXmlProduct(block, context) {
  const item = {
    productName: firstXmlTag(block, ["name", "title", "product-name", "productname"]),
    brand: firstXmlTag(block, ["brand", "advertiser-name", "manufacturer-name", "merchant-name", "merchantname"]),
    price: firstXmlTag(block, ["saleprice", "sale-price", "price", "retail-price"]),
    currency: firstXmlTagAttribute(block, ["saleprice", "sale-price", "price", "retail-price"], "currency") || firstXmlTag(block, ["currency"]),
    imageUrl: firstXmlTag(block, ["image-url", "image-link", "imageurl", "thumbnail-url"]),
    buyLink: firstXmlTag(block, ["buy-url", "click-url", "linkurl", "link", "destination-url"]),
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
  const { market, searchQuery, colorSeason, budgetRange, requireProductPages } = context;
  const source = context?.source || "unknown";
  const productName = firstValue(item, [
    "productName",
    "product_name",
    "name",
    "title",
    "productTitle",
    "product_title",
    "productname",
    "itemSummaries.title",
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
      "merchantname",
      "store",
      "store_name",
      "seller.username",
    ]) || "Retail partner";
  const priceInfo = buildPriceInfo(item, market);
  const imageUrl = firstValue(item, [
    "imageUrl",
    "image_url",
    "imageLink",
    "image_link",
    "image",
    "thumbnailUrl",
    "thumbnail_url",
    "imageurl",
    "awin_image_url",
    "awin_thumb_url",
    "merchant_image_url",
    "image.imageUrl",
    "thumbnailImages.0.imageUrl",
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
    "linkurl",
    "productUrl",
    "product_url",
    "aw_deep_link",
    "awin_url",
    "deeplink",
    "deep_link",
    "merchant_deep_link",
    "destination_url",
    "itemAffiliateWebUrl",
    "itemWebUrl",
    "url",
  ]);

  if (!productName || !rawBuyLink) return null;
  if (requireProductPages && !looksLikeSpecificProductPage(rawBuyLink)) return null;

  return {
    productName: String(productName),
    brand: String(brand),
    price: priceInfo.display,
    priceAmount: priceInfo.amount,
    imageUrl: String(imageUrl || ""),
    budgetRange: budgetRange?.label || "",
    buyLink: appendAffiliateTracking(String(rawBuyLink), {
      searchQuery,
      colorSeason,
      market,
      source,
    }),
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

function applyBudgetPreference(products, budgetRange) {
  if (!budgetRange?.min || !budgetRange?.max) return products;

  return [...products].sort((left, right) => {
    const leftScore = priceScore(left.priceAmount, budgetRange);
    const rightScore = priceScore(right.priceAmount, budgetRange);
    if (leftScore !== rightScore) return leftScore - rightScore;
    return slug(`${left.brand} ${left.productName}`).localeCompare(slug(`${right.brand} ${right.productName}`));
  });
}

function priceScore(priceAmount, budgetRange) {
  if (!Number.isFinite(priceAmount)) return Number.MAX_SAFE_INTEGER;
  if (priceAmount >= budgetRange.min && priceAmount <= budgetRange.max) {
    return Math.abs(priceAmount - (budgetRange.min + budgetRange.max) / 2);
  }
  if (priceAmount < budgetRange.min) return 1000000 + (budgetRange.min - priceAmount);
  return 1000000 + (priceAmount - budgetRange.max);
}

function firstXmlTag(block, tagNames) {
  for (const tagName of tagNames) {
    const match = block.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
    if (match?.[1]) return decodeXml(match[1].trim());
  }
  return "";
}

function firstXmlTagAttribute(block, tagNames, attributeName) {
  for (const tagName of tagNames) {
    const match = block.match(new RegExp(`<${tagName}\\b[^>]*\\s${attributeName}=["']([^"']+)["'][^>]*>`, "i"));
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

function buildPriceInfo(item, market) {
  const currency = normalizeCurrency(
    firstValue(item, [
      "currency",
      "price.currency",
      "salePrice.currency",
      "sale_price.currency",
      "retailPrice.currency",
      "retail_price.currency",
      "saleprice.currency",
      "currency_code",
      "priceCurrency",
      "price.currencyId",
    ]),
    market.currency,
  );
  const saleAmount = firstNumberValue(item, ["salePrice.amount", "sale_price.amount", "salePrice", "sale_price", "saleprice"]);
  const regularAmount = firstNumberValue(item, ["price.amount", "price.value", "price", "retailPrice.amount", "retail_price.amount"]);
  const fallbackRegularAmount = firstNumberValue(item, ["retailPrice", "retail_price"]);
  const actualAmount =
    Number.isFinite(saleAmount) && saleAmount > 0
      ? saleAmount
      : Number.isFinite(regularAmount) && regularAmount > 0
        ? regularAmount
        : Number.isFinite(fallbackRegularAmount) && fallbackRegularAmount > 0
          ? fallbackRegularAmount
        : undefined;

  if (Number.isFinite(saleAmount) && Number.isFinite(regularAmount) && saleAmount > 0 && regularAmount > 0) {
    const low = Math.min(saleAmount, regularAmount);
    const high = Math.max(saleAmount, regularAmount);
    if (Math.abs(high - low) >= 0.01) {
      return {
        amount: low,
        currency,
        display: `${formatCurrencyAmount(low, currency)} - ${formatCurrencyAmount(high, currency)}`,
      };
    }
  }

  if (Number.isFinite(actualAmount) && actualAmount > 0) {
    return {
      amount: actualAmount,
      currency,
      display: formatCurrencyAmount(actualAmount, currency),
    };
  }

  return {
    amount: undefined,
    currency,
    display: formatPrice(
      firstValue(item, ["price", "salePrice", "sale_price", "retailPrice", "retail_price", "price.amount"]),
      currency,
      market,
    ),
  };
}

function firstNumberValue(item, keys) {
  for (const key of keys) {
    const value = key.split(".").reduce((current, part) => current?.[part], item);
    const amount = parsePriceAmount(value);
    if (Number.isFinite(amount)) return amount;
  }
  return undefined;
}

function parsePriceAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value || "").trim();
  if (!text) return undefined;
  const normalized = text.replace(/,/g, "");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const amount = Number(match[0]);
  return Number.isFinite(amount) ? amount : undefined;
}

function legacyFormatPrice(price, currency, market) {
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

function legacyNormalizeCurrency(value, fallback = "USD") {
  const currency = String(value || "").trim().toUpperCase();
  if (currency === "HK$") return "HKD";
  if (currency === "US$") return "USD";
  return /^[A-Z]{3}$/.test(currency) ? currency : fallback;
}

function legacyCurrencyFromText(text) {
  if (/HK\$|\bHKD\b/i.test(text)) return "HKD";
  if (/US\$|\bUSD\b/i.test(text)) return "USD";
  if (/\bGBP\b|£/i.test(text)) return "GBP";
  if (/\bEUR\b|€/i.test(text)) return "EUR";
  if (/\bCAD\b/i.test(text)) return "CAD";
  if (/\bAUD\b/i.test(text)) return "AUD";
  if (/\bSGD\b/i.test(text)) return "SGD";
  return "";
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
    .replace(/[\$\u20ac\u00a3]/gi, "")
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
  if (/\bGBP\b|\u00a3/i.test(text)) return "GBP";
  if (/\bEUR\b|\u20ac/i.test(text)) return "EUR";
  if (/\bCAD\b/i.test(text)) return "CAD";
  if (/\bAUD\b/i.test(text)) return "AUD";
  if (/\bSGD\b/i.test(text)) return "SGD";
  return "";
}

function appendAffiliateTracking(rawUrl, { searchQuery, colorSeason, market, source }) {
  try {
    const url = new URL(rawUrl);
    if (source === "involve-asia" && !url.searchParams.has(INVOLVE_ASIA_TRACKING_PARAM)) {
      url.searchParams.set(
        INVOLVE_ASIA_TRACKING_PARAM,
        `${INVOLVE_ASIA_TRACKING_VALUE}-${trackingId(searchQuery, colorSeason, market)}`,
      );
      return url.toString();
    }

    if (!url.searchParams.has("sid")) {
      url.searchParams.set("sid", trackingId(searchQuery, colorSeason, market));
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function looksLikeSpecificProductPage(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const params = url.searchParams;
    if (host.includes("google.") && params.get("tbm") === "shop") return false;
    if (["q", "query", "keyword", "search", "term"].some((key) => params.has(key))) return false;
    if (/\/(search|sr|catalog)\b/.test(path)) return false;
    return true;
  } catch {
    return true;
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

function buildRetailerSearchFallback(searchQuery, colorSeason, market, budgetRange) {
  const query = [searchQuery, colorSeason].filter(Boolean).join(" ");
  return market.fallbackRetailers.slice(0, maxResultsForMarket(market)).map((retailer) => {
    const buyLink = `${retailer.url}${encodeURIComponent(query)}`;
    const nearby = nearbyStoreForRetailer(retailer.brand, market);
    return {
      productName: `${query} search results`,
      brand: retailer.brand,
      price: `${market.currency} price on site`,
      imageUrl: "",
      budgetRange: budgetRange?.label || "",
      buyLink: appendAffiliateTracking(buyLink, { searchQuery, colorSeason, market }),
      isFallback: true,
      actionLabel: "Search",
      source: "generic-search",
      nearbyStoreUrl: nearby.url,
      nearbyStoreMode: nearby.mode,
      nearbyStoreLabel: nearby.label,
    };
  });
}

function buildSearchFallbackProducts(searchQuery, colorSeason, market, budgetRange, fallbackMarket) {
  const primary = buildRetailerSearchFallback(searchQuery, colorSeason, market, budgetRange);
  const maxResults = maxResultsForMarket(market);
  if (!fallbackMarket || fallbackMarket.countryCode === market.countryCode || primary.length >= maxResults) {
    return primary.slice(0, maxResults);
  }

  const secondary = buildRetailerSearchFallback(searchQuery, colorSeason, fallbackMarket, budgetRange).filter(
    (product) => !primary.some((existing) => existing.brand === product.brand && existing.buyLink === product.buyLink),
  );
  return [...primary, ...secondary].slice(0, maxResults);
}

function maxResultsForMarket(market) {
  return Math.max(1, Math.min(12, market?.countryCode === "HK" ? HK_MAX_RESULTS : MAX_RESULTS));
}

function nearbyStoreForRetailer(brand, market) {
  if (market?.countryCode !== "HK") return { url: "", mode: "online", label: "" };
  const entry = HK_STORE_LOCATORS.find((locator) => locator.match.test(String(brand || "")));
  if (!entry) return { url: "", mode: "map", label: "" };
  return {
    url: entry.url,
    mode: entry.mode,
    label:
      entry.mode === "online"
        ? "Online only"
        : entry.mode === "locator"
          ? "Store locator"
          : "Nearby stores",
  };
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cleanProducts(products) {
  return products.slice(0, 12).map((product) => ({
    productName: product.productName,
    brand: product.brand,
    price: product.price,
    imageUrl: product.imageUrl,
    budgetRange: product.budgetRange,
    buyLink: product.buyLink,
    isFallback: Boolean(product.isFallback),
    actionLabel: product.actionLabel,
    source: product.source,
    nearbyStoreUrl: product.nearbyStoreUrl || "",
    nearbyStoreMode: product.nearbyStoreMode || "",
    nearbyStoreLabel: product.nearbyStoreLabel || "",
  }));
}

function affiliateResponse(products, budgetRange, market) {
  return {
    products: cleanProducts(products),
    budget: {
      selection: budgetRange.selection,
      label: BUDGET_LABELS[budgetRange.selection] || BUDGET_LABELS["mid premium"],
      rangeLabel: budgetRange.label,
      currency: budgetRange.currency,
      min: budgetRange.min,
      max: budgetRange.max,
      countryCode: market.countryCode,
    },
  };
}

function affiliateLookupFailed(message, metadata = {}) {
  const error = new Error(message);
  error.status = 502;
  Object.assign(error, metadata);
  return error;
}

function affiliateErrorDetails(label, error) {
  return [
    `${label}: ${error.message}`,
    ...(Array.isArray(error.details) ? error.details.map((detail) => `${label}/${detail}`) : []),
  ];
}

function maybeAttachDiagnostics(response, details, requestMeta = {}) {
  if (!requestMeta.includeDiagnostics) return response;
  return {
    ...response,
    details: [...new Set(details)].slice(0, 40),
  };
}

export async function processRequest(body, requestMeta = {}) {
  const { searchQuery, colorSeason, budget, requestedCountryCode, allowSearchFallback, requireProductPages } =
    validatePayload(body);
  const countryCode = requestedCountryCode || detectCountryCode(requestMeta);
  const market = marketForCountry(countryCode);
  const budgetRange = budgetRangeForSelection(budget, market);
  const errors = [];

  try {
    return affiliateResponse(
      await searchMarketProducts(searchQuery, colorSeason, market, { budgetRange, requireProductPages }),
      budgetRange,
      market,
    );
  } catch (marketError) {
    errors.push(...affiliateErrorDetails(market.countryCode, marketError));
    console.warn(
      `[affiliate] ${market.countryCode} lookup failed; trying global US fallback: ${marketError.message}${
        marketError.details?.length ? ` | ${marketError.details.join(" | ")}` : ""
      }`,
    );
  }

  const fallbackMarket = globalMarket();
  try {
    return affiliateResponse(
      await searchMarketProducts(searchQuery, colorSeason, fallbackMarket, { budgetRange, requireProductPages }),
      budgetRange,
      market,
    );
  } catch (globalError) {
    errors.push(...affiliateErrorDetails("GLOBAL", globalError));
    if (ALLOW_GENERIC_SEARCH_FALLBACK && allowSearchFallback) {
      console.warn(`[affiliate] Global affiliate lookup failed; returning search fallback: ${globalError.message}`);
      return maybeAttachDiagnostics(
        affiliateResponse(
          buildSearchFallbackProducts(searchQuery, colorSeason, market, budgetRange, fallbackMarket),
          budgetRange,
          market,
        ),
        errors,
        requestMeta,
      );
    }

    console.warn(
      `[affiliate] Global fallback failed: ${globalError.message}${
        globalError.details?.length ? ` | ${globalError.details.join(" | ")}` : ""
      }`,
    );
    throw affiliateLookupFailed("Live affiliate products are temporarily unavailable for this region.", {
      budget: {
        selection: budgetRange.selection,
        label: BUDGET_LABELS[budgetRange.selection] || BUDGET_LABELS["mid premium"],
        rangeLabel: budgetRange.label,
        currency: budgetRange.currency,
        min: budgetRange.min,
        max: budgetRange.max,
        countryCode: market.countryCode,
      },
      details: errors,
    });
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
      ...(error.budget ? { budget: error.budget } : {}),
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
      ...(error.budget ? { budget: error.budget } : {}),
    });
  }
}

export default vercelHandler;
