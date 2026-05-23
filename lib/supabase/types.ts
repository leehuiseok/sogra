export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      marketing_contents: {
        Row: {
          id: string
          store_id: string
          trigger_id: string
          kind: 'poster' | 'reels' | 'caption'
          status: 'pending' | 'generating' | 'ready' | 'approved' | 'failed'
          caption_text: string | null
          storage_url: string | null
          storage_path: string | null
          external_url: string | null
          model_used: string | null
          cost_usd: number | null
          used_boost: boolean
          approved_at: string | null
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          trigger_id: string
          kind: 'poster' | 'reels' | 'caption'
          status?: 'pending' | 'generating' | 'ready' | 'approved' | 'failed'
          caption_text?: string | null
          storage_url?: string | null
          storage_path?: string | null
          external_url?: string | null
          model_used?: string | null
          cost_usd?: number | null
          used_boost?: boolean
          approved_at?: string | null
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          trigger_id?: string
          kind?: 'poster' | 'reels' | 'caption'
          status?: 'pending' | 'generating' | 'ready' | 'approved' | 'failed'
          caption_text?: string | null
          storage_url?: string | null
          storage_path?: string | null
          external_url?: string | null
          model_used?: string | null
          cost_usd?: number | null
          used_boost?: boolean
          approved_at?: string | null
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_contents_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_contents_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "situation_triggers"
            referencedColumns: ["id"]
          }
        ]
      }
      media_generation_jobs: {
        Row: {
          id: string
          store_id: string
          trigger_id: string
          content_id: string | null
          content_kind: 'poster' | 'reels' | 'caption'
          idempotency_key: string
          status: 'pending' | 'running' | 'succeeded' | 'failed' | 'dead_letter'
          retry_count: number
          last_error: string | null
          expires_at: string | null
          external_url: string | null
          storage_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          trigger_id: string
          content_id?: string | null
          content_kind: 'poster' | 'reels' | 'caption'
          idempotency_key: string
          status?: 'pending' | 'running' | 'succeeded' | 'failed' | 'dead_letter'
          retry_count?: number
          last_error?: string | null
          expires_at?: string | null
          external_url?: string | null
          storage_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          trigger_id?: string
          content_id?: string | null
          content_kind?: 'poster' | 'reels' | 'caption'
          idempotency_key?: string
          status?: 'pending' | 'running' | 'succeeded' | 'failed' | 'dead_letter'
          retry_count?: number
          last_error?: string | null
          expires_at?: string | null
          external_url?: string | null
          storage_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_generation_jobs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_generation_jobs_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "situation_triggers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_generation_jobs_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "marketing_contents"
            referencedColumns: ["id"]
          }
        ]
      }
      instagram_posts: {
        Row: {
          id: string
          store_id: string
          content_id: string
          mode: 'mock' | 'real'
          ig_media_id: string | null
          ig_permalink: string | null
          caption_used: string
          publish_kind: 'feed' | 'reels' | 'stories'
          match_status: 'pending' | 'matched' | 'unmatched' | 'not_required'
          match_attempted_at: string | null
          posted_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          content_id: string
          mode: 'mock' | 'real'
          ig_media_id?: string | null
          ig_permalink?: string | null
          caption_used: string
          publish_kind: 'feed' | 'reels' | 'stories'
          match_status?: 'pending' | 'matched' | 'unmatched' | 'not_required'
          match_attempted_at?: string | null
          posted_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          content_id?: string
          mode?: 'mock' | 'real'
          ig_media_id?: string | null
          ig_permalink?: string | null
          caption_used?: string
          publish_kind?: 'feed' | 'reels' | 'stories'
          match_status?: 'pending' | 'matched' | 'unmatched' | 'not_required'
          match_attempted_at?: string | null
          posted_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_posts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_posts_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "marketing_contents"
            referencedColumns: ["id"]
          }
        ]
      }
      instagram_post_insights: {
        Row: {
          id: string
          store_id: string
          post_id: string
          window_label: 'h24' | 'd7'
          likes: number
          reach: number
          impressions: number
          saves: number
          comments: number
          raw_payload: Json | null
          captured_at: string
        }
        Insert: {
          id?: string
          store_id: string
          post_id: string
          window_label: 'h24' | 'd7'
          likes?: number
          reach?: number
          impressions?: number
          saves?: number
          comments?: number
          raw_payload?: Json | null
          captured_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          post_id?: string
          window_label?: 'h24' | 'd7'
          likes?: number
          reach?: number
          impressions?: number
          saves?: number
          comments?: number
          raw_payload?: Json | null
          captured_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_post_insights_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_post_insights_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "instagram_posts"
            referencedColumns: ["id"]
          }
        ]
      }
      insights_poll_attempts: {
        Row: {
          id: string
          post_id: string
          window_label: 'h24' | 'd7'
          attempt_count: number
          last_error: string | null
          next_retry_at: string | null
          succeeded: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          post_id: string
          window_label: 'h24' | 'd7'
          attempt_count?: number
          last_error?: string | null
          next_retry_at?: string | null
          succeeded?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          window_label?: 'h24' | 'd7'
          attempt_count?: number
          last_error?: string | null
          next_retry_at?: string | null
          succeeded?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_poll_attempts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "instagram_posts"
            referencedColumns: ["id"]
          }
        ]
      }
      quota_counters: {
        Row: {
          id: string
          store_id: string
          month_period: string
          posters_used: number
          reels_used: number
          boost_credits_remaining: number
          boost_expires_at: string
          quota_refund_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          month_period: string
          posters_used?: number
          reels_used?: number
          boost_credits_remaining?: number
          boost_expires_at: string
          quota_refund_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          month_period?: string
          posters_used?: number
          reels_used?: number
          boost_credits_remaining?: number
          boost_expires_at?: string
          quota_refund_count?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quota_counters_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      nlu_parse_events: {
        Row: {
          id: string
          store_id: string
          input_text: string
          parsed_output: Json
          confidence: number
          threshold_applied: number
          user_action: 'confirm' | 'edit' | 'reject' | null
          corrected_output: Json | null
          model: string
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          input_text: string
          parsed_output: Json
          confidence: number
          threshold_applied: number
          user_action?: 'confirm' | 'edit' | 'reject' | null
          corrected_output?: Json | null
          model?: string
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          input_text?: string
          parsed_output?: Json
          confidence?: number
          threshold_applied?: number
          user_action?: 'confirm' | 'edit' | 'reject' | null
          corrected_output?: Json | null
          model?: string
          created_at?: string
        }
        Relationships: []
      }
      situation_triggers: {
        Row: {
          id: string
          store_id: string
          source: 'preset' | 'recommendation' | 'freeform'
          preset_key: string | null
          event: string
          action: string
          when_text: string | null
          target: string | null
          signals: Json
          score: number | null
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          source: 'preset' | 'recommendation' | 'freeform'
          preset_key?: string | null
          event: string
          action: string
          when_text?: string | null
          target?: string | null
          signals?: Json
          score?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          source?: 'preset' | 'recommendation' | 'freeform'
          preset_key?: string | null
          event?: string
          action?: string
          when_text?: string | null
          target?: string | null
          signals?: Json
          score?: number | null
          created_at?: string
        }
        Relationships: []
      }
      trigger_presets: {
        Row: {
          key: string
          event: string
          action: string
          when_text: string
          label_ko: string
          description_ko: string
          sort_order: number
          created_at: string
        }
        Insert: {
          key: string
          event: string
          action: string
          when_text: string
          label_ko: string
          description_ko: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          key?: string
          event?: string
          action?: string
          when_text?: string
          label_ko?: string
          description_ko?: string
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      onboarding_funnel_events: {
        Row: {
          created_at: string
          duration_ms: number | null
          event_type: string
          id: string
          owner_id: string
          step: number
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          event_type: string
          id?: string
          owner_id: string
          step: number
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          event_type?: string
          id?: string
          owner_id?: string
          step?: number
        }
        Relationships: []
      }
      baseline_insight_windows: {
        Row: {
          id: string
          store_id: string
          status: 'captured' | 'insufficient' | 'new_account' | 'not_applicable'
          baseline_likes_avg: number | null
          baseline_reach_avg: number | null
          baseline_saves_avg: number | null
          posts_sampled: number | null
          sample_window_start: string | null
          sample_window_end: string | null
          ig_account_age_days: number | null
          status_reason: string | null
          captured_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          status: 'captured' | 'insufficient' | 'new_account' | 'not_applicable'
          baseline_likes_avg?: number | null
          baseline_reach_avg?: number | null
          baseline_saves_avg?: number | null
          posts_sampled?: number | null
          sample_window_start?: string | null
          sample_window_end?: string | null
          ig_account_age_days?: number | null
          status_reason?: string | null
          captured_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          status?: 'captured' | 'insufficient' | 'new_account' | 'not_applicable'
          baseline_likes_avg?: number | null
          baseline_reach_avg?: number | null
          baseline_saves_avg?: number | null
          posts_sampled?: number | null
          sample_window_start?: string | null
          sample_window_end?: string | null
          ig_account_age_days?: number | null
          status_reason?: string | null
          captured_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseline_insight_windows_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "store_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      store_profiles: {
        Row: {
          address: string
          address_detail: string | null
          category: string
          created_at: string
          id: string
          ig_access_token: string | null
          ig_account_type: string | null
          ig_page_id: string | null
          ig_token_expires_at: string | null
          ig_user_id: string | null
          ig_username: string | null
          menus: Json
          onboarding_completed_at: string | null
          onboarding_step: number | null
          overseas_transfer_consented_at: string | null
          owner_id: string
          real_publish_consented_at: string | null
          store_name: string
          tone_keywords: Json
          updated_at: string
        }
        Insert: {
          address: string
          address_detail?: string | null
          category: string
          created_at?: string
          id?: string
          ig_access_token?: string | null
          ig_account_type?: string | null
          ig_page_id?: string | null
          ig_token_expires_at?: string | null
          ig_user_id?: string | null
          ig_username?: string | null
          menus?: Json
          onboarding_completed_at?: string | null
          onboarding_step?: number | null
          overseas_transfer_consented_at?: string | null
          owner_id: string
          real_publish_consented_at?: string | null
          store_name: string
          tone_keywords?: Json
          updated_at?: string
        }
        Update: {
          address?: string
          address_detail?: string | null
          category?: string
          created_at?: string
          id?: string
          ig_access_token?: string | null
          ig_account_type?: string | null
          ig_page_id?: string | null
          ig_token_expires_at?: string | null
          ig_user_id?: string | null
          ig_username?: string | null
          menus?: Json
          onboarding_completed_at?: string | null
          onboarding_step?: number | null
          overseas_transfer_consented_at?: string | null
          owner_id?: string
          real_publish_consented_at?: string | null
          store_name?: string
          tone_keywords?: Json
          updated_at?: string
        }
        Relationships: []
      }
      observability_metrics: {
        Row: {
          id: string
          metric_name: string
          metric_type: 'counter' | 'gauge' | 'timing'
          value: number
          tags: Json
          store_id: string | null
          correlation_id: string | null
          recorded_at: string
        }
        Insert: {
          id?: string
          metric_name: string
          metric_type: 'counter' | 'gauge' | 'timing'
          value: number
          tags?: Json
          store_id?: string | null
          correlation_id?: string | null
          recorded_at?: string
        }
        Update: {
          id?: string
          metric_name?: string
          metric_type?: 'counter' | 'gauge' | 'timing'
          value?: number
          tags?: Json
          store_id?: string | null
          correlation_id?: string | null
          recorded_at?: string
        }
        Relationships: []
      }
      external_api_calls: {
        Row: {
          id: string
          correlation_id: string
          service: string
          endpoint: string | null
          http_status: number | null
          duration_ms: number | null
          error: string | null
          store_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          correlation_id: string
          service: string
          endpoint?: string | null
          http_status?: number | null
          duration_ms?: number | null
          error?: string | null
          store_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          correlation_id?: string
          service?: string
          endpoint?: string | null
          http_status?: number | null
          duration_ms?: number | null
          error?: string | null
          store_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          owner_id: string
          store_id: string | null
          toss_customer_key: string
          toss_billing_key: string | null
          plan: string
          amount_krw: number
          status: 'pending' | 'active' | 'past_due' | 'suspended' | 'cancelled'
          current_period_start: string | null
          current_period_end: string | null
          next_billing_at: string | null
          grace_period_until: string | null
          cancelled_at: string | null
          cancel_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          store_id?: string | null
          toss_customer_key: string
          toss_billing_key?: string | null
          plan?: string
          amount_krw?: number
          status?: 'pending' | 'active' | 'past_due' | 'suspended' | 'cancelled'
          current_period_start?: string | null
          current_period_end?: string | null
          next_billing_at?: string | null
          grace_period_until?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          store_id?: string | null
          toss_customer_key?: string
          toss_billing_key?: string | null
          plan?: string
          amount_krw?: number
          status?: 'pending' | 'active' | 'past_due' | 'suspended' | 'cancelled'
          current_period_start?: string | null
          current_period_end?: string | null
          next_billing_at?: string | null
          grace_period_until?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      payment_events: {
        Row: {
          id: string
          event_id: string
          event_type: string
          owner_id: string
          subscription_id: string | null
          toss_payment_key: string | null
          toss_customer_key: string
          toss_order_id: string | null
          amount_krw: number | null
          status: string
          raw_payload: Json
          signature_valid: boolean
          customer_key_match: boolean
          dunning_attempts: number
          processed_at: string | null
          processing_error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          event_type: string
          owner_id: string
          subscription_id?: string | null
          toss_payment_key?: string | null
          toss_customer_key: string
          toss_order_id?: string | null
          amount_krw?: number | null
          status: string
          raw_payload: Json
          signature_valid: boolean
          customer_key_match: boolean
          dunning_attempts?: number
          processed_at?: string | null
          processing_error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          event_type?: string
          owner_id?: string
          subscription_id?: string | null
          toss_payment_key?: string | null
          toss_customer_key?: string
          toss_order_id?: string | null
          amount_krw?: number | null
          status?: string
          raw_payload?: Json
          signature_valid?: boolean
          customer_key_match?: boolean
          dunning_attempts?: number
          processed_at?: string | null
          processing_error?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      pg_all_foreign_keys: {
        Row: {
          fk_columns: unknown[] | null
          fk_constraint_name: unknown
          fk_schema_name: unknown
          fk_table_name: unknown
          fk_table_oid: unknown
          is_deferrable: boolean | null
          is_deferred: boolean | null
          match_type: string | null
          on_delete: string | null
          on_update: string | null
          pk_columns: unknown[] | null
          pk_constraint_name: unknown
          pk_index_name: unknown
          pk_schema_name: unknown
          pk_table_name: unknown
          pk_table_oid: unknown
        }
        Relationships: []
      }
      tap_funky: {
        Row: {
          args: string | null
          is_definer: boolean | null
          is_strict: boolean | null
          is_visible: boolean | null
          kind: unknown
          langoid: unknown
          name: unknown
          oid: unknown
          owner: unknown
          returns: string | null
          returns_set: boolean | null
          schema: unknown
          volatility: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _cleanup: { Args: never; Returns: boolean }
      _contract_on: { Args: { "": string }; Returns: unknown }
      _currtest: { Args: never; Returns: number }
      _db_privs: { Args: never; Returns: unknown[] }
      _extensions: { Args: never; Returns: unknown[] }
      _get: { Args: { "": string }; Returns: number }
      _get_latest: { Args: { "": string }; Returns: number[] }
      _get_note: { Args: { "": string }; Returns: string }
      _is_verbose: { Args: never; Returns: boolean }
      _prokind: { Args: { p_oid: unknown }; Returns: unknown }
      _query: { Args: { "": string }; Returns: string }
      _refine_vol: { Args: { "": string }; Returns: string }
      _retval: { Args: { "": string }; Returns: string }
      _table_privs: { Args: never; Returns: unknown[] }
      _temptypes: { Args: { "": string }; Returns: string }
      _todo: { Args: never; Returns: string }
      col_is_null:
        | {
            Args: {
              column_name: unknown
              description?: string
              schema_name: unknown
              table_name: unknown
            }
            Returns: string
          }
        | {
            Args: {
              column_name: unknown
              description?: string
              table_name: unknown
            }
            Returns: string
          }
      col_not_null:
        | {
            Args: {
              column_name: unknown
              description?: string
              schema_name: unknown
              table_name: unknown
            }
            Returns: string
          }
        | {
            Args: {
              column_name: unknown
              description?: string
              table_name: unknown
            }
            Returns: string
          }
      check_and_decrement_quota: {
        Args: { p_store_id: string; p_kind: string }
        Returns: Json
      }
      current_month_kst: { Args: never; Returns: string }
      diag:
        | {
            Args: { msg: unknown }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { msg: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      diag_test_name: { Args: { "": string }; Returns: string }
      do_tap:
        | { Args: never; Returns: string[] }
        | { Args: { "": string }; Returns: string[] }
      fail:
        | { Args: never; Returns: string }
        | { Args: { "": string }; Returns: string }
      findfuncs: { Args: { "": string }; Returns: string[] }
      finish: { Args: { exception_on_failure?: boolean }; Returns: string[] }
      format_type_string: { Args: { "": string }; Returns: string }
      generate_idempotency_key: {
        Args: {
          p_kind: string
          p_period: string
          p_store_id: string
          p_trigger_id: string
        }
        Returns: string
      }
      get_store_owner_id: { Args: { p_store_id: string }; Returns: string }
      refund_quota: {
        Args: { p_store_id: string; p_kind: string }
        Returns: Json
      }
      has_unique: { Args: { "": string }; Returns: string }
      in_todo: { Args: never; Returns: boolean }
      is_empty: { Args: { "": string }; Returns: string }
      is_subscription_active: {
        Args: { p_expires_at: string }
        Returns: boolean
      }
      isnt_empty: { Args: { "": string }; Returns: string }
      lives_ok: { Args: { "": string }; Returns: string }
      no_plan: { Args: never; Returns: boolean[] }
      num_failed: { Args: never; Returns: number }
      os_name: { Args: never; Returns: string }
      pass:
        | { Args: never; Returns: string }
        | { Args: { "": string }; Returns: string }
      pg_version: { Args: never; Returns: string }
      pg_version_num: { Args: never; Returns: number }
      pgtap_version: { Args: never; Returns: number }
      runtests:
        | { Args: never; Returns: string[] }
        | { Args: { "": string }; Returns: string[] }
      skip:
        | { Args: { "": string }; Returns: string }
        | { Args: { how_many: number; why: string }; Returns: string }
      throws_ok: { Args: { "": string }; Returns: string }
      todo:
        | { Args: { how_many: number }; Returns: boolean[] }
        | { Args: { how_many: number; why: string }; Returns: boolean[] }
        | { Args: { why: string }; Returns: boolean[] }
        | { Args: { how_many: number; why: string }; Returns: boolean[] }
      todo_end: { Args: never; Returns: boolean[] }
      todo_start:
        | { Args: never; Returns: boolean[] }
        | { Args: { "": string }; Returns: boolean[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      _time_trial_type: {
        a_time: number | null
      }
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

