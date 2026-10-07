"""Accounts: create account, log in, log out, and "who am I".

Passwords are hashed with PBKDF2-HMAC-SHA256 from Python's standard library
(hashlib) — a standard, well-reviewed algorithm, not a homemade one. We use the
exact format the seeded users already have in the users table:

    pbkdf2_sha256$<random salt>$<hex digest>   (120,000 iterations)

so the test user and new users are stored and checked the same way.

Login state is a signed, HttpOnly session cookie (Starlette's SessionMiddleware,
set up in main.py) that only holds the user's id. Passwords and hashes are never
logged and never returned to the frontend.
"""

import hashlib
import hmac
import secrets
import sqlite3
from typing import Annotated

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, StringConstraints, model_validator

from db import connect

router = APIRouter(prefix="/api/auth")

HASH_ALGORITHM = "pbkdf2_sha256"
HASH_ITERATIONS = 120_000  # matches the seeded users' hashes

LOGIN_FAILED = "Incorrect email or password."


# ---------- Password hashing ----------

def _pbkdf2(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), HASH_ITERATIONS
    ).hex()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(8)  # random 16-char salt per user
    return f"{HASH_ALGORITHM}${salt}${_pbkdf2(password, salt)}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, salt, digest = stored_hash.split("$")
    except ValueError:
        return False
    if algorithm != HASH_ALGORITHM:
        return False
    # compare_digest takes the same time whether the first or last char differs.
    return hmac.compare_digest(_pbkdf2(password, salt), digest)


# Used when the email doesn't exist, so a wrong email takes as long as a wrong
# password and the response time doesn't reveal which accounts exist.
_DUMMY_HASH = hash_password(secrets.token_hex(16))


# ---------- Request / response shapes ----------

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class SignupRequest(BaseModel):
    first_name: Name
    last_name: Name
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        return self


class LoginRequest(BaseModel):
    email: str
    password: str


def public_user(row: sqlite3.Row) -> dict:
    """The only user fields the frontend ever sees (never the password hash)."""
    return {
        "id": row["id"],
        "first_name": row["first_name"],
        "last_name": row["last_name"],
        "name": row["name"],
        "email": row["email"],
    }


USER_COLUMNS = "id, name, email, first_name, last_name"


def start_session(request: Request, user_id: int) -> None:
    request.session.clear()  # drop anything from a previous session
    request.session["user_id"] = user_id


def current_user(request: Request) -> dict | None:
    """The logged-in user from the session cookie, or None."""
    user_id = request.session.get("user_id")
    if user_id is None:
        return None
    with connect() as conn:
        row = conn.execute(f"SELECT {USER_COLUMNS} FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:  # account no longer exists
        request.session.clear()
        return None
    return public_user(row)


# ---------- Endpoints ----------

@router.post("/signup", status_code=201)
def signup(body: SignupRequest, request: Request):
    email = body.email.strip().lower()
    with connect(readonly=False) as conn:
        exists = conn.execute(
            "SELECT 1 FROM users WHERE lower(email) = ?", (email,)
        ).fetchone()
        if exists:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        try:
            cursor = conn.execute(
                """
                INSERT INTO users (name, email, password_hash, first_name, last_name)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    f"{body.first_name} {body.last_name}",
                    email,
                    hash_password(body.password),
                    body.first_name,
                    body.last_name,
                ),
            )
        except sqlite3.IntegrityError:  # same email inserted at the same moment
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        row = conn.execute(
            f"SELECT {USER_COLUMNS} FROM users WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    start_session(request, row["id"])  # new accounts are logged in right away
    return {"user": public_user(row)}


@router.post("/login")
def login(body: LoginRequest, request: Request):
    email = body.email.strip().lower()
    with connect() as conn:
        row = conn.execute(
            f"SELECT {USER_COLUMNS}, password_hash FROM users WHERE lower(email) = ?", (email,)
        ).fetchone()
    if row is None:
        verify_password(body.password, _DUMMY_HASH)
        raise HTTPException(status_code=401, detail=LOGIN_FAILED)
    if not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail=LOGIN_FAILED)
    start_session(request, row["id"])
    return {"user": public_user(row)}


@router.post("/logout")
def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@router.get("/me")
def me(request: Request):
    """Who is logged in. Returns {"user": null} when nobody is."""
    return {"user": current_user(request)}
