import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type { AppSettingsRow, AppSettingsUpdate } from '../catalog/catalog.types';

@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  private readonly supabase = inject(SupabaseService);

  async get(): Promise<AppSettingsRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('app_settings')
      .select('*')
      .eq('id', true)
      .single();
    if (error) throw error;
    return data as AppSettingsRow;
  }

  async update(patch: AppSettingsUpdate): Promise<AppSettingsRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('app_settings')
      .update(patch)
      .eq('id', true)
      .select('*')
      .single();
    if (error) throw error;
    return data as AppSettingsRow;
  }
}
