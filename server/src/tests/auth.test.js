const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const { authenticate } = require("../middleware/authMiddleware");
const { errorHandler } = require("../middleware/errorHandler");
const { app } = require("../server");

// Ensure JWT_SECRET is set for tests without revealing any production secrets
process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_key_for_unit_tests_only";

// Save original Mongoose methods to restore after mocks
const originalFindOne = User.findOne;
const originalCreate = User.create;
const originalFindById = User.findById;

afterEach(() => {
  User.findOne = originalFindOne;
  User.create = originalCreate;
  User.findById = originalFindById;
});

// Helper to make HTTP requests against ephemeral test server
function request(server, { method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const payload = body ? JSON.stringify(body) : null;

    const reqHeaders = {
      ...headers,
      ...(payload
        ? {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
          }
        : {})
    };

    const req = http.request(
      {
        host: "127.0.0.1",
        port: address.port,
        method,
        path,
        headers: reqHeaders
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );

    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

describe("Task 1: Authentication & Error Handling Test Suite", () => {
  let server;

  before((done) => {
    // Start ephemeral server on free port to avoid collisions
    server = app.listen(0, "127.0.0.1", done);
  });

  after((done) => {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  describe("1. Password Hashing & Security", () => {
    it("should hash passwords with bcrypt and correctly compare matches", async () => {
      const rawPassword = "StrongPassword123!";
      const user = new User({
        name: "Test User",
        email: "test@example.com",
        password: rawPassword
      });

      // Trigger pre-save hook manually
      await user.validate();
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(user.password, salt);

      assert.notEqual(user.password, rawPassword, "Password must not be stored in plaintext");
      assert.ok(user.password.startsWith("$2"), "Password must be a bcrypt hash");

      const isMatch = await user.comparePassword(rawPassword);
      assert.equal(isMatch, true, "Valid password comparison must return true");

      const isWrongMatch = await user.comparePassword("WrongPassword!");
      assert.equal(isWrongMatch, false, "Invalid password comparison must return false");
    });

    it("should exclude password and __v from serialized JSON output", () => {
      const user = new User({
        name: "Test User",
        email: "test@example.com",
        password: "hashed_dummy_password"
      });

      const json = user.toJSON();
      assert.equal(json.password, undefined, "Password hash must be excluded from toJSON");
      assert.equal(json.__v, undefined, "__v must be excluded from toJSON");
      assert.equal(json.email, "test@example.com");
      assert.equal(json.name, "Test User");
    });
  });

  describe("2. JWT Token Lifecycle", () => {
    it("should generate a valid JWT that decodes expected claims", () => {
      const payload = { id: "user_12345", email: "user@example.com" };
      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      assert.equal(decoded.id, payload.id);
      assert.equal(decoded.email, payload.email);
    });

    it("should reject tampered or invalid JWT signatures", () => {
      const payload = { id: "user_12345", email: "user@example.com" };
      const token = jwt.sign(payload, "wrong_secret");

      assert.throws(
        () => {
          jwt.verify(token, process.env.JWT_SECRET);
        },
        { name: "JsonWebTokenError" }
      );
    });

    it("should reject expired JWTs", async () => {
      const payload = { id: "user_12345", email: "user@example.com" };
      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1ms" });

      // Wait 10ms to guarantee expiration
      await new Promise((r) => setTimeout(r, 10));

      assert.throws(
        () => {
          jwt.verify(token, process.env.JWT_SECRET);
        },
        { name: "TokenExpiredError" }
      );
    });
  });

  describe("3. User Registration Endpoint (POST /api/v1/auth/register)", () => {
    it("should reject registration when name is missing or invalid", async () => {
      const res = await request(server, {
        method: "POST",
        path: "/api/v1/auth/register",
        body: { name: "", email: "user@example.com", password: "password123" }
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Name is required"));
    });

    it("should reject registration when email is invalid", async () => {
      const res = await request(server, {
        method: "POST",
        path: "/api/v1/auth/register",
        body: { name: "Akaash", email: "not-an-email", password: "password123" }
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("valid email"));
    });

    it("should reject registration when password is shorter than 6 characters", async () => {
      const res = await request(server, {
        method: "POST",
        path: "/api/v1/auth/register",
        body: { name: "Akaash", email: "user@example.com", password: "123" }
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("at least 6 characters"));
    });

    it("should reject registration when email already exists", async () => {
      User.findOne = async () => ({ _id: "existing_id", email: "duplicate@example.com" });

      const res = await request(server, {
        method: "POST",
        path: "/api/v1/auth/register",
        body: { name: "Akaash", email: "Duplicate@example.com ", password: "password123" }
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error, "An account with this email already exists");
    });

    it("should successfully register user, return token and sanitized profile without password", async () => {
      User.findOne = async () => null;
      User.create = async ({ name, email }) => ({
        _id: "new_user_123",
        name,
        email,
        avatar: "",
        createdAt: new Date().toISOString()
      });

      const res = await request(server, {
        method: "POST",
        path: "/api/v1/auth/register",
        body: { name: "Akaash", email: "NewUser@example.com ", password: "securePassword123" }
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.token, "Must return signed JWT");
      assert.equal(res.body.user.email, "newuser@example.com", "Email must be normalized to lowercase");
      assert.equal(res.body.user.name, "Akaash");
      assert.equal(res.body.user.password, undefined, "Password hash must never be in response");
    });
  });

  describe("4. User Login Endpoint (POST /api/v1/auth/login)", () => {
    it("should reject login when email or password is missing", async () => {
      const res = await request(server, {
        method: "POST",
        path: "/api/v1/auth/login",
        body: { email: "user@example.com" }
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("both email and password"));
    });

    it("should return generic 401 when user email is not found", async () => {
      User.findOne = () => ({
        select: async () => null
      });

      const res = await request(server, {
        method: "POST",
        path: "/api/v1/auth/login",
        body: { email: "notfound@example.com", password: "somePassword123" }
      });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error, "Invalid email or password");
    });

    it("should return generic 401 when password does not match", async () => {
      User.findOne = () => ({
        select: async () => ({
          _id: "user_123",
          name: "Akaash",
          email: "user@example.com",
          comparePassword: async () => false
        })
      });

      const res = await request(server, {
        method: "POST",
        path: "/api/v1/auth/login",
        body: { email: "user@example.com", password: "wrongPassword" }
      });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error, "Invalid email or password");
    });

    it("should successfully log in, return token and sanitized user on valid credentials", async () => {
      User.findOne = () => ({
        select: async () => ({
          _id: "user_123",
          name: "Akaash",
          email: "user@example.com",
          avatar: "",
          createdAt: new Date().toISOString(),
          comparePassword: async () => true
        })
      });

      const res = await request(server, {
        method: "POST",
        path: "/api/v1/auth/login",
        body: { email: "User@example.com ", password: "correctPassword" }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.token, "Must return signed JWT");
      assert.equal(res.body.user.email, "user@example.com");
      assert.equal(res.body.user.password, undefined, "Password must not be in response");
    });
  });

  describe("5. Protected Route (/api/v1/auth/me) & Auth Middleware", () => {
    it("should return 401 when no Authorization header is provided", async () => {
      const res = await request(server, {
        method: "GET",
        path: "/api/v1/auth/me"
      });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Authentication required"));
    });

    it("should return 401 when invalid Bearer format is provided", async () => {
      const res = await request(server, {
        method: "GET",
        path: "/api/v1/auth/me",
        headers: { Authorization: "Bearer " }
      });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    it("should return 401 when JWT token is invalid or tampered", async () => {
      const res = await request(server, {
        method: "GET",
        path: "/api/v1/auth/me",
        headers: { Authorization: "Bearer invalid.tampered.token" }
      });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Invalid token"));
    });

    it("should return 401 when JWT token has expired", async () => {
      const expiredToken = jwt.sign(
        { id: "user_123", email: "user@example.com" },
        process.env.JWT_SECRET,
        { expiresIn: "1ms" }
      );

      await new Promise((r) => setTimeout(r, 10));

      const res = await request(server, {
        method: "GET",
        path: "/api/v1/auth/me",
        headers: { Authorization: `Bearer ${expiredToken}` }
      });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("expired"));
    });

    it("should return 200 with user profile when valid JWT is provided", async () => {
      const token = jwt.sign(
        { id: "user_123", email: "user@example.com" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      User.findById = () => ({
        select: async () => ({
          _id: "user_123",
          name: "Akaash",
          email: "user@example.com",
          avatar: "",
          createdAt: new Date().toISOString()
        })
      });

      const res = await request(server, {
        method: "GET",
        path: "/api/v1/auth/me",
        headers: { Authorization: `Bearer ${token}` }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.user.name, "Akaash");
      assert.equal(res.body.user.email, "user@example.com");
      assert.equal(res.body.user.password, undefined);
    });
  });

  describe("6. Global Error Handler & 404 Route", () => {
    it("should return clean 404 JSON for undefined routes", async () => {
      const res = await request(server, {
        method: "GET",
        path: "/api/v1/non-existent-route"
      });

      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Route not found"));
    });
  });

  describe("7. Profile Updates (PUT /api/v1/auth/profile)", () => {
    it("should reject unauthenticated profile update with 401", async () => {
      const res = await request(server, {
        method: "PUT",
        path: "/api/v1/auth/profile",
        body: { name: "New Name" }
      });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    it("should reject missing or empty name with 400", async () => {
      const token = jwt.sign(
        { id: "user_123", email: "user@example.com" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      User.findById = () => ({
        select: async () => ({
          _id: "user_123",
          name: "Akaash",
          email: "user@example.com"
        })
      });

      const res = await request(server, {
        method: "PUT",
        path: "/api/v1/auth/profile",
        headers: { Authorization: `Bearer ${token}` },
        body: { name: "   " }
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Name is required"));
    });

    it("should reject name shorter than 2 characters with 400", async () => {
      const token = jwt.sign(
        { id: "user_123", email: "user@example.com" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      User.findById = () => ({
        select: async () => ({
          _id: "user_123",
          name: "Akaash",
          email: "user@example.com"
        })
      });

      const res = await request(server, {
        method: "PUT",
        path: "/api/v1/auth/profile",
        headers: { Authorization: `Bearer ${token}` },
        body: { name: "A" }
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("between 2 and 60"));
    });

    it("should successfully update profile name and return sanitized user", async () => {
      const token = jwt.sign(
        { id: "user_123", email: "user@example.com" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      const mockUserDoc = {
        _id: "user_123",
        name: "Akaash",
        email: "user@example.com",
        avatar: "",
        authProvider: "local",
        createdAt: new Date().toISOString(),
        save: async function () {
          return this;
        }
      };

      // Mock for auth middleware (select("-password"))
      // and mock for route handler (findById(req.user._id))
      User.findById = (id) => {
        return {
          select: async () => mockUserDoc,
          then: (resolve) => resolve(mockUserDoc)
        };
      };

      const res = await request(server, {
        method: "PUT",
        path: "/api/v1/auth/profile",
        headers: { Authorization: `Bearer ${token}` },
        body: { name: "Akaash Paran" }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.user.name, "Akaash Paran");
      assert.equal(res.body.user.password, undefined);
    });
  });

  describe("8. Password Changes (PUT /api/v1/auth/password)", () => {
    it("should reject unauthenticated password change with 401", async () => {
      const res = await request(server, {
        method: "PUT",
        path: "/api/v1/auth/password",
        body: { currentPassword: "OldPassword123", newPassword: "NewPassword123" }
      });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    it("should reject missing passwords with 400", async () => {
      const token = jwt.sign(
        { id: "user_123", email: "user@example.com" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      const mockUser = {
        _id: "user_123",
        name: "Akaash",
        email: "user@example.com",
        authProvider: "local",
        password: "hashed_existing_password"
      };

      User.findById = () => ({
        select: async () => mockUser
      });

      const res = await request(server, {
        method: "PUT",
        path: "/api/v1/auth/password",
        headers: { Authorization: `Bearer ${token}` },
        body: { currentPassword: "oldPassword123" }
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("New password is required"));
    });

    it("should reject new password under 6 characters with 400", async () => {
      const token = jwt.sign(
        { id: "user_123", email: "user@example.com" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      const mockUser = {
        _id: "user_123",
        name: "Akaash",
        email: "user@example.com",
        authProvider: "local",
        password: "hashed_existing_password"
      };

      User.findById = () => ({
        select: async () => mockUser
      });

      const res = await request(server, {
        method: "PUT",
        path: "/api/v1/auth/password",
        headers: { Authorization: `Bearer ${token}` },
        body: { currentPassword: "oldPassword123", newPassword: "123" }
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("at least 6 characters"));
    });

    it("should reject password change for Google-only users without local password", async () => {
      const token = jwt.sign(
        { id: "user_google", email: "google@example.com" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      const mockUser = {
        _id: "user_google",
        name: "Google User",
        email: "google@example.com",
        authProvider: "google",
        password: null
      };

      User.findById = () => ({
        select: async () => mockUser
      });

      const res = await request(server, {
        method: "PUT",
        path: "/api/v1/auth/password",
        headers: { Authorization: `Bearer ${token}` },
        body: { currentPassword: "anyPassword", newPassword: "newValidPassword123" }
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("managed by Google"));
    });

    it("should reject incorrect current password with 400", async () => {
      const token = jwt.sign(
        { id: "user_123", email: "user@example.com" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      const mockUser = {
        _id: "user_123",
        name: "Akaash",
        email: "user@example.com",
        authProvider: "local",
        password: "hashed_password",
        comparePassword: async () => false
      };

      User.findById = () => ({
        select: async () => mockUser
      });

      const res = await request(server, {
        method: "PUT",
        path: "/api/v1/auth/password",
        headers: { Authorization: `Bearer ${token}` },
        body: { currentPassword: "WrongPassword123", newPassword: "NewSecretPassword123" }
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error, "Incorrect current password");
    });

    it("should reject new password if identical to current password with 400", async () => {
      const token = jwt.sign(
        { id: "user_123", email: "user@example.com" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      const mockUser = {
        _id: "user_123",
        name: "Akaash",
        email: "user@example.com",
        authProvider: "local",
        password: "hashed_password",
        comparePassword: async () => true
      };

      User.findById = () => ({
        select: async () => mockUser
      });

      const res = await request(server, {
        method: "PUT",
        path: "/api/v1/auth/password",
        headers: { Authorization: `Bearer ${token}` },
        body: { currentPassword: "SamePassword123", newPassword: "SamePassword123" }
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("cannot be the same"));
    });

    it("should successfully change password when current password is verified", async () => {
      const token = jwt.sign(
        { id: "user_123", email: "user@example.com" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      let savedPassword = null;
      const mockUser = {
        _id: "user_123",
        name: "Akaash",
        email: "user@example.com",
        authProvider: "local",
        password: "hashed_old_password",
        comparePassword: async (candidate) => candidate === "OldPassword123",
        save: async function () {
          savedPassword = this.password;
          return this;
        }
      };

      User.findById = () => ({
        select: async () => mockUser
      });

      const res = await request(server, {
        method: "PUT",
        path: "/api/v1/auth/password",
        headers: { Authorization: `Bearer ${token}` },
        body: { currentPassword: "OldPassword123", newPassword: "BrandNewPassword123" }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.message, "Password changed successfully");
      assert.equal(savedPassword, "BrandNewPassword123");
    });
  });
});
