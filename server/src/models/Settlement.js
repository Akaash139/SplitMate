const mongoose = require("mongoose");
const { toPaise } = require("../utils/expenseSplits");
require("./User");
require("./Group");

const SETTLEMENT_STATUSES = ["completed", "cancelled"];
const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR"];

/**
 * Settlement Schema
 *
 * Tracks direct financial reimbursements between group members.
 * Adjusts group net balances without modifying original expense documents.
 */
const settlementSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: [true, "Group reference is required"],
      index: true
    },
    payer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Payer reference is required"],
      index: true
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Receiver reference is required"],
      index: true
    },
    amount: {
      type: Number,
      required: [true, "Settlement amount is required"],
      min: [0.01, "Settlement amount must be at least ₹0.01"]
    },
    amountPaise: {
      type: Number,
      required: [true, "Amount in integer paise is required"],
      min: [1, "Amount in paise must be at least 1"]
    },
    currency: {
      type: String,
      default: "INR",
      enum: {
        values: SUPPORTED_CURRENCIES,
        message: "{VALUE} is not a supported currency"
      }
    },
    settledAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User who recorded the settlement is required"]
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [200, "Notes cannot exceed 200 characters"],
      default: ""
    },
    idempotencyKey: {
      type: String,
      trim: true,
      sparse: true,
      index: true
    },
    status: {
      type: String,
      enum: SETTLEMENT_STATUSES,
      default: "completed",
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for performant group queries
settlementSchema.index({ group: 1, settledAt: -1 });
settlementSchema.index({ group: 1, payer: 1, receiver: 1 });
settlementSchema.index({ group: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

// Ensure payer and receiver are not identical
settlementSchema.pre("validate", function () {
  if (this.payer && this.receiver) {
    const pStr = this.payer.toString();
    const rStr = this.receiver.toString();
    if (pStr === rStr) {
      this.invalidate("receiver", "Payer and receiver cannot be the same member");
    }
  }

  // Synchronize amount and amountPaise
  if (this.amount !== undefined && this.amountPaise === undefined) {
    try {
      this.amountPaise = toPaise(this.amount);
    } catch {
      this.invalidate("amount", "Invalid settlement monetary amount");
    }
  }
});

// Prevent updates from bypassing validators
settlementSchema.pre(["findOneAndUpdate", "updateOne", "updateMany"], function () {
  this.setOptions({ runValidators: true });
});

// Clean JSON output
settlementSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

const Settlement = mongoose.model("Settlement", settlementSchema);

module.exports = Settlement;
module.exports.SETTLEMENT_STATUSES = SETTLEMENT_STATUSES;
module.exports.SUPPORTED_CURRENCIES = SUPPORTED_CURRENCIES;
