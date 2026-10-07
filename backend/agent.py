"""PydanticAI agent setup for the Campus Customs shopping assistant.

- System prompt: prompts/prompt.md (re-read on every chat)
- Tools:         tools.py
- Output types:  models.py
- Model:         CHAT_MODEL env var (default gpt-5.6-luna), called through Portkey
                 with PORTKEY_API_KEY from .env.
- Audit trail:   every agent run is appended to output/audit_trail.json.
"""

import json
import logging
import os
import re
import threading
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from openai import AsyncOpenAI
from pydantic_ai import Agent, RunContext, capture_run_messages
from pydantic_ai.exceptions import ModelHTTPError, UsageLimitExceeded
from pydantic_ai.messages import (
    ModelMessage, ModelRequest, ModelResponse, TextPart, ToolCallPart, ToolReturnPart, UserPromptPart,
)
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.usage import UsageLimits

from models import AgentReply, AuditEntry, ChatDeps, ChatResponse, ChatTurn, Customer, PageContext
from tools import MAX_PAGE_RESULTS, TOOLS, product_cards, product_name

os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")  # skip the startup ad in our logs

PROMPT_PATH = Path(__file__).resolve().parent / "prompts" / "prompt.md"
AUDIT_PATH = Path(__file__).resolve().parent.parent / "output" / "audit_trail.json"
DEFAULT_MODEL = "gpt-5.6-luna"
MAX_HISTORY_TURNS = 12  # earlier messages sent along so the agent remembers the chat
MAX_MODEL_REQUESTS = 8  # agent/tool loop limit for one shopper message
OUTPUT_TOOL = "final_result"  # PydanticAI's built-in tool for the structured answer, not a real tool
log = logging.getLogger("campus_customs")


class AgentNotConfigured(RuntimeError):
    """PORTKEY_API_KEY is missing, so the agent can't call the model."""


def model_name() -> str:
    return os.getenv("CHAT_MODEL", DEFAULT_MODEL)


@lru_cache(maxsize=1)
def get_agent() -> Agent[ChatDeps, AgentReply]:
    """Build the agent once, the first time someone chats."""
    key = os.getenv("PORTKEY_API_KEY")
    if not key:
        raise AgentNotConfigured("PORTKEY_API_KEY is not set")

    client = AsyncOpenAI(
        api_key=key,
        base_url="https://api.portkey.ai/v1",
        default_headers={"x-portkey-api-key": key, "x-portkey-provider": "openai"},
    )
    model = OpenAIChatModel(model_name(), provider=OpenAIProvider(openai_client=client))

    agent = Agent(
        model,
        deps_type=ChatDeps,
        output_type=AgentReply,
        tools=TOOLS,
        retries=2,
    )

    @agent.instructions
    def system_prompt() -> str:
        # Read on every chat, so edits to prompts/prompt.md apply without a restart.
        return PROMPT_PATH.read_text(encoding="utf-8")

    @agent.instructions
    def customer_context(ctx: RunContext[ChatDeps]) -> str:
        c = ctx.deps.customer
        if c is None:
            return "## Who you're talking to\nA guest who is not logged in, so you don't know their name."
        return (
            "## Who you're talking to\n"
            f"A logged-in customer: {c.first_name} {c.last_name} ({c.email}). "
            "Their chat is saved to their account, so earlier messages may be from previous visits."
        )

    @agent.instructions
    def page_context(ctx: RunContext[ChatDeps]) -> str:
        page = ctx.deps.page
        lines = ["## What page they're on", f"The shopper is on the website page `{page.path}`."]
        # Only trust the product_id after checking it exists in the database.
        name = product_name(page.product_id) if page.product_id else None
        if name:
            lines.append(
                f'They are viewing the product page for "{name}" (product_id: {page.product_id}). '
                'When they say "this", "it", or "this one", they mean this product unless they '
                "clearly mean something else. Look up its price, stock, and details with your "
                "tools using this product_id."
            )
        elif page.path.startswith("/products?view=chat"):
            lines.append("They are looking at the search results you showed them.")
        return "\n".join(lines)

    return agent


def to_message_history(history: list[ChatTurn]) -> list[ModelMessage]:
    """Turn the website's earlier chat messages into PydanticAI messages."""
    messages: list[ModelMessage] = []
    for turn in history[-MAX_HISTORY_TURNS:]:
        if turn.role == "user":
            messages.append(ModelRequest(parts=[UserPromptPart(content=turn.content)]))
        else:
            messages.append(ModelResponse(parts=[TextPart(content=turn.content)]))
    return messages


BLOCKED_REPLY = (
    "Sorry, I can't help with that request. I'm the Campus Customs shopping assistant, so I'm happy "
    "to help you find Yale gear, check prices and sizes, or pick out a gift."
)


def _blocked_by_content_filter(exc: Exception) -> bool:
    """True when the AI provider rejected the message with a content-filter error (HTTP 400)."""
    if not isinstance(exc, ModelHTTPError) or exc.status_code != 400:
        return False
    return "content_filter" in json.dumps(exc.body, default=str) if exc.body else False


async def run_chat(
    message: str, history: list[ChatTurn], customer: Customer | None, page: PageContext
) -> ChatResponse:
    """Send one shopper message (plus recent history and context) to the agent."""
    deps = ChatDeps(customer=customer, page=page)
    past = to_message_history(history)
    run_id = uuid.uuid4().hex[:8]
    with capture_run_messages() as captured:
        try:
            result = await get_agent().run(
                message,
                message_history=past,
                deps=deps,
                usage_limits=UsageLimits(request_limit=MAX_MODEL_REQUESTS),
            )
        except Exception as exc:  # still record what the agent did before it stopped
            if _blocked_by_content_filter(exc):
                # The AI provider refused the message (e.g. a jailbreak attempt) before
                # the model saw it. Nothing leaked, so answer politely instead of erroring.
                record_run(run_id, captured[len(past):], "blocked: content_filter", deps, message, 0)
                return ChatResponse(reply=BLOCKED_REPLY)
            stop = "usage_limit" if isinstance(exc, UsageLimitExceeded) else f"error: {type(exc).__name__}"
            record_run(run_id, captured[len(past):], stop, deps, message, products_on_page=0)
            raise
    output = result.output

    # Page results: every product search_products found during this message,
    # straight from the database. Only sent when the agent says this was a browse.
    if output.show_search_results and deps.search_result_ids:
        response = ChatResponse(
            reply=output.reply,
            products=product_cards(deps.search_result_ids, max_cards=MAX_PAGE_RESULTS),
            results_title=output.results_title,
        )
    else:
        response = ChatResponse(reply=output.reply, mentioned_products=product_cards(output.product_ids))
    record_run(run_id, result.new_messages(), "final_answer", deps, message, len(response.products))
    return response


# ---------- Audit trail (output/audit_trail.json, append-only) ----------

_audit_lock = threading.Lock()
_SECRET_PATTERNS = [
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[email]"),
    (re.compile(r"(?i)(password|passcode|pwd|token|api[ _-]?key|secret)\s*(is|:|=)?\s*\S+"), r"\1 [redacted]"),
    (re.compile(r"pbkdf2_sha256\$\S+"), "[hash]"),
    (re.compile(r"\b(sk|pk)-[A-Za-z0-9_-]{8,}\b"), "[key]"),
    (re.compile(r"\b[A-Za-z0-9_-]{32,}\b"), "[token]"),  # long random strings: keys, cookies, hashes
]


def _clean(text: str, limit: int) -> str:
    """Remove anything that looks secret, squash whitespace, and shorten."""
    for pattern, replacement in _SECRET_PATTERNS:
        text = pattern.sub(replacement, text)
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _short_result(content) -> str:
    """A one-line summary of what a tool returned (all our results have status/message)."""
    status = getattr(content, "status", None)
    message = getattr(content, "message", None)
    if message:
        return f"{status}: {message}" if status else message
    return str(content)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def append_audit(entries: list[AuditEntry]) -> None:
    """Append entries to the JSON array in output/audit_trail.json.

    Append-only: the file is only ever opened to write *after* the existing
    entries (we overwrite just the closing bracket), so earlier entries are never
    rewritten or removed, and the file stays valid JSON.
    """
    if not entries:
        return
    lines = ",\n".join(json.dumps(e.model_dump(exclude_none=True), ensure_ascii=False) for e in entries)
    with _audit_lock:
        AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
        if not AUDIT_PATH.exists() or AUDIT_PATH.stat().st_size == 0:
            AUDIT_PATH.write_bytes(f"[\n{lines}\n]\n".encode("utf-8"))
            return
        with open(AUDIT_PATH, "r+b") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            f.seek(max(0, size - 64))
            tail = f.read()
            close = tail.rfind(b"]")
            if close == -1:
                raise ValueError("audit_trail.json doesn't end with ']'")
            empty = tail[:close].rstrip().endswith(b"[") and size <= 64
            f.seek(size - len(tail) + close)
            f.write(((lines if empty else ",\n" + lines) + "\n]\n").encode("utf-8"))
            f.truncate()


def record_run(
    run_id: str, messages: list[ModelMessage], stop_reason: str, deps: ChatDeps, question: str,
    products_on_page: int,
) -> None:
    """Turn one agent run into audit entries: one per tool call, then how it ended."""
    calls = {
        part.tool_call_id: part
        for m in messages if isinstance(m, ModelResponse)
        for part in m.parts if isinstance(part, ToolCallPart)
    }
    entries = []
    for m in messages:
        if not isinstance(m, ModelRequest):
            continue
        for part in m.parts:
            if isinstance(part, ToolReturnPart) and part.tool_name != OUTPUT_TOOL:
                call = calls.get(part.tool_call_id)
                args = call.args if call else None
                entries.append(AuditEntry(
                    time=part.timestamp.isoformat(timespec="seconds") if part.timestamp else _now(),
                    run_id=run_id,
                    event="tool_call",
                    tool=part.tool_name,
                    args=_clean(args if isinstance(args, str) else json.dumps(args or {}), 120),
                    result=_clean(_short_result(part.content), 160),
                ))
    responses = [m for m in messages if isinstance(m, ModelResponse)]
    entries.append(AuditEntry(
        time=_now(),
        run_id=run_id,
        event="run_end",
        stop_reason=stop_reason,
        model_finish_reason=getattr(responses[-1], "finish_reason", None) if responses else None,
        model_requests=len(responses),
        tool_calls=len(entries),
        products_on_page=products_on_page,
        shopper="customer" if deps.customer else "guest",
        page=_clean(deps.page.path, 80),
        question=_clean(question, 80),
    ))
    try:
        append_audit(entries)
    except (OSError, ValueError) as exc:  # the shopper still gets their answer
        log.error("Could not write audit trail: %s", type(exc).__name__)
