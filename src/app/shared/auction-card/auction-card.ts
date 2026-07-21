import { Component, computed, inject, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CardConditionsDialogService } from '../../core/preview/card-conditions-dialog.service';
import { Countdown } from '../countdown/countdown';
import type { AuctionListingItem } from '../../core/catalog/catalog.types';

/**
 * Auction tile for /subastas. An auction is a product whose category is
 * "Subastas": `starting_price` is the opening bid, live state (current bid /
 * bid count / close) comes from the auctions table via `subastas_listing`.
 * Unlike <app-raffle-card> the tile links to a detail page —
 * /subastas/:slug — where the bidding happens.
 */
@Component({
  selector: 'app-auction-card',
  imports: [DatePipe, DecimalPipe, RouterLink, MatIconModule, MatTooltipModule, Countdown],
  templateUrl: './auction-card.html',
  styleUrl: './auction-card.scss',
})
export class AuctionCard {
  readonly auction = input.required<AuctionListingItem>();

  private readonly conditionsDialog = inject(CardConditionsDialogService);

  /** Card identity line: "Set name, #123/198" (mirrors the product card). */
  protected readonly metaLine = computed(() => {
    const a = this.auction();
    const number = a.card_number
      ? a.set_printed_total
        ? `#${a.card_number}/${a.set_printed_total}`
        : `#${a.card_number}`
      : '';
    return [a.set_name ?? '', number].filter((s) => s && s.length > 0).join(', ');
  });

  protected readonly hasBids = computed(() => this.auction().bid_count > 0);

  /** What the next/current relevant amount is: current bid when someone has
   *  bid, otherwise the opening price. */
  protected readonly displayAmount = computed(
    () => this.auction().current_bid ?? this.auction().starting_price,
  );

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

  /** Open the shared card-conditions guide modal (mirrors the product card). */
  protected openConditionsInfo(event: MouseEvent): void {
    event.stopPropagation();
    void this.conditionsDialog.open();
  }
}
