"""Tools the shopping agent can call, plus small database helpers.

Every product fact comes from data/campus_customs.db (read-only here):
  catalogue(product_id PK, name, garment_type, description, colors, search_tags,
            image_file_path, price)
  inventory(product_id → catalogue.product_id, size XS–XXL, quantity),
            one row per product per size
To give the agent a new tool, write a function below and add it to TOOLS.
"""

import difflib
import json
import re
import sqlite3
from functools import lru_cache
from pathlib import Path

from pydantic_ai import RunContext

from db import connect
from models import (
    ChatDeps, ProductCard, ProductLookup, ProductSummary, SearchResults, SimilarResults, SizeStock,
    StockLookup,
)

SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL"]
MAX_MATCHES = 6  # how many candidates to show when a request is ambiguous
MAX_PAGE_RESULTS = 60  # most search results the website will show at once

# Words that don't help find a product.
STOPWORDS = {
    "a", "an", "and", "any", "are", "can", "do", "does", "for", "get", "got", "has",
    "have", "how", "i", "in", "is", "it", "looking", "me", "my", "of", "on", "one",
    "or", "please", "show", "some", "something", "still", "tell", "that", "the",
    "there", "this", "to", "want", "what", "which", "with", "you", "your",
    "yale",  # almost every product is Yale, so it doesn't narrow anything
    # price / stock words: they describe the question, not the product
    "under", "below", "less", "than", "cheap", "cheaper", "price", "around", "about",
    "much", "cost", "costs", "many", "left", "stock", "available", "size", "sizes",
    "small", "medium", "large", "xs", "xl", "xxl",
    # browsing words: "show me baseball merchandise" is really just "baseball"
    "see", "find", "browse", "search", "need", "like", "all", "options", "kind", "kinds",
    "type", "types", "merchandise", "merch", "gear", "stuff", "item", "items", "thing",
    "things", "product", "products", "clothes", "clothing", "apparel",
    "gift", "gifts", "present", "presents", "idea", "ideas", "someone",
}

# Multi-word phrases shoppers use → one search word (applied before splitting).
PHRASES = {
    "dark blue": "navy", "navy blue": "navy",
    "crew neck": "crewneck", "crew-neck": "crewneck",
    "quarter zip": "quarter-zip", "1/4 zip": "quarter-zip", "half zip": "quarter-zip",
    "half-zip": "quarter-zip", "full zip": "full-zip", "zip up": "full-zip", "zip-up": "full-zip",
    "long sleeve": "long-sleeve", "long sleeved": "long-sleeve", "long-sleeved": "long-sleeve",
    "t shirt": "t-shirt", "tee shirt": "t-shirt", "sweat shirt": "sweatshirt",
}

# Shopper words → the catalogue's word for the same thing.
SYNONYMS = {
    "tee": "t-shirt", "tshirt": "t-shirt", "hoody": "hoodie", "quarterzip": "quarter-zip",
    "1/4": "quarter-zip", "grey": "gray", "longsleeve": "long-sleeve", "zipup": "full-zip",
    "jumper": "sweatshirt", "sweats": "sweatshirt", "coat": "jacket",
    "mother": "mom", "mum": "mom", "father": "dad", "grandmother": "grandma",
    "grandfather": "grandpa",
}

# A search word also matches these ways the catalogue writes it.
VARIANTS = {
    "hoodie": ["hoodie", "hooded"],
    "t-shirt": ["t-shirt", "t shirt"],
    "quarter-zip": ["quarter-zip", "1 4 zip", "1/4 zip", "quarter zip"],
    "full-zip": ["full-zip", "full zip"],
    "crewneck": ["crewneck", "crew neck", "crew-neck"],
    "long-sleeve": ["long-sleeve", "long sleeve", "l s"],
    "sweatshirt": ["sweatshirt", "sweater"],
    "sweater": ["sweater", "sweatshirt"],
}

# How shoppers write sizes → the size codes in the inventory table.
SIZE_ALIASES = {
    "xs": "XS", "x-small": "XS", "xsmall": "XS", "extra small": "XS", "extra-small": "XS",
    "s": "S", "sm": "S", "small": "S",
    "m": "M", "md": "M", "med": "M", "medium": "M",
    "l": "L", "lg": "L", "large": "L",
    "xl": "XL", "x-large": "XL", "xlarge": "XL", "extra large": "XL", "extra-large": "XL",
    "xxl": "XXL", "2xl": "XXL", "2x": "XXL", "xx-large": "XXL", "xxlarge": "XXL",
    "extra extra large": "XXL",
}


# ---------- Matching helpers ----------

@lru_cache(maxsize=1)
def _vocabulary() -> frozenset[str]:
    """Every word that appears anywhere in the catalogue (used to fix typos)."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT name, garment_type, description, colors, search_tags FROM catalogue"
        ).fetchall()
    text = " ".join(" ".join(r) for r in rows).lower()
    return frozenset(w for w in re.findall(r"[a-z][a-z-]+", text) if len(w) >= 3)


def _singular(word: str) -> str:
    """hoodies → hoodie, jerseys → jersey, sweaters → sweater (but keep "dress"-style words)."""
    if len(word) <= 3 or not word.endswith("s") or word.endswith("ss"):
        return word
    if word.endswith("ies") and word[:-3] + "y" in _vocabulary():
        return word[:-3] + "y"
    return word[:-1]


def _fix_typo(word: str) -> str:
    """Keep words the catalogue knows (or starts with); otherwise try the closest catalogue word.

    "hoddie" → "hoodie", "sweatshrit" → "sweatshirt", "piersen" → "pierson".
    """
    vocab = _vocabulary()
    if word in VARIANTS or any(v.startswith(word) for v in vocab):
        return word
    close = difflib.get_close_matches(word, vocab, n=1, cutoff=0.8)
    return close[0] if close else word


def _search_terms(query: str) -> list[str]:
    """Turn what the shopper typed into the key words to look for in the catalogue."""
    text = query.lower()
    for phrase, word in PHRASES.items():
        text = text.replace(phrase, word)
    terms = []
    for word in re.findall(r"[a-z0-9/'-]+", text):
        word = word.strip("'-")
        if word in STOPWORDS or len(word) < 2 or word.isdigit():
            continue
        word = SYNONYMS.get(word) or SYNONYMS.get(_singular(word)) or _singular(word)
        if word in STOPWORDS:
            continue
        terms.append(_fix_typo(word))
    return list(dict.fromkeys(terms))


def _term_found(term: str, text: str) -> bool:
    """True if a word in `text` starts with `term` or one of its variants.

    Prefix matching gives partial matches ("pier" finds "Pierson") without
    false hits inside other words ("art" doesn't match "quarter").
    """
    variants = {term, term.replace("-", " "), *VARIANTS.get(term, [])}
    return any(re.search(r"\b" + re.escape(v), text) for v in variants)


def _all_products() -> list[sqlite3.Row]:
    with connect() as conn:
        return conn.execute(
            """
            SELECT c.*, COALESCE(SUM(i.quantity), 0) AS total_stock
            FROM catalogue c LEFT JOIN inventory i ON i.product_id = c.product_id
            GROUP BY c.product_id
            ORDER BY c.name
            """
        ).fetchall()


@lru_cache(maxsize=1)
def _color_words() -> frozenset[str]:
    """Every word used in the catalogue's colors lists (navy, gray, heather, ...)."""
    with connect() as conn:
        lists = [json.loads(r[0]) for r in conn.execute("SELECT colors FROM catalogue")]
    return frozenset(word for colors in lists for color in colors for word in color.lower().split())


def _main_color(row: sqlite3.Row) -> str:
    """The garment's own color: the first entry in colors (the rest are print colors).

    Three products have an empty colors list (and a placeholder description), so
    their color is unknown and they never match a color search.
    """
    colors = json.loads(row["colors"])
    return colors[0].lower() if colors else ""


def color_family(row: sqlite3.Row) -> str | None:
    """Group main colors for filtering: "heather gray" and "charcoal gray" are both Gray."""
    color = _main_color(row)
    if not color:
        return None
    for word, family in [("navy", "Navy"), ("gray", "Gray"), ("charcoal", "Gray"),
                         ("cream", "Cream & White"), ("white", "Cream & White"),
                         ("ivory", "Cream & White")]:
        if word in color:
            return family
    return color.split()[-1].title()  # e.g. "dusty coral" → "Coral"


def garment_family(garment_type: str) -> str:
    """Same grouping as the website's categories (frontend/src/categories.ts)."""
    g = garment_type.lower()
    for key, family in [("quarter-zip", "Quarter-Zips"), ("hood", "Hoodies"), ("jacket", "Jackets & Fleece"),
                        ("t-shirt", "T-Shirts"), ("long-sleeve", "Long Sleeve"),
                        ("crewneck", "Crewnecks"), ("mockneck", "Crewnecks")]:
        if key in g:
            return family
    return "Other"


def _rank(rows: list[sqlite3.Row], terms: list[str]) -> list[tuple[int, int, sqlite3.Row]]:
    """(terms matched anywhere, terms matched in the name, row), best first.

    Color words only match the garment's main color, so "navy shirts" means navy
    shirts, not gray shirts with navy lettering.
    """
    colors = _color_words()
    ranked = []
    for row in rows:
        name = row["name"].lower()
        text = " ".join(
            [name, row["garment_type"], row["description"], row["colors"], row["search_tags"]]
        ).lower()
        main_color = _main_color(row)
        matched = sum(_term_found(t, main_color if t in colors else text) for t in terms)
        in_name = sum(_term_found(t, name) for t in terms)
        if matched:
            ranked.append((matched, in_name, row))
    ranked.sort(key=lambda r: (-r[0], -r[1], r[2]["name"]))
    return ranked


def _summary(row: sqlite3.Row) -> ProductSummary:
    return ProductSummary(
        product_id=row["product_id"],
        name=row["name"],
        garment_type=row["garment_type"],
        description=row["description"],
        price=row["price"],
        colors_in_design=json.loads(row["colors"]),
        total_stock=row["total_stock"],
    )


def _resolve(product: str) -> tuple[sqlite3.Row | None, list[sqlite3.Row], str]:
    """Find the one product a shopper means.

    Returns (product, [], "") when there is exactly one sensible match,
    (None, candidates, reason) when several could match or nothing matches fully.
    Never picks one at random.
    """
    rows = _all_products()
    wanted = product.strip().lower()
    for row in rows:  # exact product_id or exact name
        if wanted in (row["product_id"], row["name"].lower()):
            return row, [], ""

    terms = _search_terms(product)
    ranked = _rank(rows, terms)
    if not terms or not ranked:
        return None, [], "not_found"

    full = [r for r in ranked if r[0] == len(terms)]  # match every word the shopper used
    if not full:
        closest = [row for _, _, row in ranked[:MAX_MATCHES]]
        return None, closest, "not_found"
    if len(full) == 1:
        return full[0][2], [], ""
    # Several full matches: only pick one if it alone has every word in its name.
    in_name_all = [r for r in full if r[1] == len(terms)]
    if len(in_name_all) == 1:
        return in_name_all[0][2], [], ""
    return None, [row for _, _, row in full[:MAX_MATCHES]], f"ambiguous:{len(full)}"


def _normalize_size(size: str) -> str | None:
    s = re.sub(r"^size\s+", "", size.strip().lower())
    return SIZE_ALIASES.get(s) or (s.upper() if s.upper() in SIZE_ORDER else None)


def _not_resolved_message(product: str, candidates: list[sqlite3.Row], reason: str) -> str:
    if reason.startswith("ambiguous"):
        count = int(reason.split(":")[1])
        return (
            f"'{product}' matches {count} products (showing {len(candidates)}). "
            "Don't pick one; ask the shopper which they mean."
        )
    if candidates:
        return (
            f"No product matches '{product}'. The closest items only partly match; "
            "tell the shopper we don't have exactly that, and offer these only if they fit."
        )
    return f"No product matches '{product}'. Tell the shopper we couldn't find it."


# ---------- Tools the agent can call ----------

def search_products(
    ctx: RunContext[ChatDeps], query: str, max_price: float | None = None
) -> SearchResults:
    """Search the catalogue for every product that fits what the shopper wants to browse.

    Use when the shopper asks to see, find, or browse a type of merchandise:
    "What hoodies do you have?", "navy shirts", "baseball merchandise", "gift for my dad".
    For a question about one specific product, use get_product_info or check_stock.

    Args:
        query: What the shopper asked for, in their own words is fine, e.g. "hoodies",
            "grey crew neck sweatshirts", "dark blue tees", "1/4 zip". Plurals, common
            clothing synonyms, partial words, and small typos are handled.
        max_price: Optional highest price in dollars.

    A product matches only if it has every key word (see search_terms for how the
    request was understood). All matches are saved so the website can show them;
    you get the total plus the best 10 to talk about. total_matches 0 means nothing
    matches: tell the shopper; close_matches only partly match, so never present
    them as what was asked for.
    """
    rows = _all_products()
    if max_price is not None:
        rows = [r for r in rows if r["price"] <= max_price]
    terms = _search_terms(query)
    if not terms:
        return SearchResults(
            query=query, total_matches=0,
            message="That request is too general to search. Ask what kind of item they want.",
        )

    ranked = _rank(rows, terms)
    matches = [row for found, _, row in ranked if found == len(terms)]
    ctx.deps.search_result_ids.extend(row["product_id"] for row in matches[:MAX_PAGE_RESULTS])
    if not matches:
        # Words that match nothing anywhere in the catalogue (e.g. "pink"), so the
        # agent doesn't offer "pink items in other styles" that don't exist.
        missing = [t for t in terms if not _rank(_all_products(), [t])]
        message = f"No product matches all of {terms}. Tell the shopper we don't have that."
        if missing:
            message += f" Nothing in the whole catalogue matches {missing}, so don't offer other items with those."
        return SearchResults(
            query=query, search_terms=terms, total_matches=0, message=message,
            close_matches=[_summary(row) for _, _, row in ranked[:MAX_MATCHES]],
        )
    return SearchResults(
        query=query,
        search_terms=terms,
        total_matches=len(matches),
        message=f"{len(matches)} products match {terms}.",
        products=[_summary(row) for row in matches[:10]],
    )


# Tags that almost every product has ("Yale", "college apparel") don't say much
# about similarity, so only the rarer, more specific tags count.
@lru_cache(maxsize=1)
def _common_tags() -> frozenset[str]:
    rows = _all_products()
    counts: dict[str, int] = {}
    for row in rows:
        for tag in {t.lower() for t in json.loads(row["search_tags"])}:
            counts[tag] = counts.get(tag, 0) + 1
    return frozenset(tag for tag, n in counts.items() if n > len(rows) * 0.15)


def _tags(row: sqlite3.Row) -> set[str]:
    return {t.lower() for t in json.loads(row["search_tags"])} - _common_tags()


def _name_words(row: sqlite3.Row) -> set[str]:
    return set(row["name"].lower().split()) - {"yale", "1", "4", "t", "shirt"}


@lru_cache(maxsize=1)
def _name_word_counts() -> dict[str, int]:
    """How many product names each word appears in."""
    counts: dict[str, int] = {}
    for row in _all_products():
        for word in _name_words(row):
            counts[word] = counts.get(word, 0) + 1
    return counts


def _similarity(base: sqlite3.Row, other: sqlite3.Row) -> float:
    """How alike two products are, from catalogue fields only."""
    score = 0.0
    if garment_family(base["garment_type"]) == garment_family(other["garment_type"]):
        score += 3  # same kind of garment
    if color_family(base) and color_family(base) == color_family(other):
        score += 2  # same main color
    base_tags, other_tags = _tags(base), _tags(other)
    if base_tags and other_tags:  # same college, sport, school, family member, graphic...
        score += 4 * len(base_tags & other_tags) / len(base_tags | other_tags)
    # Shared name words, weighted by how rare they are: sharing "Pierson" (2 products)
    # says much more than sharing "Crewneck" (27 products).
    counts = _name_word_counts()
    shared = _name_words(base) & _name_words(other)
    score += min(5.0, sum(5 / counts[w] ** 0.5 for w in shared))
    words = lambda r: set(re.findall(r"[a-z]{4,}", r["description"].lower()))  # noqa: E731
    base_words, other_words = words(base), words(other)
    if base_words and other_words:
        score += 2 * len(base_words & other_words) / len(base_words | other_words)
    score += max(0.0, 1 - abs(base["price"] - other["price"]) / 40)  # similar price
    return score


def find_similar_products(
    ctx: RunContext[ChatDeps],
    product: str | None = None,
    cheaper: bool = False,
    same_type: bool = False,
    max_price: float | None = None,
    limit: int = 8,
) -> SimilarResults:
    """Recommend products similar to one product, using garment type, main color,
    search tags, description, and price from the catalogue.

    Use for "show me something similar", "anything like this but cheaper?",
    "another sweatshirt like this". The results are shown on the page like a search.

    Args:
        product: The product to compare against (name or product_id). Leave empty to
            use the product page the shopper is viewing.
        cheaper: Only products that cost less than this one.
        same_type: Only the same kind of garment (e.g. hoodies for a hoodie).
        max_price: Optional highest price in dollars.
        limit: How many recommendations (1-12).
    """
    if product:
        base, candidates, reason = _resolve(product)
        if base is None:
            return SimilarResults(
                status="ambiguous" if reason.startswith("ambiguous") else "not_found",
                message=_not_resolved_message(product, candidates, reason),
                matches=[_summary(c) for c in candidates],
            )
    else:
        page_id = ctx.deps.page.product_id
        base = next((r for r in _all_products() if r["product_id"] == page_id), None)
        if base is None:
            return SimilarResults(
                status="need_product",
                message="No product given and the shopper isn't on a product page. Ask which product they mean.",
            )

    others = [r for r in _all_products() if r["product_id"] != base["product_id"]]
    if cheaper:
        others = [r for r in others if r["price"] < base["price"]]
    if same_type:
        others = [r for r in others if garment_family(r["garment_type"]) == garment_family(base["garment_type"])]
    if max_price is not None:
        others = [r for r in others if r["price"] <= max_price]
    ranked = sorted(others, key=lambda r: (-_similarity(base, r), r["price"], r["name"]))
    best = ranked[: max(1, min(limit, 12))]

    ctx.deps.search_result_ids.extend(r["product_id"] for r in best)
    if not best:
        return SimilarResults(
            status="none", based_on=_summary(base),
            message=f"Nothing in the catalogue fits those conditions for {base['name']} "
            f"(${base['price']:.2f}). Say so honestly.",
        )
    return SimilarResults(
        status="found",
        based_on=_summary(base),
        message=f"{len(best)} products similar to {base['name']} (${base['price']:.2f}), most similar first.",
        products=[_summary(r) for r in best],
    )


def get_product_info(product: str) -> ProductLookup:
    """Look up one product's description, price, colors, and total stock.

    Use for "how much is ...", "tell me about ...", "what does ... look like".

    Args:
        product: The product_id or the product name the shopper used, e.g.
            "Pierson College Crewneck", "yale dad hoodie", "basic-hoodie-big-yale".

    status is "found" (see product), "ambiguous" (see matches; ask which one),
    or "not_found" (matches may hold partial matches).
    """
    row, candidates, reason = _resolve(product)
    if row is None:
        return ProductLookup(
            status="ambiguous" if reason.startswith("ambiguous") else "not_found",
            message=_not_resolved_message(product, candidates, reason),
            matches=[_summary(c) for c in candidates],
        )
    info = _summary(row)
    return ProductLookup(
        status="found",
        message=f"{info.name} costs ${info.price:.2f}; {info.total_stock} units in stock across all sizes.",
        product=info,
    )


def check_stock(product: str, size: str | None = None) -> StockLookup:
    """Check how many units of one product are in stock, for every size or one size.

    Use for "is it in stock?", "do you have it in medium?", "how many are left in large?".

    Args:
        product: The product_id or the product name the shopper used.
        size: Optional size the shopper asked about, e.g. "M", "medium", "XL", "2XL".
            Leave empty to get every size.

    A quantity of 0 means that size is OUT OF STOCK. status is "found",
    "ambiguous" (ask which product), "not_found", or "size_not_found"
    (we don't carry that size; sizes lists the real ones).
    """
    row, candidates, reason = _resolve(product)
    if row is None:
        return StockLookup(
            status="ambiguous" if reason.startswith("ambiguous") else "not_found",
            message=_not_resolved_message(product, candidates, reason),
            matches=[_summary(c) for c in candidates],
        )

    with connect() as conn:
        stock = conn.execute(
            "SELECT size, quantity FROM inventory WHERE product_id = ?", (row["product_id"],)
        ).fetchall()
    sizes = sorted(
        (SizeStock(size=s["size"], quantity=s["quantity"], in_stock=s["quantity"] > 0) for s in stock),
        key=lambda s: SIZE_ORDER.index(s.size) if s.size in SIZE_ORDER else 99,
    )
    total = sum(s.quantity for s in sizes)
    base = dict(product_id=row["product_id"], product_name=row["name"], total_stock=total)

    if size is None or not size.strip():
        sold_out = [s.size for s in sizes if not s.in_stock]
        note = f" Sold out in: {', '.join(sold_out)}." if sold_out else " Every size is in stock."
        return StockLookup(
            status="found", message=f"{row['name']}: {total} units in stock in total.{note}",
            sizes=sizes, **base,
        )

    code = _normalize_size(size)
    match = next((s for s in sizes if s.size == code), None)
    if match is None:
        return StockLookup(
            status="size_not_found",
            message=f"{row['name']} doesn't come in size '{size}'. Sizes: {', '.join(s.size for s in sizes)}.",
            sizes=sizes, **base,
        )
    message = (
        f"{row['name']} in size {match.size}: {match.quantity} in stock."
        if match.in_stock
        else f"{row['name']} in size {match.size} is OUT OF STOCK (0 left)."
    )
    return StockLookup(status="found", message=message, sizes=[match], **base)


TOOLS = [search_products, get_product_info, check_stock, find_similar_products]


# ---------- Helpers for the chat endpoint (not tools) ----------

def product_name(product_id: str) -> str | None:
    """The catalogue name for a product_id, or None if it doesn't exist."""
    with connect() as conn:
        row = conn.execute("SELECT name FROM catalogue WHERE product_id = ?", (product_id,)).fetchone()
    return row["name"] if row else None


def _image_url(image_file_path: str) -> str:
    return f"/images/{Path(image_file_path).name}"


def product_cards(product_ids: list[str], max_cards: int = 6) -> list[ProductCard]:
    """Build product cards from the database, in the order given.

    Unknown or duplicate IDs are dropped, so the chat can only ever show real products.
    """
    unique_ids = list(dict.fromkeys(product_ids))[:max_cards]
    if not unique_ids:
        return []
    placeholders = ",".join("?" * len(unique_ids))
    with connect() as conn:
        rows = conn.execute(
            f"SELECT product_id, name, garment_type, price, image_file_path, description "
            f"FROM catalogue WHERE product_id IN ({placeholders})",
            unique_ids,
        ).fetchall()
    by_id = {row["product_id"]: row for row in rows}
    return [
        ProductCard(
            product_id=row["product_id"],
            name=row["name"],
            garment_type=row["garment_type"],
            price=row["price"],
            image_url=_image_url(row["image_file_path"]),
            description=row["description"],
        )
        for pid in unique_ids
        if (row := by_id.get(pid))
    ]
