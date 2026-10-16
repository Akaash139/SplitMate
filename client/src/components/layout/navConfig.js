import {
  LayoutDashboard,
  Users,
  UserCheck,
  History,
  ArrowLeftRight,
  PieChart,
  Settings
} from "lucide-react";

/**
 * Primary navigation items for the SplitMate sidebar layout.
 * Canonical route for the activity/expense stream is /expenses.
 */
export const NAV_ITEMS = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Groups", path: "/groups", icon: Users },
  { label: "Friends", path: "/friends", icon: UserCheck },
  { label: "Activity", path: "/expenses", icon: History },
  { label: "Settlements", path: "/settlements", icon: ArrowLeftRight },
  { label: "Analytics", path: "/analytics", icon: PieChart },
  { label: "Account Settings", path: "/settings", icon: Settings }
];
