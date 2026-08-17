import { describe, expect, it } from "vitest";
import { parseCaptionFile, serializeSrt, serializeVtt } from "../src/lib/captions";
import { SECOND } from "../src/lib/project";

describe("caption interchange", () => {
  it("parses SRT and preserves multiline cue text", () => {
    const captions = parseCaptionFile("1\n00:00:01,250 --> 00:00:03,500\nHello\nOpenFrame\n");
    expect(captions).toHaveLength(1);
    expect(captions[0]).toMatchObject({ startUs: 1.25 * SECOND, endUs: 3.5 * SECOND, text: "Hello\nOpenFrame" });
  });

  it("round-trips sorted cues through SRT and VTT", () => {
    const later = parseCaptionFile("1\n00:00:04,000 --> 00:00:05,000\nLater\n")[0];
    const earlier = parseCaptionFile("1\n00:00:00,500 --> 00:00:02,000\nEarlier\n")[0];
    const srt = serializeSrt([later, earlier]);
    const vtt = serializeVtt([later, earlier]);
    expect(srt).toContain("1\n00:00:00,500 --> 00:00:02,000\nEarlier");
    expect(vtt).toContain("WEBVTT\n\n00:00:00.500 --> 00:00:02.000\nEarlier");
    expect(parseCaptionFile(vtt).map((caption) => caption.text)).toEqual(["Earlier", "Later"]);
  });
});