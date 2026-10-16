import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NAV_ITEMS } from "./navConfig.js";

describe("Sidebar Navigation Configuration Test Suite", () => {
  it("should have Activity pointing to /expenses", () => {
    const activityItem = NAV_ITEMS.find((item) => item.label === "Activity");
    assert.ok(activityItem, "Sidebar must contain an item labelled 'Activity'");
    assert.equal(
      activityItem.path,
      "/expenses",
      "Activity must route to the canonical /expenses ledger"
    );
  });

  it("should NOT contain an item labelled 'All Expenses'", () => {
    const allExpensesItem = NAV_ITEMS.find((item) => item.label === "All Expenses");
    assert.equal(
      allExpensesItem,
      undefined,
      "There must be no duplicate or separate item labelled 'All Expenses'"
    );
  });

  it("should NOT contain an item pointing to /activity", () => {
    const oldActivityItem = NAV_ITEMS.find((item) => item.path === "/activity");
    assert.equal(
      oldActivityItem,
      undefined,
      "The duplicate /activity route must be removed from navigation"
    );
  });

  it("should contain unique paths and labels across all navigation items", () => {
    const paths = NAV_ITEMS.map((item) => item.path);
    const labels = NAV_ITEMS.map((item) => item.label);

    const uniquePaths = new Set(paths);
    const uniqueLabels = new Set(labels);

    assert.equal(uniquePaths.size, paths.length, "All navigation paths must be unique");
    assert.equal(uniqueLabels.size, labels.length, "All navigation labels must be unique");
  });

  it("should preserve essential primary navigation items", () => {
    const requiredLabels = ["Dashboard", "Groups", "Friends", "Activity", "Settlements"];
    for (const label of requiredLabels) {
      assert.ok(
        NAV_ITEMS.some((item) => item.label === label),
        `Navigation must include ${label}`
      );
    }
  });
});
