import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { Database } from './database.types';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient<Database>;

  constructor() {
    const { url, anonKey } = environment.supabase;
    if (!url || !anonKey) {
      throw new Error(
        `[SupabaseService] Missing supabase.url / anonKey in environment.${
          environment.production ? 'prod.' : ''
        }ts. Fill in src/environments/ before injecting this service.`,
      );
    }
    this.client = createClient<Database>(url, anonKey);
  }
}
