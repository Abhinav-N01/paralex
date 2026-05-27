#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# ParaLex — Local Development Startup Script
# Usage: ./start-dev.sh
# ─────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🏛️  ParaLex — Starting Development Servers"
echo "──────────────────────────────────────────────────"

# ── Check .env ───────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/backend/.env" ]; then
  echo "❌ backend/.env not found."
  echo "   Run: cp backend/.env.example backend/.env"
  echo "   Then add your ANTHROPIC_API_KEY."
  exit 1
fi

# ── Check Tesseract ──────────────────────────────────────────
if ! command -v tesseract &> /dev/null; then
  echo "⚠️  Tesseract OCR not found. Install with:"
  echo "   macOS:  brew install tesseract"
  echo "   Ubuntu: sudo apt install tesseract-ocr"
  echo "   Continuing without OCR support..."
fi

# ── Backend ──────────────────────────────────────────────────
echo ""
echo "🐍 Starting Backend (FastAPI)..."
cd "$SCRIPT_DIR/backend"

if [ ! -d "venv" ]; then
  echo "   Creating virtual environment..."
  python3 -m venv venv
fi

source venv/bin/activate

# Install/update dependencies
pip install -q -r requirements.txt

echo "   Backend ready → http://localhost:8000"
echo "   API Docs      → http://localhost:8000/api/docs"

# Start backend in background
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

# ── Frontend ─────────────────────────────────────────────────
echo ""
echo "⚛️  Starting Frontend (Next.js)..."
cd "$SCRIPT_DIR/frontend"

if [ ! -d "node_modules" ]; then
  echo "   Installing npm packages..."
  npm install
fi

echo "   Frontend ready → http://localhost:3000"
npm run dev &
FRONTEND_PID=$!

# ── Cleanup on exit ──────────────────────────────────────────
trap "echo ''; echo '👋 Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

echo ""
echo "✅ Both servers running!"
echo "   App:      http://localhost:3000"
echo "   API Docs: http://localhost:8000/api/docs"
echo ""
echo "Press Ctrl+C to stop."
wait
