const mongoose = require("mongoose");
const { toPaise } = require("../utils/expenseSplits");
require("./User");
require("./Group");

const EXPENSE_CATEGORIES = [
  "Food & Drink",
  "Groceries",
  "Transportation",
  "Housing",
  "Utilities",
  "Entertainment",
  "Shopping",
  "Travel",
  "Medical",
  "General",
  "Other"
];

const SPLIT_TYPES = ["equal", "exact", "percentage"];
const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR"];

/**
 * Subdocument schema representing an individual participant's split allocation
 */
const splitAllocationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Participant user reference is required"]
    },
    amount: {
      type: Number,
      required: [true, "Allocated split amount is required"],
      min: [0, "Allocated split amount cannot be negative"]
    },
    amountPaise: {
      type: Number,
      min: [0, "Allocated paise cannot be negative"]
    },
    percentage: {
      type: Number,
      min: [0, "Percentage cannot be negative"],
      max: [100, "Percentage cannot exceed 100"]
    },
    exactAmount: {
      type: Number,
      min: [0, "Exact amount cannot be negative"]
    }
  },
  { _id: false }
);

const expenseSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: [true, "Group reference is required"]
    },
    description: {
      type: String,
      required: [true, "Expense description is required"],
      trim: true,
      minlength: [1, "Description must be at least 1 character long"],
      maxlength: [200, "Description cannot exceed 200 characters"]
    },
    amount: {
      type: Number,
      required: [true, "Expense amount is required"],
      min: [0.01, "Expense amount must be greater than zero"]
    },
    currency: {
      type: String,
      default: "INR",
      trim: true,
      uppercase: true,
      enum: {
        values: SUPPORTED_CURRENCIES,
        message: "{VALUE} is not a supported currency"
      }
    },
    category: {
      type: String,
      default: "General",
      trim: true,
      enum: {
        values: EXPENSE_CATEGORIES,
        message: "{VALUE} is not a supported expense category"
      }
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Payer (paidBy) is required"],
      validate: {
        validator: async function (paidBy) {
          // If DB is connected, verify that payer belongs to the group
          if (!this.group || mongoose.connection.readyState !== 1) return true;
          const Group = mongoose.model("Group");
          const group = await Group.findById(this.group);
          if (!group) return true; // Let group existence validation handle non-existent group
          return group.isMember(paidBy);
        },
        message: "The payer (paidBy) must be an active member of the group"
      }
    },
    participants: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        }
      ],
      validate: [
        {
          validator: function (participants) {
            return Array.isArray(participants) && participants.length > 0;
          },
          message: "An expense must have at least one participant"
        },
        {
          validator: function (participants) {
            if (!Array.isArray(participants)) return false;
            const ids = participants.map((p) => (p._id ? p._id.toString() : p.toString()));
            return new Set(ids).size === ids.length;
          },
          message: "Participants list cannot contain duplicates"
        },
        {
          validator: async function (participants) {
            // If DB is connected, verify that all participants belong to the group
            if (!this.group || mongoose.connection.readyState !== 1 || !Array.isArray(participants)) {
              return true;
            }
            const Group = mongoose.model("Group");
            const group = await Group.findById(this.group);
            if (!group) return true;
            return participants.every((p) => group.isMember(p));
          },
          message: "All participants must be active members of the group"
        }
      ]
    },
    splitType: {
      type: String,
      required: [true, "Split type is required"],
      enum: {
        values: SPLIT_TYPES,
        message: "{VALUE} is not a valid split type"
      },
      default: "equal"
    },
    splits: {
      type: [splitAllocationSchema],
      validate: [
        {
          validator: function (splits) {
            return Array.isArray(splits) && splits.length > 0;
          },
          message: "Expense must have at least one split allocation"
        },
        {
          validator: function (splits) {
            if (!Array.isArray(splits) || !this.amount) return true;
            try {
              const expectedTotalPaise = toPaise(this.amount);
              const actualTotalPaise = splits.reduce((sum, s) => {
                return sum + toPaise(s.amount, { allowZero: true });
              }, 0);
              return expectedTotalPaise === actualTotalPaise;
            } catch {
              return false;
            }
          },
          message: "Sum of split allocations must exactly match the total expense amount"
        },
        {
          validator: function (splits) {
            if (!Array.isArray(splits) || !Array.isArray(this.participants)) return true;
            // Check that every split participant is present in participants list
            const participantSet = new Set(
              this.participants.map((p) => (p._id ? p._id.toString() : p.toString()))
            );
            return splits.every((s) => participantSet.has(s.user.toString()));
          },
          message: "All split recipients must be included in the expense participants list"
        },
        {
          validator: function (splits) {
            if (this.splitType !== "percentage") return true;
            if (!Array.isArray(splits)) return false;
            let totalPct = 0;
            for (const s of splits) {
              if (s.percentage === undefined || s.percentage === null || typeof s.percentage !== "number") {
                return false;
              }
              totalPct += s.percentage;
            }
            return Math.abs(totalPct - 100) < 0.001;
          },
          message: "For percentage splits, each allocation must specify a percentage and the sum must equal 100%"
        },
        {
          validator: function (splits) {
            if (this.splitType !== "equal") return true;
            if (!Array.isArray(splits) || splits.length === 0) return true;
            try {
              const paiseArr = splits.map((s) => toPaise(s.amount, { allowZero: true }));
              const max = Math.max(...paiseArr);
              const min = Math.min(...paiseArr);
              return max - min <= 1;
            } catch {
              return false;
            }
          },
          message: "For equal splits, amounts must be evenly distributed with at most 1 paisa difference"
        }
      ]
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator (createdBy) is required"]
    }
  },
  {
    timestamps: true
  }
);

// Prevent query updates from bypassing validations
expenseSchema.pre(["findOneAndUpdate", "updateOne", "updateMany"], function () {
  this.setOptions({ runValidators: true });
});

// Clean JSON serialization
expenseSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

const Expense = mongoose.model("Expense", expenseSchema);

module.exports = Expense;
module.exports.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
module.exports.SPLIT_TYPES = SPLIT_TYPES;
module.exports.SUPPORTED_CURRENCIES = SUPPORTED_CURRENCIES;
