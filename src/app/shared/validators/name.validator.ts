import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Allows only letters (any language, incl. Spanish accents and ñ), spaces and
 * dots — rejects digits and other symbols. Reusable for person-name fields.
 * Spaces are permitted so full names ("Diego Álvarez") still pass.
 *
 * Empty values pass so the field stays optional; pair with
 * `Validators.required` when mandatory.
 *
 * Error shape: { name: true }
 */
const NAME_PATTERN = /^[\p{L}\s.]+$/u;

export function nameValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = control.value;
    if (raw == null || raw === '') return null;
    const value = String(raw).trim();
    if (value === '') return null;
    return NAME_PATTERN.test(value) ? null : { name: true };
  };
}
