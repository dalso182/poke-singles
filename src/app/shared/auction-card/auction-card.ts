import { Component, computed, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Pill } from '../table/cells/pill/pill';
import { Countdown } from '../countdown/countdown';
import type { AuctionListingItem } from '../../core/catalog/catalog.types';

/**
 * Auction tile ("Live Arena" handoff) — vertical card: art on top with the
 * status pill, then meta / name / price block, and a live countdown chip
 * footer. Used by the /subastas grid AND the "Más subastas" rail on the
 * auction detail page. The whole tile links to /subastas/:slug.
 */
@Component({
  selector: 'app-auction-card',
  imports: [DatePipe, DecimalPipe, RouterLink, MatIconModule, Pill, Countdown],
  templateUrl: './auction-card.html',
  styleUrl: './auction-card.scss',
})
export class AuctionCard {
  readonly auction = input.required<AuctionListingItem>();

  /** Mono meta line: "SET · #006/198 · NM" (parts drop out when missing). */
  protected readonly metaLine = computed(() => {
    const a = this.auction();
    const number = a.card_number
      ? a.set_printed_total
        ? `#${a.card_number}/${a.set_printed_total}`
        : `#${a.card_number}`
      : '';
    return [a.set_name ?? '', number, a.condition ?? '']
      .filter((s) => s && s.length > 0)
      .join(' · ');
  });

  protected readonly hasBids = computed(() => this.auction().bid_count > 0);

  /** Price-block label per state (handoff table). */
  protected readonly priceLabel = computed(() => {
    switch (this.auction().status) {
      case 'ended':
        return 'Precio final';
      case 'void':
        return 'Sin pujas';
      default:
        return this.hasBids() ? 'Puja actual' : 'Precio inicial';
    }
  });

  protected readonly displayAmount = computed(
    () => this.auction().current_bid ?? this.auction().starting_price,
  );

  protected readonly statusLabel = computed(() => {
    switch (this.auction().status) {
      case 'ended':
        return 'Finalizada';
      case 'void':
        return 'Sin pujas';
      default:
        return 'Activa';
    }
  });

  protected readonly statusTone = computed<'green' | 'blue' | 'neutral'>(() => {
    switch (this.auction().status) {
      case 'ended':
        return 'blue';
      case 'void':
        return 'neutral';
      default:
        return 'green';
    }
  });

  /** Seeded hue for the winner's fallback avatar disc (masked names only). */
  protected winnerHue(): number {
    const s = this.auction().winner_masked || '?';
    let sum = 0;
    for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
    return Math.abs(sum) % 360;
  }
}
