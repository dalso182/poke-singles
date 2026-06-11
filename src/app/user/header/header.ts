import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';
import { ProfilesService } from '../../core/auth/profiles.service';
import { PokemonService } from '../../core/pokemon/pokemon.service';
import { CartService } from '../../core/cart/cart.service';
import { LoyaltyService } from '../../core/loyalty/loyalty.service';
import { SearchLogService } from '../../core/search-log/search-log.service';
import { SocialIcons } from '../../shared/social-icons/social-icons';

@Component({
  selector: 'app-header',
  imports: [
    RouterLink,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatTooltipModule,
    SocialIcons,
  ],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  readonly toggleNav = output<void>();

  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly profiles = inject(ProfilesService);
  private readonly pokemon = inject(PokemonService);
  private readonly cart = inject(CartService);
  private readonly loyalty = inject(LoyaltyService);
  private readonly searchLog = inject(SearchLogService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  protected readonly currentUser = this.auth.currentUser;
  protected readonly isSignedIn = this.auth.isSignedIn;
  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly cartCount = this.cart.itemCount;

  /** Google OAuth photo (avatar_url / picture), if the account has one. */
  private readonly googleUrl = computed(() => {
    const meta = this.currentUser()?.user_metadata as
      | { avatar_url?: string; picture?: string }
      | undefined;
    return meta?.avatar_url || meta?.picture || null;
  });

  // Avatar source priority: chosen Pokémon → Google photo → initials. Each
  // `*Broken` flag drops a source that failed to load so the next one shows.
  protected readonly pokemonBroken = signal(false);
  protected readonly googleBroken = signal(false);
  protected readonly avatarSrc = computed<string | null>(() => {
    const n = this.profiles.avatarPokemonNumber();
    if (n != null && !this.pokemonBroken()) return this.pokemon.avatarUrl(n);
    if (!this.googleBroken()) return this.googleUrl();
    return null;
  });

  constructor() {
    // Re-attempt every source when the chosen avatar or the signed-in user changes.
    effect(() => {
      this.profiles.avatarPokemonNumber();
      this.currentUser();
      this.pokemonBroken.set(false);
      this.googleBroken.set(false);
    });
  }

  /** Account dropdown open state. */
  protected readonly menuOpen = signal(false);
  /** Poke-Coins (loyalty) balance, lazy-loaded the first time the menu opens. */
  protected readonly points = signal(0);
  private pointsLoaded = false;

  protected toggleMenu(): void {
    const next = !this.menuOpen();
    this.menuOpen.set(next);
    if (next && this.isSignedIn() && !this.pointsLoaded) {
      this.pointsLoaded = true;
      void this.loadPoints();
    }
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  private async loadPoints(): Promise<void> {
    try {
      this.points.set(await this.loyalty.getMyBalance());
    } catch {
      // Balance is non-critical header chrome — leave it at 0 on failure.
    }
  }

  // Tooltip content shown on hover of the search-help icon. Lists every
  // field the search-text bucket covers so customers know what to type.
  protected readonly searchHelpText =
    'Busca por: nombre de la carta, Pokémon, set (nombre o código), número, ' +
    'número/total (p. ej. 15/151), tipo (Fire, Water…), ilustrador, marca ' +
    'de regulación o tipo de carta (Full Art, VMAX…).';

  protected onSearch(query: string): void {
    const q = query.trim();
    if (q) {
      void this.searchLog.logSearch(q);
      this.router.navigate(['/buscar'], { queryParams: { q } });
    }
  }

  protected onCartClick(): void {
    // Cart icon opens the drawer only. The drawer's "Ver carrito completo"
    // button is the explicit path to /cart.
    this.cart.openDrawer();
  }

  protected async openLogin(): Promise<void> {
    const { LoginDialog } = await import('../../auth/login-dialog/login-dialog');
    this.dialog.open(LoginDialog, {
      panelClass: 'login-dialog-panel',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
  }

  protected async signOut(): Promise<void> {
    this.closeMenu();
    const { error } = await this.auth.signOut();
    if (error) {
      this.snack.open(error, 'OK', { duration: 4000 });
    } else {
      // Reset the cached balance so a re-login fetches the new user's total.
      this.pointsLoaded = false;
      this.points.set(0);
      this.snack.open('Sesión cerrada', 'OK', { duration: 2500 });
    }
  }

  protected userInitials(): string {
    const user = this.currentUser();
    if (!user) return '';
    const name =
      (user.user_metadata?.['full_name'] as string | undefined) ||
      user.email ||
      '';
    return name
      .split(/\s+|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');
  }

  protected userDisplayName(): string {
    const user = this.currentUser();
    if (!user) return '';
    return (
      (user.user_metadata?.['full_name'] as string | undefined) ||
      user.email ||
      'Usuario'
    );
  }

  protected onAvatarError(): void {
    const n = this.profiles.avatarPokemonNumber();
    if (n != null && !this.pokemonBroken()) this.pokemonBroken.set(true);
    else this.googleBroken.set(true);
  }
}
