// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const RESULTS_URL  = 'data/results.json';
const BUILD_URL    = 'data/build.json';
const SETTINGS_URL = 'data/settings.json';
const STATE_KEY    = 'nm-benchmark-state-v1';
let BUILD = {};
let SETTINGS = {};
let ALL_RESULTS = [];
let histoRedraw = null;
let boxplotRedraw = null;
let pairRefresh = null;

