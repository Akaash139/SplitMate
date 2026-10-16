import { useState, useId } from "react";
import { ArrowRight, CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { api, ApiError } from "../../services/api";
import { formatINR, validateSettlementAmount } from "../../services/settlementUtils";
import { Button } from "../../components/common/Button";
import { Alert } from "../../components/common/Alert";
import "./Settlements.css";

function RecordSettlementDialogContent({
  onClose,
  transfer,
  groupId,
  groupName,
  onSettlementRecorded
}) {
  const instanceId = useId();
  const maxDebt = transfer?.amount || 0;
  const payerName = transfer?.fromUser?.name || "Payer";
  const receiverName = transfer?.toUser?.name || "Recipient";

  const [amount, setAmount] = useState(() => (transfer?.amount ? transfer.amount.toString() : ""));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [idempotencyKey] = useState(
    () => `settle_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );

  const validation = validateSettlementAmount(amount, maxDebt);

  const handleAmountChange = (e) => {
    setAmount(e.target.value);
    setError(null);
  };

  const handlePresetClick = (val) => {
    setAmount(val.toString());
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validation.isValid) {
      setError(validation.error);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        payer: transfer.fromUser?.id || transfer.fromUser?._id || transfer.payer || transfer.from,
        receiver: transfer.toUser?.id || transfer.toUser?._id || transfer.recipient || transfer.to,
        amount: parseFloat(amount),
        notes: notes.trim(),
        idempotencyKey
      };

      const res = await api.settlements.record(groupId, payload);

      if (res.success) {
        if (onSettlementRecorded) {
          onSettlementRecorded(res);
        }
        onClose();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record settlement payment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="settlement-modal-title">
      <div className="settlement-modal-card">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-wrap">
            <h2 id="settlement-modal-title" className="modal-title">
              Record Debt Settlement
            </h2>
            <span className="modal-subtitle">
              for <strong>{groupName || "Group Ledger"}</strong>
            </span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close settlement modal"
            disabled={submitting}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Visual Transfer Pathway Card */}
            <div className="modal-transfer-path">
              <div className="path-party path-payer">
                <div className="path-avatar">
                  {payerName.charAt(0).toUpperCase()}
                </div>
                <div className="path-meta">
                  <span className="path-name">{payerName}</span>
                  <span className="path-label">Paying Member</span>
                </div>
              </div>

              <div className="path-arrow-flow">
                <ArrowRight size={20} className="path-arrow-icon" />
                <span className="path-flow-text">Direct Payment</span>
              </div>

              <div className="path-party path-receiver">
                <div className="path-avatar receiver-avatar">
                  {receiverName.charAt(0).toUpperCase()}
                </div>
                <div className="path-meta">
                  <span className="path-name">{receiverName}</span>
                  <span className="path-label">Receiving Member</span>
                </div>
              </div>
            </div>

            {/* Total Suggested Debt Notice */}
            <div className="suggested-debt-indicator">
              <span className="suggested-label">Recommended Settlement:</span>
              <span className="suggested-figure">₹{formatINR(maxDebt)}</span>
            </div>

            {/* Amount Field with Presets */}
            <div className="form-field-group">
              <label htmlFor={`amount-input-${instanceId}`} className="field-label">
                Settlement Amount (₹) <span className="required-star">*</span>
              </label>

              <div className="amount-input-wrapper">
                <span className="input-currency-prefix">₹</span>
                <input
                  id={`amount-input-${instanceId}`}
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={maxDebt}
                  className={`amount-input ${validation.isValid ? "" : "has-error"}`}
                  value={amount}
                  onChange={handleAmountChange}
                  placeholder="0.00"
                  disabled={submitting}
                  required
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="amount-preset-chips">
                <button
                  type="button"
                  className="preset-chip"
                  onClick={() => handlePresetClick(maxDebt)}
                  disabled={submitting}
                >
                  Full: ₹{formatINR(maxDebt)}
                </button>
                {maxDebt > 10 && (
                  <button
                    type="button"
                    className="preset-chip"
                    onClick={() => handlePresetClick(Math.round((maxDebt / 2) * 100) / 100)}
                    disabled={submitting}
                  >
                    Half: ₹{formatINR(maxDebt / 2)}
                  </button>
                )}
              </div>

              {/* Dynamic Partial/Full Feedback Note */}
              {amount && validation.isValid && (
                <div
                  className={`remaining-debt-notice ${
                    validation.isPartial ? "notice-partial" : "notice-full"
                  }`}
                >
                  {validation.isPartial ? (
                    <>
                      <Info size={14} />
                      <span>
                        <strong>Partial Payment:</strong> ₹{formatINR(validation.remainingDebt)}{" "}
                        remaining debt will stay outstanding.
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      <span>
                        <strong>Full Settlement:</strong> This payment will completely clear all debt
                        between these members.
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Payment Notes */}
            <div className="form-field-group">
              <label htmlFor={`notes-input-${instanceId}`} className="field-label">
                Payment Notes <span className="field-hint">(optional)</span>
              </label>
              <input
                id={`notes-input-${instanceId}`}
                type="text"
                className="notes-input"
                placeholder="e.g. Paid via Google Pay ref #4928, Cash at dinner"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={200}
                disabled={submitting}
              />
            </div>

            {/* Offline Disclaimer Banner */}
            <div className="offline-disclaimer-box">
              <AlertCircle size={18} className="disclaimer-icon" />
              <div className="disclaimer-text">
                <strong>Offline Ledger Adjustment:</strong> Recording a settlement in SplitMate marks
                debts as resolved in your group balance. It does <strong>not</strong> initiate real
                banking or UPI money transfers.
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <Alert variant="error" className="modal-error-alert">
                {error}
              </Alert>
            )}
          </div>

          {/* Modal Actions */}
          <div className="modal-footer">
            <Button
              variant="secondary"
              type="button"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="mint"
              type="submit"
              icon={CheckCircle2}
              loading={submitting}
              disabled={submitting || !validation.isValid}
            >
              Confirm &amp; Record Payment
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function RecordSettlementModal({
  isOpen,
  onClose,
  transfer,
  groupId,
  groupName,
  onSettlementRecorded
}) {
  if (!isOpen || !transfer) return null;

  const key = `${transfer.fromUser?.id || transfer.from}-${transfer.toUser?.id || transfer.to}-${transfer.amount}`;

  return (
    <RecordSettlementDialogContent
      key={key}
      onClose={onClose}
      transfer={transfer}
      groupId={groupId}
      groupName={groupName}
      onSettlementRecorded={onSettlementRecorded}
    />
  );
}
