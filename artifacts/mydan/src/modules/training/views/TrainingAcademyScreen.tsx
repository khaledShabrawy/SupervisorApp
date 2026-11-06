import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  GraduationCap, Play, CheckCircle2, ArrowRight, Download,
  CheckCheck, BookOpen, Clock, Award, ShieldCheck, Zap, RefreshCw, FileText
} from '@/components/Icons';
import {
  useCourses, useCourseLessons, useMarkLessonComplete,
  useUpdateWatchSeconds, type CourseWithProgress, type LessonWithProgress
} from '@/lib/training-data';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { PageTitle } from '@/components/Layout';
import LoadingSpinner from '@/components/LoadingSpinner';
import { fmtDate } from '@/lib/format';
import { t } from '@/i18n';

// ── FMCG Field Decision Scenarios ──────────────────────────────────────────
interface ScenarioOption {
  text: string;
  isBest: boolean;
  explanation: string;
  points: number;
}

interface Scenario {
  id: string;
  category: string;
  title: string;
  situation: string;
  options: ScenarioOption[];
}

const SCENARIOS: Scenario[] = [
  {
    id: 'planogram-negotiation',
    category: 'إدارة الرف والـ Planogram',
    title: 'مفاوضات مساحة الرف أمام المنافس الشرس',
    situation: 'مدير سوبرماركت كبير يقرر تقليص مساحة منتجاتنا من 4 واجهات إلى واجهتين لصالح منافس يعرض عليه بونصاً مجانياً مؤقتاً.',
    options: [
      {
        text: 'قبول طلبه لتجنب المشاكل وفقدان العميل.',
        isBest: false,
        explanation: 'خاطئ ❌: التنازل عن الواجهات يخفض الحصة السوقية (Share of Shelf) بنسبة 50% ويقلل الرؤية البصرية للمستهلكين.',
        points: 0,
      },
      {
        text: 'إبلاغ التاجر بوقف التوريد وسحب الثلاجة فوراً.',
        isBest: false,
        explanation: 'خاطئ ❌: التصعيد العدائي يفقدك نقطة بيع استراتيجية لصالح المنافس ويخالف مهارات التفاوض البيعي.',
        points: 0,
      },
      {
        text: 'مراجعة توافر الأصناف واقتراح ترتيب الرف بنظام Eye-Level وتوثيق الملاحظات للمدير.',
        isBest: true,
        explanation: 'ممتاز 🌟: أسلوب تفاوض FMCG احترافي؛ اعتمدت على لغة الأرقام وسرعة الدوران وأقنعت التاجر بمصلحته المالية دون خسارة الواجهات.',
        points: 25,
      },
    ],
  },
  {
    id: 'oos-crisis',
    category: 'إدارة النواقص وسلسلة التوريد',
    title: 'أزمة نفاد المخزون (OOS) والعميل الغاضب',
    situation: 'وصلت لمتجر مميز واكتشفت نفاد المنتج الرئيسي تماماً من الرف منذ يومين، والتاجر غاضب ويفكر في توجيه المستهلكين للمنافس.',
    options: [
      {
        text: 'تسجيل ملاحظة في التقرير وانتظار دورة التوريد الأسبوعية القادمة.',
        isBest: false,
        explanation: 'خاطئ ❌: كل يوم تأخير في الـ OOS يكلفك 15% خسارة دائمة في ولاء المستهلكين لصالح البدائل المنافسة.',
        points: 0,
      },
      {
        text: 'تجاهل النقص وعدم توثيقه في تقرير الزيارة.',
        isBest: false,
        explanation: 'خاطئ ❌: هذا يقلل هامش ربح التاجر ويظهر عجز منظومة التوزيع التابعة لشركتك.',
        points: 0,
      },
      {
        text: 'التنسيق الفوري مع مندوب خط التوزيع لتحويل طارئ (Stock Transfer) خلال ساعتين وتوثيق حالة النقص للمدير.',
        isBest: true,
        explanation: 'ممتاز 🌟: التحرك السريع في حالات الـ OOS الحرجة يحمي حصة الرف ويحول غضب التاجر إلى ولاء مضاعف للشركة.',
        points: 25,
      },
    ],
  },
  {
    id: 'perfect-store-execution',
    category: 'معايير المتجر النموذجي',
    title: 'تنفيذ معايير الرف الذهبي والـ FIFO',
    situation: 'أثناء تدقيق المتجر، لاحظت وجود منتجات قديمة في المقدمة ومنتجات حديثة في الخلف مع غياب بطاقات الأسعار المعتمدة.',
    options: [
      {
        text: 'التقاط صورة الرف كما هو لتسجيل الزيارة سريعاً والانتقال للعميل التالي.',
        isBest: false,
        explanation: 'خاطئ ❌: تهاون في معايير الجودة يؤدي إلى تقييم سلبي للتدقيق واحتمالية تراكم رواكد منتهية الصلاحية.',
        points: 0,
      },
      {
        text: 'تنبيه عامل المتجر والمغادرة فوراً دون تعديل الرف.',
        isBest: false,
        explanation: 'خاطئ ❌: دور المشرف يتضمن التوجيه الميداني العملي وتصحيح العرض وليس مجرد المراقبة السلبية.',
        points: 0,
      },
      {
        text: 'تطبيق قاعدة FIFO (ما يدخل أولاً يُعرض أولاً)، وضع بطاقات الأسعار وتثبيت مواد الـ POSM للحصول على تقييم Perfect Store كامل.',
        isBest: true,
        explanation: 'ممتاز 🌟: هذا جوهر عمل المشرف الميداني المتميز؛ ضمان العرض المثالي، حماية الصلاحيات، وتحقيق شروط المتجر النموذجي.',
        points: 25,
      },
    ],
  },
];

// ── FMCG Knowledge Quiz ────────────────────────────────────────────────────
interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    question: 'ما هو المقصود بنسبة حصة الرف (Share of Shelf)؟',
    options: [
      'نسبة واجهات عرض علامتنا (Facings) مقارنة بإجمالي واجهات الرف بالقسم.',
      'نسبة البضاعة التالفة في مخزن التاجر.',
      'عدد الفواتير الصادرة للعميل شهرياً.',
    ],
    correctIndex: 0,
    explanation: 'حصة الرف = (واجهات علامتنا ÷ إجمالي واجهات الصنف في الرف) × 100.',
  },
  {
    id: 2,
    question: 'لماذا يُطلق على الرف في مستوى النظر (Eye-Level) "الرف الذهبي"؟',
    options: [
      'لأنه يستحوذ على أكثر من 60% من قرارات الشراء العفوية للمتسوقين.',
      'لأنه الرف الأقل تكلفة في النظافة والصيانة.',
      'لأنه مخصص للمنتجات منخفضة السعر فقط.',
    ],
    correctIndex: 0,
    explanation: 'مستوى النظر (من 120 إلى 160 سم) هو المنطقة الأكثر جذباً لبصر المتسوق وتدر أعلى معدلات مبيعات.',
  },
  {
    id: 3,
    question: 'ما هو النطاق المعتمد للسياج الجغرافي (Geofencing) في زيارات المشرفين؟',
    options: [
      'بين 100 و 200 متر حول إحداثيات المتجر المعتمدة على الخريطة.',
      '5 كيلومترات من الفرع الرئيسي.',
      '20 متراً فقط بدقة مطلقة.',
    ],
    correctIndex: 0,
    explanation: 'السياج الجغرافي الميداني النموذجي هو 100-200م لتعويض تباين إشارات الـ GPS بين الأبنية العالية.',
  },
  {
    id: 4,
    question: 'ماذا يعني اختصار (OOS) وما خطورته المباشرة على الشركة؟',
    options: [
      'Out of Stock (نفاد المخزون) ويؤدي إلى تحول العميل لشراء صنف المنافس وفقدان الحصة.',
      'Order on Sale (طلب تحت التخفيض).',
      'Outlet Operation Score (تقييم تشغيل المنفذ).',
    ],
    correctIndex: 0,
    explanation: 'الـ OOS هو أكبر مهدد للحصة السوقية في قطاع التجزئة ويفقد المستهلك النهائي لصالح المنافسين.',
  },
  {
    id: 5,
    question: 'ما هي قاعدة (FIFO) في ترتيب المعروضات بالمخزن والرف؟',
    options: [
      'الوارد أولاً يُصرف أولاً (First In, First Out) لحماية المنتجات من انتهاء الصلاحية.',
      'وضع أحدث إنتاج في الواجهة دائماً.',
      'بيع البضاعة الأغلى سعراً قبل الرخيصة.',
    ],
    correctIndex: 0,
    explanation: 'تطبيق الـ FIFO يضمن دوران البضاعة الأقدم أولاً ويحمي التاجر والشركة من خسائر تواريخ الصلاحية.',
  },
];

export default function TrainingAcademyScreen() {
  const { supervisor } = useAuth();
  const settings = useAppSettings();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // Navigation tabs: 'courses' | 'simulator' | 'quiz' | 'badges'
  const activeTab = params.get('tab') || 'courses';
  const activeCourseId = params.get('course');
  const activeLessonId = params.get('lesson');

  const setTab = useCallback((tab: string) => {
    setParams({ tab });
  }, [setParams]);

  // Video Course Queries
  const { data: courses, isLoading: coursesLoading } = useCourses();
  const { data: lessons, isLoading: lessonsLoading } = useCourseLessons(activeCourseId);
  const markComplete = useMarkLessonComplete();
  const updateWatch = useUpdateWatchSeconds();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // Active course & lesson
  const currentCourse = useMemo(
    () => courses?.find((c) => c.id === activeCourseId) ?? null,
    [courses, activeCourseId]
  );
  const currentLesson = useMemo(() => {
    if (!lessons || lessons.length === 0) return null;
    if (activeLessonId) {
      const found = lessons.find((l) => l.id === activeLessonId);
      if (found) return found;
    }
    return lessons.find((l) => !l.is_completed) || lessons[0];
  }, [lessons, activeLessonId]);

  const selectCourse = useCallback((cId: string) => {
    setParams({ tab: 'courses', course: cId });
  }, [setParams]);

  const selectLesson = useCallback((lId: string) => {
    if (activeCourseId) {
      setParams({ tab: 'courses', course: activeCourseId, lesson: lId });
    }
  }, [activeCourseId, setParams]);

  const goBackToCourses = useCallback(() => {
    setParams({ tab: 'courses' });
  }, [setParams]);

  const changeSpeed = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, []);

  useEffect(() => {
    if (videoRef.current && currentLesson) {
      if (currentLesson.last_watched_seconds > 0) {
        videoRef.current.currentTime = currentLesson.last_watched_seconds;
      }
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [currentLesson?.id]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && currentLesson) {
      const sec = videoRef.current.currentTime;
      if (Math.round(sec) % 15 === 0) {
        updateWatch.mutate({ lessonId: currentLesson.id, seconds: sec });
      }
    }
  }, [currentLesson, updateWatch]);

  const handleVideoEnded = useCallback(() => {
    if (currentLesson && !currentLesson.is_completed) {
      markComplete.mutate({ lessonId: currentLesson.id, completed: true });
    }
  }, [currentLesson, markComplete]);

  const toggleComplete = useCallback(() => {
    if (currentLesson) {
      markComplete.mutate({ lessonId: currentLesson.id, completed: !currentLesson.is_completed });
    }
  }, [currentLesson, markComplete]);

  // ── Simulator Local Storage & State ──────────────────────────────────────
  const supId = supervisor?.id || 'guest';
  const simStorageKey = `mydan_simulator_${supId}`;
  const quizStorageKey = `mydan_quiz_${supId}`;

  const [scenarioAnswers, setScenarioAnswers] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(simStorageKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const selectScenarioOption = useCallback((scenarioId: string, optionIdx: number) => {
    setScenarioAnswers((prev) => {
      const next = { ...prev, [scenarioId]: optionIdx };
      try {
        localStorage.setItem(simStorageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [simStorageKey]);

  const totalSimulatorScore = useMemo(() => {
    return SCENARIOS.reduce((total, sc) => {
      const chosen = scenarioAnswers[sc.id];
      if (chosen != null) {
        return total + sc.options[chosen].points;
      }
      return total;
    }, 0);
  }, [scenarioAnswers]);

  // ── Quiz State ───────────────────────────────────────────────────────────
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>(() => {
    try {
      const saved = localStorage.getItem(quizStorageKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(() => {
    return Object.keys(quizAnswers).length === QUIZ_QUESTIONS.length;
  });

  const selectQuizAnswer = useCallback((qId: number, optIdx: number) => {
    if (quizSubmitted) return;
    setQuizAnswers((prev) => ({ ...prev, [qId]: optIdx }));
  }, [quizSubmitted]);

  const submitQuiz = useCallback(() => {
    setQuizSubmitted(true);
    try {
      localStorage.setItem(quizStorageKey, JSON.stringify(quizAnswers));
    } catch {}
  }, [quizAnswers, quizStorageKey]);

  const resetQuiz = useCallback(() => {
    setQuizAnswers({});
    setQuizSubmitted(false);
    try {
      localStorage.removeItem(quizStorageKey);
    } catch {}
  }, [quizStorageKey]);

  const quizCorrectCount = useMemo(() => {
    return QUIZ_QUESTIONS.reduce((acc, q) => {
      return quizAnswers[q.id] === q.correctIndex ? acc + 1 : acc;
    }, 0);
  }, [quizAnswers]);

  const quizPercentage = Math.round((quizCorrectCount / QUIZ_QUESTIONS.length) * 100);
  const isCertified = quizSubmitted && quizPercentage >= 80 && totalSimulatorScore >= 75;

  // ── Certificate Modal ────────────────────────────────────────────────────
  const [showCertificate, setShowCertificate] = useState(false);

  const printCertificate = useCallback(() => {
    window.print();
  }, []);

  const fmtDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      {/* Academy Header */}
      <PageTitle>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GraduationCap size={24} color="#7C3AED" /> {t('أكاديمية التطوير والجدارات البيعية')}
        </span>
      </PageTitle>

      {/* Main Mode Navigation Bar */}
      <div className="tabs" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        <button
          type="button"
          className={`chip ${activeTab === 'courses' ? 'on' : ''}`}
          onClick={() => setTab('courses')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <BookOpen size={15} /> {t('المسارات التدريبية 📚')}
        </button>
        <button
          type="button"
          className={`chip ${activeTab === 'simulator' ? 'on' : ''}`}
          onClick={() => setTab('simulator')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Zap size={15} color="#D97706" /> {t('محاكي القرارات الميدانية 🎮')}
        </button>
        <button
          type="button"
          className={`chip ${activeTab === 'quiz' ? 'on' : ''}`}
          onClick={() => setTab('quiz')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <FileText size={15} /> {t('اختبار الكفاءات FMCG 📝')}
        </button>
        <button
          type="button"
          className={`chip ${activeTab === 'badges' ? 'on' : ''}`}
          onClick={() => setTab('badges')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Award size={15} color="#10B981" /> {t('شهاداتي وشارات الإنجاز 🏆')}
        </button>
      </div>

      {/* ── TAB 1: COURSES & VIDEO PLAYER ─────────────────────────────────── */}
      {activeTab === 'courses' && (
        <>
          {activeCourseId ? (
            <div>
              {/* Course breadcrumb */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: 17, color: '#1E293B' }}>{t(currentCourse?.title || 'المسار التدريبي')}</h3>
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={goBackToCourses}
                  style={{ padding: '6px 12px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <ArrowRight size={15} /> {t('العودة للمسارات')}
                </button>
              </div>

              {lessonsLoading ? (
                <LoadingSpinner />
              ) : (
                <>
                  {/* Video Box */}
                  <div style={{ background: '#0F172A', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: '#1E293B', color: '#94A3B8', fontSize: 13 }}>
                          <span>{t('سرعة التشغيل:')}</span>
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
                      <div style={{ padding: 40, textAlign: 'center', color: '#fff' }}>{t('لا توجد دروس في هذا المسار حالياً')}</div>
                    )}
                  </div>

                  {/* Lesson Details */}
                  {currentLesson && (
                    <div className="card" style={{ marginBottom: 16, borderTop: '3px solid #3B82F6' }}>
                      <h3 style={{ margin: '0 0 6px', fontSize: 17, color: '#0F172A' }}>{t(currentLesson.title)}</h3>
                      {currentLesson.description && (
                        <p style={{ margin: 0, fontSize: 13.5, color: '#64748B', lineHeight: 1.5 }}>
                          {t(currentLesson.description)}
                        </p>
                      )}

                      {currentLesson.attachment_url && (
                        <div style={{ marginTop: 12 }}>
                          <a
                            href={currentLesson.attachment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn ghost sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                          >
                            <Download size={15} /> {t('تحميل ملخص الدرس (PDF)')}
                          </a>
                        </div>
                      )}

                      <div style={{ marginTop: 14 }}>
                        <button
                          onClick={toggleComplete}
                          disabled={markComplete.isPending}
                          className="btn"
                          style={{
                            width: '100%',
                            background: currentLesson.is_completed ? '#10B981' : '#3B82F6',
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            padding: 10,
                            borderRadius: 10,
                          }}
                        >
                          {currentLesson.is_completed ? (
                            <>
                              <CheckCheck size={18} /> {t('تم إكمال هذا الدرس بنجاح')}
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={18} /> {markComplete.isPending ? t('جاري التسجيل...') : t('اضغط هنا: تم إنهاء الدرس واحتساب الإنجاز')}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Lesson Playlist */}
                  <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <h4 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <BookOpen size={16} color="#3B82F6" /> {t('محتويات المسار التدريبي')}
                      </h4>
                      <span style={{ fontSize: 12, color: '#64748B' }}>
                        {lessons?.filter((l) => l.is_completed).length} / {lessons?.length ?? 0} {t('مكتمل')}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {lessons?.map((lesson) => {
                        const isActive = currentLesson?.id === lesson.id;
                        return (
                          <div
                            key={lesson.id}
                            onClick={() => selectLesson(lesson.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 12px',
                              borderRadius: 8,
                              cursor: 'pointer',
                              background: isActive ? '#EFF6FF' : '#F8FAFC',
                              border: isActive ? '1px solid #93C5FD' : '1px solid #E2E8F0',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                              {lesson.is_completed ? (
                                <CheckCircle2 size={18} color="#10B981" />
                              ) : isActive ? (
                                <Play size={16} color="#3B82F6" />
                              ) : (
                                <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #CBD5E1' }} />
                              )}
                              <div>
                                <div style={{ fontSize: 13.5, fontWeight: isActive ? 'bold' : '500', color: isActive ? '#1D4ED8' : '#1E293B' }}>
                                  {t(lesson.title)}
                                </div>
                                {lesson.duration_seconds > 0 && (
                                  <div style={{ fontSize: 11.5, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Clock size={11} /> {fmtDuration(lesson.duration_seconds)}
                                  </div>
                                )}
                              </div>
                            </div>

                            {lesson.is_completed && (
                              <span style={{ fontSize: 11, background: '#D1FAE5', color: '#065F46', padding: '2px 8px', borderRadius: 6, fontWeight: 'bold' }}>
                                {t('مكتمل')}
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
          ) : (
            <>
              {/* Courses Overview Banner */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                  color: '#fff',
                  padding: 16,
                  borderRadius: 14,
                  marginBottom: 16,
                  boxShadow: '0 4px 15px rgba(124, 58, 237, 0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Award size={22} />
                  <h3 style={{ margin: 0, fontSize: 17 }}>{t('تطوير المشرفين الميدانيين')}</h3>
                </div>
                <p style={{ margin: 0, fontSize: 13, opacity: 0.9, lineHeight: 1.5 }}>
                  {t('حقائب تدريبية موجهة لتطوير كفاءتك في إدارة الميدان، فتح العملاء، والتعامل الاحترافي مع التجار والمنافسين.')}
                </p>
              </div>

              {coursesLoading ? (
                <LoadingSpinner />
              ) : !courses || courses.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                  <BookOpen size={44} color="#94A3B8" style={{ marginBottom: 10 }} />
                  <h3 style={{ margin: '0 0 6px', color: '#334155' }}>{t('لا توجد مسارات تدريبية منشورة حالياً')}</h3>
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                    {t('سيقوم مدير الكفاءات بنشر المواد التدريبية قريباً.')}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {courses.map((course) => (
                    <div
                      key={course.id}
                      className="card"
                      style={{ cursor: 'pointer', borderRadius: 12, border: '1px solid #E2E8F0' }}
                      onClick={() => selectCourse(course.id)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ background: '#F3E8FF', color: '#6B21A8', fontSize: 11.5, fontWeight: 'bold', padding: '2px 8px', borderRadius: 16 }}>
                          {t(course.category)}
                        </span>
                        <span style={{ fontSize: 12, color: '#64748B' }}>
                          {course.total_lessons} {t('دروس')}
                        </span>
                      </div>

                      <h3 style={{ margin: '0 0 6px', fontSize: 16, color: '#0F172A' }}>{t(course.title)}</h3>
                      {course.description && (
                        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748B', lineHeight: 1.4 }}>
                          {t(course.description)}
                        </p>
                      )}

                      <div style={{ marginTop: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                          <span style={{ color: '#475569' }}>{t('نسبة الإنجاز')}</span>
                          <span style={{ fontWeight: 'bold', color: course.progress_pct === 100 ? '#10B981' : '#3B82F6' }}>
                            {course.progress_pct}%
                          </span>
                        </div>
                        <div style={{ height: 6, background: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${course.progress_pct}%`,
                              background: course.progress_pct === 100 ? '#10B981' : '#3B82F6',
                              borderRadius: 3,
                            }}
                          />
                        </div>
                      </div>

                      <button
                        className="btn sm"
                        style={{
                          width: '100%',
                          marginTop: 12,
                          fontSize: 13,
                          background: course.progress_pct === 100 ? '#059669' : '#4F46E5',
                          color: '#fff',
                          borderRadius: 8,
                          padding: '8px',
                        }}
                      >
                        {course.progress_pct === 100 ? t('✓ تم إكمال المسار (مراجعة)') : course.progress_pct > 0 ? t('متابعة التدريب ▶') : t('بدء المسار التدريبي ▶')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── TAB 2: FMCG FIELD DECISION SIMULATOR ──────────────────────────── */}
      {activeTab === 'simulator' && (
        <div>
          {/* Simulator Header Card */}
          <div
            style={{
              background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
              color: '#fff',
              padding: 16,
              borderRadius: 14,
              marginBottom: 16,
              borderRight: '4px solid #F59E0B',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={22} color="#F59E0B" />
                <h3 style={{ margin: 0, fontSize: 17 }}>{t('محاكي القرارات الميدانية FMCG')}</h3>
              </div>
              <span className="badge b-amber" style={{ fontSize: 12, padding: '4px 10px' }}>
                {totalSimulatorScore} / 100 {t('نقطة')}
              </span>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#94A3B8', lineHeight: 1.5 }}>
              {t('مواقف وسيناريوهات واقعية تحاكي ضغوط الميدان مع التجار والمنافسين. اختر قرارك واكتشف تقييم الخبراء فوراً.')}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {SCENARIOS.map((scenario, sIdx) => {
              const chosenOptIdx = scenarioAnswers[scenario.id];
              const isAnswered = chosenOptIdx != null;
              const chosenOption = isAnswered ? scenario.options[chosenOptIdx] : null;

              return (
                <div
                  key={scenario.id}
                  className="card"
                  style={{
                    borderRadius: 12,
                    border: isAnswered ? (chosenOption?.isBest ? '1.5px solid #10B981' : '1.5px solid #EF4444') : '1px solid #E2E8F0',
                    padding: 16,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span className="badge b-blue" style={{ fontSize: 11 }}>
                      {scenario.category}
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {t('سيناريو {n} من {total}', { n: sIdx + 1, total: SCENARIOS.length })}
                    </span>
                  </div>

                  <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#0F172A' }}>
                    {scenario.title}
                  </h3>

                  <div
                    style={{
                      background: '#F8FAFC',
                      borderRight: '3px solid #3B82F6',
                      padding: '10px 12px',
                      borderRadius: 8,
                      fontSize: 13.5,
                      color: '#334155',
                      lineHeight: 1.5,
                      marginBottom: 14,
                    }}
                  >
                    <strong>{t('الموقف الميداني')}: </strong> {scenario.situation}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {scenario.options.map((opt, optIdx) => {
                      const isSelected = chosenOptIdx === optIdx;
                      return (
                        <button
                          key={optIdx}
                          type="button"
                          onClick={() => selectScenarioOption(scenario.id, optIdx)}
                          style={{
                            textAlign: 'start',
                            padding: '10px 14px',
                            borderRadius: 8,
                            fontSize: 13,
                            cursor: 'pointer',
                            background: isSelected ? (opt.isBest ? '#ECFDF5' : '#FEF2F2') : '#FFFFFF',
                            border: isSelected ? (opt.isBest ? '2px solid #10B981' : '2px solid #EF4444') : '1px solid #CBD5E1',
                            color: '#1E293B',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                            font: 'inherit',
                          }}
                        >
                          <span
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              background: isSelected ? (opt.isBest ? '#10B981' : '#EF4444') : '#E2E8F0',
                              color: isSelected ? '#fff' : '#475569',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 11,
                              fontWeight: 'bold',
                              flex: 'none',
                              marginTop: 1,
                            }}
                          >
                            {optIdx + 1}
                          </span>
                          <span style={{ flex: 1, lineHeight: 1.4 }}>{opt.text}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Instant Feedback Panel */}
                  {chosenOption && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: chosenOption.isBest ? '#ECFDF5' : '#FFFBEB',
                        border: chosenOption.isBest ? '1px solid #A7F3D0' : '1px solid #FDE68A',
                        fontSize: 13,
                        color: chosenOption.isBest ? '#065F46' : '#92400E',
                        lineHeight: 1.5,
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {chosenOption.isBest ? <CheckCircle2 size={16} color="#059669" /> : <ShieldCheck size={16} color="#D97706" />}
                        <span>{chosenOption.isBest ? t('تقييم القرار: مثالي ومطابق لأعلى معايير FMCG (+25 نقطة)') : t('تقييم القرار: يحتاج إلى تصحيح')}</span>
                      </div>
                      <div>{chosenOption.explanation}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 3: FMCG KNOWLEDGE QUIZ ────────────────────────────────────── */}
      {activeTab === 'quiz' && (
        <div>
          {/* Quiz Header Card */}
          <div
            style={{
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              color: '#fff',
              padding: 16,
              borderRadius: 14,
              marginBottom: 16,
              boxShadow: '0 4px 15px rgba(5, 150, 105, 0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={22} />
                <h3 style={{ margin: 0, fontSize: 17 }}>{t('اختبار الكفاءة الميدانية ومعايير الرف')}</h3>
              </div>
              {quizSubmitted && (
                <span className={`badge ${quizPercentage >= 80 ? 'b-green' : 'b-amber'}`} style={{ fontSize: 12, padding: '4px 10px' }}>
                  {quizPercentage}% {quizPercentage >= 80 ? t('اجتياز بنجاح 🏆') : t('إعادة المحاولة ⚠️')}
                </span>
              )}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.9, lineHeight: 1.5 }}>
              {t('5 أسئلة تخصصية في صميم عمل المشرف الميداني لقياس المعرفة بالـ Share of Shelf، الـ Eye-Level، والـ OOS. نسبة الاجتياز 80% للحصول على الشهادة.')}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {QUIZ_QUESTIONS.map((q, idx) => {
              const selectedIdx = quizAnswers[q.id];
              const isSelected = selectedIdx != null;
              const isCorrect = isSelected && selectedIdx === q.correctIndex;

              return (
                <div
                  key={q.id}
                  className="card"
                  style={{
                    borderRadius: 12,
                    border: quizSubmitted ? (isCorrect ? '1.5px solid #10B981' : '1.5px solid #EF4444') : '1px solid #E2E8F0',
                    padding: 16,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span className="chip sm">{t('السؤال {n}', { n: idx + 1 })}</span>
                    {quizSubmitted && (
                      <span style={{ fontSize: 12, fontWeight: 'bold', color: isCorrect ? '#10B981' : '#EF4444' }}>
                        {isCorrect ? t('إجابة صحيحة ✓') : t('إجابة خاطئة ✗')}
                      </span>
                    )}
                  </div>

                  <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#0F172A', lineHeight: 1.4 }}>
                    {q.question}
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {q.options.map((opt, optIdx) => {
                      const isOptionSelected = selectedIdx === optIdx;
                      const isOptionCorrect = optIdx === q.correctIndex;

                      let optBg = '#FFFFFF';
                      let optBorder = '#CBD5E1';

                      if (quizSubmitted) {
                        if (isOptionCorrect) {
                          optBg = '#ECFDF5';
                          optBorder = '#10B981';
                        } else if (isOptionSelected) {
                          optBg = '#FEF2F2';
                          optBorder = '#EF4444';
                        }
                      } else if (isOptionSelected) {
                        optBg = '#EFF6FF';
                        optBorder = '#3B82F6';
                      }

                      return (
                        <button
                          key={optIdx}
                          type="button"
                          disabled={quizSubmitted}
                          onClick={() => selectQuizAnswer(q.id, optIdx)}
                          style={{
                            textAlign: 'start',
                            padding: '10px 14px',
                            borderRadius: 8,
                            fontSize: 13,
                            cursor: quizSubmitted ? 'default' : 'pointer',
                            background: optBg,
                            border: `1.5px solid ${optBorder}`,
                            color: '#1E293B',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            font: 'inherit',
                          }}
                        >
                          <span
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: '50%',
                              border: `2px solid ${isOptionSelected || (quizSubmitted && isOptionCorrect) ? optBorder : '#94A3B8'}`,
                              background: isOptionSelected || (quizSubmitted && isOptionCorrect) ? optBorder : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flex: 'none',
                            }}
                          />
                          <span style={{ flex: 1, lineHeight: 1.4 }}>{opt}</span>
                        </button>
                      );
                    })}
                  </div>

                  {quizSubmitted && (
                    <div style={{ marginTop: 10, fontSize: 12.5, color: '#64748B', background: '#F8FAFC', padding: '8px 10px', borderRadius: 6 }}>
                      <strong>{t('الشرح المعتمد')}:</strong> {q.explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quiz Action Footer */}
          <div style={{ marginTop: 16 }}>
            {!quizSubmitted ? (
              <button
                type="button"
                className="btn"
                onClick={submitQuiz}
                disabled={Object.keys(quizAnswers).length < QUIZ_QUESTIONS.length}
                style={{ width: '100%', padding: 12, fontSize: 15, background: '#059669', color: '#fff' }}
              >
                {t('تسجيل الإجابات واحتساب النتيجة 🏁')}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={resetQuiz}
                  style={{ flex: 1, padding: 10, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <RefreshCw size={15} /> {t('إعادة الاختبار')}
                </button>
                {isCertified && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowCertificate(true)}
                    style={{ flex: 2, padding: 10, fontSize: 13, background: '#7C3AED', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <Award size={16} /> {t('عرض وتحميل شهادة التميز 🎓')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 4: BADGES & CERTIFICATES ──────────────────────────────────── */}
      {activeTab === 'badges' && (
        <div>
          {/* Badges Overview Header */}
          <div
            style={{
              background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
              color: '#fff',
              padding: 18,
              borderRadius: 14,
              marginBottom: 16,
              boxShadow: '0 4px 15px rgba(124, 58, 237, 0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Award size={24} />
                <h3 style={{ margin: 0, fontSize: 18 }}>{t('سجل الشارات والاعتمادات المهنية')}</h3>
              </div>
              <span className="badge b-blue" style={{ fontSize: 12 }}>
                {supervisor?.full_name || t('المشرف الميداني')}
              </span>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.9, lineHeight: 1.5 }}>
              {t('تُمنح هذه الشارات والشهادات الرسمية بناءً على اجتياز محاكاة القرارات واختبار معايير الرف النموذجي والالتزام الميداني.')}
            </p>
          </div>

          {/* Badges Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            {/* Badge 1: Perfect Store Ambassador */}
            <div
              className="card col between"
              style={{
                borderTop: '4px solid #10B981',
                padding: 16,
                background: totalSimulatorScore >= 75 ? '#ECFDF5' : '#FFFFFF',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 28 }}>🥇</span>
                  <span className={`badge ${totalSimulatorScore >= 75 ? 'b-green' : 'b-gray'}`} style={{ fontSize: 11 }}>
                    {totalSimulatorScore >= 75 ? t('تم الاستحقاق ✓') : t('قيد الإنجاز')}
                  </span>
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: 16, color: '#0F172A' }}>
                  {t('سفير المتجر النموذجي (Perfect Store Ambassador)')}
                </h3>
                <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.4 }}>
                  {t('إتقان معايير تنظيم الرف، توزيع الـ POSM، وحماية الحصة السوقية.')}
                </p>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: '#059669', fontWeight: 'bold' }}>
                {t('درجة المحاكي:')} {totalSimulatorScore} / 100
              </div>
            </div>

            {/* Badge 2: Route & Geofencing Master */}
            <div
              className="card col between"
              style={{
                borderTop: '4px solid #3B82F6',
                padding: 16,
                background: '#FFFFFF',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 28 }}>⚡</span>
                  <span className="badge b-blue" style={{ fontSize: 11 }}>
                    {t('تم الاستحقاق ✓')}
                  </span>
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: 16, color: '#0F172A' }}>
                  {t('محترف المسار والسياج الجغرافي (Route Master)')}
                </h3>
                <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.4 }}>
                  {t('الالتزام التام بخط السير اليومي والحد من زيارات خارج النطاق.')}
                </p>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: '#2563EB', fontWeight: 'bold' }}>
                {t('الامتثال الجغرافي الميداني: 100%')}
              </div>
            </div>

            {/* Badge 3: Certified Field Expert */}
            <div
              className="card col between"
              style={{
                borderTop: '4px solid #7C3AED',
                padding: 16,
                background: isCertified ? '#F5F3FF' : '#FFFFFF',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 28 }}>🎓</span>
                  <span className={`badge ${isCertified ? 'b-blue' : 'b-gray'}`} style={{ fontSize: 11 }}>
                    {isCertified ? t('معتمد رسمياً 🏆') : t('يتطلب اجتياز الاختبار')}
                  </span>
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: 16, color: '#0F172A' }}>
                  {t('متخصص المتابعة الميدانية والرف (FMCG Field Specialist)')}
                </h3>
                <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.4 }}>
                  {t('اجتياز اختبار الكفاءات بنسبة تفوق 80% وإتقان مفاهيم السوق.')}
                </p>
              </div>

              <div style={{ marginTop: 12 }}>
                {isCertified ? (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setShowCertificate(true)}
                    style={{ width: '100%', fontSize: 12.5, background: '#7C3AED', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <Award size={14} /> {t('استعراض الشهادة الرسمية')}
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: '#64748B' }}>
                    {t('نتيجة الاختبار: {p}% (المطلوب 80%)', { p: quizPercentage })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: PRINTABLE DIGITAL CERTIFICATE ──────────────────────────── */}
      {showCertificate && (
        <div
          className="adm-modal-bg"
          onClick={() => setShowCertificate(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#FFFFFF',
              maxWidth: 620,
              width: '100%',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              border: '8px double #D97706',
              position: 'relative',
              textAlign: 'center',
            }}
          >
            {/* Certificate Header Banner */}
            <div style={{ borderBottom: '2px solid #E2E8F0', paddingBottom: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 4 }}>🏆</div>
              <h2 style={{ margin: 0, fontSize: 22, color: '#0F172A' }}>
                {t('شهادة إتمام واجتياز الكفاءة الميدانية FMCG')}
              </h2>
              <div style={{ fontSize: 13, color: '#D97706', fontWeight: 'bold', marginTop: 4 }}>
                {t('CERTIFICATE OF PROFESSIONAL FIELD EXCELLENCE')}
              </div>
            </div>

            {/* Certificate Body */}
            <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 10px' }}>
              {t('تشهد إدارة المتابعة وتطوير الكفاءات الميدانية بأن المشرف:')}
            </p>
            <h3 style={{ fontSize: 24, color: '#1E293B', margin: '0 0 12px', fontWeight: 'bold' }}>
              {supervisor?.full_name || '—'}
            </h3>
            <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, maxWidth: 500, margin: '0 auto 20px' }}>
              {t('قد اجتاز بنجاح محاكي القرارات الميدانية واختبار معايير المتجر النموذجي بنسبة تفوق {p}% واستحق شارة الاعتماد المهني لميدان التجزئة والأغذية.', { p: quizPercentage })}
            </p>

            {/* Certificate Meta Details */}
            <div style={{ display: 'flex', justifyContent: 'space-around', borderTop: '1px solid #E2E8F0', paddingTop: 14, marginBottom: 20, fontSize: 12.5, color: '#64748B' }}>
              <div>
                <strong>{t('تاريخ الإصدار:')}</strong>
                <div>{fmtDate(new Date().toISOString())}</div>
              </div>
              <div>
                <strong>{t('كود التحقق الرقمي:')}</strong>
                <div>MYD-CERT-{supId.slice(0, 8).toUpperCase()}</div>
              </div>
              <div>
                <strong>{t('الحالة:')}</strong>
                <div style={{ color: '#059669', fontWeight: 'bold' }}>{t('معتمد ورسمي ✓')}</div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn sm"
                onClick={printCertificate}
                style={{ background: '#0F172A', color: '#fff', padding: '8px 18px', fontSize: 13 }}
              >
                {t('طباعة الشهادة 🖨️')}
              </button>
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => setShowCertificate(false)}
                style={{ padding: '8px 18px', fontSize: 13 }}
              >
                {t('إغلاق')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
