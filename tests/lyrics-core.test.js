const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../lyrics-core.js");

test("normalizes decorated titles and multi-artist metadata", () => {
  assert.equal(core.normalizeTitle("Song Name (2024 Remastered)"), "song name");
  assert.deepEqual(core.splitArtists("Artist A feat. Artist B & Artist C"), [
    "artist a",
    "artist b",
    "artist c",
  ]);
});

test("prefers the correct synced candidate instead of blindly taking index zero", () => {
  const track = {
    title: "Đúng Cũng Thành Sai",
    artist: "Mỹ Tâm",
    album: "Tâm 9",
    duration: 290,
  };
  const candidates = [
    {
      trackName: "Đúng Cũng Thành Sai (Live)",
      artistName: "Mỹ Tâm",
      albumName: "Live Concert",
      duration: 330,
      plainLyrics: "plain",
    },
    {
      trackName: "Đúng Cũng Thành Sai",
      artistName: "Mỹ Tâm",
      albumName: "Tâm 9",
      duration: 291,
      syncedLyrics: "[00:29.84]Đúng cũng thành sai",
    },
  ];

  const result = core.selectBestCandidate(candidates, track);
  assert.equal(result.index, 1);
  assert.ok(result.score > 80);
});

test("parses offsets, comma decimals and multiple timestamps", () => {
  const parsed = core.parseLrc([
    "[ar:Artist]",
    "[offset:+500]",
    "[00:01,50][00:03.00]First line",
    "[00:05.25]Second line",
  ].join("\n"));

  assert.equal(parsed.synced, true);
  assert.deepEqual(parsed.lines, [
    { time: 2, text: "First line" },
    { time: 3.5, text: "First line" },
    { time: 5.75, text: "Second line" },
  ]);
});

test("builds estimated timestamps for plain lyrics", () => {
  const estimated = core.buildEstimatedLines("one\nsecond line\nthree", 180);
  assert.equal(estimated.length, 3);
  assert.equal(estimated[0].estimated, true);
  assert.ok(estimated[0].time >= 0);
  assert.ok(estimated[2].time < 180);
  assert.ok(estimated[1].time > estimated[0].time);
});

test("matches Spotify and Lively tracks conservatively", () => {
  assert.equal(core.tracksLikelyMatch(
    { title: "On & On", artist: "Cartoon", duration: 208 },
    { name: "On & On", artists: [{ name: "Cartoon" }], duration_ms: 209000 },
  ), true);

  assert.equal(core.tracksLikelyMatch(
    { title: "On & On", artist: "Cartoon", duration: 208 },
    { name: "Different Song", artists: [{ name: "Other" }], duration_ms: 209000 },
  ), false);
});
