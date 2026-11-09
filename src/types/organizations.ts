// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/types/organizations.ts

export type OrgRole = 'admin' | 'member' | 'guest';
export type CognitiveCapacity = 'normal' | 'reduced' | 'depleted';
export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'canceled';
export type MeetingReviewStatus = 'draft' | 'under_review' | 'published';
export type ReviewDecision = 'approved' | 'rejected' | 'changes_requested';

export interface AgendaItem {
  id: string;
  title: string;
  completed: boolean;
  converted_task_id?: string | null;
  attached_note_path?: string | null;
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  avatar_url?: string | null;
  primary_color: string;
  secondary_color: string;
  storage_quota_bytes: number;
  storage_used_bytes: number;
  storage_boost_bytes?: number | null;
  storage_boost_until?: string | null;
  storage_policy: 'admin_or_permitted' | 'open_to_members';
  created_at: string;
  updated_at: string;
}

export interface OrganizationSubteam {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  color: string;
  created_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id?: string | null;
  full_name: string;
  email?: string | null;
  avatar_url?: string | null;
  org_role: OrgRole;
  subteam_id?: string | null;
  subteam?: OrganizationSubteam | null;
  can_upload_org_vault: boolean;
  cognitive_capacity: CognitiveCapacity;
  capacity_note?: string | null;
  capacity_until?: string | null;
  is_placeholder: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationInvite {
  id: string;
  organization_id: string;
  token: string;
  created_by?: string | null;
  target_email?: string | null;
  target_name?: string | null;
  assigned_role: OrgRole;
  assigned_subteam_id?: string | null;
  placeholder_member_id?: string | null;
  expires_at: string;
  accepted_at?: string | null;
  accepted_by?: string | null;
  created_at: string;
  organization?: Organization;
}

export interface OrganizationTaskTemplate {
  id: string;
  organization_id: string;
  title: string;
  description?: string | null;
  subteam_id?: string | null;
  checklist_items: Array<{ text: string; done?: boolean }>;
  created_at: string;
}

export interface OrganizationMeeting {
  id: string;
  organization_id: string;
  organization?: Organization;
  title: string;
  description?: string | null;
  scheduled_at?: string | null;
  duration_minutes: number;
  meet_url?: string | null;
  status: MeetingStatus;
  review_status: MeetingReviewStatus;
  reviewer_user_id?: string | null;
  live_notes_markdown: string;
  process_notes_markdown: string;
  published_ata_markdown: string;
  published_at?: string | null;
  transcription_raw_text: string;
  transcription_summary: Record<string, unknown>;
  action_items: Array<{
    title: string;
    assignee_name?: string;
    assignee_user_id?: string;
    prazo?: string;
    subteam_id?: string;
  }>;
  agenda_items?: AgendaItem[];
  subteam_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMeetingAvailability {
  id: string;
  meeting_id: string;
  user_id: string;
  slot_start: string;
  slot_end: string;
  is_available: boolean;
  created_at: string;
}

export interface OrganizationMeetingPersonalNote {
  id: string;
  meeting_id: string;
  user_id: string;
  notes_markdown: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMeetingReview {
  id: string;
  meeting_id: string;
  reviewer_user_id: string;
  decision: ReviewDecision;
  feedback_markdown?: string | null;
  created_at: string;
}
