const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const {
  toPaise,
  fromPaise,
  splitEqual,
  splitExact,
  splitPercentage,
  calculateSplits
} = require("../utils/expenseSplits");
const Expense = require("../models/Expense");

describe("Task 4A: Expense Split Engine & Data Model Test Suite", () => {
  const USER_1 = "65f1a1a1a1a1a1a1a1a1a101";
  const USER_2 = "65f1a1a1a1a1a1a1a1a1a102";
  const USER_3 = "65f1a1a1a1a1a1a1a1a1a103";
  const GROUP_ID = "65f1b2b2b2b2b2b2b2b2b201";

  describe("1. Currency & Minor Unit Conversions", () => {
    it("should correctly convert standard rupees to integer paise", () => {
      assert.equal(toPaise(100), 10000);
      assert.equal(toPaise(33.34), 3334);
      assert.equal(toPaise(0.01), 1);
    });

    it("should convert integer paise back to rupees with two decimals", () => {
      assert.equal(fromPaise(10000), 100);
      assert.equal(fromPaise(3334), 33.34);
      assert.equal(fromPaise(1), 0.01);
    });

    it("should reject fractions of a paisa (sub-cent values)", () => {
      assert.throws(() => toPaise(10.555), /fractions of a paisa/);
    });

    it("should reject non-finite, NaN, and negative amounts", () => {
      assert.throws(() => toPaise(NaN), /expected finite number/);
      assert.throws(() => toPaise(Infinity), /expected finite number/);
      assert.throws(() => toPaise(-50), /cannot be negative/);
      assert.throws(() => toPaise(0), /must be greater than zero/);
    });
  });

  describe("2. Equal Split Strategy", () => {
    it("should split evenly between 2 participants (no remainder)", () => {
      const res = splitEqual(100, [USER_1, USER_2]);

      assert.equal(res.totalAmount, 100);
      assert.equal(res.totalPaise, 10000);
      assert.equal(res.splitType, "equal");
      assert.equal(res.splits.length, 2);

      assert.equal(res.splits[0].user, USER_1);
      assert.equal(res.splits[0].amount, 50.0);
      assert.equal(res.splits[0].amountPaise, 5000);

      assert.equal(res.splits[1].user, USER_2);
      assert.equal(res.splits[1].amount, 50.0);
      assert.equal(res.splits[1].amountPaise, 5000);

      const sumPaise = res.splits.reduce((acc, s) => acc + s.amountPaise, 0);
      assert.equal(sumPaise, 10000);
    });

    it("should split among 3 participants with leftover paise deterministically", () => {
      // ₹100 among 3 participants: 10000 paise / 3 = 3333 paise each + 1 leftover paisa
      // First participant gets 3334 paise (₹33.34), others get 3333 paise (₹33.33)
      const res = splitEqual(100, [USER_1, USER_2, USER_3]);

      assert.equal(res.totalAmount, 100);
      assert.equal(res.splits.length, 3);

      assert.equal(res.splits[0].user, USER_1);
      assert.equal(res.splits[0].amount, 33.34);
      assert.equal(res.splits[0].amountPaise, 3334);

      assert.equal(res.splits[1].user, USER_2);
      assert.equal(res.splits[1].amount, 33.33);
      assert.equal(res.splits[1].amountPaise, 3333);

      assert.equal(res.splits[2].user, USER_3);
      assert.equal(res.splits[2].amount, 33.33);
      assert.equal(res.splits[2].amountPaise, 3333);

      // Verify exact sum in paise and rupees
      const sumPaise = res.splits.reduce((acc, s) => acc + s.amountPaise, 0);
      assert.equal(sumPaise, 10000);
      const sumAmount = Number(res.splits.reduce((acc, s) => acc + s.amount, 0).toFixed(2));
      assert.equal(sumAmount, 100.0);
    });

    it("should handle equal split when total amount in paise is smaller than participant count", () => {
      // ₹0.02 (2 paise) among 3 participants
      // 2 paise: first 2 get 1 paisa (₹0.01), 3rd gets 0 paise (₹0.00)
      const res = splitEqual(0.02, [USER_1, USER_2, USER_3]);

      assert.equal(res.totalAmount, 0.02);
      assert.equal(res.totalPaise, 2);
      assert.equal(res.splits[0].amount, 0.01);
      assert.equal(res.splits[0].amountPaise, 1);
      assert.equal(res.splits[1].amount, 0.01);
      assert.equal(res.splits[1].amountPaise, 1);
      assert.equal(res.splits[2].amount, 0.0);
      assert.equal(res.splits[2].amountPaise, 0);

      const sumPaise = res.splits.reduce((acc, s) => acc + s.amountPaise, 0);
      assert.equal(sumPaise, 2);
    });

    it("should accept participant objects with _id, user, or id properties", () => {
      const participants = [
        { _id: new mongoose.Types.ObjectId(USER_1) },
        { user: USER_2 },
        { id: USER_3 }
      ];

      const res = splitEqual(90, participants);
      assert.equal(res.splits.length, 3);
      assert.equal(res.splits[0].user, USER_1);
      assert.equal(res.splits[1].user, USER_2);
      assert.equal(res.splits[2].user, USER_3);
      assert.equal(res.splits[0].amount, 30);
      assert.equal(res.splits[1].amount, 30);
      assert.equal(res.splits[2].amount, 30);
    });
  });

  describe("3. Exact Split Strategy", () => {
    it("should accept valid exact allocations that strictly equal total amount", () => {
      const splitsInput = [
        { user: USER_1, amount: 45.5 },
        { user: USER_2, amount: 30.25 },
        { user: USER_3, amount: 24.25 }
      ];

      const res = splitExact(100, splitsInput);

      assert.equal(res.totalAmount, 100);
      assert.equal(res.splitType, "exact");
      assert.equal(res.splits[0].amount, 45.5);
      assert.equal(res.splits[1].amount, 30.25);
      assert.equal(res.splits[2].amount, 24.25);
      assert.equal(res.splits[0].exactAmount, 45.5);

      const sumPaise = res.splits.reduce((acc, s) => acc + s.amountPaise, 0);
      assert.equal(sumPaise, 10000);
    });

    it("should reject exact split when sum is less than total (under-allocation)", () => {
      const splitsInput = [
        { user: USER_1, amount: 40 },
        { user: USER_2, amount: 30 },
        { user: USER_3, amount: 20 }
      ]; // Sum = 90, total = 100

      assert.throws(
        () => splitExact(100, splitsInput),
        /Exact allocations sum to ₹90.00, which does not equal the expense total of ₹100.00 \(under by ₹10.00\)/
      );
    });

    it("should reject exact split when sum exceeds total (over-allocation)", () => {
      const splitsInput = [
        { user: USER_1, amount: 50 },
        { user: USER_2, amount: 40 },
        { user: USER_3, amount: 25 }
      ]; // Sum = 115, total = 100

      assert.throws(
        () => splitExact(100, splitsInput),
        /Exact allocations sum to ₹115.00, which does not equal the expense total of ₹100.00 \(over by ₹15.00\)/
      );
    });

    it("should reject exact split with negative or missing amount values", () => {
      assert.throws(
        () => splitExact(100, [{ user: USER_1, amount: -10 }, { user: USER_2, amount: 110 }]),
        /cannot be negative/
      );

      assert.throws(
        () => splitExact(100, [{ user: USER_1 }, { user: USER_2, amount: 100 }]),
        /Missing exact allocation amount/
      );
    });
  });

  describe("4. Percentage Split Strategy", () => {
    it("should correctly calculate allocations when percentages total 100%", () => {
      const splitsInput = [
        { user: USER_1, percentage: 50 },
        { user: USER_2, percentage: 25 },
        { user: USER_3, percentage: 25 }
      ];

      const res = splitPercentage(200, splitsInput);

      assert.equal(res.totalAmount, 200);
      assert.equal(res.splitType, "percentage");
      assert.equal(res.splits[0].amount, 100.0);
      assert.equal(res.splits[0].percentage, 50);
      assert.equal(res.splits[1].amount, 50.0);
      assert.equal(res.splits[1].percentage, 25);
      assert.equal(res.splits[2].amount, 50.0);
      assert.equal(res.splits[2].percentage, 25);

      const sumPaise = res.splits.reduce((acc, s) => acc + s.amountPaise, 0);
      assert.equal(sumPaise, 20000);
    });

    it("should deterministically distribute rounding remainders using Largest Remainder policy", () => {
      // ₹10 split 33.34%, 33.33%, 33.33% = 100%
      // 1000 paise:
      // USER_1: 333.4 paise (floor 333, rem 0.4) -> receives remainder bonus (+1) -> 334 paise (₹3.34)
      // USER_2: 333.3 paise (floor 333, rem 0.3) -> 333 paise (₹3.33)
      // USER_3: 333.3 paise (floor 333, rem 0.3) -> 333 paise (₹3.33)
      const splitsInput = [
        { user: USER_1, percentage: 33.34 },
        { user: USER_2, percentage: 33.33 },
        { user: USER_3, percentage: 33.33 }
      ];

      const res = splitPercentage(10, splitsInput);

      assert.equal(res.splits[0].amount, 3.34);
      assert.equal(res.splits[0].amountPaise, 334);
      assert.equal(res.splits[1].amount, 3.33);
      assert.equal(res.splits[1].amountPaise, 333);
      assert.equal(res.splits[2].amount, 3.33);
      assert.equal(res.splits[2].amountPaise, 333);

      const sumPaise = res.splits.reduce((acc, s) => acc + s.amountPaise, 0);
      assert.equal(sumPaise, 1000);
      const sumRupees = Number(res.splits.reduce((acc, s) => acc + s.amount, 0).toFixed(2));
      assert.equal(sumRupees, 10.0);
    });

    it("should reject percentages totaling less than 100%", () => {
      const splitsInput = [
        { user: USER_1, percentage: 40 },
        { user: USER_2, percentage: 40 }
      ]; // Sum = 80%

      assert.throws(
        () => splitPercentage(100, splitsInput),
        /Percentages must total 100%. Current total is 80%/
      );
    });

    it("should reject percentages totaling greater than 100%", () => {
      const splitsInput = [
        { user: USER_1, percentage: 60 },
        { user: USER_2, percentage: 50 }
      ]; // Sum = 110%

      assert.throws(
        () => splitPercentage(100, splitsInput),
        /Percentages must total 100%. Current total is 110%/
      );
    });

    it("should reject negative or non-finite percentages", () => {
      assert.throws(
        () => splitPercentage(100, [{ user: USER_1, percentage: -20 }, { user: USER_2, percentage: 120 }]),
        /Percentage cannot be negative/
      );

      assert.throws(
        () => splitPercentage(100, [{ user: USER_1, percentage: NaN }, { user: USER_2, percentage: 100 }]),
        /expected finite number/
      );
    });
  });

  describe("5. Validation & Edge Cases Across All Methods", () => {
    it("should reject zero or negative total expense amounts", () => {
      assert.throws(() => splitEqual(0, [USER_1, USER_2]), /must be greater than zero/);
      assert.throws(() => splitEqual(-100, [USER_1, USER_2]), /cannot be negative/);
      assert.throws(() => splitExact(0, [{ user: USER_1, amount: 0 }]), /must be greater than zero/);
      assert.throws(() => splitPercentage(-50, [{ user: USER_1, percentage: 100 }]), /cannot be negative/);
    });

    it("should reject empty participants lists", () => {
      assert.throws(() => splitEqual(100, []), /Participants list cannot be empty/);
      assert.throws(() => splitExact(100, []), /Exact split details cannot be empty/);
      assert.throws(() => splitPercentage(100, []), /Percentage split details cannot be empty/);
    });

    it("should reject duplicate participants in the split", () => {
      assert.throws(
        () => splitEqual(100, [USER_1, USER_2, USER_1]),
        /Duplicate participant detected/
      );

      assert.throws(
        () =>
          splitExact(100, [
            { user: USER_1, amount: 50 },
            { user: USER_1, amount: 50 }
          ]),
        /Duplicate participant detected/
      );

      assert.throws(
        () =>
          splitPercentage(100, [
            { user: USER_2, percentage: 50 },
            { user: USER_2, percentage: 50 }
          ]),
        /Duplicate participant detected/
      );
    });

    it("should return consistent, deterministic results over repeated invocations", () => {
      const run1 = splitEqual(100, [USER_1, USER_2, USER_3]);
      const run2 = splitEqual(100, [USER_1, USER_2, USER_3]);
      assert.deepEqual(run1, run2);

      const pctInput = [
        { user: USER_1, percentage: 33.34 },
        { user: USER_2, percentage: 33.33 },
        { user: USER_3, percentage: 33.33 }
      ];
      const pctRun1 = splitPercentage(10, pctInput);
      const pctRun2 = splitPercentage(10, pctInput);
      assert.deepEqual(pctRun1, pctRun2);
    });

    it("calculateSplits dispatcher should correctly route to equal, exact, and percentage handlers", () => {
      const eq = calculateSplits({ totalAmount: 50, splitType: "equal", participants: [USER_1, USER_2] });
      assert.equal(eq.splitType, "equal");
      assert.equal(eq.splits[0].amount, 25);

      const ex = calculateSplits({
        totalAmount: 50,
        splitType: "exact",
        splits: [{ user: USER_1, amount: 30 }, { user: USER_2, amount: 20 }]
      });
      assert.equal(ex.splitType, "exact");
      assert.equal(ex.splits[0].amount, 30);

      const pct = calculateSplits({
        totalAmount: 50,
        splitType: "percentage",
        splits: [{ user: USER_1, percentage: 60 }, { user: USER_2, percentage: 40 }]
      });
      assert.equal(pct.splitType, "percentage");
      assert.equal(pct.splits[0].amount, 30);

      assert.throws(
        () => calculateSplits({ totalAmount: 50, splitType: "unknown" }),
        /Unsupported split type/
      );
    });
  });

  describe("6. Expense Mongoose Model Validation", () => {
    it("should successfully validate a well-formed expense document", async () => {
      const expense = new Expense({
        group: new mongoose.Types.ObjectId(GROUP_ID),
        description: "Dinner at Taj",
        amount: 100,
        currency: "INR",
        category: "Food & Drink",
        paidBy: new mongoose.Types.ObjectId(USER_1),
        participants: [new mongoose.Types.ObjectId(USER_1), new mongoose.Types.ObjectId(USER_2)],
        splitType: "equal",
        splits: [
          { user: new mongoose.Types.ObjectId(USER_1), amount: 50 },
          { user: new mongoose.Types.ObjectId(USER_2), amount: 50 }
        ],
        createdBy: new mongoose.Types.ObjectId(USER_1)
      });

      await expense.validate();
      assert.ok(true);
    });

    it("should fail validation when required fields are missing", async () => {
      const expense = new Expense({});
      let err;
      try {
        await expense.validate();
      } catch (e) {
        err = e;
      }

      assert.ok(err);
      assert.ok(err.errors.group);
      assert.ok(err.errors.description);
      assert.ok(err.errors.amount);
      assert.ok(err.errors.paidBy);
      assert.ok(err.errors.createdBy);
    });

    it("should fail validation when amount is zero or negative", async () => {
      const expense = new Expense({
        group: new mongoose.Types.ObjectId(GROUP_ID),
        description: "Invalid expense",
        amount: -10,
        paidBy: new mongoose.Types.ObjectId(USER_1),
        createdBy: new mongoose.Types.ObjectId(USER_1)
      });

      let err;
      try {
        await expense.validate();
      } catch (e) {
        err = e;
      }
      assert.ok(err?.errors?.amount);
      assert.ok(err.errors.amount.message.includes("greater than zero"));
    });

    it("should fail validation when participants contain duplicate user IDs", async () => {
      const expense = new Expense({
        group: new mongoose.Types.ObjectId(GROUP_ID),
        description: "Duplicate test",
        amount: 100,
        paidBy: new mongoose.Types.ObjectId(USER_1),
        participants: [new mongoose.Types.ObjectId(USER_1), new mongoose.Types.ObjectId(USER_1)],
        splits: [
          { user: new mongoose.Types.ObjectId(USER_1), amount: 50 },
          { user: new mongoose.Types.ObjectId(USER_1), amount: 50 }
        ],
        createdBy: new mongoose.Types.ObjectId(USER_1)
      });

      let err;
      try {
        await expense.validate();
      } catch (e) {
        err = e;
      }
      assert.ok(err?.errors?.participants);
      assert.ok(err.errors.participants.message.includes("cannot contain duplicates"));
    });

    it("should fail validation when sum of split allocations does not match total amount", async () => {
      const expense = new Expense({
        group: new mongoose.Types.ObjectId(GROUP_ID),
        description: "Mismatched split sum",
        amount: 100,
        paidBy: new mongoose.Types.ObjectId(USER_1),
        participants: [new mongoose.Types.ObjectId(USER_1), new mongoose.Types.ObjectId(USER_2)],
        splits: [
          { user: new mongoose.Types.ObjectId(USER_1), amount: 40 },
          { user: new mongoose.Types.ObjectId(USER_2), amount: 40 } // Sum = 80, expected 100
        ],
        createdBy: new mongoose.Types.ObjectId(USER_1)
      });

      let err;
      try {
        await expense.validate();
      } catch (e) {
        err = e;
      }
      assert.ok(err?.errors?.splits);
      assert.ok(err.errors.splits.message.includes("must exactly match the total expense amount"));
    });

    it("should fail validation when a split user is not in the participants list", async () => {
      const expense = new Expense({
        group: new mongoose.Types.ObjectId(GROUP_ID),
        description: "Unknown participant split",
        amount: 100,
        paidBy: new mongoose.Types.ObjectId(USER_1),
        participants: [new mongoose.Types.ObjectId(USER_1)], // Only USER_1 is in participants
        splits: [
          { user: new mongoose.Types.ObjectId(USER_1), amount: 50 },
          { user: new mongoose.Types.ObjectId(USER_2), amount: 50 } // USER_2 is not in participants
        ],
        createdBy: new mongoose.Types.ObjectId(USER_1)
      });

      let err;
      try {
        await expense.validate();
      } catch (e) {
        err = e;
      }
      assert.ok(err?.errors?.splits);
      assert.ok(err.errors.splits.message.includes("must be included in the expense participants list"));
    });

    it("should fail validation on unsupported splitType or category", async () => {
      const expense = new Expense({
        group: new mongoose.Types.ObjectId(GROUP_ID),
        description: "Enum test",
        amount: 100,
        paidBy: new mongoose.Types.ObjectId(USER_1),
        splitType: "unsupported_split_strategy",
        category: "InvalidCategory",
        createdBy: new mongoose.Types.ObjectId(USER_1)
      });

      let err;
      try {
        await expense.validate();
      } catch (e) {
        err = e;
      }
      assert.ok(err?.errors?.splitType);
      assert.ok(err?.errors?.category);
    });

    it("should fail validation for percentage splits if percentages are missing or do not sum to 100%", async () => {
      const expense = new Expense({
        group: new mongoose.Types.ObjectId(GROUP_ID),
        description: "Percentage split mismatch",
        amount: 100,
        paidBy: new mongoose.Types.ObjectId(USER_1),
        participants: [new mongoose.Types.ObjectId(USER_1), new mongoose.Types.ObjectId(USER_2)],
        splitType: "percentage",
        splits: [
          { user: new mongoose.Types.ObjectId(USER_1), amount: 60, percentage: 60 },
          { user: new mongoose.Types.ObjectId(USER_2), amount: 40, percentage: 30 } // 60 + 30 = 90%
        ],
        createdBy: new mongoose.Types.ObjectId(USER_1)
      });

      let err;
      try {
        await expense.validate();
      } catch (e) {
        err = e;
      }
      assert.ok(err?.errors?.splits);
      assert.ok(err.errors.splits.message.includes("sum must equal 100%"));
    });

    it("should fail validation for equal splits if amounts are skewed by more than 1 paisa", async () => {
      const expense = new Expense({
        group: new mongoose.Types.ObjectId(GROUP_ID),
        description: "Uneven equal split",
        amount: 100,
        paidBy: new mongoose.Types.ObjectId(USER_1),
        participants: [new mongoose.Types.ObjectId(USER_1), new mongoose.Types.ObjectId(USER_2)],
        splitType: "equal",
        splits: [
          { user: new mongoose.Types.ObjectId(USER_1), amount: 70 },
          { user: new mongoose.Types.ObjectId(USER_2), amount: 30 } // Skewed by 40 rupees
        ],
        createdBy: new mongoose.Types.ObjectId(USER_1)
      });

      let err;
      try {
        await expense.validate();
      } catch (e) {
        err = e;
      }
      assert.ok(err?.errors?.splits);
      assert.ok(err.errors.splits.message.includes("at most 1 paisa difference"));
    });
  });
});
