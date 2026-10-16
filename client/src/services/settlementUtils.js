/**
 * Settlement and Balance UI Utilities
 */

/**
 * Format monetary amount into localized INR string with 2 decimals
 * @param {number|string} val - Monetary value
 * @returns {string} Formatted string, e.g. "1,250.00"
 */
export function formatINR(val) {
  const num = Number(val) || 0;
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Determines balance status string: 'owed', 'owes', or 'settled'
 * @param {number} netBalancePaise
 * @returns {'owed'|'owes'|'settled'}
 */
export function getBalanceStatus(netBalancePaise) {
  if (netBalancePaise > 0) return "owed";
  if (netBalancePaise < 0) return "owes";
  return "settled";
}

/**
 * Classifies a transfer relative to the authenticated user
 * @param {object} transfer - Transfer object with from and to
 * @param {string} currentUserId - Authenticated user's ID
 * @returns {'You Pay'|'You Receive'|'Peer Transfer'}
 */
export function classifyTransfer(transfer, currentUserId) {
  if (!transfer || !currentUserId) return "Peer Transfer";

  const payerId = (
    transfer.fromUser?.id ||
    transfer.fromUser?._id ||
    transfer.payer ||
    (typeof transfer.from === "object" ? transfer.from?.id || transfer.from?._id : transfer.from)
  )?.toString();

  const recipientId = (
    transfer.toUser?.id ||
    transfer.toUser?._id ||
    transfer.recipient ||
    (typeof transfer.to === "object" ? transfer.to?.id || transfer.to?._id : transfer.to)
  )?.toString();

  if (payerId === currentUserId.toString()) return "You Pay";
  if (recipientId === currentUserId.toString()) return "You Receive";
  return "Peer Transfer";
}

/**
 * Resolves error title and explanation based on HTTP status code
 * @param {number} statusCode
 * @param {string} fallbackMessage
 * @returns {{ title: string, message: string, isWarning: boolean }}
 */
export function getSettlementErrorDetails(statusCode, fallbackMessage) {
  if (statusCode === 401) {
    return {
      title: "Authentication Required",
      message: "Your session has expired. Please sign in to view group settlements.",
      isWarning: false
    };
  }

  if (statusCode === 403) {
    return {
      title: "Access Denied",
      message: "You are not an authorized member of this group.",
      isWarning: false
    };
  }

  if (statusCode === 409) {
    return {
      title: "Concurrent Update Conflict",
      message:
        fallbackMessage ||
        "A concurrent settlement was processed by another member. Please refresh your balance and try again.",
      isWarning: true
    };
  }

  if (statusCode === 422) {
    return {
      title: "Expense Ledger Inconsistency",
      message:
        fallbackMessage ||
        "The expense records for this group contain inconsistencies and cannot be balanced.",
      isWarning: true
    };
  }

  return {
    title: "Calculation Failed",
    message: fallbackMessage || "Failed to calculate balances and settlements.",
    isWarning: false
  };
}

/**
 * Validates that loaded balance and settlement datasets strictly belong to the active group
 * to prevent showing stale balances when switching groups
 * @param {object|null} balancesData
 * @param {object|null} settlementsData
 * @param {string|null} selectedGroupId
 * @returns {boolean}
 */
export function isDataMatchingGroup(balancesData, settlementsData, selectedGroupId) {
  if (!balancesData || !settlementsData || !selectedGroupId) return false;

  const balGid = (balancesData.groupId || balancesData.group?.id || balancesData.group?._id)?.toString();
  const setGid = (settlementsData.groupId || settlementsData.group?.id || settlementsData.group?._id)?.toString();
  const targetGid = selectedGroupId.toString();

  return balGid === targetGid && setGid === targetGid;
}

/**
 * Resolves active group from a group list and optional requested groupId
 * @param {Array} groups
 * @param {string|null} requestedGroupId
 * @returns {object|null}
 */
export function resolveActiveGroup(groups, requestedGroupId) {
  if (!Array.isArray(groups) || groups.length === 0) return null;
  if (requestedGroupId) {
    const found = groups.find((g) => (g.id || g._id)?.toString() === requestedGroupId?.toString());
    if (found) return found;
  }
  return groups[0];
}

/**
 * Evaluates safe dashboard ledger presentation without cross-group netting
 * @param {Array} groups
 * @param {object|null} activeGroup
 * @param {object|null} groupBalanceData
 * @returns {object}
 */
export function evaluateDashboardLedgerState(groups, activeGroup, groupBalanceData) {
  if (!Array.isArray(groups) || groups.length === 0) {
    return {
      hasGroups: false,
      netBalanceFormatted: "₹0.00",
      youOweFormatted: "₹0.00",
      youAreOwedFormatted: "₹0.00",
      footerNote: "No active groups. Create or join a group."
    };
  }

  const currentUserBalance = groupBalanceData?.currentUserBalance;

  let netBalanceFormatted = "₹0.00";
  let youOweFormatted = "₹0.00";
  let youAreOwedFormatted = "₹0.00";
  let netBalancePaise = 0;

  if (currentUserBalance) {
    netBalancePaise = currentUserBalance.netBalancePaise || 0;
    if (netBalancePaise > 0) {
      netBalanceFormatted = `+₹${formatINR(currentUserBalance.netBalance)}`;
      youAreOwedFormatted = `₹${formatINR(currentUserBalance.netBalance)}`;
    } else if (netBalancePaise < 0) {
      netBalanceFormatted = `-₹${formatINR(Math.abs(currentUserBalance.netBalance))}`;
      youOweFormatted = `₹${formatINR(Math.abs(currentUserBalance.netBalance))}`;
    }
  }

  const isMultiGroup = groups.length > 1;
  const groupName = activeGroup?.name || groups[0]?.name || "Group";

  return {
    hasGroups: true,
    isMultiGroup,
    groupName,
    netBalancePaise,
    netBalanceFormatted,
    youOweFormatted,
    youAreOwedFormatted,
    footerNote: isMultiGroup
      ? `Ledger: ${groupName} (Multi-group: Open Settlements for all)`
      : `For ${groupName} • Real-time ledger`
  };
}

/**
 * Validates a settlement payment amount against maximum suggested debt
 * @param {number|string} amount - Proposed payment amount
 * @param {number} maxDebt - Maximum outstanding debt
 * @returns {{ isValid: boolean, error: string|null, remainingDebt: number, isPartial: boolean }}
 */
export function validateSettlementAmount(amount, maxDebt) {
  const num = Number(amount);
  const max = Number(maxDebt) || 0;

  if (isNaN(num) || num <= 0) {
    return {
      isValid: false,
      error: "Please enter a positive amount greater than ₹0.00",
      remainingDebt: max,
      isPartial: false
    };
  }

  // Round to 2 decimal places in paise
  const amountPaise = Math.round(num * 100);
  const maxPaise = Math.round(max * 100);

  if (amountPaise > maxPaise) {
    return {
      isValid: false,
      error: `Amount exceeds outstanding debt of ₹${formatINR(max)}`,
      remainingDebt: max,
      isPartial: false
    };
  }

  const remainingPaise = maxPaise - amountPaise;
  const remainingDebt = remainingPaise / 100;

  return {
    isValid: true,
    error: null,
    remainingDebt,
    isPartial: remainingPaise > 0
  };
}

/**
 * Formats a date string into readable Indian standard format (e.g. 16 Oct 2026, 04:30 PM)
 * @param {string|Date} dateVal
 * @returns {string}
 */
export function formatDateTime(dateVal) {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "";

  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

