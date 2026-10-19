import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateInviteUrl,
  parseInviteCode,
  validateInviteCode,
  getInviteErrorMessage
} from "./inviteUtils.js";

describe("Invitation Utilities & Routing Test Suite", () => {
  describe("1. Invite URL Generation (generateInviteUrl)", () => {
    it("should generate canonical invite URL from origin and invite code", () => {
      const url = generateInviteUrl("https://split-mate-five-dun.vercel.app", "sm-a8b2c4");
      assert.equal(url, "https://split-mate-five-dun.vercel.app/join/sm-a8b2c4");
    });

    it("should strip trailing slashes from origin cleanly", () => {
      const url = generateInviteUrl("https://split-mate-five-dun.vercel.app///", "sm-a8b2c4");
      assert.equal(url, "https://split-mate-five-dun.vercel.app/join/sm-a8b2c4");
    });

    it("should handle localhost origin during local development", () => {
      const url = generateInviteUrl("http://localhost:5173", "sm-9999");
      assert.equal(url, "http://localhost:5173/join/sm-9999");
    });

    it("should return root-relative path if origin is empty", () => {
      const url = generateInviteUrl("", "sm-a8b2c4");
      assert.equal(url, "/join/sm-a8b2c4");
    });

    it("should return empty string if invite code is missing, null, or empty", () => {
      assert.equal(generateInviteUrl("https://split-mate-five-dun.vercel.app", null), "");
      assert.equal(generateInviteUrl("https://split-mate-five-dun.vercel.app", undefined), "");
      assert.equal(generateInviteUrl("https://split-mate-five-dun.vercel.app", ""), "");
      assert.equal(generateInviteUrl("https://split-mate-five-dun.vercel.app", "   "), "");
    });
  });

  describe("2. Invite Code Parsing (parseInviteCode)", () => {
    it("should return raw code when entered directly", () => {
      assert.equal(parseInviteCode("sm-a8b2c4"), "sm-a8b2c4");
    });

    it("should trim surrounding whitespace from code", () => {
      assert.equal(parseInviteCode("  sm-a8b2c4  \n"), "sm-a8b2c4");
    });

    it("should extract code when full production invite URL is pasted", () => {
      assert.equal(
        parseInviteCode("https://split-mate-five-dun.vercel.app/join/sm-a8b2c4"),
        "sm-a8b2c4"
      );
    });

    it("should extract code when URL has trailing slash", () => {
      assert.equal(
        parseInviteCode("https://split-mate-five-dun.vercel.app/join/sm-a8b2c4/"),
        "sm-a8b2c4"
      );
    });

    it("should extract code when URL has query parameters", () => {
      assert.equal(
        parseInviteCode("https://split-mate-five-dun.vercel.app/join/sm-a8b2c4?ref=whatsapp"),
        "sm-a8b2c4"
      );
    });

    it("should extract code when URL has hash fragments", () => {
      assert.equal(
        parseInviteCode("https://split-mate-five-dun.vercel.app/join/sm-a8b2c4#preview"),
        "sm-a8b2c4"
      );
    });

    it("should safely return empty string for null, undefined, or non-string input", () => {
      assert.equal(parseInviteCode(null), "");
      assert.equal(parseInviteCode(undefined), "");
      assert.equal(parseInviteCode(12345), "");
    });
  });

  describe("3. Invite Code Validation (validateInviteCode)", () => {
    it("should accept valid invite codes", () => {
      assert.equal(validateInviteCode("sm-a8b2c4"), true);
      assert.equal(validateInviteCode("INV123"), true);
    });

    it("should reject too short, empty, or non-string codes", () => {
      assert.equal(validateInviteCode(""), false);
      assert.equal(validateInviteCode("ab"), false);
      assert.equal(validateInviteCode(null), false);
      assert.equal(validateInviteCode(undefined), false);
    });
  });

  describe("4. Error Normalization (getInviteErrorMessage)", () => {
    it("should normalize already member errors", () => {
      const msg = getInviteErrorMessage({ message: "You are already a member of this group" });
      assert.equal(msg, "You are already a member of this group");
    });

    it("should normalize expired invitation errors", () => {
      const msg = getInviteErrorMessage({ message: "This invitation link has expired" });
      assert.equal(msg, "This invitation link has expired");
    });

    it("should normalize revoked or invalid invitation errors", () => {
      const msg = getInviteErrorMessage({ message: "Invitation link is invalid or has been revoked" });
      assert.equal(msg, "Invitation link is invalid or has been revoked");
    });

    it("should return fallback message for empty errors", () => {
      assert.equal(getInviteErrorMessage(null), "Invalid or expired invitation link");
      assert.equal(getInviteErrorMessage(""), "Invalid or expired invitation link");
    });
  });
});
