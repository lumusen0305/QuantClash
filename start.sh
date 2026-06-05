#!/usr/bin/env bash
#
# QuantClash 一鍵啟動腳本 / one-command launcher
#
#   ./start.sh            啟動 後端 API + Celery worker + 前端 (前景，Ctrl+C 全部關閉)
#   ./start.sh --no-infra 跳過 docker (Postgres/Redis 已自行啟動時用)
#   ./start.sh --no-worker 不啟動 Celery worker
#   ./start.sh --build     前端用 build + preview 而非 dev
#
set -uo pipefail

# ─── paths ──────────────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
WEB="$ROOT/web"
VENV="$BACKEND/.venv"
PY="$VENV/bin/python"
UVICORN="$VENV/bin/uvicorn"
CELERY="$VENV/bin/celery"
ALEMBIC="$VENV/bin/alembic"

API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"

# ─── flags ──────────────────────────────────────────────────────────────────
RUN_INFRA=1; RUN_WORKER=1; RUN_BEAT=1; WEB_MODE="dev"
for arg in "$@"; do
  case "$arg" in
    --no-infra)  RUN_INFRA=0 ;;
    --no-worker) RUN_WORKER=0 ;;
    --no-beat)   RUN_BEAT=0 ;;
    --build)     WEB_MODE="build" ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//' | head -12; exit 0 ;;
  esac
done

# ─── pretty output ──────────────────────────────────────────────────────────
c_grn=$'\033[32m'; c_yel=$'\033[33m'; c_red=$'\033[31m'; c_cyn=$'\033[36m'; c_rst=$'\033[0m'
say()  { printf '%s▶ %s%s\n' "$c_cyn" "$1" "$c_rst"; }
ok()   { printf '%s✓ %s%s\n' "$c_grn" "$1" "$c_rst"; }
warn() { printf '%s! %s%s\n' "$c_yel" "$1" "$c_rst"; }
die()  { printf '%s✗ %s%s\n' "$c_red" "$1" "$c_rst"; exit 1; }

PIDS=()
cleanup() {
  echo
  say "關閉中… / shutting down"
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null; done
  # also kill any child process groups
  for pid in "${PIDS[@]}"; do wait "$pid" 2>/dev/null; done
  ok "全部已停止 / all stopped"
}
trap cleanup INT TERM EXIT

# ─── 0. sanity ──────────────────────────────────────────────────────────────
[ -x "$UVICORN" ] || die "找不到 $UVICORN — 請先建立 venv: cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt"
command -v npm >/dev/null 2>&1 || die "找不到 npm — 請先安裝 Node.js"

# ─── 1. infra: Postgres + Redis ─────────────────────────────────────────────
redis_up() { (exec 3<>/dev/tcp/127.0.0.1/6379) 2>/dev/null && exec 3>&- ; }
pg_up()    { (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null && exec 3>&- ; }

# detect a working docker-compose invocation (v2 plugin / v1 binary / sudo)
compose_cmd() {
  if docker compose version >/dev/null 2>&1; then echo "docker compose"; return; fi
  if command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then echo "docker-compose"; return; fi
  if sudo -n docker compose version >/dev/null 2>&1; then echo "sudo docker compose"; return; fi
  echo ""
}

if [ "$RUN_INFRA" -eq 1 ]; then
  say "檢查 Postgres / Redis"
  if redis_up && pg_up; then
    ok "Postgres + Redis 已在執行 / already running"
  else
    COMPOSE="$(compose_cmd)"
    if [ -n "$COMPOSE" ]; then
      say "用 $COMPOSE 啟動 postgres + redis"
      ( cd "$BACKEND" && $COMPOSE up -d postgres redis ) \
        && ok "docker 服務已啟動" \
        || warn "$COMPOSE 啟動失敗，繼續嘗試連線"
      for i in $(seq 1 20); do redis_up && pg_up && break; sleep 1; done
    else
      warn "docker compose 不可用 (可能需要 sudo 或未安裝)"
      warn "本機替代啟動方式："
      warn "  Redis    : redis-server --daemonize yes"
      warn "  Postgres : 啟動你的 postgresql 服務 (systemctl/pg_ctl)，建立 DB 'stockapp'"
      warn "或先手動啟動後，改用 ./start.sh --no-infra"
    fi
  fi
  redis_up || warn "Redis (6379) 連不上 — 快取/Celery 可能失效"
  pg_up    || warn "Postgres (5432) 連不上 — 後端啟動會失敗"
else
  warn "略過 infra 檢查 (--no-infra)"
fi

# ─── 2. DB migrations ───────────────────────────────────────────────────────
if [ -x "$ALEMBIC" ] && pg_up; then
  say "套用資料庫 migration (alembic upgrade head)"
  ( cd "$BACKEND" && "$ALEMBIC" upgrade head ) \
    && ok "migration 完成" \
    || warn "alembic 失敗 — 若是首次請確認 DB 連線設定"
fi

# ─── 3. backend API ─────────────────────────────────────────────────────────
say "啟動後端 API  →  http://localhost:$API_PORT"
( cd "$BACKEND" && exec "$UVICORN" app.main:app --reload --host 0.0.0.0 --port "$API_PORT" ) &
PIDS+=($!)

# ─── 4. Celery worker ───────────────────────────────────────────────────────
if [ "$RUN_WORKER" -eq 1 ] && [ -x "$CELERY" ] && redis_up; then
  say "啟動 Celery worker (free_queue, premium_queue)"
  ( cd "$BACKEND" && exec "$CELERY" -A app.tasks.celery_app worker \
      -Q free_queue,premium_queue -c 2 --loglevel=info ) &
  PIDS+=($!)
else
  [ "$RUN_WORKER" -eq 1 ] && warn "略過 Celery worker (Redis 未連上或 --no-worker)"
fi

# ─── 4b. Celery Beat (auto-watch poller: news/anomaly → analysis → email) ─────
if [ "$RUN_BEAT" -eq 1 ] && [ -x "$CELERY" ] && redis_up; then
  say "啟動 Celery Beat (自動監控排程, 每10分鐘輪詢)"
  ( cd "$BACKEND" && exec "$CELERY" -A app.tasks.celery_app beat --loglevel=info ) &
  PIDS+=($!)
else
  [ "$RUN_BEAT" -eq 1 ] && warn "略過 Celery Beat (Redis 未連上或 --no-beat)"
fi

# ─── 5. frontend ────────────────────────────────────────────────────────────
if [ "$WEB_MODE" = "build" ]; then
  say "建置前端 (npm run build)…"
  ( cd "$WEB" && npm run build ) || die "前端 build 失敗"
  say "啟動前端 preview  →  http://localhost:$WEB_PORT"
  ( cd "$WEB" && exec npm run preview -- --port "$WEB_PORT" --host ) &
else
  say "啟動前端 dev server  →  http://localhost:$WEB_PORT"
  ( cd "$WEB" && exec npm run dev -- --port "$WEB_PORT" --host ) &
fi
PIDS+=($!)

# ─── ready ──────────────────────────────────────────────────────────────────
sleep 2
echo
ok "QuantClash 啟動完成 / up and running"
printf '   %sAPI%s      http://localhost:%s\n' "$c_grn" "$c_rst" "$API_PORT"
printf '   %sWeb%s      http://localhost:%s\n' "$c_grn" "$c_rst" "$WEB_PORT"
printf '   %sAPI docs%s http://localhost:%s/docs\n' "$c_grn" "$c_rst" "$API_PORT"
echo
say "按 Ctrl+C 一次即可關閉全部 / press Ctrl+C to stop everything"

# wait on all background jobs; if any dies, keep the rest until Ctrl+C
wait
