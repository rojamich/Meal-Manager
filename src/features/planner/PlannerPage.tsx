import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LocationProfile, MealSlot, PlannedMeal, Recipe, WeekTemplate } from "../../models";
import {
  listMealSlots,
  listPlannedMeals,
  updatePlannedMeal
} from "../../db/repositories/mealPlanRepo";
import { listAllIngredients, listRecipes } from "../../db/repositories/recipeRepo";
import { listActiveLots } from "../../db/repositories/inventoryRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { buildCookPlan, commitCook, CookPlan, uncookMeal } from "./cookPlan";
import CookMealModal from "./CookMealModal";
import ExpiringSoon from "./ExpiringSoon";
import InlineAddPanel from "./InlineAddPanel";
import MealLabel from "./MealLabel";
import WeekCell from "./WeekCell";
import WeekSlotCard from "./WeekSlotCard";
import { useActiveLocationId } from "../locations/activeLocation";
import {
  buildInlinePanelStyle,
  formatWeekdayLabel,
  monthRange,
  weekRange
} from "./plannerHelpers";
import { useMediaQuery } from "./useMediaQuery";
import { formatDateLabel, parseISODate, addDays, dateKey } from "../../utils/date";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { listLocations } from "../../db/repositories/locationRepo";
import {
  applyWeekTemplateToWeek,
  createWeekTemplate,
  deleteWeekTemplate,
  listWeekTemplates
} from "../../db/repositories/weekTemplateRepo";
import { getHouseholdSize } from "../settings/preferences";
import {
  buildFreeformMealInput,
  buildLeftoverMealInput,
  buildRecipeMealInput,
  calculateRecipeMealLeftoverState,
  cloneMealWithRules,
  createMealWithRules,
  deleteMealWithRules,
  getEffectiveLeftoverRemaining
} from "./plannerDomain";
import { useConfirmChoiceModal } from "../../components/useConfirmChoiceModal";
import { useToast } from "../../components/useToast";

export default function PlannerPage() {
  const DEBUG_DND = false;
  const [view, setView] = useState<"week" | "month">("week");
  const [anchorDate, setAnchorDate] = useState(dateKey(new Date()));
  const [slots, setSlots] = useState<MealSlot[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [activeSlot, setActiveSlot] = useState<{ date: string; mealSlotId: string } | null>(null);
  const [inlineType, setInlineType] = useState<PlannedMeal["type"]>("recipe");
  const [inlineRecipeId, setInlineRecipeId] = useState("");
  const [inlineServings, setInlineServings] = useState("");
  const [inlineLeftoverSource, setInlineLeftoverSource] = useState("");
  const [householdSize] = useState<number>(getHouseholdSize());
  const [inlineLeftoverServingsUsed, setInlineLeftoverServingsUsed] = useState("1");
  const [includeAnyRecent, setIncludeAnyRecent] = useState(false);
  const [inlineFreeformTitle, setInlineFreeformTitle] = useState("");
  const [inlineNotes, setInlineNotes] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recentPlanned, setRecentPlanned] = useState<PlannedMeal[]>([]);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelAnchorEl, setPanelAnchorEl] = useState<HTMLElement | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const [leftoverEditMealId, setLeftoverEditMealId] = useState<string | null>(null);
  const [leftoverEditValue, setLeftoverEditValue] = useState<number>(0);
  const [servingsEditMealId, setServingsEditMealId] = useState<string | null>(null);
  const [servingsEditValue, setServingsEditValue] = useState<number>(householdSize);
  const [activeMealActionsId, setActiveMealActionsId] = useState<string | null>(null);
  const [copySourceDay, setCopySourceDay] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<WeekTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateLocationId, setTemplateLocationId] = useState("");
  const [locations, setLocations] = useState<LocationProfile[]>([]);
  const [templateFilter, setTemplateFilter] = useState<"all" | "this">("all");
  const [plannerLocationId] = useActiveLocationId();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMealIds, setSelectedMealIds] = useState<string[]>([]);
  const [pendingPasteMeals, setPendingPasteMeals] = useState<PlannedMeal[]>([]);
  const [dayActionDate, setDayActionDate] = useState("");
  const [lastDragMove, setLastDragMove] = useState<{
    mealId: string;
    fromDate: string;
    fromMealSlotId: string;
    toDate: string;
    toMealSlotId: string;
  } | null>(null);
  const undoMoveTimerRef = useRef<number | null>(null);
  const [cookMeal, setCookMeal] = useState<PlannedMeal | null>(null);
  const [cookRecipe, setCookRecipe] = useState<Recipe | null>(null);
  const [cookPlan, setCookPlan] = useState<CookPlan | null>(null);
  const [cookServings, setCookServings] = useState<number>(0);
  const isMobileLayout = useMediaQuery("(max-width: 768px)");
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 }
    })
  );
  const { requestChoice, modal } = useConfirmChoiceModal();
  const { notify, toast } = useToast();

  function closePanel(reason: string, e?: Event) {
    void reason;
    void e;
    setActiveSlot(null);
    setPanelAnchorEl(null);
    setPanelStyle(null);
  }

  useEffect(() => {
    listMealSlots().then(setSlots);
    listRecipes().then(setRecipes);
    listLocations().then(setLocations);
    listWeekTemplates().then(setTemplates);
  }, []);

  const refreshMeals = useCallback(async () => {
    const range = view === "week" ? weekRange(anchorDate) : monthRange(anchorDate);
    const data = await listPlannedMeals(range.start, range.end);
    setMeals([...data]);
    return data;
  }, [anchorDate, view]);

  const refreshRecentMeals = useCallback(async () => {
    const range = weekRange(anchorDate);
    const rangeStart = parseISODate(range.start);
    const start = addDays(rangeStart, -14);
    const recent = await listPlannedMeals(dateKey(start), dateKey(range.end));
    setRecentPlanned([...recent]);
    return recent;
  }, [anchorDate]);

  useEffect(() => {
    refreshMeals();
  }, [refreshMeals]);

  useEffect(() => {
    refreshRecentMeals();
  }, [refreshRecentMeals]);

  const combinedLeftoverSourceMeals = useMemo(() => {
    const map = new Map<string, PlannedMeal>();
    meals.forEach((meal) => map.set(meal.id, meal));
    recentPlanned.forEach((meal) => {
      if (!map.has(meal.id)) map.set(meal.id, meal);
    });
    return Array.from(map.values());
  }, [meals, recentPlanned]);

  const applySourceUpdate = useCallback(
    (sourceUpdate?: { mealId: string; leftoverServingsRemaining: number }) => {
      if (!sourceUpdate) return;
      setMeals((prev: PlannedMeal[]) =>
        prev.map((meal: PlannedMeal) =>
          meal.id === sourceUpdate.mealId
            ? { ...meal, leftoverServingsRemaining: sourceUpdate.leftoverServingsRemaining }
            : meal
        )
      );
      setRecentPlanned((prev: PlannedMeal[]) =>
        prev.map((meal: PlannedMeal) =>
          meal.id === sourceUpdate.mealId
            ? { ...meal, leftoverServingsRemaining: sourceUpdate.leftoverServingsRemaining }
            : meal
        )
      );
    },
    []
  );

  const createMealAndRefresh = useCallback(
    async (
      payload: Omit<PlannedMeal, "id" | "createdAt" | "updatedAt">,
      options?: { skipLeftoverDecrement?: boolean }
    ) => {
      const result = await createMealWithRules({
        input: payload,
        householdSize,
        currentMeals: [...meals, ...recentPlanned],
        skipLeftoverDecrement: options?.skipLeftoverDecrement
      });
      if (result.error) {
        notify(result.error, "error");
        return undefined;
      }
      const created = result.created;
      applySourceUpdate(result.sourceUpdate);
      const range = view === "week" ? weekRange(anchorDate) : monthRange(anchorDate);
      if (created && created.date >= range.start && created.date <= range.end) {
        setMeals((prev: PlannedMeal[]) => [...prev, created as PlannedMeal]);
      }
      await refreshMeals();
      await refreshRecentMeals();
      return created;
    },
    [anchorDate, applySourceUpdate, householdSize, meals, recentPlanned, refreshMeals, refreshRecentMeals, view]
  );

  async function removeMeal(id: string) {
    const choice = await requestChoice({
      title: "Delete Meal?",
      message: "This will remove the selected meal.",
      choices: [
        { label: "Delete", value: "confirm-delete", tone: "danger" },
        { label: "Cancel", value: "cancel", tone: "neutral" }
      ]
    });
    if (choice !== "confirm-delete") return;
    await deleteMealsBatch([id]);
  }

  const deleteMealsBatch = useCallback(
    async (mealIds: string[]) => {
      const knownMeals = Array.from(new Map([...meals, ...recentPlanned].map((meal) => [meal.id, meal])).values());
      const mealIdSet = new Set(mealIds);
      const mealsToDelete = knownMeals
        .filter((meal) => mealIdSet.has(meal.id))
        .sort((a, b) => {
          if (a.type === b.type) return a.date.localeCompare(b.date);
          if (a.type === "leftover") return -1;
          if (b.type === "leftover") return 1;
          return a.date.localeCompare(b.date);
        });
      if (!mealsToDelete.length) return;

      let contextMeals = [...knownMeals];
      for (const meal of mealsToDelete) {
        const result = await deleteMealWithRules({
          meal,
          householdSize,
          currentMeals: contextMeals
        });
        if (result.sourceUpdate) {
          contextMeals = contextMeals.map((row) =>
            row.id === result.sourceUpdate?.mealId
              ? { ...row, leftoverServingsRemaining: result.sourceUpdate.leftoverServingsRemaining }
              : row
          );
        }
        contextMeals = contextMeals.filter((row) => row.id !== meal.id);
      }

      const remainingById = new Map(contextMeals.map((meal) => [meal.id, meal]));
      setMeals((prev: PlannedMeal[]) =>
        prev
          .filter((row: PlannedMeal) => !mealIdSet.has(row.id))
          .map((row: PlannedMeal) => remainingById.get(row.id) || row)
      );
      setRecentPlanned((prev: PlannedMeal[]) =>
        prev
          .filter((row: PlannedMeal) => !mealIdSet.has(row.id))
          .map((row: PlannedMeal) => remainingById.get(row.id) || row)
      );
      setSelectedMealIds((prev) => prev.filter((id) => !mealIdSet.has(id)));
      if (servingsEditMealId && mealIdSet.has(servingsEditMealId)) {
        setServingsEditMealId(null);
      }
      if (leftoverEditMealId && mealIdSet.has(leftoverEditMealId)) {
        setLeftoverEditMealId(null);
      }
      if (activeMealActionsId && mealIdSet.has(activeMealActionsId)) {
        setActiveMealActionsId(null);
      }
      await refreshMeals();
      await refreshRecentMeals();
    },
    [
      activeMealActionsId,
      householdSize,
      leftoverEditMealId,
      meals,
      recentPlanned,
      refreshMeals,
      refreshRecentMeals,
      servingsEditMealId
    ]
  );

  const resetInline = useCallback(() => {
    setInlineType("recipe");
    setInlineRecipeId("");
    setInlineServings("");
    setInlineLeftoverSource("");
    setInlineLeftoverServingsUsed("1");
    setIncludeAnyRecent(false);
    setInlineFreeformTitle("");
    setInlineNotes("");
    setRecipeSearch("");
  }, []);

  const openInlineAdd = useCallback(
    async (slot: { date: string; mealSlotId: string }, anchorEl?: HTMLElement | null) => {
      const nextAnchor = anchorEl ?? null;
      setActiveSlot(slot);
      setPanelAnchorEl(nextAnchor);
      setPanelStyle(buildInlinePanelStyle(nextAnchor));
      resetInline();
      await refreshRecentMeals();
    },
    [refreshRecentMeals, resetInline]
  );

  const buildInlinePayload = useCallback((): Omit<PlannedMeal, "id" | "createdAt" | "updatedAt"> | null => {
    if (!activeSlot) return null;
    if (inlineType === "recipe") {
      const recipe = recipes.find((r) => r.id === inlineRecipeId);
      if (!recipe) return null;
      return buildRecipeMealInput({
        date: activeSlot.date,
        mealSlotId: activeSlot.mealSlotId,
        recipe,
        servingsPlanned: Number(inlineServings || householdSize || 1),
        householdSize,
        notes: inlineNotes
      });
    }
    if (inlineType === "leftover") {
      if (!inlineLeftoverSource) return null;
      const servingsUsed = Math.max(Number(inlineLeftoverServingsUsed || 1), 1);
      if (inlineLeftoverSource.startsWith("meal:")) {
        const mealId = inlineLeftoverSource.slice(5);
        const sourceMeal = combinedLeftoverSourceMeals.find((meal) => meal.id === mealId);
        if (!sourceMeal) return null;
        return buildLeftoverMealInput({
          date: activeSlot.date,
          mealSlotId: activeSlot.mealSlotId,
          sourceMeal,
          servingsUsed,
          notes: inlineNotes
        });
      }
      if (inlineLeftoverSource.startsWith("recipe:")) {
        const recipeId = inlineLeftoverSource.slice(7);
        const recipe = recipes.find((r) => r.id === recipeId);
        return buildLeftoverMealInput({
          date: activeSlot.date,
          mealSlotId: activeSlot.mealSlotId,
          servingsUsed,
          notes: inlineNotes,
          freeformTitle: recipe?.title || "Leftover"
        });
      }
      return null;
    }
    if (!inlineFreeformTitle.trim()) return null;
    return buildFreeformMealInput({
      date: activeSlot.date,
      mealSlotId: activeSlot.mealSlotId,
      freeformTitle: inlineFreeformTitle,
      notes: inlineNotes
    });
  }, [
    activeSlot,
    combinedLeftoverSourceMeals,
    inlineFreeformTitle,
    inlineLeftoverSource,
    inlineLeftoverServingsUsed,
    inlineNotes,
    inlineRecipeId,
    inlineServings,
    inlineType,
    householdSize,
    recipes
  ]);

  const isInsideInlinePanel = (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('[data-planner-inline-panel="true"]')) return true;
    if (panelAnchorEl && t && panelAnchorEl.contains(t)) return true;
    const path = (e as any).composedPath?.() as EventTarget[] | undefined;
    if (path) {
      for (const node of path) {
        if (node instanceof HTMLElement && node.hasAttribute("data-planner-inline-panel")) {
          return true;
        }
        if (panelAnchorEl && node instanceof HTMLElement && panelAnchorEl.contains(node)) {
          return true;
        }
      }
    }
    return false;
  };

  useEffect(() => {
    if (!activeSlot) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel("escape", event);
    };
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target === document.documentElement || target === document.body) return;
      const insidePanel = isInsideInlinePanel(event);
      if (insidePanel) return;
      closePanel("doc-click-outside", event);
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("click", handleClick, { capture: true });
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, [activeSlot, panelAnchorEl]);

  useEffect(() => {
    if (!activeSlot || !panelAnchorEl) return;
    const updatePanelPosition = () => {
      setPanelStyle(buildInlinePanelStyle(panelAnchorEl, panelRef.current));
    };

    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [activeSlot, panelAnchorEl]);

  const headerLabel = useMemo(() => {
    if (view === "week") {
      const range = weekRange(anchorDate);
      const start = parseISODate(range.start);
      const end = parseISODate(range.end);
      const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const endLabel = end.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return `${startLabel}-${endLabel}`;
    }
    const d = parseISODate(anchorDate);
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [anchorDate, view]);

  const navigate = useCallback(
    (direction: -1 | 1) => {
      const base = parseISODate(anchorDate);
      if (view === "week") {
        setAnchorDate(dateKey(addDays(base, 7 * direction)));
      } else {
        const next = new Date(base.getFullYear(), base.getMonth() + direction, base.getDate());
        setAnchorDate(dateKey(next));
      }
    },
    [anchorDate, view]
  );

  const goToday = useCallback(() => {
    setAnchorDate(dateKey(new Date()));
  }, []);

  const refreshTemplates = useCallback(async () => {
    setTemplates([...(await listWeekTemplates())]);
  }, []);

  const selectedMeals = useMemo(
    () => meals.filter((meal) => selectedMealIds.includes(meal.id)),
    [meals, selectedMealIds]
  );

  const visibleTemplateList = useMemo(() => {
    const source =
      templateFilter === "all"
        ? templates
        : plannerLocationId
          ? templates.filter((t) => t.locationId === plannerLocationId)
          : templates.filter((t) => !t.locationId);
    return [...source].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [plannerLocationId, templateFilter, templates]);

  const saveWeekTemplate = useCallback(async () => {
    const week = weekRange(anchorDate);
    const weekDays = Array.from({ length: 7 }, (_, i) => dateKey(addDays(parseISODate(week.start), i)));
    const days = weekDays.map((day, weekday) => {
      const dayMeals = meals
        .filter((meal) => meal.date === day)
        .map((meal) => ({
          mealSlotId: meal.mealSlotId,
          type: meal.type,
          recipeId: meal.recipeId,
          sourcePlannedMealId: meal.sourcePlannedMealId,
          leftoverSourceMealId: meal.leftoverSourceMealId,
          leftoverServingsRemaining: meal.leftoverServingsRemaining,
          freeformTitle:
            meal.type === "leftover"
              ? meal.freeformTitle ||
                recipes.find((recipe) => recipe.id === (mealsById.get(meal.leftoverSourceMealId || meal.sourcePlannedMealId || "")?.recipeId))?.title ||
                mealsById.get(meal.leftoverSourceMealId || meal.sourcePlannedMealId || "")?.freeformTitle ||
                "Leftover"
              : meal.freeformTitle,
          notes: meal.notes,
          servingsPlanned: meal.servingsPlanned
        }));
      return { weekday, meals: dayMeals };
    });
    const name = templateName.trim();
    if (!name) return;
    await createWeekTemplate({
      name,
      locationId: templateLocationId || undefined,
      days
    });
    setTemplateName("");
    await refreshTemplates();
  }, [anchorDate, meals, refreshTemplates, templateLocationId, templateName]);

  const applyTemplate = useCallback(
    async (template: WeekTemplate) => {
      const week = weekRange(anchorDate);
      const choice = await requestChoice({
        title: "Apply Template?",
        message: `Apply template "${template.name}" to this week?`,
        detail: "Existing meals in this week will be overwritten.",
        choices: [
          { label: "Apply & overwrite", value: "apply", tone: "primary" },
          { label: "Cancel", value: "cancel", tone: "neutral" }
        ]
      });
      if (choice !== "apply") return;
      await applyWeekTemplateToWeek(template, week.start, week.end);
      await refreshMeals();
      setShowTemplates(false);
    },
    [anchorDate, refreshMeals, requestChoice]
  );

  const clearSelectState = useCallback(() => {
    setPendingPasteMeals([]);
    setSelectedMealIds([]);
  }, []);

  const deleteTemplate = useCallback(
    async (id: string) => {
      const choice = await requestChoice({
        title: "Delete Template?",
        message: "This will remove the selected template.",
        choices: [
          { label: "Delete", value: "confirm-delete", tone: "danger" },
          { label: "Cancel", value: "cancel", tone: "neutral" }
        ]
      });
      if (choice !== "confirm-delete") return;
      await deleteWeekTemplate(id);
      await refreshTemplates();
    },
    [refreshTemplates, requestChoice]
  );

  const copyMealsForDay = useCallback(
    async (sourceDate: string, targetDate: string) => {
      const sourceMeals = meals.filter((meal) => meal.date === sourceDate);
      if (!sourceMeals.length) {
        notify("No meals to copy from that day.", "info");
        return;
      }
      const choice = await requestChoice({
        title: "Copy Meals?",
        message: `Copy ${sourceMeals.length} meals to ${formatDateLabel(targetDate)}?`,
        choices: [
          { label: "Copy", value: "copy", tone: "primary" },
          { label: "Cancel", value: "cancel", tone: "neutral" }
        ]
      });
      if (choice !== "copy") return;
      const errors: string[] = [];
      let contextMeals = [...meals, ...recentPlanned];
      for (const meal of sourceMeals) {
        const result = await cloneMealWithRules({
          meal,
          targetDate,
          targetMealSlotId: meal.mealSlotId,
          householdSize,
          currentMeals: contextMeals
        });
        if (result.sourceUpdate) {
          applySourceUpdate(result.sourceUpdate);
          contextMeals = contextMeals.map((row) =>
            row.id === result.sourceUpdate?.mealId
              ? { ...row, leftoverServingsRemaining: result.sourceUpdate.leftoverServingsRemaining }
              : row
          );
        }
        if (result.created) contextMeals = [...contextMeals, result.created];
        if (result.error) errors.push(result.error);
      }
      setCopySourceDay(null);
      await refreshMeals();
      await refreshRecentMeals();
      if (errors.length) notify(errors.join(" "), "error");
    },
    [applySourceUpdate, householdSize, meals, notify, recentPlanned, refreshMeals, refreshRecentMeals, requestChoice]
  );

  const toggleMealSelected = useCallback((mealId: string) => {
    setSelectedMealIds((prev) =>
      prev.includes(mealId) ? prev.filter((id) => id !== mealId) : [...prev, mealId]
    );
  }, []);

  const toggleSelectAllForDay = useCallback(
    (day: string) => {
      const dayMealIds = meals.filter((meal) => meal.date === day).map((meal) => meal.id);
      setSelectedMealIds((prev) => {
        const allSelected = dayMealIds.every((id) => prev.includes(id));
        if (allSelected) return prev.filter((id) => !dayMealIds.includes(id));
        return Array.from(new Set([...prev, ...dayMealIds]));
      });
    },
    [meals]
  );

  const openCookModal = useCallback(
    async (meal: PlannedMeal) => {
      if (meal.type !== "recipe" || !meal.recipeId) return;
      const recipe = recipes.find((r) => r.id === meal.recipeId);
      if (!recipe) {
        notify("Recipe is missing — can't deduct ingredients.", "error");
        return;
      }
      const [allIngredients, lots, pantryItems] = await Promise.all([
        listAllIngredients(),
        listActiveLots(),
        listPantryItems()
      ]);
      const recipeIngredients = allIngredients.filter((ing) => ing.recipeId === recipe.id);
      const servings = Math.max(meal.servingsPlanned ?? householdSize, 1);
      const plan = buildCookPlan({
        recipe,
        ingredients: recipeIngredients,
        lots,
        pantryItems,
        locations,
        servings,
        locationId: plannerLocationId || undefined
      });
      setCookRecipe(recipe);
      setCookMeal(meal);
      setCookServings(servings);
      setCookPlan(plan);
    },
    [householdSize, locations, notify, plannerLocationId, recipes]
  );

  const handleCookConfirm = useCallback(
    async (plan: CookPlan) => {
      if (!cookMeal) return;
      await commitCook({ meal: cookMeal, plan });
      const cookedAt = new Date().toISOString();
      setMeals((prev: PlannedMeal[]) =>
        prev.map((row: PlannedMeal) => (row.id === cookMeal.id ? { ...row, cookedAt } : row))
      );
      setRecentPlanned((prev: PlannedMeal[]) =>
        prev.map((row: PlannedMeal) => (row.id === cookMeal.id ? { ...row, cookedAt } : row))
      );
      setCookMeal(null);
      setCookRecipe(null);
      setCookPlan(null);
      notify("Marked cooked, pantry updated.", "success");
    },
    [cookMeal, notify]
  );

  const handleUncook = useCallback(
    async (meal: PlannedMeal) => {
      await uncookMeal(meal);
      setMeals((prev: PlannedMeal[]) =>
        prev.map((row: PlannedMeal) => (row.id === meal.id ? { ...row, cookedAt: undefined } : row))
      );
      setRecentPlanned((prev: PlannedMeal[]) =>
        prev.map((row: PlannedMeal) => (row.id === meal.id ? { ...row, cookedAt: undefined } : row))
      );
      notify("Marked not cooked (pantry was not restored).", "info");
    },
    [notify]
  );

  const deleteSelectedMeals = useCallback(async () => {
    if (!selectedMealIds.length) return;
    const choice = await requestChoice({
      title: "Delete Selected Meals?",
      message: "This will remove the selected meals.",
      detail: `${selectedMealIds.length} meals are selected.`,
      choices: [
        { label: "Delete All", value: "confirm-delete", tone: "danger" },
        { label: "Cancel", value: "cancel", tone: "neutral" }
      ]
    });
    if (choice !== "confirm-delete") return;
    await deleteMealsBatch(selectedMealIds);
    clearSelectState();
  }, [clearSelectState, deleteMealsBatch, requestChoice, selectedMealIds]);

  const copySelectedMeals = useCallback(() => {
    if (!selectedMeals.length) return;
    setPendingPasteMeals(selectedMeals);
    notify("Select a target day and slot to paste.", "info");
  }, [notify, selectedMeals]);

  const pasteSelectedMeals = useCallback(
    async (targetDate: string, targetSlotId: string) => {
      if (!selectMode || !pendingPasteMeals.length) return;
      const errors: string[] = [];
      let contextMeals = [...meals, ...recentPlanned];
      for (const meal of pendingPasteMeals) {
        const result = await cloneMealWithRules({
          meal,
          targetDate,
          targetMealSlotId: targetSlotId,
          householdSize,
          currentMeals: contextMeals
        });
        if (result.sourceUpdate) {
          applySourceUpdate(result.sourceUpdate);
          contextMeals = contextMeals.map((row) =>
            row.id === result.sourceUpdate?.mealId
              ? { ...row, leftoverServingsRemaining: result.sourceUpdate.leftoverServingsRemaining }
              : row
          );
        }
        if (result.created) contextMeals = [...contextMeals, result.created];
        if (result.error) errors.push(result.error);
      }
      clearSelectState();
      await refreshMeals();
      await refreshRecentMeals();
      if (errors.length) notify(errors.join(" "), "error");
    },
    [applySourceUpdate, clearSelectState, householdSize, meals, notify, pendingPasteMeals, recentPlanned, refreshMeals, refreshRecentMeals, selectMode]
  );

  const deleteDayMeals = useCallback(async () => {
    if (!dayActionDate) return;
    const ids = meals.filter((meal) => meal.date === dayActionDate).map((meal) => meal.id);
    if (!ids.length) return;
    const choice = await requestChoice({
      title: "Delete Meals for This Day?",
      message: "This will remove all meals planned for this day.",
      detail: `${ids.length} meals are planned for ${formatDateLabel(dayActionDate)}.`,
      choices: [
        { label: "Delete All", value: "confirm-delete", tone: "danger" },
        { label: "Cancel", value: "cancel", tone: "neutral" }
      ]
    });
    if (choice !== "confirm-delete") return;
    await deleteMealsBatch(ids);
    clearSelectState();
  }, [clearSelectState, dayActionDate, deleteMealsBatch, meals, requestChoice]);

  const copyWeek = useCallback(
    async (sourceOffsetDays: number, targetOffsetDays: number) => {
      const currentRange = weekRange(anchorDate);
      const sourceStart = addDays(parseISODate(currentRange.start), sourceOffsetDays);
      const sourceEnd = addDays(parseISODate(currentRange.end), sourceOffsetDays);
      const sourceMeals = await listPlannedMeals(dateKey(sourceStart), dateKey(sourceEnd));
      const count = sourceMeals.length;
      if (!count) {
        notify("No meals to copy in the source week.", "info");
        return;
      }
      const choice = await requestChoice({
        title: "Copy Week?",
        message: `Copy ${count} meals?`,
        choices: [
          { label: "Copy", value: "copy", tone: "primary" },
          { label: "Cancel", value: "cancel", tone: "neutral" }
        ]
      });
      if (choice !== "copy") return;
      const errors: string[] = [];
      let contextMeals = [...meals, ...recentPlanned];
      for (const meal of sourceMeals) {
        const result = await cloneMealWithRules({
          meal,
          targetDate: dateKey(addDays(parseISODate(meal.date), targetOffsetDays - sourceOffsetDays)),
          targetMealSlotId: meal.mealSlotId,
          householdSize,
          currentMeals: contextMeals
        });
        if (result.sourceUpdate) {
          applySourceUpdate(result.sourceUpdate);
          contextMeals = contextMeals.map((row) =>
            row.id === result.sourceUpdate?.mealId
              ? { ...row, leftoverServingsRemaining: result.sourceUpdate.leftoverServingsRemaining }
              : row
          );
        }
        if (result.created) contextMeals = [...contextMeals, result.created];
        if (result.error) errors.push(result.error);
      }
      await refreshMeals();
      await refreshRecentMeals();
      if (errors.length) notify(errors.join(" "), "error");
    },
    [anchorDate, applySourceUpdate, householdSize, meals, notify, recentPlanned, refreshMeals, refreshRecentMeals, requestChoice]
  );

  const range = view === "week" ? weekRange(anchorDate) : monthRange(anchorDate);
  const printRange = useMemo(() => weekRange(anchorDate), [anchorDate]);
  const days = useMemo(() => {
    const list: string[] = [];
    let d = parseISODate(range.start);
    while (dateKey(d) <= dateKey(range.end)) {
      list.push(dateKey(d));
      d = addDays(d, 1);
    }
    return list;
  }, [range.start, range.end]);

  const printDays = useMemo(() => {
    const list: string[] = [];
    let d = parseISODate(printRange.start);
    while (dateKey(d) <= dateKey(printRange.end)) {
      list.push(dateKey(d));
      d = addDays(d, 1);
    }
    return list;
  }, [printRange.end, printRange.start]);

  useEffect(() => {
    if (!days.length) return;
    if (!dayActionDate || !days.includes(dayActionDate)) {
      setDayActionDate(days[0]);
    }
  }, [dayActionDate, days]);

  useEffect(() => {
    return () => {
      if (undoMoveTimerRef.current) {
        window.clearTimeout(undoMoveTimerRef.current);
      }
    };
  }, []);

  const mealsById = useMemo(() => {
    const map = new Map<string, PlannedMeal>();
    meals.forEach((meal) => map.set(meal.id, meal));
    return map;
  }, [meals]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (DEBUG_DND) {
        console.log("[DND] end", {
          selectMode,
          active: event.active?.id,
          over: event.over?.id
        });
      }
      if (selectMode) return;
      const { active, over } = event;
      if (!over) return;
      const overId = String(over.id);
      if (!overId.startsWith("cell:")) return;
      const [, day, slotId] = overId.split(":");
      if (!day || !slotId) return;

      const activeId = String(active.id);
      if (activeId.startsWith("meal:")) {
        const mealId = activeId.slice(5);
        const meal = mealsById.get(mealId);
        if (!meal) return;
        if (meal.date === day && meal.mealSlotId === slotId) return;
        const fromDate = meal.date;
        const fromMealSlotId = meal.mealSlotId;
        await updatePlannedMeal(meal.id, { date: day, mealSlotId: slotId });
        setMeals((prev: PlannedMeal[]) =>
          prev.map((m: PlannedMeal) => (m.id === meal.id ? { ...m, date: day, mealSlotId: slotId } : m))
        );
        if (undoMoveTimerRef.current) window.clearTimeout(undoMoveTimerRef.current);
        setLastDragMove({
          mealId: meal.id,
          fromDate,
          fromMealSlotId,
          toDate: day,
          toMealSlotId: slotId
        });
        undoMoveTimerRef.current = window.setTimeout(() => {
          setLastDragMove(null);
          undoMoveTimerRef.current = null;
        }, 5000);
        return;
      }

      if (activeId.startsWith("leftover:")) {
        const sourceId = activeId.slice(9);
        const source = mealsById.get(sourceId);
        if (!source) return;
        const remaining = getEffectiveLeftoverRemaining(source, householdSize);
        if (remaining <= 0) {
          notify("No leftovers remaining", "info");
          return;
        }
        await createMealAndRefresh(
          buildLeftoverMealInput({
            date: day,
            mealSlotId: slotId,
            sourceMeal: source,
            servingsUsed: 1
          })
        );
      }
    },
    [DEBUG_DND, createMealAndRefresh, householdSize, mealsById, notify, selectMode]
  );

  const inlineOverlay =
    activeSlot
      ? createPortal(
          <div className="planner-overlay-root">
            <InlineAddPanel
              recipes={recipes}
              slots={slots}
              recentPlanned={recentPlanned}
              currentMeals={meals}
              inlineType={inlineType}
              setInlineType={setInlineType}
              inlineRecipeId={inlineRecipeId}
              setInlineRecipeId={setInlineRecipeId}
              inlineServings={inlineServings}
              setInlineServings={setInlineServings}
              householdSize={householdSize}
              inlineLeftoverSource={inlineLeftoverSource}
              setInlineLeftoverSource={setInlineLeftoverSource}
              inlineLeftoverServingsUsed={inlineLeftoverServingsUsed}
              setInlineLeftoverServingsUsed={setInlineLeftoverServingsUsed}
              includeAnyRecent={includeAnyRecent}
              setIncludeAnyRecent={setIncludeAnyRecent}
              inlineFreeformTitle={inlineFreeformTitle}
              setInlineFreeformTitle={setInlineFreeformTitle}
              inlineNotes={inlineNotes}
              setInlineNotes={setInlineNotes}
              recipeSearch={recipeSearch}
              setRecipeSearch={setRecipeSearch}
              panelRef={panelRef}
              panelStyle={panelStyle}
              onCancel={() => closePanel("inline-cancel")}
              onSave={async () => {
                const payload = buildInlinePayload();
                if (!payload) return;
                const created = await createMealAndRefresh(payload);
                if (!created) return;
                resetInline();
                closePanel("inline-save");
              }}
            />
          </div>,
          document.body
        )
      : null;

  return (
    <div className="grid">
      <section className="panel no-print">
        <div className="row">
          <button className="secondary" onClick={() => navigate(-1)} aria-label="Previous">
            &lt;
          </button>
          <button className="secondary" onClick={() => navigate(1)} aria-label="Next">
            &gt;
          </button>
          <button className="secondary" onClick={goToday}>
            Today
          </button>
          <strong>{headerLabel}</strong>
          <button className={view === "week" ? "" : "secondary"} onClick={() => setView("week")}>
            Week
          </button>
          <button className={view === "month" ? "" : "secondary"} onClick={() => setView("month")}>
            Month
          </button>
          <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
          <button className="secondary" onClick={() => setShowTemplates((prev) => !prev)}>
            Templates
          </button>
          <button className="secondary no-print" onClick={() => window.print()}>
            Print Planner
          </button>
          {view === "week" && (
            <button className={selectMode ? "" : "secondary"} onClick={() => {
              const next = !selectMode;
              setSelectMode(next);
              clearSelectState();
            }}>
              Select mode
            </button>
          )}
          {view === "week" && (
            <>
              <button className="secondary" onClick={() => copyWeek(-7, 0)}>
                Copy last week {"->"} this week
              </button>
              <button className="secondary" onClick={() => copyWeek(0, 7)}>
                Copy this week {"->"} next week
              </button>
            </>
          )}
        </div>
        {showTemplates && (
          <div className="panel" style={{ marginTop: 12 }}>
            <h3>Weekly Templates ({visibleTemplateList.length})</h3>
            <div className="row">
              <input
                placeholder="Template name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <select value={templateLocationId} onChange={(e) => setTemplateLocationId(e.target.value)}>
                <option value="">No location</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
              <button onClick={() => void saveWeekTemplate()}>Create from current week</button>
            </div>
            <div className="row">
              <label>
                <input
                  type="radio"
                  name="templateFilter"
                  checked={templateFilter === "all"}
                  onChange={() => setTemplateFilter("all")}
                />
                All
              </label>
              <label>
                <input
                  type="radio"
                  name="templateFilter"
                  checked={templateFilter === "this"}
                  onChange={() => setTemplateFilter("this")}
                />
                This location
              </label>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Location</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleTemplateList.map((template) => (
                  <tr key={template.id}>
                    <td>{template.name}</td>
                    <td>{locations.find((loc) => loc.id === template.locationId)?.name || "No location"}</td>
                    <td className="row">
                      <button className="secondary" onClick={() => void applyTemplate(template)}>
                        Apply
                      </button>
                      <button className="danger" onClick={() => void deleteTemplate(template.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {!visibleTemplateList.length && (
                  <tr>
                    <td colSpan={3} className="muted">
                      No templates.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {view === "week" && selectMode && (
          <div className="row" style={{ marginTop: 12 }}>
            <span className="muted">{selectedMealIds.length} selected</span>
            <button className="danger" onClick={() => void deleteSelectedMeals()} disabled={!selectedMealIds.length}>
              Delete selected
            </button>
            <button className="secondary" onClick={copySelectedMeals} disabled={!selectedMealIds.length}>
              Copy selected
            </button>
            <select value={dayActionDate} onChange={(e) => setDayActionDate(e.target.value)}>
              {days.map((day) => (
                <option key={day} value={day}>
                  {formatWeekdayLabel(day)}
                </option>
              ))}
            </select>
            <button className="danger" onClick={() => void deleteDayMeals()}>
              Delete day
            </button>
            {pendingPasteMeals.length > 0 && (
              <span className="muted">Click a day+slot cell to paste {pendingPasteMeals.length} meals</span>
            )}
            <span className="muted">Select mode ON: drag disabled</span>
          </div>
        )}
      </section>

      <ExpiringSoon locationId={plannerLocationId || undefined} />

      <section className="panel planner-screen-view">
        <h2>{view === "week" ? "Week" : "Month"} view</h2>
        <div className="grid planner-week-shell">
          {view === "week" ? (
            <DndContext onDragEnd={handleDragEnd} sensors={sensors} collisionDetection={closestCenter}>
              {!isMobileLayout ? (
                <div className="planner-week-grid">
                  <table className="table planner-week-table">
                    <thead>
                      <tr>
                        <th className="planner-slot-column">Slot</th>
                        {days.map((day) => (
                          <th key={day}>
                            <div className="day-header">
                              <span className="day-label">{formatWeekdayLabel(day)}</span>
                              {selectMode && (
                                <button className="secondary day-action" onClick={() => toggleSelectAllForDay(day)}>
                                  Select all
                                </button>
                              )}
                              {copySourceDay === day ? (
                                <button className="secondary day-action" onClick={() => setCopySourceDay(null)} disabled>
                                  Copied
                                </button>
                              ) : copySourceDay ? (
                                <button className="secondary day-action" onClick={() => copyMealsForDay(copySourceDay, day)}>
                                  Paste
                                </button>
                              ) : (
                                <button className="secondary day-action" onClick={() => setCopySourceDay(day)}>
                                  Copy
                                </button>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {slots.map((slot) => (
                        <tr key={slot.id}>
                          <td className="planner-slot-column">{slot.name}</td>
                          {days.map((day) => (
                            <WeekCell
                              key={`${day}-${slot.id}`}
                              day={day}
                              slotId={slot.id}
                              meals={meals.filter((meal) => meal.mealSlotId === slot.id && meal.date === day)}
                              recipes={recipes}
                              allMealsMap={mealsById}
                              slots={slots}
                              householdSize={householdSize}
                              onRemove={removeMeal}
                              onSetLeftovers={async (meal) => {
                                setServingsEditMealId(null);
                                setLeftoverEditMealId(meal.id);
                                setLeftoverEditValue(getEffectiveLeftoverRemaining(meal, householdSize));
                              }}
                              onSetServings={(meal) => {
                                setLeftoverEditMealId(null);
                                setServingsEditMealId(meal.id);
                                setServingsEditValue(meal.servingsPlanned ?? householdSize);
                              }}
                              onAdd={(anchorEl) => openInlineAdd({ date: day, mealSlotId: slot.id }, anchorEl)}
                              onCook={openCookModal}
                              onUncook={handleUncook}
                              editingMealId={leftoverEditMealId}
                              editValue={leftoverEditValue}
                              onEditValue={setLeftoverEditValue}
                              onSaveEdit={async (mealId) => {
                                const value = Math.max(Number(leftoverEditValue || 0), 0);
                                await updatePlannedMeal(mealId, { leftoverServingsRemaining: value });
                                setMeals((prev: PlannedMeal[]) =>
                                  prev.map((m: PlannedMeal) =>
                                    m.id === mealId ? { ...m, leftoverServingsRemaining: value } : m
                                  )
                                );
                                setLeftoverEditMealId(null);
                              }}
                              onCancelEdit={() => setLeftoverEditMealId(null)}
                              servingsEditingMealId={servingsEditMealId}
                              servingsEditValue={servingsEditValue}
                              onServingsEditValue={setServingsEditValue}
                              onSaveServingsEdit={async (mealId) => {
                                const meal = meals.find((row) => row.id === mealId);
                                if (!meal || meal.type !== "recipe") return;
                                const next = calculateRecipeMealLeftoverState({
                                  meal,
                                  meals,
                                  nextServingsPlanned: servingsEditValue,
                                  householdSize
                                });
                                if (next.overflowServings > 0) {
                                  notify(`This meal already has ${next.allocatedLeftovers} leftover servings allocated. Remaining leftovers clamped to 0.`, "info");
                                }
                                await updatePlannedMeal(mealId, {
                                  servingsPlanned: next.servingsPlanned,
                                  leftoverServingsRemaining: next.leftoverServingsRemaining
                                });
                                setMeals((prev: PlannedMeal[]) =>
                                  prev.map((row: PlannedMeal) =>
                                    row.id === mealId
                                      ? {
                                          ...row,
                                          servingsPlanned: next.servingsPlanned,
                                          leftoverServingsRemaining: next.leftoverServingsRemaining
                                        }
                                      : row
                                  )
                                );
                                setRecentPlanned((prev: PlannedMeal[]) =>
                                  prev.map((row: PlannedMeal) =>
                                    row.id === mealId
                                      ? {
                                          ...row,
                                          servingsPlanned: next.servingsPlanned,
                                          leftoverServingsRemaining: next.leftoverServingsRemaining
                                        }
                                      : row
                                  )
                                );
                                setServingsEditMealId(null);
                              }}
                              onCancelServingsEdit={() => setServingsEditMealId(null)}
                              onActivateMeal={(mealId) => setActiveMealActionsId(mealId)}
                              activeMealId={activeMealActionsId}
                              onClearActions={() => setActiveMealActionsId(null)}
                              selectMode={selectMode}
                              selectedMealIds={selectedMealIds}
                              onToggleSelected={toggleMealSelected}
                              onCellClick={async (date, mealSlotId) => {
                                if (selectMode && pendingPasteMeals.length) {
                                  await pasteSelectedMeals(date, mealSlotId);
                                  return;
                                }
                              }}
                              inlinePanel={null}
                            />
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="planner-week-cards">
                  {days.map((day) => (
                    <div key={day} className="card">
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <strong>{formatWeekdayLabel(day)}</strong>
                        {selectMode && (
                          <button className="secondary" onClick={() => toggleSelectAllForDay(day)}>
                            Select all
                          </button>
                        )}
                        {copySourceDay === day ? (
                          <button className="secondary" onClick={() => setCopySourceDay(null)} disabled>
                            Copied
                          </button>
                        ) : copySourceDay ? (
                          <button className="secondary" onClick={() => copyMealsForDay(copySourceDay, day)}>
                            Paste
                          </button>
                        ) : (
                          <button className="secondary" onClick={() => setCopySourceDay(day)}>
                            Copy
                          </button>
                        )}
                      </div>
                      {slots.map((slot) => (
                        <WeekSlotCard
                          key={`${day}-${slot.id}`}
                          day={day}
                          slotId={slot.id}
                          slotName={slot.name}
                          meals={meals.filter((meal) => meal.mealSlotId === slot.id && meal.date === day)}
                          recipes={recipes}
                          allMealsMap={mealsById}
                          slots={slots}
                          householdSize={householdSize}
                          onRemove={removeMeal}
                          onSetLeftovers={async (meal) => {
                            setServingsEditMealId(null);
                            setLeftoverEditMealId(meal.id);
                            setLeftoverEditValue(getEffectiveLeftoverRemaining(meal, householdSize));
                          }}
                          onSetServings={(meal) => {
                            setLeftoverEditMealId(null);
                            setServingsEditMealId(meal.id);
                            setServingsEditValue(meal.servingsPlanned ?? householdSize);
                          }}
                          onAdd={(anchorEl) => openInlineAdd({ date: day, mealSlotId: slot.id }, anchorEl)}
                          onCook={openCookModal}
                          onUncook={handleUncook}
                          editingMealId={leftoverEditMealId}
                          editValue={leftoverEditValue}
                          onEditValue={setLeftoverEditValue}
                          onSaveEdit={async (mealId) => {
                            const value = Math.max(Number(leftoverEditValue || 0), 0);
                            await updatePlannedMeal(mealId, { leftoverServingsRemaining: value });
                            setMeals((prev: PlannedMeal[]) =>
                              prev.map((m: PlannedMeal) =>
                                m.id === mealId ? { ...m, leftoverServingsRemaining: value } : m
                              )
                            );
                            setLeftoverEditMealId(null);
                          }}
                          onCancelEdit={() => setLeftoverEditMealId(null)}
                          servingsEditingMealId={servingsEditMealId}
                          servingsEditValue={servingsEditValue}
                          onServingsEditValue={setServingsEditValue}
                          onSaveServingsEdit={async (mealId) => {
                            const meal = meals.find((row) => row.id === mealId);
                            if (!meal || meal.type !== "recipe") return;
                            const next = calculateRecipeMealLeftoverState({
                              meal,
                              meals,
                              nextServingsPlanned: servingsEditValue,
                              householdSize
                            });
                            if (next.overflowServings > 0) {
                              notify(`This meal already has ${next.allocatedLeftovers} leftover servings allocated. Remaining leftovers clamped to 0.`, "info");
                            }
                            await updatePlannedMeal(mealId, {
                              servingsPlanned: next.servingsPlanned,
                              leftoverServingsRemaining: next.leftoverServingsRemaining
                            });
                            setMeals((prev: PlannedMeal[]) =>
                              prev.map((row: PlannedMeal) =>
                                row.id === mealId
                                  ? {
                                      ...row,
                                      servingsPlanned: next.servingsPlanned,
                                      leftoverServingsRemaining: next.leftoverServingsRemaining
                                    }
                                  : row
                              )
                            );
                            setRecentPlanned((prev: PlannedMeal[]) =>
                              prev.map((row: PlannedMeal) =>
                                row.id === mealId
                                  ? {
                                      ...row,
                                      servingsPlanned: next.servingsPlanned,
                                      leftoverServingsRemaining: next.leftoverServingsRemaining
                                    }
                                  : row
                              )
                            );
                            setServingsEditMealId(null);
                          }}
                          onCancelServingsEdit={() => setServingsEditMealId(null)}
                          onActivateMeal={(mealId) => setActiveMealActionsId(mealId)}
                          activeMealId={activeMealActionsId}
                          onClearActions={() => setActiveMealActionsId(null)}
                          selectMode={selectMode}
                          selectedMealIds={selectedMealIds}
                          onToggleSelected={toggleMealSelected}
                          onCellClick={async (date, mealSlotId) => {
                            if (selectMode && pendingPasteMeals.length) {
                              await pasteSelectedMeals(date, mealSlotId);
                              return;
                            }
                          }}
                          inlinePanel={null}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </DndContext>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
              {days.map((day) => (
                <div key={day} className="panel" style={{ minHeight: 90 }}>
                  <strong>{formatDateLabel(day)}</strong>
                  {slots.map((slot) => (
                    <div key={slot.id}>
                      <strong>{slot.name}</strong>
                      {meals
                        .filter((meal) => meal.date === day && meal.mealSlotId === slot.id)
                        .map((meal) => (
                          <div key={meal.id}>
                            <MealLabel meal={meal} recipes={recipes} householdSize={householdSize} />
                            <button className="danger" onClick={() => removeMeal(meal.id)}>x</button>
                          </div>
                        ))}
                      {meals.filter((meal) => meal.date === day && meal.mealSlotId === slot.id).length === 0 && (
                        <button
                          className="ghost"
                          type="button"
                          onClick={(e) => void openInlineAdd({ date: day, mealSlotId: slot.id }, e.currentTarget)}
                        >
                          Add
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel print-only planner-print">
        <h2>Planner Week</h2>
        <p className="muted">
          {printDays.length ? `${formatWeekdayLabel(printDays[0])} - ${formatWeekdayLabel(printDays[printDays.length - 1])}` : headerLabel}
        </p>
        <table className="table planner-print-table">
          <thead>
            <tr>
              <th>Slot</th>
              {printDays.map((day) => (
                <th key={`print-${day}`}>{formatWeekdayLabel(day)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={`print-slot-${slot.id}`}>
                <td>{slot.name}</td>
                {printDays.map((day) => {
                  const slotMeals = meals.filter((meal) => meal.mealSlotId === slot.id && meal.date === day);
                  return (
                    <td key={`print-${day}-${slot.id}`}>
                      {slotMeals.length === 0 ? (
                        <span className="muted">-</span>
                      ) : (
                        <div className="planner-print-meals">
                          {slotMeals.map((meal) => (
                            <div key={`print-meal-${meal.id}`} className="planner-print-meal">
                              <MealLabel meal={meal} recipes={recipes} householdSize={householdSize} />
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {inlineOverlay}
      {lastDragMove && (
        <div
          className="panel"
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            zIndex: 50,
            display: "flex",
            gap: 12,
            alignItems: "center",
            padding: "10px 12px"
          }}
        >
          <span className="muted">Meal moved</span>
          <button
            className="secondary"
            onClick={async () => {
              const move = lastDragMove;
              if (!move) return;
              await updatePlannedMeal(move.mealId, {
                date: move.fromDate,
                mealSlotId: move.fromMealSlotId
              });
              setMeals((prev: PlannedMeal[]) =>
                prev.map((m: PlannedMeal) =>
                  m.id === move.mealId ? { ...m, date: move.fromDate, mealSlotId: move.fromMealSlotId } : m
                )
              );
              if (undoMoveTimerRef.current) window.clearTimeout(undoMoveTimerRef.current);
              undoMoveTimerRef.current = null;
              setLastDragMove(null);
            }}
          >
            Undo move
          </button>
        </div>
      )}
      {cookMeal && cookPlan && (
        <CookMealModal
          open
          meal={cookMeal}
          recipe={cookRecipe || undefined}
          servings={cookServings}
          initialPlan={cookPlan}
          onCancel={() => {
            setCookMeal(null);
            setCookRecipe(null);
            setCookPlan(null);
          }}
          onConfirm={handleCookConfirm}
        />
      )}
      {modal}
      {toast}
    </div>
  );
}


