import { describe, expect, it } from "vitest";
import { kioskOrigin, webOrigins } from "../../src/lib/origins";

// WEB_ORIGIN lists the web app's addresses: the kiosk link first, then the admin link.

describe("webOrigins", () => {
  it("reads one address", () => {
    expect(webOrigins("https://kiosk.example.com")).toEqual(["https://kiosk.example.com"]);
  });

  it("reads several, comma-separated, ignoring spaces and trailing slashes", () => {
    expect(webOrigins(" https://kiosk.example.com/ , https://admin.example.com ")).toEqual([
      "https://kiosk.example.com",
      "https://admin.example.com",
    ]);
  });

  it("falls back to the local web app when unset or empty", () => {
    expect(webOrigins(undefined)).toEqual(["http://localhost:3000"]);
    expect(webOrigins(" , ")).toEqual(["http://localhost:3000"]);
  });
});

describe("kioskOrigin", () => {
  it("is the first address, where PayMongo returns a paying customer", () => {
    expect(kioskOrigin("https://kiosk.example.com,https://admin.example.com")).toBe("https://kiosk.example.com");
  });
});
