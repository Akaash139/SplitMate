const express = require("express");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const { authenticate } = require("../middleware/authMiddleware");

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Google ID token verifier (mockable for unit tests)
 */
let verifyGoogleToken = async (idToken, audience) => {
  const client = new OAuth2Client(audience);
  const ticket = await client.verifyIdToken({
    idToken,
    audience
  });
  return ticket.getPayload();
};

/**
 * Generate a signed JWT for an authenticated user
 */
function generateToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured on the server");
  }
  return jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

/**
 * Sanitize user object to ensure no internal hashes or sensitive fields leak
 */
function formatUserResponse(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar || "",
    authProvider: user.authProvider || "local",
    createdAt: user.createdAt
  };
}

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user account (email & password)
 * @access  Public
 */
router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // 1. Input presence validation
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Name is required and must be a valid string"
      });
    }

    if (name.trim().length < 2 || name.trim().length > 60) {
      return res.status(400).json({
        success: false,
        error: "Name must be between 2 and 60 characters long"
      });
    }

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        error: "Please provide a valid email address"
      });
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password is required and must be at least 6 characters long"
      });
    }

    // 2. Uniqueness check
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: "An account with this email already exists"
      });
    }

    // 3. Create user (password is automatically hashed via pre-save hook)
    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      authProvider: "local"
    });

    // 4. Issue JWT
    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: formatUserResponse(newUser)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user with email & password, return JWT
 * @access  Public
 */
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1. Basic validation
    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        error: "Please provide both email and password"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 2. Fetch user with password hash explicitly selected
    const user = await User.findOne({ email: normalizedEmail }).select("+password");

    // Generic error to prevent account enumeration
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password"
      });
    }

    // 3. Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password"
      });
    }

    // 4. Issue JWT
    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: formatUserResponse(user)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/auth/google
 * @desc    Authenticate or register user using verified Google ID token
 * @access  Public
 */
router.post("/google", async (req, res, next) => {
  try {
    const { credential } = req.body;

    if (!credential || typeof credential !== "string" || !credential.trim()) {
      return res.status(400).json({
        success: false,
        error: "Google credential token is required"
      });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error("GOOGLE_CLIENT_ID is not configured on the server");
    }

    // Cryptographic token verification
    let payload;
    try {
      payload = await verifyGoogleToken(credential, clientId);
    } catch {
      return res.status(401).json({
        success: false,
        error: "Invalid, expired, or unverified Google token"
      });
    }

    if (!payload || !payload.sub || !payload.email) {
      return res.status(401).json({
        success: false,
        error: "Invalid token payload received from Google"
      });
    }

    // Security check: Reject unverified emails
    if (!payload.email_verified) {
      return res.status(400).json({
        success: false,
        error: "Google account email is not verified"
      });
    }

    const googleSub = payload.sub;
    const normalizedEmail = payload.email.trim().toLowerCase();
    const displayName = payload.name?.trim() || "SplitMate User";
    const avatarUrl = payload.picture || "";

    // 1. Check if user already exists with this googleId
    let user = await User.findOne({ googleId: googleSub });

    if (!user) {
      // 2. Check if user already exists with matching verified email
      user = await User.findOne({ email: normalizedEmail });

      if (user) {
        // Prevent collision if already bound to another Google ID
        if (user.googleId && user.googleId !== googleSub) {
          return res.status(400).json({
            success: false,
            error: "An account with this email is already linked to a different Google account"
          });
        }

        // Secure account linking policy:
        // Google has cryptographically verified that the user controls this email address.
        // Link the verified googleId to the existing user without mutating or exposing password.
        user.googleId = googleSub;
        if (!user.avatar && avatarUrl) {
          user.avatar = avatarUrl;
        }
        await user.save();
      }
    }

    // 3. If user does not exist, create new Google user (no password required)
    if (!user) {
      user = await User.create({
        name: displayName,
        email: normalizedEmail,
        avatar: avatarUrl,
        googleId: googleSub,
        authProvider: "google"
      });
    }

    // 4. Issue standard SplitMate JWT
    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: "Google sign-in successful",
      token,
      user: formatUserResponse(user)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get currently authenticated user's profile
 * @access  Private (JWT)
 */
router.get("/me", authenticate, async (req, res) => {
  res.status(200).json({
    success: true,
    user: formatUserResponse(req.user)
  });
});

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    Update currently authenticated user's profile information (name)
 * @access  Private (JWT)
 */
router.put("/profile", authenticate, async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Name is required and cannot be empty"
      });
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 60) {
      return res.status(400).json({
        success: false,
        error: "Name must be between 2 and 60 characters long"
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    user.name = trimmedName;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: formatUserResponse(user)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/v1/auth/password
 * @desc    Change password for email/password accounts
 * @access  Private (JWT)
 */
router.put("/password", authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Google-only accounts do not have passwords stored in SplitMate
    if (user.authProvider === "google" && !user.password) {
      return res.status(400).json({
        success: false,
        error: "Password changes are unavailable for accounts managed by Google. Please manage your security in your Google Account."
      });
    }

    if (!currentPassword || typeof currentPassword !== "string") {
      return res.status(400).json({
        success: false,
        error: "Current password is required"
      });
    }

    if (!newPassword || typeof newPassword !== "string") {
      return res.status(400).json({
        success: false,
        error: "New password is required"
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 6 characters long"
      });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: "Incorrect current password"
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        error: "New password cannot be the same as your current password"
      });
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully"
    });
  } catch (error) {
    next(error);
  }
});

// Test hook to allow mocking Google token verification without network calls
router._setGoogleVerifier = (fn) => {
  verifyGoogleToken = fn;
};

module.exports = router;
