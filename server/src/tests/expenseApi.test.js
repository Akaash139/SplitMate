const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/User");
const Group = require("../models/Group");
const Expense = require("../models/Expense");
const { app } = require("../server");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_key_for_unit_tests_only";

// Users
const USER_CREATOR_ID = "65f1a1a1a1a1a1a1a1a1a101"; // Group Creator & Admin
const USER_MEMBER_1_ID = "65f1a1a1a1a1a1a1a1a1a102"; // Regular Member 1 (Payer)
const USER_MEMBER_2_ID = "65f1a1a1a1a1a1a1a1a1a103"; // Regular Member 2
const USER_STRANGER_ID = "65f1a1a1a1a1a1a1a1a1a104"; // Non-member

const tokenCreator = jwt.sign({ id: USER_CREATOR_ID, email: "creator@example.com" }, process.env.JWT_SECRET);
const tokenMember1 = jwt.sign({ id: USER_MEMBER_1_ID, email: "member1@example.com" }, process.env.JWT_SECRET);
const tokenMember2 = jwt.sign({ id: USER_MEMBER_2_ID, email: "member2@example.com" }, process.env.JWT_SECRET);
const tokenStranger = jwt.sign({ id: USER_STRANGER_ID, email: "stranger@example.com" }, process.env.JWT_SECRET);

const GROUP_1_ID = "65f1b2b2b2b2b2b2b2b2b201";
const GROUP_2_ID = "65f1b2b2b2b2b2b2b2b2b202";

// Save originals
const originalUserFindById = User.findById;
const originalGroupFindById = Group.findById;
const originalExpenseFind = Expense.find;
const originalExpenseFindOne = Expense.findOne;
const originalExpenseFindById = Expense.findById;
const originalExpenseCreate = Expense.create;
const originalExpenseFindByIdAndDelete = Expense.findByIdAndDelete;

afterEach(() => {
  User.findById = originalUserFindById;
  Group.findById = originalGroupFindById;
  Expense.find = originalExpenseFind;
  Expense.findOne = originalExpenseFindOne;
  Expense.findById = originalExpenseFindById;
  Expense.create = originalExpenseCreate;
  Expense.findByIdAndDelete = originalExpenseFindByIdAndDelete;
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

// Chainable mock helper for Mongoose queries (populate, sort)
function makeQuery(data) {
  const p = Promise.resolve(data);
  p.populate = () => makeQuery(data);
  p.sort = () => makeQuery(data);
  return p;
}

function mockUserFind() {
  User.findById = (id) => ({
    select: async () => {
      const idStr = id.toString();
      if (idStr === USER_CREATOR_ID) {
        return { _id: USER_CREATOR_ID, name: "Group Creator", email: "creator@example.com" };
      }
      if (idStr === USER_MEMBER_1_ID) {
        return { _id: USER_MEMBER_1_ID, name: "Member One", email: "member1@example.com" };
      }
      if (idStr === USER_MEMBER_2_ID) {
        return { _id: USER_MEMBER_2_ID, name: "Member Two", email: "member2@example.com" };
      }
      if (idStr === USER_STRANGER_ID) {
        return { _id: USER_STRANGER_ID, name: "Stranger", email: "stranger@example.com" };
      }
      return null;
    }
  });
}

function createMockGroup(groupId = GROUP_1_ID) {
  const members = [
    { user: { _id: USER_CREATOR_ID, name: "Creator" }, role: "creator" },
    { user: { _id: USER_MEMBER_1_ID, name: "Member 1" }, role: "member" },
    { user: { _id: USER_MEMBER_2_ID, name: "Member 2" }, role: "member" }
  ];

  return {
    _id: groupId,
    name: "Apartment 4B",
    creator: USER_CREATOR_ID,
    members,
    isMember: function (userId) {
      const idStr = userId?._id ? userId._id.toString() : userId?.toString();
      return members.some((m) => m.user._id.toString() === idStr);
    },
    isCreatorOrAdmin: function (userId) {
      const idStr = userId?._id ? userId._id.toString() : userId?.toString();
      if (idStr === USER_CREATOR_ID) return true;
      const mem = members.find((m) => m.user._id.toString() === idStr);
      return mem?.role === "admin";
    }
  };
}

describe("Task 4B: Backend Expense REST API Test Suite", () => {
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

  describe("1. Authentication & Group Authorization Gateways", () => {
    it("should return 401 when no token is provided for expense operations", async () => {
      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses`,
        body: { description: "Groceries", amount: 100 }
      });
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    it("should return 400 when group ID is malformed", async () => {
      mockUserFind();
      const res = await request(server, {
        method: "GET",
        path: "/api/v1/groups/invalid_id/expenses",
        headers: { Authorization: `Bearer ${tokenCreator}` }
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Invalid group identifier"));
    });

    it("should return 404 when group is not found", async () => {
      mockUserFind();
      Group.findById = () => makeQuery(null);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses`,
        headers: { Authorization: `Bearer ${tokenCreator}` }
      });
      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Group not found"));
    });

    it("should return 403 when authenticated user is not a member of the group", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses`,
        headers: { Authorization: `Bearer ${tokenStranger}` }
      });
      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Access denied. You are not a member of this group"));
    });
  });

  describe("2. Creating Expenses (POST /api/v1/groups/:groupId/expenses)", () => {
    it("should successfully create an expense with equal split and recalculate allocations", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      let createdData = null;
      Expense.create = async (doc) => {
        createdData = {
          _id: new mongoose.Types.ObjectId("65f1c3c3c3c3c3c3c3c3c301"),
          ...doc,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        return createdData;
      };

      Expense.findById = (id) => makeQuery(createdData);

      // Client sends equal split for 3 participants; attempts to send bogus client allocations
      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses`,
        headers: { Authorization: `Bearer ${tokenMember1}` },
        body: {
          description: "Apartment Electricity Bill",
          amount: 100,
          category: "Utilities",
          paidBy: USER_MEMBER_1_ID,
          splitType: "equal",
          participants: [USER_CREATOR_ID, USER_MEMBER_1_ID, USER_MEMBER_2_ID],
          splits: [
            { user: USER_CREATOR_ID, amount: 99 }, // Bogus allocation to test server recalculation
            { user: USER_MEMBER_1_ID, amount: 1 }
          ]
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.expense.description, "Apartment Electricity Bill");
      assert.equal(res.body.expense.amount, 100);
      assert.equal(res.body.expense.category, "Utilities");
      // createdBy must be derived strictly from the authenticated user token (tokenMember1)
      assert.equal(createdData.createdBy.toString(), USER_MEMBER_1_ID);

      // Server recalculation check: 100 / 3 => 33.34, 33.33, 33.33
      assert.equal(res.body.expense.splits.length, 3);
      assert.equal(res.body.expense.splits[0].amount, 33.34);
      assert.equal(res.body.expense.splits[1].amount, 33.33);
      assert.equal(res.body.expense.splits[2].amount, 33.33);
    });

    it("should successfully create an expense with exact split", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      let createdData = null;
      Expense.create = async (doc) => {
        createdData = {
          _id: new mongoose.Types.ObjectId("65f1c3c3c3c3c3c3c3c3c302"),
          ...doc,
          createdAt: new Date()
        };
        return createdData;
      };
      Expense.findById = () => makeQuery(createdData);

      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses`,
        headers: { Authorization: `Bearer ${tokenCreator}` },
        body: {
          description: "Dinner & Drinks",
          amount: 150,
          category: "Food & Drink",
          paidBy: USER_CREATOR_ID,
          splitType: "exact",
          splits: [
            { user: USER_CREATOR_ID, amount: 90 },
            { user: USER_MEMBER_1_ID, amount: 60 }
          ]
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.expense.amount, 150);
      assert.equal(res.body.expense.splits[0].amount, 90);
      assert.equal(res.body.expense.splits[1].amount, 60);
    });

    it("should successfully create an expense with percentage split", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      let createdData = null;
      Expense.create = async (doc) => {
        createdData = {
          _id: new mongoose.Types.ObjectId("65f1c3c3c3c3c3c3c3c3c303"),
          ...doc,
          createdAt: new Date()
        };
        return createdData;
      };
      Expense.findById = () => makeQuery(createdData);

      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses`,
        headers: { Authorization: `Bearer ${tokenCreator}` },
        body: {
          description: "Groceries",
          amount: 200,
          paidBy: USER_CREATOR_ID,
          splitType: "percentage",
          splits: [
            { user: USER_CREATOR_ID, percentage: 60 },
            { user: USER_MEMBER_1_ID, percentage: 40 }
          ]
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.expense.splits[0].amount, 120);
      assert.equal(res.body.expense.splits[1].amount, 80);
    });

    it("should reject creation when payer (paidBy) is not a group member", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses`,
        headers: { Authorization: `Bearer ${tokenCreator}` },
        body: {
          description: "Illegal Payer Test",
          amount: 100,
          paidBy: USER_STRANGER_ID, // Stranger is not in group
          splitType: "equal",
          participants: [USER_CREATOR_ID, USER_MEMBER_1_ID]
        }
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Payer must be an active member of this group"));
    });

    it("should reject creation when a participant is not a group member", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses`,
        headers: { Authorization: `Bearer ${tokenCreator}` },
        body: {
          description: "Illegal Participant Test",
          amount: 100,
          paidBy: USER_CREATOR_ID,
          splitType: "equal",
          participants: [USER_CREATOR_ID, USER_STRANGER_ID] // Stranger is not in group
        }
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("not a member of this group"));
    });

    it("should reject creation with missing description or non-positive amount", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      // Missing description
      const res1 = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses`,
        headers: { Authorization: `Bearer ${tokenCreator}` },
        body: { amount: 50, paidBy: USER_CREATOR_ID, participants: [USER_CREATOR_ID] }
      });
      assert.equal(res1.status, 400);

      // Negative amount
      const res2 = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses`,
        headers: { Authorization: `Bearer ${tokenCreator}` },
        body: { description: "Negative test", amount: -20, paidBy: USER_CREATOR_ID, participants: [USER_CREATOR_ID] }
      });
      assert.equal(res2.status, 400);
    });

    it("should reject exact split when allocations do not sum to total amount", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses`,
        headers: { Authorization: `Bearer ${tokenCreator}` },
        body: {
          description: "Mismatched exact split",
          amount: 100,
          paidBy: USER_CREATOR_ID,
          splitType: "exact",
          splits: [
            { user: USER_CREATOR_ID, amount: 40 },
            { user: USER_MEMBER_1_ID, amount: 40 } // Sum = 80
          ]
        }
      });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.includes("does not equal the expense total"));
    });

    it("should reject percentage split when percentages do not total 100%", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses`,
        headers: { Authorization: `Bearer ${tokenCreator}` },
        body: {
          description: "Mismatched percentage split",
          amount: 100,
          paidBy: USER_CREATOR_ID,
          splitType: "percentage",
          splits: [
            { user: USER_CREATOR_ID, percentage: 60 },
            { user: USER_MEMBER_1_ID, percentage: 30 } // Sum = 90%
          ]
        }
      });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.includes("Percentages must total 100%"));
    });
  });

  describe("3. Listing Expenses & Group Isolation (GET /api/v1/groups/:groupId/expenses)", () => {
    it("should return expenses scoped strictly to the requested group", async () => {
      mockUserFind();
      const mockGroup1 = createMockGroup(GROUP_1_ID);
      Group.findById = () => makeQuery(mockGroup1);

      const expensesG1 = [
        {
          _id: "65f1c3c3c3c3c3c3c3c3c311",
          group: GROUP_1_ID,
          description: "Expense 1 in Group 1",
          amount: 100,
          splitType: "equal",
          createdAt: new Date()
        },
        {
          _id: "65f1c3c3c3c3c3c3c3c3c312",
          group: GROUP_1_ID,
          description: "Expense 2 in Group 1",
          amount: 250,
          splitType: "equal",
          createdAt: new Date()
        }
      ];

      Expense.find = (query) => {
        // Assert group isolation in query
        assert.equal(query.group.toString(), GROUP_1_ID);
        return makeQuery(expensesG1);
      };

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses`,
        headers: { Authorization: `Bearer ${tokenMember1}` }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.count, 2);
      assert.equal(res.body.expenses[0].description, "Expense 1 in Group 1");
    });
  });

  describe("4. Retrieving an Expense (GET /api/v1/groups/:groupId/expenses/:expenseId)", () => {
    it("should successfully retrieve an existing expense", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      const expense = {
        _id: "65f1c3c3c3c3c3c3c3c3c321",
        group: GROUP_1_ID,
        description: "Coffee Batch",
        amount: 80,
        splitType: "equal",
        splits: [],
        createdAt: new Date()
      };

      Expense.findOne = (query) => {
        assert.equal(query._id.toString(), "65f1c3c3c3c3c3c3c3c3c321");
        assert.equal(query.group.toString(), GROUP_1_ID);
        return makeQuery(expense);
      };

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses/65f1c3c3c3c3c3c3c3c3c321`,
        headers: { Authorization: `Bearer ${tokenMember1}` }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.expense.description, "Coffee Batch");
    });

    it("should return 404 when expense is not found in the group", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      Expense.findOne = () => makeQuery(null);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses/65f1c3c3c3c3c3c3c3c3c399`,
        headers: { Authorization: `Bearer ${tokenMember1}` }
      });

      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Expense not found in this group"));
    });
  });

  describe("5. Updating an Expense (PUT /api/v1/groups/:groupId/expenses/:expenseId)", () => {
    it("should allow expense creator to update details and recalculate splits", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      const existingExpense = {
        _id: "65f1c3c3c3c3c3c3c3c3c331",
        group: GROUP_1_ID,
        description: "Original Lunch",
        amount: 100,
        splitType: "equal",
        paidBy: USER_MEMBER_1_ID,
        participants: [USER_CREATOR_ID, USER_MEMBER_1_ID],
        createdBy: USER_MEMBER_1_ID,
        splits: [
          { user: USER_CREATOR_ID, amount: 50 },
          { user: USER_MEMBER_1_ID, amount: 50 }
        ],
        save: async function () { return this; }
      };

      Expense.findOne = () => makeQuery(existingExpense);
      Expense.findById = () => makeQuery(existingExpense);

      const res = await request(server, {
        method: "PUT",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses/65f1c3c3c3c3c3c3c3c3c331`,
        headers: { Authorization: `Bearer ${tokenMember1}` }, // User is the creator
        body: {
          description: "Updated Lunch + Desserts",
          amount: 120 // Updated amount should trigger recalculation
        }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(existingExpense.description, "Updated Lunch + Desserts");
      assert.equal(existingExpense.amount, 120);
      // Splits recalculated: 120 / 2 => 60, 60
      assert.equal(existingExpense.splits[0].amount, 60);
      assert.equal(existingExpense.splits[1].amount, 60);
    });

    it("should allow group admin to update an expense", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      const existingExpense = {
        _id: "65f1c3c3c3c3c3c3c3c3c332",
        group: GROUP_1_ID,
        description: "Misc Supplies",
        amount: 50,
        splitType: "equal",
        paidBy: USER_MEMBER_1_ID,
        createdBy: USER_MEMBER_1_ID, // Created by Member 1
        participants: [USER_MEMBER_1_ID, USER_MEMBER_2_ID],
        save: async function () { return this; }
      };

      Expense.findOne = () => makeQuery(existingExpense);
      Expense.findById = () => makeQuery(existingExpense);

      // Creator token (has admin/creator role in group) updates the expense
      const res = await request(server, {
        method: "PUT",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses/65f1c3c3c3c3c3c3c3c3c332`,
        headers: { Authorization: `Bearer ${tokenCreator}` },
        body: { category: "Shopping" }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(existingExpense.category, "Shopping");
    });

    it("should reject update by regular member who is neither creator nor payer (403)", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      const existingExpense = {
        _id: "65f1c3c3c3c3c3c3c3c3c333",
        group: GROUP_1_ID,
        description: "Member 1 Expense",
        amount: 50,
        paidBy: USER_MEMBER_1_ID,
        createdBy: USER_MEMBER_1_ID,
        participants: [USER_MEMBER_1_ID, USER_MEMBER_2_ID]
      };

      Expense.findOne = () => makeQuery(existingExpense);

      // Member 2 (neither creator, payer, nor admin) attempts to update
      const res = await request(server, {
        method: "PUT",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses/65f1c3c3c3c3c3c3c3c3c333`,
        headers: { Authorization: `Bearer ${tokenMember2}` },
        body: { description: "Unauthorized edit" }
      });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Access denied. Only the expense creator, payer, or a group administrator"));
    });
  });

  describe("6. Deleting an Expense (DELETE /api/v1/groups/:groupId/expenses/:expenseId)", () => {
    it("should allow expense creator or group admin to delete an expense", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      const existingExpense = {
        _id: "65f1c3c3c3c3c3c3c3c3c341",
        group: GROUP_1_ID,
        paidBy: USER_MEMBER_1_ID,
        createdBy: USER_MEMBER_1_ID
      };

      Expense.findOne = () => makeQuery(existingExpense);

      let deletedId = null;
      Expense.findByIdAndDelete = async (id) => {
        deletedId = id;
        return existingExpense;
      };

      const res = await request(server, {
        method: "DELETE",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses/65f1c3c3c3c3c3c3c3c3c341`,
        headers: { Authorization: `Bearer ${tokenMember1}` }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.message, "Expense deleted successfully");
      assert.equal(deletedId, "65f1c3c3c3c3c3c3c3c3c341");
    });

    it("should reject delete attempt by unauthorized member (403)", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      const existingExpense = {
        _id: "65f1c3c3c3c3c3c3c3c3c342",
        group: GROUP_1_ID,
        paidBy: USER_CREATOR_ID,
        createdBy: USER_CREATOR_ID
      };

      Expense.findOne = () => makeQuery(existingExpense);

      const res = await request(server, {
        method: "DELETE",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses/65f1c3c3c3c3c3c3c3c3c342`,
        headers: { Authorization: `Bearer ${tokenMember2}` }
      });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Access denied. Only the expense creator, payer, or a group administrator"));
    });
  });
});
