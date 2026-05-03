import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SetTypeahead } from '../../shared/set-typeahead/set-typeahead';
import {
  ImagePickerDialog,
  type ImagePickerResult,
} from '../../shared/image-picker/image-picker-dialog';
import { ImageBrowserService } from '../../core/images/image-browser.service';
import { CategoriesService } from '../../core/catalog/categories.service';
import { CardTypesService } from '../../core/catalog/card-types.service';
import { ProductsService } from '../../core/catalog/products.service';
import {
  CONDITION_OPTIONS,
  LANGUAGE_OPTIONS,
  VARIANT_OPTIONS,
} from '../../core/catalog/catalog.types';
import type {
  CardTypeRow,
  CategoryRow,
  ProductRow,
} from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-admin-product-edit',
  imports: [
    ReactiveFormsModule,
    SetTypeahead,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './product-edit.html',
  styleUrl: './product-edit.scss',
})
export class ProductEdit implements OnInit {
  readonly id = input.required<string>();

  private readonly fb = inject(FormBuilder);
  private readonly products = inject(ProductsService);
  private readonly categories = inject(CategoriesService);
  private readonly cardTypes = inject(CardTypesService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly imageBrowser = inject(ImageBrowserService);

  protected readonly imagePickerEnabled = this.imageBrowser.isEnabled();

  protected readonly conditions = CONDITION_OPTIONS;
  protected readonly languages = LANGUAGE_OPTIONS;
  protected readonly variants = VARIANT_OPTIONS;
  protected readonly categoriesList = signal<CategoryRow[]>([]);
  protected readonly cardTypesList = signal<CardTypeRow[]>([]);
  protected readonly selectedCardTypeIds = signal<Set<string>>(new Set());
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
    set_id: [null as string | null],
    category_id: ['', Validators.required],
    condition: [''],
    language: ['EN', Validators.required],
    variant: [''],
    price: [0, [Validators.required, Validators.min(0)]],
    quantity: [0, [Validators.required, Validators.min(0)]],
    active: [true],
  });

  ngOnInit(): void {
    // Required input bindings (`id`) aren't set until after construction when
    // routed via `withComponentInputBinding()`, so kick off loading here.
    this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.loading.set(true);
    try {
      const [cats, types, product, assignedTypeIds] = await Promise.all([
        this.categories.list(),
        this.cardTypes.list({ activeOnly: true }),
        this.products.get(this.id()),
        this.products.getCardTypeIds(this.id()),
      ]);
      this.categoriesList.set(cats);
      this.cardTypesList.set(types);
      this.selectedCardTypeIds.set(new Set(assignedTypeIds));
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
        set_id: product.set_id,
        category_id: product.category_id,
        condition: product.condition ?? '',
        language: product.language,
        variant: product.variant ?? '',
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

  protected isCardTypeSelected(id: string): boolean {
    return this.selectedCardTypeIds().has(id);
  }

  protected toggleCardType(id: string, checked: boolean): void {
    const next = new Set(this.selectedCardTypeIds());
    if (checked) next.add(id);
    else next.delete(id);
    this.selectedCardTypeIds.set(next);
    // Card-type changes don't touch the FormGroup, so the Guardar button
    // (gated on form.pristine) wouldn't enable otherwise.
    this.form.markAsDirty();
  }

  protected openImagePicker(): void {
    const ref = this.dialog.open<ImagePickerDialog, undefined, ImagePickerResult>(
      ImagePickerDialog,
      { width: '880px', maxWidth: '95vw', autoFocus: 'first-tabbable' },
    );
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.form.patchValue({ image_url: result.url });
      this.form.get('image_url')!.markAsDirty();
    });
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
        set_id: raw.set_id || null,
        category_id: raw.category_id,
        condition: raw.condition || null,
        language: raw.language,
        variant: raw.variant || null,
        price: Number(raw.price),
        quantity: Number(raw.quantity),
        active: raw.active,
      });
      await this.products.setCardTypes(product.id, [...this.selectedCardTypeIds()]);
      this.product.set(updated);
      this.form.markAsPristine();
      this.snack.open('Producto actualizado', 'Volver', { duration: 5000 })
        .onAction()
        .subscribe(() => this.goBack());
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
