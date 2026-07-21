import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ProductsService } from '../../core/catalog/products.service';
import { AuctionsService } from '../../core/catalog/auctions.service';
import type { AuctionRow, BidRow, ProductRow } from '../../core/catalog/catalog.types';
import { Pill } from '../../shared/table/cells/pill/pill';
import { Btn } from '../../shared/table/controls/btn/btn';
import { IconBtn } from '../../shared/table/controls/icon-btn/icon-btn';

/**
 * Admin auction detail — /admin/auctions/:id (:id = product uuid). Product
 * summary + auction config + full-name bid log (invalidated bids from earlier
 * rounds greyed out) + winner block linking to the auto-created order.
 */
@Component({
  selector: 'app-admin-auction-detail',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
    Pill,
    Btn,
    IconBtn,
  ],
  templateUrl: './auction-detail.html',
  styleUrl: './auction-detail.scss',
})
export class AuctionDetail implements OnInit {
  readonly id = input.required<string>();

  private readonly products = inject(ProductsService);
  protected readonly auctions = inject(AuctionsService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly product = signal<ProductRow | null>(null);
  protected readonly auction = signal<AuctionRow | null>(null);
  protected readonly bids = signal<BidRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly notFound = signal(false);
  protected readonly working = signal(false);

  /** Next-highest live bidder after the current winner — what a reassign
   *  would pick (ignoring bans, which the server re-checks). */
  protected readonly nextBidder = computed<BidRow | null>(() => {
    const a = this.auction();
    if (!a || a.status !== 'ended') return null;
    const candidates = this.liveBids()
      .filter((b) => b.user_id !== null && b.user_id !== a.winner_user_id)
      .sort((x, y) => y.amount - x.amount || x.created_at.localeCompare(y.created_at));
    return candidates[0] ?? null;
  });

  protected readonly columns = ['bidder', 'amount', 'time', 'state'];

  /** Bids from the current round (live) — invalidated ones are prior rounds. */
  protected readonly liveBids = computed(() =>
    this.bids().filter((b) => b.invalidated_at === null),
  );
  protected readonly distinctBidders = computed(
    () => new Set(this.liveBids().map((b) => b.user_id ?? b.bidder_email)).size,
  );
  /** The current top live bid id (highest amount, earliest on tie). */
  protected readonly topBidId = computed(() => {
    const live = this.liveBids();
    if (live.length === 0) return null;
    return [...live].sort(
      (a, b) => b.amount - a.amount || a.created_at.localeCompare(b.created_at),
    )[0].id;
  });

  ngOnInit(): void {
    void this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const [product, auction, bids] = await Promise.all([
        this.products.get(this.id()),
        this.auctions.get(this.id()),
        this.auctions.listBids(this.id()),
      ]);
      if (!product) {
        this.notFound.set(true);
        return;
      }
      this.product.set(product);
      this.auction.set(auction);
      this.bids.set(bids);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected statusLabel(status: AuctionRow['status'] | undefined): string {
    switch (status) {
      case 'ended':
        return 'Vendida';
      case 'void':
        return 'Sin pujas';
      default:
        return 'Activa';
    }
  }

  protected statusTone(status: AuctionRow['status'] | undefined): 'green' | 'neutral' | 'blue' {
    switch (status) {
      case 'ended':
        return 'green';
      case 'void':
        return 'neutral';
      default:
        return 'blue';
    }
  }

  /** Cancel the defaulting winner's order and crown the next-highest bidder.
   *  Server excludes the current winner from the pick; ban them from the
   *  customer screen first if they shouldn't win anything again. */
  protected async onReassign(): Promise<void> {
    const a = this.auction();
    if (!a || this.working() || a.status !== 'ended' || !a.winner_order_id) return;
    const next = this.nextBidder();
    const nextLine = next
      ? `El siguiente postor es ${next.bidder_name} con ₡${next.amount.toLocaleString('es-CR')}.`
      : 'No queda ningún otro postor — la subasta quedará sin ganador.';
    if (
      !confirm(
        `¿Cancelar el pedido de ${a.winner_name} y reasignar la subasta?\n\n${nextLine}\n\n` +
          'Se enviará el correo de ganador correspondiente. Si querés vetar al ganador actual, hazlo desde su ficha de cliente antes o después.',
      )
    ) {
      return;
    }
    this.working.set(true);
    try {
      const result = await this.auctions.reassign(a.product_id);
      if (result.ok && result.outcome === 'reassigned') {
        this.snack.open(`Subasta reasignada a ${result.winner_name}.`, 'OK', { duration: 6000 });
      } else if (result.ok) {
        this.snack.open('No quedaban postores elegibles — la subasta quedó sin ganador.', 'OK', {
          duration: 6000,
        });
      } else {
        this.snack.open(`No se pudo reasignar (${result.error}).`, 'OK', { duration: 6000 });
      }
      await this.refresh();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 6000 });
    } finally {
      this.working.set(false);
    }
  }

  /** Rerun a closed auction with a new closing datetime. */
  protected async onRelist(): Promise<void> {
    const a = this.auction();
    if (!a || this.working() || a.status === 'active') return;
    const input = prompt(
      '¿Relanzar la subasta? Se cancelará el pedido del ganador (si existe), las pujas actuales ' +
        'se archivan, y la puja vuelve a empezar desde el precio inicial.\n\n' +
        'Nueva fecha y hora de cierre (formato: 2026-07-25 18:00):',
    );
    if (input === null) return;
    const parsed = new Date(input.trim().replace(' ', 'T'));
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      this.snack.open('Fecha inválida — debe ser futura, formato 2026-07-25 18:00.', 'OK', {
        duration: 6000,
      });
      return;
    }
    this.working.set(true);
    try {
      const result = await this.auctions.relist(a.product_id, parsed.toISOString());
      if (result.ok) {
        this.snack.open('Subasta relanzada. Ya está activa de nuevo.', 'OK', { duration: 5000 });
      } else {
        this.snack.open(`No se pudo relanzar (${result.error}).`, 'OK', { duration: 6000 });
      }
      await this.refresh();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 6000 });
    } finally {
      this.working.set(false);
    }
  }

  protected goBack(): void {
    void this.router.navigate(['/admin/auctions']);
  }

  protected editProduct(id: string): void {
    void this.router.navigate(['/admin/products', id, 'edit']);
  }

  protected errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
