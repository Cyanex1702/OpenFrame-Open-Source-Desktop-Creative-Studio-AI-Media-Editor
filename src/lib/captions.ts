import type { Caption } from "../types/project";
import { defaultCaptionStyle, id, SECOND } from "./project";

export function parseCaptionFile(text: string): Caption[] {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) return [];
  const body = normalized.startsWith("WEBVTT") ? normalized.replace(/^WEBVTT[^\n]*\n+/, "") : normalized;
  return body.split(/\n{2,}/).flatMap((block) => {
    const lines = block.split("\n").filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes(" --> "));
    if (timingIndex < 0) return [];
    const [start, end] = lines[timingIndex].split(" --> ").map(parseTimestamp);
    const captionText = lines.slice(timingIndex + 1).join("\n").replace(/<[^>]+>/g, "").trim();
    if (!captionText || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    return [{ id: id("caption"), startUs: start, endUs: end, text: captionText, words: [], style: defaultCaptionStyle() }];
  });
}

export function serializeSrt(captions: Caption[]): string { return ordered(captions).map((caption, index) => `${index + 1}\n${timestamp(caption.startUs, ",")} --> ${timestamp(caption.endUs, ",")}\n${caption.text}`).join("\n\n") + "\n"; }
export function serializeVtt(captions: Caption[]): string { return "WEBVTT\n\n" + ordered(captions).map((caption) => `${timestamp(caption.startUs, ".")} --> ${timestamp(caption.endUs, ".")}\n${caption.text}`).join("\n\n") + "\n"; }
function ordered(captions: Caption[]) { return [...captions].sort((a, b) => a.startUs - b.startUs); }
function parseTimestamp(value: string): number { const clean = value.trim().split(/\s+/)[0].replace(",", "."); const parts = clean.split(":").map(Number); if (parts.some((part) => !Number.isFinite(part))) return Number.NaN; const seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1]; return Math.round(seconds * SECOND); }
function timestamp(value: number, separator: "," | ".") { const totalMs = Math.max(0, Math.round(value / 1000)); const ms = totalMs % 1000, totalSeconds = Math.floor(totalMs / 1000), seconds = totalSeconds % 60, minutes = Math.floor(totalSeconds / 60) % 60, hours = Math.floor(totalSeconds / 3600); return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${separator}${String(ms).padStart(3, "0")}`; }
function pad(value: number) { return String(value).padStart(2, "0"); }