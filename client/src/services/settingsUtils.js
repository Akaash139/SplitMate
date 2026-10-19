/**
 * Account Settings Utilities
 * Validation helpers and formatting utilities for user profile and password management.
 */

/**
 * Validate user display name
 * @param {string} name
 * @returns {{ isValid: boolean, error: string }}
 */
export function validateProfileName(name) {
  if (!name || typeof name !== "string" || !name.trim()) {
    return { isValid: false, error: "Full name is required" };
  }

  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { isValid: false, error: "Full name must be at least 2 characters long" };
  }

  if (trimmed.length > 60) {
    return { isValid: false, error: "Full name cannot exceed 60 characters" };
  }

  return { isValid: true, error: "" };
}

/**
 * Validate password change form inputs
 * @param {string} currentPassword
 * @param {string} newPassword
 * @param {string} confirmPassword
 * @returns {{ isValid: boolean, errors: Record<string, string> }}
 */
export function validatePasswordChange(currentPassword, newPassword, confirmPassword) {
  const errors = {};

  if (!currentPassword || typeof currentPassword !== "string") {
    errors.currentPassword = "Current password is required";
  }

  if (!newPassword || typeof newPassword !== "string") {
    errors.newPassword = "New password is required";
  } else if (newPassword.length < 6) {
    errors.newPassword = "New password must be at least 6 characters long";
  } else if (currentPassword && newPassword === currentPassword) {
    errors.newPassword = "New password cannot be the same as your current password";
  }

  if (!confirmPassword || typeof confirmPassword !== "string") {
    errors.confirmPassword = "Confirm password is required";
  } else if (newPassword && newPassword !== confirmPassword) {
    errors.confirmPassword = "Passwords do not match";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Format membership registration date for display
 * @param {string|Date} dateString
 * @returns {string}
 */
export function formatMemberSince(dateString) {
  if (!dateString) return "Active Member";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "Active Member";
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  } catch {
    return "Active Member";
  }
}

/**
 * Identify user's authentication provider
 * @param {Object} user
 * @returns {"google" | "local"}
 */
export function getAuthProviderType(user) {
  if (!user) return "local";
  if (user.authProvider === "google" || Boolean(user.googleId)) {
    return "google";
  }
  return "local";
}
