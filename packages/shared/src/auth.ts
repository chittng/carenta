import { z } from 'zod';

/** [Đề xuất] Technical cap only (hashing very long input is costly); no strength rules. */
export const PASSWORD_MAX_LENGTH = 128;

/** Emails are matched case-insensitively: trimmed and lowercased before anything else. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Email không hợp lệ.' }).max(254, { error: 'Email quá dài.' }));

/** No strength rules (decided 2026-11-13): anything non-empty up to the technical cap. */
export const passwordSchema = z
  .string()
  .min(1, { error: 'Vui lòng nhập mật khẩu.' })
  .max(PASSWORD_MAX_LENGTH, { error: `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự.` });

export const fullNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Vui lòng nhập họ tên.' })
  .max(100, { error: 'Họ tên tối đa 100 ký tự.' });

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: fullNameSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

/** Token from the link in a verification or password reset email. */
const linkTokenSchema = z.string().min(1).max(200);

export const verifyEmailSchema = z.object({ token: linkTokenSchema });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: linkTokenSchema,
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
});

export const userRoleSchema = z.enum(['USER', 'ADMIN']);

/** The signed-in user as returned by the auth endpoints. */
export const authUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  fullName: z.string(),
  role: userRoleSchema,
  emailVerified: z.boolean(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
