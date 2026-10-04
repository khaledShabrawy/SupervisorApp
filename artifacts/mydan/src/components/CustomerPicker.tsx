import { memo, useCallback, useState } from 'react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Search } from '@/components/Icons';
import { useCustomerSearch } from '@/lib/data';
import type { Customer } from '@/types/database';
import { ErrorState } from '@/components/States';

export function CustomerPicker({ value, onChange }: { value: Customer | null; onChange: (c: Customer) => void }) {
  const [term, setTerm] = useState(''); const q = useCustomerSearch(useDebouncedValue(term, 300));
  const change = useCallback((event: React.ChangeEvent<HTMLInputElement>) => setTerm(event.target.value), []);
  const retry = useCallback(() => void q.refetch(), [q.refetch]);
  return <div className="col">
    <div style={{ position: 'relative' }}>
      <Search size={18} style={{ position: 'absolute', insetInlineStart: 12, top: 15, color: 'var(--muted)' }} />
      <input className="input" style={{ paddingInlineStart: 38 }} placeholder="ابحث عن عميل..." value={term} onChange={change} data-testid="input-customer-search" />
    </div>
    {q.isPending ? <div className="skel" style={{ height: 48 }} /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
      : q.data.length === 0 ? <div className="muted">لا يوجد عملاء مطابقون.</div>
      : q.data.map((c) => <CustomerOption key={c.id} customer={c} selected={value?.id === c.id} onChange={onChange} />)}
  </div>;
}
const CustomerOption = memo(function CustomerOption({ customer, selected, onChange }: {
  customer: Customer; selected: boolean; onChange: (c: Customer) => void;
}) {
  const choose = useCallback(() => onChange(customer), [onChange, customer]);
  return <button type="button" className={`chip ${selected ? 'on' : ''}`} style={{ textAlign: 'start', borderRadius: 12 }}
    onClick={choose} data-testid={`pick-customer-${customer.id}`}>{customer.name}</button>;
});
