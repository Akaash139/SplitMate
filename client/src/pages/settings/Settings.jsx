import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  Mail,
  Lock,
  ShieldCheck,
  KeyRound,
  LogOut,
  ExternalLink,
  Calendar,
  Shield
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { api, ApiError } from "../../services/api";
import {
  validateProfileName,
  validatePasswordChange,
  formatMemberSince,
  getAuthProviderType
} from "../../services/settingsUtils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from "../../components/common/Card";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { Badge } from "../../components/common/Badge";
import { Alert } from "../../components/common/Alert";
import "./Settings.css";

export function Settings() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();

  // Profile form state
  const [name, setName] = useState(user?.name || "");
  const [nameError, setNameError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");

  // Password form state (for email/password accounts)
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Sign out confirmation state
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  // Sync profile name whenever user context loads or updates
  const [prevUserName, setPrevUserName] = useState(user?.name);
  if (user?.name && user.name !== prevUserName) {
    setPrevUserName(user.name);
    setName(user.name);
  }

  const isGoogleUser = getAuthProviderType(user) === "google";

  // Profile Form Validation
  const validateProfile = () => {
    const res = validateProfileName(name);
    if (!res.isValid) {
      setNameError(res.error);
      return false;
    }
    setNameError("");
    return true;
  };

  // Handle Profile Update Submission
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileSuccess("");
    setProfileError("");

    if (!validateProfile()) {
      return;
    }

    try {
      setProfileSaving(true);
      const res = await api.auth.updateProfile({ name: name.trim() });
      if (res.success && res.user) {
        updateUser({ name: res.user.name });
        setProfileSuccess("Profile information saved successfully.");
        setTimeout(() => setProfileSuccess(""), 4000);
      }
    } catch (err) {
      setProfileError(
        err instanceof ApiError ? err.message : "Failed to update profile information"
      );
    } finally {
      setProfileSaving(false);
    }
  };

  // Password Form Validation
  const validatePassword = () => {
    const res = validatePasswordChange(currentPassword, newPassword, confirmPassword);
    setPasswordErrors(res.errors);
    return res.isValid;
  };

  // Handle Password Change Submission
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordSuccess("");
    setPasswordError("");

    if (!validatePassword()) {
      return;
    }

    try {
      setPasswordSaving(true);
      const res = await api.auth.changePassword({
        currentPassword,
        newPassword
      });

      if (res.success) {
        setPasswordSuccess("Password changed successfully.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPasswordErrors({});
        setTimeout(() => setPasswordSuccess(""), 4000);
      }
    } catch (err) {
      setPasswordError(
        err instanceof ApiError ? err.message : "Failed to update password"
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  // Handle Sign Out
  const handleSignOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  // Format account creation date
  const memberSince = formatMemberSince(user?.createdAt);

  return (
    <div className="settings-page animate-fade-in">
      {/* Header */}
      <div className="settings-header">
        <div>
          <div className="settings-badge-row">
            <Badge variant="mint" size="sm">
              ACCOUNT SETTINGS
            </Badge>
          </div>
          <h1 className="settings-title">Profile & Security</h1>
          <p className="settings-subtitle">
            Manage your personal profile details, authentication credentials, and session controls.
          </p>
        </div>
      </div>

      <div className="settings-layout-grid">
        {/* Left Column: Profile Information Card */}
        <div className="settings-col">
          <Card className="settings-card">
            <CardHeader className="settings-card-header">
              <div className="settings-icon-wrap mint">
                <User size={20} />
              </div>
              <div>
                <CardTitle as="h2">Profile Details</CardTitle>
                <CardDescription>
                  Your public identity displayed to group members and friends
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="settings-card-content">
              {profileSuccess && (
                <Alert
                  variant="success"
                  className="mb-4"
                  onClose={() => setProfileSuccess("")}
                >
                  {profileSuccess}
                </Alert>
              )}

              {profileError && (
                <Alert
                  variant="error"
                  className="mb-4"
                  onClose={() => setProfileError("")}
                >
                  {profileError}
                </Alert>
              )}

              <form onSubmit={handleProfileSubmit} className="settings-form">
                <Input
                  id="settings-full-name"
                  name="name"
                  label="Full Name"
                  icon={User}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError) setNameError("");
                  }}
                  error={nameError}
                  placeholder="Enter your full name"
                  required
                />

                <div className="email-display-group">
                  <Input
                    id="settings-email"
                    name="email"
                    type="email"
                    label="Email Address"
                    icon={Mail}
                    value={user?.email || ""}
                    disabled
                    helperText="Email address is tied to your account credentials and cannot be changed."
                  />
                </div>

                <div className="provider-info-box">
                  <span className="provider-info-label">Sign-in Method:</span>
                  {isGoogleUser ? (
                    <Badge variant="mint" size="sm">
                      <ShieldCheck size={12} className="inline-icon" /> Google Account
                    </Badge>
                  ) : (
                    <Badge variant="neutral" size="sm">
                      <Mail size={12} className="inline-icon" /> Email & Password
                    </Badge>
                  )}
                </div>

                <div className="settings-actions-footer">
                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={profileSaving}
                    disabled={profileSaving}
                  >
                    Save Profile Changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Security & Authentication */}
        <div className="settings-col">
          <Card className="settings-card">
            <CardHeader className="settings-card-header">
              <div className="settings-icon-wrap blue">
                <KeyRound size={20} />
              </div>
              <div>
                <CardTitle as="h2">Security & Password</CardTitle>
                <CardDescription>
                  Keep your account safe with strong authentication credentials
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="settings-card-content">
              {isGoogleUser ? (
                /* Google Authentication Explanation */
                <div className="google-auth-notice">
                  <div className="google-notice-icon-box">
                    <Shield size={28} />
                  </div>
                  <h3 className="google-notice-heading">Google Account Protection</h3>
                  <p className="google-notice-desc">
                    Your SplitMate account is authenticated through Google Sign-In. SplitMate does
                    not store or manage a local password for your account.
                  </p>
                  <p className="google-notice-subdesc">
                    To change your password, configure 2-step verification, or update your security
                    keys, please visit your Google Account management page.
                  </p>

                  <a
                    href="https://myaccount.google.com/security"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="google-manage-link"
                  >
                    <Button variant="secondary" size="md" iconRight={ExternalLink}>
                      Manage Google Security Settings
                    </Button>
                  </a>
                </div>
              ) : (
                /* Standard Email / Password Form */
                <form onSubmit={handlePasswordSubmit} className="settings-form">
                  {passwordSuccess && (
                    <Alert
                      variant="success"
                      className="mb-4"
                      onClose={() => setPasswordSuccess("")}
                    >
                      {passwordSuccess}
                    </Alert>
                  )}

                  {passwordError && (
                    <Alert
                      variant="error"
                      className="mb-4"
                      onClose={() => setPasswordError("")}
                    >
                      {passwordError}
                    </Alert>
                  )}

                  <Input
                    id="settings-current-password"
                    name="currentPassword"
                    type="password"
                    label="Current Password"
                    icon={Lock}
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      if (passwordErrors.currentPassword) {
                        setPasswordErrors((prev) => ({ ...prev, currentPassword: "" }));
                      }
                    }}
                    error={passwordErrors.currentPassword}
                    placeholder="Enter current password"
                    required
                  />

                  <Input
                    id="settings-new-password"
                    name="newPassword"
                    type="password"
                    label="New Password"
                    icon={Lock}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (passwordErrors.newPassword) {
                        setPasswordErrors((prev) => ({ ...prev, newPassword: "" }));
                      }
                    }}
                    error={passwordErrors.newPassword}
                    helperText="Password must be at least 6 characters long."
                    placeholder="Enter new password"
                    required
                  />

                  <Input
                    id="settings-confirm-password"
                    name="confirmPassword"
                    type="password"
                    label="Confirm New Password"
                    icon={Lock}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (passwordErrors.confirmPassword) {
                        setPasswordErrors((prev) => ({ ...prev, confirmPassword: "" }));
                      }
                    }}
                    error={passwordErrors.confirmPassword}
                    placeholder="Re-enter new password"
                    required
                  />

                  <div className="settings-actions-footer">
                    <Button
                      type="submit"
                      variant="primary"
                      isLoading={passwordSaving}
                      disabled={passwordSaving}
                    >
                      Update Password
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Session Management Card */}
          <Card className="settings-card mt-6">
            <CardHeader className="settings-card-header">
              <div className="settings-icon-wrap rose">
                <LogOut size={20} />
              </div>
              <div>
                <CardTitle as="h2">Session Management</CardTitle>
                <CardDescription>
                  Active session status and account departure controls
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="settings-card-content">
              <div className="session-info-panel">
                <div className="session-meta-row">
                  <span className="session-meta-label">Signed in as:</span>
                  <span className="session-meta-value">{user?.email}</span>
                </div>
                <div className="session-meta-row">
                  <span className="session-meta-label">Member Since:</span>
                  <span className="session-meta-value">
                    <Calendar size={13} className="inline-icon" /> {memberSince}
                  </span>
                </div>
              </div>

              <div className="session-action-box">
                {confirmingSignOut ? (
                  <div className="signout-confirm-box">
                    <p className="signout-confirm-text">
                      Are you sure you want to sign out of SplitMate on this device?
                    </p>
                    <div className="signout-confirm-btns">
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={handleSignOut}
                        icon={LogOut}
                      >
                        Confirm Sign Out
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setConfirmingSignOut(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => setConfirmingSignOut(true)}
                    icon={LogOut}
                  >
                    Sign Out
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
