import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'resiklean.session';

export type AccountUser = {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: 'resident' | 'collector' | 'staff' | 'admin';
  barangay?: string;
};

export type AuthSession = {
  token: string;
  user: AccountUser;
};

export async function saveSession(session: AuthSession) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function getSession(): Promise<AuthSession | null> {
  const savedSession = await SecureStore.getItemAsync(SESSION_KEY);
  if (!savedSession) return null;

  try {
    return JSON.parse(savedSession) as AuthSession;
  } catch {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return null;
  }
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
