import { Component, inject } from "@angular/core";
import { RouterOutlet, RouterLink, RouterLinkActive } from "@angular/router";
import { ButtonModule } from "primeng/button";
import { Auth } from "../core/api";
@Component({
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule],
  template: `<div class="shell">
    <aside class="sidebar" [class.open]="open">
      <div class="brand">
        <i class="pi pi-check-square"></i> Taskora<span>.</span>
      </div>
      <div class="nav-label">WORKSPACE</div>
      @for (n of links(); track n.path) {
        <a
          class="nav"
          [routerLink]="n.path"
          routerLinkActive="active"
          (click)="open = false"
          ><i [class]="n.icon"></i>{{ n.label }}</a
        >
      }
      <div class="side-bottom">
        <div class="profile">
          <span class="avatar">{{ auth.user()?.name?.slice(0, 1) }}</span>
          <div>
            <strong>{{ auth.user()?.name }}</strong
            ><small>{{
              auth.user()?.role === "admin" ? "Administrator" : "Team member"
            }}</small>
          </div>
        </div>
        <p-button
          label="Sign out"
          icon="pi pi-sign-out"
          [text]="true"
          (onClick)="auth.logout()"
        />
      </div>
    </aside>
    <main class="workspace">
      <header class="topbar">
        <div class="top-left">
          <p-button
            icon="pi pi-bars"
            [text]="true"
            ariaLabel="Toggle navigation"
            styleClass="mobile-menu"
            (onClick)="open = !open"
          /><span>Workspace <span class="muted">/ Taskora</span></span>
        </div>
        <div class="top-actions">
          <span class="role-pill">{{ auth.user()?.role }}</span
          ><p-button
            icon="pi pi-moon"
            [text]="true"
            ariaLabel="Toggle theme"
            (onClick)="theme()"
          /><p-button
            icon="pi pi-bell"
            [text]="true"
            ariaLabel="Notifications"
            routerLink="/notifications"
          />
        </div>
      </header>
      <div class="content"><router-outlet /></div>
      <footer class="workspace-footer">
        Taskora · Organize. Execute. Achieve.
      </footer>
    </main>
  </div>`,
})
export class Shell {
  auth = inject(Auth);
  open = false;
  links() {
    return [
      { label: "Overview", path: this.auth.home(), icon: "pi pi-chart-pie" },
      { label: "Tasks", path: "/tasks", icon: "pi pi-list-check" },
      { label: "Notifications", path: "/notifications", icon: "pi pi-bell" },
      { label: "Activity", path: "/activity", icon: "pi pi-history" },
      { label: "Reports & jobs", path: "/reports", icon: "pi pi-file-export" },
      ...(this.auth.user()?.role === "admin"
        ? [
            {
              label: "Team directory",
              path: "/admin/team",
              icon: "pi pi-users",
            },
          ]
        : []),
    ];
  }
  theme() {
    document.documentElement.classList.toggle("dark");
  }
}
