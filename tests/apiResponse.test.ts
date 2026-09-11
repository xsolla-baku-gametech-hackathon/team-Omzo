import { describe, expect, it } from "vitest";
import {
  apiError,
  apiSuccess,
  extractErrorMessage,
} from "@/server/apiResponse";

describe("apiResponse", () => {
  it("generates correct success payload structure", async () => {
    const data = { campaignId: "camp-123", count: 42 };
    const response = apiSuccess(data, 201);

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual(data);
    expect(typeof json.timestamp).toBe("string");
  });

  it("generates correct error payload structure", async () => {
    const response = apiError("not_found", "Campaign not found", 404, {
      id: "camp-999",
    });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("not_found");
    expect(json.message).toBe("Campaign not found");
    expect(json.status).toBe(404);
    expect(json.details).toEqual({ id: "camp-999" });
    expect(typeof json.timestamp).toBe("string");
  });

  it("extracts error message from various error types", () => {
    expect(extractErrorMessage(new Error("Database connection lost"))).toBe(
      "Database connection lost",
    );
    expect(extractErrorMessage("Direct string error")).toBe(
      "Direct string error",
    );
    expect(extractErrorMessage(null, "Fallback message")).toBe(
      "Fallback message",
    );
    expect(extractErrorMessage(undefined)).toBe("An unexpected error occurred");
  });
});
