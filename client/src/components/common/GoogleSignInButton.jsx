import { useEffect, useRef, useState } from "react";
import "./GoogleSignInButton.css";

/**
 * Reusable Google Identity Services Sign-In Button component.
 * Safely initializes Google's client SDK and renders the official GSI button.
 */
export function GoogleSignInButton({
  onSuccess,
  onError,
  text = "continue_with",
  disabled = false
}) {
  const containerRef = useRef(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const configError = !clientId
    ? "Google Client ID not configured. Please set VITE_GOOGLE_CLIENT_ID in client/.env.local."
    : "";
  const errorMessage = configError || loadError;

  useEffect(() => {
    if (!clientId) {
      return;
    }

    let intervalId = null;
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max wait

    const initGsi = () => {
      if (window.google?.accounts?.id && containerRef.current) {
        if (intervalId) clearInterval(intervalId);
        setSdkLoaded(true);

        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: (response) => {
              if (response?.credential) {
                onSuccess?.(response.credential);
              } else {
                onError?.(new Error("No credential received from Google"));
              }
            },
            auto_select: false,
            cancel_on_tap_outside: true
          });

          // Render Google's official branded button
          containerRef.current.innerHTML = "";
          window.google.accounts.id.renderButton(containerRef.current, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: text, // "signin_with" | "signup_with" | "continue_with"
            shape: "rectangular",
            logo_alignment: "left",
            width: "360"
          });
        } catch (err) {
          console.error("Failed to initialize Google Sign-In button:", err);
          setLoadError("Failed to initialize Google Sign-In.");
          onError?.(err);
        }
      } else {
        attempts++;
        if (attempts >= maxAttempts) {
          if (intervalId) clearInterval(intervalId);
          setLoadError("Google Identity Services script failed to load. Please check your internet connection.");
        }
      }
    };

    if (window.google?.accounts?.id) {
      initGsi();
    } else {
      intervalId = setInterval(initGsi, 100);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [clientId, text, onSuccess, onError]);

  if (errorMessage) {
    return (
      <div className="google-btn-error" role="alert">
        <span>{errorMessage}</span>
      </div>
    );
  }

  return (
    <div className={`google-btn-wrapper ${disabled ? "google-btn-disabled" : ""}`}>
      {!sdkLoaded && (
        <div className="google-btn-placeholder">
          <div className="google-spinner" />
          <span>Loading Google Sign-In...</span>
        </div>
      )}
      <div
        ref={containerRef}
        className="google-btn-container"
        style={{ display: sdkLoaded ? "flex" : "none" }}
      />
    </div>
  );
}
