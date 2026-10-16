import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractFriendsFromGroups,
  computeFriendGroupRelationship,
  aggregateFriendLedger,
  filterFriends
} from "./friendLedgerUtils.js";

describe("Friends & Ledgers Utilities Test Suite", () => {
  const currentUserId = "user-current-001";
  const friendRamId = "user-ram-101";
  const friendPriyaId = "user-priya-202";

  const groupApt = {
    id: "grp-apt-4b",
    name: "Apartment 4B",
    category: "Home",
    members: [
      { user: { _id: currentUserId, name: "Me (Current User)", email: "me@example.com" } },
      { user: { _id: friendRamId, name: "Ram Sharma", email: "ram@example.com" } },
      { user: { _id: friendPriyaId, name: "Priya Patel", email: "priya@example.com" } }
    ]
  };

  const groupTrip = {
    id: "grp-trip-goa",
    name: "Goa Vacation",
    category: "Trip",
    members: [
      { user: { _id: currentUserId, name: "Me", email: "me@example.com" } },
      { user: { _id: friendRamId, name: "Ram Sharma", email: "ram@example.com" } }
    ]
  };

  describe("1. Deduplicating friends across multiple groups and excluding current user", () => {
    it("should extract distinct friends and strictly exclude current user", () => {
      const friends = extractFriendsFromGroups([groupApt, groupTrip], currentUserId);

      // Current user must not be in friends list
      assert.ok(!friends.some((f) => f.id === currentUserId));

      // Ram is in both groups, must appear exactly once
      const ramEntries = friends.filter((f) => f.id === friendRamId);
      assert.equal(ramEntries.length, 1);

      // Priya is in Apartment 4B, must appear once
      const priyaEntries = friends.filter((f) => f.id === friendPriyaId);
      assert.equal(priyaEntries.length, 1);

      assert.equal(friends.length, 2);
    });

    it("should compile correct shared-group lists for each friend", () => {
      const friends = extractFriendsFromGroups([groupApt, groupTrip], currentUserId);
      const ram = friends.find((f) => f.id === friendRamId);
      const priya = friends.find((f) => f.id === friendPriyaId);

      assert.equal(ram.sharedGroups.length, 2);
      assert.ok(ram.sharedGroups.some((g) => g.id === "grp-apt-4b"));
      assert.ok(ram.sharedGroups.some((g) => g.id === "grp-trip-goa"));

      assert.equal(priya.sharedGroups.length, 1);
      assert.equal(priya.sharedGroups[0].id, "grp-apt-4b");
    });

    it("should safely handle members with missing or raw ID representations", () => {
      const groupWithRawIds = {
        id: "grp-raw",
        name: "Raw ID Group",
        members: [
          { user: currentUserId },
          { user: "user-raw-999" }
        ]
      };

      const friends = extractFriendsFromGroups([groupWithRawIds], currentUserId);
      assert.equal(friends.length, 1);
      assert.equal(friends[0].id, "user-raw-999");
      assert.equal(friends[0].name, "SplitMate Friend");
    });
  });

  describe("2. Group-level relationship and avoiding invented bilateral debts", () => {
    it("should identify an actionable direct transfer where friend owes current user", () => {
      const mockSuggestions = {
        transfers: [
          {
            from: friendRamId,
            to: currentUserId,
            fromUser: { id: friendRamId, name: "Ram" },
            toUser: { id: currentUserId, name: "Me" },
            amount: 450.0,
            amountPaise: 45000
          }
        ]
      };

      const rel = computeFriendGroupRelationship({
        friendId: friendRamId,
        group: groupApt,
        balancesData: {
          memberBalances: [
            { user: currentUserId, netBalancePaise: 45000 },
            { user: friendRamId, netBalancePaise: -45000 }
          ]
        },
        settlementSuggestionsData: mockSuggestions,
        currentUserId
      });

      assert.equal(rel.status, "owes_you");
      assert.equal(rel.transferType, "you_receive");
      assert.equal(rel.transferAmountPaise, 45000);
      assert.equal(rel.transferAmount, 450.0);
      assert.ok(rel.directTransfer);
    });

    it("should identify an actionable direct transfer where current user owes friend", () => {
      const mockSuggestions = {
        transfers: [
          {
            from: currentUserId,
            to: friendRamId,
            amount: 200.0,
            amountPaise: 20000
          }
        ]
      };

      const rel = computeFriendGroupRelationship({
        friendId: friendRamId,
        group: groupApt,
        settlementSuggestionsData: mockSuggestions,
        currentUserId
      });

      assert.equal(rel.status, "you_owe");
      assert.equal(rel.transferType, "you_pay");
      assert.equal(rel.transferAmountPaise, 20000);
    });

    it("should avoid inventing a bilateral balance when members have group balances but no direct simplified transfer", () => {
      // In a 3-way split (User, Ram, Priya):
      // User is +200, Priya is -200, Ram is 0.
      // Debt simplification has Priya -> User (₹200).
      // Between User and Ram, there is NO direct transfer!
      const mockSuggestions = {
        transfers: [
          { from: friendPriyaId, to: currentUserId, amount: 200, amountPaise: 20000 }
        ]
      };

      const rel = computeFriendGroupRelationship({
        friendId: friendRamId,
        group: groupApt,
        balancesData: {
          memberBalances: [
            { user: currentUserId, netBalancePaise: 20000 },
            { user: friendRamId, netBalancePaise: 0 },
            { user: friendPriyaId, netBalancePaise: -20000 }
          ]
        },
        settlementSuggestionsData: mockSuggestions,
        currentUserId
      });

      // Status must be group_managed, not a fabricated peer-to-peer amount
      assert.equal(rel.status, "group_managed");
      assert.equal(rel.directTransfer, null);
      assert.equal(rel.transferAmountPaise, 0);
      assert.equal(rel.userNetPaise, 20000);
      assert.equal(rel.friendNetPaise, 0);
    });
  });

  describe("3. Settlement filtering (cancelled settlements excluded)", () => {
    it("should exclude cancelled settlements from completed payment history", () => {
      const settlements = [
        {
          _id: "settle-1",
          payer: friendRamId,
          receiver: currentUserId,
          amount: 300,
          status: "completed",
          settledAt: "2026-10-12T10:00:00.000Z"
        },
        {
          _id: "settle-2",
          payer: friendRamId,
          receiver: currentUserId,
          amount: 300,
          status: "cancelled", // MUST BE EXCLUDED
          settledAt: "2026-10-14T10:00:00.000Z"
        },
        {
          _id: "settle-3",
          payer: friendPriyaId, // Third party, not between User and Ram
          receiver: friendRamId,
          amount: 150,
          status: "completed"
        }
      ];

      const rel = computeFriendGroupRelationship({
        friendId: friendRamId,
        group: groupApt,
        settlements,
        currentUserId
      });

      assert.equal(rel.settlements.length, 1);
      assert.equal(rel.settlements[0]._id, "settle-1");
    });
  });

  describe("4. Aggregating balances across groups without double counting", () => {
    it("should aggregate actionable transfers across multiple shared groups", () => {
      const relGroup1 = {
        groupId: "grp-apt-4b",
        groupName: "Apartment 4B",
        directTransfer: { from: friendRamId, to: currentUserId, amount: 500, amountPaise: 50000 },
        transferType: "you_receive",
        transferAmountPaise: 50000
      };

      const relGroup2 = {
        groupId: "grp-trip-goa",
        groupName: "Goa Vacation",
        directTransfer: { from: friendRamId, to: currentUserId, amount: 250, amountPaise: 25000 },
        transferType: "you_receive",
        transferAmountPaise: 25000
      };

      const aggregated = aggregateFriendLedger(friendRamId, [relGroup1, relGroup2]);

      assert.equal(aggregated.overallStatus, "owes_you");
      assert.equal(aggregated.totalOwedToYouPaise, 75000); // ₹750.00
      assert.equal(aggregated.totalOwedToYou, 750.0);
      assert.equal(aggregated.totalYouOwePaise, 0);
      assert.equal(aggregated.actionableTransfers.length, 2);
    });

    it("should clearly identify mixed balances across different groups", () => {
      const relGroup1 = {
        groupId: "grp-apt-4b",
        groupName: "Apartment 4B",
        directTransfer: { from: friendRamId, to: currentUserId, amount: 300, amountPaise: 30000 },
        transferType: "you_receive",
        transferAmountPaise: 30000
      };

      const relGroup2 = {
        groupId: "grp-trip-goa",
        groupName: "Goa Vacation",
        directTransfer: { from: currentUserId, to: friendRamId, amount: 100, amountPaise: 10000 },
        transferType: "you_pay",
        transferAmountPaise: 10000
      };

      const aggregated = aggregateFriendLedger(friendRamId, [relGroup1, relGroup2]);

      // Both payables and receivables exist in distinct groups
      assert.equal(aggregated.overallStatus, "mixed");
      assert.equal(aggregated.totalOwedToYouPaise, 30000);
      assert.equal(aggregated.totalYouOwePaise, 10000);
      assert.equal(aggregated.actionableTransfers.length, 2);
    });
  });

  describe("5. Empty and fully settled states", () => {
    it("should correctly identify a fully settled friend", () => {
      const relSettled = {
        groupId: "grp-apt-4b",
        groupName: "Apartment 4B",
        directTransfer: null,
        userNetPaise: 0,
        friendNetPaise: 0,
        status: "settled"
      };

      const aggregated = aggregateFriendLedger(friendRamId, [relSettled]);
      assert.equal(aggregated.overallStatus, "settled");
      assert.equal(aggregated.totalYouOwePaise, 0);
      assert.equal(aggregated.totalOwedToYouPaise, 0);
      assert.equal(aggregated.actionableTransfers.length, 0);
    });

    it("should return empty array for 0 groups or null input", () => {
      assert.deepEqual(extractFriendsFromGroups([], currentUserId), []);
      assert.deepEqual(extractFriendsFromGroups(null, currentUserId), []);
      assert.deepEqual(filterFriends(null), []);
    });
  });

  describe("6. Friend filtering by search query and balance status", () => {
    const friendList = [
      {
        id: friendRamId,
        name: "Ram Sharma",
        email: "ram@example.com",
        sharedGroups: [{ name: "Apartment 4B" }],
        ledger: { overallStatus: "owes_you" }
      },
      {
        id: friendPriyaId,
        name: "Priya Patel",
        email: "priya@example.com",
        sharedGroups: [{ name: "Goa Trip" }],
        ledger: { overallStatus: "settled" }
      }
    ];

    it("should filter by search query on friend name", () => {
      const result = filterFriends(friendList, { searchQuery: "priya" });
      assert.equal(result.length, 1);
      assert.equal(result[0].id, friendPriyaId);
    });

    it("should filter by search query on shared group name", () => {
      const result = filterFriends(friendList, { searchQuery: "apartment" });
      assert.equal(result.length, 1);
      assert.equal(result[0].id, friendRamId);
    });

    it("should filter by balance status 'unsettled' vs 'settled'", () => {
      const unsettled = filterFriends(friendList, { balanceFilter: "unsettled" });
      assert.equal(unsettled.length, 1);
      assert.equal(unsettled[0].id, friendRamId);

      const settled = filterFriends(friendList, { balanceFilter: "settled" });
      assert.equal(settled.length, 1);
      assert.equal(settled[0].id, friendPriyaId);
    });
  });
});
