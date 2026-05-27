#!/usr/bin/env bash
# ParaLex — Local Development Startup
# Usage: ./start-dev.sh
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo ""
echo "⚖️  ParaLex — Starting local development servers"
echo "══════════════════════════════════════════════════"

# ── 1. Check .env ────────────────────────────────────────────
if [ ! -f "$BACKEND/.env" ]; then
  echo ""
  echo "❌  Missing: backend/.env"
  echo "    Run this first:"
  echo ""
  echo "    cp backend/.env.example backend/.env"
  echo "    # Then open backend/.env and paste your ANTHROPIC_API_KEY"
  echo ""
  exit 1
fi

if ! grep -q "ANTHROPIC_API_KEY=sk-" "$BACKEND/.env" 2>/dev/null; then
  echo ""
  echo "⚠️   backend/.env exists but ANTHROPIC_API_KEY looks empty."
  echo "    Edit backend/.env and set:  ANTHROPIC_API_KEY=sk-ant-..."
  echo ""
fi

# ── 2. Tesseract (optional — only needed for scanned docs) ────
if ! command -v tesseract &>/dev/null; then
  echo ""
  echo "⚠️   Tesseract OCR not found (optional — only needed for scanned images)"
  echo "    macOS:  brew install tesseract"
  echo "    Ubuntu: sudo apt install tesseract-ocr"
fi

# ── 3. Python venv + packages ────────────────────────────────
echo ""
echo "🐍  Setting up Python backend..."

cd "$BACKEND"

if [ ! -d "venv" ]; then
  echo "    Creating virtual environment..."
  python3 -m venv venv
fi

source venv/bin/activate

echo "    Installing / updating Python packages..."
pip install -q --upgrade pip
pip install -q -r requirements.txt
echo "    ✅ Python packages ready"

# ── 4. Node packages ─────────────────────────────────────────
echo ""
echo "⚛️   Setting up Next.js frontend..."

cd "$FRONTEND"

if [ ! -d "node_modules" ]; then
  echo "    Installing npm packages (first time — takes ~1 min)..."
  npm install --silent
else
  echo "    ✅ node_modules present"
fi

# ── 5. Start backend ─────────────────────────────────────────
echo ""
echo "🚀  Starting backend on http://localhost:8000 ..."
cd "$BACKEND"
source venv/bin/activate

uvicorn app.main:app --reload --port 8000 --log-level info 2>&1 | \
  grep -E "ParaLex|ERROR|WARNING|Uvicorn|error|Exception" &
BACKEND_PID=$!

sleep 3

if ! curl -s http://localhost:8000/api/health >/dev/null 2>&1; then
  echo "    ⚠️   Backend may still be loading — check output below."
fi

# ── 6. Start frontend ────────────────────────────────────────
echo "🌐  Starting frontend on http://localhost:3000 ..."
cd "$FRONTEND"

npm run dev 2>&1 | grep -v "^$" &
FRONTEND_PID=$!

# ── 7. Done ──────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════"
echo "✅  ParaLex is starting up!"
echo ""
echo "    App:      http://localhost:3000"
echo "    API docs: http://localhost:8000/api/docs"
echo ""
echo "    (Wait ~10 seconds for both servers to be ready)"
echo "    Press Ctrl+C to stop."
echo "══════════════════════════════════════════════════"
echo ""

trap "echo ''; echo '👋 Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
