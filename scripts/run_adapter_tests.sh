#!/usr/bin/env bash
# ==============================================================================
# Pebblebase Database Adapters Integration Test Runner
#
# Spun up test containers via docker-compose.test.yml, waits for health checks,
# executes the adapter compliance and integration test suite, and tears down
# containers automatically.
#
# Usage:
#   ./scripts/run_adapter_tests.sh                  # Run all adapter tests
#   ./scripts/run_adapter_tests.sh --all            # Run all adapter tests
#   ./scripts/run_adapter_tests.sh --engine=postgres
#   ./scripts/run_adapter_tests.sh --engine=mysql
#   ./scripts/run_adapter_tests.sh --engine=mongodb
#   ./scripts/run_adapter_tests.sh --engine=redis
#   ./scripts/run_adapter_tests.sh --engine=clickhouse
#   ./scripts/run_adapter_tests.sh --engine=mssql
#   ./scripts/run_adapter_tests.sh --keep           # Don't tear down containers
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.test.yml"

TARGET_ENGINE="all"
KEEP_CONTAINERS=false

for arg in "$@"; do
  case $arg in
    --all)
      TARGET_ENGINE="all"
      ;;
    --engine=*)
      TARGET_ENGINE="${arg#*=}"
      ;;
    -e=*)
      TARGET_ENGINE="${arg#*=}"
      ;;
    --keep|--no-cleanup)
      KEEP_CONTAINERS=true
      ;;
    --help|-h)
      echo "Usage: $0 [--all] [--engine=<postgres|mysql|mongodb|redis|clickhouse|mssql>] [--keep]"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg"
      exit 1
      ;;
  esac
done

cleanup() {
  if [ "$KEEP_CONTAINERS" = true ]; then
    echo "==> Keeping test containers alive (--keep flag specified)."
    return
  fi
  echo "==> Cleaning up test containers..."
  docker compose -f "${COMPOSE_FILE}" down -v --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

wait_for_service() {
  local service="$1"
  local max_retries=60
  local count=0

  echo "==> Waiting for service '${service}' to be healthy..."
  while [ $count -lt $max_retries ]; do
    local status
    status=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "pebblebase-test-${service}" 2>/dev/null || echo "starting")
    if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
      if [ "$service" = "mysql" ]; then
        if docker compose -f "${COMPOSE_FILE}" exec -T mysql mysqladmin ping -h localhost -u pebble -ppebble >/dev/null 2>&1 && \
           docker compose -f "${COMPOSE_FILE}" exec -T mysql mysql -u pebble -ppebble -e "SELECT 1" pebble_test >/dev/null 2>&1; then
          echo "==> Service 'mysql' is ready and responsive."
          return 0
        fi
      else
        echo "==> Service '${service}' is ready (${status})."
        return 0
      fi
    fi
    sleep 2
    count=$((count + 1))
  done

  echo "ERROR: Service '${service}' failed to reach healthy state within timeout."
  docker compose -f "${COMPOSE_FILE}" logs "${service}" || true
  return 1
}

cd "${REPO_ROOT}"

echo "=========================================================="
echo " Starting Pebblebase Adapter Integration Suite (${TARGET_ENGINE})"
echo "=========================================================="

case "${TARGET_ENGINE}" in
  all)
    echo "==> Starting all 6 database containers..."
    docker compose -f "${COMPOSE_FILE}" up -d
    wait_for_service "postgres"
    wait_for_service "mysql"
    wait_for_service "mongodb"
    wait_for_service "redis"
    wait_for_service "clickhouse"
    wait_for_service "mssql"

    export PEBBLEBASE_TEST_DSN="postgres://pebble:pebble@localhost:54329/pebble_test?sslmode=disable"
    export PEBBLEBASE_TEST_MYSQL_DSN="pebble:pebble@tcp(localhost:33069)/pebble_test?parseTime=true"
    export TEST_MONGODB_URI="mongodb://pebble:pebble@localhost:27019/pebble_adapter_test?authSource=admin"
    export PEBBLEBASE_TEST_REDIS_DSN="redis://localhost:46379/0"
    export PEBBLEBASE_TEST_CLICKHOUSE_DSN="clickhouse://default:pebble@localhost:49000/default?dial_timeout=5s"
    export PEBBLEBASE_TEST_MSSQL_DSN="sqlserver://sa:PebblePass123!@localhost:41433?database=master&connection+timeout=5"

    echo "==> Executing full adapter test matrix..."
    go test -v -count=1 ./internal/adapter/...
    ;;

  postgres)
    docker compose -f "${COMPOSE_FILE}" up -d postgres
    wait_for_service "postgres"
    export PEBBLEBASE_TEST_DSN="postgres://pebble:pebble@localhost:54329/pebble_test?sslmode=disable"
    go test -v -count=1 ./internal/adapter/postgres ./internal/adapter -run "Test.*Postgres.*|TestAdapterCompliance.*"
    ;;

  mysql)
    docker compose -f "${COMPOSE_FILE}" up -d mysql
    wait_for_service "mysql"
    export PEBBLEBASE_TEST_MYSQL_DSN="pebble:pebble@tcp(localhost:33069)/pebble_test?parseTime=true"
    go test -v -count=1 ./internal/adapter/mysql ./internal/adapter -run "Test.*MySQL.*|TestAdapterCompliance.*"
    ;;

  mongodb)
    docker compose -f "${COMPOSE_FILE}" up -d mongodb
    wait_for_service "mongodb"
    export TEST_MONGODB_URI="mongodb://pebble:pebble@localhost:27019/pebble_adapter_test?authSource=admin"
    go test -v -count=1 ./internal/adapter/mongodb
    ;;

  redis)
    docker compose -f "${COMPOSE_FILE}" up -d redis
    wait_for_service "redis"
    export PEBBLEBASE_TEST_REDIS_DSN="redis://localhost:46379/0"
    go test -v -count=1 ./internal/adapter/redis
    ;;

  clickhouse)
    docker compose -f "${COMPOSE_FILE}" up -d clickhouse
    wait_for_service "clickhouse"
    export PEBBLEBASE_TEST_CLICKHOUSE_DSN="clickhouse://default:pebble@localhost:49000/default?dial_timeout=5s"
    go test -v -count=1 ./internal/adapter/clickhouse
    ;;

  mssql)
    docker compose -f "${COMPOSE_FILE}" up -d mssql
    wait_for_service "mssql"
    export PEBBLEBASE_TEST_MSSQL_DSN="sqlserver://sa:PebblePass123!@localhost:41433?database=master&connection+timeout=5"
    go test -v -count=1 ./internal/adapter/mssql ./internal/adapter -run "Test.*MSSQL.*|TestAdapterCompliance.*"
    ;;

  *)
    echo "ERROR: Unknown engine '${TARGET_ENGINE}'. Supported engines: postgres, mysql, mongodb, redis, clickhouse, mssql"
    exit 1
    ;;
esac

echo "=========================================================="
echo " Adapter Integration Suite PASSED successfully!"
echo "=========================================================="
