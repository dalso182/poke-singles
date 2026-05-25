import { Component, computed, input } from '@angular/core';

/**
 * Per-type presentation metadata. Keys mirror the capitalized type strings the
 * TCGdex SDK returns (plus the same aliases as `TYPE_ICON_MAP` in product-card):
 * Dark/Darkness, Electric/Lightning, Steel/Metal. `icon` is the file slug under
 * `assets/images/types/{icon}.png`; `color`/`fg` come from the design handoff
 * and drive the HP-bar gradient and the weakness multiplier text on the detail
 * page (the chip image itself is already a colored disc, so it isn't recolored).
 */
export const ENERGY_TYPE_META: Record<
  string,
  { icon: string; color: string; fg: string; name: string }
> = {
  Colorless: { icon: 'colorless', color: '#F2F0EA', fg: '#15151A', name: 'Colorless' },
  Darkness: { icon: 'dark', color: '#2D2D32', fg: '#FFFFFF', name: 'Darkness' },
  Dark: { icon: 'dark', color: '#2D2D32', fg: '#FFFFFF', name: 'Darkness' },
  Dragon: { icon: 'dragon', color: '#C9A227', fg: '#15151A', name: 'Dragon' },
  Lightning: { icon: 'electric', color: '#F2C900', fg: '#15151A', name: 'Lightning' },
  Electric: { icon: 'electric', color: '#F2C900', fg: '#15151A', name: 'Lightning' },
  Fairy: { icon: 'fairy', color: '#E94B92', fg: '#FFFFFF', name: 'Fairy' },
  Fighting: { icon: 'fighting', color: '#E8643D', fg: '#FFFFFF', name: 'Fighting' },
  Fire: { icon: 'fire', color: '#E84C2C', fg: '#FFFFFF', name: 'Fire' },
  Grass: { icon: 'grass', color: '#3FA456', fg: '#FFFFFF', name: 'Grass' },
  Psychic: { icon: 'psychic', color: '#9F62A7', fg: '#FFFFFF', name: 'Psychic' },
  Metal: { icon: 'steel', color: '#8E939A', fg: '#FFFFFF', name: 'Metal' },
  Steel: { icon: 'steel', color: '#8E939A', fg: '#FFFFFF', name: 'Metal' },
  Water: { icon: 'water', color: '#4FB7E4', fg: '#FFFFFF', name: 'Water' },
};

/** Background hex for a type — falls back to ink so callers can build gradients. */
export function energyTypeColor(type: string | null | undefined): string {
  return (type && ENERGY_TYPE_META[type]?.color) || '#15151A';
}

/** Readable foreground (ink or white) for text laid over `energyTypeColor`. */
export function energyTypeFg(type: string | null | undefined): string {
  return (type && ENERGY_TYPE_META[type]?.fg) || '#FFFFFF';
}

/** English display name for a type, or null when unknown. */
export function energyTypeName(type: string | null | undefined): string | null {
  return (type && ENERGY_TYPE_META[type]?.name) || null;
}

/**
 * Renders a single Pokémon energy-type chip using our self-hosted PNG icons
 * (`assets/images/types/*.png`, already colored discs). Unknown/null types fall
 * back to a neutral gray disc with an em dash so missing data stays visible.
 */
@Component({
  selector: 'app-energy-chip',
  imports: [],
  templateUrl: './energy-chip.html',
  styleUrl: './energy-chip.scss',
})
export class EnergyChip {
  readonly type = input<string | null>(null);
  readonly size = input(22);
  readonly withLabel = input(false);

  protected readonly meta = computed(() => {
    const t = this.type();
    return t ? (ENERGY_TYPE_META[t] ?? null) : null;
  });

  protected readonly iconUrl = computed(() => {
    const m = this.meta();
    return m ? `assets/images/types/${m.icon}.png` : null;
  });

  protected readonly label = computed(() => this.meta()?.name ?? this.type() ?? '—');
}
