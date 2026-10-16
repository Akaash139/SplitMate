import { NavLink, useNavigate } from "react-router-dom";
import {
  Zap,
  HelpCircle,
  LogOut,
  X
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { NAV_ITEMS } from "./navConfig";
import "./Sidebar.css";

export function Sidebar({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "SM";

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}

      <aside className={`splitmate-sidebar ${isOpen ? "is-open" : ""}`}>
        {/* Brand Header */}
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="brand-logo-mark">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="24" height="24" rx="6" fill="#0D9488" />
                <path d="M7 12H17M12 7V17" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
                <circle cx="12" cy="12" r="3" fill="#14B8A6" />
              </svg>
            </div>
            <span className="brand-name">SplitMate</span>
          </div>

          <button
            type="button"
            className="sidebar-mobile-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Group Selector Pill */}
        <div
          className="sidebar-group-selector"
          onClick={() => {
            if (onClose) onClose();
            navigate("/groups");
          }}
          role="button"
          tabIndex={0}
          style={{ cursor: "pointer" }}
        >
          <div className="group-avatar-badge">{userInitials}</div>
          <div className="group-text-wrap">
            <span className="group-main-title">All Personal Groups</span>
            <span className="group-sub-title">Shared Household</span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="sidebar-nav">
          <ul className="nav-list">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.path} className="nav-item">
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      `nav-link ${isActive ? "is-active" : ""}`
                    }
                    onClick={() => {
                      if (onClose) onClose();
                    }}
                  >
                    <Icon className="nav-icon" size={18} />
                    <span className="nav-label">{item.label}</span>
                    {item.badge && <span className="nav-badge">{item.badge}</span>}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <button
            type="button"
            className="quick-settle-btn"
            onClick={() => {
              if (onClose) onClose();
              navigate("/settlements");
            }}
          >
            <Zap size={16} className="quick-settle-icon" />
            <span>Quick Settle</span>
          </button>

          <button
            type="button"
            className="sidebar-footer-link"
            onClick={() => {
              if (onClose) onClose();
              navigate("/settings");
            }}
          >
            <HelpCircle size={16} />
            <span>Help & Documentation</span>
          </button>

          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={logout}
            title="Log out of SplitMate"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
