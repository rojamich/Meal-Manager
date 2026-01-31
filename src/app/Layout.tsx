import { NavLink, Outlet } from "react-router-dom";

export default function Layout() {
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
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}