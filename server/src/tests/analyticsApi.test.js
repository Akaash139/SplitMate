const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Group = require("../models/Group");
const Expense = require("../models/Expense");
const Settlement = require("../models/Settlement");
const { EXPENSE_CATEGORIES } = require("../models/Expense");
const { app } = require("../server");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_key_for_unit_tests_only";

// Users
const USER_ALICE_ID = "65f1a1a1a1a1a1a1a1a1a101"; // Alice (Member & Payer)
const USER_BOB_ID = "65f1a1a1a1a1a1a1a1a1a102";   // Bob (Member)
const USER_CHARLIE_ID = "65f1a1a1a1a1a1a1a1a1a103"; // Charlie (Member)
const USER_STRANGER_ID = "65f1a1a1a1a1a1a1a1a1a104"; // Non-member

const tokenAlice = jwt.sign({ id: USER_ALICE_ID, email: "alice@example.com" }, process.env.JWT_SECRET);
const tokenBob = jwt.sign({ id: USER_BOB_ID, email: "bob@example.com" }, process.env.JWT_SECRET);
const tokenStranger = jwt.sign({ id: USER_STRANGER_ID, email: "stranger@example.com" }, process.env.JWT_SECRET);

const GROUP_1_ID = "65f1b2b2b2b2b2b2b2b2b201";
const GROUP_2_ID = "65f1b2b2b2b2b2b2b2b2b202";

// Save original Mongoose methods
const originalUserFindById = User.findById;
const originalGroupFindById = Group.findById;
const originalGroupFind = Group.find;
const originalExpenseFind = Expense.find;
const originalSettlementFind = Settlement.find;

afterEach(() => {
  User.findById = originalUserFindById;
  Group.findById = originalGroupFindById;
  Group.find = originalGroupFind;
  Expense.find = originalExpenseFind;
  Settlement.find = originalSettlementFind;
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
      const idStr = (id?._id || id)?.toString();
      if (idStr === USER_ALICE_ID) {
        return { _id: USER_ALICE_ID, name: "Alice", email: "alice@example.com" };
      }
      if (idStr === USER_BOB_ID) {
        return { _id: USER_BOB_ID, name: "Bob", email: "bob@example.com" };
      }
      if (idStr === USER_STRANGER_ID) {
        return { _id: USER_STRANGER_ID, name: "Stranger", email: "stranger@example.com" };
      }
      return null;
    }
  });
}

function createGroupDoc(groupId, members) {
  return {
    _id: groupId,
    name: "Goa Vacation Trip",
    description: "Beach holiday expenses",
    category: "Trip",
    creator: members[0]?.user || USER_ALICE_ID,
    members: members.map((m) => ({
      user: typeof m === "object" ? m : { _id: m, name: "User " + m },
      role: "member"
    })),
    isMember(userId) {
      const uStr = (userId?._id || userId)?.toString();
      return this.members.some((m) => (m.user?._id || m.user).toString() === uStr);
    }
  };
}

describe("SplitMate Task 6A: Analytics & Category Summaries API Test Suite", () => {
  let server;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe("1. Authentication and Authorization Guards", () => {
    it("should reject unauthenticated request with 401 Unauthorized", async () => {
      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics`
      });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.error, /authentication/i);
    });

    it("should reject unauthenticated request to /categories with 401 Unauthorized", async () => {
      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics/categories`
      });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    it("should reject non-member request with 403 Forbidden (Group Isolation)", async () => {
      mockUserFind();
      Group.findById = () => ({
        populate: () => ({
          populate: async () => createGroupDoc(GROUP_1_ID, [USER_ALICE_ID, USER_BOB_ID])
        })
      });

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics`,
        headers: { Authorization: `Bearer ${tokenStranger}` }
      });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.error, /access denied/i);
    });

    it("should return 404 for a non-existent group identifier", async () => {
      mockUserFind();
      Group.findById = () => ({
        populate: () => ({
          populate: async () => null
        })
      });

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error, "Group not found");
    });

    it("should return 400 for a malformed group identifier", async () => {
      mockUserFind();
      const res = await request(server, {
        method: "GET",
        path: "/api/v1/groups/not-a-valid-id/analytics",
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error, "Invalid group identifier");
    });
  });

  describe("2. Category Aggregation & Paise Precision", () => {
    it("should accurately aggregate categories, calculate percentages and paise precision", async () => {
      mockUserFind();
      const groupDoc = createGroupDoc(GROUP_1_ID, [
        { _id: USER_ALICE_ID, name: "Alice" },
        { _id: USER_BOB_ID, name: "Bob" }
      ]);
      Group.findById = () => ({
        populate: () => ({
          populate: async () => groupDoc
        })
      });

      // Sample expenses:
      // 1. Food & Drink: ₹600.00 (Alice paid, equal split: Alice ₹300, Bob ₹300)
      // 2. Food & Drink: ₹400.00 (Bob paid, equal split: Alice ₹200, Bob ₹200)
      // 3. Transportation: ₹500.00 (Alice paid, equal split: Alice ₹250, Bob ₹250)
      // 4. Entertainment: ₹500.00 (Alice paid, exact split: Alice ₹100, Bob ₹400)
      // Total spent = ₹2000.00 (200000 paise)
      const expenses = [
        {
          _id: "exp1",
          group: GROUP_1_ID,
          description: "Beach Dinner",
          amount: 600,
          amountPaise: 60000,
          category: "Food & Drink",
          paidBy: { _id: USER_ALICE_ID, name: "Alice" },
          splits: [
            { user: USER_ALICE_ID, amount: 300, amountPaise: 30000 },
            { user: USER_BOB_ID, amount: 300, amountPaise: 30000 }
          ],
          createdAt: new Date("2026-10-10T19:00:00Z")
        },
        {
          _id: "exp2",
          group: GROUP_1_ID,
          description: "Lunch Cafe",
          amount: 400,
          amountPaise: 40000,
          category: "Food & Drink",
          paidBy: { _id: USER_BOB_ID, name: "Bob" },
          splits: [
            { user: USER_ALICE_ID, amount: 200, amountPaise: 20000 },
            { user: USER_BOB_ID, amount: 200, amountPaise: 20000 }
          ],
          createdAt: new Date("2026-10-11T13:00:00Z")
        },
        {
          _id: "exp3",
          group: GROUP_1_ID,
          description: "Taxi Ride",
          amount: 500,
          amountPaise: 50000,
          category: "Transportation",
          paidBy: { _id: USER_ALICE_ID, name: "Alice" },
          splits: [
            { user: USER_ALICE_ID, amount: 250, amountPaise: 25000 },
            { user: USER_BOB_ID, amount: 250, amountPaise: 25000 }
          ],
          createdAt: new Date("2026-10-12T10:00:00Z")
        },
        {
          _id: "exp4",
          group: GROUP_1_ID,
          description: "Concert Tickets",
          amount: 500,
          amountPaise: 50000,
          category: "Entertainment",
          paidBy: { _id: USER_ALICE_ID, name: "Alice" },
          splits: [
            { user: USER_ALICE_ID, amount: 100, amountPaise: 10000 },
            { user: USER_BOB_ID, amount: 400, amountPaise: 40000 }
          ],
          createdAt: new Date("2026-10-14T21:00:00Z")
        }
      ];

      Expense.find = () => makeQuery(expenses);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.groupId, GROUP_1_ID);
      assert.strictEqual(res.body.currency, "INR");

      // Verify Summary Totals
      const { summary } = res.body;
      assert.strictEqual(summary.totalSpent, 2000);
      assert.strictEqual(summary.totalSpentPaise, 200000);
      assert.strictEqual(summary.expenseCount, 4);
      assert.strictEqual(summary.averageExpense, 500);
      assert.strictEqual(summary.averageExpensePaise, 50000);

      // Alice's personal metrics:
      // Alice paid: exp1 (600) + exp3 (500) + exp4 (500) = ₹1600.00
      // Alice's share: 300 + 200 + 250 + 100 = ₹850.00 (85000 paise)
      assert.strictEqual(summary.userTotalPaid, 1600);
      assert.strictEqual(summary.userTotalPaidPaise, 160000);
      assert.strictEqual(summary.userTotalShare, 850);
      assert.strictEqual(summary.userTotalSharePaise, 85000);

      // Verify Top Category: Food & Drink (₹1000 = 50%)
      assert.strictEqual(summary.topCategory.category, "Food & Drink");
      assert.strictEqual(summary.topCategory.total, 1000);
      assert.strictEqual(summary.topCategory.totalPaise, 100000);
      assert.strictEqual(summary.topCategory.percentage, 50);

      // Verify Active Category Breakdown
      const { categoryBreakdown } = res.body;
      assert.strictEqual(categoryBreakdown.length, 3);

      const food = categoryBreakdown.find((c) => c.category === "Food & Drink");
      assert.ok(food);
      assert.strictEqual(food.total, 1000);
      assert.strictEqual(food.totalPaise, 100000);
      assert.strictEqual(food.count, 2);
      assert.strictEqual(food.percentage, 50);
      assert.strictEqual(food.userShare, 500);

      const transport = categoryBreakdown.find((c) => c.category === "Transportation");
      assert.ok(transport);
      assert.strictEqual(transport.total, 500);
      assert.strictEqual(transport.totalPaise, 50000);
      assert.strictEqual(transport.count, 1);
      assert.strictEqual(transport.percentage, 25);

      const entertainment = categoryBreakdown.find((c) => c.category === "Entertainment");
      assert.ok(entertainment);
      assert.strictEqual(entertainment.total, 500);
      assert.strictEqual(entertainment.totalPaise, 50000);
      assert.strictEqual(entertainment.count, 1);
      assert.strictEqual(entertainment.percentage, 25);

      // Verify All 11 Supported Categories are present
      assert.strictEqual(res.body.allCategories.length, EXPENSE_CATEGORIES.length);
      const groceries = res.body.allCategories.find((c) => c.category === "Groceries");
      assert.ok(groceries);
      assert.strictEqual(groceries.total, 0);
      assert.strictEqual(groceries.totalPaise, 0);
      assert.strictEqual(groceries.count, 0);
      assert.strictEqual(groceries.percentage, 0);
    });

    it("should handle odd-cent division and paise precision without floating-point artifacts", async () => {
      mockUserFind();
      Group.findById = () => ({
        populate: () => ({
          populate: async () => createGroupDoc(GROUP_1_ID, [USER_ALICE_ID, USER_BOB_ID, USER_CHARLIE_ID])
        })
      });

      // Odd amounts: ₹33.34, ₹33.33, ₹33.33 summing to exactly ₹100.00
      const oddExpenses = [
        {
          _id: "odd1",
          group: GROUP_1_ID,
          description: "Groceries Item",
          amount: 33.34,
          amountPaise: 3334,
          category: "Groceries",
          paidBy: USER_ALICE_ID,
          createdAt: new Date("2026-10-01T12:00:00Z")
        },
        {
          _id: "odd2",
          group: GROUP_1_ID,
          description: "Utilities Water",
          amount: 33.33,
          amountPaise: 3333,
          category: "Utilities",
          paidBy: USER_ALICE_ID,
          createdAt: new Date("2026-10-02T12:00:00Z")
        },
        {
          _id: "odd3",
          group: GROUP_1_ID,
          description: "Entertainment Tip",
          amount: 33.33,
          amountPaise: 3333,
          category: "Entertainment",
          paidBy: USER_ALICE_ID,
          createdAt: new Date("2026-10-03T12:00:00Z")
        }
      ];

      Expense.find = () => makeQuery(oddExpenses);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.summary.totalSpent, 100);
      assert.strictEqual(res.body.summary.totalSpentPaise, 10000);
      assert.strictEqual(res.body.summary.expenseCount, 3);

      const groc = res.body.categoryBreakdown.find((c) => c.category === "Groceries");
      assert.strictEqual(groc.total, 33.34);
      assert.strictEqual(groc.totalPaise, 3334);
      assert.strictEqual(groc.percentage, 33.34);

      const util = res.body.categoryBreakdown.find((c) => c.category === "Utilities");
      assert.strictEqual(util.total, 33.33);
      assert.strictEqual(util.totalPaise, 3333);
      assert.strictEqual(util.percentage, 33.33);
    });
  });

  describe("3. Date & Month Boundaries Filtering", () => {
    it("should filter by month and year inclusive of month boundaries and exclusive of outside dates", async () => {
      mockUserFind();
      Group.findById = () => ({
        populate: () => ({
          populate: async () => createGroupDoc(GROUP_1_ID, [USER_ALICE_ID, USER_BOB_ID])
        })
      });

      const multiDateExpenses = [
        {
          _id: "sep30",
          amount: 100,
          amountPaise: 10000,
          category: "Food & Drink",
          createdAt: new Date("2026-09-30T23:59:59.999Z") // Outside (September)
        },
        {
          _id: "oct01",
          amount: 250,
          amountPaise: 25000,
          category: "Food & Drink",
          createdAt: new Date("2026-10-01T00:00:00.000Z") // First second of October
        },
        {
          _id: "oct15",
          amount: 350,
          amountPaise: 35000,
          category: "Travel",
          createdAt: new Date("2026-10-15T12:00:00.000Z") // Mid October
        },
        {
          _id: "oct31",
          amount: 400,
          amountPaise: 40000,
          category: "Shopping",
          createdAt: new Date("2026-10-31T23:59:59.999Z") // Last millisecond of October
        },
        {
          _id: "nov01",
          amount: 500,
          amountPaise: 50000,
          category: "Medical",
          createdAt: new Date("2026-11-01T00:00:00.000Z") // Outside (November)
        }
      ];

      Expense.find = () => makeQuery(multiDateExpenses);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics?month=10&year=2026`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.period.filterType, "month");
      assert.strictEqual(res.body.period.month, 10);
      assert.strictEqual(res.body.period.year, 2026);

      // Only Oct 1, Oct 15, and Oct 31 should be included
      // Total: 250 + 350 + 400 = 1000
      assert.strictEqual(res.body.summary.expenseCount, 3);
      assert.strictEqual(res.body.summary.totalSpent, 1000);
      assert.strictEqual(res.body.summary.totalSpentPaise, 100000);
    });

    it("should filter by custom startDate and endDate correctly", async () => {
      mockUserFind();
      Group.findById = () => ({
        populate: () => ({
          populate: async () => createGroupDoc(GROUP_1_ID, [USER_ALICE_ID, USER_BOB_ID])
        })
      });

      const expenses = [
        {
          _id: "e1",
          amount: 150,
          amountPaise: 15000,
          category: "Food & Drink",
          createdAt: new Date("2026-10-04T12:00:00Z") // Before range
        },
        {
          _id: "e2",
          amount: 200,
          amountPaise: 20000,
          category: "Food & Drink",
          createdAt: new Date("2026-10-05T08:00:00Z") // In range
        },
        {
          _id: "e3",
          amount: 300,
          amountPaise: 30000,
          category: "Utilities",
          createdAt: new Date("2026-10-10T15:00:00Z") // In range
        },
        {
          _id: "e4",
          amount: 500,
          amountPaise: 50000,
          category: "General",
          createdAt: new Date("2026-10-21T00:00:00Z") // After range
        }
      ];

      Expense.find = () => makeQuery(expenses);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics?startDate=2026-10-05&endDate=2026-10-10`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.period.filterType, "custom");
      assert.strictEqual(res.body.summary.expenseCount, 2);
      assert.strictEqual(res.body.summary.totalSpent, 500);
      assert.strictEqual(res.body.summary.totalSpentPaise, 50000);
    });

    it("should generate all 12 months for a year filter", async () => {
      mockUserFind();
      Group.findById = () => ({
        populate: () => ({
          populate: async () => createGroupDoc(GROUP_1_ID, [USER_ALICE_ID, USER_BOB_ID])
        })
      });

      const yearExpenses = [
        {
          _id: "eMarch",
          amount: 500,
          amountPaise: 50000,
          category: "Travel",
          createdAt: new Date("2026-03-15T12:00:00Z")
        },
        {
          _id: "eOctober",
          amount: 1500,
          amountPaise: 150000,
          category: "Housing",
          createdAt: new Date("2026-10-01T12:00:00Z")
        }
      ];

      Expense.find = () => makeQuery(yearExpenses);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics?year=2026`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.period.filterType, "year");
      assert.strictEqual(res.body.summary.totalSpent, 2000);

      // Verify all 12 months are in monthlyTrends
      const { monthlyTrends } = res.body;
      assert.strictEqual(monthlyTrends.length, 12);
      assert.strictEqual(monthlyTrends[0].month, "2026-01");
      assert.strictEqual(monthlyTrends[0].total, 0);

      const march = monthlyTrends.find((m) => m.month === "2026-03");
      assert.strictEqual(march.total, 500);
      assert.strictEqual(march.totalPaise, 50000);

      const october = monthlyTrends.find((m) => m.month === "2026-10");
      assert.strictEqual(october.total, 1500);
      assert.strictEqual(october.totalPaise, 150000);
    });

    it("should filter by specific category parameter", async () => {
      mockUserFind();
      Group.findById = () => ({
        populate: () => ({
          populate: async () => createGroupDoc(GROUP_1_ID, [USER_ALICE_ID, USER_BOB_ID])
        })
      });

      const expenses = [
        {
          _id: "f1",
          amount: 200,
          amountPaise: 20000,
          category: "Food & Drink",
          createdAt: new Date("2026-10-10T12:00:00Z")
        },
        {
          _id: "t1",
          amount: 400,
          amountPaise: 40000,
          category: "Travel",
          createdAt: new Date("2026-10-11T12:00:00Z")
        }
      ];

      Expense.find = () => makeQuery(expenses);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics?category=Food%20%26%20Drink`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.summary.expenseCount, 1);
      assert.strictEqual(res.body.summary.totalSpent, 200);
      assert.strictEqual(res.body.categoryBreakdown.length, 1);
      assert.strictEqual(res.body.categoryBreakdown[0].category, "Food & Drink");
    });
  });

  describe("4. Empty Data, Edge Cases and Settlements Exclusion", () => {
    it("should return clean zero-totals without NaN or division-by-zero for an empty group", async () => {
      mockUserFind();
      Group.findById = () => ({
        populate: () => ({
          populate: async () => createGroupDoc(GROUP_1_ID, [USER_ALICE_ID, USER_BOB_ID])
        })
      });

      Expense.find = () => makeQuery([]);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.summary.totalSpent, 0);
      assert.strictEqual(res.body.summary.totalSpentPaise, 0);
      assert.strictEqual(res.body.summary.expenseCount, 0);
      assert.strictEqual(res.body.summary.averageExpense, 0);
      assert.strictEqual(res.body.summary.userTotalShare, 0);
      assert.strictEqual(res.body.summary.userTotalPaid, 0);
      assert.strictEqual(res.body.summary.topCategory, null);
      assert.deepStrictEqual(res.body.categoryBreakdown, []);
      assert.strictEqual(res.body.allCategories.length, EXPENSE_CATEGORIES.length);
    });

    it("should never include settlements as expenses in spending calculations", async () => {
      mockUserFind();
      Group.findById = () => ({
        populate: () => ({
          populate: async () => createGroupDoc(GROUP_1_ID, [USER_ALICE_ID, USER_BOB_ID])
        })
      });

      // Group has ₹100 in legitimate expense, and ₹500 in settlement payments recorded
      Expense.find = () =>
        makeQuery([
          {
            _id: "realExp",
            amount: 100,
            amountPaise: 10000,
            category: "General",
            paidBy: USER_ALICE_ID,
            createdAt: new Date("2026-10-10T10:00:00Z")
          }
        ]);

      Settlement.find = () =>
        makeQuery([
          {
            _id: "settle1",
            payer: USER_BOB_ID,
            receiver: USER_ALICE_ID,
            amount: 500,
            amountPaise: 50000,
            group: GROUP_1_ID
          }
        ]);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.strictEqual(res.status, 200);
      // Must be ₹100, NEVER ₹600
      assert.strictEqual(res.body.summary.totalSpent, 100);
      assert.strictEqual(res.body.summary.totalSpentPaise, 10000);
      assert.strictEqual(res.body.summary.expenseCount, 1);
    });

    it("should safely ignore malformed records with zero or negative amounts", async () => {
      mockUserFind();
      Group.findById = () => ({
        populate: () => ({
          populate: async () => createGroupDoc(GROUP_1_ID, [USER_ALICE_ID, USER_BOB_ID])
        })
      });

      const badRecords = [
        { _id: "b1", amount: -50, category: "Food & Drink", createdAt: new Date() },
        { _id: "b2", amount: 0, category: "Food & Drink", createdAt: new Date() },
        { _id: "b3", amount: null, category: "Food & Drink", createdAt: new Date() },
        { _id: "g1", amount: 75, amountPaise: 7500, category: "Groceries", createdAt: new Date() }
      ];

      Expense.find = () => makeQuery(badRecords);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.summary.expenseCount, 1);
      assert.strictEqual(res.body.summary.totalSpent, 75);
    });
  });

  describe("5. Validation of Invalid Filter Inputs (400 Bad Request)", () => {
    beforeEach(() => {
      mockUserFind();
      Group.findById = () => ({
        populate: () => ({
          populate: async () => createGroupDoc(GROUP_1_ID, [USER_ALICE_ID, USER_BOB_ID])
        })
      });
    });

    it("should reject invalid month (e.g. month=13 or month=0) with 400", async () => {
      const res1 = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics?month=13`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });
      assert.strictEqual(res1.status, 400);
      assert.strictEqual(res1.body.success, false);
      assert.match(res1.body.error, /invalid month/i);

      const res2 = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics?month=abc`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });
      assert.strictEqual(res2.status, 400);
    });

    it("should reject invalid year with 400", async () => {
      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics?year=99`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.error, /invalid year/i);
    });

    it("should reject invalid startDate with 400", async () => {
      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics?startDate=not-a-date`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });
      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /invalid startdate/i);
    });

    it("should reject inverted date range (startDate > endDate) with 400", async () => {
      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics?startDate=2026-10-20&endDate=2026-10-10`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });
      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /startDate cannot be after endDate/i);
    });

    it("should reject unknown category with 400 and list supported categories", async () => {
      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics?category=Cryptocurrency`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });
      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /invalid category/i);
      assert.match(res.body.error, /Food & Drink/i);
    });
  });

  describe("6. Dedicated Category and Monthly Endpoints", () => {
    it("should return category-focused payload at /categories endpoint", async () => {
      mockUserFind();
      Group.findById = () => ({
        populate: () => ({
          populate: async () => createGroupDoc(GROUP_1_ID, [USER_ALICE_ID, USER_BOB_ID])
        })
      });

      Expense.find = () =>
        makeQuery([
          {
            amount: 500,
            amountPaise: 50000,
            category: "Shopping",
            createdAt: new Date()
          }
        ]);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics/categories`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.totalSpent, 500);
      assert.strictEqual(res.body.totalSpentPaise, 50000);
      assert.ok(Array.isArray(res.body.categoryBreakdown));
      assert.strictEqual(res.body.categoryBreakdown[0].category, "Shopping");
      assert.strictEqual(res.body.categoryBreakdown[0].total, 500);
      assert.strictEqual(res.body.allCategories.length, EXPENSE_CATEGORIES.length);
    });

    it("should return monthly trends at /monthly endpoint", async () => {
      mockUserFind();
      Group.findById = () => ({
        populate: () => ({
          populate: async () => createGroupDoc(GROUP_1_ID, [USER_ALICE_ID, USER_BOB_ID])
        })
      });

      Expense.find = () =>
        makeQuery([
          {
            amount: 750,
            amountPaise: 75000,
            category: "Utilities",
            createdAt: new Date("2026-10-10T12:00:00Z")
          }
        ]);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/analytics/monthly`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.totalSpent, 750);
      assert.strictEqual(res.body.monthlyTrends.length, 1);
      assert.strictEqual(res.body.monthlyTrends[0].month, "2026-10");
      assert.strictEqual(res.body.monthlyTrends[0].total, 750);
    });
  });

  describe("7. User Overview Analytics (/api/v1/groups/analytics)", () => {
    it("should aggregate spending across all groups the user belongs to", async () => {
      mockUserFind();
      const group1 = createGroupDoc(GROUP_1_ID, [USER_ALICE_ID, USER_BOB_ID]);
      const group2 = createGroupDoc(GROUP_2_ID, [USER_ALICE_ID, USER_CHARLIE_ID]);

      Group.find = () => Promise.resolve([group1, group2]);

      const multiGroupExpenses = [
        {
          _id: "g1exp",
          group: GROUP_1_ID,
          amount: 300,
          amountPaise: 30000,
          category: "Groceries",
          createdAt: new Date()
        },
        {
          _id: "g2exp",
          group: GROUP_2_ID,
          amount: 700,
          amountPaise: 70000,
          category: "Travel",
          createdAt: new Date()
        }
      ];

      Expense.find = () => makeQuery(multiGroupExpenses);

      const res = await request(server, {
        method: "GET",
        path: "/api/v1/groups/analytics",
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.groupCount, 2);
      assert.strictEqual(res.body.summary.totalSpent, 1000);
      assert.strictEqual(res.body.summary.totalSpentPaise, 100000);
      assert.strictEqual(res.body.categoryBreakdown.length, 2);
    });

    it("should reject overview with 403 when ?groupId= belongs to a group user is not a member of", async () => {
      mockUserFind();
      const group1 = createGroupDoc(GROUP_1_ID, [USER_ALICE_ID]);
      const group2 = createGroupDoc(GROUP_2_ID, [USER_BOB_ID]); // Alice is NOT a member

      Group.find = () => Promise.resolve([group1]);
      Group.findById = (id) => Promise.resolve(id.toString() === GROUP_2_ID ? group2 : null);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/analytics?groupId=${GROUP_2_ID}`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.error, /access denied/i);
    });
  });
});
