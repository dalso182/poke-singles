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
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ProductsService } from '../../core/catalog/products.service';
import { TcgdexCardsService } from '../../core/catalog/tcgdex-cards.service';
import { SetsService } from '../../core/catalog/sets.service';
import { CardTypesService } from '../../core/catalog/card-types.service';
import { CartService } from '../../core/cart/cart.service';
import {
  LANGUAGE_OPTIONS,
  VARIANT_OPTIONS,
} from '../../core/catalog/catalog.types';
import type {
  CardTypeRow,
  ProductRow,
  SetRow,
} from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-detail',
  imports: [
    RouterLink,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
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
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly product = signal<ProductRow | null>(null);
  protected readonly card = signal<TcgdexCard | null>(null);
  protected readonly set = signal<SetRow | null>(null);
  protected readonly tags = signal<CardTypeRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);

  protected readonly isPokemon = computed(
    () => (this.card() as { category?: string } | null)?.category === 'Pokemon',
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

  private readonly LANGUAGES = new Map(LANGUAGE_OPTIONS.map((o) => [o.value, o.label]));
  private readonly VARIANTS = new Map(VARIANT_OPTIONS.map((o) => [o.value, o.label]));

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
      this.product.set(product);

      // Run the four supporting fetches in parallel. SetsService.list() and
      // CardTypesService.list() both hit cached signals on subsequent
      // navigations, so this is cheap on repeat visits.
      const [tcgdexRow, sets, types, assignedIds] = await Promise.all([
        product.tcgdex_id
          ? this.tcgdexCards.get(product.tcgdex_id)
          : Promise.resolve(null),
        this.sets.list(),
        this.cardTypes.list({ activeOnly: true }),
        this.products.getCardTypeIds(product.id),
      ]);

      if (tcgdexRow?.data) this.card.set(tcgdexRow.data as TcgdexCard);
      if (product.set_id) {
        this.set.set(sets.find((s) => s.id === product.set_id) ?? null);
      }
      const assigned = new Set(assignedIds);
      this.tags.set(types.filter((t) => assigned.has(t.id)));
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected async onAddToCart(): Promise<void> {
    const product = this.product();
    if (!product) return;
    const { error } = await this.cart.add(product.id, 1);
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
