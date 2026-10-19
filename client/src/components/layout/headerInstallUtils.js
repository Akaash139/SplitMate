/**
 * Header Install Button Helper Utilities
 *
 * Provides pure logic for:
 * 1. Determining when the Header Install button is visible vs hidden.
 * 2. Determining which action to take upon click (native prompt vs instructions modal).
 * 3. Providing structured content for the installation guide modal across iOS and desktop browsers.
 */

/**
 * Determines whether the Header Install button should be rendered.
 * Hidden only when the web app is already installed and running standalone.
 *
 * @param {string} status - Installation status ('installed' | 'ready' | 'ios_instructions' | 'manual_instructions')
 * @returns {boolean}
 */
export function shouldShowHeaderInstallButton(status) {
  if (status === "installed") {
    return false;
  }
  return status === "ready" || status === "ios_instructions" || status === "manual_instructions";
}

/**
 * Determines the interaction action for the Header Install button.
 *
 * @param {string} status
 * @returns {'prompt' | 'instructions' | 'hidden'}
 */
export function getHeaderInstallAction(status) {
  if (status === "ready") {
    return "prompt";
  }
  if (status === "ios_instructions" || status === "manual_instructions") {
    return "instructions";
  }
  return "hidden";
}

/**
 * Returns structured content for the Install Guide Modal.
 *
 * @param {boolean} isIos - True if device is iOS/iPadOS Safari
 * @returns {object} Modal configuration data
 */
export function getInstallGuideContent(isIos) {
  if (isIos) {
    return {
      type: "ios",
      title: "Install SplitMate",
      subtitle: "Add SplitMate to your Home Screen in Safari",
      steps: [
        {
          number: 1,
          action: "Tap the Share button",
          detail: "in Safari's bottom toolbar.",
          icon: "share"
        },
        {
          number: 2,
          action: "Select 'Add to Home Screen'",
          detail: "from the action sheet options.",
          icon: "plus"
        },
        {
          number: 3,
          action: "Tap 'Add'",
          detail: "in the top-right corner to finish.",
          icon: "check"
        }
      ],
      note: "SplitMate will launch in standalone full-screen mode from your home screen with no browser bar clutter."
    };
  }

  return {
    type: "manual",
    title: "Install SplitMate",
    subtitle: "Install as a desktop or mobile web application",
    sections: [
      {
        heading: "Chrome, Edge, or Brave (Desktop)",
        body: "Look for the Install icon on the right side of the browser address bar, or click the browser menu (⋮) and choose 'Install SplitMate'.",
        icon: "laptop"
      },
      {
        heading: "Other Browsers (Firefox, Safari macOS)",
        body: "Pin the tab or add a bookmark to your toolbar for instant 1-click access to your expense ledgers.",
        icon: "bookmark"
      }
    ],
    note: "SplitMate runs as a standalone app with faster load times and offline shell reliability."
  };
}
