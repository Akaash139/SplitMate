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

// User IDs
const USER_ALICE_ID = "65f1a1a1a1a1a1a1a1a1a101"; // Alice (Creator)
const USER_BOB_ID = "65f1a1a1a1a1a1a1a1a1a102"; // Bob (Member)
const USER_CHARLIE_ID = "65f1a1a1a1a1a1a1a1a1a103"; // Charlie (Member)
const USER_DAVID_ID = "65f1a1a1a1a1a1a1a1a1a104"; // David (Inactive Member)
const USER_STRANGER_ID = "65f1a1a1a1a1a1a1a1a1a105"; // Non-member

// JWT Tokens
const tokenAlice = jwt.sign({ id: USER_ALICE_ID, email: "alice@example.com" }, process.env.JWT_SECRET);
const tokenBob = jwt.sign({ id: USER_BOB_ID, email: "bob@example.com" }, process.env.JWT_SECRET);
const tokenCharlie = jwt.sign({ id: USER_CHARLIE_ID, email: "charlie@example.com" }, process.env.JWT_SECRET);
const tokenDavid = jwt.sign({ id: USER_DAVID_ID, email: "david@example.com" }, process.env.JWT_SECRET);
const tokenStranger = jwt.sign({ id: USER_STRANGER_ID, email: "stranger@example.com" }, process.env.JWT_SECRET);

// Groups
const GROUP_1_ID = "65f1b2b2b2b2b2b2b2b2b201";
const GROUP_2_ID = "65f1b2b2b2b2b2b2b2b2b202";

const Settlement = require("../models/Settlement");

// Save original Mongoose methods
const originalUserFindById = User.findById;
const originalGroupFindById = Group.findById;
const originalExpenseFind = Expense.find;
const originalSettlementFind = Settlement.find;

// Default Settlement mock to empty list
Settlement.find = () => makeQuery([]);

afterEach(() => {
  User.findById = originalUserFindById;
  Group.findById = originalGroupFindById;
  Expense.find = originalExpenseFind;
  Settlement.find = () => makeQuery([]);
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

function makeQuery(data) {
  const p = Promise.resolve(data);
  p.populate = () => makeQuery(data);
  p.sort = () => makeQuery(data);
  p.lean = () => Promise.resolve(data);
  return p;
}

function mockUserFind() {
  User.findById = (id) => ({
    select: async () => {
      const idStr = id.toString();
      if (idStr === USER_ALICE_ID) {
        return { _id: USER_ALICE_ID, name: "Alice", email: "alice@example.com" };
      }
      if (idStr === USER_BOB_ID) {
        return { _id: USER_BOB_ID, name: "Bob", email: "bob@example.com" };
      }
      if (idStr === USER_CHARLIE_ID) {
        return { _id: USER_CHARLIE_ID, name: "Charlie", email: "charlie@example.com" };
      }
      if (idStr === USER_DAVID_ID) {
        return { _id: USER_DAVID_ID, name: "David", email: "david@example.com" };
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
    { user: { _id: USER_ALICE_ID, name: "Alice", email: "alice@example.com" }, role: "creator" },
    { user: { _id: USER_BOB_ID, name: "Bob", email: "bob@example.com" }, role: "member" },
    { user: { _id: USER_CHARLIE_ID, name: "Charlie", email: "charlie@example.com" }, role: "member" },
    { user: { _id: USER_DAVID_ID, name: "David", email: "david@example.com" }, role: "member" }
  ];

  return {
    _id: groupId,
    name: "Apartment 4B",
    creator: USER_ALICE_ID,
    members,
    isMember: function (userId) {
      const idStr = userId?._id ? userId._id.toString() : userId?.toString();
      return members.some((m) => m.user._id.toString() === idStr);
    },
    isCreatorOrAdmin: function (userId) {
      const idStr = userId?._id ? userId._id.toString() : userId?.toString();
      if (idStr === USER_ALICE_ID) return true;
      const mem = members.find((m) => m.user._id.toString() === idStr);
      return mem?.role === "admin";
    }
  };
}

describe("Task 5B: Balance & Suggested Settlements API Test Suite", () => {
  let server;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
  });

  after(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  });

  describe("1. Authentication and Authorization", () => {
    it("should reject unauthenticated requests to balances endpoint (401)", async () => {
      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/balances`
      });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Authentication required"));
    });

    it("should reject unauthenticated requests to settlement-suggestions endpoint (401)", async () => {
      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/settlement-suggestions`
      });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    it("should reject a non-member attempting to retrieve balances (403)", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/balances`,
        headers: { Authorization: `Bearer ${tokenStranger}` }
      });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Access denied. You are not a member of this group"));
    });

    it("should reject a non-member attempting to retrieve settlement suggestions (403)", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/settlement-suggestions`,
        headers: { Authorization: `Bearer ${tokenStranger}` }
      });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Access denied. You are not a member of this group"));
    });

    it("should reject invalid group ObjectId with 400", async () => {
      mockUserFind();

      const res = await request(server, {
        method: "GET",
        path: "/api/v1/groups/not-a-valid-id/balances",
        headers: { Authorization: `Bearer ${tokenAlice}` }
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
        path: `/api/v1/groups/${GROUP_1_ID}/balances`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Group not found"));
    });
  });

  describe("2. Empty Groups and Zero Balances", () => {
    it("should return zero balances and represent all members when group has no expenses", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);
      Expense.find = () => makeQuery([]);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/balances`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.totalExpenses, 0);
      assert.equal(res.body.totalExpensesPaise, 0);
      assert.equal(res.body.expenseCount, 0);
      assert.equal(res.body.memberCount, 4);

      // All 4 members are represented with 0 net balance
      assert.equal(res.body.memberBalances.length, 4);
      for (const mb of res.body.memberBalances) {
        assert.equal(mb.netBalance, 0);
        assert.equal(mb.netBalancePaise, 0);
        assert.equal(mb.status, "settled");
      }

      // Check current user balance
      assert.equal(res.body.currentUserBalance.netBalance, 0);
      assert.equal(res.body.currentUserBalance.status, "settled");
    });

    it("should return empty transfers and isSettled=true for empty group settlement suggestions", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);
      Expense.find = () => makeQuery([]);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/settlement-suggestions`,
        headers: { Authorization: `Bearer ${tokenBob}` }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.isSettled, true);
      assert.equal(res.body.transferCount, 0);
      assert.deepEqual(res.body.transfers, []);
    });
  });

  describe("3. Group Isolation", () => {
    it("should fetch only the requested group expenses and maintain complete isolation", async () => {
      mockUserFind();
      const mockGroup1 = createMockGroup(GROUP_1_ID);
      Group.findById = (id) => {
        if (id.toString() === GROUP_1_ID) return makeQuery(mockGroup1);
        return makeQuery(null);
      };

      // Filter check in Expense.find
      let receivedFilter = null;
      Expense.find = (filter) => {
        receivedFilter = filter;
        return makeQuery([
          {
            group: GROUP_1_ID,
            amount: 100,
            amountPaise: 10000,
            paidBy: USER_ALICE_ID,
            splits: [
              { user: USER_ALICE_ID, amount: 50, amountPaise: 5000 },
              { user: USER_BOB_ID, amount: 50, amountPaise: 5000 }
            ]
          }
        ]);
      };

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/balances`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(receivedFilter.group.toString(), GROUP_1_ID);
      assert.equal(res.body.totalExpenses, 100);
    });

    it("should block member of Group 1 from accessing Group 2 if not a member of Group 2", async () => {
      mockUserFind();
      // Group 2 where only Bob and Charlie belong (Alice is stranger to Group 2)
      const group2Members = [
        { user: { _id: USER_BOB_ID, name: "Bob" }, role: "creator" },
        { user: { _id: USER_CHARLIE_ID, name: "Charlie" }, role: "member" }
      ];
      const mockGroup2 = {
        _id: GROUP_2_ID,
        name: "Trip to Goa",
        members: group2Members,
        isMember: (uid) => group2Members.some((m) => m.user._id.toString() === uid.toString())
      };

      Group.findById = (id) => {
        if (id.toString() === GROUP_2_ID) return makeQuery(mockGroup2);
        return makeQuery(null);
      };

      // Alice tries to access Group 2 balances
      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_2_ID}/balances`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Access denied. You are not a member of this group"));
    });
  });

  describe("4. Multiple Expenses, Split Types, and Member Balances", () => {
    it("should calculate correct aggregated balances across equal, exact, and percentage splits", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      // Expense 1: Alice pays ₹300 for Alice, Bob, Charlie (equal, ₹100 each)
      // Expense 2: Bob pays ₹150; Alice share ₹50, Bob share ₹50, Charlie share ₹50 (exact)
      // Expense 3: Charlie pays ₹100; Alice 50% (₹50), Charlie 50% (₹50), Bob 0%
      // Inactive David participates in nothing.
      const mockExpenses = [
        {
          description: "Hotel",
          amount: 300,
          amountPaise: 30000,
          paidBy: USER_ALICE_ID,
          splits: [
            { user: USER_ALICE_ID, amount: 100, amountPaise: 10000 },
            { user: USER_BOB_ID, amount: 100, amountPaise: 10000 },
            { user: USER_CHARLIE_ID, amount: 100, amountPaise: 10000 }
          ]
        },
        {
          description: "Groceries",
          amount: 150,
          amountPaise: 15000,
          paidBy: USER_BOB_ID,
          splits: [
            { user: USER_ALICE_ID, amount: 50, amountPaise: 5000 },
            { user: USER_BOB_ID, amount: 50, amountPaise: 5000 },
            { user: USER_CHARLIE_ID, amount: 50, amountPaise: 5000 }
          ]
        },
        {
          description: "Fuel",
          amount: 100,
          amountPaise: 10000,
          paidBy: USER_CHARLIE_ID,
          splits: [
            { user: USER_ALICE_ID, amount: 50, amountPaise: 5000 },
            { user: USER_CHARLIE_ID, amount: 50, amountPaise: 5000 }
          ]
        }
      ];

      Expense.find = () => makeQuery(mockExpenses);

      // Alice requests balances
      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/balances`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.totalExpenses, 550);
      assert.equal(res.body.totalExpensesPaise, 55000);
      assert.equal(res.body.expenseCount, 3);

      // Balances:
      // Alice: paid 300, share 100+50+50 = 200 -> net +10000 paise (+₹100)
      // Bob: paid 150, share 100+50+0 = 150 -> net 0 paise (₹0)
      // Charlie: paid 100, share 100+50+50 = 200 -> net -10000 paise (-₹100)
      // David: paid 0, share 0 -> net 0 paise (₹0)
      assert.equal(res.body.balances[USER_ALICE_ID], 10000);
      assert.equal(res.body.balances[USER_BOB_ID], 0);
      assert.equal(res.body.balances[USER_CHARLIE_ID], -10000);
      assert.equal(res.body.balances[USER_DAVID_ID], 0);

      // Check memberBalances status
      const aliceMb = res.body.memberBalances.find((m) => m.user.id === USER_ALICE_ID);
      const bobMb = res.body.memberBalances.find((m) => m.user.id === USER_BOB_ID);
      const charlieMb = res.body.memberBalances.find((m) => m.user.id === USER_CHARLIE_ID);
      const davidMb = res.body.memberBalances.find((m) => m.user.id === USER_DAVID_ID);

      assert.equal(aliceMb.status, "owed");
      assert.equal(aliceMb.netBalance, 100);
      assert.equal(aliceMb.netBalancePaise, 10000);
      assert.equal(aliceMb.user.name, "Alice");

      assert.equal(bobMb.status, "settled");
      assert.equal(bobMb.netBalance, 0);

      assert.equal(charlieMb.status, "owes");
      assert.equal(charlieMb.netBalance, -100);
      assert.equal(charlieMb.netBalancePaise, -10000);

      assert.equal(davidMb.status, "settled");
      assert.equal(davidMb.netBalance, 0);

      // Check currentUserBalance for Alice
      assert.equal(res.body.currentUserBalance.status, "owed");
      assert.equal(res.body.currentUserBalance.netBalance, 100);
    });

    it("should return currentUserBalance matching Charlie when Charlie calls balances", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      Expense.find = () =>
        makeQuery([
          {
            amount: 100,
            amountPaise: 10000,
            paidBy: USER_ALICE_ID,
            splits: [
              { user: USER_ALICE_ID, amount: 50, amountPaise: 5000 },
              { user: USER_CHARLIE_ID, amount: 50, amountPaise: 5000 }
            ]
          }
        ]);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/balances`,
        headers: { Authorization: `Bearer ${tokenCharlie}` }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.currentUserBalance.status, "owes");
      assert.equal(res.body.currentUserBalance.netBalance, -50);
      assert.equal(res.body.currentUserBalance.netBalancePaise, -5000);
    });
  });

  describe("5. Settlement Suggestions", () => {
    it("should return deterministic suggested transfers that clear all debts", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      // Alice paid ₹300 for Alice, Bob, Charlie.
      // Net: Alice +200, Bob -100, Charlie -100
      Expense.find = () =>
        makeQuery([
          {
            description: "Dinner",
            amount: 300,
            amountPaise: 30000,
            paidBy: USER_ALICE_ID,
            splits: [
              { user: USER_ALICE_ID, amount: 100, amountPaise: 10000 },
              { user: USER_BOB_ID, amount: 100, amountPaise: 10000 },
              { user: USER_CHARLIE_ID, amount: 100, amountPaise: 10000 }
            ]
          }
        ]);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/settlement-suggestions`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.isSettled, false);
      assert.equal(res.body.transferCount, 2);

      // Verify transfers
      const transfers = res.body.transfers;
      assert.equal(transfers.length, 2);

      for (const t of transfers) {
        assert.ok(t.amountPaise > 0);
        assert.equal(t.to, USER_ALICE_ID);
        assert.equal(t.recipient, USER_ALICE_ID);
        assert.ok([USER_BOB_ID, USER_CHARLIE_ID].includes(t.from));
        assert.equal(t.amount, 100);
        assert.equal(t.amountPaise, 10000);
        // Verify enriched user profiles
        assert.ok(t.fromUser.name);
        assert.ok(t.toUser.name === "Alice");
      }

      // Check sum of transfer amounts matches total credit
      const totalTransferred = transfers.reduce((sum, t) => sum + t.amountPaise, 0);
      assert.equal(totalTransferred, 20000);
    });

    it("should support the suggested-settlements alias endpoint", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);
      Expense.find = () => makeQuery([]);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/suggested-settlements`,
        headers: { Authorization: `Bearer ${tokenBob}` }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.isSettled, true);
    });
  });

  describe("6. Inconsistent Expense Data Rejection", () => {
    it("should return HTTP 422 with inconsistentData error if split allocations do not sum to amount", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      // Stored expense has amount 10000 paise, but splits sum to 9000 paise (corrupted record)
      Expense.find = () =>
        makeQuery([
          {
            description: "Corrupted expense",
            amount: 100,
            amountPaise: 10000,
            paidBy: USER_ALICE_ID,
            splits: [
              { user: USER_ALICE_ID, amount: 50, amountPaise: 5000 },
              { user: USER_BOB_ID, amount: 40, amountPaise: 4000 }
            ]
          }
        ]);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/balances`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.equal(res.status, 422);
      assert.equal(res.body.success, false);
      assert.equal(res.body.inconsistentData, true);
      assert.ok(res.body.error.includes("Inconsistent expense data"));
      assert.ok(res.body.error.includes("does not match total expense amount"));
    });

    it("should return HTTP 422 on settlement-suggestions if expense data is inconsistent", async () => {
      mockUserFind();
      const mockGroup = createMockGroup();
      Group.findById = () => makeQuery(mockGroup);

      Expense.find = () =>
        makeQuery([
          {
            description: "Corrupted expense",
            amountPaise: 10000,
            paidBy: USER_ALICE_ID,
            splits: [
              { user: USER_ALICE_ID, amountPaise: 6000 },
              { user: USER_BOB_ID, amountPaise: 5000 }
            ]
          }
        ]);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/settlement-suggestions`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.equal(res.status, 422);
      assert.equal(res.body.success, false);
      assert.equal(res.body.inconsistentData, true);
      assert.ok(res.body.error.includes("Inconsistent expense data"));
    });
  });
});
