import { NavLink, Outlet, useLocation } from "react-router-dom";

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
        <NavLink to="/settings">Settings</NavLink>
      </nav>
      <main className={`container${isPlannerRoute ? " container--wide" : ""}`}>
        <Outlet />
      </main>
    </div>
  );
}
