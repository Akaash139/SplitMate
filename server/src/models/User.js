const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters long"],
      maxlength: [60, "Name cannot exceed 60 characters"]
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_REGEX, "Please provide a valid email address"]
    },
    password: {
      type: String,
      required: function () {
        return !this.googleId;
      },
      minlength: [6, "Password must be at least 6 characters long"],
      select: false
    },
    avatar: {
      type: String,
      default: ""
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true
    },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local"
    }
  },
  {
    timestamps: true
  }
);

// Hash password before saving (only if password exists and was modified)
userSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Ensure password and internal fields are never exposed in JSON output
userSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  }
});

const User = mongoose.model("User", userSchema);

module.exports = User;
