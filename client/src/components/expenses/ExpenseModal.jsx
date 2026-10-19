import { useState, useMemo } from "react";
import { X, Users, AlertCircle, CheckCircle2, Split } from "lucide-react";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { Alert } from "../common/Alert";
import { api, ApiError } from "../../services/api";
import { EXPENSE_CATEGORIES } from "../../constants/categories";
import "./ExpenseModal.css";

const CATEGORIES = EXPENSE_CATEGORIES;

export function ExpenseModal({
  isOpen,
  onClose,
  group,
  expenseToEdit = null,
  currentUser,
  onSuccess
}) {
  const isEditing = Boolean(expenseToEdit);
  const currentUserId = currentUser?.id || currentUser?._id;
  const members = useMemo(() => group?.members || [], [group]);

  const initialPayerId = useMemo(() => {
    if (expenseToEdit) {
      return (expenseToEdit.paidBy?._id || expenseToEdit.paidBy)?.toString() || "";
    }
    const defaultPayer =
      members.find((m) => (m.user?._id || m.user).toString() === currentUserId?.toString()) ||
      members[0];
    return defaultPayer ? (defaultPayer.user?._id || defaultPayer.user).toString() : "";
  }, [expenseToEdit, members, currentUserId]);

  const initialParticipants = useMemo(() => {
    if (expenseToEdit) {
      return (expenseToEdit.participants || []).map((p) => (p._id || p).toString());
    }
    return members.map((m) => (m.user?._id || m.user).toString());
  }, [expenseToEdit, members]);

  const initialSplits = useMemo(() => {
    const exacts = {};
    const pcts = {};
    if (expenseToEdit?.splits) {
      expenseToEdit.splits.forEach((s) => {
        const uid = (s.user?._id || s.user).toString();
        if (s.amount !== undefined) exacts[uid] = s.amount.toString();
        if (s.percentage !== undefined) pcts[uid] = s.percentage.toString();
      });
    }
    return { exacts, pcts };
  }, [expenseToEdit]);

  // Form State
  const [description, setDescription] = useState(expenseToEdit?.description || "");
  const [amount, setAmount] = useState(expenseToEdit?.amount?.toString() || "");
  const [category, setCategory] = useState(expenseToEdit?.category || "General");
  const [paidBy, setPaidBy] = useState(initialPayerId);
  const [splitType, setSplitType] = useState(expenseToEdit?.splitType || "equal");
  const [selectedParticipants, setSelectedParticipants] = useState(initialParticipants);
  const [exactAmounts, setExactAmounts] = useState(initialSplits.exacts);
  const [percentages, setPercentages] = useState(initialSplits.pcts);

  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  // Toggle participant inclusion
  const handleToggleParticipant = (userId) => {
    setSelectedParticipants((prev) => {
      if (prev.includes(userId)) {
        if (prev.length <= 1) return prev; // Must have at least 1 participant
        return prev.filter((id) => id !== userId);
      }
      return [...prev, userId];
    });
  };

  // Select all or clear participants
  const handleSelectAllParticipants = () => {
    setSelectedParticipants(members.map((m) => (m.user?._id || m.user).toString()));
  };

  // Calculations for preview & validation
  const numericAmount = parseFloat(amount) || 0;
  const participantCount = selectedParticipants.length;

  // Equal split calculation preview
  const equalShare = participantCount > 0 && numericAmount > 0
    ? (numericAmount / participantCount).toFixed(2)
    : "0.00";

  // Exact split calculation
  const totalExactAllocated = selectedParticipants.reduce((sum, uid) => {
    return sum + (parseFloat(exactAmounts[uid]) || 0);
  }, 0);
  const exactDiff = (numericAmount - totalExactAllocated).toFixed(2);
  const isExactBalanced = Math.abs(parseFloat(exactDiff)) < 0.01;

  // Percentage split calculation
  const totalPercentageAllocated = selectedParticipants.reduce((sum, uid) => {
    return sum + (parseFloat(percentages[uid]) || 0);
  }, 0);
  const pctDiff = (100 - totalPercentageAllocated).toFixed(1);
  const isPctBalanced = Math.abs(parseFloat(pctDiff)) < 0.01;

  // Form submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    // 1. Basic validation
    if (!description.trim()) {
      setFormError("Please enter an expense description.");
      return;
    }

    if (!numericAmount || numericAmount <= 0) {
      setFormError("Please enter a valid expense amount greater than zero.");
      return;
    }

    if (!paidBy) {
      setFormError("Please select who paid for this expense.");
      return;
    }

    if (selectedParticipants.length === 0) {
      setFormError("Please select at least one participant to split with.");
      return;
    }

    // 2. Validate split-specific inputs
    let splitsPayload = undefined;

    if (splitType === "exact") {
      if (!isExactBalanced) {
        setFormError(
          `Exact split amounts must equal the total of ₹${numericAmount.toFixed(2)}. Currently allocated: ₹${totalExactAllocated.toFixed(2)} (${parseFloat(exactDiff) > 0 ? "Under by ₹" + exactDiff : "Over by ₹" + Math.abs(parseFloat(exactDiff)).toFixed(2)}).`
        );
        return;
      }

      splitsPayload = selectedParticipants.map((uid) => ({
        user: uid,
        amount: parseFloat(exactAmounts[uid]) || 0
      }));
    } else if (splitType === "percentage") {
      if (!isPctBalanced) {
        setFormError(
          `Percentages must total 100%. Current total: ${totalPercentageAllocated}% (${parseFloat(pctDiff) > 0 ? "Remaining: " + pctDiff + "%" : "Exceeded by " + Math.abs(parseFloat(pctDiff)) + "%"}).`
        );
        return;
      }

      splitsPayload = selectedParticipants.map((uid) => ({
        user: uid,
        percentage: parseFloat(percentages[uid]) || 0
      }));
    }

    // 3. Construct API payload
    const payload = {
      description: description.trim(),
      amount: numericAmount,
      currency: "INR",
      category,
      paidBy,
      splitType,
      participants: selectedParticipants,
      splits: splitsPayload
    };

    setIsSubmitting(true);
    try {
      let res;
      if (isEditing) {
        res = await api.expenses.update(group._id || group.id, expenseToEdit.id || expenseToEdit._id, payload);
      } else {
        res = await api.expenses.create(group._id || group.id, payload);
      }

      if (res.success && res.expense) {
        onSuccess?.(res.expense);
        onClose();
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to save expense. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container expense-modal-container animate-fade-in">
        <div className="modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon-badge">
              <Split size={20} />
            </div>
            <div>
              <h2 className="modal-title">
                {isEditing ? "Edit Expense" : "Add Group Expense"}
              </h2>
              <p className="modal-subtitle">
                {isEditing ? "Update transaction details" : `Record an expense for ${group?.name}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {formError && (
          <div className="modal-error-wrap">
            <Alert variant="error" onClose={() => setFormError("")}>
              {formError}
            </Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} className="expense-form" noValidate>
          {/* Row 1: Description & Amount */}
          <div className="form-row-grid">
            <div className="form-field-group">
              <Input
                label="Description"
                id="expense-description"
                placeholder="e.g. Weekly Groceries, Dinner, Wifi"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="form-field-group">
              <label htmlFor="expense-amount" className="custom-input-label">
                Amount (₹) <span className="required-star">*</span>
              </label>
              <div className="input-currency-wrapper">
                <span className="currency-symbol">₹</span>
                <input
                  type="number"
                  id="expense-amount"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  className="currency-input-field"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          {/* Row 2: Category & Paid By */}
          <div className="form-row-grid">
            <div className="form-field-group">
              <label htmlFor="expense-category" className="custom-input-label">
                Category
              </label>
              <select
                id="expense-category"
                className="custom-select-field"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={isSubmitting}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field-group">
              <label htmlFor="expense-paid-by" className="custom-input-label">
                Paid By <span className="required-star">*</span>
              </label>
              <select
                id="expense-paid-by"
                className="custom-select-field"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                required
                disabled={isSubmitting}
              >
                {members.map((m) => {
                  const mId = (m.user?._id || m.user).toString();
                  const isUser = mId === currentUserId?.toString();
                  return (
                    <option key={mId} value={mId}>
                      {m.user?.name || "Member"} {isUser ? "(You)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Split Type Selector */}
          <div className="split-type-section">
            <label className="custom-input-label">Split Strategy</label>
            <div className="split-type-tabs">
              <button
                type="button"
                className={`split-tab-btn ${splitType === "equal" ? "active" : ""}`}
                onClick={() => setSplitType("equal")}
              >
                Equal Split
              </button>
              <button
                type="button"
                className={`split-tab-btn ${splitType === "exact" ? "active" : ""}`}
                onClick={() => setSplitType("exact")}
              >
                Exact Amounts
              </button>
              <button
                type="button"
                className={`split-tab-btn ${splitType === "percentage" ? "active" : ""}`}
                onClick={() => setSplitType("percentage")}
              >
                Percentages
              </button>
            </div>
          </div>

          {/* Participants Selection & Allocation Details */}
          <div className="participants-section">
            <div className="participants-header">
              <div className="participants-title-wrap">
                <Users size={16} className="inline-icon" />
                <span className="participants-title">
                  Included in Split ({selectedParticipants.length} of {members.length})
                </span>
              </div>
              <button
                type="button"
                className="select-all-btn"
                onClick={handleSelectAllParticipants}
              >
                Select All
              </button>
            </div>

            {/* Split Type Helper / Summary Header */}
            {splitType === "equal" && (
              <div className="split-summary-box">
                <div className="split-summary-info">
                  <span>Each selected person owes:</span>
                  <strong className="summary-highlight">₹{equalShare}</strong>
                </div>
                <span className="split-helper-sub">
                  Any leftover paise will be distributed deterministically.
                </span>
              </div>
            )}

            {splitType === "exact" && (
              <div className={`split-summary-box ${isExactBalanced ? "balanced" : "unbalanced"}`}>
                <div className="split-summary-info">
                  <span>
                    Allocated: <strong>₹{totalExactAllocated.toFixed(2)}</strong> of ₹{numericAmount.toFixed(2)}
                  </span>
                  <span className={`status-badge ${isExactBalanced ? "badge-success" : "badge-warn"}`}>
                    {isExactBalanced ? (
                      <>
                        <CheckCircle2 size={13} /> Balanced
                      </>
                    ) : (
                      <>
                        <AlertCircle size={13} />
                        {parseFloat(exactDiff) > 0 ? `₹${exactDiff} remaining` : `₹${Math.abs(parseFloat(exactDiff)).toFixed(2)} over`}
                      </>
                    )}
                  </span>
                </div>
              </div>
            )}

            {splitType === "percentage" && (
              <div className={`split-summary-box ${isPctBalanced ? "balanced" : "unbalanced"}`}>
                <div className="split-summary-info">
                  <span>
                    Total: <strong>{totalPercentageAllocated}%</strong> of 100%
                  </span>
                  <span className={`status-badge ${isPctBalanced ? "badge-success" : "badge-warn"}`}>
                    {isPctBalanced ? (
                      <>
                        <CheckCircle2 size={13} /> 100% Balanced
                      </>
                    ) : (
                      <>
                        <AlertCircle size={13} />
                        {parseFloat(pctDiff) > 0 ? `${pctDiff}% remaining` : `${Math.abs(parseFloat(pctDiff))}% over`}
                      </>
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Member Allocation Rows */}
            <div className="member-allocation-list">
              {members.map((m) => {
                const uId = (m.user?._id || m.user).toString();
                const isSelected = selectedParticipants.includes(uId);
                const isUser = uId === currentUserId?.toString();
                const name = m.user?.name || "Member";

                return (
                  <div
                    key={uId}
                    className={`member-allocation-row ${isSelected ? "selected" : "deselected"}`}
                  >
                    <label className="member-checkbox-label">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleParticipant(uId)}
                        disabled={isSubmitting}
                      />
                      <div className="member-name-group">
                        <span className="member-row-name">
                          {name} {isUser && <span className="you-pill">You</span>}
                        </span>
                        <span className="member-row-email">{m.user?.email}</span>
                      </div>
                    </label>

                    {/* Inputs depending on split type */}
                    {isSelected && (
                      <div className="member-allocation-input-wrap">
                        {splitType === "equal" && (
                          <span className="equal-calculated-amount">₹{equalShare}</span>
                        )}

                        {splitType === "exact" && (
                          <div className="exact-input-box">
                            <span className="mini-symbol">₹</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              className="member-split-input"
                              value={exactAmounts[uId] || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setExactAmounts((prev) => ({ ...prev, [uId]: val }));
                              }}
                              disabled={isSubmitting}
                            />
                          </div>
                        )}

                        {splitType === "percentage" && (
                          <div className="percentage-input-box">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              placeholder="0"
                              className="member-split-input"
                              value={percentages[uId] || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setPercentages((prev) => ({ ...prev, [uId]: val }));
                              }}
                              disabled={isSubmitting}
                            />
                            <span className="mini-symbol">%</span>
                            <span className="computed-rupee-preview">
                              ₹
                              {(
                                (numericAmount * (parseFloat(percentages[uId]) || 0)) /
                                100
                              ).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="modal-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
            >
              {isEditing ? "Save Changes" : "Save Expense"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
