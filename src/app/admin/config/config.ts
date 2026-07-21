import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS, MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AppSettingsService } from '../../core/settings/app-settings.service';
import { ImageBrowserService } from '../../core/images/image-browser.service';
import {
  ImagePickerDialog,
  type ImagePickerData,
  type ImagePickerResult,
} from '../../shared/image-picker/image-picker-dialog';
import { LabeledToggle } from '../../shared/table/controls/labeled-toggle/labeled-toggle';
import { PageHeader } from '../../shared/table/page-header/page-header';
import { FormSection } from '../../shared/forms/form-section/form-section';
import { FormGrid } from '../../shared/forms/form-grid/form-grid';
import { Btn } from '../../shared/table/controls/btn/btn';
import { SetsService } from '../../core/catalog/sets.service';
import type { AppSettingsRow } from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-admin-config',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
    LabeledToggle,
    PageHeader,
    FormSection,
    FormGrid,
    Btn,
  ],
  templateUrl: './config.html',
  styleUrl: './config.scss',
  // Zoneless app: async patchValue() doesn't notify CD, so Material's outline
  // labels can stay resting (covering prefilled values) until focused. Always
  // floating the labels keeps the saved values visible on load.
  providers: [
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { floatLabel: 'always' } },
  ],
})
export class AdminConfig {
  private readonly fb = inject(FormBuilder);
  private readonly settings = inject(AppSettingsService);
  private readonly sets = inject(SetsService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly imageBrowser = inject(ImageBrowserService);

  protected readonly current = signal<AppSettingsRow | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly importing = signal(false);
  /** Root-relative /card-images/… path shown on the maintenance page. */
  protected readonly maintenanceImageUrl = signal<string | null>(null);
  protected readonly imagePickerEnabled = this.imageBrowser.isEnabled();

  protected readonly form: FormGroup = this.fb.nonNullable.group({
    exchange_rate_usd_crc: [
      null as number | null,
      [Validators.min(0)],
    ],
    maintenance_mode: [false],
    maintenance_message: [''],
    sinpe_phone: [''],
    whatsapp_number: [''],
    bank_account_info: [''],
    order_notification_recipients: [''],
    price_review_enabled: [true],
    price_review_threshold_pct: [
      10 as number,
      [Validators.required, Validators.min(0.01), Validators.max(100)],
    ],
    price_review_floor_crc: [
      5000 as number,
      [Validators.required, Validators.min(0)],
    ],
    loyalty_enabled: [false],
    loyalty_colones_per_point: [
      1000 as number,
      [Validators.required, Validators.min(1)],
    ],
  });

  constructor() {
    this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.loading.set(true);
    try {
      const row = await this.settings.get();
      this.current.set(row);
      this.maintenanceImageUrl.set(row.maintenance_image_url);
      this.form.patchValue({
        exchange_rate_usd_crc: row.exchange_rate_usd_crc,
        maintenance_mode: row.maintenance_mode,
        maintenance_message: row.maintenance_message ?? '',
        sinpe_phone: row.sinpe_phone ?? '',
        whatsapp_number: row.whatsapp_number ?? '',
        bank_account_info: row.bank_account_info ?? '',
        order_notification_recipients: row.order_notification_recipients ?? '',
        price_review_enabled: row.price_review_enabled,
        price_review_threshold_pct: row.price_review_threshold_pct,
        price_review_floor_crc: row.price_review_floor_crc,
        loyalty_enabled: row.loyalty_enabled,
        loyalty_colones_per_point: row.loyalty_colones_per_point,
      });
      this.form.markAsPristine();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected async onSave(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const updated = await this.settings.update({
        exchange_rate_usd_crc:
          raw.exchange_rate_usd_crc === null || raw.exchange_rate_usd_crc === ''
            ? null
            : Number(raw.exchange_rate_usd_crc),
        maintenance_mode: !!raw.maintenance_mode,
        maintenance_message: raw.maintenance_message?.trim() || null,
        maintenance_image_url: this.maintenanceImageUrl(),
        sinpe_phone: raw.sinpe_phone?.trim() || null,
        whatsapp_number: raw.whatsapp_number?.trim() || null,
        bank_account_info: raw.bank_account_info?.trim() || null,
        order_notification_recipients: (raw.order_notification_recipients ?? '').trim(),
        price_review_enabled: !!raw.price_review_enabled,
        price_review_threshold_pct: Number(raw.price_review_threshold_pct),
        price_review_floor_crc: Number(raw.price_review_floor_crc),
        loyalty_enabled: !!raw.loyalty_enabled,
        loyalty_colones_per_point: Number(raw.loyalty_colones_per_point),
      });
      this.current.set(updated);
      this.form.markAsPristine();
      this.snack.open('Configuración guardada', 'OK', { duration: 3000 });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }

  /** Pick the maintenance-page image; opens inside /card-images/maintenance/. */
  protected openMaintenanceImagePicker(): void {
    const ref = this.dialog.open<ImagePickerDialog, ImagePickerData, ImagePickerResult>(
      ImagePickerDialog,
      {
        width: '880px',
        maxWidth: '95vw',
        autoFocus: 'first-tabbable',
        data: { startPath: 'maintenance' },
      },
    );
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.maintenanceImageUrl.set(result.url);
      this.form.markAsDirty();
    });
  }

  protected clearMaintenanceImage(): void {
    this.maintenanceImageUrl.set(null);
    this.form.markAsDirty();
  }

  protected async onImportTcgdexSets(): Promise<void> {
    if (this.importing()) return;
    if (
      !confirm(
        'Importar todos los sets de TCGdex que aún no existen en la base. Esta operación es típicamente de una sola vez. ¿Continuar?',
      )
    ) {
      return;
    }
    this.importing.set(true);
    try {
      const result = await this.sets.syncFromTcgdex();
      const parts = [`${result.added} sets agregados`];
      if (result.backfilled) parts.push(`${result.backfilled} totales completados`);
      if (result.skipped) parts.push(`${result.skipped} ya existían`);
      if (result.excluded) parts.push(`${result.excluded} excluidos (TCG Pocket)`);
      if (result.failed) parts.push(`${result.failed} fallaron`);
      this.snack.open(parts.join(' · '), 'OK', { duration: 6000 });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.importing.set(false);
    }
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
