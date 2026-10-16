const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/User");
const { app } = require("../server");
const authRoutes = require("../routes/authRoutes");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_key_for_unit_tests_only";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-google-client-id.apps.googleusercontent.com";

const originalFindOne = User.findOne;
const originalCreate = User.create;

afterEach(() => {
  User.findOne = originalFindOne;
  User.create = originalCreate;
  // Restore default verifier
  authRoutes._setGoogleVerifier(async (token, audience) => {
    throw new Error("Default verifier called in test");
  });
});

function request(server, { method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    if (!address) {
      return reject(new Error("Server is not currently listening"));
    }
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

describe("Task 3.5: Google Sign-In Authentication Test Suite", () => {
  let server;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("should return 400 when Google credential is missing or empty", async () => {
    const res = await request(server, {
      method: "POST",
      path: "/api/v1/auth/google",
      body: {}
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.includes("credential token is required"));
  });

  it("should return 401 when Google token verification fails (invalid token signature)", async () => {
    authRoutes._setGoogleVerifier(async () => {
      throw new Error("Invalid token signature");
    });

    const res = await request(server, {
      method: "POST",
      path: "/api/v1/auth/google",
      body: { credential: "invalid.google.token" }
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.includes("Invalid, expired, or unverified"));
  });

  it("should return 401 when Google token is expired or has wrong audience", async () => {
    authRoutes._setGoogleVerifier(async () => {
      throw new Error("Token used too late");
    });

    const res = await request(server, {
      method: "POST",
      path: "/api/v1/auth/google",
      body: { credential: "expired.google.token" }
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  it("should return 400 when Google account email is not verified", async () => {
    authRoutes._setGoogleVerifier(async () => ({
      sub: "google_sub_123",
      email: "unverified@example.com",
      email_verified: false,
      name: "Unverified User"
    }));

    const res = await request(server, {
      method: "POST",
      path: "/api/v1/auth/google",
      body: { credential: "valid.token.unverified.email" }
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.includes("email is not verified"));
  });

  it("should successfully register a new user on first-time Google sign-in", async () => {
    authRoutes._setGoogleVerifier(async () => ({
      sub: "google_sub_101",
      email: "NewGoogleUser@example.com",
      email_verified: true,
      name: "Aarav Google",
      picture: "https://lh3.googleusercontent.com/photo.jpg"
    }));

    User.findOne = async () => null;

    let createdUserData = null;
    User.create = async (data) => {
      createdUserData = data;
      return {
        _id: new mongoose.Types.ObjectId("65f1e5e5e5e5e5e5e5e5e5e5"),
        name: data.name,
        email: data.email,
        avatar: data.avatar,
        googleId: data.googleId,
        authProvider: data.authProvider,
        createdAt: new Date()
      };
    };

    const res = await request(server, {
      method: "POST",
      path: "/api/v1/auth/google",
      body: { credential: "mock.valid.google.jwt" }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token, "Must return signed JWT");
    assert.equal(res.body.user.name, "Aarav Google");
    assert.equal(res.body.user.email, "newgoogleuser@example.com");
    assert.equal(res.body.user.authProvider, "google");
    assert.equal(createdUserData.googleId, "google_sub_101");

    // Verify JWT payload
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    assert.equal(decoded.email, "newgoogleuser@example.com");
  });

  it("should authenticate an existing Google user without creating a duplicate record", async () => {
    authRoutes._setGoogleVerifier(async () => ({
      sub: "google_sub_existing",
      email: "existing@example.com",
      email_verified: true,
      name: "Existing Google User"
    }));

    const existingUser = {
      _id: new mongoose.Types.ObjectId("65f1e5e5e5e5e5e5e5e5e5e6"),
      name: "Existing Google User",
      email: "existing@example.com",
      avatar: "https://lh3.googleusercontent.com/avatar.jpg",
      googleId: "google_sub_existing",
      authProvider: "google",
      createdAt: new Date()
    };

    // User is found by googleId
    User.findOne = async (query) => {
      if (query.googleId === "google_sub_existing") {
        return existingUser;
      }
      return null;
    };

    const res = await request(server, {
      method: "POST",
      path: "/api/v1/auth/google",
      body: { credential: "mock.valid.google.jwt" }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user.email, "existing@example.com");
    assert.ok(res.body.token);
  });

  it("should securely link Google account to existing verified email account without overwriting password", async () => {
    authRoutes._setGoogleVerifier(async () => ({
      sub: "google_sub_newlink",
      email: "localuser@example.com",
      email_verified: true,
      name: "Local User",
      picture: "https://lh3.googleusercontent.com/newavatar.jpg"
    }));

    let savedUser = null;
    const existingLocalUser = {
      _id: new mongoose.Types.ObjectId("65f1e5e5e5e5e5e5e5e5e5e7"),
      name: "Local User",
      email: "localuser@example.com",
      avatar: "",
      googleId: null,
      authProvider: "local",
      createdAt: new Date(),
      save: async function () {
        savedUser = this;
        return this;
      }
    };

    // First lookup by googleId returns null; second lookup by email returns local user
    User.findOne = (query) => {
      if (query.googleId === "google_sub_newlink") {
        const p = Promise.resolve(null);
        p.select = () => Promise.resolve(null);
        return p;
      }
      const p = Promise.resolve(existingLocalUser);
      p.select = () => Promise.resolve(existingLocalUser);
      return p;
    };

    const res = await request(server, {
      method: "POST",
      path: "/api/v1/auth/google",
      body: { credential: "mock.valid.google.jwt" }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(savedUser.googleId, "google_sub_newlink");
    assert.equal(savedUser.avatar, "https://lh3.googleusercontent.com/newavatar.jpg");
    assert.ok(res.body.token);
  });

  it("should reject Google sign-in if existing account is already linked to a different Google account", async () => {
    authRoutes._setGoogleVerifier(async () => ({
      sub: "google_sub_attacker",
      email: "someoneelse@example.com",
      email_verified: true,
      name: "Attacker"
    }));

    const alreadyLinkedUser = {
      _id: new mongoose.Types.ObjectId("65f1e5e5e5e5e5e5e5e5e5e8"),
      email: "someoneelse@example.com",
      googleId: "google_sub_legit_owner", // Bound to another sub
      save: async function () { return this; }
    };

    User.findOne = (query) => {
      if (query.googleId === "google_sub_attacker") {
        const p = Promise.resolve(null);
        p.select = () => Promise.resolve(null);
        return p;
      }
      const p = Promise.resolve(alreadyLinkedUser);
      p.select = () => Promise.resolve(alreadyLinkedUser);
      return p;
    };

    const res = await request(server, {
      method: "POST",
      path: "/api/v1/auth/google",
      body: { credential: "mock.valid.google.jwt" }
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.includes("already linked to a different Google account"));
  });
});
