import { Injectable, inject, signal } from "@angular/core";
import {
  HttpClient,
  HttpInterceptorFn,
  HttpParams,
  HttpErrorResponse,
} from "@angular/common/http";
import { Router, CanActivateFn } from "@angular/router";
import { catchError, firstValueFrom, throwError } from "rxjs";
import {
  User,
  Person,
  Task,
  TaskInput,
  TaskPage,
  Dashboard,
  Activity,
  Notice,
  Job,
  Status,
} from "./models";
export function errorText(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    return (
      e.error?.message ||
      (e.status === 0
        ? "Cannot connect to backend. Check port 5000."
        : `Request failed (${e.status})`)
    );
  }
  return e instanceof Error ? e.message : "Unexpected error";
}
@Injectable({ providedIn: "root" })
export class Api {
  private http = inject(HttpClient);
  private base = "/api";
  get<T>(path: string, params: Record<string, string> = {}) {
    return firstValueFrom(
      this.http.get<T>(this.base + path, {
        params: new HttpParams({ fromObject: params }),
      }),
    );
  }
  post<T>(path: string, body: unknown) {
    return firstValueFrom(this.http.post<T>(this.base + path, body));
  }
  patch<T>(path: string, body: unknown) {
    return firstValueFrom(this.http.patch<T>(this.base + path, body));
  }
  put<T>(path: string, body: unknown) {
    return firstValueFrom(this.http.put<T>(this.base + path, body));
  }
  delete(path: string) {
    return firstValueFrom(this.http.delete(this.base + path));
  }
  login(email: string, password: string) {
    return this.post<{ user: User; token: string }>("/auth/login", {
      email,
      password,
    });
  }
  register(name: string, email: string, password: string) {
    return this.post<{ user: User; token: string }>("/auth/register", {
      name,
      email,
      password,
    });
  }
  me() {
    return this.get<{ user: User }>("/auth/me");
  }
  dashboard() {
    return this.get<Dashboard>("/dashboard");
  }
  tasks(params: Record<string, string> = {}) {
    return this.get<TaskPage>("/tasks", params);
  }
  task(id: string) {
    return this.get<{ task: Task }>("/tasks/" + id);
  }
  createTask(body: TaskInput) {
    return this.post<{ task: Task }>("/tasks", body);
  }
  editTask(id: string, body: TaskInput) {
    return this.put<{ task: Task }>("/tasks/" + id, body);
  }
  status(id: string, status: Status) {
    return this.patch("/tasks/" + id + "/status", { status });
  }
  assign(id: string, assignedTo: string) {
    return this.patch("/tasks/" + id + "/assign", { assignedTo });
  }
  users() {
    return this.get<{ users: Person[] }>("/users");
  }
  activity() {
    return this.get<{ activities: Activity[] }>("/activities");
  }
  notices() {
    return this.get<{ notifications: Notice[]; unreadCount: number }>(
      "/notifications",
    );
  }
  read(id: string) {
    return this.patch("/notifications/" + id + "/read", {});
  }
  readAll() {
    return this.patch("/notifications/read-all", {});
  }
  jobs() {
    return this.get<{ jobs: Job[] }>("/jobs");
  }
  report(format: string, filters: Record<string, string> = {}) {
    return this.post<{ job: Job }>("/reports/" + format, filters);
  }
  async download(job: Job) {
    const blob = await firstValueFrom(
      this.http.get(this.base + "/reports/download/" + job.id, {
        responseType: "blob",
      }),
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = job.result?.filename || "taskora-report";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
@Injectable({ providedIn: "root" })
export class Auth {
  private api = inject(Api);
  private router = inject(Router);
  user = signal<User | null>(null);
  private restoring?: Promise<void>;
  home() {
    return this.user()?.role === "admin" ? "/admin/dashboard" : "/dashboard";
  }
  accept(response: { user: User; token: string }) {
    sessionStorage.setItem("taskora_token", response.token);
    this.user.set(response.user);
    return this.router.navigateByUrl(this.home());
  }
  restore() {
    if (this.user() || !sessionStorage.getItem("taskora_token"))
      return Promise.resolve();
    return (this.restoring ??= this.api
      .me()
      .then((r) => {
        this.user.set(r.user);
      })
      .catch(() => {
        sessionStorage.removeItem("taskora_token");
        this.user.set(null);
      })
      .finally(() => {
        this.restoring = undefined;
      }));
  }
  logout() {
    sessionStorage.removeItem("taskora_token");
    this.user.set(null);
    void this.router.navigateByUrl("/login");
  }
}
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const token = sessionStorage.getItem("taskora_token");
  const isApi = req.url.startsWith("/api/");
  const isAuth = /\/auth\/(login|register)$/.test(req.url);
  return next(
    isApi && token && !isAuth
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req,
  ).pipe(
    catchError((e) => {
      if (isApi && !isAuth && e.status === 401 && token) {
        auth.logout();
      }
      return throwError(() => e);
    }),
  );
};
export const signedIn: CanActivateFn = async () => {
  const auth = inject(Auth),
    router = inject(Router);
  await auth.restore();
  return auth.user() && sessionStorage.getItem("taskora_token")
    ? true
    : router.parseUrl("/login");
};
export const roleGuard: CanActivateFn = async (route) => {
  const auth = inject(Auth),
    router = inject(Router);
  await auth.restore();
  return auth.user()?.role === route.data["role"]
    ? true
    : router.parseUrl(auth.home());
};
