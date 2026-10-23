import { newId } from "../doc";
import { STYLE_FILE_KIND, type MapStyle } from "./types";

const LIBRARY_KEY = "da.styleLibrary";
const FILE_VERSION = 1;
const MAX_IMAGE = 512;

export function loadLibrary(): MapStyle[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveLibrary(list: MapStyle[]): boolean {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function styleToFile(style: MapStyle): Blob {
  return new Blob([JSON.stringify({ kind: STYLE_FILE_KIND, version: FILE_VERSION, style }, null, 2)], {
    type: "application/json",
  });
}

export function styleFromFile(text: string): MapStyle {
  const data = JSON.parse(text);
  const s = data?.style;
  if (data?.kind !== STYLE_FILE_KIND || !s || !s.paper || !s.floor || !s.walls || !s.shade || !s.grid) {
    throw new Error("not a style file");
  }
  return { ...s, id: newId() };
}

export function imageFileToData(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_IMAGE / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("not an image"));
    };
    img.src = url;
  });
}

export function pickFile(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener("change", () => resolve([...(input.files ?? [])]));
    input.click();
  });
}
