import { Component, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

const INSTAGRAM_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.334 3.608 1.31.975.975 1.248 2.242 1.31 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.334 2.633-1.31 3.608-.975.975-2.242 1.248-3.608 1.31-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.334-3.608-1.31-.975-.975-1.248-2.242-1.31-3.608C2.175 15.584 2.163 15.204 2.163 12s.012-3.584.07-4.85c.062-1.366.334-2.633 1.31-3.608.975-.975 2.242-1.248 3.608-1.31 1.266-.058 1.646-.07 4.85-.07zm0-2.163c-3.259 0-3.667.014-4.947.072-1.635.074-3.197.56-4.31 1.673C1.63 2.858 1.144 4.42 1.07 6.055 1.014 7.335 1 7.741 1 12c0 4.259.014 4.667.072 5.947.074 1.635.56 3.197 1.673 4.31 1.113 1.113 2.675 1.599 4.31 1.673C8.333 23.986 8.741 24 12 24c3.259 0 3.667-.014 4.947-.072 1.635-.074 3.197-.56 4.31-1.673 1.113-1.113 1.599-2.675 1.673-4.31.058-1.28.072-1.688.072-5.947 0-4.259-.014-4.667-.072-5.947-.074-1.635-.56-3.197-1.673-4.31C19.144 1.63 17.582 1.144 15.947 1.07 14.667 1.014 14.259 1 12 1zm0 5.838a5.162 5.162 0 1 0 0 10.324 5.162 5.162 0 0 0 0-10.324zm0 8.162a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm5.406-9.845a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/>
</svg>`;

const FACEBOOK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
</svg>`;

const WHATSAPP_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
</svg>`;

@Component({
  selector: 'app-header',
  imports: [RouterLink, MatToolbarModule, MatIconModule, MatButtonModule, MatInputModule, MatFormFieldModule],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  readonly toggleNav = output<void>();

  private readonly router = inject(Router);

  constructor() {
    const registry = inject(MatIconRegistry);
    const sanitizer = inject(DomSanitizer);
    registry.addSvgIconLiteral('instagram', sanitizer.bypassSecurityTrustHtml(INSTAGRAM_ICON));
    registry.addSvgIconLiteral('facebook', sanitizer.bypassSecurityTrustHtml(FACEBOOK_ICON));
    registry.addSvgIconLiteral('whatsapp', sanitizer.bypassSecurityTrustHtml(WHATSAPP_ICON));
  }

  protected onSearch(query: string): void {
    const q = query.trim();
    if (q) {
      this.router.navigate(['/products'], { queryParams: { q } });
    }
  }
}
