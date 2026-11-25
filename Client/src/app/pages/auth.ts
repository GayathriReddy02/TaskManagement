import { Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { PasswordModule } from "primeng/password";
import { Api, Auth, errorText } from "../core/api";

@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    PasswordModule,
  ],
  template: `<main class="auth-layout">
    <section class="auth-main">
      <div class="brand">
        <i class="pi pi-check-square"></i> Taskora<span>.</span>
      </div>
      <div class="auth-form">
        <div class="eyebrow">
          WORKSPACE / {{ register ? "GET STARTED" : "SIGN IN" }}
        </div>
        <h1>{{ register ? "Create your account" : "Welcome back." }}</h1>
        <p class="muted">
          {{
            register
              ? "Make meaningful progress with your team."
              : "Sign in to organize your work and stay on track."
          }}
        </p>
        @if (registeredMessage) {
          <div class="muted" role="status">{{ registeredMessage }}</div>
        } @else {
          <form (ngSubmit)="submit()" #form="ngForm">
            @if (register) {
              <label
                >Full name<input
                  pInputText
                  name="name"
                  [(ngModel)]="name"
                  required
                  maxlength="80"
                  autocomplete="name"
              /></label>
            }
            <label
              >Email address<input
                pInputText
                name="email"
                type="email"
                [(ngModel)]="email"
                required
                email
                autocomplete="email"
            /></label>
            <label
              >Password<p-password
                name="password"
                [(ngModel)]="password"
                [toggleMask]="true"
                [feedback]="register"
                [required]="true"
                [minlength]="register ? 8 : 1"
                maxlength="72"
                [inputStyle]="{ width: '100%' }"
                [style]="{ width: '100%' }"
            /></label>
            @if (register) {
              <small>
                Use at least 8 characters and no more than 72 UTF-8 bytes. New
                accounts are regular users.
              </small>
            }
            @if (error) {
              <div class="error" role="alert">{{ error }}</div>
            }
            <p-button
              type="submit"
              [label]="register ? 'Create account' : 'Sign in'"
              icon="pi pi-arrow-right"
              iconPos="right"
              [loading]="busy"
              [disabled]="form.invalid || busy"
              styleClass="wide"
            />
          </form>
        }
        <p class="muted">
          {{ register ? "Already registered?" : "New to Taskora?" }}
          <a [routerLink]="register ? '/login' : '/register'">{{
            register ? "Sign in" : "Create an account"
          }}</a>
        </p>
      </div>
      <footer>Secure workspace access · Taskora</footer>
    </section>
    <aside class="auth-art">
      <div class="eyebrow">WORK WITH CLARITY</div>
      <h2>Organize.<br />Execute.<br /><em>Achieve.</em></h2>
      <p>One workspace for focused teams and meaningful progress.</p>
      <div class="glass">
        <i class="pi pi-verified"></i>
        <div>
          <strong>Built for team workflows</strong>
          <p>Tasks, activity, reminders and reporting in one place.</p>
        </div>
      </div>
      <small>TASKORA / WORKSPACE EXPERIENCE</small>
    </aside>
  </main>`,
})
export class AuthPage {
  private api = inject(Api);
  private auth = inject(Auth);
  register = !!inject(ActivatedRoute).snapshot.data["register"];
  name = "";
  email = "";
  password = "";
  busy = false;
  error = "";
  registeredMessage = "";

  async submit() {
    if (this.busy) return;
    this.error = "";
    this.busy = true;
    try {
      if (this.register) {
        const response = await this.api.register(
          this.name.trim(),
          this.email.trim(),
          this.password,
        );
        this.registeredMessage = response.message;
      } else {
        const response = await this.api.login(
          this.email.trim(),
          this.password,
        );
        localStorage.setItem("token", response.token);
        await this.auth.accept(response.user);
      }
    } catch (error) {
      this.error = errorText(error);
    } finally {
      this.busy = false;
    }
  }

}
