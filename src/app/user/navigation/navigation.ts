import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  type IsActiveMatchOptions,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CartService } from '../../core/cart/cart.service';
import { CategoriesService } from '../../core/catalog/categories.service';
import { CardTypesService } from '../../core/catalog/card-types.service';
import { SocialIcons } from '../../shared/social-icons/social-icons';

interface NavChild {
  readonly key: string;
  readonly label: string;
  readonly path: string;
  readonly queryParams?: Record<string, string>;
}

interface NavItem {
  readonly key: string;
  readonly label: string;
  /** Registered svgIcon name (see icon literals below). */
  readonly icon: string;
  readonly path: string;
  /** Query params for the link. Category items all share the `/products` path
   *  and select via the `?categoria=` facet, so the slug lives here. */
  readonly queryParams?: Record<string, string>;
  readonly exact?: boolean;
  /** When present, the item is a disclosure: flyout (collapsed) / accordion
   *  (expanded). `path`+`queryParams` become the "Ver todo" landing target. */
  readonly children?: readonly NavChild[];
}

interface NavSection {
  /** Stable track key. Distinct from `label` so a label-less section (Home)
   *  still tracks safely. */
  readonly key: string;
  /** Section heading; empty string renders no label (e.g. the top Home item). */
  readonly label: string;
  readonly items: readonly NavItem[];
}

// Monoline icons from the design prototype (nav-prototype.jsx `I.*`). 20×20
// viewBox, 1.6 stroke, currentColor so each inherits the nav item's text color.
// mat-icon sizes the rendered svg, so no width/height here.
const SVG = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" ` +
  `stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ` +
  `stroke-linejoin="round">${body}</svg>`;

const ICONS: Record<string, string> = {
  'nav-home': SVG('<path d="M3 8.5L10 3l7 5.5V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1V8.5z" />'),
  'nav-cards': SVG(
    '<rect x="3.2" y="5.5" width="9" height="12" rx="1.2" />' +
      '<path d="M7.2 5.5V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v10.5a1 1 0 0 1-1 1h-2.5" />',
  ),
  'nav-raffle': SVG(
    '<path d="M2.5 7.5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v2a1.5 1.5 0 0 0 0 3v2a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-2a1.5 1.5 0 0 0 0-3v-2z" />' +
      '<path d="M8 6.5v8" stroke-dasharray="1.5 1.8" />',
  ),
  // Subastas: a gavel (scaled-down lucide "gavel" monoline).
  'nav-gavel': SVG(
    '<path d="M12.1 10.4l-6.6 6.6a1.6 1.6 0 1 1-2.3-2.3l6.6-6.6" />' +
      '<path d="M13.3 13.3l5-5" /><path d="M6.7 6.7l5-5" />' +
      '<path d="M7.5 5.8l6.7 6.7" /><path d="M17.5 9.2l-6.7-6.7" />',
  ),
  'nav-ofertas': SVG(
    '<path d="M10.6 3H4a1 1 0 0 0-1 1v6.6a1 1 0 0 0 .3.7l6.4 6.4a1 1 0 0 0 1.4 0l6-6a1 1 0 0 0 0-1.4L10.7 3.3a1 1 0 0 0-.7-.3z" />' +
      '<circle cx="6.8" cy="6.8" r="1.1" />',
  ),
  'nav-cart': SVG(
    '<path d="M2.5 3.5h2l1.6 9.2a1.4 1.4 0 0 0 1.4 1.2h7.4a1.4 1.4 0 0 0 1.4-1.1L17.5 7H6" />' +
      '<circle cx="8" cy="17" r="1.1" /><circle cx="15" cy="17" r="1.1" />',
  ),
  'nav-account': SVG(
    '<circle cx="10" cy="7" r="3.2" /><path d="M3.8 17c.6-3.2 3.2-5 6.2-5s5.6 1.8 6.2 5" />',
  ),
  'nav-admin': SVG(
    '<path d="M10 2.5l6 2v4c0 4-2.6 6.5-6 7.5-3.4-1-6-3.5-6-7.5v-4l6-2z" />' +
      '<path d="M7.6 9.6l1.7 1.7 3.1-3.4" />',
  ),
  // Todo (everything): a 2×2 grid.
  'nav-category': SVG(
    '<rect x="3" y="3" width="6" height="6" rx="1.2" /><rect x="11" y="3" width="6" height="6" rx="1.2" />' +
      '<rect x="3" y="11" width="6" height="6" rx="1.2" /><rect x="11" y="11" width="6" height="6" rx="1.2" />',
  ),
  // Sealed product: a closed box.
  'nav-box': SVG(
    '<path d="M10 2.6l6.5 3.4v8L10 17.4 3.5 14V6L10 2.6z" />' +
      '<path d="M3.6 6.1L10 9.5l6.4-3.4" /><path d="M10 9.5v7.9" />',
  ),
  // Accesorios: a die (dice / counters — a TCG accessory).
  'nav-dice': SVG(
    '<rect x="4" y="4" width="12" height="12" rx="2.6" />' +
      '<circle cx="7.3" cy="7.3" r="0.9" fill="currentColor" stroke="none" />' +
      '<circle cx="12.7" cy="7.3" r="0.9" fill="currentColor" stroke="none" />' +
      '<circle cx="10" cy="10" r="0.9" fill="currentColor" stroke="none" />' +
      '<circle cx="7.3" cy="12.7" r="0.9" fill="currentColor" stroke="none" />' +
      '<circle cx="12.7" cy="12.7" r="0.9" fill="currentColor" stroke="none" />',
  ),
  // Sobre nosotros: info circle.
  'nav-info': SVG(
    '<circle cx="10" cy="10" r="7.2" /><path d="M10 9v4.2" /><path d="M10 6.6h.01" />',
  ),
  // Políticas de envío: a delivery truck.
  'nav-truck': SVG(
    '<path d="M2.6 5.5h8.4v7.5H2.6z" /><path d="M11 8h3l2.4 2.4V13H11z" />' +
      '<circle cx="6" cy="15" r="1.3" /><circle cx="14" cy="15" r="1.3" />',
  ),
  // Disclosure chevron (accordion + flyout "Ver todo").
  'nav-chevron': SVG('<path d="M7.5 4.5l5.5 5.5-5.5 5.5" />'),
};

@Component({
  selector: 'app-navigation',
  imports: [RouterLink, RouterLinkActive, MatIconModule, MatTooltipModule, SocialIcons],
  templateUrl: './navigation.html',
  styleUrl: './navigation.scss',
  host: {
    '[class.expanded]': 'expanded()',
    '[class.collapsed]': '!expanded()',
  },
})
export class Navigation {
  private readonly auth = inject(AuthService);
  private readonly cart = inject(CartService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly cardTypesService = inject(CardTypesService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostEl = inject(ElementRef<HTMLElement>);

  /** Rail (collapsed) vs labeled panel (expanded). Owned by the shell. */
  readonly expanded = input.required<boolean>();

  /** Live cart item count — the only badge wired to data for now. */
  protected readonly cartCount = this.cart.itemCount;

  /** Sub-type children loaded from card_types, keyed by category slug. */
  private readonly subtypeChildren = signal<Record<string, NavChild[]>>({});

  /** Collapsed-rail flyout state. */
  protected readonly hoveredKey = signal<string | null>(null);
  protected readonly flyoutTop = signal<number>(0);
  /** Left edge of the flyout = the rail's right edge (read on hover). */
  protected readonly flyoutLeft = signal<number>(0);
  /** Cap for the flyout's scroll area so a tall menu never spills past the
   *  viewport on short screens (null until the first hover positions it). */
  protected readonly flyoutMaxHeight = signal<number | null>(null);
  /** Expanded-panel accordion: keys of open parents. */
  protected readonly openSections = signal<ReadonlySet<string>>(new Set());
  private leaveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Current URL as a signal, for deriving parent-active + auto-open. */
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Sub-type leaf is active only when both the path and the `?tipo=` match. */
  protected readonly childActiveOptions: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'subset',
    matrixParams: 'ignored',
    fragment: 'ignored',
  };

  protected readonly sections = computed<readonly NavSection[]>(() => {
    const cuenta: NavItem[] = [
      { key: 'carrito', label: 'Carrito', icon: 'nav-cart', path: '/cart' },
      { key: 'cuenta', label: 'Mi cuenta', icon: 'nav-account', path: '/account' },
    ];
    if (this.auth.isAdmin()) {
      cuenta.push({ key: 'admin', label: 'Admin', icon: 'nav-admin', path: '/admin' });
    }

    const kids = this.subtypeChildren();
    const childrenFor = (slug: string): readonly NavChild[] | undefined =>
      kids[slug]?.length ? kids[slug] : undefined;

    return [
      // Home sits alone at the top with no section label.
      {
        key: 'top',
        label: '',
        items: [{ key: 'home', label: 'Home', icon: 'nav-home', path: '/', exact: true }],
      },
      {
        key: 'explorar',
        label: 'Explorar',
        items: [
          // Category items all land on /products; the slug selects the
          // Categoría facet via ?categoria=. Todo carries no param ("all").
          { key: 'todo', label: 'Todo', icon: 'nav-category', path: '/products' },
          {
            key: 'singles',
            label: 'Singles',
            icon: 'nav-cards',
            path: '/products',
            queryParams: { categoria: 'singles' },
          },
          {
            key: 'sellado',
            label: 'Sellado',
            icon: 'nav-box',
            path: '/products',
            queryParams: { categoria: 'sellado' },
            children: childrenFor('sellado'),
          },
          { key: 'rifas', label: 'Rifas', icon: 'nav-raffle', path: '/rifas' },
          { key: 'subastas', label: 'Subastas', icon: 'nav-gavel', path: '/subastas' },
          { key: 'ofertas', label: 'Ofertas', icon: 'nav-ofertas', path: '/ofertas' },
          {
            key: 'accesorios',
            label: 'Accesorios',
            icon: 'nav-dice',
            path: '/products',
            queryParams: { categoria: 'accesorios' },
            children: childrenFor('accesorios'),
          },
        ],
      },
      { key: 'cuenta', label: 'Cuenta', items: cuenta },
      {
        key: 'informacion',
        label: 'Información',
        items: [
          { key: 'nosotros', label: 'Sobre nosotros', icon: 'nav-info', path: '/info/sobre-nosotros' },
          {
            key: 'envios',
            label: 'Políticas de envío',
            icon: 'nav-truck',
            path: '/info/politica-pedidos-envios',
          },
        ],
      },
    ];
  });

  constructor() {
    const registry = inject(MatIconRegistry);
    const sanitizer = inject(DomSanitizer);
    // Idempotent: re-registering the same name is harmless across remounts.
    for (const [name, svg] of Object.entries(ICONS)) {
      registry.addSvgIconLiteral(name, sanitizer.bypassSecurityTrustHtml(svg));
    }
    void this.loadSubtypes();

    // Expanded: auto-open the accordion section that holds the active leaf.
    // Never auto-close — once opened, a section stays until the user collapses it.
    effect(() => {
      if (!this.expanded()) return;
      const url = this.currentUrl();
      const sections = this.sections();
      untracked(() => {
        const open = new Set(this.openSections());
        let changed = false;
        for (const section of sections) {
          for (const item of section.items) {
            if (item.children?.length && this.itemMatchesUrl(item, url) && !open.has(item.key)) {
              open.add(item.key);
              changed = true;
            }
          }
        }
        if (changed) this.openSections.set(open);
      });
    });

    this.destroyRef.onDestroy(() => {
      if (this.leaveTimer) clearTimeout(this.leaveTimer);
    });
  }

  private async loadSubtypes(): Promise<void> {
    try {
      const cats = await this.categoriesService.list({ activeOnly: true });
      const entries = await Promise.all(
        (['sellado', 'accesorios'] as const).map(async (slug) => {
          const cat = cats.find((c) => c.slug === slug);
          if (!cat) return [slug, [] as NavChild[]] as const;
          const types = await this.cardTypesService.list({ activeOnly: true, categoryId: cat.id });
          const children = types.map<NavChild>((t) => {
            const tipo = subtypeSlug(t.slug);
            return {
              key: `${slug}.${tipo}`,
              label: t.name,
              path: '/products',
              queryParams: { categoria: slug, tipo },
            };
          });
          return [slug, children] as const;
        }),
      );
      this.subtypeChildren.set(Object.fromEntries(entries));
    } catch {
      // Best-effort — Sellado/Accesorios fall back to plain links.
    }
  }

  protected isOpen(key: string): boolean {
    return this.openSections().has(key);
  }

  /** The active `?categoria=` facet for a URL — only meaningful on /products
   *  (where every category item lives). null = no category / not on /products. */
  private categoriaOf(url: string): string | null {
    if (url.split('?')[0] !== '/products') return null;
    return this.router.parseUrl(url).queryParams['categoria'] ?? null;
  }

  /** Whether a nav item matches a URL. Category items share the /products path
   *  and are told apart by `?categoria=`; everything else uses the old
   *  exact/prefix path match that routerLinkActive used to provide. */
  private itemMatchesUrl(item: NavItem, url: string): boolean {
    const path = url.split('?')[0];
    if (item.path === '/products') {
      return path === '/products' && this.categoriaOf(url) === (item.queryParams?.['categoria'] ?? null);
    }
    return item.exact ? path === item.path : path === item.path || path.startsWith(item.path + '/');
  }

  /** Active state for a plain link (drives `.active`). */
  protected isItemActive(item: NavItem): boolean {
    return this.itemMatchesUrl(item, this.currentUrl());
  }

  /** Parent (with children) reads active when the URL is inside its category. */
  protected isParentActive(item: NavItem): boolean {
    return !!item.children?.length && this.isItemActive(item);
  }

  protected onParentEnter(item: NavItem, ev: MouseEvent): void {
    if (this.expanded() || !item.children?.length) return;
    if (this.leaveTimer) {
      clearTimeout(this.leaveTimer);
      this.leaveTimer = null;
    }
    const iconRect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.flyoutLeft.set(this.hostEl.nativeElement.getBoundingClientRect().right);
    this.positionFlyout(iconRect, item.children.length);
    this.hoveredKey.set(item.key);
  }

  /**
   * Vertically place the collapsed-rail flyout so the whole panel stays on
   * screen. It opens anchored to the icon, but slides up when it would overflow
   * the bottom — like a native menu near the screen edge. The card height is
   * estimated from the row count (rows are fixed-height); an off estimate only
   * nudges where it opens. Correctness is guaranteed by `flyoutMaxHeight`, which
   * caps the scroll area to the viewport, so items are never clipped — at worst
   * the panel scrolls on a very short screen.
   */
  private positionFlyout(iconRect: DOMRect, childCount: number): void {
    const view = this.hostEl.nativeElement.ownerDocument.defaultView;
    if (!view) {
      // No window (e.g. SSR) — fall back to the plain icon-anchored position.
      this.flyoutTop.set(iconRect.top);
      this.flyoutMaxHeight.set(null);
      return;
    }
    const MARGIN = 12; // gap kept from the viewport's top/bottom edges
    const CARD_PAD = 24; // .flyout-card vertical padding (exact: 12px × 2)
    const HEADER = 45; // header block — approx, only sways the open position
    const SEE_ALL = 49; // "Ver todo" row — approx
    const ROW = 36; // each .child link (matches .child height)
    const availForCard = view.innerHeight - MARGIN * 2;
    const estimated = CARD_PAD + HEADER + childCount * ROW + SEE_ALL;
    const cardHeight = Math.min(estimated, availForCard);
    const top = Math.max(MARGIN, Math.min(iconRect.top, view.innerHeight - MARGIN - cardHeight));
    this.flyoutTop.set(top);
    this.flyoutMaxHeight.set(availForCard - CARD_PAD);
  }

  protected onParentLeave(): void {
    if (this.expanded()) return;
    this.leaveTimer = setTimeout(() => this.hoveredKey.set(null), 80);
  }

  /** Keep the flyout open while the cursor is over it. */
  protected onFlyoutEnter(): void {
    if (this.leaveTimer) {
      clearTimeout(this.leaveTimer);
      this.leaveTimer = null;
    }
  }

  protected closeFlyout(): void {
    this.hoveredKey.set(null);
  }

  protected onParentClick(item: NavItem): void {
    if (!item.children?.length) return;
    // Collapsed rail: the icon navigates to the category landing (sub-types are
    // still reachable via the hover flyout). Expanded panel: toggle the accordion.
    if (!this.expanded()) {
      this.closeFlyout();
      void this.router.navigate([item.path], { queryParams: item.queryParams ?? {} });
      return;
    }
    const open = new Set(this.openSections());
    if (open.has(item.key)) open.delete(item.key);
    else open.add(item.key);
    this.openSections.set(open);
  }
}

/** Clean URL slug for a sub-type: the card_type slug without its category prefix
 *  (`sellado-booster-box` → `booster-box`). Mirrors CardList's subtypeSlug. */
function subtypeSlug(slug: string): string {
  const dash = slug.indexOf('-');
  return dash === -1 ? slug : slug.slice(dash + 1);
}
