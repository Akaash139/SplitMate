/**
 * Pure helper utility functions for the All Expenses page:
 * - Multi-group expense merging and deduplication
 * - Group metadata preservation
 * - Chronological sorting
 * - Partial fetch failure detection
 * - Multi-criteria filtering (payer, group, category, search)
 */

import { toIdString, filterExpenses } from "./dashboardUtils.js";

/**
 * Merge expense arrays from multiple groups, attaching group metadata and deduplicating by ID.
 *
 * @param {Array<{ group: object, expenses: Array<object>, error?: any }>} groupResults
 * @returns {Array<object>} Merged, deduplicated expenses sorted newest first
 */
export function mergeAndSortAllExpenses(groupResults) {
  if (!Array.isArray(groupResults)) return [];

  const expenseMap = new Map();

  for (const item of groupResults) {
    if (!item || !item.group || !Array.isArray(item.expenses)) continue;
    const grp = item.group;
    const groupId = toIdString(grp.id || grp._id);
    const groupName = grp.name || "Unnamed Group";
    const groupCategory = grp.category || "General";

    for (const exp of item.expenses) {
      if (!exp) continue;
      const expId = toIdString(exp.id || exp._id);
      if (!expId) continue;

      if (!expenseMap.has(expId)) {
        expenseMap.set(expId, {
          ...exp,
          groupId: exp.groupId || groupId,
          groupName: exp.groupName || groupName,
          groupCategory: exp.groupCategory || groupCategory
        });
      }
    }
  }

  return Array.from(expenseMap.values()).sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return timeB - timeA;
  });
}

/**
 * Identify any groups whose expense fetch failed
 *
 * @param {Array<{ group: object, expenses: Array<object>, error?: any }>} groupResults
 * @returns {Array<{ groupId: string, groupName: string, error: string }>}
 */
export function getPartialFailures(groupResults) {
  if (!Array.isArray(groupResults)) return [];
  const failures = [];

  for (const item of groupResults) {
    if (item && item.error) {
      const grp = item.group || {};
      failures.push({
        groupId: toIdString(grp.id || grp._id) || "unknown",
        groupName: grp.name || "Unknown Group",
        error:
          typeof item.error === "string"
            ? item.error
            : item.error?.message || "Failed to load expenses"
      });
    }
  }

  return failures;
}

/**
 * Multi-dimensional filtering for the All Expenses page:
 * - payer filter: 'all' vs 'mine' (via strict payer ID comparison)
 * - group filter: 'all' or specific groupId
 * - category filter: 'all' or specific category name
 * - search query: case-insensitive match on description, groupName, notes, or category
 *
 * @param {Array<object>} expenses - List of all merged expenses
 * @param {object} criteria
 * @param {'all'|'mine'} [criteria.payerFilter='all']
 * @param {string|object} [criteria.currentUserId='']
 * @param {string} [criteria.selectedGroupId='all']
 * @param {string} [criteria.selectedCategory='all']
 * @param {string} [criteria.searchQuery='']
 * @returns {Array<object>} Filtered expenses
 */
export function filterAllExpenses(
  expenses,
  {
    payerFilter = "all",
    currentUserId = "",
    selectedGroupId = "all",
    selectedCategory = "all",
    searchQuery = ""
  } = {}
) {
  if (!Array.isArray(expenses)) return [];

  // 1. Payer filter ('all' vs 'mine')
  let result = filterExpenses(expenses, payerFilter, currentUserId);

  // 2. Group filter
  if (selectedGroupId && selectedGroupId !== "all") {
    const targetGroupId = toIdString(selectedGroupId);
    result = result.filter((e) => {
      const gId = toIdString(e.groupId || e.group);
      return gId === targetGroupId;
    });
  }

  // 3. Category filter
  if (selectedCategory && selectedCategory !== "all") {
    result = result.filter((e) => e.category === selectedCategory);
  }

  // 4. Search query
  const query = (searchQuery || "").trim().toLowerCase();
  if (query) {
    result = result.filter((e) => {
      const desc = (e.description || "").toLowerCase();
      const cat = (e.category || "").toLowerCase();
      const grpName = (e.groupName || "").toLowerCase();
      const notes = (e.notes || "").toLowerCase();
      const payer = typeof e.paidBy === "object" ? (e.paidBy?.name || "").toLowerCase() : "";

      return (
        desc.includes(query) ||
        cat.includes(query) ||
        grpName.includes(query) ||
        notes.includes(query) ||
        payer.includes(query)
      );
    });
  }

  return result;
}
