import { Loader2 } from "lucide-react";
import "./LoadingSpinner.css";

export function LoadingSpinner({
  size = "md",
  message = "Loading SplitMate...",
  fullScreen = false
}) {
  const pixelSize = size === "sm" ? 20 : size === "lg" ? 44 : 32;

  const content = (
    <div className={`splitmate-spinner-container ${fullScreen ? "is-fullscreen" : ""}`}>
      <div className="spinner-brand-mark">
        <Loader2 className="animate-spin spinner-icon" size={pixelSize} />
      </div>
      {message && <p className="spinner-message">{message}</p>}
    </div>
  );

  return content;
}
