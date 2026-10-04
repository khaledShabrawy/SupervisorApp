import type { ConfigContext, ExpoConfig } from 'expo/config';
import { defaultCompanyBrand } from './constants/company-brand.ts';

/** Native launch colors share the same buyer configuration as the React UI. */
export default ({ config }: ConfigContext): ExpoConfig => {
  if (!config.name || !config.slug) throw new Error('Expo app identity is required.');
  return {
    ...config,
    name: config.name,
    slug: config.slug,
    splash: {
      ...config.splash,
      backgroundColor: defaultCompanyBrand.primaryColor,
    },
    android: {
      ...config.android,
      adaptiveIcon: {
        ...config.android?.adaptiveIcon,
        backgroundColor: defaultCompanyBrand.primaryColor,
      },
    },
  };
};