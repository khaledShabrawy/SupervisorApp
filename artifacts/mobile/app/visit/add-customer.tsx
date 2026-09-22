import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useColors } from '@/hooks/useColors';
import { supabase } from '@/lib/supabase';

const OUTLET_TYPES = ['سوبر ماركت', 'ميني ماركت', 'هايبر', 'كافيه', 'فندق', 'أخرى'] as const;
const COMPETITORS = ['كادبيري', 'كيندر', 'بيسكو مصر', 'أولكر'] as const;

type FormErrors = Record<string, string>;
type GpsPoint = { lat: number; lng: number };

export default function AddCustomerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { supervisor } = useAuth();
  const s = styles(colors, insets);

  const [step, setStep] = useState(1);
  const [gps, setGps] = useState<GpsPoint | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [outletName, setOutletName] = useState('');
  const [outletType, setOutletType] = useState('');
  const [outletPhotoUri, setOutletPhotoUri] = useState<string | null>(null);
  const [outletPhotoUrl, setOutletPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedCustomerId, setSavedCustomerId] = useState<string | null>(null);

  const applyGps = async (lat: number, lng: number) => {
    setGps({ lat, lng });
    setErrors((previous) => ({ ...previous, gps: '' }));

    if (Platform.OS !== 'web') {
      try {
        const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const place = places[0];
        const parts = [place?.street, place?.district, place?.city, place?.region]
          .filter(Boolean);
        if (parts.length > 0 && !address.trim()) setAddress(parts.join('، '));
      } catch {
        // Reverse geocoding is optional; the supervisor can enter the address manually.
      }
    }
  };

  const captureGps = async () => {
    setGpsLoading(true);
    setErrors((previous) => ({ ...previous, gps: '' }));

    try {
      const geolocation =
        typeof navigator !== 'undefined' ? navigator.geolocation : undefined;

      if (geolocation) {
        await new Promise<void>((resolve) => {
          geolocation.getCurrentPosition(
            (position) => {
              void applyGps(position.coords.latitude, position.coords.longitude).finally(resolve);
            },
            () => {
              setErrors((previous) => ({
                ...previous,
                gps: 'تعذر تحديد الموقع. فعّل صلاحية الموقع وحاول مرة أخرى.',
              }));
              resolve();
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
          );
        });
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrors((previous) => ({
            ...previous,
            gps: 'يجب السماح بالوصول إلى الموقع للمتابعة.',
          }));
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        await applyGps(position.coords.latitude, position.coords.longitude);
      }
    } catch {
      setErrors((previous) => ({
        ...previous,
        gps: 'تعذر تحديد الموقع. حاول مرة أخرى.',
      }));
    } finally {
      setGpsLoading(false);
    }
  };

  useEffect(() => {
    void captureGps();
  }, []);

  const uploadOutletPhoto = async (uri: string) => {
    setPhotoLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('لم يتم العثور على جلسة المستخدم');

      const imageResponse = await fetch(uri);
      const imageBlob = await imageResponse.blob();
      const path = `${user.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('prospects-photos')
        .upload(path, imageBlob, { contentType: 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('prospects-photos').getPublicUrl(path);
      setOutletPhotoUrl(data.publicUrl);
    } catch {
      setOutletPhotoUri(null);
      setOutletPhotoUrl(null);
      Alert.alert('خطأ', 'تعذر رفع صورة واجهة المحل');
    } finally {
      setPhotoLoading(false);
    }
  };

  const openCamera = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.75,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setOutletPhotoUri(uri);
    await uploadOutletPhoto(uri);
  };

  const openLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.75,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setOutletPhotoUri(uri);
    await uploadOutletPhoto(uri);
  };

  const choosePhoto = () => {
    Alert.alert('صورة واجهة المحل', 'اختر مصدر الصورة', [
      { text: 'الكاميرا', onPress: () => void openCamera() },
      { text: 'معرض الصور', onPress: () => void openLibrary() },
      { text: 'إلغاء', style: 'cancel' },
    ]);
  };

  const validateStepOne = () => {
    const nextErrors: FormErrors = {};
    if (!gps) nextErrors.gps = 'يجب تحديد موقع المحل قبل المتابعة.';
    if (!outletName.trim()) nextErrors.outletName = 'اسم المحل مطلوب.';
    if (!outletType) nextErrors.outletType = 'اختر نوع المنفذ.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateStepTwo = () => {
    const nextErrors: FormErrors = {};
    if (!ownerName.trim()) nextErrors.ownerName = 'اسم صاحب المحل مطلوب.';
    if (!/^01\d{8,9}$/.test(ownerPhone.trim())) {
      nextErrors.ownerPhone = 'أدخل رقم موبايل مصري صحيح يبدأ بـ 01 ويتكون من 10 أو 11 رقماً.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const goNext = () => {
    if (step === 1 && validateStepOne()) {
      setErrors({});
      setStep(2);
    } else if (step === 2 && validateStepTwo()) {
      setErrors({});
      setStep(3);
    }
  };

  const goBack = () => {
    if (step === 1) router.back();
    else setStep((current) => current - 1);
  };

  const toggleCompetitor = (brand: string) => {
    setCompetitors((current) =>
      current.includes(brand)
        ? current.filter((item) => item !== brand)
        : [...current, brand],
    );
  };

  const findSupervisorId = async (userId: string) => {
    const { data, error } = await supabase
      .from('supervisors')
      .select('id')
      .eq('auth_user_id', userId)
      .maybeSingle();

    // Existing Mydan rows use id = auth.users.id. Keep that data compatible
    // while new rows can use the explicit auth_user_id relationship.
    if (!error && data?.id) return data.id as string;
    if (error) {
      const legacy = await supabase
        .from('supervisors')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
      if (legacy.error) throw legacy.error;
      if (legacy.data?.id) return legacy.data.id as string;
    }
    if (supervisor?.id) return supervisor.id;
    throw new Error('لم يتم العثور على بيانات المشرف');
  };

  const saveCustomer = async () => {
    if (!validateStepOne()) {
      setStep(1);
      return;
    }
    if (!validateStepTwo()) {
      setStep(2);
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
      if (!gps) throw new Error('يجب تحديد موقع المحل قبل الحفظ.');

      const supervisorId = await findSupervisorId(user.id);
      const { data, error } = await supabase
        .from('customers')
        .insert({
          name: outletName.trim(),
          type: outletType,
          owner_name: ownerName.trim(),
          owner_phone: ownerPhone.trim(),
          address: address.trim() || null,
          gps_lat: gps.lat,
          gps_lng: gps.lng,
          // Keep the legacy route-list coordinates in sync with the new fields.
          latitude: gps.lat,
          longitude: gps.lng,
          competitor_brands: competitors,
          outlet_photo_url: outletPhotoUrl,
          added_by_supervisor_id: supervisorId,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (error) throw error;
      setSavedCustomerId(data.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر حفظ العميل الجديد';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const resetWizard = () => {
    setStep(1);
    setOutletName('');
    setOutletType('');
    setOutletPhotoUri(null);
    setOutletPhotoUrl(null);
    setOwnerName('');
    setOwnerPhone('');
    setAddress('');
    setCompetitors([]);
    setNotes('');
    setErrors({});
    setSaveError('');
    setSavedCustomerId(null);
    setGps(null);
    void captureGps();
  };

  if (savedCustomerId) {
    return (
      <View style={s.successScreen}>
        <View style={s.successIcon}>
          <Ionicons name="checkmark" size={42} color={colors.success} />
        </View>
        <Text style={s.successTitle}>تم إضافة العميل بنجاح 🎉</Text>
        <Text style={s.successBody}>يمكنك بدء أول زيارة للعميل الآن.</Text>
        <TouchableOpacity
          style={s.primaryButton}
          onPress={() =>
            router.push(
              `/visit/${savedCustomerId}?lat=${gps?.lat ?? 0}&lng=${gps?.lng ?? 0}`,
            )
          }
          activeOpacity={0.85}
        >
          <Ionicons name="navigate" size={20} color="#fff" />
          <Text style={s.primaryButtonText}>ابدأ الزيارة الأولى</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.secondaryButton} onPress={resetWizard} activeOpacity={0.85}>
          <Text style={s.secondaryButtonText}>+ إضافة عميل آخر</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={s.stepper}>
        {[1, 2, 3].map((item) => (
          <React.Fragment key={item}>
            <View style={[s.stepCircle, step >= item && s.stepCircleActive]}>
              <Text style={[s.stepNumber, step >= item && s.stepNumberActive]}>{item}</Text>
            </View>
            {item < 3 && <View style={[s.stepLine, step > item && s.stepLineActive]} />}
          </React.Fragment>
        ))}
      </View>
      <View style={s.stepLabels}>
        <Text style={[s.stepLabel, step === 1 && s.stepLabelActive]}>الموقع والنوع</Text>
        <Text style={[s.stepLabel, step === 2 && s.stepLabelActive]}>بيانات الصاحب</Text>
        <Text style={[s.stepLabel, step === 3 && s.stepLabelActive]}>تأكيد وحفظ</Text>
      </View>

      {step === 1 && (
        <View>
          <View style={s.locationCard}>
            <View style={s.sectionHeadingRow}>
              <Text style={s.sectionHeading}>موقع المحل</Text>
              <Ionicons name="location" size={21} color={colors.primary} />
            </View>
            {gps ? (
              <View style={s.gpsSuccess}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={s.gpsSuccessText}>
                  تم تحديد الموقع{'\n'}
                  {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
                </Text>
              </View>
            ) : (
              <TouchableOpacity style={s.gpsButton} onPress={() => void captureGps()} disabled={gpsLoading}>
                {gpsLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="navigate" size={19} color="#fff" />
                    <Text style={s.gpsButtonText}>تحديد موقعي الحالي</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {errors.gps ? <Text style={s.errorText}>{errors.gps}</Text> : null}
          </View>

          <View style={s.card}>
            <Text style={s.label}>اسم المحل</Text>
            <TextInput
              style={[s.input, errors.outletName && s.inputError]}
              value={outletName}
              onChangeText={setOutletName}
              placeholder="مثال: سوبر ماركت النور"
              placeholderTextColor={colors.mutedForeground}
              textAlign="right"
            />
            {errors.outletName ? <Text style={s.errorText}>{errors.outletName}</Text> : null}

            <Text style={s.label}>نوع المنفذ</Text>
            <View style={s.typeGrid}>
              {OUTLET_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[s.typeOption, outletType === type && s.typeOptionActive]}
                  onPress={() => setOutletType(type)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.typeOptionText, outletType === type && s.typeOptionTextActive]}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {errors.outletType ? <Text style={s.errorText}>{errors.outletType}</Text> : null}

            <Text style={s.label}>صورة واجهة المحل <Text style={s.optional}>(اختياري)</Text></Text>
            <TouchableOpacity style={s.photoButton} onPress={choosePhoto} disabled={photoLoading}>
              {photoLoading ? (
                <ActivityIndicator color={colors.success} />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={21} color={colors.success} />
                  <Text style={s.photoButtonText}>
                    {outletPhotoUrl ? 'تم رفع الصورة — تغيير الصورة' : 'تصوير أو اختيار صورة'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {outletPhotoUri ? <Image source={{ uri: outletPhotoUri }} style={s.outletPhoto} /> : null}
          </View>
        </View>
      )}

      {step === 2 && (
        <View style={s.card}>
          <Text style={s.label}>اسم صاحب المحل</Text>
          <TextInput
            style={[s.input, errors.ownerName && s.inputError]}
            value={ownerName}
            onChangeText={setOwnerName}
            placeholder="اسم صاحب المحل"
            placeholderTextColor={colors.mutedForeground}
            textAlign="right"
          />
          {errors.ownerName ? <Text style={s.errorText}>{errors.ownerName}</Text> : null}

          <Text style={s.label}>موبايل الصاحب</Text>
          <TextInput
            style={[s.input, errors.ownerPhone && s.inputError]}
            value={ownerPhone}
            onChangeText={(value) => setOwnerPhone(value.replace(/[^\d]/g, ''))}
            placeholder="01XXXXXXXXX"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="phone-pad"
            maxLength={11}
            textAlign="right"
          />
          {errors.ownerPhone ? <Text style={s.errorText}>{errors.ownerPhone}</Text> : null}

          <Text style={s.label}>العنوان التفصيلي <Text style={s.optional}>(اختياري)</Text></Text>
          <TextInput
            style={s.input}
            value={address}
            onChangeText={setAddress}
            placeholder="العنوان بالتفصيل"
            placeholderTextColor={colors.mutedForeground}
            textAlign="right"
          />

          <Text style={s.label}>ماركات المنافسين الموجودة <Text style={s.optional}>(اختياري)</Text></Text>
          <View style={s.chips}>
            {COMPETITORS.map((brand) => {
              const selected = competitors.includes(brand);
              return (
                <TouchableOpacity
                  key={brand}
                  style={[s.chip, selected && s.chipActive]}
                  onPress={() => toggleCompetitor(brand)}
                  activeOpacity={0.8}
                >
                  {selected ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
                  <Text style={[s.chipText, selected && s.chipTextActive]}>{brand}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.label}>ملاحظات <Text style={s.optional}>(اختياري)</Text></Text>
          <TextInput
            style={[s.input, s.textarea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="أضف أي ملاحظات عن العميل..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={4}
            textAlign="right"
            textAlignVertical="top"
          />
        </View>
      )}

      {step === 3 && (
        <View>
          <View style={s.reviewCard}>
            <Text style={s.reviewTitle}>راجع بيانات العميل</Text>
            <ReviewRow label="اسم المحل" value={outletName} styles={s} />
            <ReviewRow label="نوع المنفذ" value={outletType} styles={s} />
            <ReviewRow
              label="الموقع"
              value={gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : 'غير محدد'}
              styles={s}
            />
            <ReviewRow label="اسم الصاحب" value={ownerName} styles={s} />
            <ReviewRow label="الموبايل" value={ownerPhone} styles={s} />
            <ReviewRow label="العنوان" value={address || '—'} styles={s} />
            <ReviewRow label="المنافسون" value={competitors.length ? competitors.join('، ') : '—'} styles={s} />
            <ReviewRow label="الملاحظات" value={notes || '—'} styles={s} />
            {outletPhotoUrl ? (
              <View style={s.reviewPhotoRow}>
                <Text style={s.reviewValue}>تم إرفاق صورة</Text>
                <Text style={s.reviewLabel}>صورة الواجهة</Text>
              </View>
            ) : null}
          </View>
          {saveError ? (
            <View style={s.saveError}>
              <Ionicons name="alert-circle" size={20} color={colors.destructive} />
              <Text style={s.saveErrorText}>{saveError}</Text>
            </View>
          ) : null}
        </View>
      )}

      <View style={s.navigationRow}>
        <TouchableOpacity style={s.backButton} onPress={goBack} activeOpacity={0.8}>
          <Ionicons name="arrow-forward" size={19} color={colors.foreground} />
          <Text style={s.backButtonText}>{step === 1 ? 'رجوع' : 'السابق'}</Text>
        </TouchableOpacity>
        {step < 3 ? (
          <TouchableOpacity style={s.primaryButtonSmall} onPress={goNext} activeOpacity={0.85}>
            <Text style={s.primaryButtonText}>التالي</Text>
            <Ionicons name="arrow-back" size={19} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.primaryButtonSmall, saving && s.disabledButton]}
            onPress={() => void saveCustomer()}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>💾 حفظ العميل الجديد مباشرة</Text>}
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

function ReviewRow({
  label,
  value,
  styles: s,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof styles>;
}) {
  return (
    <View style={s.reviewRow}>
      <Text style={s.reviewValue}>{value}</Text>
      <Text style={s.reviewLabel}>{label}</Text>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.customerBackground },
    content: {
      padding: 16,
      paddingBottom: insets.bottom + 30,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 26,
      marginTop: 4,
    },
    stepCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.muted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    stepCircleActive: { backgroundColor: colors.customerPrimary, borderColor: colors.customerPrimary },
    stepNumber: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Cairo_700Bold' },
    stepNumberActive: { color: '#fff' },
    stepLine: { height: 2, flex: 1, backgroundColor: colors.border },
    stepLineActive: { backgroundColor: colors.customerPrimary },
    stepLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 8,
      marginBottom: 18,
    },
    stepLabel: { flex: 1, fontSize: 10, color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', textAlign: 'center' },
    stepLabelActive: { color: colors.customerPrimary, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 5,
      elevation: 2,
    },
    locationCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionHeadingRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 7, marginBottom: 12 },
    sectionHeading: { fontSize: 15, color: colors.foreground, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const },
    gpsButton: {
      backgroundColor: colors.customerPrimary,
      borderRadius: 11,
      paddingVertical: 13,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    gpsButtonText: { color: '#fff', fontSize: 14, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const },
    gpsSuccess: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 8,
      padding: 11,
      borderRadius: 10,
      backgroundColor: `${colors.customerSuccess}16`,
      borderWidth: 1,
      borderColor: `${colors.customerSuccess}40`,
    },
    gpsSuccessText: { flex: 1, color: colors.customerSuccess, fontSize: 12, fontFamily: 'Cairo_600SemiBold', textAlign: 'right', lineHeight: 20 },
    label: { color: colors.foreground, fontSize: 13, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const, textAlign: 'right', marginBottom: 7, marginTop: 4 },
    optional: { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', fontWeight: '400' as const },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.muted,
      paddingHorizontal: 12,
      paddingVertical: 11,
      color: colors.foreground,
      fontSize: 14,
      fontFamily: 'Cairo_400Regular',
      marginBottom: 5,
    },
    inputError: { borderColor: colors.customerDanger },
    textarea: { minHeight: 90 },
    errorText: { color: colors.customerDanger, fontSize: 11, fontFamily: 'Cairo_400Regular', textAlign: 'right', marginBottom: 8, lineHeight: 18 },
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    typeOption: {
      width: '31.5%',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: 'center',
      backgroundColor: colors.muted,
    },
    typeOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    typeOptionText: { color: colors.mutedForeground, fontSize: 12, fontFamily: 'Cairo_600SemiBold', textAlign: 'center' },
    typeOptionTextActive: { color: '#fff' },
    photoButton: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.customerSuccess,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 7,
    },
    photoButtonText: { color: colors.customerSuccess, fontSize: 12, fontFamily: 'Cairo_600SemiBold' },
    outletPhoto: { width: '100%', height: 150, borderRadius: 10, marginTop: 10 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: colors.muted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.customerPrimary, borderColor: colors.customerPrimary },
    chipText: { color: colors.mutedForeground, fontSize: 12, fontFamily: 'Cairo_600SemiBold' },
    chipTextActive: { color: '#fff' },
    reviewCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 5,
      elevation: 2,
    },
    reviewTitle: { color: colors.foreground, fontSize: 16, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const, textAlign: 'right', marginBottom: 8 },
    reviewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
    reviewLabel: { color: colors.mutedForeground, fontSize: 12, fontFamily: 'Cairo_400Regular', textAlign: 'right' },
    reviewValue: { flex: 1, color: colors.foreground, fontSize: 13, fontFamily: 'Cairo_600SemiBold', fontWeight: '600' as const, textAlign: 'right' },
    reviewPhotoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10 },
    saveError: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: `${colors.customerDanger}14`, borderRadius: 10, padding: 11, marginTop: 12 },
    saveErrorText: { flex: 1, color: colors.customerDanger, fontSize: 12, fontFamily: 'Cairo_400Regular', textAlign: 'right', lineHeight: 19 },
    navigationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 },
    backButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 13, paddingHorizontal: 9 },
    backButtonText: { color: colors.foreground, fontSize: 13, fontFamily: 'Cairo_600SemiBold' },
    primaryButtonSmall: { flex: 1, minHeight: 48, borderRadius: 11, paddingHorizontal: 13, backgroundColor: colors.customerPrimary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    primaryButton: { width: '100%', minHeight: 50, borderRadius: 12, paddingHorizontal: 16, backgroundColor: colors.customerPrimary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 26 },
    primaryButtonText: { color: '#fff', fontSize: 14, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const, textAlign: 'center' },
    disabledButton: { opacity: 0.6 },
    secondaryButton: { width: '100%', minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
    secondaryButtonText: { color: colors.customerPrimary, fontSize: 14, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const },
    successScreen: { flex: 1, backgroundColor: colors.customerBackground, alignItems: 'center', justifyContent: 'center', padding: 24 },
    successIcon: { width: 82, height: 82, borderRadius: 41, backgroundColor: `${colors.customerSuccess}18`, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    successTitle: { color: colors.customerSuccess, fontSize: 21, fontFamily: 'Cairo_700Bold', fontWeight: '700' as const, textAlign: 'center' },
    successBody: { color: colors.mutedForeground, fontSize: 14, fontFamily: 'Cairo_400Regular', textAlign: 'center', marginTop: 8 },
  });