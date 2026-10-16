import { Users, Wallet, Split } from "lucide-react";
import { formatINR } from "../../services/analyticsUtils";

/**
 * Compact breakdown card displaying member spending contributions and liability shares
 */
export function MemberSpendingBreakdown({ memberSpending = [], totalSpent = 0, currentUserId = null }) {
  if (!Array.isArray(memberSpending) || memberSpending.length === 0 || totalSpent <= 0) {
    return null;
  }

  return (
    <div className="member-spending-card">
      <div className="member-spending-header">
        <div className="header-icon-wrap">
          <Users size={18} />
        </div>
        <div className="header-info">
          <h3 className="section-title">Member Spending Comparison</h3>
          <p className="section-subtitle">
            Upfront payments versus allocated debt shares across group participants.
          </p>
        </div>
      </div>

      <div className="member-spending-list" role="list">
        {memberSpending.map((item) => {
          const isCurrentUser =
            currentUserId &&
            (item.user?.id === currentUserId || item.user?._id === currentUserId);
          const userName = item.user?.name || "Member";
          const percentage = item.percentageOfTotal || 0;

          return (
            <div
              key={item.user?.id || item.user?._id || userName}
              className={`member-spending-row ${isCurrentUser ? "is-current-user" : ""}`}
              role="listitem"
            >
              <div className="member-user-cell">
                <div className="member-avatar-badge">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <div className="member-names">
                  <span className="member-name-text">
                    {userName} {isCurrentUser && <span className="you-tag">(You)</span>}
                  </span>
                  <div className="member-progress-track">
                    <div
                      className="member-progress-fill"
                      style={{ width: `${Math.min(100, Math.max(2, percentage))}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="member-metrics-cell">
                <div className="metric-pill pill-paid" title="Amount paid upfront">
                  <Wallet size={13} />
                  <span>Paid: ₹{formatINR(item.totalPaid)}</span>
                </div>
                <div className="metric-pill pill-share" title="Allocated share of expenses">
                  <Split size={13} />
                  <span>Share: ₹{formatINR(item.totalShare)}</span>
                </div>
                <span className="member-pct-text">{percentage}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
