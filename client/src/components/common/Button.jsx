import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import "./Button.css";

export const Button = forwardRef(function Button(
  {
    children,
    variant = "primary",
    size = "md",
    type = "button",
    isLoading = false,
    disabled = false,
    icon: Icon,
    iconRight: IconRight,
    className = "",
    ...props
  },
  ref
) {
  const baseClasses = `btn btn-${variant} btn-${size} ${className}`;

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      className={baseClasses}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="btn-spinner animate-spin" size={size === "sm" ? 14 : size === "lg" ? 20 : 16} />
      ) : Icon ? (
        <Icon className="btn-icon" size={size === "sm" ? 14 : size === "lg" ? 20 : 16} />
      ) : null}
      
      {children && <span className="btn-text">{children}</span>}

      {!isLoading && IconRight && (
        <IconRight className="btn-icon-right" size={size === "sm" ? 14 : size === "lg" ? 20 : 16} />
      )}
    </button>
  );
});
