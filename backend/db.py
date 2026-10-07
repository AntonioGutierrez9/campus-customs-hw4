"""Shared access to data/campus_customs.db."""

import sqlite3
from contextlib import contextmanager
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "campus_customs.db"


@contextmanager
def connect(readonly: bool = True):
    """Open the database and always close it afterwards.

    Product pages only read, so they use a read-only connection. Writes (e.g.
    new accounts) pass readonly=False and are committed if no error happens.
    """
    if readonly:
        conn = sqlite3.connect(f"file:{DB_PATH.as_posix()}?mode=ro", uri=True)
    else:
        conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        if not readonly:
            conn.commit()
    finally:
        conn.close()


# ---------- Chat history (chat_messages table) ----------
#
# chat_messages(id, user_id → users.id, role 'user'|'assistant', content,
#               products_json, created_at). Every query below filters by the
# user_id of the logged-in session, so a shopper only ever sees their own chat.

def save_chat_messages(user_id: int, user_text: str, reply_text: str, products_json: str | None) -> None:
    """Save one exchange: the shopper's message, then the assistant's reply."""
    with connect(readonly=False) as conn:
        conn.execute(
            "INSERT INTO chat_messages (user_id, role, content) VALUES (?, 'user', ?)",
            (user_id, user_text),
        )
        conn.execute(
            "INSERT INTO chat_messages (user_id, role, content, products_json) VALUES (?, 'assistant', ?, ?)",
            (user_id, reply_text, products_json),
        )


def load_chat_messages(user_id: int, limit: int = 50) -> list[sqlite3.Row]:
    """The user's most recent messages, oldest first."""
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT role, content, products_json, created_at FROM chat_messages
            WHERE user_id = ? ORDER BY id DESC LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()
    return list(reversed(rows))


# ---------- Favorites (favorites table) ----------
#
# The database had no table for this, so we add one. One row per saved product
# per user; the primary key stops the same product being saved twice.

def ensure_favorites_table() -> None:
    with connect(readonly=False) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS favorites (
                user_id INTEGER NOT NULL,
                product_id TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (user_id, product_id),
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (product_id) REFERENCES catalogue(product_id)
            )
            """
        )


def load_favorites(user_id: int) -> list[str]:
    """The user's favorite product_ids, most recently added first."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT product_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC, rowid DESC",
            (user_id,),
        ).fetchall()
    return [r["product_id"] for r in rows]


def add_favorite(user_id: int, product_id: str) -> None:
    with connect(readonly=False) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO favorites (user_id, product_id) VALUES (?, ?)", (user_id, product_id)
        )


def remove_favorite(user_id: int, product_id: str) -> None:
    with connect(readonly=False) as conn:
        conn.execute("DELETE FROM favorites WHERE user_id = ? AND product_id = ?", (user_id, product_id))
