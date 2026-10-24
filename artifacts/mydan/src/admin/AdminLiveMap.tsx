import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown, Compass, Eye, Filter, MapPin, Phone, RefreshCw, Search, Users, X } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import {
  useLiveTrackingData,
  useSupervisorVisitsHistory,
  type SupervisorLiveTrack,
  type SupervisorRoutePoint,
  type SupervisorHistoryVisit,
} from '@/lib/screen-live-map';
import { ErrorState, SkeletonList } from '@/components/States';
import EmptyState from '@/components/EmptyState';
import { fmtDate, fmtTime, num, todayStr } from '@/lib/format';
import { t } from '@/i18n';

// Inject CSS for Leaflet & Custom Animated Markers
function injectMapStyles() {
  if (!document.getElementById('live-map-styles')) {
    const style = document.createElement('style');
    style.id = 'live-map-styles';
    style.textContent = `
      @keyframes pulse-live {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
        70% { transform: scale(1.08); box-shadow: 0 0 0 12px rgba(34, 197, 94, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
      }
      .sup-pulse-marker {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #16A34A;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 15px;
        border: 3px solid #fff;
        animation: pulse-live 2s infinite;
        cursor: pointer;
      }
      .sup-idle-marker {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #2563EB;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 13px;
        border: 2px solid #fff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer;
      }
      .sup-waypoint-marker {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: #6366F1;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 12px;
        border: 2px solid #fff;
        box-shadow: 0 2px 6px rgba(0,0,0,0.25);
        cursor: pointer;
      }
      .sup-history-marker {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #8B5CF6;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 11px;
        border: 2px solid #fff;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        cursor: pointer;
      }
      .live-map-wrapper {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: calc(100vh - 120px);
      }
      .live-map-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 14px;
        flex: 1;
      }
      @media (min-width: 960px) {
        .live-map-grid {
          grid-template-columns: 390px 1fr;
          height: calc(100vh - 180px);
          min-height: 580px;
        }
      }
      .live-map-leaflet-container {
        width: 100%;
        height: 420px;
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid var(--line);
        box-shadow: 0 4px 14px rgba(0,0,0,0.06);
        position: relative;
        z-index: 1;
      }
      @media (min-width: 960px) {
        .live-map-leaflet-container {
          height: 100%;
        }
      }
      .live-sup-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        overflow-y: auto;
        max-height: 580px;
        padding-inline-end: 4px;
      }
      .sup-card-selected {
        border-color: var(--color-primary) !important;
        background: #F0F4FF !important;
        box-shadow: 0 0 0 2px var(--color-primary);
      }
      .stop-item-card {
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--line);
        background: #F8FAFC;
        display: flex;
        flex-direction: column;
        gap: 4px;
        transition: all 0.15s ease;
      }
      .stop-item-card:hover {
        background: #EFF6FF;
        border-color: var(--color-primary);
      }
    `;
    document.head.appendChild(style);
  }

  // Inject Leaflet CSS
  if (!document.getElementById('lf-css')) {
    const lnk = document.createElement('link');
    lnk.id = 'lf-css';
    lnk.rel = 'stylesheet';
    lnk.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(lnk);
  }
}

/** Sanitize dynamic data before embedding into Leaflet DOM/HTML popups */
function escapeHtml(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function AdminLiveMap() {
  const { supervisor } = useAuth();
  const settings = useAppSettings();

  const [date, setDate] = useState<string>(todayStr());
  const [branchFilter, setBranchFilter] = useState<string>(() => { try { return localStorage.getItem('mydan_active_branch_id') || 'all'; } catch { return 'all'; } });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'completed' | 'idle'>('all');
  const [selectedSupId, setSelectedSupId] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const leafletLayerGroupRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

  const { data, tracks, branches, summary, isPending, isError, error, refetch, isFetching } =
    useLiveTrackingData(date, branchFilter);

  const historyQuery = useSupervisorVisitsHistory(selectedSupId);

  // Initialize styles & Leaflet
  useEffect(() => {
    injectMapStyles();
  }, []);

  // Filter supervisors
  const filteredTracks = useMemo(() => {
    return tracks.filter((t) => {
      if (statusFilter !== 'all' && t.liveStatus !== statusFilter) return false;
      if (!search.trim()) return true;
      const term = search.trim().toLowerCase();
      return (
        t.supervisorName.toLowerCase().includes(term) ||
        (t.branchName && t.branchName.toLowerCase().includes(term)) ||
        (t.currentCustomerName && t.currentCustomerName.toLowerCase().includes(term))
      );
    });
  }, [tracks, statusFilter, search]);

  const selectedTrack = useMemo(() => {
    return tracks.find((t) => t.supervisorId === selectedSupId) ?? null;
  }, [tracks, selectedSupId]);

  // Focus map on specific coordinate and open its popup
  const handleFocusLocation = useCallback((lat: number, lng: number, key?: string) => {
    if (!leafletMapRef.current) return;
    leafletMapRef.current.flyTo([lat, lng], 17, { duration: 1.0 });
    if (key) {
      const marker = markersRef.current.get(key);
      if (marker) {
        setTimeout(() => {
          marker.openPopup();
        }, 500);
      }
    }
  }, []);

  // Leaflet map setup & marker rendering
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let cancelled = false;

    import('leaflet').then((mod) => {
      if (cancelled || !mapContainerRef.current) return;
      const L = (mod as any).default ?? mod;

      // Initialize map once
      if (!leafletMapRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [30.0444, 31.2357], // Cairo, Egypt
          zoom: 11,
          zoomControl: true,
        });

        // OpenStreetMap Tile Layer (100% Free - Street names in Arabic across Egypt)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        leafletLayerGroupRef.current = L.layerGroup().addTo(map);
        leafletMapRef.current = map;
      }

      const map = leafletMapRef.current;
      const layerGroup = leafletLayerGroupRef.current;
      layerGroup.clearLayers();
      markersRef.current.clear();

      const allPoints: [number, number][] = [];

      // 1. If a specific supervisor is selected:
      if (selectedTrack) {
        const safeSupName = escapeHtml(selectedTrack.supervisorName);
        const safeBranch = selectedTrack.branchName ? escapeHtml(selectedTrack.branchName) : '';

        // Case A: Supervisor has route points today
        if (selectedTrack.route.length > 0) {
          const routeCoords: [number, number][] = [];

          selectedTrack.route.forEach((pt) => {
            const ll: [number, number] = [pt.latitude, pt.longitude];
            routeCoords.push(ll);
            allPoints.push(ll);

            const isCurrent =
              selectedTrack.currentLocation &&
              Math.abs(selectedTrack.currentLocation.latitude - pt.latitude) < 0.0001 &&
              Math.abs(selectedTrack.currentLocation.longitude - pt.longitude) < 0.0001;

            const markerClass = isCurrent
              ? selectedTrack.liveStatus === 'in_progress' ? 'sup-pulse-marker' : 'sup-idle-marker'
              : 'sup-waypoint-marker';

            const icon = L.divIcon({
              html: `<div class="${markerClass}">${isCurrent ? '👤' : pt.seq}</div>`,
              className: '',
              iconSize: isCurrent ? [36, 36] : [26, 26],
              iconAnchor: isCurrent ? [18, 18] : [13, 13],
              popupAnchor: [0, -16],
            });

            const safeCustName = escapeHtml(pt.customerName);
            const safeCustAddr = pt.customerAddress ? escapeHtml(pt.customerAddress) : '';

            const popupContent = `
              <div style="direction:rtl;text-align:right;font-family:inherit;min-width:210px">
                <div style="font-weight:800;font-size:14px;color:#1E293B">#${escapeHtml(pt.seq)} · ${safeCustName}</div>
                ${safeCustAddr ? `<div style="font-size:12px;color:#64748B;margin-top:2px">📍 ${safeCustAddr}</div>` : ''}
                <div style="font-size:12px;color:#475569;margin-top:4px">
                  🕒 ${t('دخول')}: ${pt.checkInTime ? escapeHtml(fmtTime(pt.checkInTime)) : '—'}
                  ${pt.checkOutTime ? ` · ${t('خروج')}: ${escapeHtml(fmtTime(pt.checkOutTime))}` : ''}
                </div>
                <div style="margin-top:6px;font-size:11px">
                  ${pt.status === 'in_progress' ? '<span style="background:#DCFCE7;color:#166534;padding:2px 6px;border-radius:4px;font-weight:700">🟢 ' + t('في زيارة حالياً') + '</span>' : '<span style="background:#E2E8F0;color:#334155;padding:2px 6px;border-radius:4px">✅ ' + t('زيارة مكتملة') + '</span>'}
                  ${pt.onBeat != null ? (pt.onBeat ? ' · <span style="color:#16A34A">' + t('داخل النطاق') + '</span>' : ' · <span style="color:#DC2626">' + t('خارج النطاق') + '</span>') : ''}
                </div>
              </div>
            `;

            const m = L.marker(ll, { icon }).bindPopup(popupContent).addTo(layerGroup);
            markersRef.current.set(`today-${pt.visitId}`, m);
            markersRef.current.set(`${pt.latitude},${pt.longitude}`, m);
          });

          if (routeCoords.length > 1) {
            L.polyline(routeCoords, {
              color: '#4F46E5',
              weight: 4,
              opacity: 0.85,
              dashArray: '8 6',
            }).addTo(layerGroup);
          }

          map.fitBounds(L.latLngBounds(allPoints), { padding: [50, 50], maxZoom: 16 });
        } else {
          // Case B: No route today. Plot history visits if available, or branch location
          const historyVisits = (historyQuery.data ?? []).filter((h) => h.latitude && h.longitude);

          if (historyVisits.length > 0) {
            historyVisits.slice(0, 10).forEach((hv, idx) => {
              const ll: [number, number] = [hv.latitude!, hv.longitude!];
              allPoints.push(ll);

              const icon = L.divIcon({
                html: `<div class="sup-history-marker" title="${escapeHtml(hv.customerName)}">${idx + 1}</div>`,
                className: '',
                iconSize: [24, 24],
                iconAnchor: [12, 12],
                popupAnchor: [0, -14],
              });

              const safeCustName = escapeHtml(hv.customerName);
              const safeCustAddr = hv.customerAddress ? escapeHtml(hv.customerAddress) : '';

              const popupContent = `
                <div style="direction:rtl;text-align:right;font-family:inherit;min-width:200px">
                  <div style="font-weight:800;font-size:13px;color:#1E293B">#${idx + 1} · ${safeCustName}</div>
                  ${safeCustAddr ? `<div style="font-size:11px;color:#64748B;margin-top:2px">📍 ${safeCustAddr}</div>` : ''}
                  <div style="font-size:11px;color:#475569;margin-top:4px">
                    📅 ${escapeHtml(fmtDate(hv.visitDate))} ${hv.checkInTime ? `· 🕒 ${escapeHtml(fmtTime(hv.checkInTime))}` : ''}
                  </div>
                  <div style="margin-top:4px;font-size:11px">
                    <span style="background:#F1F5F9;color:#475569;padding:2px 6px;border-radius:4px">📍 ${t('سجل المحطات')}</span>
                  </div>
                </div>
              `;

              const m = L.marker(ll, { icon }).bindPopup(popupContent).addTo(layerGroup);
              markersRef.current.set(`hist-${hv.id}`, m);
              markersRef.current.set(`${hv.latitude},${hv.longitude}`, m);
            });

            if (allPoints.length > 0) {
              map.fitBounds(L.latLngBounds(allPoints), { padding: [50, 50], maxZoom: 15 });
            }
          }

          // Also plot branch hub if supervisor has branch coordinates
          if (selectedTrack.branchLocation) {
            const bll: [number, number] = [selectedTrack.branchLocation.latitude, selectedTrack.branchLocation.longitude];
            allPoints.push(bll);

            const bIcon = L.divIcon({
              html: `<div class="sup-idle-marker" style="background:#7C3AED" title="${safeBranch}">🏢</div>`,
              className: '',
              iconSize: [32, 32],
              iconAnchor: [16, 16],
              popupAnchor: [0, -18],
            });

            const bPopup = `
              <div style="direction:rtl;text-align:right;font-family:inherit">
                <div style="font-weight:800;font-size:14px;color:#1E293B">🏢 فرع ${safeBranch}</div>
                <div style="font-size:12px;color:#64748B;margin-top:2px">${t('المركز التشغيلي للمشرف')}: ${safeSupName}</div>
              </div>
            `;

            const bm = L.marker(bll, { icon: bIcon }).bindPopup(bPopup).addTo(layerGroup);
            markersRef.current.set(`branch-${selectedTrack.branchId}`, bm);

            if (historyVisits.length === 0) {
              map.flyTo(bll, 14, { duration: 1.2 });
            }
          }

          if (allPoints.length === 0) {
            map.setView([30.0444, 31.2357], 11);
          }
        }
      } else {
        // 2. No single supervisor selected: Display all active supervisors on the map
        filteredTracks.forEach((trk) => {
          if (!trk.currentLocation) return;
          const ll: [number, number] = [trk.currentLocation.latitude, trk.currentLocation.longitude];
          allPoints.push(ll);

          const safeSupName = escapeHtml(trk.supervisorName);
          const safeBranch = trk.branchName ? escapeHtml(trk.branchName) : '';
          const safeCustName = escapeHtml(trk.currentCustomerName || 'عميل');
          const safeCustAddr = trk.currentCustomerAddress ? escapeHtml(trk.currentCustomerAddress) : '';
          const cleanPhone = (trk.phone || '').replace(/[^0-9+]/g, '');
          const waPhone = (trk.phone || '').replace(/[^0-9]/g, '');

          const isLive = trk.liveStatus === 'in_progress';
          const icon = L.divIcon({
            html: `<div class="${isLive ? 'sup-pulse-marker' : 'sup-idle-marker'}" title="${safeSupName}">
                    ${isLive ? '🟢' : '👤'}
                   </div>`,
            className: '',
            iconSize: isLive ? [36, 36] : [32, 32],
            iconAnchor: isLive ? [18, 18] : [16, 16],
            popupAnchor: [0, -18],
          });

          const popupContent = `
            <div style="direction:rtl;text-align:right;font-family:inherit;min-width:210px">
              <div style="font-weight:800;font-size:15px;color:#0F172A">👤 ${safeSupName}</div>
              ${safeBranch ? `<div style="font-size:12px;color:#64748B">🏢 فرع ${safeBranch}</div>` : ''}
              <div style="margin-top:6px;padding:6px 8px;background:#F8FAFC;border-radius:6px;border:1px solid #E2E8F0">
                <div style="font-size:12px;font-weight:700;color:${isLive ? '#166534' : '#1E40AF'}">
                  ${isLive ? '🟢 ' + t('في زيارة حالياً') + ':' : '🔵 ' + t('آخر تواجد مسجل') + ':'}
                </div>
                <div style="font-size:13px;font-weight:700;margin-top:2px">${safeCustName}</div>
                ${safeCustAddr ? `<div style="font-size:11px;color:#64748B">${safeCustAddr}</div>` : ''}
                ${trk.lastActiveTime ? `<div style="font-size:11px;color:#64748B;margin-top:3px">🕒 ${escapeHtml(fmtTime(trk.lastActiveTime))}</div>` : ''}
              </div>
              <div style="display:flex;gap:6px;margin-top:8px">
                ${cleanPhone ? `<a href="tel:${cleanPhone}" style="flex:1;background:#E2E8F0;text-align:center;padding:4px 0;border-radius:6px;font-size:12px;text-decoration:none;color:#0F172A;font-weight:700">📞 اتصال</a>` : ''}
                ${waPhone ? `<a href="https://api.whatsapp.com/send?phone=${waPhone}" target="_blank" rel="noopener noreferrer" style="flex:1;background:#25D366;text-align:center;padding:4px 0;border-radius:6px;font-size:12px;text-decoration:none;color:#fff;font-weight:700">💬 واتساب</a>` : ''}
              </div>
            </div>
          `;

          const m = L.marker(ll, { icon }).bindPopup(popupContent).addTo(layerGroup);
          markersRef.current.set(`sup-${trk.supervisorId}`, m);
        });

        if (allPoints.length > 0) {
          map.fitBounds(L.latLngBounds(allPoints), { padding: [50, 50], maxZoom: 15 });
        } else {
          map.setView([30.0444, 31.2357], 11);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [filteredTracks, selectedTrack, historyQuery.data]);

  // Clean up Leaflet instance on unmount
  useEffect(() => {
    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  const handleSelectSupervisor = useCallback((supId: string) => {
    setSelectedSupId((prev) => (prev === supId ? null : supId));
  }, []);

  return (
    <div className="live-map-wrapper">
      {/* Header & Controls Bar */}
      <div className="row between" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={24} color="var(--color-primary)" />
            {t('تتبع المشرفين اللحظي والمسار الميداني')}
          </h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            {t('خريطة شوارع مصر الحية — متابعة مواقع المشرفين وخطوط السير بدون أي تكلفة أو API Key')}
          </p>
        </div>

        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Date Picker */}
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ width: 140, minHeight: 38 }}
            title={t('تاريخ التتبع')}
          />

          {/* Branch Filter (for Admin/SuperAdmin) */}
          {branches.length > 0 && supervisor?.role !== 'branch_manager' && (
            <select
              className="input"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              style={{ width: 150, minHeight: 38 }}
            >
              <option value="all">{t('كل الفروع')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          {/* Refresh Button */}
          <button
            className="btn ghost"
            onClick={() => {
              void refetch();
              if (selectedSupId) void historyQuery.refetch();
            }}
            disabled={isFetching}
            style={{ minHeight: 38, gap: 6 }}
            title={t('تحديث فوري')}
          >
            <RefreshCw className={isFetching ? 's-spin' : ''} size={16} />
            <span style={{ fontSize: 13 }}>{t('تحديث')}</span>
          </button>
        </div>
      </div>

      {/* KPI Counters Bar */}
      <div className="adm-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <div className="card col" style={{ padding: '10px 14px', borderRight: '4px solid #16A34A', background: '#F0FDF4' }}>
          <div className="muted" style={{ fontSize: 12 }}>🟢 {t('في زيارة الآن')}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#166534' }}>{num(summary.activeInVisit)}</div>
        </div>
        <div className="card col" style={{ padding: '10px 14px', borderRight: '4px solid #2563EB', background: '#EFF6FF' }}>
          <div className="muted" style={{ fontSize: 12 }}>🔵 {t('متحركون اليوم')}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1E40AF' }}>{num(summary.movingAfterVisit)}</div>
        </div>
        <div className="card col" style={{ padding: '10px 14px', borderRight: '4px solid #94A3B8' }}>
          <div className="muted" style={{ fontSize: 12 }}>⚪ {t('بدون نشاط')}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#475569' }}>{num(summary.idleToday)}</div>
        </div>
        <div className="card col" style={{ padding: '10px 14px', borderRight: '4px solid var(--color-primary)' }}>
          <div className="muted" style={{ fontSize: 12 }}>📍 {t('إجمالي الزيارات اليوم')}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-primary)' }}>{num(summary.totalVisitsRecorded)}</div>
        </div>
      </div>

      {/* Main Split Grid (Sidebar List + Leaflet Map) */}
      <div className="live-map-grid">
        {/* Supervisors Sidebar List OR Selected Supervisor Detail & Stops History */}
        <div className="card col" style={{ padding: 12, gap: 10, background: '#fff', overflow: 'hidden' }}>
          {selectedTrack ? (
            /* Selected Supervisor Stops & Visits History View */
            <div className="col" style={{ gap: 10, height: '100%', overflowY: 'auto' }}>
              <div className="row between" style={{ alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => setSelectedSupId(null)}
                  style={{ gap: 4, padding: '4px 8px', fontSize: 13 }}
                >
                  ← {t('العودة لقائمة المشرفين 👥')}
                </button>
                <span className="badge b-blue" style={{ fontSize: 11 }}>
                  {t('المشرف المحدد')}
                </span>
              </div>

              {/* Supervisor Identity Header */}
              <div style={{ background: '#F8FAFC', padding: 10, borderRadius: 10, border: '1px solid var(--line)' }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>
                  {selectedTrack.supervisorName}
                </div>
                {selectedTrack.branchName && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    🏢 فرع {selectedTrack.branchName}
                  </div>
                )}
                <div className="row" style={{ gap: 6, marginTop: 8 }}>
                  {selectedTrack.phone && (
                    <a
                      href={`tel:${selectedTrack.phone}`}
                      className="btn sm ghost"
                      style={{ fontSize: 12, padding: '3px 8px', flex: 1, justifyContent: 'center' }}
                    >
                      <Phone size={13} />
                      <span>{t('اتصال هاتفي')}</span>
                    </a>
                  )}
                  {selectedTrack.phone && (
                    <a
                      href={`https://api.whatsapp.com/send?phone=${selectedTrack.phone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn sm"
                      style={{
                        fontSize: 12,
                        padding: '3px 8px',
                        background: '#25D366',
                        color: '#fff',
                        flex: 1,
                        justifyContent: 'center',
                      }}
                    >
                      💬 <span>{t('مراسلة واتساب')}</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Section 1: Today's Stops */}
              <div className="col" style={{ gap: 6 }}>
                <div className="row between" style={{ alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1E293B' }}>
                    📍 {t('محطات اليوم')} ({num(selectedTrack.route.length)})
                  </div>
                  {selectedTrack.route.length > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {num(selectedTrack.completedVisitsToday)} {t('زيارة مكتملة')}
                    </span>
                  )}
                </div>

                {selectedTrack.route.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12, background: '#F8FAFC', padding: 8, borderRadius: 8 }}>
                    ℹ️ {t('لا توجد زيارات مسجلة للمشرف بتاريخ اليوم.')}
                  </div>
                ) : (
                  <div className="col" style={{ gap: 6 }}>
                    {selectedTrack.route.map((pt) => (
                      <div
                        key={pt.visitId}
                        className="stop-item-card"
                        onClick={() => handleFocusLocation(pt.latitude, pt.longitude, `today-${pt.visitId}`)}
                        style={{ cursor: 'pointer' }}
                        title={t('تركيز الخريطة')}
                      >
                        <div className="row between" style={{ alignItems: 'flex-start' }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>
                            #{pt.seq} {pt.customerName}
                          </div>
                          <span
                            className={`badge ${pt.status === 'in_progress' ? 'b-green' : 'b-gray'}`}
                            style={{ fontSize: 10 }}
                          >
                            {pt.status === 'in_progress' ? t('في زيارة حالياً') : t('زيارة مكتملة')}
                          </span>
                        </div>
                        {pt.customerAddress && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            📍 {pt.customerAddress}
                          </div>
                        )}
                        <div className="row between" style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                          <span>🕒 {pt.checkInTime ? fmtTime(pt.checkInTime) : '—'}</span>
                          <button
                            type="button"
                            className="btn sm ghost"
                            style={{ fontSize: 11, padding: '1px 6px', height: 22 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFocusLocation(pt.latitude, pt.longitude, `today-${pt.visitId}`);
                            }}
                          >
                            🔍 {t('تركيز')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 2: Previous Stops History */}
              <div className="col" style={{ gap: 6, marginTop: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#1E293B' }}>
                  🕒 {t('سجل آخر زيارات ميدانية للمشرف')}
                </div>

                {historyQuery.isLoading ? (
                  <SkeletonList n={3} />
                ) : (historyQuery.data ?? []).length === 0 ? (
                  <div className="muted" style={{ fontSize: 12, background: '#F8FAFC', padding: 8, borderRadius: 8 }}>
                    {t('لا يوجد سجل زيارات سابق لهذا المشرف.')}
                  </div>
                ) : (
                  <div className="col" style={{ gap: 6 }}>
                    {(historyQuery.data ?? []).map((hv) => {
                      const hasCoords = Number.isFinite(hv.latitude) && Number.isFinite(hv.longitude);
                      return (
                        <div
                          key={hv.id}
                          className="stop-item-card"
                          style={{ cursor: hasCoords ? 'pointer' : 'default' }}
                          onClick={() => hasCoords && handleFocusLocation(hv.latitude!, hv.longitude!, `hist-${hv.id}`)}
                        >
                          <div className="row between" style={{ alignItems: 'flex-start' }}>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>
                              {hv.customerName}
                            </div>
                            <span className="badge b-gray" style={{ fontSize: 10 }}>
                              {fmtDate(hv.visitDate)}
                            </span>
                          </div>
                          {hv.customerAddress && (
                            <div className="muted" style={{ fontSize: 11 }}>
                              📍 {hv.customerAddress}
                            </div>
                          )}
                          <div className="row between" style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                            <span>🕒 {hv.checkInTime ? fmtTime(hv.checkInTime) : '—'}</span>
                            {hasCoords && (
                              <button
                                type="button"
                                className="btn sm ghost"
                                style={{ fontSize: 11, padding: '1px 6px', height: 22 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFocusLocation(hv.latitude!, hv.longitude!, `hist-${hv.id}`);
                                }}
                              >
                                🗺️ {t('عرض')}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Full Supervisors List View */
            <>
              <div className="row between" style={{ alignItems: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {t('قائمة المشرفين')} ({num(filteredTracks.length)})
                </div>
              </div>

              {/* Search Input */}
              <div className="row" style={{ position: 'relative' }}>
                <input
                  className="input block"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('بحث بالمشرف أو العميل...')}
                  style={{ paddingInlineStart: 32, fontSize: 13, minHeight: 36 }}
                />
                <span style={{ position: 'absolute', insetInlineStart: 10, top: 9, opacity: 0.5 }}>
                  <Search size={16} />
                </span>
              </div>

              {/* Status Quick Filter Chips */}
              <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                <button
                  className={`chip sm ${statusFilter === 'all' ? 'on' : ''}`}
                  onClick={() => setStatusFilter('all')}
                  style={{ fontSize: 11, padding: '2px 8px' }}
                >
                  {t('الكل')}
                </button>
                <button
                  className={`chip sm ${statusFilter === 'in_progress' ? 'on' : ''}`}
                  onClick={() => setStatusFilter('in_progress')}
                  style={{ fontSize: 11, padding: '2px 8px' }}
                >
                  🟢 {t('في زيارة')}
                </button>
                <button
                  className={`chip sm ${statusFilter === 'completed' ? 'on' : ''}`}
                  onClick={() => setStatusFilter('completed')}
                  style={{ fontSize: 11, padding: '2px 8px' }}
                >
                  🔵 {t('متحرك')}
                </button>
                <button
                  className={`chip sm ${statusFilter === 'idle' ? 'on' : ''}`}
                  onClick={() => setStatusFilter('idle')}
                  style={{ fontSize: 11, padding: '2px 8px' }}
                >
                  ⚪ {t('بدون نشاط')}
                </button>
              </div>

              {/* Supervisor List */}
              {isPending ? (
                <SkeletonList n={4} />
              ) : isError ? (
                <ErrorState error={error} onRetry={refetch} />
              ) : filteredTracks.length === 0 ? (
                <EmptyState icon={<Users />} title={t('لا يوجد مشرفون')} text={t('لا توجد بيانات مطابقة لخيارات التصفية.')} />
              ) : (
                <div className="live-sup-list">
                  {filteredTracks.map((trk) => {
                    const isSelected = trk.supervisorId === selectedSupId;
                    const isLive = trk.liveStatus === 'in_progress';
                    const hasLocation = Boolean(trk.currentLocation);

                    return (
                      <div
                        key={trk.supervisorId}
                        className={`card col ${isSelected ? 'sup-card-selected' : ''}`}
                        style={{
                          padding: '10px 12px',
                          gap: 6,
                          cursor: 'pointer',
                          margin: 0,
                          border: '1px solid var(--line)',
                          borderRight: `4px solid ${isLive ? '#16A34A' : hasLocation ? '#2563EB' : '#CBD5E1'}`,
                          background: isSelected ? '#F0F4FF' : '#fff',
                          transition: 'background 0.15s, transform 0.1s',
                        }}
                        onClick={() => handleSelectSupervisor(trk.supervisorId)}
                      >
                        <div className="row between" style={{ alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{trk.supervisorName}</div>
                            {trk.branchName && (
                              <div className="muted" style={{ fontSize: 12 }}>
                                🏢 {trk.branchName}
                              </div>
                            )}
                          </div>
                          <span
                            className={`badge ${isLive ? 'b-green' : hasLocation ? 'b-blue' : 'b-gray'}`}
                            style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                          >
                            {isLive ? `🟢 ${t('في زيارة')}` : hasLocation ? `🔵 ${t('متحرك')}` : `⚪ ${t('غير نشط')}`}
                          </span>
                        </div>

                        {/* Customer & Location status */}
                        {trk.currentCustomerName ? (
                          <div style={{ fontSize: 12, color: 'var(--muted)', background: '#F8FAFC', padding: '4px 8px', borderRadius: 6 }}>
                            <div style={{ fontWeight: 600, color: '#334155' }}>
                              🏪 {trk.currentCustomerName}
                            </div>
                            {trk.currentCustomerAddress && (
                              <div style={{ fontSize: 11, color: '#64748B' }}>
                                📍 {trk.currentCustomerAddress}
                              </div>
                            )}
                            {trk.lastActiveTime && (
                              <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                                🕒 {fmtTime(trk.lastActiveTime)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="muted" style={{ fontSize: 12 }}>
                            {t('لم يسجل أي زيارة ميدانية اليوم')}
                          </div>
                        )}

                        {/* Actions Row */}
                        <div className="row between" style={{ marginTop: 4, alignItems: 'center' }}>
                          <span className="muted" style={{ fontSize: 12 }}>
                            {t('{n} زيارة', { n: num(trk.totalVisitsToday) })}
                            {trk.completedVisitsToday > 0 ? ` · ${num(trk.completedVisitsToday)} مكتملة` : ''}
                          </span>

                          <div className="row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className={`btn sm ${isSelected ? 'primary' : 'ghost'}`}
                              style={{ fontSize: 11, padding: '2px 8px', minHeight: 26 }}
                              onClick={() => handleSelectSupervisor(trk.supervisorId)}
                              title={t('تتبع خط السير على الخريطة')}
                            >
                              🗺️ {isSelected ? t('المسار مفعل') : t('تتبع')}
                            </button>
                            {trk.phone && (
                              <a
                                href={`https://api.whatsapp.com/send?phone=${trk.phone.replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="icon-btn"
                                style={{
                                  background: '#25D366',
                                  color: '#fff',
                                  width: 26,
                                  height: 26,
                                  borderRadius: 6,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 13,
                                  textDecoration: 'none',
                                }}
                                title={t('مراسلة واتساب')}
                              >
                                💬
                              </a>
                            )}
                            {trk.phone && (
                              <a
                                href={`tel:${trk.phone}`}
                                className="icon-btn"
                                style={{
                                  background: '#F1F5F9',
                                  color: '#334155',
                                  width: 26,
                                  height: 26,
                                  borderRadius: 6,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  textDecoration: 'none',
                                }}
                                title={t('اتصال هاتفي')}
                              >
                                <Phone size={13} />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Free OpenStreetMap Container */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="live-map-leaflet-container" ref={mapContainerRef} />
          <div className="row between muted" style={{ fontSize: 11, padding: '0 4px' }}>
            <span>🗺️ {t('خريطة شوارع مصر مفتوحة المصدر (OpenStreetMap) · تفاصيل الأحياء والشوارع باللغة العربية')}</span>
            <span>⏱️ {t('يتم التحديث التلقائي كل 30 ثانية')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
