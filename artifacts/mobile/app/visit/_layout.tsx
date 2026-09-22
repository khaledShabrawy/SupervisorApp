import { Stack } from 'expo-router';
import React from 'react';
import { useColors } from '@/hooks/useColors';

export default function VisitLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontFamily: 'Cairo_700Bold', fontWeight: '700' as const },
        headerBackTitle: 'رجوع',
      }}
    >
      <Stack.Screen name="[customerId]" options={{ title: 'بيانات الزيارة' }} />
      <Stack.Screen name="shelf-audit" options={{ title: 'كشف الرف' }} />
      <Stack.Screen name="competitor" options={{ title: 'منتجات المنافسين' }} />
      <Stack.Screen name="order" options={{ title: 'تسجيل أوردر' }} />
      <Stack.Screen name="add-customer" options={{ title: 'إضافة عميل جديد' }} />
    </Stack>
  );
}
