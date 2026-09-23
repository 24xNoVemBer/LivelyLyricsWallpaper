const form = document.getElementById("import-form");
const titleInput = document.getElementById("track-title");
const artistInput = document.getElementById("track-artist");
const durationInput = document.getElementById("track-duration");
const fileInput = document.getElementById("lyrics-file");
const fileHint = document.getElementById("file-hint");
const statusEl = document.getElementById("status");
const saveButton = document.getElementById("save-button");
const currentTrackButton = document.getElementById("current-track-button");
const savedList = document.getElementById("saved-list");
const emptyList = document.getElementById("empty-list");

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `status${kind ? ` ${kind}` : ""}`;
}

async function callApi(path, options) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

async function refreshSavedList() {
  const result = await callApi("/lyrics-list");
  savedList.replaceChildren();
  emptyList.hidden = result.items.length > 0;

  for (const item of result.items) {
    const row = document.createElement("li");
    const details = document.createElement("div");
    const title = document.createElement("strong");
    const artist = document.createElement("span");
    const remove = document.createElement("button");
    title.textContent = item.title;
    artist.textContent = item.artist;
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Xóa";
    remove.setAttribute("aria-label", `Xóa lyrics của ${item.title} — ${item.artist}`);
    remove.addEventListener("click", async () => {
      if (!confirm(`Xóa lyrics đã nhập cho ${item.title} — ${item.artist}?`)) return;
      remove.disabled = true;
      try {
        await callApi("/lyrics-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: item.title, artist: item.artist }),
        });
        setStatus("Đã xóa lyrics cục bộ.", "success");
        await refreshSavedList();
      } catch (error) {
        remove.disabled = false;
        setStatus(`Không xóa được: ${error.message}`, "error");
      }
    });
    details.append(title, artist);
    row.append(details, remove);
    savedList.appendChild(row);
  }
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) {
    fileHint.textContent = ".lrc hoặc .txt · tối đa 48 KB";
    return;
  }
  const format = file.name.toLowerCase().endsWith(".lrc") ? "LRC có mốc thời gian" : "TXT cuộn ước lượng";
  fileHint.textContent = `${file.name} · ${format}`;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const file = fileInput.files[0];
  if (!file || !/\.(lrc|txt)$/i.test(file.name)) {
    setStatus("Hãy chọn file .lrc hoặc .txt.", "error");
    fileInput.focus();
    return;
  }
  if (file.size > 48 * 1024) {
    setStatus("File lớn hơn 48 KB. Hãy chọn file lyrics nhỏ hơn.", "error");
    fileInput.focus();
    return;
  }

  saveButton.disabled = true;
  setStatus("Đang lưu lyrics...");
  try {
    const lyrics = (await file.text()).replace(/^\uFEFF/, "").trim();
    if (!lyrics) throw new Error("File đang trống.");
    await callApi("/lyrics-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titleInput.value.trim(),
        artist: artistInput.value.trim(),
        duration: durationInput.value ? Number(durationInput.value) : 0,
        lyrics,
      }),
    });
    setStatus("Đã lưu. Trong wallpaper, bấm Tải lại lyrics để dùng file mới.", "success");
    fileInput.value = "";
    fileHint.textContent = ".lrc hoặc .txt · tối đa 48 KB";
    await refreshSavedList();
  } catch (error) {
    setStatus(`Không lưu được: ${error.message}`, "error");
  } finally {
    saveButton.disabled = false;
  }
});

currentTrackButton.addEventListener("click", async () => {
  currentTrackButton.disabled = true;
  try {
    const state = await callApi("/spotify-player");
    if (!state.item) throw new Error("Spotify chưa có bài đang phát.");
    titleInput.value = state.item.name || "";
    artistInput.value = (state.item.artists || []).map((artist) => artist.name).filter(Boolean).join(", ");
    durationInput.value = state.item.duration_ms ? String(state.item.duration_ms / 1000) : "";
    setStatus("Đã điền bài từ Spotify. Kiểm tra tên bài/nghệ sĩ rồi chọn file lyrics.");
    fileInput.focus();
  } catch (error) {
    setStatus(`Không lấy được bài Spotify: ${error.message}`, "error");
  } finally {
    currentTrackButton.disabled = false;
  }
});

refreshSavedList().catch((error) => setStatus(`Không đọc được thư viện lyrics: ${error.message}`, "error"));
