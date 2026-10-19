import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  checkIsStandalone,
  detectIos,
  detectIosSafari,
  getInstallationStatus,
  setDeferredPrompt,
  getDeferredPrompt,
  clearDeferredPrompt,
  setAppInstalled,
  getAppInstalledState,
  subscribeInstallPrompt,
  promptNativeInstall,
  initInstallPromptListener
} from "./installPromptUtils.js";

describe("PWA Install Utilities & Platform Detection Test Suite", () => {
  beforeEach(() => {
    clearDeferredPrompt();
    setAppInstalled(false);
  });

  describe("1. Standalone Mode Detection (checkIsStandalone)", () => {
    it("should return true when navigator.standalone is true (iOS standalone)", () => {
      const mockNav = { standalone: true };
      assert.equal(checkIsStandalone(mockNav, null), true);
    });

    it("should return true when display-mode: standalone matches", () => {
      const mockMatchMedia = (query) => ({
        matches: query === "(display-mode: standalone)"
      });
      assert.equal(checkIsStandalone({}, mockMatchMedia), true);
    });

    it("should return true when display-mode: fullscreen or minimal-ui matches", () => {
      const mockMatchMedia = (query) => ({
        matches: query === "(display-mode: fullscreen)"
      });
      assert.equal(checkIsStandalone({}, mockMatchMedia), true);
    });

    it("should return false when running in standard browser tab", () => {
      const mockNav = { standalone: false };
      const mockMatchMedia = () => ({ matches: false });
      assert.equal(checkIsStandalone(mockNav, mockMatchMedia), false);
    });

    it("should handle null or undefined safely without throwing", () => {
      assert.equal(checkIsStandalone(null, null), false);
      assert.equal(checkIsStandalone(undefined, undefined), false);
    });
  });

  describe("2. iOS and Safari Platform Detection", () => {
    it("should detect iPhone devices", () => {
      const iphoneUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
      assert.equal(detectIos(iphoneUA, 5), true);
      assert.equal(detectIosSafari(iphoneUA, 5, false), true);
    });

    it("should detect iPadOS desktop user-agent with touch points > 1", () => {
      const ipadosUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
      assert.equal(detectIos(ipadosUA, 5), true);
      assert.equal(detectIosSafari(ipadosUA, 5, false), true);
    });

    it("should not classify desktop Mac (maxTouchPoints = 0) as iOS", () => {
      const macUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      assert.equal(detectIos(macUA, 0), false);
      assert.equal(detectIosSafari(macUA, 0, false), false);
    });

    it("should exclude Chrome on iOS (CriOS) from native Safari instructions", () => {
      const iosChromeUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1";
      assert.equal(detectIos(iosChromeUA, 5), true);
      assert.equal(detectIosSafari(iosChromeUA, 5, false), false);
    });

    it("should return false for detectIosSafari if already in standalone mode", () => {
      const iphoneUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
      assert.equal(detectIosSafari(iphoneUA, 5, true), false);
    });
  });

  describe("3. Installation Status Resolution (getInstallationStatus)", () => {
    it("should return 'installed' when isStandalone is true", () => {
      assert.equal(getInstallationStatus({ isStandalone: true, hasPrompt: true, isIos: false }), "installed");
      assert.equal(getInstallationStatus({ isStandalone: true, hasPrompt: false, isIos: true }), "installed");
    });

    it("should return 'ready' when hasPrompt is true and not standalone", () => {
      assert.equal(getInstallationStatus({ isStandalone: false, hasPrompt: true, isIos: false }), "ready");
    });

    it("should return 'ios_instructions' when on iOS and no native prompt is available", () => {
      assert.equal(getInstallationStatus({ isStandalone: false, hasPrompt: false, isIos: true }), "ios_instructions");
    });

    it("should return 'manual_instructions' for unsupported desktop browsers (e.g. Firefox)", () => {
      assert.equal(getInstallationStatus({ isStandalone: false, hasPrompt: false, isIos: false }), "manual_instructions");
    });
  });

  describe("4. Native Prompt Lifecycle & Event State", () => {
    it("should store and clear deferred prompt event", () => {
      const mockEvent = { type: "beforeinstallprompt" };
      setDeferredPrompt(mockEvent);
      assert.equal(getDeferredPrompt(), mockEvent);

      clearDeferredPrompt();
      assert.equal(getDeferredPrompt(), null);
    });

    it("should notify subscribers when deferred prompt or install state changes", () => {
      let callCount = 0;
      const unsubscribe = subscribeInstallPrompt(() => {
        callCount++;
      });

      setDeferredPrompt({ type: "beforeinstallprompt" });
      assert.equal(callCount, 1);

      setAppInstalled(true);
      assert.equal(callCount, 2);
      assert.equal(getAppInstalledState(), true);
      assert.equal(getDeferredPrompt(), null, "Installing should clear deferredPrompt");

      unsubscribe();
      setAppInstalled(false);
      assert.equal(callCount, 2, "Unsubscribed listener must not be called");
    });

    it("should return unavailable outcome when promptNativeInstall is called without prompt", async () => {
      const res = await promptNativeInstall();
      assert.equal(res.outcome, "unavailable");
    });

    it("should invoke prompt() and record accepted installation", async () => {
      let promptCalled = false;
      const mockPromptEvent = {
        prompt: async () => { promptCalled = true; },
        userChoice: Promise.resolve({ outcome: "accepted", platform: "web" })
      };

      setDeferredPrompt(mockPromptEvent);
      const res = await promptNativeInstall();

      assert.equal(promptCalled, true);
      assert.equal(res.outcome, "accepted");
      assert.equal(getAppInstalledState(), true);
    });

    it("should safely handle dismissed install prompt without throwing or setting installed", async () => {
      const mockPromptEvent = {
        prompt: async () => {},
        userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" })
      };

      setDeferredPrompt(mockPromptEvent);
      const res = await promptNativeInstall();

      assert.equal(res.outcome, "dismissed");
      assert.equal(getAppInstalledState(), false);
    });
  });

  describe("5. Global Event Listener Initialization (initInstallPromptListener)", () => {
    it("should attach listeners to window and handle beforeinstallprompt and appinstalled", () => {
      const events = {};
      const mockWindow = {
        addEventListener: (name, fn) => { events[name] = fn; },
        removeEventListener: (name) => { delete events[name]; },
        matchMedia: () => ({ matches: false }),
        navigator: {}
      };

      const cleanup = initInstallPromptListener(mockWindow);
      assert.ok(events.beforeinstallprompt, "Must listen for beforeinstallprompt");
      assert.ok(events.appinstalled, "Must listen for appinstalled");

      let defaultPrevented = false;
      const fakeEvent = {
        preventDefault: () => { defaultPrevented = true; }
      };

      events.beforeinstallprompt(fakeEvent);
      assert.equal(defaultPrevented, true, "Must preventDefault on beforeinstallprompt");
      assert.equal(getDeferredPrompt(), fakeEvent);

      events.appinstalled();
      assert.equal(getAppInstalledState(), true, "appinstalled must mark app as installed");

      cleanup();
      assert.equal(Object.keys(events).length, 0, "Cleanup must remove all listeners");
    });
  });
});
