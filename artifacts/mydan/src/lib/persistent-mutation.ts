import { supabase } from './supabase';
import { withMutationReceipt, sameInstant, sameJsonValue } from './mutation-receipt';

type Row = Record<string, any>;
type Table = 'visits' | 'attendance' | 'survey_responses';
const columns: Record<Table, string> = {
  visits: 'id,company_id,supervisor_id,customer_id,check_in_time',
  attendance: 'id,company_id,supervisor_id,attendance_date,check_in_time',
  survey_responses: 'id,company_id,supervisor_id,survey_id,visit_id,answers',
};

/** INSERT only: a replay must never reset a completed visit or a delivered order. */
export function insertScopedOnce(table: Table, row: Row): Promise<Row> {
  return withMutationReceipt<Row>(
    () => supabase.from(table).insert(row).select(columns[table]).single(),
    () => {
      let query = supabase.from(table).select(columns[table])
        .eq('company_id', row.company_id).eq('supervisor_id', row.supervisor_id);
      // The live database has UNIQUE(supervisor_id, attendance_date). This also
      // recognizes a legacy committed check-in whose server-generated ID was lost.
      query = table === 'attendance' ? query.eq('attendance_date', row.attendance_date) : query.eq('id', row.id);
      return query.maybeSingle();
    },
    existing => {
      if (existing.company_id !== row.company_id || existing.supervisor_id !== row.supervisor_id) return false;
      if (table === 'attendance') return existing.attendance_date === row.attendance_date && sameInstant(existing.check_in_time, row.check_in_time);
      if (existing.id !== row.id) return false;
      if (table === 'visits') return existing.customer_id === row.customer_id && sameInstant(existing.check_in_time, row.check_in_time);
      return existing.survey_id === row.survey_id && existing.visit_id === row.visit_id
        && sameJsonValue(existing.answers, row.answers);
    },
  );
}

export function finishAttendanceOnce(row: Row): Promise<Row> {
  const select = () => {
    let query = supabase.from('attendance').select('id,company_id,supervisor_id,attendance_date,check_out_time')
      .eq('company_id', row.company_id).eq('supervisor_id', row.supervisor_id);
    return row.id ? query.eq('id', row.id) : query.eq('attendance_date', row.attendance_date);
  };
  return withMutationReceipt<Row>(
    () => {
      let query = supabase.from('attendance').update({ check_out_time: row.check_out_time })
        .eq('company_id', row.company_id).eq('supervisor_id', row.supervisor_id).is('check_out_time', null);
      query = row.id ? query.eq('id', row.id) : query.eq('attendance_date', row.attendance_date);
      return query.select('id,company_id,supervisor_id,attendance_date,check_out_time').single();
    },
    () => select().maybeSingle(),
    existing => existing.company_id === row.company_id && existing.supervisor_id === row.supervisor_id
      && existing.attendance_date === row.attendance_date && sameInstant(existing.check_out_time, row.check_out_time),
  );
}
