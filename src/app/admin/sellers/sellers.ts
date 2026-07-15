import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { SellersService } from '../../core/catalog/sellers.service';
import type { SellerRow } from '../../core/catalog/catalog.types';
import { PageHeader } from '../../shared/table/page-header/page-header';
import { TableCard } from '../../shared/table/table-card/table-card';
import { EditableInput } from '../../shared/table/controls/editable-input/editable-input';
import { ToggleSwitch } from '../../shared/table/controls/toggle-switch/toggle-switch';
import { Btn } from '../../shared/table/controls/btn/btn';

@Component({
  selector: 'app-admin-sellers',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    PageHeader,
    TableCard,
    EditableInput,
    ToggleSwitch,
    Btn,
  ],
  templateUrl: './sellers.html',
  styleUrl: './sellers.scss',
})
export class Sellers {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SellersService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly rows = signal<SellerRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal<string | null>(null);
  protected readonly addOpen = signal(false);
  protected readonly displayedColumns = ['code', 'name', 'email', 'phone', 'active', 'actions'];

  // `code` is create-only: product slugs and order snapshots embed it, so it
  // has no inline edit (mirrors how categories lock `slug`).
  protected readonly addForm: FormGroup = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9]{2}$/)]],
    name: ['', Validators.required],
    email: ['', Validators.email],
    phone: [''],
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
            email: [row.email ?? '', Validators.email],
            phone: [row.phone ?? ''],
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

  /** Per-seller consignment view (Sellado payouts / Singles). */
  protected goToView(id: string): void {
    this.router.navigate(['/admin/sellers', id]);
  }

  protected val(id: string, name: string): string {
    return String(this.formFor(id).get(name)!.value ?? '');
  }
  protected setText(id: string, name: string, value: string): void {
    const c = this.formFor(id).get(name)!;
    c.setValue(value);
    c.markAsDirty();
  }

  protected async onAdd(): Promise<void> {
    if (this.addForm.invalid) return;
    this.saving.set('__new__');
    try {
      const raw = this.addForm.getRawValue();
      await this.service.create({
        code: raw.code,
        name: raw.name.trim(),
        email: raw.email.trim() || null,
        phone: raw.phone.trim() || null,
      });
      this.addForm.reset({ code: '', name: '', email: '', phone: '' });
      this.addOpen.set(false);
      await this.refresh();
      this.snack.open('Vendedor creado', 'OK', { duration: 3000 });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(null);
    }
  }

  protected async onSave(row: SellerRow): Promise<void> {
    const form = this.editForms.get(row.id);
    if (!form || form.invalid) return;
    this.saving.set(row.id);
    try {
      const raw = form.getRawValue();
      await this.service.update(row.id, {
        name: raw.name.trim(),
        email: raw.email.trim() || null,
        phone: raw.phone.trim() || null,
      });
      this.snack.open('Vendedor actualizado', 'OK', { duration: 3000 });
      await this.refresh();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(null);
    }
  }

  protected async onToggleActive(row: SellerRow, active: boolean): Promise<void> {
    this.saving.set(row.id);
    try {
      await this.service.setActive(row.id, active);
      await this.refresh();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(null);
    }
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      const msg = String((err as { message: unknown }).message);
      // Friendlier text for the unique-code violation.
      if (msg.includes('sellers_code_key')) return 'Ese código ya está en uso por otro vendedor.';
      return msg;
    }
    return 'Error desconocido';
  }
}
