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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      account_metrics_daily: {
        Row: {
          account_id: string
          captured_at: string
          date: string
          metric: string
          value: number
        }
        Insert: {
          account_id: string
          captured_at?: string
          date: string
          metric: string
          value: number
        }
        Update: {
          account_id?: string
          captured_at?: string
          date?: string
          metric?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "account_metrics_daily_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          avatar_url: string | null
          connected_at: string
          external_id: string
          handle: string | null
          id: string
          last_synced_at: string | null
          name: string | null
          parent_account_id: string | null
          platform: string
          status: string
        }
        Insert: {
          avatar_url?: string | null
          connected_at?: string
          external_id: string
          handle?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string | null
          parent_account_id?: string | null
          platform: string
          status?: string
        }
        Update: {
          avatar_url?: string | null
          connected_at?: string
          external_id?: string
          handle?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string | null
          parent_account_id?: string | null
          platform?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      audience_snapshots: {
        Row: {
          account_id: string
          date: string
          dimension: string
          key: string
          value: number
        }
        Insert: {
          account_id: string
          date: string
          dimension: string
          key: string
          value: number
        }
        Update: {
          account_id?: string
          date?: string
          dimension?: string
          key?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "audience_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_snapshots: {
        Row: {
          competitor_id: string
          date: string
          metric: string
          value: number
        }
        Insert: {
          competitor_id: string
          date: string
          metric: string
          value: number
        }
        Update: {
          competitor_id?: string
          date?: string
          metric?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "competitor_snapshots_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          added_at: string
          avatar_url: string | null
          id: string
          name: string | null
          platform: string
          username: string
        }
        Insert: {
          added_at?: string
          avatar_url?: string | null
          id?: string
          name?: string | null
          platform: string
          username: string
        }
        Update: {
          added_at?: string
          avatar_url?: string | null
          id?: string
          name?: string | null
          platform?: string
          username?: string
        }
        Relationships: []
      }
      mcp_auth_codes: {
        Row: {
          client_id: string
          code_challenge: string
          code_hash: string
          created_at: string
          expires_at: string
          redirect_uri: string
          scope: string
          used_at: string | null
        }
        Insert: {
          client_id: string
          code_challenge: string
          code_hash: string
          created_at?: string
          expires_at: string
          redirect_uri: string
          scope: string
          used_at?: string | null
        }
        Update: {
          client_id?: string
          code_challenge?: string
          code_hash?: string
          created_at?: string
          expires_at?: string
          redirect_uri?: string
          scope?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mcp_auth_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "mcp_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_clients: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string | null
          redirect_uris: string[]
        }
        Insert: {
          created_at?: string
          id: string
          kind: string
          name?: string | null
          redirect_uris: string[]
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string | null
          redirect_uris?: string[]
        }
        Relationships: []
      }
      mcp_grants: {
        Row: {
          client_id: string
          client_name: string | null
          created_at: string
          id: string
          last_used_at: string | null
          revoked_at: string | null
          scope: string
        }
        Insert: {
          client_id: string
          client_name?: string | null
          created_at?: string
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          scope: string
        }
        Update: {
          client_id?: string
          client_name?: string | null
          created_at?: string
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_grants_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "mcp_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_tokens: {
        Row: {
          created_at: string
          expires_at: string
          grant_id: string
          kind: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          grant_id: string
          kind: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          grant_id?: string
          kind?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_tokens_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "mcp_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_catalog: {
        Row: {
          deprecated_at: string | null
          description_es: string | null
          label_es: string
          metric: string
          platform: string
          scope: string
          unified_metric: string | null
          unit: string
        }
        Insert: {
          deprecated_at?: string | null
          description_es?: string | null
          label_es: string
          metric: string
          platform: string
          scope: string
          unified_metric?: string | null
          unit?: string
        }
        Update: {
          deprecated_at?: string | null
          description_es?: string | null
          label_es?: string
          metric?: string
          platform?: string
          scope?: string
          unified_metric?: string | null
          unit?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          dedupe_key: string | null
          href: string | null
          id: string
          kind: string
          message: string
          read_at: string | null
          severity: string
          title: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          href?: string | null
          id?: string
          kind: string
          message: string
          read_at?: string | null
          severity: string
          title: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          href?: string | null
          id?: string
          kind?: string
          message?: string
          read_at?: string | null
          severity?: string
          title?: string
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          code_verifier: string | null
          created_at: string
          platform: string
          state: string
        }
        Insert: {
          code_verifier?: string | null
          created_at?: string
          platform: string
          state: string
        }
        Update: {
          code_verifier?: string | null
          created_at?: string
          platform?: string
          state?: string
        }
        Relationships: []
      }
      oauth_tokens: {
        Row: {
          access_token_enc: string
          account_id: string
          expires_at: string | null
          refresh_expires_at: string | null
          refresh_token_enc: string | null
          scopes: string[]
          updated_at: string
        }
        Insert: {
          access_token_enc: string
          account_id: string
          expires_at?: string | null
          refresh_expires_at?: string | null
          refresh_token_enc?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Update: {
          access_token_enc?: string
          account_id?: string
          expires_at?: string | null
          refresh_expires_at?: string | null
          refresh_token_enc?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_tokens_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_audience_snapshots: {
        Row: {
          captured_on: string
          dimension: string
          key: string
          post_id: string
          value: number
        }
        Insert: {
          captured_on: string
          dimension: string
          key: string
          post_id: string
          value: number
        }
        Update: {
          captured_on?: string
          dimension?: string
          key?: string
          post_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_audience_snapshots_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_metric_snapshots: {
        Row: {
          captured_on: string
          metric: string
          post_id: string
          value: number
        }
        Insert: {
          captured_on: string
          metric: string
          post_id: string
          value: number
        }
        Update: {
          captured_on?: string
          metric?: string
          post_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_metric_snapshots_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_metrics_daily: {
        Row: {
          date: string
          metric: string
          post_id: string
          value: number
        }
        Insert: {
          date: string
          metric: string
          post_id: string
          value: number
        }
        Update: {
          date?: string
          metric?: string
          post_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_metrics_daily_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          account_id: string
          caption: string | null
          duration_seconds: number | null
          external_id: string
          id: string
          permalink: string | null
          published_at: string | null
          raw: Json
          thumbnail_url: string | null
          type: string
        }
        Insert: {
          account_id: string
          caption?: string | null
          duration_seconds?: number | null
          external_id: string
          id?: string
          permalink?: string | null
          published_at?: string | null
          raw?: Json
          thumbnail_url?: string | null
          type: string
        }
        Update: {
          account_id?: string
          caption?: string | null
          duration_seconds?: number | null
          external_id?: string
          id?: string
          permalink?: string | null
          published_at?: string | null
          raw?: Json
          thumbnail_url?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_post_targets: {
        Row: {
          account_id: string | null
          attempts: number
          caption: string | null
          error: string | null
          external_id: string | null
          id: string
          locked_until: string | null
          next_check_at: string | null
          options: Json
          permalink: string | null
          platform: string
          published_at: string | null
          scheduled_post_id: string
          state: Json
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          attempts?: number
          caption?: string | null
          error?: string | null
          external_id?: string | null
          id?: string
          locked_until?: string | null
          next_check_at?: string | null
          options?: Json
          permalink?: string | null
          platform: string
          published_at?: string | null
          scheduled_post_id: string
          state?: Json
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          attempts?: number
          caption?: string | null
          error?: string | null
          external_id?: string | null
          id?: string
          locked_until?: string | null
          next_check_at?: string | null
          options?: Json
          permalink?: string | null
          platform?: string
          published_at?: string | null
          scheduled_post_id?: string
          state?: Json
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_post_targets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_post_targets_scheduled_post_id_fkey"
            columns: ["scheduled_post_id"]
            isOneToOne: false
            referencedRelation: "scheduled_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_posts: {
        Row: {
          caption: string
          created_at: string
          drive_file_id: string
          drive_file_name: string | null
          drive_mime_type: string | null
          drive_size_bytes: number | null
          id: string
          scheduled_at: string
          status: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          caption?: string
          created_at?: string
          drive_file_id: string
          drive_file_name?: string | null
          drive_mime_type?: string | null
          drive_size_bytes?: number | null
          id?: string
          scheduled_at: string
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          caption?: string
          created_at?: string
          drive_file_id?: string
          drive_file_name?: string | null
          drive_mime_type?: string | null
          drive_size_bytes?: number | null
          id?: string
          scheduled_at?: string
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          account_id: string | null
          cursor: Json | null
          error: string | null
          finished_at: string | null
          id: string
          job: string
          platform: string
          started_at: string
          stats: Json
          status: string
        }
        Insert: {
          account_id?: string | null
          cursor?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job: string
          platform: string
          started_at?: string
          stats?: Json
          status?: string
        }
        Update: {
          account_id?: string | null
          cursor?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job?: string
          platform?: string
          started_at?: string
          stats?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          error: string | null
          id: string
          payload: Json
          platform: string
          processed_at: string | null
          received_at: string
        }
        Insert: {
          error?: string | null
          id?: string
          payload: Json
          platform: string
          processed_at?: string | null
          received_at?: string
        }
        Update: {
          error?: string | null
          id?: string
          payload?: Json
          platform?: string
          processed_at?: string | null
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_publish_targets: {
        Args: { p_limit: number; p_lease_seconds: number }
        Returns: Database["public"]["Tables"]["scheduled_post_targets"]["Row"][]
      }
      set_cron_secret: {
        Args: { p_secret: string }
        Returns: undefined
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
