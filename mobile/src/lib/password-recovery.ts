import { requestJson } from '@/lib/network-request';

export async function passwordRecoveryRequest(path: 'forgot-password' | 'reset-password', body: Record<string, string>) {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (!apiUrl) throw new Error('Password recovery is currently unavailable.');
  const { response, payload } = await requestJson<{
    success: boolean; error?: string; errors?: unknown[]; data?: { message?: string };
  }>(`${apiUrl}/auth/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, 45000);
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || (payload.errors ? 'Please check your email, reset code, and password.' : 'Unable to complete the request. Please try again.'));
  }
  return payload.data?.message || '';
}
