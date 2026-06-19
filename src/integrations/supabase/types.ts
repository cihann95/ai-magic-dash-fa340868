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
      achievements: {
        Row: {
          code: string
          created_at: string
          description_en: string
          description_tr: string
          icon: string
          name_en: string
          name_tr: string
          rarity: string
          xp_reward: number
        }
        Insert: {
          code: string
          created_at?: string
          description_en: string
          description_tr: string
          icon?: string
          name_en: string
          name_tr: string
          rarity?: string
          xp_reward?: number
        }
        Update: {
          code?: string
          created_at?: string
          description_en?: string
          description_tr?: string
          icon?: string
          name_en?: string
          name_tr?: string
          rarity?: string
          xp_reward?: number
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      blitz_orders: {
        Row: {
          amount: number
          closed_at: string | null
          created_at: string
          entry_price: number
          exit_price: number | null
          id: string
          opened_at: string
          pnl: number | null
          room_id: string
          side: Database["public"]["Enums"]["blitz_side"]
          user_id: string
        }
        Insert: {
          amount: number
          closed_at?: string | null
          created_at?: string
          entry_price: number
          exit_price?: number | null
          id?: string
          opened_at?: string
          pnl?: number | null
          room_id: string
          side: Database["public"]["Enums"]["blitz_side"]
          user_id: string
        }
        Update: {
          amount?: number
          closed_at?: string | null
          created_at?: string
          entry_price?: number
          exit_price?: number | null
          id?: string
          opened_at?: string
          pnl?: number | null
          room_id?: string
          side?: Database["public"]["Enums"]["blitz_side"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blitz_orders_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "blitz_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      blitz_participants: {
        Row: {
          created_at: string
          final_balance: number | null
          final_pnl: number | null
          id: string
          joined_at: string
          rank: number | null
          room_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          final_balance?: number | null
          final_pnl?: number | null
          id?: string
          joined_at?: string
          rank?: number | null
          room_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          final_balance?: number | null
          final_pnl?: number | null
          id?: string
          joined_at?: string
          rank?: number | null
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blitz_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "blitz_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      blitz_rooms: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string | null
          entry_fee: number
          fee_collected: number
          id: string
          invite_code: string | null
          max_players: number
          mode: Database["public"]["Enums"]["blitz_mode"]
          pot: number
          start_price: number | null
          starts_at: string | null
          status: Database["public"]["Enums"]["blitz_status"]
          symbol: string
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          entry_fee: number
          fee_collected?: number
          id?: string
          invite_code?: string | null
          max_players?: number
          mode?: Database["public"]["Enums"]["blitz_mode"]
          pot?: number
          start_price?: number | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["blitz_status"]
          symbol: string
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          entry_fee?: number
          fee_collected?: number
          id?: string
          invite_code?: string | null
          max_players?: number
          mode?: Database["public"]["Enums"]["blitz_mode"]
          pot?: number
          start_price?: number | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["blitz_status"]
          symbol?: string
          updated_at?: string
          winner_id?: string | null
        }
        Relationships: []
      }
      coach_insights: {
        Row: {
          acknowledged: boolean
          body: string
          category: string
          created_at: string
          id: string
          metadata: Json | null
          severity: string
          title: string
          user_id: string
        }
        Insert: {
          acknowledged?: boolean
          body: string
          category: string
          created_at?: string
          id?: string
          metadata?: Json | null
          severity?: string
          title: string
          user_id: string
        }
        Update: {
          acknowledged?: boolean
          body?: string
          category?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          severity?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      copy_settings: {
        Row: {
          asset_classes: string[]
          created_at: string
          enabled: boolean
          follower_id: string
          id: string
          leader_id: string
          max_position_usd: number
          ratio: number
          updated_at: string
        }
        Insert: {
          asset_classes?: string[]
          created_at?: string
          enabled?: boolean
          follower_id: string
          id?: string
          leader_id: string
          max_position_usd?: number
          ratio?: number
          updated_at?: string
        }
        Update: {
          asset_classes?: string[]
          created_at?: string
          enabled?: boolean
          follower_id?: string
          id?: string
          leader_id?: string
          max_position_usd?: number
          ratio?: number
          updated_at?: string
        }
        Relationships: []
      }
      daily_briefs: {
        Row: {
          brief_date: string
          content: string
          created_at: string
          id: string
          read: boolean
          sentiment: string | null
          user_id: string
        }
        Insert: {
          brief_date: string
          content: string
          created_at?: string
          id?: string
          read?: boolean
          sentiment?: string | null
          user_id: string
        }
        Update: {
          brief_date?: string
          content?: string
          created_at?: string
          id?: string
          read?: boolean
          sentiment?: string | null
          user_id?: string
        }
        Relationships: []
      }
      emotional_logs: {
        Row: {
          created_at: string
          id: string
          mood: string | null
          signal_type: string
          symbol: string | null
          trade_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mood?: string | null
          signal_type: string
          symbol?: string | null
          trade_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mood?: string | null
          signal_type?: string
          symbol?: string | null
          trade_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      followers: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          metadata: Json | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          asset_class: string
          created_at: string
          expires_at: string | null
          fill_price: number | null
          filled_at: string | null
          id: string
          limit_price: number | null
          order_type: string
          position_id: string | null
          quantity: number
          side: string
          status: string
          symbol: string
          trigger_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_class: string
          created_at?: string
          expires_at?: string | null
          fill_price?: number | null
          filled_at?: string | null
          id?: string
          limit_price?: number | null
          order_type: string
          position_id?: string | null
          quantity: number
          side: string
          status?: string
          symbol: string
          trigger_price: number
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_class?: string
          created_at?: string
          expires_at?: string | null
          fill_price?: number | null
          filled_at?: string | null
          id?: string
          limit_price?: number | null
          order_type?: string
          position_id?: string | null
          quantity?: number
          side?: string
          status?: string
          symbol?: string
          trigger_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_revenue: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          metadata: Json | null
          room_id: string | null
          source: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          room_id?: string | null
          source?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          room_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_revenue_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "blitz_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          asset_class: string
          current_price: number | null
          entry_price: number
          id: string
          opened_at: string
          quantity: number
          side: string
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_class: string
          current_price?: number | null
          entry_price: number
          id?: string
          opened_at?: string
          quantity: number
          side: string
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_class?: string
          current_price?: number | null
          entry_price?: number
          id?: string
          opened_at?: string
          quantity?: number
          side?: string
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      price_alerts: {
        Row: {
          asset_class: string
          created_at: string
          direction: string
          id: string
          note: string | null
          symbol: string
          target_price: number
          triggered: boolean
          triggered_at: string | null
          user_id: string
        }
        Insert: {
          asset_class: string
          created_at?: string
          direction: string
          id?: string
          note?: string | null
          symbol: string
          target_price: number
          triggered?: boolean
          triggered_at?: string | null
          user_id: string
        }
        Update: {
          asset_class?: string
          created_at?: string
          direction?: string
          id?: string
          note?: string | null
          symbol?: string
          target_price?: number
          triggered?: boolean
          triggered_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      price_cache: {
        Row: {
          asset_class: string
          change_24h: number | null
          change_pct_24h: number | null
          price: number
          symbol: string
          updated_at: string
          volume_24h: number | null
        }
        Insert: {
          asset_class: string
          change_24h?: number | null
          change_pct_24h?: number | null
          price: number
          symbol: string
          updated_at?: string
          volume_24h?: number | null
        }
        Update: {
          asset_class?: string
          change_24h?: number | null
          change_pct_24h?: number | null
          price?: number
          symbol?: string
          updated_at?: string
          volume_24h?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          demo_balance: number
          demo_balance_locked: number
          display_name: string | null
          id: string
          initial_balance: number
          last_weekly_digest_at: string | null
          preferred_language: string | null
          preferred_theme: string | null
          preferred_view: string
          real_balance: number
          real_balance_locked: number
          trader_persona: Json | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          demo_balance?: number
          demo_balance_locked?: number
          display_name?: string | null
          id: string
          initial_balance?: number
          last_weekly_digest_at?: string | null
          preferred_language?: string | null
          preferred_theme?: string | null
          preferred_view?: string
          real_balance?: number
          real_balance_locked?: number
          trader_persona?: Json | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          demo_balance?: number
          demo_balance_locked?: number
          display_name?: string | null
          id?: string
          initial_balance?: number
          last_weekly_digest_at?: string | null
          preferred_language?: string | null
          preferred_theme?: string | null
          preferred_view?: string
          real_balance?: number
          real_balance_locked?: number
          trader_persona?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          bio: string | null
          copyable: boolean
          created_at: string
          is_active: boolean
          show_portfolio: boolean
          show_trades: boolean
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          bio?: string | null
          copyable?: boolean
          created_at?: string
          is_active?: boolean
          show_portfolio?: boolean
          show_trades?: boolean
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          bio?: string | null
          copyable?: boolean
          created_at?: string
          is_active?: boolean
          show_portfolio?: boolean
          show_trades?: boolean
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      real_balance_ledger: {
        Row: {
          amount: number
          created_at: string
          granted_by: string | null
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          granted_by?: string | null
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          granted_by?: string | null
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      trade_journal: {
        Row: {
          created_at: string
          emotion: string | null
          id: string
          lessons: string | null
          position_id: string | null
          rating: number | null
          symbol: string
          thesis: string | null
          trade_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emotion?: string | null
          id?: string
          lessons?: string | null
          position_id?: string | null
          rating?: number | null
          symbol: string
          thesis?: string | null
          trade_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          emotion?: string | null
          id?: string
          lessons?: string | null
          position_id?: string | null
          rating?: number | null
          symbol?: string
          thesis?: string | null
          trade_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          action: string
          asset_class: string
          copied_from: string | null
          executed_at: string
          executor: string
          id: string
          intent_note: string | null
          intent_tag: string | null
          leader_user_id: string | null
          plan_adherence: number | null
          planned_sl: number | null
          planned_tp: number | null
          pnl: number | null
          price: number
          quantity: number
          side: string
          symbol: string
          total: number
          user_id: string
        }
        Insert: {
          action: string
          asset_class: string
          copied_from?: string | null
          executed_at?: string
          executor?: string
          id?: string
          intent_note?: string | null
          intent_tag?: string | null
          leader_user_id?: string | null
          plan_adherence?: number | null
          planned_sl?: number | null
          planned_tp?: number | null
          pnl?: number | null
          price: number
          quantity: number
          side: string
          symbol: string
          total: number
          user_id: string
        }
        Update: {
          action?: string
          asset_class?: string
          copied_from?: string | null
          executed_at?: string
          executor?: string
          id?: string
          intent_note?: string | null
          intent_tag?: string | null
          leader_user_id?: string | null
          plan_adherence?: number | null
          planned_sl?: number | null
          planned_tp?: number | null
          pnl?: number | null
          price?: number
          quantity?: number
          side?: string
          symbol?: string
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_code: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          achievement_code: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          achievement_code?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_code_fkey"
            columns: ["achievement_code"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["code"]
          },
        ]
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
          role?: Database["public"]["Enums"]["app_role"]
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
      user_stats: {
        Row: {
          ai_uses: number
          asset_classes_traded: string[]
          best_trade_pnl: number
          current_streak: number
          last_active_date: string | null
          level: number
          longest_streak: number
          onboarding_completed: boolean
          profitable_trades: number
          total_pnl: number
          total_trades: number
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          ai_uses?: number
          asset_classes_traded?: string[]
          best_trade_pnl?: number
          current_streak?: number
          last_active_date?: string | null
          level?: number
          longest_streak?: number
          onboarding_completed?: boolean
          profitable_trades?: number
          total_pnl?: number
          total_trades?: number
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          ai_uses?: number
          asset_classes_traded?: string[]
          best_trade_pnl?: number
          current_streak?: number
          last_active_date?: string | null
          level?: number
          longest_streak?: number
          onboarding_completed?: boolean
          profitable_trades?: number
          total_pnl?: number
          total_trades?: number
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          asset_class: string
          created_at: string
          display_name: string | null
          id: string
          symbol: string
          user_id: string
        }
        Insert: {
          asset_class: string
          created_at?: string
          display_name?: string | null
          id?: string
          symbol: string
          user_id: string
        }
        Update: {
          asset_class?: string
          created_at?: string
          display_name?: string | null
          id?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      activity_feed: {
        Row: {
          achievement_code: string | null
          action: string | null
          asset_class: string | null
          event_at: string | null
          event_id: string | null
          event_type: string | null
          pnl: number | null
          side: string | null
          symbol: string | null
          user_id: string | null
        }
        Relationships: []
      }
      platform_revenue_daily: {
        Row: {
          day: string | null
          source: string | null
          total_amount: number | null
          tx_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      award_xp: {
        Args: { _amount: number; _user_id: string }
        Returns: {
          leveled_up: boolean
          new_level: number
          new_xp: number
        }[]
      }
      get_leaderboard: {
        Args: { _limit?: number }
        Returns: {
          level: number
          total_pnl: number
          total_trades: number
          user_id: string
          username: string
          win_rate: number
          xp: number
        }[]
      }
      grant_achievement: {
        Args: { _code: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_onboarding_complete: { Args: never; Returns: undefined }
      touch_streak: { Args: { _user_id: string }; Returns: number }
      verify_cron_secret: { Args: { _token: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
      blitz_mode: "public" | "private"
      blitz_side: "long" | "short"
      blitz_status: "waiting" | "active" | "settling" | "finished" | "cancelled"
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
      app_role: ["admin", "user"],
      blitz_mode: ["public", "private"],
      blitz_side: ["long", "short"],
      blitz_status: ["waiting", "active", "settling", "finished", "cancelled"],
    },
  },
} as const
