import { useEffect, useState } from 'react';
interface LocationState {
  latitude: number | null; longitude: number | null; accuracy: number | null;
  error: string | null; loading: boolean;
}
export function useGeolocation() {
  const [state, setState] = useState<LocationState>({
    latitude: null, longitude: null, accuracy: null, error: null, loading: true,
  });
  useEffect(() => {
    let alive = true;
    if (!navigator.geolocation) {
      setState({ latitude: null, longitude: null, accuracy: null, error: 'تحديد الموقع غير مدعوم في هذا المتصفح.', loading: false });
      return;
    }
    navigator.geolocation.getCurrentPosition((position) => {
      if (alive) setState({ latitude: position.coords.latitude, longitude: position.coords.longitude,
        accuracy: position.coords.accuracy, error: null, loading: false });
    }, (error) => {
      if (alive) setState({ latitude: null, longitude: null, accuracy: null,
        error: error.code === 1 ? 'يرجى السماح بالوصول للموقع.' : 'تعذر تحديد الموقع. تحقق من GPS.', loading: false });
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    return () => { alive = false; };
  }, []);
  return state;
}