/**
 * Mobile Navigation Utilities and Route Configuration
 * 
 * Defines the 5 primary mobile destinations in exact required order:
 * 1. Dashboard — /dashboard
 * 2. Groups — /groups (includes /friends)
 * 3. Activity — /expenses (includes /analytics)
 * 4. Settlements — /settlements
 * 5. Account Settings — /settings
 */

export const MOBILE_PRIMARY_ITEMS = [
  { id: "dashboard", label: "Dashboard", path: "/dashboard", ariaLabel: "Dashboard" },
  { id: "groups", label: "Groups", path: "/groups", ariaLabel: "Groups" },
  { id: "activity", label: "Activity", path: "/expenses", ariaLabel: "Activity" },
  { id: "settlements", label: "Settlements", path: "/settlements", ariaLabel: "Settlements" },
  { id: "settings", label: "Settings", path: "/settings", ariaLabel: "Account Settings" }
];

/**
 * Determines which of the 5 primary mobile navigation tabs should be highlighted.
 * - /dashboard, / -> "dashboard"
 * - /groups, /groups/:id, /friends -> "groups" (Friends belongs under Groups)
 * - /expenses, /activity, /analytics -> "activity" (Analytics belongs under Activity)
 * - /settlements -> "settlements"
 * - /settings -> "settings"
 *
 * @param {string} pathname - Current route pathname
 * @returns {string} - Active primary tab id ("dashboard" | "groups" | "activity" | "settlements" | "settings" | "")
 */
export function getActiveMobileTab(pathname = "") {
  if (!pathname) return "";
  
  const cleanPath = pathname.split("?")[0].split("#")[0].toLowerCase();

  // 1. Dashboard
  if (cleanPath === "/dashboard" || cleanPath === "/") {
    return "dashboard";
  }

  // 2. Groups (includes individual ledgers & friends directory)
  if (cleanPath.startsWith("/groups") || cleanPath.startsWith("/friends")) {
    return "groups";
  }

  // 3. Activity (includes expense stream & analytics charts)
  if (
    cleanPath.startsWith("/expenses") ||
    cleanPath.startsWith("/activity") ||
    cleanPath.startsWith("/analytics")
  ) {
    return "activity";
  }

  // 4. Settlements
  if (cleanPath.startsWith("/settlements")) {
    return "settlements";
  }

  // 5. Account Settings
  if (cleanPath.startsWith("/settings")) {
    return "settings";
  }

  return "";
}
