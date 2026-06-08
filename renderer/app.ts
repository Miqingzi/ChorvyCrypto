/**
 * Chorvy Crypto v7 - 大番茄混淆 + Duck LSB 隐写
 * 解密兼容 CSPNG100
 */
import {
  decryptCSPNG100,
  encryptDuckPNG, decryptDuckPNG,
  scrambleImage, unscrambleImage,
  detectMode, CryptoMode
} from "./crypto";

declare global {
  interface Window {
    electronAPI: {
      saveFile: (o: { defaultName: string; filters: Array<{ name: string; extensions: string[] }> }) =>
        Promise<{ canceled: boolean; filePath: string | null }>;
      writeFile: (p: string, d: string) => Promise<{ success: boolean; error?: string }>;
      writeBlob: (p: string, b: number[]) => Promise<{ success: boolean; error?: string }>;
      openFile: (p: string) => Promise<{ success: boolean; error?: string }>;
      openExternal: (url: string) => Promise<void>;
      pickViewer: () => Promise<{ canceled: boolean; filePath: string | null }>;
      pickFolder: () => Promise<{ canceled: boolean; filePath: string | null }>;
      toggleAlwaysOnTop: () => Promise<boolean>;
      getAlwaysOnTop: () => Promise<boolean>;
      minimizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      getCoverImage: () => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
      setOpacity: (v: number) => Promise<void>;
      getOpacity: () => Promise<number>;
    };
  }
}

const api = window.electronAPI;
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const $$ = (s: string) => document.querySelectorAll(s);

// ---- Titlebar ----
const btnClose = $("#btn-close") as HTMLButtonElement;
const btnMin = $("#btn-min") as HTMLButtonElement;
const btnPin = $("#btn-pin") as HTMLButtonElement;
const btnOpacity = $("#btn-opacity") as HTMLButtonElement;
const opacitySliderWrap = $("#opacity-slider-wrap");
const opacitySlider = $("#opacity-slider") as HTMLInputElement;
const opacityValue = $("#opacity-value");
const btnRefresh = $("#btn-refresh") as HTMLButtonElement;

// ---- Tabs ----
const tabs = $$(".tab") as NodeListOf<HTMLButtonElement>;
const panelDecrypt = $("#panel-decrypt");
const panelEncrypt = $("#panel-encrypt");

// ---- Decrypt ----
const decryptMain = $("#decrypt-main");
const decryptDropUI = $("#decrypt-drop-ui");
const dropFileInfo = $("#drop-file-info");
const dropFileName = $("#drop-file-name");
const dropFileMode = $("#drop-file-mode");
const previewImg = $("#preview-img") as HTMLImageElement;
const previewVideo = $("#preview-video") as HTMLVideoElement;
const decryptPasswordArea = $("#decrypt-password-area");
const decryptPassword = $("#decrypt-password") as HTMLInputElement;
const btnDecrypt = $("#btn-decrypt") as HTMLButtonElement;
const decryptProgress = $("#decrypt-progress");
const decryptProgressFill = $("#decrypt-progress-fill");
const decryptProgressText = $("#decrypt-progress-text");
const btnViewFile = $("#btn-view-file") as HTMLButtonElement;

// ---- Encrypt ----
const encryptModeRadios = $$('input[name="encrypt-mode"]') as NodeListOf<HTMLInputElement>;
const encryptFileArea = $("#encrypt-file-area");
const encryptDropZone = $("#encrypt-drop-zone");
const encryptFileInput = $("#encrypt-file-input") as HTMLInputElement;
const encryptFileName = $("#encrypt-file-name");
const duckCompressArea = $("#duck-compress-area");
const duckCompressSelect = $("#duck-compress") as HTMLSelectElement;
const encryptPasswordArea = $("#encrypt-password-area");
const encryptPassword = $("#encrypt-password") as HTMLInputElement;
const encryptPasswordLabel = $("#encrypt-password-label");
const btnEncrypt = $("#btn-encrypt") as HTMLButtonElement;
const encryptProgress = $("#encrypt-progress");
const encryptProgressFill = $("#encrypt-progress-fill");
const encryptProgressText = $("#encrypt-progress-text");
const encryptResult = $("#encrypt-result");
const encryptResultText = $("#encrypt-result-text");
const encryptPreviewImg = $("#encrypt-preview") as HTMLImageElement;
const encryptOriginalPreview = $("#encrypt-original-preview") as HTMLImageElement;
const btnSaveResult = $("#btn-save-result") as HTMLButtonElement;
const btnCopyResult = $("#btn-copy-result") as HTMLButtonElement;
const btnEncryptReset = $("#btn-encrypt-reset");
const duckCopyWarning = $("#duck-copy-warning");

// ---- Footer ----
const statusText = $("#status-text");
const statusPin = $("#status-pin");
const viewerPathDisplay = $("#viewer-path") as HTMLInputElement;
const btnPickViewer = $("#btn-pick-viewer");
const btnToggleViewer = $("#btn-toggle-viewer") as HTMLButtonElement;
const savePathDisplay = $("#save-path") as HTMLInputElement;
const btnPickSavePath = $("#btn-pick-save-path");
const btnToggleSave = $("#btn-toggle-save") as HTMLButtonElement;
const btnSaveFile = $("#btn-save-file") as HTMLButtonElement;

// ---- State ----
let decryptFile: File | null = null;
let decryptMode: CryptoMode = "unknown";
let encryptFile: File | null = null;
let lastDecryptedBlob: Blob | null = null;
let lastDecryptedName = "";
let lastDecryptedPath: string | null = null;
let lastEncryptedDataUrl: string | null = null;
let lastEncryptedFileName: string | null = null;
let viewerEnabled = true;
let autoSaveEnabled = true;

// ---- Helpers ----
function setStatus(m: string) { statusText.textContent = m; }

function showDecryptProgress() { decryptProgress.classList.remove("hidden"); decryptPasswordArea.classList.add("hidden"); }
function setDecryptProgress(p: number, t: string) { decryptProgressFill.style.width = Math.min(100, Math.max(0, p)) + "%"; decryptProgressText.textContent = t; }
function hideDecryptProgress() { decryptProgress.classList.add("hidden"); }

function showEncryptProgress() { encryptFileArea.classList.add("hidden"); encryptOriginalPreview.classList.add("hidden"); encryptPasswordArea.classList.add("hidden"); encryptResult.classList.add("hidden"); encryptProgress.classList.remove("hidden"); }
function restoreEncryptUI() { encryptFileArea.classList.remove("hidden"); encryptPasswordArea.classList.remove("hidden"); encryptProgress.classList.add("hidden"); }
function setEncryptProgress(p: number, t: string) { encryptProgressFill.style.width = Math.min(100, Math.max(0, p)) + "%"; encryptProgressText.textContent = t; }

function formatSize(b: number): string {
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}

function checkIsImageHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return true;
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return true;
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return true;
  if (bytes[0] === 0x42 && bytes[1] === 0x4D) return true;
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes.length > 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return true;
  return false;
}

// ---- Preview ----
function showPreview(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const isV = blob.type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv)$/i.test(name);
  decryptDropUI.classList.add("hidden");
  previewImg.classList.add("hidden"); previewVideo.classList.add("hidden");
  if (isV) { previewVideo.src = url; previewVideo.classList.remove("hidden"); }
  else { previewImg.src = url; previewImg.classList.remove("hidden"); }
}
function hidePreview() {
  decryptDropUI.classList.remove("hidden");
  if (previewImg.src) { URL.revokeObjectURL(previewImg.src); previewImg.src = ""; }
  if (previewVideo.src) { URL.revokeObjectURL(previewVideo.src); previewVideo.src = ""; }
  previewImg.classList.add("hidden"); previewVideo.classList.add("hidden");
}
function cleanupLastDecrypted() {
  hidePreview(); btnViewFile.classList.add("hidden"); btnSaveFile.classList.add("hidden");
  if (lastDecryptedBlob) { lastDecryptedBlob = null; lastDecryptedName = ""; lastDecryptedPath = null; }
}

// ---- View button ----
btnViewFile.addEventListener("click", async () => {
  if (lastDecryptedPath) { await api.openFile(lastDecryptedPath); return; }
  if (lastDecryptedPath) { const or = await api.openFile(lastDecryptedPath); if (!or.success) setStatus("打开失败: " + (or.error || "未知错误")); return; }
  if (!lastDecryptedBlob) return;
  const dir = savePathDisplay.value.trim();
  if (dir) {
    const sep = navigator.platform.toLowerCase().includes("win") ? "\\" : "/";
    const fp = dir.replace(/[/\\]$/, "") + sep + lastDecryptedName;
    const ab = await lastDecryptedBlob.arrayBuffer();
    await api.writeBlob(fp, Array.from(new Uint8Array(ab)));
    lastDecryptedPath = fp;
    const or = await api.openFile(fp);
    if (!or.success) setStatus("打开失败: " + (or.error || "未知错误"));
  } else {
    const r = await api.saveFile({ defaultName: lastDecryptedName, filters: [{ name: "All", extensions: ["*"] }] });
    if (!r.canceled && r.filePath) {
      const ab = await lastDecryptedBlob.arrayBuffer();
      const wr = await api.writeBlob(r.filePath, Array.from(new Uint8Array(ab)));
      if (!wr.success) { setStatus("写入失败: " + (wr.error || "未知错误")); return; }
      lastDecryptedPath = r.filePath;
      const or = await api.openFile(r.filePath);
      if (!or.success) setStatus("打开失败: " + (or.error || "未知错误"));
    }
  }
});

// ---- Viewer toggle ----
function updateViewerToggle() {
  btnToggleViewer.textContent = viewerEnabled ? "ON" : "OFF";
  btnToggleViewer.classList.toggle("on", viewerEnabled);
  localStorage.setItem("chorvy-viewer-on", viewerEnabled ? "1" : "0");
}
btnToggleViewer.addEventListener("click", () => { viewerEnabled = !viewerEnabled; updateViewerToggle(); });
viewerEnabled = localStorage.getItem("chorvy-viewer-on") !== "0";
updateViewerToggle();

// ---- Save mode toggle ----
function updateSaveToggle() {
  btnToggleSave.textContent = autoSaveEnabled ? "自动" : "手动";
  btnToggleSave.classList.toggle("on", autoSaveEnabled);
  localStorage.setItem("chorvy-save-auto", autoSaveEnabled ? "1" : "0");
}
btnToggleSave.addEventListener("click", () => { autoSaveEnabled = !autoSaveEnabled; updateSaveToggle(); });
autoSaveEnabled = localStorage.getItem("chorvy-save-auto") !== "0";
updateSaveToggle();

// ---- Tabs ----
tabs.forEach(t => t.addEventListener("click", () => {
  tabs.forEach(x => x.classList.remove("active")); t.classList.add("active");
  if (t.dataset.tab === "decrypt") { panelDecrypt.classList.add("active"); panelEncrypt.classList.remove("active"); }
  else { panelEncrypt.classList.add("active"); panelDecrypt.classList.remove("active"); }
}));

// ---- Opacity (transparency) slider ----
let opacitySliderOpen = false;

btnOpacity.addEventListener("click", (e) => {
  e.stopPropagation();
  opacitySliderOpen = !opacitySliderOpen;
  opacitySliderWrap.classList.toggle("hidden", !opacitySliderOpen);
});

document.addEventListener("click", () => {
  if (opacitySliderOpen) {
    opacitySliderOpen = false;
    opacitySliderWrap.classList.add("hidden");
  }
});

opacitySliderWrap.addEventListener("click", (e) => e.stopPropagation());

opacitySlider.addEventListener("input", async () => {
  const v = parseInt(opacitySlider.value);
  opacityValue.textContent = v + "%";
  await api.setOpacity(v / 100);
});

(async () => {
  try {
    const currentOpacity = await api.getOpacity();
    const pct = Math.round(currentOpacity * 100);
    opacitySlider.value = String(pct);
    opacityValue.textContent = pct + "%";
  } catch { /* default 80% */ }
})();

// ---- Titlebar ----
btnPin.addEventListener("click", async () => { const p = await api.toggleAlwaysOnTop(); statusPin.textContent = p ? "置顶" : "取消"; });
btnMin.addEventListener("click", () => api.minimizeWindow());
btnClose.addEventListener("click", () => api.closeWindow());
btnRefresh.addEventListener("click", () => { cleanupLastDecrypted(); setStatus("就绪"); });
(async () => { statusPin.textContent = (await api.getAlwaysOnTop()) ? "置顶" : "取消"; })();

// ---- Footer pickers ----
btnPickViewer.addEventListener("click", async () => { const r = await api.pickViewer(); if (!r.canceled && r.filePath) { viewerPathDisplay.value = r.filePath; localStorage.setItem("chorvy-viewer", r.filePath); } });
btnPickSavePath.addEventListener("click", async () => { const r = await api.pickFolder(); if (!r.canceled && r.filePath) { savePathDisplay.value = r.filePath; localStorage.setItem("chorvy-savepath", r.filePath); } });
const sv = localStorage.getItem("chorvy-viewer"); if (sv) viewerPathDisplay.value = sv;
const sp = localStorage.getItem("chorvy-savepath"); if (sp) savePathDisplay.value = sp;

btnSaveFile.addEventListener("click", async () => {
  if (!lastDecryptedBlob) return;
  const dir = savePathDisplay.value.trim();
  let fp: string | null;
  if (dir) { const sep = navigator.platform.toLowerCase().includes("win") ? "\\" : "/"; fp = dir.replace(/[/\\]$/, "") + sep + lastDecryptedName; const ab = await lastDecryptedBlob.arrayBuffer(); await api.writeBlob(fp, Array.from(new Uint8Array(ab))); }
  else { const r = await api.saveFile({ defaultName: lastDecryptedName, filters: [{ name: "All", extensions: ["*"] }] }); if (r.canceled || !r.filePath) return; fp = r.filePath; const ab = await lastDecryptedBlob.arrayBuffer(); await api.writeBlob(fp, Array.from(new Uint8Array(ab))); }
  lastDecryptedPath = fp; btnSaveFile.classList.add("hidden"); btnViewFile.classList.remove("hidden");
  setStatus("已保存: " + lastDecryptedName);
});

// ---- Decrypt drop ----
decryptMain.addEventListener("dragover", e => { e.preventDefault(); e.stopPropagation(); decryptMain.classList.add("drag-over"); });
decryptMain.addEventListener("dragleave", e => { e.preventDefault(); e.stopPropagation(); decryptMain.classList.remove("drag-over"); });
decryptMain.addEventListener("drop", async e => {
  e.preventDefault(); e.stopPropagation(); decryptMain.classList.remove("drag-over");
  const fs = e.dataTransfer?.files; if (!fs || !fs.length) return;
  cleanupLastDecrypted(); await handleDecryptFile(fs[0]);
});
decryptMain.addEventListener("click", () => {
  if (previewImg.classList.contains("hidden") && previewVideo.classList.contains("hidden")) {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*,video/*";
    inp.onchange = async () => { if (inp.files?.[0]) { cleanupLastDecrypted(); await handleDecryptFile(inp.files[0]); } };
    inp.click();
  }
});

// Clipboard paste support for decrypt panel
document.addEventListener("paste", async (e) => {
  if (!panelDecrypt.classList.contains("active")) return;
  const target = e.target as HTMLElement;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
  const items = e.clipboardData?.items; if (!items) return;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.startsWith("image/")) {
      e.preventDefault();
      const blob = items[i].getAsFile();
      if (!blob) continue;
      const file = new File([blob], "clipboard_" + Date.now() + ".png", { type: blob.type });
      cleanupLastDecrypted(); await handleDecryptFile(file);
      return;
    }
  }
});

async function handleDecryptFile(file: File) {
  decryptFile = file; hidePreview(); btnViewFile.classList.add("hidden");
  dropFileInfo.classList.remove("hidden"); dropFileName.textContent = file.name;
  setStatus("检测中...");
  let isImage = false;
  try { isImage = checkIsImageHeader(new Uint8Array(await file.arrayBuffer())); } catch { /* */ }
  decryptMode = await detectMode(file);
  const lb: Record<string, string> = { cspng100: "CSPNG100", duck: "Duck 隐写", scramble: "大番茄混淆", unknown: "?" };
  dropFileMode.textContent = lb[decryptMode] || decryptMode;

  if (decryptMode === "cspng100" || decryptMode === "duck") {
    decryptPasswordArea.classList.remove("hidden"); decryptPassword.value = ""; decryptPassword.focus();
    setStatus(lb[decryptMode] + " - 请输入密码（可选）");
  } else if (decryptMode === "scramble") {
    decryptPasswordArea.classList.add("hidden"); await executeDecrypt("");
  } else {
    decryptPasswordArea.classList.remove("hidden"); decryptPassword.value = "";
    dropFileMode.textContent = "未知格式";
    setStatus("未知格式 - 尝试输入密码或留空解密");
  }
}

btnDecrypt.addEventListener("click", () => executeDecrypt(decryptPassword.value));
decryptPassword.addEventListener("keydown", e => { if (e.key === "Enter") btnDecrypt.click(); });

async function executeDecrypt(pwd: string) {
  if (!decryptFile) return; showDecryptProgress();
  try {
    const img = await loadImageFromFile(decryptFile);
    let blob: Blob | null = null, name = "", type = "", size = 0;
    if (decryptMode === "cspng100") { const r = await decryptCSPNG100(img, pwd, (s, p) => setDecryptProgress(p, s), decryptFile!); blob = r.blob; name = r.name; type = r.type; size = r.size; }
    else if (decryptMode === "duck") { const r = await decryptDuckPNG(decryptFile!, pwd, (s, p) => setDecryptProgress(p, s)); blob = r.blob; name = r.name; type = r.type; size = r.size; }
    else { const r = await unscrambleImage(img, (s, p) => setDecryptProgress(p, s)); blob = r.blob; name = r.name; type = r.type; size = r.size; }
    if (!blob) throw new Error("decryption error");
    hideDecryptProgress();
    lastDecryptedBlob = blob; lastDecryptedName = name;
    showPreview(blob, name);

    const dir = savePathDisplay.value.trim();
    if (autoSaveEnabled && dir) {
      const sep = navigator.platform.toLowerCase().includes("win") ? "\\" : "/"; const fp = dir.replace(/[/\\]$/, "") + sep + name;
      const ab = await blob.arrayBuffer();
      const wr = await api.writeBlob(fp, Array.from(new Uint8Array(ab)));
      if (wr.success) { lastDecryptedPath = fp; setStatus("已保存: " + name); btnViewFile.classList.remove("hidden"); if (viewerEnabled) await api.openFile(fp); }
      else { setStatus("保存失败，请手动保存"); btnSaveFile.classList.remove("hidden"); btnViewFile.classList.add("hidden"); }
    } else {
      btnSaveFile.classList.remove("hidden"); btnViewFile.classList.remove("hidden");
      setStatus("解密成功 - " + formatSize(size) + " - 点击保存或查看");
    }
  } catch (err) { hideDecryptProgress(); cleanupLastDecrypted(); setStatus("失败: " + (err as Error).message); }
}

// ---- Encrypt ----
encryptDropZone.addEventListener("dragover", e => { e.preventDefault(); encryptDropZone.classList.add("drag-over"); });
encryptDropZone.addEventListener("dragleave", () => encryptDropZone.classList.remove("drag-over"));
encryptDropZone.addEventListener("drop", e => { e.preventDefault(); encryptDropZone.classList.remove("drag-over"); const f = e.dataTransfer?.files; if (f?.[0]) { encryptFile = f[0]; encryptFileName.textContent = f[0].name; encryptFileName.classList.remove("hidden"); setStatus("已选: " + f[0].name); } });
encryptDropZone.addEventListener("click", () => encryptFileInput.click());
encryptFileInput.addEventListener("change", () => { if (encryptFileInput.files?.[0]) { encryptFile = encryptFileInput.files[0]; encryptFileName.textContent = encryptFile.name; encryptFileName.classList.remove("hidden"); setStatus("已选: " + encryptFile.name); } });
encryptFileInput.accept = "image/*,video/*,.mp4,.webm,.mov,.avi,.mkv";

function getEncryptMode(): string {
  for (const r of encryptModeRadios) { if (r.checked) return r.value; }
  return "scramble";
}

// Mode switch: toggle Duck compress area and password field
encryptModeRadios.forEach(r => r.addEventListener("change", () => {
  const mode = getEncryptMode();
  duckCompressArea.classList.toggle("hidden", mode !== "duck");
  duckCopyWarning.classList.add("hidden"); btnCopyResult.disabled = false;
  if (mode === "scramble") {
    encryptPasswordLabel.textContent = "大番茄混淆无需密码";
    encryptPassword.value = ""; encryptPassword.disabled = true;
  } else {
    encryptPasswordLabel.textContent = "密码（可选）";
    encryptPassword.disabled = false;
  }
}));

// Initialize scramble as default
(function initEncryptMode() {
  duckCompressArea.classList.add("hidden");
  encryptPasswordLabel.textContent = "大番茄混淆无需密码";
  encryptPassword.disabled = true;
})();

function showEncryptOriginalPreview(file: File) {
  encryptOriginalPreview.classList.add("hidden");
  if (file.type.startsWith("image/")) {
    const url = URL.createObjectURL(file);
    encryptOriginalPreview.src = url;
    encryptOriginalPreview.classList.remove("hidden");
  }
}

btnEncrypt.addEventListener("click", async () => {
  if (!encryptFile) { setStatus("请选择文件"); return; }
  showEncryptProgress();
  try {
    const mode = getEncryptMode();
    let r: { dataUrl: string; width: number; height: number; payloadSize: number };
    let suffix = "";

    if (mode === "duck") {
      const compress = parseInt(duckCompressSelect.value) || 2;
      r = await encryptDuckPNG(encryptFile, encryptPassword.value, (s, p) => setEncryptProgress(p, s), compress);
      suffix = ".duck.png";
    } else {
      r = await scrambleImage(encryptFile, (s, p) => setEncryptProgress(p, s));
      suffix = ".scramble.png";
    }

    encryptProgress.classList.add("hidden");
    encryptResult.classList.remove("hidden");
    encryptResult.classList.remove("error");
    lastEncryptedDataUrl = r.dataUrl;
    lastEncryptedFileName = encryptFile.name + suffix;
    const modeLabel = mode === "duck" ? "Duck 隐写" : "大番茄混淆";
    encryptResultText.textContent = modeLabel + " 加密完成 | " + r.width + "x" + r.height + " | " + formatSize(r.payloadSize);
    encryptPreviewImg.src = r.dataUrl;
    encryptPreviewImg.classList.remove("hidden");
    if (mode === "scramble") {
      encryptPassword.disabled = true;
      encryptPasswordLabel.textContent = "大番茄混淆无需密码";
      btnCopyResult.disabled = false; duckCopyWarning.classList.add("hidden");
    }
    if (mode === "duck") { btnCopyResult.disabled = true; duckCopyWarning.classList.remove("hidden"); }
  } catch (err) {
    encryptProgress.classList.add("hidden");
    restoreEncryptUI();
    encryptResult.classList.remove("hidden");
    encryptResult.classList.add("error");
    encryptPreviewImg.classList.add("hidden");
    duckCopyWarning.classList.add("hidden"); btnCopyResult.disabled = false;
    encryptResultText.textContent = "失败: " + (err as Error).message;
  }
});

// Save result button
btnSaveResult.addEventListener("click", async () => {
  if (!lastEncryptedDataUrl || !lastEncryptedFileName) return;
  const dir = savePathDisplay.value.trim();
  let fp: string | null = null;
  if (autoSaveEnabled && dir) {
    const sep = navigator.platform.toLowerCase().includes("win") ? "\\" : "/"; fp = dir.replace(/[/\\]$/, "") + sep + lastEncryptedFileName;
    const wr = await api.writeFile(fp, lastEncryptedDataUrl);
    if (!wr.success) fp = null;
  } else {
    const r = await api.saveFile({ defaultName: lastEncryptedFileName, filters: [{ name: "PNG", extensions: ["png"] }] });
    if (!r.canceled && r.filePath) {
      const wr = await api.writeFile(r.filePath, lastEncryptedDataUrl);
      if (wr.success) fp = r.filePath;
    }
  }
  if (fp) {
    setStatus("已保存: " + lastEncryptedFileName);
    if (viewerEnabled) { const or = await api.openFile(fp); if (!or.success) setStatus("打开失败: " + (or.error || "未知错误")); }
  } else if (!autoSaveEnabled) {
    setStatus("已取消保存");
  } else {
    setStatus("保存失败");
  }
});

// Copy result image to clipboard
btnCopyResult.addEventListener("click", async () => {
  if (!lastEncryptedDataUrl) return;
  try {
    const base64 = lastEncryptedDataUrl.split(",")[1];
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const blob = new Blob([bytes], { type: "image/png" });
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob })
    ]);
    setStatus("已复制到剪贴板");
  } catch (err) {
    setStatus("复制失败: " + (err as Error).message);
  }
});

// Continue encrypt button
btnEncryptReset.addEventListener("click", () => {
  encryptFile = null;
  encryptResult.classList.add("hidden");
  encryptResult.classList.remove("error");
  encryptPreviewImg.classList.add("hidden");
  encryptPreviewImg.src = "";
  encryptOriginalPreview.classList.add("hidden");
  encryptOriginalPreview.src = "";
  encryptFileName.classList.add("hidden");
  encryptFileName.textContent = "";
  encryptPassword.value = "";
  lastEncryptedDataUrl = null;
  lastEncryptedFileName = null;
  btnCopyResult.disabled = false; duckCopyWarning.classList.add("hidden");
  // Restore encrypt UI
  restoreEncryptUI();
  const mode = getEncryptMode();
  if (mode === "scramble") {
    encryptPassword.value = ""; encryptPassword.disabled = true;
    encryptPasswordLabel.textContent = "大番茄混淆无需密码";
  } else {
    encryptPassword.disabled = false;
    encryptPasswordLabel.textContent = "密码（可选）";
  }
  setStatus("就绪 - 拖入或选择文件");
});

// Encrypt panel external links
$("#link-comfyui")!.addEventListener("click", (e) => { e.preventDefault(); api.openExternal("https://github.com/Miqingzi/likeshare"); });
$("#link-web-decode")!.addEventListener("click", (e) => { e.preventDefault(); api.openExternal("https://likehunyao.netlify.app/"); });

encryptPassword.addEventListener("keydown", e => { if (e.key === "Enter") btnEncrypt.click(); });

// ---- Image loading (with colorSpaceConversion: none for LSB preservation) ----
async function loadImageFromFile(f: File): Promise<HTMLImageElement> {
  // Use createImageBitmap with no color conversion to preserve raw LSB pixel data
  try {
    const bitmap = await createImageBitmap(f, { colorSpaceConversion: "none" });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/png");
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("decryption error"));
      i.src = dataUrl;
    });
  } catch {
    // Fallback: standard image loading
    return new Promise((res, rej) => {
      const i = new Image();
      const u = URL.createObjectURL(f);
      i.onload = () => { URL.revokeObjectURL(u); res(i); };
      i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("decryption error")); };
      i.src = u;
    });
  }
}

document.addEventListener("dragover", e => e.preventDefault());
document.addEventListener("drop", e => e.preventDefault());
setStatus("就绪");
