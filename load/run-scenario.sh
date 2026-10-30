#!/usr/bin/env bash
# Runs one k6 scenario against a running app, samples CPU/memory of the app,
# PostgreSQL and k6, then checks the entry logs in the database.
#
# Usage: load/run-scenario.sh <users|rate> <USERS> <DURATION> [RATE]
# Example: load/run-scenario.sh users 1000 1m
#          load/run-scenario.sh rate 10000 1m 2000
# The app port defaults to 3000; set PORT to match a changed .env value.
# Resource sampling uses macOS tools (top -l, netstat -p tcp).
set -euo pipefail

MODE=$1
USERS=$2
DURATION=$3
RATE=${4:-0}
PORT=${PORT:-3000}
RUN_ID="${MODE}${USERS}r${RATE}-$(date +%H%M%S)"
DB_CONTAINER=location-tracking-postgres
RESULTS=load/results
mkdir -p "$RESULTS"

# Matches both `npm run start:prod` (node dist/main) and `node dist/main.js`.
APP_PID=$(pgrep -f 'node.*dist/main' | head -1 || true)
if [[ -z "$APP_PID" ]]; then
  echo "App is not running. Start it with: npm run build && npm run start:prod" >&2
  exit 1
fi

# Resource sampler: one line every 2 s.
SAMPLES="$RESULTS/$RUN_ID.resources.csv"
echo "app_cpu,app_rss_mb,db_cpu,db_mem,k6_cpu,established,time_wait" > "$SAMPLES"
(
  while true; do
    K6_PID=$(pgrep -x k6 | head -1 || true)
    # `ps %cpu` is a long decaying average on macOS; top's 2nd sample is the last 1 s.
    cpu=$(top -l 2 -s 1 -pid "$APP_PID" ${K6_PID:+-pid "$K6_PID"} -stats pid,cpu |
      awk -v app="$APP_PID" '/^PID/ { blk++ } blk == 2 && $1 ~ /^[0-9]+$/ {
        if ($1 == app) a = $2; else k = $2 } END { printf "%s %s", a + 0, k + 0 }')
    rss=$(ps -o rss= -p "$APP_PID" | awk '{printf "%.0f", $1 / 1024}')
    db=$(docker stats --no-stream --format '{{.CPUPerc}},{{.MemUsage}}' "$DB_CONTAINER" | sed 's/%//; s| /.*||')
    # Server-side sockets on the app port. TIME_WAIT piles up on the side that closes.
    conns=$(netstat -an -p tcp | awk -v port="$PORT" '$4 ~ ("\\." port "$") {
      if ($6 == "ESTABLISHED") e++; else if ($6 == "TIME_WAIT") t++ }
      END { printf "%d,%d", e, t }')
    echo "${cpu% *},$rss,$db,${cpu#* },$conns" >> "$SAMPLES"
  done
) &
SAMPLER_PID=$!
trap 'kill $SAMPLER_PID 2>/dev/null || true' EXIT

k6 run --quiet \
  -e MODE="$MODE" -e USERS="$USERS" -e RATE="$RATE" \
  -e DURATION="$DURATION" -e RUN_ID="$RUN_ID" \
  -e BASE_URL="http://localhost:$PORT" \
  load/locations.js || true   # threshold failures are reported, not fatal

kill $SAMPLER_PID 2>/dev/null || true
wait $SAMPLER_PID 2>/dev/null || true

echo "--- resources (avg / max) ---"
awk -F, 'NR > 1 && $1 != "" {
  n++; for (i = 1; i <= 7; i++) { v = $i + 0; s[i] += v; if (v > m[i]) m[i] = v }
} END {
  printf "app cpu %%: %.0f / %.0f   app rss MB: %.0f / %.0f\n", s[1]/n, m[1], s[2]/n, m[2]
  printf "db  cpu %%: %.0f / %.0f\n", s[3]/n, m[3]
  printf "k6  cpu %%: %.0f / %.0f\n", s[5]/n, m[5]
  printf ":%s ESTABLISHED: %.0f / %.0f   TIME_WAIT: %.0f / %.0f\n", port, s[6]/n, m[6], s[7]/n, m[7]
}' port="$PORT" "$SAMPLES"
tail -1 "$SAMPLES" | awk -F, '{print "db mem (last sample): " $4}'
echo "(cpu % is per core: 100 = one full core; machine has $(sysctl -n hw.ncpu) cores)"

echo "--- entry log consistency ---"
DB_LOGS=$(docker exec "$DB_CONTAINER" psql -U location -d location_tracking -tAc \
  "SELECT count(*) FROM area_entry_logs WHERE user_id LIKE '${RUN_ID}-%'")
DB_DUPES=$(docker exec "$DB_CONTAINER" psql -U location -d location_tracking -tAc \
  "SELECT count(*) FROM (SELECT user_id, area_id, entry_time FROM area_entry_logs
   WHERE user_id LIKE '${RUN_ID}-%' GROUP BY 1, 2, 3 HAVING count(*) > 1) d")
REPORTED=$(jq .entriesReported "$RESULTS/$RUN_ID.json")
ENTRY_STEPS=$(jq .entryStepsProcessed "$RESULTS/$RUN_ID.json")
echo "logs in DB:                      $DB_LOGS"
echo "entries reported by API:         $REPORTED"
echo "expected (2 x entry steps):      $((ENTRY_STEPS * 2))"
echo "duplicate (user, area, time):    $DB_DUPES"
