const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Group = require("../models/Group");
const Expense = require("../models/Expense");
const Settlement = require("../models/Settlement");
const { app } = require("../server");
const { AppError } = require("../middleware/errorHandler");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_key_for_unit_tests_only";

// Users
const USER_ALICE_ID = "65f1a1a1a1a1a1a1a1a1a101"; // Alice (Creditor)
const USER_BOB_ID = "65f1a1a1a1a1a1a1a1a1a102"; // Bob (Debtor)
const USER_CHARLIE_ID = "65f1a1a1a1a1a1a1a1a1a103"; // Charlie (Debtor)
const USER_STRANGER_ID = "65f1a1a1a1a1a1a1a1a1a104"; // Non-member

const tokenAlice = jwt.sign({ id: USER_ALICE_ID, email: "alice@example.com" }, process.env.JWT_SECRET);
const tokenBob = jwt.sign({ id: USER_BOB_ID, email: "bob@example.com" }, process.env.JWT_SECRET);
const tokenStranger = jwt.sign({ id: USER_STRANGER_ID, email: "stranger@example.com" }, process.env.JWT_SECRET);

const GROUP_ID = "65f1b2b2b2b2b2b2b2b2b201";

// Save original Mongoose methods
const originalUserFindById = User.findById;
const originalGroupFindById = Group.findById;
const originalGroupFindOneAndUpdate = Group.findOneAndUpdate;
const originalGroupUpdateOne = Group.updateOne;
const originalExpenseFind = Expense.find;
const originalSettlementFind = Settlement.find;
const originalSettlementFindOne = Settlement.findOne;

afterEach(() => {
  User.findById = originalUserFindById;
  Group.findById = originalGroupFindById;
  Group.findOneAndUpdate = originalGroupFindOneAndUpdate;
  Group.updateOne = originalGroupUpdateOne;
  Expense.find = originalExpenseFind;
  Settlement.find = originalSettlementFind;
  Settlement.findOne = originalSettlementFindOne;
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
  p.select = () => makeQuery(data);
  return p;
}

function mockUserFind() {
  User.findById = (id) => ({
    select: async () => {
      const idStr = id.toString();
      if (idStr === USER_ALICE_ID) return { _id: USER_ALICE_ID, name: "Alice", email: "alice@example.com" };
      if (idStr === USER_BOB_ID) return { _id: USER_BOB_ID, name: "Bob", email: "bob@example.com" };
      if (idStr === USER_CHARLIE_ID) return { _id: USER_CHARLIE_ID, name: "Charlie", email: "charlie@example.com" };
      if (idStr === USER_STRANGER_ID) return { _id: USER_STRANGER_ID, name: "Stranger", email: "stranger@example.com" };
      return null;
    }
  });
}

function createMockGroup(initialVersion = 0) {
  const members = [
    { user: { _id: USER_ALICE_ID, name: "Alice", email: "alice@example.com" }, role: "creator" },
    { user: { _id: USER_BOB_ID, name: "Bob", email: "bob@example.com" }, role: "member" },
    { user: { _id: USER_CHARLIE_ID, name: "Charlie", email: "charlie@example.com" }, role: "member" }
  ];

  const groupObj = {
    _id: GROUP_ID,
    name: "Flat 101",
    creator: USER_ALICE_ID,
    members,
    settlementVersion: initialVersion,
    isMember: function (userId) {
      const idStr = userId?._id ? userId._id.toString() : userId?.toString();
      return members.some((m) => m.user._id.toString() === idStr);
    }
  };

  // Wire up findOneAndUpdate and updateOne to manage groupObj's settlementVersion
  Group.findOneAndUpdate = async (filter, update) => {
    let matches = true;
    if (filter.settlementVersion !== undefined) {
      matches = groupObj.settlementVersion === filter.settlementVersion;
    } else if (Array.isArray(filter.$or)) {
      matches = filter.$or.some((cond) => {
        if (cond.settlementVersion !== undefined) {
          return groupObj.settlementVersion === cond.settlementVersion;
        }
        if (cond.settlementVersion && cond.settlementVersion.$exists === false) {
          return groupObj.settlementVersion === undefined || groupObj.settlementVersion === 0;
        }
        return false;
      });
    }

    if (!matches) {
      return null; // Version conflict!
    }

    if (update.$inc && typeof update.$inc.settlementVersion === "number") {
      groupObj.settlementVersion = (groupObj.settlementVersion || 0) + update.$inc.settlementVersion;
    }
    return groupObj;
  };

  Group.updateOne = async (filter, update) => {
    if (update.$inc && typeof update.$inc.settlementVersion === "number") {
      groupObj.settlementVersion = (groupObj.settlementVersion || 0) + update.$inc.settlementVersion;
    }
    return { acknowledged: true, modifiedCount: 1 };
  };

  return groupObj;
}

describe("Task 5D: Settlement Tracking & Payment Recording API Test Suite", () => {
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
    it("should reject unauthenticated POST /settlements with 401", async () => {
      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_ID}/settlements`,
        body: { payer: USER_BOB_ID, receiver: USER_ALICE_ID, amount: 50 }
      });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    it("should reject unauthenticated GET /settlements with 401", async () => {
      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_ID}/settlements`
      });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    it("should reject non-member from recording a settlement with 403", async () => {
      mockUserFind();
      Group.findById = () => makeQuery(createMockGroup());

      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_ID}/settlements`,
        headers: { Authorization: `Bearer ${tokenStranger}` },
        body: { payer: USER_BOB_ID, receiver: USER_ALICE_ID, amount: 50 }
      });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /not a member of this group/i);
    });
  });

  describe("2. Validation Rules (Payer, Receiver, Amount)", () => {
    it("should reject settlement if payer or receiver is missing (400)", async () => {
      mockUserFind();
      Group.findById = () => makeQuery(createMockGroup());

      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_ID}/settlements`,
        headers: { Authorization: `Bearer ${tokenBob}` },
        body: { amount: 50 }
      });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /both payer and receiver are required/i);
    });

    it("should reject settlement if payer and receiver are the same user (400)", async () => {
      mockUserFind();
      Group.findById = () => makeQuery(createMockGroup());

      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_ID}/settlements`,
        headers: { Authorization: `Bearer ${tokenBob}` },
        body: { payer: USER_BOB_ID, receiver: USER_BOB_ID, amount: 50 }
      });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /cannot be the same member/i);
    });

    it("should reject settlement if payer is not a group member (400)", async () => {
      mockUserFind();
      Group.findById = () => makeQuery(createMockGroup());

      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_ID}/settlements`,
        headers: { Authorization: `Bearer ${tokenAlice}` },
        body: { payer: USER_STRANGER_ID, receiver: USER_ALICE_ID, amount: 50 }
      });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /payer is not an active member/i);
    });

    it("should reject settlement with zero, negative, or invalid amounts (400)", async () => {
      mockUserFind();
      Group.findById = () => makeQuery(createMockGroup());

      const resZero = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_ID}/settlements`,
        headers: { Authorization: `Bearer ${tokenBob}` },
        body: { payer: USER_BOB_ID, receiver: USER_ALICE_ID, amount: 0 }
      });
      assert.equal(resZero.status, 400);

      const resNegative = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_ID}/settlements`,
        headers: { Authorization: `Bearer ${tokenBob}` },
        body: { payer: USER_BOB_ID, receiver: USER_ALICE_ID, amount: -25 }
      });
      assert.equal(resNegative.status, 400);
    });
  });

  describe("3. Partial Payment & Full Settlement Integration", () => {
    // Setup scenario: Alice paid ₹300 for Alice, Bob, Charlie (₹100 each).
    // Initial debts: Bob owes ₹100, Charlie owes ₹100, Alice is owed ₹200.
    const mockExpenses = [
      {
        _id: "65f1c3c3c3c3c3c3c3c3c301",
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
    ];

    it("should successfully record a partial settlement and leave remaining debt outstanding", async () => {
      mockUserFind();
      Group.findById = () => makeQuery(createMockGroup());
      Expense.find = () => makeQuery(mockExpenses);
      Settlement.find = () => makeQuery([]);
      Settlement.findOne = () => makeQuery(null);

      // Intercept Settlement.prototype.save
      const originalSave = Settlement.prototype.save;
      Settlement.prototype.save = async function () {
        this._id = "65f1d4d4d4d4d4d4d4d4d401";
        return this;
      };
      Settlement.prototype.populate = async function () {
        return this;
      };

      try {
        // Bob pays ₹40 to Alice (partial payment of ₹100 debt)
        const res = await request(server, {
          method: "POST",
          path: `/api/v1/groups/${GROUP_ID}/settlements`,
          headers: { Authorization: `Bearer ${tokenBob}` },
          body: {
            payer: USER_BOB_ID,
            receiver: USER_ALICE_ID,
            amount: 40,
            notes: "Partial payment via UPI"
          }
        });

        assert.equal(res.status, 201);
        assert.equal(res.body.success, true);
        assert.equal(res.body.isSettled, false);

        // Bob owed 10000 paise (-10000), paid 4000 (+4000) -> now owes 6000 (-6000 paise / -₹60)
        assert.equal(res.body.updatedBalances[USER_BOB_ID], -6000);
        // Alice was owed 20000 paise (+20000), received 4000 (-4000) -> now owed 16000 paise (+₹160)
        assert.equal(res.body.updatedBalances[USER_ALICE_ID], 16000);
        // Charlie is untouched: owes 10000 paise (-₹100)
        assert.equal(res.body.updatedBalances[USER_CHARLIE_ID], -10000);
      } finally {
        Settlement.prototype.save = originalSave;
      }
    });

    it("should successfully record full settlement and clear debts to zero", async () => {
      mockUserFind();
      Group.findById = () => makeQuery(createMockGroup());
      // Bob has already settled 40, now pays remaining 60 to Alice
      const existingSettlements = [
        {
          _id: "65f1d4d4d4d4d4d4d4d4d401",
          group: GROUP_ID,
          payer: USER_BOB_ID,
          receiver: USER_ALICE_ID,
          amount: 40,
          amountPaise: 4000,
          status: "completed"
        }
      ];

      Expense.find = () => makeQuery(mockExpenses);
      Settlement.find = () => makeQuery(existingSettlements);
      Settlement.findOne = () => makeQuery(null);

      const originalSave = Settlement.prototype.save;
      Settlement.prototype.save = async function () {
        this._id = "65f1d4d4d4d4d4d4d4d4d402";
        return this;
      };
      Settlement.prototype.populate = async function () {
        return this;
      };

      try {
        const res = await request(server, {
          method: "POST",
          path: `/api/v1/groups/${GROUP_ID}/settlements`,
          headers: { Authorization: `Bearer ${tokenBob}` },
          body: {
            payer: USER_BOB_ID,
            receiver: USER_ALICE_ID,
            amount: 60
          }
        });

        assert.equal(res.status, 201);
        // Bob's debt is now exactly ₹0.00
        assert.equal(res.body.updatedBalances[USER_BOB_ID], 0);
      } finally {
        Settlement.prototype.save = originalSave;
      }
    });
  });

  describe("4. Over-Settlement Protection", () => {
    const mockExpenses = [
      {
        _id: "65f1c3c3c3c3c3c3c3c3c301",
        description: "Dinner",
        amount: 200,
        amountPaise: 20000,
        paidBy: USER_ALICE_ID,
        splits: [
          { user: USER_ALICE_ID, amount: 100, amountPaise: 10000 },
          { user: USER_BOB_ID, amount: 100, amountPaise: 10000 }
        ]
      }
    ];

    it("should reject payment that exceeds payer's total outstanding debt (400)", async () => {
      mockUserFind();
      Group.findById = () => makeQuery(createMockGroup());
      Expense.find = () => makeQuery(mockExpenses);
      Settlement.find = () => makeQuery([]);
      Settlement.findOne = () => makeQuery(null);

      // Bob owes ₹100, attempts to record ₹150
      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_ID}/settlements`,
        headers: { Authorization: `Bearer ${tokenBob}` },
        body: {
          payer: USER_BOB_ID,
          receiver: USER_ALICE_ID,
          amount: 150
        }
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /exceeds payer's total outstanding debt/i);
    });

    it("should reject payment when payer has no debt at all (400)", async () => {
      mockUserFind();
      Group.findById = () => makeQuery(createMockGroup());
      Expense.find = () => makeQuery(mockExpenses);
      Settlement.find = () => makeQuery([]);
      Settlement.findOne = () => makeQuery(null);

      // Charlie has 0 expenses and 0 debt in this group
      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_ID}/settlements`,
        headers: { Authorization: `Bearer ${tokenAlice}` },
        body: {
          payer: USER_CHARLIE_ID,
          receiver: USER_ALICE_ID,
          amount: 50
        }
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /has no outstanding debt/i);
    });
  });

  describe("5. Idempotency & Duplicate Submission", () => {
    it("should return existing settlement when same idempotencyKey is submitted", async () => {
      mockUserFind();
      Group.findById = () => makeQuery(createMockGroup());

      const mockExisting = {
        _id: "65f1d4d4d4d4d4d4d4d4d499",
        group: GROUP_ID,
        payer: { _id: USER_BOB_ID, name: "Bob" },
        receiver: { _id: USER_ALICE_ID, name: "Alice" },
        amount: 50,
        amountPaise: 5000,
        idempotencyKey: "unique-key-123"
      };

      Settlement.findOne = () => makeQuery(mockExisting);

      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_ID}/settlements`,
        headers: { Authorization: `Bearer ${tokenBob}` },
        body: {
          payer: USER_BOB_ID,
          receiver: USER_ALICE_ID,
          amount: 50,
          idempotencyKey: "unique-key-123"
        }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.isDuplicate, true);
      assert.match(res.body.message, /already recorded/i);
    });
  });

  describe("6. Settlement History Listing", () => {
    it("should list all settlements for the group sorted by date", async () => {
      mockUserFind();
      Group.findById = () => makeQuery(createMockGroup());

      const mockSettlementsList = [
        {
          _id: "65f1d4d4d4d4d4d4d4d4d402",
          group: GROUP_ID,
          payer: { _id: USER_BOB_ID, name: "Bob" },
          receiver: { _id: USER_ALICE_ID, name: "Alice" },
          amount: 60,
          amountPaise: 6000,
          status: "completed"
        },
        {
          _id: "65f1d4d4d4d4d4d4d4d4d401",
          group: GROUP_ID,
          payer: { _id: USER_BOB_ID, name: "Bob" },
          receiver: { _id: USER_ALICE_ID, name: "Alice" },
          amount: 40,
          amountPaise: 4000,
          status: "completed"
        }
      ];

      Settlement.find = () => makeQuery(mockSettlementsList);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_ID}/settlements`,
        headers: { Authorization: `Bearer ${tokenAlice}` }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.settlementCount, 2);
      assert.equal(res.body.settlements.length, 2);
    });
  });

  describe("7. Concurrency Control & Optimistic Version Locking", () => {
    const mockExpenses = [
      {
        _id: "65f1c3c3c3c3c3c3c3c3c301",
        description: "Dinner",
        amount: 200,
        amountPaise: 20000,
        paidBy: USER_ALICE_ID,
        splits: [
          { user: USER_ALICE_ID, amount: 100, amountPaise: 10000 },
          { user: USER_BOB_ID, amount: 100, amountPaise: 10000 }
        ]
      }
    ];

    it("should prevent two concurrent requests from over-settling the same debt (one succeeds with 201, one rejected with 409 conflict)", async () => {
      mockUserFind();
      const mockGroup = createMockGroup(0);
      // Both concurrent requests read the ledger snapshot at version 0 before either commits
      Group.findById = () => makeQuery({ ...mockGroup, settlementVersion: 0 });

      const savedSettlements = [];
      Expense.find = () => makeQuery(mockExpenses);
      // Both concurrent requests read the snapshot before any settlement is committed
      Settlement.find = () => makeQuery([]);
      Settlement.findOne = () => makeQuery(null);

      const originalSave = Settlement.prototype.save;
      Settlement.prototype.save = async function () {
        this._id = "65f1d4d4d4d4d4d4d4d4d4" + (savedSettlements.length + 10);
        savedSettlements.push(this.toObject ? this.toObject() : this);
        return this;
      };
      Settlement.prototype.populate = async function () {
        return this;
      };

      try {
        // Two concurrent clients attempt to settle Bob's ₹100 debt with DIFFERENT idempotency keys
        const [res1, res2] = await Promise.all([
          request(server, {
            method: "POST",
            path: `/api/v1/groups/${GROUP_ID}/settlements`,
            headers: { Authorization: `Bearer ${tokenBob}` },
            body: {
              payer: USER_BOB_ID,
              receiver: USER_ALICE_ID,
              amount: 100,
              idempotencyKey: "concurrent-req-key-1"
            }
          }),
          request(server, {
            method: "POST",
            path: `/api/v1/groups/${GROUP_ID}/settlements`,
            headers: { Authorization: `Bearer ${tokenBob}` },
            body: {
              payer: USER_BOB_ID,
              receiver: USER_ALICE_ID,
              amount: 100,
              idempotencyKey: "concurrent-req-key-2"
            }
          })
        ]);

        const statuses = [res1.status, res2.status].sort();
        // One request must succeed (201) and the competing request must receive 409 Conflict
        assert.deepEqual(statuses, [201, 409]);

        const conflictRes = res1.status === 409 ? res1 : res2;
        assert.equal(conflictRes.body.success, false);
        assert.equal(conflictRes.body.conflict, true);
        assert.match(conflictRes.body.error, /concurrent settlement was processed/i);

        // Crucial invariant: Exactly one settlement of ₹100 was recorded; combined recorded never exceeds ₹100
        assert.equal(savedSettlements.length, 1);
        assert.equal(savedSettlements[0].amount, 100);
      } finally {
        Settlement.prototype.save = originalSave;
      }
    });

    it("should reject with 409 when Group.findOneAndUpdate detects version mismatch (OCC conflict)", async () => {
      mockUserFind();
      const mockGroup = createMockGroup(1); // Group is already advanced to version 1
      Group.findById = () => makeQuery(mockGroup);
      Expense.find = () => makeQuery(mockExpenses);
      Settlement.find = () => makeQuery([]);
      Settlement.findOne = () => makeQuery(null);

      // Simulate a concurrent write that changed the group version (findOneAndUpdate returns null)
      Group.findOneAndUpdate = async () => null;

      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_ID}/settlements`,
        headers: { Authorization: `Bearer ${tokenBob}` },
        body: {
          payer: USER_BOB_ID,
          receiver: USER_ALICE_ID,
          amount: 50,
          idempotencyKey: "occ-conflict-test"
        }
      });

      assert.equal(res.status, 409);
      assert.equal(res.body.success, false);
      assert.equal(res.body.conflict, true);
      assert.match(res.body.error, /concurrent settlement was processed/i);
    });

    it("should maintain strictly monotonic settlementVersion on write failure (no rollback) and allow subsequent valid request to succeed", async () => {
      mockUserFind();
      const mockGroup = createMockGroup(0);
      Group.findById = () => makeQuery(mockGroup);
      Expense.find = () => makeQuery(mockExpenses);

      const savedSettlements = [];
      Settlement.find = () => makeQuery(savedSettlements);
      Settlement.findOne = () => makeQuery(null);

      let saveAttempts = 0;
      const originalSave = Settlement.prototype.save;
      // First save attempt fails with error; second attempt succeeds
      Settlement.prototype.save = async function () {
        saveAttempts++;
        if (saveAttempts === 1) {
          throw new AppError("Simulated database write error", 500);
        }
        this._id = "65f1d4d4d4d4d4d4d4d4d401";
        savedSettlements.push(this.toObject ? this.toObject() : this);
        return this;
      };
      Settlement.prototype.populate = async function () {
        return this;
      };

      try {
        // 1. First request: passes validation, increments version 0 -> 1, but save fails
        const resFailed = await request(server, {
          method: "POST",
          path: `/api/v1/groups/${GROUP_ID}/settlements`,
          headers: { Authorization: `Bearer ${tokenBob}` },
          body: {
            payer: USER_BOB_ID,
            receiver: USER_ALICE_ID,
            amount: 50,
            idempotencyKey: "fail-req-1"
          }
        });

        assert.equal(resFailed.status, 500);
        // Crucial: settlementVersion must NEVER decrease (remains 1, not 0)
        assert.equal(mockGroup.settlementVersion, 1);
        assert.equal(savedSettlements.length, 0);

        // 2. Subsequent request: reads version 1, validates remaining ledger, updates version 1 -> 2, succeeds!
        const resSubsequent = await request(server, {
          method: "POST",
          path: `/api/v1/groups/${GROUP_ID}/settlements`,
          headers: { Authorization: `Bearer ${tokenBob}` },
          body: {
            payer: USER_BOB_ID,
            receiver: USER_ALICE_ID,
            amount: 50,
            idempotencyKey: "subsequent-valid-req-2"
          }
        });

        assert.equal(resSubsequent.status, 201);
        assert.equal(resSubsequent.body.success, true);
        assert.equal(savedSettlements.length, 1);
        // Version monotonically advanced to 2
        assert.equal(mockGroup.settlementVersion, 2);
      } finally {
        Settlement.prototype.save = originalSave;
      }
    });

    it("should preserve idempotent retries and return 200 without version conflicts", async () => {
      mockUserFind();
      const mockGroup = createMockGroup(5); // Existing version 5
      Group.findById = () => makeQuery(mockGroup);

      const existingSettlement = {
        _id: "65f1d4d4d4d4d4d4d4d4d488",
        group: GROUP_ID,
        payer: { _id: USER_BOB_ID, name: "Bob" },
        receiver: { _id: USER_ALICE_ID, name: "Alice" },
        amount: 40,
        amountPaise: 4000,
        idempotencyKey: "idempotent-retry-test"
      };

      Settlement.findOne = () => makeQuery(existingSettlement);

      let versionTouched = false;
      Group.findOneAndUpdate = async () => {
        versionTouched = true;
        return mockGroup;
      };

      const res = await request(server, {
        method: "POST",
        path: `/api/v1/groups/${GROUP_ID}/settlements`,
        headers: { Authorization: `Bearer ${tokenBob}` },
        body: {
          payer: USER_BOB_ID,
          receiver: USER_ALICE_ID,
          amount: 40,
          idempotencyKey: "idempotent-retry-test"
        }
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.isDuplicate, true);
      assert.equal(res.body.settlement.amount, 40);
      // Version must NOT be touched on idempotent retry
      assert.equal(versionTouched, false);
      assert.equal(mockGroup.settlementVersion, 5);
    });
  });
});
