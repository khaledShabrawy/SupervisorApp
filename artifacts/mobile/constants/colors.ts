import { defaultCompanyBrand } from './company-brand';
import { createCompanyTheme } from '@/lib/company-theme';

// Compatibility export. Screens should use useColors() for runtime branding.
const colors = createCompanyTheme(defaultCompanyBrand);
export default colors;