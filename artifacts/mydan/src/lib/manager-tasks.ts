import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useScope } from './data';
import { notify } from './toast';
import { managerTaskInput, type ManagerTaskDraft } from './manager-task-input';
import { t } from '@/i18n';

export function useSaveManagerTask() {
  const sc=useScope(),qc=useQueryClient();
  return useMutation({
    mutationFn: async (draft: ManagerTaskDraft) => {
      if (!['admin','super_admin','branch_manager'].includes(sc.supervisor.role)) throw new Error(t('هذه العملية للمدراء فقط.'));
      const {data,error}=await supabase.rpc('mdn_save_visit_task_v1',managerTaskInput(draft));
      if(error || data!==draft.taskId) throw new Error(t('تعذر تأكيد حفظ مهمة الزيارة. تحقق من جاهزية الخادم ثم أعد المحاولة.'));
      return data as string;
    },
    onSuccess:(_id,draft)=>{
      notify(t('تم حفظ مهمة الزيارة'), 'success');
      void qc.invalidateQueries({queryKey:[...sc.base,'visit-detail',draft.visitId]});
    },
    onError:(error:Error)=>notify(error.message,'error'),
  });
}
