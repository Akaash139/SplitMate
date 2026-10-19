import { useLocation, NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  History,
  ArrowLeftRight,
  Settings
} from "lucide-react";
import { MOBILE_PRIMARY_ITEMS, getActiveMobileTab } from "./mobileNavUtils";
import "./MobileBottomNav.css";

const ICON_MAP = {
  dashboard: LayoutDashboard,
  groups: Users,
  activity: History,
  settlements: ArrowLeftRight,
  settings: Settings
};

export function MobileBottomNav() {
  const location = useLocation();
  const activeTab = getActiveMobileTab(location.pathname);

  return (
    <nav className="splitmate-bottom-nav" aria-label="Mobile primary navigation">
      <div className="bottom-nav-inner">
        {MOBILE_PRIMARY_ITEMS.map((item) => {
          const Icon = ICON_MAP[item.id] || Settings;
          const isActive = activeTab === item.id;

          return (
            <NavLink
              key={item.id}
              to={item.path}
              id={`mobile-nav-${item.id}`}
              className={`bottom-nav-item ${isActive ? "is-active" : ""}`}
              aria-label={item.ariaLabel || item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <div className="bottom-nav-icon-wrap">
                <Icon size={19} className="bottom-nav-icon" />
              </div>
              <span className="bottom-nav-label">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
