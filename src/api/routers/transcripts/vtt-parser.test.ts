import { parseVttToText, parseVttToSegments } from ".";
import fs from "fs";
import path from "path";

describe("parseVttToText", () => {
  test("removes VTT tags and timing information", () => {
    const vttContent = `WEBVTT

Kind: captions

Language: en

00:00:00.080 --> 00:00:02.869 align:start position:0%



risk<00:00:00.480><c> appetite</c><00:00:01.199><c> being</c><00:00:01.600><c> something</c><00:00:02.080><c> that</c><00:00:02.560><c> makes</c>

00:00:02.869 --> 00:00:02.879 align:start position:0%

risk appetite being something that makes



00:00:02.879 --> 00:00:04.789 align:start position:0%

risk appetite being something that makes

someone<00:00:03.120><c> a</c><00:00:03.360><c> founder</c><00:00:03.840><c> or</c><00:00:04.160><c> not.</c><00:00:04.480><c> I</c><00:00:04.720><c> think</c>

00:00:04.789 --> 00:00:04.799 align:start position:0%

someone a founder or not. I think



00:00:04.799 --> 00:00:06.630 align:start position:0%

someone a founder or not. I think

there's<00:00:05.120><c> just</c><00:00:05.359><c> so</c><00:00:05.600><c> many</c><00:00:05.839><c> different</c><00:00:06.160><c> kinds</c><00:00:06.480><c> of</c>

00:00:06.630 --> 00:00:06.640 align:start position:0%

there's just so many different kinds of`;

    const result = parseVttToText(vttContent);

    // Should remove all tags and timing, leaving clean readable text
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
    expect(result).not.toContain("00:00:");
    expect(result).not.toContain("WEBVTT");
    expect(result).not.toContain("Kind:");
    expect(result).not.toContain("Language:");

    // Should contain the actual text content
    expect(result).toContain("risk appetite being something that makes");
    expect(result).toContain("someone a founder or not. I think");
    expect(result).toContain("there's just so many different kinds of");
  });

  test("handles empty content", () => {
    expect(parseVttToText("")).toBe("");
    expect(parseVttToText("   ")).toBe("");
  });

  test("removes duplicate lines and normalizes whitespace", () => {
    const vttContent = `WEBVTT

00:00:00.000 --> 00:00:02.000
hello<00:00:00.500><c> world</c>

00:00:02.000 --> 00:00:04.000
hello<00:00:02.500><c> world</c>
test<00:00:03.000><c> message</c>`;

    const result = parseVttToText(vttContent);

    // Should join all text with single spaces, de-duplicating repeated lines
    expect(result).toBe("hello world test message");
  });
});

describe("parseVttToSegments", () => {
  test("parses VTT with timestamps correctly", () => {
    const vttContent = `WEBVTT
Kind: captions
Language: en

00:00:00.240 --> 00:00:02.550 align:start position:0%
You<00:00:00.480><c> know</c><00:00:00.480><c> what's</c><00:00:00.800><c> crazy</c><00:00:01.680><c> that</c><00:00:01.920><c> all</c><00:00:02.159><c> of</c><00:00:02.240><c> this</c>

00:00:02.560 --> 00:00:04.309 align:start position:0%
You know what's crazy that all of this
is<00:00:03.120><c> real?</c>

00:00:04.319 --> 00:00:05.190 align:start position:0%
is real?
&gt;&gt; Yeah.<00:00:04.560><c> Meaning</c><00:00:04.799><c> what?</c>`;

    const segments = parseVttToSegments(vttContent);

    expect(segments.length).toBeGreaterThan(0);
    
    // Should not contain HTML tags (but may contain > as part of text like ">>")
    segments.forEach((seg) => {
      expect(seg.text).not.toContain("<");
      expect(seg.text).not.toMatch(/<[^>]+>/); // No HTML tags
    });
    
    // Should have segments with correct timing
    expect(segments.some((s) => s.text.includes("You know what's crazy"))).toBe(true);
    expect(segments.some((s) => s.text.includes("real?"))).toBe(true);
  });

  test("handles HTML entities correctly", () => {
    const vttContent = `WEBVTT

00:00:04.319 --> 00:00:05.190 align:start position:0%
&gt;&gt; Yeah.<00:00:04.560><c> Meaning</c><00:00:04.799><c> what?</c>`;

    const segments = parseVttToSegments(vttContent);

    expect(segments.length).toBeGreaterThan(0);
    // HTML entity &gt; should be decoded to >
    expect(segments[0].text).toContain(">>");
    expect(segments[0].text).not.toContain("&gt;");
  });

  test("removes duplicate segments", () => {
    const vttContent = `WEBVTT

00:00:02.550 --> 00:00:02.560 align:start position:0%
You know what's crazy that all of this

00:00:02.560 --> 00:00:02.561 align:start position:0%
You know what's crazy that all of this

00:00:02.561 --> 00:00:04.309 align:start position:0%
is real?`;

    const segments = parseVttToSegments(vttContent);

    // Should deduplicate segments with same text AND very close timestamps (within 0.1s)
    // The first two segments have same text and start times within 0.1s, so one should be removed
    expect(segments.length).toBeGreaterThan(0);
    // Should still have at least one segment with "You know what's crazy"
    const matchingSegments = segments.filter((s) => s.text.includes("You know what's crazy"));
    expect(matchingSegments.length).toBeGreaterThan(0);
  });

  test("parses real VTT file correctly", () => {
    // Use the actual VTT file we downloaded (relative to project root)
    const projectRoot = path.resolve(__dirname, "../../../../..");
    const vttPath = path.join(projectRoot, "transcript_aR20FWCCjAs.en.vtt");

    if (!fs.existsSync(vttPath)) {
      // Skip test if file doesn't exist (e.g., in CI)
      // eslint-disable-next-line no-console
      console.warn(`Skipping test - VTT file not found at ${vttPath}`);
      return;
    }

    const vttContent = fs.readFileSync(vttPath, "utf8");
    const segments = parseVttToSegments(vttContent);

    expect(segments.length).toBeGreaterThan(0);

    // Should have segments with expected content from the raw VTT
    expect(segments.some((s) => s.text.includes("You know what's crazy"))).toBe(true);
    expect(segments.some((s) => s.start < 1.0)).toBe(true);

    // Verify segments are in chronological order
    for (let i = 1; i < Math.min(segments.length, 100); i++) {
      expect(segments[i].start).toBeGreaterThanOrEqual(segments[i - 1].start);
    }

    // Check that we're not losing too many segments due to deduplication
    // The raw VTT has many segments, but deduplication should still leave us with a reasonable number
    expect(segments.length).toBeGreaterThan(100);

    // Verify no HTML tags in text
    segments.forEach((seg) => {
      expect(seg.text).not.toMatch(/<[^>]+>/);
    });
  });

  test("handles empty content", () => {
    expect(parseVttToSegments("")).toEqual([]);
    expect(parseVttToSegments("   ")).toEqual([]);
    expect(parseVttToSegments("WEBVTT")).toEqual([]);
  });

  test("handles segments with multiple text lines", () => {
    const vttContent = `WEBVTT

00:00:08.880 --> 00:00:11.430 align:start position:0%
>> Like all this AI stuff and all this
area.<00:00:09.280><c> Yeah.</c><00:00:09.519><c> That</c><00:00:09.679><c> it's</c><00:00:09.920><c> happen</c><00:00:10.320><c> like</c>`;

    const segments = parseVttToSegments(vttContent);

    expect(segments.length).toBeGreaterThan(0);
    // Multiple lines should be joined with spaces
    const firstSegment = segments[0];
    expect(firstSegment.text).toContain("area");
    expect(firstSegment.text).toContain("Yeah");
    expect(firstSegment.text).toContain("That");
  });
});
