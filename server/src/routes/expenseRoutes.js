const express = require("express");
const mongoose = require("mongoose");
const Expense = require("../models/Expense");
const { authenticate } = require("../middleware/authMiddleware");
const { requireGroupMember } = require("../middleware/groupMiddleware");
const { calculateSplits, toPaise } = require("../utils/expenseSplits");
const { generateExpensesCsv } = require("../utils/csvEngine");

const router = express.Router({ mergeParams: true });

// All expense routes require authentication and active group membership
router.use(authenticate);
router.use(requireGroupMember);

/**
 * Format an expense document for clean API response
 */
function formatExpenseResponse(expense) {
  return {
    id: expense._id,
    group: expense.group,
    description: expense.description,
    amount: expense.amount,
    currency: expense.currency || "INR",
    category: expense.category || "General",
    paidBy: expense.paidBy,
    participants: expense.participants,
    splitType: expense.splitType,
    splits: expense.splits,
    createdBy: expense.createdBy,
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt
  };
}

/**
 * Check if the user has authorization to modify or delete the expense:
 * - The user who created the expense record (createdBy)
 * - The user who paid for the expense upfront (paidBy)
 * - The group creator or any group admin
 */
function canUserModifyExpense(expense, user, group, userRole) {
  const userId = user._id ? user._id.toString() : user.toString();
  const createdById = expense.createdBy?._id
    ? expense.createdBy._id.toString()
    : expense.createdBy?.toString();
  const paidById = expense.paidBy?._id
    ? expense.paidBy._id.toString()
    : expense.paidBy?.toString();

  // 1. Author is the creator of the expense
  if (createdById === userId) return true;

  // 2. Author is the upfront payer
  if (paidById === userId) return true;

  // 3. User is group creator or group admin
  if (group.isCreatorOrAdmin && group.isCreatorOrAdmin(userId)) return true;
  if (userRole === "admin" || userRole === "creator") return true;

  return false;
}

/**
 * @route   POST /api/v1/groups/:groupId/expenses
 * @desc    Create a new expense in a group
 * @access  Private (Group Member)
 */
router.post("/", async (req, res, next) => {
  try {
    const {
      description,
      amount,
      currency = "INR",
      category = "General",
      paidBy,
      splitType = "equal",
      participants,
      splits
    } = req.body;

    const group = req.group;

    // 1. Basic field validations
    if (!description || typeof description !== "string" || !description.trim()) {
      return res.status(400).json({
        success: false,
        error: "Expense description is required"
      });
    }

    if (amount === undefined || amount === null || typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Expense amount must be a positive number"
      });
    }

    // 2. Validate payer
    if (!paidBy || !mongoose.Types.ObjectId.isValid(paidBy)) {
      return res.status(400).json({
        success: false,
        error: "Valid payer identifier (paidBy) is required"
      });
    }

    if (!group.isMember(paidBy)) {
      return res.status(400).json({
        success: false,
        error: "Payer must be an active member of this group"
      });
    }

    // 3. Determine and validate participants
    let targetParticipants = participants;
    if ((!targetParticipants || !targetParticipants.length) && splits && splits.length) {
      targetParticipants = splits.map((s) => s.user);
    }

    if (!Array.isArray(targetParticipants) || targetParticipants.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Expense must have at least one participant"
      });
    }

    // Validate participant IDs and group membership
    const participantIds = [];
    for (const p of targetParticipants) {
      const pid = p?._id ? p._id.toString() : p?.toString();
      if (!pid || !mongoose.Types.ObjectId.isValid(pid)) {
        return res.status(400).json({
          success: false,
          error: `Invalid participant identifier: ${pid}`
        });
      }

      if (!group.isMember(pid)) {
        return res.status(400).json({
          success: false,
          error: `Participant ${pid} is not a member of this group`
        });
      }
      participantIds.push(pid);
    }

    // Check for duplicate participants
    if (new Set(participantIds).size !== participantIds.length) {
      return res.status(400).json({
        success: false,
        error: "Participants list cannot contain duplicate users"
      });
    }

    // 4. Server-side split calculation (Never trust client-supplied allocations)
    let calculatedSplitsResult;
    try {
      calculatedSplitsResult = calculateSplits({
        totalAmount: amount,
        splitType,
        participants: participantIds,
        splits: Array.isArray(splits)
          ? splits.map((s) => ({
              ...s,
              user: s.user?._id ? s.user._id.toString() : s.user?.toString()
            }))
          : undefined
      });
    } catch (calcError) {
      return res.status(400).json({
        success: false,
        error: calcError.message
      });
    }

    // 5. Create expense record
    // createdBy is strictly derived from the authenticated user
    const expense = await Expense.create({
      group: group._id,
      description: description.trim(),
      amount: calculatedSplitsResult.totalAmount,
      currency: currency.toUpperCase().trim(),
      category: category.trim(),
      paidBy: new mongoose.Types.ObjectId(paidBy),
      participants: participantIds.map((id) => new mongoose.Types.ObjectId(id)),
      splitType,
      splits: calculatedSplitsResult.splits.map((s) => ({
        user: new mongoose.Types.ObjectId(s.user),
        amount: s.amount,
        amountPaise: s.amountPaise,
        percentage: s.percentage,
        exactAmount: s.exactAmount
      })),
      createdBy: req.user._id
    });

    const populated = await Expense.findById(expense._id)
      .populate("paidBy", "name email avatar")
      .populate("createdBy", "name email avatar")
      .populate("splits.user", "name email avatar")
      .populate("participants", "name email avatar");

    return res.status(201).json({
      success: true,
      message: "Expense created successfully",
      expense: formatExpenseResponse(populated || expense)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/groups/:groupId/expenses
 * @desc    List all expenses for a group (with strict group isolation)
 * @access  Private (Group Member)
 */
router.get("/", async (req, res, next) => {
  try {
    const expenses = await Expense.find({ group: req.group._id })
      .sort({ createdAt: -1 })
      .populate("paidBy", "name email avatar")
      .populate("createdBy", "name email avatar")
      .populate("splits.user", "name email avatar")
      .populate("participants", "name email avatar");

    return res.status(200).json({
      success: true,
      count: expenses.length,
      expenses: expenses.map(formatExpenseResponse)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/groups/:groupId/expenses/export
 * @desc    Export group expenses as an RFC 4180 CSV document
 * @access  Private (Group Member)
 */
router.get("/export", async (req, res, next) => {
  try {
    const { category, payer, search, startDate, endDate } = req.query;

    const filter = { group: req.group._id };

    if (category && category !== "all") {
      filter.category = category;
    }

    if (payer && payer !== "all") {
      if (payer === "mine") {
        filter.paidBy = req.user._id;
      } else if (mongoose.Types.ObjectId.isValid(payer)) {
        filter.paidBy = new mongoose.Types.ObjectId(payer);
      }
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const s = new Date(startDate);
        if (!isNaN(s.getTime())) filter.createdAt.$gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        if (!isNaN(e.getTime())) {
          e.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = e;
        }
      }
      if (Object.keys(filter.createdAt).length === 0) {
        delete filter.createdAt;
      }
    }

    if (search && typeof search === "string" && search.trim()) {
      filter.description = { $regex: search.trim(), $options: "i" };
    }

    const expenses = await Expense.find(filter)
      .sort({ createdAt: -1 })
      .populate("paidBy", "name email avatar")
      .populate("createdBy", "name email avatar");

    const csvContent = generateExpensesCsv(expenses, {
      groupName: req.group.name,
      currency: "INR"
    });

    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `splitmate-expenses-${dateStr}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
});

router.get("/export/csv", async (req, res, next) => {
  try {
    const { category, payer, search, startDate, endDate } = req.query;

    const filter = { group: req.group._id };

    if (category && category !== "all") {
      filter.category = category;
    }

    if (payer && payer !== "all") {
      if (payer === "mine") {
        filter.paidBy = req.user._id;
      } else if (mongoose.Types.ObjectId.isValid(payer)) {
        filter.paidBy = new mongoose.Types.ObjectId(payer);
      }
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const s = new Date(startDate);
        if (!isNaN(s.getTime())) filter.createdAt.$gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        if (!isNaN(e.getTime())) {
          e.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = e;
        }
      }
      if (Object.keys(filter.createdAt).length === 0) {
        delete filter.createdAt;
      }
    }

    if (search && typeof search === "string" && search.trim()) {
      filter.description = { $regex: search.trim(), $options: "i" };
    }

    const expenses = await Expense.find(filter)
      .sort({ createdAt: -1 })
      .populate("paidBy", "name email avatar")
      .populate("createdBy", "name email avatar");

    const csvContent = generateExpensesCsv(expenses, {
      groupName: req.group.name,
      currency: "INR"
    });

    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `splitmate-expenses-${dateStr}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/groups/:groupId/expenses/:expenseId
 * @desc    Retrieve details of a single expense
 * @access  Private (Group Member)
 */
router.get("/:expenseId", async (req, res, next) => {
  try {
    const { expenseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(expenseId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid expense identifier"
      });
    }

    // Strict group isolation: expense must belong to the requested group
    const expense = await Expense.findOne({
      _id: expenseId,
      group: req.group._id
    })
      .populate("paidBy", "name email avatar")
      .populate("createdBy", "name email avatar")
      .populate("splits.user", "name email avatar")
      .populate("participants", "name email avatar");

    if (!expense) {
      return res.status(404).json({
        success: false,
        error: "Expense not found in this group"
      });
    }

    return res.status(200).json({
      success: true,
      expense: formatExpenseResponse(expense)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/v1/groups/:groupId/expenses/:expenseId
 * @desc    Update an expense in a group
 * @access  Private (Expense Creator, Payer, or Group Admin)
 */
router.put("/:expenseId", async (req, res, next) => {
  try {
    const { expenseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(expenseId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid expense identifier"
      });
    }

    // 1. Find existing expense strictly within this group
    const expense = await Expense.findOne({
      _id: expenseId,
      group: req.group._id
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        error: "Expense not found in this group"
      });
    }

    // 2. Permission check: Only expense creator, upfront payer, or group admin/creator can update
    const isAuthorized = canUserModifyExpense(
      expense,
      req.user,
      req.group,
      req.userGroupRole
    );

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Only the expense creator, payer, or a group administrator can modify this expense"
      });
    }

    const {
      description,
      amount,
      currency,
      category,
      paidBy,
      splitType,
      participants,
      splits
    } = req.body;

    // 3. Update descriptive fields if provided
    if (description !== undefined) {
      if (!description || typeof description !== "string" || !description.trim()) {
        return res.status(400).json({
          success: false,
          error: "Expense description cannot be empty"
        });
      }
      expense.description = description.trim();
    }

    if (category !== undefined) {
      expense.category = category.trim();
    }

    if (currency !== undefined) {
      expense.currency = currency.toUpperCase().trim();
    }

    // 4. Update payer if provided
    if (paidBy !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(paidBy)) {
        return res.status(400).json({
          success: false,
          error: "Invalid payer identifier"
        });
      }
      if (!req.group.isMember(paidBy)) {
        return res.status(400).json({
          success: false,
          error: "Payer must be an active member of this group"
        });
      }
      expense.paidBy = new mongoose.Types.ObjectId(paidBy);
    }

    // 5. Check if split calculation needs to be updated
    const newAmount = amount !== undefined ? amount : expense.amount;
    const newSplitType = splitType !== undefined ? splitType : expense.splitType;
    let newParticipants = participants !== undefined ? participants : expense.participants;

    if (amount !== undefined || splitType !== undefined || participants !== undefined || splits !== undefined) {
      if (typeof newAmount !== "number" || newAmount <= 0) {
        return res.status(400).json({
          success: false,
          error: "Expense amount must be a positive number"
        });
      }

      if ((!newParticipants || !newParticipants.length) && splits && splits.length) {
        newParticipants = splits.map((s) => s.user);
      }

      if (!Array.isArray(newParticipants) || newParticipants.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Expense must have at least one participant"
        });
      }

      const participantIds = [];
      for (const p of newParticipants) {
        const pid = p?._id ? p._id.toString() : p?.toString();
        if (!pid || !mongoose.Types.ObjectId.isValid(pid)) {
          return res.status(400).json({
            success: false,
            error: `Invalid participant identifier: ${pid}`
          });
        }
        if (!req.group.isMember(pid)) {
          return res.status(400).json({
            success: false,
            error: `Participant ${pid} is not a member of this group`
          });
        }
        participantIds.push(pid);
      }

      if (new Set(participantIds).size !== participantIds.length) {
        return res.status(400).json({
          success: false,
          error: "Participants list cannot contain duplicate users"
        });
      }

      // Recalculate splits on the server
      let calculated;
      try {
        calculated = calculateSplits({
          totalAmount: newAmount,
          splitType: newSplitType,
          participants: participantIds,
          splits: Array.isArray(splits)
            ? splits.map((s) => ({
                ...s,
                user: s.user?._id ? s.user._id.toString() : s.user?.toString()
              }))
            : undefined
        });
      } catch (calcError) {
        return res.status(400).json({
          success: false,
          error: calcError.message
        });
      }

      expense.amount = calculated.totalAmount;
      expense.splitType = newSplitType;
      expense.participants = participantIds.map((id) => new mongoose.Types.ObjectId(id));
      expense.splits = calculated.splits.map((s) => ({
        user: new mongoose.Types.ObjectId(s.user),
        amount: s.amount,
        amountPaise: s.amountPaise,
        percentage: s.percentage,
        exactAmount: s.exactAmount
      }));
    }

    // 6. Save document (runs full schema validation)
    await expense.save();

    const populated = await Expense.findById(expense._id)
      .populate("paidBy", "name email avatar")
      .populate("createdBy", "name email avatar")
      .populate("splits.user", "name email avatar")
      .populate("participants", "name email avatar");

    return res.status(200).json({
      success: true,
      message: "Expense updated successfully",
      expense: formatExpenseResponse(populated || expense)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/v1/groups/:groupId/expenses/:expenseId
 * @desc    Delete an expense in a group
 * @access  Private (Expense Creator, Payer, or Group Admin)
 */
router.delete("/:expenseId", async (req, res, next) => {
  try {
    const { expenseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(expenseId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid expense identifier"
      });
    }

    // 1. Find existing expense strictly within this group
    const expense = await Expense.findOne({
      _id: expenseId,
      group: req.group._id
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        error: "Expense not found in this group"
      });
    }

    // 2. Permission check: Only expense creator, upfront payer, or group admin/creator can delete
    const isAuthorized = canUserModifyExpense(
      expense,
      req.user,
      req.group,
      req.userGroupRole
    );

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Only the expense creator, payer, or a group administrator can delete this expense"
      });
    }

    // 3. Delete expense
    await Expense.findByIdAndDelete(expenseId);

    return res.status(200).json({
      success: true,
      message: "Expense deleted successfully"
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
