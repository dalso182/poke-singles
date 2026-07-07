import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { adminGuard } from './core/auth/admin.guard';
import { customerGuard } from './core/auth/customer.guard';
import { maintenanceGuard } from './core/auth/maintenance.guard';

export const routes: Routes = [
  {
    path: 'admin',
    canActivate: [adminGuard],
    canActivateChild: [adminGuard],
    loadComponent: () =>
      import('./admin/admin-shell/admin-shell').then((m) => m.AdminShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./admin/admin-dashboard/admin-dashboard').then((m) => m.AdminDashboard),
      },
      {
        path: 'products',
        pathMatch: 'full',
        loadComponent: () =>
          import('./admin/products-list/products-list').then((m) => m.ProductsList),
      },
      {
        path: 'products/new',
        loadComponent: () =>
          import('./admin/add-product/add-product').then((m) => m.AddProduct),
      },
      {
        path: 'products/:id/edit',
        loadComponent: () =>
          import('./admin/product-edit/product-edit').then((m) => m.ProductEdit),
      },
      {
        path: 'raffles',
        pathMatch: 'full',
        loadComponent: () =>
          import('./admin/raffles/raffles').then((m) => m.Raffles),
      },
      {
        path: 'raffles/:id',
        loadComponent: () =>
          import('./admin/raffles/raffle-detail').then((m) => m.RaffleDetail),
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./admin/categories/categories').then((m) => m.Categories),
      },
      {
        path: 'sellers',
        loadComponent: () =>
          import('./admin/sellers/sellers').then((m) => m.Sellers),
      },
      {
        path: 'filters',
        loadComponent: () =>
          import('./admin/filters/filters').then((m) => m.Filters),
      },
      {
        path: 'coupons',
        pathMatch: 'full',
        loadComponent: () =>
          import('./admin/coupons/coupons').then((m) => m.Coupons),
      },
      {
        path: 'coupons/new',
        loadComponent: () =>
          import('./admin/coupons/coupon-edit').then((m) => m.CouponEdit),
      },
      {
        path: 'coupons/:id/edit',
        loadComponent: () =>
          import('./admin/coupons/coupon-edit').then((m) => m.CouponEdit),
      },
      {
        path: 'shipping-methods',
        loadComponent: () =>
          import('./admin/shipping-methods/shipping-methods').then((m) => m.ShippingMethods),
      },
      {
        path: 'orders',
        pathMatch: 'full',
        loadComponent: () =>
          import('./admin/orders/orders').then((m) => m.Orders),
      },
      {
        path: 'orders/:id',
        loadComponent: () =>
          import('./admin/order-detail/order-detail').then((m) => m.OrderDetail),
      },
      {
        path: 'customers',
        pathMatch: 'full',
        loadComponent: () =>
          import('./admin/customers/customers').then((m) => m.Customers),
      },
      {
        path: 'customers/:id',
        loadComponent: () =>
          import('./admin/customers/customer-detail').then((m) => m.CustomerDetail),
      },
      {
        path: 'reports',
        pathMatch: 'full',
        loadComponent: () =>
          import('./admin/reports/reports').then((m) => m.Reports),
      },
      {
        path: 'price-review',
        loadComponent: () =>
          import('./admin/price-review/price-review').then((m) => m.PriceReview),
      },
      {
        path: 'sets',
        loadComponent: () => import('./admin/sets/sets').then((m) => m.Sets),
      },
      {
        path: 'pages',
        pathMatch: 'full',
        loadComponent: () =>
          import('./admin/pages/pages-list').then((m) => m.PagesList),
      },
      {
        path: 'pages/new',
        loadComponent: () =>
          import('./admin/pages/page-edit').then((m) => m.PageEdit),
      },
      {
        path: 'pages/:id/edit',
        loadComponent: () =>
          import('./admin/pages/page-edit').then((m) => m.PageEdit),
      },
      {
        path: 'config',
        loadComponent: () =>
          import('./admin/config/config').then((m) => m.AdminConfig),
      },
    ],
  },
  {
    path: 'library',
    loadComponent: () => import('./library/library').then((m) => m.Library),
  },
  {
    // Standalone maintenance screen (no shell). Redirect target of
    // maintenanceGuard; must come before the empty-path UserShell so the
    // catch-all doesn't swallow it. Not itself gated — it's the fallback.
    path: 'mantenimiento',
    loadComponent: () =>
      import('./maintenance/maintenance').then((m) => m.Maintenance),
  },
  {
    path: '',
    canActivate: [maintenanceGuard],
    canActivateChild: [maintenanceGuard],
    loadComponent: () =>
      import('./user/user-shell/user-shell').then((m) => m.UserShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./home/home').then((m) => m.Home),
      },
      {
        path: 'products',
        loadComponent: () =>
          import('./user/card-list/card-list').then((m) => m.CardList),
      },
      {
        path: 'buscar',
        loadComponent: () =>
          import('./user/search-results/search-results').then((m) => m.SearchResults),
      },
      {
        path: 'rifas',
        loadComponent: () => import('./user/rifas/rifas').then((m) => m.Rifas),
      },
      {
        // Reuses CardList; route data flips it into discounted-only mode and
        // keeps filter/sort navigation on /ofertas (see CardList.basePath).
        path: 'ofertas',
        data: { onSaleOnly: true, basePath: '/ofertas' },
        loadComponent: () =>
          import('./user/card-list/card-list').then((m) => m.CardList),
      },
      {
        // Legacy category pages now live as the `?categoria=` facet on
        // /products. Redirect old/bookmarked links there, preserving any
        // incoming query params (e.g. ?tipo=).
        path: 'categoria/:categorySlug',
        redirectTo: ({ params, queryParams }) =>
          inject(Router).createUrlTree(['/products'], {
            queryParams: { categoria: params['categorySlug'], ...queryParams },
          }),
      },
      {
        path: 'products/:slug',
        loadComponent: () =>
          import('./user/detail/detail').then((m) => m.Detail),
      },
      {
        path: 'account',
        canActivate: [customerGuard],
        loadComponent: () =>
          import('./user/account/account').then((m) => m.Account),
      },
      {
        // Deep links straight into an account panel (order-confirmation "Ver
        // mis pedidos", footer, header coins chip / "Canjear"). Same Account
        // component; `initialView` binds from route data via
        // withComponentInputBinding. Bare /account = the Datos panel.
        path: 'account/direccion',
        canActivate: [customerGuard],
        data: { initialView: 'direccion' },
        loadComponent: () =>
          import('./user/account/account').then((m) => m.Account),
      },
      {
        path: 'account/pedidos',
        canActivate: [customerGuard],
        data: { initialView: 'pedidos' },
        loadComponent: () =>
          import('./user/account/account').then((m) => m.Account),
      },
      {
        path: 'account/puntos',
        canActivate: [customerGuard],
        data: { initialView: 'puntos' },
        loadComponent: () =>
          import('./user/account/account').then((m) => m.Account),
      },
      {
        path: 'account/pokedex',
        canActivate: [customerGuard],
        data: { initialView: 'pokedex' },
        loadComponent: () =>
          import('./user/account/account').then((m) => m.Account),
      },
      {
        path: 'cart',
        loadComponent: () =>
          import('./user/cart-page/cart-page').then((m) => m.CartPage),
      },
      {
        path: 'checkout',
        loadComponent: () =>
          import('./user/checkout/checkout').then((m) => m.Checkout),
      },
      {
        path: 'checkout/confirmation/:id',
        loadComponent: () =>
          import('./user/order-confirmation/order-confirmation').then(
            (m) => m.OrderConfirmation,
          ),
      },
      {
        path: 'info/:slug',
        loadComponent: () =>
          import('./user/static-page/static-page').then((m) => m.StaticPage),
      },
    ],
  },
];
