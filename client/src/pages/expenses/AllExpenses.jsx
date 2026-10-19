import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Receipt,
  Plus,
  RefreshCw,
  Search,
  X,
  Users,
  Folder,
  Tag,
  Wallet,
  TrendingUp,
  RotateCcw,
  FileDown,
  PieChart
} from "lucide-react";
import { api, ApiError } from "../../services/api";
import { useAuth } from "../../context/useAuth";
import { toIdString } from "../../services/dashboardUtils";
import {
  mergeAndSortAllExpenses,
  getPartialFailures,
  filterAllExpenses
} from "../../services/allExpensesUtils";
import {
  downloadCsvBlob,
  getStandardExportFilename
} from "../../services/csvUtils";
import { EXPENSE_CATEGORIES } from "../../constants/categories";
import { ExpenseItem } from "../../components/expenses/ExpenseItem";
import { ExpenseModal } from "../../components/expenses/ExpenseModal";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { Alert } from "../../components/common/Alert";
import { LoadingSpinner } from "../../components/common/LoadingSpinner";
import "./AllExpenses.css";

const CATEGORIES = EXPENSE_CATEGORIES;

export function AllExpenses() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const currentUserId = user?.id || user?._id;

  // Groups and expenses raw state
  const [groups, setGroups] = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [partialFailures, setPartialFailures] = useState([]);
  const [actionFeedback, setActionFeedback] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  // Filter state
  const [payerFilter, setPayerFilter] = useState("all"); // 'all' | 'mine'
  const [selectedGroupId, setSelectedGroupId] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // React render-time state adjustment pattern for URL search query synchronization
  const urlSearch = searchParams.get("search");
  const [searchQuery, setSearchQuery] = useState(urlSearch || "");
  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);

  if (urlSearch !== prevUrlSearch) {
    setPrevUrlSearch(urlSearch);
    setSearchQuery(urlSearch || "");
  }

  // Modals state
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);

  // Request race-condition sequence guard
  const fetchSeqRef = useRef(0);

  // Data fetching effect
  useEffect(() => {
    let isMounted = true;
    const seq = ++fetchSeqRef.current;

    async function fetchData() {
      // If it's a subsequent trigger, mark as refreshing
      if (seq > 1) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        // 1. Fetch user groups
        const groupsRes = await api.groups.list();
        if (!isMounted || seq !== fetchSeqRef.current) return;

        const loadedGroups = groupsRes?.groups || [];
        setGroups(loadedGroups);

        if (loadedGroups.length === 0) {
          setAllExpenses([]);
          setPartialFailures([]);
          return;
        }

        // 2. Fetch expenses across all user groups concurrently
        const groupPromises = loadedGroups.map(async (g) => {
          const gid = g.id || g._id;
          try {
            const res = await api.expenses.list(gid);
            return {
              group: g,
              expenses: res?.success && Array.isArray(res.expenses) ? res.expenses : [],
              error: null
            };
          } catch (err) {
            return {
              group: g,
              expenses: [],
              error:
                err instanceof ApiError
                  ? err.message
                  : err?.message || "Failed to load expenses"
            };
          }
        });

        const groupResults = await Promise.all(groupPromises);
        if (!isMounted || seq !== fetchSeqRef.current) return;

        // 3. Inspect partial failures
        const failures = getPartialFailures(groupResults);
        setPartialFailures(failures);

        if (failures.length === loadedGroups.length) {
          // All groups failed
          setError(
            "Unable to load expenses from any of your groups. Please check your connection."
          );
          setAllExpenses([]);
        } else {
          // Merge successful groups
          const merged = mergeAndSortAllExpenses(groupResults);
          setAllExpenses(merged);
        }
      } catch (err) {
        if (isMounted && seq === fetchSeqRef.current) {
          setError(err instanceof ApiError ? err.message : "Failed to load expenses");
        }
      } finally {
        if (isMounted && seq === fetchSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

  // Filtered expenses memoization
  const filteredExpenses = useMemo(() => {
    return filterAllExpenses(allExpenses, {
      payerFilter,
      currentUserId,
      selectedGroupId,
      selectedCategory,
      searchQuery
    });
  }, [allExpenses, payerFilter, currentUserId, selectedGroupId, selectedCategory, searchQuery]);

  // Aggregate metrics
  const totalVolumePaise = useMemo(() => {
    return filteredExpenses.reduce((acc, curr) => {
      const amt = Number(curr.amount) || 0;
      return acc + Math.round(amt * 100);
    }, 0);
  }, [filteredExpenses]);

  const userPaidVolumePaise = useMemo(() => {
    const targetId = toIdString(currentUserId);
    if (!targetId) return 0;
    return filteredExpenses.reduce((acc, curr) => {
      const payerId = toIdString(curr.paidBy);
      if (payerId === targetId) {
        const amt = Number(curr.amount) || 0;
        return acc + Math.round(amt * 100);
      }
      return acc;
    }, 0);
  }, [filteredExpenses, currentUserId]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (payerFilter !== "all") count++;
    if (selectedGroupId !== "all") count++;
    if (selectedCategory !== "all") count++;
    if (searchQuery.trim() !== "") count++;
    return count;
  }, [payerFilter, selectedGroupId, selectedCategory, searchQuery]);

  const handleResetFilters = () => {
    setPayerFilter("all");
    setSelectedGroupId("all");
    setSelectedCategory("all");
    setSearchQuery("");
  };

  // Add Expense flow
  const handleAddExpenseClick = () => {
    if (groups.length === 0) {
      navigate("/groups");
      return;
    }

    // If currently filtered to a single group, pre-select it
    if (selectedGroupId !== "all") {
      const grp = groups.find((g) => toIdString(g.id || g._id) === toIdString(selectedGroupId));
      if (grp) {
        setSelectedGroup(grp);
        setExpenseToEdit(null);
        setExpenseModalOpen(true);
        return;
      }
    }

    // If user has only one group, pick it directly
    if (groups.length === 1) {
      setSelectedGroup(groups[0]);
      setExpenseToEdit(null);
      setExpenseModalOpen(true);
      return;
    }

    // Multiple groups: open picker
    setGroupPickerOpen(true);
  };

  const handleSelectGroupForExpense = (grp) => {
    setSelectedGroup(grp);
    setGroupPickerOpen(false);
    setExpenseToEdit(null);
    setExpenseModalOpen(true);
  };

  // Edit Expense
  const handleEditExpense = (expense) => {
    const grp = groups.find(
      (g) => toIdString(g.id || g._id) === toIdString(expense.groupId || expense.group)
    );
    if (grp) {
      setSelectedGroup(grp);
    }
    setExpenseToEdit(expense);
    setExpenseModalOpen(true);
  };

  const handleRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  // Delete Expense
  const handleDeleteExpense = async (expenseId) => {
    const expense = allExpenses.find((e) => toIdString(e.id || e._id) === toIdString(expenseId));
    const grpId = toIdString(expense?.groupId || expense?.group);

    try {
      await api.expenses.delete(grpId, expenseId);
      setActionFeedback("Expense deleted successfully.");
      setTimeout(() => setActionFeedback(""), 3500);
      handleRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete expense");
      throw err;
    }
  };

  const handleExpenseSaved = (savedExpense) => {
    setActionFeedback(
      expenseToEdit
        ? `"${savedExpense.description || "Expense"}" updated successfully!`
        : `"${savedExpense.description || "Expense"}" recorded successfully!`
    );
    setTimeout(() => setActionFeedback(""), 3500);
    handleRefresh();
  };

  const handleDownloadExpensesCsv = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setError(null);

    try {
      const params = {};
      if (selectedCategory && selectedCategory !== "all") {
        params.category = selectedCategory;
      }
      if (payerFilter && payerFilter !== "all") {
        params.payer = payerFilter;
      }
      if (searchQuery && searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const gid = selectedGroupId === "all" ? null : selectedGroupId;
      const { blob, filename } = await api.expenses.exportCsv(gid, params);

      const targetFilename = filename || getStandardExportFilename("expenses");
      downloadCsvBlob(blob, targetFilename);

      const scopeText = gid
        ? groups.find((g) => toIdString(g.id || g._id) === toIdString(gid))?.name || "Selected Group"
        : "All Groups";
      setActionFeedback(`Expenses CSV downloaded successfully (${scopeText}).`);
      setTimeout(() => setActionFeedback(""), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to download expenses CSV.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="all-expenses-page animate-fade-in">
      {/* Page Header */}
      <div className="all-expenses-header">
        <div className="all-expenses-title-wrap">
          <div className="all-expenses-badge-row">
            <span style={{ fontSize: "12px", color: "var(--charcoal-500)", fontWeight: 500 }}>
              {groups.length} {groups.length === 1 ? "Group" : "Groups"} Connected
            </span>
          </div>
          <h1 className="all-expenses-title">Activity</h1>
          <p className="all-expenses-subtitle">
            Comprehensive log of shared transactions, itemized split allocations, and receipts across your active groups.
          </p>
        </div>

        <div className="all-expenses-header-actions">
          <Button
            variant="outline"
            size="md"
            icon={FileDown}
            isLoading={isExporting}
            disabled={isExporting}
            onClick={handleDownloadExpensesCsv}
            title="Download Expenses CSV"
          >
            Download Expenses CSV
          </Button>

          <Button
            variant="outline"
            size="md"
            icon={RefreshCw}
            isLoading={refreshing}
            onClick={handleRefresh}
            title="Refresh expense feed"
          >
            Refresh
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={handleAddExpenseClick}
          >
            Add an Expense
          </Button>
        </div>
      </div>

      {/* Contextual Scope Switcher: Expenses & Analytics */}
      <div className="activity-scope-switcher" role="tablist" aria-label="Activity and Analytics views">
        <button
          type="button"
          role="tab"
          aria-selected="true"
          className="scope-tab is-active"
          id="scope-tab-expenses"
        >
          <Receipt size={15} />
          <span>Expenses</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected="false"
          className="scope-tab"
          onClick={() => navigate("/analytics")}
          id="scope-tab-analytics"
        >
          <PieChart size={15} />
          <span>Analytics</span>
        </button>
      </div>

      {/* Action Feedback Alert */}
      {actionFeedback && (
        <Alert variant="success" onClose={() => setActionFeedback("")}>
          {actionFeedback}
        </Alert>
      )}

      {/* Global Error Alert */}
      {error && (
        <Alert
          variant="error"
          title="Error Loading Expenses"
          onClose={() => setError(null)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span>{error}</span>
            <div>
              <Button
                variant="secondary"
                size="sm"
                icon={RotateCcw}
                onClick={handleRefresh}
              >
                Retry Loading
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {/* Partial Group Query Failure Warning */}
      {partialFailures.length > 0 && !error && (
        <Alert variant="warning" title="Partial Results: Some Groups Could Not Be Loaded">
          <div className="partial-failure-alert-box">
            <span>
              Could not retrieve expenses for the following {partialFailures.length}{" "}
              {partialFailures.length === 1 ? "group" : "groups"}:
            </span>
            <ul className="partial-failure-groups-list">
              {partialFailures.map((f) => (
                <li key={f.groupId}>
                  <strong>{f.groupName}</strong>: {f.error}
                </li>
              ))}
            </ul>
            <div className="partial-retry-actions">
              <Button
                variant="outline"
                size="sm"
                icon={RotateCcw}
                isLoading={refreshing}
                onClick={handleRefresh}
              >
                Retry Failed Groups
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {/* Quick Summary Metrics Cards */}
      <div className="all-expenses-metrics-bar">
        <div className="expenses-metric-card">
          <div className="metric-icon-wrap icon-teal">
            <Receipt size={20} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Expenses Shown</span>
            <span className="metric-value">
              {filteredExpenses.length}{" "}
              <span style={{ fontSize: "13px", fontWeight: "400", color: "var(--charcoal-500)" }}>
                of {allExpenses.length}
              </span>
            </span>
          </div>
        </div>

        <div className="expenses-metric-card">
          <div className="metric-icon-wrap icon-emerald">
            <TrendingUp size={20} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Total Volume</span>
            <span className="metric-value">
              ₹{(totalVolumePaise / 100).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </span>
          </div>
        </div>

        <div className="expenses-metric-card">
          <div className="metric-icon-wrap icon-blue">
            <Wallet size={20} />
          </div>
          <div className="metric-info">
            <span className="metric-label">You Paid</span>
            <span className="metric-value">
              ₹{(userPaidVolumePaise / 100).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Filter Toolbar */}
      <div className="all-expenses-toolbar">
        {/* Primary Row: Search & Payer Pills */}
        <div className="toolbar-primary-row">
          <div className="expenses-search-box">
            <Search size={16} className="expenses-search-icon" />
            <input
              type="text"
              className="expenses-search-input"
              placeholder="Search by description, notes, group or payer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search expenses"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="expenses-filter-pills" role="radiogroup" aria-label="Filter by payer">
            <button
              type="button"
              className={`filter-pill ${payerFilter === "all" ? "is-active" : ""}`}
              onClick={() => setPayerFilter("all")}
            >
              All Expenses
            </button>
            <button
              type="button"
              className={`filter-pill ${payerFilter === "mine" ? "is-active" : ""}`}
              onClick={() => setPayerFilter("mine")}
            >
              Paid by Me
            </button>
          </div>
        </div>

        {/* Secondary Row: Group & Category Dropdowns + Filter Reset */}
        <div className="toolbar-secondary-row">
          <div className="toolbar-selectors-group">
            {/* Group Selector */}
            <div className="expenses-select-wrap">
              <span className="select-icon-label" title="Filter by group">
                <Folder size={15} />
              </span>
              <select
                className="expenses-dropdown-select"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                aria-label="Filter by group"
              >
                <option value="all">All Groups ({groups.length})</option>
                {groups.map((g) => (
                  <option key={g.id || g._id} value={g.id || g._id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Selector */}
            <div className="expenses-select-wrap">
              <span className="select-icon-label" title="Filter by category">
                <Tag size={15} />
              </span>
              <select
                className="expenses-dropdown-select"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                aria-label="Filter by category"
              >
                <option value="all">All Categories</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Active Filter Indicator & Reset */}
          {activeFiltersCount > 0 && (
            <div className="active-filters-meta">
              <span>
                {activeFiltersCount} active {activeFiltersCount === 1 ? "filter" : "filters"}
              </span>
              <button
                type="button"
                className="reset-filters-btn"
                onClick={handleResetFilters}
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Expenses List Container */}
      <div className="all-expenses-list-card">
        <div className="expenses-list-header">
          <div className="expenses-list-header-left">
            <h3 className="expenses-list-title">Transactions</h3>
            <Badge variant={filteredExpenses.length > 0 ? "mint" : "neutral"} size="sm">
              {filteredExpenses.length} Records
            </Badge>
          </div>
          {refreshing && (
            <span style={{ fontSize: "12px", color: "var(--charcoal-500)" }}>
              Refreshing records...
            </span>
          )}
        </div>

        {loading ? (
          <div className="all-expenses-loading-box">
            <LoadingSpinner message="Loading all expense records..." />
          </div>
        ) : groups.length === 0 ? (
          /* Empty State: User has no groups */
          <div className="all-expenses-empty-card">
            <div className="empty-state-icon-circle">
              <Users size={28} />
            </div>
            <h4 className="all-expenses-empty-title">No Active Groups Found</h4>
            <p className="all-expenses-empty-desc">
              You aren&apos;t a member of any group yet. Create or join a shared group to start tracking expenses with friends and roommates.
            </p>
            <Button
              variant="primary"
              size="md"
              icon={Plus}
              onClick={() => navigate("/groups")}
            >
              Create or Join Group
            </Button>
          </div>
        ) : allExpenses.length === 0 ? (
          /* Empty State: Groups exist, but no expenses recorded */
          <div className="all-expenses-empty-card">
            <div className="empty-state-icon-circle">
              <Receipt size={28} />
            </div>
            <h4 className="all-expenses-empty-title">No Expenses Recorded Yet</h4>
            <p className="all-expenses-empty-desc">
              None of your active groups have recorded any transactions yet. Add your first shared payment to get started!
            </p>
            <Button
              variant="primary"
              size="md"
              icon={Plus}
              onClick={handleAddExpenseClick}
            >
              Record First Expense
            </Button>
          </div>
        ) : filteredExpenses.length === 0 ? (
          /* Empty State: Filter criteria matched zero records */
          <div className="all-expenses-empty-card">
            <div className="empty-state-icon-circle neutral">
              <Search size={28} />
            </div>
            <h4 className="all-expenses-empty-title">No Matching Expenses</h4>
            <p className="all-expenses-empty-desc">
              No transactions match your current search query or filter selection. Try adjusting your filters.
            </p>
            <Button
              variant="secondary"
              size="sm"
              icon={RotateCcw}
              onClick={handleResetFilters}
            >
              Clear All Filters
            </Button>
          </div>
        ) : (
          /* Render Expense Items */
          <div className="all-expenses-container">
            {filteredExpenses.map((expense) => {
              const grp = groups.find(
                (g) =>
                  toIdString(g.id || g._id) ===
                  toIdString(expense.groupId || expense.group)
              );
              const isGroupCreatorOrAdmin =
                grp?.currentUserRole === "creator" || grp?.currentUserRole === "admin";

              return (
                <ExpenseItem
                  key={expense.id || expense._id}
                  expense={expense}
                  currentUser={user}
                  userGroupRole={grp?.currentUserRole}
                  isGroupCreatorOrAdmin={isGroupCreatorOrAdmin}
                  onEdit={handleEditExpense}
                  onDelete={handleDeleteExpense}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Group Picker Modal (when adding an expense and user has >1 groups) */}
      {groupPickerOpen && (
        <div className="modal-backdrop" onClick={() => setGroupPickerOpen(false)}>
          <div
            className="modal-container animate-fade-in"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-picker-title"
          >
            <div className="modal-header">
              <h2 id="group-picker-title" className="modal-title">
                Select Group
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setGroupPickerOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: "16px 24px" }}>
              <p
                style={{
                  fontSize: "13.5px",
                  color: "var(--charcoal-600)",
                  marginBottom: "12px"
                }}
              >
                Choose which group you want to record this expense in:
              </p>
              <div className="group-picker-list">
                {groups.map((g) => (
                  <button
                    key={g.id || g._id}
                    type="button"
                    className="group-picker-item"
                    onClick={() => handleSelectGroupForExpense(g)}
                  >
                    <div className="group-picker-icon">
                      <Folder size={18} />
                    </div>
                    <div className="group-picker-meta">
                      <span className="group-picker-name">{g.name}</span>
                      <span className="group-picker-sub">
                        {g.memberCount || g.members?.length || 1} members • {g.category || "General"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expense Modal (Create or Edit) */}
      {expenseModalOpen && selectedGroup && (
        <ExpenseModal
          key={
            expenseToEdit?._id ||
            expenseToEdit?.id ||
            `new-exp-${selectedGroup.id || selectedGroup._id}`
          }
          isOpen={expenseModalOpen}
          group={selectedGroup}
          expenseToEdit={expenseToEdit}
          currentUser={user}
          onSuccess={handleExpenseSaved}
          onClose={() => {
            setExpenseModalOpen(false);
            setExpenseToEdit(null);
          }}
        />
      )}
    </div>
  );
}
