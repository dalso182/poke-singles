import {
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CouponsService } from '../../core/catalog/coupons.service';
import { LabeledToggle } from '../../shared/table/controls/labeled-toggle/labeled-toggle';
import { BackHeader } from '../../shared/forms/back-header/back-header';
import { FormSection } from '../../shared/forms/form-section/form-section';
import { FormGrid } from '../../shared/forms/form-grid/form-grid';
import { FormFooter } from '../../shared/forms/form-footer/form-footer';
import { CategoriesService } from '../../core/catalog/categories.service';
import type {
  CategoryRow,
  CouponInsert,
  CouponRow,
  CouponType,
} from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-admin-coupon-edit',
  imports: [
    ReactiveFormsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSnackBarModule,
    LabeledToggle,
    BackHeader,
    FormSection,
    FormGrid,
    FormFooter,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './coupon-edit.html',
  styleUrl: './coupon-edit.scss',
})
export class CouponEdit implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(CouponsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  protected readonly id = signal<string | null>(null);
  protected readonly mode = computed<'new' | 'edit'>(() =>
    this.id() ? 'edit' : 'new',
  );
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  /** Options for the category-targeting multi-select. Empty selection = all. */
  protected readonly categories = signal<CategoryRow[]>([]);

  protected readonly form: FormGroup = this.fb.nonNullable.group({
    code: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.pattern(/^[A-Z0-9-]+$/),
      ],
    ],
    type: ['PERCENTAGE' as CouponType, Validators.required],
    discount_value: [0, [Validators.required, Validators.min(0.01)]],
    min_purchase_amount: [null as number | null],
    expires_at: [defaultExpiry(30), Validators.required],
    max_uses_per_user: [1, [Validators.required, Validators.min(1)]],
    is_active: [true],
    // Allow-list of category ids; empty = applies to all categories.
    category_ids: [[] as string[]],
  });

  constructor() {
    // Type-conditional validators: PERCENTAGE caps discount_value at 100;
    // FIXED_ON_THRESHOLD requires min_purchase_amount.
    effect(() => {
      const type = this.form.controls['type'].value as CouponType;
      const dv = this.form.controls['discount_value'];
      const mp = this.form.controls['min_purchase_amount'];
      if (type === 'PERCENTAGE') {
        dv.setValidators([Validators.required, Validators.min(0.01), Validators.max(100)]);
        mp.setValidators([Validators.min(0.01)]);
      } else {
        dv.setValidators([Validators.required, Validators.min(0.01)]);
        mp.setValidators([Validators.required, Validators.min(0.01)]);
      }
      dv.updateValueAndValidity({ emitEvent: false });
      mp.updateValueAndValidity({ emitEvent: false });
    });
  }

  ngOnInit(): void {
    void this.loadCategories();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.id.set(id);
      void this.loadExisting(id);
    }
  }

  private async loadCategories(): Promise<void> {
    try {
      this.categories.set(await this.categoriesService.list());
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    }
  }

  private async loadExisting(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const row = await this.service.get(id);
      if (!row) {
        this.snack.open('Cupón no encontrado.', 'OK', { duration: 4000 });
        void this.router.navigate(['/admin/coupons']);
        return;
      }
      this.form.patchValue({
        code: row.code,
        type: row.type,
        discount_value: row.discount_value,
        min_purchase_amount: row.min_purchase_amount,
        expires_at: new Date(row.expires_at),
        max_uses_per_user: row.max_uses_per_user,
        is_active: row.is_active,
        category_ids: row.category_ids ?? [],
      });
      this.form.markAsPristine();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected onCodeBlur(): void {
    const ctrl = this.form.controls['code'];
    const next = (ctrl.value ?? '').trim().toUpperCase();
    if (next !== ctrl.value) ctrl.setValue(next, { emitEvent: false });
  }

  protected cancel(): void {
    void this.router.navigate(['/admin/coupons']);
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const code = String(raw.code).trim().toUpperCase();
      // Pre-flight uniqueness check; the DB unique constraint is the
      // backstop and will surface its own error if this races.
      const taken = await this.service.existsByCode(code, this.id() ?? undefined);
      if (taken) {
        this.form.controls['code'].setErrors({ duplicate: true });
        this.snack.open('Ese código ya está en uso.', 'OK', { duration: 4000 });
        return;
      }

      const payload: CouponInsert = {
        code,
        type: raw.type,
        discount_value: Number(raw.discount_value),
        min_purchase_amount: raw.min_purchase_amount != null
          ? Number(raw.min_purchase_amount)
          : null,
        expires_at: toIsoDate(raw.expires_at),
        max_uses_per_user: Number(raw.max_uses_per_user),
        is_active: raw.is_active,
        category_ids: raw.category_ids.length ? raw.category_ids : null,
      };

      const id = this.id();
      if (id) {
        await this.service.update(id, payload);
        this.snack.open('Cupón actualizado', 'OK', { duration: 3000 });
      } else {
        await this.service.create(payload);
        this.snack.open('Cupón creado', 'OK', { duration: 3000 });
      }
      void this.router.navigate(['/admin/coupons']);
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

function defaultExpiry(days: number): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  d.setDate(d.getDate() + days);
  return d;
}

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}
