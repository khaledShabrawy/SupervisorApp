import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useScope } from './data';
import { notify } from './toast';
import type { TrainingCourse, TrainingLesson, SupervisorTrainingProgress } from '@/types/database';

export const TRAINING_BUCKET = 'training-materials';

export interface CourseWithProgress extends TrainingCourse {
  total_lessons: number;
  completed_lessons: number;
  progress_pct: number;
}

export interface LessonWithProgress extends TrainingLesson {
  is_completed: boolean;
  last_watched_seconds: number;
}

/** Hook to fetch all published courses with the supervisor's completion percentage */
export function useCourses() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'training', 'courses'],
    queryFn: async () => {
      const { data: courses, error: coursesErr } = await supabase
        .from('training_courses')
        .select('*')
        .eq('company_id', sc.companyId)
        .eq('is_published', true)
        .order('display_order', { ascending: true });

      if (coursesErr) throw new Error(coursesErr.message);

      const { data: lessons, error: lessonsErr } = await supabase
        .from('training_lessons')
        .select('id, course_id')
        .eq('company_id', sc.companyId)
        .eq('is_published', true);

      if (lessonsErr) throw new Error(lessonsErr.message);

      const { data: progress, error: progErr } = await supabase
        .from('supervisor_training_progress')
        .select('lesson_id, is_completed')
        .eq('company_id', sc.companyId)
        .eq('supervisor_id', sc.supervisorId)
        .eq('is_completed', true);

      if (progErr) throw new Error(progErr.message);

      const completedLessonIds = new Set((progress ?? []).map((p) => p.lesson_id));

      const list: CourseWithProgress[] = (courses ?? []).map((c) => {
        const cLessons = (lessons ?? []).filter((l) => l.course_id === c.id);
        const total = cLessons.length;
        const completed = cLessons.filter((l) => completedLessonIds.has(l.id)).length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        return {
          ...c,
          total_lessons: total,
          completed_lessons: completed,
          progress_pct: pct,
        };
      });

      return list;
    },
  });
}

/** Hook to fetch lessons of a course with supervisor completion flags */
export function useCourseLessons(courseId: string | null) {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'training', 'course-lessons', courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data: lessons, error: lErr } = await supabase
        .from('training_lessons')
        .select('*')
        .eq('course_id', courseId!)
        .eq('company_id', sc.companyId)
        .eq('is_published', true)
        .order('display_order', { ascending: true });

      if (lErr) throw new Error(lErr.message);

      const { data: progress, error: pErr } = await supabase
        .from('supervisor_training_progress')
        .select('lesson_id, is_completed, last_watched_seconds')
        .eq('company_id', sc.companyId)
        .eq('supervisor_id', sc.supervisorId);

      if (pErr) throw new Error(pErr.message);

      const progMap = new Map((progress ?? []).map((p) => [p.lesson_id, p]));

      const list: LessonWithProgress[] = (lessons ?? []).map((l) => {
        const p = progMap.get(l.id);
        return {
          ...l,
          is_completed: p?.is_completed ?? false,
          last_watched_seconds: p?.last_watched_seconds ?? 0,
        };
      });

      return list;
    },
  });
}

/** Hook to mark a lesson as completed */
export function useMarkLessonComplete() {
  const sc = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lessonId, completed = true }: { lessonId: string; completed?: boolean }) => {
      const { error } = await supabase.from('supervisor_training_progress').upsert(
        {
          company_id: sc.companyId,
          supervisor_id: sc.supervisorId,
          lesson_id: lessonId,
          is_completed: completed,
          completed_at: completed ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'supervisor_id,lesson_id' }
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...sc.base, 'training'] });
      notify('تم تسجيل إتمام الدرس بنجاح! أحسنت 👏', 'success');
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

/** Hook to update watch progress seconds */
export function useUpdateWatchSeconds() {
  const sc = useScope();
  return useMutation({
    mutationFn: async ({ lessonId, seconds }: { lessonId: string; seconds: number }) => {
      await supabase.from('supervisor_training_progress').upsert(
        {
          company_id: sc.companyId,
          supervisor_id: sc.supervisorId,
          lesson_id: lessonId,
          last_watched_seconds: Math.round(seconds),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'supervisor_id,lesson_id' }
      );
    },
  });
}

/** Admin: Hook to upload training video or PDF to Supabase Storage */
export function useUploadTrainingFile() {
  const sc = useScope();
  return useMutation({
    mutationFn: async ({ file, folder = 'videos' }: { file: File; folder?: 'videos' | 'docs' | 'thumbs' }) => {
      const ext = file.name.split('.').pop() || 'mp4';
      const uid = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const path = `${sc.companyId}/${folder}/${Date.now()}-${uid}.${ext}`;

      const { data, error } = await supabase.storage.from(TRAINING_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: true,
      });

      if (error) throw new Error(`فشل رفع الملف: ${error.message}`);

      const { data: pubData } = supabase.storage.from(TRAINING_BUCKET).getPublicUrl(path);
      return { path: data.path, publicUrl: pubData.publicUrl, fileName: file.name };
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

/** Admin: Hook to fetch all courses for management */
export function useAdminCourses() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'admin-training-courses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_courses')
        .select('*, training_lessons(*)')
        .eq('company_id', sc.companyId)
        .order('display_order', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

/** Admin: Hook to save/update course */
export function useSaveCourse() {
  const sc = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (course: Partial<TrainingCourse>) => {
      if (course.id) {
        const { error } = await supabase
          .from('training_courses')
          .update({ ...course, updated_at: new Date().toISOString() })
          .eq('id', course.id)
          .eq('company_id', sc.companyId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from('training_courses')
          .insert({ ...course, company_id: sc.companyId });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...sc.base, 'admin-training-courses'] });
      void qc.invalidateQueries({ queryKey: [...sc.base, 'training'] });
      notify('تم حفظ بيانات المسار التدريبي بنجاح', 'success');
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

/** Admin: Hook to save/update lesson */
export function useSaveLesson() {
  const sc = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lesson: Partial<TrainingLesson>) => {
      if (lesson.id) {
        const { error } = await supabase
          .from('training_lessons')
          .update(lesson)
          .eq('id', lesson.id)
          .eq('company_id', sc.companyId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from('training_lessons')
          .insert({ ...lesson, company_id: sc.companyId });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...sc.base, 'admin-training-courses'] });
      void qc.invalidateQueries({ queryKey: [...sc.base, 'training'] });
      notify('تم حفظ الدرس والفيديو بنجاح', 'success');
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

/** Admin: Analytics of supervisor training completion */
export function useTrainingAnalytics() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'admin-training-analytics'],
    queryFn: async () => {
      const { data: supervisors, error: sErr } = await supabase
        .from('supervisors')
        .select('id, full_name, branch, role')
        .eq('company_id', sc.companyId)
        .eq('is_active', true);
      if (sErr) throw new Error(sErr.message);

      const { data: totalLessons, error: lErr } = await supabase
        .from('training_lessons')
        .select('id')
        .eq('company_id', sc.companyId)
        .eq('is_published', true);
      if (lErr) throw new Error(lErr.message);

      const totalCount = totalLessons?.length ?? 0;

      const { data: progress, error: pErr } = await supabase
        .from('supervisor_training_progress')
        .select('supervisor_id, lesson_id, is_completed, updated_at')
        .eq('company_id', sc.companyId)
        .eq('is_completed', true);
      if (pErr) throw new Error(pErr.message);

      const supMap = new Map<string, { completedCount: number; lastActive: string | null }>();
      (progress ?? []).forEach((p) => {
        const curr = supMap.get(p.supervisor_id) || { completedCount: 0, lastActive: null };
        curr.completedCount += 1;
        if (!curr.lastActive || p.updated_at > curr.lastActive) {
          curr.lastActive = p.updated_at;
        }
        supMap.set(p.supervisor_id, curr);
      });

      const rows = (supervisors ?? []).map((s) => {
        const info = supMap.get(s.id) || { completedCount: 0, lastActive: null };
        const pct = totalCount > 0 ? Math.round((info.completedCount / totalCount) * 100) : 0;
        return {
          supervisor_id: s.id,
          name: s.full_name,
          branch: s.branch || 'غير محدد',
          role: s.role,
          completed_count: info.completedCount,
          total_count: totalCount,
          completion_pct: pct,
          last_active: info.lastActive,
        };
      });

      return {
        totalLessons: totalCount,
        supervisors: rows,
      };
    },
  });
}
