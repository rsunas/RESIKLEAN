import { requestJson } from '@/lib/network-request';

type VerificationPath = 'verify-email' | 'resend-verification';

/**
 * Activates accounts created from the administrator dashboard. Resident signup
 * does not use this flow.
 */
export async function emailVerificationRequest(path: VerificationPath, body: Record<string, string>) {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (!apiUrl) throw new Error('Email verification is currently unavailable.');

  const { response, payload } = await requestJson<{
    success: boolean;
    error?: string;
    errors?: unknown[];
    data?: { message?: string };
  }>(`${apiUrl}/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 45000);

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || (payload.errors
      ? 'Please check the email address or verification code.'
      : 'Unable to complete email verification. Please try again.'));
  }

  return payload.data?.message || '';
}
