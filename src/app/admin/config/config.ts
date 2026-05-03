import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AppSettingsService } from '../../core/settings/app-settings.service';
import { SetsService } from '../../core/catalog/sets.service';
import type { AppSettingsRow } from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-admin-config',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatSnackBarModule,
  ],
  templateUrl: './config.html',
  styleUrl: './config.scss',
})
export class AdminConfig {
  private readonly fb = inject(FormBuilder);
  private readonly settings = inject(AppSettingsService);
  private readonly sets = inject(SetsService);
  private readonly snack = inject(MatSnackBar);

  protected readonly current = signal<AppSettingsRow | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly importing = signal(false);

  protected readonly form: FormGroup = this.fb.nonNullable.group({
    exchange_rate_usd_crc: [
      null as number | null,
      [Validators.min(0)],
    ],
    maintenance_mode: [false],
    maintenance_message: [''],
  });

  constructor() {
    this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.loading.set(true);
    try {
      const row = await this.settings.get();
      this.current.set(row);
      this.form.patchValue({
        exchange_rate_usd_crc: row.exchange_rate_usd_crc,
        maintenance_mode: row.maintenance_mode,
        maintenance_message: row.maintenance_message ?? '',
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
