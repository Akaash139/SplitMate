import "./Badge.css";

export function Badge({ children, variant = "neutral", size = "sm", className = "" }) {
  return (
    <span className={`splitmate-badge badge-${variant} badge-${size} ${className}`}>
      {children}
    </span>
  );
}
