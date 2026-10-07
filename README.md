# Campus Customs — Homework 4

A customer website for Campus Customs, a local New Haven store selling Yale apparel and merchandise. It has a React + Vite + TypeScript frontend and a Python FastAPI backend, and the shopping chatbot is a PydanticAI agent. Shoppers can browse and filter the catalogue, open product pages, create an account and log in, save favorites, and chat with the assistant. It answers price and stock questions from the database, shows matching products on the page, recommends similar items, and remembers logged-in customers.

## What's in this repo

```
hw4/
├── AI_prompts.md          # the prompts used for each problem
├── requirements.txt       # Python dependencies for the backend
├── .env.example           # the environment variables to set (placeholders only)
├── .gitignore
├── README.md
├── frontend/              # Vite React TypeScript app
├── backend/
│   ├── main.py            # FastAPI app: run with uvicorn main:app --reload --port 8000
│   ├── agent.py           # PydanticAI agent setup, chat runs, audit trail
│   ├── models.py          # Pydantic / PydanticAI structured types
│   ├── tools.py           # database tools the agent can call
│   ├── prompts/prompt.md  # the system prompt
│   ├── auth.py            # create account / log in / log out
│   └── db.py              # database helpers (chat history, favorites)
└── output/
    ├── harness.md         # how the final system works (models, tools, safety, specs)
    ├── design.md          # Problem 10 design notes
    ├── usability.md       # Problem 9 improvements
    ├── app_check.html     # Problem 11 checks (open it in a browser)
    ├── app_check_images/  # screenshots used by app_check.html
    └── audit_trail.json   # append-only log of every chatbot run
```

The **data pack is not in git** (it's ignored by `.gitignore`). You need to add it yourself (step 2).

## Setup

You need Python 3.12+ (tested with 3.14), Node.js 20+ (tested with 24), and a Portkey API key.

### 1. Install the dependencies

From the `hw4/` folder:

```bash
python -m venv .venv
source .venv/Scripts/activate        # Windows (Git Bash). macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

Then the frontend:

```bash
cd frontend
npm install
cd ..
```

### 2. Add the local data pack

Unzip the course's `data.zip` so the database and images sit in a `data/` folder inside `hw4/`, next to `backend/` and `frontend/`:

```
hw4/
└── data/
    ├── campus_customs.db
    └── products/          # images referenced by the catalogue
```

The backend reads `data/campus_customs.db` and serves the photos from `data/products/`. On first start it also adds a small `favorites` table to the database.

### 3. Configure `.env`

Copy the example file and fill in your own values:

```bash
cp .env.example .env
```

| Variable | Required | What it's for |
|---|---|---|
| `PORTKEY_API_KEY` | yes | The chatbot's AI calls (OpenAI through Portkey) |
| `SESSION_SECRET` | yes | Signs login cookies. Make one with `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `CHAT_MODEL` | no | Model for the chatbot (default `gpt-5.6-luna`) |

`.env` is ignored by git. The backend looks for `.env` in `backend/` and every folder above it, so `hw4/.env` works.

### 4. Run the FastAPI backend (port 8000)

From the `backend/` folder, with the virtual environment activated:

```bash
cd backend
uvicorn main:app --reload --port 8000
```

Check it at http://localhost:8000/api/health, which should return `{"status":"ok"}`.

### 5. Run the React frontend (port 5174)

In a second terminal:

```bash
cd frontend
npm run dev
```

Open **http://localhost:5174**. Vite forwards `/api` and `/images` requests to the backend on port 8000, so both need to be running.

**Test account:** `test@campuscustoms.yale.edu` / `password` (from the seed database), or create your own on the Create account page.

## More details

- `output/harness.md`: the full description of the final system: database, agent, tools, models, safety rules, audit trail, limits, and configuration.
- `output/app_check.html`: open it in a browser to see the three live checks. Keep it next to `app_check_images/`.
