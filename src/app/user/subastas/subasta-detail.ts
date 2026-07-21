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
import { Countdown } from '../../shared/countdown/countdown';
import type { AuctionBidItem, AuctionListingItem } from '../../core/catalog/catalog.types';

/**
 * Auction detail — /subastas/:slug. Shows the card large, the live current
 * bid + countdown, the masked bid history, and the bid box. Public read; the
 * bid action itself asks for sign-in in place (no route guard).
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
  private readonly injector = inject(Injector);

  protected readonly auction = signal<AuctionListingItem | null>(null);
  protected readonly bidHistory = signal<AuctionBidItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly placing = signal(false);

  /** Product id once loaded — the live channel + teardown key. */
  private watchedId: string | null = null;

  /** The amount typed into the bid box. */
  protected bidAmount: number | null = null;

  /** Card identity line: "Set name, #123/198" (mirrors the product card). */
  protected readonly metaLine = computed(() => {
    const a = this.auction();
    if (!a) return '';
    const number = a.card_number
      ? a.set_printed_total
        ? `#${a.card_number}/${a.set_printed_total}`
        : `#${a.card_number}`
      : '';
    return [a.set_name ?? '', number].filter((s) => s && s.length > 0).join(', ');
  });

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
          { duration: 4000 },
        );
        await this.refresh();
        this.bidAmount = this.minNextBid();
        return;
      }
      switch (result.error) {
        case 'BID_TOO_LOW':
          await this.refresh();
          this.bidAmount = result.min_next ?? this.minNextBid();
          this.snack.open(
            `Alguien pujó primero — la nueva puja mínima es ₡${(result.min_next ?? this.minNextBid()).toLocaleString('es-CR')}.`,
            'OK',
            { duration: 5000 },
          );
          break;
        case 'ALREADY_LEADING':
          this.snack.open('Ya tenés la puja más alta.', 'OK', { duration: 4000 });
          break;
        case 'AUCTION_ENDED':
        case 'AUCTION_NOT_ACTIVE':
          await this.refresh();
          this.snack.open('La subasta ya cerró.', 'OK', { duration: 5000 });
          break;
        case 'AUCTION_BANNED':
          this.snack.open(
            'Tu cuenta no puede participar en subastas. Escribinos si creés que es un error.',
            'OK',
            { duration: 6000 },
          );
          break;
        case 'INVALID_AMOUNT':
          this.snack.open('Monto inválido — usá colones enteros.', 'OK', { duration: 4000 });
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
