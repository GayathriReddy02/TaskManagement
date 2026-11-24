import { Component, inject, OnInit, OnDestroy } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { SelectModule } from "primeng/select";
import { InputTextModule } from "primeng/inputtext";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { Api, Auth, errorText } from "../core/api";
import { Job, statuses, priorities } from "../core/models";
@Component({
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    ButtonModule,
    SelectModule,
    InputTextModule,
    TableModule,
    TagModule,
  ],
  template: `<div class="page-head">
      <div>
        <div class="eyebrow">REPORTING & BACKGROUND WORK</div>
        <h1>Reports & jobs</h1>
        <p class="muted">
          Generate exports and monitor asynchronous processing.
        </p>
      </div>
      <p-button
        label="Refresh"
        icon="pi pi-refresh"
        [outlined]="true"
        (onClick)="load()"
        [disabled]="busy"
      />
    </div>
    @if (error) {
      <div role="alert" class="error">{{ error }}</div>
    }
    @if (info) {
      <div class="success">{{ info }}</div>
    }
    <section class="panel">
      <h2>Generate a report</h2>
      <p class="muted">
        Export all visible tasks, or narrow the export using filters below.
      </p>
      <div class="filter-grid">
        <label
          >Status<p-select
            [options]="statuses"
            [(ngModel)]="filters.status"
            [showClear]="true"
            placeholder="All" /></label
        ><label
          >Priority<p-select
            [options]="priorities"
            [(ngModel)]="filters.priority"
            [showClear]="true"
            placeholder="All" /></label
        ><label
          >Search<input
            pInputText
            [(ngModel)]="filters.search"
            maxlength="150" /></label
        ><label
          >Tags<input
            pInputText
            [(ngModel)]="filters.tags"
            maxlength="150" /></label
        ><label
          >Due from<input
            pInputText
            type="date"
            [(ngModel)]="filters.fromDate" /></label
        ><label
          >Due to<input pInputText type="date" [(ngModel)]="filters.toDate"
        /></label>
      </div>
      <div class="actions">
        <p-button
          label="Export CSV"
          icon="pi pi-file-excel"
          (onClick)="generate('csv')"
          [disabled]="submitting"
        /><p-button
          label="Export JSON"
          icon="pi pi-code"
          [outlined]="true"
          (onClick)="generate('json')"
          [disabled]="submitting"
        /><p-button
          label="Task summary"
          icon="pi pi-chart-bar"
          [outlined]="true"
          (onClick)="generate('summary')"
          [disabled]="submitting"
        />
      </div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h2>Background jobs</h2>
        <small class="muted">Refreshes every 5 seconds</small>
      </div>
      <p-table
        [value]="jobs"
        [scrollable]="true"
        [tableStyle]="{ 'min-width': '760px' }"
        [paginator]="true"
        [rows]="10"
        [loading]="busy && !jobs.length"
        ><ng-template #header
          ><tr>
            <th>Job</th>
            <th>Status</th>
            <th>Attempts</th>
            <th>Created</th>
            <th>Details</th>
            <th>File</th>
          </tr></ng-template
        ><ng-template #body let-j
          ><tr>
            <td>
              <strong>{{ j.type }}</strong
              ><small class="job-id">{{ j.id }}</small>
            </td>
            <td>
              <p-tag [value]="j.status" [severity]="severity(j.status)" />
            </td>
            <td>{{ j.attempts }} / {{ j.maxRetries + 1 }}</td>
            <td>{{ j.createdAt | date: "short" }}</td>
            <td>
              <small>{{ j.error || j.errors?.at(-1)?.message || "—" }}</small>
              @if (j.nextRetryAt) {
                <small class="job-id"
                  >Retry: {{ j.nextRetryAt | date: "mediumTime" }}</small
                >
              }
              @if (j.result?.filename) {
                <small class="job-id">{{ j.result.filename }}</small>
              }
            </td>
            <td>
              @if (
                j.type === "report" &&
                j.status === "completed" &&
                j.ownerId === auth.user()?.id
              ) {
                <p-button
                  label="Download"
                  icon="pi pi-download"
                  [text]="true"
                  (onClick)="download(j)"
                />
              } @else {
                —
              }
            </td>
          </tr></ng-template
        ><ng-template #emptymessage
          ><tr>
            <td colspan="6" class="empty">No jobs recorded yet.</td>
          </tr></ng-template
        ></p-table
      >
      <p class="muted small">
        Job history is in memory and resets when the backend restarts. Only the
        report requester can download its file.
      </p>
    </section>`,
})
export class ReportsPage implements OnInit, OnDestroy {
  private api = inject(Api);
  auth = inject(Auth);
  statuses = statuses;
  priorities = priorities;
  filters = {
    status: "",
    priority: "",
    search: "",
    tags: "",
    fromDate: "",
    toDate: "",
  };
  jobs: Job[] = [];
  error = "";
  info = "";
  busy = false;
  submitting = false;
  private timer?: ReturnType<typeof setInterval>;
  ngOnInit() {
    void this.load();
    this.timer = setInterval(() => {
      if (!this.busy) void this.load();
    }, 5000);
  }
  ngOnDestroy() {
    clearInterval(this.timer);
  }
  async load() {
    if (this.busy) return;
    this.busy = true;
    try {
      this.jobs = (await this.api.jobs()).jobs.sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
    } catch (e) {
      this.error = errorText(e);
    } finally {
      this.busy = false;
    }
  }
  async generate(format: string) {
    this.submitting = true;
    this.error = "";
    this.info = "";
    try {
      const filters: Record<string, string> = {};
      for (const [key, value] of Object.entries(this.filters))
        if (value?.trim()) filters[key] = value.trim();
      const r = await this.api.report(format, filters);
      this.info = "Report queued. Job " + r.job.id;
      await this.load();
    } catch (e) {
      this.error = errorText(e);
    } finally {
      this.submitting = false;
    }
  }
  severity(s: string): "success" | "danger" | "info" | "warn" {
    return s === "completed"
      ? "success"
      : s === "failed"
        ? "danger"
        : s === "processing"
          ? "info"
          : "warn";
  }
  async download(j: Job) {
    this.error = "";
    try {
      await this.api.download(j);
    } catch (e) {
      this.error = errorText(e);
    }
  }
}
