import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Users,
  Plus,
  Search,
  Home,
  Plane,
  Heart,
  Folder,
  ArrowRight,
  KeyRound,
  X,
  UserCheck
} from "lucide-react";
import { api, ApiError } from "../../services/api";
import { parseInviteCode, validateInviteCode, getInviteErrorMessage } from "../../services/inviteUtils";
import { Card, CardContent } from "../../components/common/Card";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { Badge } from "../../components/common/Badge";
import { Alert } from "../../components/common/Alert";
import { LoadingSpinner } from "../../components/common/LoadingSpinner";
import "./Groups.css";

const CATEGORY_ICONS = {
  Home: Home,
  Trip: Plane,
  Couple: Heart,
  Other: Folder
};

export function Groups() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  // Create Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createData, setCreateData] = useState({
    name: "",
    description: "",
    category: "Home"
  });
  const [createErrors, setCreateErrors] = useState({});
  const [isCreating, setIsCreating] = useState(false);
  const [createApiError, setCreateApiError] = useState("");

  // Join Modal State
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [joinApiError, setJoinApiError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchGroups() {
      try {
        setError(null);
        const res = await api.groups.list();
        if (isMounted && res.success) {
          setGroups(res.groups || []);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof ApiError ? err.message : "Failed to load groups");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchGroups();

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle Create Group Form Submit
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateApiError("");

    const errors = {};
    if (!createData.name.trim()) {
      errors.name = "Group name is required";
    } else if (createData.name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters long";
    }

    if (Object.keys(errors).length > 0) {
      setCreateErrors(errors);
      return;
    }

    try {
      setIsCreating(true);
      const res = await api.groups.create({
        name: createData.name.trim(),
        description: createData.description.trim(),
        category: createData.category
      });

      if (res.success && res.group) {
        setCreateModalOpen(false);
        setCreateData({ name: "", description: "", category: "Home" });
        navigate(`/groups/${res.group.id}`);
      }
    } catch (err) {
      setCreateApiError(err.message || "Failed to create group");
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Join with Code Form Submit
  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    setJoinApiError("");

    const code = parseInviteCode(inviteCodeInput);
    if (!validateInviteCode(code)) {
      setJoinApiError("Please enter a valid invitation code or link");
      return;
    }

    try {
      setIsJoining(true);
      const res = await api.groups.joinByCode(code);
      if (res.success && res.group) {
        setJoinModalOpen(false);
        setInviteCodeInput("");
        navigate(`/groups/${res.group.id}`);
      }
    } catch (err) {
      setJoinApiError(getInviteErrorMessage(err));
    } finally {
      setIsJoining(false);
    }
  };

  // Filter groups
  const filteredGroups = groups.filter((g) => {
    const matchesSearch =
      g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      activeCategory === "All" || g.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="groups-page animate-fade-in">
      {/* Header Bar */}
      <div className="groups-page-header">
        <div>
          <h1 className="groups-page-title">Groups & Roommate Spaces</h1>
          <p className="groups-page-subtitle">
            Manage shared expense groups, view balances, and invite friends via private links.
          </p>
        </div>

        <div className="groups-header-actions">
          <Button
            variant="secondary"
            size="md"
            icon={KeyRound}
            onClick={() => setJoinModalOpen(true)}
          >
            Join with Code
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={() => setCreateModalOpen(true)}
          >
            Create Group
          </Button>
        </div>
      </div>

      {/* Contextual Scope Switcher: Groups & Friends */}
      <div className="groups-scope-switcher" role="tablist" aria-label="Groups and Friends views">
        <button
          type="button"
          role="tab"
          aria-selected="true"
          className="scope-tab is-active"
          id="scope-tab-groups"
        >
          <Users size={15} />
          <span>Groups</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected="false"
          className="scope-tab"
          onClick={() => navigate("/friends")}
          id="scope-tab-friends"
        >
          <UserCheck size={15} />
          <span>Friends</span>
        </button>
      </div>

      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filter and Search Bar */}
      <div className="groups-filter-toolbar">
        <div className="groups-search-box">
          <Search size={16} className="groups-search-icon" />
          <input
            type="text"
            placeholder="Filter groups by name or topic..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="groups-search-input"
          />
        </div>

        <div className="category-pill-group">
          {["All", "Home", "Trip", "Couple", "Other"].map((cat) => (
            <button
              key={cat}
              type="button"
              className={`category-pill ${activeCategory === cat ? "is-active" : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Groups Grid or Empty State */}
      {loading ? (
        <LoadingSpinner message="Loading your groups..." />
      ) : filteredGroups.length === 0 ? (
        <Card className="groups-empty-card">
          <CardContent>
            <div className="empty-state-card">
              <div className="empty-state-icon-wrap">
                <Users size={32} />
              </div>
              <h3 className="empty-state-title">
                {searchQuery || activeCategory !== "All"
                  ? "No matching groups found"
                  : "You haven't joined any groups yet"}
              </h3>
              <p className="empty-state-desc">
                {searchQuery || activeCategory !== "All"
                  ? "Try adjusting your search query or category filters."
                  : "Create a group for your apartment, upcoming trip, or friends to start splitting expenses fairly."}
              </p>
              <div className="empty-state-actions">
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={() => setCreateModalOpen(true)}
                >
                  Create Your First Group
                </Button>
                <Button
                  variant="secondary"
                  icon={KeyRound}
                  onClick={() => setJoinModalOpen(true)}
                >
                  Join via Code
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="groups-grid">
          {filteredGroups.map((group) => {
            const Icon = CATEGORY_ICONS[group.category] || Folder;
            return (
              <Link
                key={group.id}
                to={`/groups/${group.id}`}
                className="group-card-link"
              >
                <Card hoverable className="group-item-card">
                  <div className="group-card-inner">
                    <div className="group-card-top">
                      <div className="group-category-icon-wrap">
                        <Icon size={20} />
                      </div>
                      <Badge variant="mint" size="sm">
                        {group.category}
                      </Badge>
                      {group.currentUserRole === "creator" && (
                        <Badge variant="neutral" size="sm">
                          Creator
                        </Badge>
                      )}
                    </div>

                    <h3 className="group-card-name">{group.name}</h3>

                    {group.description && (
                      <p className="group-card-desc">{group.description}</p>
                    )}

                    <div className="group-card-bottom">
                      <div className="group-members-summary">
                        <div className="members-avatar-stack">
                          {group.members.slice(0, 3).map((m, idx) => (
                            <div
                              key={m.user?._id || idx}
                              className="member-mini-avatar"
                              title={m.user?.name}
                            >
                              {(m.user?.name || "U")[0].toUpperCase()}
                            </div>
                          ))}
                          {group.memberCount > 3 && (
                            <div className="member-mini-avatar avatar-overflow">
                              +{group.memberCount - 3}
                            </div>
                          )}
                        </div>
                        <span className="members-count-text">
                          {group.memberCount}{" "}
                          {group.memberCount === 1 ? "member" : "members"}
                        </span>
                      </div>

                      <span className="group-view-link">
                        View <ArrowRight size={14} />
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Create Group Modal */}
      {createModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-container animate-fade-in">
            <div className="modal-header">
              <h2 className="modal-title">Create a New Group</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setCreateModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {createApiError && (
              <Alert variant="error" onClose={() => setCreateApiError("")}>
                {createApiError}
              </Alert>
            )}

            <form onSubmit={handleCreateSubmit} className="modal-form">
              <Input
                label="Group Name"
                placeholder="e.g. Flatmates 402, Goa Roadtrip 2024"
                value={createData.name}
                onChange={(e) => {
                  setCreateData((prev) => ({ ...prev, name: e.target.value }));
                  if (createErrors.name) setCreateErrors({});
                }}
                error={createErrors.name}
                required
                autoFocus
              />

              <div className="input-field-group">
                <label className="input-label">Group Category</label>
                <div className="category-select-grid">
                  {["Home", "Trip", "Couple", "Other"].map((cat) => {
                    const CatIcon = CATEGORY_ICONS[cat];
                    const isSelected = createData.category === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        className={`category-option-btn ${isSelected ? "is-selected" : ""}`}
                        onClick={() =>
                          setCreateData((prev) => ({ ...prev, category: cat }))
                        }
                      >
                        <CatIcon size={18} />
                        <span>{cat}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="input-field-group">
                <label className="input-label">Description (Optional)</label>
                <textarea
                  className="modal-textarea"
                  rows={3}
                  placeholder="What is this group for? (e.g. rent, groceries, utilities)"
                  value={createData.description}
                  onChange={(e) =>
                    setCreateData((prev) => ({
                      ...prev,
                      description: e.target.value
                    }))
                  }
                  maxLength={300}
                />
              </div>

              <div className="modal-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCreateModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isCreating}
                >
                  Create Group
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Group Modal */}
      {joinModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-container animate-fade-in">
            <div className="modal-header">
              <h2 className="modal-title">Join Group with Code</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setJoinModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {joinApiError && (
              <Alert variant="error" onClose={() => setJoinApiError("")}>
                {joinApiError}
              </Alert>
            )}

            <form onSubmit={handleJoinSubmit} className="modal-form">
              <p className="modal-help-text">
                Enter the shareable code provided by your group organizer (e.g. <code>sm-a8b2c4</code>).
              </p>

              <Input
                label="Invitation Code"
                placeholder="sm-XXXXXX"
                icon={KeyRound}
                value={inviteCodeInput}
                onChange={(e) => {
                  setInviteCodeInput(e.target.value);
                  if (joinApiError) setJoinApiError("");
                }}
                required
                autoFocus
              />

              <div className="modal-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setJoinModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isJoining}
                >
                  Join Group
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
