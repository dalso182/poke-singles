import {
  Component,
  OnInit,
  computed,
  inject,
  input,
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
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SetTypeahead } from '../../shared/set-typeahead/set-typeahead';
import { LabeledToggle } from '../../shared/table/controls/labeled-toggle/labeled-toggle';
import { Btn } from '../../shared/table/controls/btn/btn';
import { BackHeader } from '../../shared/forms/back-header/back-header';
import { FormSection } from '../../shared/forms/form-section/form-section';
import { FormGrid } from '../../shared/forms/form-grid/form-grid';
import {
  ImagePickerDialog,
  type ImagePickerResult,
} from '../../shared/image-picker/image-picker-dialog';
import { ImageBrowserService } from '../../core/images/image-browser.service';
import { CategoriesService } from '../../core/catalog/categories.service';
import { CardTypesService } from '../../core/catalog/card-types.service';
import { ProductsService } from '../../core/catalog/products.service';
import { RafflesService } from '../../core/catalog/raffles.service';
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

/** Card-only fields (Pokémon, rareza, número, condición, variante, tipos de carta)
 *  describe individual cards, so they're shown only for these category slugs
 *  (graded cards are still single cards). */
const CARD_CATEGORY_SLUGS = ['singles', 'graded'];

@Component({
  selector: 'app-admin-product-edit',
  imports: [
    ReactiveFormsModule,
    SetTypeahead,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTooltipModule,
    LabeledToggle,
    Btn,
    BackHeader,
    FormSection,
    FormGrid,
  ],
  templateUrl: './product-edit.html',
  styleUrl: './product-edit.scss',
})
export class ProductEdit implements OnInit {
  readonly id = input.required<string>();

  private readonly fb = inject(FormBuilder);
  private readonly products = inject(ProductsService);
  private readonly raffles = inject(RafflesService);
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
  /** Single sub-type selection for sealed/accessories (one per product). */
  protected readonly selectedSubtypeId = signal<string | null>(null);
  protected readonly product = signal<ProductRow | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly notFound = signal(false);

  /** Mirrors the category_id control so `isRaffle` reacts to selection. */
  protected readonly selectedCategoryId = signal<string>('');
  /** True when the chosen category is the "Rifas" bucket — reveals the raffle
   *  fields (draw date + notes). */
  protected readonly isRaffle = computed(() => {
    const id = this.selectedCategoryId();
    if (!id) return false;
    return this.categoriesList().find((c) => c.slug === 'rifas')?.id === id;
  });
  /** True when the chosen category is one where card-only fields make sense
   *  (Singles / Graded) — gates Pokémon, rareza, número, condición, variante. */
  protected readonly isCardCategory = computed(() => {
    const id = this.selectedCategoryId();
    if (!id) return false;
    const slug = this.categoriesList().find((c) => c.id === id)?.slug;
    return slug !== undefined && CARD_CATEGORY_SLUGS.includes(slug);
  });
  /** Slug of the chosen category (or null). */
  protected readonly selectedCategorySlug = computed(() => {
    const id = this.selectedCategoryId();
    return id ? this.categoriesList().find((c) => c.id === id)?.slug ?? null : null;
  });
  /** Global Rareza tags (category_id NULL) — the singles/graded multi-select. */
  protected readonly globalCardTypes = computed(() =>
    this.cardTypesList().filter((t) => t.category_id === null),
  );
  /** Sub-types scoped to the chosen category — the sealed/accessories list. */
  protected readonly subtypeOptions = computed(() =>
    this.cardTypesList().filter((t) => t.category_id === this.selectedCategoryId()),
  );
  /** True when the category uses a single-select sub-type (sealed/accessories). */
  protected readonly isSubtypeCategory = computed(() => {
    const slug = this.selectedCategorySlug();
    return slug === 'sellado' || slug === 'accesorios';
  });
  /** True when there are card types to assign AND the category is a card one —
   *  gates the "Tipos de carta" panel. */
  protected readonly showCardTypes = computed(
    () => this.globalCardTypes().length > 0 && this.isCardCategory(),
  );
  /** Gates the single-select "Sub-tipo" panel for sealed/accessories. */
  protected readonly showSubtype = computed(
    () => this.isSubtypeCategory() && this.subtypeOptions().length > 0,
  );

  protected readonly form: FormGroup = this.fb.nonNullable.group(
    {
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
      sale_price: [null as number | null, [Validators.min(0.01)]],
      quantity: [0, [Validators.required, Validators.min(0)]],
      active: [true],
      featured: [false],
      // Raffle draw date (native date input → 'YYYY-MM-DD'), persisted to the
      // raffles table. Only shown when category is "Rifas"; notes reuse description.
      draw_at: [null as string | null],
      market_price: [null as number | null, [Validators.min(0)]],
    },
    { validators: salePriceBelowPrice },
  );

  ngOnInit(): void {
    // Required input bindings (`id`) aren't set until after construction when
    // routed via `withComponentInputBinding()`, so kick off loading here.
    this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.loading.set(true);
    try {
      const [cats, types, product, assignedTypeIds, raffleRow] = await Promise.all([
        this.categories.list(),
        this.cardTypes.list({ activeOnly: true }),
        this.products.get(this.id()),
        this.products.getCardTypeIds(this.id()),
        this.raffles.get(this.id()),
      ]);
      this.categoriesList.set(cats);
      this.cardTypesList.set(types);
      this.selectedCardTypeIds.set(new Set(assignedTypeIds));
      // Same junction backs the single sub-type; a sealed/accessory product has
      // at most one assigned id.
      this.selectedSubtypeId.set(assignedTypeIds[0] ?? null);
      if (!product) {
        this.notFound.set(true);
        return;
      }
      this.product.set(product);
      this.selectedCategoryId.set(product.category_id);
      this.patchFormFromProduct(product);
      this.form.patchValue({
        // From the raffles row; stored at UTC midnight, take the date portion.
        draw_at: raffleRow?.draw_at ? raffleRow.draw_at.slice(0, 10) : null,
        market_price: raffleRow?.market_price ?? null,
      });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  /** Patch the form's product-derived controls from a ProductRow. Raffle-only
   *  fields (draw_at / market_price) live in the raffles table and are patched
   *  separately, so they're intentionally excluded here. */
  private patchFormFromProduct(p: ProductRow): void {
    this.form.patchValue({
      name: p.name,
      pokemon_name: p.pokemon_name ?? '',
      slug: p.slug,
      description: p.description ?? '',
      rarity: p.rarity ?? '',
      card_number: p.card_number ?? '',
      image_url: p.image_url ?? '',
      set_id: p.set_id,
      category_id: p.category_id,
      condition: p.condition ?? '',
      language: p.language,
      variant: p.variant ?? '',
      price: p.price,
      sale_price: p.sale_price,
      quantity: p.quantity,
      active: p.active,
      featured: p.featured,
    });
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

  protected onSubtypeChange(id: string | null): void {
    this.selectedSubtypeId.set(id);
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
      // Non-card categories (Sellado, Accesorios…) hide the card-only fields, so
      // don't persist their leftover values — clear the card columns.
      const isCard = this.isCardCategory();
      const updated = await this.products.update(product.id, {
        name: raw.name,
        pokemon_name: isCard ? raw.pokemon_name || null : null,
        slug: raw.slug,
        description: raw.description || null,
        rarity: isCard ? raw.rarity || null : null,
        card_number: isCard ? raw.card_number || null : null,
        image_url: raw.image_url || null,
        set_id: raw.set_id || null,
        category_id: raw.category_id,
        condition: isCard ? raw.condition || null : null,
        language: raw.language,
        variant: isCard ? raw.variant || null : null,
        price: Number(raw.price),
        sale_price: toNullableNumber(raw.sale_price),
        quantity: Number(raw.quantity),
        active: raw.active,
        featured: raw.featured,
      });
      if (this.isRaffle()) {
        await this.raffles.upsert(product.id, {
          draw_at: raw.draw_at || null,
          market_price: toNullableNumber(raw.market_price),
        });
      }
      // Singles/graded → multi Rareza; sealed/accesorios → one sub-type; else none.
      const typeIds = isCard
        ? [...this.selectedCardTypeIds()]
        : this.isSubtypeCategory() && this.selectedSubtypeId()
          ? [this.selectedSubtypeId()!]
          : [];
      await this.products.setCardTypes(product.id, typeIds);
      this.product.set(updated);
      // Repaint the form from the canonical saved row. Price/sale_price/quantity
      // each have two inputs bound to the same control (quick-update card + the
      // Comercio card); without this patch the non-edited input keeps its stale
      // view after save. Also surfaces server normalization (e.g. pokemon_name).
      this.patchFormFromProduct(updated);
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

function salePriceBelowPrice(group: AbstractControl): ValidationErrors | null {
  const price = Number(group.get('price')?.value);
  const sale = group.get('sale_price')?.value;
  if (sale === null || sale === undefined || sale === '') return null;
  return Number(sale) < price ? null : { saleNotBelowPrice: true };
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
