import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toIdString, filterExpenses, sortAndMergeExpenses } from "./dashboardUtils.js";

describe("Dashboard Mine Filter & Payer Matching Test Suite", () => {
  const ramId = "ram-user-101";
  const akaashId = "akaash-user-202";

  // Ram and Akaash user objects
const ramUser = { id: ramId, name: "Ram", email: "ram@example.com" };
  const akaashUser = { id: akaashId, name: "Akaash", email: "akaash@example.com" };

  it("should extract normalized ID string using toIdString", () => {
    assert.equal(toIdString(ramUser), ramId);
    assert.equal(toIdString(akaashUser), akaashId);
  });

  describe("1. Ram vs Akaash Payer Exclusion / Inclusion (Manual Testing Scenario)", () => {
    // Exactly the user's scenario:
    // Expense 1: "Vim", ₹60. Paid by Akaash. Created by Ram. Split between Ram and Akaash.
    const vimExpensePaidByAkaash = {
      id: "exp-vim-60",
      description: "Vim",
      amount: 60,
      paidBy: { _id: akaashId, name: "Akaash", email: "akaash@example.com" },
      createdBy: { _id: ramId, name: "Ram" },
      splits: [
        { user: { _id: ramId }, amount: 30 },
        { user: { _id: akaashId }, amount: 30 }
      ],
      participants: [{ _id: ramId }, { _id: akaashId }]
    };

    // Expense 2: "Groceries", ₹500. Paid by Ram. Created by Akaash. Split between Ram and Akaash.
    const groceriesExpensePaidByRam = {
      id: "exp-groceries-500",
      description: "Groceries",
      amount: 500,
      paidBy: { _id: ramId, name: "Ram", email: "ram@example.com" },
      createdBy: { _id: akaashId, name: "Akaash" },
      splits: [
        { user: { _id: ramId }, amount: 250 },
        { user: { _id: akaashId }, amount: 250 }
      ],
      participants: [{ _id: ramId }, { _id: akaashId }]
    };

    const expenseList = [vimExpensePaidByAkaash, groceriesExpensePaidByRam];

    it("should EXCLUDE the Vim expense paid by Akaash from Ram's Mine list", () => {
      const ramMineExpenses = filterExpenses(expenseList, "mine", ramId);
      const ids = ramMineExpenses.map((e) => e.id);

      assert.ok(
        !ids.includes("exp-vim-60"),
        "Vim expense paid by Akaash MUST NOT appear in Ram's Mine list"
      );
    });

    it("should INCLUDE the Groceries expense paid by Ram in Ram's Mine list", () => {
      const ramMineExpenses = filterExpenses(expenseList, "mine", ramId);
      const ids = ramMineExpenses.map((e) => e.id);

      assert.ok(
        ids.includes("exp-groceries-500"),
        "Groceries expense paid by Ram MUST appear in Ram's Mine list"
      );
      assert.equal(ramMineExpenses.length, 1);
    });

    it("should INCLUDE the Vim expense in Akaash's Mine list and EXCLUDE the Groceries expense", () => {
      const akaashMineExpenses = filterExpenses(expenseList, "mine", akaashId);
      const ids = akaashMineExpenses.map((e) => e.id);

      assert.ok(
        ids.includes("exp-vim-60"),
        "Vim expense paid by Akaash MUST appear in Akaash's Mine list"
      );
      assert.ok(
        !ids.includes("exp-groceries-500"),
        "Groceries expense paid by Ram MUST NOT appear in Akaash's Mine list"
      );
      assert.equal(akaashMineExpenses.length, 1);
    });

    it("should INCLUDE ALL expenses when filter is 'all'", () => {
      const allForRam = filterExpenses(expenseList, "all", ramId);
      assert.equal(allForRam.length, 2);
      assert.ok(allForRam.some((e) => e.id === "exp-vim-60"));
      assert.ok(allForRam.some((e) => e.id === "exp-groceries-500"));

      const allForAkaash = filterExpenses(expenseList, "all", akaashId);
      assert.equal(allForAkaash.length, 2);
    });
  });

  describe("2. Payer ID Formats (Populated _id, serialized id, and raw string)", () => {
    it("should match when paidBy is a populated Mongoose object with _id", () => {
      const exp = {
        id: "exp-pop-underscore",
        paidBy: { _id: ramId, name: "Ram" }
      };
      const result = filterExpenses([exp], "mine", ramId);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, "exp-pop-underscore");
    });

    it("should match when paidBy is a serialized object with id", () => {
      const exp = {
        id: "exp-pop-id",
        paidBy: { id: ramId, name: "Ram" }
      };
      const result = filterExpenses([exp], "mine", ramId);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, "exp-pop-id");
    });

    it("should match when paidBy is a raw string ID", () => {
      const exp = {
        id: "exp-raw-string",
        paidBy: ramId
      };
      const result = filterExpenses([exp], "mine", ramId);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, "exp-raw-string");
    });

    it("should work when currentUserId is passed as a full user object ({ id, name })", () => {
      const exp = {
        id: "exp-test-user-obj",
        paidBy: { _id: ramId }
      };
      const result = filterExpenses([exp], "mine", ramUser);
      assert.equal(result.length, 1);
    });

    it("should work when currentUserId is passed as a user document with _id ({ _id, name })", () => {
      const exp = {
        id: "exp-test-user-doc",
        paidBy: { _id: ramId }
      };
      const result = filterExpenses([exp], "mine", { _id: ramId, name: "Ram" });
      assert.equal(result.length, 1);
    });

    it("should perform case-insensitive hex ID matching", () => {
      const hexRamId = "60d0fe4f5311236168a109ca";
      const exp = {
        id: "exp-hex",
        paidBy: { _id: hexRamId.toUpperCase() }
      };
      const result = filterExpenses([exp], "mine", hexRamId.toLowerCase());
      assert.equal(result.length, 1);
    });
  });

  describe("3. Strict ID Matching (Must NOT match by display name or email)", () => {
    it("should EXCLUDE expenses where paidBy has the same name 'Ram' but a different ID", () => {
      const imposterExp = {
        id: "exp-imposter-name",
        paidBy: { _id: "imposter-999", name: "Ram", email: "other-ram@example.com" }
      };
      const result = filterExpenses([imposterExp], "mine", ramId);
      assert.equal(
        result.length,
        0,
        "Expense must not match by display name when IDs differ"
      );
    });

    it("should EXCLUDE expenses where paidBy has the same email but a different ID", () => {
      const imposterExp = {
        id: "exp-imposter-email",
        paidBy: { _id: "imposter-888", name: "Different", email: "ram@example.com" }
      };
      const result = filterExpenses([imposterExp], "mine", ramId);
      assert.equal(
        result.length,
        0,
        "Expense must not match by email when IDs differ"
      );
    });
  });

  describe("4. Edge Cases", () => {
    it("should return empty array when allExpenses is null, undefined, or empty", () => {
      assert.deepEqual(filterExpenses(null, "mine", ramId), []);
      assert.deepEqual(filterExpenses(undefined, "mine", ramId), []);
      assert.deepEqual(filterExpenses([], "mine", ramId), []);
    });

    it("should return empty array when user is null, undefined, or empty string", () => {
      const exp = { id: "e1", paidBy: ramId };
      assert.deepEqual(filterExpenses([exp], "mine", null), []);
      assert.deepEqual(filterExpenses([exp], "mine", undefined), []);
      assert.deepEqual(filterExpenses([exp], "mine", ""), []);
    });

    it("should ignore null or malformed expense elements gracefully", () => {
      const malformed = [null, undefined, {}, { paidBy: null }, { paidBy: ramId, id: "e-valid" }];
      const result = filterExpenses(malformed, "mine", ramId);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, "e-valid");
    });
  });

  describe("5. sortAndMergeExpenses", () => {
    it("should sort merged expenses newest first", () => {
      const listA = [{ id: "1", createdAt: "2026-10-10" }];
      const listB = [{ id: "2", createdAt: "2026-10-12" }];
      const merged = sortAndMergeExpenses([listA, listB]);
      assert.equal(merged[0].id, "2");
      assert.equal(merged[1].id, "1");
    });
  });
});
