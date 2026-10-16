/**
 * Pure helper utility functions for Friends & Ledgers:
 * - Deriving distinct friends from user group memberships (excluding current user)
 * - Mapping shared groups and co-member details
 * - Inspecting group-grounded balances, actionable transfers, and transaction histories
 * - Preserving integer-paise arithmetic and excluding cancelled settlements
 * - Avoiding fabricated bilateral debts when only group-level balances exist
 */

import { toIdString } from "./dashboardUtils.js";

/**
 * Derives unique friends from the user's groups, excluding the authenticated user.
 * Deduplicates friends who share multiple groups.
 *
 * @param {Array<object>} groups - Array of group documents
 * @param {string|object} currentUserIdOrUser - Current user ID or object
 * @returns {Array<object>} Sorted array of unique friend profiles with shared group references
 */
export function extractFriendsFromGroups(groups, currentUserIdOrUser) {
  if (!Array.isArray(groups)) return [];
  const currentUserId = toIdString(currentUserIdOrUser);

  const friendsMap = new Map();

  for (const group of groups) {
    if (!group || !Array.isArray(group.members)) continue;

    const groupId = toIdString(group.id || group._id);
    const groupName = group.name || "Unnamed Group";
    const groupCategory = group.category || "General";

    for (const member of group.members) {
      if (!member) continue;

      const userObj = member.user || member;
      const memberId = toIdString(userObj);

      // Skip current user or invalid IDs
      if (!memberId || memberId === currentUserId) continue;

      if (!friendsMap.has(memberId)) {
        friendsMap.set(memberId, {
          id: memberId,
          name: userObj.name || member.name || "SplitMate Friend",
          email: userObj.email || member.email || "",
          avatar: userObj.avatar || member.avatar || "",
          sharedGroups: []
        });
      } else {
        // Enrich profile if another group has better user data (e.g. name / email)
        const existing = friendsMap.get(memberId);
        if (existing.name === "SplitMate Friend" && (userObj.name || member.name)) {
          existing.name = userObj.name || member.name;
        }
        if (!existing.email && (userObj.email || member.email)) {
          existing.email = userObj.email || member.email;
        }
        if (!existing.avatar && (userObj.avatar || member.avatar)) {
          existing.avatar = userObj.avatar || member.avatar;
        }
      }

      // Add shared group if not already added
      const friendEntry = friendsMap.get(memberId);
      if (!friendEntry.sharedGroups.some((sg) => sg.id === groupId)) {
        friendEntry.sharedGroups.push({
          id: groupId,
          name: groupName,
          category: groupCategory,
          role: member.role || "member"
        });
      }
    }
  }

  // Return friends sorted alphabetically by name
  return Array.from(friendsMap.values()).sort((a, b) =>
    (a.name || "").localeCompare(b.name || "")
  );
}

/**
 * Evaluates the relationship between the authenticated user and a friend within a single group.
 * Grounded strictly in the group's real balance engine results and settlement records.
 *
 * @param {object} params
 * @param {string} params.friendId - Friend's user ID
 * @param {object} params.group - Group document
 * @param {object} [params.balancesData] - Result from /api/v1/groups/:groupId/balances
 * @param {object} [params.settlementSuggestionsData] - Result from /api/v1/groups/:groupId/settlement-suggestions
 * @param {Array<object>} [params.settlements] - Settlements array from /api/v1/groups/:groupId/settlements
 * @param {Array<object>} [params.expenses] - Expenses array from /api/v1/groups/:groupId/expenses
 * @param {string} params.currentUserId - Authenticated user's ID
 * @returns {object} Relationship breakdown within this group
 */
export function computeFriendGroupRelationship({
  friendId,
  group,
  balancesData,
  settlementSuggestionsData,
  settlements = [],
  expenses = [],
  currentUserId
}) {
  const fId = toIdString(friendId);
  const uId = toIdString(currentUserId);
  const groupId = toIdString(group?.id || group?._id);
  const groupName = group?.name || "Group";
  const groupCategory = group?.category || "General";

  // 1. Identify actionable direct suggested transfers between current user and this friend
  const transfers = Array.isArray(settlementSuggestionsData?.transfers)
    ? settlementSuggestionsData.transfers
    : [];

  let directTransfer = null;
  let transferType = "none"; // 'you_pay' | 'you_receive' | 'none'

  for (const t of transfers) {
    const payerId = toIdString(
      t.fromUser?.id || t.fromUser?._id || t.payer || t.from
    );
    const recipientId = toIdString(
      t.toUser?.id || t.toUser?._id || t.recipient || t.to
    );

    if (payerId === uId && recipientId === fId) {
      directTransfer = t;
      transferType = "you_pay";
      break;
    } else if (payerId === fId && recipientId === uId) {
      directTransfer = t;
      transferType = "you_receive";
      break;
    }
  }

  // 2. Extract group member positions from balances data
  const memberBalances = Array.isArray(balancesData?.memberBalances)
    ? balancesData.memberBalances
    : [];

  const userBalanceObj = memberBalances.find((m) => toIdString(m.user?.id || m.user?._id || m.user) === uId);
  const friendBalanceObj = memberBalances.find((m) => toIdString(m.user?.id || m.user?._id || m.user) === fId);

  const userNetPaise = userBalanceObj?.netBalancePaise || 0;
  const friendNetPaise = friendBalanceObj?.netBalancePaise || 0;

  // 3. Filter completed settlements between current user and friend in this group
  // Strictly exclude cancelled settlements and third-party settlements
  const relevantSettlements = (Array.isArray(settlements) ? settlements : [])
    .filter((s) => {
      if (!s || s.status === "cancelled") return false;
      const p = toIdString(s.payer?._id || s.payer?.id || s.payer);
      const r = toIdString(s.receiver?._id || s.receiver?.id || s.receiver);
      return (p === uId && r === fId) || (p === fId && r === uId);
    })
    .map((s) => ({
      ...s,
      groupId,
      groupName
    }));

  // 4. Filter shared expenses involving both members in this group
  // (Where either paid and the other split, or both had splits)
  const relevantExpenses = (Array.isArray(expenses) ? expenses : [])
    .filter((e) => {
      if (!e) return false;
      const payer = toIdString(e.paidBy?._id || e.paidBy?.id || e.paidBy);
      const splitUsers = (e.splits || e.participants || []).map((p) =>
        toIdString(p.user?._id || p.user?.id || p.user || p._id || p.id || p)
      );

      const uInvolved = payer === uId || splitUsers.includes(uId);
      const fInvolved = payer === fId || splitUsers.includes(fId);

      return uInvolved && fInvolved;
    })
    .map((e) => ({
      ...e,
      groupId,
      groupName,
      groupCategory
    }));

  // Determine status for this group
  let status = "settled";
  if (directTransfer) {
    status = transferType === "you_pay" ? "you_owe" : "owes_you";
  } else if (userNetPaise !== 0 || friendNetPaise !== 0) {
    status = "group_managed"; // Group has non-zero balances, but no direct transfer between U and F
  }

  return {
    groupId,
    groupName,
    groupCategory,
    status,
    directTransfer,
    transferType,
    transferAmountPaise: directTransfer
      ? directTransfer.amountPaise || Math.round(Number(directTransfer.amount || 0) * 100)
      : 0,
    transferAmount: directTransfer ? Number(directTransfer.amount || 0) : 0,
    userNetPaise,
    friendNetPaise,
    settlements: relevantSettlements,
    expenses: relevantExpenses
  };
}

/**
 * Aggregates a friend's ledger across all mutual groups.
 * Computes actionable direct debts, collects shared transactions, and avoids invented cross-group balances.
 *
 * @param {string} friendId
 * @param {Array<object>} groupRelationships - Array of results from computeFriendGroupRelationship
 * @returns {object} Aggregated ledger for this friend
 */
export function aggregateFriendLedger(friendId, groupRelationships = []) {
  const validRelationships = Array.isArray(groupRelationships)
    ? groupRelationships.filter(Boolean)
    : [];

  let totalYouOwePaise = 0;
  let totalOwedToYouPaise = 0;
  const actionableTransfers = [];
  const allSettlements = [];
  const allExpenses = [];

  for (const rel of validRelationships) {
    if (rel.directTransfer) {
      if (rel.transferType === "you_pay") {
        totalYouOwePaise += rel.transferAmountPaise;
        actionableTransfers.push({
          groupId: rel.groupId,
          groupName: rel.groupName,
          transfer: rel.directTransfer,
          direction: "you_pay"
        });
      } else if (rel.transferType === "you_receive") {
        totalOwedToYouPaise += rel.transferAmountPaise;
        actionableTransfers.push({
          groupId: rel.groupId,
          groupName: rel.groupName,
          transfer: rel.directTransfer,
          direction: "you_receive"
        });
      }
    }

    if (Array.isArray(rel.settlements)) {
      allSettlements.push(...rel.settlements);
    }

    if (Array.isArray(rel.expenses)) {
      allExpenses.push(...rel.expenses);
    }
  }

  // Sort transactions newest first
  allSettlements.sort(
    (a, b) => new Date(b.settledAt || b.createdAt || 0) - new Date(a.settledAt || a.createdAt || 0)
  );

  allExpenses.sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );

  // Overall relationship status
  let overallStatus = "settled";
  if (totalOwedToYouPaise > 0 && totalYouOwePaise === 0) {
    overallStatus = "owes_you";
  } else if (totalYouOwePaise > 0 && totalOwedToYouPaise === 0) {
    overallStatus = "you_owe";
  } else if (totalOwedToYouPaise > 0 && totalYouOwePaise > 0) {
    overallStatus = "mixed"; // Has both receivables and payables in separate groups
  } else if (validRelationships.some((r) => r.status === "group_managed")) {
    overallStatus = "group_managed";
  }

  return {
    friendId: toIdString(friendId),
    overallStatus,
    totalYouOwePaise,
    totalYouOwe: totalYouOwePaise / 100,
    totalOwedToYouPaise,
    totalOwedToYou: totalOwedToYouPaise / 100,
    actionableTransfers,
    groupBreakdowns: validRelationships,
    sharedExpenses: allExpenses,
    sharedSettlements: allSettlements
  };
}

/**
 * Filter friends by search query and balance status
 *
 * @param {Array<object>} friendsList
 * @param {object} criteria
 * @param {string} [criteria.searchQuery='']
 * @param {'all'|'unsettled'|'settled'|'owes_you'|'you_owe'} [criteria.balanceFilter='all']
 * @returns {Array<object>}
 */
export function filterFriends(
  friendsList,
  { searchQuery = "", balanceFilter = "all" } = {}
) {
  if (!Array.isArray(friendsList)) return [];

  let result = friendsList;

  // 1. Balance filter
  if (balanceFilter && balanceFilter !== "all") {
    result = result.filter((f) => {
      const status = f.ledger?.overallStatus || "settled";
      if (balanceFilter === "unsettled") {
        return status === "owes_you" || status === "you_owe" || status === "mixed";
      }
      if (balanceFilter === "settled") {
        return status === "settled" || status === "group_managed";
      }
      return status === balanceFilter;
    });
  }

  // 2. Search query filter
  const q = (searchQuery || "").trim().toLowerCase();
  if (q) {
    result = result.filter((f) => {
      const name = (f.name || "").toLowerCase();
      const email = (f.email || "").toLowerCase();
      const groupNames = (f.sharedGroups || [])
        .map((g) => (g.name || "").toLowerCase())
        .join(" ");

      return name.includes(q) || email.includes(q) || groupNames.includes(q);
    });
  }

  return result;
}
