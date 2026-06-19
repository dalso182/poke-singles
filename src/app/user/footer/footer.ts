import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** A footer link is either internal (router) or external (new-tab href). */
interface FooterLink {
  label: string;
  /** Internal router path. Mutually exclusive with `href`. */
  route?: string;
  /** Optional query params for the internal route (e.g. default sort). */
  queryParams?: Record<string, string>;
  /** External URL — rendered as a new-tab anchor. Mutually exclusive with `route`. */
  href?: string;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

interface FooterStat {
  value: string;
  label: string;
}

/**
 * Site footer (Light Vault). Brand moment: wordmark + amber eyebrow, link
 * columns, social tiles, and a trust-stat row. Routes are bound to the real
 * router config; pages that don't exist yet (info/* slugs, wishlist) resolve
 * to the nearest live destination — swap in dedicated routes as they ship.
 */
@Component({
  selector: 'app-footer',
  imports: [RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  protected readonly year = new Date().getFullYear();

  protected readonly columns: FooterColumn[] = [
    {
      title: 'Tienda',
      links: [
        { label: 'Ofertas', route: '/ofertas' },
        { label: 'Nuevos ingresos', route: '/products', queryParams: { sort: 'recent' } },
        { label: 'Rifas', route: '/rifas' },
        { label: 'Sobre nosotros', route: '/info/sobre-nosotros' },
      ],
    },
    {
      title: 'Información',
      links: [
        { label: 'Estado de cartas', route: '/info/estado-de-cartas' },
        { label: 'Métodos de pago y envío', route: '/info/metodos-pago-envio' },
        { label: 'Política de pedidos y envíos', route: '/info/politica-pedidos-envios' },
      ],
    },
    {
      title: 'Mi cuenta',
      links: [
        { label: 'Mi cuenta', route: '/account' },
        { label: 'Mis órdenes', route: '/account' },
      ],
    },
  ];

  protected readonly stats: FooterStat[] = [
    { value: '2021', label: 'Desde' },
    { value: '10,000+', label: 'Cartas vendidas' },
    { value: '6,500+', label: 'Pedidos realizados' },
  ];
}
