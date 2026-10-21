import { memo, useCallback, useState } from 'react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { MapPin, Search } from '@/components/Icons';
import { useCustomerSearch } from '@/lib/data';
import type { Customer } from '@/types/database';
import { ErrorState } from '@/components/States';
import { t } from '@/i18n';

export function CustomerPicker({ value, onChange }: { value: Customer | null; onChange: (c: Customer) => void }) {
  const [term, setTerm] = useState('');
  const q = useCustomerSearch(useDebouncedValue(term, 300));
  const change = useCallback((event: React.ChangeEvent<HTMLInputElement>) => setTerm(event.target.value), []);
  const retry = useCallback(() => void q.refetch(), [q.refetch]);

  return (
    <div className="col" style={{ gap: 8 }}>
      <div style={{ position: 'relative' }}>
        <Search size={18} style={{ position: 'absolute', insetInlineStart: 12, top: 15, color: 'var(--muted)' }} />
        <input
          className="input"
          style={{ paddingInlineStart: 38 }}
          placeholder={t('ابحث عن عميل بالاسم أو الكود أو العنوان...')}
          value={term}
          onChange={change}
          data-testid="input-customer-search"
        />
      </div>
      {q.isPending ? (
        <div className="skel" style={{ height: 48 }} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={retry} />
      ) : q.data.length === 0 ? (
        <div className="muted" style={{ padding: 8, fontSize: 13 }}>{t('لا يوجد عملاء مطابقون.')}</div>
      ) : (
        <div className="col" style={{ gap: 6 }}>
          {q.data.map((c) => (
            <CustomerOption key={c.id} customer={c} selected={value?.id === c.id} onChange={onChange} />
          ))}
        </div>
      )}
    </div>
  );
}

const CustomerOption = memo(function CustomerOption({
  customer,
  selected,
  onChange,
}: {
  customer: Customer;
  selected: boolean;
  onChange: (c: Customer) => void;
}) {
  const choose = useCallback(() => onChange(customer), [onChange, customer]);
  return (
    <button
      type="button"
      className={`chip ${selected ? 'on' : ''}`}
      style={{
        textAlign: 'start',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 4,
        padding: '10px 14px',
        width: '100%',
      }}
      onClick={choose}
      data-testid={`pick-customer-${customer.id}`}
    >
      <div className="row" style={{ alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {customer.customer_code && (
          <span className="badge b-blue" style={{ fontFamily: 'monospace', fontSize: 11, padding: '1px 6px' }}>
            {customer.customer_code}
          </span>
        )}
        <span style={{ fontWeight: 600, fontSize: 14 }}>{customer.name}</span>
      </div>
      {customer.address && (
        <div className="muted row" style={{ fontSize: 12, gap: 4, alignItems: 'center', marginTop: 2 }}>
          <MapPin size={13} style={{ flexShrink: 0 }} />
          <span>{customer.address}</span>
        </div>
      )}
    </button>
  );
});
