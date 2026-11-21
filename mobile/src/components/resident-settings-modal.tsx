import { ResidentAvatar } from './resident-avatar';
/**
 * ResidentSettingsModal
 *
 * Full-screen settings sheet for the Resident role.
 *
 * Sections:
 *   1. Account (avatar, email, auth provider badge)
 *   2. Appearance  – theme selector (Light / Dark)
 *   3. Language    – English / Filipino
 *   4. Notifications – individual toggles + master push
 *   5. Security    – Change Password (modal-in-modal)
 *   6. Info & Support – SWMO hotlines, waste guide cards, FAQs, app version
 *   7. Danger zone – Delete Account
 *
 * All API mutations are sent via PATCH /api/auth/settings (partial) and
 * PATCH /api/auth/change-password and DELETE /api/auth/account.
 */

import { Feather, MaterialCommunityIcons } from 'expo/node_modules/@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Tabs } from 'heroui-native';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/app-text';
import { MotionModal as Modal, MotionPressable as Pressable, AccordionBody, MotionChevron } from '@/components/app-motion';
import type { AuthSession } from '@/lib/session';
import { setCollectionReminderPreference } from '@/lib/notifications';
import { useAppPreferences, useAppTheme } from '@/hooks/app-preferences';

// ─── Types ───────────────────────────────────────────────────────────────────

type Theme = 'light' | 'dark';
type Language = 'en' | 'fil';

type NotificationSettings = {
  pushEnabled: boolean;
  collectionReminders: boolean;
  scheduleUpdates: boolean;
  announcements: boolean;
  reminderMinutesBefore?: number;
};

type UserSettings = {
  theme: Theme;
  language: Language;
  notifications: NotificationSettings;
};

type UserSettingsPatch = {
  theme?: Theme;
  language?: Language;
  notifications?: Partial<NotificationSettings>;
};

type AppInfo = {
  hotlines: Array<{ label: string; number: string }>;
  email?: string;
  address?: string;
  wasteGuide: Array<{ category: string; color: string; accentColor: string; items: string[] }>;
  faqs: Array<{ question?: string; answer?: string; q?: string; a?: string }>;
  appVersion?: string;
};

type ApiResponse<T> = { success: boolean; data?: T; error?: string };

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  session: AuthSession;
  apiUrl: string;
  onClose: () => void;
  onSignOut: () => void;
  onSessionUpdate: (session: AuthSession) => void;
}

// ─── Default values ───────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'light',
  language: 'en',
  notifications: {
    pushEnabled: true,
    collectionReminders: true,
    scheduleUpdates: true,
    announcements: true,
    reminderMinutesBefore: 60,
  },
};

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return <Text style={ss.sectionHeader}>{label}</Text>;
}

// ─── Setting Row ──────────────────────────────────────────────────────────────

function SettingRow({
  icon,
  iconBg,
  iconColor,
  label,
  sublabel,
  right,
  onPress,
  isLast,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'none'}
      disabled={!onPress}
      onPress={onPress}
      style={[ss.settingRow, !isLast && ss.settingRowBorder]}
    >
      <View style={[ss.settingIcon, { backgroundColor: iconBg }]}>
        <Feather color={iconColor} name={icon as 'settings'} size={16} />
      </View>
      <View style={ss.settingLabel}>
        <Text style={ss.settingText}>{label}</Text>
        {sublabel ? <Text style={ss.settingSubtext}>{sublabel}</Text> : null}
      </View>
      {right ?? (onPress ? <Feather color="#c0ccc5" name="chevron-right" size={18} /> : null)}
    </Pressable>
  );
}

// ─── Theme Pill Selector ───────────────────────────────────────────────────────

// Installed free HeroUI 1.0.8 compound Tabs; explicit native styles avoid
// relying on className compilation for the rounded highlight.
function PreferenceTabs({ value, onChange, options }: {
  value: string;
  onChange: (value: string) => void;
  options: { key: string; label: string; icon?: 'sun' | 'moon' | 'smartphone'; flag?: string }[];
}) {
  return (
    <Tabs value={value} onValueChange={onChange} animation="disable-all">
      <Tabs.List style={ss.pillRow}>
        <Tabs.Indicator style={ss.pillIndicator} />
        {options.map((option) => (
          <Tabs.Trigger key={option.key} value={option.key} style={ss.pill}>
            {option.icon ? <Feather accessible={false} name={option.icon} size={14} color={value === option.key ? '#086B42' : '#5A6761'} /> : null}
            {option.flag ? <Text style={ss.pillFlag}>{option.flag}</Text> : null}
            <Tabs.Label numberOfLines={1} adjustsFontSizeToFit style={[ss.pillText, value === option.key && ss.pillTextActive]}>{option.label}</Tabs.Label>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs>
  );
}

function ThemePills({ value, onChange }: { value: Theme; onChange: (theme: Theme) => void }) {
  return <PreferenceTabs value={value} onChange={(next) => onChange(next as Theme)} options={[
    { key: 'light', label: 'Light', icon: 'sun' },
    { key: 'dark', label: 'Dark', icon: 'moon' },
  ]} />;
}

function LanguageSelector({ value, onChange }: { value: Language; onChange: (language: Language) => void }) {
  return <PreferenceTabs value={value} onChange={(next) => onChange(next as Language)} options={[
    { key: 'en', label: 'English', flag: '🇵🇭' },
    { key: 'fil', label: 'Filipino', flag: '🇵🇭' },
  ]} />;
}

function WasteGuideCard({
  category,
  color,
  accentColor,
  items,
}: {
  category: string;
  color: string;
  accentColor: string;
  items: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const categoryColor = ({ Biodegradable: '#0A7F4F', 'Non-Biodegradable': '#1A56C4', Recyclables: '#B45309', Hazardous: '#B3261E' } as Record<string, string>)[category] || color;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => setExpanded((e) => !e)}
      accessibilityState={{ expanded }}
      style={ss.wasteCard}
    >
      <View style={ss.wasteCardHeader}>
        <View style={[ss.wasteDot, { backgroundColor: categoryColor }]} />
        <Text style={[ss.wasteCategory, { color: categoryColor }]}>{category}</Text>
        <MotionChevron expanded={expanded}><Feather color={color} name="chevron-down" size={15} /></MotionChevron>
      </View>
      <AccordionBody expanded={expanded}>
        <View style={ss.wasteItems}>
          {items.map((item) => (
            <View key={item} style={ss.wasteItemRow}>
              <View style={[ss.wasteItemDot, { backgroundColor: accentColor }]} />
              <Text style={ss.wasteItemText}>{item}</Text>
            </View>
          ))}
        </View>
      </AccordionBody>
    </Pressable>
  );
}

// ─── FAQ Item ─────────────────────────────────────────────────────────────────

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    setOpen(!open);
  };

  return (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={toggle} style={ss.faqItem}>
      <View style={ss.faqHeader}>
        <Text style={ss.faqQuestion}>{question}</Text>
        <MotionChevron expanded={open}><Feather color="#07815f" name={open ? 'minus' : 'plus'} size={15} /></MotionChevron>
      </View>
      <AccordionBody expanded={open}><Text style={ss.faqAnswer}>{answer}</Text></AccordionBody>
    </Pressable>
  );
}

// ─── Change Password Modal ────────────────────────────────────────────────────

export function ChangePasswordModal({
  visible,
  apiUrl,
  token,
  isPasswordSet,
  onClose,
}: {
  visible: boolean;
  apiUrl: string;
  token: string;
  isPasswordSet: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
  };

  const handleClose = () => {
    if (loading) return;
    const discard = () => { reset(); onClose(); };
    if (currentPassword || newPassword || confirmPassword) Alert.alert('Discard password changes?', 'Your unsaved password will be cleared.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: discard }]);
    else discard();
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    if (!newPassword) {
      setError('New password is required.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (isPasswordSet && !currentPassword) {
      setError('Current password is required.');
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, string> = { newPassword };
      if (isPasswordSet && currentPassword) body.currentPassword = currentPassword;

      const response = await fetch(`${apiUrl}/auth/change-password`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as ApiResponse<unknown>;
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to update password.');
      setSuccess('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal animationType="fade" onRequestClose={handleClose} transparent visible={visible}>
      <View style={ss.cpBackdrop}>
        <Pressable onPress={handleClose} style={StyleSheet.absoluteFill} />
        <View style={[ss.cpSheet, { paddingBottom: insets.bottom + 20 }]}>
          {/* Handle */}
          <View style={ss.cpHandle} />

          {/* Header */}
          <View style={ss.cpHeader}>
            <View style={ss.cpHeaderIcon}>
              <Feather color="#07815f" name="lock" size={18} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={ss.cpTitle}>{isPasswordSet ? 'Change Password' : 'Set a Password'}</Text>
              <Text style={ss.cpSubtitle}>
                {isPasswordSet ? 'Enter your current password then choose a new one.' : 'Add a password to your Google account.'}
              </Text>
            </View>
            <Pressable hitSlop={10} onPress={handleClose}>
              <Feather color="#8a9b92" name="x" size={20} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {isPasswordSet ? (
              <>
                <Text style={ss.cpLabel}>CURRENT PASSWORD</Text>
                <View style={ss.cpInputRow}>
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={setCurrentPassword}
                    placeholder="Current password"
                    placeholderTextColor="#9aa69f"
                    secureTextEntry={!showCurrent}
                    style={ss.cpInput}
                    value={currentPassword}
                  />
                  <Pressable hitSlop={10} onPress={() => setShowCurrent((v) => !v)} style={ss.cpEye}>
                    <Feather color="#8a9b92" name={showCurrent ? 'eye-off' : 'eye'} size={16} />
                  </Pressable>
                </View>
              </>
            ) : null}

            <Text style={ss.cpLabel}>NEW PASSWORD</Text>
            <View style={ss.cpInputRow}>
              <TextInput
                autoCapitalize="none"
                onChangeText={setNewPassword}
                placeholder="At least 6 characters"
                placeholderTextColor="#9aa69f"
                secureTextEntry={!showNew}
                style={ss.cpInput}
                value={newPassword}
              />
              <Pressable hitSlop={10} onPress={() => setShowNew((v) => !v)} style={ss.cpEye}>
                <Feather color="#8a9b92" name={showNew ? 'eye-off' : 'eye'} size={16} />
              </Pressable>
            </View>

            <Text style={ss.cpLabel}>CONFIRM NEW PASSWORD</Text>
            <View style={ss.cpInputRow}>
              <TextInput
                autoCapitalize="none"
                onChangeText={setConfirmPassword}
                placeholder="Repeat new password"
                placeholderTextColor="#9aa69f"
                secureTextEntry={!showConfirm}
                style={ss.cpInput}
                value={confirmPassword}
              />
              <Pressable hitSlop={10} onPress={() => setShowConfirm((v) => !v)} style={ss.cpEye}>
                <Feather color="#8a9b92" name={showConfirm ? 'eye-off' : 'eye'} size={16} />
              </Pressable>
            </View>

            {error ? <Text style={ss.cpError}>{error}</Text> : null}
            {success ? <Text style={ss.cpSuccess}>{success}</Text> : null}

            <Pressable
              accessibilityRole="button"
              disabled={loading}
              onPress={handleSubmit}
              style={[ss.cpSubmitButton, loading && ss.disabledButton]}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={ss.cpSubmitText}>{isPasswordSet ? 'Update Password' : 'Set Password'}</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ResidentSettingsModal({ visible, session, apiUrl, onClose, onSignOut, onSessionUpdate }: Props) {
  const { updatePreferences } = useAppPreferences();
  const appTheme = useAppTheme();
  const insets = useSafeAreaInsets();

  // ── Local state ───────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [authProvider, setAuthProvider] = useState<'local' | 'google'>('local');
  const [isPasswordSet, setIsPasswordSet] = useState(true);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const loadSettings = useCallback(async () => {
    if (!apiUrl || !session.token) return;
    setIsLoadingSettings(true);
    setSettingsError('');
    try {
      const response = await fetch(`${apiUrl}/auth/settings`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const result = (await response.json()) as ApiResponse<{
        settings: UserSettings;
        authProvider: string;
        isPasswordSet: boolean;
      }>;
      if (!response.ok || !result.success || !result.data) throw new Error(result.error || 'Unable to load settings.');
      const loadedSettings: UserSettings = { ...DEFAULT_SETTINGS, ...result.data.settings, theme: result.data.settings.theme === 'dark' ? 'dark' : 'light' };
      setSettings(loadedSettings);
      const ownerId = session.user._id || session.user.id || session.user.email;
      if (ownerId) await setCollectionReminderPreference(ownerId, loadedSettings.notifications.pushEnabled && loadedSettings.notifications.collectionReminders);
      updatePreferences({ theme: loadedSettings.theme, language: loadedSettings.language === 'fil' ? 'fil' : 'en' });
      setAuthProvider(result.data.authProvider === 'google' ? 'google' : 'local');
      setIsPasswordSet(result.data.isPasswordSet);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Unable to load settings.');
    } finally {
      setIsLoadingSettings(false);
    }
  }, [apiUrl, session.token, session.user, updatePreferences]);

  const loadAppInfo = useCallback(async () => {
    if (!apiUrl) return;
    try {
      const response = await fetch(`${apiUrl}/auth/app-info`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const result = (await response.json()) as ApiResponse<AppInfo>;
      if (response.ok && result.success && result.data) {
        setAppInfo(result.data);
      }
    } catch {
      // Non-critical; show static fallback instead
    }
  }, [apiUrl, session.token]);

  useEffect(() => {
    if (visible) {
      void loadSettings();
      void loadAppInfo();
    }
  }, [visible, loadSettings, loadAppInfo]);

  // ── Persist settings ───────────────────────────────────────────────────────

  const patchSettings = useCallback(
    async (patch: UserSettingsPatch) => {
      if (!apiUrl || !session.token) return;
      setIsSavingSettings(true);
      try {
        const response = await fetch(`${apiUrl}/auth/settings`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const result = (await response.json()) as ApiResponse<{ settings: UserSettings }>;
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save settings.');
        if (result.data?.settings) {
          const saved: UserSettings = { ...DEFAULT_SETTINGS, ...result.data.settings, theme: result.data.settings.theme === 'dark' ? 'dark' : 'light' };
          setSettings(saved);
          const ownerId = session.user._id || session.user.id || session.user.email;
          if (ownerId) await setCollectionReminderPreference(ownerId, saved.notifications.pushEnabled && saved.notifications.collectionReminders);
          updatePreferences({ theme: saved.theme, language: saved.language === 'fil' ? 'fil' : 'en' });
        }
      } catch {
        // Silently rollback on error
        void loadSettings();
      } finally {
        setIsSavingSettings(false);
      }
    },
    [apiUrl, session.token, session.user, loadSettings, updatePreferences],
  );

  const setTheme = (theme: Theme) => {
    setSettings((prev) => ({ ...prev, theme }));
    updatePreferences({ theme });
    void patchSettings({ theme });
  };

  const setLanguage = (language: Language) => {
    setSettings((prev) => ({ ...prev, language }));
    updatePreferences({ language });
    void patchSettings({ language });
  };

  const setNotificationToggle = (key: keyof NotificationSettings, value: boolean) => {
    const updated = { ...settings.notifications, [key]: value };
    setSettings((prev) => ({ ...prev, notifications: updated }));
    void patchSettings({ notifications: { [key]: value } });
  };

  // ── Delete account ─────────────────────────────────────────────────────────

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              `Your account for ${session.user.email ?? 'this account'} will be removed permanently.`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Yes, delete it', style: 'destructive', onPress: confirmDeleteAccount },
              ],
            );
          },
        },
      ],
    );
  };

  const confirmDeleteAccount = async () => {
    if (!apiUrl || !session.token) return;
    setIsDeletingAccount(true);
    try {
      const response = await fetch(`${apiUrl}/auth/account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const result = (await response.json()) as ApiResponse<unknown>;
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to delete account.');
      onSignOut();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Unable to delete account. Please try again.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // ── Derived display values ─────────────────────────────────────────────────

  const displayName = session.user.name?.trim() || 'Resident';

  const officeAddress = 'Roxas Ave., Concepcion Pequeña, Naga City, Naga City, Philippines, 4400';
  const contactEmail = 'swmo@naga.gov.ph';
  const fallbackWasteGuide = appInfo?.wasteGuide ?? [
    { category: 'Biodegradable', color: '#07815f', accentColor: '#07815f', items: ['Food scraps', 'Garden waste', 'Paper', 'Cardboard'] },
    { category: 'Non-Biodegradable', color: '#2f70d7', accentColor: '#2f70d7', items: ['Plastic bags', 'Styrofoam', 'Tin cans (non-recyclable)', 'Rubber'] },
    { category: 'Recyclables', color: '#b07800', accentColor: '#e8a000', items: ['Glass bottles', 'Aluminum cans', 'Plastic bottles (PET)', 'Newspapers'] },
    { category: 'Hazardous', color: '#c0392b', accentColor: '#e74c3c', items: ['Batteries', 'Paint containers', 'Medical waste', 'E-waste'] },
  ];
  const fallbackFaqs = appInfo?.faqs ?? [
    { question: 'What time does collection happen?', answer: 'Collection schedules vary by barangay. Check the Home tab for your next scheduled pickup.' },
    { question: 'What if my waste is not collected?', answer: 'Submit a complaint via the Complaints tab with a photo as evidence. SWMO will respond within 24 hours.' },
    { question: 'How do I segregate my waste?', answer: 'Separate biodegradable (green bag), non-biodegradable (black bag), and recyclables (blue bag) before collection day.' },
    { question: 'How do I update my collection address?', answer: 'Go to Profile → Edit Profile and update your Collection Location.' },
  ];
  const appVersion = appInfo?.appVersion ?? '1.0.0';

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent={false} visible={visible}>
      <View style={[ss.screen, appTheme === 'dark' && { backgroundColor: '#101815' }, { paddingTop: insets.top }]}>
        {/* ── Header ─────────────────────────────────────────── */}
        <View style={ss.header}>
          <Pressable accessibilityLabel="Back" hitSlop={10} onPress={onClose} style={ss.headerBack}>
            <Feather color="#07815f" name="chevron-left" size={22} />
          </Pressable>
          <Text style={ss.headerTitle}>Settings</Text>
          <View style={ss.headerBack}>{isSavingSettings ? <ActivityIndicator color="#0A7F4F" size="small" /> : null}</View>
        </View>

        {/* Account data is already in the session; FAQs have real fallback copy
            and a separate request without a loading flag. Keep both visible.
            Preserve the old loading lock on preferences, without blanking the page. */}
          <ScrollView
            contentContainerStyle={[ss.scrollContent, { paddingBottom: insets.bottom + 32 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {isLoadingSettings ? <Text accessibilityRole="text" style={ss.loadingText}>Loading your preferences…</Text> : null}
            <View accessible={isLoadingSettings} accessibilityLabel={isLoadingSettings ? 'Loading' : undefined} accessibilityState={{ busy: isLoadingSettings }}>
            <View pointerEvents={isLoadingSettings ? 'none' : 'auto'} accessibilityElementsHidden={isLoadingSettings} importantForAccessibility={isLoadingSettings ? 'no-hide-descendants' : 'auto'}>
            {settingsError ? <Text style={ss.globalError}>{settingsError}</Text> : null}

            {/* ── Account card ────────────────────────────────── */}
            <View style={ss.accountCard}>
              <ResidentAvatar uri={session.user.profilePhotoUrl} name={displayName} size={56}/>
              <View style={{ flex: 1 }}>
                <Text style={ss.accountName}>{displayName}</Text>
                {session.user.email ? <Text style={ss.accountEmail}>{session.user.email}</Text> : null}
              </View>
              {authProvider === 'google' ? (
                <View style={ss.googleBadge}>
                  <MaterialCommunityIcons color="#4285f4" name="google" size={12} />
                  <Text style={ss.googleBadgeText}>Google</Text>
                </View>
              ) : null}
            </View>

            {/* ── Appearance ──────────────────────────────────── */}
            <SectionHeader label="Appearance" />
            <View style={[ss.card, appTheme === 'dark' && { backgroundColor: '#1A2420' }]}>
              <View style={ss.cardRowNoBorder}>
                <View style={[ss.settingIcon, { backgroundColor: '#e8f4ff' }]}>
                  <Feather color="#2f70d7" name="sun" size={16} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={ss.settingText}>Theme</Text>
                  <Text style={ss.settingSubtext}>Choose your preferred color scheme</Text>
                </View>
              </View>
              <ThemePills onChange={setTheme} value={settings.theme} />
            </View>
            {/* ── Language ────────────────────────────────────── */}
            <SectionHeader label="Language" />
            <View style={[ss.card, appTheme === 'dark' && { backgroundColor: '#1A2420' }]}>
              <View style={ss.cardRowNoBorder}>
                <View style={[ss.settingIcon, { backgroundColor: '#fff7e6' }]}>
                  <Feather color="#c17a00" name="globe" size={16} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={ss.settingText}>App Language</Text>
                  <Text style={ss.settingSubtext}>Select the language used across the app</Text>
                </View>
              </View>
              <LanguageSelector onChange={setLanguage} value={settings.language} />
            </View>

            {/* ── Notifications ────────────────────────────────── */}
            <SectionHeader label="Notifications" />
            <View style={[ss.card, appTheme === 'dark' && { backgroundColor: '#1A2420' }]}>
              <SettingRow
                icon="bell"
                iconBg="#e8faf0"
                iconColor="#07815f"
                label="Push Notifications"
                sublabel="Master toggle for all notifications"
                right={
                  <Switch
                    ios_backgroundColor="#cdd9d3"
                    accessibilityLabel="Push Notifications"
                    onValueChange={(value) => setNotificationToggle('pushEnabled', value)}
                    thumbColor="#ffffff"
                    trackColor={{ false: '#cdd9d3', true: '#0A7F4F' }}
                    value={settings.notifications.pushEnabled}
                  />
                }
              />
              <SettingRow
                icon="truck"
                iconBg="#f0f9ff"
                iconColor="#2f70d7"
                label="Collection Reminders"
                sublabel="One alert when collection starts or is underway, and one when it ends"
                right={
                  <Switch
                    disabled={!settings.notifications.pushEnabled}
                    ios_backgroundColor="#cdd9d3"
                    accessibilityLabel="Collection Reminders"
                    onValueChange={(value) => setNotificationToggle('collectionReminders', value)}
                    thumbColor="#ffffff"
                    trackColor={{ false: '#cdd9d3', true: '#0A7F4F' }}
                    value={settings.notifications.collectionReminders && settings.notifications.pushEnabled}
                  />
                }
              />
              <SettingRow
                icon="calendar"
                iconBg="#fff7e6"
                iconColor="#c17a00"
                label="Schedule Updates"
                sublabel="Alerts when your schedule changes"
                right={
                  <Switch
                    disabled={!settings.notifications.pushEnabled}
                    ios_backgroundColor="#cdd9d3"
                    accessibilityLabel="Schedule Updates"
                    onValueChange={(value) => setNotificationToggle('scheduleUpdates', value)}
                    thumbColor="#ffffff"
                    trackColor={{ false: '#cdd9d3', true: '#0A7F4F' }}
                    value={settings.notifications.scheduleUpdates && settings.notifications.pushEnabled}
                  />
                }
              />
              <SettingRow
                icon="message-square"
                iconBg="#f5f0ff"
                iconColor="#7c4dff"
                isLast
                label="Announcements"
                sublabel="SWMO news and official notices"
                right={
                  <Switch
                    disabled={!settings.notifications.pushEnabled}
                    ios_backgroundColor="#cdd9d3"
                    accessibilityLabel="Announcements"
                    onValueChange={(value) => setNotificationToggle('announcements', value)}
                    thumbColor="#ffffff"
                    trackColor={{ false: '#cdd9d3', true: '#0A7F4F' }}
                    value={settings.notifications.announcements && settings.notifications.pushEnabled}
                  />
                }
              />
            </View>

            {/* ── Security ─────────────────────────────────────── */}
            <SectionHeader label="Security" />
            <View style={ss.card}>
              <SettingRow
                icon="lock"
                iconBg="#e8faf0"
                iconColor="#07815f"
                isLast
                label={isPasswordSet ? 'Change Password' : 'Set a Password'}
                onPress={() => setShowChangePassword(true)}
                sublabel={
                  authProvider === 'google' && !isPasswordSet
                    ? 'Add a password to your Google account'
                    : 'Update your account password'
                }
              />
            </View>

            {/* ── Info & Support ───────────────────────────────── */}
            <SectionHeader label="Information & Support" />

            {/* Office contact */}
            <View style={ss.card}>
              <View style={ss.infoSectionLabel}>
                <Feather color="#07815f" name="mail" size={14} />
                <Text style={ss.infoSectionLabelText}>CONTACT SWMO</Text>
              </View>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Email SWMO at ${contactEmail}`}
                  onPress={() => { void Linking.openURL(`mailto:${contactEmail}`).catch(() => Alert.alert('Email unavailable', `Please email ${contactEmail} using your email app.`)); }}
                  style={[ss.hotlineRow, ss.settingRowBorder]}
                >
                  <View style={ss.hotlineIconWrap}>
                    <Feather color="#07815f" name="mail" size={14} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={ss.hotlineLabel}>Email</Text>
                    <Text style={ss.hotlineNumber}>{contactEmail}</Text>
                  </View>
                  <View style={ss.callBadge}>
                    <Text style={ss.callBadgeText}>Email</Text>
                  </View>
                </Pressable>
              <View style={[ss.hotlineRow, { borderBottomWidth: 0 }]}>
                <View style={ss.hotlineIconWrap}>
                  <Feather color="#07815f" name="map-pin" size={14} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ss.hotlineLabel}>Office Address</Text>
                  <Text style={ss.hotlineNumber}>{officeAddress}</Text>
                </View>
              </View>
            </View>

            {/* Waste Segregation Guide */}
            <View style={ss.card}>
              <View style={ss.infoSectionLabel}>
                <MaterialCommunityIcons color="#07815f" name="recycle" size={14} />
                <Text style={ss.infoSectionLabelText}>WASTE SEGREGATION GUIDE</Text>
              </View>
              {fallbackWasteGuide.map((guide) => (
                <WasteGuideCard
                  accentColor={guide.accentColor}
                  category={guide.category}
                  color={guide.color}
                  items={guide.items}
                  key={guide.category}
                />
              ))}
            </View>

            {/* FAQs */}
            <View style={ss.card}>
              <View style={ss.infoSectionLabel}>
                <Feather color="#07815f" name="help-circle" size={14} />
                <Text style={ss.infoSectionLabelText}>FREQUENTLY ASKED QUESTIONS</Text>
              </View>
              {fallbackFaqs.map((faq) => (
                <FaqItem answer={faq.answer ?? faq.a ?? ''} key={faq.question ?? faq.q} question={faq.question ?? faq.q ?? ''} />
              ))}
            </View>

            {/* App version */}
            <View style={ss.versionRow}>
              <View style={ss.versionBadge}>
                <MaterialCommunityIcons color="#07815f" name="leaf" size={12} />
                <Text style={ss.versionText}>RESIKLEAN v{appVersion}</Text>
              </View>
              <Text style={ss.versionSub}>Naga City Solid Waste Management</Text>
            </View>

            {/* ── Danger Zone ──────────────────────────────────── */}
            <SectionHeader label="Danger Zone" />
            <View style={ss.dangerCard}>
              <View style={ss.dangerIcon}>
                <Feather color="#B3261E" name="alert-triangle" size={18} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={ss.dangerTitle}>Delete Account</Text>
                <Text style={ss.dangerSubtext}>
                  Permanently removes your account, push tokens, and all personal data. Complaint records are retained by SWMO.
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={isDeletingAccount}
              onPress={handleDeleteAccount}
              style={[ss.dangerButton, isDeletingAccount && ss.disabledButton]}
            >
              {isDeletingAccount ? (
                <ActivityIndicator color="#B3261E" size="small" />
              ) : (
                <>
                  <Feather color="#B3261E" name="trash-2" size={15} />
                  <Text style={ss.dangerButtonText}>Delete My Account</Text>
                </>
              )}
            </Pressable>
            </View>
            </View>
          </ScrollView>
      </View>

      {/* ── Change Password Sheet ───────────────────────────── */}
      <ChangePasswordModal
        apiUrl={apiUrl}
        isPasswordSet={isPasswordSet}
        onClose={() => setShowChangePassword(false)}
        token={session.token}
        visible={showChangePassword}
      />
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  pillIndicator: { position: 'absolute', top: 4, left: 0, backgroundColor: '#FFFFFF', borderRadius: 12, shadowColor: '#121A16', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2 },
  // Layout
  screen: { backgroundColor: '#FFFFFF', flex: 1 },
  header: { alignItems: 'center', backgroundColor: '#FFFFFF', borderBottomColor: '#E3EAE6', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6 },
  headerBack: { alignItems: 'center', justifyContent: 'center', width: 44, height: 44 },
  headerTitle: { color: '#121A16', fontSize: 18, fontWeight: '700' },
  loadingContainer: { alignItems: 'center', flex: 1, justifyContent: 'center', gap: 14 },
  loadingText: { color: '#7a8d82', fontSize: 13 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
  globalError: { backgroundColor: '#fff0f2', borderColor: '#ffd6da', borderRadius: 10, borderWidth: 1, color: '#c0392b', fontSize: 12, marginBottom: 10, padding: 10 },

  // Section header
  sectionHeader: { color: '#5A6761', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 12, marginTop: 28, textTransform: 'uppercase' },

  // Account card
  accountCard: { alignItems: 'center', flexDirection: 'row', paddingVertical: 12, gap: 12 },
  accountAvatar: { alignItems: 'center', borderRadius: 28, overflow: 'hidden', height: 56, justifyContent: 'center', width: 56 },
  accountAvatarText: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  accountName: { color: '#121A16', fontSize: 17, fontWeight: '700' },
  accountEmail: { color: '#5A6761', fontSize: 13, marginTop: 2 },
  googleBadge: { alignItems: 'center', backgroundColor: '#eef3ff', borderColor: '#d0dfff', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  googleBadgeText: { color: '#4285f4', fontSize: 10, fontWeight: '800' },

  // Generic card
  card: { backgroundColor: '#FFFFFF', marginTop: 4 },
  cardRowNoBorder: { alignItems: 'center', flexDirection: 'row', paddingVertical: 12, paddingBottom: 16 },

  // Setting row
  settingRow: { alignItems: 'center', flexDirection: 'row', minHeight: 72, paddingVertical: 14 },
  settingRowBorder: { borderBottomColor: '#E3EAE6', borderBottomWidth: 1 },
  settingIcon: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  settingLabel: { flex: 1, minWidth: 0, marginLeft: 12, marginRight: 8 },
  settingText: { color: '#121A16', fontSize: 15, fontWeight: '600' },
  settingSubtext: { color: '#5A6761', fontSize: 12, marginTop: 3 },

  // Pills
  pillRow: { position: 'relative', flexDirection: 'row', backgroundColor: '#EEF3F0', borderRadius: 16, overflow: 'hidden', padding: 4, gap: 0 },
  pill: { alignItems: 'center', borderRadius: 12, minHeight: 44, flex: 1, minWidth: 0, flexDirection: 'row', gap: 5, justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 8 },
  pillActive: { backgroundColor: '#e8faf0', borderColor: '#07815f' },
  pillText: { color: '#5A6761', fontSize: 13, fontWeight: '500', flexShrink: 1 },
  pillTextActive: { color: '#086B42', fontWeight: '700' },
  pillFlag: { fontSize: 13 },

  // Info & Support
  infoSectionLabel: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingBottom: 12, paddingTop: 20 },
  infoSectionLabelText: { color: '#121A16', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  hotlineRow: { alignItems: 'center', flexDirection: 'row', minHeight: 64, paddingVertical: 12, gap: 12 },
  hotlineIconWrap: { alignItems: 'center', backgroundColor: '#E3F4EB', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  hotlineLabel: { color: '#5A6761', fontSize: 12 },
  hotlineNumber: { color: '#121A16', fontSize: 17, fontWeight: '700', marginTop: 2 },
  callBadge: { backgroundColor: '#E3F4EB', borderRadius: 14, minHeight: 44, minWidth: 60, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  callBadgeText: { color: '#086B42', fontSize: 14, fontWeight: '700' },

  // Waste guide
  wasteCard: { minHeight: 56, borderBottomWidth: 1, borderBottomColor: '#E3EAE6', justifyContent: 'center', paddingVertical: 16 },
  wasteCardHeader: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  wasteDot: { borderRadius: 4, height: 8, width: 8 },
  wasteCategory: { flex: 1, fontSize: 15, fontWeight: '600' },
  wasteItems: { marginTop: 8, paddingLeft: 16 },
  wasteItemRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 5 },
  wasteItemDot: { borderRadius: 3, height: 5, width: 5 },
  wasteItemText: { color: '#35463F', fontSize: 14, flex: 1 },

  // FAQs
  faqItem: { borderBottomColor: '#E3EAE6', borderBottomWidth: 1, minHeight: 56, justifyContent: 'center', paddingVertical: 16 },
  faqHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  faqQuestion: { color: '#121A16', flex: 1, fontSize: 14, fontWeight: '600' },
  faqAnswer: { color: '#5A6761', fontSize: 14, marginTop: 10 },

  // Version
  versionRow: { alignItems: 'center', gap: 6, marginTop: 20, paddingVertical: 4 },
  versionBadge: { alignItems: 'center', backgroundColor: '#e8faf0', borderRadius: 20, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  versionText: { color: '#07815f', fontSize: 11, fontWeight: '800' },
  versionSub: { color: '#5A6761', fontSize: 12, textAlign: 'center' },

  // Danger zone
  dangerCard: { alignItems: 'flex-start', backgroundColor: '#FDECEA', borderRadius: 20, flexDirection: 'row', padding: 16 },
  dangerIcon: { alignItems: 'center', backgroundColor: '#FBD5D1', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  dangerTitle: { color: '#B3261E', fontSize: 16, fontWeight: '700' },
  dangerSubtext: { color: '#B3261E', fontSize: 13, marginTop: 4 },
  dangerButton: { alignItems: 'center', borderColor: '#B3261E', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 52, padding: 12, justifyContent: 'center', marginTop: 12 },
  dangerButtonText: { color: '#B3261E', fontSize: 16, fontWeight: '700', flexShrink: 1 },

  // Change password modal
  cpBackdrop: { backgroundColor: 'rgba(10, 28, 19, 0.45)', flex: 1, justifyContent: 'flex-end' },
  cpSheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 14 },
  cpHandle: { alignSelf: 'center', backgroundColor: '#d1dbd5', borderRadius: 3, height: 4, marginBottom: 16, width: 40 },
  cpHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: 20 },
  cpHeaderIcon: { alignItems: 'center', backgroundColor: '#e8faf0', borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  cpTitle: { color: '#102c20', fontSize: 16, fontWeight: '800' },
  cpSubtitle: { color: '#718077', fontSize: 11, marginTop: 2 },
  cpLabel: { color: '#61746a', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  cpInputRow: { alignItems: 'center', backgroundColor: '#f9fbfa', borderColor: '#dbe5df', borderRadius: 12, borderWidth: 1, flexDirection: 'row' },
  cpInput: { color: '#243f31', flex: 1, fontSize: 13, minHeight: 44, paddingHorizontal: 13 },
  cpEye: { paddingHorizontal: 12 },
  cpError: { color: '#cc4251', fontSize: 12, fontWeight: '600', marginTop: 10 },
  cpSuccess: { color: '#07815f', fontSize: 12, fontWeight: '600', marginTop: 10 },
  cpSubmitButton: { alignItems: 'center', backgroundColor: '#07815f', borderRadius: 12, height: 48, justifyContent: 'center', marginTop: 20 },
  cpSubmitText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },

  // Shared
  disabledButton: { opacity: 0.55 },
});
