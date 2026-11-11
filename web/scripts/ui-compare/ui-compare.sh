#!/usr/bin/env bash
set -eo pipefail

# ==============================================================================
# Pebblebase UI Compare Tool
# Compares rendered computed styles between two Git revisions or working tree
# across dual themes (light/dark) using a headless browser capture runner.
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
REPO_ROOT="$(cd "${WEB_DIR}/.." && pwd)"

usage() {
  echo "Usage: $0 <commit_a> <commit_b> [--states <filter>] [--themes light,dark] [--allow-unmatched] [--unmatched-threshold <n>] [--screenshot-diff-dir <dir>] [--strict-screenshots]"
  echo ""
  echo "Arguments:"
  echo "  commit_a    Git revision, branch, or 'working-tree' / '.'"
  echo "  commit_b    Git revision, branch, or 'working-tree' / '.'"
  echo ""
  echo "Options:"
  echo "  --states               Filter state group regex: 'all', 'general', 'import', 'row-modal', etc. (default: all)"
  echo "  --themes               Comma-separated themes: 'light,dark', 'light', or 'dark' (default: light,dark)"
  echo "  --allow-unmatched      Do not fail when unmatched elements exceed threshold"
  echo "  --unmatched-threshold  Maximum allowed remaining unmatched elements after fallback (default: 0)"
  echo "  --screenshot-diff-dir  Directory to write dialog screenshot before/after/diff crops"
  echo "  --strict-screenshots   Require byte-identical dialog screenshots only (disables anti-aliasing tolerance)"
  echo ""
  echo "Examples:"
  echo "  $0 main HEAD"
  echo "  $0 dec7546^ dec7546 --states row-modal"
  echo "  $0 main working-tree --themes dark"
  echo "  $0 main working-tree --states row-modal --allow-unmatched"
  echo "  $0 main main --states row-modal --strict-screenshots"
  exit 2
}

if [ $# -lt 2 ]; then
  usage
fi

COMMIT_A="$1"
COMMIT_B="$2"
shift 2

STATES="all"
THEMES="light,dark"
ALLOW_UNMATCHED=""
UNMATCHED_THRESHOLD=""
SCREENSHOT_DIFF_DIR=""
STRICT_SCREENSHOTS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --states)
      STATES="$2"
      shift 2
      ;;
    --themes)
      THEMES="$2"
      shift 2
      ;;
    --allow-unmatched)
      ALLOW_UNMATCHED="--allow-unmatched"
      shift 1
      ;;
    --unmatched-threshold)
      UNMATCHED_THRESHOLD="$2"
      shift 2
      ;;
    --screenshot-diff-dir)
      SCREENSHOT_DIFF_DIR="$2"
      shift 2
      ;;
    --strict-screenshots)
      STRICT_SCREENSHOTS="--strict-screenshots"
      shift 1
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Error: Unknown option '$1'"
      usage
      ;;
  esac
done

TIMESTAMP=$(date +%s)
TEMP_BASE="/tmp/pb_ui_cmp_${TIMESTAMP}_$$"
mkdir -p "$TEMP_BASE"

SERVER_PID_A=""
SERVER_PID_B=""
WORKTREE_A=""
WORKTREE_B=""

cleanup() {
  local exit_code=$?
  echo ""
  echo "==> Cleaning up temporary resources..."
  if [ -n "$SERVER_PID_A" ]; then
    kill -9 "$SERVER_PID_A" 2>/dev/null || true
  fi
  if [ -n "$SERVER_PID_B" ]; then
    kill -9 "$SERVER_PID_B" 2>/dev/null || true
  fi
  if [ -n "$WORKTREE_A" ] && [ -d "$WORKTREE_A" ]; then
    (cd "$REPO_ROOT" && git worktree remove --force "$WORKTREE_A" 2>/dev/null || true)
  fi
  if [ -n "$WORKTREE_B" ] && [ -d "$WORKTREE_B" ]; then
    (cd "$REPO_ROOT" && git worktree remove --force "$WORKTREE_B" 2>/dev/null || true)
  fi
  (cd "$REPO_ROOT" && git worktree prune 2>/dev/null || true)
  rm -rf "$TEMP_BASE"
  echo "==> Cleanup complete."
  exit $exit_code
}
trap cleanup EXIT INT TERM

get_free_port() {
  python3 -c 'import socket; s=socket.socket(); s.bind(("", 0)); print(s.getsockname()[1]); s.close()'
}

# 1. Prepare Seed Database with all schema types for RowModal testing
SEED_DB="${TEMP_BASE}/seed.db"
echo "==> Preparing test database at ${SEED_DB}..."
if [ -f "$REPO_ROOT/testdata/e2e_seed.db" ]; then
  cp "$REPO_ROOT/testdata/e2e_seed.db" "$SEED_DB"
else
  python3 "$REPO_ROOT/scripts/seed_e2e_db.py" "$SEED_DB"
fi

python3 -c "
import sqlite3
conn = sqlite3.connect('${SEED_DB}')
conn.execute('''
CREATE TABLE IF NOT EXISTS sample_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    age INTEGER,
    rating REAL,
    is_active BOOLEAN,
    metadata JSON,
    created_at DATETIME
)
''')
conn.execute('''
INSERT OR IGNORE INTO sample_records (id, title, age, rating, is_active, metadata, created_at)
VALUES (1, 'Sample Title', 25, 4.5, 1, '{\"status\": \"ok\", \"tags\": [\"test\"]}', '2026-01-01 12:00:00')
''')
conn.execute('''
CREATE TABLE IF NOT EXISTS fk_parent_stub (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE
)
''')
conn.execute('''
INSERT OR IGNORE INTO fk_parent_stub (id, code)
VALUES (1, 'PARENT_01')
''')
conn.execute('''
CREATE TABLE IF NOT EXISTS fk_long_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_account_user_reference_id INTEGER REFERENCES fk_parent_stub(id),
    primary_organization_billing_parent_account_reference_identifier INTEGER REFERENCES fk_parent_stub(id),
    secondary_contact_email TEXT REFERENCES fk_parent_stub(code)
)
''')
conn.execute('''
INSERT OR IGNORE INTO fk_long_labels (id, organization_account_user_reference_id, primary_organization_billing_parent_account_reference_identifier, secondary_contact_email)
VALUES (1, 1, 1, 'PARENT_01')
''')
conn.commit()
conn.close()
"

# Helper function to build server binary for a given target (commit or working-tree)
build_target() {
  local target="$1"
  local label="$2"
  local target_out_bin="$3"
  local target_dist_dir=""

  if [ "$target" = "working-tree" ] || [ "$target" = "." ]; then
    echo "==> Building frontend from current working tree ($label)..."
    (cd "$WEB_DIR" && yarn build)
    target_dist_dir="$WEB_DIR/dist"
  else
    local rev
    rev=$(cd "$REPO_ROOT" && git rev-parse --verify "${target}^{commit}" 2>/dev/null) || {
      echo "Error: target '${target}' is neither 'working-tree' nor a valid git commit."
      exit 2
    }
    local wt="${TEMP_BASE}/wt_${label}"
    if [ "$label" = "a" ]; then
      WORKTREE_A="$wt"
    else
      WORKTREE_B="$wt"
    fi
    echo "==> Creating worktree for ${target} (${rev:0:8}) at ${wt}..."
    (cd "$REPO_ROOT" && git worktree add --detach "$wt" "$rev")
    ln -s "$WEB_DIR/node_modules" "$wt/web/node_modules"

    echo "==> Building frontend for ${target}..."
    (cd "$wt/web" && yarn build)
    target_dist_dir="$wt/web/dist"
  fi

  echo "==> Compiling server binary embedding frontend (${label})..."
  local build_dir="${TEMP_BASE}/build_${label}"
  mkdir -p "$build_dir/web"
  cp -r "$REPO_ROOT/cmd" "$REPO_ROOT/internal" "$REPO_ROOT/embed.go" "$REPO_ROOT/go.mod" "$REPO_ROOT/go.sum" "$build_dir/"
  cp -r "$target_dist_dir" "$build_dir/web/dist"
  (cd "$build_dir" && go build -o "$target_out_bin" ./cmd/server)
}

# 2. Build Server Binaries
SERVER_BIN_A="${TEMP_BASE}/server_a"
SERVER_BIN_B="${TEMP_BASE}/server_b"

build_target "$COMMIT_A" "a" "$SERVER_BIN_A"
build_target "$COMMIT_B" "b" "$SERVER_BIN_B"

# 3. Capture Run A
PORT_A=$(get_free_port)
DATA_DIR_A="${TEMP_BASE}/data_a"
CAPTURE_DIR_A="${TEMP_BASE}/capture_a"
mkdir -p "$DATA_DIR_A" "$CAPTURE_DIR_A"

echo ""
echo "================================================================"
echo "RUNNING CAPTURE FOR COMMIT A: ${COMMIT_A} (Port: ${PORT_A})"
echo "================================================================"
PORT="$PORT_A" DATA_DIR="$DATA_DIR_A" PEBBLEBASE_JWT_SECRET="e2e-secret-key-32b-length-ok-ui-cmp" PEBBLEBASE_DISABLE_UPDATE_CHECK=true "$SERVER_BIN_A" > "${TEMP_BASE}/server_a.log" 2>&1 &
SERVER_PID_A=$!

node "$SCRIPT_DIR/capture-runner.cjs" \
  --url "http://127.0.0.1:${PORT_A}" \
  --out "$CAPTURE_DIR_A" \
  --db "$SEED_DB" \
  --states "$STATES" \
  --themes "$THEMES"

kill -9 "$SERVER_PID_A" 2>/dev/null || true
SERVER_PID_A=""

# 4. Capture Run B
PORT_B=$(get_free_port)
DATA_DIR_B="${TEMP_BASE}/data_b"
CAPTURE_DIR_B="${TEMP_BASE}/capture_b"
mkdir -p "$DATA_DIR_B" "$CAPTURE_DIR_B"

echo ""
echo "================================================================"
echo "RUNNING CAPTURE FOR COMMIT B: ${COMMIT_B} (Port: ${PORT_B})"
echo "================================================================"
PORT="$PORT_B" DATA_DIR="$DATA_DIR_B" PEBBLEBASE_JWT_SECRET="e2e-secret-key-32b-length-ok-ui-cmp" PEBBLEBASE_DISABLE_UPDATE_CHECK=true "$SERVER_BIN_B" > "${TEMP_BASE}/server_b.log" 2>&1 &
SERVER_PID_B=$!

node "$SCRIPT_DIR/capture-runner.cjs" \
  --url "http://127.0.0.1:${PORT_B}" \
  --out "$CAPTURE_DIR_B" \
  --db "$SEED_DB" \
  --states "$STATES" \
  --themes "$THEMES"

kill -9 "$SERVER_PID_B" 2>/dev/null || true
SERVER_PID_B=""

# 5. Diff Computed Styles
echo ""
echo "================================================================"
echo "DIFFING COMPUTED STYLES: ${COMMIT_A} vs ${COMMIT_B}"
echo "================================================================"

DIFF_ARGS=()
if [ -n "$ALLOW_UNMATCHED" ]; then
  DIFF_ARGS+=("$ALLOW_UNMATCHED")
fi
if [ -n "$UNMATCHED_THRESHOLD" ]; then
  DIFF_ARGS+=("--unmatched-threshold" "$UNMATCHED_THRESHOLD")
fi
if [ -z "$SCREENSHOT_DIFF_DIR" ]; then
  SCREENSHOT_DIFF_DIR="/tmp/pb_ui_cmp_dialog_diffs_${TIMESTAMP}_$$"
fi
DIFF_ARGS+=("--screenshot-diff-dir" "$SCREENSHOT_DIFF_DIR")
if [ -n "$STRICT_SCREENSHOTS" ]; then
  DIFF_ARGS+=("$STRICT_SCREENSHOTS")
fi

DIFF_STATUS=0
node "$SCRIPT_DIR/diff-styles.cjs" \
  "${CAPTURE_DIR_A}/computed_styles.json" \
  "${CAPTURE_DIR_B}/computed_styles.json" \
  "${DIFF_ARGS[@]}" || DIFF_STATUS=$?

if [ $DIFF_STATUS -eq 0 ]; then
  echo ""
  echo "================================================================"
  echo "PASS: Zero visual differences found between ${COMMIT_A} and ${COMMIT_B}."
  echo "================================================================"
  exit 0
else
  echo ""
  echo "================================================================"
  echo "FAIL: Visual differences detected between ${COMMIT_A} and ${COMMIT_B}!"
  echo "================================================================"
  exit 1
fi

