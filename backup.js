/**
 * SBTÜ Hazırlık Sistemi - Veri Yedekleme ve JSON Transfer Motoru
 * - Tüm sınav notları, devamsızlık kayıtları ve tercihleri .json formatında dışa aktarma
 * - İçe aktarma öncesi doğrulanabilir detaylı ön izleme modalı
 * - Cihazdaki verileri bozmadan güvenli geri yükleme ve UI senkronizasyonu
 * - Geri bildirim (Feedback) modalı yönetimi
 */

let pendingImportData = null;
let generatedBackupJson = '';

function validateBackupData(data) {
    const errors = [];
    const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
    const validSlotTypes = new Set(['present', 'unexcused', 'medical', 'ghost_suspicious', 'ghost_success']);

    if (!isObject(data)) return ['Yedek kök verisi bir nesne olmalıdır.'];
    if (data.version !== undefined && data.version !== 1) errors.push('Desteklenmeyen yedek sürümü.');

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

    if (data.activeKur !== undefined && typeof KURS_DATA !== 'undefined' && !KURS_DATA[data.activeKur]) {
        errors.push(`Geçersiz aktif kur: ${data.activeKur}.`);
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
    const rawGrades = SafeStorage.get('sbtu_grades_cache');
    let parsedGrades = null;
    if (rawGrades) {
        try { parsedGrades = JSON.parse(rawGrades); } catch (e) {}
    }

    let attendanceData = {};
    if (typeof multiKurAttendance !== 'undefined') {
        attendanceData = multiKurAttendance;
    } else {
        const rawAtt = SafeStorage.get(ATTENDANCE_ALL_KURS_KEY);
        if (rawAtt) {
            try { attendanceData = sanitizeAttendanceState(JSON.parse(rawAtt)); } catch (e) {}
        }
    }

    const currentKur = typeof activeKurId !== 'undefined'
        ? activeKurId
        : (SafeStorage.get(ACTIVE_KUR_PREF_KEY) || (typeof detectCurrentKurId === 'function' ? detectCurrentKurId() : 'kur1'));

    const backupData = {
        app: "SBTU_HAZIRLIK_NOT_SISTEMI",
        version: 1,
        exportDate: new Date().toISOString(),
        grades: parsedGrades || {},
        attendance: attendanceData,
        activeKur: currentKur
    };

    generatedBackupJson = JSON.stringify(backupData, null, 2);

    // Modal Ön İzleme Alanlarını Doldur
    const sName = parsedGrades?.studentName || document.getElementById('student-name-input')?.value || 'İsimsiz';
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
    a.download = `sbtu-hazirlik-yedek-${todayStr}.json`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
    closeExportModal();

    showFeedback(true, "Yedek İndirildi", "Yedek dosyanız cihazınıza başarıyla indirildi. İstediğiniz zaman geri yükleyebilirsiniz.");
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

            if (!parsed.grades && !parsed.attendance) {
                throw new Error("Yüklenen dosya SBTÜ Hazırlık yedek formatına uygun değil.");
            }

            const validationErrors = validateBackupData(parsed);
            if (validationErrors.length > 0) {
                throw new Error(`Yedek doğrulanamadı: ${validationErrors.join(' ')}`);
            }

            pendingImportData = parsed;

            // İçe Aktarma Ön İzleme Alanlarını Doldur
            const sName = parsed.grades?.studentName || 'Belirtilmedi';
            const nameEl = document.getElementById('import-preview-name');
            if (nameEl) nameEl.innerText = sName;

            let gCount = 0;
            if (parsed.grades) {
                if (parsed.grades.vize) gCount += Object.keys(parsed.grades.vize).length;
                if (parsed.grades.final) gCount += Object.keys(parsed.grades.final).length;
            }
            const gCountEl = document.getElementById('import-preview-grades');
            if (gCountEl) gCountEl.innerText = `${gCount} Sınav Notu Mevcut`;

            let aCount = 0;
            if (parsed.attendance && typeof parsed.attendance === 'object') {
                Object.values(parsed.attendance).forEach(kData => {
                    if (kData && typeof kData === 'object') aCount += Object.keys(kData).length;
                });
            }
            const aCountEl = document.getElementById('import-preview-att');
            if (aCountEl) aCountEl.innerText = `${aCount} Günlük Kayıt`;

            const dateFormatted = parsed.exportDate ? new Date(parsed.exportDate).toLocaleString('tr-TR') : 'Bilinmiyor';
            const dateEl = document.getElementById('import-preview-date');
            if (dateEl) dateEl.innerText = dateFormatted;

            // İçe aktarma onay modalını aç
            const modal = document.getElementById('import-modal');
            if (modal) {
                modal.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
            }
        } catch (err) {
            showFeedback(false, "Yedek Yüklenemedi", err.message || "Seçilen dosya okunamadı veya formatı bozuk.");
        } finally {
            event.target.value = '';
        }
    };

    reader.onerror = function() {
        showFeedback(false, "Dosya Hatası", "Dosya okunurken bir hata oluştu.");
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
        // Notları geri yükle
        if (pendingImportData.grades) {
            SafeStorage.set('sbtu_grades_cache', JSON.stringify(pendingImportData.grades));
            if (typeof loadAllInputsFromStorage === 'function') loadAllInputsFromStorage();
        }

        // Devamsızlık kayıtlarını geri yükle
        if (pendingImportData.attendance && typeof pendingImportData.attendance === 'object') {
            const cleanAtt = typeof sanitizeAttendanceState === 'function'
                ? sanitizeAttendanceState(pendingImportData.attendance)
                : pendingImportData.attendance;
            if (typeof multiKurAttendance !== 'undefined') {
                multiKurAttendance = cleanAtt;
            }
            SafeStorage.set(ATTENDANCE_ALL_KURS_KEY, JSON.stringify(cleanAtt));
        }

        if (pendingImportData.activeKur && typeof KURS_DATA !== 'undefined' && KURS_DATA[pendingImportData.activeKur]) {
            if (typeof activeKurId !== 'undefined') {
                activeKurId = pendingImportData.activeKur;
            }
            SafeStorage.set(ACTIVE_KUR_PREF_KEY, pendingImportData.activeKur);
        }

        // Not ve yoklama arayüzlerini yeniden render et
        if (typeof calculateGrades === 'function') calculateGrades();
        if (typeof renderKurSelector === 'function') renderKurSelector();
        if (typeof calculateAttendance === 'function') calculateAttendance();
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderDayEditor === 'function') renderDayEditor();

        if (window.SbtuAuth && typeof window.SbtuAuth.markUbysDirty === 'function') {
            window.SbtuAuth.markUbysDirty();
        }

        closeImportModal();
        showFeedback(true, "Yedek Geri Yüklendi!", "Tüm notlarınız, strateji verileriniz ve devamsızlık kayıtlarınız başarıyla aktarıldı.");
    } catch (err) {
        closeImportModal();
        showFeedback(false, "Aktarım Hatası", "Veriler uygulanırken beklenmeyen bir hata meydana geldi.");
    }
}
