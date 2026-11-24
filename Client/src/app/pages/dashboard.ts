import { Component, inject, OnInit } from "@angular/core";
import { DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";
import { ProgressBarModule } from "primeng/progressbar";
import { Api, Auth, errorText } from "../core/api";
import { Dashboard, Priority } from "../core/models";
@Component({
  standalone: true,
  imports: [DatePipe, RouterLink, ButtonModule, CardModule, ProgressBarModule],
  template: `<div class="page-head">
      <div>
        <div class="eyebrow">
          {{ admin ? "ADMINISTRATION" : "PERSONAL WORKSPACE" }}
        </div>
        <h1>
          {{
            admin ? "Workspace overview" : "Welcome, " + auth.user()?.name + "."
          }}
        </h1>
        <p class="muted">
          {{
            admin
              ? "Monitor task progress across your workspace."
              : "Track your owned and assigned tasks."
          }}
        </p>
      </div>
      <p-button
        label="Refresh"
        icon="pi pi-refresh"
        [outlined]="true"
        [loading]="busy"
        (onClick)="load()"
      />
    </div>
    @if (error) {
      <div class="error">{{ error }}</div>
    }
    @if (busy) {
      <div class="loading">Loading workspace…</div>
    }
    @if (data; as d) {
      <div class="metrics">
        @for (c of cards(); track c.label) {
          <p-card
            ><span class="metric-icon" [class]="'metric-icon ' + c.color"
              ><i [class]="c.icon"></i
            ></span>
            <p class="muted">{{ c.label }}</p>
            <strong class="metric-value">{{ c.value }}</strong></p-card
          >
        }
      </div>
      <div class="detail-grid">
        <p-card header="Task completion"
          ><div class="donut" [style.background]="gradient()">
            <div>
              <strong>{{ rate() }}%</strong><small>Completed</small>
            </div>
          </div>
          <div class="legend">
            <span
              ><b class="dot green"></b>Completed
              <strong>{{ d.completed }}</strong></span
            ><span
              ><b class="dot violet"></b>In progress
              <strong>{{ d.inProgress }}</strong></span
            ><span
              ><b class="dot grey"></b>Pending
              <strong>{{ d.pending }}</strong></span
            >
          </div></p-card
        ><p-card header="Priority distribution">
          @for (p of priority; track p) {
            <div class="priority-row">
              <div>
                <span>{{ p }}</span
                ><strong>{{ d.byPriority[p] }}</strong>
              </div>
              <p-progressbar
                [value]="d.total ? (100 * d.byPriority[p]) / d.total : 0"
                [showValue]="false"
              />
            </div>
          }
          <p class="muted">
            Overdue is calculated from incomplete tasks with a due date before
            today (UTC).
          </p>
          <a routerLink="/tasks">View tasks <i class="pi pi-arrow-right"></i></a
        ></p-card>
      </div>
      <p-card header="Tasks by tag">
        <div class="legend">
          @for (item of d.byTag; track item.tag) {
            <span>
              <b class="dot violet"></b>{{ item.tag }}
              <strong>{{ item.count }}</strong>
            </span>
          } @empty {
            <p class="empty">No tagged tasks yet.</p>
          }
        </div>
      </p-card>
      <p-card header="Recent activity"
        ><div class="feed">
          @for (a of d.recentActivity; track a._id) {
            <div class="feed-row">
              <i class="pi pi-history feed-icon"></i>
              <div>
                <strong>{{ a.message }}</strong
                ><small>{{ a.createdAt | date: "medium" }}</small>
              </div>
            </div>
          } @empty {
            <p class="empty">No activity yet.</p>
          }
        </div>
        <a routerLink="/activity">View all recent activity</a></p-card
      >
    }`,
})
export class DashboardPage implements OnInit {
  auth = inject(Auth);
  private api = inject(Api);
  data?: Dashboard;
  busy = false;
  error = "";
  priority: Priority[] = ["High", "Medium", "Low"];
  get admin() {
    return this.auth.user()?.role === "admin";
  }
  ngOnInit() {
    void this.load();
  }
  async load() {
    this.busy = true;
    this.error = "";
    try {
      this.data = await this.api.dashboard();
    } catch (e) {
      this.error = errorText(e);
    } finally {
      this.busy = false;
    }
  }
  rate() {
    return this.data?.total
      ? Math.round((100 * this.data.completed) / this.data.total)
      : 0;
  }
  gradient() {
    const d = this.data;
    if (!d?.total) return "#e2e8f0";
    return `conic-gradient(#10b981 0 ${(100 * d.completed) / d.total}%, #8b5cf6 0 ${(100 * (d.completed + d.inProgress)) / d.total}%, #cbd5e1 0)`;
  }
  cards() {
    const d = this.data!;
    return [
      {
        label: "Total tasks",
        value: d.total,
        icon: "pi pi-list",
        color: "indigo",
      },
      {
        label: "Completed",
        value: d.completed,
        icon: "pi pi-check-circle",
        color: "green",
      },
      {
        label: "Pending",
        value: d.pending,
        icon: "pi pi-clock",
        color: "grey",
      },
      {
        label: "In progress",
        value: d.inProgress,
        icon: "pi pi-clock",
        color: "violet",
      },
      {
        label: "Overdue",
        value: d.overdue,
        icon: "pi pi-exclamation-circle",
        color: "amber",
      },
      {
        label: "Unread notifications",
        value: d.unreadNotifications,
        icon: "pi pi-bell",
        color: "indigo",
      },
    ];
  }
}
