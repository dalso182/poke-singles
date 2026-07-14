import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  AnnouncementInsert,
  AnnouncementRow,
  AnnouncementUpdate,
} from './catalog.types';

@Injectable({ providedIn: 'root' })
export class AnnouncementsService {
  private readonly supabase = inject(SupabaseService);

  /** Storefront: the single live announcement (anon-safe — RLS only exposes
   *  active, non-deleted rows to the public). */
  async getActive(): Promise<AnnouncementRow | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as AnnouncementRow | null) ?? null;
  }

  /** Admin list — includes inactive and (optionally) soft-deleted rows. */
  async list(opts: { includeDeleted?: boolean } = {}): Promise<AnnouncementRow[]> {
    let query = (this.supabase.client as any)
      .from('announcements')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!opts.includeDeleted) {
      query = query.is('deleted_at', null);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as AnnouncementRow[];
  }

  async getById(id: string): Promise<AnnouncementRow | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('announcements')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as AnnouncementRow | null) ?? null;
  }

  async create(input: AnnouncementInsert): Promise<AnnouncementRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('announcements')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data as AnnouncementRow;
  }

  async update(id: string, patch: AnnouncementUpdate): Promise<AnnouncementRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('announcements')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as AnnouncementRow;
  }

  /** Make `id` the single live announcement: deactivate whatever is active,
   *  then activate the target. Not atomic, but the partial unique index on
   *  is_active is the backstop — a race errors instead of leaving two active,
   *  and a failure between the queries leaves zero active (safe). */
  async activate(id: string): Promise<void> {
    const { error: offError } = await (this.supabase.client as any)
      .from('announcements')
      .update({ is_active: false })
      .eq('is_active', true);
    if (offError) throw offError;
    const { error } = await (this.supabase.client as any)
      .from('announcements')
      .update({ is_active: true })
      .eq('id', id);
    if (error) throw error;
  }

  async deactivate(id: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('announcements')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
  }

  /** Soft delete; also deactivates so a deleted announcement can't stay live. */
  async softDelete(id: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('announcements')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', id);
    if (error) throw error;
  }

  /** Restore from soft delete — always as inactive. */
  async restore(id: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('announcements')
      .update({ deleted_at: null })
      .eq('id', id);
    if (error) throw error;
  }

  /** Has this user already dismissed the announcement (any device)? */
  async hasRead(announcementId: string, userId: string): Promise<boolean> {
    const { data, error } = await (this.supabase.client as any)
      .from('announcement_reads')
      .select('announcement_id')
      .eq('announcement_id', announcementId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data != null;
  }

  /** Record the per-user "seen" flag. Upsert so double-fires are idempotent. */
  async markRead(announcementId: string, userId: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('announcement_reads')
      .upsert(
        { announcement_id: announcementId, user_id: userId },
        { onConflict: 'announcement_id,user_id' },
      );
    if (error) throw error;
  }

  /** Bump the impressions counter (guests included). Anon-callable RPC that
   *  only touches the live active row. */
  async incrementViews(id: string): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc(
      'increment_announcement_views',
      { p_id: id },
    );
    if (error) throw error;
  }
}
