const express = require("express");
const Expense = require("../models/Expense");
const { authenticate } = require("../middleware/authMiddleware");
const { requireGroupMember } = require("../middleware/groupMiddleware");
const {
  parseDateFilter,
  filterExpensesInMemory,
  calculateAnalytics
} = require("../utils/analyticsEngine");

const router = express.Router({ mergeParams: true });

// All analytics endpoints require authentication and active group membership
router.use(authenticate);
router.use(requireGroupMember);

/**
 * @route   GET /api/v1/groups/:groupId/analytics
 * @desc    Comprehensive spending analytics, category breakdowns, and monthly trends for a group
 * @access  Private (Group Members only)
 */
router.get("/", async (req, res, next) => {
  try {
    let parsedFilter;
    try {
      parsedFilter = parseDateFilter(req.query);
    } catch (validationErr) {
      return res.status(validationErr.status || 400).json({
        success: false,
        error: validationErr.message
      });
    }

    // Strict group isolation query
    const filter = { group: req.group._id };
    if (parsedFilter.category) {
      filter.category = parsedFilter.category;
    }
    if (parsedFilter.dateQuery) {
      filter.createdAt = parsedFilter.dateQuery;
    }

    const expensesQuery = Expense.find(filter)
      .sort({ createdAt: -1 })
      .populate("paidBy", "name email avatar")
      .populate("splits.user", "name email avatar");

    const rawExpenses =
      typeof expensesQuery.lean === "function"
        ? await expensesQuery.lean()
        : await expensesQuery;

    // Apply memory filter as a secondary defense layer
    const filteredExpenses = filterExpensesInMemory(rawExpenses || [], parsedFilter);

    const analytics = calculateAnalytics(filteredExpenses, {
      currentUserId: req.user._id,
      groupMembers: req.group.members,
      fixedYear: parsedFilter.filterType === "year" ? parsedFilter.year : null
    });

    return res.status(200).json({
      success: true,
      groupId: req.group._id,
      groupName: req.group.name,
      currency: "INR",
      period: {
        filterType: parsedFilter.filterType,
        startDate: parsedFilter.startDate ? parsedFilter.startDate.toISOString() : null,
        endDate: parsedFilter.endDate ? parsedFilter.endDate.toISOString() : null,
        month: parsedFilter.month,
        year: parsedFilter.year,
        category: parsedFilter.category
      },
      summary: analytics.summary,
      categoryBreakdown: analytics.categoryBreakdown,
      allCategories: analytics.allCategories,
      monthlyTrends: analytics.monthlyTrends,
      memberSpending: analytics.memberSpending
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/groups/:groupId/analytics/categories
 * @desc    Category-specific spending summary and paise-precise breakdowns for spending charts
 * @access  Private (Group Members only)
 */
router.get("/categories", async (req, res, next) => {
  try {
    let parsedFilter;
    try {
      parsedFilter = parseDateFilter(req.query);
    } catch (validationErr) {
      return res.status(validationErr.status || 400).json({
        success: false,
        error: validationErr.message
      });
    }

    const filter = { group: req.group._id };
    if (parsedFilter.category) {
      filter.category = parsedFilter.category;
    }
    if (parsedFilter.dateQuery) {
      filter.createdAt = parsedFilter.dateQuery;
    }

    const expensesQuery = Expense.find(filter).sort({ createdAt: -1 });
    const rawExpenses =
      typeof expensesQuery.lean === "function"
        ? await expensesQuery.lean()
        : await expensesQuery;

    const filteredExpenses = filterExpensesInMemory(rawExpenses || [], parsedFilter);

    const analytics = calculateAnalytics(filteredExpenses, {
      currentUserId: req.user._id,
      groupMembers: req.group.members
    });

    return res.status(200).json({
      success: true,
      groupId: req.group._id,
      groupName: req.group.name,
      currency: "INR",
      period: {
        filterType: parsedFilter.filterType,
        startDate: parsedFilter.startDate ? parsedFilter.startDate.toISOString() : null,
        endDate: parsedFilter.endDate ? parsedFilter.endDate.toISOString() : null,
        month: parsedFilter.month,
        year: parsedFilter.year,
        category: parsedFilter.category
      },
      totalSpent: analytics.summary.totalSpent,
      totalSpentPaise: analytics.summary.totalSpentPaise,
      expenseCount: analytics.summary.expenseCount,
      userTotalShare: analytics.summary.userTotalShare,
      userTotalSharePaise: analytics.summary.userTotalSharePaise,
      categoryBreakdown: analytics.categoryBreakdown,
      allCategories: analytics.allCategories
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/groups/:groupId/analytics/monthly
 * @desc    Monthly spending trends timeline for a group
 * @access  Private (Group Members only)
 */
router.get("/monthly", async (req, res, next) => {
  try {
    let parsedFilter;
    try {
      parsedFilter = parseDateFilter(req.query);
    } catch (validationErr) {
      return res.status(validationErr.status || 400).json({
        success: false,
        error: validationErr.message
      });
    }

    const filter = { group: req.group._id };
    if (parsedFilter.category) {
      filter.category = parsedFilter.category;
    }
    if (parsedFilter.dateQuery) {
      filter.createdAt = parsedFilter.dateQuery;
    }

    const expensesQuery = Expense.find(filter).sort({ createdAt: -1 });
    const rawExpenses =
      typeof expensesQuery.lean === "function"
        ? await expensesQuery.lean()
        : await expensesQuery;

    const filteredExpenses = filterExpensesInMemory(rawExpenses || [], parsedFilter);

    const analytics = calculateAnalytics(filteredExpenses, {
      currentUserId: req.user._id,
      groupMembers: req.group.members,
      fixedYear: parsedFilter.filterType === "year" ? parsedFilter.year : null
    });

    return res.status(200).json({
      success: true,
      groupId: req.group._id,
      groupName: req.group.name,
      currency: "INR",
      period: {
        filterType: parsedFilter.filterType,
        startDate: parsedFilter.startDate ? parsedFilter.startDate.toISOString() : null,
        endDate: parsedFilter.endDate ? parsedFilter.endDate.toISOString() : null,
        month: parsedFilter.month,
        year: parsedFilter.year
      },
      totalSpent: analytics.summary.totalSpent,
      totalSpentPaise: analytics.summary.totalSpentPaise,
      expenseCount: analytics.summary.expenseCount,
      monthlyTrends: analytics.monthlyTrends
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
