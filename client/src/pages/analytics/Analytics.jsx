import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  PieChart,
  RefreshCw,
  RotateCcw,
  Receipt,
  Wallet,
  TrendingUp,
  Tag,
  Filter,
  X,
  Home,
  Plane,
  Heart,
  Folder
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { api } from "../../services/api";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Alert } from "../../components/common/Alert";
import { LoadingSpinner } from "../../components/common/LoadingSpinner";
import {
  CANONICAL_CATEGORIES,
  MONTH_NAMES,
  formatINR,
  validateDateRange,
  buildAnalyticsQueryParams,
  parseAnalyticsSummary,
  isStaleResponse
} from "../../services/analyticsUtils";
import { CategoryDoughnutChart } from "./CategoryDoughnutChart";
import { MonthlySpendingBarChart } from "./MonthlySpendingBarChart";
import { MemberSpendingBreakdown } from "./MemberSpendingBreakdown";
import "./Analytics.css";

const GROUP_CATEGORY_ICONS = {
  Home,
  Trip: Plane,
  Couple: Heart,
  Other: Folder
};

function renderGroupCategoryIcon(cat, size = 15) {
  const IconComp = GROUP_CATEGORY_ICONS[cat] || Folder;
  return <IconComp size={size} />;
}

export function Analytics() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // 1. Group Directory State
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState(null);

  // 2. Active Filters State
  const [selectedGroupId, setSelectedGroupId] = useState(searchParams.get("groupId") || "all");
  const [filterPeriod, setFilterPeriod] = useState(searchParams.get("period") || "all"); // 'all' | 'month' | 'year' | 'custom'
  const [filterMonth, setFilterMonth] = useState(Number(searchParams.get("month")) || new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(Number(searchParams.get("year")) || new Date().getFullYear());
  const [startDate, setStartDate] = useState(searchParams.get("startDate") || "");
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || "");
  const [filterCategory, setFilterCategory] = useState(searchParams.get("category") || "all");

  // Inline date range validation
  const [dateRangeError, setDateRangeError] = useState(null);

  // 3. Analytics Response Data State
  const [analyticsData, setAnalyticsData] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Anti-race condition counter for rapid filter changes
  const requestIdRef = useRef(0);

  // Load all user groups on initial mount
  useEffect(() => {
    let isMounted = true;
    async function loadGroups() {
      try {
        setGroupsLoading(true);
        setGroupsError(null);
        const res = await api.groups.list();
        if (!isMounted) return;
        setGroups(res?.groups || []);
      } catch (err) {
        if (!isMounted) return;
        setGroupsError(err?.message || "Failed to load user groups");
      } finally {
        if (isMounted) setGroupsLoading(false);
      }
    }
    loadGroups();
    return () => {
      isMounted = false;
    };
  }, []);

  // Synchronize URL parameters with filter state
  const syncUrlParams = useCallback(
    (newGroupId, newPeriod, newMonth, newYear, newStart, newEnd, newCategory) => {
      const params = {};
      if (newGroupId && newGroupId !== "all") params.groupId = newGroupId;
      if (newPeriod && newPeriod !== "all") params.period = newPeriod;
      if (newPeriod === "month") {
        params.month = String(newMonth);
        params.year = String(newYear);
      } else if (newPeriod === "year") {
        params.year = String(newYear);
      } else if (newPeriod === "custom") {
        if (newStart) params.startDate = newStart;
        if (newEnd) params.endDate = newEnd;
      }
      if (newCategory && newCategory !== "all") params.category = newCategory;
      setSearchParams(params, { replace: true });
    },
    [setSearchParams]
  );

  // Fetch analytics data with anti-race protection
  useEffect(() => {
    const currentRequestId = ++requestIdRef.current;
    let isCancelled = false;

    async function fetchAnalytics() {
      // Validate custom date range before calling API
      if (filterPeriod === "custom") {
        const val = validateDateRange(startDate, endDate);
        if (!val.isValid) {
          setDateRangeError(val.error);
          return;
        }
      }
      setDateRangeError(null);

      try {
        setDataLoading(true);
        setDataError(null);

        // Build query params via helper
        const params = buildAnalyticsQueryParams({
          filterPeriod,
          filterMonth,
          filterYear,
          startDate,
          endDate,
          filterCategory
        });

        let result;
        if (selectedGroupId === "all") {
          result = await api.analytics.getUserAnalytics(params);
        } else {
          result = await api.analytics.getGroupAnalytics(selectedGroupId, params);
        }

        // Drop stale responses if a newer request was dispatched
        if (isCancelled || isStaleResponse(currentRequestId, requestIdRef.current)) {
          return;
        }

        setAnalyticsData(result);
      } catch (err) {
        if (isCancelled || isStaleResponse(currentRequestId, requestIdRef.current)) {
          return;
        }
        setDataError(err?.message || "Failed to load analytics data");
      } finally {
        if (!isCancelled && !isStaleResponse(currentRequestId, requestIdRef.current)) {
          setDataLoading(false);
        }
      }
    }

    fetchAnalytics();

    return () => {
      isCancelled = true;
    };
  }, [
    selectedGroupId,
    filterPeriod,
    filterMonth,
    filterYear,
    startDate,
    endDate,
    filterCategory,
    refreshTrigger
  ]);

  // Handler: Change Group
  const handleGroupChange = (newGid) => {
    setSelectedGroupId(newGid);
    syncUrlParams(newGid, filterPeriod, filterMonth, filterYear, startDate, endDate, filterCategory);
  };

  // Handler: Change Period Preset
  const handlePeriodChange = (newPeriod) => {
    setFilterPeriod(newPeriod);
    syncUrlParams(selectedGroupId, newPeriod, filterMonth, filterYear, startDate, endDate, filterCategory);
  };

  // Handler: Change Category Filter
  const handleCategoryChange = (newCat) => {
    setFilterCategory(newCat);
    syncUrlParams(selectedGroupId, filterPeriod, filterMonth, filterYear, startDate, endDate, newCat);
  };

  // Handler: Reset all filters to default
  const handleResetFilters = () => {
    setSelectedGroupId("all");
    setFilterPeriod("all");
    setFilterMonth(new Date().getMonth() + 1);
    setFilterYear(new Date().getFullYear());
    setStartDate("");
    setEndDate("");
    setFilterCategory("all");
    setDateRangeError(null);
    setSearchParams({}, { replace: true });
  };

  // Check if any filter is active
  const isFiltered =
    selectedGroupId !== "all" ||
    filterPeriod !== "all" ||
    filterCategory !== "all" ||
    Boolean(startDate) ||
    Boolean(endDate);

  const selectedGroup = useMemo(() => {
    if (selectedGroupId === "all") return null;
    return groups.find((g) => (g.id || g._id)?.toString() === selectedGroupId?.toString());
  }, [groups, selectedGroupId]);

  const currentUserId = (user?.id || user?._id)?.toString();

  // Summary Metrics safely extracted
  const summary = useMemo(() => parseAnalyticsSummary(analyticsData), [analyticsData]);

  const categoryBreakdown = analyticsData?.categoryBreakdown || [];
  const monthlyTrends = analyticsData?.monthlyTrends || [];
  const memberSpending = analyticsData?.memberSpending || [];

  const hasExpenses = summary.expenseCount > 0;

  // Year options: current year down to 3 years prior, up to 1 year ahead
  const yearOptions = useMemo(() => {
    const cur = new Date().getFullYear();
    return [cur + 1, cur, cur - 1, cur - 2, cur - 3];
  }, []);

  return (
    <div className="analytics-page animate-fade-in">
      {/* Top Breadcrumb & Back Link */}
      <div className="analytics-top-nav">
        <Link to="/expenses" className="back-link" id="analytics-back-to-activity">
          <ArrowLeft size={16} /> Back to Activity
        </Link>
      </div>

      {/* Page Header */}
      <div className="analytics-header">
        <div className="analytics-title-wrap">
          <div className="analytics-title-row">
            <h1 className="analytics-title">Spending & Velocity Analytics</h1>
          </div>
          <p className="analytics-subtitle">
            Comprehensive category breakdowns, monthly spending graphs, and peer liability insights.
          </p>
        </div>

        {/* Header Actions: Group Selector & Refresh */}
        <div className="analytics-header-actions">
          <div className="analytics-group-selector-box">
            <label htmlFor="analytics-group-select" className="selector-label">
              Active Scope:
            </label>
            <div className="selector-control-wrap">
              <div className="selector-icon">
                {selectedGroupId === "all" ? (
                  <PieChart size={15} />
                ) : (
                  renderGroupCategoryIcon(selectedGroup?.category, 15)
                )}
              </div>
              <select
                id="analytics-group-select"
                className="group-select-input"
                value={selectedGroupId}
                onChange={(e) => handleGroupChange(e.target.value)}
                aria-label="Select analytics group scope"
                disabled={groupsLoading}
              >
                <option value="all">All Groups ({groups.length})</option>
                {groups.map((g) => {
                  const gid = g.id || g._id;
                  return (
                    <option key={gid} value={gid}>
                      {g.name} ({g.memberCount || g.members?.length || 1} members)
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <Button
            variant="outline"
            size="md"
            icon={RefreshCw}
            isLoading={dataLoading}
            onClick={() => setRefreshTrigger((prev) => prev + 1)}
            title="Refresh analytics data"
            className="analytics-refresh-btn"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Contextual Scope Switcher: Expenses & Analytics */}
      <div className="activity-scope-switcher" role="tablist" aria-label="Activity and Analytics views">
        <Link
          to="/expenses"
          role="tab"
          aria-selected="false"
          className="scope-tab"
          id="scope-tab-expenses"
        >
          <Receipt size={15} />
          <span>Expenses</span>
        </Link>
        <button
          type="button"
          role="tab"
          aria-selected="true"
          className="scope-tab is-active"
          id="scope-tab-analytics"
        >
          <PieChart size={15} />
          <span>Analytics</span>
        </button>
      </div>

      {/* Global Error Banner */}
      {(groupsError || dataError) && (
        <Alert
          variant="error"
          title="Error Loading Analytics"
          onClose={() => {
            setGroupsError(null);
            setDataError(null);
          }}
          className="mb-4"
        >
          <div className="error-alert-content">
            <span>{groupsError || dataError}</span>
            <div>
              <Button
                variant="secondary"
                size="sm"
                icon={RotateCcw}
                onClick={() => setRefreshTrigger((prev) => prev + 1)}
              >
                Retry Loading
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {/* Date Validation Alert */}
      {dateRangeError && (
        <Alert
          variant="warning"
          title="Invalid Date Filter"
          onClose={() => setDateRangeError(null)}
          className="mb-4"
        >
          {dateRangeError}
        </Alert>
      )}

      {/* Filter Toolbar Card */}
      <div className="analytics-filter-card">
        <div className="filter-card-header">
          <div className="filter-header-left">
            <Filter size={16} className="filter-header-icon" />
            <span className="filter-header-title">Filters & Timeline</span>
            {isFiltered && (
              <Badge variant="mint" size="sm">
                Filtered
              </Badge>
            )}
          </div>
          {isFiltered && (
            <button
              type="button"
              className="reset-filters-btn"
              onClick={handleResetFilters}
              title="Reset all filters to default"
            >
              <X size={13} /> Reset Filters
            </button>
          )}
        </div>

        <div className="filter-card-body">
          {/* Period Preset Pills */}
          <div className="filter-section">
            <span className="filter-section-label">Timeline:</span>
            <div className="period-pills-row" role="radiogroup" aria-label="Filter timeline">
              {[
                { id: "all", label: "All Time" },
                { id: "month", label: "This Month" },
                { id: "year", label: "This Year" },
                { id: "custom", label: "Custom Range" }
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  className={`period-pill ${filterPeriod === pill.id ? "is-active" : ""}`}
                  onClick={() => handlePeriodChange(pill.id)}
                  role="radio"
                  aria-checked={filterPeriod === pill.id}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conditional Sub-controls based on period */}
          {filterPeriod === "month" && (
            <div className="filter-section filter-sub-controls animate-fade-in">
              <span className="filter-section-label">Select Month:</span>
              <div className="sub-selects-row">
                <select
                  value={filterMonth}
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    setFilterMonth(m);
                    syncUrlParams(selectedGroupId, "month", m, filterYear, startDate, endDate, filterCategory);
                  }}
                  className="filter-select-input"
                  aria-label="Filter by month"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={name} value={idx + 1}>
                      {name}
                    </option>
                  ))}
                </select>

                <select
                  value={filterYear}
                  onChange={(e) => {
                    const y = Number(e.target.value);
                    setFilterYear(y);
                    syncUrlParams(selectedGroupId, "month", filterMonth, y, startDate, endDate, filterCategory);
                  }}
                  className="filter-select-input"
                  aria-label="Filter by year"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {filterPeriod === "year" && (
            <div className="filter-section filter-sub-controls animate-fade-in">
              <span className="filter-section-label">Select Year:</span>
              <select
                value={filterYear}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  setFilterYear(y);
                  syncUrlParams(selectedGroupId, "year", filterMonth, y, startDate, endDate, filterCategory);
                }}
                className="filter-select-input"
                aria-label="Filter by year"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}

          {filterPeriod === "custom" && (
            <div className="filter-section filter-sub-controls animate-fade-in">
              <span className="filter-section-label">Date Boundaries:</span>
              <div className="date-inputs-row">
                <div className="date-input-wrap">
                  <label htmlFor="start-date-input" className="mini-label">
                    From:
                  </label>
                  <input
                    id="start-date-input"
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      syncUrlParams(selectedGroupId, "custom", filterMonth, filterYear, e.target.value, endDate, filterCategory);
                    }}
                    className="date-native-input"
                    aria-label="Filter start date"
                  />
                </div>
                <div className="date-input-wrap">
                  <label htmlFor="end-date-input" className="mini-label">
                    To:
                  </label>
                  <input
                    id="end-date-input"
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      syncUrlParams(selectedGroupId, "custom", filterMonth, filterYear, startDate, e.target.value, filterCategory);
                    }}
                    className="date-native-input"
                    aria-label="Filter end date"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Category Filter Dropdown */}
          <div className="filter-section">
            <span className="filter-section-label">Category:</span>
            <div className="category-select-wrap">
              <select
                value={filterCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="filter-select-input"
                aria-label="Filter by category"
              >
                <option value="all">All Categories (11)</option>
                {CANONICAL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {dataLoading && !analyticsData ? (
        <div className="analytics-loading-box">
          <LoadingSpinner message="Calculating spending analytics and category breakdowns..." />
        </div>
      ) : !hasExpenses ? (
        /* Genuine Empty State */
        <div className="analytics-empty-state-card animate-fade-in">
          <div className="empty-icon-wrap">
            <PieChart size={36} />
          </div>
          <h3 className="empty-title">No Spending Records Found</h3>
          <p className="empty-description">
            {isFiltered
              ? "No expenses matched your active filter criteria. Try adjusting dates or category filters."
              : "No expenses have been recorded for this scope yet. Record shared expenses to view analytics."}
          </p>
          <div className="empty-actions">
            {isFiltered ? (
              <Button variant="secondary" icon={RotateCcw} onClick={handleResetFilters}>
                Clear Active Filters
              </Button>
            ) : (
              <Link to="/expenses">
                <Button variant="primary" icon={Receipt}>
                  Go to Activity Ledger
                </Button>
              </Link>
            )}
          </div>
        </div>
      ) : (
        /* Real Data Loaded State */
        <div className="analytics-content-view animate-fade-in">
          {/* Overview Metrics Cards */}
          <div className="analytics-metrics-grid">
            {/* 1. Total Spending */}
            <div className="metric-card metric-violet">
              <div className="metric-card-content">
                <div className="metric-header">
                  <div className="metric-icon-wrap icon-violet">
                    <TrendingUp size={20} />
                  </div>
                  <span className="metric-label">Total Expenditure</span>
                </div>
                <div className="metric-body">
                  <span className="metric-value">₹{formatINR(summary.totalSpent)}</span>
                  <span className="metric-subtext">
                    {selectedGroupId === "all"
                      ? `Across ${groups.length} groups`
                      : `${selectedGroup?.name || "Selected Group"}`}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Expense Count */}
            <div className="metric-card metric-teal">
              <div className="metric-card-content">
                <div className="metric-header">
                  <div className="metric-icon-wrap icon-teal">
                    <Receipt size={20} />
                  </div>
                  <span className="metric-label">Transaction Count</span>
                </div>
                <div className="metric-body">
                  <span className="metric-value">{summary.expenseCount}</span>
                  <span className="metric-subtext">Itemized expenses</span>
                </div>
              </div>
            </div>

            {/* 3. Average Expense */}
            <div className="metric-card metric-blue">
              <div className="metric-card-content">
                <div className="metric-header">
                  <div className="metric-icon-wrap icon-blue">
                    <TrendingUp size={20} />
                  </div>
                  <span className="metric-label">Average Expense</span>
                </div>
                <div className="metric-body">
                  <span className="metric-value">₹{formatINR(summary.averageExpense)}</span>
                  <span className="metric-subtext">Per transaction average</span>
                </div>
              </div>
            </div>

            {/* 4. Your Total Share */}
            <div className="metric-card metric-emerald">
              <div className="metric-card-content">
                <div className="metric-header">
                  <div className="metric-icon-wrap icon-emerald">
                    <Wallet size={20} />
                  </div>
                  <span className="metric-label">Your Allocated Share</span>
                </div>
                <div className="metric-body">
                  <span className="metric-value">₹{formatINR(summary.userTotalShare)}</span>
                  <span className="metric-subtext">
                    {summary.userTotalPaid > 0
                      ? `You paid upfront: ₹${formatINR(summary.userTotalPaid)}`
                      : "Your total debt responsibility"}
                  </span>
                </div>
              </div>
            </div>

            {/* 5. Top Category */}
            <div className="metric-card metric-amber">
              <div className="metric-card-content">
                <div className="metric-header">
                  <div className="metric-icon-wrap icon-amber">
                    <Tag size={20} />
                  </div>
                  <span className="metric-label">Top Spending Category</span>
                </div>
                <div className="metric-body">
                  <span className="metric-value truncate">
                    {summary.topCategory ? summary.topCategory.category : "None"}
                  </span>
                  <span className="metric-subtext">
                    {summary.topCategory
                      ? `₹${formatINR(summary.topCategory.total)} (${summary.topCategory.percentage}%)`
                      : "No category data"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Visual Charts Grid: 2 Columns */}
          <div className="analytics-charts-grid">
            {/* Left: Category Breakdown Doughnut */}
            <div className="chart-grid-column">
              <div className="chart-section-header">
                <div className="section-title-wrap">
                  <h2 className="section-heading">Category Spending Breakdown</h2>
                  <p className="section-subheading">
                    Distribution of expenses across the 11 canonical categories.
                  </p>
                </div>
              </div>
              <CategoryDoughnutChart
                categoryBreakdown={categoryBreakdown}
                totalSpent={summary.totalSpent}
                expenseCount={summary.expenseCount}
                currency="INR"
              />
            </div>

            {/* Right: Monthly Trends Bar Chart */}
            <div className="chart-grid-column">
              <div className="chart-section-header">
                <div className="section-title-wrap">
                  <h2 className="section-heading">Monthly Spending Velocity</h2>
                  <p className="section-subheading">
                    Expenditure trajectory over time grouped by calendar month.
                  </p>
                </div>
              </div>
              <MonthlySpendingBarChart
                monthlyTrends={monthlyTrends}
                filterYear={filterPeriod === "year" ? filterYear : null}
                currency="INR"
              />
            </div>
          </div>

          {/* Optional Member Spending Breakdown (when available) */}
          {memberSpending && memberSpending.length > 0 && (
            <div className="analytics-member-section">
              <MemberSpendingBreakdown
                memberSpending={memberSpending}
                totalSpent={summary.totalSpent}
                currentUserId={currentUserId}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
