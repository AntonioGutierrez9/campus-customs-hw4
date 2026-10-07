"""Campus Customs backend.

Serves the product catalogue, stock by size, and product images so the React
frontend never reads SQLite directly, plus accounts and login (auth.py) and
the shopping chatbot (POST /api/chat → agent.py).

Run from the backend/ folder (with .venv activated):
    uvicorn main:app --reload --port 8000
"""

import io
import json
import logging
import os
import secrets
import sqlite3
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, ImageChops, ImageDraw, ImageFilter
from starlette.middleware.sessions import SessionMiddleware

import auth
from agent import MAX_HISTORY_TURNS, AgentNotConfigured, run_chat
from db import (
    DATA_DIR, add_favorite, connect, ensure_favorites_table, load_chat_messages, load_favorites,
    remove_favorite, save_chat_messages,
)
from models import ChatHistory, ChatHistoryMessage, ChatRequest, ChatResponse, ChatTurn, Customer
from tools import color_family, product_cards, product_name

# Load .env files from backend/ upward: backend/.env holds SESSION_SECRET and the
# course-root .env holds PORTKEY_API_KEY. Existing environment variables win.
BACKEND_DIR = Path(__file__).resolve().parent
for folder in [BACKEND_DIR, *BACKEND_DIR.parents]:
    if (folder / ".env").is_file():
        load_dotenv(folder / ".env")

PRODUCTS_DIR = DATA_DIR / "products"
SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL"]
log = logging.getLogger("campus_customs")

app = FastAPI(title="Campus Customs API")

# The Vite dev server proxies /api and /images, but allow it directly too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://127.0.0.1:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# Login state: a signed, HttpOnly cookie holding only the user's id. The secret
# that signs it lives in backend/.env; without one, a random secret is used
# (everyone is simply logged out when the server restarts).
session_secret = os.getenv("SESSION_SECRET")
if not session_secret:
    logging.warning("SESSION_SECRET not set; using a temporary one for this run.")
    session_secret = secrets.token_urlsafe(48)
app.add_middleware(
    SessionMiddleware,
    secret_key=session_secret,
    session_cookie="cc_session",
    max_age=7 * 24 * 60 * 60,  # one week
    same_site="lax",
    https_only=False,  # local http dev server; set True when served over https
)

app.include_router(auth.router)
ensure_favorites_table()  # adds the favorites table to the database if it isn't there yet


@app.exception_handler(RequestValidationError)
def validation_error(request: Request, exc: RequestValidationError):
    """Return one friendly message instead of FastAPI's default 422 body.

    The default body echoes the submitted input back, which would include the
    password — so we only send a short message.
    """
    error = exc.errors()[0]
    field = error["loc"][-1] if error["loc"] else ""
    messages = {
        "email": "Please enter a valid email address.",
        "first_name": "Please enter your first name.",
        "last_name": "Please enter your last name.",
        "password": "Password must be between 8 and 128 characters.",
        "message": "Please type a message (up to 1000 characters).",
    }
    message = messages.get(field) or error["msg"].removeprefix("Value error, ")
    return JSONResponse(status_code=422, content={"detail": message})


def _whiten_background(image: Image.Image, frame: tuple, thresh: int, grow: int) -> Image.Image:
    """Turn the background connected to the photo's border pure white.

    A 1px frame in the background color lets one flood fill reach the background
    on every side. The pixels the fill changed are the background: we close tiny
    unfilled specks, grow the area by `grow` px, and soften it so the garment
    edge blends into white instead of looking jagged.
    """
    w, h = image.size
    framed = Image.new("RGB", (w + 2, h + 2), frame)
    framed.paste(image, (1, 1))
    ImageDraw.floodfill(framed, (0, 0), (255, 255, 255), thresh=thresh)
    filled = framed.crop((1, 1, w + 1, h + 1))
    mask = ImageChops.difference(filled, image).convert("L").point(lambda v: 255 if v else 0)
    mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))  # close specks
    mask = mask.filter(ImageFilter.MaxFilter(2 * grow + 1)).filter(ImageFilter.GaussianBlur(1))
    return Image.composite(Image.new("RGB", image.size, "white"), image, mask)


@lru_cache(maxsize=None)
def cleaned_image(filename: str) -> bytes:
    """Return the product photo on a clean, pure-white background.

    73 of the 102 photos were saved with a solid black background (the others
    are white), and some white ones have a faint gray edge. Making every
    background pure white lets the website show all photos on the same cream
    tiles. The garments themselves aren't touched (the darkest one, navy, is far
    from pure black), and the original files in data/products/ are never modified.
    """
    image = Image.open(PRODUCTS_DIR / filename).convert("RGB")
    if max(image.getpixel((0, 0))) < 20:  # black background
        image = _whiten_background(image, frame=(0, 0, 0), thresh=20, grow=2)
    # Near-white edges and borders (e.g. a light gray line at the photo's edge).
    image = _whiten_background(image, frame=(255, 255, 255), thresh=45, grow=1)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=90)
    return buffer.getvalue()


@app.get("/images/{filename}")
def product_image(filename: str):
    """Serve a product photo. image_file_path is "products/x.jpg" → /images/x.jpg."""
    path = PRODUCTS_DIR / filename
    # Only plain filenames that exist in data/products/ (no "../" tricks).
    if Path(filename).name != filename or not path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return Response(
        cleaned_image(filename),
        media_type="image/jpeg",
        headers={"Cache-Control": "no-cache"},  # always pick up backend changes
    )


def product_from_row(row: sqlite3.Row) -> dict:
    """Turn a catalogue row into JSON the frontend can use directly."""
    image_name = Path(row["image_file_path"]).name
    return {
        "product_id": row["product_id"],
        "name": row["name"],
        "garment_type": row["garment_type"],
        "description": row["description"],
        "colors": json.loads(row["colors"]),
        "search_tags": json.loads(row["search_tags"]),
        "price": row["price"],
        "image_url": f"/images/{image_name}",
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/products")
def list_products():
    """Every product in the catalogue, with total stock across sizes, the sizes
    that are in stock, and its main color group (used by the Products page filters)."""
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT c.*, COALESCE(SUM(i.quantity), 0) AS total_stock,
                   GROUP_CONCAT(CASE WHEN i.quantity > 0 THEN i.size END) AS sizes_in_stock
            FROM catalogue c
            LEFT JOIN inventory i ON i.product_id = c.product_id
            GROUP BY c.product_id
            ORDER BY c.name
            """
        ).fetchall()
    return [
        {
            **product_from_row(r),
            "total_stock": r["total_stock"],
            "sizes_in_stock": sorted(
                (r["sizes_in_stock"] or "").split(",") if r["sizes_in_stock"] else [],
                key=lambda size: SIZE_ORDER.index(size) if size in SIZE_ORDER else 99,
            ),
            "color_family": color_family(r),
        }
        for r in rows
    ]


@app.get("/api/products/{product_id}")
def get_product(product_id: str):
    """One product plus its stock for every size, in XS → XXL order."""
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM catalogue WHERE product_id = ?", (product_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Product not found")
        stock = conn.execute(
            "SELECT size, quantity FROM inventory WHERE product_id = ?", (product_id,)
        ).fetchall()

    sizes = sorted(
        ({"size": s["size"], "quantity": s["quantity"]} for s in stock),
        key=lambda s: SIZE_ORDER.index(s["size"]) if s["size"] in SIZE_ORDER else 99,
    )
    return {**product_from_row(row), "sizes": sizes}


# ---------- Chat ----------

def customer_from(user: dict) -> Customer:
    """Only the fields the agent may see: name and email (never the password hash)."""
    first = user["first_name"] or user["name"].split(" ")[0]
    last = user["last_name"] or " ".join(user["name"].split(" ")[1:])
    return Customer(first_name=first, last_name=last, email=user["email"])


def products_json_for(response: ChatResponse) -> str | None:
    """What we store in chat_messages.products_json for an assistant reply."""
    if not response.products and not response.mentioned_products:
        return None
    return json.dumps({
        "results_title": response.results_title,
        "products": [p.model_dump() for p in response.products],
        "mentioned_products": [p.model_dump() for p in response.mentioned_products],
    })


def history_message(row: sqlite3.Row) -> ChatHistoryMessage:
    """A saved row → a message for the website, with cards rebuilt from the current catalogue.

    products_json is either our format ({"results_title", "products",
    "mentioned_products"}) or, for the messages that came with the database, a
    plain list of products that were shown on the page.
    """
    data = json.loads(row["products_json"]) if row["products_json"] else None
    if isinstance(data, list):
        data = {"results_title": None, "products": data, "mentioned_products": []}
    data = data or {}
    ids = lambda items: [p["product_id"] for p in items or [] if "product_id" in p]  # noqa: E731
    page = product_cards(ids(data.get("products")), max_cards=60)
    return ChatHistoryMessage(
        role=row["role"],
        content=row["content"],
        products=page,
        results_title=(data.get("results_title") or "Products from your chat") if page else None,
        mentioned_products=product_cards(ids(data.get("mentioned_products"))),
        created_at=row["created_at"],
    )


@app.get("/api/chat/history", response_model=ChatHistory)
def chat_history(request: Request):
    """The logged-in shopper's own saved chat. There's no user_id parameter on
    purpose: the user always comes from the session cookie."""
    user = auth.current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Log in to see your saved chat.")
    return ChatHistory(messages=[history_message(r) for r in load_chat_messages(user["id"])])


@app.post("/api/chat", response_model=ChatResponse)
async def chat(body: ChatRequest, request: Request):
    """Send the shopper's message to the PydanticAI agent and return its reply.

    Logged in: the earlier conversation comes from chat_messages in the database,
    the agent gets the customer's name and email, and the new exchange is saved.
    Guest: the website sends the recent conversation and nothing is saved.
    Either way the page context (path + product_id) tells the agent what's on screen.
    """
    user = auth.current_user(request)
    if user:
        saved = load_chat_messages(user["id"], limit=MAX_HISTORY_TURNS)
        history = [ChatTurn(role=r["role"], content=r["content"][:4000]) for r in saved]
    else:
        history = body.history
    try:
        response = await run_chat(
            body.message, history, customer_from(user) if user else None, body.page
        )
    except AgentNotConfigured:
        log.error("Chat unavailable: PORTKEY_API_KEY is not set.")
        raise HTTPException(status_code=503, detail="The shopping assistant isn't set up right now.")
    except Exception as exc:
        # Log only the error type (and HTTP status if the AI service sent one),
        # never the request body or any keys.
        status = getattr(exc, "status_code", None)
        log.error("Chat failed: %s%s", type(exc).__name__, f" (HTTP {status})" if status else "")
        raise HTTPException(
            status_code=502,
            detail="Sorry, the shopping assistant ran into a problem. Please try again in a moment.",
        )

    if user:
        try:
            save_chat_messages(user["id"], body.message, response.reply, products_json_for(response))
        except sqlite3.Error as exc:  # the shopper still gets their answer
            log.error("Could not save chat: %s", type(exc).__name__)
    return response


# ---------- Favorites (logged-in shoppers; guests keep favorites in the browser) ----------

def _require_user(request: Request) -> dict:
    user = auth.current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Log in to save favorites to your account.")
    return user


@app.get("/api/favorites")
def get_favorites(request: Request):
    """The logged-in shopper's favorite product_ids (newest first). Always their own."""
    return {"product_ids": load_favorites(_require_user(request)["id"])}


@app.put("/api/favorites/{product_id}")
def put_favorite(product_id: str, request: Request):
    user = _require_user(request)
    if product_name(product_id) is None:
        raise HTTPException(status_code=404, detail="Product not found")
    add_favorite(user["id"], product_id)
    return {"product_ids": load_favorites(user["id"])}


@app.delete("/api/favorites/{product_id}")
def delete_favorite(product_id: str, request: Request):
    user = _require_user(request)
    remove_favorite(user["id"], product_id)
    return {"product_ids": load_favorites(user["id"])}
