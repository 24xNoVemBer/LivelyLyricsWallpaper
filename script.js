let currentTrackKey = "";
let lyricsLines = [];
let scrollInterval = null;
let timerInterval = null;
let fetchController = null;
let currentLineIndex = -1;
let trackDuration = 0;
let spotifySyncInterval = null;
let currentTrackMeta = null;
let trackVersion = 0;
let transitionTimer = null;
let lyricsCandidateDuration = 0;
let spotifyConnected = false;
let spotifyTrackMatched = false;
let spotifySyncActive = false;
let spotifyNextPollMs = 5000;
let spotifyFailureCount = 0;
let lyricsRequestSequence = 0;
let playbackClock = {
  positionAtSync: 0,
  syncedAt: performance.now(),
  isPlaying: false,
  source: "idle"
};


// WebGL Background Variables
let scene, camera, renderer, material;
let clock = new THREE.Clock();
let currentTextureSrc = null;
let textureQueue = Promise.resolve();
let isTexture0 = false;

// Customization Settings (Matched with LivelyProperties.json)
let settings = {
  scale: 1,
  fps: 60,
  parallaxVal: 1,
  blur: 0,
  brightness: 1.0
};

// Helper to update background blur and brightness filters combined
function updateBgFilter() {
  const container = document.getElementById("bg");
  if (container) {
    container.style.filter = `blur(${settings.blur}px) brightness(${settings.brightness})`;
  }
}

// Helper to set play/pause icon state explicitly
function setPlayPauseIcon(isPlaying) {
  const svgPlay = document.getElementById("svg-play");
  const svgPause = document.getElementById("svg-pause");
  if (!svgPlay || !svgPause) return;
  
  if (isPlaying) {
    svgPlay.classList.add("hidden");
    svgPause.classList.remove("hidden");
  } else {
    svgPlay.classList.remove("hidden");
    svgPause.classList.add("hidden");
  }
}

// Helper to safely set text content
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "";
}

// Format seconds into mm:ss format
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Start visual timer tick
function getPlaybackPosition() {
  if (!playbackClock.isPlaying) return playbackClock.positionAtSync;
  const delta = Math.max(0, (performance.now() - playbackClock.syncedAt) / 1000);
  const position = playbackClock.positionAtSync + delta;
  return trackDuration > 0 ? Math.min(position, trackDuration) : position;
}

function setPlaybackPosition(seconds, isPlaying = playbackClock.isPlaying, source = playbackClock.source) {
  const safePosition = Math.max(0, Number(seconds) || 0);
  playbackClock = {
    positionAtSync: safePosition,
    syncedAt: performance.now(),
    isPlaying: Boolean(isPlaying),
    source
  };

}

function setPlaybackPlaying(isPlaying, source = playbackClock.source) {
  setPlaybackPosition(getPlaybackPosition(), isPlaying, source);
}

function resetPlaybackClock() {
  setPlaybackPosition(0, false, "idle");
}

function setLyricsStatus(label = "", type = "") {
  const statusEl = document.getElementById("lyrics-status");
  if (!statusEl) return;
  statusEl.textContent = label;
  statusEl.className = `lyrics-status${type ? ` ${type}` : ""}`;
  statusEl.hidden = !label;
}

function clearPendingTrackWork() {
  if (fetchController) {
    fetchController.abort();
    fetchController = null;
  }
  if (transitionTimer) {
    clearTimeout(transitionTimer);
    transitionTimer = null;
  }
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
  const reloadButton = document.getElementById("btn-reload-lyrics");
  if (reloadButton) reloadButton.classList.remove("spinning");
}

function resetTrackState() {
  trackVersion += 1;
  clearPendingTrackWork();
  stopTimer();
  resetPlaybackClock();
  currentTrackKey = "";
  currentTrackMeta = null;
  spotifyTrackMatched = false;
  lyricsCandidateDuration = 0;
  lyricsLines = [];
  currentLineIndex = -1;
  spotifyNextPollMs = 15000;
  setText("title", "No music playing");
  setText("artist", "Play something on Spotify or your PC");
  setCover("");
  setPlayPauseIcon(false);
  setLyricsStatus("");
  const lyricsEl = document.getElementById("lyrics");
  if (lyricsEl) {
    lyricsEl.innerHTML = "<div class='lyric-line active' style='text-align: center;'>Waiting for playback details...</div>";
  }
}
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  const timeEl = document.getElementById("time-display");
  const timeCurrentEl = document.getElementById("time-current");
  const timeTotalEl = document.getElementById("time-total");
  const progressSlider = document.getElementById("progress-slider");
  
  if (timeEl) timeEl.textContent = "00:00";
  if (timeCurrentEl) timeCurrentEl.textContent = "00:00";
  if (timeTotalEl) timeTotalEl.textContent = "00:00";
  if (progressSlider) progressSlider.value = 0;
  
  timerInterval = setInterval(() => {
    if (!currentTrackMeta) return;
    const elapsed = getPlaybackPosition();
    const formattedCurrent = formatTime(elapsed);
    
    if (timeEl) timeEl.textContent = formattedCurrent;
    if (timeCurrentEl) timeCurrentEl.textContent = formattedCurrent;
    
    if (timeTotalEl && trackDuration > 0) {
      timeTotalEl.textContent = formatTime(trackDuration);
    }
    
    if (progressSlider && trackDuration > 0 && !window.isDraggingSlider) {
      const percentage = Math.min((elapsed / trackDuration) * 100, 100);
      progressSlider.value = percentage;
    }
  }, 250);
}

// Stop visual timer tick
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const timeEl = document.getElementById("time-display");
  const timeCurrentEl = document.getElementById("time-current");
  const timeTotalEl = document.getElementById("time-total");
  const progressSlider = document.getElementById("progress-slider");
  
  if (timeEl) timeEl.textContent = "00:00";
  if (timeCurrentEl) timeCurrentEl.textContent = "00:00";
  if (timeTotalEl) timeTotalEl.textContent = "00:00";
  if (progressSlider) progressSlider.value = 0;
  trackDuration = 0;
}

// Normalize Windows local paths and raw base64 data for Chrome/CEF security policy
function getSafeSrc(src) {
  if (!src) return "";
  
  if (src.startsWith("data:") || src.startsWith("http:") || src.startsWith("https:") || src.startsWith("file:")) {
    return src;
  }
  
  const cleanSrc = src.trim();
  
  // Detect raw base64 images by checking standard headers and prepend mime-types
  if (cleanSrc.startsWith("iVBOR")) {
    return "data:image/png;base64," + cleanSrc;
  }
  if (cleanSrc.startsWith("/9j/")) {
    return "data:image/jpeg;base64," + cleanSrc;
  }
  if (cleanSrc.startsWith("R0lGO")) {
    return "data:image/gif;base64," + cleanSrc;
  }
  if (cleanSrc.startsWith("UklGR")) {
    return "data:image/webp;base64," + cleanSrc;
  }
  
  // Normalize Windows absolute file paths
  let safeSrc = cleanSrc.replace(/\\/g, '/');
  if (/^[a-zA-Z]:\//.test(safeSrc)) {
    return "file:///" + safeSrc;
  }
  
  return safeSrc;
}

// Normalize and set cover art / background artwork
function setCover(src) {
  const cover = document.getElementById("cover");
  const ambient = document.getElementById("ambient-glow");
  const placeholder = document.getElementById("music-placeholder");

  if (!cover || !ambient) return;

  const safeSrc = getSafeSrc(src);

  if (!safeSrc) {
    cover.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    ambient.style.backgroundImage = "none";
    if (placeholder) placeholder.style.opacity = "0.35";
    setTexture("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
    return;
  }

  cover.src = safeSrc;
  ambient.style.backgroundImage = `url("${safeSrc}")`;
  if (placeholder) placeholder.style.opacity = "0";
  setTexture(safeSrc);
}

// Initialize WebGL infinite tunnel shader background
function initWebGLBackground() {
  const container = document.getElementById("bg");
  if (!container) return;

  renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(1);
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  THREE.Cache.enabled = true;

  // WebGL 3D infinite rotating tunnel shader code
  const fragmentShaderCode = `
    precision mediump float;
    const float kPi = 3.1415927;
    uniform float u_time;
    uniform float u_speed;
    uniform float u_blend;
    uniform bool u_square;
    uniform bool u_center;
    uniform sampler2D u_tex0;
    uniform sampler2D u_tex1;
    uniform vec2 u_resolution;
    uniform vec3 u_center_color;
    uniform float u_center_radius;
    varying vec2 vUv;

    void main() {
        vec2 p = (2. * gl_FragCoord.xy - u_resolution.xy) / u_resolution.y;
        float a = atan(p.y, p.x);
        float r = length(p);
        if(u_square) {
            vec2 p2 = p * p, p4 = p2 * p2, p8 = p4 * p4;
            r = pow(p8.x + p8.y, 1.0 / 8.0);
        }
        vec2 uv = vec2(0.3 / r + 0.2 * u_time * u_speed, 0.5 + a / kPi);
        vec3 col = texture2D(u_tex0, uv).xyz;
        vec3 col1 = texture2D(u_tex1, uv).xyz;
        col = mix(col, col1, u_blend);
        if(u_center) {
            float fadeAmount = 1.0 - smoothstep(0.0, u_center_radius, r);
            col = mix(col, u_center_color, fadeAmount);
        }
        gl_FragColor = vec4(col, 1.);
    }
  `;

  material = new THREE.ShaderMaterial({
    uniforms: {
      u_tex0: { type: "t" },
      u_tex1: { type: "t" },
      u_time: { value: 0, type: "f" },
      u_blend: { value: 0, type: "f" },
      u_speed: { value: 0.08, type: "f" }, // Speed of rotation
      u_square: { value: false, type: "b" },
      u_resolution: {
        value: new THREE.Vector2(window.innerWidth, window.innerHeight),
        type: "v2"
      },
      u_center: { value: true, type: "b" },
      u_center_radius: { value: 0.8, type: "f" },
      u_center_color: { type: "c", value: new THREE.Color(0x0a0a0d) }
    },
    vertexShader: `
      varying vec2 vUv;        
      void main() {
          vUv = uv;
          gl_Position = vec4( position, 1.0 );    
      }
    `,
    fragmentShader: fragmentShaderCode
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 1, 1), material);
  scene.add(quad);

  // Set default transparent textures to start with dark gradient fallback in CSS
  const defaultTex = new THREE.TextureLoader().load("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
  material.uniforms.u_tex0.value = defaultTex;
  material.uniforms.u_tex1.value = defaultTex;

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    material.uniforms.u_resolution.value = new THREE.Vector2(
      window.innerWidth * settings.scale,
      window.innerHeight * settings.scale
    );
  });

  renderWebGL();
}

function renderWebGL() {
  setTimeout(function () {
    requestAnimationFrame(renderWebGL);
  }, 1000 / settings.fps);

  if (material) {
    material.uniforms.u_time.value = clock.getElapsedTime();
  }
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

async function setTexture(src) {
  if (src === currentTextureSrc) return;
  currentTextureSrc = src;

  const currentOperation = textureQueue.then(async () => {
    if (material == null) return;

    return new Promise((resolve) => {
      new THREE.TextureLoader().load(src, async function (tex) {
        // Mirrored repeat creates the beautiful infinite reflection pattern
        tex.wrapS = THREE.MirroredRepeatWrapping;
        tex.wrapT = THREE.MirroredRepeatWrapping;

        if (isTexture0) material.uniforms.u_tex0.value = tex;
        else material.uniforms.u_tex1.value = tex;

        await showTransition(isTexture0);
        isTexture0 = !isTexture0;

        resolve();
      }, undefined, function(err) {
        console.error("Error loading texture in WebGL:", err);
        resolve(); // resolve to prevent stalling queue
      });
    });
  });

  textureQueue = currentOperation;
}

async function showTransition(isTexture0) {
  return new Promise((resolve) => {
    const initialValue = isTexture0 ? 1 : 0;
    const finalValue = isTexture0 ? 0 : 1;
    const duration = 600; // transition speed in ms
    let startTime = null;

    function animate(timestamp) {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const val = initialValue + (finalValue - initialValue) * progress;
      material.uniforms.u_blend.value = val;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        if (isTexture0 && material.uniforms.u_tex1.value) {
          material.uniforms.u_tex1.value.dispose();
        } else if (!isTexture0 && material.uniforms.u_tex0.value) {
          material.uniforms.u_tex0.value.dispose();
        }
        resolve();
      }
    }
    requestAnimationFrame(animate);
  });
}

// Call WebGL initializer on DOM load
window.addEventListener("DOMContentLoaded", initWebGLBackground);

// Update canvas resolution scale
function setScale(value) {
  if (settings.scale === value) return;
  settings.scale = value;
  if (renderer && material) {
    renderer.setPixelRatio(settings.scale);
    material.uniforms.u_resolution.value = new THREE.Vector2(
      window.innerWidth * settings.scale,
      window.innerHeight * settings.scale
    );
  }
}

// Parallax background movement on mouse move
document.addEventListener("mousemove", (event) => {
  if (settings.parallaxVal === 0) return;

  const x = (window.innerWidth - event.pageX * settings.parallaxVal) / 90;
  const y = (window.innerHeight - event.pageY * settings.parallaxVal) / 90;

  const bg = document.getElementById("bg");
  if (bg) {
    bg.style.transform = `translateX(${x}px) translateY(${y}px) scale(1.06)`;
  }
});

// Lively property listener hook for customize UI
function livelyPropertyListener(name, val) {
  if (!material) return;
  switch (name) {
    case "speed":
      material.uniforms.u_speed.value = val;
      break;
    case "isSquare":
      material.uniforms.u_square.value = val;
      break;
    case "colorRadius":
      material.uniforms.u_center_radius.value = val;
      break;
    case "blurIntensity":
      settings.blur = val;
      updateBgFilter();
      break;
    case "bgBrightness":
      settings.brightness = val;
      updateBgFilter();
      break;
    case "displayScaling":
      setScale(val);
      break;
    case "parallaxIntensity":
      settings.parallaxVal = val;
      const bg = document.getElementById("bg");
      if (val === 0 && bg) {
        bg.style.transform = "none";
      }
      break;
    case "fpsLock":
      settings.fps = val ? 30 : 60;
      break;
  }
}

// Parse, render and synchronize lyrics over time
function renderAndSyncLyrics(lyricsText, options = {}) {
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }

  lyricsLines = [];
  currentLineIndex = -1;

  const lyricsEl = document.getElementById("lyrics");
  const containerEl = document.getElementById("lyrics-container");
  if (!lyricsEl) return;

  lyricsEl.innerHTML = "";
  if (containerEl) containerEl.scrollTop = 0;

  const renderMessage = (message, showRetry) => {
    const wrapper = document.createElement("div");
    wrapper.className = "lyric-line active";
    wrapper.style.cssText = "text-align:center;display:flex;flex-direction:column;align-items:center;gap:15px;justify-content:center;width:100%;height:100%;min-height:200px;";

    const text = document.createElement("span");
    text.style.cssText = "font-size:20px;font-weight:600;color:var(--text-sub);";
    text.textContent = message;
    wrapper.appendChild(text);

    if (showRetry) {
      const retry = document.createElement("button");
      retry.id = "btn-inline-reload";
      retry.className = "spotify-btn";
      retry.style.cssText = "font-size:13px;padding:8px 18px;margin-top:5px;";
      retry.textContent = "Th? l?i";
      retry.addEventListener("click", reloadLyrics);
      wrapper.appendChild(retry);
    }

    lyricsEl.appendChild(wrapper);
  };

  if (!lyricsText) {
    setLyricsStatus(options.status || "Lyrics unavailable", "error");
    renderMessage(options.message || "No lyrics found.", true);
    return;
  }

  const parsed = LyricsCore.parseLrc(lyricsText);
  let timeline = parsed.lines;
  let isEstimated = false;

  if (!parsed.synced) {
    const estimatedDuration = Number(options.duration || trackDuration || lyricsCandidateDuration || 0);
    timeline = LyricsCore.buildEstimatedLines(lyricsText, estimatedDuration);
    isEstimated = timeline.length > 0;
  }

  const displayLines = timeline.length > 0
    ? timeline
    : parsed.plainLines.map((text) => ({ time: -1, text }));

  if (displayLines.length === 0) {
    setLyricsStatus(options.status || "Lyrics unavailable", "error");
    renderMessage(options.message || "No lyrics found.", true);
    return;
  }

  if (parsed.synced) setLyricsStatus("Synced lyrics");
  else if (isEstimated) setLyricsStatus("? Unsynced lyrics");
  else setLyricsStatus("Unsynced lyrics");

  for (const line of displayLines) {
    const lineEl = document.createElement("div");
    lineEl.className = "lyric-line";
    lineEl.textContent = line.text;
    lyricsEl.appendChild(lineEl);

    const lineModel = {
      time: Number(line.time),
      text: line.text,
      estimated: Boolean(line.estimated || isEstimated),
      el: lineEl
    };
    lyricsLines.push(lineModel);

    if (lineModel.time >= 0) {
      lineEl.style.cursor = spotifyTrackMatched ? "pointer" : "default";
      lineEl.dataset.time = String(lineModel.time);
      lineEl.addEventListener("click", () => {
        if (spotifyTrackMatched) seekToTime(lineModel.time);
      });
    }
  }

  if (!timeline.length) return;

  lyricsLines.sort((a, b) => a.time - b.time);
  scrollInterval = setInterval(() => {
    const elapsed = getPlaybackPosition();
    let activeIndex = -1;

    for (let index = 0; index < lyricsLines.length; index += 1) {
      if (elapsed >= lyricsLines[index].time) activeIndex = index;
      else break;
    }

    if (activeIndex < 0 || activeIndex === currentLineIndex) return;
    if (currentLineIndex >= 0 && lyricsLines[currentLineIndex]) {
      lyricsLines[currentLineIndex].el.classList.remove("active");
    }

    const activeLine = lyricsLines[activeIndex];
    activeLine.el.classList.add("active");
    currentLineIndex = activeIndex;

    if (containerEl) {
      const activeRect = activeLine.el.getBoundingClientRect();
      const containerRect = containerEl.getBoundingClientRect();
      const relativeTop = containerEl.scrollTop + activeRect.top - containerRect.top;
      containerEl.scrollTo({
        top: relativeTop - containerEl.clientHeight / 2 + activeRect.height / 2,
        behavior: "smooth"
      });
    }
  }, 200);
}


// Fetch lyrics from LRCLIB API
async function fetchLyrics(trackInput, artistFallback = "") {
  const track = typeof trackInput === "string"
    ? LyricsCore.normalizeTrack({ title: trackInput, artist: artistFallback })
    : LyricsCore.normalizeTrack(trackInput);
  const requestVersion = trackVersion;
  const requestKey = LyricsCore.createTrackKey(track);
  const requestId = ++lyricsRequestSequence;

  if (fetchController) fetchController.abort();
  const controller = new AbortController();
  fetchController = controller;

  const lyricsEl = document.getElementById("lyrics");
  const containerEl = document.getElementById("lyrics-container");
  const reloadButton = document.getElementById("btn-reload-lyrics");
  if (!lyricsEl) return;

  if (reloadButton) reloadButton.classList.add("spinning");
  setLyricsStatus("Searching lyrics");
  lyricsEl.innerHTML = "<div class='lyric-line active' style='text-align:center;'>Searching lyrics...</div>";
  if (containerEl) containerEl.scrollTop = 0;

  const isCurrentRequest = () => (
    requestId === lyricsRequestSequence &&
    requestVersion === trackVersion &&
    requestKey === currentTrackKey &&
    !controller.signal.aborted
  );

  const fetchAttempt = async (url, timeoutMs) => {
    const attemptController = new AbortController();
    const abortAttempt = () => attemptController.abort();
    controller.signal.addEventListener("abort", abortAttempt, { once: true });
    const timeout = setTimeout(() => attemptController.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: attemptController.signal,
        headers: {
          "Lrclib-Client": "LivelyLyricsWallpaper/1.1 (https://github.com/24xNoVemBer/LivelyLyricsWallpaper)"
        }
      });
      if (!response.ok) {
        const error = new Error(`Lyrics provider returned HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener("abort", abortAttempt);
    }
  };

  try {
    const params = new URLSearchParams({ track_name: track.title });
    if (track.artist) params.set("artist_name", track.artist);
    if (track.album) params.set("album_name", track.album);
    const targetUrl = `https://lrclib.net/api/search?${params.toString()}`;

    let data;
    try {
      data = await fetchAttempt(targetUrl, 4500);
    } catch (directError) {
      if (controller.signal.aborted) throw directError;
      const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
      data = await fetchAttempt(proxyUrl, 8500);
    }

    if (!isCurrentRequest()) return;
    if (!Array.isArray(data) || data.length === 0) {
      renderAndSyncLyrics(null, {
        status: "Lyrics not found",
        message: "No lyrics found for this track."
      });
      return;
    }

    const ranked = LyricsCore.selectBestCandidate(data, {
      ...track,
      duration: trackDuration || track.duration
    });
    if (!ranked) {
      renderAndSyncLyrics(null, {
        status: "No reliable match",
        message: "Lyrics results were found, but none matched this version reliably."
      });
      return;
    }

    const bestMatch = ranked.candidate;
    lyricsCandidateDuration = Number(bestMatch.duration || 0);
    if (trackDuration <= 0 && lyricsCandidateDuration > 0) {
      trackDuration = lyricsCandidateDuration;
    }

    if (bestMatch.instrumental && !bestMatch.syncedLyrics && !bestMatch.plainLyrics) {
      renderAndSyncLyrics(null, {
        status: "Instrumental",
        message: "This track is marked as instrumental."
      });
      return;
    }

    const rawLyrics = bestMatch.syncedLyrics || bestMatch.plainLyrics;
    renderAndSyncLyrics(rawLyrics, { duration: lyricsCandidateDuration });
  } catch (error) {
    if (!isCurrentRequest()) return;
    const timedOut = error && error.name === "AbortError";
    console.error("Lyrics request failed:", error);
    renderAndSyncLyrics(null, {
      status: timedOut ? "Lyrics timeout" : "Lyrics network error",
      message: timedOut
        ? "Lyrics provider timed out. Please try again."
        : "Could not reach the lyrics provider. Please try again."
    });
  } finally {
    if (fetchController === controller) fetchController = null;
    if (requestId === lyricsRequestSequence && reloadButton) {
      reloadButton.classList.remove("spinning");
    }
  }
}


// Main Lively entry point for track metadata updates
function livelyCurrentTrack(data) {
  let music;
  try {
    music = typeof data === "string" ? JSON.parse(data) : data;
  } catch (error) {
    console.error("Invalid Lively track payload:", error);
    resetTrackState();
    return;
  }

  if (music == null) {
    resetTrackState();
    return;
  }

  const track = LyricsCore.normalizeTrack({
    title: music.Title || music.title || "",
    artist: music.Artist || music.artist || music.AlbumArtist || "",
    album: music.AlbumTitle || music.album || "",
    source: "lively"
  });
  const albumArt = music.Thumbnail || music.thumbnail || music.AlbumArt || music.albumArt || "";

  if (!track.title && !track.artist) {
    resetTrackState();
    return;
  }

  const key = LyricsCore.createTrackKey(track);
  if (key === currentTrackKey) {
    setText("title", track.title);
    setText("artist", track.artist);
    if (albumArt) setCover(albumArt);
    return;
  }

  trackVersion += 1;
  clearPendingTrackWork();
  currentTrackKey = key;
  currentTrackMeta = track;
  trackDuration = 0;
  lyricsCandidateDuration = 0;
  spotifyTrackMatched = false;
  spotifyNextPollMs = 0;
  setPlaybackPosition(0, true, "lively");
  startTimer();
  setPlayPauseIcon(true);
  setLyricsStatus("Searching lyrics");

  const card = document.getElementById("player-card");
  if (card) card.classList.add("changing");

  setText("title", track.title);
  setText("artist", track.artist);
  setCover(albumArt);
  fetchLyrics(track);

  const version = trackVersion;
  transitionTimer = setTimeout(() => {
    if (version === trackVersion && card) card.classList.remove("changing");
    transitionTimer = null;
  }, 400);

  if (spotifyConnected) {
    if (!spotifySyncActive) startSpotifySync();
    else syncSpotifyPlaybackState();
  }
}


// Alias mapping for Lively system information interface compatibility
function livelySystemInformation(data) {
  livelyCurrentTrack(data);
}

// ==========================================
// SPOTIFY WEB API PLAYBACK CONTROLS
// ==========================================

let spotifyClientId = localStorage.getItem('spotify_client_id') || "";
localStorage.removeItem("spotify_token");
localStorage.removeItem("spotify_refresh_token");
localStorage.removeItem("spotify_token_expires_at");
localStorage.removeItem("spotify_code_verifier");

async function helperRequest(path, options = {}) {
  const request = {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" }
  };
  if (options.body !== undefined) request.body = JSON.stringify(options.body);
  return fetch(`http://127.0.0.1:18888${path}`, request);
}

async function loadSpotifyConfig() {
  try {
    const response = await helperRequest("/spotify-status");
    if (!response.ok) throw new Error(`Helper returned ${response.status}`);
    const status = await response.json();
    spotifyConnected = Boolean(status.connected);
    spotifyClientId = status.client_id || spotifyClientId || "";
    if (spotifyClientId) localStorage.setItem("spotify_client_id", spotifyClientId);
  } catch (error) {
    spotifyConnected = false;
    console.warn("Spotify helper status unavailable:", error);
  }
  updateSpotifyButtonUI();
  return spotifyConnected;
}

async function clearSpotifyConfig() {
  try {
    await helperRequest("/spotify-disconnect", { method: "POST", body: {} });
  } catch (error) {
    console.warn("Could not disconnect Spotify helper:", error);
  }
  spotifyConnected = false;
  spotifyTrackMatched = false;
  stopSpotifySync();
  updateSpotifyButtonUI();
}

function updateSpotifyButtonUI() {
  const button = document.getElementById("btn-spotify-connect");
  if (!button) return;
  if (spotifyConnected) {
    button.textContent = "Spotify Connected";
    button.style.borderColor = "var(--accent-color)";
    button.style.color = "var(--accent-color)";
  } else {
    button.textContent = "Connect Spotify";
    button.style.borderColor = "rgba(255, 255, 255, 0.1)";
    button.style.color = "var(--text-sub)";
  }
}

async function sendSpotifyCommand(action, extra = {}) {
  if (!spotifyConnected) return { ok: false, status: 401 };
  try {
    const response = await helperRequest("/spotify-command", {
      method: "POST",
      body: { action, ...extra }
    });
    return { ok: response.ok || response.status === 204, status: response.status, response };
  } catch (error) {
    console.error("Spotify command failed:", error);
    return { ok: false, status: 0, error };
  }
}

async function sendMediaCommand(action) {
  if (spotifyConnected && spotifyTrackMatched) {
    if (action === "playpause") {
      const previousPosition = getPlaybackPosition();
      const previousPlaying = playbackClock.isPlaying;
      const nextPlaying = !previousPlaying;
      setPlaybackPosition(previousPosition, nextPlaying, "spotify");
      setPlayPauseIcon(nextPlaying);

      const result = await sendSpotifyCommand(nextPlaying ? "play" : "pause");
      if (!result.ok) {
        setPlaybackPosition(previousPosition, previousPlaying, "spotify");
        setPlayPauseIcon(previousPlaying);
        if (result.status === 401) {
          spotifyConnected = false;
          stopSpotifySync();
          updateSpotifyButtonUI();
        }
      } else {
        setTimeout(syncSpotifyPlaybackState, 500);
      }
      return;
    }

    const spotifyAction = action === "prev" ? "previous" : action;
    const result = await sendSpotifyCommand(spotifyAction);
    if (result.ok) setTimeout(syncSpotifyPlaybackState, 700);
    return;
  }

  try {
    const response = await helperRequest("/media-command", {
      method: "POST",
      body: { action }
    });
    if (!response.ok) throw new Error(`Helper returned ${response.status}`);
    if (action === "playpause") {
      setPlaybackPlaying(!playbackClock.isPlaying, "local");
      setPlayPauseIcon(playbackClock.isPlaying);
    }
  } catch (error) {
    console.warn("Local media helper unavailable:", error);
  }
}

async function syncSpotifyPlaybackState() {
  if (isSyncing || !spotifyConnected) return;
  isSyncing = true;

  try {
    const response = await helperRequest("/spotify-player");
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") || 30);
      spotifyFailureCount += 1;
      spotifyNextPollMs = Math.max(5000, retryAfter * 1000);
      console.warn(`Spotify rate limited; retrying in ${spotifyNextPollMs}ms`);
      return;
    }

    if (response.status === 204) {
      spotifyTrackMatched = false;
      spotifyFailureCount = 0;
      spotifyNextPollMs = 15000;
      return;
    }

    if (response.status === 401) {
      spotifyConnected = false;
      spotifyTrackMatched = false;
      updateSpotifyButtonUI();
      stopSpotifySync();
      return;
    }

    if (!response.ok) {
      spotifyFailureCount += 1;
      spotifyNextPollMs = Math.min(60000, 5000 * (2 ** Math.min(spotifyFailureCount, 4)));
      return;
    }

    const state = await response.json();
    const item = state && state.item;
    if (!item || !currentTrackMeta) {
      spotifyTrackMatched = false;
      spotifyNextPollMs = state && state.is_playing ? 7000 : 15000;
      return;
    }

    const spotifyTrack = LyricsCore.normalizeTrack({
      id: item.id,
      title: item.name,
      artists: item.artists || [],
      album: item.album && item.album.name,
      duration_ms: item.duration_ms,
      source: "spotify"
    });
    spotifyTrackMatched = LyricsCore.tracksLikelyMatch(currentTrackMeta, spotifyTrack);
    spotifyFailureCount = 0;

    if (!spotifyTrackMatched) {
      spotifyNextPollMs = state.is_playing ? 7000 : 15000;
      return;
    }

    trackDuration = spotifyTrack.duration || trackDuration;
    currentTrackMeta = { ...currentTrackMeta, spotifyId: spotifyTrack.id, duration: trackDuration };
    const spotifyPosition = Math.max(0, Number(state.progress_ms || 0) / 1000);
    setPlaybackPosition(spotifyPosition, Boolean(state.is_playing), "spotify");
    setPlayPauseIcon(Boolean(state.is_playing));
    spotifyNextPollMs = document.hidden ? 15000 : (state.is_playing ? 5000 : 10000);

    for (const line of lyricsLines) {
      if (line.time >= 0 && line.el) line.el.style.cursor = "pointer";
    }
  } catch (error) {
    spotifyFailureCount += 1;
    spotifyNextPollMs = Math.min(60000, 5000 * (2 ** Math.min(spotifyFailureCount, 4)));
    console.error("Spotify sync failed:", error);
  } finally {
    isSyncing = false;
  }
}

function scheduleSpotifySync(delay = spotifyNextPollMs) {
  if (!spotifySyncActive || !spotifyConnected) return;
  if (spotifySyncInterval) clearTimeout(spotifySyncInterval);
  spotifySyncInterval = setTimeout(async () => {
    await syncSpotifyPlaybackState();
    scheduleSpotifySync(spotifyNextPollMs);
  }, Math.max(0, delay));
}

function startSpotifySync() {
  stopSpotifySync();
  if (!spotifyConnected) return;
  spotifySyncActive = true;
  spotifyNextPollMs = 0;
  scheduleSpotifySync(0);
}

function stopSpotifySync() {
  spotifySyncActive = false;
  if (spotifySyncInterval) {
    clearTimeout(spotifySyncInterval);
    spotifySyncInterval = null;
  }
}

async function seekToTime(seconds) {
  if (!spotifyConnected || !spotifyTrackMatched) {
    console.info("Seek ignored because the displayed track is not the matched Spotify track.");
    return;
  }

  const previousPosition = getPlaybackPosition();
  const wasPlaying = playbackClock.isPlaying;
  setPlaybackPosition(seconds, wasPlaying, "spotify");
  const result = await sendSpotifyCommand("seek", { position_ms: Math.floor(seconds * 1000) });
  if (!result.ok) {
    setPlaybackPosition(previousPosition, wasPlaying, "spotify");
  } else {
    setTimeout(syncSpotifyPlaybackState, 500);
  }
}

async function toggleSpotifyPlayPause() {
  return sendMediaCommand("playpause");
}


// Load Spotify config from local helper or localStorage fallback

// Save Spotify config to local helper and localStorage

// Clear Spotify config





// ==========================================
// SPOTIFY PKCE AUTHENTICATION & SEEK HELPERS
// ==========================================

// PKCE Cryptographic Helpers
function generateRandomString(length) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}


async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(a) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(a)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function generateCodeChallenge(v) {
  const hashed = await sha256(v);
  return base64urlencode(hashed);
}

// Check and refresh token if expired

// Sync Spotify playback state (progress and play/pause status)
let isSyncing = false;



// Seek to a specific timestamp

// Reload lyrics for the current song
function reloadLyrics() {
  if (!currentTrackMeta || !currentTrackKey) {
    console.log("No active song playing to reload lyrics.");
    return;
  }
  fetchLyrics(currentTrackMeta);
}


// Progress slider drag/change initializer
window.isDraggingSlider = false;
function initProgressSlider() {
  const slider = document.getElementById("progress-slider");
  if (!slider) return;
  
  slider.addEventListener("mousedown", () => { window.isDraggingSlider = true; });
  slider.addEventListener("touchstart", () => { window.isDraggingSlider = true; });
  
  slider.addEventListener("input", (e) => {
    const percentage = parseFloat(e.target.value);
    const targetSeconds = (percentage / 100) * trackDuration;
    const timeCurrentEl = document.getElementById("time-current");
    if (timeCurrentEl) timeCurrentEl.textContent = formatTime(targetSeconds);
  });
  
  slider.addEventListener("change", (e) => {
    window.isDraggingSlider = false;
    const percentage = parseFloat(e.target.value);
    const targetSeconds = (percentage / 100) * trackDuration;
    seekToTime(targetSeconds);
  });
}

// Initialize controls and listeners
function initSpotifyControls() {
  const buttonConnect = document.getElementById("btn-spotify-connect");
  const buttonPrevious = document.getElementById("btn-prev");
  const buttonPlayPause = document.getElementById("btn-play-pause");
  const buttonNext = document.getElementById("btn-next");
  const buttonReload = document.getElementById("btn-reload-lyrics");
  const buttonCancel = document.getElementById("btn-modal-cancel");
  const buttonLogin = document.getElementById("btn-modal-login");
  const buttonSave = document.getElementById("btn-modal-save");
  const inputClientId = document.getElementById("spotify-client-id");
  const inputRedirect = document.getElementById("spotify-token");

  if (buttonConnect) buttonConnect.addEventListener("click", openSpotifyConfigModal);
  if (buttonPrevious) buttonPrevious.addEventListener("click", () => sendMediaCommand("prev"));
  if (buttonPlayPause) buttonPlayPause.addEventListener("click", () => sendMediaCommand("playpause"));
  if (buttonNext) buttonNext.addEventListener("click", () => sendMediaCommand("next"));
  if (buttonReload) buttonReload.addEventListener("click", reloadLyrics);
  if (buttonCancel) buttonCancel.addEventListener("click", closeSpotifyConfigModal);

  if (buttonLogin) {
    buttonLogin.addEventListener("click", async () => {
      const clientId = inputClientId ? inputClientId.value.trim() : "";
      if (!clientId) {
        alert("Vui lòng nhập Client ID trước.");
        return;
      }

      const codeVerifier = generateRandomString(64);
      try {
        const response = await helperRequest("/spotify-auth/pkce", {
          method: "POST",
          body: { client_id: clientId, code_verifier: codeVerifier }
        });
        if (!response.ok) throw new Error(`Helper returned ${response.status}`);
      } catch (error) {
        alert("Không thể lưu phiên đăng nhập. Hãy chạy run_helper.vbs trước.");
        return;
      }

      spotifyClientId = clientId;
      localStorage.setItem("spotify_client_id", clientId);
      const challenge = await generateCodeChallenge(codeVerifier);
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: "http://127.0.0.1:8888/",
        scope: "user-modify-playback-state user-read-playback-state",
        code_challenge_method: "S256",
        code_challenge: challenge
      });
      window.open(`https://accounts.spotify.com/authorize?${params.toString()}`, "spotify-login-popup", "width=500,height=650");
    });
  }

  if (buttonSave) {
    buttonSave.addEventListener("click", async () => {
      const rawValue = inputRedirect ? inputRedirect.value.trim() : "";
      if (!rawValue) {
        alert("Vui lòng dán Redirect URL hoặc authorization code.");
        return;
      }

      let code = rawValue;
      try {
        if (rawValue.includes("code=")) code = new URL(rawValue).searchParams.get("code") || rawValue;
      } catch (error) {
        const match = rawValue.match(/[?&]code=([^&]+)/);
        if (match) code = decodeURIComponent(match[1]);
      }

      try {
        const response = await helperRequest("/spotify-auth/exchange", {
          method: "POST",
          body: { code }
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error_description || result.error || `HTTP ${response.status}`);
        spotifyConnected = true;
        updateSpotifyButtonUI();
        closeSpotifyConfigModal();
        startSpotifySync();
        alert("Kết nối Spotify thành công.");
      } catch (error) {
        console.error("Spotify connection failed:", error);
        alert(`Không thể kết nối Spotify: ${error.message}`);
      }
    });
  }

  if (inputClientId) inputClientId.value = spotifyClientId;
  if (inputRedirect) inputRedirect.value = "";
  initProgressSlider();
  checkLocalHelper();
  loadSpotifyConfig().then((connected) => {
    if (inputClientId) inputClientId.value = spotifyClientId;
    if (connected) startSpotifySync();
  });
}


async function checkLocalHelper() {
  try {
    const response = await helperRequest("/health");
    if (!response.ok) throw new Error(`Helper returned ${response.status}`);
    console.log("Local media helper is running.");
  } catch (error) {
    console.warn("Local media helper is not running.");
  }
}


function openSpotifyConfigModal() {
  const modal = document.getElementById("spotify-config-modal");
  if (modal) modal.classList.add("active");
  
  const inputClientId = document.getElementById("spotify-client-id");
  const inputToken = document.getElementById("spotify-token");
  if (inputClientId) inputClientId.value = spotifyClientId;
  if (inputToken) inputToken.value = "";
}

function closeSpotifyConfigModal() {
  const modal = document.getElementById("spotify-config-modal");
  if (modal) modal.classList.remove("active");
}

window.addEventListener("DOMContentLoaded", initSpotifyControls);