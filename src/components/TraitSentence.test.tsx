import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TraitSentence } from "@/components/TraitSentence";

describe("TraitSentence", () => {
  const text =
    "16 of 18 occurrences on AMD GPUs. 17 of 18 in Chrome. All within 4 units of (128, 0, 96).";

  it("renders the sentence whole, and still reads as English", () => {
    const { container } = render(<TraitSentence sentence={text} />);
    // Split across spans for weight, so assert on the recomposed text.
    expect(container.textContent).toBe(text);
  });

  it("gives every figure the heavier weight, and nothing else", () => {
    render(<TraitSentence sentence={text} />);
    const figures = screen
      .getAllByTestId("trait-figure")
      .map((node) => node.textContent);

    expect(figures).toEqual(["16", "18", "17", "18", "4", "(128, 0, 96)"]);
  });

  it("keeps a coordinate group together rather than splitting it", () => {
    // "(128, 0, 96)" is one figure a developer reads as one thing. Three
    // separately weighted numbers with plain commas between them reads as
    // three facts.
    render(<TraitSentence sentence="All within 4 units of (128, 0, 96)." />);
    const figures = screen.getAllByTestId("trait-figure");
    expect(figures.at(-1)?.textContent).toBe("(128, 0, 96)");
  });

  it("returns null if sentence is empty", () => {
    const { container } = render(<TraitSentence sentence="" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders prose with no figures without falling over", () => {
    const { container } = render(
      <TraitSentence sentence="No shared traits yet." />,
    );
    expect(container.textContent).toBe("No shared traits yet.");
    expect(screen.queryByTestId("trait-figure")).toBeNull();
  });
});
