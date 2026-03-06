import { RefObject, type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createPortal } from "react-dom";
import { LocationProfile, MealSlot, PlannedMeal, Recipe, WeekTemplate } from "../../models";
import {
  listMealSlots,
  listPlannedMeals,
  updatePlannedMeal
} from "../../db/repositories/mealPlanRepo";
import { listRecipes } from "../../db/repositories/recipeRepo";
import { formatDateLabel, parseISODate, addDays, dateKey } from "../../utils/date";
import { Link } from "react-router-dom";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
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
  defaultRecipeServings,
  deleteMealWithRules,
  getEffectiveLeftoverRemaining,
  listAvailableLeftoverMeals
} from "./plannerDomain";

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
  const [topFormDate, setTopFormDate] = useState(anchorDate);
  const [topFormMealSlotId, setTopFormMealSlotId] = useState("");
  const [topFormType, setTopFormType] = useState<PlannedMeal["type"]>("recipe");
  const [topFormRecipeId, setTopFormRecipeId] = useState("");
  const [topFormServings, setTopFormServings] = useState(String(householdSize));
  const [topFormLeftoverSource, setTopFormLeftoverSource] = useState("");
  const [topFormLeftoverServingsUsed, setTopFormLeftoverServingsUsed] = useState("1");
  const [topFormIncludeAnyRecent, setTopFormIncludeAnyRecent] = useState(false);
  const [topFormFreeformTitle, setTopFormFreeformTitle] = useState("");
  const [topFormNotes, setTopFormNotes] = useState("");
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
  const [plannerLocationId, setPlannerLocationId] = useState("");
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
  const isMobileLayout = useMediaQuery("(max-width: 768px)");
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 }
    })
  );

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

  useEffect(() => {
    setTopFormDate((prev) => prev || anchorDate);
  }, [anchorDate]);

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
        alert(result.error);
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

  async function addMeal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let payload: Omit<PlannedMeal, "id" | "createdAt" | "updatedAt"> | null = null;
    if (topFormType === "recipe") {
      const recipe = recipes.find((row) => row.id === topFormRecipeId);
      if (!recipe) return;
      payload = buildRecipeMealInput({
        date: topFormDate,
        mealSlotId: topFormMealSlotId,
        recipe,
        servingsPlanned: Number(topFormServings || householdSize),
        householdSize,
        notes: topFormNotes
      });
    } else if (topFormType === "leftover") {
      const servingsUsed = Math.max(Number(topFormLeftoverServingsUsed || 1), 1);
      if (topFormLeftoverSource.startsWith("meal:")) {
        const sourceMeal = combinedLeftoverSourceMeals.find((meal) => meal.id === topFormLeftoverSource.slice(5));
        if (!sourceMeal) return;
        payload = buildLeftoverMealInput({
          date: topFormDate,
          mealSlotId: topFormMealSlotId,
          sourceMeal,
          servingsUsed,
          notes: topFormNotes
        });
      } else if (topFormLeftoverSource.startsWith("recipe:")) {
        const sourceRecipe = recipes.find((row) => row.id === topFormLeftoverSource.slice(7));
        payload = buildLeftoverMealInput({
          date: topFormDate,
          mealSlotId: topFormMealSlotId,
          servingsUsed,
          notes: topFormNotes,
          freeformTitle: sourceRecipe?.title || "Leftover"
        });
      }
    } else if (topFormFreeformTitle.trim()) {
      payload = buildFreeformMealInput({
        date: topFormDate,
        mealSlotId: topFormMealSlotId,
        freeformTitle: topFormFreeformTitle,
        notes: topFormNotes
      });
    }
    if (!payload) return;
    const created = await createMealAndRefresh(payload);
    if (!created) return;
    setTopFormType("recipe");
    setTopFormRecipeId("");
    setTopFormServings(String(householdSize));
    setTopFormLeftoverSource("");
    setTopFormLeftoverServingsUsed("1");
    setTopFormIncludeAnyRecent(false);
    setTopFormFreeformTitle("");
    setTopFormNotes("");
  }

  async function removeMeal(id: string) {
    if (!confirm("Delete this planned meal?")) return;
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
      setActiveSlot(slot);
      setPanelAnchorEl(anchorEl ?? null);
      setPanelStyle(null);
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
      if (!panelRef.current) return;
      const anchorRect = panelAnchorEl.getBoundingClientRect();
      const panelWidth = panelRef.current.offsetWidth || 360;
      const panelHeight = panelRef.current.offsetHeight || 320;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 12;
      const gap = 8;

      let left = anchorRect.left;
      if (left + panelWidth > viewportWidth - margin) {
        left = Math.max(margin, anchorRect.right - panelWidth);
      }
      left = Math.min(Math.max(left, margin), Math.max(margin, viewportWidth - panelWidth - margin));

      let top = anchorRect.bottom + gap;
      if (top + panelHeight > viewportHeight - margin) {
        top = Math.max(margin, anchorRect.top - panelHeight - gap);
      }
      top = Math.min(Math.max(top, margin), Math.max(margin, viewportHeight - panelHeight - margin));

      setPanelStyle({
        position: "fixed",
        top,
        left,
        width: Math.min(380, viewportWidth - margin * 2),
        maxHeight: viewportHeight - margin * 2,
        overflowY: "auto"
      });
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

  const topFormLeftoverMeals = useMemo(
    () => listAvailableLeftoverMeals(combinedLeftoverSourceMeals, householdSize, { includeAnyRecent: topFormIncludeAnyRecent }),
    [combinedLeftoverSourceMeals, householdSize, topFormIncludeAnyRecent]
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
      if (!confirm(`Apply template "${template.name}" to this week and overwrite existing meals?`)) return;
      await applyWeekTemplateToWeek(template, week.start, week.end);
      await refreshMeals();
      setShowTemplates(false);
    },
    [anchorDate, refreshMeals]
  );

  const clearSelectState = useCallback(() => {
    setPendingPasteMeals([]);
    setSelectedMealIds([]);
  }, []);

  const deleteTemplate = useCallback(
    async (id: string) => {
      if (!confirm("Delete this template?")) return;
      await deleteWeekTemplate(id);
      await refreshTemplates();
    },
    [refreshTemplates]
  );

  const copyMealsForDay = useCallback(
    async (sourceDate: string, targetDate: string) => {
      const sourceMeals = meals.filter((meal) => meal.date === sourceDate);
      if (!sourceMeals.length) {
        alert("No meals to copy from that day.");
        return;
      }
      if (!confirm(`Copy ${sourceMeals.length} meals to ${formatDateLabel(targetDate)}?`)) return;
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
      if (errors.length) alert(errors.join("\n"));
    },
    [applySourceUpdate, householdSize, meals, recentPlanned, refreshMeals, refreshRecentMeals]
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

  const deleteSelectedMeals = useCallback(async () => {
    if (!selectedMealIds.length) return;
    if (!confirm(`Delete ${selectedMealIds.length} selected meals?`)) return;
    await deleteMealsBatch(selectedMealIds);
    clearSelectState();
  }, [clearSelectState, deleteMealsBatch, selectedMealIds]);

  const copySelectedMeals = useCallback(() => {
    if (!selectedMeals.length) return;
    setPendingPasteMeals(selectedMeals);
    alert("Select a target day and slot to paste.");
  }, [selectedMeals]);

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
      if (errors.length) alert(errors.join("\n"));
    },
    [applySourceUpdate, clearSelectState, householdSize, meals, pendingPasteMeals, recentPlanned, refreshMeals, refreshRecentMeals, selectMode]
  );

  const deleteDayMeals = useCallback(async () => {
    if (!dayActionDate) return;
    const ids = meals.filter((meal) => meal.date === dayActionDate).map((meal) => meal.id);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} meals for ${formatDateLabel(dayActionDate)}?`)) return;
    await deleteMealsBatch(ids);
    clearSelectState();
  }, [clearSelectState, dayActionDate, deleteMealsBatch, meals]);

  const copyWeek = useCallback(
    async (sourceOffsetDays: number, targetOffsetDays: number) => {
      const currentRange = weekRange(anchorDate);
      const sourceStart = addDays(parseISODate(currentRange.start), sourceOffsetDays);
      const sourceEnd = addDays(parseISODate(currentRange.end), sourceOffsetDays);
      const sourceMeals = await listPlannedMeals(dateKey(sourceStart), dateKey(sourceEnd));
      const count = sourceMeals.length;
      if (!count) {
        alert("No meals to copy in the source week.");
        return;
      }
      if (!confirm(`Copy ${count} meals?`)) return;
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
      if (errors.length) alert(errors.join("\n"));
    },
    [anchorDate, applySourceUpdate, householdSize, meals, recentPlanned, refreshMeals, refreshRecentMeals]
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

  const recipeTitle = useCallback(
    (recipeId?: string) => recipes.find((recipe) => recipe.id === recipeId)?.title || "Recipe",
    [recipes]
  );

  const slotLabel = useCallback(
    (mealSlotId?: string) => slots.find((slot) => slot.id === mealSlotId)?.name || "Slot",
    [slots]
  );

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
          alert("No leftovers remaining");
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
    [DEBUG_DND, createMealAndRefresh, householdSize, mealsById, selectMode]
  );

  const inlineOverlay =
    activeSlot && panelStyle
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
          <select value={plannerLocationId} onChange={(e) => setPlannerLocationId(e.target.value)}>
            <option value="">No location</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
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
                                  alert(`This meal already has ${next.allocatedLeftovers} leftover servings allocated. Remaining leftovers were clamped to 0.`);
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
                              alert(`This meal already has ${next.allocatedLeftovers} leftover servings allocated. Remaining leftovers were clamped to 0.`);
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
                          onClick={(e) => openInlineAdd({ date: day, mealSlotId: slot.id }, e.currentTarget)}
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

      <section className="panel no-print">
        <h3>Add planned meal</h3>
        <form className="grid" onSubmit={addMeal}>
          <div className="row">
            <input type="date" value={topFormDate} onChange={(e) => setTopFormDate(e.target.value)} required />
            <select value={topFormMealSlotId} onChange={(e) => setTopFormMealSlotId(e.target.value)} required>
              <option value="" disabled>Select slot</option>
              {slots.map((slot) => (
                <option key={slot.id} value={slot.id}>{slot.name}</option>
              ))}
            </select>
            <select value={topFormType} onChange={(e) => setTopFormType(e.target.value as PlannedMeal["type"])}>
              <option value="recipe">Recipe</option>
              <option value="leftover">Leftover</option>
              <option value="freeform">Freeform</option>
            </select>
          </div>
          {topFormType === "recipe" && (
            <>
              <div className="row">
                <select
                  value={topFormRecipeId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setTopFormRecipeId(nextId);
                    const selectedRecipe = recipes.find((recipe) => recipe.id === nextId);
                    setTopFormServings(String(defaultRecipeServings(selectedRecipe, householdSize)));
                  }}
                >
                  <option value="">Select recipe</option>
                  {recipes.map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>{recipe.title}</option>
                  ))}
                </select>
                <label className="field-stack">
                  <span>Servings planned</span>
                  <input
                    type="number"
                    min="1"
                    value={topFormServings}
                    onChange={(e) => setTopFormServings(e.target.value)}
                  />
                </label>
              </div>
              <p className="muted field-note">Ingredients scale by servingsPlanned / baseServings.</p>
            </>
          )}
          {topFormType === "leftover" && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={topFormIncludeAnyRecent}
                  onChange={(e) => setTopFormIncludeAnyRecent(e.target.checked)}
                />
                Any recent meal
              </label>
              <div className="row">
                <select value={topFormLeftoverSource} onChange={(e) => setTopFormLeftoverSource(e.target.value)}>
                  <option value="">Select source</option>
                  {topFormLeftoverMeals.map((meal) => (
                    <option key={meal.id} value={`meal:${meal.id}`}>
                      {recipeTitle(meal.recipeId)} | {meal.date} | {slotLabel(meal.mealSlotId)} | remaining {getEffectiveLeftoverRemaining(meal, householdSize)}
                    </option>
                  ))}
                  {recipes.map((recipe) => (
                    <option key={recipe.id} value={`recipe:${recipe.id}`}>
                      Recipe: {recipe.title}
                    </option>
                  ))}
                </select>
                <label className="field-stack">
                  <span>Servings used</span>
                  <input
                    type="number"
                    min="1"
                    value={topFormLeftoverServingsUsed}
                    onChange={(e) => setTopFormLeftoverServingsUsed(e.target.value)}
                  />
                </label>
              </div>
            </>
          )}
          {topFormType === "freeform" && (
            <input
              value={topFormFreeformTitle}
              onChange={(e) => setTopFormFreeformTitle(e.target.value)}
              placeholder="Freeform title"
            />
          )}
          <textarea value={topFormNotes} onChange={(e) => setTopFormNotes(e.target.value)} placeholder="Notes" />
          <button type="submit">Add</button>
        </form>
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
    </div>
  );
}

function InlineAddPanel({
  recipes,
  slots,
  recentPlanned,
  currentMeals,
  inlineType,
  setInlineType,
  inlineRecipeId,
  setInlineRecipeId,
  inlineServings,
  setInlineServings,
  householdSize,
  inlineLeftoverSource,
  setInlineLeftoverSource,
  inlineLeftoverServingsUsed,
  setInlineLeftoverServingsUsed,
  includeAnyRecent,
  setIncludeAnyRecent,
  inlineFreeformTitle,
  setInlineFreeformTitle,
  inlineNotes,
  setInlineNotes,
  recipeSearch,
  setRecipeSearch,
  panelRef,
  panelStyle,
  onSave,
  onCancel
}: {
  recipes: Recipe[];
  slots: MealSlot[];
  recentPlanned: PlannedMeal[];
  currentMeals: PlannedMeal[];
  inlineType: PlannedMeal["type"];
  setInlineType: (value: PlannedMeal["type"]) => void;
  inlineRecipeId: string;
  setInlineRecipeId: (value: string) => void;
  inlineServings: string;
  setInlineServings: (value: string) => void;
  householdSize: number;
  inlineLeftoverSource: string;
  setInlineLeftoverSource: (value: string) => void;
  inlineLeftoverServingsUsed: string;
  setInlineLeftoverServingsUsed: (value: string) => void;
  includeAnyRecent: boolean;
  setIncludeAnyRecent: (value: boolean) => void;
  inlineFreeformTitle: string;
  setInlineFreeformTitle: (value: string) => void;
  inlineNotes: string;
  setInlineNotes: (value: string) => void;
  recipeSearch: string;
  setRecipeSearch: (value: string) => void;
  panelRef: RefObject<HTMLDivElement>;
  panelStyle?: CSSProperties | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const filteredRecipes = recipes.filter((recipe) =>
    recipe.title.toLowerCase().includes(recipeSearch.trim().toLowerCase())
  );
  const mergedMeals = useMemo(() => {
    const map = new Map<string, PlannedMeal>();
    currentMeals.forEach((meal) => map.set(meal.id, meal));
    recentPlanned.forEach((meal) => {
      if (!map.has(meal.id)) map.set(meal.id, meal);
    });
    return Array.from(map.values());
  }, [currentMeals, recentPlanned]);
  const recentMealOptions = listAvailableLeftoverMeals(mergedMeals, householdSize, {
    includeAnyRecent
  });
  const recipeTitle = (recipeId?: string) => recipes.find((r) => r.id === recipeId)?.title || "Recipe";
  const slotLabel = (mealSlotId?: string) => slots.find((slot) => slot.id === mealSlotId)?.name || "Slot";
  const typeLabel = (type: PlannedMeal["type"]) =>
    type === "recipe" ? "Recipe" : type === "leftover" ? "Leftover" : "Freeform";
  const firstRecipeSearchRef = useRef<HTMLInputElement | null>(null);
  const firstFreeformRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inlineType === "recipe" && firstRecipeSearchRef.current) {
      firstRecipeSearchRef.current.focus();
    }
    if (inlineType === "freeform" && firstFreeformRef.current) {
      firstFreeformRef.current.focus();
    }
  }, [inlineType]);

  return (
    <div
      className="panel planner-inline-panel"
      ref={panelRef}
      style={panelStyle ?? undefined}
      data-planner-inline-panel="true"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <div className="row">
        <select value={inlineType} onChange={(e) => setInlineType(e.target.value as PlannedMeal["type"])}>
          <option value="recipe">Recipe</option>
          <option value="leftover">Leftover</option>
          <option value="freeform">Freeform</option>
        </select>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>

      {inlineType === "recipe" && (
        <>
          {recipes.length === 0 ? (
            <p>
              No recipes yet. <Link className="tag" to="/recipes">Go to Recipes</Link>
            </p>
          ) : (
            <>
              <input
                ref={firstRecipeSearchRef}
                placeholder="Search recipes"
                value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)}
              />
              <select
                value={inlineRecipeId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setInlineRecipeId(nextId);
                  if (!nextId) {
                    setInlineServings("");
                    return;
                  }
                  const selectedRecipe = recipes.find((recipe) => recipe.id === nextId);
                  setInlineServings(String(defaultRecipeServings(selectedRecipe, householdSize)));
                }}
              >
                <option value="">Select recipe</option>
                {filteredRecipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.title}
                  </option>
                ))}
              </select>
              <label className="field-stack">
                <span>Servings planned</span>
                <input
                  type="number"
                  min="1"
                  value={inlineServings}
                  onChange={(e) => setInlineServings(e.target.value)}
                />
              </label>
              <p className="muted field-note">Ingredients scale by servingsPlanned / baseServings.</p>
            </>
          )}
        </>
      )}

      {inlineType === "leftover" && (
        <>
          {recentMealOptions.length === 0 && recipes.length === 0 ? (
            <p>
              No recent meals or recipes yet. <Link className="tag" to="/recipes">Go to Recipes</Link>
            </p>
          ) : (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={includeAnyRecent}
                  onChange={(e) => setIncludeAnyRecent(e.target.checked)}
                />
                Any recent meal
              </label>
              <select value={inlineLeftoverSource} onChange={(e) => setInlineLeftoverSource(e.target.value)}>
                <option value="">Select source</option>
                {recentMealOptions.map((meal) => (
                  <option key={meal.id} value={`meal:${meal.id}`}>
                    {recipeTitle(meal.recipeId)} | {meal.date} | {slotLabel(meal.mealSlotId)} | {typeLabel(meal.type)} | remaining {getEffectiveLeftoverRemaining(meal, householdSize)}
                  </option>
                ))}
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={`recipe:${recipe.id}`}>
                    Recipe: {recipe.title}
                  </option>
                ))}
              </select>
              <label className="field-stack">
                <span>Servings used</span>
                <input
                  type="number"
                  min="1"
                  value={inlineLeftoverServingsUsed}
                  onChange={(e) => setInlineLeftoverServingsUsed(e.target.value)}
                />
              </label>
            </>
          )}
        </>
      )}

      {inlineType === "freeform" && (
        <>
          <input
            ref={firstFreeformRef}
            placeholder="Title"
            value={inlineFreeformTitle}
            onChange={(e) => setInlineFreeformTitle(e.target.value)}
          />
        </>
      )}

      <textarea placeholder="Notes" value={inlineNotes} onChange={(e) => setInlineNotes(e.target.value)} />
      <div className="row">
        <button onClick={onSave}>Save</button>
      </div>
    </div>
  );
}

function MealLabel({
  meal,
  recipes,
  householdSize = 1,
  showRemaining = true
}: {
  meal: PlannedMeal;
  recipes: Recipe[];
  householdSize?: number;
  showRemaining?: boolean;
}) {
  if (meal.type === "recipe") {
    const recipe = recipes.find((r) => r.id === meal.recipeId);
    const remaining = getEffectiveLeftoverRemaining(meal, householdSize);
    return (
      <span>
        {recipe?.title || "Recipe"}
        {showRemaining && typeof remaining === "number" && remaining > 0 ? ` (${remaining})` : ""}
      </span>
    );
  }
  if (meal.type === "leftover") {
    return <span>{meal.freeformTitle ? `Leftover: ${meal.freeformTitle}` : "Leftover"}</span>;
  }
  return <span>{meal.freeformTitle || "Freeform"}</span>;
}

function WeekCell({
  day,
  slotId,
  meals,
  recipes,
  allMealsMap,
  slots,
  householdSize,
  onRemove,
  onSetLeftovers,
  onSetServings,
  onAdd,
  editingMealId,
  editValue,
  onEditValue,
  onSaveEdit,
  onCancelEdit,
  servingsEditingMealId,
  servingsEditValue,
  onServingsEditValue,
  onSaveServingsEdit,
  onCancelServingsEdit,
  inlinePanel,
  onActivateMeal,
  activeMealId,
  onClearActions,
  selectMode,
  selectedMealIds,
  onToggleSelected,
  onCellClick
}: {
  day: string;
  slotId: string;
  meals: PlannedMeal[];
  recipes: Recipe[];
  allMealsMap: Map<string, PlannedMeal>;
  slots: MealSlot[];
  householdSize: number;
  onRemove: (id: string) => void | Promise<void>;
  onSetLeftovers: (meal: PlannedMeal) => void | Promise<void>;
  onSetServings: (meal: PlannedMeal) => void | Promise<void>;
  onAdd: (anchorEl: HTMLElement) => void | Promise<void>;
  editingMealId: string | null;
  editValue: number;
  onEditValue: (value: number) => void;
  onSaveEdit: (mealId: string) => void | Promise<void>;
  onCancelEdit: () => void;
  servingsEditingMealId: string | null;
  servingsEditValue: number;
  onServingsEditValue: (value: number) => void;
  onSaveServingsEdit: (mealId: string) => void | Promise<void>;
  onCancelServingsEdit: () => void;
  inlinePanel: ReactNode;
  onActivateMeal: (mealId: string) => void;
  activeMealId: string | null;
  onClearActions: () => void;
  selectMode: boolean;
  selectedMealIds: string[];
  onToggleSelected: (mealId: string) => void;
  onCellClick: (day: string, slotId: string) => void | Promise<void>;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `cell:${day}:${slotId}` });
  const recipeTitle = (recipeId?: string) => recipes.find((r) => r.id === recipeId)?.title || "Recipe";
  const slotLabel = (mealSlotId?: string) => slots.find((slot) => slot.id === mealSlotId)?.name || "Slot";

  const colorForMeal = (meal: PlannedMeal) => {
    let colorKey = meal.recipeId || meal.id;
    if (meal.type === "leftover") {
      const sourceId = meal.leftoverSourceMealId || meal.sourcePlannedMealId;
      const source = sourceId ? allMealsMap.get(sourceId) : undefined;
      colorKey = source?.recipeId || colorKey;
    }
    return colorFromId(colorKey);
  };

  const sourceInfo = (meal: PlannedMeal) => {
    if (meal.type !== "leftover") return "";
    const sourceId = meal.leftoverSourceMealId || meal.sourcePlannedMealId;
    const source = sourceId ? allMealsMap.get(sourceId) : undefined;
    if (!source) return "From: Unknown";
    return `From: ${recipeTitle(source.recipeId)} (${formatWeekdayLabel(source.date)} ${slotLabel(source.mealSlotId)})`;
  };

  const leftoverChipLabel = (meal: PlannedMeal) => {
    if (meal.type !== "leftover") return undefined;
    const sourceId = meal.leftoverSourceMealId || meal.sourcePlannedMealId;
    const source = sourceId ? allMealsMap.get(sourceId) : undefined;
    if (source?.recipeId) return `Leftover: ${recipeTitle(source.recipeId)}`;
    if (source?.freeformTitle) return `Leftover: ${source.freeformTitle}`;
    if (meal.freeformTitle) return `Leftover: ${meal.freeformTitle}`;
    return "Leftover";
  };

  return (
    <td
      ref={setNodeRef}
      style={{
        background: isOver ? "#dbeafe" : undefined,
        boxShadow: isOver ? "inset 0 0 0 2px #2563eb" : undefined,
        minHeight: 88,
        verticalAlign: "top"
      }}
      onClick={() => {
        onClearActions();
        void onCellClick(day, slotId);
      }}
    >
      {meals.map((meal) => (
        <DraggableMeal
          key={meal.id}
          meal={meal}
          recipes={recipes}
          householdSize={householdSize}
          color={colorForMeal(meal)}
          sourceInfo={sourceInfo(meal)}
          leftoverChipLabel={leftoverChipLabel(meal)}
          onRemove={onRemove}
          onSetLeftovers={onSetLeftovers}
          onSetServings={onSetServings}
          isEditing={editingMealId === meal.id}
          editValue={editValue}
          onEditValue={onEditValue}
          onSaveEdit={() => onSaveEdit(meal.id)}
          onCancelEdit={onCancelEdit}
          isServingsEditing={servingsEditingMealId === meal.id}
          servingsEditValue={servingsEditValue}
          onServingsEditValue={onServingsEditValue}
          onSaveServingsEdit={() => onSaveServingsEdit(meal.id)}
          onCancelServingsEdit={onCancelServingsEdit}
          onActivate={() => onActivateMeal(meal.id)}
          isActionsOpen={activeMealId === meal.id}
          selectMode={selectMode}
          selected={selectedMealIds.includes(meal.id)}
          onToggleSelected={() => onToggleSelected(meal.id)}
          dragDisabled={selectMode}
        />
      ))}
      {meals.length === 0 && (
        <button className="ghost" onClick={(e) => void onAdd(e.currentTarget)}>
          Add
        </button>
      )}
      {inlinePanel}
    </td>
  );
}

function WeekSlotCard({
  day,
  slotId,
  slotName,
  meals,
  recipes,
  allMealsMap,
  slots,
  householdSize,
  onRemove,
  onSetLeftovers,
  onSetServings,
  onAdd,
  editingMealId,
  editValue,
  onEditValue,
  onSaveEdit,
  onCancelEdit,
  servingsEditingMealId,
  servingsEditValue,
  onServingsEditValue,
  onSaveServingsEdit,
  onCancelServingsEdit,
  inlinePanel,
  onActivateMeal,
  activeMealId,
  onClearActions,
  selectMode,
  selectedMealIds,
  onToggleSelected,
  onCellClick
}: {
  day: string;
  slotId: string;
  slotName: string;
  meals: PlannedMeal[];
  recipes: Recipe[];
  allMealsMap: Map<string, PlannedMeal>;
  slots: MealSlot[];
  householdSize: number;
  onRemove: (id: string) => void | Promise<void>;
  onSetLeftovers: (meal: PlannedMeal) => void | Promise<void>;
  onSetServings: (meal: PlannedMeal) => void | Promise<void>;
  onAdd: (anchorEl: HTMLElement) => void | Promise<void>;
  editingMealId: string | null;
  editValue: number;
  onEditValue: (value: number) => void;
  onSaveEdit: (mealId: string) => void | Promise<void>;
  onCancelEdit: () => void;
  servingsEditingMealId: string | null;
  servingsEditValue: number;
  onServingsEditValue: (value: number) => void;
  onSaveServingsEdit: (mealId: string) => void | Promise<void>;
  onCancelServingsEdit: () => void;
  inlinePanel: ReactNode;
  onActivateMeal: (mealId: string) => void;
  activeMealId: string | null;
  onClearActions: () => void;
  selectMode: boolean;
  selectedMealIds: string[];
  onToggleSelected: (mealId: string) => void;
  onCellClick: (day: string, slotId: string) => void | Promise<void>;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `cell:${day}:${slotId}` });
  const recipeTitle = (recipeId?: string) => recipes.find((r) => r.id === recipeId)?.title || "Recipe";
  const slotLabel = (mealSlotId?: string) => slots.find((slot) => slot.id === mealSlotId)?.name || "Slot";

  const colorForMeal = (meal: PlannedMeal) => {
    let colorKey = meal.recipeId || meal.id;
    if (meal.type === "leftover") {
      const sourceId = meal.leftoverSourceMealId || meal.sourcePlannedMealId;
      const source = sourceId ? allMealsMap.get(sourceId) : undefined;
      colorKey = source?.recipeId || colorKey;
    }
    return colorFromId(colorKey);
  };

  const sourceInfo = (meal: PlannedMeal) => {
    if (meal.type !== "leftover") return "";
    const sourceId = meal.leftoverSourceMealId || meal.sourcePlannedMealId;
    const source = sourceId ? allMealsMap.get(sourceId) : undefined;
    if (!source) return "From: Unknown";
    return `From: ${recipeTitle(source.recipeId)} (${formatWeekdayLabel(source.date)} ${slotLabel(source.mealSlotId)})`;
  };

  const leftoverChipLabel = (meal: PlannedMeal) => {
    if (meal.type !== "leftover") return undefined;
    const sourceId = meal.leftoverSourceMealId || meal.sourcePlannedMealId;
    const source = sourceId ? allMealsMap.get(sourceId) : undefined;
    if (source?.recipeId) return `Leftover: ${recipeTitle(source.recipeId)}`;
    if (source?.freeformTitle) return `Leftover: ${source.freeformTitle}`;
    if (meal.freeformTitle) return `Leftover: ${meal.freeformTitle}`;
    return "Leftover";
  };

  return (
    <div
      ref={setNodeRef}
      className="card"
      style={{
        marginTop: 10,
        background: isOver ? "#dbeafe" : undefined,
        boxShadow: isOver ? "inset 0 0 0 2px #2563eb" : undefined,
        minHeight: 88
      }}
      onClick={() => {
        onClearActions();
        void onCellClick(day, slotId);
      }}
    >
      <strong>{slotName}</strong>
      {meals.map((meal) => (
        <DraggableMeal
          key={meal.id}
          meal={meal}
          recipes={recipes}
          householdSize={householdSize}
          color={colorForMeal(meal)}
          sourceInfo={sourceInfo(meal)}
          leftoverChipLabel={leftoverChipLabel(meal)}
          onRemove={onRemove}
          onSetLeftovers={onSetLeftovers}
          onSetServings={onSetServings}
          isEditing={editingMealId === meal.id}
          editValue={editValue}
          onEditValue={onEditValue}
          onSaveEdit={() => onSaveEdit(meal.id)}
          onCancelEdit={onCancelEdit}
          isServingsEditing={servingsEditingMealId === meal.id}
          servingsEditValue={servingsEditValue}
          onServingsEditValue={onServingsEditValue}
          onSaveServingsEdit={() => onSaveServingsEdit(meal.id)}
          onCancelServingsEdit={onCancelServingsEdit}
          onActivate={() => onActivateMeal(meal.id)}
          isActionsOpen={activeMealId === meal.id}
          selectMode={selectMode}
          selected={selectedMealIds.includes(meal.id)}
          onToggleSelected={() => onToggleSelected(meal.id)}
          dragDisabled={selectMode}
        />
      ))}
      {meals.length === 0 && (
        <button className="ghost" onClick={(e) => void onAdd(e.currentTarget)}>
          Add
        </button>
      )}
      {inlinePanel}
    </div>
  );
}

function DraggableMeal({
  meal,
  recipes,
  householdSize,
  color,
  sourceInfo,
  leftoverChipLabel,
  onRemove,
  onSetLeftovers,
  onSetServings,
  isEditing,
  editValue,
  onEditValue,
  onSaveEdit,
  onCancelEdit,
  isServingsEditing,
  servingsEditValue,
  onServingsEditValue,
  onSaveServingsEdit,
  onCancelServingsEdit,
  onActivate,
  isActionsOpen,
  selectMode,
  selected,
  onToggleSelected,
  dragDisabled
}: {
  meal: PlannedMeal;
  recipes: Recipe[];
  householdSize: number;
  color: string;
  sourceInfo: string;
  leftoverChipLabel?: string;
  onRemove: (id: string) => void | Promise<void>;
  onSetLeftovers: (meal: PlannedMeal) => void | Promise<void>;
  onSetServings: (meal: PlannedMeal) => void | Promise<void>;
  isEditing: boolean;
  editValue: number;
  onEditValue: (value: number) => void;
  onSaveEdit: () => void | Promise<void>;
  onCancelEdit: () => void;
  isServingsEditing: boolean;
  servingsEditValue: number;
  onServingsEditValue: (value: number) => void;
  onSaveServingsEdit: () => void | Promise<void>;
  onCancelServingsEdit: () => void;
  onActivate: () => void;
  isActionsOpen: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  dragDisabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `meal:${meal.id}`,
    disabled: dragDisabled
  });
  const style = {
    opacity: isDragging ? 0.6 : 1,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined
  };
  const remaining = getEffectiveLeftoverRemaining(meal, householdSize);

  return (
    <div
      ref={setNodeRef}
      className="meal-chip"
      style={{
        ...style,
        borderLeft: `4px solid ${color}`,
        paddingLeft: 6,
        background: tintFromAccent(color),
        color: "#0f172a"
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (selectMode) return;
        onActivate();
      }}
    >
      {selectMode ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelected()}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select meal"
        />
      ) : (
        <button
          className="drag-handle"
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag meal"
          onClick={(e) => e.stopPropagation()}
        >
          ::
        </button>
      )}
      <span
        className="meal-primary-label"
        title={meal.type === "leftover" ? sourceInfo : undefined}
        tabIndex={meal.type === "leftover" ? 0 : -1}
        aria-label={meal.type === "leftover" ? sourceInfo : undefined}
      >
        {meal.type === "leftover" && leftoverChipLabel ? (
          leftoverChipLabel
        ) : (
          <MealLabel meal={meal} recipes={recipes} householdSize={householdSize} showRemaining={false} />
        )}
      </span>
      {meal.type === "recipe" && (
        <>
          <LeftoverBadge
            mealId={meal.id}
            remaining={remaining}
            onClick={() => onSetLeftovers(meal)}
            disabled={selectMode}
          />
          <button
            className="secondary"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void onSetServings(meal);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            Servings
          </button>
        </>
      )}
      <button
        className="danger"
        onClick={(e) => {
          e.stopPropagation();
          void onRemove(meal.id);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        x
      </button>
      {isActionsOpen && (
        <div
          className="action-sheet mobile-only"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {meal.type === "recipe" && meal.recipeId && (
            <button
              className="secondary"
              type="button"
              onClick={() => {
                const baseUrl = window.location.href.split("#")[0];
                const servings = Math.max(meal.servingsPlanned ?? 1, 1);
                window.open(`${baseUrl}#/cook/${meal.recipeId}?servings=${servings}`, "_blank");
              }}
            >
              Cook
            </button>
          )}
          <button className="danger" onClick={() => void onRemove(meal.id)}>
            Delete
          </button>
          {meal.type === "recipe" && (
            <button className="secondary" onClick={() => void onSetServings(meal)}>
              Servings
            </button>
          )}
        </div>
      )}
      {meal.type === "recipe" && isEditing && (
        <div className="row" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <label className="field-stack compact-field">
            <span>Leftovers remaining</span>
            <input
              type="number"
              min="0"
              value={editValue}
              onChange={(e) => onEditValue(Number(e.target.value))}
              style={{ width: 96 }}
            />
          </label>
          <button className="secondary" onClick={(e) => { e.stopPropagation(); void onSaveEdit(); }}>
            Save
          </button>
          <button className="secondary" onClick={(e) => { e.stopPropagation(); onCancelEdit(); }}>
            Cancel
          </button>
        </div>
      )}
      {meal.type === "recipe" && isServingsEditing && (
        <div className="row" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <label className="field-stack compact-field">
            <span>Servings planned</span>
            <input
              type="number"
              min="1"
              value={servingsEditValue}
              onChange={(e) => onServingsEditValue(Number(e.target.value))}
              style={{ width: 96 }}
            />
          </label>
          <button className="secondary" onClick={(e) => { e.stopPropagation(); void onSaveServingsEdit(); }}>
            Save
          </button>
          <button className="secondary" onClick={(e) => { e.stopPropagation(); onCancelServingsEdit(); }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function LeftoverBadge({
  mealId,
  remaining,
  onClick,
  disabled = false
}: {
  mealId: string;
  remaining?: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  const canDrag = !disabled && typeof remaining === "number" && remaining > 0;
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `leftover:${mealId}`,
    disabled: !canDrag
  });
  if (!canDrag) {
    return (
      <button
        className="leftover-badge"
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        style={{ opacity: 0.9 }}
        title="Set leftovers"
      >
        {typeof remaining === "number" ? `${remaining} left` : "Leftovers"}
      </button>
    );
  }
  const label = `${remaining} left`;
  return (
    <button
      ref={setNodeRef}
      className="leftover-badge"
      type="button"
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ opacity: canDrag ? 1 : 0.9 }}
      title={canDrag ? "Drag to create leftover" : "Set leftovers"}
    >
      {label}
    </button>
  );
}

// Leftover badge serves as the drag handle; no separate token needed.

function useMediaQuery(query: string) {
  const getMatches = useCallback(
    () => (typeof window !== "undefined" ? window.matchMedia(query).matches : false),
    [query]
  );
  const [matches, setMatches] = useState<boolean>(getMatches);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    }
    const legacy = mediaQuery as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    };
    legacy.addListener?.(onChange);
    return () => legacy.removeListener?.(onChange);
  }, [query]);

  return matches;
}

function formatWeekdayLabel(value: string) {
  const d = parseISODate(value);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function colorFromId(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }
  return `hsl(${hash}, 48%, 38%)`;
}

function effectiveBaseServings(recipe?: Recipe | null) {
  return Math.max(recipe?.baseServings ?? recipe?.defaultServings ?? 1, 1);
}

function tintFromAccent(accent: string) {
  const match = /hsl\((\d+),\s*(\d+)%?,\s*(\d+)%\)/.exec(accent);
  if (!match) return "#f1f5f9";
  const hue = Number(match[1]);
  return `hsl(${hue}, 28%, 92%)`;
}

function weekRange(anchorDate: string) {
  const start = parseISODate(anchorDate);
  const end = addDays(start, 6);
  return { start: dateKey(start), end: dateKey(end) };
}

function monthRange(anchorDate: string) {
  const d = parseISODate(anchorDate);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: dateKey(start), end: dateKey(end) };
}
