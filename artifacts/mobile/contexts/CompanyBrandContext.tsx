import React, { createContext, useContext, useMemo } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { defaultCompanyBrand } from '@/constants/company-brand';
import { createCompanyTheme, type CompanyBrand, type CompanyTheme } from '@/lib/company-theme';

interface BrandValue {
  brand: CompanyBrand;
  theme: CompanyTheme;
  logo: ImageSourcePropType | undefined;
}
function buildValue(brand: CompanyBrand): BrandValue {
  if (brand.logoUri && !/^https:\/\/[^/\s]+(?:\/[^\s]*)?$/.test(brand.logoUri)) {
    throw new Error('Company logo must be a public HTTPS URL.');
  }
  return {
    brand,
    theme: createCompanyTheme(brand),
    logo: brand.logoUri ? { uri: brand.logoUri }
      : brand.id === 'zeina' ? require('../assets/zeina-logo.png') : undefined,
  };
}
const BrandContext = createContext<BrandValue>(buildValue(defaultCompanyBrand));

/** A future company-selection flow can update this prop without rewriting screens. */
export function CompanyBrandProvider({
  brand = defaultCompanyBrand,
  children,
}: React.PropsWithChildren<{ brand?: CompanyBrand }>) {
  const value = useMemo(() => buildValue(brand), [brand]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useCompanyBrand() {
  return useContext(BrandContext);
}