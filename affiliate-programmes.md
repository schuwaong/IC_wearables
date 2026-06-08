# IC_wearables Affiliate Programme Library

Use this as the working signup and integration map for expanding the clothing
library. The backend can now search:

- `cj`: CJ Product Search GraphQL.
- `involve-asia`: configurable Involve Asia product endpoint.
- `rakuten`: Rakuten Advertising Product Search.
- `ebay`: eBay Browse API with eBay Partner Network affiliate context.
- `feed`: CSV, TSV, JSON, or XML product feeds from Awin, Impact, Rakuten,
  Skimlinks/Sovrn, direct merchants, or curated internal feeds.

Set `AFFILIATE_PROVIDER_ORDER` to control priority. For example:

```text
AFFILIATE_PROVIDER_ORDER=feed,involve-asia,cj,rakuten,ebay
```

## Country Table

| Country / Market | Currency | Programmes to join first | Backend hook | Library notes |
|---|---:|---|---|---|
| United States | USD | CJ, Rakuten Advertising, Impact, Awin, eBay Partner Network, Amazon Associates, Skimlinks/Sovrn, ShopMy, LTK, Shopify Collabs | `cj`, `rakuten`, `ebay`, `feed` | Best market for breadth. Use CJ/Rakuten/eBay live search plus Awin/Impact/Skimlinks feeds. |
| Canada | CAD | CJ, Rakuten Advertising, Impact, Awin, eBay Partner Network, Amazon Associates CA, Skimlinks/Sovrn | `cj`, `rakuten`, `ebay`, `feed` | Strong fashion coverage; feed URLs fill gaps where APIs are limited. |
| United Kingdom | GBP | Awin, CJ, Rakuten Advertising, Impact, eBay Partner Network, Amazon Associates UK, Skimlinks/Sovrn, LTK | `cj`, `rakuten`, `ebay`, `feed` | Awin is especially useful for UK fashion retailers. |
| Hong Kong | HKD | Involve Asia, CJ, Rakuten Advertising, Awin, eBay Partner Network, AliExpress Portals, Skimlinks/Sovrn, direct retailer programmes | `involve-asia`, `cj`, `rakuten`, `ebay`, `feed` | Put Involve Asia and curated feeds first; they usually match regional fashion better. |
| Singapore | SGD | Involve Asia, Awin, CJ, Rakuten Advertising, Impact, Amazon SG, Shopee Affiliate, Lazada Affiliate, Skimlinks/Sovrn | `involve-asia`, `cj`, `rakuten`, `feed` | eBay affiliate URLs are not a reliable first choice here; use SEA feeds. |
| Malaysia | MYR | Involve Asia, ACCESSTRADE, Shopee Affiliate, Lazada Affiliate, AliExpress Portals, CJ/Rakuten global, Skimlinks/Sovrn | `involve-asia`, `cj`, `rakuten`, `feed` | SEA marketplace feeds will give the biggest local clothing library. |
| Indonesia | IDR | Involve Asia, ACCESSTRADE, Shopee Affiliate, Lazada Affiliate, Tokopedia affiliate/direct, AliExpress Portals | `involve-asia`, `feed` | Prioritise local marketplace/direct feeds over global networks. |
| Philippines | PHP | Involve Asia, ACCESSTRADE, Shopee Affiliate, Lazada Affiliate, Zalora/direct programmes, AliExpress Portals | `involve-asia`, `feed` | Good fit for Involve Asia plus direct fashion feeds. |
| Thailand | THB | Involve Asia, ACCESSTRADE, Shopee Affiliate, Lazada Affiliate, AliExpress Portals, direct fashion retailers | `involve-asia`, `feed` | Use local-language/category feeds when available. |
| Taiwan | TWD | Involve Asia, ACCESSTRADE, CJ/Rakuten global, Shopee Affiliate, Rakuten Taiwan/direct feeds | `involve-asia`, `cj`, `rakuten`, `feed` | Product feeds are usually easier than broad API search. |
| Japan | JPY | Rakuten Advertising, ACCESSTRADE Japan, Amazon Associates JP, A8.net, ValueCommerce, eBay Partner Network | `rakuten`, `ebay`, `feed` | Japan-specific networks need feed exports or future adapters. |
| South Korea | KRW | Coupang Partners, CJ/Rakuten global, Impact/global, AliExpress Portals, local direct programmes | `cj`, `rakuten`, `feed` | Build curated feeds for local fashion because global product search can be thin. |
| India | INR | Amazon Associates IN, Cuelinks, Admitad, Impact/global, CJ/Rakuten global, Flipkart/direct programmes | `cj`, `rakuten`, `feed` | Feed ingestion is the quickest way to add local fashion marketplaces. |
| Australia | AUD | Awin, CJ, Rakuten Advertising, Impact, eBay Partner Network, Amazon Associates AU, Skimlinks/Sovrn | `cj`, `rakuten`, `ebay`, `feed` | Similar stack to UK/US; Awin and eBay are useful for breadth. |
| New Zealand | NZD | Awin/AU retailers, CJ, Rakuten Advertising, Impact, Amazon AU, direct fashion retailers, Skimlinks/Sovrn | `cj`, `rakuten`, `feed` | Use AU/NZ feeds where retailer shipping supports NZ. |
| Germany | EUR | Awin, CJ, Rakuten Advertising, Impact, eBay Partner Network, Amazon Associates DE, Skimlinks/Sovrn | `cj`, `rakuten`, `ebay`, `feed` | Strong Awin/eBay market. |
| France | EUR | Awin, CJ, Rakuten Advertising, Impact, eBay Partner Network, Amazon Associates FR, Skimlinks/Sovrn | `cj`, `rakuten`, `ebay`, `feed` | Use local-language feeds for better matching. |
| Spain | EUR | Awin, CJ, Rakuten Advertising, Impact, eBay Partner Network, Amazon Associates ES, Skimlinks/Sovrn | `cj`, `rakuten`, `ebay`, `feed` | Pair global APIs with local retailer feeds. |
| Italy | EUR | Awin, CJ, Rakuten Advertising, Impact, eBay Partner Network, Amazon Associates IT, Skimlinks/Sovrn | `cj`, `rakuten`, `ebay`, `feed` | Good with EU-wide Awin/Rakuten advertiser feeds. |
| Netherlands | EUR | Awin, CJ, Rakuten Advertising, Impact, Amazon EU retailers, direct Dutch fashion retailers, Skimlinks/Sovrn | `cj`, `rakuten`, `ebay`, `feed` | Direct merchant feeds help more than generic search here. |
| Sweden | SEK | Awin, CJ, Rakuten Advertising, Impact, Amazon SE, direct Nordic retailers, Skimlinks/Sovrn | `cj`, `rakuten`, `feed` | Add Nordic direct feeds to improve regional inventory. |
| Switzerland | CHF | Awin EU, CJ, Rakuten Advertising, Impact, Amazon DE/FR/IT where eligible, direct Swiss retailers | `cj`, `rakuten`, `feed` | Use feeds that confirm Switzerland shipping. |
| United Arab Emirates | AED | Amazon Associates AE, Noon affiliate/direct, Admitad, CJ/Rakuten/Impact global, AliExpress Portals | `cj`, `rakuten`, `feed` | Curated marketplace feeds are the fastest path. |
| Saudi Arabia | SAR | Amazon Associates SA, Noon affiliate/direct, Admitad, CJ/Rakuten/Impact global, AliExpress Portals | `cj`, `rakuten`, `feed` | Prioritise marketplace feeds with SAR pricing. |
| Mexico | MXN | Awin, CJ, Rakuten Advertising, Impact, Amazon Associates MX, Admitad, AliExpress Portals | `cj`, `rakuten`, `feed` | Use local pricing feeds where possible. |
| Brazil | BRL | Awin, CJ, Rakuten Advertising, Amazon Associates BR, Lomadee/direct, Admitad, AliExpress Portals | `cj`, `rakuten`, `feed` | Feed ingestion is likely more reliable than global search. |
| China / cross-border | CNY | AliExpress Portals, Admitad, CJ/Rakuten global, direct cross-border retailer programmes | `cj`, `rakuten`, `feed` | Treat as cross-border unless you add local China marketplace adapters. |

## Fastest Expansion Order

1. Fix CJ authorization, because the current credentials are returning `403`.
2. Add Involve Asia for HK/SG/MY/ID/PH/TH/TW via `INVOLVE_ASIA_*`.
3. Add two or three curated feed URLs from Awin/Impact/Skimlinks/Sovrn via
   `AFFILIATE_PRODUCT_FEED_URLS`.
4. Add Rakuten Product Search if the account has API access.
5. Add eBay Partner Network for markets with a supported marketplace ID.

## HK Fashion Feed Slots

Use the market-specific feed variables when you want Hong Kong clothing and
fashion merchants to be searched before the global library:

```text
HK_AFFILIATE_PROVIDER_ORDER=feed,involve-asia,cj,rakuten,ebay
HK_AFFILIATE_PRODUCT_FEED_URLS=hk-fashion|https://example.com/hk-fashion.csv
HK_DIRECT_PRODUCT_FEED_URLS=hk-direct|https://example.com/hk-direct-feed.csv
HK_AWIN_PRODUCT_FEED_URLS=hk-awin|https://example.com/hk-awin-feed.csv
HK_IMPACT_PRODUCT_FEED_URLS=hk-impact|https://example.com/hk-impact-feed.json
HK_SKIMLINKS_PRODUCT_FEED_URLS=hk-skimlinks|https://example.com/hk-skimlinks-feed.csv
HK_SOVRN_PRODUCT_FEED_URLS=hk-sovrn|https://example.com/hk-sovrn-feed.csv
```

Good HK fashion candidates to route through those feeds include merchants such
as Zalora HK, Lane Crawford, ITeSHOP, FARFETCH HK, NET-A-PORTER HK, and other
retailers available through Awin, Impact, Skimlinks, Sovrn, or direct merchant
programmes.

## Feed URL Format

Use semicolon or newline separated URLs. Prefix a source label with `label|url`
when useful:

```text
AFFILIATE_PRODUCT_FEED_URLS=awin-zalora|https://example.com/awin-zalora.csv;impact-fashion|https://example.com/impact-fashion.json
```

Supported feed formats: CSV, TSV, JSON, XML. Common Google Merchant Center,
Awin, Rakuten, Impact, and Skimlinks/Sovrn column names are normalized by the
backend.
