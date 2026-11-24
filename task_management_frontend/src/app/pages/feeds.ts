import { Component, inject, OnInit, OnDestroy } from "@angular/core";
import { DatePipe } from "@angular/common";
import { ButtonModule } from "primeng/button";
import { TagModule } from "primeng/tag";
import { TableModule } from "primeng/table";
import { Api, errorText } from "../core/api";
import { Activity, Notice, Person } from "../core/models";
@Component({
  standalone: true,
  imports: [DatePipe, ButtonModule, TagModule],
  template: `<div class="page-head">
      <div>
        <div class="eyebrow">INBOX</div>
        <h1>Notifications</h1>
        <p class="muted">
          Assignments, task updates and deadline reminders · {{ unread }} unread
        </p>
      </div>
      <div class="actions">
        <p-button
          label="Refresh"
          icon="pi pi-refresh"
          [outlined]="true"
          (onClick)="load()"
          [disabled]="busy"
        /><p-button
          label="Mark all read"
          (onClick)="mark()"
          [disabled]="busy || !unread"
        />
      </div>
    </div>
    @if (error) {
      <div class="error">{{ error }}</div>
    }
    <section class="panel">
      @if (busy && !items.length) {
        <p class="empty">Loading…</p>
      }
      @for (n of items; track n._id) {
        <div class="feed-row" [class.unread]="!n.isRead">
          <i class="pi pi-bell feed-icon"></i>
          <div class="grow">
            <strong>{{ n.message }}</strong
            ><small>{{ n.createdAt | date: "medium" }} · {{ n.type }}</small>
          </div>
          @if (n.isRead) {
            <p-tag value="Read" severity="secondary" />
          } @else {
            <p-button
              label="Mark read"
              [text]="true"
              (onClick)="mark(n._id)"
              [disabled]="busy"
            />
          }
        </div>
      } @empty {
        @if (!busy) {
          <p class="empty">You're all caught up.</p>
        }
      }
    </section>`,
})
export class NotificationsPage implements OnInit, OnDestroy {
  private api = inject(Api);
  items: Notice[] = [];
  unread = 0;
  busy = false;
  error = "";
  private timer?: ReturnType<typeof setInterval>;
  ngOnInit() {
    void this.load();
    this.timer = setInterval(() => {
      if (!this.busy) void this.load();
    }, 15000);
  }
  ngOnDestroy() {
    clearInterval(this.timer);
  }
  async load() {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    try {
      const r = await this.api.notices();
      this.items = r.notifications;
      this.unread = r.unreadCount;
    } catch (e) {
      this.error = errorText(e);
    } finally {
      this.busy = false;
    }
  }
  async mark(id?: string) {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    try {
      await (id ? this.api.read(id) : this.api.readAll());
    } catch (e) {
      this.error = errorText(e);
      this.busy = false;
      return;
    }
    this.busy = false;
    await this.load();
  }
}
@Component({
  standalone: true,
  imports: [DatePipe, ButtonModule],
  template: `<div class="page-head">
      <div>
        <div class="eyebrow">AUDIT TRAIL</div>
        <h1>Activity</h1>
        <p class="muted">Latest 50 visible task events.</p>
      </div>
      <p-button
        label="Refresh"
        icon="pi pi-refresh"
        [loading]="busy"
        (onClick)="load()"
      />
    </div>
    @if (error) {
      <div class="error">{{ error }}</div>
    }
    <section class="panel">
      @for (a of items; track a._id) {
        <div class="feed-row">
          <i class="pi pi-history feed-icon"></i>
          <div>
            <strong>{{ a.message }}</strong
            ><small>{{ a.event }} · {{ a.createdAt | date: "medium" }}</small>
          </div>
        </div>
      } @empty {
        <p class="empty">
          {{ busy ? "Loading…" : "No visible activity yet." }}
        </p>
      }
    </section>`,
})
export class ActivityPage implements OnInit {
  private api = inject(Api);
  items: Activity[] = [];
  error = "";
  busy = false;
  ngOnInit() {
    void this.load();
  }
  async load() {
    this.busy = true;
    this.error = "";
    try {
      this.items = (await this.api.activity()).activities;
    } catch (e) {
      this.error = errorText(e);
    } finally {
      this.busy = false;
    }
  }
}
@Component({
  standalone: true,
  imports: [TableModule, ButtonModule],
  template: `<div class="page-head">
      <div>
        <div class="eyebrow">ADMINISTRATION</div>
        <h1>Team directory</h1>
        <p class="muted">
          Active users available for task assignment. Read-only directory.
        </p>
      </div>
      <p-button
        label="Refresh"
        [loading]="busy"
        icon="pi pi-refresh"
        (onClick)="load()"
      />
    </div>
    @if (error) {
      <div class="error">{{ error }}</div>
    }
    <section class="panel">
      <p-table [value]="people" [loading]="busy" [paginator]="true" [rows]="10"
        ><ng-template #header
          ><tr>
            <th>Name</th>
            <th>User ID</th>
          </tr></ng-template
        ><ng-template #body let-u
          ><tr>
            <td>{{ u.name }}</td>
            <td class="muted">{{ u._id }}</td>
          </tr></ng-template
        ><ng-template #emptymessage
          ><tr>
            <td colspan="2">No active users returned.</td>
          </tr></ng-template
        ></p-table
      >
    </section>`,
})
export class TeamPage implements OnInit {
  private api = inject(Api);
  people: Person[] = [];
  error = "";
  busy = false;
  ngOnInit() {
    void this.load();
  }
  async load() {
    this.busy = true;
    this.error = "";
    try {
      this.people = (await this.api.users()).users;
    } catch (e) {
      this.error = errorText(e);
    } finally {
      this.busy = false;
    }
  }
}
