/**
 * SplitMate Invitation Utilities
 * Safe URL generation, invite-code parsing, and error normalization.
 */

/**
 * Generate a canonical invite URL pointing to the frontend /join/:inviteCode route
 * @param {string} origin - window.location.origin (e.g. https://split-mate-five-dun.vercel.app)
 * @param {string} inviteCode - Unique group invite code (e.g. sm-a8b2c4)
 * @returns {string} Fully-qualified frontend invitation URL
 */
export function generateInviteUrl(origin, inviteCode) {
  if (!inviteCode || typeof inviteCode !== "string") {
    return "";
  }

  const cleanCode = inviteCode.trim();
  if (!cleanCode) {
    return "";
  }

  const cleanOrigin = (origin || (typeof window !== "undefined" ? window.location?.origin : "")) || "";
  const normalizedOrigin = cleanOrigin.replace(/\/+$/, "");

  return normalizedOrigin ? `${normalizedOrigin}/join/${cleanCode}` : `/join/${cleanCode}`;
}

/**
 * Parse an invitation code from either raw text or a pasted full invitation URL
 * @param {string} input - User input (e.g. "sm-a8b2c4" or "https://split-mate-five-dun.vercel.app/join/sm-a8b2c4")
 * @returns {string} Clean invite code
 */
export function parseInviteCode(input) {
  if (!input || typeof input !== "string") {
    return "";
  }

  let code = input.trim();

  // If the user pasted a full URL containing /join/
  if (code.includes("/join/")) {
    const parts = code.split("/join/");
    code = parts[parts.length - 1] || "";
  }

  // Strip query parameters (?ref=...) and hash fragments (#...)
  code = code.split("?")[0].split("#")[0].trim();

  // Strip any trailing slashes
  code = code.replace(/\/+$/, "");

  return code;
}

/**
 * Validate that an invitation code meets minimum format requirements
 * @param {string} code
 * @returns {boolean}
 */
export function validateInviteCode(code) {
  if (!code || typeof code !== "string") {
    return false;
  }
  const clean = code.trim();
  return clean.length >= 3 && clean.length <= 64;
}

/**
 * Normalize API error responses for group invitation operations into user-friendly messages
 * @param {any} err - Error object or string
 * @returns {string} Normalized user-friendly error message
 */
export function getInviteErrorMessage(err) {
  const message = typeof err === "string" ? err : err?.message || "";
  const lower = message.toLowerCase();

  if (lower.includes("already a member")) {
    return "You are already a member of this group";
  }
  if (lower.includes("expired")) {
    return "This invitation link has expired";
  }
  if (lower.includes("revoked") || lower.includes("invalid") || lower.includes("not found")) {
    return "Invitation link is invalid or has been revoked";
  }
  if (lower.includes("network") || lower.includes("failed to fetch")) {
    return "Unable to connect to the server. Please check your internet connection.";
  }

  return message || "Invalid or expired invitation link";
}
