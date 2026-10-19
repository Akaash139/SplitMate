/**
 * Install Prompt & PWA Platform Utilities
 *
 * Cross-browser installation state manager and platform detection for:
 * 1. Chromium desktop and Android (captures beforeinstallprompt and triggers native dialog)
 * 2. iPhone and iPad Safari (detects Safari on iOS and guides user through Share -> Add to Home Screen)
 * 3. Standalone mode (detects when SplitMate is already installed and running as an app)
 * 4. Desktop / Non-Chromium browsers (clear instructions for creating shortcuts)
 */

let deferredPrompt = null;
let isAppInstalledLocally = false;
const subscribers = new Set();

/**
 * Checks whether the web app is currently running in standalone display mode (installed PWA).
 */
export function checkIsStandalone(navigatorObj, matchMediaFn) {
  if (navigatorObj?.standalone === true) {
    return true;
  }
  if (typeof matchMediaFn === 'function') {
    try {
      if (matchMediaFn('(display-mode: standalone)')?.matches) return true;
      if (matchMediaFn('(display-mode: fullscreen)')?.matches) return true;
      if (matchMediaFn('(display-mode: minimal-ui)')?.matches) return true;
    } catch {
      // Ignore matchMedia evaluation errors
    }
  }
  return false;
}

/**
 * Detects whether the current device is an iOS or iPadOS device.
 */
export function detectIos(userAgent = '', maxTouchPoints = 0) {
  const ua = userAgent || '';
  const isIosDevice = /iPhone|iPad|iPod/i.test(ua);
  const isIpadOs = /Macintosh/i.test(ua) && Number(maxTouchPoints) > 1;
  return isIosDevice || isIpadOs;
}

/**
 * Detects whether the current browser is Apple Safari on iOS/iPadOS.
 * Excludes third-party browsers on iOS (Chrome/CriOS, Firefox/FxiOS, Opera/OPiOS, Edge/EdgiOS).
 */
export function detectIosSafari(userAgent = '', maxTouchPoints = 0, isStandalone = false) {
  if (isStandalone) return false;
  if (!detectIos(userAgent, maxTouchPoints)) return false;
  const ua = userAgent || '';
  const isWebkit = /WebKit/i.test(ua);
  const isOtherIosBrowser = /CriOS|FxiOS|OPiOS|EdgiOS|Dolphin|DuckDuckGo/i.test(ua);
  return isWebkit && !isOtherIosBrowser;
}

/**
 * Determines current installation status:
 * - 'installed': Already running in standalone PWA mode or completed install
 * - 'ready': Native Chromium beforeinstallprompt is captured and ready to prompt
 * - 'ios_instructions': iOS Safari manual Share -> Add to Home Screen flow
 * - 'manual_instructions': Desktop/other browser manual shortcut instructions
 */
export function getInstallationStatus({ isStandalone = false, hasPrompt = false, isIos = false }) {
  if (isStandalone) {
    return 'installed';
  }
  if (hasPrompt) {
    return 'ready';
  }
  if (isIos) {
    return 'ios_instructions';
  }
  return 'manual_instructions';
}

export function setDeferredPrompt(e) {
  deferredPrompt = e;
  notifySubscribers();
}

export function getDeferredPrompt() {
  return deferredPrompt;
}

export function clearDeferredPrompt() {
  deferredPrompt = null;
  notifySubscribers();
}

export function setAppInstalled(installed = true) {
  isAppInstalledLocally = Boolean(installed);
  if (installed) {
    deferredPrompt = null;
  }
  notifySubscribers();
}

export function getAppInstalledState() {
  return isAppInstalledLocally;
}

function notifySubscribers() {
  subscribers.forEach((fn) => {
    try {
      fn();
    } catch {
      // Continue notifying other listeners if one fails
    }
  });
}

/**
 * Subscribes to install state changes (prompt capture, installation, dismissal).
 */
export function subscribeInstallPrompt(callback) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Triggers native browser installation prompt if available.
 * Handles accepted and dismissed outcomes safely without throwing.
 */
export async function promptNativeInstall() {
  if (!deferredPrompt) {
    return { outcome: 'unavailable' };
  }
  try {
    const promptEvent = deferredPrompt;
    await promptEvent.prompt();
    const choiceResult = await promptEvent.userChoice;
    if (choiceResult?.outcome === 'accepted') {
      setAppInstalled(true);
    }
    return choiceResult || { outcome: 'unknown' };
  } catch (err) {
    return { outcome: 'error', error: err };
  }
}

/**
 * Initializes global event listeners for beforeinstallprompt and appinstalled.
 * Can be called at application startup.
 */
export function initInstallPromptListener(targetWindow = (typeof window !== 'undefined' ? window : null)) {
  if (!targetWindow || typeof targetWindow.addEventListener !== 'function') {
    return () => {};
  }

  // Detect initial standalone mode
  const isStandalone = checkIsStandalone(
    targetWindow.navigator,
    targetWindow.matchMedia ? targetWindow.matchMedia.bind(targetWindow) : null
  );
  if (isStandalone) {
    setAppInstalled(true);
  }

  const handleBeforeInstall = (e) => {
    e.preventDefault();
    setDeferredPrompt(e);
  };

  const handleAppInstalled = () => {
    setAppInstalled(true);
  };

  targetWindow.addEventListener('beforeinstallprompt', handleBeforeInstall);
  targetWindow.addEventListener('appinstalled', handleAppInstalled);

  return () => {
    targetWindow.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    targetWindow.removeEventListener('appinstalled', handleAppInstalled);
  };
}
