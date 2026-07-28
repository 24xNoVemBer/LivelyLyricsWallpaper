(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LyricsCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const VERSION_WORDS = /\b(remaster(?:ed)?|live|acoustic|karaoke|instrumental|official\s+(?:music\s+)?video|official\s+audio|lyrics?\s+video|radio\s+edit|extended\s+mix|mono|stereo)\b/i;

  function fold(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’‘`]/g, "'")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripDecorations(value) {
    return fold(value)
      .replace(/\s*[\[(][^\])]*(?:remaster(?:ed)?|live|acoustic|karaoke|instrumental|official|lyrics?|radio edit|extended|mono|stereo)[^\])]*[\])]\s*/gi, " ")
      .replace(/\s+-\s+(?:remaster(?:ed)?|live|acoustic|karaoke|instrumental|official.*|lyrics?.*|radio edit|extended.*)$/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeTitle(value) {
    return stripDecorations(value)
      .replace(/\s+(?:feat(?:uring)?|ft)\.?\s+.+$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function splitArtists(value) {
    return fold(value)
      .replace(/\b(?:feat(?:uring)?|ft)\.?(?=\s|$)/g, ",")
      .split(/\s*(?:,|;|&|\bx\b|\band\b)\s*/i)
      .map((artist) => artist.trim())
      .filter(Boolean);
  }

  function normalizeTrack(input) {
    const source = input || {};
    const artists = Array.isArray(source.artists)
      ? source.artists.map((artist) => typeof artist === "string" ? artist : artist && artist.name)
      : splitArtists(source.artist || source.Artist || source.AlbumArtist || "");
    const album = typeof source.album === "string"
      ? source.album
      : (source.album && source.album.name) || source.AlbumTitle || "";

    return {
      id: String(source.id || source.Id || ""),
      title: String(source.title || source.Title || source.name || ""),
      artist: String(source.artist || source.Artist || artists.filter(Boolean).join(", ") || ""),
      artists: artists.filter(Boolean),
      album: String(album),
      duration: Number(source.duration || source.durationSec || source.duration_ms / 1000 || 0) || 0,
      source: String(source.source || ""),
    };
  }

  function createTrackKey(input) {
    const track = normalizeTrack(input);
    return [
      normalizeTitle(track.title),
      splitArtists(track.artist).join("|"),
      fold(track.album),
    ].join("::");
  }

  function artistOverlap(left, right) {
    const a = new Set(splitArtists(left));
    const b = new Set(splitArtists(right));
    if (!a.size || !b.size) return 0;
    let matches = 0;
    for (const artist of a) {
      if (b.has(artist)) matches += 1;
    }
    return matches / Math.max(a.size, b.size);
  }

  function titleScore(candidateTitle, trackTitle) {
    const candidateFolded = fold(candidateTitle);
    const trackFolded = fold(trackTitle);
    const candidateNormalized = normalizeTitle(candidateTitle);
    const trackNormalized = normalizeTitle(trackTitle);

    if (!candidateFolded || !trackFolded) return 0;
    if (candidateFolded === trackFolded) return 55;
    if (candidateNormalized === trackNormalized) return 45;
    if (candidateNormalized.includes(trackNormalized) || trackNormalized.includes(candidateNormalized)) return 22;
    return 0;
  }

  function scoreCandidate(candidate, inputTrack) {
    const track = normalizeTrack(inputTrack);
    let score = titleScore(candidate.trackName, track.title);
    const overlap = artistOverlap(candidate.artistName, track.artist);
    score += overlap * 32;

    if (track.album && fold(candidate.albumName) === fold(track.album)) {
      score += 12;
    }

    const candidateDuration = Number(candidate.duration || 0);
    if (track.duration > 0 && candidateDuration > 0) {
      const delta = Math.abs(track.duration - candidateDuration);
      if (delta <= 2) score += 20;
      else if (delta <= 5) score += 12;
      else if (delta <= 10) score += 4;
      else if (delta >= 30) score -= 12;
    }

    if (candidate.syncedLyrics) score += 8;
    else if (candidate.plainLyrics) score += 2;
    if (candidate.instrumental) score -= 2;

    const candidateHasVersion = VERSION_WORDS.test(String(candidate.trackName || ""));
    const trackHasVersion = VERSION_WORDS.test(String(track.title || ""));
    if (candidateHasVersion !== trackHasVersion) score -= 6;

    return score;
  }

  function selectBestCandidate(candidates, inputTrack) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    const ranked = candidates
      .map((candidate, index) => ({
        candidate,
        index,
        score: scoreCandidate(candidate, inputTrack),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index);

    if (!ranked.length || ranked[0].score < 35) return null;
    return ranked[0];
  }

  function parseTimestamp(raw) {
    const parts = raw.replace(",", ".").split(":");
    if (parts.length !== 2) return null;
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return minutes * 60 + seconds;
  }

  function parseLrc(text) {
    const rawText = String(text || "").replace(/\r\n?/g, "\n");
    const rawLines = rawText.split("\n");
    let offsetSeconds = 0;

    for (const rawLine of rawLines) {
      const offsetMatch = rawLine.trim().match(/^\[offset:([+-]?\d+)\]$/i);
      if (offsetMatch) {
        offsetSeconds = Number(offsetMatch[1]) / 1000;
      }
    }

    const timedLines = [];
    const plainLines = [];
    const timestampPattern = /\[(\d{1,3}:\d{1,2}(?:[.,]\d{1,3})?)\]/g;

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      if (/^\[(?:ar|al|ti|au|by|length|re|ve|offset):.*\]$/i.test(trimmed)) continue;

      const timestamps = [];
      let match;
      while ((match = timestampPattern.exec(trimmed)) !== null) {
        const parsed = parseTimestamp(match[1]);
        if (parsed !== null) timestamps.push(Math.max(0, parsed + offsetSeconds));
      }
      timestampPattern.lastIndex = 0;

      const cleanText = trimmed.replace(timestampPattern, "").trim();
      timestampPattern.lastIndex = 0;
      if (!cleanText) continue;

      plainLines.push(cleanText);
      for (const time of timestamps) {
        timedLines.push({ time, text: cleanText });
      }
    }

    timedLines.sort((a, b) => a.time - b.time);
    return {
      synced: timedLines.length > 0,
      offsetSeconds,
      lines: timedLines,
      plainLines,
    };
  }

  function buildEstimatedLines(text, durationSeconds) {
    const parsed = parseLrc(text);
    const duration = Number(durationSeconds || 0);
    if (duration <= 0 || parsed.plainLines.length === 0) return [];

    const start = Math.min(8, duration * 0.05);
    const end = Math.max(start, duration * 0.92);
    const weights = parsed.plainLines.map((line) => Math.max(1, Math.sqrt(line.length)));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    let consumed = 0;

    return parsed.plainLines.map((line, index) => {
      const progress = totalWeight > 0 ? consumed / totalWeight : index / parsed.plainLines.length;
      const time = start + (end - start) * progress;
      consumed += weights[index];
      return { time, text: line, estimated: true };
    });
  }

  function tracksLikelyMatch(leftInput, rightInput) {
    const left = normalizeTrack(leftInput);
    const right = normalizeTrack(rightInput);
    if (left.id && right.id && left.id === right.id) return true;

    const title = titleScore(left.title, right.title);
    const overlap = artistOverlap(left.artist, right.artist);
    if (title < 22 || overlap === 0) return false;

    if (left.duration > 0 && right.duration > 0 && Math.abs(left.duration - right.duration) > 12) {
      return false;
    }
    return true;
  }

  return {
    fold,
    stripDecorations,
    normalizeTitle,
    splitArtists,
    normalizeTrack,
    createTrackKey,
    artistOverlap,
    scoreCandidate,
    selectBestCandidate,
    parseLrc,
    buildEstimatedLines,
    tracksLikelyMatch,
  };
});
