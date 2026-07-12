import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useColors } from '@/hooks/useColors';
import { isSupabaseConfigured } from '@/lib/supabase';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn, supervisor, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!authLoading && supervisor) return <Redirect href="/(tabs)" />;

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ في تسجيل الدخول';
      setError(msg.includes('Invalid') ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة' : msg);
    } finally {
      setLoading(false);
    }
  };

  const s = styles(colors, insets);

  return (
    <View style={s.container}>
      <View style={s.topBg} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.inner}
      >
        {/* Logo area */}
        <View style={s.logoArea}>
          <View style={s.logoCircle}>
            <Text style={s.logoIcon}>🛡️</Text>
          </View>
          <Text style={s.appName}>Mydan</Text>
          <Text style={s.appSubtitle}>نظام إدارة المشرفين الميدانيين</Text>
        </View>

        {/* Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>تسجيل الدخول</Text>

          {!isSupabaseConfigured && (
            <View style={s.warnBanner}>
              <Text style={s.warnText}>
                ⚠️ لم يتم إعداد Supabase بعد. يرجى إضافة EXPO_PUBLIC_SUPABASE_URL و
                EXPO_PUBLIC_SUPABASE_ANON_KEY
              </Text>
            </View>
          )}

          <View style={s.inputWrapper}>
            <Text style={s.label}>البريد الإلكتروني</Text>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder="example@company.com"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              textAlign="right"
            />
          </View>

          <View style={s.inputWrapper}>
            <Text style={s.label}>كلمة المرور</Text>
            <TextInput
              style={s.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              textAlign="right"
            />
          </View>

          {!!error && <Text style={s.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[s.btn, loading && s.btnDisabled]}
            onPress={handleLogin}
            disabled={loading || !isSupabaseConfigured}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnText}>دخول</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.primary },
    topBg: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.primary,
    },
    inner: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0),
      paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0),
    },
    logoArea: { alignItems: 'center', marginBottom: 32 },
    logoCircle: {
      width: 80,
      height: 80,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    logoIcon: { fontSize: 36 },
    appName: {
      fontSize: 22,
      fontWeight: '700' as const,
      color: '#fff',
      fontFamily: 'Cairo_700Bold',
      letterSpacing: 0.5,
    },
    appSubtitle: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.75)',
      fontFamily: 'Cairo_400Regular',
      marginTop: 4,
      textAlign: 'center',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 8,
    },
    cardTitle: {
      fontSize: 20,
      fontWeight: '700' as const,
      color: colors.foreground,
      fontFamily: 'Cairo_700Bold',
      textAlign: 'right',
      marginBottom: 20,
    },
    warnBanner: {
      backgroundColor: '#FEF9C3',
      borderRadius: 8,
      padding: 10,
      marginBottom: 16,
    },
    warnText: {
      color: '#92400E',
      fontSize: 12,
      fontFamily: 'Cairo_400Regular',
      textAlign: 'right',
      lineHeight: 18,
    },
    inputWrapper: { marginBottom: 16 },
    label: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: 'Cairo_600SemiBold',
      textAlign: 'right',
      marginBottom: 6,
    },
    input: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      fontSize: 15,
      color: colors.foreground,
      fontFamily: 'Cairo_400Regular',
      backgroundColor: colors.muted,
    },
    errorText: {
      color: colors.destructive,
      fontSize: 13,
      fontFamily: 'Cairo_400Regular',
      textAlign: 'right',
      marginBottom: 12,
    },
    btn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 4,
    },
    btnDisabled: { opacity: 0.6 },
    btnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700' as const,
      fontFamily: 'Cairo_700Bold',
    },
  });
