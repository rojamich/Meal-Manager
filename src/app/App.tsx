import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./Layout";
import PantryPage from "../features/pantry/PantryPage";
import RecipesPage from "../features/recipes/RecipesPage";
import RecipePrint from "../features/recipes/RecipePrint";
import PlannerPage from "../features/planner/PlannerPage";
import GroceryPage from "../features/grocery/GroceryPage";
import SettingsPage from "../features/settings/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/planner" replace />} />
          <Route path="planner" element={<PlannerPage />} />
          <Route path="grocery" element={<GroceryPage />} />
          <Route path="recipes" element={<RecipesPage />} />
          <Route path="recipes/:id/print" element={<RecipePrint />} />
          <Route path="pantry" element={<PantryPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}