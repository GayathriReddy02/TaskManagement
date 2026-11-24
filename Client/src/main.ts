import { bootstrapApplication } from "@angular/platform-browser";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideRouter } from "@angular/router";
import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { providePrimeNG } from "primeng/config";
import Aura from "@primeng/themes/aura";
import { authInterceptor } from "./app/core/api";
import { routes } from "./app/routes";
@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet],
  template: "<router-outlet />",
})
class AppComponent {}
bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: { preset: Aura, options: { darkModeSelector: ".dark" } },
    }),
  ],
}).catch(console.error);
