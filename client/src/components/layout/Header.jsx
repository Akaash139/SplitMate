import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell, Plus, Menu, LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { Button } from "../common/Button";
import "./Header.css";

export function Header({ onMenuClick }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U";

  return (
    <header className="splitmate-header">
      {/* Mobile Toggle */}
      <button
        type="button"
        className="header-mobile-toggle"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
      >
        <Menu size={22} />
      </button>

      {/* Global Search Bar */}
      <div className="header-search-bar">
        <Search size={16} className="search-icon" />
        <input
          type="text"
          placeholder="Search expenses, groups, friends..."
          className="search-input"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              navigate("/groups");
            }
          }}
        />
        <kbd className="search-shortcut">⌘K</kbd>
      </div>

      {/* Header Actions */}
      <div className="header-actions">
        {/* Notification Bell */}
        <button
          type="button"
          className="header-icon-btn"
          aria-label="View notifications"
          title="Notifications"
          onClick={() => navigate("/expenses")}
        >
          <Bell size={18} />
          <span className="notification-indicator" />
        </button>

        {/* Quick Settle Up Button */}
        <Button
          variant="secondary"
          size="sm"
          className="header-settle-btn"
          id="header-settle-up-btn"
          data-testid="header-settle-up-btn"
          onClick={() => navigate("/settlements")}
        >
          Settle Up
        </Button>

        {/* Primary Add Expense Button */}
        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          className="header-add-expense-btn"
          onClick={() => navigate("/groups")}
        >
          Add Expense
        </Button>

        {/* User Profile Pill */}
        <div className="header-profile-menu" ref={dropdownRef}>
          <button
            type="button"
            className="profile-pill-trigger"
            onClick={() => setProfileDropdownOpen((prev) => !prev)}
            aria-expanded={profileDropdownOpen}
            aria-haspopup="true"
          >
            <div className="profile-avatar">
              {user?.avatar ? (
                <img src={user.avatar} alt={user.name} className="avatar-img" />
              ) : (
                <span className="avatar-initials">{initials}</span>
              )}
            </div>
            <div className="profile-info-text">
              <span className="profile-name">{user?.name || "SplitMate User"}</span>
              <span className="profile-status">Online</span>
            </div>
          </button>

          {/* Profile Dropdown */}
          {profileDropdownOpen && (
            <div className="profile-dropdown-menu">
              <div className="dropdown-user-header">
                <p className="dropdown-user-name">{user?.name}</p>
                <p className="dropdown-user-email">{user?.email}</p>
              </div>

              <div className="dropdown-divider" />

              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  setProfileDropdownOpen(false);
                  navigate("/settings");
                }}
              >
                <UserIcon size={16} />
                <span>My Profile</span>
              </button>

              <div className="dropdown-divider" />

              <button
                type="button"
                className="dropdown-item item-danger"
                onClick={() => {
                  setProfileDropdownOpen(false);
                  logout();
                }}
              >
                <LogOut size={16} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
