import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Thin wrapper around `window.localStorage`. Centralises the SSR guard and
 * the try/catch we'd otherwise scatter through every consumer (private mode
 * and quota-exceeded errors throw on access).
 *
 * Stores raw strings only — callers are responsible for JSON-encoding richer
 * values. Pass `null` to `set()` to remove the key.
 */
@Injectable({ providedIn: 'root' })
export class LocalStorageService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  get(key: string): string | null {
    if (!this.isBrowser) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string | null): void {
    if (!this.isBrowser) return;
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      // Storage may be disabled or full — fail silently.
    }
  }

  remove(key: string): void {
    this.set(key, null);
  }
}
