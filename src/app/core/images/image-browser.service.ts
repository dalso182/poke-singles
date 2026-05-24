import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface BrowsedDir {
  readonly name: string;
  readonly path: string;
}

export interface BrowsedFile {
  readonly name: string;
  readonly path: string;
  readonly url: string;
  readonly size: number;
  readonly mtime: number;
}

export interface ImageListing {
  readonly path: string;
  readonly parent: string | null;
  readonly dirs: readonly BrowsedDir[];
  readonly files: readonly BrowsedFile[];
}

@Injectable({ providedIn: 'root' })
export class ImageBrowserService {
  private readonly endpoint = environment.images?.listUrl ?? '';

  /**
   * Origin (scheme + host) serving the `/card-images/` tree, derived from the
   * listing endpoint. Used to resolve relative image paths for display. Empty
   * when the picker is unconfigured or the URL is malformed.
   */
  readonly origin = (() => {
    if (!this.endpoint) return '';
    try {
      return new URL(this.endpoint).origin;
    } catch {
      return '';
    }
  })();

  isEnabled(): boolean {
    return this.endpoint.length > 0;
  }

  async list(path = ''): Promise<ImageListing> {
    if (!this.isEnabled()) {
      throw new Error('Image picker is not configured (environment.images.listUrl is empty).');
    }
    const url = new URL(this.endpoint);
    if (path) url.searchParams.set('path', path);
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Listado falló (${res.status}). Verifica que el archivo PHP esté instalado.`);
    }
    return (await res.json()) as ImageListing;
  }
}
