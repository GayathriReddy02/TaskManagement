import { Injectable, inject, signal } from "@angular/core";
import {
  HttpClient,
  HttpInterceptorFn,
  HttpParams,
  HttpErrorResponse,
} from "@angular/common/http";
import { Router, CanActivateFn } from "@angular/router";
import {
  catchError,
  firstValueFrom,
  throwError,
} from "rxjs";
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
  JobPage,
  Status,
} from "./models";

function storedToken(): string | null {
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}

function clearStoredToken() {
  localStorage.removeItem("token");
  sessionStorage.removeItem("token");
}

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
    return this.post<{ token: string; user: User }>("/auth/login", {
      email,
      password,
    });
  }
  register(name: string, email: string, password: string) {
    return this.post<{ message: string }>("/auth/register", {
      name,
      email,
      password,
    });
  }
  logout() {
    return this.post<void>("/auth/logout", {});
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
  editTask(id: string, body: TaskInput, updatedAt: string) {
    return firstValueFrom(
      this.http.put<{ task: Task }>(this.base + "/tasks/" + id, body, {
        headers: { "If-Match": `"${updatedAt}"` },
      }),
    );
  }
  status(id: string, status: Status) {
    return this.patch("/tasks/" + id + "/status", { status });
  }
  assign(id: string, assignedTo: string | null) {
    return this.patch("/tasks/" + id + "/assign", { assignedTo });
  }
  users() {
    return this.get<{ users: Person[] }>("/users");
  }
  assignees(id: string) {
    return this.get<{ users: Person[] }>(`/tasks/${id}/assignees`);
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
  jobs(page = 1, limit = 10) {
    return this.http.get<JobPage>(this.base + "/jobs", { params: { page, limit } });
  }
  report(format: string, filters: Record<string, string> = {}) {
    return this.post<{ job: Job }>("/reports/" + format, filters);
  }
  async download(job: Job) {
    let blob: Blob;
    try {
      blob = await firstValueFrom(
        this.http.get(this.base + "/reports/download/" + job.id, {
          responseType: "blob",
        }),
      );
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.error instanceof Blob) {
        const text = await e.error.text();
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch (parseError) {
          if (parseError instanceof SyntaxError) throw e;
          throw parseError;
        }
        if (
          body &&
          typeof body === "object" &&
          "message" in body &&
          typeof body.message === "string"
        ) {
          throw new HttpErrorResponse({
            error: body,
            headers: e.headers,
            status: e.status,
            statusText: e.statusText,
            url: e.url ?? undefined,
          });
        }
      }
      throw e;
    }
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
  accept(user: User) {
    this.user.set(user);
    return this.router.navigateByUrl(this.home());
  }
  restore() {
    if (this.user()) return Promise.resolve();
    if (!storedToken()) return Promise.resolve();
    return (this.restoring ??= this.api
      .me()
      .then((r) => {
        this.user.set(r.user);
      })
      .catch((e) => {
        if (e instanceof HttpErrorResponse && e.status === 401) {
          this.user.set(null);
        }
      })
      .finally(() => {
        this.restoring = undefined;
      }));
  }
  logout() {
    const request = this.api.logout();
    this.user.set(null);
    clearStoredToken();
    void request.catch(() => undefined);
    void this.router.navigateByUrl("/login");
  }
  sessionExpired() {
    this.user.set(null);
    clearStoredToken();
    void this.router.navigateByUrl("/login");
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const isApi = req.url.startsWith("/api/");
  const token = isApi ? storedToken() : null;
  const outgoing =
    token && isApi
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;
  return next(outgoing).pipe(
    catchError((e) => {
      if (isApi && e instanceof HttpErrorResponse && e.status === 401) {
        auth.sessionExpired();
      }
      return throwError(() => e);
    }),
  );
};
export const signedIn: CanActivateFn = async () => {
  const auth = inject(Auth),
    router = inject(Router);
  await auth.restore();
  return auth.user() ? true : router.parseUrl("/login");
};
export const roleGuard: CanActivateFn = async (route) => {
  const auth = inject(Auth),
    router = inject(Router);
  await auth.restore();
  return auth.user()?.role === route.data["role"]
    ? true
    : router.parseUrl(auth.user() ? auth.home() : "/login");
};
