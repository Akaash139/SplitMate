import { useState, useEffect } from "react";
import {
  Download,
  Share,
  PlusSquare,
  Smartphone,
  Laptop,
  Info,
  X
} from "lucide-react";
import {
  checkIsStandalone,
  detectIosSafari,
  detectIos,
  getInstallationStatus,
  getDeferredPrompt,
  getAppInstalledState,
  subscribeInstallPrompt,
  promptNativeInstall
} from "../../services/installPromptUtils";
import {
  shouldShowHeaderInstallButton,
  getHeaderInstallAction,
  getInstallGuideContent
} from "./headerInstallUtils";
import { Button } from "../common/Button";

function InstallGuideModal({ isIos, onClose }) {
  const content = getInstallGuideContent(isIos);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-container install-guide-modal-container animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="install-guide-header">
          <div className="install-guide-title-wrap">
            <div className="install-guide-icon-box">
              {isIos ? <Smartphone size={18} /> : <Download size={18} />}
            </div>
            <div>
              <h2 id="install-modal-title" className="install-guide-title">
                {content.title}
              </h2>
              <p className="install-guide-subtitle">{content.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="install-guide-body">
          {isIos ? (
            <>
              <p className="install-guide-intro">
                Install SplitMate directly to your iPhone or iPad home screen in 3 quick steps:
              </p>
              <ol className="install-guide-steps">
                {content.steps.map((s) => (
                  <li key={s.number} className="install-guide-step-item">
                    <span className="install-step-num">{s.number}</span>
                    <span className="install-step-text">
                      <strong>{s.action}</strong> {s.detail}{" "}
                      {s.icon === "share" && (
                        <span className="install-step-inline-icon">
                          <Share size={13} />
                        </span>
                      )}
                      {s.icon === "plus" && (
                        <span className="install-step-inline-icon">
                          <PlusSquare size={13} />
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <p className="install-guide-intro">
                Add SplitMate to your desktop or device launcher for dedicated instant access:
              </p>
              <div className="install-guide-sections">
                {content.sections.map((sec, idx) => (
                  <div key={idx} className="install-guide-section">
                    <div className="install-guide-section-head">
                      {sec.icon === "laptop" ? <Laptop size={16} /> : <Info size={16} />}
                      <span>{sec.heading}</span>
                    </div>
                    <p className="install-guide-section-desc">{sec.body}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="install-guide-note">
            <Info size={15} className="note-icon" />
            <span>{content.note}</span>
          </div>
        </div>

        <div className="install-guide-footer">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onClose}
          >
            Got It
          </Button>
        </div>
      </div>
    </div>
  );
}

export function HeaderInstallButton() {
  const [hasPrompt, setHasPrompt] = useState(() => Boolean(getDeferredPrompt()));
  const [isInstalled, setIsInstalled] = useState(() => {
    if (getAppInstalledState()) return true;
    if (typeof window !== "undefined") {
      return checkIsStandalone(
        window.navigator,
        window.matchMedia ? window.matchMedia.bind(window) : null
      );
    }
    return false;
  });

  const [isIosSafariBrowser] = useState(() => {
    if (typeof window !== "undefined") {
      const standalone = checkIsStandalone(
        window.navigator,
        window.matchMedia ? window.matchMedia.bind(window) : null
      );
      const ua = window.navigator.userAgent || "";
      const touchPoints = window.navigator.maxTouchPoints || 0;
      return detectIosSafari(ua, touchPoints, standalone);
    }
    return false;
  });

  const [isAnyIos] = useState(() => {
    if (typeof window !== "undefined") {
      const ua = window.navigator.userAgent || "";
      const touchPoints = window.navigator.maxTouchPoints || 0;
      return detectIos(ua, touchPoints);
    }
    return false;
  });

  const [isInstalling, setIsInstalling] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeInstallPrompt(() => {
      setHasPrompt(Boolean(getDeferredPrompt()));
      setIsInstalled(getAppInstalledState());
    });
    return unsubscribe;
  }, []);

  const isIos = isIosSafariBrowser || isAnyIos;
  const status = getInstallationStatus({
    isStandalone: isInstalled,
    hasPrompt,
    isIos
  });

  const isVisible = shouldShowHeaderInstallButton(status);
  if (!isVisible) {
    return null;
  }

  const action = getHeaderInstallAction(status);

  const handleClick = async () => {
    if (action === "prompt") {
      setIsInstalling(true);
      try {
        const result = await promptNativeInstall();
        if (result.outcome === "unavailable") {
          setShowModal(true);
        }
        // If outcome is 'accepted', subscribeInstallPrompt updates isInstalled -> button hides.
        // If outcome is 'dismissed', user cancelled; button remains available.
      } finally {
        setIsInstalling(false);
      }
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        id="header-install-btn"
        data-testid="header-install-btn"
        className="header-install-btn"
        onClick={handleClick}
        disabled={isInstalling}
        aria-label="Install SplitMate"
        title="Install SplitMate"
      >
        <Download size={15} className="header-install-icon" />
        <span className="header-install-text">Install</span>
      </button>

      {showModal && (
        <InstallGuideModal
          isIos={isIos}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
