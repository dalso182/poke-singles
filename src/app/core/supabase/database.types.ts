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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
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
  public: {
    Tables: {
      announcement_reads: {
        Row: {
          announcement_id: string
          seen_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          seen_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body_html: string
          created_at: string
          deleted_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          link_label: string | null
          link_path: string | null
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          body_html?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_label?: string | null
          link_path?: string | null
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          body_html?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_label?: string | null
          link_path?: string | null
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          bank_account_info: string | null
          exchange_rate_usd_crc: number | null
          id: boolean
          legacy_order_count: number
          legacy_sales_total_crc: number
          loyalty_colones_per_point: number
          loyalty_enabled: boolean
          maintenance_image_url: string | null
          maintenance_message: string | null
          maintenance_mode: boolean
          order_notification_recipients: string
          pokeball_tiers: Json
          price_review_enabled: boolean
          price_review_floor_crc: number
          price_review_threshold_pct: number
          sinpe_phone: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          bank_account_info?: string | null
          exchange_rate_usd_crc?: number | null
          id?: boolean
          legacy_order_count?: number
          legacy_sales_total_crc?: number
          loyalty_colones_per_point?: number
          loyalty_enabled?: boolean
          maintenance_image_url?: string | null
          maintenance_message?: string | null
          maintenance_mode?: boolean
          order_notification_recipients?: string
          pokeball_tiers?: Json
          price_review_enabled?: boolean
          price_review_floor_crc?: number
          price_review_threshold_pct?: number
          sinpe_phone?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          bank_account_info?: string | null
          exchange_rate_usd_crc?: number | null
          id?: boolean
          legacy_order_count?: number
          legacy_sales_total_crc?: number
          loyalty_colones_per_point?: number
          loyalty_enabled?: boolean
          maintenance_image_url?: string | null
          maintenance_message?: string | null
          maintenance_mode?: boolean
          order_notification_recipients?: string
          pokeball_tiers?: Json
          price_review_enabled?: boolean
          price_review_floor_crc?: number
          price_review_threshold_pct?: number
          sinpe_phone?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      auctions: {
        Row: {
          anti_snipe_minutes: number
          bid_count: number
          closed_at: string | null
          created_at: string
          current_bid: number | null
          ends_at: string | null
          leader_user_id: string | null
          min_increment: number
          notified_at: string | null
          product_id: string
          relist_count: number
          reminder_sent_at: string | null
          status: string
          updated_at: string
          winner_bid_id: string | null
          winner_email: string | null
          winner_name: string | null
          winner_order_id: string | null
          winner_user_id: string | null
        }
        Insert: {
          anti_snipe_minutes?: number
          bid_count?: number
          closed_at?: string | null
          created_at?: string
          current_bid?: number | null
          ends_at?: string | null
          leader_user_id?: string | null
          min_increment?: number
          notified_at?: string | null
          product_id: string
          relist_count?: number
          reminder_sent_at?: string | null
          status?: string
          updated_at?: string
          winner_bid_id?: string | null
          winner_email?: string | null
          winner_name?: string | null
          winner_order_id?: string | null
          winner_user_id?: string | null
        }
        Update: {
          anti_snipe_minutes?: number
          bid_count?: number
          closed_at?: string | null
          created_at?: string
          current_bid?: number | null
          ends_at?: string | null
          leader_user_id?: string | null
          min_increment?: number
          notified_at?: string | null
          product_id?: string
          relist_count?: number
          reminder_sent_at?: string | null
          status?: string
          updated_at?: string
          winner_bid_id?: string | null
          winner_email?: string | null
          winner_name?: string | null
          winner_order_id?: string | null
          winner_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auctions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "available_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "rifas_listing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "subastas_listing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_winner_bid_fk"
            columns: ["winner_bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_winner_bid_fk"
            columns: ["winner_bid_id"]
            isOneToOne: false
            referencedRelation: "subastas_bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_winner_order_id_fkey"
            columns: ["winner_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      bids: {
        Row: {
          amount: number
          bidder_email: string
          bidder_name: string
          created_at: string
          id: string
          invalidated_at: string | null
          product_id: string
          user_id: string | null
        }
        Insert: {
          amount: number
          bidder_email: string
          bidder_name: string
          created_at?: string
          id?: string
          invalidated_at?: string | null
          product_id: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          bidder_email?: string
          bidder_name?: string
          created_at?: string
          id?: string
          invalidated_at?: string | null
          product_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bids_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["product_id"]
          },
        ]
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
          category_id: string | null
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "card_types_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "subastas_listing"
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
          name: string | null
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
          name?: string | null
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
          name?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_activity: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_name: string | null
          event_type: string
          id: string
          ip: unknown
          order_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          event_type: string
          id?: string
          ip?: unknown
          order_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          event_type?: string
          id?: string
          ip?: unknown
          order_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_activity_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          kind: string
          order_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          order_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          order_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_testers: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
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
          seller_code: string | null
          seller_id: string | null
          seller_name: string | null
          seller_payout_id: string | null
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
          seller_code?: string | null
          seller_id?: string | null
          seller_name?: string | null
          seller_payout_id?: string | null
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
          seller_code?: string | null
          seller_id?: string | null
          seller_name?: string | null
          seller_payout_id?: string | null
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
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "subastas_listing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_seller_payout_id_fkey"
            columns: ["seller_payout_id"]
            isOneToOne: false
            referencedRelation: "seller_payouts"
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
          payment_reminder_at: string | null
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
          payment_reminder_at?: string | null
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
          payment_reminder_at?: string | null
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
      price_check_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          flagged_count: number
          id: string
          priced_count: number
          scanned_count: number
          started_at: string
          trigger: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          flagged_count?: number
          id?: string
          priced_count?: number
          scanned_count?: number
          started_at?: string
          trigger: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          flagged_count?: number
          id?: string
          priced_count?: number
          scanned_count?: number
          started_at?: string
          trigger?: string
        }
        Relationships: []
      }
      price_reviews: {
        Row: {
          card_ref: string
          checked_at: string
          diff_pct: number
          exchange_rate: number
          ignored_at: string | null
          market_crc: number
          market_updated_at: string | null
          market_usd: number
          product_id: string
          store_price: number
          suggested_price: number
          tcgplayer_product_id: number | null
        }
        Insert: {
          card_ref: string
          checked_at?: string
          diff_pct: number
          exchange_rate: number
          ignored_at?: string | null
          market_crc: number
          market_updated_at?: string | null
          market_usd: number
          product_id: string
          store_price: number
          suggested_price: number
          tcgplayer_product_id?: number | null
        }
        Update: {
          card_ref?: string
          checked_at?: string
          diff_pct?: number
          exchange_rate?: number
          ignored_at?: string | null
          market_crc?: number
          market_updated_at?: string | null
          market_usd?: number
          product_id?: string
          store_price?: number
          suggested_price?: number
          tcgplayer_product_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "price_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "available_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products_search"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "rifas_listing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "subastas_listing"
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
          {
            foreignKeyName: "product_card_types_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "subastas_listing"
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
          deleted_at: string | null
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
          price_checked_at: string | null
          quantity: number
          rarity: string | null
          regulation_mark: string | null
          sale_price: number | null
          seller_id: string | null
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
          deleted_at?: string | null
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
          price_checked_at?: string | null
          quantity?: number
          rarity?: string | null
          regulation_mark?: string | null
          sale_price?: number | null
          seller_id?: string | null
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
          deleted_at?: string | null
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
          price_checked_at?: string | null
          quantity?: number
          rarity?: string | null
          regulation_mark?: string | null
          sale_price?: number | null
          seller_id?: string | null
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
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
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
          auction_ban_reason: string | null
          auction_banned_at: string | null
          avatar_pokemon_number: number | null
          caught_pokemon_numbers: number[]
          created_at: string
          default_shipping_address: Json | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          auction_ban_reason?: string | null
          auction_banned_at?: string | null
          avatar_pokemon_number?: number | null
          caught_pokemon_numbers?: number[]
          created_at?: string
          default_shipping_address?: Json | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          auction_ban_reason?: string | null
          auction_banned_at?: string | null
          avatar_pokemon_number?: number | null
          caught_pokemon_numbers?: number[]
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
            foreignKeyName: "raffles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "subastas_listing"
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
      search_log: {
        Row: {
          category_id: string | null
          created_at: string
          customer_name: string | null
          found_count: number
          id: string
          ip: unknown
          keyword: string
          user_id: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          customer_name?: string | null
          found_count?: number
          id?: string
          ip?: unknown
          keyword: string
          user_id?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          customer_name?: string | null
          found_count?: number
          id?: string
          ip?: unknown
          keyword?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_log_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_payouts: {
        Row: {
          created_at: string
          created_by: string | null
          cuanto_fees: number
          id: string
          item_count: number
          notes: string | null
          seller_code: string
          seller_id: string
          seller_name: string
          store_fees: number
          total: number
          total_sold: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cuanto_fees: number
          id?: string
          item_count: number
          notes?: string | null
          seller_code: string
          seller_id: string
          seller_name: string
          store_fees: number
          total: number
          total_sold: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cuanto_fees?: number
          id?: string
          item_count?: number
          notes?: string | null
          seller_code?: string
          seller_id?: string
          seller_name?: string
          store_fees?: number
          total?: number
          total_sold?: number
        }
        Relationships: [
          {
            foreignKeyName: "seller_payouts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          active: boolean
          code: string
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
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
          allowed_category_ids: string[]
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
          allowed_category_ids?: string[]
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
          allowed_category_ids?: string[]
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
          condition: string | null
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
      subastas_bids: {
        Row: {
          amount: number | null
          avatar_pokemon_number: number | null
          bidder_masked: string | null
          created_at: string | null
          id: string | null
          is_mine: boolean | null
          product_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bids_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      subastas_listing: {
        Row: {
          anti_snipe_minutes: number | null
          bid_count: number | null
          card_number: string | null
          closed_at: string | null
          condition: string | null
          current_bid: number | null
          ends_at: string | null
          id: string | null
          image_url: string | null
          min_increment: number | null
          name: string | null
          notes: string | null
          quantity: number | null
          set_name: string | null
          set_printed_total: number | null
          slug: string | null
          starting_price: number | null
          status: string | null
          winner_masked: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_auctions_summary: {
        Args: never
        Returns: {
          active: boolean
          bid_count: number
          bidders: number
          closed_at: string
          current_bid: number
          ends_at: string
          image_url: string
          min_increment: number
          name: string
          product_id: string
          quantity: number
          relist_count: number
          reminder_sent_at: string
          slug: string
          starting_price: number
          status: string
          winner_name: string
          winner_order_id: string
          winner_order_number: number
        }[]
      }
      admin_coupons_report: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_sort?: string
        }
        Returns: {
          code: string
          id: string
          name: string
          order_count: number
          total_count: number
          total_discount: number
          total_revenue: number
        }[]
      }
      admin_customer: { Args: { p_id: string }; Returns: Json }
      admin_customer_activity: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_ip?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: {
          created_at: string
          customer_email: string
          customer_name: string
          event_type: string
          id: string
          ip: string
          order_id: string
          total_count: number
          user_id: string
        }[]
      }
      admin_customer_orders_report: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_sort?: string
        }
        Returns: {
          email: string
          full_name: string
          id: string
          no_products: number
          order_count: number
          total_count: number
          total_spent: number
        }[]
      }
      admin_customer_searches: {
        Args: {
          p_customer_type?: string
          p_date_end?: string
          p_date_start?: string
          p_ip?: string
          p_keyword?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: {
          category_name: string
          created_at: string
          customer_email: string
          customer_name: string
          found_count: number
          id: string
          ip: string
          keyword: string
          total_count: number
          user_id: string
        }[]
      }
      admin_customers: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_sort?: string
        }
        Returns: {
          auction_banned_at: string
          created_at: string
          email: string
          full_name: string
          id: string
          last_order_at: string
          last_sign_in_at: string
          order_count: number
          phone: string
          total_count: number
          total_spent: number
        }[]
      }
      admin_dashboard_stats: { Args: never; Returns: Json }
      admin_loyalty_transactions_report: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_sort?: string
        }
        Returns: {
          amount: number
          created_at: string
          customer_email: string
          customer_name: string
          description: string
          id: string
          kind: string
          order_id: string
          order_number: number
          total_count: number
          user_id: string
        }[]
      }
      admin_pokedex_leaderboard: {
        Args: { p_limit?: number }
        Returns: {
          caught_count: number
          email: string
          full_name: string
          id: string
        }[]
      }
      admin_price_review_accept: {
        Args: { p_new_price: number; p_product_id: string }
        Returns: undefined
      }
      admin_price_review_finish: {
        Args: {
          p_error?: string
          p_flagged: number
          p_priced: number
          p_run_id: string
          p_scanned: number
        }
        Returns: undefined
      }
      admin_price_review_ignore: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      admin_price_review_next: {
        Args: never
        Returns: {
          card_number: string
          card_ref: string
          checked_at: string
          condition: string
          diff_pct: number
          exchange_rate: number
          image_url: string
          language: string
          market_crc: number
          market_updated_at: string
          market_usd: number
          product_id: string
          product_name: string
          product_slug: string
          set_code: string
          set_id: string
          set_name: string
          store_price: number
          suggested_price: number
          tcgplayer_product_id: number
          variant: string
        }[]
      }
      admin_price_review_start: { Args: { p_trigger: string }; Returns: string }
      admin_price_review_summary: {
        Args: never
        Returns: {
          last_run_finished: string
          last_run_flagged: number
          last_run_id: string
          last_run_priced: number
          last_run_scanned: number
          last_run_started: string
          last_run_trigger: string
          pending_count: number
          total_flagged: number
        }[]
      }
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
      admin_record_price_check: {
        Args: {
          p_exchange_rate: number
          p_market_updated_at: string
          p_market_usd: number
          p_product_id: string
          p_store_price: number
          p_tcgplayer_product_id?: number
          p_threshold_pct: number
        }
        Returns: boolean
      }
      admin_sealed_payouts_report: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_limit?: number
          p_offset?: number
          p_pending_only?: boolean
          p_seller_id?: string
        }
        Returns: {
          cuanto_fee: number
          item_id: string
          line_total: number
          order_created_at: string
          order_id: string
          order_number: number
          order_status: string
          payment_method: string
          payout_amount: number
          payout_paid_at: string
          product_card_number: string
          product_image_url: string
          product_name: string
          product_set_name: string
          product_slug: string
          quantity: number
          seller_code: string
          seller_id: string
          seller_name: string
          seller_payout_id: string
          store_fee: number
          total_count: number
          unit_price: number
        }[]
      }
      admin_sealed_pending_totals: {
        Args: never
        Returns: {
          item_count: number
          pending_payout: number
          pending_sold: number
          seller_code: string
          seller_id: string
          seller_name: string
        }[]
      }
      admin_set_auction_ban: {
        Args: { p_banned: boolean; p_reason?: string; p_user_id: string }
        Returns: Json
      }
      attach_payment_proof: {
        Args: { p_email: string; p_file_path: string; p_order_id: string }
        Returns: Json
      }
      auction_category_id: { Args: never; Returns: string }
      auction_create_winner_order: {
        Args: { p_exclude_user?: string; p_product_id: string }
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
      client_ip: { Args: never; Returns: unknown }
      count_search_products: {
        Args: { p_category_slug?: string; q: string }
        Returns: number
      }
      create_seller_payout: {
        Args: { p_item_ids: string[]; p_notes?: string }
        Returns: Json
      }
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
      increment_announcement_views: {
        Args: { p_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      log_activity: { Args: { p_event_type: string }; Returns: undefined }
      log_search: {
        Args: { p_category_slug?: string; p_found?: number; p_term: string }
        Returns: undefined
      }
      maintenance_bypass_allowed: { Args: never; Returns: boolean }
      mask_bidder_name: { Args: { p_name: string }; Returns: string }
      open_pokeball: { Args: { p_tier: string }; Returns: Json }
      order_accepts_proof: { Args: { p_prefix: string }; Returns: boolean }
      place_bid: {
        Args: { p_amount: number; p_product_id: string }
        Returns: Json
      }
      place_order: { Args: { p_input: Json }; Returns: Json }
      process_auctions: { Args: never; Returns: undefined }
      raffle_category_id: { Args: never; Returns: string }
      reassign_auction_winner: { Args: { p_product_id: string }; Returns: Json }
      relist_auction: {
        Args: { p_ends_at: string; p_product_id: string }
        Returns: Json
      }
      sealed_payout_fees: {
        Args: {
          p_order_seller_units?: number
          p_payment_method: string
          p_quantity: number
          p_unit_price: number
        }
        Returns: Record<string, unknown>
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
