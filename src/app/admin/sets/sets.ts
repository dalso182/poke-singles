import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { SetsService } from '../../core/catalog/sets.service';
import type { SetRow } from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-admin-sets',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
  ],
  templateUrl: './sets.html',
  styleUrl: './sets.scss',
})
export class Sets {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SetsService);
  private readonly snack = inject(MatSnackBar);

  protected readonly rows = signal<SetRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal<string | null>(null);
  protected readonly expandedId = signal<string | null>(null);
  protected readonly addOpen = signal(false);
  protected readonly displayedColumns = ['symbol', 'code', 'name', 'series', 'release_date', 'actions'];

  protected readonly addForm: FormGroup = this.fb.nonNullable.group({
    code: ['', Validators.required],
    name: ['', Validators.required],
    series: [''],
    release_date: [''],
    symbol_image_url: [''],
  });

  protected readonly editForms = new Map<string, FormGroup>();

  constructor() {
    this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const rows = await this.service.list();
      this.rows.set(rows);
      this.editForms.clear();
      for (const row of rows) {
        this.editForms.set(
          row.id,
          this.fb.nonNullable.group({
            name: [row.name, Validators.required],
            series: [row.series ?? ''],
            release_date: [row.release_date ?? ''],
            symbol_image_url: [row.symbol_image_url ?? ''],
          }),
        );
      }
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected formFor(id: string): FormGroup {
    return this.editForms.get(id)!;
  }

  protected toggleExpanded(id: string): void {
    this.expandedId.update((current) => (current === id ? null : id));
  }

  protected async onAdd(): Promise<void> {
    if (this.addForm.invalid) return;
    this.saving.set('__new__');
    try {
      const raw = this.addForm.getRawValue();
      await this.service.create({
        code: raw.code,
        name: raw.name,
        series: raw.series || null,
        release_date: raw.release_date || null,
        symbol_image_url: raw.symbol_image_url || null,
      });
      this.addForm.reset({
        code: '',
        name: '',
        series: '',
        release_date: '',
        symbol_image_url: '',
      });
      this.addOpen.set(false);
      await this.refresh();
      this.snack.open('Set creado', 'OK', { duration: 3000 });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(null);
    }
  }

  protected async onSave(row: SetRow): Promise<void> {
    const form = this.editForms.get(row.id);
    if (!form || form.invalid) return;
    this.saving.set(row.id);
    try {
      const raw = form.getRawValue();
      await this.service.update(row.id, {
        name: raw.name,
        series: raw.series || null,
        release_date: raw.release_date || null,
        symbol_image_url: raw.symbol_image_url || null,
      });
      this.snack.open('Set actualizado', 'OK', { duration: 3000 });
      await this.refresh();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(null);
    }
  }

  protected async onDelete(row: SetRow): Promise<void> {
    if (!confirm(`¿Eliminar el set "${row.name}"? Sólo se permite si no tiene productos.`)) {
      return;
    }
    this.saving.set(row.id);
    try {
      const result = await this.service.deleteIfEmpty(row.id);
      if (!result.deleted) {
        this.snack.open(
          `No se eliminó: el set tiene ${result.productCount} producto(s) asociado(s).`,
          'OK',
          { duration: 5000 },
        );
      } else {
        this.snack.open('Set eliminado', 'OK', { duration: 3000 });
        await this.refresh();
      }
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(null);
    }
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
