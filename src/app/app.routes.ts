import { Routes } from '@angular/router';
import { adminGuard } from './core/auth/admin.guard';
import { customerGuard } from './core/auth/customer.guard';

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
        path: 'categories',
        loadComponent: () =>
          import('./admin/categories/categories').then((m) => m.Categories),
      },
      {
        path: 'card-types',
        loadComponent: () =>
          import('./admin/card-types/card-types').then((m) => m.CardTypes),
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
        path: 'sets',
        loadComponent: () => import('./admin/sets/sets').then((m) => m.Sets),
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
    path: '',
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
    ],
  },
];
