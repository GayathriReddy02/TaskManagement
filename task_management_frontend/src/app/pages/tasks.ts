import { Component, inject, OnInit } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { TextareaModule } from "primeng/textarea";
import { SelectModule } from "primeng/select";
import { TableModule } from "primeng/table";
import { DialogModule } from "primeng/dialog";
import { TagModule } from "primeng/tag";
import { PaginatorModule, PaginatorState } from "primeng/paginator";
import { Api, Auth, errorText } from "../core/api";
import {
  Task,
  TaskInput,
  Person,
  Status,
  statuses,
  priorities,
} from "../core/models";
@Component({
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    TableModule,
    DialogModule,
    TagModule,
    PaginatorModule,
  ],
  template: `<div class="page-head">
      <div>
        <div class="eyebrow">TASK MANAGEMENT</div>
        <h1>{{ auth.user()?.role === "admin" ? "All tasks" : "My tasks" }}</h1>
        <p class="muted">Manage work, priorities and deadlines.</p>
      </div>
      <p-button label="New task" icon="pi pi-plus" (onClick)="edit()" />
    </div>
    @if (error) {
      <div role="alert" class="error">{{ error }}</div>
    }
    @if (info) {
      <div role="status" class="success">{{ info }}</div>
    }
    <section class="panel filters">
      <div class="filter-grid">
        <label
          >Search<input
            pInputText
            [(ngModel)]="filters.search"
            maxlength="150"
            placeholder="Title or description"
            (keyup.enter)="apply()" /></label
        ><label
          >Status<p-select
            [(ngModel)]="filters.status"
            [options]="statuses"
            [showClear]="true"
            placeholder="All statuses" /></label
        ><label
          >Priority<p-select
            [(ngModel)]="filters.priority"
            [options]="priorities"
            [showClear]="true"
            placeholder="All priorities" /></label
        ><label
          >Tags<input
            pInputText
            [(ngModel)]="filters.tags"
            maxlength="150"
            placeholder="Comma separated" /></label
        ><label
          >Due from<input
            pInputText
            type="date"
            [(ngModel)]="filters.fromDate" /></label
        ><label
          >Due to<input
            pInputText
            type="date"
            [(ngModel)]="filters.toDate" /></label
        ><label
          >Sort by<p-select
            [(ngModel)]="filters.sortBy"
            [options]="sortOptions"
            optionLabel="label"
            optionValue="value" /></label
        ><label
          >Order<p-select
            [(ngModel)]="filters.order"
            [options]="orderOptions"
            optionLabel="label"
            optionValue="value"
        /></label>
      </div>
      <div class="actions">
        <p-button
          label="Apply filters"
          icon="pi pi-filter"
          (onClick)="apply()"
          [disabled]="busy"
        /><p-button
          label="Reset"
          [text]="true"
          (onClick)="reset()"
          [disabled]="busy"
        />
      </div>
    </section>
    <section class="panel">
      <div class="section-head">
        <h2>Task list</h2>
        <span class="muted">{{ total }} records</span>
      </div>
      <p-table
        [value]="tasks"
        [loading]="busy"
        [scrollable]="true"
        [tableStyle]="{ 'min-width': '850px' }"
        ><ng-template #header
          ><tr>
            <th>Task</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Due date</th>
            <th>Assignee</th>
            <th>Actions</th>
          </tr></ng-template
        ><ng-template #body let-t
          ><tr>
            <td>
              <button class="text-link" (click)="view(t)">{{ t.title }}</button>
              <div class="tag-line">{{ t.tags.join(" · ") }}</div>
            </td>
            <td>
              <p-tag [value]="t.status" [severity]="severity(t.status)" />
            </td>
            <td>
              <p-tag
                [value]="t.priority"
                [severity]="
                  t.priority === 'High'
                    ? 'danger'
                    : t.priority === 'Medium'
                      ? 'warn'
                      : 'secondary'
                "
              />
            </td>
            <td>
              {{ t.dueDate ? (t.dueDate | date: "mediumDate" : "UTC") : "—" }}
            </td>
            <td>{{ person(t.assignedTo) }}</td>
            <td>
              <div class="row-actions">
                <p-button
                  icon="pi pi-eye"
                  ariaLabel="View task"
                  [text]="true"
                  (onClick)="view(t)"
                /><p-button
                  icon="pi pi-check-circle"
                  ariaLabel="Update status"
                  [text]="true"
                  (onClick)="changeStatus(t)"
                />
                @if (canEdit(t)) {
                  <p-button
                    icon="pi pi-pencil"
                    ariaLabel="Edit task"
                    [text]="true"
                    (onClick)="edit(t)"
                  /><p-button
                    icon="pi pi-user-plus"
                    ariaLabel="Assign task"
                    [text]="true"
                    (onClick)="assign(t)"
                  /><p-button
                    icon="pi pi-trash"
                    ariaLabel="Delete task"
                    severity="danger"
                    [text]="true"
                    (onClick)="remove(t)"
                  />
                }
              </div>
            </td></tr></ng-template
        ><ng-template #emptymessage
          ><tr>
            <td colspan="6" class="empty">
              No tasks found. Create a task or change your filters.
            </td>
          </tr></ng-template
        ></p-table
      ><p-paginator
        [first]="(page - 1) * limit"
        [rows]="limit"
        [totalRecords]="total"
        [rowsPerPageOptions]="[10, 20, 50]"
        (onPageChange)="paginate($event)"
      />
    </section>
    <p-dialog
      [(visible)]="visible"
      [modal]="true"
      [header]="dialogTitle"
      [style]="{ width: 'min(94vw, 560px)' }"
      [closable]="!saving"
    >
      @if (dialogError) {
        <div class="error">{{ dialogError }}</div>
      }
      @if (mode === "view" && selected) {
        <div class="details">
          <h2>{{ selected.title }}</h2>
          <p>{{ selected.description || "No description" }}</p>
          <div><b>Status:</b> {{ selected.status }}</div>
          <div><b>Priority:</b> {{ selected.priority }}</div>
          <div>
            <b>Due:</b>
            {{
              selected.dueDate
                ? (selected.dueDate | date: "mediumDate" : "UTC")
                : "—"
            }}
          </div>
          <div><b>Owner:</b> {{ person(selected.createdBy) }}</div>
          <div><b>Assignee:</b> {{ person(selected.assignedTo) }}</div>
          <div><b>Tags:</b> {{ selected.tags.join(", ") || "—" }}</div>
        </div>
      }
      @if (mode === "edit") {
        <form #taskForm="ngForm" (ngSubmit)="save()" class="dialog-form">
          <label
            >Title<input
              pInputText
              name="title"
              [(ngModel)]="draft.title"
              required
              maxlength="150" /></label
          ><label
            >Description<textarea
              pTextarea
              name="description"
              [(ngModel)]="draft.description"
              maxlength="2000"
              rows="4"
            ></textarea>
          </label>
          <div class="two">
            <label
              >Status<p-select
                name="status"
                [options]="statuses"
                [(ngModel)]="draft.status" /></label
            ><label
              >Priority<p-select
                name="priority"
                [options]="priorities"
                [(ngModel)]="draft.priority"
            /></label>
          </div>
          <label
            >Due date<input
              pInputText
              type="date"
              name="dueDate"
              [(ngModel)]="due" /></label
          ><label
            >Tags<input
              pInputText
              name="tags"
              [(ngModel)]="tagText"
              placeholder="design, review"
          /></label>
          <div class="actions">
            <p-button
              label="Cancel"
              [text]="true"
              (onClick)="visible = false"
              [disabled]="saving"
            /><p-button
              label="Save task"
              type="submit"
              [loading]="saving"
              [disabled]="taskForm.invalid || saving"
            />
          </div>
        </form>
      }
      @if (mode === "status") {
        <label
          >New status<p-select [(ngModel)]="newStatus" [options]="statuses"
        /></label>
        <div class="actions">
          <p-button
            label="Update status"
            [loading]="saving"
            (onClick)="save()"
          />
        </div>
      }
      @if (mode === "assign") {
        <label
          >Assign to<p-select
            [(ngModel)]="assignee"
            [options]="people"
            optionLabel="name"
            optionValue="_id"
            placeholder="Select an active user"
            [filter]="true"
        /></label>
        <div class="actions">
          <p-button
            label="Assign task"
            [loading]="saving"
            [disabled]="!assignee"
            (onClick)="save()"
          />
        </div>
      }
      @if (mode === "delete") {
        <p>
          Delete <strong>{{ selected?.title }}</strong
          >? This cannot be undone.
        </p>
        <div class="actions">
          <p-button
            label="Cancel"
            [text]="true"
            [disabled]="saving"
            (onClick)="visible = false"
          /><p-button
            label="Delete task"
            severity="danger"
            [loading]="saving"
            (onClick)="save()"
          />
        </div>
      }
    </p-dialog>`,
})
export class TasksPage implements OnInit {
  api = inject(Api);
  auth = inject(Auth);
  statuses = statuses;
  priorities = priorities;
  sortOptions = [
    { label: "Created date", value: "createdAt" },
    { label: "Due date", value: "dueDate" },
    { label: "Priority", value: "priority" },
  ];
  orderOptions = [
    { label: "Descending", value: "desc" },
    { label: "Ascending", value: "asc" },
  ];
  filters = this.defaults();
  tasks: Task[] = [];
  people: Person[] = [];
  total = 0;
  page = 1;
  limit = 10;
  busy = false;
  error = "";
  info = "";
  visible = false;
  saving = false;
  dialogError = "";
  mode = "view";
  dialogTitle = "";
  selected?: Task;
  draft: TaskInput = this.blank();
  due = "";
  tagText = "";
  newStatus: Status = "Pending";
  assignee = "";
  defaults() {
    return {
      search: "",
      status: "",
      priority: "",
      tags: "",
      fromDate: "",
      toDate: "",
      sortBy: "createdAt",
      order: "desc",
    };
  }
  blank(): TaskInput {
    return {
      title: "",
      description: "",
      status: "Pending",
      priority: "Medium",
      dueDate: null,
      tags: [],
    };
  }
  ngOnInit() {
    void this.load();
    this.api
      .users()
      .then((r) => (this.people = r.users))
      .catch((e) => (this.error = errorText(e)));
  }
  async load() {
    this.busy = true;
    this.error = "";
    try {
      const params: Record<string, string> = {
        page: String(this.page),
        limit: String(this.limit),
      };
      for (const [key, value] of Object.entries(this.filters))
        if (value?.trim()) params[key] = value.trim();
      const r = await this.api.tasks(params);
      if (!r.tasks.length && r.total > 0 && this.page > r.totalPages) {
        this.page = r.totalPages;
        await this.load();
        return;
      }
      this.tasks = r.tasks;
      this.total = r.total;
    } catch (e) {
      this.error = errorText(e);
    } finally {
      this.busy = false;
    }
  }
  apply() {
    this.page = 1;
    void this.load();
  }
  reset() {
    this.filters = this.defaults();
    this.apply();
  }
  paginate(e: PaginatorState) {
    this.limit = e.rows ?? 10;
    this.page = (e.page ?? 0) + 1;
    void this.load();
  }
  person(id: string | null) {
    return id
      ? this.people.find((p) => p._id === id)?.name || id
      : "Unassigned";
  }
  canEdit(t: Task) {
    return (
      this.auth.user()?.role === "admin" || t.createdBy === this.auth.user()?.id
    );
  }
  severity(s: Status): "success" | "info" | "secondary" {
    return s === "Completed"
      ? "success"
      : s === "In Progress"
        ? "info"
        : "secondary";
  }
  open(mode: string, title: string, t?: Task) {
    this.mode = mode;
    this.dialogTitle = title;
    this.selected = t;
    this.dialogError = "";
    this.visible = true;
  }
  async view(t: Task) {
    this.open("view", "Task details", t);
    try {
      this.selected = (await this.api.task(t._id)).task;
    } catch (e) {
      this.dialogError = errorText(e);
    }
  }
  edit(t?: Task) {
    this.draft = t
      ? {
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          dueDate: null,
          tags: [...t.tags],
        }
      : this.blank();
    this.due = t?.dueDate?.slice(0, 10) || "";
    this.tagText = t?.tags.join(", ") || "";
    this.open("edit", t ? "Edit task" : "Create task", t);
  }
  changeStatus(t: Task) {
    this.newStatus = t.status;
    this.open("status", "Update status", t);
  }
  assign(t: Task) {
    this.assignee = t.assignedTo || "";
    this.open("assign", "Assign task", t);
  }
  remove(t: Task) {
    this.open("delete", "Delete task", t);
  }
  async save() {
    if (this.saving) return;
    this.saving = true;
    this.dialogError = "";
    this.info = "";
    try {
      if (this.mode === "edit") {
        const body = {
          ...this.draft,
          title: this.draft.title.trim(),
          dueDate: this.due || null,
          tags: this.tagText
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        };
        if (!body.title) throw Error("Title is required");
        if (body.tags.length > 20 || body.tags.some((t) => t.length > 40))
          throw Error("Up to 20 tags, each at most 40 characters");
        if (this.selected) await this.api.editTask(this.selected._id, body);
        else await this.api.createTask(body);
      } else if (this.selected) {
        const id = this.selected._id;
        if (this.mode === "status") await this.api.status(id, this.newStatus);
        if (this.mode === "assign") await this.api.assign(id, this.assignee);
        if (this.mode === "delete") await this.api.delete("/tasks/" + id);
      }
      this.visible = false;
      this.info = "Task change saved.";
      await this.load();
    } catch (e) {
      this.dialogError = errorText(e);
    } finally {
      this.saving = false;
    }
  }
}
