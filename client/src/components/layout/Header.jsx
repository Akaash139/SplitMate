import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Menu, LogOut, User as UserIcon, Sun, Moon } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { useTheme } from "../../context/useTheme";
import { Button } from "../common/Button";
import "./Header.css";

export function Header({ onMenuClick }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const dropdownRef = useRef(null);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const query = globalSearch.trim();
    if (query) {
      navigate(`/expenses?search=${encodeURIComponent(query)}`);
    } else {
      navigate("/expenses");
    }
  };

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
      {/* Mobile Toggle & Brand */}
      <div className="header-left-group">
        <button
          type="button"
          className="header-mobile-toggle"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
        >
          <Menu size={22} />
        </button>

        <div className="header-mobile-brand">
          <img
            src="/splitmate-logo.svg"
            alt="SplitMate Logo"
            className="header-mobile-logo-img"
          />
          <span className="header-mobile-brand-name">SplitMate</span>
        </div>
      </div>

      {/* Global Search Bar */}
      <form
        role="search"
        className="header-search-bar"
        onSubmit={handleSearchSubmit}
      >
        <button
          type="submit"
          className="search-submit-btn"
          aria-label="Search expenses"
        >
          <Search size={16} className="search-icon" />
        </button>
        <input
          type="search"
          placeholder="Search expenses, groups, notes..."
          className="search-input"
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
          aria-label="Search expenses"
        />
      </form>

      {/* Header Actions */}
      <div className="header-actions">
        {/* Dark Mode Theme Toggle */}
        <button
          type="button"
          className="header-icon-btn theme-toggle-btn"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
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
              <span className="profile-status">{user?.email || "Signed in"}</span>
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
