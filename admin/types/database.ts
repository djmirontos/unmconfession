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
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          detail: string | null
          id: string
          subject_user_id: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          subject_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          subject_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          campus_voice_reactions: number
          id: number
          logo_path: string | null
          min_app_version: string
          moderation_mode: string
          rejected_retention_days: number
          tagline: string
          update_message: string | null
          update_url: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          app_name?: string
          audit_retention_days?: number
          campus_voice_reactions?: number
          id?: number
          logo_path?: string | null
          min_app_version?: string
          moderation_mode?: string
          rejected_retention_days?: number
          tagline?: string
          update_message?: string | null
          update_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          app_name?: string
          audit_retention_days?: number
          campus_voice_reactions?: number
          id?: number
          logo_path?: string | null
          min_app_version?: string
          moderation_mode?: string
          rejected_retention_days?: number
          tagline?: string
          update_message?: string | null
          update_url?: string | null
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
      badges: {
        Row: {
          code: string
          description: string
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          description: string
          name: string
          sort_order: number
        }
        Update: {
          code?: string
          description?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          type: Database["public"]["Enums"]["reaction_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          type: Database["public"]["Enums"]["reaction_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          type?: Database["public"]["Enums"]["reaction_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "thread_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reactions_user_id_fkey"
            columns: ["user_id"]
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
          deleted_at: string | null
          edited_at: string | null
          id: string
          listing_id: string | null
          moderated_at: string | null
          moderated_by: string | null
          parent_id: string | null
          post_id: string | null
          published_at: string | null
          reaction_breakdown: Json
          reaction_count: number
          reject_reason: string | null
          reply_count: number
          reply_to_id: string | null
          status: Database["public"]["Enums"]["content_status"]
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          listing_id?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          parent_id?: string | null
          post_id?: string | null
          published_at?: string | null
          reaction_breakdown?: Json
          reaction_count?: number
          reject_reason?: string | null
          reply_count?: number
          reply_to_id?: string | null
          status: Database["public"]["Enums"]["content_status"]
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          listing_id?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          parent_id?: string | null
          post_id?: string | null
          published_at?: string | null
          reaction_breakdown?: Json
          reaction_count?: number
          reject_reason?: string | null
          reply_count?: number
          reply_to_id?: string | null
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
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "thread_comments"
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
          {
            foreignKeyName: "comments_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "thread_comments"
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
          deleted_at: string | null
          description: string | null
          edited_at: string | null
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
          deleted_at?: string | null
          description?: string | null
          edited_at?: string | null
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
          deleted_at?: string | null
          description?: string | null
          edited_at?: string | null
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
          deleted_at: string | null
          edited_at: string | null
          ends_at: string | null
          id: string
          images: Json
          kind: Database["public"]["Enums"]["post_kind"]
          moderated_at: string | null
          moderated_by: string | null
          number: number | null
          published_at: string | null
          reaction_breakdown: Json
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
          deleted_at?: string | null
          edited_at?: string | null
          ends_at?: string | null
          id?: string
          images?: Json
          kind: Database["public"]["Enums"]["post_kind"]
          moderated_at?: string | null
          moderated_by?: string | null
          number?: number | null
          published_at?: string | null
          reaction_breakdown?: Json
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
          deleted_at?: string | null
          edited_at?: string | null
          ends_at?: string | null
          id?: string
          images?: Json
          kind?: Database["public"]["Enums"]["post_kind"]
          moderated_at?: string | null
          moderated_by?: string | null
          number?: number | null
          published_at?: string | null
          reaction_breakdown?: Json
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
      profile_details: {
        Row: {
          about: string | null
          college: string | null
          course: string | null
          hobbies: string | null
          show_details: boolean
          updated_at: string
          user_id: string
          year_level: string | null
        }
        Insert: {
          about?: string | null
          college?: string | null
          course?: string | null
          hobbies?: string | null
          show_details?: boolean
          updated_at?: string
          user_id: string
          year_level?: string | null
        }
        Update: {
          about?: string | null
          college?: string | null
          course?: string | null
          hobbies?: string | null
          show_details?: boolean
          updated_at?: string
          user_id?: string
          year_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_details_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
          attempts: number
          bucket: string
          id: number
          last_attempt_at: string | null
          path: string
          queued_at: string
        }
        Insert: {
          attempts?: number
          bucket: string
          id?: never
          last_attempt_at?: string | null
          path: string
          queued_at?: string
        }
        Update: {
          attempts?: number
          bucket?: string
          id?: never
          last_attempt_at?: string | null
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
      user_badges: {
        Row: {
          badge_code: string
          earned_at: string
          user_id: string
        }
        Insert: {
          badge_code: string
          earned_at?: string
          user_id: string
        }
        Update: {
          badge_code?: string
          earned_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_code_fkey"
            columns: ["badge_code"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          deleted_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["account_status"]
          status_reason: string | null
          suspended_until: string | null
          terms_accepted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          deleted_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["account_status"]
          status_reason?: string | null
          suspended_until?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          deleted_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["account_status"]
          status_reason?: string | null
          suspended_until?: string | null
          terms_accepted_at?: string | null
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
      user_settings: {
        Row: {
          nickname_changed_at: string | null
          notify_comments: boolean
          notify_reactions: boolean
          notify_replies: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          nickname_changed_at?: string | null
          notify_comments?: boolean
          notify_reactions?: boolean
          notify_replies?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          nickname_changed_at?: string | null
          notify_comments?: boolean
          notify_reactions?: boolean
          notify_replies?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
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
          edited_at: string | null
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
          edited_at: string | null
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
          top_reactions: string[] | null
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
          edited_at: string | null
          id: string | null
          listing_id: string | null
          my_reaction: Database["public"]["Enums"]["reaction_type"] | null
          nickname: string | null
          parent_id: string | null
          post_id: string | null
          published_at: string | null
          reaction_count: number | null
          reply_count: number | null
          reply_to_id: string | null
          top_reactions: string[] | null
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
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "thread_comments"
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
          {
            foreignKeyName: "comments_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "thread_comments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _bump_reaction: { Args: { b: Json; d: number; t: string }; Returns: Json }
      _can_upload_avatar: { Args: never; Returns: boolean }
      _check_images: { Args: { p_images: Json; p_uid: string }; Returns: Json }
      _cleanup_path_ok: {
        Args: { p_bucket: string; p_path: string }
        Returns: boolean
      }
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
      _nickname_flagged: { Args: { p: string }; Returns: string }
      _profile_clean: { Args: { p: string }; Returns: string }
      _profile_text_contact: { Args: { p: string }; Returns: boolean }
      _profile_text_flagged: { Args: { p: string }; Returns: string }
      _re_escape: { Args: { p: string }; Returns: string }
      _validate_nickname: { Args: { p: string }; Returns: undefined }
      admin_delete_account: {
        Args: { p_reason: string; p_user: string }
        Returns: undefined
      }
      admin_find_user_by_email: {
        Args: { p_email: string }
        Returns: {
          nickname: string
          user_id: string
        }[]
      }
      admin_get_audit: {
        Args: { p_after_id?: string; p_after_ts?: string; p_limit?: number }
        Returns: {
          action: string
          admin_id: string
          admin_nickname: string
          created_at: string
          detail: string
          id: string
          subject_nickname: string
          subject_user_id: string
          target_id: string
          target_type: string
        }[]
      }
      admin_get_user_identity: {
        Args: { p_user: string }
        Returns: {
          email: string
          email_confirmed: boolean
          joined_at: string
          last_sign_in_at: string
          nickname: string
          providers: string[]
          user_id: string
        }[]
      }
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
      award_badges: { Args: never; Returns: undefined }
      change_nickname: { Args: { p_nickname: string }; Returns: undefined }
      cleanup_claim_batch: {
        Args: { p_limit?: number }
        Returns: {
          bucket: string
          id: number
          path: string
        }[]
      }
      cleanup_mark_done: { Args: { p_ids: number[] }; Returns: number }
      cleanup_peek_batch: {
        Args: { p_limit?: number }
        Returns: {
          bucket: string
          id: number
          path: string
        }[]
      }
      cleanup_queue_stats: {
        Args: never
        Returns: {
          dead: number
          pending: number
        }[]
      }
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
          deleted_at: string | null
          edited_at: string | null
          id: string
          listing_id: string | null
          moderated_at: string | null
          moderated_by: string | null
          parent_id: string | null
          post_id: string | null
          published_at: string | null
          reaction_breakdown: Json
          reaction_count: number
          reject_reason: string | null
          reply_count: number
          reply_to_id: string | null
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
          deleted_at: string | null
          description: string | null
          edited_at: string | null
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
          deleted_at: string | null
          edited_at: string | null
          ends_at: string | null
          id: string
          images: Json
          kind: Database["public"]["Enums"]["post_kind"]
          moderated_at: string | null
          moderated_by: string | null
          number: number | null
          published_at: string | null
          reaction_breakdown: Json
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
      create_reply: {
        Args: { p_body: string; p_to_comment_id: string }
        Returns: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          listing_id: string | null
          moderated_at: string | null
          moderated_by: string | null
          parent_id: string | null
          post_id: string | null
          published_at: string | null
          reaction_breakdown: Json
          reaction_count: number
          reject_reason: string | null
          reply_count: number
          reply_to_id: string | null
          status: Database["public"]["Enums"]["content_status"]
        }
        SetofOptions: {
          from: "*"
          to: "comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_my_account: { Args: { p_confirm: string }; Returns: undefined }
      delete_notifications: { Args: { p_keys: string[] }; Returns: undefined }
      delete_own_comment: { Args: { p_comment_id: string }; Returns: undefined }
      delete_own_listing: { Args: { p_listing_id: string }; Returns: undefined }
      delete_own_post: { Args: { p_post_id: string }; Returns: undefined }
      edit_own_comment: {
        Args: { p_body: string; p_comment_id: string }
        Returns: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          listing_id: string | null
          moderated_at: string | null
          moderated_by: string | null
          parent_id: string | null
          post_id: string | null
          published_at: string | null
          reaction_breakdown: Json
          reaction_count: number
          reject_reason: string | null
          reply_count: number
          reply_to_id: string | null
          status: Database["public"]["Enums"]["content_status"]
        }
        SetofOptions: {
          from: "*"
          to: "comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      edit_own_listing: {
        Args: {
          p_condition?: string
          p_description?: string
          p_event_date?: string
          p_listing_id: string
          p_location?: string
          p_price?: number
          p_title: string
        }
        Returns: {
          author_id: string
          comment_count: number
          condition: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          edited_at: string | null
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
      edit_own_post: {
        Args: { p_body: string; p_post_id: string; p_target_name?: string }
        Returns: {
          author_id: string
          body: string
          comment_count: number
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          ends_at: string | null
          id: string
          images: Json
          kind: Database["public"]["Enums"]["post_kind"]
          moderated_at: string | null
          moderated_by: string | null
          number: number | null
          published_at: string | null
          reaction_breakdown: Json
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
          edited_at: string | null
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
          top_reactions: string[] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "feed_posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_app_requirements: {
        Args: never
        Returns: {
          min_app_version: string
          update_message: string
          update_url: string
        }[]
      }
      get_comment_reactor_counts: {
        Args: { p_comment_id: string }
        Returns: {
          total: number
          type: Database["public"]["Enums"]["reaction_type"]
        }[]
      }
      get_comment_reactors: {
        Args: {
          p_before_ts?: string
          p_before_user?: string
          p_comment_id: string
          p_limit?: number
          p_type?: Database["public"]["Enums"]["reaction_type"]
        }
        Returns: {
          avatar_key: string
          nickname: string
          reacted_at: string
          type: Database["public"]["Enums"]["reaction_type"]
          user_id: string
        }[]
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
          edited_at: string | null
          id: string | null
          listing_id: string | null
          my_reaction: Database["public"]["Enums"]["reaction_type"] | null
          nickname: string | null
          parent_id: string | null
          post_id: string | null
          published_at: string | null
          reaction_count: number | null
          reply_count: number | null
          reply_to_id: string | null
          top_reactions: string[] | null
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
          edited_at: string | null
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
          top_reactions: string[] | null
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
          p_include_closed?: boolean
          p_kind: Database["public"]["Enums"]["listing_kind"]
          p_limit?: number
          p_lost_found_type?: string
          p_search?: string
        }
        Returns: {
          author_id: string | null
          avatar_key: string | null
          comment_count: number | null
          condition: string | null
          description: string | null
          edited_at: string | null
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
      get_my_profile_details: {
        Args: never
        Returns: {
          about: string
          college: string
          course: string
          hobbies: string
          show_details: boolean
          year_level: string
        }[]
      }
      get_my_settings: {
        Args: never
        Returns: {
          nickname_changed_at: string
          nickname_next_change_at: string
          notify_comments: boolean
          notify_reactions: boolean
          notify_replies: boolean
        }[]
      }
      get_notifications: {
        Args: { p_before_key?: string; p_before_ts?: string; p_limit?: number }
        Returns: {
          actor_avatar_key: string
          actor_count: number
          actor_id: string
          actor_nickname: string
          event_count: number
          group_key: string
          latest_at: string
          parent_listing_id: string
          parent_post_id: string
          reaction_type: string
          reason: string
          target_exists: boolean
          target_id: string
          target_kind: string
          target_preview: string
          target_status: string
          target_type: Database["public"]["Enums"]["content_type"]
          type: string
          unread_count: number
        }[]
      }
      get_post_reactor_counts: {
        Args: { p_post_id: string }
        Returns: {
          total: number
          type: Database["public"]["Enums"]["reaction_type"]
        }[]
      }
      get_post_reactors: {
        Args: {
          p_before_ts?: string
          p_before_user?: string
          p_limit?: number
          p_post_id: string
          p_type?: Database["public"]["Enums"]["reaction_type"]
        }
        Returns: {
          avatar_key: string
          nickname: string
          reacted_at: string
          type: Database["public"]["Enums"]["reaction_type"]
          user_id: string
        }[]
      }
      get_profile_details: {
        Args: { p_user: string }
        Returns: {
          about: string
          college: string
          course: string
          hobbies: string
          year_level: string
        }[]
      }
      get_replies: {
        Args: {
          p_after_id?: string
          p_after_ts?: string
          p_limit?: number
          p_parent_id: string
        }
        Returns: {
          author_id: string | null
          avatar_key: string | null
          body: string | null
          edited_at: string | null
          id: string | null
          listing_id: string | null
          my_reaction: Database["public"]["Enums"]["reaction_type"] | null
          nickname: string | null
          parent_id: string | null
          post_id: string | null
          published_at: string | null
          reaction_count: number | null
          reply_count: number | null
          reply_to_id: string | null
          top_reactions: string[] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "thread_comments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_top_badges: {
        Args: { p_users: string[] }
        Returns: {
          code: string
          name: string
          user_id: string
        }[]
      }
      get_trending: {
        Args: { p_limit?: number }
        Returns: {
          author_id: string | null
          avatar_key: string | null
          body: string | null
          comment_count: number | null
          edited_at: string | null
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
          top_reactions: string[] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "feed_posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_unread_notification_count: { Args: never; Returns: number }
      get_user_badges: {
        Args: { p_user: string }
        Returns: {
          code: string
          description: string
          earned_at: string
          name: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_nickname_available: { Args: { p_nickname: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      mark_notifications_read: {
        Args: { p_keys?: string[] }
        Returns: undefined
      }
      mod_clear_profile_details: {
        Args: { p_reason?: string; p_user: string }
        Returns: undefined
      }
      mod_dashboard: {
        Args: never
        Returns: {
          banned_users: number
          comments_24h: number
          deleted_accounts: number
          listings_24h: number
          new_users_24h: number
          open_reports: number
          pending_comments: number
          pending_listings: number
          pending_posts: number
          posts_24h: number
          reported_items: number
          suspended_users: number
        }[]
      }
      mod_edit_content: {
        Args: {
          p_id: string
          p_new_body: string
          p_reason?: string
          p_type: Database["public"]["Enums"]["content_type"]
        }
        Returns: undefined
      }
      mod_get_actions: {
        Args: {
          p_actor?: string
          p_after_id?: string
          p_after_ts?: string
          p_limit?: number
          p_subject_user?: string
          p_target_id?: string
          p_target_type?: string
        }
        Returns: {
          action: string
          actor_id: string
          actor_nickname: string
          created_at: string
          id: string
          note: string
          original_body: string
          reason_code: string
          target_id: string
          target_type: string
        }[]
      }
      mod_get_content: {
        Args: {
          p_id: string
          p_type: Database["public"]["Enums"]["content_type"]
        }
        Returns: {
          author_deleted: boolean
          author_id: string
          author_status: Database["public"]["Enums"]["account_status"]
          body: string
          comment_count: number
          created_at: string
          deleted_at: string
          edited_at: string
          extra: Json
          hold_reason: string
          images: Json
          kind: string
          listing_id: string
          matched_term: string
          moderated_at: string
          moderated_by_nickname: string
          nickname: string
          open_report_count: number
          post_id: string
          post_number: number
          published_at: string
          reaction_count: number
          reject_reason: string
          status: Database["public"]["Enums"]["content_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["content_type"]
          title: string
        }[]
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
      mod_get_report_details: {
        Args: {
          p_id: string
          p_type: Database["public"]["Enums"]["content_type"]
        }
        Returns: {
          created_at: string
          handled_at: string
          handled_by_nickname: string
          note: string
          reason: string
          report_id: string
          reporter_id: string
          reporter_nickname: string
          status: string
        }[]
      }
      mod_get_reports: {
        Args: { p_after_id?: string; p_after_ts?: string; p_limit?: number }
        Returns: {
          author_id: string
          avatar_key: string
          body: string
          content_status: Database["public"]["Enums"]["content_status"]
          first_reported_at: string
          images: Json
          last_reported_at: string
          nickname: string
          reasons: string[]
          report_count: number
          target_id: string
          target_type: Database["public"]["Enums"]["content_type"]
          title: string
        }[]
      }
      mod_list_content: {
        Args: {
          p_after_id?: string
          p_after_ts?: string
          p_author?: string
          p_limit?: number
          p_search?: string
          p_status?: Database["public"]["Enums"]["content_status"]
          p_type?: Database["public"]["Enums"]["content_type"]
        }
        Returns: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string
          images: Json
          nickname: string
          post_number: number
          status: Database["public"]["Enums"]["content_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["content_type"]
          title: string
        }[]
      }
      mod_remove_avatar: {
        Args: { p_reason?: string; p_user: string }
        Returns: undefined
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
      mod_search_users: {
        Args: {
          p_after_id?: string
          p_after_ts?: string
          p_include_deleted?: boolean
          p_limit?: number
          p_role?: Database["public"]["Enums"]["app_role"]
          p_search?: string
          p_status?: Database["public"]["Enums"]["account_status"]
          p_user?: string
        }
        Returns: {
          avatar_key: string
          comment_count: number
          deleted: boolean
          joined_at: string
          listing_count: number
          nickname: string
          open_reports_against: number
          post_count: number
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["account_status"]
          status_reason: string
          suspended_until: string
          terms_accepted_at: string
          user_id: string
        }[]
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
      set_comment_reaction: {
        Args: {
          p_comment_id: string
          p_type: Database["public"]["Enums"]["reaction_type"]
        }
        Returns: undefined
      }
      set_listing_closed: {
        Args: { p_closed: boolean; p_listing_id: string }
        Returns: undefined
      }
      set_my_profile_details: {
        Args: {
          p_about: string
          p_college: string
          p_course: string
          p_hobbies: string
          p_show: boolean
          p_year_level: string
        }
        Returns: undefined
      }
      set_nickname: {
        Args: { p_accept_terms?: boolean; p_nickname: string }
        Returns: undefined
      }
      set_notification_prefs: {
        Args: {
          p_comments?: boolean
          p_reactions?: boolean
          p_replies?: boolean
        }
        Returns: undefined
      }
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
      content_type: "post" | "comment" | "listing" | "profile"
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
      content_type: ["post", "comment", "listing", "profile"],
      listing_kind: ["sell", "lost_found"],
      post_kind: ["confession", "shoutout", "poll"],
      reaction_type: ["like", "love", "haha", "wow", "sad", "angry"],
    },
  },
} as const
