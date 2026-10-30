// k6 load test for POST /locations.
//
// MODE=users  N virtual users, each sends a location every 5 s (realistic traffic).
// MODE=rate   fixed arrival rate (RATE req/s) spread over USERS distinct users.
//
// Each user loops over 4 steps: outside -> enters a grid cell (inside the City
// area, so 2 entry logs) -> stays in the cell -> outside. The script counts the
// entries the API reports so they can be checked against the database.
import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const RUN_ID = __ENV.RUN_ID || `run${Date.now()}`;
const MODE = __ENV.MODE || 'users';
const USERS = Number(__ENV.USERS || 1000);
const RATE = Number(__ENV.RATE || 2000);
const DURATION = __ENV.DURATION || '1m';
const INTERVAL_S = 5;

// 10 x 10 grid of 0.01° cells starting at lon 32.80 / lat 39.90 (Ankara), all
// inside "City". Kept away from the README examples (Istanbul) so example areas
// created by hand never overlap the grid and skew the expected log count.
const GRID = { lon: 32.8, lat: 39.9, cell: 0.01, size: 10 };
const OUTSIDE = { longitude: 32.6, latitude: 39.7 };

const entriesReported = new Counter('entries_reported');
const entryStepsProcessed = new Counter('entry_steps_processed');
const processed = new Counter('status_processed');
const staleIgnored = new Counter('status_stale_ignored');
const duplicateIgnored = new Counter('status_duplicate_ignored');
// Requests that had to open a new TCP connection (no keep-alive reuse).
const newConnections = new Counter('new_connections');

const scenarios = {
  users: {
    executor: 'constant-vus',
    vus: USERS,
    duration: DURATION,
    gracefulStop: '10s',
  },
  rate: {
    executor: 'constant-arrival-rate',
    rate: RATE,
    timeUnit: '1s',
    duration: DURATION,
    preAllocatedVUs: Math.min(RATE, 1000),
    maxVUs: Math.max(RATE * 2, 2000),
    gracefulStop: '10s',
  },
};

export const options = {
  scenarios: { [MODE]: scenarios[MODE] },
  // Tagged sub-metrics exclude the setup() requests that create the areas.
  thresholds: {
    'http_req_failed{name:POST /locations}': ['rate<0.01'],
    'http_req_duration{name:POST /locations}': ['p(95)<500'],
    'http_reqs{name:POST /locations}': ['count>0'],
    // Breakdown to tell server time (waiting) from connection setup.
    'http_req_waiting{name:POST /locations}': ['p(95)>=0'],
    'http_req_connecting{name:POST /locations}': ['p(95)>=0'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const square = (lon, lat, size) => ({
  type: 'Polygon',
  coordinates: [
    [
      [lon, lat],
      [lon + size, lat],
      [lon + size, lat + size],
      [lon, lat + size],
      [lon, lat],
    ],
  ],
});

// Creates the areas once; 409 means a previous run already created them.
export function setup() {
  const areas = [
    {
      name: 'k6-City',
      polygon: square(GRID.lon - 0.01, GRID.lat - 0.01, GRID.cell * GRID.size + 0.02),
    },
  ];
  for (let i = 0; i < GRID.size; i++) {
    for (let j = 0; j < GRID.size; j++) {
      areas.push({
        name: `k6-cell-${i}-${j}`,
        polygon: square(GRID.lon + i * GRID.cell, GRID.lat + j * GRID.cell, GRID.cell),
      });
    }
  }
  for (const area of areas) {
    const res = http.post(`${BASE_URL}/areas`, JSON.stringify(area), {
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.status !== 201 && res.status !== 409) {
      exec.test.abort(`Area setup failed: ${res.status} ${res.body}`);
    }
  }
}

function pointFor(user, step) {
  const phase = step % 4;
  if (phase === 0 || phase === 3) return OUTSIDE;
  const cell = user % (GRID.size * GRID.size);
  const i = Math.floor(cell / GRID.size);
  const j = cell % GRID.size;
  // Phase 2 moves slightly but stays in the same cell.
  const offset = phase === 1 ? 0.005 : 0.006;
  return {
    longitude: GRID.lon + i * GRID.cell + offset,
    latitude: GRID.lat + j * GRID.cell + offset,
  };
}

function sendLocation(user, step) {
  const body = JSON.stringify({
    userId: `${RUN_ID}-u${user}`,
    ...pointFor(user, step),
    timestamp: new Date().toISOString(),
  });
  const res = http.post(`${BASE_URL}/locations`, body, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /locations' },
  });
  if (res.timings.connecting > 0) newConnections.add(1);
  check(res, { 'status is 200': (r) => r.status === 200 });
  if (res.status !== 200) {
    // Sampled so a failure storm does not flood the output.
    if (Math.random() < 0.002) {
      console.warn(
        `non-200: status=${res.status} error_code=${res.error_code} error="${res.error}" t=${new Date().toISOString()} body=${String(res.body).slice(0, 120)}`,
      );
    }
    return;
  }

  const result = res.json();
  entriesReported.add(result.enteredAreaIds.length);
  if (result.status === 'processed') {
    processed.add(1);
    if (step % 4 === 1) entryStepsProcessed.add(1);
  } else if (result.status === 'stale_ignored') {
    staleIgnored.add(1);
  } else if (result.status === 'duplicate_ignored') {
    duplicateIgnored.add(1);
  }
}

export default function () {
  if (MODE === 'rate') {
    const n = exec.scenario.iterationInTest;
    sendLocation(n % USERS, Math.floor(n / USERS));
    return;
  }
  // Spread the first request over the interval so users are not in lockstep.
  if (exec.vu.iterationInScenario === 0) sleep(Math.random() * INTERVAL_S);
  sendLocation(exec.vu.idInTest, exec.vu.iterationInScenario);
  sleep(INTERVAL_S);
}

export function handleSummary(data) {
  const m = data.metrics;
  const d = m['http_req_duration{name:POST /locations}'].values;
  const reqs = m['http_reqs{name:POST /locations}'].values;
  const value = (name) => m[name]?.values.count ?? 0;
  const report = {
    runId: RUN_ID,
    mode: MODE,
    users: USERS,
    targetRate: MODE === 'rate' ? RATE : USERS / INTERVAL_S,
    durationMs: data.state.testRunDurationMs,
    requests: reqs.count,
    rps: reqs.rate,
    failedRate: m['http_req_failed{name:POST /locations}'].values.rate,
    latencyMs: { p50: d.med, p95: d['p(95)'], p99: d['p(99)'], max: d.max },
    waitingP95Ms: m['http_req_waiting{name:POST /locations}'].values['p(95)'],
    connectingP95Ms: m['http_req_connecting{name:POST /locations}'].values['p(95)'],
    connectingMaxMs: m['http_req_connecting{name:POST /locations}'].values.max,
    newConnections: value('new_connections'),
    connectionReuseRate: 1 - value('new_connections') / reqs.count,
    processed: value('status_processed'),
    staleIgnored: value('status_stale_ignored'),
    duplicateIgnored: value('status_duplicate_ignored'),
    entriesReported: value('entries_reported'),
    entryStepsProcessed: value('entry_steps_processed'),
    droppedIterations: value('dropped_iterations'),
  };
  return {
    stdout: `${JSON.stringify(report, null, 2)}\n`,
    [`load/results/${RUN_ID}.json`]: JSON.stringify(report, null, 2),
  };
}
