const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/User");
const Group = require("../models/Group");
const { app } = require("../server");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_key_for_unit_tests_only";

// User IDs
const USER_A_ID = "65f1a1a1a1a1a1a1a1a1a1a1"; // Creator / Member
const USER_B_ID = "65f1b2b2b2b2b2b2b2b2b2b2"; // Non-member / Stranger
const USER_C_ID = "65f1c3c3c3c3c3c3c3c3c3c3"; // Regular member

const tokenA = jwt.sign({ id: USER_A_ID, email: "userA@example.com" }, process.env.JWT_SECRET);
const tokenB = jwt.sign({ id: USER_B_ID, email: "userB@example.com" }, process.env.JWT_SECRET);
const tokenC = jwt.sign({ id: USER_C_ID, email: "userC@example.com" }, process.env.JWT_SECRET);

const originalUserFindById = User.findById;
const originalGroupFind = Group.find;
const originalGroupFindById = Group.findById;
const originalGroupFindOne = Group.findOne;
const originalGroupCreate = Group.create;
const originalGroupFindByIdAndDelete = Group.findByIdAndDelete;

afterEach(() => {
  User.findById = originalUserFindById;
  Group.find = originalGroupFind;
  Group.findById = originalGroupFindById;
  Group.findOne = originalGroupFindOne;
  Group.create = originalGroupCreate;
  Group.findByIdAndDelete = originalGroupFindByIdAndDelete;
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

function mockUserFind() {
  User.findById = (id) => ({
    select: async () => {
      const idStr = id.toString();
      if (idStr === USER_A_ID) {
        return { _id: USER_A_ID, name: "User A", email: "userA@example.com" };
      }
      if (idStr === USER_B_ID) {
        return { _id: USER_B_ID, name: "User B", email: "userB@example.com" };
      }
      if (idStr === USER_C_ID) {
        return { _id: USER_C_ID, name: "User C", email: "userC@example.com" };
      }
      return null;
    }
  });
}

describe("Task 3: Groups, Membership and Invitations Test Suite", () => {
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

  describe("1. Group Creation (POST /api/v1/groups)", () => {
    it("should reject unauthenticated request with 401", async () => {
      const res = await request(server, {
        method: "POST",
        path: "/api/v1/groups",
        body: { name: "Flatmates 402" }
      });
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    it("should reject empty group name with 400", async () => {
      mockUserFind();
      const res = await request(server, {
        method: "POST",
        path: "/api/v1/groups",
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { name: "   " }
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Group name is required"));
    });

    it("should successfully create group with creator as first member and inviteCode", async () => {
      mockUserFind();

      const createdGroup = new Group({
        _id: new mongoose.Types.ObjectId("65f1d4d4d4d4d4d4d4d4d4d4"),
        name: "Flatmates 402",
        description: "Shared Apartment",
        category: "Home",
        creator: { _id: USER_A_ID, name: "User A" },
        members: [{ user: { _id: USER_A_ID, name: "User A" }, role: "creator", joinedAt: new Date() }],
        inviteCode: "sm-test1234"
      });

      createdGroup.populate = async function () {
        return this;
      };

      Group.create = async () => createdGroup;

      const res = await request(server, {
        method: "POST",
        path: "/api/v1/groups",
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { name: "Flatmates 402", description: "Shared Apartment", category: "Home" }
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.group.name, "Flatmates 402");
      assert.equal(res.body.group.members.length, 1);
      assert.equal(res.body.group.members[0].role, "creator");
      assert.ok(res.body.group.inviteCode);
    });
  });

  describe("2. Group Listing (GET /api/v1/groups)", () => {
    it("should return groups user belongs to", async () => {
      mockUserFind();

      const mockGroup = new Group({
        _id: new mongoose.Types.ObjectId("65f1d4d4d4d4d4d4d4d4d4d4"),
        name: "Flatmates 402",
        category: "Home",
        creator: { _id: USER_A_ID, name: "User A" },
        members: [{ user: { _id: USER_A_ID, name: "User A" }, role: "creator" }]
      });

      Group.find = () => ({
        sort: () => ({
          populate: () => ({
            populate: async () => [mockGroup]
          })
        })
      });

      const res = await request(server, {
        method: "GET",
        path: "/api/v1/groups",
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.count, 1);
      assert.equal(res.body.groups[0].name, "Flatmates 402");
    });
  });

  describe("3. Group Details & Membership Access Control (GET /api/v1/groups/:id)", () => {
    it("should allow verified group member to view details", async () => {
      mockUserFind();

      const mockGroup = new Group({
        _id: new mongoose.Types.ObjectId("65f1d4d4d4d4d4d4d4d4d4d4"),
        name: "Flatmates 402",
        creator: { _id: USER_A_ID, name: "User A" },
        members: [
          { user: { _id: USER_A_ID, name: "User A" }, role: "creator" },
          { user: { _id: USER_C_ID, name: "User C" }, role: "member" }
        ]
      });

      Group.findById = () => ({
        populate: () => ({
          populate: async () => mockGroup
        })
      });

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/65f1d4d4d4d4d4d4d4d4d4d4`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.group.name, "Flatmates 402");
    });

    it("should block non-member with 403 Forbidden to protect private group data", async () => {
      mockUserFind();

      // Group contains User A and User C, but NOT User B
      const mockGroup = new Group({
        _id: new mongoose.Types.ObjectId("65f1d4d4d4d4d4d4d4d4d4d4"),
        name: "Flatmates 402",
        creator: { _id: USER_A_ID, name: "User A" },
        members: [{ user: { _id: USER_A_ID, name: "User A" }, role: "creator" }]
      });

      Group.findById = () => ({
        populate: () => ({
          populate: async () => mockGroup
        })
      });

      // User B attempts to access User A's group
      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/65f1d4d4d4d4d4d4d4d4d4d4`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Access denied. You are not a member"));
    });
  });

  describe("4. Permissions: Updating and Deleting Groups", () => {
    it("should allow creator/admin to update group details", async () => {
      mockUserFind();

      const mockGroup = new Group({
        _id: new mongoose.Types.ObjectId("65f1d4d4d4d4d4d4d4d4d4d4"),
        name: "Old Name",
        creator: { _id: USER_A_ID, name: "User A" },
        members: [{ user: { _id: USER_A_ID, name: "User A" }, role: "creator" }]
      });

      mockGroup.save = async function () {
        return this;
      };

      Group.findById = () => ({
        populate: () => ({
          populate: async () => mockGroup
        })
      });

      const res = await request(server, {
        method: "PUT",
        path: `/api/v1/groups/65f1d4d4d4d4d4d4d4d4d4d4`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { name: "Updated Group Name" }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.group.name, "Updated Group Name");
    });

    it("should prevent regular member from updating group details with 403", async () => {
      mockUserFind();

      const mockGroup = new Group({
        _id: new mongoose.Types.ObjectId("65f1d4d4d4d4d4d4d4d4d4d4"),
        name: "Flatmates 402",
        creator: { _id: USER_A_ID, name: "User A" },
        members: [
          { user: { _id: USER_A_ID, name: "User A" }, role: "creator" },
          { user: { _id: USER_C_ID, name: "User C" }, role: "member" }
        ]
      });

      Group.findById = () => ({
        populate: () => ({
          populate: async () => mockGroup
        })
      });

      // User C (member) attempts to update
      const res = await request(server, {
        method: "PUT",
        path: `/api/v1/groups/65f1d4d4d4d4d4d4d4d4d4d4`,
        headers: { Authorization: `Bearer ${tokenC}` },
        body: { name: "Hacked Name" }
      });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Only group creator or admins"));
    });

    it("should allow only creator to delete group", async () => {
      mockUserFind();

      const mockGroup = new Group({
        _id: new mongoose.Types.ObjectId("65f1d4d4d4d4d4d4d4d4d4d4"),
        name: "Flatmates 402",
        creator: { _id: USER_A_ID, name: "User A" },
        members: [
          { user: { _id: USER_A_ID, name: "User A" }, role: "creator" },
          { user: { _id: USER_C_ID, name: "User C" }, role: "admin" }
        ]
      });

      Group.findById = () => ({
        populate: () => ({
          populate: async () => mockGroup
        })
      });
      Group.findByIdAndDelete = async () => true;

      // User C (admin but not creator) attempts delete -> should fail 403
      const resAdmin = await request(server, {
        method: "DELETE",
        path: `/api/v1/groups/65f1d4d4d4d4d4d4d4d4d4d4`,
        headers: { Authorization: `Bearer ${tokenC}` }
      });
      assert.equal(resAdmin.status, 403);

      // User A (creator) attempts delete -> should succeed 200
      const resCreator = await request(server, {
        method: "DELETE",
        path: `/api/v1/groups/65f1d4d4d4d4d4d4d4d4d4d4`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.equal(resCreator.status, 200);
      assert.equal(resCreator.body.success, true);
    });
  });

  describe("5. Invitations & Joining by Code", () => {
    it("should provide safe public invite preview without exposing member emails", async () => {
      const mockGroup = new Group({
        _id: new mongoose.Types.ObjectId("65f1d4d4d4d4d4d4d4d4d4d4"),
        name: "Goa Roadtrip",
        description: "Beach trip",
        category: "Trip",
        creator: { _id: USER_A_ID, name: "User A" },
        members: [{ user: USER_A_ID, role: "creator" }, { user: USER_C_ID, role: "member" }],
        inviteCode: "sm-goa2024",
        isInviteActive: true
      });

      Group.findOne = () => ({
        populate: async () => mockGroup
      });

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/invite/sm-goa2024`
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.group.name, "Goa Roadtrip");
      assert.equal(res.body.group.memberCount, 2);
      assert.equal(res.body.group.members, undefined, "Private member roster must not be exposed to public");
    });

    it("should allow authenticated non-member to join group using valid invite code", async () => {
      mockUserFind();

      const mockGroup = new Group({
        _id: new mongoose.Types.ObjectId("65f1d4d4d4d4d4d4d4d4d4d4"),
        name: "Goa Roadtrip",
        creator: USER_A_ID,
        members: [{ user: USER_A_ID, role: "creator" }],
        inviteCode: "sm-goa2024",
        isInviteActive: true
      });

      mockGroup.save = async function () {
        return this;
      };
      mockGroup.populate = async function () {
        return this;
      };

      Group.findOne = async () => mockGroup;

      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/join/sm-goa2024`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(mockGroup.members.length, 2);
      assert.equal(mockGroup.members[1].role, "member");
    });

    it("should reject join attempt if user is already a member (duplicate prevention)", async () => {
      mockUserFind();

      const mockGroup = new Group({
        _id: new mongoose.Types.ObjectId("65f1d4d4d4d4d4d4d4d4d4d4"),
        name: "Goa Roadtrip",
        creator: USER_A_ID,
        members: [{ user: USER_A_ID, role: "creator" }],
        inviteCode: "sm-goa2024",
        isInviteActive: true
      });

      Group.findOne = async () => mockGroup;

      // User A is already a member
      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/join/sm-goa2024`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error, "You are already a member of this group");
    });

    it("should reject expired or revoked invitation codes", async () => {
      mockUserFind();

      // Revoked code returns null
      Group.findOne = async () => null;

      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/join/sm-revoked`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });

      assert.equal(res.status, 404);
      assert.ok(res.body.error.includes("invalid or has been revoked"));
    });
  });
});
