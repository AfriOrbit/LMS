import { z } from 'zod';

/**
 * Every value that crosses a trust boundary is parsed here before it reaches
 * a database call. Server actions and route handlers must not read raw
 * FormData fields directly.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email('Enter a valid email address');

/**
 * Password policy. Length does most of the work; the character-class rule
 * exists because Supabase is configured to enforce it server-side too, and a
 * mismatch between the two produces confusing errors.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(128, 'Maximum 128 characters')
  .refine((v) => /[a-z]/.test(v), 'Include a lowercase letter')
  .refine((v) => /[A-Z]/.test(v), 'Include an uppercase letter')
  .refine((v) => /[0-9]/.test(v), 'Include a digit')
  .refine((v) => /[^A-Za-z0-9]/.test(v), 'Include a symbol');

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  email: emailSchema,
  password: passwordSchema,
  organization: z.string().trim().max(160).optional().or(z.literal('')),
  country: z.string().trim().max(80).optional().or(z.literal('')),
  jobTitle: z.string().trim().max(120).optional().or(z.literal('')),
  technicalLevel: z.enum(['foundation', 'intermediate', 'advanced']),
  acceptTerms: z.literal(true, {
    message: 'You must accept the terms to register',
  }),
  inviteCode: z.string().trim().max(64).optional().or(z.literal('')),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
  next: z.string().max(512).optional(),
});

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app');

export const recoveryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/, 'Enter a recovery code');

export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  organization: z.string().trim().max(160).optional().or(z.literal('')),
  country: z.string().trim().max(80).optional().or(z.literal('')),
  jobTitle: z.string().trim().max(120).optional().or(z.literal('')),
  technicalLevel: z.enum(['foundation', 'intermediate', 'advanced']),
  bio: z.string().trim().max(1000).optional().or(z.literal('')),
});

export const uuidSchema = z.string().uuid();
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/, 'Invalid identifier');

export const quizSubmissionSchema = z.object({
  attemptId: uuidSchema,
  responses: z.record(
    uuidSchema,
    z.union([z.string().max(2000), z.array(z.string().max(120)).max(20)]),
  ),
});

export const lessonProgressSchema = z.object({
  lessonId: uuidSchema,
  completed: z.boolean(),
  secondsSpent: z.number().int().min(0).max(86_400).optional(),
});

export const labReportSchema = z.object({
  assignmentId: uuidSchema,
  narrative: z.string().max(50_000),
  data: z.record(z.string().max(60), z.union([z.string().max(500), z.number()])),
  kitId: uuidSchema.optional().nullable(),
  submit: z.boolean().default(false),
});

export const gradeLabReportSchema = z.object({
  reportId: uuidSchema,
  pointsAwarded: z.number().min(0).max(1000),
  rubricScores: z
    .array(
      z.object({
        criterion: z.string().max(200),
        score: z.number().min(0).max(100),
        note: z.string().max(2000).optional(),
      }),
    )
    .max(20),
  feedback: z.string().max(20_000),
  passed: z.boolean(),
  returnForRevision: z.boolean().default(false),
});

export const certificateCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^AO-\d{4}-[A-Z0-9]{8}$/, 'Certificate codes look like AO-2026-7Q4KX2M9');

export const courseUpsertSchema = z.object({
  id: uuidSchema.optional(),
  slug: slugSchema,
  title: z.string().trim().min(3).max(200),
  subtitle: z.string().trim().max(240).default(''),
  summary: z.string().trim().max(1000).default(''),
  description: z.string().trim().max(20_000).default(''),
  level: z.enum(['foundation', 'intermediate', 'advanced']),
  status: z.enum(['draft', 'published', 'archived']),
  tags: z.array(z.string().max(40)).max(20).default([]),
  prerequisites: z.array(z.string().max(200)).max(20).default([]),
  outcomes: z.array(z.string().max(300)).max(20).default([]),
  estimatedMinutes: z.number().int().min(0).max(100_000).default(0),
  requiresHardware: z.boolean().default(false),
  hardwareNotes: z.string().max(2000).optional().or(z.literal('')),
  priceCents: z.number().int().min(0).max(10_000_00).default(0),
  issuesCertificate: z.boolean().default(true),
  passThreshold: z.number().int().min(0).max(100).default(70),
});

export const lessonUpsertSchema = z.object({
  id: uuidSchema.optional(),
  moduleId: uuidSchema,
  slug: slugSchema,
  title: z.string().trim().min(2).max(200),
  kind: z.enum(['reading', 'video', 'lab', 'quiz', 'simulation', 'download']),
  contentMd: z.string().max(200_000).default(''),
  videoUrl: z.string().url().max(2000).optional().or(z.literal('')),
  isPreview: z.boolean().default(false),
  estimatedMinutes: z.number().int().min(0).max(1000).default(10),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  simulationKey: z.string().max(60).optional().or(z.literal('')),
});

export const invitationSchema = z.object({
  email: emailSchema.optional().or(z.literal('')),
  courseId: uuidSchema.optional().nullable(),
  cohortId: uuidSchema.optional().nullable(),
  grantsRole: z.enum(['learner', 'instructor']).default('learner'),
  autoApprove: z.boolean().default(true),
  maxUses: z.number().int().min(1).max(500).default(1),
  expiresInDays: z.number().int().min(1).max(365).default(30),
});

export const telemetryCaptureSchema = z.object({
  rawHex: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]*$/, 'Hex digits only')
    .max(8192),
  decoded: z.record(z.string(), z.unknown()).default({}),
  rssiDbm: z.number().min(-200).max(50).optional(),
  snrDb: z.number().min(-50).max(50).optional(),
  frameValid: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});

/** Flatten a ZodError into a field → message map for form rendering. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
