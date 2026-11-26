/**
 * SBTÜ Hazırlık & İŞKUR Gençlik - Ortak Supabase Kimlik Doğrulama ve Bulut Senkronizasyonu
 * - Tüm 3 sayfada (index.html, devamsizlik.html, iskur.html) ortak çalışır.
 * - Giriş zorunlu değildir; giriş yapılmadan localStorage üzerinden tam kullanım sunar.
 * - Akıllı Veri Birleştirme: Giriş öncesi girilen yerel verileri bulut verileriyle güvenle birleştirir,
 *   boş bulut verisinin yerel veriyi silmesini engeller.
 * - Profil penceresi: Giriş Yap, Kayıt Ol, Şifremi Unuttum, Profil içi Şifre Değiştirme, Şimdi Eşitle, Çıkış Yap.
 */

(function () {
    const SUPABASE_URL = 'https://plemubbpkgkriqcxumxb.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_h4EMKcsMDrbTjsKHJdGDrg__aTklpbM';

    // Yerel Depolama Anahtarları
    const UBYS_GRADES_KEY = 'sbtu_grades_cache';
    const UBYS_ATT_KEY = 'sbtu_attendance_multikur_cache';
    const UBYS_KUR_KEY = 'sbtu_active_kur_preference';
    const UBYS_DIRTY_KEY = 'sbtu_ubys_local_dirty';
    const UBYS_LAST_USER_KEY = 'sbtu_ubys_last_user_id';

    const ISKUR_WEEKS_KEY = 'iskur_genclik_puantaj_v1';
    const ISKUR_BACKUP_KEY = 'iskur_genclik_puantaj_backup_v1';
    const ISKUR_MANUAL_KEY = 'iskur_genclik_manual_v1';
    const ISKUR_NAME_KEY = 'iskur_genclik_student_name_v1';
    const ISKUR_DIRTY_KEY = 'iskur_local_dirty';
    const ISKUR_LAST_USER_KEY = 'iskur_last_user_id';

    let supabaseClient = null;
    try {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
    } catch (e) {
        console.warn('Supabase istemcisi başlatılamadı:', e);
    }

    let currentUser = null;
    let authMode = 'login'; // 'login' | 'register' | 'forgot'
    let ubysSyncTimer = null;
    let iskurSyncTimer = null;
    let toastTimeout = null;
    let initialized = false;
    let isSyncing = false;

    const pageHooks = {
        onDataSynced: null,
        onLogout: null
    };

    function getPageType() {
        const page = document.body?.dataset?.page;
        if (page) return page;
        const path = window.location.pathname.toLowerCase();
        if (path.includes('devamsizlik')) return 'attendance';
        if (path.includes('iskur')) return 'iskur';
        if (path.includes('not-hesapla')) return 'grades';
        return 'home';
    }

    function readJsonStorage(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function showToast(text, type = 'success') {
        const toastEl = document.getElementById('toast-message') || document.getElementById('sbtu-auth-toast');
        if (!toastEl) return;

        const iconEl = toastEl.querySelector('[data-toast-icon]') || document.getElementById('toast-icon');
        const textEl = toastEl.querySelector('[data-toast-text]') || document.getElementById('toast-text');

        if (iconEl) iconEl.textContent = type === 'error' ? '⚠️' : '✅';
        if (textEl) textEl.textContent = text;
        toastEl.classList.remove('hidden');

        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toastEl.classList.add('hidden');
        }, 3400);
    }

    // ====================== AKILLI VERİ BİRLEŞTİRME (UBYS) ======================

    function isGradesEmpty(g) {
        if (!g || typeof g !== 'object') return true;
        const hasVize = g.vize && Object.values(g.vize).some((v) => v !== '' && v !== null && v !== undefined);
        const hasFinal = g.final && Object.values(g.final).some((v) => v !== '' && v !== null && v !== undefined);
        const hasName = typeof g.studentName === 'string' && g.studentName.trim() !== '';
        return !hasVize && !hasFinal && !hasName;
    }

    function isAttendanceEmpty(a) {
        if (!a || typeof a !== 'object') return true;
        return !Object.values(a).some((kurDates) => {
            if (!kurDates || typeof kurDates !== 'object') return false;
            return Object.values(kurDates).some(
                (slots) => Array.isArray(slots) && slots.some((s) => s !== 'present')
            );
        });
    }

    function mergeUbysGrades(localGrades, cloudGrades, preferLocal) {
        const l = localGrades && typeof localGrades === 'object' ? localGrades : {};
        const c = cloudGrades && typeof cloudGrades === 'object' ? cloudGrades : {};

        const lVize = l.vize && typeof l.vize === 'object' ? l.vize : {};
        const cVize = c.vize && typeof c.vize === 'object' ? c.vize : {};
        const lFinal = l.final && typeof l.final === 'object' ? l.final : {};
        const cFinal = c.final && typeof c.final === 'object' ? c.final : {};

        const vize = preferLocal ? { ...cVize, ...lVize } : { ...lVize, ...cVize };
        const final = preferLocal ? { ...cFinal, ...lFinal } : { ...lFinal, ...cFinal };

        // Boş string değerleri temizle
        Object.keys(vize).forEach((k) => { if (vize[k] === '' || vize[k] === null || vize[k] === undefined) delete vize[k]; });
        Object.keys(final).forEach((k) => { if (final[k] === '' || final[k] === null || final[k] === undefined) delete final[k]; });

        const lName = typeof l.studentName === 'string' ? l.studentName.trim() : '';
        const cName = typeof c.studentName === 'string' ? c.studentName.trim() : '';
        const studentName = preferLocal ? (lName || cName) : (cName || lName);

        return { vize, final, studentName };
    }

    function mergeUbysAttendance(localAtt, cloudAtt, preferLocal) {
        const sanitize = typeof sanitizeAttendanceState === 'function'
            ? sanitizeAttendanceState
            : (v) => (v && typeof v === 'object' ? v : {});

        const l = sanitize(localAtt);
        const c = sanitize(cloudAtt);
        const merged = {};

        const kurKeys = new Set([...Object.keys(c), ...Object.keys(l)]);
        kurKeys.forEach((kurId) => {
            merged[kurId] = {};
            const cKur = c[kurId] || {};
            const lKur = l[kurId] || {};
            const dateKeys = new Set([...Object.keys(cKur), ...Object.keys(lKur)]);

            dateKeys.forEach((dateStr) => {
                const lSlots = lKur[dateStr];
                const cSlots = cKur[dateStr];
                const lHas = Array.isArray(lSlots) && lSlots.some((s) => s !== 'present');
                const cHas = Array.isArray(cSlots) && cSlots.some((s) => s !== 'present');

                if (lHas && !cHas) {
                    merged[kurId][dateStr] = lSlots.slice();
                } else if (!lHas && cHas) {
                    merged[kurId][dateStr] = cSlots.slice();
                } else if (lHas && cHas) {
                    merged[kurId][dateStr] = preferLocal ? lSlots.slice() : cSlots.slice();
                }
            });
        });

        return merged;
    }

    function getLocalUbysPayload() {
        const grades = readJsonStorage(UBYS_GRADES_KEY, {});
        const rawAtt = readJsonStorage(UBYS_ATT_KEY, null);
        const sanitize = typeof sanitizeAttendanceState === 'function'
            ? sanitizeAttendanceState
            : (v) => (v && typeof v === 'object' ? v : {});
        const attendance = sanitize(rawAtt || {});
        const activeKur = localStorage.getItem(UBYS_KUR_KEY) || null;
        return { grades, attendance, activeKur };
    }

    function saveLocalUbysPayload({ grades, attendance, activeKur }) {
        try {
            if (!isGradesEmpty(grades)) {
                localStorage.setItem(UBYS_GRADES_KEY, JSON.stringify(grades));
            } else {
                localStorage.removeItem(UBYS_GRADES_KEY);
            }
            localStorage.setItem(UBYS_ATT_KEY, JSON.stringify(attendance || {}));
            if (activeKur) {
                localStorage.setItem(UBYS_KUR_KEY, activeKur);
            } else {
                localStorage.removeItem(UBYS_KUR_KEY);
            }
        } catch (e) {}
    }

    async function syncUbysToCloudNow(showFeedbackToast = false) {
        if (!supabaseClient || !currentUser) return false;
        try {
            const payload = getLocalUbysPayload();
            const { error } = await supabaseClient
                .from('ubys_kayitlari')
                .upsert({
                    user_id: currentUser.id,
                    grades_data: payload.grades,
                    attendance_data: payload.attendance,
                    active_kur: payload.activeKur,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (error) {
                console.error('UBYS bulut kayıt hatası:', error);
                const msg = error.code === 'PGRST205' || error.message?.includes('ubys_kayitlari')
                    ? "Supabase'de 'ubys_kayitlari' tablosu henüz oluşturulmamış."
                    : `Bulut kayıt hatası: ${error.message}`;
                showToast(msg, 'error');
                return false;
            }

            localStorage.removeItem(UBYS_DIRTY_KEY);
            localStorage.setItem(UBYS_LAST_USER_KEY, currentUser.id);
            if (showFeedbackToast) {
                showToast('Not ve devamsızlık verileri buluta kaydedildi!');
            }
            return true;
        } catch (err) {
            console.error('UBYS bulut bağlantı hatası:', err);
            if (showFeedbackToast) showToast('Bulut sunucusuna bağlanılamadı.', 'error');
            return false;
        }
    }

    async function loadAndMergeUbysFromCloud(user) {
        if (!supabaseClient || !user) return false;
        try {
            const { data, error } = await supabaseClient
                .from('ubys_kayitlari')
                .select('grades_data, attendance_data, active_kur')
                .eq('user_id', user.id)
                .maybeSingle();

            if (error) {
                console.error('UBYS bulut okuma hatası:', error);
                const msg = error.code === 'PGRST205' || error.message?.includes('ubys_kayitlari')
                    ? "Supabase'de 'ubys_kayitlari' tablosu bulunamadı!"
                    : `Bulut okuma hatası: ${error.message}`;
                showToast(msg, 'error');
                return false;
            }

            const local = getLocalUbysPayload();
            const isDirty = localStorage.getItem(UBYS_DIRTY_KEY) === '1';
            const lastUserId = localStorage.getItem(UBYS_LAST_USER_KEY);
            const hasLocalData = !isGradesEmpty(local.grades) || !isAttendanceEmpty(local.attendance);

            if (!data) {
                // Bulutta kayıt yoksa yerel veriyi silme, varsa buluta yükle
                localStorage.setItem(UBYS_LAST_USER_KEY, user.id);
                if (hasLocalData) {
                    await syncUbysToCloudNow(false);
                } else {
                    localStorage.removeItem(UBYS_DIRTY_KEY);
                }
                triggerPageRefresh();
                return true;
            }

            const cloudGrades = data.grades_data && typeof data.grades_data === 'object' ? data.grades_data : {};
            const cloudAtt = data.attendance_data && typeof data.attendance_data === 'object' ? data.attendance_data : {};
            const cloudKur = data.active_kur || null;
            const cloudIsEmpty = isGradesEmpty(cloudGrades) && isAttendanceEmpty(cloudAtt) && !cloudKur;
            const isSameUser = lastUserId === user.id;

            let finalGrades;
            let finalAtt;
            let finalKur;
            let shouldUploadMerged = false;

            if (!isSameUser && hasLocalData) {
                if (cloudIsEmpty) {
                    // Bulut boş ama giriş öncesi yerelde veri varsa yerel veriyi koru ve buluta yükle
                    finalGrades = local.grades;
                    finalAtt = local.attendance;
                    finalKur = local.activeKur;
                } else {
                    // Giriş öncesi anonim yerel veri girildiyse bulutla akıllı birleştirme yap
                    finalGrades = mergeUbysGrades(local.grades, cloudGrades, true);
                    finalAtt = mergeUbysAttendance(local.attendance, cloudAtt, true);
                    finalKur = local.activeKur || cloudKur || null;
                }
                shouldUploadMerged = true;
            } else if (isSameUser && isDirty) {
                // Zaten giriş yapmış kullanıcı yerelde değişiklik/silme yaptıysa yerel durumu buluta gönder
                finalGrades = local.grades;
                finalAtt = local.attendance;
                finalKur = local.activeKur;
                shouldUploadMerged = true;
            } else {
                // Normal eşitleme: bulut durumunu birebir uygula (silinen kayıtları yerelden geri getirme)
                finalGrades = cloudGrades;
                finalAtt = cloudAtt;
                finalKur = cloudKur;
                shouldUploadMerged = false;
            }

            saveLocalUbysPayload({ grades: finalGrades, attendance: finalAtt, activeKur: finalKur });
            localStorage.setItem(UBYS_LAST_USER_KEY, user.id);
            localStorage.removeItem(UBYS_DIRTY_KEY);

            if (shouldUploadMerged) {
                await syncUbysToCloudNow(false);
            }

            triggerPageRefresh();
            return true;
        } catch (err) {
            console.error('UBYS bulut yükleme hatası:', err);
            showToast('Bulut verileri yüklenirken bağlantı hatası oluştu.', 'error');
            return false;
        }
    }

    // ====================== AKILLI VERİ BİRLEŞTİRME (İŞKUR PUANTAJ) ======================

    function isIskurWeeksEmpty(weeks) {
        if (!weeks || typeof weeks !== 'object') return true;
        return !Object.values(weeks).some(
            (matrix) => Array.isArray(matrix) && matrix.some(
                (day) => Array.isArray(day) && day.some((v) => Number(v) > 0)
            )
        );
    }

    function isIskurManualEmpty(manual) {
        if (!manual || typeof manual !== 'object') return true;
        return !Object.values(manual).some(
            (arr) => Array.isArray(arr) && arr.some((v) => v !== null && v !== '' && v !== undefined)
        );
    }

    function mergeIskurWeeks(localWeeks, cloudWeeks, preferLocal) {
        const l = localWeeks && typeof localWeeks === 'object' ? localWeeks : {};
        const c = cloudWeeks && typeof cloudWeeks === 'object' ? cloudWeeks : {};
        const merged = {};
        const keys = new Set([...Object.keys(c), ...Object.keys(l)]);

        keys.forEach((weekKey) => {
            const cMat = Array.isArray(c[weekKey]) ? c[weekKey] : null;
            const lMat = Array.isArray(l[weekKey]) ? l[weekKey] : null;
            const outMat = Array.from({ length: 6 }, () => Array(10).fill(0));

            for (let d = 0; d < 6; d++) {
                const cDay = cMat && Array.isArray(cMat[d]) ? cMat[d] : Array(10).fill(0);
                const lDay = lMat && Array.isArray(lMat[d]) ? lMat[d] : Array(10).fill(0);
                const cHas = cDay.some((v) => Number(v) > 0);
                const lHas = lDay.some((v) => Number(v) > 0);

                for (let s = 0; s < 10; s++) {
                    const cVal = Number(cDay[s]) || 0;
                    const lVal = Number(lDay[s]) || 0;
                    if (lHas && !cHas) {
                        outMat[d][s] = lVal;
                    } else if (!lHas && cHas) {
                        outMat[d][s] = cVal;
                    } else if (lHas && cHas) {
                        outMat[d][s] = preferLocal ? (lVal > 0 ? lVal : cVal) : (cVal > 0 ? cVal : lVal);
                    }
                }
            }

            if (outMat.some((day) => day.some((v) => v > 0))) {
                merged[weekKey] = outMat;
            }
        });

        return merged;
    }

    function mergeIskurManual(localManual, cloudManual, preferLocal) {
        const l = localManual && typeof localManual === 'object' ? localManual : {};
        const c = cloudManual && typeof cloudManual === 'object' ? cloudManual : {};
        const merged = {};
        const keys = new Set([...Object.keys(c), ...Object.keys(l)]);

        keys.forEach((weekKey) => {
            const cArr = Array.isArray(c[weekKey]) ? c[weekKey] : Array(6).fill(null);
            const lArr = Array.isArray(l[weekKey]) ? l[weekKey] : Array(6).fill(null);
            const outArr = Array(6).fill(null);

            for (let d = 0; d < 6; d++) {
                const cVal = cArr[d] !== undefined && cArr[d] !== '' ? cArr[d] : null;
                const lVal = lArr[d] !== undefined && lArr[d] !== '' ? lArr[d] : null;

                if (lVal !== null && cVal === null) {
                    outArr[d] = lVal;
                } else if (lVal === null && cVal !== null) {
                    outArr[d] = cVal;
                } else if (lVal !== null && cVal !== null) {
                    outArr[d] = preferLocal ? lVal : cVal;
                }
            }

            if (outArr.some((v) => v !== null)) {
                merged[weekKey] = outArr;
            }
        });

        return merged;
    }

    function getLocalIskurPayload() {
        const weeks = readJsonStorage(ISKUR_WEEKS_KEY, null) || readJsonStorage(ISKUR_BACKUP_KEY, {});
        const manual = readJsonStorage(ISKUR_MANUAL_KEY, {});
        const studentName = localStorage.getItem(ISKUR_NAME_KEY) || '';
        return { weeks, manual, studentName };
    }

    function saveLocalIskurPayload({ weeks, manual, studentName }) {
        try {
            const serialized = JSON.stringify(weeks || {});
            localStorage.setItem(ISKUR_WEEKS_KEY, serialized);
            localStorage.setItem(ISKUR_BACKUP_KEY, serialized);
            localStorage.setItem(ISKUR_MANUAL_KEY, JSON.stringify(manual || {}));
            if (typeof studentName === 'string') {
                localStorage.setItem(ISKUR_NAME_KEY, studentName);
            }
        } catch (e) {}
    }

    async function syncIskurToCloudNow(showFeedbackToast = false) {
        if (!supabaseClient || !currentUser) return false;
        try {
            const payload = getLocalIskurPayload();
            const { error } = await supabaseClient
                .from('puantaj_kayitlari')
                .upsert({
                    user_id: currentUser.id,
                    weeks_data: payload.weeks,
                    manual_data: payload.manual,
                    student_name: payload.studentName,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (error) {
                console.error('İŞKUR bulut kayıt hatası:', error);
                const msg = error.code === 'PGRST205' || error.message?.includes('puantaj_kayitlari')
                    ? "Supabase'de 'puantaj_kayitlari' tablosu henüz oluşturulmamış."
                    : `Bulut kayıt hatası: ${error.message}`;
                showToast(msg, 'error');
                return false;
            }

            localStorage.removeItem(ISKUR_DIRTY_KEY);
            localStorage.setItem(ISKUR_LAST_USER_KEY, currentUser.id);
            if (showFeedbackToast) {
                showToast('Veriler buluta kaydedildi!');
            }
            return true;
        } catch (err) {
            console.error('İŞKUR bulut bağlantı hatası:', err);
            if (showFeedbackToast) showToast('Bulut sunucusuna bağlanılamadı.', 'error');
            return false;
        }
    }

    async function loadAndMergeIskurFromCloud(user) {
        if (!supabaseClient || !user) return false;
        try {
            const { data, error } = await supabaseClient
                .from('puantaj_kayitlari')
                .select('weeks_data, manual_data, student_name')
                .eq('user_id', user.id)
                .maybeSingle();

            if (error) {
                console.error('İŞKUR bulut okuma hatası:', error);
                const msg = error.code === 'PGRST205' || error.message?.includes('puantaj_kayitlari')
                    ? "Supabase'de 'puantaj_kayitlari' tablosu bulunamadı!"
                    : `Bulut okuma hatası: ${error.message}`;
                showToast(msg, 'error');
                return false;
            }

            const local = getLocalIskurPayload();
            const isDirty = localStorage.getItem(ISKUR_DIRTY_KEY) === '1';
            const lastUserId = localStorage.getItem(ISKUR_LAST_USER_KEY);
            const hasLocalData = !isIskurWeeksEmpty(local.weeks) || !isIskurManualEmpty(local.manual) || local.studentName.trim() !== '';

            if (!data) {
                localStorage.setItem(ISKUR_LAST_USER_KEY, user.id);
                if (hasLocalData) {
                    await syncIskurToCloudNow(false);
                } else {
                    localStorage.removeItem(ISKUR_DIRTY_KEY);
                }
                triggerPageRefresh();
                return true;
            }

            const cloudWeeks = data.weeks_data && typeof data.weeks_data === 'object' ? data.weeks_data : {};
            const cloudManual = data.manual_data && typeof data.manual_data === 'object' ? data.manual_data : {};
            const cloudName = typeof data.student_name === 'string' ? data.student_name : '';
            const cloudIsEmpty = isIskurWeeksEmpty(cloudWeeks) && isIskurManualEmpty(cloudManual) && cloudName.trim() === '';
            const isSameUser = lastUserId === user.id;

            let finalWeeks;
            let finalManual;
            let finalName;
            let shouldUploadMerged = false;

            if (!isSameUser && hasLocalData) {
                if (cloudIsEmpty) {
                    finalWeeks = local.weeks;
                    finalManual = local.manual;
                    finalName = local.studentName;
                } else {
                    finalWeeks = mergeIskurWeeks(local.weeks, cloudWeeks, true);
                    finalManual = mergeIskurManual(local.manual, cloudManual, true);
                    finalName = local.studentName.trim() || cloudName;
                }
                shouldUploadMerged = true;
            } else if (isSameUser && isDirty) {
                finalWeeks = local.weeks;
                finalManual = local.manual;
                finalName = local.studentName;
                shouldUploadMerged = true;
            } else {
                finalWeeks = cloudWeeks;
                finalManual = cloudManual;
                finalName = cloudName;
                shouldUploadMerged = false;
            }

            saveLocalIskurPayload({ weeks: finalWeeks, manual: finalManual, studentName: finalName });
            localStorage.setItem(ISKUR_LAST_USER_KEY, user.id);
            localStorage.removeItem(ISKUR_DIRTY_KEY);

            if (shouldUploadMerged) {
                await syncIskurToCloudNow(false);
            }

            triggerPageRefresh();
            return true;
        } catch (err) {
            console.error('İŞKUR bulut yükleme hatası:', err);
            showToast('Bulut verileri yüklenirken bağlantı hatası oluştu.', 'error');
            return false;
        }
    }

    function triggerPageRefresh() {
        const page = getPageType();
        if (page === 'grades') {
            if (typeof loadAllInputsFromStorage === 'function') loadAllInputsFromStorage();
            if (typeof calculateGrades === 'function') calculateGrades();
        } else if (page === 'attendance') {
            if (typeof loadAttendanceFromStorage === 'function') loadAttendanceFromStorage();
            if (typeof renderCalendar === 'function') renderCalendar();
            if (typeof renderDayEditor === 'function') renderDayEditor();
        }

        if (typeof pageHooks.onDataSynced === 'function') {
            pageHooks.onDataSynced();
        }
    }

    async function loadActivePageFromCloud(user) {
        if (!user || isSyncing) return false;
        isSyncing = true;
        try {
            const page = getPageType();
            if (page === 'home') {
                const ubysOk = await loadAndMergeUbysFromCloud(user);
                const iskurOk = await loadAndMergeIskurFromCloud(user);
                return ubysOk && iskurOk;
            }
            if (page === 'iskur') {
                return await loadAndMergeIskurFromCloud(user);
            }
            return await loadAndMergeUbysFromCloud(user);
        } finally {
            isSyncing = false;
        }
    }

    // ====================== MODAL VE ARAYÜZ ENJEKSİYONU ======================

    function ensureAuthDOM() {
        if (!document.getElementById('auth-modal')) {
            const modalWrapper = document.createElement('div');
            modalWrapper.innerHTML = `
                <div id="auth-modal" class="no-print fixed inset-0 z-50 hidden items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm transition-opacity duration-300">
                    <div class="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 max-h-[92vh] overflow-y-auto animate-modal">
                        <div class="flex items-center justify-between mb-4">
                            <div class="flex items-center gap-3">
                                <div class="p-2.5 bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-100 dark:border-emerald-900/50 shrink-0">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                    </svg>
                                </div>
                                <div>
                                    <h3 id="auth-modal-title" class="text-base sm:text-lg font-extrabold text-slate-800 dark:text-slate-100">Bulut Hesap &amp; Profil</h3>
                                    <p class="text-xs text-slate-500 dark:text-slate-400">Verilerini eşitle veya şifreni yönet</p>
                                </div>
                            </div>
                            <button id="auth-close-btn" type="button" aria-label="Kapat" class="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>

                        <!-- 1) Giriş Yapılmamışken Görünen Ekran -->
                        <div id="auth-logged-out-view">
                            <div class="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 mb-4 border border-slate-200/70 dark:border-slate-700/70">
                                <button id="auth-tab-login" type="button" class="py-2 rounded-lg text-xs sm:text-sm font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm transition">
                                    Giriş Yap
                                </button>
                                <button id="auth-tab-register" type="button" class="py-2 rounded-lg text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition">
                                    Kayıt Ol
                                </button>
                            </div>

                            <form id="auth-form" class="space-y-3.5">
                                <div>
                                    <label for="auth-email" class="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                                        E-posta Adresi
                                    </label>
                                    <input type="email" id="auth-email" required placeholder="ornek@mail.com" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-medium focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition">
                                </div>

                                <div id="auth-password-wrapper">
                                    <div class="flex items-center justify-between mb-1">
                                        <label for="auth-password" class="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                            Şifre (En az 6 karakter)
                                        </label>
                                        <button id="auth-forgot-link" type="button" class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                                            Şifremi Unuttum
                                        </button>
                                    </div>
                                    <input type="password" id="auth-password" required minlength="6" placeholder="••••••••" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-medium focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition">
                                </div>

                                <p id="auth-error-msg" class="hidden text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2"></p>
                                <p id="auth-info-msg" class="hidden text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2"></p>

                                <button id="auth-submit-btn" type="submit" class="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-98 shadow-sm transition">
                                    Giriş Yap
                                </button>

                                <button id="auth-back-login-btn" type="button" class="hidden w-full py-2 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition">
                                    ← Giriş ekranına dön
                                </button>
                            </form>

                            <p class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed text-center">
                                Giriş yapmak zorunlu değildir; giriş yaptığınızda cihazdaki mevcut verileriniz bulutla güvenle birleştirilir.
                            </p>
                        </div>

                        <!-- 2) Giriş Yapılmışken Görünen Profil & Şifre Ekranı -->
                        <div id="auth-logged-in-view" class="hidden space-y-4">
                            <div class="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-4">
                                <div class="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1">
                                    <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <span>Bulut Senkronizasyonu Aktif</span>
                                </div>
                                <p id="auth-user-email-display" class="text-sm font-extrabold text-slate-900 dark:text-slate-100 break-all"></p>
                                <p class="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                    Not, devamsızlık ve puantaj verileriniz bulut hesabınıza otomatik eşitlenir.
                                </p>
                            </div>

                            <button id="profile-toggle-pw-btn" type="button" class="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 transition flex items-center justify-center gap-2">
                                <span>🔑 Şifreyi Değiştir</span>
                            </button>

                            <form id="profile-password-form" class="hidden bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 space-y-3">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                        Şifre Değiştir / Belirle
                                    </span>
                                    <span class="text-[11px] text-slate-400">En az 6 karakter</span>
                                </div>

                                <div class="space-y-2">
                                    <input type="password" id="profile-new-password" required minlength="6" placeholder="Yeni şifreniz" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition">
                                    <input type="password" id="profile-confirm-password" required minlength="6" placeholder="Yeni şifreniz (tekrar)" class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition">
                                </div>

                                <p id="profile-pw-msg" class="hidden text-xs font-semibold rounded-xl px-3 py-2"></p>

                                <button id="profile-pw-submit-btn" type="submit" class="w-full py-2 rounded-xl text-xs sm:text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition">
                                    Yeni Şifreyi Kaydet
                                </button>
                            </form>

                            <div class="pt-2 border-t border-slate-200/80 dark:border-zinc-800 space-y-2">
                                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                                    Yerel Veri Yedekleme (Tüm Uygulamalar)
                                </div>
                                <div class="grid grid-cols-2 gap-2">
                                    <button id="profile-export-btn" type="button" class="px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-200 bg-slate-100 hover:bg-slate-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 border border-slate-200 dark:border-zinc-700 transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95">
                                        <svg class="w-3.5 h-3.5 text-[#0F4C81] dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                                        </svg>
                                        <span>Yedek İndir</span>
                                    </button>
                                    <button id="profile-import-btn" type="button" class="px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-200 bg-slate-100 hover:bg-slate-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 border border-slate-200 dark:border-zinc-700 transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95">
                                        <svg class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                                        </svg>
                                        <span>Yedek İçe Aktar</span>
                                    </button>
                                </div>
                            </div>

                            <div class="flex items-center justify-between gap-2 pt-1">
                                <button id="auth-sync-now-btn" type="button" class="flex-1 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 border border-indigo-200 dark:border-indigo-800/70 transition">
                                    Şimdi Eşitle
                                </button>
                                <button id="auth-logout-btn" type="button" class="flex-1 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 transition">
                                    Çıkış Yap
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modalWrapper.firstElementChild);
        }

        if (!document.getElementById('toast-message') && !document.getElementById('sbtu-auth-toast')) {
            const toastWrapper = document.createElement('div');
            toastWrapper.innerHTML = `
                <div id="sbtu-auth-toast" role="status" aria-live="polite" class="no-print fixed bottom-5 right-5 z-50 hidden transform transition-all duration-300 bg-slate-900 dark:bg-slate-800 text-white border border-slate-700 text-xs sm:text-sm font-medium px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 max-w-sm">
                    <span data-toast-icon>✅</span>
                    <span data-toast-text>İşlem tamamlandı.</span>
                </div>
            `;
            document.body.appendChild(toastWrapper.firstElementChild);
        }
    }

    function setAuthMode(mode) {
        authMode = mode;
        const authTabLogin = document.getElementById('auth-tab-login');
        const authTabRegister = document.getElementById('auth-tab-register');
        const authPasswordWrapper = document.getElementById('auth-password-wrapper');
        const authPasswordInput = document.getElementById('auth-password');
        const authForgotLink = document.getElementById('auth-forgot-link');
        const authBackLoginBtn = document.getElementById('auth-back-login-btn');
        const authSubmitBtn = document.getElementById('auth-submit-btn');
        const authErrorMsg = document.getElementById('auth-error-msg');
        const authInfoMsg = document.getElementById('auth-info-msg');

        if (!authTabLogin) return;

        authErrorMsg.classList.add('hidden');
        authInfoMsg.classList.add('hidden');

        if (mode === 'login') {
            authTabLogin.className = 'py-2 rounded-lg text-xs sm:text-sm font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm transition';
            authTabRegister.className = 'py-2 rounded-lg text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition';
            authPasswordWrapper.classList.remove('hidden');
            authPasswordInput.required = true;
            authForgotLink.classList.remove('hidden');
            authBackLoginBtn.classList.add('hidden');
            authSubmitBtn.textContent = 'Giriş Yap';
        } else if (mode === 'register') {
            authTabRegister.className = 'py-2 rounded-lg text-xs sm:text-sm font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm transition';
            authTabLogin.className = 'py-2 rounded-lg text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition';
            authPasswordWrapper.classList.remove('hidden');
            authPasswordInput.required = true;
            authForgotLink.classList.add('hidden');
            authBackLoginBtn.classList.add('hidden');
            authSubmitBtn.textContent = 'Hesap Oluştur (Kayıt Ol)';
        } else if (mode === 'forgot') {
            authTabLogin.className = 'py-2 rounded-lg text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition';
            authTabRegister.className = 'py-2 rounded-lg text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition';
            authPasswordWrapper.classList.add('hidden');
            authPasswordInput.required = false;
            authForgotLink.classList.add('hidden');
            authBackLoginBtn.classList.remove('hidden');
            authSubmitBtn.textContent = 'Şifre Sıfırlama Bağlantısı Gönder';
        }
    }

    function updateAuthUI() {
        const authOpenBtn = document.getElementById('auth-open-btn');
        const authBtnLabel = document.getElementById('auth-btn-label');
        const authLoggedOutView = document.getElementById('auth-logged-out-view');
        const authLoggedInView = document.getElementById('auth-logged-in-view');
        const authUserEmailDisplay = document.getElementById('auth-user-email-display');

        if (currentUser) {
            const shortName = currentUser.email ? currentUser.email.split('@')[0] : 'Profil';
            if (authBtnLabel) authBtnLabel.textContent = shortName;
            if (authOpenBtn) {
                authOpenBtn.className = 'h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-xl bg-emerald-500/30 hover:bg-emerald-500/40 active:scale-95 text-white border border-emerald-300/50 backdrop-blur-md text-xs sm:text-sm font-bold transition flex items-center gap-1.5 shadow-sm';
            }
            if (authLoggedOutView) authLoggedOutView.classList.add('hidden');
            if (authLoggedInView) authLoggedInView.classList.remove('hidden');
            if (authUserEmailDisplay) authUserEmailDisplay.textContent = currentUser.email || '';
        } else {
            if (authBtnLabel) authBtnLabel.textContent = 'Giriş Yap';
            if (authOpenBtn) {
                authOpenBtn.className = 'h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 active:scale-95 text-emerald-100 border border-emerald-400/30 backdrop-blur-md text-xs sm:text-sm font-bold transition flex items-center gap-1.5 shadow-sm';
            }
            if (authLoggedInView) authLoggedInView.classList.add('hidden');
            if (authLoggedOutView) authLoggedOutView.classList.remove('hidden');
        }

        if (typeof pageHooks.onDataSynced === 'function') {
            pageHooks.onDataSynced();
        }
    }

    function openAuthModal(focusPasswordReset = false) {
        ensureAuthDOM();
        const modal = document.getElementById('auth-modal');
        const authErrorMsg = document.getElementById('auth-error-msg');
        const authInfoMsg = document.getElementById('auth-info-msg');
        const profilePwMsg = document.getElementById('profile-pw-msg');
        const profilePwForm = document.getElementById('profile-password-form');
        const profileNewPwInput = document.getElementById('profile-new-password');
        const profileConfirmPwInput = document.getElementById('profile-confirm-password');

        if (authErrorMsg) authErrorMsg.classList.add('hidden');
        if (authInfoMsg) authInfoMsg.classList.add('hidden');
        if (profilePwMsg) profilePwMsg.classList.add('hidden');
        if (profileNewPwInput) profileNewPwInput.value = '';
        if (profileConfirmPwInput) profileConfirmPwInput.value = '';

        if (profilePwForm) {
            if (focusPasswordReset && currentUser) {
                profilePwForm.classList.remove('hidden');
            } else {
                profilePwForm.classList.add('hidden');
            }
        }

        updateAuthUI();
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.style.overflow = 'hidden';

        if (focusPasswordReset && currentUser && profileNewPwInput) {
            setTimeout(() => profileNewPwInput.focus(), 60);
        }
    }

    function closeAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            document.body.style.overflow = '';
        }
    }

    function bindAuthEvents() {
        const authOpenBtn = document.getElementById('auth-open-btn');
        const authModalEl = document.getElementById('auth-modal');
        const authCloseBtn = document.getElementById('auth-close-btn');
        const authTabLogin = document.getElementById('auth-tab-login');
        const authTabRegister = document.getElementById('auth-tab-register');
        const authForgotLink = document.getElementById('auth-forgot-link');
        const authBackLoginBtn = document.getElementById('auth-back-login-btn');
        const authForm = document.getElementById('auth-form');
        const authEmailInput = document.getElementById('auth-email');
        const authPasswordInput = document.getElementById('auth-password');
        const authErrorMsg = document.getElementById('auth-error-msg');
        const authInfoMsg = document.getElementById('auth-info-msg');
        const authSubmitBtn = document.getElementById('auth-submit-btn');

        const profileTogglePwBtn = document.getElementById('profile-toggle-pw-btn');
        const profilePwForm = document.getElementById('profile-password-form');
        const profileNewPwInput = document.getElementById('profile-new-password');
        const profileConfirmPwInput = document.getElementById('profile-confirm-password');
        const profilePwMsg = document.getElementById('profile-pw-msg');
        const profilePwSubmitBtn = document.getElementById('profile-pw-submit-btn');
        const profileExportBtn = document.getElementById('profile-export-btn');
        const profileImportBtn = document.getElementById('profile-import-btn');
        const authSyncNowBtn = document.getElementById('auth-sync-now-btn');
        const authLogoutBtn = document.getElementById('auth-logout-btn');

        if (authOpenBtn) authOpenBtn.addEventListener('click', () => openAuthModal(false));
        if (authCloseBtn) authCloseBtn.addEventListener('click', closeAuthModal);
        if (authModalEl) {
            authModalEl.addEventListener('click', (e) => {
                if (e.target === authModalEl) closeAuthModal();
            });
        }
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAuthModal();
        });

        if (authTabLogin) authTabLogin.addEventListener('click', () => setAuthMode('login'));
        if (authTabRegister) authTabRegister.addEventListener('click', () => setAuthMode('register'));
        if (authForgotLink) authForgotLink.addEventListener('click', () => setAuthMode('forgot'));
        if (authBackLoginBtn) authBackLoginBtn.addEventListener('click', () => setAuthMode('login'));

        if (authForm) {
            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!supabaseClient) {
                    authErrorMsg.textContent = 'Bulut servisi yüklenemedi. İnternet bağlantınızı kontrol edin.';
                    authErrorMsg.classList.remove('hidden');
                    return;
                }

                const email = authEmailInput.value.trim();
                const password = authPasswordInput.value;
                authErrorMsg.classList.add('hidden');
                authInfoMsg.classList.add('hidden');
                authSubmitBtn.disabled = true;
                authSubmitBtn.textContent = 'İşleniyor...';

                try {
                    if (authMode === 'forgot') {
                        const redirectUrl = 'https://berkay-kocak.github.io/ubys/';
                        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                            redirectTo: redirectUrl
                        });
                        if (error) throw error;

                        authInfoMsg.textContent = 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi! Gelen kutunuzu (ve spam klasörünü) kontrol edin.';
                        authInfoMsg.classList.remove('hidden');
                    } else if (authMode === 'register') {
                        const { data, error } = await supabaseClient.auth.signUp({ email, password });
                        if (error) throw error;

                        if (data.session && data.user) {
                            currentUser = data.user;
                            await loadActivePageFromCloud(currentUser);
                            updateAuthUI();
                            closeAuthModal();
                            showToast('Hesabınız oluşturuldu ve verileriniz buluta aktarıldı!');
                        } else {
                            authInfoMsg.textContent = 'Kayıt başarılı! E-posta onay bağlantısı gönderildiyse onayladıktan sonra giriş yapabilirsiniz.';
                            authInfoMsg.classList.remove('hidden');
                            setAuthMode('login');
                        }
                    } else {
                        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
                        if (error) throw error;

                        currentUser = data.user;
                        const ok = await loadActivePageFromCloud(currentUser);
                        updateAuthUI();
                        closeAuthModal();
                        if (ok) {
                            showToast(`Hoş geldin, ${currentUser.email}! Verilerin eşitlendi.`);
                        }
                    }
                } catch (err) {
                    let msg = err.message || 'İşlem başarısız oldu.';
                    if (msg.includes('Invalid login credentials')) msg = 'E-posta veya şifre hatalı.';
                    if (msg.includes('Email not confirmed')) msg = 'E-posta adresinize gönderilen onay bağlantısına tıkladıktan sonra giriş yapabilirsiniz.';
                    if (msg.includes('User already registered')) msg = 'Bu e-posta adresi zaten kayıtlı. Giriş Yap sekmesini kullanın.';
                    if (msg.includes('Password should be at least')) msg = 'Şifre en az 6 karakter olmalıdır.';
                    if (msg.includes('rate limit')) msg = 'Çok fazla deneme yapıldı. Lütfen biraz bekleyip tekrar deneyin.';
                    authErrorMsg.textContent = msg;
                    authErrorMsg.classList.remove('hidden');
                } finally {
                    authSubmitBtn.disabled = false;
                    if (authMode === 'login') authSubmitBtn.textContent = 'Giriş Yap';
                    else if (authMode === 'register') authSubmitBtn.textContent = 'Hesap Oluştur (Kayıt Ol)';
                    else authSubmitBtn.textContent = 'Şifre Sıfırlama Bağlantısı Gönder';
                }
            });
        }

        if (profileExportBtn) {
            profileExportBtn.addEventListener('click', () => {
                closeAuthModal();
                if (typeof openExportModal === 'function') {
                    openExportModal();
                }
            });
        }

        if (profileImportBtn) {
            profileImportBtn.addEventListener('click', () => {
                const fileInput = document.getElementById('import-file-input');
                if (fileInput) {
                    closeAuthModal();
                    fileInput.click();
                } else if (typeof openImportModal === 'function') {
                    closeAuthModal();
                    openImportModal();
                }
            });
        }

        if (profileTogglePwBtn && profilePwForm) {
            profileTogglePwBtn.addEventListener('click', () => {
                const willOpen = profilePwForm.classList.contains('hidden');
                profilePwForm.classList.toggle('hidden');
                if (profilePwMsg) profilePwMsg.classList.add('hidden');
                if (willOpen && profileNewPwInput) {
                    setTimeout(() => profileNewPwInput.focus(), 50);
                }
            });
        }

        if (profilePwForm) {
            profilePwForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!supabaseClient || !currentUser) return;

                const newPw = profileNewPwInput.value;
                const confirmPw = profileConfirmPwInput.value;
                profilePwMsg.classList.add('hidden');

                if (newPw.length < 6) {
                    profilePwMsg.textContent = 'Yeni şifre en az 6 karakter olmalıdır.';
                    profilePwMsg.className = 'text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2';
                    profilePwMsg.classList.remove('hidden');
                    return;
                }

                if (newPw !== confirmPw) {
                    profilePwMsg.textContent = 'Girdiğiniz iki şifre birbiriyle eşleşmiyor.';
                    profilePwMsg.className = 'text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2';
                    profilePwMsg.classList.remove('hidden');
                    return;
                }

                profilePwSubmitBtn.disabled = true;
                profilePwSubmitBtn.textContent = 'Güncelleniyor...';

                try {
                    const { error } = await supabaseClient.auth.updateUser({ password: newPw });
                    if (error) throw error;

                    profileNewPwInput.value = '';
                    profileConfirmPwInput.value = '';
                    profilePwForm.classList.add('hidden');
                    profilePwMsg.classList.add('hidden');
                    showToast('Şifreniz başarıyla güncellendi!');
                } catch (err) {
                    let msg = err.message || 'Şifre güncellenemedi.';
                    if (msg.includes('New password should be different')) {
                        msg = 'Yeni şifreniz mevcut şifrenizden farklı olmalıdır.';
                    }
                    profilePwMsg.textContent = msg;
                    profilePwMsg.className = 'text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2';
                    profilePwMsg.classList.remove('hidden');
                } finally {
                    profilePwSubmitBtn.disabled = false;
                    profilePwSubmitBtn.textContent = 'Yeni Şifreyi Kaydet';
                }
            });
        }

        if (authSyncNowBtn) {
            authSyncNowBtn.addEventListener('click', async () => {
                if (!currentUser) return;
                authSyncNowBtn.disabled = true;
                authSyncNowBtn.textContent = 'Eşitleniyor...';
                const page = getPageType();
                const mergedOk = await loadActivePageFromCloud(currentUser);
                let savedOk = false;
                if (mergedOk) {
                    if (page === 'home') {
                        const uOk = await syncUbysToCloudNow(false);
                        const iOk = await syncIskurToCloudNow(false);
                        savedOk = uOk && iOk;
                    } else if (page === 'iskur') {
                        savedOk = await syncIskurToCloudNow(false);
                    } else {
                        savedOk = await syncUbysToCloudNow(false);
                    }
                }
                authSyncNowBtn.disabled = false;
                authSyncNowBtn.textContent = 'Şimdi Eşitle';
                if (savedOk) {
                    showToast('Tüm veriler bulutla eşitlendi!');
                }
            });
        }

        if (authLogoutBtn) {
            authLogoutBtn.addEventListener('click', async () => {
                if (!supabaseClient) return;
                await supabaseClient.auth.signOut();
                currentUser = null;

                const page = getPageType();
                try {
                    if (page === 'home') {
                        localStorage.removeItem(ISKUR_WEEKS_KEY);
                        localStorage.removeItem(ISKUR_BACKUP_KEY);
                        localStorage.removeItem(ISKUR_MANUAL_KEY);
                        localStorage.removeItem(ISKUR_DIRTY_KEY);
                        localStorage.removeItem(ISKUR_LAST_USER_KEY);
                        localStorage.removeItem(UBYS_GRADES_KEY);
                        localStorage.removeItem(UBYS_ATT_KEY);
                        localStorage.removeItem(UBYS_KUR_KEY);
                        localStorage.removeItem(UBYS_DIRTY_KEY);
                        localStorage.removeItem(UBYS_LAST_USER_KEY);
                    } else if (page === 'iskur') {
                        localStorage.removeItem(ISKUR_WEEKS_KEY);
                        localStorage.removeItem(ISKUR_BACKUP_KEY);
                        localStorage.removeItem(ISKUR_MANUAL_KEY);
                        localStorage.removeItem(ISKUR_DIRTY_KEY);
                        localStorage.removeItem(ISKUR_LAST_USER_KEY);
                    } else {
                        localStorage.removeItem(UBYS_GRADES_KEY);
                        localStorage.removeItem(UBYS_ATT_KEY);
                        localStorage.removeItem(UBYS_KUR_KEY);
                        localStorage.removeItem(UBYS_DIRTY_KEY);
                        localStorage.removeItem(UBYS_LAST_USER_KEY);
                    }
                } catch (e) {}

                if (typeof pageHooks.onLogout === 'function') {
                    pageHooks.onLogout();
                } else {
                    triggerPageRefresh();
                }

                updateAuthUI();
                closeAuthModal();
                showToast('Hesaptan çıkış yapıldı.');
            });
        }
    }

    async function initSession() {
        if (!supabaseClient) return;
        try {
            const rawHash = window.location.hash || '';
            const rawSearch = window.location.search || '';
            const isRecoveryUrl =
                rawHash.includes('type=recovery') ||
                rawSearch.includes('type=recovery') ||
                rawHash.includes('access_token=') ||
                rawSearch.includes('code=');

            let recoveryHandled = false;

            const cleanRecoveryUrl = () => {
                try {
                    if (window.history && typeof window.history.replaceState === 'function') {
                        window.history.replaceState(null, document.title, window.location.pathname);
                    }
                } catch (e) {}
            };

            const handleRecoverySession = (user) => {
                if (!user) return;
                currentUser = user;
                updateAuthUI();
                if (!recoveryHandled) {
                    recoveryHandled = true;
                    openAuthModal(true);
                    showToast('Lütfen profil penceresinden yeni şifrenizi belirleyin.');
                    cleanRecoveryUrl();
                }
            };

            supabaseClient.auth.onAuthStateChange(async (event, session) => {
                if (event === 'PASSWORD_RECOVERY' && session && session.user) {
                    handleRecoverySession(session.user);
                } else if (event === 'SIGNED_IN' && session && session.user) {
                    currentUser = session.user;
                    updateAuthUI();
                    if (isRecoveryUrl && !recoveryHandled) {
                        handleRecoverySession(session.user);
                    }
                    await loadActivePageFromCloud(currentUser);
                } else if (event === 'SIGNED_OUT') {
                    currentUser = null;
                    updateAuthUI();
                }
            });

            const { data } = await supabaseClient.auth.getSession();
            if (data && data.session && data.session.user) {
                currentUser = data.session.user;
                updateAuthUI();
                if (isRecoveryUrl) {
                    handleRecoverySession(currentUser);
                }
                await loadActivePageFromCloud(currentUser);
            }
        } catch (e) {
            console.warn('Oturum kontrol hatası:', e);
        }
    }

    // ====================== DIŞA AÇIK API ======================

    window.SbtuAuth = {
        init() {
            if (initialized) return;
            initialized = true;
            ensureAuthDOM();
            bindAuthEvents();
            updateAuthUI();
            initSession();
        },
        registerPageHooks(hooks = {}) {
            if (typeof hooks.onDataSynced === 'function') pageHooks.onDataSynced = hooks.onDataSynced;
            if (typeof hooks.onLogout === 'function') pageHooks.onLogout = hooks.onLogout;
        },
        getUser() {
            return currentUser;
        },
        isLoggedIn() {
            return Boolean(currentUser);
        },
        openAuthModal,
        showToast,
        markUbysDirty() {
            try {
                localStorage.setItem(UBYS_DIRTY_KEY, '1');
            } catch (e) {}
            if (!currentUser) return;
            clearTimeout(ubysSyncTimer);
            ubysSyncTimer = setTimeout(() => {
                syncUbysToCloudNow(false);
            }, 600);
        },
        markIskurDirty() {
            try {
                localStorage.setItem(ISKUR_DIRTY_KEY, '1');
            } catch (e) {}
            if (!currentUser) return;
            clearTimeout(iskurSyncTimer);
            iskurSyncTimer = setTimeout(() => {
                syncIskurToCloudNow(false);
            }, 600);
        },
        syncUbysNow: syncUbysToCloudNow,
        syncIskurNow: syncIskurToCloudNow
    };
})();
