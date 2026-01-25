// Database types voor HUB3

export type UserRole = "studio_admin" | "user" | "super_admin" | "teacher";

export type ProgramType = "group" | "workshop";

export type ProgramLevel =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "all_levels";

export type InschrijvingStatus =
  | "actief"
  | "geannuleerd"
  | "voltooid"
  | "waitlisted"
  | "waitlist_accepted";

export type AttendanceStatus = "present" | "absent" | "excused" | "late";

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
  naam: string;
  beschrijving?: string | null;
  adres?: string | null;
  stad?: string | null;
  postcode?: string | null;
  location?: string;
  contact_email?: string;
  phone_number?: string;
  website?: string | null;
  eigenaar_id: string;
  is_public?: boolean;
  created_at: string;
  updated_at: string;
  features?: any;
  // Whether this studio allows visitors/users to see program capacity
  show_capacity_to_users?: boolean;
  // Whether this studio uses the attendance tracking feature
  attendance_enabled?: boolean;
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
  profile_completed?: boolean;
  updated_at?: string;
}

export interface Location {
  id: string;
  studio_id: string;
  name: string;
  city?: string;
  adres?: string; // volledige adres (straat + huisnummer etc.)
  created_at: string;
  updated_at: string;
}

export interface Program {
  id: string;
  studio_id: string;
  school_year_id?: string;
  program_type: ProgramType;
  title: string;
  description?: string;
  dance_style?: string;
  level?: ProgramLevel;
  capacity?: number;
  price?: number;
  // Optional schedule fields added to programs (backfilled from group_details)
  weekday?: number;
  start_time?: string; // HH:MM:SS or HH:MM
  end_time?: string;
  season_start?: string;
  season_end?: string;
  min_age?: number;
  max_age?: number;
  is_public: boolean;
  accepts_payment?: boolean; // FALSE = gratis (free enrollment), TRUE = paid (Stripe checkout required)
  linked_form_id?: string; // Optional reference to enrollment form
  // Whether this program shows capacity to visitors/users (per-program setting)
  show_capacity_to_users?: boolean;
  // Digital waitlist toggle (only meaningful when capacity is set)
  waitlist_enabled?: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroupDetails {
  id: string;
  program_id: string;
  weekday: number; // 0 = Sunday, 1 = Monday, etc.
  start_time: string; // HH:MM format
  end_time: string; // HH:MM format
  season_start?: string; // ISO date
  season_end?: string; // ISO date
  created_at: string;
}

export interface WorkshopDetails {
  id: string;
  program_id: string;
  start_datetime: string; // ISO datetime
  end_datetime: string; // ISO datetime
  created_at: string;
}

export interface ProgramLocation {
  id: string;
  program_id: string;
  location_id: string;
  created_at: string;
}

export interface Lesson {
  id: string;
  program_id: string;
  school_year_id?: string;
  location_id?: string;
  // Optional assigned teacher for this lesson (studio admin can set)
  teacher_id?: string | null;
  title: string;
  description?: string;
  date: string; // ISO date format
  time: string; // HH:MM format
  duration_minutes?: number;
  created_at: string;
  updated_at: string;
}

export interface Inschrijving {
  id: string;
  user_id: string;
  program_id: string;
  school_year_id?: string;
  status: InschrijvingStatus;
  inschrijving_datum: string;
  opmerking?: string;
  agreed_to_studio_policies?: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudioSchoolYear {
  id: string;
  studio_id: string;
  label: string;
  starts_on: string; // ISO date
  ends_on: string; // ISO date
  is_active: boolean;
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
  // snapshot of the user profile copied at enrollment time (JSONB)
  profile_snapshot?: any;
}

// Teacher-related types
export interface TeacherProgram {
  id: string;
  teacher_id: string;
  program_id: string;
  studio_id: string;
  assigned_at: string;
  assigned_by?: string;
}

// Attendance tracking types
export interface LessonAttendance {
  id: string;
  lesson_id: string;
  user_id: string;
  program_id: string;
  status: AttendanceStatus;
  marked_by?: string;
  marked_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface LessonAttendanceWithDetails extends LessonAttendance {
  user?: User | UserProfile;
  lesson?: Lesson;
  program?: Program;
  marked_by_user?: User;
}

export interface PendingTeacherInvitation {
  id: string;
  email: string;
  studio_id: string;
  invited_at: string;
  invited_by?: string;
  status?: "pending" | "accepted" | "declined";
  notification_id?: string;
  responded_at?: string;
  // Augmented client-only properties
  has_account?: boolean;
  account_user_id?: string | null;
  // When a notification was created for this invitation (notification.created_at)
  sent_at?: string | null;
}

export type NotificationType =
  | "teacher_invitation"
  | "info"
  | "warning"
  | "announcement"
  | "ampro_note"
  | "ampro_correction"
  | "ampro_availability";

export interface Notification {
  id: string;
  user_id: string;
  scope?: string;
  type: NotificationType;
  title: string;
  message: string;
  action_type?: string;
  action_data?: any;
  read: boolean;
  created_at: string;
  expires_at?: string;
}

export interface StudioTeacher {
  id: string;
  user_id: string;
  studio_id: string;
  added_at: string;
  added_by?: string;
}

export interface StudioAdminProfile {
  user_id: string;
  studio_id: string;
  first_name?: string | null;
  last_name?: string | null;
  date_of_birth?: string | null;
  email?: string | null;
  phone_number?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  created_at?: string;
  updated_at?: string;
}
