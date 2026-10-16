import { useState } from "react";
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
  Folder,
  ChevronDown,
  ChevronUp,
  Edit2,
  Trash2,
  AlertCircle
} from "lucide-react";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import "./ExpenseItem.css";

const CATEGORY_ICONS = {
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

/**
 * Format timestamp into readable localized date string
 */
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/**
 * Single Expense list item component
 */
export function ExpenseItem({
  expense,
  currentUser,
  userGroupRole,
  isGroupCreatorOrAdmin,
  onEdit,
  onDelete
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const CategoryIcon = CATEGORY_ICONS[expense.category] || Receipt;

  const currentUserId = currentUser?.id || currentUser?._id;
  const payerId = expense.paidBy?._id || expense.paidBy;
  const createdById = expense.createdBy?._id || expense.createdBy;

  const isPayer = payerId?.toString() === currentUserId?.toString();
  const isCreator = createdById?.toString() === currentUserId?.toString();

  // Permission policy: Expense creator, payer, or group admin/creator can modify/delete
  const canModify =
    isCreator ||
    isPayer ||
    isGroupCreatorOrAdmin ||
    userGroupRole === "admin" ||
    userGroupRole === "creator";

  const payerName = isPayer ? "You" : expense.paidBy?.name || "Group Member";

  const handleDeleteClick = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    try {
      setDeleting(true);
      await onDelete(expense.id || expense._id);
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className={`expense-item-card ${expanded ? "expanded" : ""}`}>
      <div className="expense-main-row">
        {/* Left: Category Icon & Details */}
        <div className="expense-left">
          <div className="expense-category-icon-wrap" title={expense.category}>
            <CategoryIcon size={20} />
          </div>

          <div className="expense-info-block">
            <div className="expense-title-line">
              <h4 className="expense-description">{expense.description}</h4>
              {expense.groupName && (
                <Badge variant="mint" size="sm">
                  {expense.groupName}
                </Badge>
              )}
              <Badge variant="neutral" size="sm">
                {expense.category}
              </Badge>
              <Badge variant="neutral" size="sm" className="split-type-badge">
                {expense.splitType} split
              </Badge>
            </div>

            <p className="expense-subtext">
              <span className="expense-payer">
                Paid by <strong>{payerName}</strong>
              </span>
              <span className="subtext-separator">•</span>
              <span className="expense-date">{formatDate(expense.createdAt)}</span>
              <span className="subtext-separator">•</span>
              <span className="expense-participant-count">
                {expense.splits?.length || expense.participants?.length || 0} participants
              </span>
            </p>
          </div>
        </div>

        {/* Right: Total Amount & Actions */}
        <div className="expense-right">
          <div className="expense-amount-wrap">
            <span className="expense-currency">₹</span>
            <span className="expense-amount">
              {Number(expense.amount).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </span>
          </div>

          <div className="expense-actions-wrap">
            <button
              type="button"
              className="expense-toggle-btn"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? "Hide split breakdown" : "Show split breakdown"}
              title="Toggle split breakdown"
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {canModify && (
              <div className="expense-privileged-actions">
                <button
                  type="button"
                  className="expense-action-btn edit-btn"
                  onClick={() => onEdit(expense)}
                  title="Edit expense"
                >
                  <Edit2 size={15} />
                </button>

                <button
                  type="button"
                  className={`expense-action-btn delete-btn ${confirmDelete ? "confirm-active" : ""}`}
                  onClick={handleDeleteClick}
                  disabled={deleting}
                  title={confirmDelete ? "Click again to confirm delete" : "Delete expense"}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Banner for Deletion */}
      {confirmDelete && (
        <div className="delete-confirm-banner animate-fade-in">
          <div className="delete-confirm-text">
            <AlertCircle size={15} className="delete-warn-icon" />
            <span>Are you sure you want to delete this expense?</span>
          </div>
          <div className="delete-confirm-buttons">
            <Button
              variant="danger"
              size="sm"
              onClick={handleDeleteClick}
              isLoading={deleting}
            >
              Confirm Delete
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Expandable Breakdown Drawer */}
      {expanded && (
        <div className="expense-breakdown-drawer animate-fade-in">
          <h5 className="breakdown-heading">Split Breakdown</h5>
          <div className="breakdown-grid">
            {expense.splits?.map((split, idx) => {
              const splitUser = split.user;
              const isUser =
                splitUser?._id?.toString() === currentUserId?.toString() ||
                splitUser?.toString() === currentUserId?.toString();
              const userName = isUser ? "You" : splitUser?.name || `Participant ${idx + 1}`;

              return (
                <div key={splitUser?._id || idx} className="breakdown-card">
                  <div className="breakdown-user-info">
                    <div className="breakdown-avatar">
                      {userName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="breakdown-user-details">
                      <span className="breakdown-name">
                        {userName}
                        {isUser && <span className="you-pill">You</span>}
                      </span>
                      {split.percentage !== undefined && (
                        <span className="breakdown-pct">{split.percentage}% share</span>
                      )}
                    </div>
                  </div>
                  <div className="breakdown-allocated-amount">
                    ₹
                    {Number(split.amount).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
