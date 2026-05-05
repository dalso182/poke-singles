import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { Header } from '../header/header';
import { Navigation } from '../navigation/navigation';
import { Footer } from '../footer/footer';
import { CardPreviewOverlay } from '../../shared/card-preview/card-preview-overlay';

@Component({
  selector: 'app-user-shell',
  imports: [RouterOutlet, MatSidenavModule, Header, Navigation, Footer, CardPreviewOverlay],
  templateUrl: './user-shell.html',
  styleUrl: './user-shell.scss',
})
export class UserShell {
  protected readonly sidenavOpen = signal(true);

  protected toggleSidenav(): void {
    this.sidenavOpen.update((open) => !open);
  }
}
