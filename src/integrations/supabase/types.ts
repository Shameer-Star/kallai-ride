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
      cancellations: {
        Row: {
          cancelled_by: string
          cancelled_by_role: string
          created_at: string
          id: string
          reason: string
          ride_id: string
        }
        Insert: {
          cancelled_by: string
          cancelled_by_role: string
          created_at?: string
          id?: string
          reason: string
          ride_id: string
        }
        Update: {
          cancelled_by?: string
          cancelled_by_role?: string
          created_at?: string
          id?: string
          reason?: string
          ride_id?: string
        }
        Relationships: []
      }
      captains: {
        Row: {
          cancelled_rides: number
          completed_rides: number
          created_at: string
          current_lat: number | null
          current_lng: number | null
          daily_cancel_count: number
          daily_cancel_date: string | null
          full_name: string | null
          id: string
          is_online: boolean
          last_location_at: string | null
          license_number: string | null
          license_url: string | null
          phone: string | null
          photo_url: string | null
          rating: number
          rc_url: string | null
          total_rides: number
          updated_at: string
          upi_id: string | null
          vehicle_number: string | null
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          verified: boolean
          warning_level: number
        }
        Insert: {
          cancelled_rides?: number
          completed_rides?: number
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          daily_cancel_count?: number
          daily_cancel_date?: string | null
          full_name?: string | null
          id: string
          is_online?: boolean
          last_location_at?: string | null
          license_number?: string | null
          license_url?: string | null
          phone?: string | null
          photo_url?: string | null
          rating?: number
          rc_url?: string | null
          total_rides?: number
          updated_at?: string
          upi_id?: string | null
          vehicle_number?: string | null
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          verified?: boolean
          warning_level?: number
        }
        Update: {
          cancelled_rides?: number
          completed_rides?: number
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          daily_cancel_count?: number
          daily_cancel_date?: string | null
          full_name?: string | null
          id?: string
          is_online?: boolean
          last_location_at?: string | null
          license_number?: string | null
          license_url?: string | null
          phone?: string | null
          photo_url?: string | null
          rating?: number
          rc_url?: string | null
          total_rides?: number
          updated_at?: string
          upi_id?: string | null
          vehicle_number?: string | null
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          verified?: boolean
          warning_level?: number
        }
        Relationships: []
      }
      favorite_locations: {
        Row: {
          address: string
          created_at: string
          id: string
          label: string
          lat: number
          lng: number
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          label: string
          lat: number
          lng: number
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          label?: string
          lat?: number
          lng?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          captain_id: string
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          ride_id: string
          stars: number
        }
        Insert: {
          captain_id: string
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          ride_id: string
          stars: number
        }
        Update: {
          captain_id?: string
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          ride_id?: string
          stars?: number
        }
        Relationships: []
      }
      rides: {
        Row: {
          accepted_at: string | null
          cancellation_reason: string | null
          cancelled_by: string | null
          captain_id: string | null
          completed_at: string | null
          created_at: string
          customer_id: string
          distance_km: number
          drop_address: string
          drop_lat: number
          drop_lng: number
          fare: number
          id: string
          item_description: string | null
          otp: string | null
          pickup_address: string
          pickup_lat: number
          pickup_lng: number
          receiver_name: string | null
          receiver_phone: string | null
          rejected_by: string[]
          ride_type: Database["public"]["Enums"]["ride_type"]
          sender_name: string | null
          sender_phone: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["ride_status"]
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Insert: {
          accepted_at?: string | null
          cancellation_reason?: string | null
          cancelled_by?: string | null
          captain_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id: string
          distance_km: number
          drop_address: string
          drop_lat: number
          drop_lng: number
          fare: number
          id?: string
          item_description?: string | null
          otp?: string | null
          pickup_address: string
          pickup_lat: number
          pickup_lng: number
          receiver_name?: string | null
          receiver_phone?: string | null
          rejected_by?: string[]
          ride_type?: Database["public"]["Enums"]["ride_type"]
          sender_name?: string | null
          sender_phone?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ride_status"]
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Update: {
          accepted_at?: string | null
          cancellation_reason?: string | null
          cancelled_by?: string | null
          captain_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          distance_km?: number
          drop_address?: string
          drop_lat?: number
          drop_lng?: number
          fare?: number
          id?: string
          item_description?: string | null
          otp?: string | null
          pickup_address?: string
          pickup_lat?: number
          pickup_lng?: number
          receiver_name?: string | null
          receiver_phone?: string | null
          rejected_by?: string[]
          ride_type?: Database["public"]["Enums"]["ride_type"]
          sender_name?: string | null
          sender_phone?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ride_status"]
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "customer" | "captain" | "admin"
      ride_status:
        | "requested"
        | "accepted"
        | "started"
        | "completed"
        | "cancelled"
      ride_type: "passenger" | "parcel"
      vehicle_type: "bike" | "auto"
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
    Enums: {
      app_role: ["customer", "captain", "admin"],
      ride_status: [
        "requested",
        "accepted",
        "started",
        "completed",
        "cancelled",
      ],
      ride_type: ["passenger", "parcel"],
      vehicle_type: ["bike", "auto"],
    },
  },
} as const
