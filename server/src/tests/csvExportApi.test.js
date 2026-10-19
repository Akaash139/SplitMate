const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Group = require("../models/Group");
const Expense = require("../models/Expense");
const Settlement = require("../models/Settlement");
const { app } = require("../server");
const {
  sanitizeCsvCell,
  formatDate,
  generateExpensesCsv,
  generateSettlementsCsv
} = require("../utils/csvEngine");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_key_for_unit_tests_only";

// Users
const USER_MEMBER_1_ID = "65f1a1a1a1a1a1a1a1a1a101"; // Alice
const USER_MEMBER_2_ID = "65f1a1a1a1a1a1a1a1a1a102"; // Bob
const USER_STRANGER_ID = "65f1a1a1a1a1a1a1a1a1a103"; // Non-member

const tokenMember1 = jwt.sign({ id: USER_MEMBER_1_ID, email: "alice@example.com" }, process.env.JWT_SECRET);
const tokenMember2 = jwt.sign({ id: USER_MEMBER_2_ID, email: "bob@example.com" }, process.env.JWT_SECRET);
const tokenStranger = jwt.sign({ id: USER_STRANGER_ID, email: "stranger@example.com" }, process.env.JWT_SECRET);

const GROUP_1_ID = "65f1b2b2b2b2b2b2b2b2b201";
const GROUP_2_ID = "65f1b2b2b2b2b2b2b2b2b202";

// Save originals
const originalUserFindById = User.findById;
const originalGroupFind = Group.find;
const originalGroupFindById = Group.findById;
const originalExpenseFind = Expense.find;
const originalSettlementFind = Settlement.find;

afterEach(() => {
  User.findById = originalUserFindById;
  Group.find = originalGroupFind;
  Group.findById = originalGroupFindById;
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
  p.select = () => makeQuery(data);
  p.lean = () => Promise.resolve(data);
  return p;
}

function mockUserFind() {
  User.findById = (id) => ({
    select: async () => {
      const idStr = id.toString();
      if (idStr === USER_MEMBER_1_ID) {
        return { _id: USER_MEMBER_1_ID, name: "Alice Wonderland", email: "alice@example.com" };
      }
      if (idStr === USER_MEMBER_2_ID) {
        return { _id: USER_MEMBER_2_ID, name: "Bob Builder", email: "bob@example.com" };
      }
      if (idStr === USER_STRANGER_ID) {
        return { _id: USER_STRANGER_ID, name: "Charlie Stranger", email: "stranger@example.com" };
      }
      return null;
    }
  });
}

function createMockGroup(groupId = GROUP_1_ID, name = "Flat 101") {
  const members = [
    { user: { _id: USER_MEMBER_1_ID, name: "Alice Wonderland" }, role: "creator" },
    { user: { _id: USER_MEMBER_2_ID, name: "Bob Builder" }, role: "member" }
  ];

  return {
    _id: groupId,
    name,
    members,
    isMember: function (userId) {
      const idStr = userId?._id ? userId._id.toString() : userId?.toString();
      return members.some((m) => m.user._id.toString() === idStr);
    },
    isCreatorOrAdmin: function (userId) {
      const idStr = userId?._id ? userId._id.toString() : userId?.toString();
      return idStr === USER_MEMBER_1_ID;
    }
  };
}

describe("Task 7: Separate CSV Exports for Expenses and Settlements", () => {
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

  describe("CSV Engine Unit Tests", () => {
    it("sanitizeCsvCell correctly handles formula injection characters (=, +, -, @, \\t, \\r)", () => {
      assert.equal(sanitizeCsvCell("=SUM(A1:A5)"), "'=SUM(A1:A5)");
      assert.equal(sanitizeCsvCell("+987654"), "'+987654");
      assert.equal(sanitizeCsvCell("-100"), "'-100");
      assert.equal(sanitizeCsvCell("@malicious"), "'@malicious");
      assert.equal(sanitizeCsvCell("\tcmd"), "'\tcmd");
    });

    it("sanitizeCsvCell correctly escapes RFC 4180 commas, double quotes, and newlines", () => {
      assert.equal(sanitizeCsvCell('Dinner, with "friends"'), '"Dinner, with ""friends"""');
      assert.equal(sanitizeCsvCell("Line 1\nLine 2"), '"Line 1\nLine 2"');
    });

    it("sanitizeCsvCell formats numeric values with 2 decimals without prepending single quotes", () => {
      assert.equal(sanitizeCsvCell(1250, true), "1250.00");
      assert.equal(sanitizeCsvCell(0, true), "0.00");
      assert.equal(sanitizeCsvCell(99.99, true), "99.99");
    });

    it("generateExpensesCsv creates RFC 4180 CSV with UTF-8 BOM and correct headers", () => {
      const sampleExpenses = [
        {
          description: "Grocery, Fruits & Veggies",
          amountPaise: 125050,
          currency: "INR",
          category: "Groceries",
          createdAt: new Date("2026-10-15T10:00:00Z"),
          paidBy: { name: "Alice Wonderland" },
          group: { name: "Flat 101" }
        }
      ];

      const csv = generateExpensesCsv(sampleExpenses, { groupName: "Flat 101" });

      // Starts with UTF-8 BOM
      assert.ok(csv.startsWith("\uFEFF"));

      // Contains exact headers
      assert.ok(csv.includes("Expense Description,Amount,Currency,Category,Date,Payer,Group Name"));

      // Rupee conversion from paise (125050 -> 1250.50)
      assert.ok(csv.includes("1250.50"));

      // Escaping comma in description
      assert.ok(csv.includes('"Grocery, Fruits & Veggies"'));
      assert.ok(csv.includes("Alice Wonderland"));
      assert.ok(csv.includes("Flat 101"));
    });

    it("generateSettlementsCsv creates RFC 4180 CSV with UTF-8 BOM and correct headers", () => {
      const sampleSettlements = [
        {
          _id: "65f1c3c3c3c3c3c3c3c3c301",
          amountPaise: 45000,
          currency: "INR",
          settledAt: new Date("2026-10-16T15:30:00Z"),
          payer: { name: "Bob Builder" },
          receiver: { name: "Alice Wonderland" },
          group: { name: "Flat 101" },
          status: "completed",
          notes: "Settled via UPI"
        }
      ];

      const csv = generateSettlementsCsv(sampleSettlements, { groupName: "Flat 101" });

      // Starts with UTF-8 BOM
      assert.ok(csv.startsWith("\uFEFF"));

      // Contains exact headers
      assert.ok(
        csv.includes("Settlement ID,Group Name,Payer,Recipient,Settlement Amount,Currency,Settlement Date,Status,Notes")
      );

      // Rupee conversion from paise (45000 -> 450.00)
      assert.ok(csv.includes("450.00"));
      assert.ok(csv.includes("Bob Builder"));
      assert.ok(csv.includes("Alice Wonderland"));
      assert.ok(csv.includes("completed"));
      assert.ok(csv.includes("Settled via UPI"));
    });

    it("generates headers-only for empty datasets gracefully", () => {
      const emptyExpCsv = generateExpensesCsv([]);
      assert.ok(emptyExpCsv.startsWith("\uFEFF"));
      assert.ok(emptyExpCsv.includes("Expense Description,Amount,Currency,Category,Date,Payer,Group Name"));

      const emptySetCsv = generateSettlementsCsv([]);
      assert.ok(emptySetCsv.startsWith("\uFEFF"));
      assert.ok(
        emptySetCsv.includes("Settlement ID,Group Name,Payer,Recipient,Settlement Amount,Currency,Settlement Date,Status,Notes")
      );
    });
  });

  describe("GET /api/v1/groups/:groupId/expenses/export", () => {
    it("returns 401 if unauthenticated", async () => {
      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses/export`
      });
      assert.equal(res.status, 401);
    });

    it("returns 403 if user is not a group member", async () => {
      mockUserFind();
      Group.findById = () => makeQuery(createMockGroup(GROUP_1_ID));

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses/export`,
        headers: { Authorization: `Bearer ${tokenStranger}` }
      });
      assert.equal(res.status, 403);
    });

    it("exports authorized group expenses with proper content headers, BOM, and formatted values", async () => {
      mockUserFind();
      Group.findById = () => makeQuery(createMockGroup(GROUP_1_ID));

      const mockExpenses = [
        {
          _id: "65f1d4d4d4d4d4d4d4d4d401",
          description: "Diwali Sweet Box",
          amount: 550,
          amountPaise: 55000,
          currency: "INR",
          category: "Food & Drink",
          createdAt: new Date("2026-10-18T10:00:00Z"),
          paidBy: { name: "Alice Wonderland" }
        },
        {
          _id: "65f1d4d4d4d4d4d4d4d4d402",
          description: "=MALICIOUS_FORMULA",
          amount: 100,
          amountPaise: 10000,
          currency: "INR",
          category: "General",
          createdAt: new Date("2026-10-19T08:00:00Z"),
          paidBy: { name: "Bob Builder" }
        }
      ];

      Expense.find = (filter) => {
        assert.equal(filter.group.toString(), GROUP_1_ID);
        return makeQuery(mockExpenses);
      };

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses/export`,
        headers: { Authorization: `Bearer ${tokenMember1}` }
      });

      assert.equal(res.status, 200);
      assert.ok(res.headers["content-type"].includes("text/csv"));
      assert.ok(res.headers["content-disposition"].includes("attachment; filename="));
      assert.match(res.headers["content-disposition"], /splitmate-expenses-\d{4}-\d{2}-\d{2}\.csv/);

      const rawCsv = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
      assert.ok(rawCsv.startsWith("\uFEFF"));
      assert.ok(rawCsv.includes("Diwali Sweet Box"));
      assert.ok(rawCsv.includes("550.00"));
      // Formula injection is safely mitigated with leading single quote
      assert.ok(rawCsv.includes("'=MALICIOUS_FORMULA"));
      assert.ok(rawCsv.includes("Flat 101"));
    });
  });

  describe("GET /api/v1/groups/:groupId/settlements/export", () => {
    it("returns 401 if unauthenticated", async () => {
      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/settlements/export`
      });
      assert.equal(res.status, 401);
    });

    it("returns 403 if user is not a group member", async () => {
      mockUserFind();
      Group.findById = () => makeQuery(createMockGroup(GROUP_1_ID));

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/settlements/export`,
        headers: { Authorization: `Bearer ${tokenStranger}` }
      });
      assert.equal(res.status, 403);
    });

    it("exports authorized group settlements with distinct settlement columns and values", async () => {
      mockUserFind();
      Group.findById = () => makeQuery(createMockGroup(GROUP_1_ID));

      const mockSettlements = [
        {
          _id: "65f1e5e5e5e5e5e5e5e5e501",
          group: { name: "Flat 101" },
          payer: { name: "Bob Builder" },
          receiver: { name: "Alice Wonderland" },
          amountPaise: 80000,
          currency: "INR",
          settledAt: new Date("2026-10-18T14:00:00Z"),
          status: "completed",
          notes: "Reimbursed for groceries"
        }
      ];

      Settlement.find = (filter) => {
        assert.equal(filter.group.toString(), GROUP_1_ID);
        return makeQuery(mockSettlements);
      };

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/settlements/export`,
        headers: { Authorization: `Bearer ${tokenMember2}` }
      });

      assert.equal(res.status, 200);
      assert.ok(res.headers["content-type"].includes("text/csv"));
      assert.ok(res.headers["content-disposition"].includes("attachment; filename="));
      assert.match(res.headers["content-disposition"], /splitmate-settlements-\d{4}-\d{2}-\d{2}\.csv/);

      const rawCsv = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
      assert.ok(rawCsv.startsWith("\uFEFF"));
      assert.ok(rawCsv.includes("Settlement ID,Group Name,Payer,Recipient,Settlement Amount"));
      assert.ok(rawCsv.includes("800.00"));
      assert.ok(rawCsv.includes("Bob Builder"));
      assert.ok(rawCsv.includes("Alice Wonderland"));
      assert.ok(rawCsv.includes("Reimbursed for groceries"));
      assert.ok(rawCsv.includes("completed"));
    });
  });

  describe("Multi-group exports & Authorization scoping", () => {
    it("GET /api/v1/groups/expenses/export returns 403 if specifying a groupId user does not belong to", async () => {
      mockUserFind();
      // Member 1 is only in GROUP_1_ID
      Group.find = () => makeQuery([createMockGroup(GROUP_1_ID)]);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/expenses/export?groupId=${GROUP_2_ID}`,
        headers: { Authorization: `Bearer ${tokenMember1}` }
      });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.ok(res.body.error.includes("Access denied"));
    });

    it("GET /api/v1/groups/settlements/export returns 403 if specifying a groupId user does not belong to", async () => {
      mockUserFind();
      Group.find = () => makeQuery([createMockGroup(GROUP_1_ID)]);

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/settlements/export?groupId=${GROUP_2_ID}`,
        headers: { Authorization: `Bearer ${tokenMember1}` }
      });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });

    it("GET /api/v1/groups/expenses/export exports across all user groups when groupId is omitted", async () => {
      mockUserFind();
      const mockG1 = createMockGroup(GROUP_1_ID, "Apartment 1");
      const mockG2 = createMockGroup(GROUP_2_ID, "Apartment 2");
      Group.find = () => makeQuery([mockG1, mockG2]);

      const mockExpenses = [
        {
          _id: "65f1f6f6f6f6f6f6f6f6f601",
          description: "Wi-Fi Bill",
          amountPaise: 99900,
          currency: "INR",
          category: "Utilities",
          createdAt: new Date("2026-10-10T00:00:00Z"),
          paidBy: { name: "Alice Wonderland" },
          group: { name: "Apartment 1" }
        }
      ];

      Expense.find = (filter) => {
        assert.ok(Array.isArray(filter.group.$in));
        assert.equal(filter.group.$in.length, 2);
        return makeQuery(mockExpenses);
      };

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/expenses/export`,
        headers: { Authorization: `Bearer ${tokenMember1}` }
      });

      assert.equal(res.status, 200);
      const rawCsv = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
      assert.ok(rawCsv.includes("Wi-Fi Bill"));
      assert.ok(rawCsv.includes("999.00"));
      assert.ok(rawCsv.includes("Apartment 1"));
    });

    it("GET /api/v1/groups/settlements/export exports across all user groups when groupId is omitted", async () => {
      mockUserFind();
      const mockG1 = createMockGroup(GROUP_1_ID, "Apartment 1");
      Group.find = () => makeQuery([mockG1]);

      const mockSettlements = [
        {
          _id: "65f107070707070707070701",
          group: { name: "Apartment 1" },
          payer: { name: "Alice Wonderland" },
          receiver: { name: "Bob Builder" },
          amountPaise: 35000,
          currency: "INR",
          settledAt: new Date("2026-10-12T00:00:00Z"),
          status: "completed",
          notes: "Settled rent advance"
        }
      ];

      Settlement.find = (filter) => {
        assert.ok(Array.isArray(filter.group.$in));
        return makeQuery(mockSettlements);
      };

      const res = await request(server, {
        method: "GET",
        path: `/api/v1/groups/settlements/export`,
        headers: { Authorization: `Bearer ${tokenMember1}` }
      });

      assert.equal(res.status, 200);
      const rawCsv = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
      assert.ok(rawCsv.includes("Settled rent advance"));
      assert.ok(rawCsv.includes("350.00"));
      assert.ok(rawCsv.includes("Apartment 1"));
    });
  });

  describe("Dataset separation and distinct filenames", () => {
    it("ensures Expenses CSV and Settlements CSV have distinct filenames and datasets", async () => {
      mockUserFind();
      Group.findById = () => makeQuery(createMockGroup(GROUP_1_ID));

      Expense.find = () => makeQuery([]);
      Settlement.find = () => makeQuery([]);

      const expRes = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/expenses/export`,
        headers: { Authorization: `Bearer ${tokenMember1}` }
      });

      const setRes = await request(server, {
        method: "GET",
        path: `/api/v1/groups/${GROUP_1_ID}/settlements/export`,
        headers: { Authorization: `Bearer ${tokenMember1}` }
      });

      const expDisposition = expRes.headers["content-disposition"];
      const setDisposition = setRes.headers["content-disposition"];

      assert.match(expDisposition, /splitmate-expenses-/);
      assert.match(setDisposition, /splitmate-settlements-/);
      assert.notEqual(expDisposition, setDisposition);

      const expCsv = typeof expRes.body === "string" ? expRes.body : JSON.stringify(expRes.body);
      const setCsv = typeof setRes.body === "string" ? setRes.body : JSON.stringify(setRes.body);

      assert.ok(expCsv.includes("Expense Description"));
      assert.ok(!expCsv.includes("Settlement ID"));

      assert.ok(setCsv.includes("Settlement ID"));
      assert.ok(!setCsv.includes("Expense Description"));
    });
  });
});
