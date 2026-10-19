/**
 * SplitMate Centralized Expense Categories
 * 
 * Single source of truth for frontend expense categories.
 * Matches backend EXPENSE_CATEGORIES in server/src/models/Expense.js:
 * ["Food & Drink", "Groceries", "Transportation", "Housing", "Utilities", "Entertainment", "Shopping", "Travel", "Medical", "General", "Other"]
 */

export const EXPENSE_CATEGORIES = [
  "Food & Drink",
  "Groceries",
  "Transportation",
  "Housing",
  "Utilities",
  "Entertainment",
  "Shopping",
  "Travel",
  "Medical",
  "General",
  "Other"
];

// Alias for backwards compatibility with analytics modules
export const CANONICAL_CATEGORIES = EXPENSE_CATEGORIES;
