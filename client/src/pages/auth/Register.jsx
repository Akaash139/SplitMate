import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { User, Mail, Lock, ArrowRight, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { Input } from "../../components/common/Input";
import { Button } from "../../components/common/Button";
import { Alert } from "../../components/common/Alert";
import { GoogleSignInButton } from "../../components/common/GoogleSignInButton";
import "./Auth.css";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Register() {
  const { register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || location.state?.from || "/dashboard";

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
    if (serverError) {
      setServerError("");
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = "Full name is required";
    } else if (formData.name.trim().length < 2) {
      newErrors.name = "Name must be at least 2 characters long";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email address is required";
    } else if (!EMAIL_REGEX.test(formData.email.trim())) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters long";
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
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
      await register(formData.name.trim(), formData.email.trim(), formData.password);
      navigate(from, { replace: true });
    } catch (err) {
      setServerError(err.message || "Failed to create account. Please try again.");
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
      setServerError(err.message || "Failed to sign up with Google.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleError = (err) => {
    setServerError(err?.message || "Google sign-up was interrupted or failed.");
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
              Fair splits, <br />
              <span className="text-teal-gradient">clear accounting.</span>
            </h1>
            <p className="auth-hero-description">
              Create groups in seconds, share private invitation links, and track shared balances with total transparency.
            </p>
          </div>

          <div className="auth-checklist">
            <div className="check-item">
              <CheckCircle2 size={18} className="check-icon" />
              <span>Free for roommates, student clubs, and trip groups</span>
            </div>
            <div className="check-item">
              <CheckCircle2 size={18} className="check-icon" />
              <span>Automated debt minimization algorithm</span>
            </div>
            <div className="check-item">
              <CheckCircle2 size={18} className="check-icon" />
              <span>Exportable CSV records & monthly analytics</span>
            </div>
          </div>
        </div>

        {/* Right Side: Register Form */}
        <div className="auth-form-panel">
          <div className="auth-card">
            <div className="auth-card-header">
              <h2 className="auth-card-title">Create your account</h2>
              <p className="auth-card-subtitle">
                Join SplitMate to start tracking and settling shared expenses.
              </p>
            </div>

            {serverError && (
              <Alert variant="error" onClose={() => setServerError("")}>
                {serverError}
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="auth-form" noValidate>
              <Input
                label="Full Name"
                type="text"
                name="name"
                id="register-name"
                placeholder="Aarav Patel"
                icon={User}
                value={formData.name}
                onChange={handleChange}
                error={errors.name}
                required
                autoComplete="name"
                disabled={isSubmitting}
              />

              <Input
                label="Email Address"
                type="email"
                name="email"
                id="register-email"
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
                id="register-password"
                placeholder="At least 6 characters"
                helperText="Must contain at least 6 characters"
                icon={Lock}
                value={formData.password}
                onChange={handleChange}
                error={errors.password}
                required
                autoComplete="new-password"
                disabled={isSubmitting}
              />

              <Input
                label="Confirm Password"
                type="password"
                name="confirmPassword"
                id="register-confirm-password"
                placeholder="Re-enter your password"
                icon={Lock}
                value={formData.confirmPassword}
                onChange={handleChange}
                error={errors.confirmPassword}
                required
                autoComplete="new-password"
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
                Create Account
              </Button>
            </form>

            <div className="auth-divider">
              <span className="auth-divider-text">Or register with</span>
            </div>

            <div className="auth-oauth-section">
              <GoogleSignInButton
                text="signup_with"
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                disabled={isSubmitting}
              />
            </div>

            <div className="auth-card-footer">
              <p className="auth-switch-text">
                Already have an account?{" "}
                <Link to="/login" state={location.state} className="auth-switch-link">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
