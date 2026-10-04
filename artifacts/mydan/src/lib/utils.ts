type ClassValue = string | number | boolean | null | undefined | ClassValue[] | Record<string, unknown>;
export function cn(...inputs: ClassValue[]): string {
  return inputs.flatMap(input => {
    if (!input) return [];
    if (Array.isArray(input)) return [cn(...input)];
    if (typeof input === 'object') return Object.keys(input).filter(key => input[key]);
    return [String(input)];
  }).join(' ');
}