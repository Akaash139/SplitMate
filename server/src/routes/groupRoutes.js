const express = require("express");
const mongoose = require("mongoose");
const Group = require("../models/Group");
const Settlement = require("../models/Settlement");
const { authenticate } = require("../middleware/authMiddleware");
const {
  requireGroupMember,
  requireGroupAdminOrCreator,
  requireGroupCreator
} = require("../middleware/groupMiddleware");
const expenseRoutes = require("./expenseRoutes");
const analyticsRoutes = require("./analyticsRoutes");
const Expense = require("../models/Expense");
const { calculateNetBalances, simplifyDebts } = require("../utils/balanceEngine");
const { toPaise, fromPaise } = require("../utils/expenseSplits");
const {
  parseDateFilter,
  filterExpensesInMemory,
  calculateAnalytics
} = require("../utils/analyticsEngine");

const router = express.Router();

// Mount nested sub-routers
router.use("/:groupId/expenses", expenseRoutes);
router.use("/:groupId/analytics", analyticsRoutes);

/**
 * Format group object for API response
 */
function formatGroupResponse(group, currentUserId = null) {
  const isMember = currentUserId ? group.isMember(currentUserId) : false;
  const currentMember = currentUserId
    ? group.members.find(
        (m) => (m.user?._id || m.user).toString() === currentUserId.toString()
      )
    : null;

  return {
    id: group._id,
    name: group.name,
    description: group.description || "",
    category: group.category,
    creator: group.creator,
    members: group.members,
    memberCount: group.members.length,
    inviteCode: isMember ? group.inviteCode : undefined,
    isInviteActive: isMember ? group.isInviteActive : undefined,
    inviteExpiresAt: isMember ? group.inviteExpiresAt : undefined,
    currentUserRole: currentMember ? currentMember.role : null,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt
  };
}

/**
 * @route   GET /api/v1/groups/invite/:inviteCode
 * @desc    Safe public preview of group invitation (no private member details exposed)
 * @access  Public
 */
router.get("/invite/:inviteCode", async (req, res, next) => {
  try {
    const { inviteCode } = req.params;

    const group = await Group.findOne({ inviteCode, isInviteActive: true }).populate(
      "creator",
      "name avatar"
    );

    if (!group) {
      return res.status(404).json({
        success: false,
        error: "Invitation link is invalid or has been revoked"
      });
    }

    if (group.inviteExpiresAt && group.inviteExpiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        error: "This invitation link has expired"
      });
    }

    // Safe public payload
    return res.status(200).json({
      success: true,
      group: {
        id: group._id,
        name: group.name,
        description: group.description,
        category: group.category,
        memberCount: group.members.length,
        creatorName: group.creator?.name || "SplitMate User"
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/groups/join/:inviteCode
 * @desc    Join a group using an active invite code
 * @access  Private
 */
router.post("/join/:inviteCode", authenticate, async (req, res, next) => {
  try {
    const { inviteCode } = req.params;

    const group = await Group.findOne({ inviteCode, isInviteActive: true });

    if (!group) {
      return res.status(404).json({
        success: false,
        error: "Invitation link is invalid or has been revoked"
      });
    }

    if (group.inviteExpiresAt && group.inviteExpiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        error: "This invitation link has expired"
      });
    }

    // Prevent duplicate membership
    if (group.isMember(req.user._id)) {
      return res.status(400).json({
        success: false,
        error: "You are already a member of this group"
      });
    }

    // Add user as regular member
    group.members.push({
      user: req.user._id,
      role: "member",
      joinedAt: new Date()
    });

    await group.save();

    await group.populate("members.user", "name email avatar");
    await group.populate("creator", "name email avatar");

    return res.status(200).json({
      success: true,
      message: `Successfully joined ${group.name}!`,
      group: formatGroupResponse(group, req.user._id)
    });
  } catch (error) {
    next(error);
  }
});

// All following routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/v1/groups
 * @desc    Create a new group
 * @access  Private
 */
router.post("/", async (req, res, next) => {
  try {
    const { name, description, category } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Group name is required"
      });
    }

    if (name.trim().length < 2 || name.trim().length > 100) {
      return res.status(400).json({
        success: false,
        error: "Group name must be between 2 and 100 characters long"
      });
    }

    const validCategories = ["Home", "Trip", "Couple", "Other"];
    const groupCategory = validCategories.includes(category) ? category : "Home";

    const group = await Group.create({
      name: name.trim(),
      description: description ? description.trim() : "",
      category: groupCategory,
      creator: req.user._id,
      members: [
        {
          user: req.user._id,
          role: "creator",
          joinedAt: new Date()
        }
      ]
    });

    await group.populate("members.user", "name email avatar");
    await group.populate("creator", "name email avatar");

    return res.status(201).json({
      success: true,
      message: "Group created successfully",
      group: formatGroupResponse(group, req.user._id)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/groups
 * @desc    List all groups the current user is a member of
 * @access  Private
 */
router.get("/", async (req, res, next) => {
  try {
    const groups = await Group.find({ "members.user": req.user._id })
      .sort({ updatedAt: -1 })
      .populate("members.user", "name email avatar")
      .populate("creator", "name email avatar");

    const formattedGroups = groups.map((g) => formatGroupResponse(g, req.user._id));

    return res.status(200).json({
      success: true,
      count: formattedGroups.length,
      groups: formattedGroups
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/groups/analytics
 * @desc    Get aggregated spending analytics across all groups user belongs to (or filtered by ?groupId=)
 * @access  Private
 */
async function handleUserOverviewAnalytics(req, res, next) {
  try {
    let parsedFilter;
    try {
      parsedFilter = parseDateFilter(req.query);
    } catch (validationErr) {
      return res.status(validationErr.status || 400).json({
        success: false,
        error: validationErr.message
      });
    }

    const { groupId } = req.query;
    let targetGroupIds = [];

    const userGroups = await Group.find({ "members.user": req.user._id });
    const userGroupMap = new Map(userGroups.map((g) => [g._id.toString(), g]));

    if (groupId) {
      if (!mongoose.Types.ObjectId.isValid(groupId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid group identifier"
        });
      }
      if (!userGroupMap.has(groupId.toString())) {
        const exists = await Group.findById(groupId);
        if (!exists) {
          return res.status(404).json({
            success: false,
            error: "Group not found"
          });
        }
        return res.status(403).json({
          success: false,
          error: "Access denied. You are not a member of this group"
        });
      }
      targetGroupIds = [new mongoose.Types.ObjectId(groupId)];
    } else {
      targetGroupIds = userGroups.map((g) => g._id);
    }

    if (targetGroupIds.length === 0) {
      const emptyAnalytics = calculateAnalytics([], {
        currentUserId: req.user._id,
        fixedYear: parsedFilter.filterType === "year" ? parsedFilter.year : null
      });
      return res.status(200).json({
        success: true,
        period: {
          filterType: parsedFilter.filterType,
          startDate: parsedFilter.startDate ? parsedFilter.startDate.toISOString() : null,
          endDate: parsedFilter.endDate ? parsedFilter.endDate.toISOString() : null,
          month: parsedFilter.month,
          year: parsedFilter.year,
          category: parsedFilter.category
        },
        groupCount: 0,
        summary: emptyAnalytics.summary,
        categoryBreakdown: emptyAnalytics.categoryBreakdown,
        allCategories: emptyAnalytics.allCategories,
        monthlyTrends: emptyAnalytics.monthlyTrends
      });
    }

    const filter = { group: { $in: targetGroupIds } };
    if (parsedFilter.category) {
      filter.category = parsedFilter.category;
    }
    if (parsedFilter.dateQuery) {
      filter.createdAt = parsedFilter.dateQuery;
    }

    const expensesQuery = Expense.find(filter)
      .sort({ createdAt: -1 })
      .populate("paidBy", "name email avatar")
      .populate("splits.user", "name email avatar");

    const rawExpenses =
      typeof expensesQuery.lean === "function"
        ? await expensesQuery.lean()
        : await expensesQuery;

    const filteredExpenses = filterExpensesInMemory(rawExpenses || [], parsedFilter);

    const allMembers = [];
    for (const g of userGroups) {
      if (Array.isArray(g.members)) {
        allMembers.push(...g.members);
      }
    }

    const analytics = calculateAnalytics(filteredExpenses, {
      currentUserId: req.user._id,
      groupMembers: allMembers,
      fixedYear: parsedFilter.filterType === "year" ? parsedFilter.year : null
    });

    return res.status(200).json({
      success: true,
      period: {
        filterType: parsedFilter.filterType,
        startDate: parsedFilter.startDate ? parsedFilter.startDate.toISOString() : null,
        endDate: parsedFilter.endDate ? parsedFilter.endDate.toISOString() : null,
        month: parsedFilter.month,
        year: parsedFilter.year,
        category: parsedFilter.category
      },
      groupCount: targetGroupIds.length,
      summary: analytics.summary,
      categoryBreakdown: analytics.categoryBreakdown,
      allCategories: analytics.allCategories,
      monthlyTrends: analytics.monthlyTrends
    });
  } catch (error) {
    next(error);
  }
}

/**
 * @route   GET /api/v1/groups/analytics/categories
 * @desc    Get category-specific spending summary across all groups user belongs to
 * @access  Private
 */
async function handleUserOverviewCategoryAnalytics(req, res, next) {
  try {
    let parsedFilter;
    try {
      parsedFilter = parseDateFilter(req.query);
    } catch (validationErr) {
      return res.status(validationErr.status || 400).json({
        success: false,
        error: validationErr.message
      });
    }

    const { groupId } = req.query;
    let targetGroupIds = [];

    const userGroups = await Group.find({ "members.user": req.user._id });
    const userGroupMap = new Map(userGroups.map((g) => [g._id.toString(), g]));

    if (groupId) {
      if (!mongoose.Types.ObjectId.isValid(groupId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid group identifier"
        });
      }
      if (!userGroupMap.has(groupId.toString())) {
        const exists = await Group.findById(groupId);
        if (!exists) {
          return res.status(404).json({
            success: false,
            error: "Group not found"
          });
        }
        return res.status(403).json({
          success: false,
          error: "Access denied. You are not a member of this group"
        });
      }
      targetGroupIds = [new mongoose.Types.ObjectId(groupId)];
    } else {
      targetGroupIds = userGroups.map((g) => g._id);
    }

    if (targetGroupIds.length === 0) {
      const emptyAnalytics = calculateAnalytics([]);
      return res.status(200).json({
        success: true,
        period: {
          filterType: parsedFilter.filterType,
          startDate: parsedFilter.startDate ? parsedFilter.startDate.toISOString() : null,
          endDate: parsedFilter.endDate ? parsedFilter.endDate.toISOString() : null,
          month: parsedFilter.month,
          year: parsedFilter.year,
          category: parsedFilter.category
        },
        groupCount: 0,
        totalSpent: 0,
        totalSpentPaise: 0,
        expenseCount: 0,
        userTotalShare: 0,
        userTotalSharePaise: 0,
        categoryBreakdown: [],
        allCategories: emptyAnalytics.allCategories
      });
    }

    const filter = { group: { $in: targetGroupIds } };
    if (parsedFilter.category) {
      filter.category = parsedFilter.category;
    }
    if (parsedFilter.dateQuery) {
      filter.createdAt = parsedFilter.dateQuery;
    }

    const expensesQuery = Expense.find(filter).sort({ createdAt: -1 });
    const rawExpenses =
      typeof expensesQuery.lean === "function"
        ? await expensesQuery.lean()
        : await expensesQuery;

    const filteredExpenses = filterExpensesInMemory(rawExpenses || [], parsedFilter);

    const allMembers = [];
    for (const g of userGroups) {
      if (Array.isArray(g.members)) {
        allMembers.push(...g.members);
      }
    }

    const analytics = calculateAnalytics(filteredExpenses, {
      currentUserId: req.user._id,
      groupMembers: allMembers
    });

    return res.status(200).json({
      success: true,
      period: {
        filterType: parsedFilter.filterType,
        startDate: parsedFilter.startDate ? parsedFilter.startDate.toISOString() : null,
        endDate: parsedFilter.endDate ? parsedFilter.endDate.toISOString() : null,
        month: parsedFilter.month,
        year: parsedFilter.year,
        category: parsedFilter.category
      },
      groupCount: targetGroupIds.length,
      totalSpent: analytics.summary.totalSpent,
      totalSpentPaise: analytics.summary.totalSpentPaise,
      expenseCount: analytics.summary.expenseCount,
      userTotalShare: analytics.summary.userTotalShare,
      userTotalSharePaise: analytics.summary.userTotalSharePaise,
      categoryBreakdown: analytics.categoryBreakdown,
      allCategories: analytics.allCategories
    });
  } catch (error) {
    next(error);
  }
}

router.get("/analytics", handleUserOverviewAnalytics);
router.get("/analytics/categories", handleUserOverviewCategoryAnalytics);

/**
 * @route   GET /api/v1/groups/:id
 * @desc    Get detailed group information for a member
 * @access  Private (Members only)
 */
router.get("/:id", requireGroupMember, async (req, res) => {
  return res.status(200).json({
    success: true,
    group: formatGroupResponse(req.group, req.user._id)
  });
});

/**
 * Normalizes Expense documents for the balance engine
 */
function prepareExpensesForEngine(expenses) {
  if (!Array.isArray(expenses)) return [];
  return expenses.map((exp) => {
    const doc = exp && typeof exp.toObject === "function" ? exp.toObject() : exp;
    return {
      amount: doc.amount,
      amountPaise: doc.amountPaise,
      paidBy: doc.paidBy,
      splits: Array.isArray(doc.splits)
        ? doc.splits.map((s) => ({
            user: s.user,
            amount: s.amount,
            amountPaise: s.amountPaise
          }))
        : []
    };
  });
}

function prepareSettlementsForEngine(settlements) {
  if (!Array.isArray(settlements)) return [];
  return settlements.map((st) => {
    const doc = st && typeof st.toObject === "function" ? st.toObject() : st;
    return {
      payer: doc.payer,
      receiver: doc.receiver,
      amount: doc.amount,
      amountPaise: doc.amountPaise,
      status: doc.status || "completed"
    };
  });
}

/**
 * Builds a fast lookup map of member profiles from the group document
 */
function buildMemberProfileMap(group) {
  const map = new Map();
  if (Array.isArray(group.members)) {
    for (const m of group.members) {
      const u = m.user;
      if (u) {
        const uid = (u._id || u.id || u).toString();
        map.set(uid, {
          id: uid,
          name: u.name || "SplitMate User",
          email: u.email || "",
          avatar: u.avatar || "",
          role: m.role || "member"
        });
      }
    }
  }
  return map;
}

/**
 * @route   GET /api/v1/groups/:groupId/balances
 * @desc    Calculate and return net balances for all group members including settlements
 * @access  Private (Members only)
 */
router.get("/:groupId/balances", requireGroupMember, async (req, res, next) => {
  try {
    const expensesQuery = Expense.find({ group: req.group._id }).sort({ createdAt: -1 });
    const rawExpenses =
      typeof expensesQuery.lean === "function"
        ? await expensesQuery.lean()
        : await expensesQuery;

    let rawSettlements = [];
    if (mongoose.connection.readyState !== 0 || (Settlement.find && Settlement.find !== mongoose.Model.find)) {
      const settlementsQuery = Settlement.find({
        group: req.group._id,
        status: { $ne: "cancelled" }
      }).sort({ settledAt: -1 });
      rawSettlements =
        typeof settlementsQuery?.lean === "function"
          ? await settlementsQuery.lean()
          : (await settlementsQuery) || [];
    }

    const preparedExpenses = prepareExpensesForEngine(rawExpenses);
    const preparedSettlements = prepareSettlementsForEngine(rawSettlements);

    let balanceResult;
    try {
      balanceResult = calculateNetBalances(preparedExpenses, {
        members: req.group.members,
        settlements: preparedSettlements
      });
    } catch (calcError) {
      return res.status(422).json({
        success: false,
        error: `Balance calculation error: ${calcError.message}`,
        inconsistentData: true
      });
    }

    const memberMap = buildMemberProfileMap(req.group);
    const currentUserId = req.user._id ? req.user._id.toString() : req.user.toString();

    const formattedMemberBalances = balanceResult.memberBalances.map((mb) => {
      const profile = memberMap.get(mb.user) || {
        id: mb.user,
        name: "SplitMate User",
        email: "",
        avatar: "",
        role: "member"
      };

      const status =
        mb.netBalancePaise > 0 ? "owed" : mb.netBalancePaise < 0 ? "owes" : "settled";

      return {
        user: profile,
        netBalance: mb.netBalance,
        netBalancePaise: mb.netBalancePaise,
        totalPaid: mb.totalPaid,
        totalPaidPaise: mb.totalPaidPaise,
        totalShare: mb.totalShare,
        totalSharePaise: mb.totalSharePaise,
        settledPaid: mb.settledPaid || 0,
        settledPaidPaise: mb.settledPaidPaise || 0,
        settledReceived: mb.settledReceived || 0,
        settledReceivedPaise: mb.settledReceivedPaise || 0,
        status
      };
    });

    const currentMemberBalance = formattedMemberBalances.find(
      (m) => m.user.id === currentUserId
    ) || {
      user: memberMap.get(currentUserId) || { id: currentUserId, name: req.user.name || "User" },
      netBalance: 0,
      netBalancePaise: 0,
      totalPaid: 0,
      totalPaidPaise: 0,
      totalShare: 0,
      totalSharePaise: 0,
      settledPaid: 0,
      settledPaidPaise: 0,
      settledReceived: 0,
      settledReceivedPaise: 0,
      status: "settled"
    };

    return res.status(200).json({
      success: true,
      groupId: req.group._id,
      groupName: req.group.name,
      currency: "INR",
      totalExpenses: balanceResult.totalExpenses,
      totalExpensesPaise: balanceResult.totalExpensesPaise,
      totalSettlements: balanceResult.totalSettlements || 0,
      totalSettlementsPaise: balanceResult.totalSettlementsPaise || 0,
      expenseCount: preparedExpenses.length,
      settlementCount: rawSettlements.length,
      memberCount: req.group.members.length,
      balances: balanceResult.balances,
      memberBalances: formattedMemberBalances,
      currentUserBalance: currentMemberBalance
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/groups/:groupId/settlement-suggestions
 * @desc    Generate deterministic minimal suggested transfers to settle all remaining group debts
 * @access  Private (Members only)
 */
async function handleSettlementSuggestions(req, res, next) {
  try {
    const expensesQuery = Expense.find({ group: req.group._id }).sort({ createdAt: -1 });
    const rawExpenses =
      typeof expensesQuery.lean === "function"
        ? await expensesQuery.lean()
        : await expensesQuery;

    let rawSettlements = [];
    if (mongoose.connection.readyState !== 0 || (Settlement.find && Settlement.find !== mongoose.Model.find)) {
      const settlementsQuery = Settlement.find({
        group: req.group._id,
        status: { $ne: "cancelled" }
      }).sort({ settledAt: -1 });
      rawSettlements =
        typeof settlementsQuery?.lean === "function"
          ? await settlementsQuery.lean()
          : (await settlementsQuery) || [];
    }

    const preparedExpenses = prepareExpensesForEngine(rawExpenses);
    const preparedSettlements = prepareSettlementsForEngine(rawSettlements);

    let balanceResult;
    try {
      balanceResult = calculateNetBalances(preparedExpenses, {
        members: req.group.members,
        settlements: preparedSettlements
      });
    } catch (calcError) {
      return res.status(422).json({
        success: false,
        error: `Balance calculation error: ${calcError.message}`,
        inconsistentData: true
      });
    }

    let transfers;
    try {
      transfers = simplifyDebts(balanceResult.balances);
    } catch (simplError) {
      return res.status(422).json({
        success: false,
        error: `Debt simplification error: ${simplError.message}`,
        inconsistentData: true
      });
    }

    const memberMap = buildMemberProfileMap(req.group);

    const formattedTransfers = transfers.map((t) => {
      const fromUser = memberMap.get(t.from) || { id: t.from, name: "SplitMate User" };
      const toUser = memberMap.get(t.to) || { id: t.to, name: "SplitMate User" };

      return {
        from: t.from,
        to: t.to,
        payer: t.payer || t.from,
        recipient: t.recipient || t.to,
        fromUser,
        toUser,
        amount: t.amount,
        amountPaise: t.amountPaise
      };
    });

    return res.status(200).json({
      success: true,
      groupId: req.group._id,
      groupName: req.group.name,
      currency: "INR",
      isSettled: formattedTransfers.length === 0,
      transferCount: formattedTransfers.length,
      transfers: formattedTransfers,
      totalExpenses: balanceResult.totalExpenses,
      totalExpensesPaise: balanceResult.totalExpensesPaise,
      totalSettlements: balanceResult.totalSettlements || 0,
      totalSettlementsPaise: balanceResult.totalSettlementsPaise || 0,
      memberCount: req.group.members.length
    });
  } catch (error) {
    next(error);
  }
}

router.get("/:groupId/settlement-suggestions", requireGroupMember, handleSettlementSuggestions);
router.get("/:groupId/suggested-settlements", requireGroupMember, handleSettlementSuggestions);

/**
 * @route   GET /api/v1/groups/:groupId/settlements
 * @desc    Get all settlement payments recorded for this group
 * @access  Private (Members only)
 */
async function handleListSettlements(req, res, next) {
  try {
    const settlementsQuery = Settlement.find({ group: req.group._id })
      .populate("payer", "name email avatar")
      .populate("receiver", "name email avatar")
      .populate("recordedBy", "name email avatar")
      .sort({ settledAt: -1, createdAt: -1 });

    const settlements =
      typeof settlementsQuery.lean === "function"
        ? await settlementsQuery.lean()
        : await settlementsQuery;

    return res.status(200).json({
      success: true,
      groupId: req.group._id,
      settlementCount: settlements.length,
      settlements
    });
  } catch (error) {
    next(error);
  }
}

/**
 * @route   POST /api/v1/groups/:groupId/settlements
 * @desc    Record a completed settlement payment between two group members
 * @access  Private (Members only)
 */
async function handleCreateSettlement(req, res, next) {
  try {
    const { payer, receiver, amount, notes, idempotencyKey } = req.body;

    // 1. Validate required participant fields
    if (!payer || !receiver) {
      return res.status(400).json({
        success: false,
        error: "Both payer and receiver are required"
      });
    }

    const payerId = (payer._id || payer.id || payer).toString();
    const receiverId = (receiver._id || receiver.id || receiver).toString();

    if (!mongoose.Types.ObjectId.isValid(payerId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid payer or receiver user identifier"
      });
    }

    if (payerId === receiverId) {
      return res.status(400).json({
        success: false,
        error: "Payer and receiver cannot be the same member"
      });
    }

    // 2. Validate group membership
    if (!req.group.isMember(payerId)) {
      return res.status(400).json({
        success: false,
        error: "The specified payer is not an active member of this group"
      });
    }

    if (!req.group.isMember(receiverId)) {
      return res.status(400).json({
        success: false,
        error: "The specified receiver is not an active member of this group"
      });
    }

    // 3. Validate positive monetary amount
    if (
      amount === undefined ||
      amount === null ||
      typeof amount !== "number" ||
      isNaN(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        success: false,
        error: "Settlement amount must be a positive number greater than 0"
      });
    }

    let amountPaise;
    try {
      amountPaise = toPaise(amount);
    } catch (conversionErr) {
      return res.status(400).json({
        success: false,
        error: conversionErr.message || "Invalid settlement monetary amount"
      });
    }

    if (amountPaise <= 0) {
      return res.status(400).json({
        success: false,
        error: "Settlement amount must be at least ₹0.01 (1 paisa)"
      });
    }

    // 4. Check for duplicate submission via idempotencyKey
    if (idempotencyKey && typeof idempotencyKey === "string" && idempotencyKey.trim()) {
      const existing = await Settlement.findOne({
        group: req.group._id,
        idempotencyKey: idempotencyKey.trim()
      })
        .populate("payer", "name email avatar")
        .populate("receiver", "name email avatar")
        .populate("recordedBy", "name email avatar");

      if (existing) {
        return res.status(200).json({
          success: true,
          message: "Settlement already recorded (idempotent submission)",
          settlement: existing,
          isDuplicate: true
        });
      }
    }

    // 5. Fetch current ledger to evaluate remaining debts & prevent over-settlement
    let currentGroupVersion = 0;
    if (mongoose.connection.readyState !== 0 || (Group.findById && Group.findById !== mongoose.Model.findById)) {
      const freshQuery = Group.findById(req.group._id);
      const freshGroup =
        typeof freshQuery?.select === "function"
          ? await freshQuery.select("settlementVersion").lean()
          : typeof freshQuery?.lean === "function"
          ? await freshQuery.lean()
          : await freshQuery;
      currentGroupVersion = freshGroup?.settlementVersion ?? (req.group.settlementVersion ?? 0);
    } else {
      currentGroupVersion = req.group.settlementVersion ?? 0;
    }

    const expensesQuery = Expense.find({ group: req.group._id }).sort({ createdAt: -1 });
    const rawExpenses =
      typeof expensesQuery.lean === "function"
        ? await expensesQuery.lean()
        : await expensesQuery;

    let rawSettlements = [];
    if (Settlement && typeof Settlement.find === "function") {
      const settlementsQuery = Settlement.find({
        group: req.group._id,
        status: { $ne: "cancelled" }
      }).sort({ settledAt: -1 });
      rawSettlements =
        typeof settlementsQuery.lean === "function"
          ? await settlementsQuery.lean()
          : await settlementsQuery;
    }

    const preparedExpenses = prepareExpensesForEngine(rawExpenses);
    const preparedSettlements = prepareSettlementsForEngine(rawSettlements);

    let currentBalances;
    try {
      currentBalances = calculateNetBalances(preparedExpenses, {
        members: req.group.members,
        settlements: preparedSettlements
      });
    } catch (calcErr) {
      return res.status(422).json({
        success: false,
        error: `Cannot record settlement: ledger balance error (${calcErr.message})`,
        inconsistentData: true
      });
    }

    const payerNetPaise = currentBalances.balances[payerId] || 0;
    const receiverNetPaise = currentBalances.balances[receiverId] || 0;

    // Payer must owe money (net balance < 0)
    if (payerNetPaise >= 0) {
      const payerName =
        req.group.members.find((m) => (m.user?._id || m.user).toString() === payerId)?.user?.name ||
        "The payer";
      return res.status(400).json({
        success: false,
        error: `${payerName} has no outstanding debt in this group (net balance: ₹${(payerNetPaise / 100).toFixed(2)})`
      });
    }

    // Receiver must be owed money (net balance > 0)
    if (receiverNetPaise <= 0) {
      const receiverName =
        req.group.members.find((m) => (m.user?._id || m.user).toString() === receiverId)?.user?.name ||
        "The receiver";
      return res.status(400).json({
        success: false,
        error: `${receiverName} is not owed any money in this group (net balance: ₹${(receiverNetPaise / 100).toFixed(2)})`
      });
    }

    // Maximum payable cannot exceed payer's total debt or receiver's total credit
    const payerDebtPaise = Math.abs(payerNetPaise);
    if (amountPaise > payerDebtPaise) {
      return res.status(400).json({
        success: false,
        error: `Settlement amount (₹${(amountPaise / 100).toFixed(2)}) exceeds payer's total outstanding debt of ₹${(payerDebtPaise / 100).toFixed(2)}`
      });
    }

    if (amountPaise > receiverNetPaise) {
      return res.status(400).json({
        success: false,
        error: `Settlement amount (₹${(amountPaise / 100).toFixed(2)}) exceeds receiver's outstanding credit of ₹${(receiverNetPaise / 100).toFixed(2)}`
      });
    }

    // 6. Concurrency Control: Optimistic Atomic Version Increment on Group
    const versionFilter =
      currentGroupVersion === 0
        ? {
            $or: [
              { settlementVersion: 0 },
              { settlementVersion: { $exists: false } }
            ]
          }
        : { settlementVersion: currentGroupVersion };

    let updatedGroup = null;
    if (
      mongoose.connection.readyState !== 0 ||
      (Group.findOneAndUpdate && Group.findOneAndUpdate !== mongoose.Model.findOneAndUpdate)
    ) {
      const updateQuery = Group.findOneAndUpdate(
        {
          _id: req.group._id,
          ...versionFilter
        },
        {
          $inc: { settlementVersion: 1 }
        },
        { new: true }
      );
      updatedGroup =
        typeof updateQuery?.lean === "function"
          ? await updateQuery.lean()
          : await updateQuery;

      if (!updatedGroup) {
        return res.status(409).json({
          success: false,
          error: "A concurrent settlement was processed for this group. Please refresh your balance and try again.",
          conflict: true
        });
      }
    }

    // 7. Create and persist settlement record
    const settlementDoc = new Settlement({
      group: req.group._id,
      payer: payerId,
      receiver: receiverId,
      amount,
      amountPaise,
      currency: "INR",
      recordedBy: req.user._id,
      notes: typeof notes === "string" ? notes.trim() : "",
      idempotencyKey:
        typeof idempotencyKey === "string" && idempotencyKey.trim()
          ? idempotencyKey.trim()
          : undefined,
      status: "completed",
      settledAt: new Date()
    });

    await settlementDoc.save();

    await settlementDoc.populate("payer", "name email avatar");
    await settlementDoc.populate("receiver", "name email avatar");
    await settlementDoc.populate("recordedBy", "name email avatar");

    // 7. Calculate updated balances and suggested transfers
    const updatedRawSettlements = [
      ...rawSettlements,
      settlementDoc.toObject ? settlementDoc.toObject() : settlementDoc
    ];
    const updatedPreparedSettlements = prepareSettlementsForEngine(updatedRawSettlements);

    const updatedBalanceResult = calculateNetBalances(preparedExpenses, {
      members: req.group.members,
      settlements: updatedPreparedSettlements
    });
    const updatedTransfers = simplifyDebts(updatedBalanceResult.balances);

    return res.status(201).json({
      success: true,
      message: `Settlement of ₹${(amountPaise / 100).toFixed(2)} recorded successfully`,
      settlement: settlementDoc,
      isSettled: updatedTransfers.length === 0,
      remainingTransfers: updatedTransfers.length,
      updatedBalances: updatedBalanceResult.balances
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: "Duplicate settlement submission detected"
      });
    }
    next(error);
  }
}

router.get("/:groupId/settlements", requireGroupMember, handleListSettlements);
router.post("/:groupId/settlements", requireGroupMember, handleCreateSettlement);

/**
 * @route   PUT /api/v1/groups/:id
 * @desc    Update group information (Creator or Admin only)
 * @access  Private
 */
router.put(
  "/:id",
  requireGroupMember,
  requireGroupAdminOrCreator,
  async (req, res, next) => {
    try {
      const { name, description, category } = req.body;

      if (name !== undefined) {
        if (!name || typeof name !== "string" || !name.trim()) {
          return res.status(400).json({
            success: false,
            error: "Group name cannot be empty"
          });
        }
        if (name.trim().length < 2 || name.trim().length > 100) {
          return res.status(400).json({
            success: false,
            error: "Group name must be between 2 and 100 characters long"
          });
        }
        req.group.name = name.trim();
      }

      if (description !== undefined) {
        req.group.description = description ? description.trim() : "";
      }

      if (category !== undefined) {
        const validCategories = ["Home", "Trip", "Couple", "Other"];
        if (validCategories.includes(category)) {
          req.group.category = category;
        }
      }

      await req.group.save();

      return res.status(200).json({
        success: true,
        message: "Group updated successfully",
        group: formatGroupResponse(req.group, req.user._id)
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/v1/groups/:id
 * @desc    Delete a group (Creator only)
 * @access  Private
 */
router.delete(
  "/:id",
  requireGroupMember,
  requireGroupCreator,
  async (req, res, next) => {
    try {
      await Group.findByIdAndDelete(req.group._id);

      return res.status(200).json({
        success: true,
        message: `Group '${req.group.name}' has been deleted`
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/groups/:id/invite/regenerate
 * @desc    Regenerate a new invitation code, invalidating previous link
 * @access  Private (Creator or Admin only)
 */
router.post(
  "/:id/invite/regenerate",
  requireGroupMember,
  requireGroupAdminOrCreator,
  async (req, res, next) => {
    try {
      const newCode = req.group.regenerateInvite();
      await req.group.save();

      return res.status(200).json({
        success: true,
        message: "Invite link regenerated successfully",
        inviteCode: newCode,
        inviteExpiresAt: req.group.inviteExpiresAt
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/groups/:id/invite/revoke
 * @desc    Revoke current invite link
 * @access  Private (Creator or Admin only)
 */
router.post(
  "/:id/invite/revoke",
  requireGroupMember,
  requireGroupAdminOrCreator,
  async (req, res, next) => {
    try {
      req.group.revokeInvite();
      await req.group.save();

      return res.status(200).json({
        success: true,
        message: "Invitation link revoked successfully"
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
