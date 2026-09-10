import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IssueRow, formatAge } from "@/components/IssueRow";
import type { Severity } from "@/domain/triage/types";

/**
 * The board's one repeated element, so its contract is worth pinning.
 *
 * Assertions name the design tokens rather than the hex values behind them.
 * A test that checks for "#FF6B4A" passes just as happily when the component
 * has stopped reading tokens.css and hardcoded the colour instead -- which is
 * exactly the drift Rule 1 forbids, so the test should be the thing that
 * catches it, not the thing that locks it in.
 */

const baseProps = {
  id: "issue-1",
  campaignId: "camp-1",
  title: "The lift jams halfway up and the game stops responding",
  category: "CRASH",
  severity: "CRITICAL",
  occurrenceCount: 57,
  status: "OPEN",
} as const;

describe("IssueRow", () => {
  it("shows the title, the category and the occurrence count", () => {
    render(<IssueRow {...baseProps} />);

    expect(screen.getByText(baseProps.title)).toBeDefined();
    expect(screen.getByTestId("issue-category-label").textContent).toBe(
      "Crash",
    );
    expect(screen.getByTestId("issue-occurrence-count").textContent).toBe("57");
  });

  it("drives the left rule from severity, through the tokens", () => {
    // The colours live in SeverityRule, which V2 §5.2 and UI_SPEC.md §4 make
    // the only component allowed to read them.
    const expected: Record<Severity, string> = {
      CRITICAL: "var(--sev-critical)",
      HIGH: "var(--sev-high)",
      MEDIUM: "var(--sev-medium)",
      LOW: "var(--sev-low)",
    };

    for (const [severity, token] of Object.entries(expected)) {
      const { unmount } = render(
        <IssueRow {...baseProps} severity={severity as Severity} />,
      );
      const row = screen.getByTestId("issue-row");
      const rule = screen.getByTestId("severity-rule");

      expect(row.getAttribute("data-severity")).toBe(severity);
      expect(rule.getAttribute("data-severity")).toBe(severity);
      expect(rule.style.backgroundColor).toContain(token);
      expect(rule.className).toContain("w-[3px]");
      unmount();
    }
  });

  it("never lets colour be the only carrier of severity", () => {
    // UI_SPEC.md §5: the 3px rule cannot be the only signal, so the row
    // prints the word too -- and at MEDIUM and LOW the rule is deliberately
    // grey, which is precisely when the word is doing all the work.
    for (const severity of ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const) {
      const { unmount } = render(
        <IssueRow {...baseProps} severity={severity} />,
      );
      const label = screen.getByTestId("issue-severity-label").textContent;
      expect(label?.toUpperCase()).toBe(severity);
      unmount();
    }
  });

  it("marks a verified issue in the reserved mint", () => {
    const { rerender } = render(<IssueRow {...baseProps} status="OPEN" />);
    expect(screen.queryByTestId("issue-verified-badge")).toBeNull();

    rerender(<IssueRow {...baseProps} status="VERIFIED" />);
    const badge = screen.getByTestId("issue-verified-badge");
    expect(badge.textContent).toBe("Verified");
    expect(badge.className).toContain("var(--state-verified)");
  });

  it("never shouts a label in capitals", () => {
    // UI_SPEC.md §7 says no all-caps labels. Capitals are a shortcut to
    // emphasis that costs legibility, and the board relies on the count.
    render(<IssueRow {...baseProps} />);
    for (const testId of ["issue-severity-label", "issue-category-label"]) {
      const text = screen.getByTestId(testId).textContent ?? "";
      expect(text).not.toBe(text.toUpperCase());
      expect(screen.getByTestId(testId).className ?? "").not.toContain(
        "uppercase",
      );
    }
  });

  it("keeps possible duplicates out of the occurrence count", () => {
    // A possible duplicate is held for a human, so it must never inflate the
    // number the board sorts on and pays rewards against.
    render(
      <IssueRow
        {...baseProps}
        occurrenceCount={12}
        possibleDuplicateCount={4}
      />,
    );

    expect(screen.getByTestId("issue-occurrence-count").textContent).toBe("12");
    expect(screen.getByTestId("issue-possible-count").textContent).toContain(
      "4 similar issues",
    );
  });

  it("renders the review invitation in violet, and only that", () => {
    // V2 §5.2: the one place the board asks the human to decide is the one
    // place violet appears. If a second element goes violet, the signal dies.
    const { container } = render(
      <IssueRow {...baseProps} possibleDuplicateCount={3} />,
    );
    const violet = container.querySelectorAll('[class*="--accent-text"]');
    expect(violet.length).toBe(1);
    expect(violet[0].getAttribute("data-testid")).toBe("issue-possible-count");
  });

  it("puts platform, scene and age on the second line", () => {
    const twoHours = Date.now() - 2 * 60 * 60 * 1000;
    render(
      <IssueRow
        {...baseProps}
        platform="Windows"
        scene="Cargo Bay"
        firstSeenAt={twoHours}
      />,
    );

    const row = screen.getByTestId("issue-row");
    expect(row.textContent).toContain("Windows");
    expect(row.textContent).toContain("Cargo Bay");
    expect(row.textContent).toContain("2h ago");
  });

  it("omits metadata it does not have rather than printing a gap", () => {
    render(<IssueRow {...baseProps} platform={null} scene={null} />);
    const row = screen.getByTestId("issue-row");
    // No orphaned separators when only the severity word survives.
    expect(row.textContent).not.toContain("··");
  });
});

describe("formatAge", () => {
  const now = Date.UTC(2026, 0, 10, 12, 0, 0);

  it("stays coarse -- the board is not a log", () => {
    expect(formatAge(now - 30_000, now)).toBe("just now");
    expect(formatAge(now - 5 * 60_000, now)).toBe("5m ago");
    expect(formatAge(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(formatAge(now - 4 * 86_400_000, now)).toBe("4d ago");
  });

  it("does not go negative on a clock that ran backwards", () => {
    expect(formatAge(now + 60_000, now)).toBe("just now");
  });
});
