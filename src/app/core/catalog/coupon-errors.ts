import type { CouponErrorCode } from './catalog.types';

/** Map a machine-readable validate_coupon error code (and optional `gap`
 *  amount for BELOW_MINIMUM) to user-facing Spanish copy. Centralised so
 *  the cart, drawer, and any future surface stay consistent. */
export function mapCouponError(error: CouponErrorCode, gap?: number): string {
  switch (error) {
    case 'AUTH_REQUIRED':
      return 'Inicia sesión para usar un cupón.';
    case 'NOT_FOUND':
      return 'Código de cupón inválido.';
    case 'INACTIVE':
      return 'Este cupón ya no está disponible.';
    case 'EXPIRED':
      return 'Este cupón ha expirado.';
    case 'LIMIT_REACHED':
      return 'Ya usaste este cupón.';
    case 'BELOW_MINIMUM': {
      const formatted = (gap ?? 0).toLocaleString('es-CR', {
        maximumFractionDigits: 0,
      });
      return `Agrega ₡${formatted} más a tu carrito para usar este cupón.`;
    }
  }
}
