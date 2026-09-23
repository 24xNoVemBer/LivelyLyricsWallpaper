const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const LyricsCore = require("../lyrics-core.js");

function createRuntime(fetchImpl = async () => { throw new Error("network disabled in unit test"); }) {
  const intervals = new Set();
  const timeouts = new Set();
  const context = {
    console,
    LyricsCore,
    performance,
    AbortController,
    URL,
    URLSearchParams,
    TextEncoder,
    Uint8Array,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    fetch: fetchImpl,
    alert: () => {},
    requestAnimationFrame: () => 1,
    setInterval: () => { const id = {}; intervals.add(id); return id; },
    clearInterval: (id) => intervals.delete(id),
    setTimeout: () => { const id = {}; timeouts.add(id); return id; },
    clearTimeout: (id) => timeouts.delete(id),
    THREE: { Clock: class Clock {} },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    document: {
      hidden: false,
      getElementById: () => null,
      addEventListener: () => {},
    },
    window: {
      crypto: globalThis.crypto,
      addEventListener: () => {},
      open: () => {},
      innerWidth: 1920,
      innerHeight: 1080,
      devicePixelRatio: 1,
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  const source = fs.readFileSync(require.resolve("../script.js"), "utf8");
  vm.runInContext(source + `\n;globalThis.__state = () => ({
    currentTrackKey,
    currentTrackMeta,
    trackDuration,
    lyricsCandidateDuration,
    lyricsLines: lyricsLines.map((line) => ({ text: line.text, time: line.time })),
    currentLineIndex,
    spotifyTrackMatched,
    playbackClock: { ...playbackClock }
  });
  globalThis.__setSpotifyConnected = (value) => { spotifyConnected = value; };
  globalThis.__setTrackDuration = (value) => { trackDuration = value; };
  globalThis.__activatePropertyControls = () => { propertyCommandsReady = true; };
  globalThis.__syncSpotify = syncSpotifyPlaybackState;`, context);
  return context;
}

test("Lively null payload resets stale playback state", () => {
  const runtime = createRuntime();
  runtime.livelyCurrentTrack(JSON.stringify({ Title: "Song", Artist: "Artist" }));
  assert.notEqual(runtime.__state().currentTrackKey, "");

  runtime.livelyCurrentTrack("null");
  const state = runtime.__state();
  assert.equal(state.currentTrackKey, "");
  assert.equal(state.currentTrackMeta, null);
  assert.equal(state.playbackClock.isPlaying, false);
  assert.equal(state.trackDuration, 0);
  assert.equal(state.spotifyTrackMatched, false);
});

test("new Lively track resets duration and starts a local best-effort clock", () => {
  const runtime = createRuntime();
  runtime.livelyCurrentTrack(JSON.stringify({
    Title: "On & On",
    Artist: "Cartoon",
    AlbumTitle: "NCS: The Best of 2015",
  }));
  const state = runtime.__state();
  assert.match(state.currentTrackKey, /on & on/);
  assert.equal(state.currentTrackMeta.title, "On & On");
  assert.equal(state.trackDuration, 0);
  assert.equal(state.playbackClock.isPlaying, true);
  assert.equal(state.playbackClock.source, "lively");
});

test("Spotify state cannot pause or rebase an unrelated Lively track", async () => {
  const runtime = createRuntime(async (url) => {
    if (String(url).includes("/spotify-player")) {
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        json: async () => ({
          is_playing: false,
          progress_ms: 95000,
          item: {
            id: "spotify-other",
            name: "Different Song",
            artists: [{ name: "Different Artist" }],
            album: { name: "Different Album" },
            duration_ms: 200000,
          },
        }),
      };
    }
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => [] };
  });

  runtime.livelyCurrentTrack(JSON.stringify({ Title: "YouTube Song", Artist: "Video Artist" }));
  runtime.__setSpotifyConnected(true);
  await runtime.__syncSpotify();

  const state = runtime.__state();
  assert.equal(state.spotifyTrackMatched, false);
  assert.equal(state.playbackClock.isPlaying, true);
  assert.equal(state.playbackClock.source, "lively");
});

test("LRCLIB duration never caps the playback clock for an unrelated media player", async () => {
  const runtime = createRuntime(async (url) => String(url).includes("/lyrics?") ? { ok: false, status: 404 } : ({
    status: 200,
    ok: true,
    json: async () => [{
      trackName: "Long Mix",
      artistName: "Artist",
      duration: 120,
      plainLyrics: "First line\nSecond line",
    }],
  }));
  const elements = new Map();
  const createElement = () => ({
    style: {},
    dataset: {},
    classList: { add() {}, remove() {} },
    appendChild() {},
    addEventListener() {},
  });
  elements.set("lyrics", { innerHTML: "", appendChild() {} });
  elements.set("lyrics-status", { textContent: "", className: "", hidden: true });
  runtime.document.getElementById = (id) => elements.get(id) || null;
  runtime.document.createElement = createElement;

  runtime.livelyCurrentTrack(JSON.stringify({ Title: "Long Mix", Artist: "Artist" }));
  await runtime.fetchLyrics(runtime.__state().currentTrackMeta);

  const state = runtime.__state();
  assert.equal(state.lyricsCandidateDuration, 120);
  assert.equal(state.trackDuration, 0);
  assert.equal(state.playbackClock.source, "lively");
});

test("lyrics search retries by title when an over-specific query is empty", async () => {
  const searched = [];
  const runtime = createRuntime(async (url) => {
    if (String(url).includes("/lyrics?")) return { ok: false, status: 404 };
    searched.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => searched.length === 1 ? [] : [
        { trackName: "Together", artistName: "Wrong Artist", plainLyrics: "Wrong lyrics" },
        { trackName: "Together", artistName: "Singer A", plainLyrics: "Correct lyrics" },
      ],
    };
  });
  const elements = new Map();
  elements.set("lyrics", { innerHTML: "", appendChild() {} });
  elements.set("lyrics-status", { textContent: "", className: "", hidden: true });
  runtime.document.getElementById = (id) => elements.get(id) || null;
  runtime.document.createElement = () => ({
    style: {},
    dataset: {},
    classList: { add() {}, remove() {} },
    appendChild() {},
    addEventListener() {},
  });

  runtime.livelyCurrentTrack(JSON.stringify({ Title: "Together", Artist: "Singer A", AlbumTitle: "Album" }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(searched.length, 2);
  assert.match(searched[0], /artist_name=Singer\+A/);
  assert.doesNotMatch(searched[1], /artist_name/);
  assert.equal(runtime.__state().lyricsLines[0].text, "Correct lyrics");
});

test("user-imported local lyrics take priority over LRCLIB", async () => {
  const requested = [];
  const runtime = createRuntime(async (url) => {
    requested.push(String(url));
    if (String(url).includes("/lyrics?")) {
      return { ok: true, status: 200, json: async () => ({ lyrics: "[00:01.00]Local line", duration: 196 }) };
    }
    throw new Error("LRCLIB must not be called when local lyrics exist");
  });
  const elements = new Map();
  elements.set("lyrics", { innerHTML: "", appendChild() {} });
  elements.set("lyrics-status", { textContent: "", className: "", hidden: true });
  runtime.document.getElementById = (id) => elements.get(id) || null;
  runtime.document.createElement = () => ({
    style: {}, dataset: {}, classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {},
  });
  runtime.livelyCurrentTrack(JSON.stringify({ Title: "Yêu Rồi", Artist: "Tino" }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(requested.length, 1);
  assert.match(requested[0], /title=Y%C3%AAu\+R%E1%BB%93i/);
  assert.equal(runtime.__state().lyricsLines[0].text, "Local line");
  assert.equal(elements.get("lyrics-status").textContent, "Local synced lyrics");
});

test("plain lyrics estimate uses actual Spotify duration before provider duration", () => {
  const runtime = createRuntime();
  const elements = new Map();
  elements.set("lyrics", { innerHTML: "", appendChild() {} });
  elements.set("lyrics-status", { textContent: "", className: "", hidden: true });
  runtime.document.getElementById = (id) => elements.get(id) || null;
  runtime.document.createElement = () => ({
    style: {},
    dataset: {},
    classList: { add() {}, remove() {} },
    appendChild() {},
    addEventListener() {},
  });
  runtime.__setTrackDuration(240);
  runtime.renderAndSyncLyrics("First line\nSecond line\nThird line", { duration: 120 });

  assert.ok(runtime.__state().lyricsLines[2].time > 120);
});

test("Lively Customize media button works with wallpaper mouse input disabled", async () => {
  const requests = [];
  const runtime = createRuntime(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200 };
  });

  runtime.livelyPropertyListener("controlNext", "Next");
  assert.equal(requests.length, 0, "initial property sync must not skip a track");

  runtime.__activatePropertyControls();
  runtime.livelyPropertyListener("controlNext", "Next");
  await Promise.resolve();
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/media-command$/);
  assert.equal(JSON.parse(requests[0].options.body).action, "next");
});

test("manual timeline resync restarts a repeated non-Spotify track", () => {
  const runtime = createRuntime();
  runtime.livelyCurrentTrack(JSON.stringify({ Title: "Repeat", Artist: "Artist" }));
  runtime.__activatePropertyControls();
  runtime.livelyPropertyListener("controlResyncTimeline", "Restart lyrics timeline");

  const state = runtime.__state();
  assert.equal(state.playbackClock.positionAtSync, 0);
  assert.equal(state.playbackClock.isPlaying, true);
  assert.equal(state.currentLineIndex, -1);
});
