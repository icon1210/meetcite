import { formatDuration, formatTimestamp, speakerColour } from "@/lib/utils";

describe("formatTimestamp", () => {
  it("formats minutes and hours", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(75.9)).toBe("1:15");
    expect(formatTimestamp(3725)).toBe("1:02:05");
  });
});

describe("formatDuration", () => {
  it("handles missing and short values", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(20)).toBe("< 1 min");
    expect(formatDuration(95)).toBe("2 min");
    expect(formatDuration(3725)).toBe("1 h 2 min");
  });
});

describe("speakerColour", () => {
  it("cycles through the palette", () => {
    expect(speakerColour(0)).toEqual(speakerColour(8));
    expect(speakerColour(0)).not.toEqual(speakerColour(1));
  });
});
