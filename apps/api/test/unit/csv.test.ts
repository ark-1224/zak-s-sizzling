import { describe, expect, it } from "vitest";
import { fromCSV, toCSV } from "../../src/lib/csv";

describe("toCSV", () => {
  it("returns an empty string for no rows", () => {
    expect(toCSV([])).toBe("");
  });

  it("writes a header row from the first row's keys, then one line per row", () => {
    const csv = toCSV([
      { Product: "Sisig", Qty: 2 },
      { Product: "Bulalo", Qty: 1 },
    ]);

    expect(csv).toBe("Product,Qty\nSisig,2\nBulalo,1");
  });

  it("quotes values that contain commas, quotes, or line breaks", () => {
    const csv = toCSV([{ note: 'Pork, "extra" crispy', lines: "a\nb" }]);

    expect(csv).toBe('note,lines\n"Pork, ""extra"" crispy","a\nb"');
  });
});

describe("fromCSV", () => {
  it("maps each row to an object keyed by the header", () => {
    expect(fromCSV("name,price\nSisig,185\nBulalo,220")).toEqual([
      { name: "Sisig", price: "185" },
      { name: "Bulalo", price: "220" },
    ]);
  });

  it("keeps commas and escaped quotes inside quoted fields", () => {
    expect(fromCSV('name,description\nSisig,"Pork, onions, and ""chili"""')).toEqual([
      { name: "Sisig", description: 'Pork, onions, and "chili"' },
    ]);
  });

  it("keeps a line break inside a quoted field", () => {
    expect(fromCSV('name,description\nSisig,"Line one\nLine two"')).toEqual([{ name: "Sisig", description: "Line one\nLine two" }]);
  });

  it("accepts Windows (CRLF) line endings and skips blank lines", () => {
    expect(fromCSV("name,price\r\nSisig,185\r\n\r\nBulalo,220\r\n")).toEqual([
      { name: "Sisig", price: "185" },
      { name: "Bulalo", price: "220" },
    ]);
  });

  it("trims spaces and fills missing trailing fields with empty strings", () => {
    expect(fromCSV(" name , price , cost\n Sisig , 185")).toEqual([{ name: "Sisig", price: "185", cost: "" }]);
  });

  it("returns no rows for empty input", () => {
    expect(fromCSV("")).toEqual([]);
  });

  it("reads back what toCSV writes", () => {
    const rows = [{ name: 'Kare-Kare, "special"', price: "240" }];

    expect(fromCSV(toCSV(rows))).toEqual(rows);
  });
});
