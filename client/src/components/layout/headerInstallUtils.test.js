import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldShowHeaderInstallButton,
  getHeaderInstallAction,
  getInstallGuideContent
} from "./headerInstallUtils.js";

describe("Header Install Button Utilities Test Suite", () => {
  describe("1. Header Install Button Visibility (shouldShowHeaderInstallButton)", () => {
    it("should hide the button when app is already installed", () => {
      assert.equal(shouldShowHeaderInstallButton("installed"), false);
    });

    it("should show the button when native install prompt is ready", () => {
      assert.equal(shouldShowHeaderInstallButton("ready"), true);
    });

    it("should show the button for iOS Safari manual instructions", () => {
      assert.equal(shouldShowHeaderInstallButton("ios_instructions"), true);
    });

    it("should show the button for general manual installation guidance", () => {
      assert.equal(shouldShowHeaderInstallButton("manual_instructions"), true);
    });

    it("should return false for unknown or invalid status values", () => {
      assert.equal(shouldShowHeaderInstallButton("unknown"), false);
      assert.equal(shouldShowHeaderInstallButton(null), false);
      assert.equal(shouldShowHeaderInstallButton(undefined), false);
    });
  });

  describe("2. Header Install Button Action Resolution (getHeaderInstallAction)", () => {
    it("should trigger native prompt when status is 'ready'", () => {
      assert.equal(getHeaderInstallAction("ready"), "prompt");
    });

    it("should trigger instructions modal for iOS devices", () => {
      assert.equal(getHeaderInstallAction("ios_instructions"), "instructions");
    });

    it("should trigger instructions modal for manual/unsupported browsers", () => {
      assert.equal(getHeaderInstallAction("manual_instructions"), "instructions");
    });

    it("should return 'hidden' when already installed", () => {
      assert.equal(getHeaderInstallAction("installed"), "hidden");
    });

    it("should fallback to 'hidden' for unexpected status", () => {
      assert.equal(getHeaderInstallAction("something_else"), "hidden");
    });
  });

  describe("3. Install Guide Content (getInstallGuideContent)", () => {
    it("should return iOS 3-step instructions when isIos is true", () => {
      const content = getInstallGuideContent(true);
      assert.equal(content.type, "ios");
      assert.equal(content.title, "Install SplitMate");
      assert.equal(content.steps.length, 3);
      assert.equal(content.steps[0].number, 1);
      assert.match(content.steps[0].action, /Share/i);
      assert.equal(content.steps[1].number, 2);
      assert.match(content.steps[1].action, /Add to Home Screen/i);
      assert.equal(content.steps[2].number, 3);
      assert.match(content.steps[2].action, /Add/i);
      assert.ok(content.note.length > 0);
    });

    it("should return desktop / browser guidance when isIos is false", () => {
      const content = getInstallGuideContent(false);
      assert.equal(content.type, "manual");
      assert.equal(content.title, "Install SplitMate");
      assert.ok(content.sections.length >= 2);
      assert.match(content.sections[0].heading, /Chrome|Edge|Brave/i);
      assert.match(content.sections[1].heading, /Firefox|Safari/i);
      assert.ok(content.note.length > 0);
    });
  });
});
