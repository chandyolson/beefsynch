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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bull_favorites: {
        Row: {
          bull_catalog_id: string | null
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          bull_catalog_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          bull_catalog_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bull_favorites_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      bulls_catalog: {
        Row: {
          active: boolean
          breed: string
          bull_name: string
          company: string
          id: string
          naab_code: string | null
          registration_number: string
        }
        Insert: {
          active?: boolean
          breed: string
          bull_name: string
          company: string
          id?: string
          naab_code?: string | null
          registration_number: string
        }
        Update: {
          active?: boolean
          breed?: string
          bull_name?: string
          company?: string
          id?: string
          naab_code?: string | null
          registration_number?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          accepted: boolean | null
          created_at: string | null
          id: string
          invited_by: string | null
          invited_email: string | null
          organization_id: string | null
          role: string
          user_id: string | null
        }
        Insert: {
          accepted?: boolean | null
          created_at?: string | null
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          organization_id?: string | null
          role?: string
          user_id?: string | null
        }
        Update: {
          accepted?: boolean | null
          created_at?: string | null
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          organization_id?: string | null
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          invite_code: string | null
          name: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          invite_code?: string | null
          name: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          invite_code?: string | null
          name?: string
        }
        Relationships: []
      }
      pending_invites: {
        Row: {
          accepted: boolean | null
          created_at: string | null
          expires_at: string | null
          id: string
          invited_email: string
          organization_id: string | null
          token: string
        }
        Insert: {
          accepted?: boolean | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invited_email: string
          organization_id?: string | null
          token?: string
        }
        Update: {
          accepted?: boolean | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invited_email?: string
          organization_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          has_completed_onboarding: boolean
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          has_completed_onboarding?: boolean
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          has_completed_onboarding?: boolean
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      project_bulls: {
        Row: {
          bull_catalog_id: string | null
          custom_bull_name: string | null
          id: string
          project_id: string
          units: number
        }
        Insert: {
          bull_catalog_id?: string | null
          custom_bull_name?: string | null
          id?: string
          project_id: string
          units?: number
        }
        Update: {
          bull_catalog_id?: string | null
          custom_bull_name?: string | null
          id?: string
          project_id?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_bulls_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bulls_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          breeding_date: string | null
          breeding_time: string | null
          cattle_type: string
          created_at: string
          head_count: number
          id: string
          name: string
          notes: string | null
          organization_id: string | null
          protocol: string
          status: string
          user_id: string | null
        }
        Insert: {
          breeding_date?: string | null
          breeding_time?: string | null
          cattle_type: string
          created_at?: string
          head_count?: number
          id?: string
          name: string
          notes?: string | null
          organization_id?: string | null
          protocol: string
          status?: string
          user_id?: string | null
        }
        Update: {
          breeding_date?: string | null
          breeding_time?: string | null
          cattle_type?: string
          created_at?: string
          head_count?: number
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string | null
          protocol?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      protocol_events: {
        Row: {
          event_date: string
          event_name: string
          event_time: string | null
          id: string
          project_id: string
        }
        Insert: {
          event_date: string
          event_name: string
          event_time?: string | null
          id?: string
          project_id: string
        }
        Update: {
          event_date?: string
          event_name?: string
          event_time?: string | null
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocol_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_anonymous_projects: { Args: never; Returns: undefined }
      get_org_members: {
        Args: { _organization_id: string }
        Returns: {
          accepted: boolean
          email: string
          id: string
          invited_email: string
          role: string
          user_id: string
        }[]
      }
      get_org_role: {
        Args: { _organization_id: string; _user_id: string }
        Returns: string
      }
      lookup_org_by_invite_code: {
        Args: { _code: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      user_org_ids: { Args: { _user_id: string }; Returns: string[] }
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
