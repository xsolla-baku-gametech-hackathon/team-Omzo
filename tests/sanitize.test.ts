import { describe, expect, it } from "vitest";
import {
  sanitizeLogLine,
  sanitizeSceneId,
  sanitizeText,
  sanitizeUsername,
} from "@/domain/sanitize";

describe("sanitize domain engine", () => {
  it("strips script tags and replaces angle brackets", () => {
    const malicious = '<script>alert("xss")</script>Hello World';
    const result = sanitizeText(malicious);
    expect(result).not.toContain("<script>");
    expect(result).toContain("Hello World");
  });

  it("neutralizes inline event handlers like onerror and onload", () => {
    const vector = '<img src="x" onerror="alert(1)" />Normal text';
    const result = sanitizeText(vector);
    expect(result).not.toContain("onerror=");
    expect(result).toContain("Normal text");
  });

  it("strips null bytes and invisible control characters", () => {
    const raw = "Bug\u0000report\u0007with\u001Fcontrol";
    const cleaned = sanitizeText(raw);
    expect(cleaned).toBe("Bugreportwithcontrol");
  });

  it("enforces max length truncation", () => {
    const longText = "A".repeat(5000);
    const cleaned = sanitizeText(longText, 100);
    expect(cleaned.length).toBe(100);
  });

  it("sanitizes console log lines safely", () => {
    const rawLine = "Uncaught TypeError: <script>evil()</script> at line 42";
    const sanitized = sanitizeLogLine(rawLine);
    expect(sanitized).not.toContain("<script>");
    expect(sanitized).toContain("Uncaught TypeError:");
  });

  it("sanitizes usernames by removing dangerous punctuation", () => {
    const dirtyUser = '  <Alex> "Chen" / \\ Sam   ';
    const cleanUser = sanitizeUsername(dirtyUser);
    expect(cleanUser).toBe("Alex Chen Sam");
  });

  it("sanitizes scene IDs into safe identifiers", () => {
    expect(sanitizeSceneId("level_01/room<2>")).toBe("level_01room2");
    expect(sanitizeSceneId("")).toBe("unknown");
  });
});
