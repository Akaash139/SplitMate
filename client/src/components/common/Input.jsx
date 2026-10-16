import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./Input.css";

export const Input = forwardRef(function Input(
  {
    label,
    error,
    helperText,
    type = "text",
    icon: Icon,
    id,
    name,
    required = false,
    className = "",
    ...props
  },
  ref
) {
  const [showPassword, setShowPassword] = useState(false);
  const inputId = id || name;

  const isPassword = type === "password";
  const effectiveType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <div className={`input-field-group ${className}`}>
      {label && (
        <label htmlFor={inputId} className="input-label">
          {label}
          {required && <span className="input-required-star">*</span>}
        </label>
      )}

      <div className={`input-wrapper ${error ? "has-error" : ""}`}>
        {Icon && (
          <span className="input-leading-icon">
            <Icon size={18} />
          </span>
        )}

        <input
          ref={ref}
          id={inputId}
          name={name}
          type={effectiveType}
          className={`input-element ${Icon ? "with-leading-icon" : ""} ${isPassword ? "with-trailing-icon" : ""}`}
          required={required}
          {...props}
        />

        {isPassword && (
          <button
            type="button"
            className="input-password-toggle"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>

      {error ? (
        <p className="input-error-msg">{error}</p>
      ) : helperText ? (
        <p className="input-helper-msg">{helperText}</p>
      ) : null}
    </div>
  );
});
