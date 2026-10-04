import type { CompanyBrand } from '@/lib/company-theme';

/**
 * Buyer-specific presentation configuration. Change this one object for a
 * different company, or pass a brand to CompanyBrandProvider at runtime.
 * Never use a brand ID to infer authentication, tenants, roles or permissions.
 */
export const defaultCompanyBrand: CompanyBrand = {
  id: 'zeina',
  name: 'زينة للورقيات',
  primaryColor: '#552988',
  accentColor: '#3195FF',
};