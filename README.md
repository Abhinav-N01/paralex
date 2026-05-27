<div align="center">

<img src="https://img.shields.io/badge/ParaLex-EB--5%20AI%20Paralegal-0a1628?style=for-the-badge&logo=scales&logoColor=f5a623" alt="ParaLex" />

# ⚖️ ParaLex
### AI Paralegal for EB-5 Investor Visa Filings

**ParaLex automates the paralegal work behind EB-5 petitions:**  
reading client documents → verifying legal source of funds → tracing the path of funds → flagging what's missing → drafting the Source of Funds memo.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-3776ab?logo=python&logoColor=white)](https://python.org)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![ChromaDB](https://img.shields.io/badge/Vector_DB-ChromaDB-orange)](https://trychroma.com)

[**🌐 Live Demo Page**](https://YOUR_GITHUB.github.io/paralex) · [**📖 Docs**](#getting-started) · [**🐛 Issues**](https://github.com/YOUR_GITHUB/paralex/issues)

</div>

---

## What is ParaLex?

When an attorney files an EB-5 investor visa petition, a paralegal has to:

1. **Read hundreds of pages** of bank statements, tax returns, wire transfers, passports, and business documents — often in multiple languages
2. **Verify the source of funds** is legal and documented (salary, business sale, inheritance, etc.)
3. **Trace the path of the money** from where it was earned all the way to the USCIS escrow account
4. **Check for missing documents** against the USCIS checklist — one missing W-2 can trigger an RFE delay
5. **Draft the Source of Funds memo** — a formal legal document with every fact cited to the supporting evidence

**ParaLex does all of this.** The attorney uploads the documents, ParaLex reads them, and the attorney reviews the output and files.

> ⚠️ ParaLex is a drafting and review tool. The attorney is always responsible for the final filing.

---

## Features

| | Feature | What it does |
|---|---|---|
| 📂 | **Multi-format document parsing** | PDF (digital), scanned images with OCR, DOCX, Excel/CSV |
| 🤖 | **Auto-classification** | Each document is classified automatically: passport, bank statement, W-2, wire transfer, etc. |
| 💬 | **Grounded Q&A chat** | Ask anything — answers come only from the uploaded documents, with exact citations |
| ❌ | **No hallucination** | If the answer isn't in the documents, ParaLex says so instead of inventing facts |
| 📋 | **USCIS gap analysis** | Compares your documents against the EB-5 checklist and shows what's missing |
| 📝 | **SOF memo drafting** | Auto-drafts the Source of Funds memorandum with inline `[Document, p.X]` citations |
| 🔒 | **Fully local** | All documents stay on your machine — no cloud storage |

---

## How It Works

```
1. Create a case (client name, investment amount, TEA or not)
         ↓
2. Upload documents (drag & drop — auto-classified, OCR'd, indexed)
         ↓
3. Run gap analysis (see what USCIS will need that you don't have yet)
         ↓
4. Ask questions (grounded chat — every answer cites a document + page)
         ↓
5. Draft the SOF memo (AI writes it, you review, export, file)
```

---

## Screenshots

<table>
<tr>
<td><strong>📁 Document Manager</strong><br/>Drag & drop, auto-classify, live OCR status</td>
<td><strong>💬 Grounded Q&A</strong><br/>Asks only from your docs, cites every fact</td>
</tr>
<tr>
<td><strong>📋 Gap Analysis</strong><br/>USCIS checklist vs. what you have</td>
<td><strong>📝 SOF Memo</strong><br/>Auto-drafted with inline citations</td>
</tr>
</table>

> See the [live demo page](https://YOUR_GITHUB.github.io/paralex) for interactive mockups.

---

## Document Types Supported

**Identity / Biographical**
- Passport (biographic page)
- Birth certificate
- Visa stamps / I-94 / entry records
- National ID / driver's license

**Financial — Income**
- Personal tax returns (Form 1040, foreign equivalents)
- W-2 wage statements
- Pay stubs / salary slips
- Tax payment receipts

**Financial — Assets & Accounts**
- Bank statements (all accounts, 12 months)
- Investment / brokerage account statements
- Stock portfolio statements
- 401(k) / IRA / retirement account statements

**Financial — Transfers**
- Wire transfer receipts (SWIFT / domestic)
- Gift letters + donor documentation
- Loan agreements / promissory notes

**Business**
- Articles of incorporation / business registration
- Business financial statements (P&L, balance sheet)
- Business sale/purchase agreements
- Proof of ownership percentage

**Prior Legal Work**
- Prior attorney memos
- USCIS correspondence

---

## Getting Started

### Prerequisites

| Tool | Version | Required? |
|---|---|---|
| Python | 3.11+ | ✅ Yes |
| Node.js | 20+ | ✅ Yes |
| [Anthropic API key](https://console.anthropic.com) | — | ✅ Yes |
| Tesseract OCR | any | For scanned docs |
| Docker | any | For Docker deploy |

### Option A — Local Development (recommended for first run)

```bash
# 1. Clone
git clone https://github.com/YOUR_GITHUB/paralex
cd paralex

# 2. Install Tesseract (skip if no scanned docs)
brew install tesseract        # macOS
# sudo apt install tesseract-ocr  # Ubuntu

# 3. Set your API key
cp backend/.env.example backend/.env
# Edit backend/.env — add ANTHROPIC_API_KEY=sk-ant-...

# 4. Start everything
./start-dev.sh
```

**App:** http://localhost:3000  
**API docs:** http://localhost:8000/api/docs

### Option B — Docker (for firm server / on-premise)

```bash
cp .env.example .env
# Edit .env — add ANTHROPIC_API_KEY=sk-ant-...

docker compose up --build -d
# → http://localhost:3000
```

All case data is stored in `./data/` on your host machine and persists across restarts.

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    Next.js Frontend                         │
│   Dashboard → Case → Documents / Chat / Analysis / Memos   │
└────────────────────┬───────────────────────────────────────┘
                     │ HTTP + Server-Sent Events (streaming)
┌────────────────────▼───────────────────────────────────────┐
│                   FastAPI Backend                            │
│   /cases   /documents   /chat   /analysis   /memos          │
├────────────────────────────────────────────────────────────┤
│                   Agents                                     │
│   ClassifierAgent  ·  GapAnalyzerAgent  ·  MemoDrafterAgent │
│   ChatAgent (grounded Q&A with anti-hallucination)          │
├────────────────────────────────────────────────────────────┤
│                   RAG Engine                                 │
│   Parsers: PDF + OCR  ·  DOCX  ·  Excel/CSV  ·  Images      │
│   Embeddings: BGE-small-en (runs locally — no API)          │
│   Vector Store: ChromaDB (persistent, per-case isolation)   │
├────────────────────────────────────────────────────────────┤
│                   Storage (all local)                        │
│   SQLite  ──  ChromaDB  ──  File system                     │
└────────────────────────────────────────────────────────────┘
```

### Anti-Hallucination Design

ParaLex uses 5 layers to prevent fabricated facts:

1. **Retrieval gate** — answers only come from the top-K most similar document chunks; if nothing is relevant, the answer is "not found"
2. **Similarity threshold** — chunks below 35% cosine similarity are discarded regardless
3. **Hard system prompt** — the AI model is explicitly instructed it cannot use knowledge outside the retrieved context
4. **Inline citations** — every factual claim must be attributed to `[Filename, p.X]`
5. **Per-case vector isolation** — each case has its own ChromaDB collection; no cross-contamination between clients

---

## API Reference (for integrations)

The FastAPI backend is fully documented at `/api/docs` (Swagger UI).

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/cases` | POST | Create a case |
| `/api/v1/cases/{id}/documents` | POST | Upload a document |
| `/api/v1/cases/{id}/chat` | POST | Ask a question (grounded) |
| `/api/v1/cases/{id}/chat/stream` | POST | Ask a question (streaming SSE) |
| `/api/v1/cases/{id}/analysis/gap-analysis` | POST | Run USCIS gap analysis |
| `/api/v1/cases/{id}/memos/source-of-funds` | POST | Draft SOF memo |
| `/api/v1/cases/{id}/memos/{id}/export/markdown` | GET | Download memo as .md |

---

## Tech Stack

| Layer | Technology |
|---|---|
| LLM | Claude Sonnet (Anthropic) |
| Embeddings | BGE-small-en-v1.5 (local, HuggingFace) |
| Vector database | ChromaDB (local, persistent) |
| OCR | Tesseract (open source) |
| PDF parsing | pdfplumber + PyMuPDF |
| Backend | Python 3.11 · FastAPI · SQLAlchemy · SQLite |
| Frontend | Next.js 15 · React 19 · Tailwind CSS |
| Deployment | Docker Compose |

---

## Privacy & Data Handling

- **Documents never leave your machine** unless you choose cloud deployment
- **Embeddings are local** — computed by BGE model running on your hardware, no external API call
- **The only external call** is to the Anthropic API (Claude) — document excerpts (~512 tokens each) are sent as part of prompts for analysis
- **Each case is isolated** — per-case ChromaDB collections prevent any cross-client data leakage
- **No telemetry** — ChromaDB anonymized telemetry is disabled in the config

---

## Roadmap

- [ ] Custom memo templates (attorney can provide their firm's template)
- [ ] DOCX export (Word format for direct use in filings)
- [ ] Multi-language OCR improvements (Chinese, Spanish, Portuguese)
- [ ] RFE response drafting
- [ ] Batch exhibit numbering
- [ ] Local LLM support (Ollama / llama.cpp for fully offline operation)

---

## Contributing

PRs welcome. Please open an issue first for anything beyond a small bug fix.

```bash
# Backend tests
cd backend && python -m pytest tests/

# Frontend
cd frontend && npm run lint
```

---

## License

MIT — see [LICENSE](LICENSE).

---

*ParaLex is not a law firm and does not provide legal advice. It is a software tool to assist licensed immigration attorneys with document review and drafting. All filings remain the responsibility of the attorney of record.*
