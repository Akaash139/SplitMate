import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateProfileName,
  validatePasswordChange,
  formatMemberSince,
  getAuthProviderType
} from "./settingsUtils.js";

describe("Account Settings Utilities & Validation Test Suite", () => {
  describe("1. Profile Name Validation (validateProfileName)", () => {
    it("should accept valid names between 2 and 60 characters", () => {
      const res = validateProfileName("Akaash Paran");
      assert.equal(res.isValid, true);
      assert.equal(res.error, "");
    });

    it("should accept 2-character names", () => {
      const res = validateProfileName("Al");
      assert.equal(res.isValid, true);
    });

    it("should reject empty or whitespace-only names", () => {
      assert.equal(validateProfileName("").isValid, false);
      assert.equal(validateProfileName("   ").isValid, false);
      assert.equal(validateProfileName(null).isValid, false);
      assert.equal(validateProfileName(undefined).isValid, false);
      assert.ok(validateProfileName("").error.includes("required"));
    });

    it("should reject names shorter than 2 characters", () => {
      const res = validateProfileName("A");
      assert.equal(res.isValid, false);
      assert.ok(res.error.includes("at least 2 characters"));
    });

    it("should reject names exceeding 60 characters", () => {
      const longName = "A".repeat(61);
      const res = validateProfileName(longName);
      assert.equal(res.isValid, false);
      assert.ok(res.error.includes("cannot exceed 60"));
    });
  });

  describe("2. Password Change Validation (validatePasswordChange)", () => {
    it("should accept valid password change inputs", () => {
      const res = validatePasswordChange("CurrentPass123", "NewSecretPass456", "NewSecretPass456");
      assert.equal(res.isValid, true);
      assert.deepEqual(res.errors, {});
    });

    it("should reject missing current password", () => {
      const res = validatePasswordChange("", "NewSecretPass456", "NewSecretPass456");
      assert.equal(res.isValid, false);
      assert.ok(res.errors.currentPassword.includes("Current password is required"));
    });

    it("should reject new password under 6 characters", () => {
      const res = validatePasswordChange("CurrentPass123", "12345", "12345");
      assert.equal(res.isValid, false);
      assert.ok(res.errors.newPassword.includes("at least 6 characters"));
    });

    it("should reject new password if identical to current password", () => {
      const res = validatePasswordChange("SamePassword123", "SamePassword123", "SamePassword123");
      assert.equal(res.isValid, false);
      assert.ok(res.errors.newPassword.includes("cannot be the same"));
    });

    it("should reject mismatched confirm password", () => {
      const res = validatePasswordChange("CurrentPass123", "NewSecretPass456", "DifferentPass789");
      assert.equal(res.isValid, false);
      assert.ok(res.errors.confirmPassword.includes("do not match"));
    });

    it("should reject missing confirm password", () => {
      const res = validatePasswordChange("CurrentPass123", "NewSecretPass456", "");
      assert.equal(res.isValid, false);
      assert.ok(res.errors.confirmPassword.includes("Confirm password is required"));
    });
  });

  describe("3. Date Formatting (formatMemberSince)", () => {
    it("should format valid ISO date string cleanly", () => {
      const formatted = formatMemberSince("2026-05-15T12:00:00.000Z");
      assert.equal(formatted, "May 15, 2026");
    });

    it("should return fallback for null, undefined, or invalid dates", () => {
      assert.equal(formatMemberSince(null), "Active Member");
      assert.equal(formatMemberSince(undefined), "Active Member");
      assert.equal(formatMemberSince("invalid-date-string"), "Active Member");
    });
  });

  describe("4. Auth Provider Detection (getAuthProviderType)", () => {
    it("should detect Google provider when authProvider is google", () => {
      assert.equal(getAuthProviderType({ authProvider: "google" }), "google");
    });

    it("should detect Google provider when googleId is present", () => {
      assert.equal(getAuthProviderType({ googleId: "sub_123456" }), "google");
    });

    it("should default to local for standard email/password accounts", () => {
      assert.equal(getAuthProviderType({ authProvider: "local" }), "local");
      assert.equal(getAuthProviderType({}), "local");
      assert.equal(getAuthProviderType(null), "local");
    });
  });
});
