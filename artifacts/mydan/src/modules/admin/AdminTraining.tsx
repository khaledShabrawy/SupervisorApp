import { useState, useCallback, useMemo, ChangeEvent } from 'react';
import {
  GraduationCap, Plus, Video, FileText, Upload, CheckCircle2,
  BarChart3, Users, Clock, Award, Trash2, Pencil, Play
} from '@/components/Icons';
import {
  useAdminCourses, useSaveCourse, useSaveLesson,
  useUploadTrainingFile, useTrainingAnalytics,
} from '@/lib/training-data';
import LoadingSpinner from '@/components/LoadingSpinner';
import { notify } from '@/lib/toast';
import { t } from '@/i18n';

export default function AdminTraining() {
  const [activeTab, setActiveTab] = useState<'content' | 'analytics'>('content');

  // Content Hooks
  const { data: courses, isLoading: coursesLoading } = useAdminCourses();
  const saveCourse = useSaveCourse();
  const saveLesson = useSaveLesson();
  const uploadFile = useUploadTrainingFile();

  // Analytics Hook
  const { data: analytics, isLoading: analyticsLoading } = useTrainingAnalytics();

  // Modal / Form States
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [courseForm, setCourseForm] = useState({ id: '', title: '', description: '', category: 'مهارات المبيعات', display_order: 1 });

  const [showLessonModal, setShowLessonModal] = useState(false);
  const [lessonForm, setLessonForm] = useState({
    id: '', course_id: '', title: '', description: '',
    video_url: '', duration_seconds: 180, display_order: 1, attachment_url: ''
  });

  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  // Open course form
  const openNewCourse = useCallback(() => {
    setCourseForm({ id: '', title: '', description: '', category: 'مهارات المبيعات', display_order: (courses?.length ?? 0) + 1 });
    setShowCourseModal(true);
  }, [courses]);

  // Open lesson form
  const openNewLesson = useCallback((courseId: string) => {
    setLessonForm({
      id: '', course_id: courseId, title: '', description: '',
      video_url: '', duration_seconds: 180, display_order: 1, attachment_url: ''
    });
    setShowLessonModal(true);
  }, []);

  // Handle direct video upload
  const handleVideoFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024 * 1024) {
      notify(t('حجم ملف الفيديو يتعدى 500 ميجابايت'), 'error');
      return;
    }
    setUploadingVideo(true);
    try {
      const res = await uploadFile.mutateAsync({ file, folder: 'videos' });
      setLessonForm((prev) => ({ ...prev, video_url: res.publicUrl }));
      notify(t('تم رفع الفيديو وتجهيزه بنجاح!'), 'success');
    } catch (err: any) {
      notify(err.message || t('فشل رفع الفيديو'), 'error');
    } finally {
      setUploadingVideo(false);
    }
  };

  // Handle PDF upload
  const handlePdfFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPdf(true);
    try {
      const res = await uploadFile.mutateAsync({ file, folder: 'docs' });
      setLessonForm((prev) => ({ ...prev, attachment_url: res.publicUrl }));
      notify(t('تم رفع الملخص المرفق بنجاح!'), 'success');
    } catch (err: any) {
      notify(err.message || t('فشل رفع الملف'), 'error');
    } finally {
      setUploadingPdf(false);
    }
  };

  // Submit Course
  const submitCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseForm.title.trim()) return;
    await saveCourse.mutateAsync({
      id: courseForm.id || undefined,
      title: courseForm.title.trim(),
      description: courseForm.description.trim() || null,
      category: courseForm.category,
      display_order: Number(courseForm.display_order),
    });
    setShowCourseModal(false);
  };

  // Submit Lesson
  const submitLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonForm.title.trim() || !lessonForm.video_url.trim()) {
      notify(t('يرجى كتابة عنوان الدرس ورفع الفيديو أولاً'), 'error');
      return;
    }
    await saveLesson.mutateAsync({
      id: lessonForm.id || undefined,
      course_id: lessonForm.course_id,
      title: lessonForm.title.trim(),
      description: lessonForm.description.trim() || null,
      video_url: lessonForm.video_url.trim(),
      duration_seconds: Number(lessonForm.duration_seconds),
      display_order: Number(lessonForm.display_order),
      attachment_url: lessonForm.attachment_url || null,
    });
    setShowLessonModal(false);
  };

  return (
    <div className="adm-page" style={{ padding: 24, maxWidth: 1200, margin: 'auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 24, display: 'flex', alignItems: 'center', gap: 10, color: '#0F172A' }}>
            <GraduationCap size={28} color="#4F46E5" /> {t('أكاديمية ميدان والجدارات البيعية (Sales Capability)')}
          </h1>
          <p style={{ margin: 0, color: '#64748B', fontSize: 14 }}>
            {t('منصة رفع وإدارة الفيديوهات التدريبية بنمط Udemy/Coursera ومتابعة نسب إنجاز المشرفين الميدانيين.')}
          </p>
        </div>

        {activeTab === 'content' && (
          <button
            onClick={openNewCourse}
            className="btn"
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#4F46E5', color: '#fff', borderRadius: 10 }}
          >
            <Plus size={18} /> {t('إضافة مسار تدريبي جديد')}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 12, borderBottom: '2px solid #E2E8F0', marginBottom: 24 }}>
        <button
          onClick={() => setActiveTab('content')}
          style={{
            padding: '10px 20px',
            fontSize: 15,
            fontWeight: activeTab === 'content' ? 'bold' : 'normal',
            color: activeTab === 'content' ? '#4F46E5' : '#64748B',
            borderBottom: activeTab === 'content' ? '3px solid #4F46E5' : 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Video size={18} /> {t('إدارة المحتوى والفيديوهات')}
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          style={{
            padding: '10px 20px',
            fontSize: 15,
            fontWeight: activeTab === 'analytics' ? 'bold' : 'normal',
            color: activeTab === 'analytics' ? '#4F46E5' : '#64748B',
            borderBottom: activeTab === 'analytics' ? '3px solid #4F46E5' : 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <BarChart3 size={18} /> {t('متابعة نسب إنجاز المشرفين والفروع')}
        </button>
      </div>

      {/* TAB 1: Content Management */}
      {activeTab === 'content' && (
        <>
          {coursesLoading ? (
            <LoadingSpinner />
          ) : !courses || courses.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 50 }}>
              <Video size={48} color="#94A3B8" style={{ marginBottom: 16 }} />
              <h3 style={{ margin: '0 0 8px' }}>{t('لم يتم إنشاء أي مسارات تدريبية بعد')}</h3>
              <p style={{ margin: '0 0 16px', color: '#64748B' }}>
                {t('ابدأ بإنشاء أول مسار تدريبي للمشرفين وارفع الفيديوهات التعليمية الخاصة بشركة زينة.')}
              </p>
              <button onClick={openNewCourse} className="btn" style={{ background: '#4F46E5', color: '#fff' }}>
                <Plus size={18} /> {t('إضافة أول مسار الآن')}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {courses.map((course: any) => (
                <div key={course.id} className="card" style={{ borderRadius: 14, border: '1px solid #CBD5E1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <span style={{ background: '#EEF2FF', color: '#4338CA', padding: '3px 10px', borderRadius: 16, fontSize: 12, fontWeight: 'bold' }}>
                        {course.category}
                      </span>
                      <h2 style={{ margin: '8px 0 4px', fontSize: 18, color: '#1E293B' }}>{course.title}</h2>
                      {course.description && <p style={{ margin: 0, color: '#64748B', fontSize: 14 }}>{course.description}</p>}
                    </div>
                    <button
                      onClick={() => openNewLesson(course.id)}
                      className="btn"
                      style={{ fontSize: 13, background: '#10B981', color: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <Plus size={16} /> {t('إضافة درس / فيديو')}
                    </button>
                  </div>

                  {/* Lessons in this course */}
                  <div style={{ marginTop: 14, borderTop: '1px solid #F1F5F9', paddingTop: 12 }}>
                    <h4 style={{ margin: '0 0 10px', fontSize: 14, color: '#475569' }}>
                      {t('الدروس المرفوعة في هذا المسار ({n}):', { n: course.training_lessons?.length ?? 0 })}
                    </h4>
                    {course.training_lessons && course.training_lessons.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {course.training_lessons
                          .sort((a: any, b: any) => a.display_order - b.display_order)
                          .map((lesson: any, i: number) => (
                            <div
                              key={lesson.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: '#F8FAFC',
                                padding: '10px 14px',
                                borderRadius: 8,
                                border: '1px solid #E2E8F0',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#E0E7FF', color: '#4338CA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold' }}>
                                  {i + 1}
                                </span>
                                <div>
                                  <div style={{ fontSize: 14, fontWeight: '600', color: '#1E293B' }}>{lesson.title}</div>
                                  <div style={{ fontSize: 12, color: '#64748B', display: 'flex', gap: 12 }}>
                                    <span>{t('المدة: {m} دقيقة', { m: Math.floor(lesson.duration_seconds / 60) })}</span>
                                    {lesson.attachment_url && <span style={{ color: '#2563EB' }}>{t('✓ يوجد ملخص PDF')}</span>}
                                  </div>
                                </div>
                              </div>
                              <a
                                href={lesson.video_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn ghost"
                                style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                <Play size={14} /> {t('معاينة الفيديو')}
                              </a>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div style={{ padding: '16px', textAlign: 'center', background: '#F8FAFC', borderRadius: 8, color: '#94A3B8', fontSize: 13 }}>
                        {t('لا توجد دروس مرفوعة في هذا المسار بعد. اضغط "إضافة درس / فيديو" بالأعلى لرفع أول فيديو.')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB 2: Analytics & Completion Tracking */}
      {activeTab === 'analytics' && (
        <>
          {analyticsLoading ? (
            <LoadingSpinner />
          ) : (
            <div>
              {/* Summary KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div className="card" style={{ borderLeft: '4px solid #4F46E5' }}>
                  <div style={{ fontSize: 13, color: '#64748B' }}>{t('إجمالي الدروس المنشورة')}</div>
                  <div style={{ fontSize: 26, fontWeight: 'bold', color: '#1E293B', marginTop: 4 }}>
                    {analytics?.totalLessons ?? 0}
                  </div>
                </div>
                <div className="card" style={{ borderLeft: '4px solid #10B981' }}>
                  <div style={{ fontSize: 13, color: '#64748B' }}>{t('إجمالي المشرفين المسجلين')}</div>
                  <div style={{ fontSize: 26, fontWeight: 'bold', color: '#1E293B', marginTop: 4 }}>
                    {analytics?.supervisors?.length ?? 0}
                  </div>
                </div>
                <div className="card" style={{ borderLeft: '4px solid #F59E0B' }}>
                  <div style={{ fontSize: 13, color: '#64748B' }}>{t('متوسط نسبة الإنجاز العام')}</div>
                  <div style={{ fontSize: 26, fontWeight: 'bold', color: '#1E293B', marginTop: 4 }}>
                    {analytics?.supervisors && analytics.supervisors.length > 0
                      ? Math.round(
                          analytics.supervisors.reduce((acc: number, s: any) => acc + s.completion_pct, 0) /
                            analytics.supervisors.length
                        )
                      : 0}
                    %
                  </div>
                </div>
              </div>

              {/* Supervisors Table */}
              <div className="card" style={{ overflowX: 'auto', padding: 0, borderRadius: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569' }}>
                      <th style={{ padding: '12px 16px' }}>{t('اسم المشرف')}</th>
                      <th style={{ padding: '12px 16px' }}>{t('الفرع')}</th>
                      <th style={{ padding: '12px 16px' }}>{t('الدروس المكتملة')}</th>
                      <th style={{ padding: '12px 16px' }}>{t('نسبة الإنجاز')}</th>
                      <th style={{ padding: '12px 16px' }}>{t('الحالة')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics?.supervisors?.map((s: any) => (
                      <tr key={s.supervisor_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 'bold', color: '#1E293B' }}>{s.name}</td>
                        <td style={{ padding: '12px 16px', color: '#64748B' }}>{s.branch}</td>
                        <td style={{ padding: '12px 16px' }}>
                          {t('{completed} من {total}', { completed: s.completed_count, total: s.total_count })}
                        </td>
                        <td style={{ padding: '12px 16px', minWidth: 160 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 8, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                              <div
                                style={{
                                  height: '100%',
                                  width: `${s.completion_pct}%`,
                                  background: s.completion_pct === 100 ? '#10B981' : '#3B82F6',
                                  borderRadius: 4,
                                }}
                              />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 'bold', minWidth: 35 }}>{s.completion_pct}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {s.completion_pct === 100 ? (
                            <span style={{ background: '#D1FAE5', color: '#065F46', padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 'bold' }}>
                              {t('مكتمل 100% 🏆')}
                            </span>
                          ) : s.completion_pct > 0 ? (
                            <span style={{ background: '#FEF3C7', color: '#92400E', padding: '3px 8px', borderRadius: 6, fontSize: 12 }}>
                              {t('قيد المتابعة')}
                            </span>
                          ) : (
                            <span style={{ background: '#F1F5F9', color: '#64748B', padding: '3px 8px', borderRadius: 6, fontSize: 12 }}>
                              {t('لم يبدأ بعد')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL 1: Create/Edit Course */}
      {showCourseModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 500, borderRadius: 16 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>{t('إضافة مسار تدريبي جديد')}</h3>
            <form onSubmit={submitCourse} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>{t('عنوان المسار التدريبي')}</label>
                <input
                  type="text"
                  required
                  placeholder={t('مثال: فن الزيارة البيعية الفعالة وإدارة الرف')}
                  value={courseForm.title}
                  onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>{t('التصنيف')}</label>
                <input
                  type="text"
                  value={courseForm.category}
                  onChange={(e) => setCourseForm({ ...courseForm, category: e.target.value })}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>{t('الوصف والهدف من المسار')}</label>
                <textarea
                  rows={3}
                  placeholder={t('اكتب نبذة للمشرف توضح ما سيتعلمه في هذا المسار...')}
                  value={courseForm.description}
                  onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>{t('ترتيب الظهور')}</label>
                <input
                  type="number"
                  value={courseForm.display_order}
                  onChange={(e) => setCourseForm({ ...courseForm, display_order: Number(e.target.value) })}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" onClick={() => setShowCourseModal(false)} className="btn ghost">
                  {t('إلغاء')}
                </button>
                <button type="submit" disabled={saveCourse.isPending} className="btn" style={{ background: '#4F46E5', color: '#fff' }}>
                  {saveCourse.isPending ? t('جاري الحفظ...') : t('حفظ ونشر المسار')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Create/Edit Lesson & Upload Video (Udemy style) */}
      {showLessonModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 560, borderRadius: 16, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Video size={20} color="#4F46E5" /> {t('إضافة درس وفيديو تعليمي')}
            </h3>

            <form onSubmit={submitLesson} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>{t('عنوان الدرس')}</label>
                <input
                  type="text"
                  required
                  placeholder={t('مثال: خطوات فتح وتأهيل عميل جديد في الميدان')}
                  value={lessonForm.title}
                  onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>{t('نبذة عن الدرس')}</label>
                <textarea
                  rows={2}
                  placeholder={t('شرح موجز لأهم النقاط في الفيديو...')}
                  value={lessonForm.description}
                  onChange={(e) => setLessonForm({ ...lessonForm, description: e.target.value })}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>

              {/* Direct Video Upload Area (Udemy/Coursera style) */}
              <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 12, border: '2px dashed #CBD5E1' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 'bold', color: '#1E293B', marginBottom: 6 }}>
                  {t('رفع ملف الفيديو مباشرة من جهازك (.mp4, .mov)')}
                </label>
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={handleVideoFile}
                  disabled={uploadingVideo}
                  style={{ display: 'block', fontSize: 13, width: '100%' }}
                />
                {uploadingVideo && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#4F46E5', fontWeight: 'bold' }}>
                    {t('جاري رفع الفيديو وحفظه في السيرفر السحابي الآمن... يرجى الانتظار')}
                  </div>
                )}
                {lessonForm.video_url && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#10B981', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={16} /> {t('تم إرفاق رابط الفيديو بنجاح')}
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>{t('أو رابط الفيديو المباشر')}</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={lessonForm.video_url}
                  onChange={(e) => setLessonForm({ ...lessonForm, video_url: e.target.value })}
                  className="input"
                  style={{ width: '100%', fontSize: 13 }}
                />
              </div>

              {/* PDF Attachment Upload */}
              <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 12, border: '1px solid #E2E8F0' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 'bold', color: '#1E293B', marginBottom: 6 }}>
                  {t('إرفاق ملخص المادة التدريبية (PDF / إنفوجرافيك اختياري)')}
                </label>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={handlePdfFile}
                  disabled={uploadingPdf}
                  style={{ display: 'block', fontSize: 13, width: '100%' }}
                />
                {uploadingPdf && <div style={{ marginTop: 6, fontSize: 12, color: '#4F46E5' }}>{t('جاري رفع الملخص...')}</div>}
                {lessonForm.attachment_url && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#10B981', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={14} /> {t('تم إرفاق الملف')}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>{t('المدة التقديرية (بالثواني)')}</label>
                  <input
                    type="number"
                    value={lessonForm.duration_seconds}
                    onChange={(e) => setLessonForm({ ...lessonForm, duration_seconds: Number(e.target.value) })}
                    className="input"
                    style={{ width: '100%' }}
                  />
                  <small style={{ color: '#64748B' }}>{t('180 = 3 دقائق')}</small>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>{t('ترتيب الدرس')}</label>
                  <input
                    type="number"
                    value={lessonForm.display_order}
                    onChange={(e) => setLessonForm({ ...lessonForm, display_order: Number(e.target.value) })}
                    className="input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button type="button" onClick={() => setShowLessonModal(false)} className="btn ghost">
                  إلغاء
                </button>
                <button type="submit" disabled={saveLesson.isPending || uploadingVideo} className="btn" style={{ background: '#4F46E5', color: '#fff' }}>
                  {saveLesson.isPending ? t('جاري الحفظ...') : t('حفظ ونشر الدرس')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
