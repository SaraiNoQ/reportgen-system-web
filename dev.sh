#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
CORE_API_URL="${CORE_API_URL:-http://${BACKEND_HOST}:${BACKEND_PORT}/api/v1}"
HEALTH_URL="http://${BACKEND_HOST}:${BACKEND_PORT}/api/v1/health"

INSTALL_MODE="prompt"
SEED_MODE="prompt"

PIDS=()
NAMES=()
CLEANUP_STARTED=0
PG_STARTED_BY_US=0

# ── colors ───────────────────────────────────────────────────

BOLD="$(tput bold 2>/dev/null || true)"
GREEN="$(tput setaf 2 2>/dev/null || true)"
YELLOW="$(tput setaf 3 2>/dev/null || true)"
RED="$(tput setaf 1 2>/dev/null || true)"
RESET="$(tput sgr0 2>/dev/null || true)"

# ── helpers ──────────────────────────────────────────────────

usage() {
  cat <<'EOF'
Usage: ./dev.sh [OPTIONS]

Start the Core API backend and Next.js frontend for local development.
Ensures PostgreSQL is running and database is seeded before starting.

Options:
  --install       Run dependency setup before starting services.
  --no-install    Skip dependency check; fail if deps are missing.
  --seed          Run database seed script before starting.
  --no-seed       Skip database seed check entirely.
  -h, --help      Show this help message.

Environment overrides:
  BACKEND_HOST=127.0.0.1     BACKEND_PORT=8000
  FRONTEND_HOST=127.0.0.1    FRONTEND_PORT=3000
  CORE_API_URL=http://127.0.0.1:8000/api/v1

Stop: Press Ctrl+C. The script will gracefully stop all services.
EOF
}

log()  { printf '%s%s[dev]%s %s\n' "$BOLD" "$GREEN" "$RESET" "$*"; }
warn() { printf '%s%s[dev]%s %s\n' "$BOLD" "$YELLOW" "$RESET" "$*" >&2; }
err()  { printf '%s%s[dev] ERROR:%s %s\n' "$BOLD" "$RED" "$RESET" "$*" >&2; }
die()  { err "$*"; exit 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing command: $1 — install it first."
}

# ── arg parsing ──────────────────────────────────────────────

while [ "$#" -gt 0 ]; do
  case "$1" in
    --install)    INSTALL_MODE="yes";;
    --no-install) INSTALL_MODE="no";;
    --seed)       SEED_MODE="yes";;
    --no-seed)    SEED_MODE="no";;
    -h|--help)    usage; exit 0;;
    *)            die "Unknown option: $1";;
  esac
  shift
done

# ── dependency setup ─────────────────────────────────────────

install_deps() {
  log "Installing backend dependencies (uv sync)..."
  (cd "$BACKEND_DIR" && uv sync)
  log "Installing frontend dependencies (pnpm install)..."
  (cd "$FRONTEND_DIR" && pnpm install)
}

ensure_deps() {
  local missing=()

  if [ ! -d "$BACKEND_DIR/.venv" ]; then
    missing+=("backend/.venv")
  fi
  if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    missing+=("frontend/node_modules")
  fi

  if [ "${#missing[@]}" -eq 0 ]; then
    return
  fi

  log "Missing local dependencies: ${missing[*]}"

  case "$INSTALL_MODE" in
    yes) install_deps;;
    no)  die "Run ./dev.sh --install once, or install dependencies manually.";;
    prompt)
      if [ ! -t 0 ]; then
        die "Run ./dev.sh --install once, or install dependencies manually."
      fi
      printf '[dev] Install missing dependencies now? [y/N] '
      read -r answer
      case "$answer" in
        y|Y|yes|YES) install_deps;;
        *) die "Dependency setup skipped.";;
      esac
      ;;
  esac
}

ensure_backend_env() {
  if [ ! -f "$BACKEND_DIR/.env" ] && [ -f "$BACKEND_DIR/.env.example" ]; then
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
    log "Created backend/.env from backend/.env.example"
  fi
}

# ── postgres management ──────────────────────────────────────

detect_storage_backend() {
  if [ -f "$BACKEND_DIR/.env" ]; then
    grep -q 'STORAGE_BACKEND=postgres' "$BACKEND_DIR/.env" 2>/dev/null \
      && echo "postgres" || echo "mock"
  else
    echo "mock"
  fi
}

pg_is_running() {
  if command -v pg_isready >/dev/null 2>&1; then
    pg_isready -q 2>/dev/null
  elif command -v psql >/dev/null 2>&1; then
    psql -c "SELECT 1" -d postgres >/dev/null 2>&1
  else
    return 1
  fi
}

ensure_postgres() {
  local backend_mode
  backend_mode="$(detect_storage_backend)"

  if [ "$backend_mode" != "postgres" ]; then
    log "STORAGE_BACKEND=mock — skipping PostgreSQL check."
    return 0
  fi

  if pg_is_running; then
    log "PostgreSQL is running."
    return 0
  fi

  # Try brew services
  if command -v brew >/dev/null 2>&1; then
    local pg_service
    pg_service="$(brew services list 2>/dev/null | grep 'postgresql@' | awk '{print $1}' | head -1 || true)"
    if [ -n "$pg_service" ]; then
      warn "PostgreSQL service ($pg_service) is installed but not running."
      printf '[dev] Start it now with brew services? [Y/n] '
      read -r answer
      case "$answer" in
        n|N|no|NO) ;;
        *)
          brew services start "$pg_service"
          sleep 2
          if pg_is_running; then
            PG_STARTED_BY_US=1
            log "PostgreSQL started."
            return 0
          fi
          ;;
      esac
    fi
  fi

  die "PostgreSQL is not running. Start it with:\n  brew services start postgresql@16\nOr switch to mock mode with STORAGE_BACKEND=mock in backend/.env"
}

stop_postgres() {
  if [ "$PG_STARTED_BY_US" -eq 1 ]; then
    local pg_service
    pg_service="$(brew services list 2>/dev/null | grep 'postgresql@' | awk '{print $1}' | head -1 || true)"
    if [ -n "$pg_service" ]; then
      log "Stopping PostgreSQL ($pg_service)..."
      brew services stop "$pg_service" 2>/dev/null || true
    fi
  fi
}

# ── seed check ───────────────────────────────────────────────

ensure_seeded() {
  local backend_mode
  backend_mode="$(detect_storage_backend)"

  if [ "$backend_mode" != "postgres" ]; then
    return 0
  fi

  if [ "$SEED_MODE" = "no" ]; then
    return 0
  fi

  # Check if projects table is empty
  local count
  count=$(cd "$BACKEND_DIR" && uv run python -c "
from app.core.config import settings
from sqlalchemy import create_engine, text
e = create_engine(settings.database_url)
with e.connect() as c:
    r = c.execute(text('SELECT count(*) FROM projects'))
    print(r.scalar())
" 2>/dev/null || echo "error")

  if [ "$count" = "error" ]; then
    warn "Could not check database state — skipping seed check."
    return 0
  fi

  if [ "$count" -gt 0 ]; then
    return 0
  fi

  warn "Database is empty (0 projects)."
  local do_seed="no"
  case "$SEED_MODE" in
    yes) do_seed="yes";;
    prompt)
      if [ -t 0 ]; then
        printf '[dev] Run seed script to populate database? [Y/n] '
        read -r answer
        case "$answer" in
          n|N|no|NO) ;;
          *) do_seed="yes";;
        esac
      fi
      ;;
  esac

  if [ "$do_seed" = "yes" ]; then
    log "Seeding database..."
    (cd "$BACKEND_DIR" && uv run python scripts/seed_from_json.py)
  fi
}

# ── health check ─────────────────────────────────────────────

wait_for_backend() {
  local max_attempts=30
  local attempt=1

  log "Waiting for backend health check..."
  while [ "$attempt" -le "$max_attempts" ]; do
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
      log "Backend is healthy."
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
  warn "Backend health check timed out after ${max_attempts}s — continuing anyway."
}

# ── process management ───────────────────────────────────────

terminate_tree() {
  local signal="$1"
  local pid="$2"

  # Kill children first
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    terminate_tree "$signal" "$child"
  done
  kill "-$signal" "$pid" 2>/dev/null || true
}

cleanup() {
  local exit_code=$?

  if [ "$CLEANUP_STARTED" -eq 1 ]; then
    return "$exit_code"
  fi
  CLEANUP_STARTED=1

  trap - EXIT INT TERM

  if [ "${#PIDS[@]}" -gt 0 ]; then
    log "Stopping services..."
    local pid
    for pid in "${PIDS[@]}"; do
      terminate_tree TERM "$pid"
    done

    # Give processes a moment to exit gracefully
    sleep 1

    # Force kill any survivors
    for pid in "${PIDS[@]}"; do
      terminate_tree KILL "$pid"
    done
  fi

  stop_postgres

  log "All services stopped."
  return "$exit_code"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

is_tracked_job_running() {
  local target="$1"
  local live
  for live in $(jobs -pr 2>/dev/null); do
    if [ "$live" = "$target" ]; then
      return 0
    fi
  done
  return 1
}

# ── service starters ─────────────────────────────────────────

start_backend() {
  log "Starting backend on http://${BACKEND_HOST}:${BACKEND_PORT}"
  (
    cd "$BACKEND_DIR"
    exec uv run uvicorn app.main:app --reload --host "$BACKEND_HOST" --port "$BACKEND_PORT"
  ) &
  PIDS+=("$!")
  NAMES+=("backend")
}

start_frontend() {
  log "Starting frontend on http://${FRONTEND_HOST}:${FRONTEND_PORT}"
  (
    cd "$FRONTEND_DIR"
    export CORE_API_URL="$CORE_API_URL"
    export NEXT_PUBLIC_CORE_API_URL="$CORE_API_URL"
    exec pnpm dev --hostname "$FRONTEND_HOST" --port "$FRONTEND_PORT"
  ) &
  PIDS+=("$!")
  NAMES+=("frontend")
}

# ── main ─────────────────────────────────────────────────────

require_command uv
require_command pnpm

ensure_deps
ensure_backend_env
ensure_postgres
ensure_seeded

backend_mode="$(detect_storage_backend)"
mode_display="$([ "$backend_mode" = "postgres" ] && echo "PostgreSQL" || echo "Mock JSON")"

echo ""
log "─────────────────────────────────────────────"
log "  Storage backend: ${mode_display}"
log "  Core API:        ${CORE_API_URL}"
log "  Frontend:        http://${FRONTEND_HOST}:${FRONTEND_PORT}"
log "─────────────────────────────────────────────"
echo ""

start_backend
wait_for_backend
start_frontend

log "Press Ctrl+C to stop all services."

while true; do
  sleep 2
  for i in "${!PIDS[@]}"; do
    if ! is_tracked_job_running "${PIDS[$i]}"; then
      wait "${PIDS[$i]}" || true
      die "${NAMES[$i]} exited unexpectedly. Other services have been stopped."
    fi
  done
done
