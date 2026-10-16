/**
 * Pure, deterministic balance calculation and debt simplification engine for SplitMate.
 *
 * Implements:
 * 1. Net balance aggregation across group expenses using integer minor units (paise).
 * 2. Strict zero-sum validation and data consistency enforcement.
 * 3. Deterministic debt simplification minimizing payment transfers.
 *
 * Free from database or HTTP/Express dependencies.
 */

const { toPaise, fromPaise, getParticipantId } = require("./expenseSplits");

/**
 * Validates that a value is a finite integer representing paise.
 *
 * @param {any} val - Value to validate
 * @param {string} [context="Amount"] - Context for error message
 * @returns {number} Validated integer paise
 */
function validateIntegerPaise(val, context = "Amount") {
  if (typeof val !== "number" || !Number.isFinite(val) || !Number.isInteger(val)) {
    throw new Error(`Invalid ${context}: expected integer paise, received ${val}`);
  }
  return val;
}

/**
 * Calculates net balances for all members across an array of expenses.
 *
 * For every expense:
 * - Credits payer with the total amount paid.
 * - Debits each participant with their allocated share.
 * - Net balance = total paid − total allocated share.
 *
 * Enforces:
 * - All calculations in integer paise.
 * - Every expense's splits must sum strictly to the expense amount.
 * - Overall member balances must sum strictly to zero.
 *
 * @param {Array<object>} expenses - Array of expense objects
 * @param {object} [options]
 * @param {Array<string|object>} [options.members] - Optional group member list to initialize 0-balance members
 * @returns {object} Result containing totalExpenses, balances map, and detailed memberBalances array
 */
function calculateNetBalances(expenses, options = {}) {
  if (!Array.isArray(expenses)) {
    throw new Error("Invalid expenses: expected an array of expense records");
  }

  const paidMap = new Map();
  const shareMap = new Map();
  const allUserIds = new Set();

  // If group members are provided, ensure all members are registered (even with 0 activity)
  if (options.members) {
    if (!Array.isArray(options.members)) {
      throw new Error("Invalid members option: expected an array of member identifiers");
    }
    for (const m of options.members) {
      const uid = getParticipantId(m);
      allUserIds.add(uid);
      if (!paidMap.has(uid)) paidMap.set(uid, 0);
      if (!shareMap.has(uid)) shareMap.set(uid, 0);
    }
  }

  let totalExpensesPaise = 0;

  // Process each expense
  for (let i = 0; i < expenses.length; i++) {
    const exp = expenses[i];
    if (!exp || typeof exp !== "object") {
      throw new Error(`Invalid expense at index ${i}: expense must be an object`);
    }

    // Amount validation
    if (exp.amount === undefined && exp.amountPaise === undefined) {
      throw new Error(`Invalid expense at index ${i}: amount is required`);
    }

    let expenseAmountPaise;
    if (exp.amountPaise !== undefined) {
      expenseAmountPaise = validateIntegerPaise(exp.amountPaise, `Expense at index ${i}`);
      if (exp.amount !== undefined) {
        const converted = toPaise(exp.amount);
        if (converted !== expenseAmountPaise) {
          throw new Error(
            `Inconsistent expense data at index ${i}: amount (${exp.amount}) does not match amountPaise (${exp.amountPaise})`
          );
        }
      }
    } else {
      expenseAmountPaise = toPaise(exp.amount);
    }

    if (expenseAmountPaise <= 0) {
      throw new Error(
        `Invalid expense at index ${i}: amount must be positive, received ${expenseAmountPaise} paise`
      );
    }

    totalExpensesPaise += expenseAmountPaise;

    // Payer validation
    if (!exp.paidBy) {
      throw new Error(`Invalid expense at index ${i}: paidBy is required`);
    }
    const payerId = getParticipantId(exp.paidBy);
    allUserIds.add(payerId);

    // Splits validation
    if (!Array.isArray(exp.splits) || exp.splits.length === 0) {
      throw new Error(`Invalid expense at index ${i}: splits array is required and must not be empty`);
    }

    let splitTotalPaise = 0;
    const expenseParticipants = new Set();

    for (let j = 0; j < exp.splits.length; j++) {
      const s = exp.splits[j];
      if (!s || typeof s !== "object") {
        throw new Error(`Invalid split at index ${j} in expense ${i}: split allocation must be an object`);
      }

      const participantId = getParticipantId(s.user || s);
      if (expenseParticipants.has(participantId)) {
        throw new Error(
          `Invalid expense at index ${i}: duplicate participant "${participantId}" in split allocations`
        );
      }
      expenseParticipants.add(participantId);
      allUserIds.add(participantId);

      let allocatedPaise;
      if (s.amountPaise !== undefined) {
        allocatedPaise = validateIntegerPaise(s.amountPaise, `Split at index ${j}`);
        if (s.amount !== undefined) {
          const converted = toPaise(s.amount, { allowZero: true });
          if (converted !== allocatedPaise) {
            throw new Error(
              `Inconsistent split data at index ${j} in expense ${i}: amount (${s.amount}) does not match amountPaise (${s.amountPaise})`
            );
          }
        }
      } else if (s.amount !== undefined) {
        allocatedPaise = toPaise(s.amount, { allowZero: true });
      } else {
        throw new Error(
          `Invalid split at index ${j} in expense ${i}: allocation amount is required`
        );
      }

      if (allocatedPaise < 0) {
        throw new Error(
          `Invalid split allocation for participant "${participantId}" in expense ${i}: cannot be negative`
        );
      }

      splitTotalPaise += allocatedPaise;

      // Debit participant by allocated share
      shareMap.set(participantId, (shareMap.get(participantId) || 0) + allocatedPaise);
    }

    // Consistency check: Sum of splits must strictly equal total expense amount
    if (splitTotalPaise !== expenseAmountPaise) {
      throw new Error(
        `Inconsistent expense data at index ${i}: sum of split allocations (${splitTotalPaise} paise) does not match total expense amount (${expenseAmountPaise} paise)`
      );
    }

    // Credit payer with full amount paid
    paidMap.set(payerId, (paidMap.get(payerId) || 0) + expenseAmountPaise);
  }

  // Process completed settlements (direct reimbursements between members)
  const settledPaidMap = new Map();
  const settledReceivedMap = new Map();
  let totalSettlementsPaise = 0;

  if (options.settlements) {
    if (!Array.isArray(options.settlements)) {
      throw new Error("Invalid settlements option: expected an array of settlement records");
    }
    for (let k = 0; k < options.settlements.length; k++) {
      const st = options.settlements[k];
      if (!st || typeof st !== "object") {
        throw new Error(`Invalid settlement at index ${k}: settlement must be an object`);
      }
      if (st.status === "cancelled") continue;

      const payerId = getParticipantId(st.payer || st.from || st.paidBy);
      const receiverId = getParticipantId(st.receiver || st.to || st.receivedBy);

      if (!payerId || !receiverId) {
        throw new Error(`Invalid settlement at index ${k}: payer and receiver are required`);
      }
      if (payerId === receiverId) {
        throw new Error(`Invalid settlement at index ${k}: payer and receiver cannot be the same member`);
      }

      let settlementAmountPaise;
      if (st.amountPaise !== undefined) {
        settlementAmountPaise = validateIntegerPaise(st.amountPaise, `Settlement at index ${k}`);
      } else if (st.amount !== undefined) {
        settlementAmountPaise = toPaise(st.amount);
      } else {
        throw new Error(`Invalid settlement at index ${k}: amount is required`);
      }

      if (settlementAmountPaise <= 0) {
        throw new Error(
          `Invalid settlement at index ${k}: amount must be positive, received ${settlementAmountPaise} paise`
        );
      }

      totalSettlementsPaise += settlementAmountPaise;
      allUserIds.add(payerId);
      allUserIds.add(receiverId);

      // Payer transferred money -> credits payer's group balance (reduces debt)
      settledPaidMap.set(payerId, (settledPaidMap.get(payerId) || 0) + settlementAmountPaise);

      // Receiver received money -> debits receiver's group balance (reduces credit)
      settledReceivedMap.set(receiverId, (settledReceivedMap.get(receiverId) || 0) + settlementAmountPaise);
    }
  }

  // Compute final net balances and verify zero-sum invariant
  const balances = {};
  const memberBalances = [];
  let zeroSumCheck = 0;

  for (const uid of allUserIds) {
    const totalPaidPaise = paidMap.get(uid) || 0;
    const totalSharePaise = shareMap.get(uid) || 0;
    const settledPaidPaise = settledPaidMap.get(uid) || 0;
    const settledReceivedPaise = settledReceivedMap.get(uid) || 0;

    // Net balance = (Expense Paid - Expense Share) + (Settlement Paid - Settlement Received)
    const netBalancePaise =
      totalPaidPaise - totalSharePaise + (settledPaidPaise - settledReceivedPaise);

    balances[uid] = netBalancePaise;
    zeroSumCheck += netBalancePaise;

    const memberObj = {
      user: uid,
      netBalance: fromPaise(netBalancePaise),
      netBalancePaise,
      totalPaid: fromPaise(totalPaidPaise),
      totalPaidPaise,
      totalShare: fromPaise(totalSharePaise),
      totalSharePaise
    };

    if (options.settlements) {
      memberObj.settledPaid = fromPaise(settledPaidPaise);
      memberObj.settledPaidPaise = settledPaidPaise;
      memberObj.settledReceived = fromPaise(settledReceivedPaise);
      memberObj.settledReceivedPaise = settledReceivedPaise;
    }

    memberBalances.push(memberObj);
  }

  // Sort memberBalances deterministically by user ID
  memberBalances.sort((a, b) => a.user.localeCompare(b.user));

  if (zeroSumCheck !== 0) {
    throw new Error(
      `Inconsistent balance calculation: sum of all member balances is ${zeroSumCheck} paise, expected 0`
    );
  }

  const result = {
    totalExpenses: fromPaise(totalExpensesPaise),
    totalExpensesPaise,
    balances,
    memberBalances
  };

  if (options.settlements) {
    result.totalSettlements = fromPaise(totalSettlementsPaise);
    result.totalSettlementsPaise = totalSettlementsPaise;
    result.settlementCount = Array.isArray(options.settlements)
      ? options.settlements.filter((s) => s.status !== "cancelled").length
      : 0;
  }

  return result;
}

/**
 * Deterministically simplifies debts from net balances into a minimal set of transfers.
 *
 * Algorithm:
 * 1. Categorize members into Debtors (netBalance < 0) and Creditors (netBalance > 0).
 * 2. Deterministically sort debtors and creditors by amount descending, then by userId ascending.
 * 3. Pass 1 (Exact Match): Settle exact 1-to-1 matches where debtor amount === creditor amount.
 * 4. Pass 2 (Greedy Settlement): Pair the largest debtor with the largest creditor until all balances are zero.
 * 5. Verify that all transfers are positive and strictly settle all balances.
 *
 * @param {object|Array} netBalancesInput - Net balances map { [userId]: balancePaise } or result from calculateNetBalances
 * @returns {Array<object>} Array of suggested transfers { from, to, amount, amountPaise }
 */
function simplifyDebts(netBalancesInput) {
  if (!netBalancesInput || typeof netBalancesInput !== "object") {
    throw new Error("Invalid net balances input: expected an object or array");
  }

  let balancesMap;

  if (Array.isArray(netBalancesInput)) {
    // Array of { user, netBalancePaise } or { user, netBalance }
    balancesMap = {};
    for (const item of netBalancesInput) {
      if (!item || typeof item !== "object") {
        throw new Error("Invalid balance item in array: expected object with user and netBalance");
      }
      const uid = getParticipantId(item.user || item);
      let paise;
      if (item.netBalancePaise !== undefined) {
        paise = validateIntegerPaise(item.netBalancePaise, `netBalancePaise for ${uid}`);
      } else if (item.netBalance !== undefined) {
        paise =
          toPaise(Math.abs(item.netBalance), { allowZero: true }) *
          (item.netBalance < 0 ? -1 : 1);
      } else {
        throw new Error(`Missing balance amount for user "${uid}"`);
      }
      balancesMap[uid] = (balancesMap[uid] || 0) + paise;
    }
  } else if (netBalancesInput.balances && typeof netBalancesInput.balances === "object") {
    // Direct result object from calculateNetBalances
    balancesMap = { ...netBalancesInput.balances };
  } else {
    // Plain map of { [userId]: balancePaise }
    balancesMap = { ...netBalancesInput };
  }

  // Validate zero-sum invariant
  let sumPaise = 0;
  const debtors = [];
  const creditors = [];

  for (const [userId, rawBalance] of Object.entries(balancesMap)) {
    const balancePaise = validateIntegerPaise(rawBalance, `Balance for "${userId}"`);
    sumPaise += balancePaise;

    if (balancePaise < 0) {
      debtors.push({ user: userId, amountPaise: -balancePaise });
    } else if (balancePaise > 0) {
      creditors.push({ user: userId, amountPaise: balancePaise });
    }
  }

  if (sumPaise !== 0) {
    throw new Error(
      `Inconsistent balance data for debt simplification: net balances sum to ${sumPaise} paise, expected 0`
    );
  }

  // If all balances are zero, no transfers needed
  if (debtors.length === 0 || creditors.length === 0) {
    return [];
  }

  // Deterministic sorting comparator:
  // Primary: Amount descending
  // Secondary: User ID ascending (alphabetical tie-breaker)
  const sortComparator = (a, b) => {
    if (b.amountPaise !== a.amountPaise) {
      return b.amountPaise - a.amountPaise;
    }
    return a.user.localeCompare(b.user);
  };

  debtors.sort(sortComparator);
  creditors.sort(sortComparator);

  const transfers = [];

  // Pass 1: Exact matches optimization
  // Pairs exact 1-to-1 matches first to reduce overall transfer count
  for (let i = 0; i < debtors.length; i++) {
    const d = debtors[i];
    if (d.amountPaise === 0) continue;

    const matchIndex = creditors.findIndex((c) => c.amountPaise === d.amountPaise);
    if (matchIndex !== -1) {
      const c = creditors[matchIndex];
      transfers.push({
        from: d.user,
        to: c.user,
        payer: d.user,
        recipient: c.user,
        amount: fromPaise(d.amountPaise),
        amountPaise: d.amountPaise
      });
      d.amountPaise = 0;
      c.amountPaise = 0;
    }
  }

  // Filter out fully settled participants from Pass 1
  const remainingDebtors = debtors.filter((d) => d.amountPaise > 0).sort(sortComparator);
  const remainingCreditors = creditors.filter((c) => c.amountPaise > 0).sort(sortComparator);

  // Pass 2: Greedy largest-first match for remaining debts
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < remainingDebtors.length && cIdx < remainingCreditors.length) {
    const debtor = remainingDebtors[dIdx];
    const creditor = remainingCreditors[cIdx];

    const transferAmountPaise = Math.min(debtor.amountPaise, creditor.amountPaise);

    if (transferAmountPaise > 0) {
      transfers.push({
        from: debtor.user,
        to: creditor.user,
        payer: debtor.user,
        recipient: creditor.user,
        amount: fromPaise(transferAmountPaise),
        amountPaise: transferAmountPaise
      });

      debtor.amountPaise -= transferAmountPaise;
      creditor.amountPaise -= transferAmountPaise;
    }

    if (debtor.amountPaise === 0) dIdx++;
    if (creditor.amountPaise === 0) cIdx++;
  }

  // Verification: ensure all balances were fully cleared to 0
  for (const d of remainingDebtors) {
    if (d.amountPaise !== 0) {
      throw new Error(`Debt simplification failure: unallocated debtor balance for "${d.user}"`);
    }
  }
  for (const c of remainingCreditors) {
    if (c.amountPaise !== 0) {
      throw new Error(`Debt simplification failure: unallocated creditor balance for "${c.user}"`);
    }
  }

  for (const t of transfers) {
    if (!t.amountPaise || t.amountPaise <= 0) {
      throw new Error("Debt simplification failure: non-positive transfer generated");
    }
  }

  // Sort transfers deterministically: by from user ascending, then to user ascending, then amount descending
  transfers.sort((a, b) => {
    const fromComp = a.from.localeCompare(b.from);
    if (fromComp !== 0) return fromComp;
    const toComp = a.to.localeCompare(b.to);
    if (toComp !== 0) return toComp;
    return b.amountPaise - a.amountPaise;
  });

  return transfers;
}

/**
 * High-level pipeline function calculating both net balances and simplified debt transfers.
 *
 * @param {Array<object>} expenses - Array of expense objects
 * @param {object} [options]
 * @param {Array<string|object>} [options.members] - Optional group member list
 * @returns {object} Combined net balances and suggested transfers
 */
function calculateSettlements(expenses, options = {}) {
  const netBalancesResult = calculateNetBalances(expenses, options);
  const transfers = simplifyDebts(netBalancesResult.balances);

  return {
    ...netBalancesResult,
    transfers
  };
}

module.exports = {
  validateIntegerPaise,
  calculateNetBalances,
  simplifyDebts,
  calculateSettlements
};
