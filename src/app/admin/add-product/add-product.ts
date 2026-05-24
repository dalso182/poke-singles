import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Card } from '@tcgdex/sdk';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CardTypeahead } from '../../shared/card-typeahead/card-typeahead';
import { SetTypeahead } from '../../shared/set-typeahead/set-typeahead';
import {
  ImagePickerDialog,
  type ImagePickerResult,
} from '../../shared/image-picker/image-picker-dialog';
import { ImageBrowserService } from '../../core/images/image-browser.service';
import { resolveHostedSrc, tcgdexImageToHostedPath } from '../../core/images/card-image-url';
import { CategoriesService } from '../../core/catalog/categories.service';
import { CardTypesService } from '../../core/catalog/card-types.service';
import { ProductsService } from '../../core/catalog/products.service';
import { RafflesService } from '../../core/catalog/raffles.service';
import { SetsService } from '../../core/catalog/sets.service';
import { TcgdexCardsService } from '../../core/catalog/tcgdex-cards.service';
import { AppSettingsService } from '../../core/settings/app-settings.service';
import { LocalStorageService } from '../../core/storage/local-storage.service';
import {
  CONDITION_OPTIONS,
  LANGUAGE_OPTIONS,
  VARIANT_OPTIONS,
} from '../../core/catalog/catalog.types';
import type { CardTypeRow, CategoryRow, SetRow, VariantCode } from '../../core/catalog/catalog.types';

const PICKER_SET_STORAGE_KEY = 'admin:add-product:picker-set-id';

@Component({
  selector: 'app-add-product',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CardTypeahead,
    SetTypeahead,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './add-product.html',
  styleUrl: './add-product.scss',
})
export class AddProduct {
  private readonly fb = inject(FormBuilder);
  private readonly products = inject(ProductsService);
  private readonly raffles = inject(RafflesService);
  private readonly categories = inject(CategoriesService);
  private readonly cardTypes = inject(CardTypesService);
  private readonly sets = inject(SetsService);
  private readonly tcgdexCards = inject(TcgdexCardsService);
  private readonly settings = inject(AppSettingsService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly imageBrowser = inject(ImageBrowserService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly storage = inject(LocalStorageService);

  protected readonly imagePickerEnabled = this.imageBrowser.isEnabled();

  protected readonly conditions = CONDITION_OPTIONS;
  protected readonly languages = LANGUAGE_OPTIONS;
  protected readonly categoriesList = signal<CategoryRow[]>([]);
  protected readonly cardTypesList = signal<CardTypeRow[]>([]);
  protected readonly selectedCardTypeIds = signal<Set<string>>(new Set());
  private readonly setsById = signal<Map<string, SetRow>>(new Map());
  protected readonly selectedCard = signal<Card | null>(null);
  // True once the form preview <img> fails to load — i.e. the hosted image
  // isn't on our server yet. Reset on each card selection.
  protected readonly previewMissing = signal(false);

  /** Direct TCGplayer product URL for the picked card, when it has pricing data. */
  protected readonly tcgplayerUrl = computed(() => {
    const card = this.selectedCard();
    const id = card ? this.firstTcgplayerVariant(card)?.productId : null;
    return id ? `https://www.tcgplayer.com/product/${id}` : null;
  });
  protected readonly manualMode = signal(false);
  protected readonly saving = signal(false);
  protected readonly hasCategories = computed(() => this.categoriesList().length > 0);

  /** Mirrors the category_id control so `isRaffle` can react to selection. */
  protected readonly selectedCategoryId = signal<string>('');
  /** True when the chosen category is the "Rifas" bucket — reveals the raffle
   *  fields (draw date + notes). */
  protected readonly isRaffle = computed(() => {
    const id = this.selectedCategoryId();
    if (!id) return false;
    return this.categoriesList().find((c) => c.slug === 'rifas')?.id === id;
  });

  // Optional set filter for the TCGdex card picker. Holds a Supabase set_id (UUID);
  // we resolve its TCGdex code through `setsById` to feed `card-typeahead`.
  // Persisted in localStorage so an admin adding several cards from one set keeps
  // the filter across page loads — cleared via the X button on the SetTypeahead.
  protected readonly pickerSetId = signal<string | null>(
    this.storage.get(PICKER_SET_STORAGE_KEY),
  );
  protected readonly pickerSetCode = computed<string | null>(() => {
    const id = this.pickerSetId();
    if (!id) return null;
    return this.setsById().get(id)?.code ?? null;
  });

  // When a TCGdex card is selected, narrow the dropdown to the variants the
  // card actually has (boolean true). In manual mode show all options.
  protected readonly variantOptions = computed(() => {
    const card = this.selectedCard();
    if (!card) return VARIANT_OPTIONS;
    const variants = (card as { variants?: Partial<Record<VariantCode, boolean>> }).variants;
    if (!variants) return VARIANT_OPTIONS;
    const allowed = VARIANT_OPTIONS.filter((opt) => variants[opt.value] === true);
    return allowed.length > 0 ? allowed : VARIANT_OPTIONS;
  });

  protected readonly form: FormGroup = this.fb.nonNullable.group({
    name: ['', Validators.required],
    pokemon_name: [''],
    rarity: [''],
    card_number: [''],
    image_url: [''],
    slug: [
      { value: '', disabled: true },
      [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)],
    ],
    set_id: [null as string | null],
    category_id: ['', Validators.required],
    condition: ['NM'],
    language: ['EN', Validators.required],
    variant: [''],
    price: [0, [Validators.required, Validators.min(0)]],
    sale_price: [null as number | null, [Validators.min(0.01)]],
    quantity: [1, [Validators.required, Validators.min(0)]],
    featured: [false],
    // Raffle-only fields, shown when the selected category is "Rifas".
    // `description` is the raffle notes (stays on the product); `draw_at` is the
    // scheduled draw date, persisted to the raffles table on submit.
    description: [''],
    draw_at: [null as string | null],
    market_price: [null as number | null, [Validators.min(0)]],
    // TCGdex-derived metadata. Not rendered as form inputs — patched by
    // `onCardSelected` and serialised on submit. Manual mode leaves them null.
    tcgdex_id: [null as string | null],
    illustrator: [null as string | null],
    regulation_mark: [null as string | null],
    category: [null as string | null],
    stage: [null as string | null],
    type1: [null as string | null],
    type2: [null as string | null],
    legal_standard: [null as boolean | null],
    legal_expanded: [null as boolean | null],
  }, { validators: salePriceBelowPrice });

  constructor() {
    this.bootstrap();
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.refreshSlug();
        this.selectedCategoryId.set(this.form.get('category_id')!.value ?? '');
      });
    effect(() => this.storage.set(PICKER_SET_STORAGE_KEY, this.pickerSetId()));
  }

  private async bootstrap(): Promise<void> {
    try {
      const [cats, sets, types] = await Promise.all([
        this.categories.list({ activeOnly: true }),
        this.sets.list(),
        this.cardTypes.list({ activeOnly: true }),
      ]);
      this.categoriesList.set(cats);
      this.setsById.set(new Map(sets.map((s) => [s.id, s])));
      this.cardTypesList.set(types);
      // "Agregar rifa" deep-links here with ?category=rifas — preselect the
      // Rifas category so the Datos de la rifa section is revealed.
      if (this.route.snapshot.queryParamMap.get('category') === 'rifas') {
        const rifas = cats.find((c) => c.slug === 'rifas');
        if (rifas) this.form.patchValue({ category_id: rifas.id });
      }
      this.refreshSlug();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
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
  }

  protected async onCardSelected(card: Card): Promise<void> {
    this.selectedCard.set(card);
    this.previewMissing.set(false);
    this.form.patchValue({
      name: card.name,
      pokemon_name: card.name, // user can refine; trigger lowercase+trims server-side
      rarity: card.rarity ?? '',
      card_number: card.localId ?? '',
      // Point at our self-hosted copy (relative path), not the TCGdex CDN.
      image_url: tcgdexImageToHostedPath(card.image),
      variant: this.defaultVariantFor(card),
      tcgdex_id: card.id,
      illustrator: card.illustrator ?? null,
      regulation_mark: card.regulationMark ?? null,
      category: card.category ?? null,
      stage: card.stage ?? null,
      type1: card.types?.[0] ?? null,
      type2: card.types?.[1] ?? null,
      legal_standard: card.legal?.standard ?? null,
      legal_expanded: card.legal?.expanded ?? null,
    });
    // Default to the "Singles" category for TCGdex picks unless the admin
    // already chose something else. Looked up by slug so renaming the display
    // name doesn't break this.
    if (!this.form.get('category_id')!.value) {
      const singles = this.categoriesList().find((c) => c.slug.toLowerCase() === 'singles');
      if (singles) this.form.patchValue({ category_id: singles.id });
    }
    // Suggest a price from the TCGplayer market value (USD) × exchange rate,
    // rounded up to the nearest ₡100. Skipped silently if the card has no
    // pricing or no exchange rate is configured — the admin can still type it.
    try {
      const usd = this.tcgplayerMarketUsd(card);
      if (usd) {
        const { exchange_rate_usd_crc: rate } = await this.settings.get();
        if (rate && rate > 0) {
          this.form.patchValue({ price: Math.ceil((usd * rate) / 100) * 100 });
        }
      }
    } catch {
      // Best-effort suggestion; ignore and leave the price for manual entry.
    }
    // Cache the full TCGdex payload so the detail page can read attacks /
    // abilities / weaknesses without round-tripping to TCGdex on every view.
    // The `tcgdex_id` FK on `products` references this row, so we upsert
    // before submit to satisfy the constraint.
    try {
      await this.tcgdexCards.upsert(card.id, card);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    }
    try {
      const setRow = await this.sets.findOrCreateFromTcgdex(card);
      // Make sure the freshly-created set is in our id→row map so the slug
      // computation can resolve its code on the next change.
      const next = new Map(this.setsById());
      next.set(setRow.id, setRow);
      this.setsById.set(next);
      this.form.patchValue({ set_id: setRow.id });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    }
  }

  /** First TCGplayer variant object on the card payload (skips metadata keys). */
  private firstTcgplayerVariant(
    card: Card,
  ): { productId?: number | null; marketPrice?: number | null } | null {
    const tp = (card as unknown as {
      pricing?: { tcgplayer?: Record<string, unknown> };
    }).pricing?.tcgplayer;
    if (!tp) return null;
    for (const [key, val] of Object.entries(tp)) {
      if (key === 'updated' || key === 'unit') continue;
      if (val && typeof val === 'object') {
        return val as { productId?: number | null; marketPrice?: number | null };
      }
    }
    return null;
  }

  /** First available TCGplayer market price (USD) on the card payload, if any. */
  private tcgplayerMarketUsd(card: Card): number | null {
    const price = this.firstTcgplayerVariant(card)?.marketPrice;
    return typeof price === 'number' && price > 0 ? price : null;
  }

  /** Pre-fill with the first available variant, preferring `normal` if present. */
  private defaultVariantFor(card: Card): VariantCode | '' {
    const variants = (card as { variants?: Partial<Record<VariantCode, boolean>> }).variants;
    if (!variants) return '';
    if (variants.normal) return 'normal';
    const first = (Object.keys(variants) as VariantCode[]).find((k) => variants[k] === true);
    return first ?? '';
  }

  /**
   * Resolve the image_url control value to a loadable preview src: relative
   * `/card-images/...` paths are made absolute against the hosted origin so the
   * preview loads from our server; picker/manual absolute URLs pass through.
   */
  protected previewSrc(value: string | null | undefined): string | null {
    return value ? resolveHostedSrc(value, this.imageBrowser.origin) : null;
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

  protected enableManualMode(): void {
    this.manualMode.set(true);
    this.selectedCard.set(null);
    this.selectedCardTypeIds.set(new Set());
    this.form.reset({
      name: '',
      pokemon_name: '',
      rarity: '',
      card_number: '',
      image_url: '',
      set_id: null,
      category_id: '',
      condition: 'NM',
      language: 'EN',
      variant: '',
      price: 0,
      sale_price: null,
      quantity: 1,
      featured: false,
      description: '',
      draw_at: null,
      market_price: null,
      tcgdex_id: null,
      illustrator: null,
      regulation_mark: null,
      category: null,
      stage: null,
      type1: null,
      type2: null,
      legal_standard: null,
      legal_expanded: null,
    });
  }

  private refreshSlug(): void {
    const next = this.computeSlug();
    const slug = this.form.controls['slug'];
    if (slug.value !== next) {
      slug.setValue(next, { emitEvent: false });
    }
  }

  private computeSlug(): string {
    const raw = this.form.getRawValue();
    const setCode = raw.set_id ? this.setsById().get(raw.set_id)?.code ?? '' : '';
    // English is the default — only suffix when the listing is non-EN.
    const langSuffix = raw.language && raw.language !== 'EN' ? raw.language : '';
    const parts = [
      raw.name ?? '',
      raw.card_number ?? '',
      setCode,
      raw.variant ?? '',
      raw.condition ?? '',
      langSuffix,
    ].filter(Boolean);
    return parts
      .join('-')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const inUse = await this.products.slugInUse(raw.slug);
      if (inUse) {
        this.form.get('slug')!.setErrors({ duplicate: true });
        this.snack.open('Ese slug ya está en uso. Edítalo y reintenta.', 'OK', { duration: 5000 });
        return;
      }
      const created = await this.products.create({
        name: raw.name,
        pokemon_name: raw.pokemon_name || null,
        slug: raw.slug,
        rarity: raw.rarity || null,
        card_number: raw.card_number || null,
        image_url: raw.image_url || null,
        category_id: raw.category_id,
        set_id: raw.set_id || null,
        condition: raw.condition || null,
        language: raw.language,
        variant: raw.variant || null,
        price: Number(raw.price),
        sale_price: toNullableNumber(raw.sale_price),
        quantity: Number(raw.quantity),
        featured: raw.featured,
        description: raw.description || null,
        tcgdex_id: raw.tcgdex_id || null,
        illustrator: raw.illustrator || null,
        regulation_mark: raw.regulation_mark || null,
        category: raw.category || null,
        stage: raw.stage || null,
        type1: raw.type1 || null,
        type2: raw.type2 || null,
        legal_standard: raw.legal_standard,
        legal_expanded: raw.legal_expanded,
      });
      await this.products.setCardTypes(created.id, [...this.selectedCardTypeIds()]);
      if (this.isRaffle()) {
        await this.raffles.upsert(created.id, {
          draw_at: raw.draw_at || null,
          market_price: toNullableNumber(raw.market_price),
        });
      }
      this.snack.open('Producto creado', 'Editar', { duration: 5000 })
        .onAction()
        .subscribe(() => this.router.navigate(['/admin/products', created.id, 'edit']));
      this.resetForNext();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }

  private resetForNext(): void {
    this.selectedCard.set(null);
    this.selectedCardTypeIds.set(new Set());
    this.form.reset({
      name: '',
      pokemon_name: '',
      rarity: '',
      card_number: '',
      image_url: '',
      set_id: null,
      category_id: this.form.get('category_id')!.value, // keep last category
      condition: 'NM',
      language: this.form.get('language')!.value, // keep last language
      variant: '',
      price: 0,
      sale_price: null,
      quantity: 1,
      featured: false,
      description: '',
      draw_at: null,
      market_price: null,
      tcgdex_id: null,
      illustrator: null,
      regulation_mark: null,
      category: null,
      stage: null,
      type1: null,
      type2: null,
      legal_standard: null,
      legal_expanded: null,
    });
    this.manualMode.set(false);
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
