const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Authentication Middleware (JWT-based)
 * 
 * Verifies standard Bearer token in the Authorization header.
 * Designed with a clean hook architecture so developer API key authentication
 * (e.g. X-API-Key header) can be seamlessly integrated in the future.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // 1. Check for JWT Bearer token
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1]?.trim();

      if (!token) {
        return res.status(401).json({
          success: false,
          error: "Authentication token missing from Bearer header"
        });
      }

      if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured on the server");
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return res.status(401).json({
          success: false,
          error: "User account associated with this token no longer exists"
        });
      }

      req.user = user;
      return next();
    }

    // 2. FUTURE EXTENSION POINT: Developer API Key Authentication
    // if (req.headers["x-api-key"]) {
    //   return authenticateApiKey(req, res, next);
    // }

    // No valid auth credentials provided
    return res.status(401).json({
      success: false,
      error: "Authentication required. Please provide a valid Bearer token"
    });
  } catch (error) {
    // Forward JWT errors (JsonWebTokenError, TokenExpiredError) to centralized errorHandler
    next(error);
  }
}

module.exports = {
  authenticate
};
