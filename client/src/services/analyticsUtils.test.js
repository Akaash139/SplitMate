import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  MONTH_NAMES,
  MONTH_SHORT_NAMES,
  formatINR,
  validateDateRange,
  polarToCartesian,
  describeDonutArc,
  calculateDonutSlices,
  calculateBarChartMetrics,
  buildAnalyticsQueryParams,
  parseAnalyticsSummary,
  getPeakSpendingMonth,
  isStaleResponse,
  formatCategoryTooltip
} from "./analyticsUtils.js";

describe("Analytics Utilities & Chart Visual Engine Test Suite", () => {
  // Mock standard API payload from backend analytics engine
  const mockValidAnalyticsData = {
    scope: "group",
    groupId: "grp-apt-4b",
    summary: {
      totalSpent: 12500.5,
      totalSpentPaise: 1250050,
      expenseCount: 15,
      averageExpense: 833.37,
      userTotalPaid: 6000,
      userTotalShare: 3125.12,
      topCategory: {
        category: "Food & Drink",
        total: 5500,
        totalPaise: 550000,
        percentage: 44.0,
        count: 6
      }
    },
    categoryBreakdown: [
      {
        category: "Food & Drink",
        total: 5500,
        totalPaise: 550000,
        count: 6,
        percentage: 44.0,
        userShare: 1375
      },
      {
        category: "Groceries",
        total: 4000,
        totalPaise: 400000,
        count: 5,
        percentage: 32.0,
        userShare: 1000
      },
      {
        category: "Utilities",
        total: 3000.5,
        totalPaise: 300050,
        count: 4,
        percentage: 24.0,
        userShare: 750.12
      }
    ],
    monthlyTrends: [
      { month: "2026-07", monthLabel: "Jul", total: 2000, count: 2, userShare: 500 },
      { month: "2026-08", monthLabel: "Aug", total: 4500, count: 5, userShare: 1125 },
      { month: "2026-09", monthLabel: "Sep", total: 0, count: 0, userShare: 0 },
      { month: "2026-10", monthLabel: "Oct", total: 6000.5, count: 8, userShare: 1500.12 }
    ],
    memberSpending: [
      {
        user: { id: "user-1", name: "Akaash", email: "akaash@example.com" },
        totalPaid: 6000,
        totalShare: 3125.12,
        percentageOfTotal: 48.0
      },
      {
        user: { id: "user-2", name: "Ram", email: "ram@example.com" },
        totalPaid: 6500.5,
        totalShare: 9375.38,
        percentageOfTotal: 52.0
      }
    ]
  };

  describe("1. Successful analytics response and summary parsing", () => {
    it("should correctly parse and normalize a complete analytics summary", () => {
      const summary = parseAnalyticsSummary(mockValidAnalyticsData);
      assert.equal(summary.totalSpent, 12500.5);
      assert.equal(summary.totalSpentPaise, 1250050);
      assert.equal(summary.expenseCount, 15);
      assert.equal(summary.averageExpense, 833.37);
      assert.equal(summary.userTotalPaid, 6000);
      assert.equal(summary.userTotalShare, 3125.12);
      assert.ok(summary.topCategory);
      assert.equal(summary.topCategory.category, "Food & Drink");
      assert.equal(summary.topCategory.total, 5500);
      assert.equal(summary.topCategory.percentage, 44.0);
    });

    it("should format INR amounts with Indian locale grouping and 2 decimal places", () => {
      assert.equal(formatINR(12500.5), "12,500.50");
      assert.equal(formatINR(1000000), "10,00,000.00");
      assert.equal(formatINR(0), "0.00");
      assert.equal(formatINR(99.9), "99.90");
    });
  });

  describe("2. Category chart geometry and legend calculations", () => {
    it("should calculate donut slices with accurate angles and percentages", () => {
      const slices = calculateDonutSlices(
        mockValidAnalyticsData.categoryBreakdown,
        mockValidAnalyticsData.summary.totalSpent
      );

      assert.equal(slices.length, 3);
      assert.equal(slices[0].category, "Food & Drink");
      assert.equal(slices[0].color, CATEGORY_COLORS["Food & Drink"]);
      assert.equal(slices[0].count, 6);
      assert.ok(slices[0].percentage > 0);
      assert.ok(slices[0].pathD.startsWith("M"));

      // Verify angular continuity: slices start at 0 and end at ~360 degrees
      assert.equal(slices[0].startAngle, 0);
      assert.ok(slices[slices.length - 1].endAngle <= 360.01);
      assert.ok(slices[slices.length - 1].endAngle >= 359.9);
    });

    it("should filter out zero-total categories from donut slice visual", () => {
      const breakdownWithZero = [
        ...mockValidAnalyticsData.categoryBreakdown,
        { category: "Housing", total: 0, count: 0, percentage: 0 }
      ];
      const slices = calculateDonutSlices(breakdownWithZero, 12500.5);
      assert.equal(slices.length, 3, "Categories with 0 total must not generate invisible sliver slices");
    });

    it("should format category tooltip text with amount and percentage share", () => {
      const cat = mockValidAnalyticsData.categoryBreakdown[0];
      const tooltip = formatCategoryTooltip(cat, 12500.5, "₹");
      assert.ok(tooltip.includes("Food & Drink"));
      assert.ok(tooltip.includes("₹5,500.00"));
      assert.ok(tooltip.includes("44.0%"));
    });
  });

  describe("3. Monthly spending trend calculations and peak detection", () => {
    it("should compute scaled SVG bar metrics for monthly trends", () => {
      const metrics = calculateBarChartMetrics(mockValidAnalyticsData.monthlyTrends, 640, 240);

      assert.equal(metrics.bars.length, 4);
      assert.ok(metrics.maxY >= 6000.5, "Maximum Y scale must exceed peak expenditure");
      assert.equal(metrics.yTicks.length, 4, "Must generate 4 vertical guide levels");
      assert.equal(metrics.yTicks[0], 0, "Base tick must start at 0");

      // Verify bar coordinates
      const octBar = metrics.bars[3];
      assert.equal(octBar.monthLabel, "Oct");
      assert.equal(octBar.total, 6000.5);
      assert.ok(octBar.height > 0);
      assert.equal(octBar.isZero, false);
    });

    it("should safely handle zero-spending months without NaN or layout breaks", () => {
      const metrics = calculateBarChartMetrics(mockValidAnalyticsData.monthlyTrends, 640, 240);
      const sepBar = metrics.bars[2]; // Sep had 0 spending

      assert.equal(sepBar.total, 0);
      assert.equal(sepBar.isZero, true);
      assert.equal(sepBar.height, 1, "Zero spending months must retain 1px baseline indicator");
      assert.ok(Number.isFinite(sepBar.x));
      assert.ok(Number.isFinite(sepBar.y));
    });

    it("should correctly identify peak spending month", () => {
      const peak = getPeakSpendingMonth(mockValidAnalyticsData.monthlyTrends);
      assert.ok(peak);
      assert.equal(peak.month, "2026-10");
      assert.equal(peak.monthLabel, "Oct");
      assert.equal(peak.total, 6000.5);
    });

    it("should return null for peak month when all months have zero spending", () => {
      const zeroTrends = [
        { month: "2026-01", total: 0 },
        { month: "2026-02", total: 0 }
      ];
      assert.equal(getPeakSpendingMonth(zeroTrends), null);
    });
  });

  describe("4. Group, date, and category filter behavior", () => {
    it("should build empty query params for 'all' period and 'all' category", () => {
      const params = buildAnalyticsQueryParams({
        filterPeriod: "all",
        filterCategory: "all"
      });
      assert.deepEqual(params, {});
    });

    it("should build month & year query params when filterPeriod is 'month'", () => {
      const params = buildAnalyticsQueryParams({
        filterPeriod: "month",
        filterMonth: 10,
        filterYear: 2026,
        filterCategory: "Food & Drink"
      });
      assert.deepEqual(params, {
        month: 10,
        year: 2026,
        category: "Food & Drink"
      });
    });

    it("should build year query params when filterPeriod is 'year'", () => {
      const params = buildAnalyticsQueryParams({
        filterPeriod: "year",
        filterYear: 2026
      });
      assert.deepEqual(params, { year: 2026 });
    });

    it("should build date range query params when filterPeriod is 'custom'", () => {
      const params = buildAnalyticsQueryParams({
        filterPeriod: "custom",
        startDate: "2026-10-01",
        endDate: "2026-10-15"
      });
      assert.deepEqual(params, {
        startDate: "2026-10-01",
        endDate: "2026-10-15"
      });
    });

    it("should validate date ranges and reject reversed dates (start > end)", () => {
      const invalid = validateDateRange("2026-10-20", "2026-10-10");
      assert.equal(invalid.isValid, false);
      assert.ok(invalid.error.includes("cannot be after end date"));

      const valid = validateDateRange("2026-10-01", "2026-10-15");
      assert.equal(valid.isValid, true);
      assert.equal(valid.error, undefined);

      const empty = validateDateRange("", "");
      assert.equal(empty.isValid, true);
    });

    it("should reject invalid non-date strings", () => {
      const invalidStart = validateDateRange("not-a-date", "2026-10-15");
      assert.equal(invalidStart.isValid, false);
      assert.ok(invalidStart.error.includes("Start date is not a valid date"));

      const invalidEnd = validateDateRange("2026-10-01", "invalid-date-string");
      assert.equal(invalidEnd.isValid, false);
      assert.ok(invalidEnd.error.includes("End date is not a valid date"));
    });
  });

  describe("5. Empty analytics data states", () => {
    it("should return empty slice array for 0 totalSpent", () => {
      const slices = calculateDonutSlices(mockValidAnalyticsData.categoryBreakdown, 0);
      assert.deepEqual(slices, []);
    });

    it("should return empty slice array for null or empty category list", () => {
      assert.deepEqual(calculateDonutSlices([], 1000), []);
      assert.deepEqual(calculateDonutSlices(null, 1000), []);
      assert.deepEqual(calculateDonutSlices(undefined, 1000), []);
    });

    it("should return default fallback metrics when monthly trends are empty", () => {
      const metrics = calculateBarChartMetrics([], 640, 240);
      assert.deepEqual(metrics.bars, []);
      assert.equal(metrics.maxY, 1000);
      assert.deepEqual(metrics.yTicks, [0, 500, 1000]);
    });
  });

  describe("6. API failure and error recovery handling", () => {
    it("should handle error states gracefully without breaking summary parsing", () => {
      const fallbackSummary = parseAnalyticsSummary(null);
      assert.equal(fallbackSummary.totalSpent, 0);
      assert.equal(fallbackSummary.expenseCount, 0);
      assert.equal(fallbackSummary.topCategory, null);
    });
  });

  describe("7. Missing or malformed optional analytics fields", () => {
    it("should provide safe fallbacks when optional fields are missing", () => {
      const partialData = {
        summary: {
          totalSpent: 500,
          expenseCount: 1
          // missing averageExpense, userTotalShare, userTotalPaid, topCategory
        }
      };

      const summary = parseAnalyticsSummary(partialData);
      assert.equal(summary.totalSpent, 500);
      assert.equal(summary.expenseCount, 1);
      assert.equal(summary.averageExpense, 0);
      assert.equal(summary.userTotalShare, 0);
      assert.equal(summary.userTotalPaid, 0);
      assert.equal(summary.topCategory, null);
    });

    it("should safely handle non-object topCategory", () => {
      const badData = {
        summary: {
          topCategory: "invalid-string-instead-of-object"
        }
      };
      const summary = parseAnalyticsSummary(badData);
      assert.equal(summary.topCategory, null);
    });
  });

  describe("8. Rapid filter changes and stale response handling", () => {
    it("should identify stale responses when requestId is superseded", () => {
      const request1Id = 1;
      const request2Id = 2;
      const currentLatestId = 2;

      // When request 1 resolves after request 2 was fired
      assert.equal(
        isStaleResponse(request1Id, currentLatestId),
        true,
        "Request 1 must be flagged as stale and discarded"
      );

      // When request 2 resolves
      assert.equal(
        isStaleResponse(request2Id, currentLatestId),
        false,
        "Request 2 matches latest dispatched request and must be accepted"
      );
    });
  });

  describe("9. Responsive UI geometry and scaling", () => {
    it("should clamp bar width within accessible bounds (14px - 36px)", () => {
      // Very wide desktop container with few bars
      const desktop = calculateBarChartMetrics([{ month: "2026-10", total: 1000 }], 1200, 300);
      assert.ok(desktop.bars[0].width <= 36);

      // Narrow mobile container with 12 bars
      const fullYear = Array.from({ length: 12 }, (_, i) => ({
        month: `2026-${String(i + 1).padStart(2, "0")}`,
        total: 500
      }));
      const mobile = calculateBarChartMetrics(fullYear, 320, 200);
      assert.ok(mobile.bars[0].width >= 14);
    });

    it("should generate valid donut arc paths matching inner and outer radius boundaries", () => {
      const path = describeDonutArc(150, 150, 120, 78, 0, 90);
      assert.ok(path.startsWith("M"));
      assert.ok(path.includes("A 120 120"));
      assert.ok(path.includes("A 78 78"));
      assert.ok(path.endsWith("Z"));
    });

    it("should calculate polar coordinates accurately", () => {
      // 0 degrees (top, 12 o'clock)
      const top = polarToCartesian(100, 100, 50, 0);
      assert.equal(top.x, 100);
      assert.equal(top.y, 50);

      // 90 degrees (right, 3 o'clock)
      const right = polarToCartesian(100, 100, 50, 90);
      assert.equal(right.x, 150);
      assert.equal(right.y, 100);
    });
  });

  describe("10. Canonical categories and design system integrity", () => {
    it("should preserve all 11 canonical expense categories", () => {
      const expected = [
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
      assert.equal(CANONICAL_CATEGORIES.length, 11);
      for (const cat of expected) {
        assert.ok(CANONICAL_CATEGORIES.includes(cat), `Missing canonical category ${cat}`);
      }
    });

    it("should provide an accessible color for every canonical category", () => {
      for (const cat of CANONICAL_CATEGORIES) {
        assert.ok(CATEGORY_COLORS[cat], `Missing color token for category ${cat}`);
        assert.ok(
          CATEGORY_COLORS[cat].startsWith("#"),
          `Category color for ${cat} must be a valid hex color`
        );
      }
    });

    it("should provide a Lucide icon component for every canonical category", () => {
      for (const cat of CANONICAL_CATEGORIES) {
        assert.ok(CATEGORY_ICONS[cat], `Missing icon component for category ${cat}`);
      }
    });

    it("should maintain all 12 calendar month names and short names", () => {
      assert.equal(MONTH_NAMES.length, 12);
      assert.equal(MONTH_SHORT_NAMES.length, 12);
      assert.equal(MONTH_NAMES[0], "January");
      assert.equal(MONTH_SHORT_NAMES[0], "Jan");
      assert.equal(MONTH_NAMES[11], "December");
      assert.equal(MONTH_SHORT_NAMES[11], "Dec");
    });
  });
});
