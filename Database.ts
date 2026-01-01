// Database types voor Flow Manager

export type UserRole = "studio_admin" | "user" | "super_admin";

export type ProgramType = "group" | "workshop" | "trial_classes";

export type InschrijvingStatus = "actief" | "geannuleerd" | "voltooid";

export type ApplicationStatus =
  | "pending"
  | "approved"
  | "approved_pending_payment"
  | "waitlisted"
  | "rejected"
  | "cancelled";

export type PaymentStatus =
  | "pending"
  | "pending_manual"
  | "completed"
  | "failed"
  | "refunded";

export type ApplicantType = "self" | "dependent";

export type Level = "beginner" | "intermediate" | "advanced" | "all_levels";

export interface User {
  id: string;
  email: string;
  naam: string;
  role: UserRole;
  phone_number?: string;
  created_at: string;
  updated_at: string;
}

export interface Studio {
  id: string;
  name: string;
  slug: string;
  location?: string | null;
  region?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  logo_url?: string | null;
  website_url?: string | null;
  is_public: boolean;
  eigenaar_id?: string;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  user_id: string;
  first_name?: string | null;
  last_name?: string | null;
  street?: string | null;
  house_number?: string | null;
  house_number_addition?: string | null;
  postal_code?: string | null;
  city?: string | null;
  phone_number?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  address?: string | null;
  profile_completed?: boolean;
  updated_at?: string;
}

export interface SubProfile {
  id: string;
  parent_user_id: string;
  first_name?: string | null;
  last_name?: string | null;
  date_of_birth?: string | null;
  relationship?: string | null;
  phone_number?: string | null;
  email?: string | null;
  address?: string | null;
  street?: string | null;
  house_number?: string | null;
  house_number_addition?: string | null;
  city?: string | null;
  postal_code?: string | null;
  name?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Teacher {
  id: string;
  studio_id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  bio?: string | null;
  photo_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Program {
  id: string;
  studio_id: string;
  title: string;
  description?: string | null;
  dance_style?: string | null;
  program_type: ProgramType;
  linked_group_id?: string | null;
  linked_form_id?: string | null;
  teacher_id?: string | null;
  level?: Level | null;
  price?: number | null;
  capacity?: number | null;
  min_age?: number | null;
  max_age?: number | null;
  age_class?: string | null;
  requires_payment: boolean;
  payment_amount?: number | null;
  payment_currency: string;
  payment_upon_arrival: boolean;
  show_capacity_to_members: boolean;
  accepts_class_passes: boolean;
  manual_full_override: boolean;
  waitlist_enabled?: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  teacher?: Teacher | null;
  group_details?: GroupDetail[];
  workshop_details?: WorkshopDetail[];
}

export interface GroupDetail {
  id: string;
  program_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  season_start: string;
  season_end: string;
  created_at: string;
  updated_at: string;
}

export interface WorkshopDetail {
  id: string;
  program_id: string;
  date: string;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  user_id?: string | null;
  parent_user_id?: string | null;
  sub_profile_id?: string | null;
  studio_id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone_number?: string | null;
  date_of_birth?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  is_dependent: boolean;
  photo_video_consent: boolean;
  photo_video_consent_timestamp?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  program_id: string;
  studio_id: string;
  member_id: string;
  user_id: string;
  applicant_type: ApplicantType;
  sub_profile_id?: string | null;
  status: ApplicationStatus;
  payment_status: PaymentStatus;
  form_data?: Record<string, any> | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudioMembership {
  id: string;
  user_id: string;
  studio_id: string;
  membership_status: "active" | "inactive";
  role: string[];
  created_at: string;
  updated_at: string;
}

export interface ClassPassProduct {
  id: string;
  studio_id: string;
  name: string;
  description?: string | null;
  credit_count: number;
  price: number;
  currency: string;
  expiration_months?: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClassPassProduct {
  id: string;
  studio_id: string;
  name: string;
  description?: string | null;
  credit_count: number;
  price: number;
  currency: string;
  expiration_months?: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: string;
  program_id: string;
  naam: string;
  beschrijving?: string;
  datum?: string;
  tijd?: string;
  duur?: number;
  locatie?: string;
  created_at: string;
  updated_at: string;
}

export interface Inschrijving {
  id: string;
  user_id: string;
  program_id: string;
  status: InschrijvingStatus;
  inschrijving_datum: string;
  opmerking?: string;
  created_at: string;
  updated_at: string;
}

export interface Form {
  id: string;
  studio_id: string;
  title: string;
  description?: string | null;
  fields_json: any;
  created_at: string;
  updated_at: string;
}

// Extended types met relaties
export interface StudioWithPrograms extends Studio {
  programs?: Program[];
}

export interface ProgramWithLessons extends Program {
  lessons?: Lesson[];
  studio?: Studio;
}

export interface InschrijvingWithDetails extends Inschrijving {
  program?: Program;
  user?: User;
}
