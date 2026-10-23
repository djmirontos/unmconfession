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
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          starts_at: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          starts_at?: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          starts_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          app_name: string
          audit_retention_days: number
          id: number
          logo_path: string | null
          moderation_mode: string
          rejected_retention_days: number
          tagline: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          app_name?: string
          audit_retention_days?: number
          id?: number
          logo_path?: string | null
          moderation_mode?: string
          rejected_retention_days?: number
          tagline?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          app_name?: string
          audit_retention_days?: number
          id?: number
          logo_path?: string | null
          moderation_mode?: string
          rejected_retention_days?: number
          tagline?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          listing_id: string | null
          moderated_at: string | null
          moderated_by: string | null
          post_id: string | null
          published_at: string | null
          reject_reason: string | null
          status: Database["public"]["Enums"]["content_status"]
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          listing_id?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          post_id?: string | null
          published_at?: string | null
          reject_reason?: string | null
          status: Database["public"]["Enums"]["content_status"]
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          listing_id?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          post_id?: string | null
          published_at?: string | null
          reject_reason?: string | null
          status?: Database["public"]["Enums"]["content_status"]
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "feed_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_events: {
        Row: {
          created_at: string
          id: number
          post_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          post_id: string
        }
        Update: {
          created_at?: string
          id?: never
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_audit_log: {
        Row: {
          admin_id: string | null
          created_at: string
          id: string
          subject_user_id: string | null
          target_id: string
          target_type: Database["public"]["Enums"]["content_type"]
        }
        Insert: {
          admin_id?: string | null
          created_at?: string
          id?: string
          subject_user_id?: string | null
          target_id: string
          target_type: Database["public"]["Enums"]["content_type"]
        }
        Update: {
          admin_id?: string | null
          created_at?: string
          id?: string
          subject_user_id?: string | null
          target_id?: string
          target_type?: Database["public"]["Enums"]["content_type"]
        }
        Relationships: [
          {
            foreignKeyName: "identity_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_audit_log_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      keywords: {
        Row: {
          active: boolean
          applies_to: string[]
          category: string
          created_at: string
          created_by: string | null
          id: string
          match_type: string
          term: string
        }
        Insert: {
          active?: boolean
          applies_to?: string[]
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          match_type?: string
          term: string
        }
        Update: {
          active?: boolean
          applies_to?: string[]
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          match_type?: string
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "keywords_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          author_id: string
          comment_count: number
          condition: string | null
          created_at: string
          description: string | null
          event_date: string | null
          id: string
          images: Json
          is_closed: boolean
          kind: Database["public"]["Enums"]["listing_kind"]
          location: string | null
          lost_found_type: string | null
          moderated_at: string | null
          moderated_by: string | null
          price: number | null
          published_at: string | null
          reject_reason: string | null
          status: Database["public"]["Enums"]["content_status"]
          title: string
        }
        Insert: {
          author_id: string
          comment_count?: number
          condition?: string | null
          created_at?: string
          description?: string | null
          event_date?: string | null
          id?: string
          images?: Json
          is_closed?: boolean
          kind: Database["public"]["Enums"]["listing_kind"]
          location?: string | null
          lost_found_type?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          price?: number | null
          published_at?: string | null
          reject_reason?: string | null
          status: Database["public"]["Enums"]["content_status"]
          title: string
        }
        Update: {
          author_id?: string
          comment_count?: number
          condition?: string | null
          created_at?: string
          description?: string | null
          event_date?: string | null
          id?: string
          images?: Json
          is_closed?: boolean
          kind?: Database["public"]["Enums"]["listing_kind"]
          location?: string | null
          lost_found_type?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          price?: number | null
          published_at?: string | null
          reject_reason?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_actions: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          note: string | null
          original_body: string | null
          reason_code: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          original_body?: string | null
          reason_code?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          original_body?: string | null
          reason_code?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_holds: {
        Row: {
          created_at: string
          matched_term: string | null
          reason: string
          target_id: string
          target_type: Database["public"]["Enums"]["content_type"]
        }
        Insert: {
          created_at?: string
          matched_term?: string | null
          reason: string
          target_id: string
          target_type: Database["public"]["Enums"]["content_type"]
        }
        Update: {
          created_at?: string
          matched_term?: string | null
          reason?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["content_type"]
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          data: Json
          id: string
          read_at: string | null
          target_id: string | null
          target_type: Database["public"]["Enums"]["content_type"] | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          target_id?: string | null
          target_type?: Database["public"]["Enums"]["content_type"] | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          target_id?: string | null
          target_type?: Database["public"]["Enums"]["content_type"] | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_options: {
        Row: {
          id: string
          label: string
          position: number
          post_id: string
          vote_count: number
        }
        Insert: {
          id?: string
          label: string
          position: number
          post_id: string
          vote_count?: number
        }
        Update: {
          id?: string
          label?: string
          position?: number
          post_id?: string
          vote_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_options_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string
          option_id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          option_id: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          option_id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_option_id_post_id_fkey"
            columns: ["option_id", "post_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id", "post_id"]
          },
          {
            foreignKeyName: "poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          body: string
          comment_count: number
          created_at: string
          ends_at: string | null
          id: string
          images: Json
          kind: Database["public"]["Enums"]["post_kind"]
          moderated_at: string | null
          moderated_by: string | null
          number: number | null
          published_at: string | null
          reaction_count: number
          reject_reason: string | null
          status: Database["public"]["Enums"]["content_status"]
          target_name: string | null
        }
        Insert: {
          author_id: string
          body: string
          comment_count?: number
          created_at?: string
          ends_at?: string | null
          id?: string
          images?: Json
          kind: Database["public"]["Enums"]["post_kind"]
          moderated_at?: string | null
          moderated_by?: string | null
          number?: number | null
          published_at?: string | null
          reaction_count?: number
          reject_reason?: string | null
          status: Database["public"]["Enums"]["content_status"]
          target_name?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          comment_count?: number
          created_at?: string
          ends_at?: string | null
          id?: string
          images?: Json
          kind?: Database["public"]["Enums"]["post_kind"]
          moderated_at?: string | null
          moderated_by?: string | null
          number?: number | null
          published_at?: string | null
          reaction_count?: number
          reject_reason?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          target_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_key: string
          created_at: string
          id: string
          nickname: string | null
        }
        Insert: {
          avatar_key?: string
          created_at?: string
          id: string
          nickname?: string | null
        }
        Update: {
          avatar_key?: string
          created_at?: string
          id?: string
          nickname?: string | null
        }
        Relationships: []
      }
      reactions: {
        Row: {
          created_at: string
          post_id: string
          type: Database["public"]["Enums"]["reaction_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          type: Database["public"]["Enums"]["reaction_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          type?: Database["public"]["Enums"]["reaction_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          note: string | null
          reason: string
          reporter_id: string
          status: string
          target_id: string
          target_type: Database["public"]["Enums"]["content_type"]
        }
        Insert: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          note?: string | null
          reason: string
          reporter_id: string
          status?: string
          target_id: string
          target_type: Database["public"]["Enums"]["content_type"]
        }
        Update: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          note?: string | null
          reason?: string
          reporter_id?: string
          status?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["content_type"]
        }
        Relationships: [
          {
            foreignKeyName: "reports_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_cleanup_queue: {
        Row: {
          bucket: string
          id: number
          path: string
          queued_at: string
        }
        Insert: {
          bucket: string
          id?: never
          path: string
          queued_at?: string
        }
        Update: {
          bucket?: string
          id?: never
          path?: string
          queued_at?: string
        }
        Relationships: []
      }
      trending_scores: {
        Row: {
          computed_at: string
          post_id: string
          score: number
        }
        Insert: {
          computed_at?: string
          post_id: string
          score: number
        }
        Update: {
          computed_at?: string
          post_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "trending_scores_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trending_scores_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          kind: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          kind?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_flags: {
        Row: {
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["account_status"]
          status_reason: string | null
          suspended_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["account_status"]
          status_reason?: string | null
          suspended_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["account_status"]
          status_reason?: string | null
          suspended_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_flags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      feed_listings: {
        Row: {
          author_id: string | null
          avatar_key: string | null
          comment_count: number | null
          condition: string | null
          description: string | null
          event_date: string | null
          id: string | null
          images: Json | null
          is_closed: boolean | null
          kind: Database["public"]["Enums"]["listing_kind"] | null
          location: string | null
          lost_found_type: string | null
          nickname: string | null
          price: number | null
          published_at: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_posts: {
        Row: {
          author_id: string | null
          avatar_key: string | null
          body: string | null
          comment_count: number | null
          ends_at: string | null
          id: string | null
          images: Json | null
          kind: Database["public"]["Enums"]["post_kind"] | null
          my_reaction: Database["public"]["Enums"]["reaction_type"] | null
          my_vote: string | null
          nickname: string | null
          number: number | null
          poll_options: Json | null
          published_at: string | null
          reaction_count: number | null
          target_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_comments: {
        Row: {
          author_id: string | null
          avatar_key: string | null
          body: string | null
          id: string | null
          listing_id: string | null
          nickname: string | null
          post_id: string | null
          published_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "feed_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _check_images: { Args: { p_images: Json; p_uid: string }; Returns: Json }
      _moderation_decision: {
        Args: {
          p_text: string
          p_type: Database["public"]["Enums"]["content_type"]
        }
        Returns: {
          out_reason: string
          out_status: Database["public"]["Enums"]["content_status"]
          out_term: string
        }[]
      }
      _re_escape: { Args: { p: string }; Returns: string }
      _validate_nickname: { Args: { p: string }; Returns: undefined }
      admin_set_nickname: {
        Args: { p_nickname: string; p_user: string }
        Returns: undefined
      }
      admin_set_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user: string
        }
        Returns: undefined
      }
      admin_view_identity: {
        Args: {
          p_id: string
          p_type: Database["public"]["Enums"]["content_type"]
        }
        Returns: {
          email: string
          joined_at: string
          nickname: string
          user_id: string
        }[]
      }
      assert_active_member: { Args: never; Returns: string }
      create_comment: {
        Args: {
          p_body: string
          p_target_id: string
          p_target_type: Database["public"]["Enums"]["content_type"]
        }
        Returns: {
          author_id: string
          body: string
          created_at: string
          id: string
          listing_id: string | null
          moderated_at: string | null
          moderated_by: string | null
          post_id: string | null
          published_at: string | null
          reject_reason: string | null
          status: Database["public"]["Enums"]["content_status"]
        }
        SetofOptions: {
          from: "*"
          to: "comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_listing: {
        Args: {
          p_condition?: string
          p_description?: string
          p_event_date?: string
          p_images?: Json
          p_kind: Database["public"]["Enums"]["listing_kind"]
          p_location?: string
          p_lost_found_type?: string
          p_price?: number
          p_title: string
        }
        Returns: {
          author_id: string
          comment_count: number
          condition: string | null
          created_at: string
          description: string | null
          event_date: string | null
          id: string
          images: Json
          is_closed: boolean
          kind: Database["public"]["Enums"]["listing_kind"]
          location: string | null
          lost_found_type: string | null
          moderated_at: string | null
          moderated_by: string | null
          price: number | null
          published_at: string | null
          reject_reason: string | null
          status: Database["public"]["Enums"]["content_status"]
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_post: {
        Args: {
          p_body: string
          p_ends_at?: string
          p_images?: Json
          p_kind: Database["public"]["Enums"]["post_kind"]
          p_poll_options?: string[]
          p_target_name?: string
        }
        Returns: {
          author_id: string
          body: string
          comment_count: number
          created_at: string
          ends_at: string | null
          id: string
          images: Json
          kind: Database["public"]["Enums"]["post_kind"]
          moderated_at: string | null
          moderated_by: string | null
          number: number | null
          published_at: string | null
          reaction_count: number
          reject_reason: string | null
          status: Database["public"]["Enums"]["content_status"]
          target_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_active_polls: {
        Args: { p_limit?: number }
        Returns: {
          author_id: string | null
          avatar_key: string | null
          body: string | null
          comment_count: number | null
          ends_at: string | null
          id: string | null
          images: Json | null
          kind: Database["public"]["Enums"]["post_kind"] | null
          my_reaction: Database["public"]["Enums"]["reaction_type"] | null
          my_vote: string | null
          nickname: string | null
          number: number | null
          poll_options: Json | null
          published_at: string | null
          reaction_count: number | null
          target_name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "feed_posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_comments: {
        Args: {
          p_after_id?: string
          p_after_ts?: string
          p_limit?: number
          p_target_id: string
          p_target_type: Database["public"]["Enums"]["content_type"]
        }
        Returns: {
          author_id: string | null
          avatar_key: string | null
          body: string | null
          id: string | null
          listing_id: string | null
          nickname: string | null
          post_id: string | null
          published_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "thread_comments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_feed: {
        Args: { p_before_id?: string; p_before_ts?: string; p_limit?: number }
        Returns: {
          author_id: string | null
          avatar_key: string | null
          body: string | null
          comment_count: number | null
          ends_at: string | null
          id: string | null
          images: Json | null
          kind: Database["public"]["Enums"]["post_kind"] | null
          my_reaction: Database["public"]["Enums"]["reaction_type"] | null
          my_vote: string | null
          nickname: string | null
          number: number | null
          poll_options: Json | null
          published_at: string | null
          reaction_count: number | null
          target_name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "feed_posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_listings: {
        Args: {
          p_before_id?: string
          p_before_ts?: string
          p_kind: Database["public"]["Enums"]["listing_kind"]
          p_limit?: number
        }
        Returns: {
          author_id: string | null
          avatar_key: string | null
          comment_count: number | null
          condition: string | null
          description: string | null
          event_date: string | null
          id: string | null
          images: Json | null
          is_closed: boolean | null
          kind: Database["public"]["Enums"]["listing_kind"] | null
          location: string | null
          lost_found_type: string | null
          nickname: string | null
          price: number | null
          published_at: string | null
          title: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "feed_listings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_trending: {
        Args: { p_limit?: number }
        Returns: {
          author_id: string | null
          avatar_key: string | null
          body: string | null
          comment_count: number | null
          ends_at: string | null
          id: string | null
          images: Json | null
          kind: Database["public"]["Enums"]["post_kind"] | null
          my_reaction: Database["public"]["Enums"]["reaction_type"] | null
          my_vote: string | null
          nickname: string | null
          number: number | null
          poll_options: Json | null
          published_at: string | null
          reaction_count: number | null
          target_name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "feed_posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_admin: { Args: never; Returns: boolean }
      is_nickname_available: { Args: { p_nickname: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      mod_edit_content: {
        Args: {
          p_id: string
          p_new_body: string
          p_reason?: string
          p_type: Database["public"]["Enums"]["content_type"]
        }
        Returns: undefined
      }
      mod_get_queue: {
        Args: { p_after_ts?: string; p_limit?: number }
        Returns: {
          author_id: string
          body: string
          created_at: string
          hold_reason: string
          images: Json
          matched_term: string
          nickname: string
          target_id: string
          target_type: Database["public"]["Enums"]["content_type"]
          title: string
        }[]
      }
      mod_resolve_report: {
        Args: { p_report_id: string; p_status: string }
        Returns: undefined
      }
      mod_review: {
        Args: {
          p_action: string
          p_id: string
          p_note?: string
          p_reason?: string
          p_type: Database["public"]["Enums"]["content_type"]
        }
        Returns: undefined
      }
      mod_set_user_status: {
        Args: {
          p_reason?: string
          p_status: Database["public"]["Enums"]["account_status"]
          p_until?: string
          p_user: string
        }
        Returns: undefined
      }
      purge_expired: { Args: never; Returns: Json }
      refresh_trending: { Args: never; Returns: undefined }
      report_content: {
        Args: {
          p_id: string
          p_note?: string
          p_reason: string
          p_type: Database["public"]["Enums"]["content_type"]
        }
        Returns: undefined
      }
      set_listing_closed: {
        Args: { p_closed: boolean; p_listing_id: string }
        Returns: undefined
      }
      set_nickname: { Args: { p_nickname: string }; Returns: undefined }
      set_reaction: {
        Args: {
          p_post_id: string
          p_type: Database["public"]["Enums"]["reaction_type"]
        }
        Returns: undefined
      }
      vote_poll: {
        Args: { p_option_id: string; p_post_id: string }
        Returns: undefined
      }
    }
    Enums: {
      account_status: "active" | "suspended" | "banned"
      app_role: "user" | "moderator" | "admin"
      content_status: "published" | "pending" | "rejected" | "removed"
      content_type: "post" | "comment" | "listing"
      listing_kind: "sell" | "lost_found"
      post_kind: "confession" | "shoutout" | "poll"
      reaction_type: "like" | "love" | "haha" | "wow" | "sad" | "angry"
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
    Enums: {
      account_status: ["active", "suspended", "banned"],
      app_role: ["user", "moderator", "admin"],
      content_status: ["published", "pending", "rejected", "removed"],
      content_type: ["post", "comment", "listing"],
      listing_kind: ["sell", "lost_found"],
      post_kind: ["confession", "shoutout", "poll"],
      reaction_type: ["like", "love", "haha", "wow", "sad", "angry"],
    },
  },
} as const
