const mongoose = require("mongoose");
const crypto = require("node:crypto");
require("./User");

/**
 * Generate a random, human-friendly 8-character invite code
 * Format: sm-XXXXXX (e.g. sm-a8b2c4)
 */
function generateCode() {
  return `sm-${crypto.randomBytes(4).toString("hex")}`;
}

const memberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    role: {
      type: String,
      enum: ["creator", "admin", "member"],
      default: "member"
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Group name is required"],
      trim: true,
      minlength: [2, "Group name must be at least 2 characters long"],
      maxlength: [100, "Group name cannot exceed 100 characters"]
    },
    description: {
      type: String,
      trim: true,
      maxlength: [300, "Description cannot exceed 300 characters"],
      default: ""
    },
    category: {
      type: String,
      enum: {
        values: ["Home", "Trip", "Couple", "Other"],
        message: "{VALUE} is not a supported group category"
      },
      default: "Home"
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Group creator is required"]
    },
    members: {
      type: [memberSchema],
      validate: {
        validator: function (members) {
          return members && members.length > 0;
        },
        message: "A group must have at least one member"
      }
    },
    inviteCode: {
      type: String,
      unique: true,
      sparse: true,
      default: generateCode
    },
    isInviteActive: {
      type: Boolean,
      default: true
    },
    inviteExpiresAt: {
      type: Date,
      // Default invite validity: 30 days from creation
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    },
    settlementVersion: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// Method to verify if a given userId is an active member
groupSchema.methods.isMember = function (userId) {
  if (!userId) return false;
  const targetId = userId._id ? userId._id.toString() : userId.toString();
  return this.members.some(
    (m) => (m.user._id ? m.user._id.toString() : m.user.toString()) === targetId
  );
};

// Method to verify if a user has creator or admin rights
groupSchema.methods.isCreatorOrAdmin = function (userId) {
  if (!userId) return false;
  const targetId = userId._id ? userId._id.toString() : userId.toString();

  // Creator check
  const creatorId = this.creator._id ? this.creator._id.toString() : this.creator.toString();
  if (creatorId === targetId) return true;

  // Admin role check
  const member = this.members.find(
    (m) => (m.user._id ? m.user._id.toString() : m.user.toString()) === targetId
  );
  return member?.role === "admin";
};

// Method to generate a fresh invite code and renew expiration
groupSchema.methods.regenerateInvite = function () {
  this.inviteCode = generateCode();
  this.isInviteActive = true;
  this.inviteExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return this.inviteCode;
};

// Method to revoke the invite code
groupSchema.methods.revokeInvite = function () {
  this.isInviteActive = false;
};

const Group = mongoose.model("Group", groupSchema);

module.exports = Group;
