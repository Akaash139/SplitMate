import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Check,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Receipt,
  ArrowRight,
  Home,
  Plane,
  Heart,
  Folder,
  X
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { api, ApiError } from "../../services/api";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/common/Card";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { Alert } from "../../components/common/Alert";
import { LoadingSpinner } from "../../components/common/LoadingSpinner";
import { ExpenseItem } from "../../components/expenses/ExpenseItem";
import { ExpenseModal } from "../../components/expenses/ExpenseModal";
import { filterExpenses, sortAndMergeExpenses } from "../../services/dashboardUtils";
import "./Dashboard.css";

const CATEGORY_ICONS = {
  Home: Home,
  Trip: Plane,
  Couple: Heart,
  Other: Folder
};

function formatCurrency(val) {
  const num = Number(val) || 0;
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [groups, setGroups] = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all"); // 'all' | 'mine'
  const [actionFeedback, setActionFeedback] = useState("");

  // Expense Modal State
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);

  // Group Balance State for Financial Stat Cards
  const [balanceGroup, setBalanceGroup] = useState(null);
  const [groupBalanceData, setGroupBalanceData] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const fetchDashboardBalance = useCallback(async (targetGroup) => {
    if (!targetGroup) {
      setGroupBalanceData(null);
      return;
    }
    const gid = targetGroup.id || targetGroup._id;
    try {
      setBalanceLoading(true);
      const res = await api.balances.getGroupBalances(gid);
      if (res?.success) {
        setGroupBalanceData(res);
      }
    } catch {
      setGroupBalanceData(null);
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  // Re-fetch dashboard data
  const refreshDashboardData = useCallback(async () => {
    try {
      const groupsRes = await api.groups.list();
      const loadedGroups = groupsRes?.groups || [];
      setGroups(loadedGroups);

      if (loadedGroups.length > 0) {
        const targetGrp = balanceGroup || loadedGroups[0];
        setBalanceGroup(targetGrp);
        fetchDashboardBalance(targetGrp);

        const expensePromises = loadedGroups.map(async (g) => {
          try {
            const res = await api.expenses.list(g.id || g._id);
            if (res.success && Array.isArray(res.expenses)) {
              return res.expenses.map((exp) => ({
                ...exp,
                groupId: g.id || g._id,
                groupName: g.name,
                groupCategory: g.category
              }));
            }
            return [];
          } catch {
            return [];
          }
        });

        const groupExpensesArrays = await Promise.all(expensePromises);
        const mergedExpenses = sortAndMergeExpenses(groupExpensesArrays);
        setAllExpenses(mergedExpenses);
      } else {
        setAllExpenses([]);
        setGroupBalanceData(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to refresh dashboard data");
    }
  }, [balanceGroup, fetchDashboardBalance]);

  // Initial load
  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        setError(null);
        const groupsRes = await api.groups.list();
        if (!isMounted) return;

        const loadedGroups = groupsRes?.groups || [];
        setGroups(loadedGroups);

        if (loadedGroups.length > 0) {
          const targetGrp = loadedGroups[0];
          setBalanceGroup(targetGrp);
          fetchDashboardBalance(targetGrp);

          const expensePromises = loadedGroups.map(async (g) => {
            try {
              const res = await api.expenses.list(g.id || g._id);
              if (res.success && Array.isArray(res.expenses)) {
                return res.expenses.map((exp) => ({
                  ...exp,
                  groupId: g.id || g._id,
                  groupName: g.name,
                  groupCategory: g.category
                }));
              }
              return [];
            } catch {
              return [];
            }
          });

          const groupExpensesArrays = await Promise.all(expensePromises);
          if (!isMounted) return;

          const mergedExpenses = sortAndMergeExpenses(groupExpensesArrays);
          setAllExpenses(mergedExpenses);
        } else {
          setAllExpenses([]);
          setGroupBalanceData(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof ApiError ? err.message : "Failed to load dashboard data");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [fetchDashboardBalance]);

  // Filtered expenses based on All / Mine filter
  const currentUserId = user?.id || user?._id;
  const filteredExpenses = useMemo(() => {
    return filterExpenses(allExpenses, filter, currentUserId);
  }, [allExpenses, filter, currentUserId]);

  // Actions
  const handleAddExpenseClick = () => {
    if (groups.length === 0) {
      navigate("/groups");
      return;
    }
    if (groups.length === 1) {
      setSelectedGroup(groups[0]);
      setExpenseToEdit(null);
      setExpenseModalOpen(true);
      return;
    }
    setGroupPickerOpen(true);
  };

  const handleSelectGroupForExpense = (grp) => {
    setSelectedGroup(grp);
    setGroupPickerOpen(false);
    setExpenseToEdit(null);
    setExpenseModalOpen(true);
  };

  const handleEditExpense = (expense) => {
    const grp = groups.find(
      (g) => (g.id || g._id)?.toString() === (expense.groupId || expense.group)?.toString()
    );
    if (grp) {
      setSelectedGroup(grp);
    }
    setExpenseToEdit(expense);
    setExpenseModalOpen(true);
  };

  const handleDeleteExpense = async (expenseId) => {
    const expense = allExpenses.find((e) => (e.id || e._id)?.toString() === expenseId?.toString());
    const grpId = expense?.groupId || expense?.group || groups[0]?.id;

    try {
      await api.expenses.delete(grpId, expenseId);
      setActionFeedback("Expense deleted successfully.");
      setTimeout(() => setActionFeedback(""), 3500);
      refreshDashboardData();
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
    refreshDashboardData();
  };

  return (
    <div className="dashboard-page animate-fade-in">
      {/* Financial Hub Welcome Header */}
      <div className="dashboard-welcome-header">
        <div className="welcome-text-meta">
          <div className="welcome-badge-row">
            <span className="welcome-date">{today}</span>
          </div>
          <h1 className="welcome-title">
            Welcome back, {user?.name?.split(" ")[0] || "Friend"} 👋
          </h1>
          <p className="welcome-subtitle">
            You&apos;re connected to SplitMate. Manage your group expenses, calculate who owes whom, and settle debts with fewer payments.
          </p>
        </div>
      </div>

      {/* Multi-Group Ledger Preview Switcher (if > 1 group) */}
      {groups.length > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <span style={{ fontSize: "12px", color: "var(--charcoal-500)", fontWeight: 500 }}>
            Active Ledger:
          </span>
          <select
            style={{
              fontSize: "12px",
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: "6px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-surface)",
              color: "var(--charcoal-800)",
              cursor: "pointer"
            }}
            value={balanceGroup?.id || balanceGroup?._id || ""}
            onChange={(e) => {
              const grp = groups.find((g) => (g.id || g._id)?.toString() === e.target.value);
              if (grp) {
                setBalanceGroup(grp);
                fetchDashboardBalance(grp);
              }
            }}
            aria-label="Select group ledger to preview on dashboard"
          >
            {groups.map((g) => {
              const gid = g.id || g._id;
              return (
                <option key={gid} value={gid}>
                  {g.name}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* Primary Financial Stat Cards */}
      <div className="dashboard-stats-grid">
        {/* Net Balance Card */}
        <Card className="stat-card stat-net-balance">
          <CardContent className="stat-card-content">
            <div className="stat-header-row">
              <div className="stat-icon-pill icon-mint">
                <Wallet size={20} />
              </div>
              <span className="stat-label">Total Net Balance</span>
              {groups.length > 1 ? (
                <Badge variant="neutral" size="sm" className="stat-growth-badge">
                  {groups.length} Groups
                </Badge>
              ) : groupBalanceData?.currentUserBalance ? (
                <Badge
                  variant={
                    groupBalanceData.currentUserBalance.netBalancePaise > 0
                      ? "emerald"
                      : groupBalanceData.currentUserBalance.netBalancePaise < 0
                      ? "rose"
                      : "mint"
                  }
                  size="sm"
                  className="stat-growth-badge"
                >
                  {groupBalanceData.currentUserBalance.netBalancePaise > 0
                    ? "Owed"
                    : groupBalanceData.currentUserBalance.netBalancePaise < 0
                    ? "Owes"
                    : "Settled"}
                </Badge>
              ) : null}
            </div>
            <div className="stat-amount-row">
              {groups.length === 0 ? (
                <span className="stat-amount">₹0.00</span>
              ) : balanceLoading ? (
                <span className="stat-amount text-muted">Calculating...</span>
              ) : groupBalanceData?.currentUserBalance ? (
                <span
                  className={`stat-amount ${
                    groupBalanceData.currentUserBalance.netBalancePaise > 0
                      ? "text-emerald"
                      : groupBalanceData.currentUserBalance.netBalancePaise < 0
                      ? "text-rose"
                      : ""
                  }`}
                >
                  {groupBalanceData.currentUserBalance.netBalancePaise > 0
                    ? `+₹${formatCurrency(groupBalanceData.currentUserBalance.netBalance)}`
                    : groupBalanceData.currentUserBalance.netBalancePaise < 0
                    ? `-₹${formatCurrency(Math.abs(groupBalanceData.currentUserBalance.netBalance))}`
                    : "₹0.00"}
                </span>
              ) : (
                <span className="stat-amount text-muted">--</span>
              )}
            </div>
            <div className="stat-footer-row">
              {groups.length === 0 ? (
                <span className="stat-footer-note">No active groups. Create or join a group.</span>
              ) : groups.length === 1 ? (
                <span className="stat-footer-note">
                  For <strong>{groups[0].name}</strong> • Real-time ledger
                </span>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                  <span className="stat-footer-note">
                    Ledger: <strong>{balanceGroup?.name || "Group"}</strong>
                  </span>
                  <button
                    type="button"
                    className="stat-link-action"
                    style={{ fontSize: "12px", color: "var(--teal-600)", background: "none", border: "none", cursor: "pointer" }}
                    onClick={() => navigate(`/settlements${balanceGroup ? `?groupId=${balanceGroup.id || balanceGroup._id}` : ""}`)}
                  >
                    View Settlements &gt;
                  </button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* You Owe Card */}
        <Card className="stat-card stat-you-owe">
          <CardContent className="stat-card-content">
            <div className="stat-header-row">
              <div className="stat-icon-pill icon-rose">
                <ArrowDownRight size={20} />
              </div>
              <span className="stat-label">You Owe</span>
              <button
                type="button"
                className="stat-link-action text-rose"
                onClick={() => navigate(`/settlements${balanceGroup ? `?groupId=${balanceGroup.id || balanceGroup._id}` : ""}`)}
              >
                Settlements &gt;
              </button>
            </div>
            <div className="stat-amount-row">
              {groups.length === 0 ? (
                <span className="stat-amount">₹0.00</span>
              ) : balanceLoading ? (
                <span className="stat-amount text-muted">Calculating...</span>
              ) : groupBalanceData?.currentUserBalance ? (
                <span className="stat-amount text-rose">
                  ₹{formatCurrency(
                    groupBalanceData.currentUserBalance.netBalancePaise < 0
                      ? Math.abs(groupBalanceData.currentUserBalance.netBalance)
                      : 0
                  )}
                </span>
              ) : (
                <span className="stat-amount text-muted">--</span>
              )}
            </div>
            <div className="stat-footer-row">
              <span className="stat-footer-note">
                {groups.length === 0
                  ? "No debts pending"
                  : groups.length === 1
                  ? `Obligations in ${groups[0].name}`
                  : `In ${balanceGroup?.name || "active ledger"}. Open Settlements for full plan.`}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* You Are Owed Card */}
        <Card className="stat-card stat-you-are-owed">
          <CardContent className="stat-card-content">
            <div className="stat-header-row">
              <div className="stat-icon-pill icon-emerald">
                <ArrowUpRight size={20} />
              </div>
              <span className="stat-label">You Are Owed</span>
              <button
                type="button"
                className="stat-link-action text-emerald"
                onClick={() => navigate(`/settlements${balanceGroup ? `?groupId=${balanceGroup.id || balanceGroup._id}` : ""}`)}
              >
                Settlements &gt;
              </button>
            </div>
            <div className="stat-amount-row">
              {groups.length === 0 ? (
                <span className="stat-amount">₹0.00</span>
              ) : balanceLoading ? (
                <span className="stat-amount text-muted">Calculating...</span>
              ) : groupBalanceData?.currentUserBalance ? (
                <span className="stat-amount text-emerald">
                  ₹{formatCurrency(
                    groupBalanceData.currentUserBalance.netBalancePaise > 0
                      ? groupBalanceData.currentUserBalance.netBalance
                      : 0
                  )}
                </span>
              ) : (
                <span className="stat-amount text-muted">--</span>
              )}
            </div>
            <div className="stat-footer-row">
              <span className="stat-footer-note">
                {groups.length === 0
                  ? "No receivables pending"
                  : groups.length === 1
                  ? `Receivables in ${groups[0].name}`
                  : `In ${balanceGroup?.name || "active ledger"}. Open Settlements to settle.`}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Shortcut Bar */}
      <div className="dashboard-quick-actions-bar">
        <Button variant="primary" icon={Plus} onClick={handleAddExpenseClick}>
          Add an Expense
        </Button>
        <Button
          variant="mint"
          icon={Check}
          onClick={() =>
            navigate(
              balanceGroup ? `/settlements?groupId=${balanceGroup.id || balanceGroup._id}` : "/settlements"
            )
          }
        >
          Settle Up
        </Button>
        <Button variant="secondary" icon={Users} onClick={() => navigate("/groups")}>
          Create Group
        </Button>
      </div>

      {/* Action feedback & alerts */}
      {actionFeedback && (
        <Alert variant="success" onClose={() => setActionFeedback("")}>
          {actionFeedback}
        </Alert>
      )}

      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Main 2-Column Ledger Grid */}
      <div className="dashboard-grid-layout">
        {/* Left Column: Recent Expenses Feed */}
        <div className="grid-main-column">
          <Card>
            <CardHeader className="feed-header">
              <div className="feed-header-left">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <CardTitle>Recent Expenses</CardTitle>
                  <Badge variant={filteredExpenses.length > 0 ? "mint" : "neutral"} size="sm">
                    {filteredExpenses.length} Loaded
                  </Badge>
                </div>
                <span className="feed-subtitle">
                  Real-time ledger activity across your personal and shared groups
                </span>
              </div>
              <div className="feed-filter-pills">
                <button
                  type="button"
                  className={`filter-pill ${filter === "all" ? "is-active" : ""}`}
                  onClick={() => setFilter("all")}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`filter-pill ${filter === "mine" ? "is-active" : ""}`}
                  onClick={() => setFilter("mine")}
                >
                  Mine
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="dashboard-loading-box">
                  <LoadingSpinner message="Loading recent expenses..." />
                </div>
              ) : filteredExpenses.length === 0 ? (
                <div className="empty-state-card">
                  <div className="empty-state-icon-wrap">
                    <Receipt size={28} />
                  </div>
                  <h3 className="empty-state-title">
                    {filter === "mine" ? "No expenses paid by you" : "No expenses recorded yet"}
                  </h3>
                  <p className="empty-state-desc">
                    {filter === "mine"
                      ? "You haven't paid for any recorded expenses in your active groups."
                      : "Start by creating a group or recording your first shared payment."}
                  </p>
                  {filter === "mine" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setFilter("all")}
                    >
                      Show All Expenses
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={Plus}
                      onClick={handleAddExpenseClick}
                    >
                      Record First Expense
                    </Button>
                  )}
                </div>
              ) : (
                <div className="dashboard-recent-expenses-list">
                  {filteredExpenses.map((expense) => {
                    const grp = groups.find(
                      (g) => (g.id || g._id)?.toString() === (expense.groupId || expense.group)?.toString()
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
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Active Groups & Quick Links */}
        <div className="grid-side-column">
          <Card>
            <CardHeader className="feed-header">
              <CardTitle>Active Groups</CardTitle>
              <Badge variant={groups.length > 0 ? "mint" : "neutral"} size="sm">
                {groups.length} Active
              </Badge>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="dashboard-loading-box">
                  <LoadingSpinner message="Loading groups..." />
                </div>
              ) : groups.length === 0 ? (
                <div className="empty-state-card compact">
                  <div className="empty-state-icon-wrap">
                    <Users size={24} />
                  </div>
                  <h4 className="empty-state-title">No active groups</h4>
                  <p className="empty-state-desc">
                    Create a group for flatmates, trips, or projects.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Users}
                    onClick={() => navigate("/groups")}
                  >
                    Create New Group
                  </Button>
                </div>
              ) : (
                <div className="dashboard-groups-list">
                  {groups.slice(0, 5).map((g) => {
                    const CategoryIcon = CATEGORY_ICONS[g.category] || Folder;
                    return (
                      <div
                        key={g.id || g._id}
                        className="dashboard-group-item"
                        onClick={() => navigate(`/groups/${g.id || g._id}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            navigate(`/groups/${g.id || g._id}`);
                          }
                        }}
                      >
                        <div className="dashboard-group-icon">
                          <CategoryIcon size={18} />
                        </div>
                        <div className="dashboard-group-meta">
                          <span className="dashboard-group-name">{g.name}</span>
                          <span className="dashboard-group-sub">
                            {g.memberCount || g.members?.length || 1} members • {g.category}
                          </span>
                        </div>
                        <ArrowRight size={14} className="dashboard-group-arrow" />
                      </div>
                    );
                  })}

                  <div className="dashboard-view-all-groups">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate("/groups")}
                      style={{ width: "100%" }}
                    >
                      View All Groups ({groups.length})
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Group Picker Modal (when adding an expense from dashboard with >1 groups) */}
      {groupPickerOpen && (
        <div className="modal-backdrop" onClick={() => setGroupPickerOpen(false)}>
          <div
            className="modal-container animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title">Select Group</h2>
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
              <p style={{ fontSize: "13.5px", color: "var(--charcoal-600)", marginBottom: "12px" }}>
                Choose which group you want to record this expense in:
              </p>
              <div className="group-picker-list">
                {groups.map((g) => {
                  const CategoryIcon = CATEGORY_ICONS[g.category] || Folder;
                  return (
                    <button
                      key={g.id || g._id}
                      type="button"
                      className="group-picker-item"
                      onClick={() => handleSelectGroupForExpense(g)}
                    >
                      <div className="dashboard-group-icon">
                        <CategoryIcon size={18} />
                      </div>
                      <div className="group-picker-meta">
                        <span className="group-picker-name">{g.name}</span>
                        <span className="group-picker-sub">
                          {g.memberCount || g.members?.length || 1} members • {g.category}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expense Modal (for creating or editing expenses) */}
      {expenseModalOpen && selectedGroup && (
        <ExpenseModal
          key={expenseToEdit?._id || expenseToEdit?.id || `new-dash-${selectedGroup.id || selectedGroup._id}`}
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
