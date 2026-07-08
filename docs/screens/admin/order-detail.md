# Admin — Order detail

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

Single-order workbench: full buyer/shipping/payment context, the line-item snapshots (with set, condition, and consignment-seller info frozen at purchase time), forward status transitions (`Marcar como pagado` / `Marcar como completado`), atomic cancellation with restock + optional note (via the `cancel_order` RPC and a confirm dialog), payment-proof viewing/attaching against the private `payment-proofs` bucket, and a tap-to-check picking grid for physically pulling cards.

## Route & access

- **Path:** `/admin/orders/:id` (UUID `orders.id`, not the human `order_number`), lazy `loadComponent` → `OrderDetail` from `src/app/admin/order-detail/order-detail.ts`.
- **Guards:** parent `/admin` route has `canActivate: [adminGuard]` + `canActivateChild: [adminGuard]` (`src/app/app.routes.ts`). Reads/writes additionally require the `orders_admin_all` / `order_items_admin_all` RLS policies; the `cancel_order` RPC re-checks `is_admin()` itself.
- **Params:** `:id` is bound via `readonly id = input.required<string>()` (app-wide `withComponentInputBinding()` in `app.config.ts`). No query params.

## Files

- `src/app/admin/order-detail/order-detail.ts` — `OrderDetail` component (selector `app-admin-order-detail`).
- `src/app/admin/order-detail/order-detail.html` — header, cancel banner, action bar, two-tab body (info / picking grid).
- `src/app/admin/order-detail/order-detail.scss` — `.order-detail__*` styles: cancel banner (red-tinted via `color-mix` on `--brand-red`), proof image, summary rows, picking-grid cards.
- `src/app/admin/order-detail/cancel-order-dialog.ts|html|scss` — `CancelOrderDialog` (selector `app-cancel-order-dialog`) + `CancelOrderDialogData { shortRef }` / `CancelOrderDialogResult = string | null`.
- `src/app/core/orders/orders.service.ts` — `OrdersService`: `getOrderForAdmin`, `updateOrderStatus`, `cancelOrder`, `uploadPaymentProof`, `adminAttachPaymentProof`, `getPaymentProofSignedUrl`, `WHATSAPP_PROOF_SENTINEL`.
- `src/app/core/storage/local-storage.service.ts` — `LocalStorageService`, used for pick-state persistence.
- `src/app/core/catalog/catalog.types.ts` — `OrderRow`, `OrderItemRow`, `OrderStatus`, `ShippingAddress`.
- Backend: `supabase/migrations/20260509000000_cancel_order.sql`, `20260523000000_cancel_order_notes.sql`, `20260523000100_cancel_order_releases_coupon.sql` (current RPC body), `20260526000000_products_restock_respect_caller.sql` (restock trigger), `20260528000000_loyalty_points.sql` (status trigger), `20260508000600` / `20260509000400` / `20260629000000` (payment-proofs storage policies).

## UI anatomy

1. **Header** (`.order-detail__header.admin-page-header`) — back icon-button (`arrow_back`, aria-label `"Volver"`) → `goBack()` → `/admin/orders`; eyebrow `"Pedido"`; `<h1>` with monospace `shortRef()` (e.g. `#7300`) and a status chip `span.order-status.order-status--{{status}}` showing `statusLabel()` (`"Pendiente"` / `"Pagado"` / `"Enviado"` / `"Completado"` / `"Cancelado"`).
2. **`<mat-progress-bar mode="indeterminate">`** while `loading()`.
3. **Not-found card** (when `notFound()`) — `"No encontramos este pedido."` + stroked-button link `"Volver al listado"` → `/admin/orders`.
4. **Cancel banner** (only when `status === 'cancelled'`, `.order-detail__cancel-banner`, `role="status"`) — `cancel` icon, bold `"Pedido cancelado."`, then `cancellation_notes` or the muted fallback `"Sin nota."`.
5. **Action bar** (`mat-card.order-detail__actions`):
   - Forward button (`mat-flat-button color="primary"`, `check_circle` icon) — rendered only when `forwardAction()` is non-null: `pending` → label `"Marcar como pagado"` (next `paid`); `paid` → `"Marcar como completado"` (next `completed`). No button for `shipped`, `completed`, `cancelled`.
   - Cancel button (`mat-stroked-button color="warn"`, `cancel` icon, label `"Cancelar pedido"`) — disabled unless `canCancel()` (`status === 'pending' || status === 'paid'`) and not `working()`.
6. **`<mat-tab-group animationDuration="180ms">`** with two tabs:
   - **Tab `"Info pedido"`** — stacked `mat-card` panels:
     - **Cliente** — bold `customer_name`; `mailto:` link on `customer_email` · `tel:` link on `customer_phone`; optional muted `"Notas:"` + `customer_notes`.
     - **Envío** — subtitle `shipping_method_name`; address lines from `shipping_address` (`line1` + optional `, line2`; `city, province`; optional muted `notes`) or `"Sin dirección registrada."`; always `"Costo de envío: ₡{{ shipping_amount | number: '1.0-0' }}"`.
     - **Comprobante de pago** — subtitle `paymentLabel()` (`"SINPE / Transferencia"` / `"Pago por enlace"`). For `payment_link` orders only the muted copy `"Pago por enlace — gestionado fuera del sistema. Marca el pedido como pagado cuando confirmes la transacción."` (no upload UI). Otherwise, switched on `proofKind()`:
       - `file` — the proof rendered as a clickable `<img class="order-detail__proof-img">` inside an `<a target="_blank">` on the signed URL, with hint `"Click para abrir en tamaño completo."` (`open_in_new` icon); or `"No se pudo generar el enlace al comprobante."` if signing failed.
       - `whatsapp` — `chat` icon + `"Comprobante enviado por WhatsApp. Revisa los mensajes."`.
       - `none` — `"Aún sin comprobante."`.
       - Below: hidden `<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf">` + stroked button labelled `"Reemplazar comprobante"` (icon `autorenew`) when a file exists, else `"Adjuntar comprobante"` (icon `upload`); `"Subiendo…"` while `uploadingProof()`.
     - **Ítems** — subtitle `"Snapshots — el producto pudo cambiar después del pedido."`; `mat-table` (`displayedColumns = ['image', 'name', 'condition', 'qty', 'unit', 'total']`): `<app-thumb [size]="36">` on `product_image_url`; name links to `['/products', product_slug]` in a new tab, plus a blue `<app-pill>` with `seller_code` (tooltip-title `seller_name`) for consignment lines; condition span classed by `conditionClass()` (`condition-pill--nm|lp|mp|hp` — `HP` and `DMG` share `--hp`) or dimmed `—`; `Cant.`; `<app-money>` on `unit_price` and `line_total`.
     - **Resumen** — `Subtotal`; discount row only when `discount_amount > 0`, labelled with `coupon_code` (fallback `"Descuento"`) and value styled `.price--sale` (`−₡…`); `Envío`; bold `Total`. All `| number: '1.0-0'` with a literal `₡`.
     - **Audit** (`.order-detail__audit`) — `ID interno` (UUID, monospace), `Creado` / `Última actualización` (`date: 'medium'`).
   - **Tab `[label]="'Items (' + items().length + ')'"`** — picking grid. Hint: `"Para preparar el pedido. Snapshots — el producto pudo cambiar después."`. Each item is an `<article class="order-detail__pick">` acting as a toggle button (`role="button"`, `tabindex="0"`, `aria-pressed`, Enter/Space handled) → `togglePick(item.id)`; shows `×{{quantity}}` badge when qty > 1, an `open_in_new` corner link to the product (stops propagation, tooltip `"Abrir carta en otra pestaña"`), the card image (or `"Sin imagen"`), name, monospace `setLabel()` (`"Set name · #card_number"`, either part optional), condition pill, seller pill, and a `check_circle` overlay when picked (`.order-detail__pick--checked`).

## Services & backend

- **`getOrderForAdmin(id)`** — `from('orders').select('*, order_items(*)').eq('id', id).maybeSingle()`; splits into `{ order: OrderRow, items: OrderItemRow[] }`; `null` on error/not found. Rides `orders_admin_all` RLS.
- **`updateOrderStatus(id, next)`** — plain PostgREST `update({ status }).eq('id', id)` returning the row. Validates `next` against the five statuses and **throws `'Usa cancelOrder() para cancelar — restaura stock.'` if asked for `cancelled`** — forward transitions have no side effects in the app, but see the DB triggers below.
- **`cancelOrder(id, notes?)`** — RPC **`cancel_order(p_order_id uuid, p_notes text default null)`** (SECURITY DEFINER, current body from `20260523000100_cancel_order_releases_coupon.sql`). Steps, atomically:
  1. `is_admin()` check → `{ ok: false, error: 'NOT_ADMIN' }`.
  2. `SELECT … FOR UPDATE` lock → `'NOT_FOUND'` if missing.
  3. Rejects `status IN ('cancelled', 'completed')` → `'ALREADY_TERMINAL'` (note: `shipped` **is** cancellable at the RPC level).
  4. Restock: for each `order_items` row with `product_id IS NOT NULL`, `UPDATE products SET quantity = quantity + item.quantity`. Snapshot rows whose product was deleted (FK set NULL) are skipped.
  5. `DELETE FROM coupon_redemptions WHERE order_id = …` — releases the redemption so the customer's `max_uses_per_user` counter goes back down (no-op without a coupon).
  6. `UPDATE orders SET status = 'cancelled', cancellation_notes = v_notes` where `v_notes = nullif(btrim(coalesce(p_notes, '')), '')` — whitespace-only notes become NULL.
  Returns `jsonb {ok: true}` or `{ok: false, error}`; the service maps transport errors to `{ ok: false, error: 'RPC_ERROR' }`.
- **DB triggers that fire on this screen's status writes** (no app code involved):
  - `orders_loyalty_points` (AFTER UPDATE OF `status` on `orders`, fn `award_or_reverse_loyalty_points`, from `20260528000000_loyalty_points.sql`) — the `"Marcar como pagado"` UPDATE awards `'earn'` loyalty points (when `loyalty_enabled`, user is signed-up, once per order); `cancel_order`'s final UPDATE writes a `'reversal'` row for previously earned points (balance may go negative by design).
  - `tg_products_track_restock` (from `20260526000000_products_restock_respect_caller.sql`) — the restock UPDATE bumps `products.last_restocked_at = now()` whenever a product goes 0 → >0, so cancelling can mark a card as "freshly restocked".
- **Payment proofs** — private storage bucket **`payment-proofs`** (5 MiB `file_size_limit`, mime allowlist jpeg/png/webp/pdf):
  - Viewing: `getPaymentProofSignedUrl(filePath, expiresIn = 3600)` → `createSignedUrl` (yes, signed URLs — the bucket is not public; admin read via `payment_proofs_admin_read` / `payment_proofs_admin_all`).
  - Attaching: `uploadPaymentProof(orderId, file)` uploads to path `{orderId}/proof.{ext}` **without `upsert`** (a 409 "already exists" is treated as success), then `adminAttachPaymentProof(orderId, path)` does a direct `update({ payment_proof_url })` on the order (allowed by `orders_admin_all`; unlike the customer `attach_payment_proof` RPC there are no email/status checks, because admins receive proofs out-of-band and may attach after the order is already `paid`). Admin writes to the bucket at any status ride the `payment_proofs_admin_all` storage policy.
  - `WHATSAPP_PROOF_SENTINEL = '__whatsapp__'` in `payment_proof_url` means "customer said they sent it via WhatsApp" — no file exists.
- **Emails** — the edge function **`send-order-email`** (`supabase/functions/send-order-email/index.ts`) is **not triggered from this screen**. It fires exactly once, fire-and-forget, from `OrdersService.placeOrder()` at checkout (customer confirmation + admin notification via Resend; the admin email's `"Ver pedido en admin"` button deep-links to `{STORE_PUBLIC_URL}/admin/orders/{id}` — how admins usually land here). No status-change or cancellation emails exist.

## State & data flow

Signals on `OrderDetail`: `order: signal<OrderRow | null>`, `items: signal<OrderItemRow[]>`, `proofUrl: signal<string | null>`, `loading` (starts `true`), `notFound`, `working` (shared by forward + cancel), `uploadingProof`, `pickedIds: signal<Set<string>>`. Computeds: `shortRef` (`#` + `order_number`, `''` while loading), `forwardAction` (lookup in the module-level `NEXT_STATUS` map), `canCancel`, `proofKind` (`'file' | 'whatsapp' | 'none'`).

`ngOnInit` → `bootstrap()`: `getOrderForAdmin(this.id())`; on miss set `notFound`; on hit set `order`/`items`, hydrate `pickedIds` from localStorage, and — when `payment_proof_url` is a real file — pre-sign `proofUrl`. Errors snackbar (`errorMessage`, fallback `"Error desconocido"`, action `"OK"`, 5000 ms).

- **Forward** (`onForward`): guards on `working`, awaits `updateOrderStatus`, replaces `order` with the returned row, snackbar `` `Pedido ${statusLabel(...).toLowerCase()}` `` (3000 ms).
- **Cancel** (`onCancel`): opens `CancelOrderDialog` (`data: { shortRef }`, `autoFocus: 'first-tabbable'`, `restoreFocus: true`). Dialog: title `"Cancelar pedido {shortRef}"`, lead `"Se restaurará el stock de cada ítem. Opcionalmente puedes anotar el motivo para referencia futura."`, outline textarea `notes` (`FormControl<string>`, nonNullable, `rows="3"`, `maxlength="500"`, label `"Motivo (opcional)"`, placeholder `"p. ej. Cliente cambió de opinión, sin stock, pago no recibido…"`, `cdkFocusInitial`), actions `"Volver"` (closes `null`) and warn `"Cancelar pedido"` (closes trimmed notes — possibly `''`). `null`/`undefined` result aborts; `''` is forwarded as `null` to the RPC. On `{ok: true}`: snackbar `"Pedido cancelado y stock restaurado."` (4000 ms) and a full re-fetch so status + notes render. On `{ok: false}`: `cancelErrorCopy()` — `NOT_ADMIN` → `"Necesitas permisos de administrador."`, `NOT_FOUND` → `"No encontramos el pedido."`, `ALREADY_TERMINAL` → `"El pedido ya está cancelado o completado."`, default `"No se pudo cancelar el pedido."`.
- **Proof upload** (`onAdminUploadProof`): clears the input value immediately; rejects files > `5 * 1024 * 1024` with `"El archivo supera los 5 MB."`; upload → attach → re-sign → snackbar `"Comprobante adjuntado."`; upload failure → `"No se pudo subir: {error}"`.
- **Picking state**: `pickedIds` persisted per order in localStorage under `PICK_STORAGE_PREFIX = 'pick:order:'` + order UUID (JSON string array; key removed when the set empties). `readPicked` tolerates corrupt JSON. Purely client-side — never synced to the DB.

## Behaviors & edge cases

- **Status machine as implemented**: `pending → paid → completed` via the forward button; cancellation from `pending` or `paid` via the dialog. `shipped` exists in the schema/types for back-compat with older rows but is never transitioned into (`NEXT_STATUS` has no entry producing or consuming it beyond a graceful label).
- A `shipped` order renders its chip but has **no forward button and a disabled cancel button** — it's a dead end in this UI even though the `cancel_order` RPC would accept it (only `cancelled`/`completed` are terminal server-side). Fixing requires a direct DB update.
- Cancelling is idempotent-guarded server-side (`FOR UPDATE` + terminal check) and the loyalty reversal / restock happen in the same transaction as the status flip.
- `payment_link` orders never show proof UI (view or upload) — the panel just instructs the admin to mark as paid once the external transaction is confirmed.
- Item name / picking-grid links open the public product page (`/products/:slug`) in a new tab; the snapshot fields (`product_name`, `product_image_url`, `product_condition`, `product_set_name`, `product_card_number`, `seller_id/code/name`, prices) are frozen at order time — the live product may differ or be deleted (`product_id` NULL), in which case the link 404s on the storefront.
- Discount row uses `.price--sale` — amber (`--accent-amber`), not brand red; sale prices moved off brand red (see [Theming](../../architecture/theming.md); CLAUDE.md's "three uses" list is stale).

## Gotchas / invariants

- **"Reemplazar comprobante" does not actually replace same-extension files.** `uploadPaymentProof` uploads without `upsert` and deliberately treats the 409 "already exists" as success (a workaround for the customer-side bucket RLS, documented in the service). For an admin re-upload to the same `{orderId}/proof.{ext}` key, Storage 409s, the old file is kept, and `adminAttachPaymentProof` re-writes the same path — the UI says `"Comprobante adjuntado."` but the image is unchanged. Uploading a file with a *different* extension does work (new object; the old one is orphaned in the bucket).
- **PDF proofs render as a broken `<img>`.** Both the customer flow and the admin picker accept `application/pdf`, but the template always renders the signed URL in an `<img>` tag. The `target="_blank"` anchor around it still opens the PDF fine.
- Signed proof URLs expire after 3600 s and are not re-signed while the page sits open — a stale tab's inline image/link will 400 after an hour (the list screen re-signs on every click; this screen signs once at load/upload).
- `updateOrderStatus` hard-throws on `cancelled` — cancellation must go through `cancelOrder()` so restock/coupon-release/notes happen atomically. Never "fix" a status by direct update to `cancelled`.
- Forward transitions are plain UPDATEs with **no confirmation dialog** — one click on `"Marcar como pagado"` awards loyalty points immediately (trigger), and `"Marcar como completado"` makes the order terminal for `cancel_order`.
- `cancelOrder`'s failure path in `onCancel` has no `catch` around the `await` (only `finally`); the service itself never rejects (maps errors to `{ok:false,'RPC_ERROR'}`), so this holds only as long as that contract does.
- The RPC trims notes; whitespace-only input is stored as NULL and the banner shows `"Sin nota."`.
- Pick state lives only in this browser's localStorage keyed by order UUID — it never expires and is invisible to other admins/devices.
- The route param is the UUID; there is no lookup by `order_number`.
- `LocalStorageService` guards platform access, but the file-input handling (`event.target as HTMLInputElement`) assumes a browser — consistent with the client-only SPA.

## Related docs

- [Orders list](./orders.md)
- [Customers detail](./customer-detail.md) — per-customer order history + loyalty ledger
- [Sellers (consignment)](./sellers.md) — where `seller_code` pills come from
- [Checkout](../storefront/checkout.md) — `place_order`, proof upload (customer side), `send-order-email`
- [Order confirmation](../storefront/order-confirmation.md)
- [Commerce flow](../../architecture/commerce-flow.md)
- [Loyalty & Pokédex](../../architecture/loyalty-and-pokedex.md) — `orders_loyalty_points` trigger
- [Backend RPCs & functions](../../architecture/backend-rpcs-and-functions.md) — `cancel_order`, `send-order-email`
- [Data model](../../architecture/data-model.md)
