import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validates that a control's value is exactly `length` digits (0-9 only, no
 * separators or spaces). Reusable across forms — compose convenience
 * validators like {@link phoneValidator} on top of it.
 *
 * Empty values pass so the field stays optional; pair with
 * `Validators.required` when the field is mandatory.
 *
 * Error shape (one key at a time, so a single `<mat-error>` covers both):
 *   { digits: true }          — value contains non-digit characters
 *   { digitsLength: { requiredLength, actualLength } } — wrong digit count
 */
export function digitsValidator(length: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = control.value;
    if (raw == null || raw === '') return null;
    const value = String(raw).trim();
    if (!/^\d+$/.test(value)) return { digits: true };
    if (value.length !== length) {
      return { digitsLength: { requiredLength: length, actualLength: value.length } };
    }
    return null;
  };
}

/** Costa Rica phone numbers: exactly 8 digits, no separators. */
export function phoneValidator(): ValidatorFn {
  return digitsValidator(8);
}
