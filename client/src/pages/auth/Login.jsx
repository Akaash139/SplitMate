import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Mail, Lock, ArrowRight, ShieldCheck, Zap, Users } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { Input } from "../../components/common/Input";
import { Button } from "../../components/common/Button";
import { Alert } from "../../components/common/Alert";
import { GoogleSignInButton } from "../../components/common/GoogleSignInButton";
import "./Auth.css";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Login() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });

  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const from = location.state?.from?.pathname || "/dashboard";

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear field-specific error as user types
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
    if (serverError) {
      setServerError("");
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.email.trim()) {
      newErrors.email = "Email address is required";
    } else if (!EMAIL_REGEX.test(formData.email.trim())) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await login(formData.email.trim(), formData.password);
      navigate(from, { replace: true });
    } catch (err) {
      setServerError(err.message || "Failed to log in. Please check your credentials.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSuccess = async (credential) => {
    setServerError("");
    setIsSubmitting(true);
    try {
      await loginWithGoogle(credential);
      navigate(from, { replace: true });
    } catch (err) {
      setServerError(err.message || "Failed to sign in with Google.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleError = (err) => {
    setServerError(err?.message || "Google sign-in was interrupted or failed.");
  };

  return (
    <div className="auth-page-container">
      <div className="auth-split-wrapper">
        {/* Left Side: Brand Value Proposition */}
        <div className="auth-branding-panel">
          <div className="auth-brand-logo">
            <img
              src="/splitmate-logo.svg"
              alt="SplitMate Logo"
              className="auth-brand-logo-img"
            />
            <span className="auth-brand-name">SplitMate</span>
          </div>

          <div className="auth-hero-copy">
            <h1 className="auth-hero-heading">
              Shared expenses, <br />
              <span className="text-teal-gradient">zero awkward math.</span>
            </h1>
            <p className="auth-hero-description">
              Track trips, rent, dining, and roommate ledgers. SplitMate simplifies multi-party debts so you settle with fewer payments.
            </p>
          </div>

          <div className="auth-feature-list">
            <div className="feature-pill">
              <Zap size={16} className="feature-icon" />
              <span>Smart Min-Cash-Flow debt simplification</span>
            </div>
            <div className="feature-pill">
              <Users size={16} className="feature-icon" />
              <span>Equal, exact, and percentage split controls</span>
            </div>
            <div className="feature-pill">
              <ShieldCheck size={16} className="feature-icon" />
              <span>Secure JWT authentication & member-isolated data</span>
            </div>
          </div>
        </div>

        {/* Right Side: Login Card */}
        <div className="auth-form-panel">
          <div className="auth-card">
            <div className="auth-card-header">
              <h2 className="auth-card-title">Welcome back</h2>
              <p className="auth-card-subtitle">
                Log in to view your groups, balances, and recent expenses.
              </p>
            </div>

            {serverError && (
              <Alert variant="error" onClose={() => setServerError("")}>
                {serverError}
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="auth-form" noValidate>
              <Input
                label="Email Address"
                type="email"
                name="email"
                id="login-email"
                placeholder="name@university.edu"
                icon={Mail}
                value={formData.email}
                onChange={handleChange}
                error={errors.email}
                required
                autoComplete="email"
                disabled={isSubmitting}
              />

              <Input
                label="Password"
                type="password"
                name="password"
                id="login-password"
                placeholder="Enter your password"
                icon={Lock}
                value={formData.password}
                onChange={handleChange}
                error={errors.password}
                required
                autoComplete="current-password"
                disabled={isSubmitting}
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isSubmitting}
                iconRight={ArrowRight}
                className="auth-submit-btn"
              >
                Sign In to SplitMate
              </Button>
            </form>

            <div className="auth-divider">
              <span className="auth-divider-text">Or continue with</span>
            </div>

            <div className="auth-oauth-section">
              <GoogleSignInButton
                text="signin_with"
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                disabled={isSubmitting}
              />
            </div>

            <div className="auth-card-footer">
              <p className="auth-switch-text">
                Don't have an account yet?{" "}
                <Link to="/register" className="auth-switch-link">
                  Create one now
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
