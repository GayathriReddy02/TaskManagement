export type Role = "admin" | "user";
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}
export interface Person {
  _id: string;
  name: string;
  email?: string;
}
export type Status = "Pending" | "In Progress" | "Completed";
export type Priority = "Low" | "Medium" | "High";
export interface TaskInput {
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  dueDate: string | null;
  tags: string[];
}
export interface Task extends TaskInput {
  _id: string;
  createdBy: string;
  createdByName?: string | null;
  assignedTo: string | null;
  assignedToName?: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface TaskPage {
  tasks: Task[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface Activity {
  _id: string;
  message: string;
  event: string;
  createdAt: string;
  taskId: string;
  actorId: string;
}
export interface Notice {
  _id: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}
export interface Dashboard {
  total: number;
  completed: number;
  pending: number;
  inProgress: number;
  overdue: number;
  byPriority: Record<Priority, number>;
  recentActivity: Activity[];
  unreadNotifications: number;
  byTag: { tag: string; count: number }[];
}
export interface Job {
  id: string;
  type: string;
  ownerId: string;
  status: string;
  attempts: number;
  maxRetries: number;
  errors: { message: string }[];
  error?: string;
  createdAt: string;
  nextRetryAt?: string;
  result?: { filename: string; size: number; format: string };
}
export interface JobPage {
  jobs: Job[];
  page: number;
  limit: number;
  total: number;
  activeCount: number;
}
export const statuses: Status[] = ["Pending", "In Progress", "Completed"];
export const priorities: Priority[] = ["Low", "Medium", "High"];
