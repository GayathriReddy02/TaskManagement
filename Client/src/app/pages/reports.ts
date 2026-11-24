import { Component, inject, OnInit, OnDestroy } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { SelectModule } from "primeng/select";
import { InputTextModule } from "primeng/inputtext";
import { TableModule, TableLazyLoadEvent } from "primeng/table";
import { TagModule } from "primeng/tag";
import { Subscription } from "rxjs";
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
          [outlined]="selectedFormat !== 'csv'"
          (onClick)="generate('csv')"
          [loading]="submittingFormat === 'csv'"
          [disabled]="submitting"
        /><p-button
          label="Export JSON"
          icon="pi pi-code"
          [outlined]="selectedFormat !== 'json'"
          (onClick)="generate('json')"
          [loading]="submittingFormat === 'json'"
          [disabled]="submitting"
        /><p-button
          label="Task summary"
          icon="pi pi-chart-bar"
          [outlined]="selectedFormat !== 'summary'"
          (onClick)="generate('summary')"
          [loading]="submittingFormat === 'summary'"
          [disabled]="submitting"
        />
      </div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h2>Background jobs</h2>
        <small class="muted">{{ activeCount ? "Refreshing active reports every 5 seconds" : "No active reports" }}</small>
      </div>
      <p-table
        [value]="jobs"
        [scrollable]="true"
        [tableStyle]="{ 'min-width': '760px' }"
        [paginator]="true"
        [rows]="limit"
        [first]="(page - 1) * limit"
        [totalRecords]="total"
        [rowsPerPageOptions]="[10, 25, 50]"
        [lazy]="true"
        [lazyLoadOnInit]="false"
        (onLazyLoad)="paginate($event)"
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
        Job history is temporary and may expire or be removed under capacity pressure.
        Only the report requester can download its file.
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
  submittingFormat: "csv" | "json" | "summary" | null = null;
  selectedFormat: "csv" | "json" | "summary" = "csv";
  page = 1;
  limit = 10;
  total = 0;
  activeCount = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private request?: Subscription;
  private destroyed = false;
  ngOnInit() { this.load(); }
  ngOnDestroy() {
    this.destroyed = true;
    clearTimeout(this.timer);
    this.request?.unsubscribe();
  }
  paginate(event: TableLazyLoadEvent) {
    this.limit = event.rows ?? 10;
    this.page = Math.floor((event.first ?? 0) / this.limit) + 1;
    this.load();
  }
  private schedule() {
    if (!this.destroyed && this.activeCount > 0)
      this.timer = setTimeout(() => this.load(), 5000);
  }
  load() {
    if (this.destroyed) return;
    clearTimeout(this.timer);
    this.request?.unsubscribe();
    this.busy = true;
    this.request = this.api.jobs(this.page, this.limit).subscribe({
      next: (r) => {
        this.busy = false;
        this.total = r.total;
        this.activeCount = r.activeCount;
        this.error = "";
        const last = Math.max(1, Math.ceil(r.total / this.limit));
        if (this.page > last) { this.page = last; this.load(); return; }
        this.jobs = r.jobs;
        this.schedule();
      },
      error: (e) => {
        this.busy = false;
        this.error = errorText(e);
        this.schedule();
      },
    });
  }
  async generate(format: "csv" | "json" | "summary") {
    this.selectedFormat = format;
    this.submitting = true;
    this.submittingFormat = format;
    this.error = "";
    this.info = "";
    try {
      const filters: Record<string, string> = {};
      for (const [key, value] of Object.entries(this.filters))
        if (value?.trim()) filters[key] = value.trim();
      const r = await this.api.report(format, filters);
      if (this.destroyed) return;
      this.info = "Report queued. Job " + r.job.id;
      this.activeCount = Math.max(1, this.activeCount);
      this.page = 1;
      this.load();
    } catch (e) {
      this.error = errorText(e);
    } finally {
      this.submitting = false;
      this.submittingFormat = null;
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
