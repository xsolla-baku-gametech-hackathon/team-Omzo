import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TraitSentence } from "@/components/TraitSentence";

describe("TraitSentence", () => {
  it("renders the sentence formatted in an authoritative block", () => {
    const text =
      "16 of 18 occurrences on AMD GPUs. 17 of 18 in Chrome. All within 4 units of (128, 0, 96).";
    render(<TraitSentence sentence={text} />);

    expect(screen.getByText(text)).toBeDefined();
    expect(screen.getByText("Shared Pattern Observation")).toBeDefined();
  });

  it("returns null if sentence is empty", () => {
    const { container } = render(<TraitSentence sentence="" />);
    expect(container.firstChild).toBeNull();
  });
});
