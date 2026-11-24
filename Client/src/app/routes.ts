import { Routes } from "@angular/router";
import { signedIn, roleGuard } from "./core/api";
export const routes: Routes = [
  {
    path: "login",
    loadComponent: () => import("./pages/auth").then((m) => m.AuthPage),
  },
  {
    path: "register",
    data: { register: true },
    loadComponent: () => import("./pages/auth").then((m) => m.AuthPage),
  },
  {
    path: "",
    canActivate: [signedIn],
    loadComponent: () => import("./pages/shell").then((m) => m.Shell),
    children: [
      {
        path: "dashboard",
        canActivate: [roleGuard],
        data: { role: "user" },
        loadComponent: () =>
          import("./pages/dashboard").then((m) => m.DashboardPage),
      },
      {
        path: "admin/dashboard",
        canActivate: [roleGuard],
        data: { role: "admin" },
        loadComponent: () =>
          import("./pages/dashboard").then((m) => m.DashboardPage),
      },
      {
        path: "tasks",
        loadComponent: () => import("./pages/tasks").then((m) => m.TasksPage),
      },
      {
        path: "notifications",
        loadComponent: () =>
          import("./pages/feeds").then((m) => m.NotificationsPage),
      },
      {
        path: "activity",
        loadComponent: () =>
          import("./pages/feeds").then((m) => m.ActivityPage),
      },
      {
        path: "reports",
        loadComponent: () =>
          import("./pages/reports").then((m) => m.ReportsPage),
      },
      {
        path: "admin/team",
        canActivate: [roleGuard],
        data: { role: "admin" },
        loadComponent: () => import("./pages/feeds").then((m) => m.TeamPage),
      },
      { path: "", pathMatch: "full", redirectTo: "dashboard" },
    ],
  },
  { path: "**", redirectTo: "login" },
];
