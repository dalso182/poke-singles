import {
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { StaticPagesService } from '../../core/catalog/static-pages.service';
import type { StaticPageRow } from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-static-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './static-page.html',
  styleUrl: './static-page.scss',
})
export class StaticPage implements OnInit {
  /** Bound from /info/:slug via withComponentInputBinding(). */
  readonly slug = input.required<string>();

  private readonly service = inject(StaticPagesService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly page = signal<StaticPageRow | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);

  protected readonly safeContent = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.page()?.content ?? ''),
  );

  constructor() {
    // Refetch when the slug changes (navigating between info pages
    // without leaving the route).
    effect(() => {
      const s = this.slug();
      if (s) void this.fetch(s);
    });
  }

  ngOnInit(): void {
    // Initial fetch is handled by the slug effect above.
  }

  private async fetch(slug: string): Promise<void> {
    this.loading.set(true);
    this.notFound.set(false);
    this.page.set(null);
    try {
      const row = await this.service.getBySlug(slug);
      if (!row) {
        this.notFound.set(true);
      } else {
        this.page.set(row);
      }
    } catch {
      this.notFound.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
