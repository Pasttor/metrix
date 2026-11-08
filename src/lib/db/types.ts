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
      [_ in never]: never
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
