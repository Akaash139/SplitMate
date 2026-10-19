import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MOBILE_PRIMARY_ITEMS,
  getActiveMobileTab
} from "./mobileNavUtils.js";

describe("Mobile Navigation Configuration & Utilities Test Suite (5-Tab Structure)", () => {
  describe("Primary Mobile Destinations (5-Tab Specification)", () => {
    it("should have exactly 5 primary destinations in exact order: Dashboard, Groups, Activity, Settlements, Account Settings", () => {
      assert.equal(MOBILE_PRIMARY_ITEMS.length, 5, "Must have exactly 5 destinations");

      const expected = [
        { id: "dashboard", label: "Dashboard", path: "/dashboard" },
        { id: "groups", label: "Groups", path: "/groups" },
        { id: "activity", label: "Activity", path: "/expenses" },
        { id: "settlements", label: "Settlements", path: "/settlements" },
        { id: "settings", path: "/settings" }
      ];

      for (let i = 0; i < expected.length; i++) {
        assert.equal(MOBILE_PRIMARY_ITEMS[i].id, expected[i].id);
        if (expected[i].label) {
          assert.equal(MOBILE_PRIMARY_ITEMS[i].label, expected[i].label);
        }
        assert.equal(MOBILE_PRIMARY_ITEMS[i].path, expected[i].path);
      }
    });

    it("should NOT include Friends as a primary bottom-navigation tab", () => {
      const friendsItem = MOBILE_PRIMARY_ITEMS.find((item) => item.id === "friends");
      assert.equal(friendsItem, undefined, "Friends must NOT be a primary bottom-navigation tab");
    });

    it("should NOT include Analytics as a primary bottom-navigation tab", () => {
      const analyticsItem = MOBILE_PRIMARY_ITEMS.find((item) => item.id === "analytics");
      assert.equal(analyticsItem, undefined, "Analytics must NOT be a primary bottom-navigation tab");
    });

    it("should map Account Settings tab to /settings with accessible label", () => {
      const settingsItem = MOBILE_PRIMARY_ITEMS.find((item) => item.id === "settings");
      assert.ok(settingsItem, "Settings item must exist");
      assert.equal(settingsItem.path, "/settings");
      assert.equal(settingsItem.ariaLabel, "Account Settings");
    });
  });

  describe("Route to Active Tab Resolution (getActiveMobileTab)", () => {
    it("should map /dashboard and / to Dashboard tab", () => {
      assert.equal(getActiveMobileTab("/dashboard"), "dashboard");
      assert.equal(getActiveMobileTab("/"), "dashboard");
      assert.equal(getActiveMobileTab("/dashboard?filter=recent"), "dashboard");
    });

    it("should map /groups and group-detail routes to Groups tab", () => {
      assert.equal(getActiveMobileTab("/groups"), "groups");
      assert.equal(getActiveMobileTab("/groups/675849abc"), "groups");
      assert.equal(getActiveMobileTab("/groups/create"), "groups");
    });

    it("should map /friends and peer ledger routes to Groups tab (Friends belongs under Groups)", () => {
      assert.equal(getActiveMobileTab("/friends"), "groups");
      assert.equal(getActiveMobileTab("/friends?search=raj"), "groups");
    });

    it("should map /expenses and activity routes to Activity tab", () => {
      assert.equal(getActiveMobileTab("/expenses"), "activity");
      assert.equal(getActiveMobileTab("/expenses?payer=mine"), "activity");
      assert.equal(getActiveMobileTab("/activity"), "activity");
    });

    it("should map /analytics to Activity tab (Analytics belongs under Activity)", () => {
      assert.equal(getActiveMobileTab("/analytics"), "activity");
      assert.equal(getActiveMobileTab("/analytics?period=month"), "activity");
    });

    it("should map /settlements and settlement routes to Settlements tab", () => {
      assert.equal(getActiveMobileTab("/settlements"), "settlements");
      assert.equal(getActiveMobileTab("/settlements?groupId=123"), "settlements");
    });

    it("should map /settings to Account Settings tab", () => {
      assert.equal(getActiveMobileTab("/settings"), "settings");
      assert.equal(getActiveMobileTab("/settings?tab=profile"), "settings");
    });

    it("should return empty string for public or unauthenticated routes", () => {
      assert.equal(getActiveMobileTab("/login"), "");
      assert.equal(getActiveMobileTab("/register"), "");
      assert.equal(getActiveMobileTab("/join/xyz123"), "");
      assert.equal(getActiveMobileTab(""), "");
    });
  });
});
