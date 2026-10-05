import { useCallback, useEffect, useRef, useState } from 'react';
interface LocationState {
  latitude: number | null; longitude: number | null; accuracy: number | null;
  error: string | null; loading: boolean;
}
export function useGeolocation() {
  const alive = useRef(false), requestId = useRef(0);
  const [state, setState] = useState<LocationState>({
    latitude: null, longitude: null, accuracy: null, error: null, loading: true,
  });
  const retry = useCallback(() => {
    const id = ++requestId.current;
    setState({ latitude: null, longitude: null, accuracy: null, error: null, loading: true });
    if (!navigator.geolocation) {
      setState({ latitude: null, longitude: null, accuracy: null, error: 'تحديد الموقع غير مدعوم في هذا المتصفح.', loading: false });
      return;
    }
    navigator.geolocation.getCurrentPosition((position) => {
      if (alive.current && id === requestId.current) setState({ latitude: position.coords.latitude, longitude: position.coords.longitude,
        accuracy: position.coords.accuracy, error: null, loading: false });
    }, (error) => {
      if (alive.current && id === requestId.current) setState({ latitude: null, longitude: null, accuracy: null,
        error: error.code === 1 ? 'يرجى السماح بالوصول للموقع.' : 'تعذر تحديد الموقع. تحقق من GPS.', loading: false });
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }, []);
  useEffect(() => {
    alive.current = true;
    retry();
    return () => { alive.current = false; ++requestId.current; };
  }, [retry]);
  return { ...state, retry };
}