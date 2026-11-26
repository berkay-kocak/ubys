/**
 * SBTÜ Portal Sistemi - Birleşik Veri Yedekleme ve JSON Transfer Motoru
 * - Tüm sınav notları, devamsızlık kayıtları, tercihler ve İŞKUR haftalık puantaj verilerini tek .json dosyasında toplar
 * - İçe aktarma öncesi doğrulanabilir detaylı ön izleme modalı
 * - Cihazdaki verileri bozmadan güvenli geri yükleme ve UI senkronizasyonu
 * - Tüm sayfalarda (Portal, Not Hesaplayıcı, Devamsızlık Takibi, İŞKUR Puantaj) ve Profil penceresinde ortak çalışır
 */

let pendingImportData = null;
let generatedBackupJson = '';

function validateBackupData(data) {
    const errors = [];
    const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
    const validSlotTypes = new Set(['present', 'unexcused', 'medical', 'ghost_suspicious', 'ghost_success']);

    if (!isObject(data)) return ['Yedek kök verisi bir nesne olmalıdır.'];

    // Grades doğrulaması
    if (data.grades !== undefined) {
        if (!isObject(data.grades)) {
            errors.push('Not verisi geçersiz.');
        } else {
            if (data.grades.studentName !== undefined && typeof data.grades.studentName !== 'string') {
                errors.push('Öğrenci adı geçersiz.');
            }
            ['vize', 'final'].forEach((category) => {
                const scores = data.grades[category];
                if (scores === undefined) return;
                if (!isObject(scores)) {
                    errors.push(`${category} notları geçersiz.`);
                    return;
                }
                Object.entries(scores).forEach(([id, value]) => {
                    const score = Number(value);
                    if (!Number.isFinite(score) || score < 0 || score > 100) {
                        errors.push(`${category}.${id} notu 0-100 arasında olmalıdır.`);
                    }
                });
            });
        }
    }

    // Attendance doğrulaması
    if (data.attendance !== undefined) {
        if (!isObject(data.attendance)) {
            errors.push('Devamsızlık verisi geçersiz.');
        } else {
            Object.entries(data.attendance).forEach(([kurId, dates]) => {
                if (typeof KURS_DATA !== 'undefined' && !KURS_DATA[kurId]) {
                    errors.push(`Bilinmeyen kur: ${kurId}.`);
                    return;
                }
                if (!isObject(dates)) {
                    errors.push(`${kurId} kayıtları geçersiz.`);
                    return;
                }
                Object.entries(dates).forEach(([date, slots]) => {
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                        errors.push(`${kurId} içinde geçersiz tarih: ${date}.`);
                    }
                    if (!Array.isArray(slots) || slots.length !== 5 || slots.some((slot) => !validSlotTypes.has(slot))) {
                        errors.push(`${kurId}.${date} kaydı 5 geçerli ders durumu içermelidir.`);
                    }
                });
            });
        }
    }

    // İŞKUR puantaj doğrulaması (varsa)
    if (data.iskur !== undefined) {
        if (!isObject(data.iskur)) {
            errors.push('İŞKUR puantaj verisi geçersiz.');
        } else {
            if (data.iskur.weeks !== undefined && !isObject(data.iskur.weeks)) {
                errors.push('İŞKUR haftalık çizelge verisi geçersiz.');
            }
            if (data.iskur.manual !== undefined && !isObject(data.iskur.manual)) {
                errors.push('İŞKUR manuel saat verisi geçersiz.');
            }
        }
    }

    return errors;
}

function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ====================== DIŞA AKTARMA (EXPORT) ======================

function openExportModal() {
    // 1) Not verisi
    let parsedGrades = null;
    const rawGrades = (typeof SafeStorage !== 'undefined' ? SafeStorage.get('sbtu_grades_cache') : localStorage.getItem('sbtu_grades_cache'));
    if (rawGrades) {
        try { parsedGrades = JSON.parse(rawGrades); } catch (e) {}
    }

    // 2) Devamsızlık verisi
    let attendanceData = {};
    if (typeof multiKurAttendance !== 'undefined' && multiKurAttendance && Object.keys(multiKurAttendance).length > 0) {
        attendanceData = multiKurAttendance;
    } else {
        const rawAtt = (typeof SafeStorage !== 'undefined' ? SafeStorage.get('sbtu_attendance_multikur_cache') : localStorage.getItem('sbtu_attendance_multikur_cache'));
        if (rawAtt) {
            try {
                attendanceData = typeof sanitizeAttendanceState === 'function' ? sanitizeAttendanceState(JSON.parse(rawAtt)) : JSON.parse(rawAtt);
            } catch (e) {}
        }
    }

    const currentKur = typeof activeKurId !== 'undefined'
        ? activeKurId
        : ((typeof SafeStorage !== 'undefined' ? SafeStorage.get('sbtu_active_kur_preference') : localStorage.getItem('sbtu_active_kur_preference')) || (typeof detectCurrentKurId === 'function' ? detectCurrentKurId() : 'kur1'));

    // 3) İŞKUR verisi
    let iskurWeeks = {};
    let iskurManual = {};
    let iskurStudent = '';
    try {
        const rawW = localStorage.getItem('iskur_genclik_puantaj_v1') || localStorage.getItem('iskur_genclik_puantaj_backup_v1');
        if (rawW) iskurWeeks = JSON.parse(rawW) || {};
        const rawM = localStorage.getItem('iskur_genclik_manual_v1');
        if (rawM) iskurManual = JSON.parse(rawM) || {};
        iskurStudent = localStorage.getItem('iskur_genclik_student_name_v1') || '';
    } catch (e) {}

    const backupData = {
        app: "SBTU_PORTAL_SISTEMI",
        version: 2,
        exportDate: new Date().toISOString(),
        grades: parsedGrades || {},
        attendance: attendanceData,
        activeKur: currentKur,
        iskur: {
            weeks: iskurWeeks,
            manual: iskurManual,
            studentName: iskurStudent
        }
    };

    generatedBackupJson = JSON.stringify(backupData, null, 2);

    // Modal Ön İzleme Alanlarını Doldur
    const sName = parsedGrades?.studentName || iskurStudent || document.getElementById('student-name-input')?.value || 'İsimsiz';
    const nameEl = document.getElementById('export-preview-name');
    if (nameEl) nameEl.innerText = sName;

    const overallScoreEl = document.getElementById('overall-score');
    const statusTextEl = document.getElementById('status-text');
    const gradeEl = document.getElementById('export-preview-grade');
    if (gradeEl) {
        if (overallScoreEl && statusTextEl) {
            gradeEl.innerText = `${overallScoreEl.innerText} Puan (${statusTextEl.innerText})`;
        } else {
            const gCount = (parsedGrades?.vize ? Object.keys(parsedGrades.vize).length : 0) + (parsedGrades?.final ? Object.keys(parsedGrades.final).length : 0);
            gradeEl.innerText = gCount > 0 ? `${gCount} Kayıtlı Sınav Notu` : 'Not Verisi Yok';
        }
    }

    let gradeCount = 0;
    if (parsedGrades) {
        if (parsedGrades.vize) gradeCount += Object.keys(parsedGrades.vize).length;
        if (parsedGrades.final) gradeCount += Object.keys(parsedGrades.final).length;
    }
    const gradeCountEl = document.getElementById('export-preview-gradecount');
    if (gradeCountEl) gradeCountEl.innerText = `${gradeCount} Sınav Notu`;

    let attCount = 0;
    Object.values(attendanceData).forEach(kData => {
        if (kData && typeof kData === 'object') {
            attCount += Object.keys(kData).length;
        }
    });
    const attCountEl = document.getElementById('export-preview-attcount');
    if (attCountEl) attCountEl.innerText = `${attCount} Günlük Yoklama Kaydı`;

    // İŞKUR özet sayısı
    const iskurWeeksCount = Object.keys(iskurWeeks).length;
    const iskurCountEl = document.getElementById('export-preview-iskurcount');
    if (iskurCountEl) iskurCountEl.innerText = `${iskurWeeksCount} Hafta Puantaj`;

    const now = new Date();
    const timeEl = document.getElementById('export-preview-time');
    if (timeEl) timeEl.innerText = now.toLocaleString('tr-TR');

    const jsonPreviewEl = document.getElementById('export-json-preview');
    if (jsonPreviewEl) jsonPreviewEl.innerText = generatedBackupJson;

    const modal = document.getElementById('export-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

function closeExportModal() {
    const modal = document.getElementById('export-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

function downloadExportedFile() {
    if (!generatedBackupJson) return;
    const blob = new Blob([generatedBackupJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const todayStr = getLocalDateString();
    a.download = `sbtu-portal-yedek-${todayStr}.json`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
    closeExportModal();

    if (typeof showFeedback === 'function') {
        showFeedback(true, "Yedek İndirildi", "Tüm not, devamsızlık ve İŞKUR puantaj verileriniz tek dosyada başarıyla indirildi.");
    }
}

// ====================== İÇE AKTARMA (IMPORT) ======================

function handleFileSelect(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!parsed || typeof parsed !== 'object') {
                throw new Error("Dosya içeriği geçerli bir JSON değil.");
            }

            // Eski İŞKUR doğrudan yedeği desteği: { weeks: {...}, manual: {...} }
            let normalized = parsed;
            if (parsed.weeks && !parsed.grades && !parsed.attendance) {
                normalized = {
                    version: 2,
                    exportDate: parsed.exportDate || new Date().toISOString(),
                    grades: {},
                    attendance: {},
                    iskur: {
                        weeks: parsed.weeks || {},
                        manual: parsed.manual || {},
                        studentName: parsed.studentName || ''
                    }
                };
            }

            if (!normalized.grades && !normalized.attendance && !normalized.iskur) {
                throw new Error("Yüklenen dosya SBTÜ Portal yedek formatına uygun değil.");
            }

            const validationErrors = validateBackupData(normalized);
            if (validationErrors.length > 0) {
                throw new Error(`Yedek doğrulanamadı: ${validationErrors.join(' ')}`);
            }

            pendingImportData = normalized;

            // İçe Aktarma Ön İzleme Alanlarını Doldur
            const sName = normalized.grades?.studentName || normalized.iskur?.studentName || 'Belirtilmedi';
            const nameEl = document.getElementById('import-preview-name');
            if (nameEl) nameEl.innerText = sName;

            let gCount = 0;
            if (normalized.grades) {
                if (normalized.grades.vize) gCount += Object.keys(normalized.grades.vize).length;
                if (normalized.grades.final) gCount += Object.keys(normalized.grades.final).length;
            }
            const gCountEl = document.getElementById('import-preview-grades');
            if (gCountEl) gCountEl.innerText = `${gCount} Sınav Notu`;

            let aCount = 0;
            if (normalized.attendance && typeof normalized.attendance === 'object') {
                Object.values(normalized.attendance).forEach(kData => {
                    if (kData && typeof kData === 'object') aCount += Object.keys(kData).length;
                });
            }
            const aCountEl = document.getElementById('import-preview-att');
            if (aCountEl) aCountEl.innerText = `${aCount} Günlük Yoklama`;

            const iskurWeeksCount = normalized.iskur?.weeks ? Object.keys(normalized.iskur.weeks).length : 0;
            const iskurCountEl = document.getElementById('import-preview-iskur');
            if (iskurCountEl) iskurCountEl.innerText = `${iskurWeeksCount} Hafta Puantaj`;

            const dateFormatted = normalized.exportDate ? new Date(normalized.exportDate).toLocaleString('tr-TR') : 'Bilinmiyor';
            const dateEl = document.getElementById('import-preview-date');
            if (dateEl) dateEl.innerText = dateFormatted;

            // İçe aktarma onay modalını aç
            const modal = document.getElementById('import-modal');
            if (modal) {
                modal.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
            }
        } catch (err) {
            if (typeof showFeedback === 'function') {
                showFeedback(false, "Yedek Yüklenemedi", err.message || "Seçilen dosya okunamadı veya formatı bozuk.");
            }
        } finally {
            event.target.value = '';
        }
    };

    reader.onerror = function() {
        if (typeof showFeedback === 'function') {
            showFeedback(false, "Dosya Hatası", "Dosya okunurken bir hata oluştu.");
        }
        event.target.value = '';
    };

    reader.readAsText(file);
}

function closeImportModal() {
    pendingImportData = null;
    const modal = document.getElementById('import-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

function confirmImport() {
    if (!pendingImportData) return;

    try {
        // 1) Notları geri yükle
        if (pendingImportData.grades && typeof pendingImportData.grades === 'object') {
            localStorage.setItem('sbtu_grades_cache', JSON.stringify(pendingImportData.grades));
            if (typeof loadAllInputsFromStorage === 'function') loadAllInputsFromStorage();
        }

        // 2) Devamsızlık kayıtlarını geri yükle
        if (pendingImportData.attendance && typeof pendingImportData.attendance === 'object') {
            const cleanAtt = typeof sanitizeAttendanceState === 'function'
                ? sanitizeAttendanceState(pendingImportData.attendance)
                : pendingImportData.attendance;
            if (typeof multiKurAttendance !== 'undefined') {
                multiKurAttendance = cleanAtt;
            }
            localStorage.setItem('sbtu_attendance_multikur_cache', JSON.stringify(cleanAtt));
        }

        if (pendingImportData.activeKur && typeof KURS_DATA !== 'undefined' && KURS_DATA[pendingImportData.activeKur]) {
            if (typeof activeKurId !== 'undefined') {
                activeKurId = pendingImportData.activeKur;
            }
            localStorage.setItem('sbtu_active_kur_preference', pendingImportData.activeKur);
        }

        // 3) İŞKUR puantaj kayıtlarını geri yükle
        if (pendingImportData.iskur && typeof pendingImportData.iskur === 'object') {
            const weeks = pendingImportData.iskur.weeks || {};
            const manual = pendingImportData.iskur.manual || {};
            const sName = pendingImportData.iskur.studentName || '';

            const serializedW = JSON.stringify(weeks);
            localStorage.setItem('iskur_genclik_puantaj_v1', serializedW);
            localStorage.setItem('iskur_genclik_puantaj_backup_v1', serializedW);
            localStorage.setItem('iskur_genclik_manual_v1', JSON.stringify(manual));
            if (sName) {
                localStorage.setItem('iskur_genclik_student_name_v1', sName);
            }

            // Sayfa İŞKUR sayfası ise verileri anında sayfaya yansıt
            if (typeof allWeeksData !== 'undefined') {
                allWeeksData = typeof loadAllData === 'function' ? loadAllData() : weeks;
            }
            if (typeof allManualData !== 'undefined') {
                allManualData = typeof loadAllManualData === 'function' ? loadAllManualData() : manual;
            }
            if (typeof renderWeek === 'function') {
                renderWeek();
            }
        }

        // Not ve yoklama arayüzlerini yeniden render et
        if (typeof calculateGrades === 'function') calculateGrades();
        if (typeof renderKurSelector === 'function') renderKurSelector();
        if (typeof calculateAttendance === 'function') calculateAttendance();
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderDayEditor === 'function') renderDayEditor();

        // Portal özetlerini güncelle
        if (typeof renderPortalSummaries === 'function') renderPortalSummaries();

        // Bulut senkronizasyon bayraklarını işaretle
        if (window.SbtuAuth) {
            if (typeof window.SbtuAuth.markUbysDirty === 'function') window.SbtuAuth.markUbysDirty();
            if (typeof window.SbtuAuth.markIskurDirty === 'function') window.SbtuAuth.markIskurDirty();
        }

        closeImportModal();
        if (typeof showFeedback === 'function') {
            showFeedback(true, "Yedek Geri Yüklendi!", "Tüm notlarınız, devamsızlık kayıtlarınız ve İŞKUR puantaj verileriniz başarıyla aktarıldı.");
        }
    } catch (err) {
        closeImportModal();
        if (typeof showFeedback === 'function') {
            showFeedback(false, "Aktarım Hatası", "Veriler uygulanırken beklenmeyen bir hata meydana geldi.");
        }
    }
}
