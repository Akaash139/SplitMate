/**
 * Pure helper utility functions for Dashboard data processing and filtering
 */

/**
 * Safely extracts a normalized lowercase ID string from any entity:
 * string, Mongoose ObjectId, populated document ({ _id }), client object ({ id }),
 * user container ({ user }), or auth user object ({ userId }).
 *
 * @param {any} val - Value to extract ID from
 * @returns {string} Normalized string ID or empty string if not resolvable
 */
export function toIdString(val) {
  if (!val) return "";
  if (typeof val === "string") return val.trim().toLowerCase();

  if (typeof val === "object") {
    // If it has a nested user property (e.g. group member or split item)
    if (val.user) {
      const nested = toIdString(val.user);
      if (nested) return nested;
    }
    // Check standard Mongoose _id
    if (val._id) {
      const idFromUnderscore = toIdString(val._id);
      if (idFromUnderscore) return idFromUnderscore;
    }
    // Check serialized id
    if (val.id) {
      const idFromId = toIdString(val.id);
      if (idFromId) return idFromId;
    }
    // Check userId property
    if (val.userId) {
      const idFromUserId = toIdString(val.userId);
      if (idFromUserId) return idFromUserId;
    }
    // Handle Mongoose ObjectId or custom objects with custom toString
    if (typeof val.toString === "function") {
      const str = val.toString();
      if (str && str !== "[object Object]") {
        return str.trim().toLowerCase();
      }
    }
  }

  return "";
}

/**
 * Filter an array of expenses by 'all' or 'mine'.
 *
 * Requirements:
 * - 'all': Returns all loaded expenses across the user's groups.
 * - 'mine': Displays ONLY expenses where the authenticated user is the payer (`paidBy`).
 *   Expenses paid by another member are strictly excluded, even if the logged-in user
 *   created the expense or participated in its split.
 * - Compares strictly by ID (supporting populated objects with _id or id, and raw ID strings).
 *   Never matches by display name or email.
 *
 * @param {Array} allExpenses - List of expenses
 * @param {'all'|'mine'} filter - Active filter selection
 * @param {string|object} currentUserIdOrUser - Authenticated user identifier or user object
 * @returns {Array} Filtered expenses
 */
export function filterExpenses(allExpenses, filter, currentUserIdOrUser) {
  if (!Array.isArray(allExpenses)) return [];
  if (filter === "all") return allExpenses;

  const targetId = toIdString(currentUserIdOrUser);
  if (!targetId) return [];

  return allExpenses.filter((e) => {
    if (!e) return false;

    // Strict payer comparison: Only expenses where current user is the payer
    const payerId = toIdString(e.paidBy);
    return Boolean(payerId && payerId === targetId);
  });
}

/**
 * Flatten multi-group expense arrays, attach group context, and sort newest first
 * @param {Array<Array>} groupExpensesArrays - Array of expense arrays
 * @returns {Array} Merged and sorted expenses
 */
export function sortAndMergeExpenses(groupExpensesArrays) {
  if (!Array.isArray(groupExpensesArrays)) return [];
  return groupExpensesArrays
    .flat()
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}
