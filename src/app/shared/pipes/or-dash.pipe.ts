import { Pipe, PipeTransform } from '@angular/core';

/**
 * Renders an em dash (`—`, U+2014) for any missing value — null, undefined,
 * empty string, or empty array — and passes everything else through unchanged.
 *
 * Used across the product-detail page so each field keeps its label and slot
 * even when the data is absent (pre-orders arrive with most card fields null).
 * Style the surrounding span with `.dash` so the dash reads as "missing".
 */
@Pipe({ name: 'orDash' })
export class OrDashPipe implements PipeTransform {
  transform(value: unknown): unknown {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value) && value.length === 0) return '—';
    return value;
  }
}
