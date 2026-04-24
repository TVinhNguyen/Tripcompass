// Local Activity shape used by the drag-and-drop editor
// (Maps from API Activity on load, serialises back on save)
export type Activity = {
  id: string;
  day: number;
  time: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  type: "food" | "attraction" | "transport" | "accommodation" | "activity";
  location: string;
  duration: number;
  cost: number;
  lat?: number;
  lng?: number;
};

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface Collaborator {
  id: string;
  name: string;
  avatar: string;
  role: "owner" | "editor" | "viewer";
  isOnline: boolean;
}
