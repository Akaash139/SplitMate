import { AlertCircle, CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import "./Alert.css";

const ICONS = {
  error: AlertCircle,
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info
};

export function Alert({
  variant = "info",
  title,
  children,
  onClose,
  className = ""
}) {
  const IconComponent = ICONS[variant] || Info;

  return (
    <div className={`splitmate-alert alert-${variant} ${className}`} role="alert">
      <div className="alert-icon-wrapper">
        <IconComponent size={18} />
      </div>

      <div className="alert-content">
        {title && <h4 className="alert-title">{title}</h4>}
        <div className="alert-message">{children}</div>
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="alert-dismiss-btn"
          aria-label="Dismiss alert"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
