import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SupabaseService } from '../supabase/supabase.service';

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
  private readonly supabase = inject(SupabaseService);
  private readonly endpoint = environment.images?.listUrl ?? '';

  /** Header carrying the admin's Supabase token so the PHP endpoints can gate. */
  private async authHeaders(): Promise<Record<string, string>> {
    const { data } = await this.supabase.client.auth.getSession();
    const token = data.session?.access_token;
    return token ? { 'X-Supabase-Token': token } : {};
  }

  /** Friendly message for an auth rejection from the endpoints; null otherwise. */
  private authError(status: number): string | null {
    return status === 401 || status === 403
      ? 'Sesión expirada o sin permisos para imágenes.'
      : null;
  }

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
    // Build the request URL by hand so a root-relative endpoint stays relative
    // (same-origin → goes through the /card-images dev proxy on localhost).
    const qs = path ? `?path=${encodeURIComponent(path)}` : '';
    const res = await fetch(`${this.endpoint}${qs}`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...(await this.authHeaders()) },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(
        this.authError(res.status) ??
          `Listado falló (${res.status}). Verifica que el archivo PHP esté instalado.`,
      );
    }
    const data = (await res.json()) as ImageListing;
    // The PHP endpoint returns absolute URLs (built from its own host). Reduce
    // them to root-relative paths so picked images load through the dev proxy on
    // localhost, stay same-origin in production, and survive the domain cutover —
    // matching the relative URLs the TCGdex auto-fill produces.
    return { ...data, files: data.files.map((f) => ({ ...f, url: this.toRelativeUrl(f.url) })) };
  }

  /**
   * Upload an image into `path` (a subfolder under the card-images root, '' = root).
   * Returns the created file. Rides the same relative endpoint + dev proxy as `list()`.
   */
  async upload(path: string, file: File): Promise<BrowsedFile> {
    if (!this.isEnabled()) {
      throw new Error('Image picker is not configured (environment.images.listUrl is empty).');
    }
    const endpoint = this.endpoint.replace(/list-images\.php(\?.*)?$/, 'upload-image.php');
    const body = new FormData();
    body.append('file', file);
    body.append('path', path);
    // No explicit Content-Type — the browser sets the multipart boundary.
    const res = await fetch(endpoint, { method: 'POST', body, cache: 'no-store', headers: await this.authHeaders() });
    if (!res.ok) {
      const code = await res
        .json()
        .then((d) => (d as { error?: string }).error)
        .catch(() => null);
      throw new Error(this.authError(res.status) ?? `Subida falló (${res.status}${code ? `: ${code}` : ''}).`);
    }
    const f = (await res.json()) as BrowsedFile;
    return { ...f, url: this.toRelativeUrl(f.url) };
  }

  /**
   * Create a subfolder `name` under `path` (the card-images root when '') and
   * return it. Idempotent server-side. Rides the same relative endpoint + proxy.
   */
  async createFolder(path: string, name: string): Promise<BrowsedDir> {
    if (!this.isEnabled()) {
      throw new Error('Image picker is not configured (environment.images.listUrl is empty).');
    }
    const endpoint = this.endpoint.replace(/list-images\.php(\?.*)?$/, 'create-folder.php');
    const body = new FormData();
    body.append('path', path);
    body.append('name', name);
    const res = await fetch(endpoint, { method: 'POST', body, cache: 'no-store', headers: await this.authHeaders() });
    if (!res.ok) {
      const code = await res
        .json()
        .then((d) => (d as { error?: string }).error)
        .catch(() => null);
      throw new Error(this.authError(res.status) ?? `Crear carpeta falló (${res.status}${code ? `: ${code}` : ''}).`);
    }
    return (await res.json()) as BrowsedDir;
  }

  /** Reduce an absolute image URL to a root-relative path; leave relative URLs as-is. */
  private toRelativeUrl(url: string): string {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }
}
