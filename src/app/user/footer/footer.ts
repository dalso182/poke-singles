import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** A footer link is either internal (router) or external (new-tab href). */
interface FooterLink {
  label: string;
  /** Internal router path. Mutually exclusive with `href`. */
  route?: string;
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
        { label: 'Nuevos ingresos', route: '/products' },
        { label: 'Sets disponibles', route: '/products' },
        { label: 'Rifas en vivo', route: '/rifas' },
      ],
    },
    {
      title: 'Información',
      links: [
        { label: 'Estado de cartas', route: '/info/estado-de-cartas' },
        { label: 'Métodos de pago y envío', route: '/info/metodos-pago-envio' },
        { label: 'Política de pedidos y envíos', route: '/info/politica-pedidos-envios' },
        { label: 'Garantía de autenticidad', route: '/info/garantia-autenticidad' },
      ],
    },
    {
      title: 'Mi cuenta',
      links: [
        { label: 'Mi cuenta', route: '/account' },
        { label: 'Mis órdenes', route: '/account' },
        { label: 'Lista de deseos', route: '/account' },
        { label: 'Wishlist alerts', route: '/account' },
      ],
    },
    {
      title: 'Contacto',
      links: [
        { label: 'Contáctanos', route: '/info/contacto' },
        { label: 'Sobre nosotros', route: '/info/sobre-nosotros' },
        { label: 'WhatsApp', href: 'https://wa.me/50663452039' },
        { label: 'Instagram DM', href: 'https://www.instagram.com/pokesingles/' },
      ],
    },
  ];

  protected readonly stats: FooterStat[] = [
    { value: '6,400+', label: 'Cartas verificadas' },
    { value: '2,180+', label: 'Pedidos enviados' },
    { value: '9 años', label: 'Bóveda activa' },
  ];
}
