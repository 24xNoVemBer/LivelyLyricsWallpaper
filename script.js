let currentTrackKey = "";
let lyricsLines = [];
let trackStartTime = null;
let scrollInterval = null;
let timerInterval = null;
let fetchController = null;
let currentLineIndex = -1;
let trackDuration = 0;


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
    if (!trackStartTime) return;
    const elapsed = (Date.now() - trackStartTime) / 1000;
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
function renderAndSyncLyrics(lyricsText) {
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
  
  lyricsLines = [];
  currentLineIndex = -1;
  // Use the trackStartTime captured immediately on track change event, fallback to now
  if (!trackStartTime) {
    trackStartTime = Date.now();
  }

  const lyricsEl = document.getElementById("lyrics");
  const containerEl = document.getElementById("lyrics-container");
  if (!lyricsEl) return;

  lyricsEl.innerHTML = "";
  if (containerEl) containerEl.scrollTop = 0;

  if (!lyricsText || lyricsText === "No lyrics found.") {
    lyricsEl.innerHTML = "<div class='lyric-line active' style='text-align: center;'>No lyrics found.</div>";
    return;
  }

  const lines = lyricsText.split('\n');
  let hasSynced = false;

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      const spacerEl = document.createElement("div");
      spacerEl.className = "lyric-line spacer";
      spacerEl.style.height = "16px";
      lyricsEl.appendChild(spacerEl);
      continue;
    }

    if (/^\[[a-zA-Z]{2,}:.*\]$/.test(trimmed)) {
      continue;
    }

    const timeMatches = trimmed.match(/\[\d+:\d+(?:\.\d+)?\]/g);
    const cleanText = trimmed.replace(/\[\d+:\d+(?:\.\d+)?\]/g, "").trim();

    const lineEl = document.createElement("div");
    lineEl.className = "lyric-line";
    lineEl.textContent = cleanText || "•";
    lyricsEl.appendChild(lineEl);

    if (timeMatches) {
      hasSynced = true;
      for (let timeStr of timeMatches) {
        const timePart = timeStr.slice(1, -1);
        const parts = timePart.split(":");
        const mins = parseFloat(parts[0]);
        const secs = parseFloat(parts[1]);
        const totalSeconds = mins * 60 + secs;

        lyricsLines.push({
          time: totalSeconds,
          text: cleanText,
          el: lineEl
        });
        
        lineEl.style.cursor = "pointer";
        lineEl.dataset.time = totalSeconds;
        lineEl.onclick = function() {
          const t = parseFloat(this.dataset.time);
          if (!isNaN(t)) seekToTime(t);
        };
      }
    } else {
      lyricsLines.push({
        time: -1,
        text: cleanText,
        el: lineEl
      });
    }
  }

  if (hasSynced) {
    lyricsLines.sort((a, b) => a.time - b.time);

    scrollInterval = setInterval(() => {
      if (!trackStartTime) return;
      
      const elapsed = (Date.now() - trackStartTime) / 1000;
      
      let activeIndex = -1;
      for (let i = 0; i < lyricsLines.length; i++) {
        if (elapsed >= lyricsLines[i].time) {
          activeIndex = i;
        } else {
          break;
        }
      }

      if (activeIndex !== -1 && activeIndex !== currentLineIndex) {
        if (currentLineIndex !== -1 && lyricsLines[currentLineIndex]) {
          lyricsLines[currentLineIndex].el.classList.remove("active");
        }
        
        const activeLineObj = lyricsLines[activeIndex];
        activeLineObj.el.classList.add("active");
        currentLineIndex = activeIndex;

        if (containerEl) {
          const activeEl = activeLineObj.el;
          const activeOffset = activeEl.offsetTop;
          const containerHeight = containerEl.clientHeight;
          
          containerEl.scrollTo({
            top: activeOffset - containerHeight / 2 + activeEl.clientHeight / 2,
            behavior: "smooth"
          });
        }
      }
    }, 200);
  } else {
    // If it's plain lyrics, we DO NOT scroll automatically.
    // We let the user scroll manually using the mouse wheel.
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
    }
  }
}



// Fetch lyrics from LRCLIB API
async function fetchLyrics(title, artist) {
  // Abort any ongoing fetch request
  if (fetchController) {
    fetchController.abort();
  }

  const activeFetchKey = `${title} - ${artist}`;
  
  const lyricsEl = document.getElementById("lyrics");
  const containerEl = document.getElementById("lyrics-container");
  if (!lyricsEl) return;

  lyricsEl.innerHTML = "<div class='lyric-line active' style='text-align: center;'>Searching lyrics...</div>";
  if (containerEl) containerEl.scrollTop = 0;

  // Create new AbortController for this fetch
  fetchController = new AbortController();
  const signal = fetchController.signal;

  // Set a 12-second timeout (generous for proxy latency)
  const timeoutId = setTimeout(() => {
    if (fetchController) fetchController.abort();
  }, 12000);

  try {
    const targetUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
    // Route request through corsproxy.io to bypass local ISP block on lrclib.net
    const url = `https://corsproxy.io/?${targetUrl}`;
    console.log(`Fetching lyrics for: ${title} - ${artist} via proxy`);

    const res = await fetch(url, { signal });
    clearTimeout(timeoutId);

    // If the song changed while we were fetching, ignore the result
    if (activeFetchKey !== currentTrackKey) return;

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();

    // Double check key again
    if (activeFetchKey !== currentTrackKey) return;

    if (!Array.isArray(data) || data.length === 0) {
      renderAndSyncLyrics("No lyrics found.");
      return;
    }

    const bestMatch = data[0];
    trackDuration = bestMatch.duration || 0;
    const rawLyrics = bestMatch.syncedLyrics || bestMatch.plainLyrics || "No lyrics found.";
    
    renderAndSyncLyrics(rawLyrics);

  } catch (err) {
    clearTimeout(timeoutId);
    
    // Ignore error UI update if song has changed
    if (activeFetchKey !== currentTrackKey) return;

    console.error("Error fetching lyrics from LRCLIB:", err);
    if (err.name === 'AbortError') {
      renderAndSyncLyrics("No lyrics found (Connection Timeout).");
    } else {
      renderAndSyncLyrics(`No lyrics found (${err.message}).`);
    }
  } finally {
    // Only reset the global controller if it matches this fetch
    if (fetchController && activeFetchKey === currentTrackKey) {
      fetchController = null;
    }
  }
}

// Main Lively entry point for track metadata updates
function livelyCurrentTrack(data) {
  try {
    if (!data) return;

    // Safely parse JSON if passed as string
    const music = typeof data === "string" ? JSON.parse(data) : data;
    
    // Normalize field naming structures
    const title = music.Title || music.title || "";
    const artist = music.Artist || music.artist || "";
    const albumArt = music.Thumbnail || music.thumbnail || music.AlbumArt || music.albumArt || "";

    const key = `${title} - ${artist}`;

    // If no song is actually playing, reset layout to standby state
    if (!title && !artist) {
      if (scrollInterval) {
        clearInterval(scrollInterval);
        scrollInterval = null;
      }
      stopTimer();
      setText("title", "No music playing");
      setText("artist", "Play something on Spotify or your PC");
      setCover("");
      const lyricsEl = document.getElementById("lyrics");
      if (lyricsEl) lyricsEl.innerHTML = "<div class='lyric-line active' style='text-align: center;'>Waiting for playback details...</div>";
      currentTrackKey = "";
      setPlayPauseIcon(false);
      return;
    }

    // Only update and fetch if the track has actually changed
    if (key !== currentTrackKey) {
      currentTrackKey = key;
      trackStartTime = Date.now(); // Record playback start time immediately on event receipt
      startTimer();
      setPlayPauseIcon(true);

      const card = document.getElementById("player-card");
      
      // Trigger card transition fade out
      if (card) {
        card.classList.add("changing");
      }

      // Wait for the fade-out transition before updating UI elements
      setTimeout(() => {
        setText("title", title);
        setText("artist", artist);
        setCover(albumArt);
        
        // Fetch new lyrics
        fetchLyrics(title, artist);

        // Fade elements back in
        if (card) {
          card.classList.remove("changing");
        }
      }, 400);
    }
  } catch (e) {
    console.error("Error processing Lively current track details:", e);
  }
}

// Alias mapping for Lively system information interface compatibility
function livelySystemInformation(data) {
  livelyCurrentTrack(data);
}

// ==========================================
// SPOTIFY WEB API PLAYBACK CONTROLS
// ==========================================

let spotifyToken = localStorage.getItem('spotify_token') || "";
let spotifyClientId = localStorage.getItem('spotify_client_id') || "";

async function fetchSpotifyProxy(url, options = {}) {
  const proxyUrl = "http://127.0.0.1:18888/spotify-proxy";
  const proxyBody = {
    url: url,
    method: options.method || "GET",
    headers: options.headers || {},
    body: options.body || null
  };
  
  if (options.body && typeof options.body.toString === 'function' && !(typeof options.body === 'string')) {
    proxyBody.body = options.body.toString();
  }

  try {
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(proxyBody)
    });
    return response;
  } catch (err) {
    console.warn("Local Spotify proxy failed or not running, falling back to direct fetch:", err);
    return fetch(url, options);
  }
}


function updateSpotifyButtonUI() {
  const btn = document.getElementById("btn-spotify-connect");
  if (!btn) return;
  if (spotifyToken) {
    btn.textContent = "Spotify Connected";
    btn.style.borderColor = "var(--accent-color)";
    btn.style.color = "var(--accent-color)";
  } else {
    btn.textContent = "Connect Spotify";
    btn.style.borderColor = "rgba(255, 255, 255, 0.1)";
    btn.style.color = "var(--text-sub)";
  }
}

async function sendSpotifyCommand(endpoint, method = 'POST', body = null) {
  if (!spotifyToken) {
    openSpotifyConfigModal();
    return;
  }
  try {
    const headers = {
      'Authorization': `Bearer ${spotifyToken}`,
      'Content-Type': 'application/json'
    };
    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);
    
    const res = await fetchSpotifyProxy(`https://api.spotify.com/v1/me/player/${endpoint}`, config);
    
    if (res.status === 401) {
      spotifyToken = "";
      localStorage.removeItem('spotify_token');
      updateSpotifyButtonUI();
      alert("Spotify connection expired. Please reconnect.");
      openSpotifyConfigModal();
      return;
    }
    
    if (res.status === 204 || res.ok) {
      console.log(`Spotify command ${endpoint} succeeded`);
    } else {
      const data = await res.json().catch(() => ({}));
      console.error(`Spotify error:`, data);
    }
  } catch (err) {
    console.error("Network error sending Spotify command:", err);
  }
}

async function toggleSpotifyPlayPause() {
  if (!spotifyToken) {
    openSpotifyConfigModal();
    return;
  }
  const svgPlay = document.getElementById("svg-play");
  const svgPause = document.getElementById("svg-pause");

  try {
    const res = await fetchSpotifyProxy('https://api.spotify.com/v1/me/player', {
      headers: { 'Authorization': `Bearer ${spotifyToken}` }
    });
    
    if (res.status === 401) {
      spotifyToken = "";
      localStorage.removeItem('spotify_token');
      updateSpotifyButtonUI();
      openSpotifyConfigModal();
      return;
    }
    
    if (res.status === 200) {
      const state = await res.json();
      if (state.is_playing) {
        await sendSpotifyCommand('pause', 'PUT');
        if (svgPlay && svgPause) {
          svgPlay.classList.remove("hidden");
          svgPause.classList.add("hidden");
        }
      } else {
        await sendSpotifyCommand('play', 'PUT');
        if (svgPlay && svgPause) {
          svgPlay.classList.add("hidden");
          svgPause.classList.remove("hidden");
        }
      }
    } else {
      // Active device exists but no track or paused, let's try play
      await sendSpotifyCommand('play', 'PUT');
      if (svgPlay && svgPause) {
        svgPlay.classList.add("hidden");
        svgPause.classList.remove("hidden");
      }
    }
  } catch (err) {
    console.error("Error toggling Spotify play/pause:", err);
    await sendSpotifyCommand('play', 'PUT');
  }
}

async function sendMediaCommand(action) {
  try {
    const res = await fetch(`http://127.0.0.1:18888/${action}`, { mode: 'cors' });
    if (res.ok) {
      console.log(`Media Helper command ${action} succeeded`);
      if (action === 'playpause') {
        const svgPlay = document.getElementById("svg-play");
        const svgPause = document.getElementById("svg-pause");
        if (svgPlay && svgPause) {
          svgPlay.classList.toggle("hidden");
          svgPause.classList.toggle("hidden");
        }
      }
      return;
    }
  } catch (err) {
    console.log("Local media helper not running, falling back to Spotify Web API...");
  }

  if (action === 'playpause') {
    await toggleSpotifyPlayPause();
  } else if (action === 'next') {
    await sendSpotifyCommand('next', 'POST');
  } else if (action === 'prev') {
    await sendSpotifyCommand('previous', 'POST');
  }
}

// ==========================================
// SPOTIFY PKCE AUTHENTICATION & SEEK HELPERS
// ==========================================

// PKCE Cryptographic Helpers
function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
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
async function getValidSpotifyToken() {
  let token = localStorage.getItem('spotify_token');
  const refreshToken = localStorage.getItem('spotify_refresh_token');
  const expiresAt = localStorage.getItem('spotify_token_expires_at');
  const clientId = localStorage.getItem('spotify_client_id');
  
  if (!token || !refreshToken || !clientId) return "";
  
  // If token is expired or expires in less than 60 seconds
  if (Date.now() > (parseInt(expiresAt) - 60000)) {
    console.log("Spotify access token expired. Refreshing...");
    try {
      const payload = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId
      });
      
      const response = await fetchSpotifyProxy('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: payload
      });
      
      if (response.ok) {
        const data = await response.json();
        token = data.access_token;
        localStorage.setItem('spotify_token', token);
        if (data.refresh_token) {
          localStorage.setItem('spotify_refresh_token', data.refresh_token);
        }
        localStorage.setItem('spotify_token_expires_at', Date.now() + data.expires_in * 1000);
        console.log("Spotify token refreshed successfully.");
      } else {
        console.error("Failed to refresh Spotify token.");
      }
    } catch (err) {
      console.error("Error refreshing Spotify token:", err);
    }
  }
  return token;
}

// Seek to a specific timestamp
async function seekToTime(seconds) {
  // Seek wall-clock immediately for instant lyrics jump
  trackStartTime = Date.now() - (seconds * 1000);
  
  // Update progress bar visually
  const progressSlider = document.getElementById("progress-slider");
  if (progressSlider && trackDuration > 0) {
    progressSlider.value = (seconds / trackDuration) * 100;
  }
  
  const token = await getValidSpotifyToken();
  if (token) {
    try {
      const res = await fetchSpotifyProxy(`https://api.spotify.com/v1/me/player/seek?position_ms=${Math.floor(seconds * 1000)}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.status === 403) {
        alert("Tính năng tua nhạc (seek) yêu cầu tài khoản Spotify Premium!");
      } else if (res.status === 404) {
        alert("Không tìm thấy thiết bị Spotify đang hoạt động. Hãy mở nhạc trên ứng dụng Spotify trước!");
      } else if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("Spotify seek error:", errorData);
      } else {
        console.log(`Seeked Spotify to ${seconds}s`);
      }
    } catch (e) {
      console.error("Error seeking Spotify:", e);
    }
  } else {
    console.log(`Seeked local wall-clock to ${seconds}s`);
  }
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
  const btnConnect = document.getElementById("btn-spotify-connect");
  const btnPrev = document.getElementById("btn-prev");
  const btnPlayPause = document.getElementById("btn-play-pause");
  const btnNext = document.getElementById("btn-next");
  
  const btnCancel = document.getElementById("btn-modal-cancel");
  const btnLogin = document.getElementById("btn-modal-login");
  const btnSave = document.getElementById("btn-modal-save");
  const inputClientId = document.getElementById("spotify-client-id");
  const inputToken = document.getElementById("spotify-token");

  if (btnConnect) btnConnect.addEventListener("click", openSpotifyConfigModal);
  if (btnPrev) btnPrev.addEventListener("click", () => sendMediaCommand('prev'));
  if (btnPlayPause) btnPlayPause.addEventListener("click", () => sendMediaCommand('playpause'));
  if (btnNext) btnNext.addEventListener("click", () => sendMediaCommand('next'));
  if (btnCancel) btnCancel.addEventListener("click", closeSpotifyConfigModal);

  if (btnLogin) {
    btnLogin.addEventListener("click", async () => {
      const clientId = inputClientId.value.trim();
      if (!clientId) {
        alert("Vui lòng nhập Client ID trước!");
        return;
      }
      
      const codeVerifier = generateRandomString(64);
      localStorage.setItem('spotify_code_verifier', codeVerifier);
      localStorage.setItem('spotify_client_id', clientId);
      spotifyClientId = clientId;
      
      const challenge = await generateCodeChallenge(codeVerifier);
      const redirectUri = encodeURIComponent("http://127.0.0.1:8888/");
      const scope = encodeURIComponent("user-modify-playback-state user-read-playback-state");
      
      const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}&code_challenge_method=S256&code_challenge=${challenge}`;
      window.open(authUrl, "spotify-login-popup", "width=500,height=650");
    });
  }

  if (btnSave) {
    btnSave.addEventListener("click", async () => {
      const inputVal = inputToken.value.trim();
      if (!inputVal) {
        alert("Vui lòng dán URL kết quả hoặc Code chuyển hướng!");
        return;
      }
      
      let code = inputVal;
      if (inputVal.includes("code=")) {
        const match = inputVal.match(/code=([^&]+)/);
        if (match) code = match[1];
      }
      
      const clientId = inputClientId.value.trim() || spotifyClientId;
      const codeVerifier = localStorage.getItem('spotify_code_verifier');
      
      if (!clientId || !codeVerifier) {
        alert("Thiếu Client ID hoặc Code Verifier. Vui lòng đăng nhập lại bước 1!");
        return;
      }
      
      try {
        const payload = new URLSearchParams({
          client_id: clientId,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: 'http://127.0.0.1:8888/',
          code_verifier: codeVerifier
        });
        
        const res = await fetchSpotifyProxy('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: payload
        });
        
        if (res.ok) {
          const data = await res.json();
          spotifyToken = data.access_token;
          localStorage.setItem("spotify_token", spotifyToken);
          localStorage.setItem("spotify_refresh_token", data.refresh_token);
          localStorage.setItem("spotify_token_expires_at", Date.now() + data.expires_in * 1000);
          localStorage.setItem("spotify_client_id", clientId);
          spotifyClientId = clientId;
          
          updateSpotifyButtonUI();
          closeSpotifyConfigModal();
          alert("Kết nối Spotify thành công và giữ liên kết vĩnh viễn!");
        } else {
          const errorData = await res.json().catch(() => ({}));
          console.error("Token Exchange Error:", errorData);
          alert("Lỗi khi đổi Token: " + (errorData.error_description || "Vui lòng kiểm tra lại Code/URL."));
        }
      } catch (err) {
        console.error("Token Exchange Exception:", err);
        alert("Lỗi mạng khi kết nối Spotify.");
      }
    });
  }

  if (inputClientId) inputClientId.value = spotifyClientId;
  if (inputToken && spotifyToken) inputToken.value = spotifyToken;
  
  updateSpotifyButtonUI();
  checkLocalHelper();
  initProgressSlider();
}

async function checkLocalHelper() {
  try {
    const res = await fetch("http://127.0.0.1:18888/playpause", { method: 'OPTIONS' });
    if (res.ok) {
      console.log("Local media helper is running.");
    }
  } catch (err) {
    console.log("Local media helper is not running.");
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