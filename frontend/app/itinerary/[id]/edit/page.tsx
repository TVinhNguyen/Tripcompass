"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { sampleItinerary, type Activity } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Save,
  Eye,
  Plus,
  GripVertical,
  Clock,
  Utensils,
  Camera,
  Bus,
  Hotel,
  Sparkles,
  ChevronLeft,
  Search,
  X,
  MessageSquare,
  Send,
  Bot,
  User,
  Loader2,
  Users,
  Crown,
  Pencil,
  Link2,
  Copy,
  Check,
  Trash2,
  MapPin,
  DollarSign,
  Car,
  Navigation,
  Wallet,
  ChevronDown,
  ChevronUp,
  Menu,
  Home,
  Calendar,
  Settings,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Activity images for thumbnails
const activityImages: Record<string, string> = {
  food: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400",
  attraction: "https://images.unsplash.com/photo-1528127269322-539801943592?w=400",
  transport: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400",
  accommodation: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400",
  activity: "https://images.unsplash.com/photo-1527631746610-bca00a040d60?w=400",
};

const typeIcons: Record<string, React.ReactNode> = {
  food: <Utensils className="w-4 h-4" />,
  attraction: <Camera className="w-4 h-4" />,
  transport: <Bus className="w-4 h-4" />,
  accommodation: <Hotel className="w-4 h-4" />,
  activity: <Sparkles className="w-4 h-4" />,
};

const typeBgColors: Record<string, string> = {
  food: "bg-amber-500",
  attraction: "bg-emerald-600",
  transport: "bg-sky-500",
  accommodation: "bg-violet-500",
  activity: "bg-rose-500",
};

const typeTextColors: Record<string, string> = {
  food: "text-amber-600",
  attraction: "text-emerald-600",
  transport: "text-sky-600",
  accommodation: "text-violet-600",
  activity: "text-rose-600",
};

const typeBorderColors: Record<string, string> = {
  food: "border-amber-200",
  attraction: "border-emerald-200",
  transport: "border-sky-200",
  accommodation: "border-violet-200",
  activity: "border-rose-200",
};

const typeLabels: Record<string, string> = {
  food: "Ẩm thực",
  attraction: "Tham quan",
  transport: "Di chuyển",
  accommodation: "Lưu trú",
  activity: "Hoạt động",
};

// Activity Pool Templates with images
const activityTemplates: (Omit<Activity, "id" | "day"> & { image: string })[] = [
  {
    time: "09:00",
    title: "Tham quan địa điểm",
    titleEn: "Sightseeing",
    description: "Khám phá điểm tham quan nổi tiếng",
    descriptionEn: "Explore popular attractions",
    type: "attraction",
    location: "Điểm tham quan",
    duration: 120,
    cost: 100000,
    image: "https://images.unsplash.com/photo-1528127269322-539801943592?w=400",
  },
  {
    time: "12:00",
    title: "Ăn trưa",
    titleEn: "Lunch",
    description: "Thưởng thức ẩm thực địa phương",
    descriptionEn: "Enjoy local cuisine",
    type: "food",
    location: "Nhà hàng",
    duration: 60,
    cost: 150000,
    image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400",
  },
  {
    time: "14:00",
    title: "Di chuyển",
    titleEn: "Transport",
    description: "Di chuyển đến điểm tiếp theo",
    descriptionEn: "Travel to next destination",
    type: "transport",
    location: "Phương tiện",
    duration: 30,
    cost: 50000,
    image: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400",
  },
  {
    time: "19:00",
    title: "Ăn tối",
    titleEn: "Dinner",
    description: "Bữa tối đặc sản",
    descriptionEn: "Special dinner",
    type: "food",
    location: "Nhà hàng",
    duration: 90,
    cost: 200000,
    image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400",
  },
  {
    time: "21:00",
    title: "Nghỉ ngơi",
    titleEn: "Accommodation",
    description: "Check-in khách sạn",
    descriptionEn: "Hotel check-in",
    type: "accommodation",
    location: "Khách sạn",
    duration: 480,
    cost: 500000,
    image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400",
  },
  {
    time: "15:00",
    title: "Hoạt động trải nghiệm",
    titleEn: "Experience",
    description: "Tham gia hoạt động đặc biệt",
    descriptionEn: "Join special activity",
    type: "activity",
    location: "Địa điểm",
    duration: 120,
    cost: 300000,
    image: "https://images.unsplash.com/photo-1527631746610-bca00a040d60?w=400",
  },
];

// Chat Message Type
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// Collaborator Type
interface Collaborator {
  id: string;
  name: string;
  avatar: string;
  role: "owner" | "editor" | "viewer";
  isOnline: boolean;
}

// Mock collaborators data
const mockCollaborators: Collaborator[] = [
  {
    id: "1",
    name: "Minh Anh",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100",
    role: "owner",
    isOnline: true,
  },
  {
    id: "2",
    name: "Hoàng Nam",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100",
    role: "editor",
    isOnline: true,
  },
  {
    id: "3",
    name: "Thu Hương",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100",
    role: "viewer",
    isOnline: false,
  },
  {
    id: "4",
    name: "Đức Trung",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100",
    role: "editor",
    isOnline: true,
  },
];

// Transit Indicator Component
function TransitIndicator({ duration, distance }: { duration: number; distance?: string }) {
  return (
    <div className="flex items-center justify-center py-2 lg:py-3">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full text-xs text-slate-500">
        <Car className="w-3.5 h-3.5" />
        <span>{duration} phút</span>
        {distance && (
          <>
            <span className="text-slate-300">•</span>
            <span>{distance}</span>
          </>
        )}
      </div>
    </div>
  );
}

// Activity Edit Modal
function ActivityEditModal({
  activity,
  isOpen,
  onClose,
  onSave,
}: {
  activity: Activity | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (activity: Activity) => void;
}) {
  const [editedActivity, setEditedActivity] = useState<Activity | null>(null);

  useEffect(() => {
    if (activity) {
      setEditedActivity({ ...activity });
    }
  }, [activity]);

  if (!editedActivity) return null;

  const handleSave = () => {
    onSave(editedActivity);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white border-slate-200 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-slate-900 font-semibold text-xl flex items-center gap-3">
            <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-white", typeBgColors[editedActivity.type])}>
              {typeIcons[editedActivity.type]}
            </span>
            Chỉnh sửa hoạt động
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Loại hoạt động
            </label>
            <Select
              value={editedActivity.type}
              onValueChange={(value) =>
                setEditedActivity({ ...editedActivity, type: value })
              }
            >
              <SelectTrigger className="bg-slate-50 border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(typeLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <span className={cn("w-5 h-5 rounded flex items-center justify-center text-white", typeBgColors[key])}>
                        {typeIcons[key]}
                      </span>
                      {label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Tên hoạt động
            </label>
            <Input
              value={editedActivity.title}
              onChange={(e) =>
                setEditedActivity({ ...editedActivity, title: e.target.value })
              }
              className="bg-slate-50 border-slate-200"
              placeholder="VD: Tham quan Hồ Gươm"
            />
          </div>

          {/* Time & Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Thời gian
              </label>
              <Input
                type="time"
                value={editedActivity.time}
                onChange={(e) =>
                  setEditedActivity({ ...editedActivity, time: e.target.value })
                }
                className="bg-slate-50 border-slate-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Thời lượng (phút)
              </label>
              <Input
                type="number"
                value={editedActivity.duration}
                onChange={(e) =>
                  setEditedActivity({
                    ...editedActivity,
                    duration: parseInt(e.target.value) || 0,
                  })
                }
                className="bg-slate-50 border-slate-200"
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Địa điểm
            </label>
            <Input
              value={editedActivity.location}
              onChange={(e) =>
                setEditedActivity({
                  ...editedActivity,
                  location: e.target.value,
                })
              }
              className="bg-slate-50 border-slate-200"
              placeholder="VD: Phố Cổ Hà Nội"
            />
          </div>

          {/* Cost */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Chi phí (VNĐ)
            </label>
            <Input
              type="number"
              value={editedActivity.cost || 0}
              onChange={(e) =>
                setEditedActivity({
                  ...editedActivity,
                  cost: parseInt(e.target.value) || 0,
                })
              }
              className="bg-slate-50 border-slate-200"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Mô tả
            </label>
            <Textarea
              value={editedActivity.description}
              onChange={(e) =>
                setEditedActivity({
                  ...editedActivity,
                  description: e.target.value,
                })
              }
              className="bg-slate-50 border-slate-200 min-h-[80px]"
              placeholder="Mô tả chi tiết về hoạt động..."
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} className="border-slate-200 text-slate-600">
            Hủy
          </Button>
          <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            Lưu thay đổi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Collaborators Panel Component
function CollaboratorsPanel({ collaborators }: { collaborators: Collaborator[] }) {
  const [copied, setCopied] = useState(false);
  const shareLink = "https://tripcompass.app/itinerary/1/edit?invite=abc123";

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const roleIcons: Record<string, React.ReactNode> = {
    owner: <Crown className="w-3 h-3 text-amber-500" />,
    editor: <Pencil className="w-3 h-3 text-emerald-500" />,
    viewer: <Eye className="w-3 h-3 text-slate-400" />,
  };

  const roleLabels: Record<string, string> = {
    owner: "Chủ sở hữu",
    editor: "Có thể chỉnh sửa",
    viewer: "Chỉ xem",
  };

  const onlineCollaborators = collaborators.filter((c) => c.isOnline);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 rounded-full transition-all border border-slate-200 shadow-sm">
          <div className="flex -space-x-2">
            {onlineCollaborators.slice(0, 3).map((collaborator) => (
              <div key={collaborator.id} className="relative w-7 h-7 rounded-full border-2 border-white overflow-hidden">
                <Image src={collaborator.avatar} alt={collaborator.name} fill className="object-cover" />
                <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full border border-white" />
              </div>
            ))}
            {onlineCollaborators.length > 3 && (
              <div className="w-7 h-7 rounded-full bg-slate-600 border-2 border-white flex items-center justify-center text-xs text-white">
                +{onlineCollaborators.length - 3}
              </div>
            )}
          </div>
          <span className="text-sm text-slate-600 hidden sm:inline">{onlineCollaborators.length} online</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 bg-white border-slate-200 p-0 shadow-xl">
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-sky-50">
          <h3 className="font-semibold text-slate-900 mb-1">Cộng tác viên</h3>
          <p className="text-xs text-slate-500">{collaborators.length} người đang làm việc trên lịch trình này</p>
        </div>

        <div className="p-2 max-h-60 overflow-y-auto">
          {collaborators.map((collaborator) => (
            <div key={collaborator.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
              <div className="relative">
                <Image src={collaborator.avatar} alt={collaborator.name} width={36} height={36} className="rounded-full w-9 h-9 object-cover" />
                {collaborator.isOnline && (
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{collaborator.name}</p>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  {roleIcons[collaborator.role]}
                  <span>{roleLabels[collaborator.role]}</span>
                </div>
              </div>
              {!collaborator.isOnline && <span className="text-xs text-slate-400">Offline</span>}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-500 mb-2">Chia sẻ link mời người khác</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
              <Link2 className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-xs text-slate-500 truncate">{shareLink}</span>
            </div>
            <Button size="sm" onClick={handleCopyLink} className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// AI Chat Panel Component
function AIChatPanel({ isOpen, onClose, itineraryTitle }: { isOpen: boolean; onClose: () => void; itineraryTitle: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      role: "assistant",
      content: `Xin chào! Tôi là trợ lý AI của TripCompass. Tôi có thể giúp bạn lên kế hoạch cho lịch trình "${itineraryTitle}". Bạn muốn tôi gợi ý điều gì?`,
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    setTimeout(() => {
      const aiResponses = [
        "Dựa trên lịch trình của bạn, tôi gợi ý thêm một buổi tham quan chợ đêm vào tối ngày 2. Đây là trải nghiệm văn hóa tuyệt vời!",
        "Bạn nên dành khoảng 2-3 tiếng cho điểm tham quan này. Tôi cũng gợi ý mang theo nước uống và kem chống nắng.",
        "Để tiết kiệm chi phí, bạn có thể sử dụng xe bus địa phương thay vì taxi. Chi phí chỉ khoảng 20.000 VNĐ/lượt.",
        "Nhà hàng này có món phở rất ngon! Tôi khuyên bạn nên thử phở tái nạm và nem rán.",
        "Thời điểm lý tưởng để đến đây là vào sáng sớm (6-7h) để tránh đông đúc và có ánh sáng đẹp để chụp ảnh.",
      ];

      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: aiResponses[Math.floor(Math.random() * aiResponses.length)],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
      setIsLoading(false);
    }, 1500);
  };

  const quickSuggestions = ["Gợi ý nhà hàng", "Thêm hoạt động", "Tối ưu lịch trình", "Chi phí dự kiến"];

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed right-0 top-0 bottom-0 w-full sm:w-96 bg-white border-l border-slate-200 z-50 flex flex-col shadow-2xl"
    >
      <div className="p-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-gradient-to-r from-emerald-500 to-teal-500">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">AI Assistant</h3>
            <p className="text-xs text-white/80">Trợ lý lập kế hoạch</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("flex gap-3", message.role === "user" ? "flex-row-reverse" : "")}
          >
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", message.role === "user" ? "bg-slate-700" : "bg-emerald-500")}>
              {message.role === "user" ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
            </div>
            <div
              className={cn(
                "flex-1 p-3 rounded-2xl text-sm",
                message.role === "user" ? "bg-slate-700 text-white rounded-tr-sm" : "bg-white text-slate-700 rounded-tl-sm border border-slate-200 shadow-sm"
              )}
            >
              {message.content}
            </div>
          </motion.div>
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="p-3 bg-white rounded-2xl rounded-tl-sm border border-slate-200 shadow-sm">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="px-4 py-3 border-t border-slate-200 bg-white">
        <div className="flex flex-wrap gap-2">
          {quickSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setInputValue(suggestion)}
              className="px-3 py-1.5 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-full transition-colors border border-emerald-200"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            placeholder="Hỏi AI về lịch trình..."
            className="flex-1 px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
          <Button onClick={handleSendMessage} disabled={!inputValue.trim() || isLoading} className="h-12 w-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50">
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// Droppable Day Column
function DroppableDay({
  day,
  activities,
  onRemoveActivity,
  onEditActivity,
}: {
  day: number;
  activities: Activity[];
  onRemoveActivity: (id: string) => void;
  onEditActivity: (activity: Activity) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${day}` });

  const dayCost = activities.reduce((sum, a) => sum + (a.cost || 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-80 lg:w-96 shrink-0 flex flex-col bg-white rounded-2xl border-2 transition-all shadow-sm",
        isOver ? "border-emerald-400 bg-emerald-50/50 shadow-lg" : "border-slate-200"
      )}
    >
      {/* Day Header */}
      <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white rounded-t-2xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold shadow-lg shadow-emerald-500/25">
              {day}
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Ngày {day}</h3>
              <span className="text-xs text-slate-500">{activities.length} hoạt động</span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 p-2.5 bg-emerald-50 rounded-xl border border-emerald-100">
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <Wallet className="w-4 h-4" />
            <span>Chi phí ngày {day}</span>
          </div>
          <span className="font-bold text-emerald-700">{dayCost.toLocaleString("vi-VN")} ₫</span>
        </div>
      </div>

      {/* Activities */}
      <div className="flex-1 p-3 overflow-y-auto">
        <SortableContext items={activities.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          <div>
            {activities.map((activity, index) => (
              <div key={activity.id}>
                <SortableActivityCard activity={activity} onRemove={() => onRemoveActivity(activity.id)} onEdit={() => onEditActivity(activity)} />
                {index < activities.length - 1 && <TransitIndicator duration={15} distance="2.5 km" />}
              </div>
            ))}
          </div>
        </SortableContext>

        {activities.length === 0 && (
          <div className="h-full flex items-center justify-center text-center py-12">
            <div>
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Plus className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-500 font-medium">Kéo thả hoạt động vào đây</p>
              <p className="text-xs text-slate-400 mt-1">Hoặc click để thêm mới</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Sortable Activity Card with Image
function SortableActivityCard({ activity, onRemove, onEdit }: { activity: Activity; onRemove: () => void; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: activity.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const activityImage = activity.image || activityImages[activity.type];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative bg-white rounded-xl border overflow-hidden transition-all cursor-pointer group",
        typeBorderColors[activity.type],
        isDragging ? "opacity-50 shadow-2xl scale-105" : "hover:shadow-lg hover:border-slate-300"
      )}
      onClick={onEdit}
    >
      {/* Image Thumbnail */}
      <div className="relative h-24 overflow-hidden">
        <Image src={activityImage} alt={activity.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        
        {/* Type Badge */}
        <div className={cn("absolute top-2 left-2 px-2 py-1 rounded-lg text-white text-xs font-medium flex items-center gap-1.5", typeBgColors[activity.type])}>
          {typeIcons[activity.type]}
          <span>{typeLabels[activity.type]}</span>
        </div>

        {/* AI Suggested Badge */}
        {activity.id.includes("a1") && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-violet-500 rounded-lg text-white text-xs font-medium flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            AI
          </div>
        )}

        {/* Time */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 text-white text-sm font-medium">
          <Clock className="w-3.5 h-3.5" />
          {activity.time}
        </div>

        {/* Duration */}
        <div className="absolute bottom-2 right-2 text-white/80 text-xs">
          {activity.duration} phút
        </div>
      </div>

      <div className="p-3">
        {/* Drag Handle & Title Row */}
        <div className="flex items-start gap-2">
          <button
            {...attributes}
            {...listeners}
            className="mt-0.5 p-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4" />
          </button>

          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-slate-900 text-sm line-clamp-1">{activity.title}</h4>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{activity.location}</span>
            </div>
          </div>
        </div>

        {/* Cost & Delete */}
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
          {activity.cost ? (
            <span className={cn("text-sm font-bold", typeTextColors[activity.type])}>{activity.cost.toLocaleString("vi-VN")} ₫</span>
          ) : (
            <span className="text-xs text-slate-400 italic">Miễn phí</span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Activity Template Card with Image
function ActivityTemplateCard({ template, index }: { template: Omit<Activity, "id" | "day"> & { image: string }; index: number }) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: `template-${index}`,
    data: { template, isTemplate: true },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "p-3 bg-white rounded-xl border border-slate-200 cursor-grab active:cursor-grabbing transition-all group",
        isDragging ? "opacity-50 shadow-xl scale-105" : "hover:border-slate-300 hover:shadow-md"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0">
          <Image src={template.image} alt={template.title} fill className="object-cover" />
          <div className={cn("absolute inset-0 opacity-30", typeBgColors[template.type])} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-white", typeBgColors[template.type])}>
              {typeIcons[template.type]}
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-slate-900 text-sm">{template.title}</h4>
          <p className="text-xs text-slate-500 truncate">{template.description}</p>
          {template.cost && (
            <p className={cn("text-xs font-medium mt-1", typeTextColors[template.type])}>~{template.cost.toLocaleString("vi-VN")} ₫</p>
          )}
        </div>
        <GripVertical className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}

// Budget Summary Component
function BudgetSummary({ activities, days }: { activities: Activity[]; days: number[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const totalBudget = activities.reduce((sum, a) => sum + (a.cost || 0), 0);

  return (
    <div className="lg:hidden fixed top-14 left-0 right-0 bg-white border-b border-slate-200 z-30 shadow-sm">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-left">
            <p className="text-xs text-slate-500">Tổng chi phí</p>
            <p className="font-bold text-emerald-600">{totalBudget.toLocaleString("vi-VN")} ₫</p>
          </div>
        </div>
        {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-slate-100"
          >
            <div className="p-4 grid grid-cols-3 gap-3">
              {days.map((day) => {
                const dayCost = activities.filter((a) => a.day === day).reduce((sum, a) => sum + (a.cost || 0), 0);
                return (
                  <div key={day} className="p-3 bg-slate-50 rounded-xl text-center">
                    <p className="text-xs text-slate-500">Ngày {day}</p>
                    <p className="font-semibold text-slate-900 text-sm">{dayCost.toLocaleString("vi-VN")} ₫</p>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Mobile Bottom Navigation
function MobileBottomNav({
  onOpenSidebar,
  onOpenChat,
  isChatOpen,
}: {
  onOpenSidebar: () => void;
  onOpenChat: () => void;
  isChatOpen: boolean;
}) {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 px-4 py-2 safe-area-pb">
      <div className="flex items-center justify-around">
        <button onClick={onOpenSidebar} className="flex flex-col items-center gap-1 p-2 text-slate-500 hover:text-emerald-600">
          <Menu className="w-6 h-6" />
          <span className="text-xs">Hoạt động</span>
        </button>
        <button className="flex flex-col items-center gap-1 p-2 text-slate-500 hover:text-emerald-600">
          <Calendar className="w-6 h-6" />
          <span className="text-xs">Lịch trình</span>
        </button>
        <button
          onClick={onOpenChat}
          className={cn(
            "flex flex-col items-center gap-1 p-2",
            isChatOpen ? "text-emerald-600" : "text-slate-500 hover:text-emerald-600"
          )}
        >
          <MessageSquare className="w-6 h-6" />
          <span className="text-xs">AI Chat</span>
        </button>
        <button className="flex flex-col items-center gap-1 p-2 text-slate-500 hover:text-emerald-600">
          <Settings className="w-6 h-6" />
          <span className="text-xs">Cài đặt</span>
        </button>
      </div>
    </div>
  );
}

// Main Page Component
export default function ItineraryEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [activities, setActivities] = useState<Activity[]>(sampleItinerary.activities);
  const [title, setTitle] = useState(sampleItinerary.title);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);

  const days = useMemo(() => {
    const existingDays = [...new Set(activities.map((a) => a.day))].sort();
    const maxDay = Math.max(...existingDays, 0);
    return Array.from({ length: Math.max(maxDay, 3) }, (_, i) => i + 1);
  }, [activities]);

  const filteredTemplates = activityTemplates.filter(
    (t) => t.title.toLowerCase().includes(templateSearch.toLowerCase()) || t.type.toLowerCase().includes(templateSearch.toLowerCase())
  );

  const totalBudget = activities.reduce((sum, a) => sum + (a.cost || 0), 0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overId = over.id as string;

    if (activeData?.isTemplate && overId.startsWith("day-")) {
      return;
    }

    if (!activeData?.isTemplate) {
      const activeActivity = activities.find((a) => a.id === active.id);
      if (!activeActivity) return;

      let newDay: number | null = null;

      if (overId.startsWith("day-")) {
        newDay = parseInt(overId.split("-")[1]);
      } else {
        const overActivity = activities.find((a) => a.id === overId);
        if (overActivity) {
          newDay = overActivity.day;
        }
      }

      if (newDay !== null && activeActivity.day !== newDay) {
        setActivities((prev) => prev.map((a) => (a.id === active.id ? { ...a, day: newDay! } : a)));
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeData = active.data.current;
    const overId = over.id as string;

    if (activeData?.isTemplate) {
      let targetDay = 1;
      if (overId.startsWith("day-")) {
        targetDay = parseInt(overId.split("-")[1]);
      } else {
        const overActivity = activities.find((a) => a.id === overId);
        if (overActivity) {
          targetDay = overActivity.day;
        }
      }

      const newActivity: Activity = {
        ...activeData.template,
        id: `activity-${Date.now()}`,
        day: targetDay,
      };

      setActivities((prev) => [...prev, newActivity]);
      return;
    }

    if (active.id !== over.id) {
      setActivities((prev) => {
        const oldIndex = prev.findIndex((a) => a.id === active.id);
        const newIndex = prev.findIndex((a) => a.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          return arrayMove(prev, oldIndex, newIndex);
        }
        return prev;
      });
    }
  };

  const removeActivity = (id: string) => {
    setActivities((prev) => prev.filter((a) => a.id !== id));
  };

  const addNewDay = () => {
    const newDay = Math.max(...days, 0) + 1;
    setActivities((prev) => [
      ...prev,
      {
        id: `placeholder-${newDay}`,
        day: newDay,
        time: "09:00",
        title: "Hoạt động mới",
        titleEn: "New Activity",
        description: "Mô tả hoạt động",
        descriptionEn: "Activity description",
        type: "activity",
        location: "Địa điểm",
        duration: 60,
        cost: 0,
      },
    ]);
  };

  const handleEditActivity = (activity: Activity) => {
    setEditingActivity(activity);
  };

  const handleSaveActivity = (updatedActivity: Activity) => {
    setActivities((prev) => prev.map((a) => (a.id === updatedActivity.id ? updatedActivity : a)));
  };

  const activeActivity = activeId ? activities.find((a) => a.id === activeId) : null;

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-slate-100 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
          <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            {/* Left: Back & Title */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Link href={`/itinerary/${id}`} className="p-2 hover:bg-slate-100 rounded-lg transition-colors shrink-0">
                <ChevronLeft className="w-5 h-5 text-slate-500" />
              </Link>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg font-semibold text-slate-900 bg-transparent focus:outline-none focus:bg-slate-100 px-2 py-1 rounded-lg truncate min-w-0"
              />
            </div>

            {/* Center: Budget (Desktop) */}
            <div className="hidden lg:flex items-center gap-3 px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-200">
              <Wallet className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-xs text-emerald-600">Tổng chi phí</p>
                <p className="font-bold text-emerald-700">{totalBudget.toLocaleString("vi-VN")} ₫</p>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <CollaboratorsPanel collaborators={mockCollaborators} />

              <div className="hidden sm:block h-6 w-px bg-slate-200" />

              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsChatOpen(!isChatOpen)}
                className={cn(
                  "border-slate-200 hover:bg-slate-100 hidden lg:inline-flex",
                  isChatOpen ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "text-slate-600"
                )}
              >
                <MessageSquare className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">AI Chat</span>
              </Button>

              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex border-slate-200 text-slate-600 hover:bg-slate-100">
                <Link href={`/itinerary/${id}`}>
                  <Eye className="w-4 h-4 sm:mr-2" />
                  <span className="hidden md:inline">Xem trước</span>
                </Link>
              </Button>

              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25">
                <Save className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Lưu</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Mobile Budget Summary */}
        <BudgetSummary activities={activities} days={days} />

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden lg:pt-0 pt-14 pb-16 lg:pb-0">
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
            {/* Sidebar - Activity Pool */}
            <aside
              className={cn(
                "fixed lg:relative inset-y-0 left-0 w-80 shrink-0 border-r border-slate-200 bg-white flex flex-col z-30 transform transition-transform lg:transform-none",
                isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
              )}
            >
              {/* Mobile Close Button */}
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="lg:hidden absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>

              <div className="p-4 border-b border-slate-200">
                <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                    <Plus className="w-4 h-4 text-white" />
                  </div>
                  Kho hoạt động
                </h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder="Tìm kiếm..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <SortableContext items={filteredTemplates.map((_, i) => `template-${i}`)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {filteredTemplates.map((template, index) => (
                      <ActivityTemplateCard key={index} template={template} index={index} />
                    ))}
                  </div>
                </SortableContext>
              </div>
            </aside>

            {/* Overlay for mobile sidebar */}
            {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setIsSidebarOpen(false)} />}

            {/* Kanban Board */}
            <main className="flex-1 overflow-x-auto">
              <div className="p-4 sm:p-6 h-full">
                <div className="flex gap-4 sm:gap-6 h-full pb-4">
                  {days.map((day) => (
                    <DroppableDay
                      key={day}
                      day={day}
                      activities={activities.filter((a) => a.day === day)}
                      onRemoveActivity={removeActivity}
                      onEditActivity={handleEditActivity}
                    />
                  ))}

                  {/* Add Day Button */}
                  <button
                    onClick={addNewDay}
                    className="w-80 lg:w-96 shrink-0 h-fit p-8 border-2 border-dashed border-slate-300 rounded-2xl text-slate-400 hover:border-emerald-400 hover:text-emerald-500 hover:bg-emerald-50/50 transition-all"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                        <Plus className="w-6 h-6" />
                      </div>
                      <span className="font-medium">Thêm ngày mới</span>
                    </div>
                  </button>
                </div>
              </div>
            </main>

            {/* Drag Overlay */}
            <DragOverlay>
              {activeActivity && (
                <div className="p-3 bg-white rounded-xl border-2 border-emerald-400 shadow-2xl w-80 opacity-95">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn("w-6 h-6 rounded-lg flex items-center justify-center text-white", typeBgColors[activeActivity.type])}>
                      {typeIcons[activeActivity.type]}
                    </span>
                    <span className="text-xs text-slate-500">{activeActivity.time}</span>
                  </div>
                  <h4 className="font-semibold text-slate-900 text-sm">{activeActivity.title}</h4>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>

        {/* AI Chat Panel */}
        <AnimatePresence>
          {isChatOpen && <AIChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} itineraryTitle={title} />}
        </AnimatePresence>

        {/* Activity Edit Modal */}
        <ActivityEditModal activity={editingActivity} isOpen={!!editingActivity} onClose={() => setEditingActivity(null)} onSave={handleSaveActivity} />

        {/* Mobile Bottom Navigation */}
        <MobileBottomNav onOpenSidebar={() => setIsSidebarOpen(true)} onOpenChat={() => setIsChatOpen(true)} isChatOpen={isChatOpen} />
      </div>
    </TooltipProvider>
  );
}
