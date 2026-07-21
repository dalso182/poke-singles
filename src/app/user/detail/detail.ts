import {
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import type { Card as TcgdexCard } from '@tcgdex/sdk';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ProductsService } from '../../core/catalog/products.service';
import { TcgdexCardsService } from '../../core/catalog/tcgdex-cards.service';
import { SetsService } from '../../core/catalog/sets.service';
import { CardTypesService } from '../../core/catalog/card-types.service';
import { CartService } from '../../core/cart/cart.service';
import { AppSettingsService } from '../../core/settings/app-settings.service';
import {
  CONDITION_OPTIONS,
  LANGUAGE_OPTIONS,
  VARIANT_OPTIONS,
} from '../../core/catalog/catalog.types';
import type {
  AppSettingsRow,
  CardTypeRow,
  ProductRow,
  SetRow,
} from '../../core/catalog/catalog.types';
import { OrDashPipe } from '../../shared/pipes/or-dash.pipe';
import {
  EnergyChip,
  energyTypeColor,
  energyTypeFg,
  energyTypeName,
} from '../../shared/energy-chip/energy-chip';

@Component({
  selector: 'app-detail',
  imports: [
    RouterLink,
    DecimalPipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    OrDashPipe,
    EnergyChip,
  ],
  templateUrl: './detail.html',
  styleUrl: './detail.scss',
})
export class Detail implements OnInit {
  readonly slug = input.required<string>();

  private readonly products = inject(ProductsService);
  private readonly tcgdexCards = inject(TcgdexCardsService);
  private readonly sets = inject(SetsService);
  private readonly cardTypes = inject(CardTypesService);
  private readonly cart = inject(CartService);
  private readonly settings = inject(AppSettingsService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly product = signal<ProductRow | null>(null);
  protected readonly card = signal<TcgdexCard | null>(null);
  protected readonly set = signal<SetRow | null>(null);
  protected readonly tags = signal<CardTypeRow[]>([]);
  protected readonly settingsRow = signal<AppSettingsRow | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  /** Quantity to add — driven by the buy-panel stepper, clamped to [1, stock]. */
  protected readonly qty = signal(1);

  /** Pokémon-only sections (combat) are hidden for Trainer / Stadium / Energy cards.
   *  `card.category` is the TCGdex value; `ProductRow.category` mirrors it at import,
   *  so the fallback covers a transient card-fetch miss. Pre-orders → both null → hidden. */
  protected readonly isPokemon = computed(
    () =>
      ((this.card() as { category?: string } | null)?.category ??
        this.product()?.category) === 'Pokemon',
  );

  protected readonly attacks = computed(
    () => (this.card() as { attacks?: TcgdexAttack[] } | null)?.attacks ?? [],
  );
  protected readonly abilities = computed(
    () => (this.card() as { abilities?: TcgdexAbility[] } | null)?.abilities ?? [],
  );
  protected readonly weaknesses = computed(
    () =>
      (this.card() as { weaknesses?: TcgdexTypedValue[] } | null)?.weaknesses ?? [],
  );
  protected readonly resistances = computed(
    () =>
      (this.card() as { resistances?: TcgdexTypedValue[] } | null)?.resistances ?? [],
  );
  protected readonly rules = computed(
    () => (this.card() as { rules?: string[] } | null)?.rules ?? [],
  );
  protected readonly item = computed(
    () => (this.card() as { item?: { name: string; effect: string } } | null)?.item ?? null,
  );
  protected readonly cardEffect = computed(
    () => (this.card() as { effect?: string } | null)?.effect ?? null,
  );

  /** First weakness/resistance — the design surfaces one of each. */
  protected readonly weakness = computed(() => this.weaknesses()[0] ?? null);
  protected readonly resistance = computed(() => this.resistances()[0] ?? null);

  /** Retreat cost as a fixed-length array so the template can `@for` colorless chips. */
  protected readonly retreatChips = computed(() => {
    const r = (this.card() as { retreat?: number } | null)?.retreat;
    return r && r > 0 ? Array.from({ length: r }) : [];
  });

  /** Hero/HP-bar type — prefer the catalog's type1, fall back to TCGdex types. */
  protected readonly primaryType = computed(
    () =>
      this.product()?.type1 ??
      (this.card() as { types?: string[] } | null)?.types?.[0] ??
      null,
  );

  /** First Pokédex number — the design shows a single `#dex` value. */
  protected readonly dexNumber = computed(
    () => (this.card() as { dexId?: number[] } | null)?.dexId?.[0] ?? null,
  );

  /** "Pedir fotos adicionales" → WhatsApp, mirroring the header/footer number
   *  (configured in app_settings, with the store's number as fallback). */
  protected readonly whatsappLink = computed(() => {
    const num = (this.settingsRow()?.whatsapp_number ?? '50663452039').replace(/\D/g, '');
    const p = this.product();
    const ref = p?.card_number ? ` ${this.set()?.name ?? ''} #${p.card_number}`.trimEnd() : '';
    const text = encodeURIComponent(
      `Hola, quiero más fotos de ${p?.name ?? 'esta carta'}${ref}.`,
    );
    return `https://wa.me/${num}?text=${text}`;
  });

  private readonly LANGUAGES = new Map(LANGUAGE_OPTIONS.map((o) => [o.value, o.label]));
  private readonly VARIANTS = new Map(VARIANT_OPTIONS.map((o) => [o.value, o.label]));
  // Descriptive half of each condition label, e.g. "NM" → "Near Mint".
  private readonly CONDITION_SUBS = new Map<string, string>(
    CONDITION_OPTIONS.map((o) => [o.value, o.label.split(' — ')[1] ?? o.label]),
  );

  ngOnInit(): void {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      const product = await this.products.getBySlug(this.slug());
      if (!product) {
        this.notFound.set(true);
        return;
      }
      // Raffles have no detail page — bounce a raffle slug to /rifas.
      if (product.category_id === (await this.products.raffleCategoryId())) {
        void this.router.navigate(['/rifas']);
        return;
      }
      // Auctions have their own detail page — redirect to it.
      if (product.category_id === (await this.products.auctionCategoryId())) {
        void this.router.navigate(['/subastas', product.slug]);
        return;
      }
      this.product.set(product);

      // Run the supporting fetches in parallel. SetsService.list() and
      // CardTypesService.list() both hit cached signals on subsequent
      // navigations, so this is cheap on repeat visits. App settings (for the
      // WhatsApp number) is guarded so a settings hiccup never breaks the page.
      const [tcgdexRow, sets, types, assignedIds, settings] = await Promise.all([
        product.card_ref
          ? this.tcgdexCards.get(product.card_ref)
          : Promise.resolve(null),
        this.sets.list(),
        this.cardTypes.list({ activeOnly: true }),
        this.products.getCardTypeIds(product.id),
        this.settings.get().catch(() => null),
      ]);

      if (tcgdexRow?.data) this.card.set(tcgdexRow.data as TcgdexCard);
      if (product.set_id) {
        this.set.set(sets.find((s) => s.id === product.set_id) ?? null);
      }
      const assigned = new Set(assignedIds);
      this.tags.set(types.filter((t) => assigned.has(t.id)));
      this.settingsRow.set(settings);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected incQty(max: number): void {
    this.qty.update((q) => Math.min(max, q + 1));
  }

  protected decQty(): void {
    this.qty.update((q) => Math.max(1, q - 1));
  }

  protected async onAddToCart(): Promise<void> {
    const product = this.product();
    if (!product) return;
    const { error } = await this.cart.add(product.id, this.qty());
    if (error) {
      this.snack.open(error, 'OK', { duration: 4000 });
      return;
    }
    // Drawer opens automatically via CartService.add().
  }

  protected languageLabel(value: string | null): string {
    if (!value) return '—';
    return this.LANGUAGES.get(value as never) ?? value;
  }

  protected variantLabel(value: string | null): string {
    if (!value) return '—';
    return this.VARIANTS.get(value as never) ?? value;
  }

  protected conditionSub(value: string | null): string | null {
    if (!value) return null;
    return this.CONDITION_SUBS.get(value) ?? null;
  }

  protected stockLabel(qty: number): string {
    if (qty <= 0) return 'Agotada';
    return `Solo ${qty} disponible${qty === 1 ? '' : 's'}`;
  }

  protected stockClass(qty: number): string {
    return qty > 0 ? 'in' : 'out';
  }

  protected ctaLabel(qty: number): string {
    return qty > 0 ? 'Añadir al carrito' : 'Agotada';
  }

  protected typeColor(type: string | null): string {
    return energyTypeColor(type);
  }

  protected typeFg(type: string | null): string {
    return energyTypeFg(type);
  }

  protected typeName(type: string | null): string | null {
    return energyTypeName(type);
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}

// Local view-model types so the template doesn't need `any` casts. They
// mirror the shape of the TCGdex SDK types we actually consume on this page.
interface TcgdexAttack {
  cost?: string[];
  name: string;
  effect?: string;
  damage?: string | number;
}

interface TcgdexAbility {
  type: string;
  name: string;
  effect: string;
}

interface TcgdexTypedValue {
  type: string;
  value?: string;
}
