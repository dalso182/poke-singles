import {
  Component,
  Injector,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth/auth.service';
import { ProductsService } from '../../core/catalog/products.service';
import { AuctionLiveService } from '../../core/auctions/auction-live.service';
import { BidsService } from '../../core/auctions/bids.service';
import { CardConditionsDialogService } from '../../core/preview/card-conditions-dialog.service';
import { PokemonService } from '../../core/pokemon/pokemon.service';
import { AppSettingsService } from '../../core/settings/app-settings.service';
import { Countdown } from '../../shared/countdown/countdown';
import { AuctionCard } from '../../shared/auction-card/auction-card';
import { PillTabs, type TabItem } from '../../shared/table/tabs/pill-tabs/pill-tabs';
import type { AuctionBidItem, AuctionListingItem } from '../../core/catalog/catalog.types';

/** Bid history row decorated for the leaderboard rendering. */
interface RankedBid extends AuctionBidItem {
  rank: number;
  isTop: boolean;
}

/**
 * Auction detail — /subastas/:slug, "Live Arena" layout: a dark bidding
 * console (card art + countdown tiles + current bid + bid box) over the warm
 * storefront, then the leaderboard-style bid history, seller notes, and a
 * "Más subastas" rail. Public read; the bid action itself asks for sign-in
 * in place (no route guard).
 */
@Component({
  selector: 'app-subasta-detail',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTooltipModule,
    Countdown,
    AuctionCard,
    PillTabs,
  ],
  templateUrl: './subasta-detail.html',
  styleUrl: './subasta-detail.scss',
})
export class SubastaDetail implements OnInit, OnDestroy {
  /** Product slug from the route (withComponentInputBinding). */
  readonly slug = input.required<string>();

  private readonly products = inject(ProductsService);
  private readonly bids = inject(BidsService);
  private readonly live = inject(AuctionLiveService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly conditionsDialog = inject(CardConditionsDialogService);
  private readonly pokemon = inject(PokemonService);
  private readonly settings = inject(AppSettingsService);
  private readonly injector = inject(Injector);

  /** WhatsApp number from app_settings (store number as fallback). */
  private readonly whatsappNumber = signal<string | null>(null);

  /** "Pedir fotos adicionales" → WhatsApp, same wiring as the product detail
   *  page (app_settings number, prefilled message with the card reference). */
  protected readonly whatsappLink = computed(() => {
    const num = (this.whatsappNumber() ?? '50663452039').replace(/\D/g, '');
    const a = this.auction();
    const ref = a?.card_number ? ` ${a.set_name ?? ''} #${a.card_number}`.trimEnd() : '';
    const text = encodeURIComponent(
      `Hola, quiero más fotos de ${a?.name ?? 'esta subasta'}${ref}.`,
    );
    return `https://wa.me/${num}?text=${text}`;
  });

  protected readonly auction = signal<AuctionListingItem | null>(null);
  protected readonly bidHistory = signal<AuctionBidItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly placing = signal(false);

  /** Product id once loaded — the live channel + teardown key. */
  private watchedId: string | null = null;

  /** The amount typed into the bid box. */
  protected bidAmount: number | null = null;

  /** Hero mono meta line: "SET · #006/198" (set_name — the listing view
   *  doesn't carry the set code). */
  protected readonly metaLine = computed(() => {
    const a = this.auction();
    if (!a) return '';
    const number = a.card_number
      ? a.set_printed_total
        ? `#${a.card_number}/${a.set_printed_total}`
        : `#${a.card_number}`
      : '';
    return [a.set_name ?? '', number].filter((s) => s && s.length > 0).join(' · ');
  });

  /** History as a leaderboard: ranked by amount (live bids strictly increase,
   *  so amount order == reverse chronology), crown on rank 1. */
  protected readonly rankedBids = computed<RankedBid[]>(() =>
    [...this.bidHistory()]
      .sort((a, b) => b.amount - a.amount || a.created_at.localeCompare(b.created_at))
      .map((b, i) => ({ ...b, rank: i + 1, isTop: i === 0 })),
  );

  /** The current leader (top live bid) — feeds the console's leader chip. */
  protected readonly topBid = computed<RankedBid | null>(() => this.rankedBids()[0] ?? null);

  // ---- "Más subastas" rail ----
  protected readonly moreAuctions = signal<AuctionListingItem[]>([]);
  protected readonly railTab = signal<'activas' | 'finalizadas'>('activas');
  protected readonly railTabs = computed<TabItem[]>(() => {
    const rows = this.moreAuctions();
    return [
      { key: 'activas', label: 'Activas', count: rows.filter((a) => a.status === 'active').length },
      {
        key: 'finalizadas',
        label: 'Finalizadas',
        count: rows.filter((a) => a.status !== 'active').length,
      },
    ];
  });
  /** Up to one row (4 tiles) for the current rail tab. */
  protected readonly railAuctions = computed(() => {
    const active = this.railTab() === 'activas';
    return this.moreAuctions()
      .filter((a) => (active ? a.status === 'active' : a.status !== 'active'))
      .slice(0, 4);
  });

  protected onRailTab(next: string): void {
    if (next === 'activas' || next === 'finalizadas') this.railTab.set(next);
  }

  protected readonly hasBids = computed(() => (this.auction()?.bid_count ?? 0) > 0);

  /** Lowest amount the next bid can be: current + increment, or the opening
   *  price while nobody has bid. */
  protected readonly minNextBid = computed(() => {
    const a = this.auction();
    if (!a) return 0;
    return a.current_bid != null
      ? a.current_bid + (a.min_increment ?? 0)
      : a.starting_price;
  });

  protected readonly isActive = computed(() => this.auction()?.status === 'active');

  /** Bumped when the countdown crosses zero so `biddingOpen` re-evaluates. */
  private readonly clientEnded = signal(0);

  /** Bidding is open: active, scheduled, and the close hasn't passed client-side. */
  protected readonly biddingOpen = computed(() => {
    this.clientEnded(); // reactivity hook — re-evaluate when the countdown ends
    const a = this.auction();
    if (!a || a.status !== 'active' || !a.ends_at) return false;
    return Date.parse(a.ends_at) > Date.now();
  });

  ngOnInit(): void {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.loading.set(true);
    try {
      const auction = await this.products.getAuctionBySlug(this.slug());
      if (!auction) {
        this.notFound.set(true);
        return;
      }
      this.auction.set(auction);
      this.bidAmount = this.minNextBid();
      this.bidHistory.set(await this.bids.listBids(auction.id));
      this.startLive(auction.id);
      // Rail data is decorative — never block or fail the page for it.
      void this.products
        .listAuctions()
        .then((all) => this.moreAuctions.set(all.filter((a) => a.id !== auction.id)))
        .catch(() => {});
      // Settings only feed the WhatsApp link — a hiccup keeps the fallback number.
      void this.settings
        .get()
        .then((s) => this.whatsappNumber.set(s?.whatsapp_number ?? null))
        .catch(() => {});
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  /** Subscribe to the auction's broadcast channel: patch the visible state
   *  optimistically from each event, then re-fetch the definer views for the
   *  authoritative version (the channel is public, payloads are hints). */
  private startLive(productId: string): void {
    this.watchedId = productId;
    const liveEvent = this.live.watch(productId);
    effect(
      () => {
        const ev = liveEvent();
        if (!ev || ev.product_id !== productId) return;
        this.auction.update((a) =>
          a
            ? {
                ...a,
                status: ev.status,
                current_bid: ev.current_bid,
                bid_count: ev.bid_count,
                ends_at: ev.ends_at,
              }
            : a,
        );
        // Keep the bid box at least at the new minimum.
        if (this.bidAmount == null || this.bidAmount < this.minNextBid()) {
          this.bidAmount = this.minNextBid();
        }
        void this.refresh();
      },
      { injector: this.injector },
    );
  }

  ngOnDestroy(): void {
    if (this.watchedId) this.live.teardown(this.watchedId);
  }

  /** Re-read auction + history (used after the countdown ends and after bids). */
  protected async refresh(): Promise<void> {
    const current = this.auction();
    if (!current) return;
    try {
      const [auction, history] = await Promise.all([
        this.products.getAuctionBySlug(this.slug()),
        this.bids.listBids(current.id),
      ]);
      if (auction) this.auction.set(auction);
      this.bidHistory.set(history);
    } catch {
      // Best-effort refresh — keep showing the last known state.
    }
  }

  protected onCountdownFinished(): void {
    this.clientEnded.set(Date.now());
    // The cron closes the auction server-side within a minute; re-fetch soon
    // after so the status flips to Finalizada without a manual reload.
    setTimeout(() => void this.refresh(), 5000);
  }

  /** Portrait for a bidder's chosen Pokémon avatar (null → generic icon). */
  protected avatarUrl(n: number | null): string | null {
    return n != null ? this.pokemon.portraitUrl(n) : null;
  }

  /** Maps a condition code to its pill classes — mirrors the product card. */
  protected conditionClass(condition: string | null): string {
    if (!condition) return '';
    const code = condition.toUpperCase();
    let modifier = '';
    if (code === 'NM') modifier = 'condition-pill--nm';
    else if (code === 'LP') modifier = 'condition-pill--lp';
    else if (code === 'MP') modifier = 'condition-pill--mp';
    else if (code === 'HP' || code === 'DMG') modifier = 'condition-pill--hp';
    return `condition-pill ${modifier}`;
  }

  protected openConditionsInfo(event: MouseEvent): void {
    event.stopPropagation();
    void this.conditionsDialog.open();
  }

  /** Quick "+ incremento" helper on the bid box. */
  protected bumpBid(): void {
    const a = this.auction();
    if (!a) return;
    const base = Math.max(this.bidAmount ?? 0, this.minNextBid());
    this.bidAmount = base + (a.min_increment ?? 0);
  }

  protected async onBid(): Promise<void> {
    const a = this.auction();
    if (!a || !this.biddingOpen() || this.placing()) return;

    const amount = Math.round(Number(this.bidAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      this.snack.open('Ingresá un monto válido.', 'OK', { duration: 4000 });
      return;
    }
    if (amount < this.minNextBid()) {
      this.snack.open(
        `La puja mínima es ₡${this.minNextBid().toLocaleString('es-CR')}.`,
        'OK',
        { duration: 4000 },
      );
      return;
    }

    // In-place sign-in: open the login dialog and continue only if it closes
    // signed in (no route change, the bid intent survives).
    await this.auth.ready;
    if (!this.auth.isSignedIn()) {
      const { LoginDialog } = await import('../../auth/login-dialog/login-dialog');
      const result = await firstValueFrom(
        this.dialog
          .open(LoginDialog, {
            panelClass: 'login-dialog-panel',
            autoFocus: 'first-tabbable',
            restoreFocus: true,
          })
          .afterClosed(),
      );
      if (result !== 'signed-in' && result !== 'signed-up') return;
    }

    // Commitment confirmation — required on every bid.
    const { BidConfirmDialog } = await import('./bid-confirm-dialog');
    const confirmed = await firstValueFrom(
      this.dialog
        .open(BidConfirmDialog, {
          data: { amount, productName: a.name },
          width: '440px',
          maxWidth: '95vw',
          autoFocus: 'first-tabbable',
          panelClass: 'arena-dialog',
        })
        .afterClosed(),
    );
    if (confirmed !== true) return;

    this.placing.set(true);
    try {
      const result = await this.bids.placeBid(a.id, amount);
      if (result.ok) {
        this.snack.open(
          result.extended
            ? '¡Puja registrada! El cierre se extendió unos minutos.'
            : '¡Puja registrada! Vas ganando.',
          'OK',
          { duration: 4000, panelClass: 'toast-green' },
        );
        await this.refresh();
        this.bidAmount = this.minNextBid();
        return;
      }
      // Toast copy + tones per the Live Arena handoff (banned uses --danger,
      // never brand red — see _material-overrides `.toast-*`).
      switch (result.error) {
        case 'BID_TOO_LOW':
          await this.refresh();
          this.bidAmount = result.min_next ?? this.minNextBid();
          this.snack.open(
            `Alguien pujó primero — tu puja no entró. El nuevo mínimo es ₡${(result.min_next ?? this.minNextBid()).toLocaleString('es-CR')}.`,
            'OK',
            { duration: 5000, panelClass: 'toast-amber' },
          );
          break;
        case 'ALREADY_LEADING':
          this.snack.open('Ya sos la puja más alta — vas ganando.', 'OK', {
            duration: 4000,
            panelClass: 'toast-green',
          });
          break;
        case 'AUCTION_ENDED':
        case 'AUCTION_NOT_ACTIVE':
          await this.refresh();
          this.snack.open(
            'La subasta acaba de cerrar — ya no se aceptan pujas.',
            'OK',
            { duration: 5000, panelClass: 'toast-blue' },
          );
          break;
        case 'AUCTION_BANNED':
          this.snack.open(
            'Tu cuenta está vetada de subastas. Escribinos si creés que es un error.',
            'OK',
            { duration: 6000, panelClass: 'toast-danger' },
          );
          break;
        case 'INVALID_AMOUNT':
          this.snack.open('Monto inválido — usá colones enteros.', 'OK', {
            duration: 4000,
            panelClass: 'toast-amber',
          });
          break;
        default:
          this.snack.open(`No se pudo registrar la puja (${result.error}).`, 'OK', {
            duration: 5000,
          });
      }
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.placing.set(false);
    }
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
