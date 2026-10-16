import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mergeAndSortAllExpenses,
  getPartialFailures,
  filterAllExpenses
} from "./allExpensesUtils.js";

describe("All Expenses Utilities & Multi-Group Aggregation Test Suite", () => {
  const userRam = { _id: "user-ram-101", name: "Ram", email: "ram@example.com" };
  const userAkaash = { _id: "user-akaash-202", name: "Akaash", email: "akaash@example.com" };
  const userPriya = { _id: "user-priya-303", name: "Priya", email: "priya@example.com" };

  const groupA = { id: "grp-apt-4b", name: "Apartment 4B", category: "Home" };
  const groupB = { id: "grp-trip-goa", name: "Goa Vacation", category: "Trip" };
  const groupC = { id: "grp-work-team", name: "Office Lunch", category: "Other" };

  const expense1 = {
    id: "exp-groceries-1",
    description: "Weekly Groceries",
    amount: 1200,
    category: "Groceries",
    paidBy: userRam,
    createdAt: "2026-10-10T10:00:00.000Z"
  };

  const expense2 = {
    id: "exp-wifi-2",
    description: "High-Speed WiFi",
    amount: 800,
    category: "Utilities",
    paidBy: userAkaash,
    createdAt: "2026-10-12T14:30:00.000Z"
  };

  const expense3 = {
    id: "exp-dinner-3",
    description: "Beach Shack Dinner",
    amount: 2500,
    category: "Food & Drink",
    paidBy: userAkaash,
    createdAt: "2026-10-14T20:00:00.000Z"
  };

  const expense4 = {
    id: "exp-scooter-4",
    description: "Scooter Rental",
    amount: 600,
    category: "Transportation",
    paidBy: userPriya,
    createdAt: "2026-10-15T09:15:00.000Z"
  };

  describe("1. Merging expenses across multiple groups without duplicates", () => {
    it("should merge expenses from distinct groups into a single list", () => {
      const results = [
        { group: groupA, expenses: [expense1, expense2] },
        { group: groupB, expenses: [expense3, expense4] }
      ];

      const merged = mergeAndSortAllExpenses(results);
      assert.equal(merged.length, 4);
      const ids = merged.map((e) => e.id);
      assert.ok(ids.includes("exp-groceries-1"));
      assert.ok(ids.includes("exp-wifi-2"));
      assert.ok(ids.includes("exp-dinner-3"));
      assert.ok(ids.includes("exp-scooter-4"));
    });

    it("should deduplicate identical expense records if present across group results", () => {
      const results = [
        { group: groupA, expenses: [expense1, expense2] },
        { group: groupA, expenses: [expense1] } // duplicate of expense1
      ];

      const merged = mergeAndSortAllExpenses(results);
      assert.equal(merged.length, 2);
      const count = merged.filter((e) => e.id === "exp-groceries-1").length;
      assert.equal(count, 1, "Duplicate expense must be deduplicated");
    });
  });

  describe("2. Sorting newest first", () => {
    it("should sort merged expenses in descending order by createdAt", () => {
      const results = [
        { group: groupA, expenses: [expense1, expense2] }, // Oct 10, Oct 12
        { group: groupB, expenses: [expense3, expense4] }  // Oct 14, Oct 15
      ];

      const merged = mergeAndSortAllExpenses(results);
      assert.equal(merged[0].id, "exp-scooter-4");   // Oct 15
      assert.equal(merged[1].id, "exp-dinner-3");    // Oct 14
      assert.equal(merged[2].id, "exp-wifi-2");      // Oct 12
      assert.equal(merged[3].id, "exp-groceries-1"); // Oct 10
    });
  });

  describe("3. Correct group metadata attached to each expense", () => {
    it("should attach groupId, groupName, and groupCategory to each expense", () => {
      const results = [
        { group: groupA, expenses: [expense1] },
        { group: groupB, expenses: [expense3] }
      ];

      const merged = mergeAndSortAllExpenses(results);
      const exp1Meta = merged.find((e) => e.id === "exp-groceries-1");
      assert.equal(exp1Meta.groupId, "grp-apt-4b");
      assert.equal(exp1Meta.groupName, "Apartment 4B");
      assert.equal(exp1Meta.groupCategory, "Home");

      const exp3Meta = merged.find((e) => e.id === "exp-dinner-3");
      assert.equal(exp3Meta.groupId, "grp-trip-goa");
      assert.equal(exp3Meta.groupName, "Goa Vacation");
      assert.equal(exp3Meta.groupCategory, "Trip");
    });
  });

  describe("4. All versus Mine filtering using actual payer ID", () => {
    const multiGroupExpenses = [
      { ...expense1, groupId: "grp-apt-4b" }, // Paid by Ram
      { ...expense2, groupId: "grp-apt-4b" }, // Paid by Akaash
      { ...expense3, groupId: "grp-trip-goa" }, // Paid by Akaash
      { ...expense4, groupId: "grp-trip-goa" }  // Paid by Priya
    ];

    it("should return all expenses when payerFilter is 'all'", () => {
      const filtered = filterAllExpenses(multiGroupExpenses, {
        payerFilter: "all",
        currentUserId: "user-ram-101"
      });
      assert.equal(filtered.length, 4);
    });

    it("should return only expenses paid by Ram when payerFilter is 'mine' for Ram", () => {
      const filtered = filterAllExpenses(multiGroupExpenses, {
        payerFilter: "mine",
        currentUserId: "user-ram-101"
      });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].id, "exp-groceries-1");
    });

    it("should return only expenses paid by Akaash when payerFilter is 'mine' for Akaash", () => {
      const filtered = filterAllExpenses(multiGroupExpenses, {
        payerFilter: "mine",
        currentUserId: "user-akaash-202"
      });
      assert.equal(filtered.length, 2);
      const ids = filtered.map((e) => e.id);
      assert.ok(ids.includes("exp-wifi-2"));
      assert.ok(ids.includes("exp-dinner-3"));
    });
  });

  describe("5. Group, category and search filters", () => {
    const multiGroupExpenses = [
      { ...expense1, groupId: "grp-apt-4b", groupName: "Apartment 4B" },
      { ...expense2, groupId: "grp-apt-4b", groupName: "Apartment 4B" },
      { ...expense3, groupId: "grp-trip-goa", groupName: "Goa Vacation" },
      { ...expense4, groupId: "grp-trip-goa", groupName: "Goa Vacation" }
    ];

    it("should filter by specific group", () => {
      const filtered = filterAllExpenses(multiGroupExpenses, {
        selectedGroupId: "grp-apt-4b"
      });
      assert.equal(filtered.length, 2);
      assert.ok(filtered.every((e) => e.groupId === "grp-apt-4b"));
    });

    it("should filter by category", () => {
      const filtered = filterAllExpenses(multiGroupExpenses, {
        selectedCategory: "Food & Drink"
      });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].id, "exp-dinner-3");
    });

    it("should search by description case-insensitively", () => {
      const filtered = filterAllExpenses(multiGroupExpenses, {
        searchQuery: "wifi"
      });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].id, "exp-wifi-2");
    });

    it("should search by group name case-insensitively", () => {
      const filtered = filterAllExpenses(multiGroupExpenses, {
        searchQuery: "goa"
      });
      assert.equal(filtered.length, 2);
      assert.ok(filtered.every((e) => e.groupName === "Goa Vacation"));
    });

    it("should combine multiple filters simultaneously (group + category + search)", () => {
      const filtered = filterAllExpenses(multiGroupExpenses, {
        selectedGroupId: "grp-apt-4b",
        selectedCategory: "Groceries",
        searchQuery: "weekly"
      });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].id, "exp-groceries-1");
    });

    it("should return empty array when search query matches nothing", () => {
      const filtered = filterAllExpenses(multiGroupExpenses, {
        searchQuery: "Nonexistent Astronaut Supplies"
      });
      assert.equal(filtered.length, 0);
    });
  });

  describe("6. Empty groups and users with no expenses", () => {
    it("should return empty array when user has 0 groups", () => {
      const merged = mergeAndSortAllExpenses([]);
      assert.deepEqual(merged, []);
    });

    it("should return empty array when groups exist but have 0 expenses", () => {
      const results = [
        { group: groupA, expenses: [] },
        { group: groupB, expenses: [] }
      ];
      const merged = mergeAndSortAllExpenses(results);
      assert.deepEqual(merged, []);
    });

    it("should handle null or invalid input safely", () => {
      assert.deepEqual(mergeAndSortAllExpenses(null), []);
      assert.deepEqual(mergeAndSortAllExpenses(undefined), []);
      assert.deepEqual(filterAllExpenses(null), []);
      assert.deepEqual(filterAllExpenses(undefined), []);
    });
  });

  describe("7. Partial group-query failures", () => {
    it("should detect and report failed group queries while keeping successful ones", () => {
      const results = [
        { group: groupA, expenses: [expense1, expense2] },
        { group: groupB, error: "Network timeout fetching group expenses", expenses: [] },
        { group: groupC, expenses: [] }
      ];

      const merged = mergeAndSortAllExpenses(results);
      assert.equal(merged.length, 2, "Successful group expenses must still be merged");

      const failures = getPartialFailures(results);
      assert.equal(failures.length, 1);
      assert.equal(failures[0].groupId, "grp-trip-goa");
      assert.equal(failures[0].groupName, "Goa Vacation");
      assert.ok(failures[0].error.includes("Network timeout"));
    });

    it("should return empty failures array when all groups succeed", () => {
      const results = [
        { group: groupA, expenses: [expense1] },
        { group: groupB, expenses: [expense3] }
      ];
      const failures = getPartialFailures(results);
      assert.deepEqual(failures, []);
    });
  });
});
