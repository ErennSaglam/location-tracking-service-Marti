#!/usr/bin/env bash
# Removes rows written by previous load runs so every run starts from the
# same database state. Only touches load-test users (users*/rate* prefixes);
# the k6-* areas are kept and reused.
set -euo pipefail

docker exec location-tracking-postgres psql -U location -d location_tracking -q -c "
  DELETE FROM area_entry_logs WHERE user_id ~ '^(users|rate)[0-9]';
  DELETE FROM user_location_states WHERE user_id ~ '^(users|rate)[0-9]';
" -c "VACUUM ANALYZE area_entry_logs, user_location_states;"
echo "load data reset"
