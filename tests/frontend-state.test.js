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
    spotifyTrackMatched,
    playbackClock: { ...playbackClock }
  });
  globalThis.__setSpotifyConnected = (value) => { spotifyConnected = value; };
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
