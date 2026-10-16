import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Users,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Scale,
  Home,
  Plane,
  Heart,
  Folder,
  ChevronRight,
  ShieldCheck,
  Info,
  Clock
} from "lucide-react";
import { api, ApiError } from "../../services/api";
import { useAuth } from "../../context/useAuth";
import {
  formatINR,
  classifyTransfer,
  getSettlementErrorDetails,
  isDataMatchingGroup,
  formatDateTime
} from "../../services/settlementUtils";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/common/Card";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { Alert } from "../../components/common/Alert";
import { LoadingSpinner } from "../../components/common/LoadingSpinner";
import { RecordSettlementModal } from "./RecordSettlementModal";
import "./Settlements.css";

function renderCategoryIcon(category, size = 16) {
  switch (category) {
    case "Home":
      return <Home size={size} />;
    case "Trip":
      return <Plane size={size} />;
    case "Couple":
      return <Heart size={size} />;
    default:
      return <Folder size={size} />;
  }
}

export function Settlements() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Groups state
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState(null);

  // Selected group & data
  const [selectedGroupId, setSelectedGroupId] = useState(searchParams.get("groupId") || "");
  const [balancesData, setBalancesData] = useState(null);
  const [settlementsData, setSettlementsData] = useState(null);
  const [settlementHistory, setSettlementHistory] = useState([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [inconsistentData, setInconsistentData] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Settlement Recording Modal & Feedback
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [selectedTransferForModal, setSelectedTransferForModal] = useState(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState(null);

  // Load all user groups on mount
  useEffect(() => {
    let isMounted = true;

    async function loadGroups() {
      try {
        setGroupsLoading(true);
        setGroupsError(null);
        const res = await api.groups.list();
        if (!isMounted) return;

        const loadedGroups = res?.groups || [];
        setGroups(loadedGroups);

        if (loadedGroups.length > 0) {
          const paramId = searchParams.get("groupId");
          const exists = loadedGroups.some((g) => (g.id || g._id)?.toString() === paramId);
          const activeId = exists ? paramId : (loadedGroups[0].id || loadedGroups[0]._id)?.toString();

          setSelectedGroupId(activeId);
          if (activeId !== paramId) {
            setSearchParams({ groupId: activeId }, { replace: true });
          }
        }
      } catch (err) {
        if (isMounted) {
          setGroupsError(err instanceof ApiError ? err.message : "Failed to load groups");
        }
      } finally {
        if (isMounted) {
          setGroupsLoading(false);
        }
      }
    }

    loadGroups();

    return () => {
      isMounted = false;
    };
  }, [searchParams, setSearchParams]);

  // Fetch balances, settlement suggestions, and settlement history
  useEffect(() => {
    if (!selectedGroupId) return;

    let isMounted = true;

    async function fetchData() {
      try {
        setDetailsLoading(true);
        setDetailsError(null);
        setErrorCode(null);
        setInconsistentData(false);

        const [balRes, setRes, histRes] = await Promise.all([
          api.balances.getGroupBalances(selectedGroupId),
          api.balances.getGroupSettlementSuggestions(selectedGroupId),
          api.settlements.list(selectedGroupId).catch(() => ({ success: true, settlements: [] }))
        ]);

        if (!isMounted) return;

        if (balRes.success) {
          setBalancesData(balRes);
        }
        if (setRes.success) {
          setSettlementsData(setRes);
        }
        if (histRes?.success) {
          setSettlementHistory(histRes.settlements || []);
        }
      } catch (err) {
        if (!isMounted) return;

        if (err instanceof ApiError) {
          setErrorCode(err.status);
          setDetailsError(err.message);
          if (err.status === 422 || err.details?.inconsistentData) {
            setInconsistentData(true);
          }
        } else {
          setErrorCode(0);
          setDetailsError("Failed to calculate balances and settlements.");
        }
        setBalancesData(null);
        setSettlementsData(null);
        setSettlementHistory([]);
      } finally {
        if (isMounted) {
          setDetailsLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [selectedGroupId, refreshTrigger]);

  const handleGroupChange = useCallback(
    (newGroupId) => {
      setSelectedGroupId(newGroupId);
      setBalancesData(null);
      setSettlementsData(null);
      setSettlementHistory([]);
      setActionSuccessMessage(null);
      setSearchParams({ groupId: newGroupId });
    },
    [setSearchParams]
  );

  const handleManualRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleOpenRecordModal = (transfer) => {
    setSelectedTransferForModal(transfer);
    setIsRecordModalOpen(true);
  };

  const handleSettlementRecorded = (result) => {
    const amt = result?.settlement?.amount;
    setActionSuccessMessage(
      amt !== undefined
        ? `Payment of ₹${formatINR(amt)} recorded successfully! Ledgers and suggestions updated.`
        : "Payment recorded successfully! Ledgers and suggestions updated."
    );
    setRefreshTrigger((prev) => prev + 1);
    setTimeout(() => {
      setActionSuccessMessage(null);
    }, 6000);
  };

  const selectedGroup = useMemo(() => {
    return groups.find((g) => (g.id || g._id)?.toString() === selectedGroupId?.toString());
  }, [groups, selectedGroupId]);

  const currentUserId = (user?.id || user?._id)?.toString();

  const isMe = (uid) => {
    if (!uid || !currentUserId) return false;
    const cleanId = typeof uid === "object" ? uid.id || uid._id : uid;
    return cleanId?.toString() === currentUserId;
  };

  // 1. Loading groups state
  if (groupsLoading) {
    return (
      <div className="settlements-page animate-fade-in">
        <LoadingSpinner fullScreen message="Loading groups and settlement ledgers..." />
      </div>
    );
  }

  // 2. Error loading groups state
  if (groupsError) {
    return (
      <div className="settlements-page animate-fade-in">
        <div className="settlements-header">
          <Link to="/dashboard" className="back-link">
            <ArrowLeft size={16} /> Back to Dashboard
          </Link>
          <h1 className="settlements-title">Settlements & Debt Minimization</h1>
        </div>
        <Alert variant="error">{groupsError}</Alert>
      </div>
    );
  }

  // 3. No groups at all state
  if (groups.length === 0) {
    return (
      <div className="settlements-page animate-fade-in">
        <div className="settlements-header">
          <Link to="/dashboard" className="back-link">
            <ArrowLeft size={16} /> Back to Dashboard
          </Link>
          <h1 className="settlements-title">Settlements & Debt Minimization</h1>
          <p className="settlements-subtitle">
            Simplified payment schedules that settle group debts in the fewest possible transactions.
          </p>
        </div>

        <Card className="settlements-empty-card">
          <CardContent className="empty-content">
            <div className="empty-icon-wrap">
              <Users size={32} />
            </div>
            <h3 className="empty-title">No Active Groups Found</h3>
            <p className="empty-description">
              You need to be a member of at least one group to calculate net balances and suggest settlements.
            </p>
            <div className="empty-actions">
              <Button variant="primary" icon={Users} onClick={() => navigate("/groups")}>
                Create or Join a Group
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentUserBalance = balancesData?.currentUserBalance;
  const isSettled = settlementsData?.isSettled || false;
  const transfers = settlementsData?.transfers || [];
  const memberBalances = balancesData?.memberBalances || [];
  const isDataForCurrentGroup = isDataMatchingGroup(balancesData, settlementsData, selectedGroupId);

  return (
    <div className="settlements-page animate-fade-in">
      {/* Top Header & Navigation */}
      <div className="settlements-header">
        <div className="header-meta">
          <Link to="/dashboard" className="back-link">
            <ArrowLeft size={16} /> Back to Dashboard
          </Link>
          <div className="header-title-row">
            <h1 className="settlements-title">Settlements & Debt Minimization</h1>
            <Badge variant="mint" size="sm">
              ENGINE V1.0
            </Badge>
          </div>
          <p className="settlements-subtitle">
            Deterministic peer-to-peer settlement suggestions calculated from integer paise ledgers.
          </p>
        </div>

        {/* Group Selector Dropdown */}
        <div className="settlements-group-selector-box">
          <label htmlFor="group-select" className="selector-label">
            Active Ledger:
          </label>
          <div className="selector-control-wrap">
            <div className="selector-icon">
              {renderCategoryIcon(selectedGroup?.category, 16)}
            </div>
            <select
              id="group-select"
              className="group-select-input"
              value={selectedGroupId}
              onChange={(e) => handleGroupChange(e.target.value)}
              aria-label="Select group ledger"
            >
              {groups.map((g) => {
                const gid = g.id || g._id;
                return (
                  <option key={gid} value={gid}>
                    {g.name} ({g.memberCount || g.members?.length || 1} members)
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      {/* Group Detail Error State */}
      {detailsError && !detailsLoading && (() => {
        const errMeta = getSettlementErrorDetails(errorCode, detailsError);
        return (
          <div className="details-error-wrap animate-fade-in">
            <Alert variant={errMeta.isWarning ? "warning" : "error"}>
              <div className="error-alert-inner">
                <div>
                  <strong>{errMeta.title}:</strong> {errMeta.message}
                </div>
                <div className="error-actions-row">
                  {errorCode === 401 ? (
                    <Button variant="primary" size="sm" onClick={() => navigate("/login")}>
                      Go to Login
                    </Button>
                  ) : errorCode === 403 ? (
                    <Button variant="secondary" size="sm" onClick={() => navigate("/groups")}>
                      View My Groups
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={RefreshCw}
                      onClick={handleManualRefresh}
                    >
                      Retry
                    </Button>
                  )}
                  {(inconsistentData || errorCode === 422) && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={ChevronRight}
                      onClick={() => navigate(`/groups/${selectedGroupId}`)}
                    >
                      View Group Expenses
                    </Button>
                  )}
                </div>
              </div>
            </Alert>
          </div>
        );
      })()}

      {/* Loading Details Spinner */}
      {(detailsLoading || (!detailsError && !isDataForCurrentGroup)) && (
        <div className="settlements-loading-box">
          <LoadingSpinner message={`Calculating balances and optimal transfers for ${selectedGroup?.name || "group"}...`} />
        </div>
      )}

      {/* Main Content Area: rendered ONLY when not loading, no error, and data strictly matches selected group */}
      {!detailsLoading && !detailsError && isDataForCurrentGroup && (
        <>
          {/* Action Success Feedback Banner */}
          {actionSuccessMessage && (
            <div className="settlements-success-banner animate-fade-in">
              <Alert variant="success">{actionSuccessMessage}</Alert>
            </div>
          )}

          {/* Top KPI Metrics Grid */}
          <div className="settlements-metrics-grid">
            {/* Metric 1: Total Group Expenses */}
            <Card className="metric-card">
              <CardContent className="metric-card-content">
                <div className="metric-header">
                  <div className="metric-icon-pill icon-mint">
                    <Scale size={18} />
                  </div>
                  <span className="metric-label">Total Group Expenses</span>
                </div>
                <div className="metric-value-row">
                  <span className="currency-symbol">₹</span>
                  <span className="metric-amount">{formatINR(balancesData.totalExpenses)}</span>
                </div>
                <div className="metric-footer">
                  <span className="metric-note">
                    {balancesData.expenseCount} {balancesData.expenseCount === 1 ? "expense" : "expenses"} recorded
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Metric 2: Current User Net Position */}
            <Card className={`metric-card position-card ${currentUserBalance?.status || "settled"}`}>
              <CardContent className="metric-card-content">
                <div className="metric-header">
                  <div
                    className={`metric-icon-pill ${
                      currentUserBalance?.netBalancePaise > 0
                        ? "icon-emerald"
                        : currentUserBalance?.netBalancePaise < 0
                        ? "icon-rose"
                        : "icon-mint"
                    }`}
                  >
                    {currentUserBalance?.netBalancePaise > 0 ? (
                      <TrendingUp size={18} />
                    ) : currentUserBalance?.netBalancePaise < 0 ? (
                      <TrendingDown size={18} />
                    ) : (
                      <CheckCircle2 size={18} />
                    )}
                  </div>
                  <span className="metric-label">Your Net Position</span>
                  <Badge
                    variant={
                      currentUserBalance?.netBalancePaise > 0
                        ? "emerald"
                        : currentUserBalance?.netBalancePaise < 0
                        ? "rose"
                        : "mint"
                    }
                    size="sm"
                  >
                    {currentUserBalance?.netBalancePaise > 0
                      ? "Owed to You"
                      : currentUserBalance?.netBalancePaise < 0
                      ? "You Owe"
                      : "Settled Up"}
                  </Badge>
                </div>
                <div className="metric-value-row">
                  <span className="currency-symbol">₹</span>
                  <span
                    className={`metric-amount ${
                      currentUserBalance?.netBalancePaise > 0
                        ? "text-emerald"
                        : currentUserBalance?.netBalancePaise < 0
                        ? "text-rose"
                        : ""
                    }`}
                  >
                    {formatINR(Math.abs(currentUserBalance?.netBalance || 0))}
                  </span>
                </div>
                <div className="metric-footer">
                  <span className="metric-note">
                    Paid ₹{formatINR(currentUserBalance?.totalPaid || 0)} • Share ₹
                    {formatINR(currentUserBalance?.totalShare || 0)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Metric 3: Group Settlement Status */}
            <Card className="metric-card">
              <CardContent className="metric-card-content">
                <div className="metric-header">
                  <div className={`metric-icon-pill ${isSettled ? "icon-emerald" : "icon-amber"}`}>
                    {isSettled ? <CheckCircle2 size={18} /> : <CreditCard size={18} />}
                  </div>
                  <span className="metric-label">Debt Simplification</span>
                  <Badge variant={isSettled ? "emerald" : "neutral"} size="sm">
                    {isSettled ? "0 Pending" : `${transfers.length} Transfers`}
                  </Badge>
                </div>
                <div className="metric-value-row">
                  <span className="metric-text-highlight">
                    {isSettled ? "Fully Cleared" : `${transfers.length} Required`}
                  </span>
                </div>
                <div className="metric-footer">
                  <span className="metric-note">
                    {isSettled
                      ? "All members are at ₹0.00 net balance"
                      : "Greedy largest-first + exact match algorithm"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Information & Offline Adjustment Banner */}
          <div className="settlements-info-banner">
            <Info size={16} className="info-icon" />
            <span className="info-text">
              <strong>Peer Settlement Ledger:</strong> Transfers shown below represent deterministic recommendations to clear all group debts with minimum payments. Click <strong>Record Payment</strong> to log full or partial offline reimbursements. Note: SplitMate tracks balances and does not transfer real funds via bank or UPI.
            </span>
          </div>

          {/* 2-Column Ledger Layout */}
          <div className="settlements-grid-layout">
            {/* Left Column: Suggested Transfers */}
            <div className="grid-transfers-column">
              <Card>
                <CardHeader className="section-card-header">
                  <div className="section-header-left">
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <CardTitle>Suggested Transfers</CardTitle>
                      <Badge variant={isSettled ? "emerald" : "mint"} size="sm">
                        {isSettled ? "All Settled" : `${transfers.length} Steps`}
                      </Badge>
                    </div>
                    <span className="section-subtitle">
                      Optimized payments to clear all group debts
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={RefreshCw}
                    onClick={handleManualRefresh}
                  >
                    Refresh
                  </Button>
                </CardHeader>
                <CardContent>
                  {isSettled || transfers.length === 0 ? (
                    <div className="all-settled-box animate-fade-in">
                      <div className="settled-icon-circle">
                        <CheckCircle2 size={36} />
                      </div>
                      <h3 className="settled-title">All Balances Settled!</h3>
                      <p className="settled-desc">
                        No outstanding debts exist in <strong>{selectedGroup?.name}</strong>. Everyone has paid
                        their exact share, and all member balances sum to zero.
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/groups/${selectedGroupId}`)}
                      >
                        View Group Expenses
                      </Button>
                    </div>
                  ) : (
                    <div className="transfers-list">
                      {transfers.map((t, idx) => {
                        const transferCategory = classifyTransfer(t, currentUserId);
                        const isPayerMe = transferCategory === "You Pay";
                        const isRecipientMe = transferCategory === "You Receive";

                        return (
                          <div
                            key={`${t.from}-${t.to}-${idx}`}
                            className={`transfer-card ${
                              isPayerMe ? "transfer-i-pay" : isRecipientMe ? "transfer-i-receive" : ""
                            }`}
                          >
                            <div className="transfer-card-header">
                              <span className="transfer-index">Transfer #{idx + 1}</span>
                              <Badge
                                variant={isPayerMe ? "rose" : isRecipientMe ? "emerald" : "neutral"}
                                size="sm"
                              >
                                {transferCategory}
                              </Badge>
                            </div>

                            <div className="transfer-card-body">
                              {/* Payer Side */}
                              <div className="transfer-party payer-party">
                                <div className="party-avatar">
                                  {t.fromUser?.name?.charAt(0).toUpperCase() || "P"}
                                </div>
                                <div className="party-details">
                                  <span className="party-name">
                                    {t.fromUser?.name || "Payer"}
                                    {isPayerMe && <span className="you-pill"> (You)</span>}
                                  </span>
                                  <span className="party-role">Debtor</span>
                                </div>
                              </div>

                              {/* Flow Arrow & Amount */}
                              <div className="transfer-amount-flow">
                                <div className="transfer-arrow-track">
                                  <ArrowRight size={18} className="arrow-icon" />
                                </div>
                                <div className="transfer-amount-tag">
                                  <span className="currency-prefix">₹</span>
                                  <span className="amount-number">{formatINR(t.amount)}</span>
                                </div>
                                <span className="paise-subtext">{t.amountPaise} paise</span>
                              </div>

                              {/* Recipient Side */}
                              <div className="transfer-party recipient-party">
                                <div className="party-avatar recipient-avatar">
                                  {t.toUser?.name?.charAt(0).toUpperCase() || "R"}
                                </div>
                                <div className="party-details">
                                  <span className="party-name">
                                    {t.toUser?.name || "Recipient"}
                                    {isRecipientMe && <span className="you-pill"> (You)</span>}
                                  </span>
                                  <span className="party-role">Creditor</span>
                                </div>
                              </div>
                            </div>

                            <div className="transfer-card-footer">
                              <span className="transfer-explanation">
                                <strong>{t.fromUser?.name || "Debtor"}</strong> pays{" "}
                                <strong>{t.toUser?.name || "Creditor"}</strong> ₹{formatINR(t.amount)}
                              </span>
                              <Button
                                variant="mint"
                                size="sm"
                                icon={CheckCircle2}
                                onClick={() => handleOpenRecordModal(t)}
                              >
                                Record Payment
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Member Ledgers */}
            <div className="grid-ledgers-column">
              <Card>
                <CardHeader className="section-card-header">
                  <div className="section-header-left">
                    <CardTitle>Member Balances</CardTitle>
                    <span className="section-subtitle">
                      Net positions across {memberBalances.length} group members
                    </span>
                  </div>
                  <Badge variant="neutral" size="sm">
                    Zero-Sum Verified
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="member-balances-list">
                    {memberBalances.map((mb) => {
                      const isUserMe = isMe(mb.user);
                      const isOwed = mb.netBalancePaise > 0;
                      const isOwes = mb.netBalancePaise < 0;

                      return (
                        <div
                          key={mb.user?.id || mb.user}
                          className={`member-balance-item ${isUserMe ? "is-current-user" : ""}`}
                        >
                          {/* Member Avatar & Name */}
                          <div className="member-avatar-meta">
                            <div className="member-avatar">
                              {mb.user?.name?.charAt(0).toUpperCase() || "U"}
                            </div>
                            <div className="member-names">
                              <span className="member-name">
                                {mb.user?.name || "Group Member"}
                                {isUserMe && <span className="you-pill"> (You)</span>}
                              </span>
                              <span className="member-email">{mb.user?.email || "Member"}</span>
                            </div>
                          </div>

                          {/* Member Figures */}
                          <div className="member-figures">
                            <div className="figures-breakdown">
                              <span className="figure-paid">
                                Paid: ₹{formatINR(mb.totalPaid)}
                              </span>
                              <span className="figure-share">
                                Share: ₹{formatINR(mb.totalShare)}
                              </span>
                            </div>

                            {/* Net Balance Status */}
                            <div className="net-balance-wrap">
                              <span
                                className={`net-balance-amount ${
                                  isOwed ? "text-emerald" : isOwes ? "text-rose" : "text-muted"
                                }`}
                              >
                                {isOwed ? `+₹${formatINR(mb.netBalance)}` : isOwes ? `-₹${formatINR(Math.abs(mb.netBalance))}` : `₹0.00`}
                              </span>
                              <Badge
                                variant={isOwed ? "emerald" : isOwes ? "rose" : "neutral"}
                                size="sm"
                              >
                                {isOwed ? "Owed" : isOwes ? "Owes" : "Settled"}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Ledger Balance Check Footer */}
                  <div className="ledger-balance-footer">
                    <ShieldCheck size={14} className="shield-icon" />
                    <span>
                      Sum of all member balances is strictly ₹0.00 (Integer Paise Invariant)
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Settlement History Ledger */}
          <div className="settlements-history-section">
            <Card>
              <CardHeader className="section-card-header">
                <div className="section-header-left">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <CardTitle>Settlement History</CardTitle>
                    <Badge variant="neutral" size="sm">
                      {settlementHistory.length} {settlementHistory.length === 1 ? "Payment" : "Payments"}
                    </Badge>
                  </div>
                  <span className="section-subtitle">
                    Recorded peer payments and reimbursements for {selectedGroup?.name}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {settlementHistory.length === 0 ? (
                  <div className="history-empty-box">
                    <Clock size={32} className="history-empty-icon" />
                    <p className="history-empty-title">No Recorded Settlements Yet</p>
                    <p className="history-empty-desc">
                      When group members pay each other and click <strong>Record Payment</strong>, confirmed settlement records will be tracked here.
                    </p>
                  </div>
                ) : (
                  <div className="settlement-history-list">
                    {settlementHistory.map((item) => {
                      const sid = item._id || item.id;
                      const payerName = item.payer?.name || "Member";
                      const receiverName = item.receiver?.name || "Member";
                      return (
                        <div key={sid} className="settlement-history-item">
                          <div className="history-item-left">
                            <div className="history-parties">
                              <span className="history-party-name">{payerName}</span>
                              <ArrowRight size={14} className="history-arrow" />
                              <span className="history-party-name">{receiverName}</span>
                            </div>
                            <div className="history-meta">
                              <span className="history-time">
                                <Clock size={12} /> {formatDateTime(item.settledAt || item.createdAt)}
                              </span>
                              {item.recordedBy && (
                                <span className="history-recorded-by">
                                  • Logged by {item.recordedBy?.name || "Member"}
                                </span>
                              )}
                            </div>
                            {item.notes && (
                              <p className="history-notes">&ldquo;{item.notes}&rdquo;</p>
                            )}
                          </div>
                          <div className="history-item-right">
                            <div className="history-amount-col">
                              <span className="history-amount">₹{formatINR(item.amount)}</span>
                              <Badge variant="emerald" size="sm">
                                Completed
                              </Badge>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Record Settlement Modal */}
      <RecordSettlementModal
        isOpen={isRecordModalOpen}
        onClose={() => {
          setIsRecordModalOpen(false);
          setSelectedTransferForModal(null);
        }}
        transfer={selectedTransferForModal}
        groupId={selectedGroupId}
        groupName={selectedGroup?.name}
        onSettlementRecorded={handleSettlementRecorded}
      />
    </div>
  );
}
