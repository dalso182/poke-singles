export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          exchange_rate_usd_crc: number | null
          id: boolean
          maintenance_message: string | null
          maintenance_mode: boolean
          updated_at: string
        }
        Insert: {
          exchange_rate_usd_crc?: number | null
          id?: boolean
          maintenance_message?: string | null
          maintenance_mode?: boolean
          updated_at?: string
        }
        Update: {
          exchange_rate_usd_crc?: number | null
          id?: boolean
          maintenance_message?: string | null
          maintenance_mode?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      card_types: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      product_card_types: {
        Row: {
          card_type_id: string
          created_at: string
          product_id: string
        }
        Insert: {
          card_type_id: string
          created_at?: string
          product_id: string
        }
        Update: {
          card_type_id?: string
          created_at?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_card_types_card_type_id_fkey"
            columns: ["card_type_id"]
            isOneToOne: false
            referencedRelation: "card_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_card_types_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "available_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_card_types_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          card_number: string | null
          category_id: string
          condition: string | null
          created_at: string
          description: string | null
          first_listed_at: string
          id: string
          image_url: string | null
          language: string
          last_restocked_at: string | null
          name: string
          pokemon_name: string | null
          price: number
          quantity: number
          rarity: string | null
          set_id: string | null
          slug: string
          updated_at: string
          variant: string | null
        }
        Insert: {
          active?: boolean
          card_number?: string | null
          category_id: string
          condition?: string | null
          created_at?: string
          description?: string | null
          first_listed_at?: string
          id?: string
          image_url?: string | null
          language?: string
          last_restocked_at?: string | null
          name: string
          pokemon_name?: string | null
          price: number
          quantity?: number
          rarity?: string | null
          set_id?: string | null
          slug: string
          updated_at?: string
          variant?: string | null
        }
        Update: {
          active?: boolean
          card_number?: string | null
          category_id?: string
          condition?: string | null
          created_at?: string
          description?: string | null
          first_listed_at?: string
          id?: string
          image_url?: string | null
          language?: string
          last_restocked_at?: string | null
          name?: string
          pokemon_name?: string | null
          price?: number
          quantity?: number
          rarity?: string | null
          set_id?: string | null
          slug?: string
          updated_at?: string
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
        ]
      }
      sets: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          release_date: string | null
          series: string | null
          symbol_image_url: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          release_date?: string | null
          series?: string | null
          symbol_image_url?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          release_date?: string | null
          series?: string | null
          symbol_image_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      available_products: {
        Row: {
          active: boolean | null
          card_number: string | null
          category_id: string | null
          condition: string | null
          created_at: string | null
          description: string | null
          first_listed_at: string | null
          id: string | null
          image_url: string | null
          language: string | null
          last_restocked_at: string | null
          name: string | null
          pokemon_name: string | null
          price: number | null
          quantity: number | null
          rarity: string | null
          set_id: string | null
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          card_number?: string | null
          category_id?: string | null
          condition?: string | null
          created_at?: string | null
          description?: string | null
          first_listed_at?: string | null
          id?: string | null
          image_url?: string | null
          language?: string | null
          last_restocked_at?: string | null
          name?: string | null
          pokemon_name?: string | null
          price?: number | null
          quantity?: number | null
          rarity?: string | null
          set_id?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          card_number?: string | null
          category_id?: string | null
          condition?: string | null
          created_at?: string | null
          description?: string | null
          first_listed_at?: string | null
          id?: string | null
          image_url?: string | null
          language?: string | null
          last_restocked_at?: string | null
          name?: string | null
          pokemon_name?: string | null
          price?: number | null
          quantity?: number | null
          rarity?: string | null
          set_id?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
