"use client";
// =============================================================================
// Itinerary Edit Page — layout-only shell.
// All state & API logic lives in _hooks/use-editor-state.ts.
// All sub-components live in _components/.
// =============================================================================

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { use } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  DndContext, DragOverlay, closestCorners,
  KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  ChevronLeft, Layers, LayoutGrid, Loader2,
  Map as MapIcon, MessageSquare, Plus, Save, Sparkles, Eye, X, Search, GripVertical,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatVND } from "@/lib/format";
import { cn } from "@/lib/utils";
import ItineraryMapDynamic from "@/components/itinerary-map-dynamic";

import { useEditorState } from "./_hooks/use-editor-state";
import { TYPE_COLOR, TYPE_LABELS } from "./_lib/constants";
import type { Activity } from "./_lib/types";

import { ActivityEditModal }     from "./_components/activity-edit-modal";
import { AIChatPanel }           from "./_components/ai-chat-panel";
import { CollaboratorsPanel }    from "./_components/collaborators-panel";
import { DroppableDay }          from "./_components/droppable-day";
import { ActivityTemplateCard }  from "./_components/activity-template-card";
import { PresenceStack }         from "@/components/presence-stack";

// ── Drag overlay mini-card ────────────────────────────────────────────────────

function DragOverlayCard({ activity }: { activity: Activity }) {
  const color = TYPE_COLOR[activity.type];
  return (
    <div className="w-[300px] p-3 bg-white rounded-md border-l-[3px] border border-[#e8e2d9] shadow-2xl rotate-1"
      style={{ borderLeftColor: color.bg }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] font-mono nums text-[#1a1a1a]">{activity.time}</span>
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ background: color.soft, color: color.text }}
        >
          {TYPE_LABELS[activity.type]}
        </span>
      </div>
      <h4 className="font-semibold text-[#1a1a1a] text-sm">{activity.title}</h4>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

type MobileTab = "plan" | "map";

const MAP_MIN_WIDTH = 360;
const MAP_MAX_WIDTH = 760;
const CHAT_PANEL_WIDTH = 400;

export default function ItineraryEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const {
    activities, title, setTitle, itinerary,
    pageLoading, saving, onlineUsers,
    days, totalBudget, totalActivities, getTemplates,
    handleManualSave, removeActivity, saveActivity, createActivity, applyEditOps,
    handleDragOver, handleDragEnd, addNewDay,
  } = useEditorState(id);

  // Resolve an activity_id → title so the AI edit-ops preview names the
  // activities a user is about to change, not raw UUIDs.
  const resolveActivityLabel = (activityId: string) =>
    activities.find((a) => a.id === activityId)?.title || "hoạt động";

  // ── UI-only state ─────────────────────────────────────────────────────────
  const [activeId,        setActiveId]        = useState<string | null>(null);
  const [templateSearch,  setTemplateSearch]  = useState("");
  const [isChatOpen,      setIsChatOpen]      = useState(false);
  const [isPoolOpen,      setIsPoolOpen]      = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [hoveredId,       setHoveredId]       = useState<string | null>(null);
  const [mobileTab,       setMobileTab]       = useState<MobileTab>("plan");
  const [mapWidth,        setMapWidth]        = useState(500);
  const [isMapResizing,   setIsMapResizing]   = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeActivity = activeId ? activities.find((a) => a.id === activeId) ?? null : null;
  const filteredTemplates = getTemplates(templateSearch);

  useEffect(() => {
    if (!isMapResizing) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (event: PointerEvent) => {
      const reservedRight = isChatOpen ? CHAT_PANEL_WIDTH : 0;
      const maxAvailable = window.innerWidth - reservedRight - 420;
      const maxWidth = Math.min(MAP_MAX_WIDTH, Math.max(MAP_MIN_WIDTH, maxAvailable));
      const nextWidth = window.innerWidth - reservedRight - event.clientX;
      setMapWidth(Math.min(Math.max(nextWidth, MAP_MIN_WIDTH), maxWidth));
    };

    const stopResize = () => setIsMapResizing(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
    };
  }, [isMapResizing, isChatOpen]);

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#3d5a3d]" />
      </div>
    );
  }

  return (
    <div className="h-dvh bg-[#f5f0e8] flex flex-col overflow-hidden">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="h-14 shrink-0 bg-[#1a1a1a] text-[#f5f0e8] flex items-center px-3 sm:px-4 gap-2 sm:gap-3 border-b border-[#2a2a2a] z-40">
        <Link
          href="/planner"
          className="flex items-center gap-1.5 h-9 px-2 rounded-md hover:bg-white/10 text-[#f5f0e8]/80 hover:text-[#f5f0e8] text-sm transition"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Lịch trình</span>
        </Link>

        <div className="h-5 w-px bg-white/10 mx-1" />

        {/* Title inline edit */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="hidden md:flex items-center gap-1.5 text-[10px] font-mono tracking-[0.2em] uppercase text-[#d4a853] nums shrink-0">
            <span>NO. {id.slice(0, 3).toUpperCase()}</span>
            <span className="text-[#d4a853]/50">/</span>
            <span>{String(days.length).padStart(2, "0")}D</span>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-sm sm:text-base text-[#f5f0e8] placeholder:text-[#f5f0e8]/40 focus:outline-none font-medium truncate"
            placeholder="Tên lịch trình"
          />
        </div>

        {/* Budget strip */}
        <div className="hidden lg:flex items-center gap-3 pr-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-[#8b8378]">Budget</span>
            <span className="text-sm font-mono nums text-[#f5f0e8]">{formatVND(totalBudget)}</span>
          </div>
          <div className="h-5 w-px bg-white/10" />
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-[#8b8378]">Acts</span>
            <span className="text-sm font-mono nums text-[#f5f0e8]">{String(totalActivities).padStart(2, "0")}</span>
          </div>
          <div className="h-5 w-px bg-white/10" />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <div className="hidden sm:flex items-center gap-1 [&_button]:text-[#f5f0e8]/80 [&_button:hover]:text-[#f5f0e8] [&_button:hover]:bg-white/10">
            <PresenceStack
              users={onlineUsers.map((u) => ({ user_id: u.id, full_name: u.name }))}
              className="mr-1"
            />
            <CollaboratorsPanel collaborators={onlineUsers} itineraryId={id} ownerId={itinerary?.owner_id} />
          </div>

          <button
            onClick={() => setIsChatOpen((open) => !open)}
            className={cn(
              "h-9 px-2.5 sm:px-3 rounded-md hover:bg-white/10 text-sm flex items-center gap-1.5 transition",
              isChatOpen ? "bg-white/10 text-[#f5f0e8]" : "text-[#f5f0e8]/80 hover:text-[#f5f0e8]",
            )}
            aria-pressed={isChatOpen}
          >
            <Sparkles className="w-4 h-4 text-[#d4a853]" />
            <span className="hidden sm:inline">AI</span>
          </button>

          <Link
            href={`/itinerary/${id}`}
            className="hidden sm:flex h-9 px-3 rounded-md hover:bg-white/10 text-[#f5f0e8]/80 hover:text-[#f5f0e8] text-sm items-center gap-1.5 transition"
          >
            <Eye className="w-4 h-4" />
            <span>Xem trước</span>
          </Link>

          <Button
            size="sm"
            onClick={handleManualSave}
            disabled={saving || !itinerary}
            className="h-9 bg-[#d4a853] hover:bg-[#c09743] text-[#1a1a1a] font-semibold px-3 sm:px-4"
          >
            {saving
              ? <Loader2 className="w-4 h-4 animate-spin sm:mr-1.5" />
              : <Save    className="w-4 h-4 sm:mr-1.5" />}
            <span className="hidden sm:inline">{saving ? "Đang lưu..." : "Lưu"}</span>
          </Button>
        </div>
      </header>

      {/* ── BODY ───────────────────────────────────────────────────────────── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)}
        onDragOver={handleDragOver}
        onDragEnd={(e) => { setActiveId(null); handleDragEnd(e); }}
      >
        <div className="min-h-0 flex-1 flex overflow-hidden relative">
          {/* Left: plan column */}
          <section className={cn("min-w-0 flex-1 flex flex-col overflow-hidden bg-[#f5f0e8]", mobileTab === "map" && "hidden lg:flex")}>
            {/* Summary strip */}
            <div className="shrink-0 h-12 px-4 flex items-center gap-4 border-b border-[#e0d9cc] bg-[#fbf8f2]">
              <button
                onClick={() => setIsPoolOpen(true)}
                title="Mở thư viện mẫu hoạt động — kéo thả nhanh các loại quen thuộc (ăn sáng, tham quan, di chuyển…)"
                className="h-8 px-2.5 rounded-md border border-[#e0d9cc] hover:bg-white text-[#1a1a1a] text-xs font-medium flex items-center gap-1.5 transition"
              >
                <Layers className="w-3.5 h-3.5" />
                Mẫu hoạt động
              </button>

              <div className="h-5 w-px bg-[#e0d9cc]" />

              <div className="flex items-center gap-4 text-[11px] font-mono tracking-wider text-[#6b6b6b] nums">
                <span><span className="text-[#8b8378]">DAYS </span><span className="text-[#1a1a1a]">{String(days.length).padStart(2, "0")}</span></span>
                <span><span className="text-[#8b8378]">ACTS </span><span className="text-[#1a1a1a]">{String(totalActivities).padStart(2, "0")}</span></span>
                <span className="hidden sm:inline lg:hidden">
                  <span className="text-[#8b8378]">₫ </span>
                  <span className="text-[#1a1a1a]">{formatVND(totalBudget)}</span>
                </span>
              </div>

              <div className="ml-auto">
                <button
                  onClick={addNewDay}
                  className="h-8 px-2.5 rounded-md border border-[#e0d9cc] hover:bg-white text-[#1a1a1a] text-xs font-medium flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Thêm ngày
                </button>
              </div>
            </div>

            {/* Day columns */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
              <div className="flex gap-4 p-4 h-full min-w-min">
                {days.map((day) => (
                  <DroppableDay
                    key={day}
                    day={day}
                    activities={activities.filter((a) => a.day === day)}
                    onRemoveActivity={removeActivity}
                    onEditActivity={(a) => setEditingActivity(a)}
                    onAddActivity={(d) => setEditingActivity(blankActivity(d))}
                    onHoverActivity={setHoveredId}
                    activeMapId={hoveredId}
                  />
                ))}
              </div>
            </div>
          </section>

          {/* Right: Map */}
          <aside className={cn(
            "h-full w-full lg:w-[var(--map-width)] shrink-0 relative border-l border-[#e0d9cc] bg-[#eeeae1]",
            mobileTab === "plan" && "hidden lg:block"
          )}
            style={{ "--map-width": `${mapWidth}px` } as CSSProperties}
          >
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                setIsMapResizing(true);
              }}
              className={cn(
                "absolute left-0 top-0 z-[500] hidden h-full w-4 -translate-x-1/2 cursor-col-resize items-center justify-center text-[#6b6b6b] transition lg:flex",
                "hover:text-[#1a1a1a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a853]",
              )}
              aria-label="Kéo để đổi chiều rộng bản đồ"
            >
              <span className="flex h-14 w-6 items-center justify-center rounded-full border border-[#d4cfc5] bg-white/90 shadow-sm">
                <GripVertical className="h-4 w-4" />
              </span>
            </button>
            <div className="h-full w-full">
              <ItineraryMapDynamic
                activities={activities}
                activeActivityId={hoveredId}
                destination={itinerary?.destination}
                onMarkerClick={(markerId) => {
                  const a = activities.find((x) => x.id === markerId);
                  if (a) setEditingActivity(a);
                }}
              />
            </div>
          </aside>

          <AnimatePresence initial={false}>
            {isChatOpen && (
              <AIChatPanel
                mode="docked"
                className="hidden lg:flex"
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                itineraryTitle={title}
                itineraryId={id}
                onApplyOps={applyEditOps}
                resolveActivityLabel={resolveActivityLabel}
              />
            )}
          </AnimatePresence>

          {/* Activity Pool drawer */}
          <AnimatePresence>
            {isPoolOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/30 z-40"
                  onClick={() => setIsPoolOpen(false)}
                />
                <motion.div
                  initial={{ x: -360 }} animate={{ x: 0 }} exit={{ x: -360 }}
                  transition={{ type: "spring", damping: 28, stiffness: 260 }}
                  className="absolute left-0 top-0 bottom-0 w-[min(340px,calc(100vw-24px))] bg-[#fbf8f2] border-r border-[#e0d9cc] z-50 flex flex-col shadow-2xl"
                >
                  <div className="h-14 px-4 border-b border-[#e0d9cc] flex items-center justify-between bg-[#1a1a1a]">
                    <div>
                      <div className="text-[10px] font-mono tracking-[0.24em] uppercase text-[#d4a853]">Library</div>
                      <div className="text-sm font-medium text-[#f5f0e8]">Kho hoạt động</div>
                    </div>
                    <button
                      onClick={() => setIsPoolOpen(false)}
                      className="p-1.5 text-[#f5f0e8]/70 hover:text-[#f5f0e8] hover:bg-white/10 rounded-md"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="px-4 py-3 border-b border-[#e8e2d9]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8b8378]" />
                      <Input
                        placeholder="Tìm hoạt động..."
                        value={templateSearch}
                        onChange={(e) => setTemplateSearch(e.target.value)}
                        className="pl-8 h-9 bg-white border-[#e0d9cc] text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    <SortableContext
                      items={filteredTemplates.map((_, i) => `template-${i}`)}
                      strategy={verticalListSortingStrategy}
                    >
                      {filteredTemplates.map((template, index) => (
                        <ActivityTemplateCard key={`${template.title}-${index}`} template={template} index={index} />
                      ))}
                    </SortableContext>
                    {filteredTemplates.length === 0 && (
                      <div className="text-center py-12">
                        <div className="text-[11px] font-mono tracking-wider text-[#8b8378] uppercase">Không có kết quả</div>
                      </div>
                    )}
                  </div>

                  <div className="p-3 border-t border-[#e8e2d9] bg-[#f5f0e8]">
                    <p className="text-[11px] text-[#6b6b6b] leading-relaxed">
                      Kéo thả hoạt động sang khung <span className="font-medium text-[#1a1a1a]">ngày</span> bên phải để thêm vào lịch trình.
                    </p>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeActivity ? <DragOverlayCard activity={activeActivity} /> : null}
        </DragOverlay>
      </DndContext>

      {/* ── MOBILE TAB BAR ─────────────────────────────────────────────────── */}
      <nav className="lg:hidden h-14 shrink-0 bg-[#1a1a1a] border-t border-[#2a2a2a] grid grid-cols-3">
        {[
          { tab: "plan" as MobileTab, icon: <LayoutGrid  className="w-5 h-5" />, label: "Plan" },
          { tab: "map"  as MobileTab, icon: <MapIcon     className="w-5 h-5" />, label: "Map"  },
        ].map(({ tab, icon, label }) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 text-[10px] font-mono tracking-wider uppercase transition",
              mobileTab === tab ? "text-[#d4a853]" : "text-[#f5f0e8]/60"
            )}
          >
            {icon}
            {label}
          </button>
        ))}
        <button
          onClick={() => setIsChatOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-mono tracking-wider uppercase text-[#f5f0e8]/60 transition"
        >
          <MessageSquare className="w-5 h-5" />
          AI
        </button>
      </nav>

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isChatOpen && (
          <AIChatPanel
            mode="overlay"
            className="lg:hidden"
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            itineraryTitle={title}
            itineraryId={id}
            onApplyOps={applyEditOps}
            resolveActivityLabel={resolveActivityLabel}
          />
        )}
      </AnimatePresence>

      <ActivityEditModal
        activity={editingActivity}
        isOpen={!!editingActivity}
        onClose={() => setEditingActivity(null)}
        onSave={(updated) => {
          setEditingActivity(null);
          // Sentinel id "__new-" marks the row as not-yet-persisted, created
          // by blankActivity() when the "+ Thêm" button opens the modal in
          // create-mode. Routing on id keeps the modal API symmetric.
          if (updated.id.startsWith("__new-")) {
            createActivity(updated);
          } else {
            saveActivity(updated);
          }
        }}
      />
    </div>
  );
}

// blankActivity returns a placeholder shape the modal can edit. The id
// prefix `__new-` is the contract between page and useEditorState: any
// activity saved with this prefix triggers createActivity (POST) instead
// of saveActivity (PATCH).
function blankActivity(day: number): Activity {
  return {
    id: `__new-${Date.now()}`,
    day,
    time: "09:00",
    title: "",
    titleEn: "",
    description: "",
    descriptionEn: "",
    type: "activity",
    location: "",
    duration: 60,
    cost: 0,
  };
}
