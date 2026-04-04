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
      customers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_events: {
        Row: {
          google_calendar_id: string
          google_event_id: string
          id: string
          project_id: string
          protocol_event_id: string
          synced_at: string
          user_id: string
        }
        Insert: {
          google_calendar_id?: string
          google_event_id: string
          id?: string
          project_id: string
          protocol_event_id: string
          synced_at?: string
          user_id: string
        }
        Update: {
          google_calendar_id?: string
          google_event_id?: string
          id?: string
          project_id?: string
          protocol_event_id?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_events_protocol_event_id_fkey"
            columns: ["protocol_event_id"]
            isOneToOne: false
            referencedRelation: "protocol_events"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          bull_catalog_id: string | null
          bull_code: string | null
          created_at: string
          custom_bull_name: string | null
          customer_id: string | null
          id: string
          inventory_item_id: string | null
          notes: string | null
          order_id: string | null
          organization_id: string
          performed_by: string | null
          project_id: string | null
          reason: string | null
          shipment_id: string | null
          tank_id: string
          transaction_type: string
          units_change: number
        }
        Insert: {
          bull_catalog_id?: string | null
          bull_code?: string | null
          created_at?: string
          custom_bull_name?: string | null
          customer_id?: string | null
          id?: string
          inventory_item_id?: string | null
          notes?: string | null
          order_id?: string | null
          organization_id: string
          performed_by?: string | null
          project_id?: string | null
          reason?: string | null
          shipment_id?: string | null
          tank_id: string
          transaction_type: string
          units_change: number
        }
        Update: {
          bull_catalog_id?: string | null
          bull_code?: string | null
          created_at?: string
          custom_bull_name?: string | null
          customer_id?: string | null
          id?: string
          inventory_item_id?: string | null
          notes?: string | null
          order_id?: string | null
          organization_id?: string
          performed_by?: string | null
          project_id?: string | null
          reason?: string | null
          shipment_id?: string | null
          tank_id?: string
          transaction_type?: string
          units_change?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "tank_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "semen_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
        ]
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
          google_calendar_id: string | null
          id: string
          invite_code: string | null
          name: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          google_calendar_id?: string | null
          id?: string
          invite_code?: string | null
          name: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          google_calendar_id?: string | null
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
      project_contacts: {
        Row: {
          contact_date: string
          contacted_by: string | null
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          project_id: string
        }
        Insert: {
          contact_date?: string
          contacted_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          project_id: string
        }
        Update: {
          contact_date?: string
          contacted_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contacts_project_id_fkey"
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
          last_contacted_by: string | null
          last_contacted_date: string | null
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
          last_contacted_by?: string | null
          last_contacted_date?: string | null
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
          last_contacted_by?: string | null
          last_contacted_date?: string | null
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
      semen_companies: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "semen_companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      semen_order_items: {
        Row: {
          bull_catalog_id: string | null
          custom_bull_name: string | null
          id: string
          semen_order_id: string
          units: number
        }
        Insert: {
          bull_catalog_id?: string | null
          custom_bull_name?: string | null
          id?: string
          semen_order_id: string
          units?: number
        }
        Update: {
          bull_catalog_id?: string | null
          custom_bull_name?: string | null
          id?: string
          semen_order_id?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "semen_order_items_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semen_order_items_semen_order_id_fkey"
            columns: ["semen_order_id"]
            isOneToOne: false
            referencedRelation: "semen_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      semen_orders: {
        Row: {
          billing_status: string
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          fulfillment_status: string
          id: string
          notes: string | null
          order_date: string
          order_type: string
          organization_id: string
          placed_by: string | null
          project_id: string | null
          semen_company_id: string | null
        }
        Insert: {
          billing_status?: string
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          fulfillment_status?: string
          id?: string
          notes?: string | null
          order_date?: string
          order_type?: string
          organization_id: string
          placed_by?: string | null
          project_id?: string | null
          semen_company_id?: string | null
        }
        Update: {
          billing_status?: string
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          fulfillment_status?: string
          id?: string
          notes?: string | null
          order_date?: string
          order_type?: string
          organization_id?: string
          placed_by?: string | null
          project_id?: string | null
          semen_company_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "semen_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semen_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semen_orders_semen_company_id_fkey"
            columns: ["semen_company_id"]
            isOneToOne: false
            referencedRelation: "semen_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          document_path: string | null
          id: string
          notes: string | null
          organization_id: string
          received_by: string | null
          received_date: string
          received_from: string | null
          semen_company_id: string | null
          semen_order_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          document_path?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          received_by?: string | null
          received_date?: string
          received_from?: string | null
          semen_company_id?: string | null
          semen_order_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          document_path?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          received_by?: string | null
          received_date?: string
          received_from?: string | null
          semen_company_id?: string | null
          semen_order_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_semen_company_id_fkey"
            columns: ["semen_company_id"]
            isOneToOne: false
            referencedRelation: "semen_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_semen_order_id_fkey"
            columns: ["semen_order_id"]
            isOneToOne: false
            referencedRelation: "semen_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_fills: {
        Row: {
          created_at: string
          fill_date: string
          fill_type: string | null
          filled_by: string | null
          id: string
          notes: string | null
          organization_id: string
          tank_id: string
        }
        Insert: {
          created_at?: string
          fill_date: string
          fill_type?: string | null
          filled_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          tank_id: string
        }
        Update: {
          created_at?: string
          fill_date?: string
          fill_type?: string | null
          filled_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          tank_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_fills_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_fills_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_inventory: {
        Row: {
          bull_catalog_id: string | null
          bull_code: string | null
          canister: string
          created_at: string
          custom_bull_name: string | null
          customer_id: string | null
          id: string
          inventoried_at: string | null
          inventoried_by: string | null
          item_type: string
          notes: string | null
          organization_id: string
          owner: string | null
          storage_type: string | null
          sub_canister: string | null
          tank_id: string
          units: number
        }
        Insert: {
          bull_catalog_id?: string | null
          bull_code?: string | null
          canister: string
          created_at?: string
          custom_bull_name?: string | null
          customer_id?: string | null
          id?: string
          inventoried_at?: string | null
          inventoried_by?: string | null
          item_type?: string
          notes?: string | null
          organization_id: string
          owner?: string | null
          storage_type?: string | null
          sub_canister?: string | null
          tank_id: string
          units?: number
        }
        Update: {
          bull_catalog_id?: string | null
          bull_code?: string | null
          canister?: string
          created_at?: string
          custom_bull_name?: string | null
          customer_id?: string | null
          id?: string
          inventoried_at?: string | null
          inventoried_by?: string | null
          item_type?: string
          notes?: string | null
          organization_id?: string
          owner?: string | null
          storage_type?: string | null
          sub_canister?: string | null
          tank_id?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "tank_inventory_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_inventory_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_inventory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_inventory_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_movements: {
        Row: {
          created_at: string
          customer_id: string | null
          id: string
          movement_date: string
          movement_type: string
          notes: string | null
          organization_id: string
          performed_by: string | null
          project_id: string | null
          tank_id: string
          tank_status_after: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          id?: string
          movement_date: string
          movement_type: string
          notes?: string | null
          organization_id: string
          performed_by?: string | null
          project_id?: string | null
          tank_id: string
          tank_status_after?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          id?: string
          movement_date?: string
          movement_type?: string
          notes?: string | null
          organization_id?: string
          performed_by?: string | null
          project_id?: string | null
          tank_id?: string
          tank_status_after?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_movements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_movements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_movements_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_pack_lines: {
        Row: {
          bull_catalog_id: string | null
          bull_code: string | null
          bull_name: string
          created_at: string
          field_canister: string | null
          id: string
          source_canister: string | null
          source_tank_id: string
          tank_pack_id: string
          units: number
        }
        Insert: {
          bull_catalog_id?: string | null
          bull_code?: string | null
          bull_name: string
          created_at?: string
          field_canister?: string | null
          id?: string
          source_canister?: string | null
          source_tank_id: string
          tank_pack_id: string
          units: number
        }
        Update: {
          bull_catalog_id?: string | null
          bull_code?: string | null
          bull_name?: string
          created_at?: string
          field_canister?: string | null
          id?: string
          source_canister?: string | null
          source_tank_id?: string
          tank_pack_id?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "tank_pack_lines_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_pack_lines_source_tank_id_fkey"
            columns: ["source_tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_pack_lines_tank_pack_id_fkey"
            columns: ["tank_pack_id"]
            isOneToOne: false
            referencedRelation: "tank_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_pack_projects: {
        Row: {
          created_at: string
          id: string
          project_id: string
          tank_pack_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          tank_pack_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          tank_pack_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_pack_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_pack_projects_tank_pack_id_fkey"
            columns: ["tank_pack_id"]
            isOneToOne: false
            referencedRelation: "tank_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_packs: {
        Row: {
          created_at: string
          destination_address: string | null
          destination_name: string | null
          field_tank_id: string
          id: string
          notes: string | null
          organization_id: string
          pack_type: string
          packed_at: string
          packed_by: string | null
          shipping_carrier: string | null
          status: string
          tank_return_expected: boolean
          tracking_number: string | null
          unpacked_at: string | null
          unpacked_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          destination_address?: string | null
          destination_name?: string | null
          field_tank_id: string
          id?: string
          notes?: string | null
          organization_id: string
          pack_type?: string
          packed_at?: string
          packed_by?: string | null
          shipping_carrier?: string | null
          status?: string
          tank_return_expected?: boolean
          tracking_number?: string | null
          unpacked_at?: string | null
          unpacked_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          destination_address?: string | null
          destination_name?: string | null
          field_tank_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          pack_type?: string
          packed_at?: string
          packed_by?: string | null
          shipping_carrier?: string | null
          status?: string
          tank_return_expected?: boolean
          tracking_number?: string | null
          unpacked_at?: string | null
          unpacked_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_packs_field_tank_id_fkey"
            columns: ["field_tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_packs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_unpack_lines: {
        Row: {
          bull_catalog_id: string | null
          bull_code: string | null
          bull_name: string
          created_at: string
          destination_canister: string | null
          destination_tank_id: string
          id: string
          tank_pack_id: string
          units_returned: number
        }
        Insert: {
          bull_catalog_id?: string | null
          bull_code?: string | null
          bull_name: string
          created_at?: string
          destination_canister?: string | null
          destination_tank_id: string
          id?: string
          tank_pack_id: string
          units_returned: number
        }
        Update: {
          bull_catalog_id?: string | null
          bull_code?: string | null
          bull_name?: string
          created_at?: string
          destination_canister?: string | null
          destination_tank_id?: string
          id?: string
          tank_pack_id?: string
          units_returned?: number
        }
        Relationships: [
          {
            foreignKeyName: "tank_unpack_lines_bull_catalog_id_fkey"
            columns: ["bull_catalog_id"]
            isOneToOne: false
            referencedRelation: "bulls_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_unpack_lines_destination_tank_id_fkey"
            columns: ["destination_tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_unpack_lines_tank_pack_id_fkey"
            columns: ["tank_pack_id"]
            isOneToOne: false
            referencedRelation: "tank_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      tanks: {
        Row: {
          created_at: string
          customer_id: string | null
          description: string | null
          eid: string | null
          id: string
          model: string | null
          organization_id: string
          serial_number: string | null
          status: string
          tank_name: string | null
          tank_number: string
          tank_type: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          description?: string | null
          eid?: string | null
          id?: string
          model?: string | null
          organization_id: string
          serial_number?: string | null
          status?: string
          tank_name?: string | null
          tank_number: string
          tank_type?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          description?: string | null
          eid?: string | null
          id?: string
          model?: string | null
          organization_id?: string
          serial_number?: string | null
          status?: string
          tank_name?: string | null
          tank_number?: string
          tank_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tanks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_org_invite: {
        Args: { _token: string; _user_email: string; _user_id: string }
        Returns: Json
      }
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
      lookup_invite_by_token: {
        Args: { _token: string }
        Returns: {
          accepted: boolean
          expires_at: string
          invited_email: string
          org_name: string
          organization_id: string
          token: string
        }[]
      }
      lookup_org_by_invite_code: {
        Args: { _code: string }
        Returns: {
          id: string
          invite_code: string
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
