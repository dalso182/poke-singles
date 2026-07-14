import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  type AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AnnouncementsService } from '../../core/catalog/announcements.service';
import {
  ImagePickerDialog,
  type ImagePickerResult,
} from '../../shared/image-picker/image-picker-dialog';
import { LabeledToggle } from '../../shared/table/controls/labeled-toggle/labeled-toggle';
import { BackHeader } from '../../shared/forms/back-header/back-header';
import { FormSection } from '../../shared/forms/form-section/form-section';
import { FormGrid } from '../../shared/forms/form-grid/form-grid';
import { FormFooter } from '../../shared/forms/form-footer/form-footer';
import { RichTextEditor } from '../../shared/forms/rich-text-editor/rich-text-editor';
import { Btn } from '../../shared/table/controls/btn/btn';
import type { AnnouncementInsert } from '../../core/catalog/catalog.types';

/** link_label is required as soon as link_path is set (and vice-versa the
 *  button simply doesn't render without both, so only this direction errors). */
function linkLabelRequired(group: AbstractControl): ValidationErrors | null {
  const path = group.get('link_path')?.value?.trim();
  const label = group.get('link_label')?.value?.trim();
  return path && !label ? { linkLabelRequired: true } : null;
}

@Component({
  selector: 'app-admin-announcement-edit',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
    LabeledToggle,
    BackHeader,
    FormSection,
    FormGrid,
    FormFooter,
    RichTextEditor,
    Btn,
  ],
  templateUrl: './announcement-edit.html',
  styleUrl: './announcement-edit.scss',
})
export class AnnouncementEdit implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(AnnouncementsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly id = signal<string | null>(null);
  protected readonly mode = computed<'new' | 'edit'>(() =>
    this.id() ? 'edit' : 'new',
  );
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly imageUrl = signal<string | null>(null);

  protected readonly form: FormGroup = this.fb.nonNullable.group(
    {
      title: ['', Validators.required],
      body_html: [''],
      link_path: ['', Validators.pattern(/^\/[a-z0-9\-\/?=&]*$/)],
      link_label: [''],
      is_active: [false],
    },
    { validators: linkLabelRequired },
  );

  /** Live preview of the modal body, same trust model as page-edit. */
  private readonly bodyValue = toSignal(
    this.form.controls['body_html'].valueChanges,
    { initialValue: this.form.controls['body_html'].value as string },
  );

  protected readonly previewHtml = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.bodyValue() ?? ''),
  );

  /** CTA button in the preview — mirrors the modal's rule: rendered only when
   *  both link fields are filled. (Entendido is modal chrome, not content, so
   *  it stays out of the preview.) */
  private readonly linkPathValue = toSignal(
    this.form.controls['link_path'].valueChanges,
    { initialValue: this.form.controls['link_path'].value as string },
  );
  private readonly linkLabelValue = toSignal(
    this.form.controls['link_label'].valueChanges,
    { initialValue: this.form.controls['link_label'].value as string },
  );
  protected readonly previewLinkLabel = computed<string | null>(() => {
    const path = (this.linkPathValue() ?? '').trim();
    const label = (this.linkLabelValue() ?? '').trim();
    return path && label ? label : null;
  });

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
        this.snack.open('Anuncio no encontrado.', 'OK', { duration: 4000 });
        void this.router.navigate(['/admin/announcements']);
        return;
      }
      this.imageUrl.set(row.image_url);
      this.form.patchValue({
        title: row.title,
        body_html: row.body_html,
        link_path: row.link_path ?? '',
        link_label: row.link_label ?? '',
        is_active: row.is_active,
      });
      this.form.markAsPristine();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected openImagePicker(): void {
    const ref = this.dialog.open<ImagePickerDialog, undefined, ImagePickerResult>(
      ImagePickerDialog,
      { width: '880px', maxWidth: '95vw', autoFocus: 'first-tabbable' },
    );
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.imageUrl.set(result.url);
      this.form.markAsDirty();
    });
  }

  protected clearImage(): void {
    this.imageUrl.set(null);
    this.form.markAsDirty();
  }

  protected cancel(): void {
    void this.router.navigate(['/admin/announcements']);
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const linkPath = String(raw.link_path ?? '').trim();
      const payload: AnnouncementInsert = {
        title: String(raw.title).trim(),
        body_html: raw.body_html ?? '',
        image_url: this.imageUrl(),
        link_path: linkPath || null,
        link_label: linkPath ? String(raw.link_label ?? '').trim() || null : null,
      };

      const id = this.id();
      const saved = id
        ? await this.service.update(id, payload)
        : await this.service.create(payload);

      // Activation goes through activate() so whatever else was live gets
      // deactivated (the single-active unique index would reject it otherwise).
      const wantActive = !!raw.is_active;
      if (wantActive && !saved.is_active) {
        await this.service.activate(saved.id);
      } else if (!wantActive && saved.is_active) {
        await this.service.deactivate(saved.id);
      }

      this.snack.open(id ? 'Anuncio actualizado' : 'Anuncio creado', 'OK', {
        duration: 3000,
      });
      void this.router.navigate(['/admin/announcements']);
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
