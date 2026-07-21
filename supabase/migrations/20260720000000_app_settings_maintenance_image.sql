-- Maintenance page: admin-selectable image, shown in place of the wrench icon.
-- Root-relative path under /card-images/ (e.g. /card-images/maintenance/banner.webp)
-- so it survives the domain cutover. Public read + admin update are already
-- covered by the existing app_settings policies.
alter table public.app_settings add column maintenance_image_url text;
