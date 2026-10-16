import {
  Utensils,
  ShoppingBag,
  Car,
  Home,
  Zap,
  Film,
  Tag,
  Plane,
  Heart,
  Receipt,
  Folder
} from "lucide-react";

/**
 * SplitMate Canonical Expense Categories (11 supported categories)
 */
export const CANONICAL_CATEGORIES = [
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

/**
 * Harmonious, high-contrast, accessible color palette tailored to SplitMate's design system
 */
export const CATEGORY_COLORS = {
  "Food & Drink": "#F97316", // Warm Coral / Orange
  Groceries: "#10B981",     // Emerald Green
  Transportation: "#3B82F6",// Electric Blue
  Housing: "#8B5CF6",       // Electric Violet (Brand signature)
  Utilities: "#F59E0B",     // Amber / Yellow
  Entertainment: "#EC4899", // Vibrant Pink / Magenta
  Shopping: "#06B6D4",      // Cyan / Sky
  Travel: "#0D9488",        // Deep Teal
  Medical: "#EF4444",       // Rose / Crimson
  General: "#64748B",       // Slate Charcoal
  Other: "#A855F7"          // Royal Purple
};

/**
 * Category icons mapped to Lucide icon components
 */
export const CATEGORY_ICONS = {
  "Food & Drink": Utensils,
  Groceries: ShoppingBag,
  Transportation: Car,
  Housing: Home,
  Utilities: Zap,
  Entertainment: Film,
  Shopping: Tag,
  Travel: Plane,
  Medical: Heart,
  General: Receipt,
  Other: Folder
};

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const MONTH_SHORT_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/**
 * Formats a monetary value into Indian Rupee locale with 2 decimal places
 *
 * @param {number|string} val - Monetary value
 * @returns {string} Formatted string, e.g. "1,250.00"
 */
export function formatINR(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return "0.00";
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Validates custom date range filters.
 *
 * @param {string} startDate
 * @param {string} endDate
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validateDateRange(startDate, endDate) {
  if (!startDate && !endDate) {
    return { isValid: true };
  }

  if (startDate) {
    const s = new Date(startDate);
    if (isNaN(s.getTime())) {
      return { isValid: false, error: "Start date is not a valid date." };
    }
  }

  if (endDate) {
    const e = new Date(endDate);
    if (isNaN(e.getTime())) {
      return { isValid: false, error: "End date is not a valid date." };
    }
  }

  if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (s.getTime() > e.getTime()) {
      return { isValid: false, error: "Start date cannot be after end date." };
    }
  }

  return { isValid: true };
}

/**
 * Converts polar coordinates to Cartesian coordinates for SVG path generation
 */
export function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: Number((centerX + radius * Math.cos(angleInRadians)).toFixed(4)),
    y: Number((centerY + radius * Math.sin(angleInRadians)).toFixed(4))
  };
}

/**
 * Builds an SVG path definition for a donut slice arc
 */
export function describeDonutArc(x, y, radius, innerRadius, startAngle, endAngle) {
  // Clamp delta to prevent complete overlapping overlap glitch at 360
  const delta = Math.min(359.999, endAngle - startAngle);
  const effectiveEndAngle = startAngle + delta;

  const start = polarToCartesian(x, y, radius, effectiveEndAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const startInner = polarToCartesian(x, y, innerRadius, effectiveEndAngle);
  const endInner = polarToCartesian(x, y, innerRadius, startAngle);

  const largeArcFlag = delta > 180 ? 1 : 0;

  return [
    "M", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
    "L", endInner.x, endInner.y,
    "A", innerRadius, innerRadius, 0, largeArcFlag, 1, startInner.x, startInner.y,
    "Z"
  ].join(" ");
}

/**
 * Pre-computes SVG slice angles, paths, and metadata for the Doughnut Chart
 *
 * @param {Array} categoryBreakdown - Category summary list with amounts and percentages
 * @param {number} totalSpent - Total expenditure in INR
 * @returns {Array} Array of slice objects for SVG rendering
 */
export function calculateDonutSlices(categoryBreakdown = [], totalSpent = 0) {
  if (!Array.isArray(categoryBreakdown) || categoryBreakdown.length === 0 || totalSpent <= 0) {
    return [];
  }

  const cx = 150;
  const cy = 150;
  const radius = 120;
  const innerRadius = 78;

  let currentAngle = 0;
  const validCategories = categoryBreakdown.filter((c) => (c.total || 0) > 0);

  return validCategories.map((item) => {
    const rawPct = (item.total / totalSpent) * 100;
    const sliceAngle = Math.max(0.1, (rawPct / 100) * 360);
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    currentAngle = endAngle;

    const pathD = describeDonutArc(cx, cy, radius, innerRadius, startAngle, endAngle);
    const midAngle = startAngle + (endAngle - startAngle) / 2;
    const color = CATEGORY_COLORS[item.category] || "#8B5CF6";

    return {
      category: item.category,
      total: item.total,
      totalPaise: item.totalPaise,
      count: item.count || 0,
      percentage: Number(rawPct.toFixed(1)),
      userShare: item.userShare || 0,
      color,
      pathD,
      startAngle,
      endAngle,
      midAngle
    };
  });
}

/**
 * Computes SVG bar chart dimensions, coordinates, and scale metrics
 *
 * @param {Array} monthlyTrends - Array of monthly items { month, monthLabel, total, count }
 * @param {number} svgWidth - ViewBox width
 * @param {number} svgHeight - ViewBox height
 * @returns {object} Scaled bar geometry and tick marks
 */
export function calculateBarChartMetrics(monthlyTrends = [], svgWidth = 640, svgHeight = 240) {
  const margin = { top: 24, right: 20, bottom: 40, left: 60 };
  const chartWidth = svgWidth - margin.left - margin.right;
  const chartHeight = svgHeight - margin.top - margin.bottom;

  if (!Array.isArray(monthlyTrends) || monthlyTrends.length === 0) {
    return {
      bars: [],
      yTicks: [0, 500, 1000],
      maxY: 1000,
      margin,
      chartWidth,
      chartHeight
    };
  }

  // Calculate highest monthly total
  const rawMax = Math.max(...monthlyTrends.map((t) => Number(t.total) || 0), 0);
  // Round up to clean ceiling (e.g. 100 -> 100, 1250 -> 1500, 4800 -> 5000)
  let maxY = Math.ceil(rawMax / 500) * 500;
  if (maxY <= 0) maxY = 1000;

  // Generate 4 vertical tick levels: 0, 33%, 66%, 100%
  const yTicks = [
    0,
    Math.round(maxY * 0.33),
    Math.round(maxY * 0.66),
    maxY
  ];

  const barCount = monthlyTrends.length;
  const slotWidth = chartWidth / barCount;
  const barWidth = Math.min(36, Math.max(14, slotWidth * 0.6));

  const bars = monthlyTrends.map((item, index) => {
    const val = Number(item.total) || 0;
    const heightRatio = maxY > 0 ? val / maxY : 0;
    const barHeight = Math.max(val > 0 ? 4 : 1, Math.round(heightRatio * chartHeight));
    const x = margin.left + index * slotWidth + (slotWidth - barWidth) / 2;
    const y = margin.top + (chartHeight - barHeight);

    return {
      month: item.month,
      monthLabel: item.monthLabel || item.month,
      total: val,
      totalPaise: item.totalPaise || Math.round(val * 100),
      count: item.count || 0,
      userShare: item.userShare || 0,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      width: Number(barWidth.toFixed(2)),
      height: Number(barHeight.toFixed(2)),
      isZero: val === 0
    };
  });

  return {
    bars,
    yTicks,
    maxY,
    margin,
    chartWidth,
    chartHeight
  };
}

/**
 * Builds API query parameters object from active UI filters
 *
 * @param {object} filters
 * @returns {object} API query parameters
 */
export function buildAnalyticsQueryParams(filters = {}) {
  const {
    filterPeriod = "all",
    filterMonth,
    filterYear,
    startDate,
    endDate,
    filterCategory
  } = filters;

  const params = {};
  if (filterPeriod === "month") {
    if (filterMonth !== undefined && filterMonth !== null) params.month = filterMonth;
    if (filterYear !== undefined && filterYear !== null) params.year = filterYear;
  } else if (filterPeriod === "year") {
    if (filterYear !== undefined && filterYear !== null) params.year = filterYear;
  } else if (filterPeriod === "custom") {
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
  }

  if (filterCategory && filterCategory !== "all") {
    params.category = filterCategory;
  }

  return params;
}

/**
 * Safely parses summary metrics with robust defaults for missing or malformed fields
 *
 * @param {object} analyticsData - Raw or partial API payload
 * @returns {object} Normalized summary object
 */
export function parseAnalyticsSummary(analyticsData) {
  const summary = analyticsData?.summary || {};
  return {
    totalSpent: Number(summary.totalSpent) || 0,
    totalSpentPaise: Number(summary.totalSpentPaise) || 0,
    expenseCount: Number(summary.expenseCount) || 0,
    averageExpense: Number(summary.averageExpense) || 0,
    userTotalShare: Number(summary.userTotalShare) || 0,
    userTotalPaid: Number(summary.userTotalPaid) || 0,
    topCategory: summary.topCategory && typeof summary.topCategory === "object"
      ? {
          category: summary.topCategory.category || "None",
          total: Number(summary.topCategory.total) || 0,
          totalPaise: Number(summary.topCategory.totalPaise) || 0,
          percentage: Number(summary.topCategory.percentage) || 0,
          count: Number(summary.topCategory.count) || 0
        }
      : null
  };
}

/**
 * Finds the month with peak total spending from monthly trend data
 *
 * @param {Array} monthlyTrends
 * @returns {object|null} Peak month record or null if no spending
 */
export function getPeakSpendingMonth(monthlyTrends = []) {
  if (!Array.isArray(monthlyTrends) || monthlyTrends.length === 0) return null;
  const activeMonths = monthlyTrends.filter((m) => Number(m.total) > 0);
  if (activeMonths.length === 0) return null;
  return [...activeMonths].sort((a, b) => Number(b.total) - Number(a.total))[0];
}

/**
 * Validates whether a response was superseded by a newer dispatched request (anti-race condition)
 *
 * @param {number} dispatchedId - Request ID recorded when dispatching
 * @param {number} currentLatestId - Latest request ID in component ref
 * @returns {boolean} True if response is stale and should be discarded
 */
export function isStaleResponse(dispatchedId, currentLatestId) {
  return dispatchedId !== currentLatestId;
}

/**
 * Formats a category tooltip string
 *
 * @param {object} categoryData
 * @param {number} totalSpent
 * @param {string} currency
 * @returns {string}
 */
export function formatCategoryTooltip(categoryData, totalSpent, currency = "₹") {
  if (!categoryData) return "";
  const name = categoryData.category || "Category";
  const amount = formatINR(categoryData.total || 0);
  const pct = totalSpent > 0 ? (((categoryData.total || 0) / totalSpent) * 100).toFixed(1) : "0.0";
  return `${name}: ${currency}${amount} (${pct}%)`;
}

