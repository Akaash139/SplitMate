import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Users,
  Copy,
  Check,
  RefreshCw,
  Plus,
  Home,
  Plane,
  Heart,
  Folder,
  Settings,
  Trash2,
  X
} from "lucide-react";
import { api, ApiError } from "../../services/api";
import { useAuth } from "../../context/useAuth";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/common/Card";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { Alert } from "../../components/common/Alert";
import { LoadingSpinner } from "../../components/common/LoadingSpinner";
import { Input } from "../../components/common/Input";
import { ExpenseItem } from "../../components/expenses/ExpenseItem";
import { ExpenseModal } from "../../components/expenses/ExpenseModal";
import "./GroupDetails.css";

const CATEGORY_ICONS = {
  Home: Home,
  Trip: Plane,
  Couple: Heart,
  Other: Folder
};

export function GroupDetails() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  // Expenses State
  const [expenses, setExpenses] = useState([]);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [expensesError, setExpensesError] = useState("");
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState(null);
  const [actionFeedback, setActionFeedback] = useState("");

  // Edit Group Form
  const [editData, setEditData] = useState({ name: "", description: "", category: "Home" });
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editError, setEditError] = useState("");

  const refreshExpenses = async () => {
    try {
      setExpensesLoading(true);
      setExpensesError("");
      const res = await api.expenses.list(groupId);
      if (res.success && res.expenses) {
        setExpenses(res.expenses);
      }
    } catch (err) {
      setExpensesError(err instanceof ApiError ? err.message : "Failed to load group expenses");
    } finally {
      setExpensesLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function loadGroupAndExpenses() {
      try {
        setError(null);
        setExpensesError("");
        const [groupRes, expensesRes] = await Promise.all([
          api.groups.getById(groupId),
          api.expenses.list(groupId)
        ]);

        if (isMounted) {
          if (groupRes.success && groupRes.group) {
            setGroup(groupRes.group);
            setEditData({
              name: groupRes.group.name,
              description: groupRes.group.description || "",
              category: groupRes.group.category || "Home"
            });
          }
          if (expensesRes.success && expensesRes.expenses) {
            setExpenses(expensesRes.expenses);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof ApiError ? err.message : "Failed to load group details");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
          setExpensesLoading(false);
        }
      }
    }

    loadGroupAndExpenses();

    return () => {
      isMounted = false;
    };
  }, [groupId]);

  const handleOpenAddExpense = () => {
    setExpenseToEdit(null);
    setExpenseModalOpen(true);
  };

  const handleOpenEditExpense = (expense) => {
    setExpenseToEdit(expense);
    setExpenseModalOpen(true);
  };

  const handleDeleteExpense = async (expenseId) => {
    try {
      await api.expenses.delete(groupId, expenseId);
      setActionFeedback("Expense deleted successfully.");
      setTimeout(() => setActionFeedback(""), 3500);
      refreshExpenses();
    } catch (err) {
      setExpensesError(err instanceof ApiError ? err.message : "Failed to delete expense");
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
    refreshExpenses();
  };

  // Invite link generation
  const inviteLink = group?.inviteCode
    ? `${window.location.origin}/join/${group.inviteCode}`
    : "";

  const handleCopyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      setCopied(true);
    }
  };

  const handleRegenerateInvite = async () => {
    if (!group) return;
    try {
      setRegenerating(true);
      const res = await api.groups.regenerateInvite(group.id);
      if (res.success) {
        setGroup((prev) => ({
          ...prev,
          inviteCode: res.inviteCode,
          inviteExpiresAt: res.inviteExpiresAt
        }));
      }
    } catch (err) {
      setError(err.message || "Failed to regenerate invite link");
    } finally {
      setRegenerating(false);
    }
  };

  const handleUpdateGroup = async (e) => {
    e.preventDefault();
    setEditError("");

    if (!editData.name.trim()) {
      setEditError("Group name is required");
      return;
    }

    try {
      setIsUpdating(true);
      const res = await api.groups.update(group.id, editData);
      if (res.success && res.group) {
        setGroup(res.group);
        setSettingsModalOpen(false);
      }
    } catch (err) {
      setEditError(err.message || "Failed to update group");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!window.confirm(`Are you sure you want to delete "${group.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setIsDeleting(true);
      await api.groups.delete(group.id);
      navigate("/groups", { replace: true });
    } catch (err) {
      setEditError(err.message || "Failed to delete group");
      setIsDeleting(false);
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen message="Loading group details..." />;
  }

  if (error || !group) {
    return (
      <div className="group-details-page animate-fade-in">
        <Link to="/groups" className="back-link">
          <ArrowLeft size={16} /> Back to Groups
        </Link>
        <Alert variant="error">{error || "Group not found or you are not an authorized member."}</Alert>
      </div>
    );
  }

  const CategoryIcon = CATEGORY_ICONS[group.category] || Folder;
  const isCreator = group.currentUserRole === "creator";
  const isCreatorOrAdmin = isCreator || group.currentUserRole === "admin";

  const memberNamesPreview = group.members
    .map((m) => {
      const isMe = m.user?._id === user?.id || m.user?.email === user?.email;
      return isMe ? `${m.user?.name || "You"} (You)` : m.user?.name;
    })
    .filter(Boolean)
    .join(", ");

  return (
    <div className="group-details-page animate-fade-in">
      {/* Top Breadcrumb & Back Link */}
      <div className="group-top-nav">
        <Link to="/groups" className="back-link">
          <ArrowLeft size={16} /> All Groups
        </Link>
      </div>

      {/* Group Hero Header (Matching Stitch Image 2) */}
      <div className="group-hero-card">
        <div className="group-hero-left">
          <div className="group-hero-icon-wrap">
            <CategoryIcon size={28} />
          </div>

          <div className="group-hero-info">
            <div className="group-badge-line">
              <h1 className="group-hero-title">{group.name}</h1>
              <Badge variant="mint" size="sm">
                Active {group.category}
              </Badge>
            </div>

            <p className="group-members-summary-text">
              <Users size={14} className="inline-icon" /> {group.memberCount} members: {memberNamesPreview}
            </p>

            {group.description && <p className="group-hero-desc">{group.description}</p>}
          </div>
        </div>

        <div className="group-hero-actions">
          <Button
            variant="mint"
            icon={Copy}
            onClick={() => setInviteModalOpen(true)}
          >
            Invite Friends
          </Button>

          {isCreatorOrAdmin && (
            <Button
              variant="secondary"
              icon={Settings}
              onClick={() => setSettingsModalOpen(true)}
            >
              Settings
            </Button>
          )}

          <Button
            variant="primary"
            icon={Plus}
            onClick={handleOpenAddExpense}
          >
            Add Group Expense
          </Button>
        </div>
      </div>

      {/* 2-Column Details Layout */}
      <div className="group-layout-grid">
        {/* Left Column: Expenses Feed */}
        <div className="group-main-column">
          <Card>
            <CardHeader className="feed-header">
              <div className="feed-header-title-wrap">
                <CardTitle>Group Expenses</CardTitle>
                <Badge variant={expenses.length > 0 ? "mint" : "neutral"} size="sm">
                  {expenses.length} Logged
                </Badge>
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={handleOpenAddExpense}
              >
                Add Expense
              </Button>
            </CardHeader>
            <CardContent>
              {actionFeedback && (
                <div className="action-feedback-wrap">
                  <Alert variant="success" onClose={() => setActionFeedback("")}>
                    {actionFeedback}
                  </Alert>
                </div>
              )}

              {expensesError && (
                <div className="expenses-error-wrap">
                  <Alert variant="error" onClose={() => setExpensesError("")}>
                    {expensesError}
                  </Alert>
                </div>
              )}

              {expensesLoading ? (
                <div className="expenses-loading-box">
                  <LoadingSpinner message="Loading group expenses..." />
                </div>
              ) : expenses.length === 0 ? (
                <div className="empty-state-card">
                  <div className="empty-state-icon-wrap">
                    <CategoryIcon size={28} />
                  </div>
                  <h3 className="empty-state-title">No expenses logged yet in {group.name}</h3>
                  <p className="empty-state-desc">
                    When you or your group members add an expense, SplitMate will automatically calculate equal, exact, or percentage splits.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Plus}
                    onClick={handleOpenAddExpense}
                  >
                    Record First Expense
                  </Button>
                </div>
              ) : (
                <div className="expenses-feed-list">
                  {expenses.map((expense) => (
                    <ExpenseItem
                      key={expense._id || expense.id}
                      expense={expense}
                      currentUser={user}
                      userGroupRole={group.currentUserRole}
                      isGroupCreatorOrAdmin={isCreatorOrAdmin}
                      onEdit={handleOpenEditExpense}
                      onDelete={handleDeleteExpense}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Invite Link Card & Member Roster */}
        <div className="group-side-column">
          {/* Shareable Invite Link Card */}
          <Card className="invite-link-card">
            <CardHeader>
              <CardTitle>Invite a Roommate</CardTitle>
            </CardHeader>
            <CardContent className="invite-card-body">
              <p className="invite-card-desc">
                Share this private invitation link with anyone you want to add to this group.
              </p>

              <div className="invite-url-box">
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  className="invite-url-input"
                />
                <Button
                  variant={copied ? "mint" : "primary"}
                  size="sm"
                  icon={copied ? Check : Copy}
                  onClick={handleCopyInvite}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>

              {isCreatorOrAdmin && (
                <div className="invite-actions-row">
                  <button
                    type="button"
                    className="regenerate-link-btn"
                    onClick={handleRegenerateInvite}
                    disabled={regenerating}
                  >
                    <RefreshCw size={13} className={regenerating ? "animate-spin" : ""} />
                    <span>Regenerate Code</span>
                  </button>
                  <span className="code-tag">Code: {group.inviteCode}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Members Roster Card */}
          <Card className="members-roster-card">
            <CardHeader>
              <div className="roster-header-row">
                <CardTitle>Group Members</CardTitle>
                <Badge variant="neutral" size="sm">{group.memberCount}</Badge>
              </div>
            </CardHeader>
            <CardContent className="roster-card-content">
              <ul className="member-roster-list">
                {group.members.map((m) => {
                  const memberUser = m.user;
                  const isCurrentUser = memberUser?._id === user?.id || memberUser?.email === user?.email;
                  const initials = memberUser?.name
                    ? memberUser.name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()
                    : "U";

                  return (
                    <li key={memberUser?._id || m.joinedAt} className="roster-member-item">
                      <div className="roster-avatar">{initials}</div>
                      <div className="roster-member-details">
                        <div className="roster-name-row">
                          <span className="roster-name">
                            {memberUser?.name || "Unknown User"}
                            {isCurrentUser && <span className="is-you-tag"> (You)</span>}
                          </span>
                          <Badge
                            variant={
                              m.role === "creator"
                                ? "mint"
                                : m.role === "admin"
                                ? "purple"
                                : "neutral"
                            }
                            size="sm"
                          >
                            {m.role}
                          </Badge>
                        </div>
                        <span className="roster-email">{memberUser?.email}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Invite Friends Modal */}
      {inviteModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-container animate-fade-in">
            <div className="modal-header">
              <h2 className="modal-title">Invite Friends to {group.name}</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setInviteModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-form">
              <p className="modal-help-text">
                Send this link to friends, roommates, or classmates. They can join the group with one click.
              </p>

              <div className="invite-url-box">
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  className="invite-url-input"
                />
                <Button
                  variant={copied ? "mint" : "primary"}
                  size="sm"
                  icon={copied ? Check : Copy}
                  onClick={handleCopyInvite}
                >
                  {copied ? "Copied Link!" : "Copy Link"}
                </Button>
              </div>

              <div className="modal-actions">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setInviteModalOpen(false)}
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Group Settings Modal (Edit / Delete) */}
      {settingsModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-container animate-fade-in">
            <div className="modal-header">
              <h2 className="modal-title">Group Settings</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSettingsModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {editError && (
              <Alert variant="error" onClose={() => setEditError("")}>
                {editError}
              </Alert>
            )}

            <form onSubmit={handleUpdateGroup} className="modal-form">
              <Input
                label="Group Name"
                value={editData.name}
                onChange={(e) => setEditData((prev) => ({ ...prev, name: e.target.value }))}
                required
              />

              <div className="input-field-group">
                <label className="input-label">Description</label>
                <textarea
                  className="modal-textarea"
                  rows={3}
                  value={editData.description}
                  onChange={(e) => setEditData((prev) => ({ ...prev, description: e.target.value }))}
                  maxLength={300}
                />
              </div>

              <div className="modal-actions">
                {isCreator && (
                  <Button
                    type="button"
                    variant="danger"
                    icon={Trash2}
                    onClick={handleDeleteGroup}
                    isLoading={isDeleting}
                    style={{ marginRight: "auto" }}
                  >
                    Delete Group
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSettingsModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isUpdating}
                >
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expense Add / Edit Modal */}
      {expenseModalOpen && (
        <ExpenseModal
          key={expenseToEdit?._id || expenseToEdit?.id || "new-expense"}
          isOpen={expenseModalOpen}
          onClose={() => {
            setExpenseModalOpen(false);
            setExpenseToEdit(null);
          }}
          group={group}
          expenseToEdit={expenseToEdit}
          currentUser={user}
          onSuccess={handleExpenseSaved}
        />
      )}
    </div>
  );
}
