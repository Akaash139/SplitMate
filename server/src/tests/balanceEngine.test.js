const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  validateIntegerPaise,
  calculateNetBalances,
  simplifyDebts,
  calculateSettlements
} = require("../utils/balanceEngine");
const {
  toPaise,
  fromPaise,
  splitEqual,
  splitExact,
  splitPercentage
} = require("../utils/expenseSplits");

describe("Task 5A: Balance Calculation & Debt Simplification Engine", () => {
  const ALICE = "65f1a1a1a1a1a1a1a1a1a101";
  const BOB = "65f1a1a1a1a1a1a1a1a1a102";
  const CHARLIE = "65f1a1a1a1a1a1a1a1a1a103";
  const DAVID = "65f1a1a1a1a1a1a1a1a1a104";
  const EMILY = "65f1a1a1a1a1a1a1a1a1a105";

  describe("1. Single Equal-Split Expense", () => {
    it("should calculate exact net balances for a 2-person equal split", () => {
      // Alice pays ₹100 for Alice and Bob
      const splitRes = splitEqual(100, [ALICE, BOB]);
      const expenses = [
        {
          description: "Dinner",
          amount: 100,
          amountPaise: 10000,
          paidBy: ALICE,
          splits: splitRes.splits
        }
      ];

      const res = calculateNetBalances(expenses);

      assert.equal(res.totalExpenses, 100);
      assert.equal(res.totalExpensesPaise, 10000);
      assert.equal(res.balances[ALICE], 5000); // Alice paid 100, share 50 -> +5000 paise (+₹50)
      assert.equal(res.balances[BOB], -5000); // Bob paid 0, share 50 -> -5000 paise (-₹50)

      // Ensure sum of net balances is exactly zero
      const totalNet = Object.values(res.balances).reduce((sum, b) => sum + b, 0);
      assert.equal(totalNet, 0);

      // Verify detailed memberBalances array
      const aliceMember = res.memberBalances.find((m) => m.user === ALICE);
      const bobMember = res.memberBalances.find((m) => m.user === BOB);
      assert.deepEqual(aliceMember, {
        user: ALICE,
        netBalance: 50.0,
        netBalancePaise: 5000,
        totalPaid: 100.0,
        totalPaidPaise: 10000,
        totalShare: 50.0,
        totalSharePaise: 5000
      });
      assert.deepEqual(bobMember, {
        user: BOB,
        netBalance: -50.0,
        netBalancePaise: -5000,
        totalPaid: 0.0,
        totalPaidPaise: 0,
        totalShare: 50.0,
        totalSharePaise: 5000
      });

      // Verify simplified transfer
      const transfers = simplifyDebts(res.balances);
      assert.equal(transfers.length, 1);
      assert.equal(transfers[0].from, BOB);
      assert.equal(transfers[0].payer, BOB);
      assert.equal(transfers[0].to, ALICE);
      assert.equal(transfers[0].recipient, ALICE);
      assert.equal(transfers[0].amount, 50.0);
      assert.equal(transfers[0].amountPaise, 5000);
    });

    it("should support populated payer and participant objects with _id or user", () => {
      const expenses = [
        {
          description: "Lunch",
          amount: 60,
          paidBy: { _id: ALICE, name: "Alice" },
          splits: [
            { user: { _id: ALICE }, amount: 30 },
            { user: { _id: BOB }, amount: 30 }
          ]
        }
      ];

      const res = calculateNetBalances(expenses);
      assert.equal(res.balances[ALICE], 3000);
      assert.equal(res.balances[BOB], -3000);
    });
  });

  describe("2. Multiple Expenses Paid by Different Members", () => {
    it("should accurately aggregate credits and debits across multiple expenses", () => {
      // Expense 1: Alice pays ₹300 for Alice, Bob, Charlie (₹100 each)
      // Expense 2: Bob pays ₹150 for Alice, Bob, Charlie (₹50 each)
      // Expense 3: Charlie pays ₹60 for Alice and Charlie (₹30 each)
      const expenses = [
        {
          description: "Hotel",
          amountPaise: 30000,
          paidBy: ALICE,
          splits: [
            { user: ALICE, amountPaise: 10000 },
            { user: BOB, amountPaise: 10000 },
            { user: CHARLIE, amountPaise: 10000 }
          ]
        },
        {
          description: "Groceries",
          amountPaise: 15000,
          paidBy: BOB,
          splits: [
            { user: ALICE, amountPaise: 5000 },
            { user: BOB, amountPaise: 5000 },
            { user: CHARLIE, amountPaise: 5000 }
          ]
        },
        {
          description: "Snacks",
          amountPaise: 6000,
          paidBy: CHARLIE,
          splits: [
            { user: ALICE, amountPaise: 3000 },
            { user: CHARLIE, amountPaise: 3000 }
          ]
        }
      ];

      const res = calculateNetBalances(expenses);

      // Expected calculation:
      // Alice:   Paid 30000. Share = 10000 + 5000 + 3000 = 18000. Net = +12000 paise (+₹120)
      // Bob:     Paid 15000. Share = 10000 + 5000 + 0    = 15000. Net = 0 paise (₹0)
      // Charlie: Paid 6000.  Share = 10000 + 5000 + 3000 = 18000. Net = -12000 paise (-₹120)
      assert.equal(res.totalExpensesPaise, 51000);
      assert.equal(res.totalExpenses, 510);
      assert.equal(res.balances[ALICE], 12000);
      assert.equal(res.balances[BOB], 0);
      assert.equal(res.balances[CHARLIE], -12000);

      // Zero-sum balance check
      assert.equal(res.balances[ALICE] + res.balances[BOB] + res.balances[CHARLIE], 0);

      // Settle debts: Charlie should pay Alice directly ₹120, Bob is untouched
      const settlements = calculateSettlements(expenses);
      assert.equal(settlements.transfers.length, 1);
      assert.deepEqual(settlements.transfers[0], {
        from: CHARLIE,
        to: ALICE,
        payer: CHARLIE,
        recipient: ALICE,
        amount: 120,
        amountPaise: 12000
      });
    });
  });

  describe("3. Exact and Percentage Splits", () => {
    it("should compute net balances with exact split allocations", () => {
      // Alice pays ₹100 with exact split: Alice ₹20, Bob ₹35, Charlie ₹45
      const exactSplits = splitExact(100, [
        { user: ALICE, amount: 20 },
        { user: BOB, amount: 35 },
        { user: CHARLIE, amount: 45 }
      ]);

      const expenses = [
        {
          description: "Bill",
          amount: 100,
          paidBy: ALICE,
          splits: exactSplits.splits
        }
      ];

      const res = calculateNetBalances(expenses);

      // Alice: paid 100, share 20 -> +80 (+8000 paise)
      // Bob: paid 0, share 35 -> -35 (-3500 paise)
      // Charlie: paid 0, share 45 -> -45 (-4500 paise)
      assert.equal(res.balances[ALICE], 8000);
      assert.equal(res.balances[BOB], -3500);
      assert.equal(res.balances[CHARLIE], -4500);
      assert.equal(res.balances[ALICE] + res.balances[BOB] + res.balances[CHARLIE], 0);

      const transfers = simplifyDebts(res.balances);
      assert.equal(transfers.length, 2);
      assert.deepEqual(transfers, [
        {
          from: BOB,
          to: ALICE,
          payer: BOB,
          recipient: ALICE,
          amount: 35.0,
          amountPaise: 3500
        },
        {
          from: CHARLIE,
          to: ALICE,
          payer: CHARLIE,
          recipient: ALICE,
          amount: 45.0,
          amountPaise: 4500
        }
      ]);
    });

    it("should compute net balances with percentage split allocations", () => {
      // Bob pays ₹200 with percentage split: Alice 50%, Bob 30%, Charlie 20%
      const pctSplits = splitPercentage(200, [
        { user: ALICE, percentage: 50 },
        { user: BOB, percentage: 30 },
        { user: CHARLIE, percentage: 20 }
      ]);

      const expenses = [
        {
          description: "Party",
          amount: 200,
          paidBy: BOB,
          splits: pctSplits.splits
        }
      ];

      const res = calculateNetBalances(expenses);
      // Bob: paid 200, share 60 -> +14000 paise (+₹140)
      // Alice: paid 0, share 100 -> -10000 paise (-₹100)
      // Charlie: paid 0, share 40 -> -4000 paise (-₹40)
      assert.equal(res.balances[BOB], 14000);
      assert.equal(res.balances[ALICE], -10000);
      assert.equal(res.balances[CHARLIE], -4000);

      const transfers = simplifyDebts(res.balances);
      assert.equal(transfers.length, 2);
      assert.deepEqual(transfers, [
        {
          from: ALICE,
          to: BOB,
          payer: ALICE,
          recipient: BOB,
          amount: 100.0,
          amountPaise: 10000
        },
        {
          from: CHARLIE,
          to: BOB,
          payer: CHARLIE,
          recipient: BOB,
          amount: 40.0,
          amountPaise: 4000
        }
      ]);
    });
  });

  describe("4. Payer Who Is Not a Participant and Inactive Members", () => {
    it("should correctly credit a payer who does not participate in the split", () => {
      // Alice buys a gift for Bob and Charlie (Alice does not participate)
      const expenses = [
        {
          description: "Gift for Bob and Charlie",
          amount: 100,
          paidBy: ALICE,
          splits: [
            { user: BOB, amount: 50 },
            { user: CHARLIE, amount: 50 }
          ]
        }
      ];

      const res = calculateNetBalances(expenses);
      // Alice: paid 100, share 0 -> +10000 paise (+₹100)
      // Bob: paid 0, share 50 -> -5000 paise (-₹50)
      // Charlie: paid 0, share 50 -> -5000 paise (-₹50)
      assert.equal(res.balances[ALICE], 10000);
      assert.equal(res.balances[BOB], -5000);
      assert.equal(res.balances[CHARLIE], -5000);

      const aliceDetail = res.memberBalances.find((m) => m.user === ALICE);
      assert.equal(aliceDetail.totalPaidPaise, 10000);
      assert.equal(aliceDetail.totalSharePaise, 0);
      assert.equal(aliceDetail.netBalancePaise, 10000);

      const transfers = simplifyDebts(res);
      assert.equal(transfers.length, 2);
      assert.deepEqual(transfers, [
        {
          from: BOB,
          to: ALICE,
          payer: BOB,
          recipient: ALICE,
          amount: 50.0,
          amountPaise: 5000
        },
        {
          from: CHARLIE,
          to: ALICE,
          payer: CHARLIE,
          recipient: ALICE,
          amount: 50.0,
          amountPaise: 5000
        }
      ]);
    });

    it("should handle participants who paid nothing and participants with zero share", () => {
      const expenses = [
        {
          description: "Meal",
          amount: 100,
          paidBy: ALICE,
          splits: [
            { user: ALICE, amount: 50 },
            { user: BOB, amount: 50 },
            { user: CHARLIE, amount: 0 } // Charlie attended but had 0 share
          ]
        }
      ];

      const res = calculateNetBalances(expenses);
      assert.equal(res.balances[ALICE], 5000);
      assert.equal(res.balances[BOB], -5000);
      assert.equal(res.balances[CHARLIE], 0);

      const transfers = simplifyDebts(res.balances);
      assert.equal(transfers.length, 1);
      assert.equal(transfers[0].from, BOB);
      assert.equal(transfers[0].to, ALICE);
    });

    it("should initialize group members who have 0 activity when options.members is provided", () => {
      const expenses = [
        {
          description: "Coffee",
          amount: 50,
          paidBy: ALICE,
          splits: [
            { user: ALICE, amount: 25 },
            { user: BOB, amount: 25 }
          ]
        }
      ];

      const res = calculateNetBalances(expenses, {
        members: [ALICE, BOB, CHARLIE, DAVID]
      });

      assert.equal(res.balances[CHARLIE], 0);
      assert.equal(res.balances[DAVID], 0);
      assert.equal(res.memberBalances.length, 4);

      const charlieDetail = res.memberBalances.find((m) => m.user === CHARLIE);
      assert.deepEqual(charlieDetail, {
        user: CHARLIE,
        netBalance: 0,
        netBalancePaise: 0,
        totalPaid: 0,
        totalPaidPaise: 0,
        totalShare: 0,
        totalSharePaise: 0
      });
    });
  });

  describe("5. Zero Balances and Fully Settled Groups", () => {
    it("should return empty balances and zero transfers for empty expenses array", () => {
      const res = calculateNetBalances([]);
      assert.deepEqual(res.balances, {});
      assert.equal(res.totalExpensesPaise, 0);
      assert.equal(res.totalExpenses, 0);
      assert.deepEqual(res.memberBalances, []);

      const transfers = simplifyDebts(res.balances);
      assert.deepEqual(transfers, []);
    });

    it("should return empty transfers when mutual expenses cancel out completely", () => {
      // Alice pays ₹100 for Bob
      // Bob pays ₹100 for Alice
      const expenses = [
        {
          description: "Movie tickets",
          amount: 100,
          paidBy: ALICE,
          splits: [{ user: BOB, amount: 100 }]
        },
        {
          description: "Popcorn",
          amount: 100,
          paidBy: BOB,
          splits: [{ user: ALICE, amount: 100 }]
        }
      ];

      const res = calculateNetBalances(expenses);
      assert.equal(res.balances[ALICE], 0);
      assert.equal(res.balances[BOB], 0);

      const transfers = simplifyDebts(res.balances);
      assert.deepEqual(transfers, []);
    });

    it("should detect circular debts and produce zero transfers when net balances are 0", () => {
      // 3-way circular debt:
      // Alice pays 100 for Bob
      // Bob pays 100 for Charlie
      // Charlie pays 100 for Alice
      const expenses = [
        { amount: 100, paidBy: ALICE, splits: [{ user: BOB, amount: 100 }] },
        { amount: 100, paidBy: BOB, splits: [{ user: CHARLIE, amount: 100 }] },
        { amount: 100, paidBy: CHARLIE, splits: [{ user: ALICE, amount: 100 }] }
      ];

      const res = calculateNetBalances(expenses);
      assert.equal(res.balances[ALICE], 0);
      assert.equal(res.balances[BOB], 0);
      assert.equal(res.balances[CHARLIE], 0);

      const transfers = simplifyDebts(res);
      assert.deepEqual(transfers, []);
    });
  });

  describe("6. Debt Simplification Engine", () => {
    it("should simplify transitive debts across 3 members into direct transfers", () => {
      // Net balances: Alice owes ₹100 (-10000 paise), Bob has ₹0 net, Charlie is owed ₹100 (+10000 paise)
      // Transitive debt: Alice -> Bob -> Charlie simplified directly to Alice -> Charlie
      const balances = {
        [ALICE]: -10000,
        [BOB]: 0,
        [CHARLIE]: 10000
      };

      const transfers = simplifyDebts(balances);
      assert.equal(transfers.length, 1);
      assert.deepEqual(transfers[0], {
        from: ALICE,
        to: CHARLIE,
        payer: ALICE,
        recipient: CHARLIE,
        amount: 100,
        amountPaise: 10000
      });
    });

    it("should optimize transfers with exact 1-to-1 matches (Pass 1 optimization)", () => {
      // Alice owes ₹60, Bob owes ₹40
      // Charlie is owed ₹60, David is owed ₹40
      // Naive greedy pairing might do Alice->Charlie (60), but could cross-pair.
      // Exact match pairs:
      // Alice (60) -> Charlie (60)
      // Bob (40) -> David (40)
      // Total transfers: exactly 2!
      const balances = {
        [ALICE]: -6000,
        [BOB]: -4000,
        [CHARLIE]: 6000,
        [DAVID]: 4000
      };

      const transfers = simplifyDebts(balances);
      assert.equal(transfers.length, 2);

      assert.deepEqual(transfers, [
        {
          from: ALICE,
          to: CHARLIE,
          payer: ALICE,
          recipient: CHARLIE,
          amount: 60,
          amountPaise: 6000
        },
        {
          from: BOB,
          to: DAVID,
          payer: BOB,
          recipient: DAVID,
          amount: 40,
          amountPaise: 4000
        }
      ]);
    });

    it("should deterministically simplify complex 5-member net balances", () => {
      // Debits:
      // Alice: -5000 paise (owes ₹50)
      // Bob:   -3000 paise (owes ₹30)
      // Charlie: -2000 paise (owes ₹20)
      // Credits:
      // David: +6000 paise (owed ₹60)
      // Emily: +4000 paise (owed ₹40)
      // Sum = 0
      const balances = {
        [ALICE]: -5000,
        [BOB]: -3000,
        [CHARLIE]: -2000,
        [DAVID]: 6000,
        [EMILY]: 4000
      };

      const transfers = simplifyDebts(balances);

      // Verify every transfer is positive
      for (const t of transfers) {
        assert.ok(t.amountPaise > 0, "Transfer amount must be strictly positive");
        assert.equal(t.amount, fromPaise(t.amountPaise));
        assert.ok(t.from !== t.to, "Cannot transfer to oneself");
      }

      // Verify transfers mathematically settle every individual's balance
      const settlementCheck = {
        [ALICE]: 0,
        [BOB]: 0,
        [CHARLIE]: 0,
        [DAVID]: 0,
        [EMILY]: 0
      };

      for (const t of transfers) {
        settlementCheck[t.from] -= t.amountPaise;
        settlementCheck[t.to] += t.amountPaise;
      }

      assert.equal(settlementCheck[ALICE], -5000);
      assert.equal(settlementCheck[BOB], -3000);
      assert.equal(settlementCheck[CHARLIE], -2000);
      assert.equal(settlementCheck[DAVID], 6000);
      assert.equal(settlementCheck[EMILY], 4000);
    });

    it("should accept array of memberBalances as input to simplifyDebts", () => {
      const input = [
        { user: ALICE, netBalancePaise: -3000 },
        { user: BOB, netBalancePaise: 3000 }
      ];

      const transfers = simplifyDebts(input);
      assert.equal(transfers.length, 1);
      assert.equal(transfers[0].from, ALICE);
      assert.equal(transfers[0].to, BOB);
      assert.equal(transfers[0].amountPaise, 3000);
    });
  });

  describe("7. Paise Rounding and Remainder Handling", () => {
    it("should handle equal 3-way split of ₹100 with exact paise remainder distribution", () => {
      // ₹100 = 10000 paise. 10000 / 3 = 3333 with remainder 1 paisa.
      // splitEqual allocates 3334 to the first participant and 3333 to the remaining two.
      const splitRes = splitEqual(100, [ALICE, BOB, CHARLIE]);
      assert.equal(splitRes.splits[0].amountPaise, 3334);
      assert.equal(splitRes.splits[1].amountPaise, 3333);
      assert.equal(splitRes.splits[2].amountPaise, 3333);

      const expenses = [
        {
          description: "Lunch",
          amountPaise: 10000,
          paidBy: ALICE,
          splits: splitRes.splits
        }
      ];

      const res = calculateNetBalances(expenses);
      // Alice paid 10000, share 3334 -> netBalance: +6666 paise (+₹66.66)
      // Bob paid 0, share 3333 -> netBalance: -3333 paise (-₹33.33)
      // Charlie paid 0, share 3333 -> netBalance: -3333 paise (-₹33.33)
      assert.equal(res.balances[ALICE], 6666);
      assert.equal(res.balances[BOB], -3333);
      assert.equal(res.balances[CHARLIE], -3333);

      // Verify zero-sum invariant holds strictly down to the single paisa
      assert.equal(res.balances[ALICE] + res.balances[BOB] + res.balances[CHARLIE], 0);

      // Debt simplification:
      // Bob pays Alice 3333 paise (₹33.33)
      // Charlie pays Alice 3333 paise (₹33.33)
      const transfers = simplifyDebts(res.balances);
      assert.equal(transfers.length, 2);
      assert.deepEqual(transfers, [
        {
          from: BOB,
          to: ALICE,
          payer: BOB,
          recipient: ALICE,
          amount: 33.33,
          amountPaise: 3333
        },
        {
          from: CHARLIE,
          to: ALICE,
          payer: CHARLIE,
          recipient: ALICE,
          amount: 33.33,
          amountPaise: 3333
        }
      ]);

      // Total transfers equal Alice's exact credit
      const totalTransferredPaise = transfers.reduce((sum, t) => sum + t.amountPaise, 0);
      assert.equal(totalTransferredPaise, 6666);
    });

    it("should handle odd remainders across multiple fractional percentage splits", () => {
      // ₹100 split 33.33%, 33.33%, 33.34%
      const pctSplits = splitPercentage(100, [
        { user: ALICE, percentage: 33.33 },
        { user: BOB, percentage: 33.33 },
        { user: CHARLIE, percentage: 33.34 }
      ]);

      const expenses = [
        {
          description: "Odd percentage test",
          amount: 100,
          paidBy: BOB,
          splits: pctSplits.splits
        }
      ];

      const res = calculateNetBalances(expenses);
      const sum = Object.values(res.balances).reduce((acc, v) => acc + v, 0);
      assert.equal(sum, 0);

      const settlements = calculateSettlements(expenses);
      assert.ok(settlements.transfers.length > 0);
      for (const t of settlements.transfers) {
        assert.ok(t.amountPaise > 0);
        assert.equal(Number.isInteger(t.amountPaise), true);
      }
    });
  });

  describe("8. Invalid or Inconsistent Expense Data Rejection", () => {
    it("should reject non-array expenses input", () => {
      assert.throws(() => calculateNetBalances("not an array"), /expected an array/);
      assert.throws(() => calculateNetBalances(null), /expected an array/);
    });

    it("should reject expense without amount or amountPaise", () => {
      assert.throws(
        () => calculateNetBalances([{ paidBy: ALICE, splits: [{ user: ALICE, amount: 10 }] }]),
        /amount is required/
      );
    });

    it("should reject non-positive or negative expense amounts", () => {
      assert.throws(
        () =>
          calculateNetBalances([
            {
              amount: 0,
              paidBy: ALICE,
              splits: [{ user: ALICE, amount: 0 }]
            }
          ]),
        /must be greater than zero/
      );

      assert.throws(
        () =>
          calculateNetBalances([
            {
              amountPaise: -100,
              paidBy: ALICE,
              splits: [{ user: ALICE, amountPaise: -100 }]
            }
          ]),
        /amount must be positive/
      );
    });

    it("should reject expense without paidBy", () => {
      assert.throws(
        () =>
          calculateNetBalances([
            {
              amount: 100,
              splits: [{ user: ALICE, amount: 100 }]
            }
          ]),
        /paidBy is required/
      );
    });

    it("should reject expense with empty or invalid splits", () => {
      assert.throws(
        () =>
          calculateNetBalances([
            {
              amount: 100,
              paidBy: ALICE,
              splits: []
            }
          ]),
        /splits array is required and must not be empty/
      );
    });

    it("should reject duplicate participants in expense splits", () => {
      assert.throws(
        () =>
          calculateNetBalances([
            {
              amount: 100,
              paidBy: ALICE,
              splits: [
                { user: BOB, amount: 50 },
                { user: BOB, amount: 50 }
              ]
            }
          ]),
        /duplicate participant/
      );
    });

    it("should reject inconsistent expense where splits sum does not match total amount", () => {
      // Expense total = ₹100 (10000 paise), but splits sum to ₹90 (9000 paise)
      assert.throws(
        () =>
          calculateNetBalances([
            {
              amountPaise: 10000,
              paidBy: ALICE,
              splits: [
                { user: ALICE, amountPaise: 5000 },
                { user: BOB, amountPaise: 4000 }
              ]
            }
          ]),
        /sum of split allocations \(9000 paise\) does not match total expense amount \(10000 paise\)/
      );

      // Over-allocated: total = 10000, splits = 11000
      assert.throws(
        () =>
          calculateNetBalances([
            {
              amountPaise: 10000,
              paidBy: ALICE,
              splits: [
                { user: ALICE, amountPaise: 6000 },
                { user: BOB, amountPaise: 5000 }
              ]
            }
          ]),
        /sum of split allocations \(11000 paise\) does not match total expense amount \(10000 paise\)/
      );
    });

    it("should reject when amount and amountPaise are both supplied but contradict each other", () => {
      assert.throws(
        () =>
          calculateNetBalances([
            {
              amount: 100, // 10000 paise
              amountPaise: 5000, // contradicts
              paidBy: ALICE,
              splits: [{ user: ALICE, amountPaise: 5000 }]
            }
          ]),
        /amount \(100\) does not match amountPaise \(5000\)/
      );
    });

    it("should reject negative split allocations", () => {
      assert.throws(
        () =>
          calculateNetBalances([
            {
              amountPaise: 5000,
              paidBy: ALICE,
              splits: [
                { user: ALICE, amountPaise: 6000 },
                { user: BOB, amountPaise: -1000 }
              ]
            }
          ]),
        /cannot be negative/
      );
    });

    it("should reject non-integer paise values in validateIntegerPaise", () => {
      assert.throws(() => validateIntegerPaise(10.5), /expected integer paise/);
      assert.throws(() => validateIntegerPaise(NaN), /expected integer paise/);
      assert.throws(() => validateIntegerPaise("100"), /expected integer paise/);
      assert.throws(() => validateIntegerPaise(Infinity), /expected integer paise/);
    });

    it("should reject simplifyDebts if net balances do not sum to zero", () => {
      // Inconsistent balances: +5000 and -4000 (sums to +1000)
      assert.throws(
        () =>
          simplifyDebts({
            [ALICE]: 5000,
            [BOB]: -4000
          }),
        /Inconsistent balance data for debt simplification: net balances sum to 1000 paise, expected 0/
      );
    });

    it("should reject simplifyDebts if balance is non-integer paise", () => {
      assert.throws(
        () =>
          simplifyDebts({
            [ALICE]: 5000.5,
            [BOB]: -5000.5
          }),
        /expected integer paise/
      );
    });
  });

  describe("9. Determinism and Idempotence", () => {
    it("should produce identical results regardless of expense input order", () => {
      const exp1 = {
        description: "Dinner",
        amountPaise: 12000,
        paidBy: ALICE,
        splits: [
          { user: ALICE, amountPaise: 4000 },
          { user: BOB, amountPaise: 4000 },
          { user: CHARLIE, amountPaise: 4000 }
        ]
      };

      const exp2 = {
        description: "Cab",
        amountPaise: 6000,
        paidBy: BOB,
        splits: [
          { user: ALICE, amountPaise: 2000 },
          { user: BOB, amountPaise: 2000 },
          { user: CHARLIE, amountPaise: 2000 }
        ]
      };

      const exp3 = {
        description: "Coffee",
        amountPaise: 3000,
        paidBy: CHARLIE,
        splits: [
          { user: ALICE, amountPaise: 1000 },
          { user: BOB, amountPaise: 1000 },
          { user: CHARLIE, amountPaise: 1000 }
        ]
      };

      const resOrder1 = calculateSettlements([exp1, exp2, exp3]);
      const resOrder2 = calculateSettlements([exp3, exp1, exp2]);
      const resOrder3 = calculateSettlements([exp2, exp3, exp1]);

      assert.deepEqual(resOrder1.balances, resOrder2.balances);
      assert.deepEqual(resOrder1.balances, resOrder3.balances);
      assert.deepEqual(resOrder1.transfers, resOrder2.transfers);
      assert.deepEqual(resOrder1.transfers, resOrder3.transfers);
    });

    it("should produce identical transfers across 100 repeated executions", () => {
      const balances = {
        [ALICE]: -7500,
        [BOB]: -2500,
        [CHARLIE]: 4000,
        [DAVID]: 6000
      };

      const baseline = simplifyDebts(balances);

      for (let i = 0; i < 100; i++) {
        const run = simplifyDebts(balances);
        assert.deepEqual(run, baseline);
      }
    });
  });
});
