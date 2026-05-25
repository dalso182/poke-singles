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
          bank_account_info: string | null
          exchange_rate_usd_crc: number | null
          id: boolean
          maintenance_message: string | null
          maintenance_mode: boolean
          order_notification_recipients: string
          sinpe_phone: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          bank_account_info?: string | null
          exchange_rate_usd_crc?: number | null
          id?: boolean
          maintenance_message?: string | null
          maintenance_mode?: boolean
          order_notification_recipients?: string
          sinpe_phone?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          bank_account_info?: string | null
          exchange_rate_usd_crc?: number | null
          id?: boolean
          maintenance_message?: string | null
          maintenance_mode?: boolean
          order_notification_recipients?: string
          sinpe_phone?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      card_details: {
        Row: {
          card_ref: string
          data: Json
          fetched_at: string
        }
        Insert: {
          card_ref: string
          data: Json
          fetched_at?: string
        }
        Update: {
          card_ref?: string
          data?: Json
          fetched_at?: string
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
      cart_items: {
        Row: {
          added_at: string
          product_id: string
          quantity: number
          user_id: string
        }
        Insert: {
          added_at?: string
          product_id: string
          quantity: number
          user_id: string
        }
        Update: {
          added_at?: string
          product_id?: string
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "available_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "rifas_listing"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          coupon_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          coupon_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          coupon_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
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
      coupon_redemptions: {
        Row: {
          coupon_id: string
          discount_amount_applied: number
          guest_email: string | null
          id: string
          order_id: string
          redeemed_at: string
          user_id: string | null
        }
        Insert: {
          coupon_id: string
          discount_amount_applied: number
          guest_email?: string | null
          id?: string
          order_id: string
          redeemed_at?: string
          user_id?: string | null
        }
        Update: {
          coupon_id?: string
          discount_amount_applied?: number
          guest_email?: string | null
          id?: string
          order_id?: string
          redeemed_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          category_ids: string[] | null
          code: string
          created_at: string
          deleted_at: string | null
          discount_value: number
          expires_at: string
          id: string
          is_active: boolean
          max_uses_per_user: number
          min_purchase_amount: number | null
          type: string
          updated_at: string
        }
        Insert: {
          category_ids?: string[] | null
          code: string
          created_at?: string
          deleted_at?: string | null
          discount_value: number
          expires_at: string
          id?: string
          is_active?: boolean
          max_uses_per_user?: number
          min_purchase_amount?: number | null
          type: string
          updated_at?: string
        }
        Update: {
          category_ids?: string[] | null
          code?: string
          created_at?: string
          deleted_at?: string | null
          discount_value?: number
          expires_at?: string
          id?: string
          is_active?: boolean
          max_uses_per_user?: number
          min_purchase_amount?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          order_id: string
          product_card_number: string | null
          product_condition: string | null
          product_id: string | null
          product_image_url: string | null
          product_name: string
          product_set_name: string | null
          product_slug: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total: number
          order_id: string
          product_card_number?: string | null
          product_condition?: string | null
          product_id?: string | null
          product_image_url?: string | null
          product_name: string
          product_set_name?: string | null
          product_slug: string
          quantity: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          order_id?: string
          product_card_number?: string | null
          product_condition?: string | null
          product_id?: string | null
          product_image_url?: string | null
          product_name?: string
          product_set_name?: string | null
          product_slug?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "available_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "rifas_listing"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancellation_notes: string | null
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          customer_email: string
          customer_name: string
          customer_notes: string | null
          customer_phone: string
          discount_amount: number
          id: string
          order_number: number
          payment_method: string
          payment_proof_url: string | null
          shipping_address: Json | null
          shipping_amount: number
          shipping_method_id: string | null
          shipping_method_name: string
          status: string
          subtotal: number
          total: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cancellation_notes?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          customer_email: string
          customer_name: string
          customer_notes?: string | null
          customer_phone: string
          discount_amount?: number
          id?: string
          order_number?: number
          payment_method: string
          payment_proof_url?: string | null
          shipping_address?: Json | null
          shipping_amount?: number
          shipping_method_id?: string | null
          shipping_method_name: string
          status?: string
          subtotal: number
          total: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cancellation_notes?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_notes?: string | null
          customer_phone?: string
          discount_amount?: number
          id?: string
          order_number?: number
          payment_method?: string
          payment_proof_url?: string | null
          shipping_address?: Json | null
          shipping_amount?: number
          shipping_method_id?: string | null
          shipping_method_name?: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shipping_method_id_fkey"
            columns: ["shipping_method_id"]
            isOneToOne: false
            referencedRelation: "shipping_methods"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "product_card_types_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_card_types_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "rifas_listing"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          card_number: string | null
          card_ref: string | null
          category: string | null
          category_id: string
          condition: string | null
          created_at: string
          description: string | null
          featured: boolean
          first_listed_at: string
          id: string
          illustrator: string | null
          image_url: string | null
          language: string
          last_restocked_at: string | null
          legal_expanded: boolean | null
          legal_standard: boolean | null
          name: string
          pokemon_name: string | null
          price: number
          quantity: number
          rarity: string | null
          regulation_mark: string | null
          sale_price: number | null
          set_id: string | null
          slug: string
          stage: string | null
          type1: string | null
          type2: string | null
          updated_at: string
          variant: string | null
        }
        Insert: {
          active?: boolean
          card_number?: string | null
          card_ref?: string | null
          category?: string | null
          category_id: string
          condition?: string | null
          created_at?: string
          description?: string | null
          featured?: boolean
          first_listed_at?: string
          id?: string
          illustrator?: string | null
          image_url?: string | null
          language?: string
          last_restocked_at?: string | null
          legal_expanded?: boolean | null
          legal_standard?: boolean | null
          name: string
          pokemon_name?: string | null
          price: number
          quantity?: number
          rarity?: string | null
          regulation_mark?: string | null
          sale_price?: number | null
          set_id?: string | null
          slug: string
          stage?: string | null
          type1?: string | null
          type2?: string | null
          updated_at?: string
          variant?: string | null
        }
        Update: {
          active?: boolean
          card_number?: string | null
          card_ref?: string | null
          category?: string | null
          category_id?: string
          condition?: string | null
          created_at?: string
          description?: string | null
          featured?: boolean
          first_listed_at?: string
          id?: string
          illustrator?: string | null
          image_url?: string | null
          language?: string
          last_restocked_at?: string | null
          legal_expanded?: boolean | null
          legal_standard?: boolean | null
          name?: string
          pokemon_name?: string | null
          price?: number
          quantity?: number
          rarity?: string | null
          regulation_mark?: string | null
          sale_price?: number | null
          set_id?: string | null
          slug?: string
          stage?: string | null
          type1?: string | null
          type2?: string | null
          updated_at?: string
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_card_ref_fkey"
            columns: ["card_ref"]
            isOneToOne: false
            referencedRelation: "card_details"
            referencedColumns: ["card_ref"]
          },
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
      profiles: {
        Row: {
          created_at: string
          default_shipping_address: Json | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_shipping_address?: Json | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_shipping_address?: Json | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      raffles: {
        Row: {
          created_at: string
          draw_at: string | null
          drawn_at: string | null
          drawn_by: string | null
          market_price: number | null
          notified_at: string | null
          product_id: string
          status: string
          total_entries: number
          updated_at: string
          winner_email: string | null
          winner_name: string | null
          winner_order_id: string | null
          winning_entry: number | null
        }
        Insert: {
          created_at?: string
          draw_at?: string | null
          drawn_at?: string | null
          drawn_by?: string | null
          market_price?: number | null
          notified_at?: string | null
          product_id: string
          status?: string
          total_entries?: number
          updated_at?: string
          winner_email?: string | null
          winner_name?: string | null
          winner_order_id?: string | null
          winning_entry?: number | null
        }
        Update: {
          created_at?: string
          draw_at?: string | null
          drawn_at?: string | null
          drawn_by?: string | null
          market_price?: number | null
          notified_at?: string | null
          product_id?: string
          status?: string
          total_entries?: number
          updated_at?: string
          winner_email?: string | null
          winner_name?: string | null
          winner_order_id?: string | null
          winning_entry?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "raffles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "available_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "rifas_listing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffles_winner_order_id_fkey"
            columns: ["winner_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
          printed_total: number | null
          release_date: string | null
          series: string | null
          symbol_image_url: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          printed_total?: number | null
          release_date?: string | null
          series?: string | null
          symbol_image_url?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          printed_total?: number | null
          release_date?: string | null
          series?: string | null
          symbol_image_url?: string | null
        }
        Relationships: []
      }
      shipping_methods: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          price: number
          requires_address: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price: number
          requires_address?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          requires_address?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      static_pages: {
        Row: {
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          is_published: boolean
          meta_description: string | null
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_published?: boolean
          meta_description?: string | null
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_published?: boolean
          meta_description?: string | null
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      available_products: {
        Row: {
          active: boolean | null
          card_number: string | null
          card_ref: string | null
          category: string | null
          category_id: string | null
          condition: string | null
          created_at: string | null
          description: string | null
          first_listed_at: string | null
          id: string | null
          illustrator: string | null
          image_url: string | null
          language: string | null
          last_restocked_at: string | null
          legal_expanded: boolean | null
          legal_standard: boolean | null
          name: string | null
          pokemon_name: string | null
          price: number | null
          quantity: number | null
          rarity: string | null
          regulation_mark: string | null
          set_id: string | null
          slug: string | null
          stage: string | null
          type1: string | null
          type2: string | null
          updated_at: string | null
          variant: string | null
        }
        Insert: {
          active?: boolean | null
          card_number?: string | null
          card_ref?: string | null
          category?: string | null
          category_id?: string | null
          condition?: string | null
          created_at?: string | null
          description?: string | null
          first_listed_at?: string | null
          id?: string | null
          illustrator?: string | null
          image_url?: string | null
          language?: string | null
          last_restocked_at?: string | null
          legal_expanded?: boolean | null
          legal_standard?: boolean | null
          name?: string | null
          pokemon_name?: string | null
          price?: number | null
          quantity?: number | null
          rarity?: string | null
          regulation_mark?: string | null
          set_id?: string | null
          slug?: string | null
          stage?: string | null
          type1?: string | null
          type2?: string | null
          updated_at?: string | null
          variant?: string | null
        }
        Update: {
          active?: boolean | null
          card_number?: string | null
          card_ref?: string | null
          category?: string | null
          category_id?: string | null
          condition?: string | null
          created_at?: string | null
          description?: string | null
          first_listed_at?: string | null
          id?: string | null
          illustrator?: string | null
          image_url?: string | null
          language?: string | null
          last_restocked_at?: string | null
          legal_expanded?: boolean | null
          legal_standard?: boolean | null
          name?: string | null
          pokemon_name?: string | null
          price?: number | null
          quantity?: number | null
          rarity?: string | null
          regulation_mark?: string | null
          set_id?: string | null
          slug?: string | null
          stage?: string | null
          type1?: string | null
          type2?: string | null
          updated_at?: string | null
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_card_ref_fkey"
            columns: ["card_ref"]
            isOneToOne: false
            referencedRelation: "card_details"
            referencedColumns: ["card_ref"]
          },
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
      products_search: {
        Row: {
          card_number: string | null
          card_ref: string | null
          card_type_ids: string[] | null
          card_type_names: string | null
          category: string | null
          category_id: string | null
          condition: string | null
          created_at: string | null
          id: string | null
          illustrator: string | null
          image_url: string | null
          language: string | null
          last_restocked_at: string | null
          legal_expanded: boolean | null
          legal_standard: boolean | null
          name: string | null
          pokemon_name: string | null
          price: number | null
          quantity: number | null
          rarity: string | null
          regulation_mark: string | null
          sale_price: number | null
          search_text: string | null
          set_code: string | null
          set_id: string | null
          set_name: string | null
          set_printed_total: number | null
          slug: string | null
          stage: string | null
          type1: string | null
          type2: string | null
          variant: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_card_ref_fkey"
            columns: ["card_ref"]
            isOneToOne: false
            referencedRelation: "card_details"
            referencedColumns: ["card_ref"]
          },
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
      rifas_listing: {
        Row: {
          card_number: string | null
          draw_at: string | null
          entries_sold: number | null
          id: string | null
          image_url: string | null
          market_price: number | null
          name: string | null
          notes: string | null
          price: number | null
          quantity: number | null
          sale_price: number | null
          set_name: string | null
          set_printed_total: number | null
          slug: string | null
          status: string | null
          total_entries: number | null
          winner_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_raffles_summary: {
        Args: never
        Returns: {
          active: boolean
          draw_at: string
          drawn_at: string
          entries_pending: number
          entries_sold: number
          image_url: string
          name: string
          participants: number
          price: number
          product_id: string
          quantity: number
          slug: string
          status: string
          winner_name: string
        }[]
      }
      attach_payment_proof: {
        Args: { p_email: string; p_file_path: string; p_order_id: string }
        Returns: Json
      }
      calculate_coupon_discount: {
        Args: { p_coupon_id: string; p_subtotal: number }
        Returns: number
      }
      cancel_order: {
        Args: { p_notes?: string; p_order_id: string }
        Returns: Json
      }
      card_type_product_counts: {
        Args: never
        Returns: {
          card_type_id: string
          in_stock_count: number
        }[]
      }
      category_id_by_slug: { Args: { p_slug: string }; Returns: string }
      draw_raffle: {
        Args: { p_product_id: string }
        Returns: {
          created_at: string
          draw_at: string | null
          drawn_at: string | null
          drawn_by: string | null
          market_price: number | null
          notified_at: string | null
          product_id: string
          status: string
          total_entries: number
          updated_at: string
          winner_email: string | null
          winner_name: string | null
          winner_order_id: string | null
          winning_entry: number | null
        }
        SetofOptions: {
          from: "*"
          to: "raffles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_guest_order: {
        Args: { p_email: string; p_order_id: string }
        Returns: Json
      }
      get_my_applied_coupon: { Args: never; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      place_order: { Args: { p_input: Json }; Returns: Json }
      raffle_category_id: { Args: never; Returns: string }
      search_card_type_counts: {
        Args: { p_category_slug?: string; p_on_sale_only?: boolean; q: string }
        Returns: {
          card_type_id: string
          in_stock_count: number
        }[]
      }
      search_category_counts: {
        Args: { p_on_sale_only?: boolean; q: string }
        Returns: {
          category_id: string
          in_stock_count: number
        }[]
      }
      search_products: {
        Args: {
          limit_n?: number
          offset_n?: number
          p_card_type_ids?: string[]
          p_category_slug?: string
          p_on_sale_only?: boolean
          q: string
          set_ids?: string[]
          sort?: string
        }
        Returns: {
          card_number: string | null
          card_ref: string | null
          card_type_ids: string[] | null
          card_type_names: string | null
          category: string | null
          category_id: string | null
          condition: string | null
          created_at: string | null
          id: string | null
          illustrator: string | null
          image_url: string | null
          language: string | null
          last_restocked_at: string | null
          legal_expanded: boolean | null
          legal_standard: boolean | null
          name: string | null
          pokemon_name: string | null
          price: number | null
          quantity: number | null
          rarity: string | null
          regulation_mark: string | null
          sale_price: number | null
          search_text: string | null
          set_code: string | null
          set_id: string | null
          set_name: string | null
          set_printed_total: number | null
          slug: string | null
          stage: string | null
          type1: string | null
          type2: string | null
          variant: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "products_search"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_set_counts: {
        Args: { p_category_slug?: string; p_on_sale_only?: boolean; q: string }
        Returns: {
          in_stock_count: number
          set_id: string
        }[]
      }
      set_product_counts: {
        Args: never
        Returns: {
          in_stock_count: number
          set_id: string
        }[]
      }
      validate_coupon: {
        Args: { p_code: string; p_subtotal: number }
        Returns: Json
      }
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
