import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EXPENSE_CATEGORIES, CANONICAL_CATEGORIES } from "./categories.js";

describe("Centralized Expense Categories Test Suite", () => {
  it("should export an array of exactly 11 supported categories", () => {
    assert.ok(Array.isArray(EXPENSE_CATEGORIES));
    assert.equal(EXPENSE_CATEGORIES.length, 11);
  });

  it("should match canonical categories alias", () => {
    assert.deepEqual(EXPENSE_CATEGORIES, CANONICAL_CATEGORIES);
  });

  it("should contain all required SplitMate categories with correct spelling and casing", () => {
    const expected = [
      "Food & Drink",
      "Groceries",
      "Transportation",
      "Housing",
      "Utilities",
      "Entertainment",
      "Shopping",
      "Travel",
      "Medical",
      "General",
      "Other"
    ];

    for (const cat of expected) {
      assert.ok(
        EXPENSE_CATEGORIES.includes(cat),
        `Missing expected category: ${cat}`
      );
    }
  });

  it("should not contain any duplicate categories", () => {
    const unique = new Set(EXPENSE_CATEGORIES);
    assert.equal(unique.size, EXPENSE_CATEGORIES.length);
  });
});
