import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CategoriesService } from '../../core/catalog/categories.service';
import { ProductsService } from '../../core/catalog/products.service';
import { SetsService } from '../../core/catalog/sets.service';
import {
  CONDITION_OPTIONS,
  LANGUAGE_OPTIONS,
} from '../../core/catalog/catalog.types';
import type {
  CategoryRow,
  ProductRow,
  SetRow,
} from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-admin-product-edit',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
  ],
  templateUrl: './product-edit.html',
  styleUrl: './product-edit.scss',
})
export class ProductEdit {
  readonly id = input.required<string>();

  private readonly fb = inject(FormBuilder);
  private readonly products = inject(ProductsService);
  private readonly categories = inject(CategoriesService);
  private readonly sets = inject(SetsService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly conditions = CONDITION_OPTIONS;
  protected readonly languages = LANGUAGE_OPTIONS;
  protected readonly categoriesList = signal<CategoryRow[]>([]);
  protected readonly setsList = signal<SetRow[]>([]);
  protected readonly product = signal<ProductRow | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly notFound = signal(false);

  protected readonly form: FormGroup = this.fb.nonNullable.group({
    name: ['', Validators.required],
    pokemon_name: [''],
    slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
    description: [''],
    rarity: [''],
    card_number: [''],
    image_url: [''],
    category_id: ['', Validators.required],
    condition: [''],
    language: ['EN', Validators.required],
    price: [0, [Validators.required, Validators.min(0)]],
    quantity: [0, [Validators.required, Validators.min(0)]],
    active: [true],
  });

  constructor() {
    this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.loading.set(true);
    try {
      const [cats, sets, product] = await Promise.all([
        this.categories.list(),
        this.sets.list(),
        this.products.get(this.id()),
      ]);
      this.categoriesList.set(cats);
      this.setsList.set(sets);
      if (!product) {
        this.notFound.set(true);
        return;
      }
      this.product.set(product);
      this.form.patchValue({
        name: product.name,
        pokemon_name: product.pokemon_name ?? '',
        slug: product.slug,
        description: product.description ?? '',
        rarity: product.rarity ?? '',
        card_number: product.card_number ?? '',
        image_url: product.image_url ?? '',
        category_id: product.category_id,
        condition: product.condition ?? '',
        language: product.language,
        price: product.price,
        quantity: product.quantity,
        active: product.active,
      });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected setLabel(setId: string | null): string {
    if (!setId) return '—';
    const s = this.setsList().find((x) => x.id === setId);
    return s ? `${s.code} — ${s.name}` : '—';
  }

  protected async onSave(): Promise<void> {
    if (this.form.invalid) return;
    const product = this.product();
    if (!product) return;
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      if (raw.slug !== product.slug) {
        const inUse = await this.products.slugInUse(raw.slug, product.id);
        if (inUse) {
          this.form.get('slug')!.setErrors({ duplicate: true });
          this.snack.open('Ese slug ya está en uso por otro producto.', 'OK', { duration: 5000 });
          return;
        }
      }
      const updated = await this.products.update(product.id, {
        name: raw.name,
        pokemon_name: raw.pokemon_name || null,
        slug: raw.slug,
        description: raw.description || null,
        rarity: raw.rarity || null,
        card_number: raw.card_number || null,
        image_url: raw.image_url || null,
        category_id: raw.category_id,
        condition: raw.condition || null,
        language: raw.language,
        price: Number(raw.price),
        quantity: Number(raw.quantity),
        active: raw.active,
      });
      this.product.set(updated);
      this.form.markAsPristine();
      this.snack.open('Producto actualizado', 'OK', { duration: 3000 });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }

  protected async onDeactivate(): Promise<void> {
    const product = this.product();
    if (!product) return;
    if (!confirm('¿Desactivar este producto? No será visible para los clientes.')) return;
    this.saving.set(true);
    try {
      await this.products.setActive(product.id, false);
      this.snack.open('Producto desactivado', 'OK', { duration: 3000 });
      this.router.navigate(['/admin/products']);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }

  protected goBack(): void {
    this.router.navigate(['/admin/products']);
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
