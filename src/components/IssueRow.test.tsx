import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IssueRow } from "@/components/IssueRow";
import type { Severity } from "@/domain/triage/types";

/**
 * The board's one repeated element, so its contract is worth pinning.
 *
 * Assertions name the design tokens rather than the hex values behind them.
 * A test that checks for "#d2452b" passes just as happily when the component
 * has stopped reading tokens.css and hardcoded the colour instead -- which is
 * exactly the drift §8 forbids, so the test should be the thing that catches
 * it, not the thing that locks it in.
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
    const expected: Record<Severity, string> = {
      CRITICAL: "border-l-sev-critical",
      HIGH: "border-l-sev-high",
      MEDIUM: "border-l-sev-medium",
      LOW: "border-l-sev-low",
    };

    for (const [severity, tokenClass] of Object.entries(expected)) {
      const { unmount } = render(
        <IssueRow {...baseProps} severity={severity as Severity} />,
      );
      const row = screen.getByTestId("issue-row");

      expect(row.getAttribute("data-severity")).toBe(severity);
      expect(row.className).toContain(tokenClass);
      expect(row.className).toContain("border-l-[3px]");
      unmount();
    }
  });

  it("reserves the vermilion for CRITICAL and nothing else", () => {
    const critical = render(<IssueRow {...baseProps} severity="CRITICAL" />);
    expect(screen.getByTestId("issue-severity-label").className).toContain(
      "text-critical",
    );
    critical.unmount();

    for (const severity of ["HIGH", "MEDIUM", "LOW"] as const) {
      const { unmount } = render(
        <IssueRow {...baseProps} severity={severity} />,
      );
      expect(
        screen.getByTestId("issue-severity-label").className ?? "",
      ).not.toContain("text-critical");
      unmount();
    }
  });

  it("marks a verified issue in the reserved teal", () => {
    const { rerender } = render(<IssueRow {...baseProps} status="OPEN" />);
    expect(screen.queryByTestId("issue-verified-badge")).toBeNull();

    rerender(<IssueRow {...baseProps} status="VERIFIED" />);
    const badge = screen.getByTestId("issue-verified-badge");
    expect(badge.textContent).toBe("Verified");
    expect(badge.className).toContain("text-verified");
  });

  it("never shouts a label in capitals", () => {
    // §8 says no all-caps labels. Capitals are a shortcut to emphasis that
    // costs legibility, and the board relies on the count for emphasis.
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
      "4 possible duplicates",
    );
  });
});
