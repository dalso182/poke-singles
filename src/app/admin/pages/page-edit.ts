import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { StaticPagesService } from '../../core/catalog/static-pages.service';
import { LabeledToggle } from '../../shared/table/controls/labeled-toggle/labeled-toggle';
import { BackHeader } from '../../shared/forms/back-header/back-header';
import { FormSection } from '../../shared/forms/form-section/form-section';
import { FormGrid } from '../../shared/forms/form-grid/form-grid';
import { FormFooter } from '../../shared/forms/form-footer/form-footer';
import type {
  StaticPageInsert,
  StaticPageRow,
} from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-admin-page-edit',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
    LabeledToggle,
    BackHeader,
    FormSection,
    FormGrid,
    FormFooter,
  ],
  templateUrl: './page-edit.html',
  styleUrl: './page-edit.scss',
})
export class PageEdit implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(StaticPagesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly id = signal<string | null>(null);
  protected readonly mode = computed<'new' | 'edit'>(() =>
    this.id() ? 'edit' : 'new',
  );
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly originalSlug = signal<string | null>(null);

  protected readonly form: FormGroup = this.fb.nonNullable.group({
    slug: [
      '',
      [
        Validators.required,
        Validators.minLength(2),
        Validators.pattern(/^[a-z0-9-]+$/),
      ],
    ],
    title: ['', Validators.required],
    meta_description: [''],
    is_published: [true],
    sort_order: [0, [Validators.required, Validators.min(0)]],
    content: [''],
  });

  /** Live HTML preview signal — fed by the content textarea's value
   *  changes. We trust admin-authored markup (admins-only RLS) and
   *  bypass the security check so tags render as HTML. */
  private readonly contentValue = toSignal(
    this.form.controls['content'].valueChanges,
    { initialValue: this.form.controls['content'].value as string },
  );

  protected readonly previewHtml = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.contentValue() ?? ''),
  );

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.id.set(id);
      void this.loadExisting(id);
    }
  }

  private async loadExisting(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const row = await this.service.getById(id);
      if (!row) {
        this.snack.open('Página no encontrada.', 'OK', { duration: 4000 });
        void this.router.navigate(['/admin/pages']);
        return;
      }
      this.originalSlug.set(row.slug);
      this.form.patchValue({
        slug: row.slug,
        title: row.title,
        meta_description: row.meta_description ?? '',
        is_published: row.is_published,
        sort_order: row.sort_order,
        content: row.content,
      });
      // Slug is read-only on edit so live URLs don't break.
      this.form.controls['slug'].disable({ emitEvent: false });
      this.form.markAsPristine();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected onSlugBlur(): void {
    const ctrl = this.form.controls['slug'];
    const next = (ctrl.value ?? '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (next !== ctrl.value) ctrl.setValue(next, { emitEvent: false });
  }

  protected cancel(): void {
    void this.router.navigate(['/admin/pages']);
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const payload: StaticPageInsert = {
        slug: String(raw.slug).trim().toLowerCase(),
        title: String(raw.title).trim(),
        content: raw.content ?? '',
        meta_description: raw.meta_description?.trim() || null,
        is_published: !!raw.is_published,
        sort_order: Number(raw.sort_order) || 0,
      };

      const id = this.id();
      let saved: StaticPageRow;
      if (id) {
        // Slug is locked on edit — strip it from the patch so we don't
        // accidentally try to update it.
        const { slug: _slug, ...patch } = payload;
        saved = await this.service.update(id, patch);
        this.snack.open('Página actualizada', 'OK', { duration: 3000 });
      } else {
        saved = await this.service.create(payload);
        this.snack.open('Página creada', 'OK', { duration: 3000 });
      }
      void this.router.navigate(['/admin/pages']);
      void saved;
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
