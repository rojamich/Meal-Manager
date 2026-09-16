import { NavLink, Outlet, useLocation } from "react-router-dom";
import ActiveLocationPicker from "../features/locations/ActiveLocationPicker";
import SyncActivityWatcher from "../components/SyncActivityWatcher";
import DataErrorBanner from "../components/DataErrorBanner";
import UpdatePrompt from "../components/UpdatePrompt";

export default function Layout() {
  const location = useLocation();
  const isPlannerRoute = location.pathname === "/planner";

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <div className="brand">Meal Manager</div>
        <NavLink to="/planner">Planner</NavLink>
        <NavLink to="/grocery">Grocery</NavLink>
        <NavLink to="/recipes">Recipes</NavLink>
        <NavLink to="/pantry">Pantry</NavLink>
        <NavLink to="/locations">Locations</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <ActiveLocationPicker />
      </nav>
      <main className={`container${isPlannerRoute ? " container--wide" : ""}`}>
        <DataErrorBanner />
        <Outlet />
      </main>
      <SyncActivityWatcher />
      <UpdatePrompt />
    </div>
  );
}
