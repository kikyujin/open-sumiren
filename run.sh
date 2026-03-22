#!/bin/bash
# SUMIREn 起動スクリプト
# バックエンド (port 9300) + フロントエンド (port 5173)

cd "$(dirname "$0")"

cleanup() {
  echo "Stopping..."
  kill $BE_PID $FE_PID 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# バックエンド
echo "Starting backend (port 9300)..."
cd backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 9300 --reload &
BE_PID=$!
cd ..

# フロントエンド
echo "Starting frontend (port 5173)..."
cd frontend
npx vite --port 5173 &
FE_PID=$!
cd ..

echo ""
echo "🦊 SUMIREn running"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:9300"
echo "   Ctrl+C to stop"
echo ""

wait
