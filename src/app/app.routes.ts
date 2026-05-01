import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'admin',
    loadComponent: () =>
      import('./admin/admin-shell/admin-shell').then((m) => m.AdminShell),
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
        path: 'products/:id',
        loadComponent: () =>
          import('./user/detail/detail').then((m) => m.Detail),
      },
    ],
  },
];
