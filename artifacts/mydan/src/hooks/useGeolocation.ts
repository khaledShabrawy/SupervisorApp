import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';

interface LocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  loading: boolean;
  isMock: boolean;
  mockWarning: string | null;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useGeolocation() {
  const alive = useRef(false);
  const requestId = useRef(0);
  const [state, setState] = useState<LocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    error: null,
    loading: true,
    isMock: false,
    mockWarning: null,
  });

  const retry = useCallback(() => {
    const id = ++requestId.current;
    setState({
      latitude: null,
      longitude: null,
      accuracy: null,
      error: null,
      loading: true,
      isMock: false,
      mockWarning: null,
    });

    if (!navigator.geolocation) {
      setState({
        latitude: null,
        longitude: null,
        accuracy: null,
        error: t('تحديد الموقع غير مدعوم في هذا المتصفح أو الجهاز.'),
        loading: false,
        isMock: false,
        mockWarning: null,
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!alive.current || id !== requestId.current) return;

        const coords = position.coords;
        const lat = coords.latitude;
        const lng = coords.longitude;
        const accuracy = coords.accuracy;

        // 1. Android / Browser mock flags
        let mockDetected = Boolean(
          (coords as any).isMock ||
          (position as any).isMock ||
          (position as any).mocked
        );
        let warning: string | null = null;

        // 2. Suspicious accuracy anomalies (e.g. 0 or negative accuracy)
        if (accuracy <= 0) {
          mockDetected = true;
          warning = t('تم رصد إحداثيات موقع مصطنعة (دقة GPS غير واقعية).');
        }

        // 3. Teleportation / speed jump detection (> 180 km/h)
        try {
          const rawLast = sessionStorage.getItem('mydan_last_gps_fix');
          const now = Date.now();
          if (rawLast) {
            const last = JSON.parse(rawLast);
            const deltaSec = (now - last.t) / 1000;
            if (deltaSec > 3 && deltaSec < 3600) {
              const distMeters = haversineMeters(last.lat, last.lng, lat, lng);
              const speedKmH = (distMeters / deltaSec) * 3.6;
              // If speed exceeds 200 km/h between check-ins, flag as suspicious spoofing
              if (speedKmH > 200 && distMeters > 1000) {
                mockDetected = true;
                warning = t('تم رصد قفزة موقع غير واقعية بسرعة {v} كم/ساعة (اشتباه Fake GPS).', {
                  v: Math.round(speedKmH),
                });
              }
            }
          }
          if (!mockDetected) {
            sessionStorage.setItem('mydan_last_gps_fix', JSON.stringify({ lat, lng, t: now }));
          }
        } catch {
          // ignore session storage failures
        }

        if (mockDetected && !warning) {
          warning = t('تم رصد تطبيق تزييف موقع (Mock/Fake GPS). لا يُسمح بتسجيل الزيارات عبر مواقع وهمية.');
        }

        setState({
          latitude: lat,
          longitude: lng,
          accuracy,
          error: null,
          loading: false,
          isMock: mockDetected,
          mockWarning: warning,
        });
      },
      (error) => {
        if (!alive.current || id !== requestId.current) return;
        setState({
          latitude: null,
          longitude: null,
          accuracy: null,
          error:
            error.code === 1
              ? t('يرجى السماح للتطبيق بالوصول للموقع.')
              : t('تعذر تحديد الموقع. تحقق من تشغيل GPS.'),
          loading: false,
          isMock: false,
          mockWarning: null,
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    alive.current = true;
    retry();
    return () => {
      alive.current = false;
      ++requestId.current;
    };
  }, [retry]);

  return { ...state, retry };
}