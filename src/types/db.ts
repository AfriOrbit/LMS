/**
 * Application-level types mirroring the SQL schema.
 *
 * These are hand-maintained rather than generated so the repository builds
 * without a live database. Once you have the Supabase CLI linked, prefer:
 *   npx supabase gen types typescript --linked > src/types/database.generated.ts
 * and re-export from here.
 */

export type AppRole = 'learner' | 'instructor' | 'admin';
export type AccountStatus = 'pending' | 'active' | 'suspended' | 'rejected';
export type CourseStatus = 'draft' | 'published' | 'archived';
export type CourseLevel = 'foundation' | 'intermediate' | 'advanced';
export type LessonKind =
  | 'reading'
  | 'video'
  | 'lab'
  | 'quiz'
  | 'simulation'
  | 'download';
export type EnrollmentStatus = 'active' | 'completed' | 'withdrawn' | 'expired';
export type QuestionKind =
  | 'single_choice'
  | 'multi_choice'
  | 'true_false'
  | 'numeric'
  | 'short_text';
export type AttemptStatus = 'in_progress' | 'submitted' | 'graded' | 'abandoned';
export type SubmissionStatus = 'draft' | 'submitted' | 'returned' | 'graded';
export type KitStatus = 'available' | 'assigned' | 'maintenance' | 'retired';
export type OrderStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  status: AccountStatus;
  organization: string | null;
  country: string | null;
  job_title: string | null;
  technical_level: CourseLevel;
  bio: string | null;
  avatar_url: string | null;
  mfa_enabled: boolean;
  mfa_enforced_at: string | null;
  recovery_codes: string[];
  recovery_codes_generated_at: string | null;
  accepted_terms_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Track {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  level: CourseLevel;
  hero_image_url: string | null;
  sort_order: number;
  is_published: boolean;
}

export interface Course {
  id: string;
  track_id: string | null;
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  description: string;
  level: CourseLevel;
  status: CourseStatus;
  tags: string[];
  prerequisites: string[];
  outcomes: string[];
  estimated_minutes: number;
  requires_hardware: boolean;
  hardware_notes: string | null;
  price_cents: number;
  currency: string;
  issues_certificate: boolean;
  pass_threshold: number;
  hero_image_url: string | null;
  sort_order: number;
  owner_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Module {
  id: string;
  course_id: string;
  slug: string;
  title: string;
  summary: string;
  sort_order: number;
}

export interface Lesson {
  id: string;
  module_id: string;
  course_id: string;
  slug: string;
  title: string;
  kind: LessonKind;
  content_md: string | null;
  video_url: string | null;
  attachment_urls: string[];
  is_preview: boolean;
  estimated_minutes: number;
  sort_order: number;
  simulation_key: string | null;
  entitled?: boolean;
}

export interface Enrollment {
  id: string;
  user_id: string;
  course_id: string;
  cohort_id: string | null;
  status: EnrollmentStatus;
  source: string;
  progress_pct: number;
  started_at: string;
  completed_at: string | null;
  expires_at: string | null;
}

export interface LessonProgress {
  id: string;
  user_id: string;
  lesson_id: string;
  course_id: string;
  completed: boolean;
  seconds_spent: number;
  last_position: string | null;
  completed_at: string | null;
}

export interface Quiz {
  id: string;
  course_id: string;
  lesson_id: string | null;
  slug: string;
  title: string;
  instructions: string;
  is_graded: boolean;
  pass_threshold: number;
  time_limit_minutes: number | null;
  max_attempts: number;
  questions_per_attempt: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  reveal_feedback: boolean;
}

export interface QuizOption {
  id: string;
  text: string;
}

/** The learner-visible projection. Never carries `answer_key`. */
export interface QuizQuestionPublic {
  id: string;
  quiz_id: string;
  kind: QuestionKind;
  prompt_md: string;
  options: QuizOption[];
  points: number;
  sort_order: number;
}

export interface AttemptBreakdownItem {
  question_id: string;
  correct: boolean;
  points: number;
  explanation_md: string;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  user_id: string;
  course_id: string;
  attempt_no: number;
  status: AttemptStatus;
  question_ids: string[];
  responses: Record<string, unknown>;
  breakdown: AttemptBreakdownItem[];
  score_pct: number | null;
  points_earned: number | null;
  points_possible: number | null;
  passed: boolean | null;
  started_at: string;
  expires_at: string | null;
  submitted_at: string | null;
}

export interface Certificate {
  id: string;
  user_id: string;
  course_id: string;
  code: string;
  recipient_name: string;
  course_title: string;
  final_score_pct: number | null;
  hours: number | null;
  issued_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  integrity_hash: string;
}

export interface Cohort {
  id: string;
  course_id: string;
  slug: string;
  name: string;
  delivery_mode: 'online' | 'in_person' | 'hybrid';
  location: string | null;
  timezone: string;
  starts_on: string;
  ends_on: string;
  capacity: number;
  seats_taken: number;
  lead_instructor_id: string | null;
  notes: string | null;
  is_published: boolean;
}

export interface HardwareKit {
  id: string;
  asset_tag: string;
  kit_type: string;
  spec: Record<string, unknown>;
  firmware_version: string | null;
  status: KitStatus;
  location: string | null;
  condition_notes: string | null;
  last_serviced_on: string | null;
}

export interface LabSession {
  id: string;
  cohort_id: string;
  course_id: string;
  lesson_id: string | null;
  title: string;
  objective: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  location: string | null;
  meeting_url: string | null;
  ground_station: string | null;
  norad_id: number | null;
  tle_line1: string | null;
  tle_line2: string | null;
  instructor_id: string | null;
  safety_brief_md: string;
  is_published: boolean;
}

export interface LabBooking {
  id: string;
  session_id: string;
  user_id: string;
  status: 'booked' | 'attended' | 'no_show' | 'cancelled';
  booked_at: string;
}

export interface RubricCriterion {
  criterion: string;
  weight: number;
  descriptor: string;
}

export interface DataField {
  key: string;
  label: string;
  type: 'number' | 'text';
}

export interface LabAssignment {
  id: string;
  course_id: string;
  lesson_id: string | null;
  slug: string;
  title: string;
  brief_md: string;
  rubric: RubricCriterion[];
  data_schema: DataField[];
  max_points: number;
  pass_threshold: number;
  allow_resubmit: boolean;
  due_offset_days: number | null;
}

export interface LabReport {
  id: string;
  assignment_id: string;
  user_id: string;
  course_id: string;
  cohort_id: string | null;
  kit_id: string | null;
  status: SubmissionStatus;
  narrative_md: string;
  data: Record<string, string | number>;
  attachment_paths: string[];
  submitted_at: string | null;
  grader_id: string | null;
  points_awarded: number | null;
  rubric_scores: { criterion: string; score: number; note?: string }[];
  feedback_md: string;
  graded_at: string | null;
  passed: boolean | null;
}

export interface AuditEntry {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
