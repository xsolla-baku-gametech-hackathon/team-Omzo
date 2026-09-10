import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs without globals, so testing-library's own auto-cleanup never
// registers. Unmount between tests explicitly instead.
afterEach(() => {
  cleanup();
});
