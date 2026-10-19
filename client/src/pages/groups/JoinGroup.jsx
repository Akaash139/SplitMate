import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Users, ArrowRight, CheckCircle2, AlertCircle, Home, Plane, Heart, Folder } from "lucide-react";
import { api, ApiError } from "../../services/api";
import { useAuth } from "../../context/useAuth";
import { Card, CardContent } from "../../components/common/Card";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { LoadingSpinner } from "../../components/common/LoadingSpinner";
import "./JoinGroup.css";

const CATEGORY_ICONS = {
  Home: Home,
  Trip: Plane,
  Couple: Heart,
  Other: Folder
};

export function JoinGroup() {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isJoining, setIsJoining] = useState(false);
  const [alreadyMember, setAlreadyMember] = useState(false);

  useEffect(() => {
    async function loadPreview() {
      try {
        setLoading(true);
        setError(null);
        const res = await api.groups.getInvitePreview(inviteCode);
        if (res.success && res.group) {
          setPreview(res.group);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Invalid or expired invitation link");
      } finally {
        setLoading(false);
      }
    }

    if (inviteCode) {
      loadPreview();
    }
  }, [inviteCode]);

  const handleJoin = async () => {
    try {
      setIsJoining(true);
      setError(null);
      const res = await api.groups.joinByCode(inviteCode);
      if (res.success && res.group) {
        navigate(`/groups/${res.group.id}`, { replace: true });
      }
    } catch (err) {
      if (err.message?.includes("already a member")) {
        setAlreadyMember(true);
      } else {
        setError(err.message || "Failed to join group");
      }
    } finally {
      setIsJoining(false);
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen message="Loading invitation details..." />;
  }

  const CategoryIcon = preview?.category ? CATEGORY_ICONS[preview.category] || Folder : Folder;

  return (
    <div className="join-group-page animate-fade-in">
      <div className="join-group-card-wrapper">
        <div className="join-brand-badge">
          <img
            src="/splitmate-logo.svg"
            alt="SplitMate Logo"
            className="join-brand-logo-img"
          />
          <span className="join-brand-text">SplitMate Group Invitation</span>
        </div>

        <Card className="join-action-card">
          <CardContent className="join-card-content">
            {error ? (
              <div className="join-error-state">
                <div className="join-icon-wrap icon-error">
                  <AlertCircle size={32} />
                </div>
                <h2 className="join-heading">Invitation Unavailable</h2>
                <p className="join-desc">{error}</p>
                <Button
                  variant="primary"
                  onClick={() => navigate("/dashboard")}
                  className="join-primary-btn"
                >
                  Return to Dashboard
                </Button>
              </div>
            ) : alreadyMember ? (
              <div className="join-success-state">
                <div className="join-icon-wrap icon-success">
                  <CheckCircle2 size={32} />
                </div>
                <h2 className="join-heading">You're already a member!</h2>
                <p className="join-desc">
                  You already belong to <strong>{preview?.name}</strong>.
                </p>
                <Button
                  variant="primary"
                  onClick={() => navigate(`/groups/${preview?.id}`)}
                  className="join-primary-btn"
                  iconRight={ArrowRight}
                >
                  Go to Group
                </Button>
              </div>
            ) : (
              <div className="join-ready-state">
                <div className="join-icon-wrap icon-mint">
                  <CategoryIcon size={32} />
                </div>

                <div className="join-meta-row">
                  <Badge variant="mint" size="sm">
                    {preview?.category} Group
                  </Badge>
                  <span className="join-member-count">
                    <Users size={14} className="inline-icon" /> {preview?.memberCount}{" "}
                    {preview?.memberCount === 1 ? "member" : "members"}
                  </span>
                </div>

                <h2 className="join-heading">{preview?.name}</h2>
                {preview?.description && <p className="join-desc">{preview.description}</p>}

                <div className="organizer-box">
                  <span className="organizer-label">Invited by</span>
                  <span className="organizer-name">{preview?.creatorName}</span>
                </div>

                {isAuthenticated ? (
                  <Button
                    variant="primary"
                    size="lg"
                    className="join-primary-btn"
                    isLoading={isJoining}
                    onClick={handleJoin}
                    iconRight={ArrowRight}
                  >
                    Accept & Join Group
                  </Button>
                ) : (
                  <Link to="/login" state={{ from: { pathname: `/join/${inviteCode}` } }}>
                    <Button variant="primary" size="lg" className="join-primary-btn">
                      Log In to Join Group
                    </Button>
                  </Link>
                )}

                <p className="join-footer-note">
                  Once you join, you will be able to view and log shared expenses within this group.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
