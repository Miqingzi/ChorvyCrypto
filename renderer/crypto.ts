/**
 * Chorvy Crypto - Canvas Safe Crypto Utility
 * CSPNG100 / Duck / 大番茄混?三大加密协议
 * 
 * CSPNG100: AES-256-GCM + 珍珠耳环少女隐写封面 + 文件尾追? * Duck: SS_tools 兼容的鸭子图 LSB 隐写 (支持 k=2/6/8)
 * 大番茄混? Hilbert 曲线像素重排 (仅图?
 */

import { EncryptedMetadata, DecryptedFile } from "./types";

// ======================== 基础工具 ========================

function writeUInt32BE(arr: Uint8Array, offset: number, value: number) {
  arr[offset] = (value >>> 24) & 0xff;
  arr[offset + 1] = (value >>> 16) & 0xff;
  arr[offset + 2] = (value >>> 8) & 0xff;
  arr[offset + 3] = value & 0xff;
}

function readUInt32BE(arr: Uint8Array, offset: number): number {
  return ((arr[offset] << 24) | (arr[offset + 1] << 16) | (arr[offset + 2] << 8) | arr[offset + 3]) >>> 0;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}

// SHA-256 (sync, for password hashing in Duck)
function sha256Sync(data: Uint8Array): Uint8Array {
  // Use Web Crypto if available (async), fallback to simple hash
  // For Duck header we need sync - use a simplified approach
  const encoder = new TextEncoder();
  // We'll handle this differently in Duck
  return new Uint8Array(32); // placeholder
}

// AES-GCM key derivation
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  const keyMaterial = await window.crypto.subtle.importKey("raw", passwordBytes, { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]);
  return window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

// XOR key stream for Duck (SS_tools compatible)
async function generateKeyStream(password: string, salt: Uint8Array, length: number): Promise<Uint8Array> {
  const data = new TextEncoder().encode(password + bytesToHex(salt));
  const out = new Uint8Array(length);
  let counter = 0;
  let written = 0;
  while (written < length) {
    const combined = new Uint8Array(data.length + String(counter).length);
    combined.set(data, 0);
    new TextEncoder().encodeInto(String(counter), combined.subarray(data.length));
    const hash = new Uint8Array(await window.crypto.subtle.digest("SHA-256", combined));
    const toWrite = Math.min(hash.length, length - written);
    out.set(hash.subarray(0, toWrite), written);
    written += toWrite;
    counter++;
  }
  return out;
}

// ======================== 视频 ?Binary PNG ========================

function bytesToBinaryImage(data: Uint8Array, width: number = 512): Promise<ImageData> {
  const pixels = Math.ceil(data.length / 3);
  const height = Math.ceil(pixels / width);
  const totalBytes = width * height * 3;
  const padded = new Uint8Array(totalBytes);
  padded.set(data, 0);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.createImageData(width, height);
  const d = imgData.data;
  for (let i = 0; i < width * height; i++) {
    d[i * 4] = padded[i * 3];
    d[i * 4 + 1] = padded[i * 3 + 1];
    d[i * 4 + 2] = padded[i * 3 + 2];
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return Promise.resolve(imgData);
}

function binaryImageToBytes(imgData: ImageData, originalLength: number): Uint8Array {
  const d = imgData.data;
  const total = imgData.width * imgData.height * 3;
  const bytes = new Uint8Array(Math.min(originalLength, total));
  for (let i = 0; i < bytes.length; i++) {
    const pixelIdx = Math.floor(i / 3) * 4;
    const channelIdx = i % 3;
    bytes[i] = d[pixelIdx + channelIdx];
  }
  return bytes;
}

async function canvasToPNGBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      const buf = await blob!.arrayBuffer();
      resolve(new Uint8Array(buf));
    }, "image/png");
  });
}

// ======================== CSPNG100 加密 ========================

export async function encryptAndEncodeToPNG(
  file: File, password: string,
  onProgress?: (step: string, percent: number) => void,
  extraMeta?: Partial<EncryptedMetadata>,
  coverDataUrl?: string
): Promise<{ dataUrl: string; width: number; height: number; payloadSize: number }> {
  onProgress?.("读取原始文件数据...", 10);
  const fileBuffer = await file.arrayBuffer();
  let fileBytes = new Uint8Array(fileBuffer);
  let origExt = file.name.split(".").pop() || "";
  let isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv)$/i.test(file.name);

  // Video ?binary PNG wrapping
  if (isVideo) {
    onProgress?.("processing...", 20);
    const imgData = await bytesToBinaryImage(fileBytes, 512);
    const canvas = document.createElement("canvas");
    canvas.width = imgData.width; canvas.height = imgData.height;
    canvas.getContext("2d")!.putImageData(imgData, 0, 0);
    const pngBytes = await canvasToPNGBytes(canvas);
    fileBytes = pngBytes;
    origExt = origExt + ".binpng";
  }

  const hasPassword = !!password;
  let salt = new Uint8Array(16);
  let iv = new Uint8Array(12);
  let ciphertext: Uint8Array;

  if (hasPassword) {
    onProgress?.("生成加密安全随机盐值与向量...", 25);
    salt = window.crypto.getRandomValues(new Uint8Array(16));
    iv = window.crypto.getRandomValues(new Uint8Array(12));
    onProgress?.("processing...", 40);
    const key = await deriveKey(password, salt);
    const ciphertextBuffer = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, fileBytes);
    ciphertext = new Uint8Array(ciphertextBuffer);
  } else {
    onProgress?.("无密码模式，直接编码...", 40);
    ciphertext = fileBytes;
  }

  onProgress?.("构建结构化头信息与元数据...", 65);
  const metadata: EncryptedMetadata = {
    name: file.name, type: file.type || "application/octet-stream",
    size: file.size, hasPassword,
    ...extraMeta
  };
  const encoder = new TextEncoder();
  const metadataBytes = encoder.encode(JSON.stringify(metadata));
  const metadataLength = metadataBytes.length;

  const payloadSize = 8 + 16 + 12 + 4 + metadataLength + ciphertext.length;
  const payload = new Uint8Array(payloadSize);
  payload.set(encoder.encode("CSPNG100"), 0);
  payload.set(salt, 8);
  payload.set(iv, 24);
  writeUInt32BE(payload, 36, metadataLength);
  payload.set(metadataBytes, 40);
  payload.set(ciphertext, 40 + metadataLength);

  const packed = new Uint8Array(4 + payloadSize);
  writeUInt32BE(packed, 0, payloadSize);
  packed.set(payload, 4);

  // 始终使用珍珠耳环少女隐写封面
  try {
    onProgress?.("processing...", 80);
    const coverUrl = new URL("../assets/images/girl_pearl_earring_1780013307983.png", import.meta.url).href;
    const coverResponse = await fetch(coverUrl);
    if (!coverResponse.ok) throw new Error("封面图片加载失败");
    const coverBlob = await coverResponse.blob();
    const coverBuffer = await coverBlob.arrayBuffer();
    const coverBytes = new Uint8Array(coverBuffer);

    onProgress?.("processing...", 90);
    const combinedSize = coverBytes.length + packed.length + 4 + 8;
    const combined = new Uint8Array(combinedSize);
    combined.set(coverBytes, 0);
    combined.set(packed, coverBytes.length);
    const lenOffset = coverBytes.length + packed.length;
    writeUInt32BE(combined, lenOffset, packed.length);
    combined.set(encoder.encode("CSPFOOT1"), lenOffset + 4);

    const combinedBlob = new Blob([combined], { type: "image/png" });
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(combinedBlob);
    });
    onProgress?.("加密完成", 100);
    return { dataUrl, width: 1024, height: 1024, payloadSize: packed.length };
  } catch (err) {
    throw new Error("CSPNG100 需要珍珠耳环少女封面图，但加载失? " + (err as Error).message);
  }
}

// ======================== CSPNG100 解密 ========================

export async function decryptPayload(
  payload: Uint8Array, password: string,
  onProgress?: (step: string, percent: number) => void
): Promise<DecryptedFile> {
  const decoder = new TextDecoder();
  if (payload.length < 40) throw new Error("payload 头部太短");

  const magic = decoder.decode(payload.subarray(0, 8));
  if (magic !== "CSPNG100") throw new Error("decryption error");

  const salt = payload.subarray(8, 24);
  const iv = payload.subarray(24, 36);
  const metadataLength = readUInt32BE(payload, 36);
  if (36 + 4 + metadataLength > payload.length) throw new Error("元数据头部损坏");

  onProgress?.("processing...", 60);
  const metadataBytes = payload.subarray(40, 40 + metadataLength);
  let metadata: EncryptedMetadata;
  try {
    metadata = JSON.parse(decoder.decode(metadataBytes));
  } catch (err) {
    throw new Error("元数?JSON 反序列化失败: " + (err as Error).message);
  }

  const ciphertext = payload.subarray(40 + metadataLength);

  if (!metadata.hasPassword) {
    onProgress?.("无密码资产，还原原始数据...", 90);
    let finalBytes = ciphertext;
    // Check if it's a binpng (video)
    if (metadata.name && /\.binpng$/i.test(metadata.name)) {
      onProgress?.("processing...", 95);
      finalBytes = await binpngToRawBytes(ciphertext);
    }
    const blob = new Blob([finalBytes], { type: metadata.type || "application/octet-stream" });
    onProgress?.("还原完成", 100);
    return { blob, name: metadata.name.replace(/\.binpng$/i, ""), type: metadata.type, size: metadata.size, ...metadata };
  }

  onProgress?.("派生解密密钥...", 75);
  const key = await deriveKey(password, salt);
  onProgress?.("processing...", 90);
  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    let decrypted = new Uint8Array(decryptedBuffer);
    if (metadata.name && /\.binpng$/i.test(metadata.name)) {
      onProgress?.("processing...", 95);
      decrypted = await binpngToRawBytes(decrypted);
    }
    onProgress?.("解密完成", 100);
    const blob = new Blob([decrypted], { type: metadata.type || "application/octet-stream" });
    return { blob, name: metadata.name.replace(/\.binpng$/i, ""), type: metadata.type, size: metadata.size, ...metadata };
  } catch {
    throw new Error("元数据头部损坏");
  }
}

async function binpngToRawBytes(binpngBytes: Uint8Array, originalSize?: number): Promise<Uint8Array> {
  // Decode binary PNG: each RGB pixel carries 3 bytes of raw data
  const blob = new Blob([binpngBytes], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("binpng load error"));
      i.src = url;
    });
    const w = img.naturalWidth, h = img.naturalHeight;
    const cvs = document.createElement("canvas");
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    // Read raw bytes from RGB pixels (each pixel = 3 bytes)
    const totalBytes = w * h * 3;
    const size = originalSize && originalSize > 0 && originalSize < totalBytes ? originalSize : totalBytes;
    const raw = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      const pixelIdx = Math.floor(i / 3) * 4;
      const channelIdx = i % 3;
      raw[i] = data[pixelIdx + channelIdx];
    }
    return raw;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function decodeAndDecryptFromPNG(
  imageElement: HTMLImageElement, password: string,
  onProgress?: (step: string, percent: number) => void
): Promise<DecryptedFile> {
  onProgress?.("processing...", 15);
  const width = imageElement.naturalWidth;
  const height = imageElement.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("decryption error");
  ctx.drawImage(imageElement, 0, 0);
  const imgData = ctx.getImageData(0, 0, width, height).data;

  onProgress?.("还原二进制字节流...", 35);
  const totalPixels = width * height;
  const packed = new Uint8Array(totalPixels * 3);
  for (let i = 0; i < totalPixels; i++) {
    const pi = i * 4, pk = i * 3;
    packed[pk] = imgData[pi]; packed[pk + 1] = imgData[pi + 1]; packed[pk + 2] = imgData[pi + 2];
  }

  if (packed.length < 4) throw new Error("图像数据异常");
  const payloadSize = readUInt32BE(packed, 0);
  if (payloadSize <= 0 || payloadSize + 4 > packed.length) throw new Error("decryption error");
  const payload = packed.subarray(4, 4 + payloadSize);
  return decryptPayload(payload, password, onProgress);
}

// CSPNG100 stego 解密 (文件尾追加模?
async function decryptCSPNG100FromStegoFile(
  file: File, password: string,
  onProgress?: (step: string, percent: number) => void
): Promise<DecryptedFile> {
  onProgress?.("读取隐写文件字节...", 10);
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12) throw new Error("文件太小");
  const tail = bytes.subarray(bytes.length - 8);
  if (new TextDecoder().decode(tail) !== "CSPFOOT1") throw new Error("decryption error");
  const lenOffset = bytes.length - 12;
  const packedLen = readUInt32BE(bytes, lenOffset);
  const packedStart = bytes.length - 12 - packedLen;
  if (packedStart < 0) throw new Error("CSPNG100 隐写数据溢出");
  const packed = bytes.subarray(packedStart, packedStart + packedLen);
  onProgress?.("提取隐写容器中的 payload...", 30);
  if (packed.length < 4) throw new Error("packed 数据太短");
  const payloadSize = readUInt32BE(packed, 0);
  const payload = packed.subarray(4, 4 + payloadSize);
  return decryptPayload(payload, password, onProgress);
}

// ======================== Duck 隐写 (SS_tools 兼容) ========================

const WATERMARK_SKIP_W_RATIO = 0.40;
const WATERMARK_SKIP_H_RATIO = 0.08;

function buildDuckImage(size: number, title: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Sky background
  ctx.fillStyle = "#99CCFF";
  ctx.fillRect(0, 0, size, size);

  // Water
  ctx.fillStyle = "#66AADD";
  ctx.fillRect(0, size * 0.78, size, size * 0.22);

  const s = size;
  // Body
  ctx.fillStyle = "#FFDF5E";
  ctx.strokeStyle = "#FFBE3C";
  ctx.lineWidth = Math.max(2, s * 0.008);
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.62, s * 0.28, s * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Head
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.33, s * 0.14, s * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Wing
  ctx.fillStyle = "#FFC846";
  ctx.beginPath();
  ctx.ellipse(s * 0.6, s * 0.6, s * 0.15, s * 0.1, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#FFBE3C";
  ctx.lineWidth = Math.max(1, s * 0.004);
  ctx.stroke();

  // Beak
  ctx.fillStyle = "#FF9933";
  ctx.strokeStyle = "#CC6600";
  ctx.lineWidth = Math.max(1, s * 0.003);
  ctx.beginPath();
  ctx.moveTo(s * 0.58, s * 0.28);
  ctx.lineTo(s * 0.72, s * 0.31);
  ctx.lineTo(s * 0.6, s * 0.36);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Eyes
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(s * 0.545, s * 0.28, s * 0.018, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.47, s * 0.28, s * 0.018, 0, Math.PI * 2);
  ctx.fill();

  // Eye shine
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(s * 0.55, s * 0.275, s * 0.006, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.475, s * 0.275, s * 0.006, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = "#CC8800";
  ctx.lineWidth = Math.max(1, s * 0.003);
  ctx.beginPath();
  ctx.arc(s * 0.5, s * 0.37, s * 0.05, 0.1, Math.PI - 0.1);
  ctx.stroke();

  // Title
  if (title) {
    ctx.fillStyle = "#000000";
    ctx.font = `bold ${Math.max(10, Math.floor(s * 0.045))}px sans-serif`;
    ctx.fillText(title.substring(0, 20), s * 0.06, s * 0.14);
  }

  // Version
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `${Math.max(8, Math.floor(s * 0.025))}px sans-serif`;
  ctx.fillText("V1.0", s * 0.44, s * 0.96);

  return canvas;
}

function requiredCanvasSize(bitLen: number, lsbBits: number): number {
  let side = 640;
  while (true) {
    const skipW = Math.floor(side * WATERMARK_SKIP_W_RATIO);
    const skipH = Math.floor(side * WATERMARK_SKIP_H_RATIO);
    const excluded = skipW * skipH;
    const usableBits = (side * side - excluded) * 3 * lsbBits;
    if (usableBits >= bitLen) return side;
    side += 64;
  }
}

function buildDuckFileHeader(raw: Uint8Array, password: string, ext: string): { header: Uint8Array; hasPwd: boolean } {
  const hasPwd = !!password;
  let cipher: Uint8Array;
  let salt = new Uint8Array(16);
  let pwdHash = new Uint8Array(32);

  if (hasPwd) {
    salt = window.crypto.getRandomValues(new Uint8Array(16));
    // Simple XOR with keystream placeholder - real encoding happens in encryptDuckPNG
    cipher = raw; // Will be XOR'd later
    // pwd_hash placeholder
    pwdHash = new Uint8Array(32);
  } else {
    cipher = raw;
  }

  const extBytes = new TextEncoder().encode(ext);
  const totalSize = 1 + (hasPwd ? 32 + 16 : 0) + 1 + extBytes.length + 4 + cipher.length;
  const header = new Uint8Array(totalSize);
  let idx = 0;
  header[idx++] = hasPwd ? 1 : 0;
  if (hasPwd) { header.set(pwdHash, idx); idx += 32; header.set(salt, idx); idx += 16; }
  header[idx++] = extBytes.length;
  header.set(extBytes, idx); idx += extBytes.length;
  writeUInt32BE(header, idx, cipher.length); idx += 4;
  header.set(cipher, idx);

  return { header, hasPwd };
}

async function buildDuckFileHeaderAsync(raw: Uint8Array, password: string, ext: string): Promise<Uint8Array> {
  const hasPwd = !!password;
  let payload: Uint8Array;
  let salt = new Uint8Array(16);
  let pwdHash = new Uint8Array(32);

  if (hasPwd) {
    salt = window.crypto.getRandomValues(new Uint8Array(16));
    const keystream = await generateKeyStream(password, salt, raw.length);
    payload = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) payload[i] = raw[i] ^ keystream[i];
    const hashInput = new TextEncoder().encode(password + bytesToHex(salt));
    pwdHash = new Uint8Array(await window.crypto.subtle.digest("SHA-256", hashInput));
  } else {
    payload = raw;
  }

  const extBytes = new TextEncoder().encode(ext);
  const totalSize = 1 + (hasPwd ? 32 + 16 : 0) + 1 + extBytes.length + 4 + payload.length;
  const header = new Uint8Array(totalSize);
  let idx = 0;
  header[idx++] = hasPwd ? 1 : 0;
  if (hasPwd) { header.set(pwdHash, idx); idx += 32; header.set(salt, idx); idx += 16; }
  header[idx++] = extBytes.length;
  header.set(extBytes, idx); idx += extBytes.length;
  writeUInt32BE(header, idx, payload.length); idx += 4;
  header.set(payload, idx);
  return header;
}

function embedPayloadLSB(canvas: HTMLCanvasElement, fileHeader: Uint8Array, lsbBits: number): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const w = canvas.width, h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  const skipW = Math.floor(w * WATERMARK_SKIP_W_RATIO);
  const skipH = Math.floor(h * WATERMARK_SKIP_H_RATIO);

  // Build bitstream: [4 bytes: headerLen] + [header]
  const lengthPrefix = new Uint8Array(4);
  writeUInt32BE(lengthPrefix, 0, fileHeader.length);
  const payloadWithLen = new Uint8Array(4 + fileHeader.length);
  payloadWithLen.set(lengthPrefix, 0);
  payloadWithLen.set(fileHeader, 4);

  const bits: number[] = [];
  for (let i = 0; i < payloadWithLen.length; i++) {
    for (let b = 7; b >= 0; b--) bits.push((payloadWithLen[i] >> b) & 1);
  }
  const bitLen = bits.length;
  const groups = Math.ceil(bitLen / lsbBits);
  const pad = groups * lsbBits - bitLen;

  const mask = (1 << lsbBits) - 1;
  let bitIdx = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y < skipH && x < skipW) continue;
      const px = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        if (bitIdx >= bitLen) {
          ctx.putImageData(imgData, 0, 0);
          // Copy data into skip area
          fillSkipArea(canvas, skipW, skipH);
          return;
        }
        let val = 0;
        for (let j = 0; j < lsbBits; j++) {
          if (bitIdx + j < bitLen) val |= bits[bitIdx + j] << (lsbBits - 1 - j);
        }
        d[px + c] = (d[px + c] & ~mask) | val;
        bitIdx += lsbBits;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
  fillSkipArea(canvas, skipW, skipH);
}

function fillSkipArea(canvas: HTMLCanvasElement, skipW: number, skipH: number): void {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  if (skipW <= 0 || skipH <= 0 || skipW >= w) return;
  const srcW = w - skipW;
  if (srcW <= 0) return;
  // Tile the adjacent right-side pixels into the skip area
  for (let y = 0; y < skipH; y++) {
    const srcY = y;
    const srcX = skipW;
    const imgData = ctx.getImageData(srcX, srcY, skipW, 1);
    ctx.putImageData(imgData, 0, y);
  }
}

// ======================== Duck 加密 ========================

export async function encryptAndEncodeToDuckPNG(
  file: File, password: string,
  onProgress?: (step: string, percent: number) => void,
  compress: number = 2
): Promise<{ dataUrl: string; width: number; height: number; payloadSize: number }> {
  onProgress?.("读取原始文件数据...", 10);
  const fileBuffer = await file.arrayBuffer();
  let fileBytes = new Uint8Array(fileBuffer);
  let ext = file.name.split(".").pop() || "bin";
  let isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv)$/i.test(file.name);

  if (isVideo) {
    onProgress?.("processing...", 20);
    const imgData = await bytesToBinaryImage(fileBytes, 512);
    const cvs = document.createElement("canvas");
    cvs.width = imgData.width; cvs.height = imgData.height;
    cvs.getContext("2d")!.putImageData(imgData, 0, 0);
    fileBytes = await canvasToPNGBytes(cvs);
    ext = ext + ".binpng";
  }

  onProgress?.("processing...", 40);
  const fileHeader = await buildDuckFileHeaderAsync(fileBytes, password, ext);

  const lsbBits = compress >= 8 ? 8 : (compress >= 6 ? 6 : 2);
  const bitLen = (fileHeader.length + 4) * 8;
  const size = requiredCanvasSize(bitLen, lsbBits);

  onProgress?.("processing...", 70);
  const canvas = buildDuckImage(size, file.name);

  onProgress?.("LSB 隐写嵌入...", 85);
  embedPayloadLSB(canvas, fileHeader, lsbBits);

  onProgress?.("processing...", 95);
  // SS_tools compatible: save canvas PNG directly, no footer
  const dataUrl = await new Promise<string>((resolve) => {
    canvas.toBlob((blob) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob!);
    }, "image/png");
  });

  onProgress?.("加密完成", 100);
  return { dataUrl, width: size, height: size, payloadSize: fileHeader.length };
}

// ======================== Duck 解密 ========================

export async function decodeAndDecryptDuckPNG(
  source: HTMLImageElement | HTMLCanvasElement, password: string,
  onProgress?: (step: string, percent: number) => void
): Promise<DecryptedFile> {
  onProgress?.("processing...", 15);
  let width: number, height: number, imgData: Uint8ClampedArray;
  if (source instanceof HTMLCanvasElement) {
    width = source.width;
    height = source.height;
    const ctx = source.getContext("2d", { willReadFrequently: true })!;
    if (!ctx) throw new Error("decryption error");
    imgData = ctx.getImageData(0, 0, width, height).data;
  } else {
    width = source.naturalWidth;
    height = source.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.imageSmoothingEnabled = false;
    if (!ctx) throw new Error("decryption error");
    ctx.drawImage(source, 0, 0);
    imgData = ctx.getImageData(0, 0, width, height).data;
  }

  const skipW = Math.floor(width * WATERMARK_SKIP_W_RATIO);
  const skipH = Math.floor(height * WATERMARK_SKIP_H_RATIO);

  // Collect active channel values (non-skip area)
  console.error("[duck decode] img=" + width + "x" + height + " skip=" + skipW + "x" + skipH);
  const activeChannels: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (y < skipH && x < skipW) continue;
      const idx = (y * width + x) * 4;
      activeChannels.push(imgData[idx], imgData[idx + 1], imgData[idx + 2]);
    }
  }

  // Try k = 2, 6, 8
  let finalData: Uint8Array | null = null;
  let finalName = `duck_recovered_${Date.now()}`;
  let finalType = "application/octet-stream";
  let finalExt = "";
  let lastError: any = null;

  const triedKs: number[] = [];
  for (const k of [2, 6, 8]) {
    triedKs.push(k);
    try {
      const result = await extractDuckPayloadAsync(activeChannels, k, password);
      if (result) {
        finalData = result.data;
        finalExt = result.ext;
        finalType = getMimeFromExt(result.ext);
        finalName = `duck_recovered_${Date.now()}.${result.ext}`;
        break;
      }
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  if (!finalData) {
    throw new Error("Duck decode failed (tried k=" + triedKs.join(",") + "): " + ((lastError as Error)?.message || "no readable data"));
  }

  // Check for binpng (video)
  if (finalExt.toLowerCase().endsWith(".binpng")) {
    try {
      finalData = await binpngToRawBytes(finalData);
      finalExt = finalExt.slice(0, -7) || "mp4";
      finalName = `duck_recovered_${Date.now()}.${finalExt}`;
      finalType = getMimeFromExt(finalExt);
    } catch (err) {
      throw new Error("无法还原视频: " + (err as Error).message);
    }
  }

  onProgress?.("解密完成", 100);
  return {
    blob: new Blob([finalData], { type: finalType }),
    name: finalName, type: finalType, size: finalData.length,
    comfyNodeMode: true
  };
}

// Two-pass streaming bit extraction for large images (50MB+)
// Pass 1: extract header bits only (32 + maxHeaderBits)
// Pass 2: extract remaining data bits directly into output buffer
const MAX_HEADER_BITS = 32 + 350 * 8; // 32-bit length prefix + max 350-byte header

interface PixelIterator {
  nextBits(count: number): Uint8Array | null; // returns null if not enough remaining bits
  skipBits(count: number): boolean;
  remainingBits(): number;
}

function createPixelIterator(
  imgData: Uint8ClampedArray, width: number, height: number,
  skipW: number, skipH: number, k: number
): PixelIterator {
  const mask = (1 << k) - 1;
  let x = skipW, y = skipH > 0 ? 0 : 0; // start at first non-skip pixel
  if (y === 0 && skipH > 0 && skipW > 0) {
    // First row: start after skip area
    if (skipW >= width) { y = skipH; x = 0; }
  }
  // Estimate total
  const activePixels = width * height - Math.min(skipW, width) * Math.min(skipH, height);
  let remaining = activePixels * 3 * k;
  // Pre-calculate actual remaining by counting accessible pixels
  let actualPixels = 0;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      if (py < skipH && px < skipW) continue;
      actualPixels++;
    }
  }
  remaining = actualPixels * 3 * k;
  let pixelIdx = 0;
  // Pre-build index of non-skip pixel positions
  const positions = new Uint32Array(actualPixels); // stores base index into imgData
  let pi = 0;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      if (py < skipH && px < skipW) continue;
      positions[pi++] = (py * width + px) * 4;
    }
  }
  let posIdx = 0;
  let chIdx = 0; // 0=R, 1=G, 2=B
  let bitPos = k; // current bit position within channel (k..1, 0 means next channel)

  return {
    nextBits(count: number): Uint8Array | null {
      if (count > remaining) return null;
      const result = new Uint8Array(count);
      let written = 0;
      while (written < count) {
        if (bitPos >= k) {
          // Move to next channel
          if (chIdx >= 3) {
            chIdx = 0;
            posIdx++;
            if (posIdx >= positions.length) break;
          }
          const base = positions[posIdx];
          const ch = imgData[base + chIdx] & mask;
          // Pre-extract bits for this channel
          bitPos = 0;
          // Write bits to a temp buffer then copy
          for (let b = k - 1; b >= 0 && written < count; b--) {
            result[written++] = (ch >> b) & 1;
          }
          chIdx++;
          if (written >= count) break;
          bitPos = k; // force next channel
          continue;
        }
        // Shouldn"t reach here
        break;
      }
      remaining -= written;
      return result.subarray(0, written);
    },
    skipBits(count: number): boolean {
      // Skip by advancing through channels
      const channelsToSkip = Math.ceil(count / k);
      let skipped = 0;
      while (skipped < channelsToSkip && posIdx < positions.length) {
        chIdx++;
        skipped++;
        if (chIdx >= 3) { chIdx = 0; posIdx++; }
      }
      const bitsSkipped = Math.min(skipped * k, count);
      remaining -= bitsSkipped;
      return bitsSkipped >= count;
    },
    remainingBits(): number { return remaining; }
  };
}

// Extract full header+payload bytes from pixel data (tiled for 50MB+ images)
function extractFullPayloadFromPixelsTiled(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  skipW: number, skipH: number, k: number
): Uint8Array | null {
  const mask = (1 << k) - 1;
  const TILE_H = 256; // read 256 rows at a time
  // Phase 1: read first 32 bits from tiles
  const lenBits: number[] = [];
  for (let ty = 0; ty < height && lenBits.length < 32; ty += TILE_H) {
    const th = Math.min(TILE_H, height - ty);
    const tile = ctx.getImageData(0, ty, width, th).data;
    for (let y = 0; y < th && lenBits.length < 32; y++) {
      for (let x = 0; x < width && lenBits.length < 32; x++) {
        if ((ty + y) < skipH && x < skipW) continue;
        const base = (y * width + x) * 4;
        for (let c = 0; c < 3 && lenBits.length < 32; c++) {
          const ch = tile[base + c] & mask;
          for (let b = k - 1; b >= 0 && lenBits.length < 32; b--) {
            lenBits.push((ch >> b) & 1);
          }
        }
      }
    }
  }
  if (lenBits.length < 32) return null;
  let headerLen = 0;
  for (let i = 0; i < 32; i++) headerLen = (headerLen << 1) | lenBits[i];
  if (headerLen <= 0 || headerLen > 100 * 1024 * 1024) return null;

  // Phase 2: extract headerLen bytes using tiles
  const totalBitsNeeded = 32 + headerLen * 8;
  const headerBytes = new Uint8Array(headerLen);
  let bitPos = 0;
  let byteIdx = 0;
  let byteVal = 0;
  let byteBit = 0;

  outer:
  for (let ty = 0; ty < height && byteIdx < headerLen; ty += TILE_H) {
    const th = Math.min(TILE_H, height - ty);
    const tile = ctx.getImageData(0, ty, width, th).data;
    for (let y = 0; y < th && byteIdx < headerLen; y++) {
      for (let x = 0; x < width && byteIdx < headerLen; x++) {
        if ((ty + y) < skipH && x < skipW) continue;
        const base = (y * width + x) * 4;
        for (let c = 0; c < 3 && byteIdx < headerLen; c++) {
          const ch = tile[base + c] & mask;
          for (let b = k - 1; b >= 0 && byteIdx < headerLen; b--) {
            if (bitPos >= 32) {
              byteVal = (byteVal << 1) | ((ch >> b) & 1);
              byteBit++;
              if (byteBit >= 8) {
                headerBytes[byteIdx++] = byteVal;
                byteVal = 0;
                byteBit = 0;
              }
            }
            bitPos++;
            if (bitPos >= totalBitsNeeded) break outer;
          }
        }
      }
    }
  }
  if (byteIdx !== headerLen) return null;
  return headerBytes;
}

// Extract full header+payload bytes from pixel data (handles any size - 50MB+)
// Two-phase: first 32 bits give headerLen, then extract headerLen bytes
function extractFullPayloadFromPixels(
  imgData: Uint8ClampedArray, width: number, height: number,
  skipW: number, skipH: number, k: number
): Uint8Array | null {
  const mask = (1 << k) - 1;
  // Phase 1: read first 32 bits to get headerLen
  const lenBits: number[] = [];
  let pixelCount = 0;
  for (let y = 0; y < height && lenBits.length < 32; y++) {
    for (let x = 0; x < width && lenBits.length < 32; x++) {
      if (y < skipH && x < skipW) continue;
      const base = (y * width + x) * 4;
      for (let c = 0; c < 3 && lenBits.length < 32; c++) {
        const ch = imgData[base + c] & mask;
        for (let b = k - 1; b >= 0 && lenBits.length < 32; b--) {
          lenBits.push((ch >> b) & 1);
        }
      }
      pixelCount++;
    }
  }
  if (lenBits.length < 32) return null;
  let headerLen = 0;
  for (let i = 0; i < 32; i++) headerLen = (headerLen << 1) | lenBits[i];
  if (headerLen <= 0 || headerLen > 100 * 1024 * 1024) return null;

  // Phase 2: extract headerLen bytes (skip the first 32 bits, read next headerLen*8 bits)
  const totalBitsNeeded = 32 + headerLen * 8;
  const headerBytes = new Uint8Array(headerLen);
  let bitPos = 0; // position after the 32-bit prefix
  let byteIdx = 0;
  let byteVal = 0;
  let byteBit = 0;
  let started = false; // haven"t started collecting data bits yet

  outer:
  for (let y = 0; y < height && byteIdx < headerLen; y++) {
    for (let x = 0; x < width && byteIdx < headerLen; x++) {
      if (y < skipH && x < skipW) continue;
      const base = (y * width + x) * 4;
      for (let c = 0; c < 3 && byteIdx < headerLen; c++) {
        const ch = imgData[base + c] & mask;
        for (let b = k - 1; b >= 0 && byteIdx < headerLen; b--) {
          if (bitPos >= 32) {
            byteVal = (byteVal << 1) | ((ch >> b) & 1);
            byteBit++;
            if (byteBit >= 8) {
              headerBytes[byteIdx++] = byteVal;
              byteVal = 0;
              byteBit = 0;
            }
          }
          bitPos++;
          if (bitPos >= totalBitsNeeded) break outer;
        }
      }
    }
  }
  if (byteIdx !== headerLen) return null;
  return headerBytes;
}

// Extract data payload bits from pixels into output buffer (skipping header bits)
function extractDataFromPixels(
  imgData: Uint8ClampedArray, width: number, height: number,
  skipW: number, skipH: number, k: number,
  headerBitLen: number, dataByteLen: number
): Uint8Array | null {
  const mask = (1 << k) - 1;
  const totalSkipBits = headerBitLen;
  const totalNeededBits = dataByteLen * 8;
  const out = new Uint8Array(dataByteLen);
  let bitPos = 0; // global bit counter
  let byteIdx = 0;
  let byteVal = 0;
  let byteBit = 0;
  for (let y = 0; y < height && byteIdx < dataByteLen; y++) {
    for (let x = 0; x < width && byteIdx < dataByteLen; x++) {
      if (y < skipH && x < skipW) continue;
      const base = (y * width + x) * 4;
      for (let c = 0; c < 3 && byteIdx < dataByteLen; c++) {
        const ch = imgData[base + c] & mask;
        for (let b = k - 1; b >= 0 && byteIdx < dataByteLen; b--) {
          if (bitPos >= totalSkipBits) {
            byteVal = (byteVal << 1) | ((ch >> b) & 1);
            byteBit++;
            if (byteBit >= 8) {
              out[byteIdx++] = byteVal;
              byteVal = 0;
              byteBit = 0;
            }
          }
          bitPos++;
        }
      }
    }
  }
  return byteIdx === dataByteLen ? out : null;
}

async function parseBitsToHeaderAsync(
  bits: Uint8Array, password: string
): Promise<{ data: Uint8Array; ext: string } | null> {
  if (bits.length < 32) return null;
  // Read header length (first 32 bits, big-endian)
  let headerLen = 0;
  for (let i = 0; i < 32; i++) headerLen = (headerLen << 1) | bits[i];
  if (headerLen <= 0 || headerLen > 100 * 1024 * 1024) return null;

  const headerByteCount = headerLen;
  const totalNeededBits = 32 + headerByteCount * 8;
  if (bits.length < totalNeededBits) return null;

  // Extract header bytes
  const headerBytes = new Uint8Array(headerByteCount);
  for (let i = 0; i < headerByteCount; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) byteVal = (byteVal << 1) | bits[32 + i * 8 + b];
    headerBytes[i] = byteVal;
  }

  return parseDuckHeaderAsync(headerBytes, password);
}

async function extractDuckPayloadAsync(channels: number[], k: number, password: string): Promise<{ data: Uint8Array; ext: string } | null> {
  // Extract LSBs
  const bits: number[] = [];
  const mask = (1 << k) - 1;
  for (const ch of channels) {
    for (let b = k - 1; b >= 0; b--) {
      bits.push((ch >> b) & 1);
    }
  }

  // First 32 bits = header length
  if (bits.length < 32) return null;
  let headerLen = 0;
  for (let i = 0; i < 32; i++) headerLen = (headerLen << 1) | bits[i];
  if (headerLen <= 0 || headerLen > 100 * 1024 * 1024) return null;

  const headerByteCount = headerLen;
  const totalNeededBits = 32 + headerByteCount * 8;
  if (bits.length < totalNeededBits) return null;

  // Extract header bytes
  console.error("[duck decode] k=" + k + " headerLen=" + headerLen + " bitsLen=" + bits.length);
  const headerBytes = new Uint8Array(headerByteCount);
  for (let i = 0; i < headerByteCount; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) byteVal = (byteVal << 1) | bits[32 + i * 8 + b];
    headerBytes[i] = byteVal;
  }

  return await parseDuckHeaderAsync(headerBytes, password);
}

async function parseDuckHeaderAsync(header: Uint8Array, password: string): Promise<{ data: Uint8Array; ext: string }> {
  if (header.length < 6) throw new Error("Duck header too short");
  let idx = 0;
  const hasPwd = header[idx++] === 1;
  console.error("[duck parse] hasPwd=" + hasPwd + " headerLen=" + header.length);

  let salt = new Uint8Array(16);
  let pwdHash = new Uint8Array(32);
  if (hasPwd) {
    if (header.length < 1 + 32 + 16 + 1) throw new Error("Duck header truncated (pwd)");
    pwdHash.set(header.subarray(idx, idx + 32)); idx += 32;
    salt.set(header.subarray(idx, idx + 16)); idx += 16;
  }

  const extLen = header[idx++];
  if (header.length < idx + extLen + 4) throw new Error("Duck header truncated (ext)");
  const ext = new TextDecoder().decode(header.subarray(idx, idx + extLen));
  idx += extLen;

  const dataLen = readUInt32BE(header, idx); idx += 4;
  console.error("[duck parse] extLen=" + extLen + " ext=" + ext + " dataLen=" + dataLen + " headerLen=" + header.length);
  if (header.length < idx + dataLen) throw new Error("Duck header truncated (data)");

  let payload = header.subarray(idx, idx + dataLen);

  if (hasPwd) {
    if (!password) throw new Error("decryption error");
    // Verify password hash using SHA-256(password + hex(salt))
    const hashInput = new TextEncoder().encode(password + bytesToHex(salt));
    const computedHash = new Uint8Array(await window.crypto.subtle.digest("SHA-256", hashInput));
    if (computedHash.length !== pwdHash.length) throw new Error("decryption error");
    for (let i = 0; i < computedHash.length; i++) {
      if (computedHash[i] !== pwdHash[i]) throw new Error("decryption error");
    }
    // XOR decrypt with keystream
    const keystream = await generateKeyStream(password, salt, payload.length);
    const decrypted = new Uint8Array(payload.length);
    for (let i = 0; i < payload.length; i++) decrypted[i] = payload[i] ^ keystream[i];
    payload = decrypted;
  }

  return { data: payload, ext: ext.replace(/^\./, "") };
}

function getMimeFromExt(ext: string): string {
  const m: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", bmp: "image/bmp",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", avi: "video/x-msvideo",
    mp3: "audio/mpeg", wav: "audio/wav",
    txt: "text/plain", pdf: "application/pdf", zip: "application/zip",
    bin: "application/octet-stream", binpng: "image/png"
  };
  return m[ext.toLowerCase()] || "application/octet-stream";
}

// ======================== 大番茄混?(Scramble) ========================

function getHilbertPositions(width: number, height: number): Int32Array {
  const total = width * height;
  const positions = new Int32Array(total);
  let pos = 0;

  function generate2d(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
    const w = Math.abs(ax + ay), h = Math.abs(bx + by);
    const dax = Math.sign(ax) | 0, day = Math.sign(ay) | 0, dbx = Math.sign(bx) | 0, dby = Math.sign(by) | 0;
    if (h === 1) { for (let i = 0; i < w; i++) { positions[pos++] = x + y * width; x += dax; y += day; } return; }
    if (w === 1) { for (let i = 0; i < h; i++) { positions[pos++] = x + y * width; x += dbx; y += dby; } return; }
    let ax2 = Math.floor(ax / 2), ay2 = Math.floor(ay / 2), bx2 = Math.floor(bx / 2), by2 = Math.floor(by / 2);
    const w2 = Math.abs(ax2 + ay2), h2 = Math.abs(bx2 + by2);
    if (2 * w > 3 * h) {
      if ((w2 & 1) === 1 && w > 2) { ax2 += dax; ay2 += day; }
      generate2d(x, y, ax2, ay2, bx, by);
      generate2d(x + ax2, y + ay2, ax - ax2, ay - ay2, bx, by);
    } else {
      if ((h2 & 1) === 1 && h > 2) { bx2 += dbx; by2 += dby; }
      generate2d(x, y, bx2, by2, ax2, ay2);
      generate2d(x + bx2, y + by2, ax, ay, bx - bx2, by - by2);
      generate2d(x + (ax - dax) + (bx2 - dbx), y + (ay - day) + (by2 - dby), -bx2, -by2, -(ax - ax2), -(ay - ay2));
    }
  }
  if (width >= height) generate2d(0, 0, width, 0, 0, height);
  else generate2d(0, 0, 0, height, width, 0);
  return positions;
}

export async function scrambleImage(
  file: File, onProgress?: (step: string, percent: number) => void
): Promise<{ dataUrl: string; width: number; height: number; payloadSize: number }> {
  onProgress?.("加载原始图像参数...", 20);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const width = img.naturalWidth, height = img.naturalHeight;
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const srcData = ctx.getImageData(0, 0, width, height).data;
        const destData = ctx.createImageData(width, height).data;
        for (let i = 0; i < destData.length; i += 4) destData[i + 3] = 255;

        const total = width * height;
        if (total < 1) { resolve({ dataUrl: canvas.toDataURL("image/png"), width, height, payloadSize: 0 }); return; }

        onProgress?.("计算 Hilbert 空间重排序列...", 50);
        const positions = getHilbertPositions(width, height);
        const FIXED_KEY = 1.0;
        const GOLDEN_RATIO_CONJ = (Math.sqrt(5.0) - 1.0) / 2.0;
        const offset = Math.round(GOLDEN_RATIO_CONJ * total * FIXED_KEY);
        const loopPos = total - offset;

        onProgress?.("重构无损物理像素切片...", 75);
        for (let i = 0; i < loopPos; i++) {
          const si = positions[i] * 4, di = positions[i + offset] * 4;
          destData[di] = srcData[si]; destData[di + 1] = srcData[si + 1]; destData[di + 2] = srcData[si + 2]; destData[di + 3] = srcData[si + 3];
        }
        for (let i = loopPos; i < total; i++) {
          const si = positions[i] * 4, di = positions[i - loopPos] * 4;
          destData[di] = srcData[si]; destData[di + 1] = srcData[si + 1]; destData[di + 2] = srcData[si + 2]; destData[di + 3] = srcData[si + 3];
        }

        ctx.putImageData(new ImageData(destData, width, height), 0, 0);
        onProgress?.("输出无损打乱图片...", 95);
        const dataUrl = canvas.toDataURL("image/png");
        resolve({ dataUrl, width, height, payloadSize: total });
      };
      img.onerror = (err) => reject(new Error("图像导入失败: " + String(err)));
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(new Error("文件转换失败: " + String(err)));
    reader.readAsDataURL(file);
  });
}

export async function unscrambleImage(
  imageElement: HTMLImageElement, onProgress?: (step: string, percent: number) => void
): Promise<DecryptedFile> {
  onProgress?.("提取空间物理分辨率像素层...", 15);
  const width = imageElement.naturalWidth, height = imageElement.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(imageElement, 0, 0);
  const srcData = ctx.getImageData(0, 0, width, height).data;
  const destData = ctx.createImageData(width, height).data;
  for (let i = 0; i < destData.length; i += 4) destData[i + 3] = 255;

  const total = width * height;
  if (total >= 1) {
    onProgress?.("processing...", 50);
    const positions = getHilbertPositions(width, height);
    const FIXED_KEY = 1.0;
    const GOLDEN_RATIO_CONJ = (Math.sqrt(5.0) - 1.0) / 2.0;
    const offset = Math.round(GOLDEN_RATIO_CONJ * total * FIXED_KEY);
    const loopPos = total - offset;

    onProgress?.("重构无损物理像素切片 (Reverse Golden Ratio)...", 75);
    for (let i = 0; i < loopPos; i++) {
      const di = positions[i] * 4, si = positions[i + offset] * 4;
      destData[di] = srcData[si]; destData[di + 1] = srcData[si + 1]; destData[di + 2] = srcData[si + 2]; destData[di + 3] = srcData[si + 3];
    }
    for (let i = loopPos; i < total; i++) {
      const di = positions[i] * 4, si = positions[i - loopPos] * 4;
      destData[di] = srcData[si]; destData[di + 1] = srcData[si + 1]; destData[di + 2] = srcData[si + 2]; destData[di + 3] = srcData[si + 3];
    }
  }
  ctx.putImageData(new ImageData(destData, width, height), 0, 0);
  onProgress?.("processing...", 85);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error("无法输出还原图像")); return; }
      resolve({ blob, name: `unscrambled_${Date.now()}.png`, type: "image/png", size: blob.size });
    }, "image/png");
  });
}

// ======================== 检?& 类型 ========================

export type CryptoMode = "cspng100" | "duck" | "scramble" | "unknown";

function checkImageHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return true;
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return true;
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true;
  if (bytes[0] === 0x42 && bytes[1] === 0x4D) return true;
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes.length > 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return true;
  return false;
}

export async function detectMode(file: File): Promise<CryptoMode> {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 8) return "unknown";
    if (!checkImageHeader(bytes)) return "unknown";

    // CSPNG100 footer detection (CSPFOOT1 marker in last ~128 bytes)
    if (bytes.length > 12) {
      const searchEnd = Math.min(bytes.length, 128);
      const tailStr = new TextDecoder().decode(bytes.subarray(bytes.length - searchEnd));
      if (tailStr.includes("CSPFOOT1")) return "cspng100";
    }

    // Pixel-based CSPNG100 detection (embedded magic bytes)
    const detected = await detectFromPixels(file);
    if (detected !== "unknown") return detected;

    // Duck detection: square image + watermark corner pattern (SS_tools compatible, no footer)
    const duckCheck = await detectDuckFromPixels(file);
    if (duckCheck) return "duck";

    // Fallback: unknown image, default to scramble for pixel-rearranged images
    return "scramble";
  } catch {
    return "unknown";
  }
}

// Duck-specific pixel detection: square image + watermark region pattern
async function detectDuckFromPixels(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth, h = img.naturalHeight;
      // Duck images are always square, size multiple of 64 starting from 640
      if (w !== h) { resolve(false); return; }
      if (w < 640) { resolve(false); return; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) { resolve(false); return; }
      ctx.drawImage(img, 0, 0);
      // SS_tools Duck watermark area is filled with sky-blue pixels copied from adjacent area
      // Check: watermark corner is NOT black/transparent (it should be filled with content)
      const corner = ctx.getImageData(0, 0, 1, 1).data;
      const isFilledCorner = corner[3] > 200 && (corner[0] > 20 || corner[1] > 20 || corner[2] > 20);
      if (!isFilledCorner) { resolve(false); return; }
      // Check: center area should be colorful (duck body is yellow, ~R255 G223 B94)
      const midX = Math.floor(w * 0.5), midY = Math.floor(h * 0.55);
      const mid = ctx.getImageData(midX, midY, 1, 1).data;
      const isColorfulMiddle = (mid[0] > 120 || mid[1] > 120 || mid[2] > 120) && mid[3] > 200;
      if (!isColorfulMiddle) { resolve(false); return; }
      // Watermark fill check: pixel at (0, y) should have similar color to pixel at (skipW, y)
      const skipW = Math.floor(w * 0.40);
      const skipH = Math.floor(h * 0.08);
      const testY = Math.floor(skipH / 2);
      const left = ctx.getImageData(0, testY, 1, 1).data;
      const right = ctx.getImageData(Math.min(skipW, w-1), testY, 1, 1).data;
      const colorDiff = Math.abs(left[0]-right[0]) + Math.abs(left[1]-right[1]) + Math.abs(left[2]-right[2]);
      // If watermark was filled by copying from right, colors should be similar (diff < 60)
      const isWatermarkFillMatch = colorDiff < 60;
      resolve(isFilledCorner && isColorfulMiddle && isWatermarkFillMatch);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
}

async function detectFromPixels(file: File): Promise<CryptoMode> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth, h = img.naturalHeight;
      if (w < 2 || h < 2) { resolve("unknown"); return; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve("unknown"); return; }
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, Math.min(w, 100), Math.min(h, 1)).data;
      const magicBytes: number[] = [];
      for (let i = 0; i < Math.min(data.length, 12 * 4); i += 4) {
        magicBytes.push(data[i], data[i + 1], data[i + 2]);
      }
      const magic = new TextDecoder().decode(new Uint8Array(magicBytes.slice(4, 12)));
      if (magic === "CSPNG100") { resolve("cspng100"); return; }
      resolve("unknown");
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve("unknown"); };
    img.src = url;
  });
}

// ======================== 兼容包装 ========================

export async function decryptCSPNG100(
  imageElement: HTMLImageElement, password: string,
  onProgress?: (step: string, percent: number) => void,
  rawFile?: File
): Promise<DecryptedFile> {
  if (rawFile) {
    try {
      const buffer = await rawFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (bytes.length >= 8) {
        const tail = bytes.subarray(bytes.length - 8);
        if (new TextDecoder().decode(tail) === "CSPFOOT1") {
          return decryptCSPNG100FromStegoFile(rawFile, password, onProgress);
        }
      }
    } catch { /* fall through */ }
  }
  return decodeAndDecryptFromPNG(imageElement, password, onProgress);
}

export async function decryptDuckPNG(
  imageElement: HTMLImageElement | File, password: string,
  onProgress?: (step: string, percent: number) => void
): Promise<DecryptedFile> {
  if (imageElement instanceof File) {
    // Load as Image first (browser handles PNG decode correctly for sRGB)
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      const u = URL.createObjectURL(imageElement);
      i.onload = () => { URL.revokeObjectURL(u); res(i); };
      i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("decryption error")); };
      i.src = u;
    });
    return decodeAndDecryptDuckPNG(img, password, onProgress);
  }
  return decodeAndDecryptDuckPNG(imageElement, password, onProgress);
}

export async function encryptCSPNG100(
  file: File, password: string,
  onProgress?: (step: string, percent: number) => void,
  coverDataUrl?: string
): Promise<{ dataUrl: string; width: number; height: number; payloadSize: number }> {
  return encryptAndEncodeToPNG(file, password, onProgress, undefined, coverDataUrl);
}

export async function encryptDuckPNG(
  file: File, password: string,
  onProgress?: (step: string, percent: number) => void,
  compress: number = 2
): Promise<{ dataUrl: string; width: number; height: number; payloadSize: number }> {
  return encryptAndEncodeToDuckPNG(file, password, onProgress, compress);
}

// ======================== GitHub Reference ========================
export const GITHUB_SOURCE_CODE = [
  "/**",
  " * Chorvy Crypto 核心加解密库 (Pure JavaScript / Browser Implementation)",
  " * Fully runs in browser, supports encrypt/decrypt images, audio, video to lossless pixel PNG",
  " *",
  " * Protocols: CSPNG100 / Duck / Scramble",
  " */",
  "",
  "// See functions above for full implementation details",
  "// GitHub: https://github.com/Miqingzi/SS_tools",
].join("\n");
