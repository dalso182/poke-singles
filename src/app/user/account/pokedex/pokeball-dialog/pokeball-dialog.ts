import { Component, computed, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AppSettingsService } from '../../../../core/settings/app-settings.service';
import { LoyaltyService } from '../../../../core/loyalty/loyalty.service';
import { ProfilesService } from '../../../../core/auth/profiles.service';
import {
  PokemonService,
  type Pokemon,
} from '../../../../core/pokemon/pokemon.service';
import type { PokeballTier } from '../../../../core/catalog/catalog.types';

/** Exact copy requested for unaffordable tiers. */
const EARN_HINT = 'Ganarás Poke-Monedas con tus compras';

/** Friendly Spanish messages for open_pokeball business errors. */
const ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_POINTS: 'No tienes suficientes Poke-Monedas.',
  POKEDEX_COMPLETE: '¡Felicidades, ya completaste tu Pokédex!',
};

/**
 * Pokéball redemption modal — the Pokédex "fill" mechanism. Three steps in one
 * dialog: choose a tier (pricing from app_settings.pokeball_tiers — the same
 * values the RPC enforces), confirm/open the selected ball, and reveal the
 * awarded Pokémon with a soft burst + staggered zoom-in. All economy moves
 * (balance check, debit, award) happen server-side in open_pokeball; this
 * component only renders the result. Closes with `true` when at least one ball
 * was opened so the opener can refresh the points history.
 */
@Component({
  selector: 'app-pokeball-dialog',
  imports: [MatDialogModule, MatIconModule, MatProgressBarModule],
  templateUrl: './pokeball-dialog.html',
  styleUrl: './pokeball-dialog.scss',
})
export class PokeballDialog {
  private readonly settings = inject(AppSettingsService);
  private readonly loyalty = inject(LoyaltyService);
  private readonly profiles = inject(ProfilesService);
  private readonly pokemon = inject(PokemonService);
  private readonly dialogRef =
    inject<MatDialogRef<PokeballDialog, boolean>>(MatDialogRef);

  protected readonly earnHint = EARN_HINT;

  protected readonly step = signal<'choose' | 'open' | 'reveal'>('choose');
  protected readonly tiers = signal<PokeballTier[]>([]);
  protected readonly selected = signal<PokeballTier | null>(null);
  protected readonly loading = signal(true);
  /** RPC in flight — the ball shakes while we wait. */
  protected readonly opening = signal(false);
  /** Brief ball burst-out animation between a successful open and the reveal. */
  protected readonly bursting = signal(false);
  protected readonly awarded = signal<Pokemon[]>([]);
  protected readonly errorMsg = signal<string | null>(null);

  protected readonly balance = computed(() => this.loyalty.balance() ?? 0);

  /** Whether any ball was opened in this dialog session (the close result). */
  private openedAny = false;
  /** number → Pokemon lookup for mapping the RPC's awarded dex numbers. */
  private byNumber = new Map<number, Pokemon>();

  constructor() {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      const [settings, list] = await Promise.all([
        this.settings.load(),
        this.pokemon.list(),
        this.loyalty.ensureLoaded().catch(() => 0),
      ]);
      this.tiers.set(settings.pokeball_tiers ?? []);
      this.byNumber = new Map(list.map((p) => [p.number, p]));
    } catch {
      this.errorMsg.set('No pudimos cargar las Pokébolas. Intenta de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  protected canAfford(tier: PokeballTier): boolean {
    return this.balance() >= tier.cost;
  }

  protected costLabel(tier: PokeballTier): string {
    return `${tier.cost} ${tier.cost === 1 ? 'Poke-Moneda' : 'Poke-Monedas'}`;
  }

  protected choose(tier: PokeballTier): void {
    if (!this.canAfford(tier)) return;
    this.selected.set(tier);
    this.errorMsg.set(null);
    this.step.set('open');
  }

  protected backToChoose(): void {
    if (this.opening()) return;
    this.selected.set(null);
    this.awarded.set([]);
    this.errorMsg.set(null);
    this.step.set('choose');
  }

  protected async open(): Promise<void> {
    const tier = this.selected();
    if (!tier || this.opening()) return;
    this.opening.set(true);
    this.errorMsg.set(null);
    try {
      const result = await this.loyalty.openPokeball(tier.key);
      if (!result.ok) {
        this.errorMsg.set(
          ERROR_MESSAGES[result.error ?? ''] ??
            'Algo salió mal al abrir la Pokébola. No se descontaron Poke-Monedas.',
        );
        // Balance may have changed under us (e.g. raced spend elsewhere).
        if (result.error === 'INSUFFICIENT_POINTS') void this.loyalty.refresh();
        return;
      }
      this.openedAny = true;
      this.awarded.set(
        (result.awarded ?? []).map(
          (n) =>
            this.byNumber.get(n) ?? {
              number: n,
              name: String(n),
              displayName: `#${n}`,
              region: '',
            },
        ),
      );
      // Refresh the cached profile so the dex grid lights the new catches up.
      void this.profiles.getMine();
      // Soft "opening" transition: let the ball burst/fade before the reveal.
      this.bursting.set(true);
      setTimeout(() => {
        this.bursting.set(false);
        this.step.set('reveal');
      }, 350);
    } finally {
      this.opening.set(false);
    }
  }

  protected sprite(p: Pokemon): string {
    return this.pokemon.spriteUrl(p.name);
  }

  /** A missing sprite: hide the broken image, leaving the name label. */
  protected onImgError(ev: Event): void {
    (ev.target as HTMLImageElement).style.visibility = 'hidden';
  }

  protected close(): void {
    this.dialogRef.close(this.openedAny);
  }
}
