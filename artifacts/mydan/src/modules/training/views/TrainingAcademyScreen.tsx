import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  GraduationCap, Play, CheckCircle2, ArrowRight, Download,
  CheckCheck, BookOpen, Clock, Award
} from '@/components/Icons';
import {
  useCourses, useCourseLessons, useMarkLessonComplete,
  useUpdateWatchSeconds, type CourseWithProgress, type LessonWithProgress
} from '@/lib/training-data';
import { PageTitle } from '@/components/Layout';
import LoadingSpinner from '@/components/LoadingSpinner';
import { t } from '@/i18n';

export default function TrainingAcademyScreen() {
  const [params, setParams] = useSearchParams();
  const activeCourseId = params.get('course');
  const activeLessonId = params.get('lesson');

  const { data: courses, isLoading: coursesLoading } = useCourses();
  const { data: lessons, isLoading: lessonsLoading } = useCourseLessons(activeCourseId);
  const markComplete = useMarkLessonComplete();
  const updateWatch = useUpdateWatchSeconds();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // Active course
  const currentCourse = useMemo(
    () => courses?.find((c) => c.id === activeCourseId) ?? null,
    [courses, activeCourseId]
  );

  // Active lesson
  const currentLesson = useMemo(() => {
    if (!lessons || lessons.length === 0) return null;
    if (activeLessonId) {
      const found = lessons.find((l) => l.id === activeLessonId);
      if (found) return found;
    }
    // Default to first incomplete lesson or first lesson
    return lessons.find((l) => !l.is_completed) || lessons[0];
  }, [lessons, activeLessonId]);

  // Select course
  const selectCourse = useCallback((cId: string) => {
    setParams({ course: cId });
  }, [setParams]);

  // Select lesson
  const selectLesson = useCallback((lId: string) => {
    if (activeCourseId) {
      setParams({ course: activeCourseId, lesson: lId });
    }
  }, [activeCourseId, setParams]);

  // Go back to courses list
  const goBackToCourses = useCallback(() => {
    setParams({});
  }, [setParams]);

  // Speed change
  const changeSpeed = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, []);

  // Resume last watched time on lesson change
  useEffect(() => {
    if (videoRef.current && currentLesson) {
      if (currentLesson.last_watched_seconds > 0) {
        videoRef.current.currentTime = currentLesson.last_watched_seconds;
      }
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [currentLesson?.id]);

  // Save watch progress periodically
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || !currentLesson) return;
    const current = videoRef.current.currentTime;
    if (Math.round(current) % 10 === 0) {
      updateWatch.mutate({ lessonId: currentLesson.id, seconds: current });
    }
  }, [currentLesson, updateWatch]);

  // On video ended, prompt or complete
  const handleVideoEnded = useCallback(() => {
    if (currentLesson && !currentLesson.is_completed) {
      markComplete.mutate({ lessonId: currentLesson.id, completed: true });
    }
  }, [currentLesson, markComplete]);

  // Toggle lesson complete manually
  const toggleComplete = useCallback(() => {
    if (!currentLesson) return;
    markComplete.mutate({
      lessonId: currentLesson.id,
      completed: !currentLesson.is_completed,
    });
  }, [currentLesson, markComplete]);

  const fmtDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  // 1. Course Detail View (Udemy / Coursera style)
  if (activeCourseId) {
    return (
      <div className="page" style={{ paddingBottom: 80 }}>
        {/* Navigation Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button
            onClick={goBackToCourses}
            className="btn ghost"
            style={{ padding: '6px 12px', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowRight size={16} /> العودة لكل المسارات
          </button>
        </div>

        {lessonsLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            {/* Video Player Box */}
            <div
              style={{
                background: '#0F172A',
                borderRadius: 16,
                overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                marginBottom: 16,
              }}
            >
              {currentLesson ? (
                <>
                  <video
                    ref={videoRef}
                    key={currentLesson.id}
                    src={currentLesson.video_url}
                    controls
                    playsInline
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={handleVideoEnded}
                    style={{ width: '100%', maxHeight: 260, display: 'block', backgroundColor: '#000' }}
                  />
                  {/* Player Quick Controls (Speed Bar) */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 16px',
                      background: '#1E293B',
                      color: '#94A3B8',
                      fontSize: 13,
                    }}
                  >
                    <span>سرعة التشغيل:</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[1, 1.25, 1.5, 2].map((s) => (
                        <button
                          key={s}
                          onClick={() => changeSpeed(s)}
                          style={{
                            background: playbackSpeed === s ? '#3B82F6' : '#334155',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            padding: '3px 8px',
                            fontSize: 12,
                            fontWeight: playbackSpeed === s ? 'bold' : 'normal',
                            cursor: 'pointer',
                          }}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: '#fff' }}>لا توجد دروس في هذا المسار حالياً</div>
              )}
            </div>

            {/* Current Lesson Details & Complete Action */}
            {currentLesson && (
              <div className="card" style={{ marginBottom: 16, borderTop: '3px solid #3B82F6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 6px', fontSize: 18, color: '#0F172A' }}>{currentLesson.title}</h3>
                    {currentLesson.description && (
                      <p style={{ margin: 0, fontSize: 14, color: '#64748B', lineHeight: 1.5 }}>
                        {currentLesson.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* PDF Attachment Download (if available) */}
                {currentLesson.attachment_url && (
                  <div style={{ marginTop: 12 }}>
                    <a
                      href={currentLesson.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn ghost"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 13,
                        borderColor: '#CBD5E1',
                      }}
                    >
                      <Download size={16} /> تحميل ملخص الدرس (PDF)
                    </a>
                  </div>
                )}

                {/* The Big Mark as Complete Button */}
                <div style={{ marginTop: 16 }}>
                  <button
                    onClick={toggleComplete}
                    disabled={markComplete.isPending}
                    className="btn"
                    style={{
                      width: '100%',
                      background: currentLesson.is_completed ? '#10B981' : '#3B82F6',
                      color: '#fff',
                      fontSize: 15,
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: 12,
                      borderRadius: 12,
                    }}
                  >
                    {currentLesson.is_completed ? (
                      <>
                        <CheckCheck size={20} /> تم إكمال هذا الدرس بنجاح (اضغط للإلغاء)
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={20} /> {markComplete.isPending ? 'جاري التسجيل...' : '✅ اضغط هنا: تم إنهاء الدرس واحتساب الإنجاز'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Curriculum / Playlist (Udemy / Coursera style) */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BookOpen size={18} color="#3B82F6" /> محتويات المسار التدريبي
                </h4>
                <span style={{ fontSize: 13, color: '#64748B' }}>
                  {lessons?.filter((l) => l.is_completed).length} من {lessons?.length} مكتمل
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lessons?.map((lesson, idx) => {
                  const isActive = currentLesson?.id === lesson.id;
                  return (
                    <div
                      key={lesson.id}
                      onClick={() => selectLesson(lesson.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: 10,
                        cursor: 'pointer',
                        background: isActive ? '#EFF6FF' : '#F8FAFC',
                        border: isActive ? '1px solid #93C5FD' : '1px solid #E2E8F0',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                        {lesson.is_completed ? (
                          <CheckCircle2 size={20} color="#10B981" />
                        ) : isActive ? (
                          <Play size={18} color="#3B82F6" />
                        ) : (
                          <div
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: '50%',
                              border: '2px solid #CBD5E1',
                            }}
                          />
                        )}
                        <div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: isActive ? 'bold' : '500',
                              color: isActive ? '#1D4ED8' : '#1E293B',
                            }}
                          >
                            {lesson.title}
                          </div>
                          {lesson.duration_seconds > 0 && (
                            <div style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={12} /> {fmtDuration(lesson.duration_seconds)}
                            </div>
                          )}
                        </div>
                      </div>

                      {lesson.is_completed && (
                        <span
                          style={{
                            fontSize: 11,
                            background: '#D1FAE5',
                            color: '#065F46',
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontWeight: 'bold',
                          }}
                        >
                          مكتمل
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // 2. All Courses Catalog View
  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      <PageTitle>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GraduationCap size={24} color="#7C3AED" /> أكاديمية التطوير والجدارات البيعية
        </span>
      </PageTitle>

      <div
        style={{
          background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
          color: '#fff',
          padding: 16,
          borderRadius: 16,
          marginBottom: 20,
          boxShadow: '0 4px 15px rgba(124, 58, 237, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Award size={24} />
          <h3 style={{ margin: 0, fontSize: 18 }}>تطوير المشرفين الميدانيين</h3>
        </div>
        <p style={{ margin: 0, fontSize: 13.5, opacity: 0.9, lineHeight: 1.5 }}>
          فيديوهات قصيرة وحقائب تدريبية موجهة لتطوير كفاءتك في إدارة الميدان، فتح العملاء، والتعامل الاحترافي مع التجار والمنافسين.
        </p>
      </div>

      {coursesLoading ? (
        <LoadingSpinner />
      ) : !courses || courses.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <BookOpen size={48} color="#94A3B8" style={{ marginBottom: 12 }} />
          <h3 style={{ margin: '0 0 8px', color: '#334155' }}>لا توجد مسارات تدريبية منشورة حالياً</h3>
          <p style={{ margin: 0, color: '#64748B', fontSize: 14 }}>
            سيقوم مدير الكفاءات (Sales Capability Manager) بنشر المواد قريباً.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {courses.map((course) => (
            <div
              key={course.id}
              className="card"
              style={{
                cursor: 'pointer',
                borderRadius: 14,
                border: '1px solid #E2E8F0',
                transition: 'transform 0.2s ease',
              }}
              onClick={() => selectCourse(course.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span
                  style={{
                    background: '#F3E8FF',
                    color: '#6B21A8',
                    fontSize: 12,
                    fontWeight: 'bold',
                    padding: '3px 10px',
                    borderRadius: 20,
                  }}
                >
                  {course.category}
                </span>
                <span style={{ fontSize: 13, color: '#64748B' }}>
                  {course.total_lessons} دروس
                </span>
              </div>

              <h3 style={{ margin: '0 0 6px', fontSize: 17, color: '#0F172A' }}>{course.title}</h3>
              {course.description && (
                <p style={{ margin: '0 0 14px', fontSize: 13.5, color: '#64748B', lineHeight: 1.5 }}>
                  {course.description}
                </p>
              )}

              {/* Progress Bar (Udemy style) */}
              <div style={{ marginTop: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: '#475569' }}>نسبة الإنجاز</span>
                  <span style={{ fontWeight: 'bold', color: course.progress_pct === 100 ? '#10B981' : '#3B82F6' }}>
                    {course.progress_pct}%
                  </span>
                </div>
                <div style={{ height: 8, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${course.progress_pct}%`,
                      background: course.progress_pct === 100 ? '#10B981' : '#3B82F6',
                      borderRadius: 4,
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>

              <button
                className="btn"
                style={{
                  width: '100%',
                  marginTop: 14,
                  fontSize: 14,
                  background: course.progress_pct === 100 ? '#059669' : '#4F46E5',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '10px',
                }}
              >
                {course.progress_pct === 100 ? '✓ تم إكمال المسار (مراجعة)' : course.progress_pct > 0 ? 'متابعة التدريب ▶' : 'بدء المسار التدريبي ▶'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
