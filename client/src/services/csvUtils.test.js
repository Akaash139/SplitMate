import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  downloadCsvBlob,
  getStandardExportFilename,
  formatPaiseToRupees,
  sanitizeCsvField
} from "./csvUtils.js";

describe("csvUtils", () => {
  describe("formatPaiseToRupees", () => {
    it("converts integer paise to two decimal places correctly", () => {
      assert.equal(formatPaiseToRupees(100), "1.00");
      assert.equal(formatPaiseToRupees(125000), "1250.00");
      assert.equal(formatPaiseToRupees(99), "0.99");
      assert.equal(formatPaiseToRupees(1), "0.01");
      assert.equal(formatPaiseToRupees(0), "0.00");
    });

    it("handles string input and invalid values gracefully", () => {
      assert.equal(formatPaiseToRupees("54321"), "543.21");
      assert.equal(formatPaiseToRupees(null), "0.00");
      assert.equal(formatPaiseToRupees(undefined), "0.00");
      assert.equal(formatPaiseToRupees(-500), "0.00");
      assert.equal(formatPaiseToRupees("invalid"), "0.00");
    });
  });

  describe("getStandardExportFilename", () => {
    it("generates correct expense CSV filename format", () => {
      const fixedDate = new Date("2026-10-19T12:00:00Z");
      const filename = getStandardExportFilename("expenses", fixedDate);
      assert.equal(filename, "splitmate-expenses-2026-10-19.csv");
    });

    it("generates correct settlements CSV filename format", () => {
      const fixedDate = new Date("2026-05-04T08:30:00Z");
      const filename = getStandardExportFilename("settlements", fixedDate);
      assert.equal(filename, "splitmate-settlements-2026-05-04.csv");
    });

    it("uses today's date if no date passed", () => {
      const filename = getStandardExportFilename("expenses");
      assert.match(filename, /^splitmate-expenses-\d{4}-\d{2}-\d{2}\.csv$/);
    });
  });

  describe("sanitizeCsvField", () => {
    it("handles null and undefined by returning an empty string", () => {
      assert.equal(sanitizeCsvField(null), "");
      assert.equal(sanitizeCsvField(undefined), "");
    });

    it("formats numbers to two decimals when isNumeric is true or value is number", () => {
      assert.equal(sanitizeCsvField(1250, true), "1250.00");
      assert.equal(sanitizeCsvField(0, true), "0.00");
      assert.equal(sanitizeCsvField(45.5), "45.50");
    });

    it("mitigates spreadsheet formula injection (CWE-1236)", () => {
      // Starting with =
      assert.equal(sanitizeCsvField("=SUM(A1:A10)"), "'=SUM(A1:A10)");
      assert.equal(sanitizeCsvField("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");

      // Starting with +
      assert.equal(sanitizeCsvField("+12345"), "'+12345");

      // Starting with -
      assert.equal(sanitizeCsvField("-500"), "'-500");

      // Starting with @
      assert.equal(sanitizeCsvField("@SUM(A1:A5)"), "'@SUM(A1:A5)");

      // Starting with \t or \r
      assert.equal(sanitizeCsvField("\tTabCommand"), "'\tTabCommand");
    });

    it("escapes fields containing commas, double quotes, and newlines per RFC 4180", () => {
      // Commas
      assert.equal(sanitizeCsvField("Groceries, Milk & Eggs"), '"Groceries, Milk & Eggs"');

      // Double quotes escaped as ""
      assert.equal(sanitizeCsvField('Special "Dinner" Out'), '"Special ""Dinner"" Out"');

      // Newlines
      assert.equal(sanitizeCsvField("First Line\nSecond Line"), '"First Line\nSecond Line"');
    });

    it("handles combination of formula trigger and quotes/commas", () => {
      const raw = "=1+2, 3*4";
      const sanitized = sanitizeCsvField(raw);
      // Starts with = so gets ' prefix, and contains comma so gets quoted: "'=1+2, 3*4"
      assert.equal(sanitized, '"\'=1+2, 3*4"');
    });

    it("preserves Unicode and international text accurately", () => {
      assert.equal(sanitizeCsvField("Rahul Sharma"), "Rahul Sharma");
      assert.equal(sanitizeCsvField("₹2,500 Split"), '"₹2,500 Split"');
      assert.equal(sanitizeCsvField("🍜 Ramen & 🍣 Sushi"), "🍜 Ramen & 🍣 Sushi");
    });
  });

  describe("downloadCsvBlob", () => {
    it("throws an error if blob is missing or null", () => {
      assert.throws(() => downloadCsvBlob(null), /No data received for download/);
      assert.throws(() => downloadCsvBlob(undefined), /No data received for download/);
    });

    it("handles mock DOM download gracefully", () => {
      let clicked = false;
      let removed = false;
      let appended = false;
      let downloadedName = "";

      // Mock browser environment
      const originalWindow = globalThis.window;
      const originalDocument = globalThis.document;

      const mockDoc = {
        createElement: (tag) => {
          assert.equal(tag, "a");
          return {
            style: {},
            setAttribute: (attr, val) => {
              if (attr === "download") downloadedName = val;
            },
            click: () => {
              clicked = true;
            }
          };
        },
        body: {
          appendChild: () => {
            appended = true;
          },
          removeChild: () => {
            removed = true;
          }
        }
      };

      globalThis.document = mockDoc;
      globalThis.window = {
        URL: {
          createObjectURL: () => "blob:http://localhost/mock-uuid",
          revokeObjectURL: () => {}
        },
        document: mockDoc
      };

      try {
        downloadCsvBlob("col1,col2\nval1,val2", "test-expenses.csv");
        assert.equal(clicked, true);
        assert.equal(appended, true);
        assert.equal(removed, true);
        assert.equal(downloadedName, "test-expenses.csv");
      } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
      }
    });
  });
});
