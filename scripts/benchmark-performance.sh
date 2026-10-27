#!/usr/bin/env bash
# ==============================================================================
# Pebblebase Performance Benchmark & Optimization Gate (Prompt 5.2)
#
# Targets:
# 1. Packaged desktop application size < 25 MB
# 2. Cold start latency to /health < 300 ms
# 3. Idle memory usage (RSS) < 30 MB
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BIN_DIR="${ROOT_DIR}/bin"
OUTPUT_BIN="${BIN_DIR}/pebblebase"

COLOR_GREEN="\033[0;32m"
COLOR_RED="\033[0;31m"
COLOR_YELLOW="\033[0;33m"
COLOR_BLUE="\033[0;34m"
COLOR_RESET="\033[0m"

echo -e "${COLOR_BLUE}======================================================${COLOR_RESET}"
echo -e "${COLOR_BLUE} Pebblebase Prompt 5.2 Performance Benchmarking Suite ${COLOR_RESET}"
echo -e "${COLOR_BLUE}======================================================${COLOR_RESET}"

# 1. Build Frontend Assets if not already present
if [ ! -f "${ROOT_DIR}/web/dist/index.html" ]; then
    echo -e "\n${COLOR_YELLOW}[1/4] Building optimized frontend assets...${COLOR_RESET}"
    (cd "${ROOT_DIR}/web" && yarn build)
else
    echo -e "\n${COLOR_GREEN}[1/4] Frontend assets present in web/dist.${COLOR_RESET}"
fi

# 2. Compile Go binary with stripping flags (-ldflags="-s -w")
echo -e "\n${COLOR_YELLOW}[2/4] Compiling Go server binary with -ldflags=\"-s -w\"...${COLOR_RESET}"
mkdir -p "${BIN_DIR}"
(cd "${ROOT_DIR}" && go build -ldflags="-s -w" -o "${OUTPUT_BIN}" ./cmd/server)

RAW_SIZE_BYTES=$(stat -c%s "${OUTPUT_BIN}" 2>/dev/null || stat -f%z "${OUTPUT_BIN}")
RAW_SIZE_MB=$(LC_ALL=C awk "BEGIN {printf \"%.2f\", ${RAW_SIZE_BYTES} / (1024 * 1024)}")
echo "  Raw uncompressed binary: ${RAW_SIZE_MB} MB"

# 3. Package and verify compressed package size (< 25 MB)
echo -e "\n${COLOR_YELLOW}[3/4] Packaging desktop application distributions...${COLOR_RESET}"
TAR_PACKAGE="${BIN_DIR}/pebblebase-linux-amd64.tar.gz"
ZIP_PACKAGE="${BIN_DIR}/pebblebase-linux-amd64.zip"

tar -czf "${TAR_PACKAGE}" -C "${BIN_DIR}" pebblebase
zip -q -j "${ZIP_PACKAGE}" "${OUTPUT_BIN}"

TAR_SIZE_BYTES=$(stat -c%s "${TAR_PACKAGE}" 2>/dev/null || stat -f%z "${TAR_PACKAGE}")
TAR_SIZE_MB=$(LC_ALL=C awk "BEGIN {printf \"%.2f\", ${TAR_SIZE_BYTES} / (1024 * 1024)}")

ZIP_SIZE_BYTES=$(stat -c%s "${ZIP_PACKAGE}" 2>/dev/null || stat -f%z "${ZIP_PACKAGE}")
ZIP_SIZE_MB=$(LC_ALL=C awk "BEGIN {printf \"%.2f\", ${ZIP_SIZE_BYTES} / (1024 * 1024)}")

echo "  Distribution Tarball (.tar.gz): ${TAR_SIZE_MB} MB"
echo "  Distribution Zip (.zip):        ${ZIP_SIZE_MB} MB"

PACKAGE_LIMIT_MB=25.0
PACKAGE_PASS=true
if [ "$(LC_ALL=C awk "BEGIN {print (${TAR_SIZE_MB} > ${PACKAGE_LIMIT_MB}) ? 1 : 0}")" -eq 1 ]; then
    echo -e "  ${COLOR_RED}FAILED: Package size (${TAR_SIZE_MB} MB) exceeds ${PACKAGE_LIMIT_MB} MB limit.${COLOR_RESET}"
    PACKAGE_PASS=false
else
    echo -e "  ${COLOR_GREEN}PASSED: Package size (${TAR_SIZE_MB} MB) is well under ${PACKAGE_LIMIT_MB} MB limit.${COLOR_RESET}"
fi

# 4. Measure Runtime Performance: Cold Start Latency and Idle RSS
echo -e "\n${COLOR_YELLOW}[4/4] Measuring cold start latency and idle memory RSS (5 iterations)...${COLOR_RESET}"

BENCHMARK_PORT=8199
TEMP_DATA_DIR=$(mktemp -d /tmp/pb-bench-data.XXXXXX)
trap 'rm -rf "${TEMP_DATA_DIR}" "${BIN_DIR}/pebblebase.tar.gz" "${BIN_DIR}/pebblebase.zip" "${TAR_PACKAGE}" "${ZIP_PACKAGE}"' EXIT

python3 - <<EOF
import subprocess
import time
import urllib.request
import os
import signal
import sys

ITERATIONS = 5
PORT = "${BENCHMARK_PORT}"
DATA_DIR = "${TEMP_DATA_DIR}"
BIN_PATH = "${OUTPUT_BIN}"

cold_starts = []
rss_readings = []

for i in range(1, ITERATIONS + 1):
    env = os.environ.copy()
    env["PORT"] = PORT
    env["DATA_DIR"] = DATA_DIR
    env["PEBBLEBASE_AUTH_ENABLED"] = "false"

    t0 = time.perf_counter()
    p = subprocess.Popen([BIN_PATH], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    started = False
    first_latency_ms = None
    url = f"http://127.0.0.1:{PORT}/health"

    for _ in range(300):
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=0.05) as resp:
                if resp.status == 200:
                    first_latency_ms = (time.perf_counter() - t0) * 1000.0
                    started = True
                    break
        except Exception:
            time.sleep(0.002)

    if not started or first_latency_ms is None:
        p.kill()
        print(f"Iteration {i}: Failed to connect to server", file=sys.stderr)
        sys.exit(1)

    cold_starts.append(first_latency_ms)

    # Let the process stabilize in idle state
    time.sleep(0.3)

    rss_mb = 0.0
    status_path = f"/proc/{p.pid}/status"
    if os.path.exists(status_path):
        with open(status_path, "r") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    parts = line.split()
                    if len(parts) >= 2:
                        rss_mb = float(parts[1]) / 1024.0
                    break
    rss_readings.append(rss_mb)

    # Terminate process cleanly
    try:
        os.kill(p.pid, signal.SIGTERM)
        p.wait(timeout=2)
    except Exception:
        p.kill()

    time.sleep(0.1)

avg_cold_start = sum(cold_starts) / len(cold_starts)
min_cold_start = min(cold_starts)
max_cold_start = max(cold_starts)

avg_rss = sum(rss_readings) / len(rss_readings)
min_rss = min(rss_readings)
max_rss = max(rss_readings)

print(f"  Cold Start Latencies: {[round(x, 2) for x in cold_starts]} ms")
print(f"  -> Min: {min_cold_start:.2f} ms | Avg: {avg_cold_start:.2f} ms | Max: {max_cold_start:.2f} ms")
print(f"  Idle RSS Readouts:    {[round(x, 2) for x in rss_readings]} MB")
print(f"  -> Min: {min_rss:.2f} MB | Avg: {avg_rss:.2f} MB | Max: {max_rss:.2f} MB")

COLD_START_LIMIT_MS = 300.0
RSS_LIMIT_MB = 30.0

cs_pass = avg_cold_start < COLD_START_LIMIT_MS
rss_pass = avg_rss < RSS_LIMIT_MB

with open("${TEMP_DATA_DIR}/results.env", "w") as rf:
    rf.write(f"AVG_COLD_START={avg_cold_start:.2f}\n")
    rf.write(f"AVG_RSS={avg_rss:.2f}\n")
    rf.write(f"CS_PASS={'true' if cs_pass else 'false'}\n")
    rf.write(f"RSS_PASS={'true' if rss_pass else 'false'}\n")
EOF

source "${TEMP_DATA_DIR}/results.env"

echo -e "\n${COLOR_BLUE}======================================================${COLOR_RESET}"
echo -e "${COLOR_BLUE}            Performance Gate Summary Results          ${COLOR_RESET}"
echo -e "${COLOR_BLUE}======================================================${COLOR_RESET}"
printf "%-32s | %-12s | %-12s | %-8s\n" "Metric" "Measured" "Target" "Status"
echo "----------------------------------------------------------------------"
printf "%-32s | %-12s | %-12s | " "Packaged App Size (.tar.gz)" "${TAR_SIZE_MB} MB" "< 25.00 MB"
if [ "${PACKAGE_PASS}" = "true" ]; then
    echo -e "${COLOR_GREEN}PASS${COLOR_RESET}"
else
    echo -e "${COLOR_RED}FAIL${COLOR_RESET}"
fi

printf "%-32s | %-12s | %-12s | " "Cold Start Latency (/health)" "${AVG_COLD_START} ms" "< 300.00 ms"
if [ "${CS_PASS}" = "true" ]; then
    echo -e "${COLOR_GREEN}PASS${COLOR_RESET}"
else
    echo -e "${COLOR_RED}FAIL${COLOR_RESET}"
fi

printf "%-32s | %-12s | %-12s | " "Idle Memory Usage (VmRSS)" "${AVG_RSS} MB" "< 30.00 MB"
if [ "${RSS_PASS}" = "true" ]; then
    echo -e "${COLOR_GREEN}PASS${COLOR_RESET}"
else
    echo -e "${COLOR_RED}FAIL${COLOR_RESET}"
fi
echo -e "${COLOR_BLUE}======================================================${COLOR_RESET}"

if [ "${PACKAGE_PASS}" = "true" ] && [ "${CS_PASS}" = "true" ] && [ "${RSS_PASS}" = "true" ]; then
    echo -e "${COLOR_GREEN} All Performance Gates Passed! Prompt 5.2 Criteria Met.${COLOR_RESET}\n"
    exit 0
else
    echo -e "${COLOR_RED} One or more performance criteria failed.${COLOR_RESET}\n"
    exit 1
fi
