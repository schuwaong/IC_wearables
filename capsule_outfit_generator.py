from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import mimetypes
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

try:
    import requests
except ImportError:  # pragma: no cover - handled at runtime with a clear message
    requests = None  # type: ignore[assignment]

try:
    from bs4 import BeautifulSoup
except ImportError:  # pragma: no cover - handled at runtime with a clear message
    BeautifulSoup = None  # type: ignore[assignment]

try:
    import pandas as pd
except ImportError:  # pragma: no cover - CSV fallback is available
    pd = None  # type: ignore[assignment]


REQUEST_TIMEOUT_SECONDS = 18
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (compatible; ICWearablesCapsuleBot/1.0; "
    "+https://schuwaong.github.io/IC_wearables/)"
)


SEASON_COLOR_KEYWORDS: dict[str, list[str]] = {
    "Light Spring": ["ivory", "cream", "honey", "peach", "coral", "camel", "aqua", "turquoise"],
    "True Spring": ["gold", "warm cream", "coral", "grass green", "turquoise", "tan", "apricot"],
    "Bright Spring": ["bright coral", "hot pink", "clear blue", "teal", "lime", "black", "white"],
    "Light Summer": ["powder blue", "mist", "blush", "rose", "lavender", "soft white", "washed denim"],
    "True Summer": ["slate", "blue grey", "cool rose", "soft navy", "silver", "mauve", "berry"],
    "Soft Summer": ["sage", "dusty rose", "taupe", "pewter", "soft denim", "mushroom", "muted blue"],
    "Soft Autumn": ["camel", "olive", "moss", "teal", "warm taupe", "terracotta", "brushed gold"],
    "True Autumn": ["brown", "tobacco", "olive", "forest green", "burnt orange", "rust", "gold", "camel"],
    "Dark Autumn": ["espresso", "dark olive", "deep teal", "oxblood", "mahogany", "bronze", "chocolate"],
    "Dark Winter": ["black", "optic white", "burgundy", "petrol blue", "charcoal", "pine", "plum"],
    "True Winter": ["black", "white", "cobalt", "crimson", "emerald", "silver", "fuchsia"],
    "Bright Winter": ["electric blue", "fuchsia", "icy blue", "black", "white", "clear red", "neon"],
}


PIECE_KEYWORDS: dict[str, list[str]] = {
    "top_outerwear": [
        "blazer",
        "jacket",
        "coat",
        "shirt",
        "blouse",
        "top",
        "tee",
        "t-shirt",
        "knit",
        "sweater",
        "cardigan",
        "vest",
    ],
    "bottom": [
        "trouser",
        "trousers",
        "pant",
        "pants",
        "jeans",
        "denim",
        "skirt",
        "shorts",
        "chino",
        "culotte",
    ],
    "shoes": [
        "shoe",
        "shoes",
        "sneaker",
        "sneakers",
        "loafer",
        "loafers",
        "boot",
        "boots",
        "heel",
        "heels",
        "pump",
        "pumps",
        "sandal",
        "sandals",
        "trainer",
        "trainers",
    ],
    "accessory": [
        "bag",
        "watch",
        "belt",
        "scarf",
        "necklace",
        "earrings",
        "bracelet",
        "wallet",
        "sunglasses",
        "cap",
        "hat",
        "pocket square",
        "tie",
    ],
}


ROLE_LABELS = {
    "top_outerwear": "Top / Outerwear",
    "bottom": "Bottom",
    "shoes": "Shoes",
    "accessory": "Accessory",
}


COLUMN_ALIASES = {
    "title": ["product name", "product_name", "productname", "name", "title", "product title"],
    "brand": ["brand", "merchant", "advertiser", "manufacturer", "designer"],
    "price": ["price", "sale price", "sale_price", "current price", "retail price", "amount"],
    "raw_url": ["url", "product url", "product_url", "link", "deeplink", "destination url", "buy url"],
    "image_url": ["image url", "image_url", "image", "image link", "thumbnail", "picture url"],
    "description": ["description", "desc", "product description", "short description", "details"],
    "category": ["category", "product category", "taxonomy", "department", "product type"],
    "color": ["color", "colour", "color name", "colour name", "product color", "product colour"],
}


@dataclass
class Product:
    title: str
    brand: str
    price: str
    raw_url: str
    image_url: str = ""
    local_image_path: str = ""
    description: str = ""
    category: str = ""
    color: str = ""
    affiliate_link: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def searchable_text(self) -> str:
        return " ".join(
            [
                self.title,
                self.brand,
                self.description,
                self.category,
                self.color,
                " ".join(str(value) for value in self.metadata.values()),
            ]
        ).lower()


def require_dependency(module: Any, package_name: str) -> None:
    if module is None:
        raise RuntimeError(
            f"Missing dependency: {package_name}. Install it with `python -m pip install {package_name}`."
        )


def slugify(value: str, fallback: str = "product") -> str:
    clean = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return clean[:90] or fallback


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_column(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def parse_price(value: Any) -> str:
    text = clean_text(value)
    if not text:
        return ""
    match = re.search(r"([A-Z]{2,3}\$?|HK\$|US\$|\$|GBP|EUR|USD|HKD)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)", text)
    if not match:
        return text
    prefix = clean_text(match.group(1))
    amount = match.group(2).replace(",", "")
    return f"{prefix} {amount}".strip()


def make_session() -> Any:
    require_dependency(requests, "requests")
    session = requests.Session()
    session.headers.update({"User-Agent": DEFAULT_USER_AGENT})
    return session


def infer_image_extension(url: str, content_type: str = "") -> str:
    parsed_path = urlparse(url).path
    extension = Path(parsed_path).suffix.lower()
    if extension in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        return ".jpg" if extension == ".jpeg" else extension
    guessed = mimetypes.guess_extension(content_type.split(";")[0].strip()) if content_type else ""
    if guessed in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        return ".jpg" if guessed == ".jpeg" else guessed
    return ".jpg"


def download_image(
    image_url: str,
    product_title: str,
    images_dir: str | Path = "images",
    session: Any | None = None,
) -> str:
    if not image_url:
        return ""

    own_session = session is None
    session = session or make_session()
    images_path = Path(images_dir)
    images_path.mkdir(parents=True, exist_ok=True)

    try:
        response = session.get(image_url, timeout=REQUEST_TIMEOUT_SECONDS, stream=True)
        response.raise_for_status()
        content_type = response.headers.get("Content-Type", "")
        extension = infer_image_extension(image_url, content_type)
        digest = hashlib.sha1(image_url.encode("utf-8")).hexdigest()[:8]
        filename = f"{slugify(product_title)}-{digest}{extension}"
        target_path = images_path / filename

        with target_path.open("wb") as file_handle:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    file_handle.write(chunk)
        return str(target_path)
    except Exception as exc:
        print(f"[warn] Could not download image for {product_title!r}: {exc}")
        return ""
    finally:
        if own_session:
            session.close()


def absolute_url(base_url: str, maybe_url: str) -> str:
    if not maybe_url:
        return ""
    return urljoin(base_url, maybe_url)


def first_available(mapping: dict[str, Any], aliases: list[str]) -> Any:
    normalized = {normalize_column(key): value for key, value in mapping.items()}
    for alias in aliases:
        value = normalized.get(normalize_column(alias))
        if value not in (None, ""):
            return value
    return ""


def image_from_tag(card: Any, base_url: str) -> str:
    image = card.select_one("img")
    if not image:
        return ""
    for attr in ("src", "data-src", "data-original", "data-lazy-src"):
        value = image.get(attr)
        if value:
            return absolute_url(base_url, value)
    srcset = image.get("srcset") or image.get("data-srcset")
    if srcset:
        first_src = srcset.split(",")[0].strip().split(" ")[0]
        return absolute_url(base_url, first_src)
    return ""


def node_text(node: Any) -> str:
    if not node:
        return ""
    return clean_text(node.get_text(" ", strip=True))


def parse_json_ld_products(soup: Any, page_url: str) -> list[Product]:
    products: list[Product] = []

    def visit(node: Any) -> None:
        if isinstance(node, list):
            for item in node:
                visit(item)
            return
        if not isinstance(node, dict):
            return
        node_type = node.get("@type")
        if isinstance(node_type, list):
            is_product = any(str(item).lower() == "product" for item in node_type)
        else:
            is_product = str(node_type).lower() == "product"
        if is_product:
            offers = node.get("offers") or {}
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            brand = node.get("brand") or ""
            if isinstance(brand, dict):
                brand = brand.get("name", "")
            image = node.get("image") or ""
            if isinstance(image, list):
                image = image[0] if image else ""
            title = clean_text(node.get("name"))
            if title:
                products.append(
                    Product(
                        title=title,
                        brand=clean_text(brand),
                        price=parse_price(offers.get("price") or offers.get("lowPrice") or ""),
                        raw_url=absolute_url(page_url, offers.get("url") or node.get("url") or page_url),
                        image_url=absolute_url(page_url, image),
                        description=clean_text(node.get("description")),
                        category=clean_text(node.get("category")),
                        color=clean_text(node.get("color")),
                    )
                )
        for child in node.values():
            if isinstance(child, (list, dict)):
                visit(child)

    for script in soup.select('script[type="application/ld+json"]'):
        try:
            payload = json.loads(script.string or script.get_text(strip=True) or "{}")
        except json.JSONDecodeError:
            continue
        visit(payload)

    return products


def scrape_product_data(target_url: str, images_dir: str | Path = "images") -> list[Product]:
    """Scrape generic product data from a product or category page.

    Prefer affiliate feeds for production. Generic scraping depends on the site
    markup and must respect the retailer's terms, robots.txt, and rate limits.
    """

    require_dependency(requests, "requests")
    require_dependency(BeautifulSoup, "beautifulsoup4")
    session = make_session()

    try:
        response = session.get(target_url, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        products = parse_json_ld_products(soup, target_url)
        if not products:
            card_selectors = [
                "[itemtype*='Product']",
                "[data-product-id]",
                ".product-card",
                ".product",
                "li[class*='product']",
                "div[class*='product']",
            ]
            cards = []
            for selector in card_selectors:
                cards.extend(soup.select(selector))

            seen_cards: set[int] = set()
            for card in cards:
                if id(card) in seen_cards:
                    continue
                seen_cards.add(id(card))

                title_node = card.select_one("[itemprop='name'], .product-title, .title, h2, h3, a[title]")
                title = clean_text(title_node.get("title") if title_node and title_node.get("title") else node_text(title_node))
                if not title or len(title) < 3:
                    continue

                brand_node = card.select_one("[itemprop='brand'], .brand, [class*='brand']")
                price_node = card.select_one("[itemprop='price'], .price, [class*='price']")
                link_node = card.select_one("a[href]")
                raw_url = absolute_url(target_url, link_node.get("href") if link_node else target_url)

                products.append(
                    Product(
                        title=title,
                        brand=node_text(brand_node),
                        price=parse_price(price_node.get("content") if price_node and price_node.get("content") else node_text(price_node)),
                        raw_url=raw_url,
                        image_url=image_from_tag(card, target_url),
                        description=clean_text(card.get_text(" ", strip=True))[:800],
                        category=clean_text(card.get("data-category", "")),
                    )
                )

        deduped: list[Product] = []
        seen_keys: set[str] = set()
        for product in products:
            key = product.raw_url or product.title.lower()
            if key in seen_keys:
                continue
            seen_keys.add(key)
            product.local_image_path = download_image(product.image_url, product.title, images_dir, session)
            deduped.append(product)
        return deduped
    finally:
        session.close()


def read_feed_rows(csv_file_path: str | Path) -> list[dict[str, Any]]:
    if pd is not None:
        dataframe = pd.read_csv(csv_file_path)
        return dataframe.fillna("").to_dict(orient="records")

    with Path(csv_file_path).open("r", encoding="utf-8-sig", newline="") as file_handle:
        return list(csv.DictReader(file_handle))


def parse_affiliate_feed(csv_file_path: str | Path, images_dir: str | Path = "images") -> list[Product]:
    """Parse a standard affiliate CSV feed into normalized Product records."""

    session = make_session()
    try:
        products: list[Product] = []
        for row in read_feed_rows(csv_file_path):
            title = clean_text(first_available(row, COLUMN_ALIASES["title"]))
            raw_url = clean_text(first_available(row, COLUMN_ALIASES["raw_url"]))
            if not title or not raw_url:
                continue

            product = Product(
                title=title,
                brand=clean_text(first_available(row, COLUMN_ALIASES["brand"])),
                price=parse_price(first_available(row, COLUMN_ALIASES["price"])),
                raw_url=raw_url,
                image_url=clean_text(first_available(row, COLUMN_ALIASES["image_url"])),
                description=clean_text(first_available(row, COLUMN_ALIASES["description"])),
                category=clean_text(first_available(row, COLUMN_ALIASES["category"])),
                color=clean_text(first_available(row, COLUMN_ALIASES["color"])),
                metadata={key: value for key, value in row.items() if value not in (None, "")},
            )
            product.local_image_path = download_image(product.image_url, product.title, images_dir, session)
            products.append(product)
        return products
    finally:
        session.close()


def append_query_params(url: str, params: dict[str, str]) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.update({key: value for key, value in params.items() if value})
    return urlunparse(parsed._replace(query=urlencode(query, doseq=True)))


def generate_affiliate_link(
    base_url: str,
    affiliate_id: str,
    network: str = "involve_asia",
    merchant_id: str | None = None,
    sid: str | None = None,
) -> str:
    """Create a trackable affiliate link for a raw product URL.

    Involve Asia and CJ deep-link formats can vary by advertiser/account. This
    function uses safe default formats and keeps merchant/sub-id arguments
    explicit so you can adjust them to your approved network settings.
    """

    if not base_url:
        return ""

    network_key = network.strip().lower().replace("-", "_")

    if network_key == "involve_asia":
        params = {"url": base_url, "aff_id": affiliate_id}
        if sid:
            params["sub_id"] = sid
        return f"https://invol.co/cl?{urlencode(params)}"

    if network_key == "cj":
        if not merchant_id:
            raise ValueError("CJ links require merchant_id, also known as advertiser/AID.")
        click_url = f"https://www.anrdoezrs.net/click-{affiliate_id}-{merchant_id}"
        params = {"url": base_url}
        if sid:
            params["sid"] = sid
        return f"{click_url}?{urlencode(params)}"

    if network_key in {"query", "utm"}:
        return append_query_params(base_url, {"aff_id": affiliate_id, "utm_source": "ic_wearables", "utm_medium": "affiliate"})

    raise ValueError(f"Unsupported affiliate network: {network}")


def assign_affiliate_links(
    products: list[Product],
    affiliate_id: str,
    network: str,
    merchant_id: str | None = None,
    sid: str | None = None,
) -> list[Product]:
    for product in products:
        product.affiliate_link = generate_affiliate_link(
            product.raw_url,
            affiliate_id,
            network=network,
            merchant_id=merchant_id,
            sid=sid,
        )
    return products


def keyword_score(text: str, keywords: list[str]) -> int:
    score = 0
    for keyword in keywords:
        pattern = r"\b" + re.escape(keyword.lower()) + r"\b"
        if re.search(pattern, text):
            score += 3 if " " in keyword else 2
    return score


def detect_piece_type(product: Product) -> str | None:
    text = product.searchable_text()
    best_role = None
    best_score = 0
    for role, keywords in PIECE_KEYWORDS.items():
        score = keyword_score(text, keywords)
        if score > best_score:
            best_role = role
            best_score = score
    return best_role


def create_outfit_combinations(
    product_pool: list[Product],
    target_season: str = "True Autumn",
    max_outfits: int = 6,
) -> list[dict[str, Any]]:
    """Build capsule outfits with exactly four structural pieces."""

    season_keywords = SEASON_COLOR_KEYWORDS.get(target_season, SEASON_COLOR_KEYWORDS["True Autumn"])
    buckets: dict[str, list[tuple[int, Product]]] = {role: [] for role in ROLE_LABELS}

    for product in product_pool:
        role = detect_piece_type(product)
        if not role:
            continue
        text = product.searchable_text()
        season_score = keyword_score(text, season_keywords)
        category_score = keyword_score(text, PIECE_KEYWORDS[role])
        total_score = season_score * 2 + category_score
        if season_score <= 0:
            total_score = max(1, category_score)
        buckets[role].append((total_score, product))

    for role in buckets:
        buckets[role].sort(key=lambda item: item[0], reverse=True)

    missing_roles = [ROLE_LABELS[role] for role, values in buckets.items() if not values]
    if missing_roles:
        raise ValueError(
            "Could not create a complete outfit. Missing product roles: " + ", ".join(missing_roles)
        )

    outfit_count = min(max_outfits, min(len(values) for values in buckets.values()))
    outfits: list[dict[str, Any]] = []

    for index in range(outfit_count):
        pieces: dict[str, Product] = {}
        score_total = 0
        used_urls: set[str] = set()

        for role, ranked_products in buckets.items():
            selected_score, selected_product = ranked_products[index % len(ranked_products)]
            for score, candidate in ranked_products:
                candidate_key = candidate.raw_url or candidate.title
                if candidate_key not in used_urls:
                    selected_score, selected_product = score, candidate
                    break
            used_urls.add(selected_product.raw_url or selected_product.title)
            pieces[role] = selected_product
            score_total += selected_score

        outfits.append(
            {
                "name": f"{target_season} Capsule Look {index + 1}",
                "season": target_season,
                "palette_keywords": season_keywords,
                "score": score_total,
                "pieces": pieces,
            }
        )

        # Rotate buckets so subsequent outfits get a different first choice.
        for role in buckets:
            buckets[role] = buckets[role][1:] + buckets[role][:1]

    return outfits


def html_escape(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def image_src_for_html(product: Product, output_file: Path) -> str:
    image_path = product.local_image_path or product.image_url
    if not image_path:
        return ""

    parsed = urlparse(image_path)
    if parsed.scheme in {"http", "https"}:
        return image_path

    path = Path(image_path)
    try:
        return path.resolve().relative_to(output_file.resolve().parent).as_posix()
    except ValueError:
        return path.as_posix()


def render_product_card(product: Product, role: str, output_file: Path) -> str:
    image_src = image_src_for_html(product, output_file)
    title = html_escape(product.title.title())
    brand = html_escape(product.brand or "Retail Partner")
    price = html_escape(product.price or "Live price")
    link = html_escape(product.affiliate_link or product.raw_url)
    role_label = html_escape(ROLE_LABELS.get(role, role))

    if image_src:
        image_markup = f'<img src="{html_escape(image_src)}" alt="{title}" loading="lazy" />'
    else:
        image_markup = '<div class="image-placeholder">No image</div>'

    return f"""
          <article class="product-card">
            <div class="product-image">{image_markup}</div>
            <div class="product-copy">
              <span class="piece-role">{role_label}</span>
              <p class="brand-name">{brand}</p>
              <h3>{title}</h3>
              <p class="price">{price}</p>
              <a href="{link}" target="_blank" rel="noopener noreferrer sponsored" class="shop-btn">Shop Item</a>
            </div>
          </article>"""


def generate_html_canvas(outfits: list[dict[str, Any]], output_file: str | Path = "outfits_rack.html") -> Path:
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    outfit_sections = []
    for outfit in outfits:
        pieces = outfit["pieces"]
        product_cards = "\n".join(
            render_product_card(pieces[role], role, output_path)
            for role in ("top_outerwear", "bottom", "shoes", "accessory")
        )
        keywords = ", ".join(outfit.get("palette_keywords", [])[:8])
        outfit_sections.append(
            f"""
      <section class="outfit-look">
        <div class="look-header">
          <div>
            <span class="eyebrow">{html_escape(outfit.get("season", ""))}</span>
            <h2>{html_escape(outfit.get("name", "Capsule Outfit"))}</h2>
          </div>
          <p>Palette cues: {html_escape(keywords)}</p>
        </div>
        <div class="outfit-canvas-container">
{product_cards}
        </div>
      </section>"""
        )

    html_output = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>IC Wearables Capsule Outfits</title>
    <style>
      :root {{
        color-scheme: light;
        --bg: #f5f1ea;
        --ink: #191511;
        --muted: #74695c;
        --surface: #fffaf2;
        --surface-strong: #201a16;
        --line: rgba(25, 21, 17, 0.14);
        --gold: #b98535;
        --olive: #5d6546;
        --rust: #9b4f2f;
        --shadow: 0 24px 70px rgba(31, 24, 18, 0.14);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }}

      * {{
        box-sizing: border-box;
      }}

      body {{
        margin: 0;
        background:
          linear-gradient(135deg, rgba(185, 133, 53, 0.12), transparent 34%),
          linear-gradient(180deg, #fffaf2, var(--bg));
        color: var(--ink);
      }}

      .page-shell {{
        width: min(1180px, calc(100% - 32px));
        margin: 0 auto;
        padding: 52px 0 76px;
      }}

      .page-hero {{
        display: grid;
        gap: 12px;
        max-width: 820px;
        margin-bottom: 30px;
      }}

      .eyebrow,
      .piece-role {{
        color: var(--gold);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }}

      h1,
      h2,
      h3,
      p {{
        margin-top: 0;
      }}

      h1 {{
        margin-bottom: 6px;
        font-size: clamp(42px, 7vw, 88px);
        line-height: 0.95;
        letter-spacing: 0;
      }}

      .page-hero p,
      .look-header p {{
        color: var(--muted);
        font-size: 17px;
      }}

      .outfit-look {{
        margin-top: 22px;
        padding: clamp(18px, 3vw, 30px);
        border: 1px solid var(--line);
        border-radius: 8px;
        background: rgba(255, 250, 242, 0.86);
        box-shadow: var(--shadow);
      }}

      .look-header {{
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 24px;
        padding-bottom: 18px;
        border-bottom: 1px solid var(--line);
      }}

      .look-header h2 {{
        margin: 5px 0 0;
        font-size: clamp(26px, 4vw, 44px);
        line-height: 1;
      }}

      .outfit-canvas-container {{
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
        margin-top: 18px;
      }}

      .product-card {{
        display: grid;
        grid-template-rows: 260px 1fr;
        min-width: 0;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #fffdf8;
      }}

      .product-image {{
        display: grid;
        min-width: 0;
        overflow: hidden;
        background: #e8dfd2;
      }}

      .product-image img {{
        width: 100%;
        height: 100%;
        object-fit: cover;
      }}

      .image-placeholder {{
        display: grid;
        place-items: center;
        color: var(--muted);
        font-weight: 800;
      }}

      .product-copy {{
        display: grid;
        align-content: start;
        gap: 8px;
        padding: 16px;
      }}

      .brand-name {{
        margin: 0;
        color: var(--olive);
        font-size: 13px;
        font-weight: 900;
        text-transform: uppercase;
      }}

      .product-card h3 {{
        margin: 0;
        min-height: 48px;
        font-size: 18px;
        line-height: 1.18;
        overflow-wrap: anywhere;
      }}

      .price {{
        margin: 0 0 6px;
        color: var(--rust);
        font-size: 18px;
        font-weight: 950;
      }}

      .shop-btn {{
        display: inline-flex;
        min-height: 44px;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        background: var(--surface-strong);
        color: #fffaf2;
        font-weight: 900;
        text-decoration: none;
      }}

      .shop-btn:hover {{
        background: var(--gold);
        color: #110d09;
      }}

      @media (max-width: 980px) {{
        .outfit-canvas-container {{
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }}

        .look-header {{
          align-items: start;
          flex-direction: column;
        }}
      }}

      @media (max-width: 560px) {{
        .page-shell {{
          width: min(100% - 24px, 1180px);
          padding-top: 34px;
        }}

        .outfit-canvas-container {{
          grid-template-columns: 1fr;
        }}

        .product-card {{
          grid-template-rows: 340px 1fr;
        }}
      }}
    </style>
  </head>
  <body>
    <main class="page-shell">
      <section class="page-hero">
        <span class="eyebrow">IC Wearables capsule rack</span>
        <h1>Color Season Capsule Outfits</h1>
        <p>Automated product pairings based on seasonal colour cues, outfit structure, and affiliate-ready product links.</p>
      </section>
{''.join(outfit_sections)}
    </main>
  </body>
</html>
"""

    output_path.write_text(html_output, encoding="utf-8")
    return output_path


def load_products_from_args(args: argparse.Namespace) -> list[Product]:
    if args.feed:
        return parse_affiliate_feed(args.feed, images_dir=args.images_dir)
    if args.url:
        return scrape_product_data(args.url, images_dir=args.images_dir)
    raise ValueError("Provide either --feed path/to/feed.csv or --url https://retailer.example/category")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate IC Wearables color season capsule outfits from a product feed or product page."
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--feed", help="CSV affiliate product feed path")
    source.add_argument("--url", help="Retailer product/category URL to scrape")
    parser.add_argument("--season", default="True Autumn", choices=sorted(SEASON_COLOR_KEYWORDS), help="Target colour season")
    parser.add_argument("--affiliate-id", required=True, help="Affiliate ID, CJ website ID, or tracking publisher ID")
    parser.add_argument("--network", default="involve_asia", choices=["involve_asia", "cj", "query", "utm"], help="Affiliate network")
    parser.add_argument("--merchant-id", help="CJ advertiser/AID or network merchant ID, required for --network cj")
    parser.add_argument("--sid", help="Optional sub ID / campaign ID")
    parser.add_argument("--images-dir", default="images", help="Folder for locally downloaded product images")
    parser.add_argument("--output", default="outfits_rack.html", help="Output HTML file")
    parser.add_argument("--max-outfits", type=int, default=6, help="Maximum complete outfits to render")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    try:
        products = load_products_from_args(args)
        if not products:
            raise ValueError("No products were extracted. Check the feed columns or scraper selectors.")

        assign_affiliate_links(
            products,
            affiliate_id=args.affiliate_id,
            network=args.network,
            merchant_id=args.merchant_id,
            sid=args.sid,
        )
        outfits = create_outfit_combinations(products, target_season=args.season, max_outfits=args.max_outfits)
        output_path = generate_html_canvas(outfits, output_file=args.output)
    except Exception as exc:
        parser.exit(status=1, message=f"error: {exc}\n")

    print(f"Extracted products: {len(products)}")
    print(f"Generated outfits: {len(outfits)}")
    print(f"HTML output: {output_path}")


if __name__ == "__main__":
    main()
