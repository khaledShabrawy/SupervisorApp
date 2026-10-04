import { useColorScheme } from 'react-native';
import { useCompanyBrand } from '@/contexts/CompanyBrandContext';

/** Semantic colors for the selected buyer and the device's light/dark mode. */
export function useColors() {
  const { theme } = useCompanyBrand();
  const scheme = useColorScheme();
  return { ...(scheme === 'dark' ? theme.dark : theme.light), radius: theme.radius };
}