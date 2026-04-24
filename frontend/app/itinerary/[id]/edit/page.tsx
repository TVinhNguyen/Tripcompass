"use client";
// =============================================================================
// Itinerary Edit Page — layout-only shell.
// All state & API logic lives in _hooks/use-editor-state.ts.
// All sub-components live in _components/.
// =============================================================================

import { useState } from "react";
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
  Map as MapIcon, MessageSquare, Plus, Save, Sparkles, Eye, X, Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export default function ItineraryEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const {
    activities, title, setTitle, itinerary,
    pageLoading, saving, onlineUsers,
    days, totalBudget, totalActivities, getTemplates,
    handleManualSave, removeActivity, saveActivity,
    handleDragOver, handleDragEnd, addNewDay,
  } = useEditorState(id);

  // ── UI-only state ─────────────────────────────────────────────────────────
  const [activeId,        setActiveId]        = useState<string | null>(null);
  const [templateSearch,  setTemplateSearch]  = useState("");
  const [isChatOpen,      setIsChatOpen]      = useState(false);
  const [isPoolOpen,      setIsPoolOpen]      = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [hoveredId,       setHoveredId]       = useState<string | null>(null);
  const [mobileTab,       setMobileTab]       = useState<MobileTab>("plan");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeActivity = activeId ? activities.find((a) => a.id === activeId) ?? null : null;
  const filteredTemplates = getTemplates(templateSearch);

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#3d5a3d]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f0e8] flex flex-col">
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
            <span className="text-sm font-mono nums text-[#f5f0e8]">{totalBudget.toLocaleString("vi-VN")} ₫</span>
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
          <div className="hidden sm:block [&_button]:text-[#f5f0e8]/80 [&_button:hover]:text-[#f5f0e8] [&_button:hover]:bg-white/10">
            <CollaboratorsPanel collaborators={onlineUsers} />
          </div>

          <button
            onClick={() => setIsChatOpen(true)}
            className="h-9 px-2.5 sm:px-3 rounded-md hover:bg-white/10 text-[#f5f0e8]/80 hover:text-[#f5f0e8] text-sm flex items-center gap-1.5 transition"
          >
            <Sparkles className="w-4 h-4 text-[#d4a853]" />
            <span className="hidden sm:inline">AI</span>
          </button>

          <button className="hidden sm:flex h-9 px-3 rounded-md hover:bg-white/10 text-[#f5f0e8]/80 hover:text-[#f5f0e8] text-sm items-center gap-1.5 transition">
            <Eye className="w-4 h-4" />
            <span>Xem trước</span>
          </button>

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
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left: plan column */}
          <section className={cn("flex-1 flex flex-col overflow-hidden bg-[#f5f0e8]", mobileTab === "map" && "hidden lg:flex")}>
            {/* Summary strip */}
            <div className="shrink-0 h-12 px-4 flex items-center gap-4 border-b border-[#e0d9cc] bg-[#fbf8f2]">
              <button
                onClick={() => setIsPoolOpen(true)}
                className="h-8 px-2.5 rounded-md border border-[#e0d9cc] hover:bg-white text-[#1a1a1a] text-xs font-medium flex items-center gap-1.5 transition"
              >
                <Layers className="w-3.5 h-3.5" />
                Kho hoạt động
              </button>

              <div className="h-5 w-px bg-[#e0d9cc]" />

              <div className="flex items-center gap-4 text-[11px] font-mono tracking-wider text-[#6b6b6b] nums">
                <span><span className="text-[#8b8378]">DAYS </span><span className="text-[#1a1a1a]">{String(days.length).padStart(2, "0")}</span></span>
                <span><span className="text-[#8b8378]">ACTS </span><span className="text-[#1a1a1a]">{String(totalActivities).padStart(2, "0")}</span></span>
                <span className="hidden sm:inline lg:hidden">
                  <span className="text-[#8b8378]">₫ </span>
                  <span className="text-[#1a1a1a]">{totalBudget.toLocaleString("vi-VN")}</span>
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
                    onHoverActivity={setHoveredId}
                    activeMapId={hoveredId}
                  />
                ))}
              </div>
            </div>
          </section>

          {/* Right: Map */}
          <aside className={cn(
            "w-full lg:w-[420px] xl:w-[500px] shrink-0 relative border-l border-[#e0d9cc] bg-[#eeeae1]",
            mobileTab === "plan" && "hidden lg:block"
          )}>
            <div className="h-full w-full">
              <ItineraryMapDynamic
                activities={activities}
                activeActivityId={hoveredId}
                onMarkerClick={(markerId) => {
                  const a = activities.find((x) => x.id === markerId);
                  if (a) setEditingActivity(a);
                }}
              />
            </div>
          </aside>

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
                  className="absolute left-0 top-0 bottom-0 w-[340px] bg-[#fbf8f2] border-r border-[#e0d9cc] z-50 flex flex-col shadow-2xl"
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
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            itineraryTitle={title}
            itineraryId={id}
          />
        )}
      </AnimatePresence>

      <ActivityEditModal
        activity={editingActivity}
        isOpen={!!editingActivity}
        onClose={() => setEditingActivity(null)}
        onSave={(updated) => {
          setEditingActivity(null);
          saveActivity(updated);
        }}
      />
    </div>
  );
}
