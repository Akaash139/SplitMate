const { EXPENSE_CATEGORIES } = require("../models/Expense");
const { toPaise, fromPaise } = require("./expenseSplits");

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/**
 * Extracts a valid Date object from an expense record (checking date or createdAt)
 *
 * @param {object} expense
 * @returns {Date|null}
 */
function getExpenseDate(expense) {
  if (!expense) return null;
  if (expense.date) {
    const d = new Date(expense.date);
    if (!isNaN(d.getTime())) return d;
  }
  if (expense.createdAt) {
    const d = new Date(expense.createdAt);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Safely extracts integer paise from an expense object
 *
 * @param {object} expense
 * @returns {number} Integer paise (>= 0)
 */
function getExpensePaise(expense) {
  if (!expense) return 0;
  if (typeof expense.amountPaise === "number" && Number.isFinite(expense.amountPaise) && expense.amountPaise >= 0) {
    return Math.round(expense.amountPaise);
  }
  if (typeof expense.amount === "number" && Number.isFinite(expense.amount) && expense.amount > 0) {
    try {
      return toPaise(expense.amount);
    } catch {
      return Math.round(expense.amount * 100);
    }
  }
  return 0;
}

/**
 * Validates and normalizes date/month/category query parameters.
 * Throws an Error with .status = 400 on invalid input.
 *
 * @param {object} query - Express req.query
 * @returns {object} Normalized filter options
 */
function parseDateFilter(query = {}) {
  const { month, year, startDate, endDate, category } = query;

  let parsedMonth = null;
  let parsedYear = null;
  let parsedStartDate = null;
  let parsedEndDate = null;
  let parsedCategory = null;
  let filterType = "all";

  // 1. Validate Category (if provided)
  if (category !== undefined && category !== null && category !== "") {
    const trimmedCategory = String(category).trim();
    if (!EXPENSE_CATEGORIES.includes(trimmedCategory)) {
      const err = new Error(
        `Invalid category: '${trimmedCategory}'. Supported categories: ${EXPENSE_CATEGORIES.join(", ")}`
      );
      err.status = 400;
      throw err;
    }
    parsedCategory = trimmedCategory;
  }

  // 2. Validate Custom Date Range (startDate & endDate)
  if (startDate !== undefined && startDate !== null && startDate !== "") {
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      const err = new Error("Invalid startDate: must be a valid ISO date or YYYY-MM-DD string");
      err.status = 400;
      throw err;
    }
    // If only YYYY-MM-DD format (length <= 10), start at beginning of day UTC
    if (String(startDate).trim().length <= 10) {
      start.setUTCHours(0, 0, 0, 0);
    }
    parsedStartDate = start;
    filterType = "custom";
  }

  if (endDate !== undefined && endDate !== null && endDate !== "") {
    const end = new Date(endDate);
    if (isNaN(end.getTime())) {
      const err = new Error("Invalid endDate: must be a valid ISO date or YYYY-MM-DD string");
      err.status = 400;
      throw err;
    }
    // If only YYYY-MM-DD format (length <= 10), end at the very end of day UTC
    if (String(endDate).trim().length <= 10) {
      end.setUTCHours(23, 59, 59, 999);
    }
    parsedEndDate = end;
    filterType = "custom";
  }

  if (parsedStartDate && parsedEndDate && parsedStartDate.getTime() > parsedEndDate.getTime()) {
    const err = new Error("Invalid date range: startDate cannot be after endDate");
    err.status = 400;
    throw err;
  }

  // If custom date range was provided, it takes precedence over month/year
  if (filterType === "custom") {
    const dateQuery = {};
    if (parsedStartDate) dateQuery.$gte = parsedStartDate;
    if (parsedEndDate) dateQuery.$lte = parsedEndDate;

    return {
      filterType: "custom",
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      month: null,
      year: null,
      category: parsedCategory,
      dateQuery: Object.keys(dateQuery).length > 0 ? dateQuery : null
    };
  }

  // 3. Validate Month & Year
  if (month !== undefined && month !== null && month !== "") {
    const monthNum = Number(month);
    if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
      const err = new Error("Invalid month: must be an integer between 1 and 12");
      err.status = 400;
      throw err;
    }
    parsedMonth = monthNum;
  }

  if (year !== undefined && year !== null && year !== "") {
    const yearNum = Number(year);
    if (!Number.isInteger(yearNum) || yearNum < 1970 || yearNum > 2100) {
      const err = new Error("Invalid year: must be a 4-digit integer between 1970 and 2100");
      err.status = 400;
      throw err;
    }
    parsedYear = yearNum;
  }

  // If month is provided without year, default to current year
  if (parsedMonth !== null && parsedYear === null) {
    parsedYear = new Date().getUTCFullYear();
  }

  if (parsedMonth !== null && parsedYear !== null) {
    filterType = "month";
    parsedStartDate = new Date(Date.UTC(parsedYear, parsedMonth - 1, 1, 0, 0, 0, 0));
    parsedEndDate = new Date(Date.UTC(parsedYear, parsedMonth, 0, 23, 59, 59, 999));
  } else if (parsedYear !== null) {
    filterType = "year";
    parsedStartDate = new Date(Date.UTC(parsedYear, 0, 1, 0, 0, 0, 0));
    parsedEndDate = new Date(Date.UTC(parsedYear, 11, 31, 23, 59, 59, 999));
  }

  const dateQuery = {};
  if (parsedStartDate) dateQuery.$gte = parsedStartDate;
  if (parsedEndDate) dateQuery.$lte = parsedEndDate;

  return {
    filterType,
    startDate: parsedStartDate,
    endDate: parsedEndDate,
    month: parsedMonth,
    year: parsedYear,
    category: parsedCategory,
    dateQuery: Object.keys(dateQuery).length > 0 ? dateQuery : null
  };
}

/**
 * Filter an in-memory array of expenses using normalized filter criteria.
 * Serves as a defensive fallback and test support.
 *
 * @param {Array} expenses
 * @param {object} filter
 * @returns {Array} Filtered expenses
 */
function filterExpensesInMemory(expenses = [], filter = {}) {
  if (!Array.isArray(expenses)) return [];

  return expenses.filter((exp) => {
    if (!exp) return false;

    // Filter out malformed records with zero or negative amount
    const amount = exp.amount;
    if (typeof amount !== "number" || isNaN(amount) || amount <= 0) {
      return false;
    }

    // Category filter
    if (filter.category) {
      const cat = exp.category || "General";
      if (cat !== filter.category) return false;
    }

    // Date range filter
    if (filter.startDate || filter.endDate) {
      const expDate = getExpenseDate(exp);
      if (!expDate) return false;

      const time = expDate.getTime();
      if (filter.startDate && time < filter.startDate.getTime()) return false;
      if (filter.endDate && time > filter.endDate.getTime()) return false;
    }

    return true;
  });
}

/**
 * Calculates comprehensive analytics in integer paise for a set of expenses.
 *
 * @param {Array} expenses - Filtered array of expense objects/documents
 * @param {object} options
 * @param {string|object} [options.currentUserId] - Authenticated user ID
 * @param {Array} [options.groupMembers=[]] - Members array from Group
 * @param {number|null} [options.fixedYear=null] - If year filter applied, generate all 12 months
 * @returns {object} Analytics data structure
 */
function calculateAnalytics(expenses = [], { currentUserId = null, groupMembers = [], fixedYear = null } = {}) {
  const currentUserIdStr = currentUserId
    ? (currentUserId._id || currentUserId.id || currentUserId).toString()
    : null;

  // Initialize category map for all standard categories
  const categoryMap = new Map();
  for (const cat of EXPENSE_CATEGORIES) {
    categoryMap.set(cat, {
      category: cat,
      totalPaise: 0,
      count: 0,
      userSharePaise: 0,
      userPaidPaise: 0
    });
  }

  let totalSpentPaise = 0;
  let expenseCount = 0;
  let userTotalSharePaise = 0;
  let userTotalPaidPaise = 0;

  // Monthly trends map: key = YYYY-MM
  const monthlyTrendsMap = new Map();

  // If a fixed year is specified, pre-populate all 12 months with 0
  if (fixedYear && Number.isInteger(fixedYear)) {
    for (let m = 1; m <= 12; m++) {
      const monthKey = `${fixedYear}-${String(m).padStart(2, "0")}`;
      const label = `${MONTH_NAMES[m - 1]} ${fixedYear}`;
      monthlyTrendsMap.set(monthKey, {
        month: monthKey,
        monthLabel: label,
        year: fixedYear,
        monthNumber: m,
        totalPaise: 0,
        count: 0,
        userSharePaise: 0
      });
    }
  }

  // Member spending map
  const memberMap = new Map();
  if (Array.isArray(groupMembers)) {
    for (const m of groupMembers) {
      const userObj = m.user?._id ? m.user : m;
      const uid = (userObj?._id || userObj?.id || userObj)?.toString();
      if (uid) {
        memberMap.set(uid, {
          user: {
            id: uid,
            name: userObj?.name || "Group Member",
            email: userObj?.email || "",
            avatar: userObj?.avatar || ""
          },
          totalPaidPaise: 0,
          totalSharePaise: 0
        });
      }
    }
  }

  for (const exp of expenses) {
    if (!exp) continue;

    const paise = getExpensePaise(exp);
    if (paise <= 0) continue;

    totalSpentPaise += paise;
    expenseCount += 1;

    // 1. Category aggregation
    const rawCategory = exp.category || "General";
    const category = EXPENSE_CATEGORIES.includes(rawCategory) ? rawCategory : "Other";
    const catData = categoryMap.get(category);

    catData.totalPaise += paise;
    catData.count += 1;

    // 2. User calculations (Share and Paid)
    const payerId = (exp.paidBy?._id || exp.paidBy?.id || exp.paidBy)?.toString();
    const isPayer = currentUserIdStr && payerId === currentUserIdStr;

    if (isPayer) {
      userTotalPaidPaise += paise;
      catData.userPaidPaise += paise;
    }

    // Determine current user's share in this expense
    let userShareForExp = 0;
    if (currentUserIdStr) {
      if (Array.isArray(exp.splits) && exp.splits.length > 0) {
        const split = exp.splits.find((s) => {
          const sUid = (s.user?._id || s.user?.id || s.user)?.toString();
          return sUid === currentUserIdStr;
        });
        if (split) {
          if (typeof split.amountPaise === "number" && Number.isFinite(split.amountPaise)) {
            userShareForExp = Math.round(split.amountPaise);
          } else if (typeof split.amount === "number" && Number.isFinite(split.amount)) {
            try {
              userShareForExp = toPaise(split.amount, { allowZero: true });
            } catch {
              userShareForExp = Math.round(split.amount * 100);
            }
          }
        }
      } else if (Array.isArray(exp.participants) && exp.participants.length > 0) {
        const inParticipants = exp.participants.some((p) => {
          const pUid = (p?._id || p?.id || p)?.toString();
          return pUid === currentUserIdStr;
        });
        if (inParticipants) {
          userShareForExp = Math.round(paise / exp.participants.length);
        }
      }
    }

    userTotalSharePaise += userShareForExp;
    catData.userSharePaise += userShareForExp;

    // 3. Member spending tracking
    if (payerId && memberMap.has(payerId)) {
      memberMap.get(payerId).totalPaidPaise += paise;
    }

    if (Array.isArray(exp.splits)) {
      for (const s of exp.splits) {
        const sUid = (s.user?._id || s.user?.id || s.user)?.toString();
        if (sUid && memberMap.has(sUid)) {
          let sPaise = 0;
          if (typeof s.amountPaise === "number" && Number.isFinite(s.amountPaise)) {
            sPaise = Math.round(s.amountPaise);
          } else if (typeof s.amount === "number") {
            try {
              sPaise = toPaise(s.amount, { allowZero: true });
            } catch {
              sPaise = Math.round(s.amount * 100);
            }
          }
          memberMap.get(sUid).totalSharePaise += sPaise;
        }
      }
    }

    // 4. Monthly trends tracking
    const expDate = getExpenseDate(exp);
    if (expDate) {
      const year = expDate.getUTCFullYear();
      const monthNum = expDate.getUTCMonth() + 1;
      const monthKey = `${year}-${String(monthNum).padStart(2, "0")}`;

      if (!monthlyTrendsMap.has(monthKey)) {
        const label = `${MONTH_NAMES[monthNum - 1]} ${year}`;
        monthlyTrendsMap.set(monthKey, {
          month: monthKey,
          monthLabel: label,
          year,
          monthNumber: monthNum,
          totalPaise: 0,
          count: 0,
          userSharePaise: 0
        });
      }

      const trend = monthlyTrendsMap.get(monthKey);
      trend.totalPaise += paise;
      trend.count += 1;
      trend.userSharePaise += userShareForExp;
    }
  }

  // Format all categories
  const allCategories = [];
  const activeCategories = [];

  for (const cat of EXPENSE_CATEGORIES) {
    const data = categoryMap.get(cat);
    const totalRupees = fromPaise(data.totalPaise);
    const userShareRupees = fromPaise(data.userSharePaise);
    const userPaidRupees = fromPaise(data.userPaidPaise);
    const percentage =
      totalSpentPaise > 0
        ? Number(((data.totalPaise / totalSpentPaise) * 100).toFixed(2))
        : 0;

    const formatted = {
      category: cat,
      total: totalRupees,
      totalPaise: data.totalPaise,
      count: data.count,
      percentage,
      userShare: userShareRupees,
      userSharePaise: data.userSharePaise,
      userPaid: userPaidRupees,
      userPaidPaise: data.userPaidPaise
    };

    allCategories.push(formatted);
    if (data.totalPaise > 0) {
      activeCategories.push(formatted);
    }
  }

  // Sort active categories by totalPaise descending
  activeCategories.sort((a, b) => b.totalPaise - a.totalPaise);

  // Top category
  const topCategory =
    activeCategories.length > 0
      ? {
          category: activeCategories[0].category,
          total: activeCategories[0].total,
          totalPaise: activeCategories[0].totalPaise,
          percentage: activeCategories[0].percentage
        }
      : null;

  // Format monthly trends sorted chronologically
  const monthlyTrends = Array.from(monthlyTrendsMap.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((t) => ({
      month: t.month,
      monthLabel: t.monthLabel,
      year: t.year,
      monthNumber: t.monthNumber,
      total: fromPaise(t.totalPaise),
      totalPaise: t.totalPaise,
      count: t.count,
      userShare: fromPaise(t.userSharePaise),
      userSharePaise: t.userSharePaise
    }));

  // Format member spending
  const memberSpending = Array.from(memberMap.values())
    .map((m) => {
      const paid = fromPaise(m.totalPaidPaise);
      const share = fromPaise(m.totalSharePaise);
      const pct =
        totalSpentPaise > 0
          ? Number(((m.totalPaidPaise / totalSpentPaise) * 100).toFixed(2))
          : 0;
      return {
        user: m.user,
        totalPaid: paid,
        totalPaidPaise: m.totalPaidPaise,
        totalShare: share,
        totalSharePaise: m.totalSharePaise,
        percentageOfTotal: pct
      };
    })
    .sort((a, b) => b.totalPaidPaise - a.totalPaidPaise);

  const averageExpensePaise =
    expenseCount > 0 ? Math.round(totalSpentPaise / expenseCount) : 0;

  return {
    summary: {
      totalSpent: fromPaise(totalSpentPaise),
      totalSpentPaise,
      expenseCount,
      averageExpense: fromPaise(averageExpensePaise),
      averageExpensePaise,
      userTotalShare: fromPaise(userTotalSharePaise),
      userTotalSharePaise,
      userTotalPaid: fromPaise(userTotalPaidPaise),
      userTotalPaidPaise,
      topCategory
    },
    categoryBreakdown: activeCategories,
    allCategories,
    monthlyTrends,
    memberSpending
  };
}

module.exports = {
  EXPENSE_CATEGORIES,
  getExpenseDate,
  getExpensePaise,
  parseDateFilter,
  filterExpensesInMemory,
  calculateAnalytics
};
