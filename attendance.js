/**
 * SBTÜ Hazırlık Sistemi - Devamsızlık Takibi, Kaçak İmza ve Akademik Takvim Motoru
 * - 5 Kurluk Resmi Akademik Takvim (Kur 1, Kur 2, Kur 3, Kur 4, Yaz Okulu) (app.js üzerinden ortak)
 * - Resmi tatil ve bayram günleri filtrelemesi
 * - Dinamik ve tarihe duyarlı akıllı kur tespiti
 * - SBTÜ YDYO Yönergesi Madde 17 Devamsızlık Hükümleri
 *   (%80 devam zorunluluğu, 35 saat özürsüz sınır, %10 = 17.5 saat rapor kotası)
 * - Kaçak İmza Takibi (Şüpheli Risk ve Başarılı Kurtarma)
 * - Haftalık hızlı saat dağıtımı & günlük 5 ders slotu etkileşimi
 * - Devamsızlık kayıt günlüğü (log) listelemesi
 */

function validateCourseData() {
    const lessonsPerDay = 5;

    Object.values(KURS_DATA).forEach((course) => {
        const days = course.weeks.flatMap((week) => week.days);
        const holidayCount = days.filter((day) => day.isHoliday).length;
        const listedHours = days.length * lessonsPerDay;
        const scheduledHours = (days.length - holidayCount) * lessonsPerDay;
        const expectedWeeks = course.weeks.length;

        if (course.totalWeeks !== expectedWeeks) {
            console.warn(
                `[Takvim] ${course.id}: totalWeeks=${course.totalWeeks}, ` +
                `weeks.length=${expectedWeeks}`
            );
        }

        if (course.totalHours !== listedHours && course.totalHours !== scheduledHours) {
            console.warn(
                `[Takvim] ${course.id}: totalHours=${course.totalHours}, ` +
                `listelenen=${listedHours}, tatiller çıkarılmış=${scheduledHours}`
            );
        }

        const expectedUnexcused = course.totalHours * 0.20;
        const expectedMedical = course.totalHours * 0.10;
        if (course.maxUnexcused !== expectedUnexcused || course.maxMedical !== expectedMedical) {
            console.warn(
                `[Takvim] ${course.id}: devamsızlık limitleri totalHours ile uyumsuz.`
            );
        }
    });
}

validateCourseData();

// Çoklu Kur Devamsızlık Belleği: { kur1: { '2026-09-21': ['present', ...] }, kur2: {...} }
let multiKurAttendance = {
    kur1: {},
    kur2: {},
    kur3: {},
    kur4: {},
    yaz: {}
};

let activeKurId = 'kur1';
let selectedDateId = '2026-11-02';
let currentFastType = 'unexcused';

// ====================== DİNAMİK KUR TESPİTİ VE YÖNETİMİ ======================

function setKur(kId) {
    if (kId === 'auto') {
        SafeStorage.remove(ACTIVE_KUR_PREF_KEY);
        activeKurId = detectCurrentKurId();
    } else {
        if (!KURS_DATA[kId]) return;
        activeKurId = kId;
        SafeStorage.set(ACTIVE_KUR_PREF_KEY, activeKurId);
    }

    if (window.SbtuAuth && typeof window.SbtuAuth.markUbysDirty === 'function') {
        window.SbtuAuth.markUbysDirty();
    }

    // Seçili günü bu kurun ilk geçerli gününe veya bugüne ayarla
    const curKur = KURS_DATA[activeKurId];
    if (curKur && curKur.weeks[0]) {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const todayStr = `${y}-${m}-${d}`;

        let foundToday = false;
        curKur.weeks.forEach(w => {
            w.days.forEach(day => {
                if (day.id === todayStr) {
                    selectedDateId = day.id;
                    foundToday = true;
                }
            });
        });

        if (!foundToday) {
            selectedDateId = curKur.weeks[0].days[0].id;
        }
    }

    renderKurSelector();
    calculateAttendance();
    renderCalendar();
    renderDayEditor();
}

function renderKurSelector() {
    const container = document.getElementById('kur-selector-buttons');
    if (!container) return;
    container.innerHTML = '';

    const isAuto = !SafeStorage.get(ACTIVE_KUR_PREF_KEY);
    const activeKur = KURS_DATA[activeKurId];
    
    const calTitle = document.getElementById('calendar-header-title');
    const calSub = document.getElementById('calendar-header-subtitle');
    if (calTitle) calTitle.innerText = activeKur.title;
    if (calSub) calSub.innerText = activeKur.subtitle;

    // Güncel Tarih Etiketi
    const now = new Date();
    const dateOptions = { day: '2-digit', month: 'long', year: 'numeric' };
    const formattedDate = now.toLocaleDateString('tr-TR', dateOptions);
    const dateInfoEl = document.getElementById('current-date-info');
    if (dateInfoEl) dateInfoEl.innerText = `Bugün: ${formattedDate}`;

    // Otomatik Takip Butonu
    const autoBtn = document.createElement('button');
    autoBtn.type = 'button';
    autoBtn.onclick = () => setKur('auto');
    autoBtn.className = `py-1.5 px-2 rounded-xl border text-xs text-center transition-all active:scale-95 flex flex-col items-center justify-center ${
        isAuto 
        ? 'bg-emerald-600 text-white font-extrabold shadow-md border-emerald-600' 
        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 font-semibold'
    }`;
    autoBtn.innerHTML = `
        <span class="truncate w-full flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full ${isAuto ? 'bg-white animate-pulse' : 'bg-emerald-500'}"></span>Otomatik</span>
        <span class="text-[9px] ${isAuto ? 'text-emerald-100' : 'text-slate-400'} font-normal">Takvimle Senkron</span>
    `;
    container.appendChild(autoBtn);

    // Manuel Kur Butonları
    for (let kId in KURS_DATA) {
        const k = KURS_DATA[kId];
        const isActive = !isAuto && kId === activeKurId;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.onclick = () => setKur(kId);

        let btnClass = isActive 
            ? 'bg-indigo-600 text-white font-extrabold shadow-md border-indigo-600' 
            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 font-semibold';

        btn.className = `py-1.5 px-2 rounded-xl border text-xs text-center transition-all active:scale-95 flex flex-col items-center justify-center ${btnClass}`;
        btn.innerHTML = `
            <span class="truncate w-full">${k.name}</span>
            <span class="text-[9px] ${isActive ? 'text-indigo-200' : 'text-slate-400'} font-normal">${k.totalWeeks} Hafta (${k.maxUnexcused}s)</span>
        `;
        container.appendChild(btn);
    }
}

// ====================== VERİ DEPOLAMA VE HESAPLAMA MOTORU ======================

function loadAttendanceFromStorage() {
    const rawMulti = SafeStorage.get(ATTENDANCE_ALL_KURS_KEY);
    if (rawMulti) {
        try {
            multiKurAttendance = sanitizeAttendanceState(JSON.parse(rawMulti));
        } catch (e) {
            multiKurAttendance = createEmptyAttendanceState();
        }
    } else {
        multiKurAttendance = createEmptyAttendanceState();
        // Eski tekli cache varsa kur1'e taşı
        const legacy = SafeStorage.get('sbtu_attendance_cache');
        if (legacy) {
            try { multiKurAttendance.kur1 = sanitizeAttendanceState({ kur1: JSON.parse(legacy) }).kur1; } catch (e) {}
        }
    }

    const savedKur = SafeStorage.get(ACTIVE_KUR_PREF_KEY);
    activeKurId = (savedKur && KURS_DATA[savedKur]) ? savedKur : detectCurrentKurId();

    const curKur = KURS_DATA[activeKurId];
    if (curKur && curKur.weeks[0]) {
        selectedDateId = curKur.weeks[0].days[0].id;
    }

    renderKurSelector();
    calculateAttendance();
}

function saveAttendanceToStorage() {
    SafeStorage.set(ATTENDANCE_ALL_KURS_KEY, JSON.stringify(multiKurAttendance));
    calculateAttendance();
    if (window.SbtuAuth && typeof window.SbtuAuth.markUbysDirty === 'function') {
        window.SbtuAuth.markUbysDirty();
    }
}

function calculateAttendance() {
    const curKur = KURS_DATA[activeKurId];
    const kurData = multiKurAttendance[activeKurId] || {};

    let totalUnexcused = 0;
    let totalMedical = 0;
    let totalGhostSuspicious = 0;
    let totalGhostSuccess = 0;

    Object.entries(kurData).forEach(([dateStr, slots]) => {
        if (Array.isArray(slots)) {
            slots.forEach(slot => {
                if (slot === 'unexcused') totalUnexcused += 1;
                else if (slot === 'medical') totalMedical += 1;
                else if (slot === 'ghost_suspicious') totalGhostSuspicious += 1;
                else if (slot === 'ghost_success') totalGhostSuccess += 1;
            });
        }
    });

    const maxUnexcused = curKur.maxUnexcused;
    const maxMedical = curKur.maxMedical;

    // SBTÜ Yönergesi Madde 17/5: Sağlık izinleri toplamı kur ders saatinin %10'unu aşamaz.
    // Aşan kısım devam zorunluluğundan (özürsüz havuzundan) düşülür.
    const validMedicalDeduction = Math.min(maxMedical, totalMedical);
    const excessMedical = Math.max(0, totalMedical - maxMedical);
    const netAttendanceLoss = totalUnexcused + excessMedical;
    const remainingHours = Math.max(0, maxUnexcused - netAttendanceLoss);
    const isFailedAttendance = netAttendanceLoss > maxUnexcused;

    // En Kötü Senaryo (Şüpheli Riskli İmzaların Resmi Devamsızlığa Dönüşmesi Riski)
    const worstCaseLoss = netAttendanceLoss + totalGhostSuspicious;
    const riskRemaining = maxUnexcused - worstCaseLoss;
    const isWorstCaseFailed = worstCaseLoss > maxUnexcused;

    // UI Güncellemeleri
    const remHoursEl = document.getElementById('att-remaining-hours');
    const unexcusedEl = document.getElementById('att-unexcused-hours');
    const medicalEl = document.getElementById('att-medical-hours');
    const medicalQuotaEl = document.getElementById('att-medical-quota');
    const limitSubEl = document.getElementById('att-limit-sub');
    const unexcusedSubEl = document.getElementById('att-unexcused-sub');
    const barTitleEl = document.getElementById('att-bar-title');
    const percentLabelEl = document.getElementById('att-percent-label');
    const pBar = document.getElementById('att-progress-bar');
    const statusText = document.getElementById('att-status-text');
    const statusBadge = document.getElementById('att-status-badge');
    const remCard = document.getElementById('att-card-remaining');
    const notTabPill = document.getElementById('tab-attendance-pill');
    const alertBanner = document.getElementById('attendance-alert-banner');

    if (remHoursEl) remHoursEl.innerText = remainingHours.toFixed(1);
    if (unexcusedEl) unexcusedEl.innerText = totalUnexcused;
    if (medicalEl) medicalEl.innerText = totalMedical;
    if (medicalQuotaEl) medicalQuotaEl.innerText = `Kota: ${validMedicalDeduction.toFixed(1)} / ${maxMedical} Saat`;
    if (unexcusedSubEl) unexcusedSubEl.innerText = `${maxUnexcused} Saatte Kalır`;
    if (barTitleEl) barTitleEl.innerText = `Devamsızlık Tüketimi (${maxUnexcused} Saat Sınırı)`;

    // Riskli İmza Uyarısı (Kalan Hak Kartının Altı)
    if (limitSubEl) {
        if (totalGhostSuspicious > 0) {
            let riskWarnHtml = `<div class="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-1 leading-tight">${totalGhostSuspicious}s Şüpheli İmza (En Kötü Senaryo Kalan: ${Math.max(0, riskRemaining).toFixed(1)}s)</div>`;
            if (isWorstCaseFailed && !isFailedAttendance) {
                riskWarnHtml += `<div class="text-[9px] text-rose-500 font-extrabold mt-0.5">⚠️ Şüpheli imzalar fark edilirse kurdan kalırsınız!</div>`;
            }
            limitSubEl.innerHTML = `Toplam Sınır: ${maxUnexcused} Saat${riskWarnHtml}`;
        } else {
            limitSubEl.innerText = `Toplam Sınır: ${maxUnexcused} Saat`;
        }
    }

    const percentConsumed = Math.min(100, (netAttendanceLoss / maxUnexcused) * 100);
    if (percentLabelEl) percentLabelEl.innerText = `${netAttendanceLoss.toFixed(1)} / ${maxUnexcused} Saat (%${Math.round(percentConsumed)})`;

    if (pBar) pBar.style.width = `${percentConsumed}%`;

    if (notTabPill) {
        notTabPill.classList.remove('hidden');
        notTabPill.innerText = `${remainingHours.toFixed(0)}/${maxUnexcused}s`;
    }

    if (isFailedAttendance) {
        if (pBar) pBar.className = "h-full bg-gradient-to-r from-rose-500 to-red-600 rounded-full transition-all duration-500 ease-out";
        if (statusText) {
            statusText.innerText = "DEVAMSIZLIKTAN KALDI";
            statusText.className = "text-sm sm:text-base font-extrabold text-rose-600 dark:text-rose-400 mt-0.5";
        }
        if (statusBadge) {
            statusBadge.innerText = "Kur Tekrarı";
            statusBadge.className = "mt-0.5 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full bg-rose-200 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 font-bold";
        }
        if (remCard) remCard.className = "bg-rose-50/70 dark:bg-rose-950/40 border-2 border-rose-400 dark:border-rose-900/60 rounded-xl p-2.5 sm:p-3.5";
        if (notTabPill) notTabPill.className = "text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500 border border-rose-400 text-white font-extrabold";
        if (alertBanner) alertBanner.classList.remove('hidden');
    } else if (remainingHours <= 5 || (isWorstCaseFailed && totalGhostSuspicious > 0)) {
        if (pBar) pBar.className = "h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full transition-all duration-500 ease-out";
        if (statusText) {
            statusText.innerText = remainingHours <= 5 ? "KRİTİK ALARM" : "RİSKLİ BÖLGE";
            statusText.className = "text-sm sm:text-base font-extrabold text-rose-600 dark:text-rose-400 mt-0.5";
        }
        if (statusBadge) {
            statusBadge.innerText = isWorstCaseFailed ? "Şüpheli İmza Riski!" : "1 Gün Bile Kaçıramazsın";
            statusBadge.className = "mt-0.5 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 font-bold";
        }
        if (remCard) remCard.className = "bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 rounded-xl p-2.5 sm:p-3.5";
        if (notTabPill) notTabPill.className = "text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/40 border border-rose-400 text-rose-200 font-extrabold";
        if (alertBanner) alertBanner.classList.add('hidden');
    } else if (remainingHours <= 15) {
        if (pBar) pBar.className = "h-full bg-gradient-to-r from-emerald-500 to-amber-500 rounded-full transition-all duration-500 ease-out";
        if (statusText) {
            statusText.innerText = "DİKKAT: SINIR YAKIN";
            statusText.className = "text-sm sm:text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5";
        }
        if (statusBadge) {
            statusBadge.innerText = totalGhostSuspicious > 0 ? `${totalGhostSuspicious}s Şüpheli İmza` : "Kalan Saat Azalıyor";
            statusBadge.className = "mt-0.5 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 font-semibold";
        }
        if (remCard) remCard.className = "bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 rounded-xl p-2.5 sm:p-3.5";
        if (notTabPill) notTabPill.className = "text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/30 border border-amber-400 text-amber-200 font-extrabold";
        if (alertBanner) alertBanner.classList.add('hidden');
    } else {
        if (pBar) pBar.className = "h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500 ease-out";
        if (statusText) {
            statusText.innerText = totalGhostSuspicious > 0 ? "Şüpheli İmza Mevcut" : "Güvenli Bölge";
            statusText.className = "text-sm sm:text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5";
        }
        if (statusBadge) {
            statusBadge.innerText = totalGhostSuspicious > 0 ? `Risk: ${Math.max(0, riskRemaining).toFixed(1)}s Kalan` : "Devam Oranı İyi";
            statusBadge.className = "mt-0.5 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 font-semibold";
        }
        if (remCard) remCard.className = "bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 rounded-xl p-2.5 sm:p-3.5";
        if (notTabPill) notTabPill.className = "text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/30 border border-emerald-400 text-emerald-200 font-extrabold";
        if (alertBanner) alertBanner.classList.add('hidden');
    }

    renderAttendanceLog();
    return { isFailedAttendance, remainingHours, riskRemaining, totalGhostSuspicious, totalGhostSuccess };
}

// ====================== TAKVİM ÇİZİMİ VE TOPLU HAFTALIK GİRİŞ ======================

function renderCalendar() {
    const container = document.getElementById('calendar-weeks-container');
    if (!container) return;
    container.innerHTML = '';

    const curKur = KURS_DATA[activeKurId];
    const kurData = multiKurAttendance[activeKurId] || {};

    curKur.weeks.forEach(w => {
        const weekRow = document.createElement('div');
        weekRow.className = "p-2 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 space-y-2";
        
        let currentWeekTotalAbsent = 0;
        w.days.forEach(d => {
            const slots = kurData[d.id] || ['present','present','present','present','present'];
            currentWeekTotalAbsent += slots.filter(s => s === 'unexcused' || s === 'medical').length;
        });

        let daysHtml = '';
        w.days.forEach(d => {
            const slots = kurData[d.id] || ['present','present','present','present','present'];
            const unexcusedCount = slots.filter(s => s === 'unexcused').length;
            const medicalCount = slots.filter(s => s === 'medical').length;
            const ghostSuspiciousCount = slots.filter(s => s === 'ghost_suspicious').length;
            const ghostSuccessCount = slots.filter(s => s === 'ghost_success').length;
            const totalAbsent = unexcusedCount + medicalCount;
            const isSelected = selectedDateId === d.id;

            let bgBadge = "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";
            let statusDot = "";

            if (d.isHoliday) {
                bgBadge = "bg-slate-200/60 dark:bg-slate-800/80 text-slate-400 border-dashed border-slate-300 dark:border-slate-700 opacity-60 cursor-not-allowed";
                statusDot = `<span class="text-[9px] text-amber-500 block truncate" title="${d.holidayName}">Tatil</span>`;
            } else if (totalAbsent === 5) {
                bgBadge = "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800 font-bold";
                statusDot = `<span class="text-[9px] text-rose-600 block">5s Yok</span>`;
            } else if (totalAbsent > 0) {
                bgBadge = "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 font-bold";
                statusDot = `<span class="text-[9px] text-amber-600 block">${totalAbsent}s Yok</span>`;
            } else if (ghostSuspiciousCount > 0) {
                bgBadge = "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-400/50 font-bold";
            } else if (ghostSuccessCount > 0) {
                bgBadge = "bg-purple-500/10 text-purple-800 dark:text-purple-300 border-purple-400/50 font-bold";
            }

            // Kaçak imza etiketleri (ghost_suspicious -> 1kç?, ghost_success -> 1kç✓)
            let ghostBadges = "";
            if (ghostSuspiciousCount > 0) {
                ghostBadges += `<span class="inline-block text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-extrabold mr-0.5">${ghostSuspiciousCount}kç?</span>`;
            }
            if (ghostSuccessCount > 0) {
                ghostBadges += `<span class="inline-block text-[9px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-700 dark:text-purple-300 font-extrabold">${ghostSuccessCount}kç✓</span>`;
            }

            if (ghostBadges) {
                statusDot += `<div class="mt-0.5 flex flex-wrap items-center justify-center gap-0.5">${ghostBadges}</div>`;
            }

            const selectedRing = isSelected ? "ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-900" : "";

            daysHtml += `
                <button onclick="${d.isHoliday ? '' : `selectCalendarDay('${d.id}')`}" 
                        class="flex-1 p-1.5 sm:p-2 rounded-xl border text-center transition-all ${bgBadge} ${selectedRing}">
                    <div class="text-[10px] text-slate-400 font-medium">${d.name}</div>
                    <div class="text-xs sm:text-sm font-extrabold">${d.date}</div>
                    ${statusDot}
                </button>
            `;
        });

        // Hafta Başlığı: Hafta No + Toplu Saat Giriş Kutusu
        weekRow.innerHTML = `
            <div class="flex items-center justify-between gap-2 px-1">
                <div>
                    <span class="text-xs sm:text-sm font-extrabold text-slate-700 dark:text-slate-200">${w.week}. Hafta</span>
                    <span class="text-[10px] sm:text-xs text-slate-400 ml-1">(${w.range})</span>
                </div>
                
                <!-- Hızlı Haftalık Saat Girişi -->
                <div class="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <label for="week-bulk-input-${w.week}" class="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-slate-400 select-none">
                        Hafta Toplamı:
                    </label>
                    <input 
                        type="number" 
                        inputmode="numeric" 
                        id="week-bulk-input-${w.week}"
                        min="0" 
                        max="25" 
                        value="${currentWeekTotalAbsent > 0 ? currentWeekTotalAbsent : ''}"
                        placeholder="0" 
                        oninput="applyWeeklyBulkHours(${w.week}, this)"
                        class="w-10 sm:w-12 text-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-0.5 text-xs font-extrabold text-indigo-950 dark:text-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    />
                    <span class="text-[10px] text-slate-400">saat</span>
                </div>
            </div>
            <div class="grid grid-cols-5 gap-1.5 sm:gap-2">
                ${daysHtml}
            </div>
        `;
        container.appendChild(weekRow);
    });
}

function applyWeeklyBulkHours(weekNumber, inputEl) {
    let totalHours = parseInt(inputEl.value, 10);
    if (isNaN(totalHours) || totalHours < 0) totalHours = 0;
    if (totalHours > 25) { totalHours = 25; inputEl.value = 25; }

    const curKur = KURS_DATA[activeKurId];
    const weekObj = curKur.weeks.find(w => w.week === weekNumber);
    if (!weekObj) return;

    if (!multiKurAttendance[activeKurId]) {
        multiKurAttendance[activeKurId] = {};
    }

    let remainingToDistribute = totalHours;

    weekObj.days.forEach(d => {
        if (d.isHoliday) {
            delete multiKurAttendance[activeKurId][d.id];
            return;
        }

        if (remainingToDistribute <= 0) {
            delete multiKurAttendance[activeKurId][d.id];
        } else {
            const hoursForThisDay = Math.min(5, remainingToDistribute);
            const newSlots = ['present','present','present','present','present'];
            for (let i = 0; i < hoursForThisDay; i++) {
                newSlots[i] = 'unexcused';
            }
            multiKurAttendance[activeKurId][d.id] = newSlots;
            remainingToDistribute -= hoursForThisDay;
        }
    });

    saveAttendanceToStorage();
    calculateAttendance();
    renderCalendar();
    renderDayEditor();
}

function selectCalendarDay(dateId) {
    selectedDateId = dateId;
    renderCalendar();
    renderDayEditor();
    const dayEditor = document.getElementById('day-editor-card');
    if (dayEditor) {
        dayEditor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// ====================== GÜNLÜK DERS VE SAAT DÜZENLEYİCİSİ ======================

function renderDayEditor() {
    let dayObj = null;
    let weekNumber = 1;
    const curKur = KURS_DATA[activeKurId];

    curKur.weeks.forEach(w => {
        const found = w.days.find(d => d.id === selectedDateId);
        if (found) { dayObj = found; weekNumber = w.week; }
    });

    if (!dayObj) return;

    const kurData = multiKurAttendance[activeKurId] || {};
    const yearStr = dayObj.id.split('-')[0];
    
    const editorTitle = document.getElementById('editor-date-title');
    if (editorTitle) {
        editorTitle.innerText = `${dayObj.date} ${yearStr} - ${dayObj.name} (${curKur.name} / ${weekNumber}. Hafta)`;
    }

    const slots = kurData[selectedDateId] || ['present','present','present','present','present'];
    const unexcusedCount = slots.filter(s => s === 'unexcused').length;
    const medicalCount = slots.filter(s => s === 'medical').length;
    const ghostSuspiciousCount = slots.filter(s => s === 'ghost_suspicious').length;
    const ghostSuccessCount = slots.filter(s => s === 'ghost_success').length;
    const totalRecorded = unexcusedCount + medicalCount + ghostSuspiciousCount + ghostSuccessCount;

    // Günün var olan durumuna göre radyo butonunu senkronize et
    if (ghostSuspiciousCount > 0) currentFastType = 'ghost_suspicious';
    else if (ghostSuccessCount > 0) currentFastType = 'ghost_success';
    else if (medicalCount > 0) currentFastType = 'medical';
    else if (unexcusedCount > 0) currentFastType = 'unexcused';

    const radioId = currentFastType === 'ghost_suspicious' ? 'fast-type-ghost-suspicious' : 
                    currentFastType === 'ghost_success' ? 'fast-type-ghost-success' : 
                    `fast-type-${currentFastType}`;
    const targetRadio = document.getElementById(radioId);
    if (targetRadio) targetRadio.checked = true;

    const badge = document.getElementById('editor-day-badge');
    if (badge) {
        let details = [];
        if (unexcusedCount > 0) details.push(`${unexcusedCount} Özürsüz`);
        if (medicalCount > 0) details.push(`${medicalCount} Raporlu`);
        if (ghostSuspiciousCount > 0) details.push(`${ghostSuspiciousCount} Şüpheli Riskli İmza`);
        if (ghostSuccessCount > 0) details.push(`${ghostSuccessCount} Başarılı Riskli İmza`);
        
        const detailStr = details.length > 0 ? ` (${details.join(', ')})` : '';
        badge.innerText = `${totalRecorded} / 5 Saat İşlendi${detailStr}`;
    }

    const grid = document.getElementById('lesson-slots-grid');
    if (!grid) return;
    grid.innerHTML = '';

    slots.forEach((status, idx) => {
        const slotBtn = document.createElement('button');
        slotBtn.type = 'button';
        slotBtn.onclick = () => cycleSlotStatus(idx);

        let slotStyle = "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300";
        let statusLabel = "Dersteydim";
        let statusPill = "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400";

        if (status === 'unexcused') {
            slotStyle = "bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200";
            statusLabel = "Raporsuz";
            statusPill = "bg-rose-500 text-white font-bold";
        } else if (status === 'medical') {
            slotStyle = "bg-sky-50 dark:bg-sky-950/60 border-sky-300 dark:border-sky-800 text-sky-800 dark:text-sky-200";
            statusLabel = "Raporlu";
            statusPill = "bg-sky-500 text-white font-bold";
        } else if (status === 'ghost_suspicious') {
            slotStyle = "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-400/40";
            statusLabel = "Riskli (Şüpheli)";
            statusPill = "bg-amber-500 text-white font-bold";
        } else if (status === 'ghost_success') {
            slotStyle = "bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-400/40";
            statusLabel = "Riskli (Başarılı)";
            statusPill = "bg-purple-600 text-white font-bold";
        }

        slotBtn.className = `p-2 sm:p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${slotStyle}`;
        slotBtn.innerHTML = `
            <span class="text-[11px] font-bold">${idx + 1}. Ders</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded-md ${statusPill}">${statusLabel}</span>
        `;
        grid.appendChild(slotBtn);
    });
}

function cycleSlotStatus(index) {
    if (!multiKurAttendance[activeKurId]) {
        multiKurAttendance[activeKurId] = {};
    }
    if (!multiKurAttendance[activeKurId][selectedDateId]) {
        multiKurAttendance[activeKurId][selectedDateId] = ['present','present','present','present','present'];
    }
    const current = multiKurAttendance[activeKurId][selectedDateId][index];
    let next = 'present';

    // 5 Aşamalı Slot Döngüsü: present -> unexcused -> medical -> ghost_suspicious -> ghost_success -> present
    if (current === 'present') next = 'unexcused';
    else if (current === 'unexcused') next = 'medical';
    else if (current === 'medical') next = 'ghost_suspicious';
    else if (current === 'ghost_suspicious') next = 'ghost_success';
    else if (current === 'ghost_success') next = 'present';

    multiKurAttendance[activeKurId][selectedDateId][index] = next;
    
    // Tüm slotlar dersteydim olduysa boş kaydı temizle
    const remainingCount = multiKurAttendance[activeKurId][selectedDateId].filter(s => s !== 'present').length;
    if (remainingCount === 0) {
        delete multiKurAttendance[activeKurId][selectedDateId];
    }

    saveAttendanceToStorage();
    renderCalendar();
    renderDayEditor();
}

function setFastDayHours(count) {
    let type = currentFastType;
    if (document.getElementById('fast-type-medical')?.checked) {
        type = 'medical';
    } else if (document.getElementById('fast-type-ghost-suspicious')?.checked) {
        type = 'ghost_suspicious';
    } else if (document.getElementById('fast-type-ghost-success')?.checked) {
        type = 'ghost_success';
    } else if (document.getElementById('fast-type-unexcused')?.checked) {
        type = 'unexcused';
    }
    currentFastType = type;

    if (!multiKurAttendance[activeKurId]) {
        multiKurAttendance[activeKurId] = {};
    }

    if (count === 0) {
        delete multiKurAttendance[activeKurId][selectedDateId];
    } else {
        const newSlots = ['present','present','present','present','present'];
        for (let i = 0; i < count; i++) {
            newSlots[i] = type;
        }
        multiKurAttendance[activeKurId][selectedDateId] = newSlots;
    }

    saveAttendanceToStorage();
    renderCalendar();
    renderDayEditor();
}

function toggleFastType(type) {
    currentFastType = type;
    const radioId = type === 'ghost_suspicious' ? 'fast-type-ghost-suspicious' : 
                    type === 'ghost_success' ? 'fast-type-ghost-success' : 
                    `fast-type-${type}`;
    const radioEl = document.getElementById(radioId);
    if (radioEl) radioEl.checked = true;

    const kurData = multiKurAttendance[activeKurId] || {};
    const slots = kurData[selectedDateId];
    if (slots) {
        const count = slots.filter(s => s !== 'present').length;
        if (count > 0) {
            setFastDayHours(count);
        }
    }
}

function clearSelectedDay() {
    if (multiKurAttendance[activeKurId]) {
        delete multiKurAttendance[activeKurId][selectedDateId];
        saveAttendanceToStorage();
        renderCalendar();
        renderDayEditor();
    }
}

// ====================== DEVAMSIZLIK GÜNLÜĞÜ (LOG LİSTESİ) ======================

function renderAttendanceLog() {
    const container = document.getElementById('attendance-log-list');
    const badge = document.getElementById('att-log-count-badge');
    if (!container || !badge) return;
    container.innerHTML = '';

    const kurData = multiKurAttendance[activeKurId] || {};
    const logs = [];

    Object.entries(kurData).forEach(([dateStr, slots]) => {
        const unexcused = slots.filter(s => s === 'unexcused').length;
        const medical = slots.filter(s => s === 'medical').length;
        const ghostSuspicious = slots.filter(s => s === 'ghost_suspicious').length;
        const ghostSuccess = slots.filter(s => s === 'ghost_success').length;
        const total = unexcused + medical + ghostSuspicious + ghostSuccess;

        if (total > 0) {
            logs.push({ dateStr, unexcused, medical, ghostSuspicious, ghostSuccess, total });
        }
    });

    logs.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    badge.innerText = `${logs.length} Gün`;

    if (logs.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-slate-400">Bu kurda henüz kaydedilmiş bir devamsızlık bulunmuyor.</div>';
        return;
    }

    logs.forEach(item => {
        const row = document.createElement('div');
        row.className = "flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60";
        row.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="font-bold text-slate-800 dark:text-slate-200">${item.dateStr}</span>
                <span class="text-[10px] text-slate-400">(${item.total} Kayıt)</span>
            </div>
            <div class="flex flex-wrap items-center gap-1 text-[10px] sm:text-[11px]">
                ${item.unexcused > 0 ? `<span class="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold">${item.unexcused}s Özürsüz</span>` : ''}
                ${item.medical > 0 ? `<span class="px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 font-bold">${item.medical}s Raporlu</span>` : ''}
                ${item.ghostSuspicious > 0 ? `<span class="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold">${item.ghostSuspicious}s Riskli (?)</span>` : ''}
                ${item.ghostSuccess > 0 ? `<span class="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold">${item.ghostSuccess}s Riskli (✓)</span>` : ''}
                <button onclick="selectCalendarDay('${item.dateStr}')" class="text-indigo-600 hover:text-indigo-700 font-bold ml-1 text-xs">Düzenle</button>
            </div>
        `;
        container.appendChild(row);
    });
}

function resetAttendance() {
    multiKurAttendance[activeKurId] = {};
    saveAttendanceToStorage();
    renderCalendar();
    renderDayEditor();
}
