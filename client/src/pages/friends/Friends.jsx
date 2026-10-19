import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Search,
  X,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  Receipt,
  ArrowLeftRight,
  Home,
  Plane,
  Heart,
  Folder,
  TrendingUp,
  TrendingDown,
  RotateCcw,
  UserCheck
} from "lucide-react";
import { api, ApiError } from "../../services/api";
import { useAuth } from "../../context/useAuth";
import { toIdString } from "../../services/dashboardUtils";
import { formatINR, formatDateTime } from "../../services/settlementUtils";
import {
  extractFriendsFromGroups,
  computeFriendGroupRelationship,
  aggregateFriendLedger,
  filterFriends
} from "../../services/friendLedgerUtils";
import { RecordSettlementModal } from "../settlements/RecordSettlementModal";
import { ExpenseItem } from "../../components/expenses/ExpenseItem";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { Alert } from "../../components/common/Alert";
import { LoadingSpinner } from "../../components/common/LoadingSpinner";
import "./Friends.css";

const CATEGORY_ICONS = {
  Home: Home,
  Trip: Plane,
  Couple: Heart,
  Other: Folder
};

export function Friends() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUserId = user?.id || user?._id;

  // Raw states
  const [groups, setGroups] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [selectedFriendId, setSelectedFriendId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [actionFeedback, setActionFeedback] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [balanceFilter, setBalanceFilter] = useState("all"); // 'all' | 'unsettled' | 'owes_you' | 'you_owe' | 'settled'

  // Detail panel active tab: 'expenses' | 'settlements'
  const [activeTab, setActiveTab] = useState("expenses");

  // Settle Up Modal state
  const [recordModalData, setRecordModalData] = useState({
    isOpen: false,
    transfer: null,
    groupId: null,
    groupName: null
  });

  // Request race-condition sequence guard
  const fetchSeqRef = useRef(0);

  // Primary data loader
  useEffect(() => {
    let isMounted = true;
    const seq = ++fetchSeqRef.current;

    async function loadFriendsData() {
      if (seq > 1) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        // 1. Fetch user groups
        const groupsRes = await api.groups.list();
        if (!isMounted || seq !== fetchSeqRef.current) return;

        const loadedGroups = groupsRes?.groups || [];
        setGroups(loadedGroups);

        if (loadedGroups.length === 0) {
          setFriendsList([]);
          setSelectedFriendId("");
          return;
        }

        // 2. Fetch balances, suggestions, settlements, and expenses for all groups
        const groupDataPromises = loadedGroups.map(async (g) => {
          const gid = g.id || g._id;
          try {
            const [balRes, suggRes, settleRes, expRes] = await Promise.all([
              api.groups.getBalances(gid).catch(() => null),
              api.groups.getSettlementSuggestions(gid).catch(() => null),
              api.settlements.list(gid).catch(() => ({ settlements: [] })),
              api.expenses.list(gid).catch(() => ({ expenses: [] }))
            ]);

            return {
              group: g,
              balancesData: balRes?.success ? balRes : null,
              settlementSuggestionsData: suggRes?.success ? suggRes : null,
              settlements: Array.isArray(settleRes?.settlements) ? settleRes.settlements : [],
              expenses: Array.isArray(expRes?.expenses) ? expRes.expenses : []
            };
          } catch {
            return {
              group: g,
              balancesData: null,
              settlementSuggestionsData: null,
              settlements: [],
              expenses: []
            };
          }
        });

        const allGroupDatasets = await Promise.all(groupDataPromises);
        if (!isMounted || seq !== fetchSeqRef.current) return;

        // 3. Extract distinct friends across groups
        const rawFriends = extractFriendsFromGroups(loadedGroups, user);

        // 4. Compute relationships and aggregate ledgers for each friend
        const enrichedFriends = rawFriends.map((friend) => {
          const groupRelationships = friend.sharedGroups.map((sg) => {
            const grpDataset = allGroupDatasets.find(
              (gd) => toIdString(gd.group.id || gd.group._id) === sg.id
            );

            if (!grpDataset) return null;

            return computeFriendGroupRelationship({
              friendId: friend.id,
              group: grpDataset.group,
              balancesData: grpDataset.balancesData,
              settlementSuggestionsData: grpDataset.settlementSuggestionsData,
              settlements: grpDataset.settlements,
              expenses: grpDataset.expenses,
              currentUserId
            });
          }).filter(Boolean);

          const ledger = aggregateFriendLedger(friend.id, groupRelationships);

          return {
            ...friend,
            ledger
          };
        });

        setFriendsList(enrichedFriends);

        // Maintain selection if already chosen, or pick the first friend
        setSelectedFriendId((prev) => {
          const exists = enrichedFriends.some((f) => f.id === prev);
          if (exists) return prev;
          return enrichedFriends.length > 0 ? enrichedFriends[0].id : "";
        });
      } catch (err) {
        if (isMounted && seq === fetchSeqRef.current) {
          setError(err instanceof ApiError ? err.message : "Failed to load friends and ledgers");
        }
      } finally {
        if (isMounted && seq === fetchSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadFriendsData();

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger, user, currentUserId]);

  const handleRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  // Filtered friends list
  const filteredFriends = useMemo(() => {
    return filterFriends(friendsList, { searchQuery, balanceFilter });
  }, [friendsList, searchQuery, balanceFilter]);

  // Selected friend object
  const selectedFriend = useMemo(() => {
    return (
      filteredFriends.find((f) => f.id === selectedFriendId) ||
      friendsList.find((f) => f.id === selectedFriendId) ||
      filteredFriends[0] ||
      null
    );
  }, [filteredFriends, friendsList, selectedFriendId]);

  // Aggregate metrics across all friends
  const metrics = useMemo(() => {
    let totalOwedToYouPaise = 0;
    let totalYouOwePaise = 0;

    for (const f of friendsList) {
      if (f.ledger) {
        totalOwedToYouPaise += f.ledger.totalOwedToYouPaise || 0;
        totalYouOwePaise += f.ledger.totalYouOwePaise || 0;
      }
    }

    return {
      friendCount: friendsList.length,
      totalOwedToYou: totalOwedToYouPaise / 100,
      totalYouOwe: totalYouOwePaise / 100
    };
  }, [friendsList]);

  // Handle Settle Up button click
  const handleOpenSettleModal = (item) => {
    setRecordModalData({
      isOpen: true,
      transfer: item.transfer,
      groupId: item.groupId,
      groupName: item.groupName
    });
  };

  const handleSettlementSuccess = (res) => {
    setActionFeedback(res?.message || "Settlement payment recorded successfully!");
    setTimeout(() => setActionFeedback(""), 3500);
    handleRefresh();
  };

  return (
    <div className="friends-page animate-fade-in">
      {/* Page Header */}
      <div className="friends-page-header">
        <div className="friends-title-wrap">
          <div className="friends-badge-row">
            <Badge variant="mint" size="sm">
              PEER DIRECTORY
            </Badge>
            <span style={{ fontSize: "12px", color: "var(--charcoal-500)" }}>
              {friendsList.length} {friendsList.length === 1 ? "Friend" : "Friends"} Across {groups.length} {groups.length === 1 ? "Group" : "Groups"}
            </span>
          </div>
          <h1 className="friends-title">Friends & Ledgers</h1>
          <p className="friends-subtitle">
            Direct peer-to-peer balance breakdown, shared group ledgers, and settlement history across your active groups.
          </p>
        </div>

        <div className="friends-header-actions">
          <Button
            variant="outline"
            size="md"
            icon={RefreshCw}
            isLoading={refreshing}
            onClick={handleRefresh}
            title="Refresh friends list"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Action Feedback Alert */}
      {actionFeedback && (
        <Alert variant="success" onClose={() => setActionFeedback("")}>
          {actionFeedback}
        </Alert>
      )}

      {/* Error Alert */}
      {error && (
        <Alert variant="error" title="Error Loading Friends" onClose={() => setError(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span>{error}</span>
            <div>
              <Button variant="secondary" size="sm" icon={RotateCcw} onClick={handleRefresh}>
                Retry Loading
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {/* Summary Metrics Cards */}
      <div className="friends-metrics-bar">
        <div className="friends-metric-card">
          <div className="friends-metric-icon-wrap icon-teal">
            <Users size={20} />
          </div>
          <div className="friends-metric-info">
            <span className="friends-metric-label">Total Friends</span>
            <span className="friends-metric-value">{metrics.friendCount} Peers</span>
          </div>
        </div>

        <div className="friends-metric-card">
          <div className="friends-metric-icon-wrap icon-emerald">
            <TrendingUp size={20} />
          </div>
          <div className="friends-metric-info">
            <span className="friends-metric-label">You Are Owed</span>
            <span className="friends-metric-value text-emerald">
              ₹{formatINR(metrics.totalOwedToYou)}
            </span>
          </div>
        </div>

        <div className="friends-metric-card">
          <div className="friends-metric-icon-wrap icon-amber">
            <TrendingDown size={20} />
          </div>
          <div className="friends-metric-info">
            <span className="friends-metric-label">You Owe</span>
            <span className="friends-metric-value" style={{ color: "#D97706" }}>
              ₹{formatINR(metrics.totalYouOwe)}
            </span>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="friends-toolbar">
        <div className="friends-search-box">
          <Search size={16} className="friends-search-icon" />
          <input
            type="text"
            className="friends-search-input"
            placeholder="Search by friend name, email or group..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search friends"
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="friends-filter-pills" role="radiogroup" aria-label="Filter by balance status">
          <button
            type="button"
            className={`friends-pill ${balanceFilter === "all" ? "is-active" : ""}`}
            onClick={() => setBalanceFilter("all")}
          >
            All ({friendsList.length})
          </button>
          <button
            type="button"
            className={`friends-pill ${balanceFilter === "unsettled" ? "is-active" : ""}`}
            onClick={() => setBalanceFilter("unsettled")}
          >
            Unsettled
          </button>
          <button
            type="button"
            className={`friends-pill ${balanceFilter === "owes_you" ? "is-active" : ""}`}
            onClick={() => setBalanceFilter("owes_you")}
          >
            Owed to You
          </button>
          <button
            type="button"
            className={`friends-pill ${balanceFilter === "you_owe" ? "is-active" : ""}`}
            onClick={() => setBalanceFilter("you_owe")}
          >
            You Owe
          </button>
          <button
            type="button"
            className={`friends-pill ${balanceFilter === "settled" ? "is-active" : ""}`}
            onClick={() => setBalanceFilter("settled")}
          >
            Settled Up
          </button>
        </div>
      </div>

      {/* Main Two-Panel Layout */}
      {loading ? (
        <div className="friends-empty-card">
          <LoadingSpinner message="Loading friends directory & ledgers..." />
        </div>
      ) : groups.length === 0 ? (
        /* Empty State: 0 groups */
        <div className="friends-empty-card">
          <div className="empty-icon-wrap">
            <Users size={28} />
          </div>
          <h4 className="friends-empty-title">No Active Groups Found</h4>
          <p className="friends-empty-desc">
            You aren&apos;t a member of any group yet. Create or join a shared group with friends to start tracking mutual expenses.
          </p>
          <Button variant="primary" size="md" icon={Users} onClick={() => navigate("/groups")}>
            Create or Join Group
          </Button>
        </div>
      ) : friendsList.length === 0 ? (
        /* Empty State: groups exist but user is the only member */
        <div className="friends-empty-card">
          <div className="empty-icon-wrap">
            <UserCheck size={28} />
          </div>
          <h4 className="friends-empty-title">No Friends in Your Groups Yet</h4>
          <p className="friends-empty-desc">
            You are currently the only member in your groups. Share your group invite links with friends and roommates to connect ledgers!
          </p>
          <Button variant="primary" size="md" icon={Users} onClick={() => navigate("/groups")}>
            View Groups & Share Invites
          </Button>
        </div>
      ) : filteredFriends.length === 0 ? (
        /* Empty State: Search filter yielded 0 results */
        <div className="friends-empty-card">
          <div className="empty-icon-wrap neutral">
            <Search size={28} />
          </div>
          <h4 className="friends-empty-title">No Matching Friends</h4>
          <p className="friends-empty-desc">
            No friends match your current search query or balance filter. Try resetting your filters.
          </p>
          <Button
            variant="secondary"
            size="sm"
            icon={RotateCcw}
            onClick={() => {
              setSearchQuery("");
              setBalanceFilter("all");
            }}
          >
            Reset Filters
          </Button>
        </div>
      ) : (
        /* Split Two-Panel Directory & Ledger */
        <div className="friends-split-layout">
          {/* Left Column: Friends List Panel */}
          <div className="friends-list-panel">
            <div className="friends-panel-header">
              <h3 className="friends-panel-title">Friends Directory</h3>
              <Badge variant="mint" size="sm">
                {filteredFriends.length} Listed
              </Badge>
            </div>

            <div className="friends-items-list" role="list">
              {filteredFriends.map((friend) => {
                const isSelected = selectedFriend?.id === friend.id;
                const status = friend.ledger?.overallStatus || "settled";

                // Initials for avatar bubble
                const initials = (friend.name || "SM")
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();

                return (
                  <div
                    key={friend.id}
                    className={`friend-item-card ${isSelected ? "is-selected" : ""}`}
                    onClick={() => setSelectedFriendId(friend.id)}
                    role="listitem"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedFriendId(friend.id);
                      }
                    }}
                  >
                    <div className="friend-item-left">
                      <div className="friend-avatar-circle">{initials}</div>
                      <div className="friend-info">
                        <span className="friend-name">{friend.name}</span>
                        {friend.email && <span className="friend-email">{friend.email}</span>}
                        <span className="friend-shared-count">
                          {friend.sharedGroups.length}{" "}
                          {friend.sharedGroups.length === 1 ? "shared group" : "shared groups"}
                        </span>
                      </div>
                    </div>

                    <div className="friend-item-right">
                      {status === "owes_you" && (
                        <span className="friend-balance-badge badge-owes-you">
                          +₹{formatINR(friend.ledger.totalOwedToYou)}
                        </span>
                      )}
                      {status === "you_owe" && (
                        <span className="friend-balance-badge badge-you-owe">
                          -₹{formatINR(friend.ledger.totalYouOwe)}
                        </span>
                      )}
                      {status === "mixed" && (
                        <span className="friend-balance-badge badge-mixed">
                          Mixed Ledger
                        </span>
                      )}
                      {status === "group_managed" && (
                        <span className="friend-balance-badge badge-settled">
                          Group Balanced
                        </span>
                      )}
                      {status === "settled" && (
                        <span className="friend-balance-badge badge-settled">
                          Settled Up
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Friend's Ledger Detail Panel */}
          {selectedFriend ? (
            <div className="friend-ledger-panel">
              {/* Detail Header */}
              <div className="friend-ledger-header">
                <div className="friend-ledger-profile">
                  <div className="friend-profile-avatar">
                    {(selectedFriend.name || "SM")
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </div>
                  <div className="friend-profile-meta">
                    <h2 className="friend-profile-name">{selectedFriend.name}</h2>
                    {selectedFriend.email && (
                      <p className="friend-profile-email">{selectedFriend.email}</p>
                    )}
                  </div>
                </div>

                <div className="friend-ledger-status-box">
                  <span className="ledger-status-label">Net Bilateral Position</span>
                  {selectedFriend.ledger?.overallStatus === "owes_you" ? (
                    <span className="ledger-status-amount text-emerald">
                      Owes You ₹{formatINR(selectedFriend.ledger.totalOwedToYou)}
                    </span>
                  ) : selectedFriend.ledger?.overallStatus === "you_owe" ? (
                    <span className="ledger-status-amount text-amber">
                      You Owe ₹{formatINR(selectedFriend.ledger.totalYouOwe)}
                    </span>
                  ) : selectedFriend.ledger?.overallStatus === "mixed" ? (
                    <span className="ledger-status-amount text-blue">
                      Owes You ₹{formatINR(selectedFriend.ledger.totalOwedToYou)} / You Owe ₹{formatINR(selectedFriend.ledger.totalYouOwe)}
                    </span>
                  ) : (
                    <span className="ledger-status-amount text-muted">
                      All Settled Up
                    </span>
                  )}
                </div>
              </div>

              {/* Actionable Direct Settle Up Section */}
              {selectedFriend.ledger?.actionableTransfers?.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {selectedFriend.ledger.actionableTransfers.map((item) => (
                    <div key={`${item.groupId}-${item.transfer?.from}-${item.transfer?.to}`} className="actionable-settle-card">
                      <div className="actionable-settle-info">
                        <span className="actionable-settle-title">
                          {item.direction === "you_pay"
                            ? `Outstanding Debt in ${item.groupName}`
                            : `Receivable in ${item.groupName}`}
                        </span>
                        <span className="actionable-settle-desc">
                          {item.direction === "you_pay"
                            ? `You owe ${selectedFriend.name} ₹${formatINR(item.transfer?.amount)} to settle your share in this group.`
                            : `${selectedFriend.name} owes you ₹${formatINR(item.transfer?.amount)} in this group.`}
                        </span>
                      </div>

                      <Button
                        variant={item.direction === "you_pay" ? "mint" : "secondary"}
                        size="sm"
                        icon={ArrowRight}
                        onClick={() => handleOpenSettleModal(item)}
                      >
                        {item.direction === "you_pay" ? "Settle Up" : "Record Payment"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Mutual Groups Strip */}
              <div className="friend-shared-groups-strip">
                <span className="shared-groups-title">Mutual Groups</span>
                <div className="shared-groups-badges">
                  {selectedFriend.sharedGroups.map((g) => {
                    const CategoryIcon = CATEGORY_ICONS[g.category] || Folder;
                    return (
                      <span key={g.id} className="shared-group-pill">
                        <CategoryIcon size={14} color="var(--teal-600)" />
                        <strong>{g.name}</strong>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Shared Transactions Tabs */}
              <div className="friend-tabs-bar" role="tablist">
                <button
                  type="button"
                  className={`friend-tab-btn ${activeTab === "expenses" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("expenses")}
                  role="tab"
                  aria-selected={activeTab === "expenses"}
                >
                  <Receipt size={16} />
                  <span>Shared Expenses ({selectedFriend.ledger?.sharedExpenses?.length || 0})</span>
                </button>
                <button
                  type="button"
                  className={`friend-tab-btn ${activeTab === "settlements" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("settlements")}
                  role="tab"
                  aria-selected={activeTab === "settlements"}
                >
                  <ArrowLeftRight size={16} />
                  <span>Payment History ({selectedFriend.ledger?.sharedSettlements?.length || 0})</span>
                </button>
              </div>

              {/* Transactions List */}
              <div className="friend-transactions-list">
                {activeTab === "expenses" && (
                  !selectedFriend.ledger?.sharedExpenses ||
                  selectedFriend.ledger.sharedExpenses.length === 0 ? (
                    <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--charcoal-500)" }}>
                      <p style={{ margin: 0, fontSize: "13.5px" }}>
                        No shared expenses recorded with {selectedFriend.name} yet.
                      </p>
                    </div>
                  ) : (
                    selectedFriend.ledger.sharedExpenses.map((expense) => (
                      <ExpenseItem
                        key={expense.id || expense._id}
                        expense={expense}
                        currentUser={user}
                        userGroupRole="member"
                        isGroupCreatorOrAdmin={false}
                        onEdit={() => navigate("/expenses")}
                        onDelete={() => navigate("/expenses")}
                      />
                    ))
                  )
                )}

                {activeTab === "settlements" && (
                  !selectedFriend.ledger?.sharedSettlements ||
                  selectedFriend.ledger.sharedSettlements.length === 0 ? (
                    <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--charcoal-500)" }}>
                      <p style={{ margin: 0, fontSize: "13.5px" }}>
                        No settlement payments recorded with {selectedFriend.name} yet.
                      </p>
                    </div>
                  ) : (
                    selectedFriend.ledger.sharedSettlements.map((settle) => {
                      const isCurrentUserPayer =
                        toIdString(settle.payer?._id || settle.payer?.id || settle.payer) ===
                        toIdString(currentUserId);

                      return (
                        <div key={settle._id || settle.id} className="settlement-history-item">
                          <div className="settlement-history-left">
                            <div className="settlement-history-icon">
                              <CheckCircle2 size={18} />
                            </div>
                            <div className="settlement-history-meta">
                              <span className="settlement-history-text">
                                {isCurrentUserPayer ? "You paid" : `${selectedFriend.name} paid`}{" "}
                                <strong>₹{formatINR(settle.amount)}</strong> in {settle.groupName}
                              </span>
                              <span className="settlement-history-sub">
                                {formatDateTime(settle.settledAt || settle.createdAt)}
                                {settle.notes ? ` • "${settle.notes}"` : ""}
                              </span>
                            </div>
                          </div>

                          <div className="settlement-history-right">
                            <span className="settlement-history-amount">
                              ₹{formatINR(settle.amount)}
                            </span>
                            <Badge variant="mint" size="sm">
                              Settled
                            </Badge>
                          </div>
                        </div>
                      );
                    })
                  )
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Reused Record Settlement Modal */}
      {recordModalData.isOpen && recordModalData.transfer && (
        <RecordSettlementModal
          isOpen={recordModalData.isOpen}
          onClose={() =>
            setRecordModalData({
              isOpen: false,
              transfer: null,
              groupId: null,
              groupName: null
            })
          }
          transfer={recordModalData.transfer}
          groupId={recordModalData.groupId}
          groupName={recordModalData.groupName}
          onSettlementRecorded={handleSettlementSuccess}
        />
      )}
    </div>
  );
}
