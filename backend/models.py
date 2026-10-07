"""Structured types for the Campus Customs chatbot."""

from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, Field


class Customer(BaseModel):
    """The logged-in shopper, as the agent sees them. No passwords, hashes, or tokens."""

    first_name: str
    last_name: str
    email: str


class PageContext(BaseModel):
    """Which page of the website the shopper is on, sent by the frontend.

    Only the path and a product_id: the backend looks up everything else
    (name, price, stock) in the database instead of trusting the browser.
    """

    path: str = Field(default="/", max_length=300)
    product_id: str | None = Field(default=None, max_length=120)


@dataclass
class ChatDeps:
    """Per-chat-message info shared by the agent and its tools (PydanticAI deps).

    customer is None for guests. search_result_ids collects what search_products
    found, so the backend can send the real results to the page instead of
    trusting the model to copy them.
    """

    customer: Customer | None = None
    page: PageContext = field(default_factory=PageContext)
    search_result_ids: list[str] = field(default_factory=list)


# ---------- What the database tools return to the agent ----------

LookupStatus = Literal["found", "ambiguous", "not_found", "size_not_found"]


class ProductSummary(BaseModel):
    """One catalogue product, straight from the database."""

    product_id: str
    name: str
    garment_type: str
    description: str
    price: float
    colors_in_design: list[str] = Field(
        description="Every color on this one design (garment + print), NOT separate color options."
    )
    total_stock: int = Field(description="Units in stock across all sizes.")


class ProductLookup(BaseModel):
    """Result of get_product_info: one product, a list of possible matches, or nothing."""

    status: LookupStatus
    message: str = Field(description="Plain-English summary of the result.")
    product: ProductSummary | None = None
    matches: list[ProductSummary] = Field(
        default_factory=list, description="Possible matches when the request was ambiguous."
    )


class SizeStock(BaseModel):
    """Stock for one size of one product."""

    size: str
    quantity: int
    in_stock: bool


class StockLookup(BaseModel):
    """Result of check_stock: stock for one product (all sizes, or the size asked about)."""

    status: LookupStatus
    message: str = Field(description="Plain-English summary of the result.")
    product_id: str | None = None
    product_name: str | None = None
    sizes: list[SizeStock] = Field(default_factory=list)
    total_stock: int | None = None
    matches: list[ProductSummary] = Field(
        default_factory=list, description="Possible matches when the request was ambiguous."
    )


class SearchResults(BaseModel):
    """Result of search_products."""

    query: str
    search_terms: list[str] = Field(
        default_factory=list,
        description="How the request was understood (synonyms, plurals, and typos fixed).",
    )
    total_matches: int = Field(description="How many catalogue products match the request.")
    message: str = Field(description="Plain-English summary of the result.")
    products: list[ProductSummary] = Field(
        default_factory=list, description="The best matches (up to 10) for you to talk about."
    )
    close_matches: list[ProductSummary] = Field(
        default_factory=list,
        description="When nothing matches every word: products matching some of them. NOT shown on the page.",
    )


class SimilarResults(BaseModel):
    """Result of find_similar_products."""

    status: Literal["found", "none", "ambiguous", "not_found", "need_product"]
    message: str = Field(description="Plain-English summary of the result.")
    based_on: ProductSummary | None = Field(default=None, description="The product we compared against.")
    products: list[ProductSummary] = Field(
        default_factory=list, description="Most similar products first (also shown on the page)."
    )
    matches: list[ProductSummary] = Field(
        default_factory=list, description="Possible products when the request was ambiguous."
    )


# ---------- Chat ----------

class ProductCard(BaseModel):
    """Everything the website needs to draw a product card. Always filled from the database."""

    product_id: str
    name: str
    garment_type: str
    price: float
    image_url: str = Field(description="URL of the catalogue image (image_file_path), served by /images.")
    description: str = Field(description="The catalogue description; cards show it shortened.")


class AgentReply(BaseModel):
    """What the PydanticAI agent must return (its structured output).

    The agent never writes product data itself: it only says whether to show
    its search results and which product ids it mentioned. The backend turns
    those into ProductCards from the database, so prices and images are always real.
    """

    reply: str = Field(description="The message to show the shopper, in plain text.")
    show_search_results: bool = Field(
        default=False,
        description="True only when the shopper asked to browse/see/find a type of product "
        "(search_products) or for similar products (find_similar_products) and the tool found "
        "matches. The website then shows all of them as product cards.",
    )
    results_title: str | None = Field(
        default=None,
        description='Short heading for the results shown on the page, e.g. "Navy hoodies".',
    )
    product_ids: list[str] = Field(
        default_factory=list,
        description="product_ids (from tool results) of specific products you talk about when "
        "NOT showing search results, max 6. Shown as small cards in the chat.",
    )


class ChatTurn(BaseModel):
    """One earlier message in the conversation, sent by the website."""

    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    """Body of POST /api/chat.

    history is only used for guests; for logged-in shoppers the backend reads
    their history from the database instead.
    """

    message: str = Field(min_length=1, max_length=1000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=50)
    page: PageContext = Field(default_factory=PageContext)


class ChatResponse(BaseModel):
    """What POST /api/chat sends back to the website."""

    reply: str
    products: list[ProductCard] = Field(
        default_factory=list,
        description="Search results to show on the page as product cards (empty if none).",
    )
    results_title: str | None = None
    mentioned_products: list[ProductCard] = Field(
        default_factory=list,
        description="Specific products the reply talks about, shown as small cards in the chat.",
    )


class ChatHistoryMessage(BaseModel):
    """One saved message, as GET /api/chat/history returns it."""

    role: Literal["user", "assistant"]
    content: str
    products: list[ProductCard] = Field(default_factory=list)
    results_title: str | None = None
    mentioned_products: list[ProductCard] = Field(default_factory=list)
    created_at: str


class ChatHistory(BaseModel):
    """Response of GET /api/chat/history: only the logged-in shopper's own messages."""

    messages: list[ChatHistoryMessage]


# ---------- Audit trail ----------

class AuditEntry(BaseModel):
    """One line of output/audit_trail.json. Short on purpose, and never holds
    passwords, hashes, API keys, tokens, or session cookies."""

    time: str = Field(description="When it happened (UTC, ISO 8601).")
    run_id: str = Field(description="Groups the entries of one chat message.")
    event: Literal["tool_call", "run_end"]
    tool: str | None = Field(default=None, description="Which tool the agent called.")
    args: str | None = Field(default=None, description="The tool arguments, shortened.")
    result: str | None = Field(default=None, description="What the tool returned, shortened.")
    stop_reason: str | None = Field(
        default=None, description="How the run ended: final_answer, usage_limit, or error: <type>."
    )
    model_finish_reason: str | None = None
    model_requests: int | None = None
    tool_calls: int | None = None
    products_on_page: int | None = None
    shopper: Literal["guest", "customer"] | None = None
    page: str | None = None
    question: str | None = Field(default=None, description="Start of the shopper's message, redacted.")
