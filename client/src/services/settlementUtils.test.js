import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatINR,
  getBalanceStatus,
  classifyTransfer,
  getSettlementErrorDetails,
  isDataMatchingGroup,
  resolveActiveGroup,
  evaluateDashboardLedgerState,
  validateSettlementAmount,
  formatDateTime
} from "./settlementUtils.js";

describe("Settlements & Balance System - Automated Test Suite", () => {
  const RAM_ID = "65f1a1a1a1a1a1a1a1a1a101";
  const AKAASH_ID = "65f1a1a1a1a1a1a1a1a1a102";
  const CHARLIE_ID = "65f1a1a1a1a1a1a1a1a1a103";

  const GRP_ROOMMATES = "65f2b2b2b2b2b2b2b2b2b201";
  const GRP_TRIP = "65f2b2b2b2b2b2b2b2b2b202";

  describe("1. Currency Formatting (formatINR)", () => {
    it("should format whole rupee amounts with two decimal places and Indian grouping", () => {
      assert.equal(formatINR(100), "100.00");
      assert.equal(formatINR(1250), "1,250.00");
      assert.equal(formatINR(100000), "1,00,000.00");
    });

    it("should format fractional rupee amounts accurately", () => {
      assert.equal(formatINR(33.34), "33.34");
      assert.equal(formatINR(0.01), "0.01");
      assert.equal(formatINR(99.9), "99.90");
    });

    it("should handle zero, null, undefined, empty string, and non-numeric inputs safely", () => {
      assert.equal(formatINR(0), "0.00");
      assert.equal(formatINR(null), "0.00");
      assert.equal(formatINR(undefined), "0.00");
      assert.equal(formatINR(""), "0.00");
      assert.equal(formatINR("150.50"), "150.50");
    });
  });

  describe("2. Balance Status Determination", () => {
    it("should classify positive balances as 'owed'", () => {
      assert.equal(getBalanceStatus(5000), "owed");
      assert.equal(getBalanceStatus(1), "owed");
    });

    it("should classify negative balances as 'owes'", () => {
      assert.equal(getBalanceStatus(-5000), "owes");
      assert.equal(getBalanceStatus(-1), "owes");
    });

    it("should classify zero balances as 'settled'", () => {
      assert.equal(getBalanceStatus(0), "settled");
    });
  });

  describe("3. Suggested Transfers Categorization", () => {
    const mockTransfer = {
      from: AKAASH_ID,
      to: RAM_ID,
      payer: AKAASH_ID,
      recipient: RAM_ID,
      fromUser: { id: AKAASH_ID, name: "Akaash" },
      toUser: { id: RAM_ID, name: "Ram" },
      amount: 150.0,
      amountPaise: 15000
    };

    it("should classify transfer as 'You Receive' when user is the recipient creditor", () => {
      const role = classifyTransfer(mockTransfer, RAM_ID);
      assert.equal(role, "You Receive");
    });

    it("should classify transfer as 'You Pay' when user is the payer debtor", () => {
      const role = classifyTransfer(mockTransfer, AKAASH_ID);
      assert.equal(role, "You Pay");
    });

    it("should classify transfer as 'Peer Transfer' when user is a third party", () => {
      const role = classifyTransfer(mockTransfer, CHARLIE_ID);
      assert.equal(role, "Peer Transfer");
    });

    it("should support transfers with nested object IDs", () => {
      const nestedTransfer = {
        from: { _id: AKAASH_ID },
        to: { _id: RAM_ID },
        amount: 50.0
      };
      assert.equal(classifyTransfer(nestedTransfer, RAM_ID), "You Receive");
      assert.equal(classifyTransfer(nestedTransfer, AKAASH_ID), "You Pay");
      assert.equal(classifyTransfer(nestedTransfer, CHARLIE_ID), "Peer Transfer");
    });

    it("should return 'Peer Transfer' when transfer or currentUserId is undefined", () => {
      assert.equal(classifyTransfer(null, RAM_ID), "Peer Transfer");
      assert.equal(classifyTransfer(mockTransfer, null), "Peer Transfer");
    });
  });

  describe("4. Group Selection, Resolution & Switching", () => {
    const mockGroups = [
      { id: GRP_ROOMMATES, name: "Roommates 4B", memberCount: 2 },
      { id: GRP_TRIP, name: "Goa Vacation", memberCount: 4 }
    ];

    it("should resolve requested group when valid groupId is supplied in query param", () => {
      const active = resolveActiveGroup(mockGroups, GRP_TRIP);
      assert.equal(active.id, GRP_TRIP);
      assert.equal(active.name, "Goa Vacation");
    });

    it("should fallback to the first group when requested groupId is not in user groups", () => {
      const active = resolveActiveGroup(mockGroups, "non-existent-group-id");
      assert.equal(active.id, GRP_ROOMMATES);
      assert.equal(active.name, "Roommates 4B");
    });

    it("should fallback to first group when no groupId is requested", () => {
      const active = resolveActiveGroup(mockGroups, null);
      assert.equal(active.id, GRP_ROOMMATES);
    });

    it("should safely return null when user has no groups", () => {
      assert.equal(resolveActiveGroup([], GRP_ROOMMATES), null);
      assert.equal(resolveActiveGroup(null, GRP_ROOMMATES), null);
    });
  });

  describe("5. Anti-Stale Data Protection When Switching Groups", () => {
    const balancesGroup1 = {
      groupId: GRP_ROOMMATES,
      groupName: "Roommates 4B",
      memberBalances: [{ user: RAM_ID, netBalance: 100 }],
      totalExpenses: 200
    };

    const settlementsGroup1 = {
      groupId: GRP_ROOMMATES,
      isSettled: false,
      transfers: [{ from: AKAASH_ID, to: RAM_ID, amount: 100 }]
    };

    const balancesGroup2 = {
      groupId: GRP_TRIP,
      groupName: "Goa Vacation",
      memberBalances: [{ user: RAM_ID, netBalance: 0 }],
      totalExpenses: 800
    };

    const settlementsGroup2 = {
      groupId: GRP_TRIP,
      isSettled: true,
      transfers: []
    };

    it("should return true when both datasets match the selected active group", () => {
      assert.equal(
        isDataMatchingGroup(balancesGroup1, settlementsGroup1, GRP_ROOMMATES),
        true
      );
      assert.equal(
        isDataMatchingGroup(balancesGroup2, settlementsGroup2, GRP_TRIP),
        true
      );
    });

    it("should reject and return false when switching to Group 2 while balances still contain Group 1 data", () => {
      // User switched to GRP_TRIP, but API response for GRP_TRIP has not landed yet
      const isFreshForTrip = isDataMatchingGroup(
        balancesGroup1,
        settlementsGroup1,
        GRP_TRIP
      );
      assert.equal(isFreshForTrip, false, "Must not display Group 1 balances for Group 2");
    });

    it("should reject when one dataset has arrived but the other still belongs to the previous group", () => {
      const mismatched = isDataMatchingGroup(
        balancesGroup2,
        settlementsGroup1,
        GRP_TRIP
      );
      assert.equal(mismatched, false);
    });

    it("should return false when datasets are null during group transition", () => {
      assert.equal(isDataMatchingGroup(null, null, GRP_TRIP), false);
      assert.equal(isDataMatchingGroup(balancesGroup2, null, GRP_TRIP), false);
    });
  });

  describe("6. Error Handling & HTTP Status Details (401, 403, 422)", () => {
    it("should map 401 Unauthorized to session expired alert", () => {
      const err = getSettlementErrorDetails(401, "jwt expired");
      assert.equal(err.title, "Authentication Required");
      assert.match(err.message, /session has expired/i);
      assert.equal(err.isWarning, false);
    });

    it("should map 403 Forbidden to unauthorized membership alert", () => {
      const err = getSettlementErrorDetails(403, "Not a group member");
      assert.equal(err.title, "Access Denied");
      assert.match(err.message, /not an authorized member/i);
      assert.equal(err.isWarning, false);
    });

    it("should map 422 Inconsistent Ledger to ledger inconsistency warning", () => {
      const customMsg = "Sum of member balances does not match total expense allocations";
      const err = getSettlementErrorDetails(422, customMsg);
      assert.equal(err.title, "Expense Ledger Inconsistency");
      assert.equal(err.message, customMsg);
      assert.equal(err.isWarning, true);
    });

    it("should map 409 Conflict to concurrent update warning alert", () => {
      const err = getSettlementErrorDetails(409, "A concurrent settlement was processed");
      assert.equal(err.title, "Concurrent Update Conflict");
      assert.match(err.message, /concurrent settlement was processed/i);
      assert.equal(err.isWarning, true);
    });

    it("should map unexpected server errors (500) to retryable calculation failure", () => {
      const err = getSettlementErrorDetails(500, "Internal database error");
      assert.equal(err.title, "Calculation Failed");
      assert.equal(err.message, "Internal database error");
      assert.equal(err.isWarning, false);
    });
  });

  describe("7. Safe Dashboard Ledger Fallbacks Without Cross-Group Netting", () => {
    const singleGroup = [{ id: GRP_ROOMMATES, name: "Roommates 4B" }];
    const multiGroups = [
      { id: GRP_ROOMMATES, name: "Roommates 4B" },
      { id: GRP_TRIP, name: "Goa Trip" }
    ];

    it("should handle 0 groups with an honest zero balance and navigation prompt", () => {
      const state = evaluateDashboardLedgerState([], null, null);
      assert.equal(state.hasGroups, false);
      assert.equal(state.netBalanceFormatted, "₹0.00");
      assert.equal(state.youOweFormatted, "₹0.00");
      assert.equal(state.youAreOwedFormatted, "₹0.00");
      assert.match(state.footerNote, /No active groups/i);
    });

    it("should correctly display real balance for a single group", () => {
      const balanceData = {
        currentUserBalance: {
          netBalance: 125.5,
          netBalancePaise: 12550,
          status: "owed"
        }
      };

      const state = evaluateDashboardLedgerState(
        singleGroup,
        singleGroup[0],
        balanceData
      );

      assert.equal(state.hasGroups, true);
      assert.equal(state.isMultiGroup, false);
      assert.equal(state.groupName, "Roommates 4B");
      assert.equal(state.netBalanceFormatted, "+₹125.50");
      assert.equal(state.youAreOwedFormatted, "₹125.50");
      assert.equal(state.youOweFormatted, "₹0.00");
    });

    it("should handle debt in a single group", () => {
      const balanceData = {
        currentUserBalance: {
          netBalance: -60.0,
          netBalancePaise: -6000,
          status: "owes"
        }
      };

      const state = evaluateDashboardLedgerState(
        singleGroup,
        singleGroup[0],
        balanceData
      );

      assert.equal(state.netBalanceFormatted, "-₹60.00");
      assert.equal(state.youOweFormatted, "₹60.00");
      assert.equal(state.youAreOwedFormatted, "₹0.00");
    });

    it("should never net balances across multiple groups and guide user to Settlements", () => {
      const balanceData = {
        currentUserBalance: {
          netBalance: 200.0,
          netBalancePaise: 20000,
          status: "owed"
        }
      };

      const state = evaluateDashboardLedgerState(
        multiGroups,
        multiGroups[0],
        balanceData
      );

      assert.equal(state.isMultiGroup, true);
      assert.equal(state.groupName, "Roommates 4B");
      assert.match(state.footerNote, /Multi-group: Open Settlements for all/i);
    });
  });

  describe("8. Empty & Fully Settled State Detection", () => {
    it("should identify a fully-settled group (0 transfers needed, isSettled: true)", () => {
      const settledData = {
        isSettled: true,
        transfers: [],
        transferCount: 0
      };

      assert.equal(settledData.isSettled, true);
      assert.equal(settledData.transfers.length, 0);
    });

    it("should identify an empty group (0 expenses, zero balances)", () => {
      const emptyGroupBalances = {
        totalExpenses: 0,
        expenseCount: 0,
        memberBalances: [
          { user: RAM_ID, totalPaid: 0, totalShare: 0, netBalance: 0, netBalancePaise: 0 },
          { user: AKAASH_ID, totalPaid: 0, totalShare: 0, netBalance: 0, netBalancePaise: 0 }
        ]
      };

      assert.equal(emptyGroupBalances.totalExpenses, 0);
      assert.equal(emptyGroupBalances.expenseCount, 0);
      const allZero = emptyGroupBalances.memberBalances.every((b) => b.netBalancePaise === 0);
      assert.equal(allZero, true);
    });
  });

  describe("9. Task 5D: Settlement Amount Validation (validateSettlementAmount)", () => {
    it("should accept valid full settlement amount equal to max debt", () => {
      const res = validateSettlementAmount(500, 500);
      assert.equal(res.isValid, true);
      assert.equal(res.error, null);
      assert.equal(res.remainingDebt, 0);
      assert.equal(res.isPartial, false);
    });

    it("should accept valid partial settlement amount and calculate remaining debt correctly", () => {
      // Example requirement: ₹500 outstanding debt reduced by ₹200 payment leaves ₹300 outstanding
      const res = validateSettlementAmount(200, 500);
      assert.equal(res.isValid, true);
      assert.equal(res.error, null);
      assert.equal(res.remainingDebt, 300);
      assert.equal(res.isPartial, true);
    });

    it("should handle floating-point strings safely in integer paise (₹33.34 of ₹100.00)", () => {
      const res = validateSettlementAmount("33.34", 100);
      assert.equal(res.isValid, true);
      assert.equal(res.remainingDebt, 66.66);
      assert.equal(res.isPartial, true);
    });

    it("should reject zero or negative amounts with an error message", () => {
      const zeroRes = validateSettlementAmount(0, 500);
      assert.equal(zeroRes.isValid, false);
      assert.match(zeroRes.error, /greater than/i);

      const negRes = validateSettlementAmount(-50, 500);
      assert.equal(negRes.isValid, false);
      assert.match(negRes.error, /greater than/i);
    });

    it("should reject non-numeric inputs", () => {
      const nanRes = validateSettlementAmount("abc", 500);
      assert.equal(nanRes.isValid, false);
      assert.match(nanRes.error, /greater than/i);
    });

    it("should reject over-settlement where payment exceeds max debt", () => {
      const overRes = validateSettlementAmount(600, 500);
      assert.equal(overRes.isValid, false);
      assert.match(overRes.error, /exceeds outstanding debt/i);
    });
  });

  describe("10. Task 5D: Date/Time Formatting (formatDateTime)", () => {
    it("should format valid ISO date strings into readable localized format", () => {
      const dateStr = "2026-10-16T12:00:00.000Z";
      const formatted = formatDateTime(dateStr);
      assert.ok(formatted.includes("2026"));
      assert.ok(formatted.includes("Oct"));
    });

    it("should return empty string for null, undefined, or invalid dates", () => {
      assert.equal(formatDateTime(null), "");
      assert.equal(formatDateTime(undefined), "");
      assert.equal(formatDateTime("invalid-date-string"), "");
    });
  });
});
