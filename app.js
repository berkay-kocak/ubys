/**
 * SBTÜ Hazırlık Sistemi - Çekirdek ve Durum Yönetimi
 * - Yerel depolama (SafeStorage)
 * - Tema yönetimi (Açık / Koyu mod)
 * - Sekme (Tab) yönlendirme
 * - PWA ve Service Worker entegrasyonu
 * - Genel bildirim ve geri bildirim modalları
 * - Uygulama başlangıç tetikleyicisi (initApp)
 */

// Global Durum Değişkenleri
const THEME_KEY = 'sbtu_theme_preference';
let currentActiveTab = 'grades';

// Tarayıcı / LocalStorage Güvenli Depolama Motoru
const SafeStorage = {
    isSupported: null,
    check() {
        if (this.isSupported !== null) return this.isSupported;
        try {
            const testKey = '__sbtu_sec_test__';
            window.localStorage.setItem(testKey, '1');
            window.localStorage.removeItem(testKey);
            this.isSupported = true;
        } catch (e) {
            this.isSupported = false;
        }
        return this.isSupported;
    },
    get(key) {
        if (!this.check()) return null;
        try {
            return window.localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    },
    set(key, val) {
        if (!this.check()) return;
        try {
            window.localStorage.setItem(key, val);
        } catch (e) {}
    },
    remove(key) {
        if (!this.check()) return;
        try {
            window.localStorage.removeItem(key);
        } catch (e) {}
    }
};

// ====================== TEMA YÖNETİMİ ======================

function initTheme() {
    const savedTheme = SafeStorage.get(THEME_KEY);
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        applyTheme(true);
    } else {
        applyTheme(false);
    }
}

function toggleTheme() {
    const isCurrentlyDark = document.documentElement.classList.contains('dark');
    applyTheme(!isCurrentlyDark);
}

function applyTheme(isDark) {
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');

    if (isDark) {
        document.documentElement.classList.add('dark');
        SafeStorage.set(THEME_KEY, 'dark');
        if (sunIcon) sunIcon.classList.remove('hidden');
        if (moonIcon) moonIcon.classList.add('hidden');
    } else {
        document.documentElement.classList.remove('dark');
        SafeStorage.set(THEME_KEY, 'light');
        if (sunIcon) sunIcon.classList.add('hidden');
        if (moonIcon) moonIcon.classList.remove('hidden');
    }
}

// ====================== SEKME GEÇİŞİ (TABS) ======================

function switchTab(tab) {
    currentActiveTab = tab;
    const gradesSec = document.getElementById('section-grades');
    const attSec = document.getElementById('section-attendance');
    const tabBtnGrades = document.getElementById('tab-btn-grades');
    const tabBtnAtt = document.getElementById('tab-btn-attendance');

    if (tab === 'grades') {
        gradesSec.classList.remove('hidden');
        attSec.classList.add('hidden');
        tabBtnGrades.className = "flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 bg-white text-indigo-950 shadow-sm";
        tabBtnAtt.className = "flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-white/80 hover:text-white hover:bg-white/5";
    } else {
        gradesSec.classList.add('hidden');
        attSec.classList.remove('hidden');
        tabBtnAtt.className = "flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 bg-white text-indigo-950 shadow-sm";
        tabBtnGrades.className = "flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-white/80 hover:text-white hover:bg-white/5";
        
        // attendance.js modülü yüklendiğinde takvim ve editörü çizdir
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderDayEditor === 'function') renderDayEditor();
    }
}

// Aktif Sekmeyi Sıfırla (Header'daki Temizle butonu)
function resetActiveTab() {
    if (currentActiveTab === 'grades') {
        if (typeof resetGrades === 'function') {
            resetGrades();
        }
    } else {
        if (typeof resetAttendance === 'function') {
            resetAttendance();
        }
    }
}

// ====================== BİLDİRİM / GERİ BİLDİRİM MODALI ======================

function showFeedback(isSuccess, title, desc) {
    const modal = document.getElementById('status-feedback-modal');
    const iconContainer = document.getElementById('feedback-icon-container');
    const titleEl = document.getElementById('feedback-title');
    const descEl = document.getElementById('feedback-desc');

    if (!modal) return;

    if (isSuccess) {
        iconContainer.className = "w-12 h-12 mx-auto rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400";
        iconContainer.innerHTML = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>';
    } else {
        iconContainer.className = "w-12 h-12 mx-auto rounded-full flex items-center justify-center bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400";
        iconContainer.innerHTML = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>';
    }

    titleEl.innerText = title;
    descEl.innerText = desc;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeFeedbackModal() {
    const modal = document.getElementById('status-feedback-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// ====================== PWA YÜKLEME & SERVICE WORKER ENTEGRASYONU ======================

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    // Tarayıcının varsayılan banner'ını durdur ve özel yükleme butonunu göster
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
        installBtn.classList.remove('hidden');
    }
});

async function triggerPWAInstall() {
    if (!deferredPrompt) {
        // iOS Safari kullanıcılarına rehberlik
        showFeedback(true, "Telefona Yükleme (iOS Safari)", "Safari alt menüsündeki 'Paylaş' (ortadaki yukarı oklu kare) butonuna dokunup 'Ana Ekrana Ekle' seçeneğine basarak doğrudan uygulama gibi yükleyebilirsiniz.");
        return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        const installBtn = document.getElementById('pwa-install-btn');
        if (installBtn) installBtn.classList.add('hidden');
    }
    deferredPrompt = null;
}

window.addEventListener('appinstalled', () => {
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) installBtn.classList.add('hidden');
    showFeedback(true, "Uygulama Yüklendi!", "SBTÜ Hazırlık Sistemi telefonunuzun ana ekranına başarıyla eklendi.");
});

// Çevrimdışı çalışma desteği için Service Worker kaydı
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}

// ====================== UYGULAMA BAŞLANGIÇ NOKTASI (BOOTSTRAPPER) ======================

function initApp() {
    initTheme();

    // Not hesaplayıcı bileşenlerini render et
    if (typeof renderExamInputs === 'function' && typeof examStructure !== 'undefined') {
        renderExamInputs('vize-items', examStructure.vize, 'vize');
        renderExamInputs('final-items', examStructure.final, 'final');
    }

    // Depolanmış verileri hafızadan yükle
    if (typeof loadAllInputsFromStorage === 'function') {
        loadAllInputsFromStorage();
    }
    if (typeof loadAttendanceFromStorage === 'function') {
        loadAttendanceFromStorage();
    }

    // Not hesaplamasını yap ve göster
    if (typeof calculateGrades === 'function') {
        calculateGrades();
    }

    // Paylaşım modalı dışına tıklama ve Escape tuşu dinleyicileri
    const modal = document.getElementById('share-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal && typeof closeShareModal === 'function') {
                closeShareModal();
            }
        });
    }
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && typeof closeShareModal === 'function') {
            closeShareModal();
        }
    });
}

// Tüm harici scriptler ayrıştırıldıktan sonra uygulamayı başlat
window.onload = initApp;