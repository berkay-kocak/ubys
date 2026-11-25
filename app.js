/**
 * SBTÜ Hazırlık & İŞKUR Sistemi - Çekirdek ve Ortak Durum Yönetimi
 * - Yerel depolama (SafeStorage)
 * - Ortak tema yönetimi (Açık / Koyu mod)
 * - Ortak 9 Nokta Uygulamalar Menüsü (App Switcher)
 * - SBTÜ Akademik Takvim & Devamsızlık Özeti Okuyucusu
 * - PWA ve Service Worker entegrasyonu
 * - Genel bildirim ve geri bildirim modalları
 */

const THEME_KEY = 'sbtu_theme_preference';
const LEGACY_ISKUR_THEME_KEY = 'iskur_genclik_theme_v1';
const ATTENDANCE_ALL_KURS_KEY = 'sbtu_attendance_multikur_cache';
const ACTIVE_KUR_PREF_KEY = 'sbtu_active_kur_preference';

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

// ====================== ORTAK AKADEMİK TAKVİM VERİLERİ ======================

const KURS_DATA = {
    kur1: {
        id: 'kur1',
        name: '1. Kur (Güz 1)',
        title: '1. Kur Akademik Takvimi',
        subtitle: '21 Eylül - 06 Kasım 2026 (7 Hafta / 35 Gün)',
        startDate: '2026-09-21',
        endDate: '2026-11-06',
        totalWeeks: 7,
        totalHours: 175,
        maxUnexcused: 35.0,
        maxMedical: 17.5,
        weeks: [
            { week: 1, range: '21 - 25 Eylül', days: [
                { id: '2026-09-21', name: 'Pzt', date: '21 Eyl' },
                { id: '2026-09-22', name: 'Sal', date: '22 Eyl' },
                { id: '2026-09-23', name: 'Çar', date: '23 Eyl' },
                { id: '2026-09-24', name: 'Per', date: '24 Eyl' },
                { id: '2026-09-25', name: 'Cum', date: '25 Eyl' }
            ]},
            { week: 2, range: '28 Eylül - 02 Ekim', days: [
                { id: '2026-09-28', name: 'Pzt', date: '28 Eyl' },
                { id: '2026-09-29', name: 'Sal', date: '29 Eyl' },
                { id: '2026-09-30', name: 'Çar', date: '30 Eyl' },
                { id: '2026-10-01', name: 'Per', date: '01 Eki' },
                { id: '2026-10-02', name: 'Cum', date: '02 Eki' }
            ]},
            { week: 3, range: '05 - 09 Ekim', days: [
                { id: '2026-10-05', name: 'Pzt', date: '05 Eki' },
                { id: '2026-10-06', name: 'Sal', date: '06 Eki' },
                { id: '2026-10-07', name: 'Çar', date: '07 Eki' },
                { id: '2026-10-08', name: 'Per', date: '08 Eki' },
                { id: '2026-10-09', name: 'Cum', date: '09 Eki' }
            ]},
            { week: 4, range: '12 - 16 Ekim', days: [
                { id: '2026-10-12', name: 'Pzt', date: '12 Eki' },
                { id: '2026-10-13', name: 'Sal', date: '13 Eki' },
                { id: '2026-10-14', name: 'Çar', date: '14 Eki' },
                { id: '2026-10-15', name: 'Per', date: '15 Eki' },
                { id: '2026-10-16', name: 'Cum', date: '16 Eki' }
            ]},
            { week: 5, range: '19 - 23 Ekim', days: [
                { id: '2026-10-19', name: 'Pzt', date: '19 Eki' },
                { id: '2026-10-20', name: 'Sal', date: '20 Eki' },
                { id: '2026-10-21', name: 'Çar', date: '21 Eki' },
                { id: '2026-10-22', name: 'Per', date: '22 Eki' },
                { id: '2026-10-23', name: 'Cum', date: '23 Eki' }
            ]},
            { week: 6, range: '26 - 30 Ekim', days: [
                { id: '2026-10-26', name: 'Pzt', date: '26 Eki' },
                { id: '2026-10-27', name: 'Sal', date: '27 Eki' },
                { id: '2026-10-28', name: 'Çar', date: '28 Eki' },
                { id: '2026-10-29', name: 'Per', date: '29 Eki', isHoliday: true, holidayName: 'Cumhuriyet Bayramı' },
                { id: '2026-10-30', name: 'Cum', date: '30 Eki' }
            ]},
            { week: 7, range: '02 - 06 Kasım', days: [
                { id: '2026-11-02', name: 'Pzt', date: '02 Kas' },
                { id: '2026-11-03', name: 'Sal', date: '03 Kas' },
                { id: '2026-11-04', name: 'Çar', date: '04 Kas' },
                { id: '2026-11-05', name: 'Per', date: '05 Kas' },
                { id: '2026-11-06', name: 'Cum', date: '06 Kas' }
            ]}
        ]
    },
    kur2: {
        id: 'kur2',
        name: '2. Kur (Güz 2)',
        title: '2. Kur Akademik Takvimi',
        subtitle: '23 Kasım 2026 - 08 Ocak 2027 (7 Hafta / 35 Gün)',
        startDate: '2026-11-23',
        endDate: '2027-01-08',
        totalWeeks: 7,
        totalHours: 175,
        maxUnexcused: 35.0,
        maxMedical: 17.5,
        weeks: [
            { week: 1, range: '23 - 27 Kasım', days: [
                { id: '2026-11-23', name: 'Pzt', date: '23 Kas' },
                { id: '2026-11-24', name: 'Sal', date: '24 Kas' },
                { id: '2026-11-25', name: 'Çar', date: '25 Kas' },
                { id: '2026-11-26', name: 'Per', date: '26 Kas' },
                { id: '2026-11-27', name: 'Cum', date: '27 Kas' }
            ]},
            { week: 2, range: '30 Kasım - 04 Aralık', days: [
                { id: '2026-11-30', name: 'Pzt', date: '30 Kas' },
                { id: '2026-12-01', name: 'Sal', date: '01 Ara' },
                { id: '2026-12-02', name: 'Çar', date: '02 Ara' },
                { id: '2026-12-03', name: 'Per', date: '03 Ara' },
                { id: '2026-12-04', name: 'Cum', date: '04 Ara' }
            ]},
            { week: 3, range: '07 - 11 Aralık', days: [
                { id: '2026-12-07', name: 'Pzt', date: '07 Ara' },
                { id: '2026-12-08', name: 'Sal', date: '08 Ara' },
                { id: '2026-12-09', name: 'Çar', date: '09 Ara' },
                { id: '2026-12-10', name: 'Per', date: '10 Ara' },
                { id: '2026-12-11', name: 'Cum', date: '11 Ara' }
            ]},
            { week: 4, range: '14 - 18 Aralık', days: [
                { id: '2026-12-14', name: 'Pzt', date: '14 Ara' },
                { id: '2026-12-15', name: 'Sal', date: '15 Ara' },
                { id: '2026-12-16', name: 'Çar', date: '16 Ara' },
                { id: '2026-12-17', name: 'Per', date: '17 Ara' },
                { id: '2026-12-18', name: 'Cum', date: '18 Ara' }
            ]},
            { week: 5, range: '21 - 25 Aralık', days: [
                { id: '2026-12-21', name: 'Pzt', date: '21 Ara' },
                { id: '2026-12-22', name: 'Sal', date: '22 Ara' },
                { id: '2026-12-23', name: 'Çar', date: '23 Ara' },
                { id: '2026-12-24', name: 'Per', date: '24 Ara' },
                { id: '2026-12-25', name: 'Cum', date: '25 Ara' }
            ]},
            { week: 6, range: '28 Aralık - 01 Ocak', days: [
                { id: '2026-12-28', name: 'Pzt', date: '28 Ara' },
                { id: '2026-12-29', name: 'Sal', date: '29 Ara' },
                { id: '2026-12-30', name: 'Çar', date: '30 Ara' },
                { id: '2026-12-31', name: 'Per', date: '31 Ara' },
                { id: '2027-01-01', name: 'Cum', date: '01 Oca', isHoliday: true, holidayName: 'Yılbaşı' }
            ]},
            { week: 7, range: '04 - 08 Ocak', days: [
                { id: '2027-01-04', name: 'Pzt', date: '04 Oca' },
                { id: '2027-01-05', name: 'Sal', date: '05 Oca' },
                { id: '2027-01-06', name: 'Çar', date: '06 Oca' },
                { id: '2027-01-07', name: 'Per', date: '07 Oca' },
                { id: '2027-01-08', name: 'Cum', date: '08 Oca' }
            ]}
        ]
    },
    kur3: {
        id: 'kur3',
        name: '3. Kur (Bahar 1)',
        title: '3. Kur Akademik Takvimi',
        subtitle: '01 Şubat - 26 Mart 2027 (8 Hafta)',
        startDate: '2027-02-01',
        endDate: '2027-03-26',
        totalWeeks: 8,
        totalHours: 175,
        maxUnexcused: 35.0,
        maxMedical: 17.5,
        weeks: [
            { week: 1, range: '01 - 05 Şubat', days: [
                { id: '2027-02-01', name: 'Pzt', date: '01 Şub' },
                { id: '2027-02-02', name: 'Sal', date: '02 Şub' },
                { id: '2027-02-03', name: 'Çar', date: '03 Şub' },
                { id: '2027-02-04', name: 'Per', date: '04 Şub' },
                { id: '2027-02-05', name: 'Cum', date: '05 Şub' }
            ]},
            { week: 2, range: '08 - 12 Şubat', days: [
                { id: '2027-02-08', name: 'Pzt', date: '08 Şub' },
                { id: '2027-02-09', name: 'Sal', date: '09 Şub' },
                { id: '2027-02-10', name: 'Çar', date: '10 Şub' },
                { id: '2027-02-11', name: 'Per', date: '11 Şub' },
                { id: '2027-02-12', name: 'Cum', date: '12 Şub' }
            ]},
            { week: 3, range: '15 - 19 Şubat', days: [
                { id: '2027-02-15', name: 'Pzt', date: '15 Şub' },
                { id: '2027-02-16', name: 'Sal', date: '16 Şub' },
                { id: '2027-02-17', name: 'Çar', date: '17 Şub' },
                { id: '2027-02-18', name: 'Per', date: '18 Şub' },
                { id: '2027-02-19', name: 'Cum', date: '19 Şub' }
            ]},
            { week: 4, range: '22 - 26 Şubat', days: [
                { id: '2027-02-22', name: 'Pzt', date: '22 Şub' },
                { id: '2027-02-23', name: 'Sal', date: '23 Şub' },
                { id: '2027-02-24', name: 'Çar', date: '24 Şub' },
                { id: '2027-02-25', name: 'Per', date: '25 Şub' },
                { id: '2027-02-26', name: 'Cum', date: '26 Şub' }
            ]},
            { week: 5, range: '01 - 05 Mart', days: [
                { id: '2027-03-01', name: 'Pzt', date: '01 Mar' },
                { id: '2027-03-02', name: 'Sal', date: '02 Mar' },
                { id: '2027-03-03', name: 'Çar', date: '03 Mar' },
                { id: '2027-03-04', name: 'Per', date: '04 Mar' },
                { id: '2027-03-05', name: 'Cum', date: '05 Mar' }
            ]},
            { week: 6, range: '08 - 12 Mart', days: [
                { id: '2027-03-08', name: 'Pzt', date: '08 Mar' },
                { id: '2027-03-09', name: 'Sal', date: '09 Mar', isHoliday: true, holidayName: 'Ramazan Bayramı' },
                { id: '2027-03-10', name: 'Çar', date: '10 Mar', isHoliday: true, holidayName: 'Ramazan Bayramı' },
                { id: '2027-03-11', name: 'Per', date: '11 Mar', isHoliday: true, holidayName: 'Ramazan Bayramı' },
                { id: '2027-03-12', name: 'Cum', date: '12 Mar' }
            ]},
            { week: 7, range: '15 - 19 Mart', days: [
                { id: '2027-03-15', name: 'Pzt', date: '15 Mar' },
                { id: '2027-03-16', name: 'Sal', date: '16 Mar' },
                { id: '2027-03-17', name: 'Çar', date: '17 Mar' },
                { id: '2027-03-18', name: 'Per', date: '18 Mar' },
                { id: '2027-03-19', name: 'Cum', date: '19 Mar' }
            ]},
            { week: 8, range: '22 - 26 Mart', days: [
                { id: '2027-03-22', name: 'Pzt', date: '22 Mar' },
                { id: '2027-03-23', name: 'Sal', date: '23 Mar' },
                { id: '2027-03-24', name: 'Çar', date: '24 Mar' },
                { id: '2027-03-25', name: 'Per', date: '25 Mar' },
                { id: '2027-03-26', name: 'Cum', date: '26 Mar' }
            ]}
        ]
    },
    kur4: {
        id: 'kur4',
        name: '4. Kur (Bahar 2)',
        title: '4. Kur Akademik Takvimi',
        subtitle: '12 Nisan - 04 Haziran 2027 (8 Hafta)',
        startDate: '2027-04-12',
        endDate: '2027-06-04',
        totalWeeks: 8,
        totalHours: 175,
        maxUnexcused: 35.0,
        maxMedical: 17.5,
        weeks: [
            { week: 1, range: '12 - 16 Nisan', days: [
                { id: '2027-04-12', name: 'Pzt', date: '12 Nis' },
                { id: '2027-04-13', name: 'Sal', date: '13 Nis' },
                { id: '2027-04-14', name: 'Çar', date: '14 Nis' },
                { id: '2027-04-15', name: 'Per', date: '15 Nis' },
                { id: '2027-04-16', name: 'Cum', date: '16 Nis' }
            ]},
            { week: 2, range: '19 - 23 Nisan', days: [
                { id: '2027-04-19', name: 'Pzt', date: '19 Nis' },
                { id: '2027-04-20', name: 'Sal', date: '20 Nis' },
                { id: '2027-04-21', name: 'Çar', date: '21 Nis' },
                { id: '2027-04-22', name: 'Per', date: '22 Nis' },
                { id: '2027-04-23', name: 'Cum', date: '23 Nis', isHoliday: true, holidayName: '23 Nisan Bayramı' }
            ]},
            { week: 3, range: '26 - 30 Nisan', days: [
                { id: '2027-04-26', name: 'Pzt', date: '26 Nis' },
                { id: '2027-04-27', name: 'Sal', date: '27 Nis' },
                { id: '2027-04-28', name: 'Çar', date: '28 Nis' },
                { id: '2027-04-29', name: 'Per', date: '29 Nis' },
                { id: '2027-04-30', name: 'Cum', date: '30 Nis' }
            ]},
            { week: 4, range: '03 - 07 Mayıs', days: [
                { id: '2027-05-03', name: 'Pzt', date: '03 May' },
                { id: '2027-05-04', name: 'Sal', date: '04 May' },
                { id: '2027-05-05', name: 'Çar', date: '05 May' },
                { id: '2027-05-06', name: 'Per', date: '06 May' },
                { id: '2027-05-07', name: 'Cum', date: '07 May' }
            ]},
            { week: 5, range: '10 - 14 Mayıs', days: [
                { id: '2027-05-10', name: 'Pzt', date: '10 May' },
                { id: '2027-05-11', name: 'Sal', date: '11 May' },
                { id: '2027-05-12', name: 'Çar', date: '12 May' },
                { id: '2027-05-13', name: 'Per', date: '13 May' },
                { id: '2027-05-14', name: 'Cum', date: '14 May' }
            ]},
            { week: 6, range: '17 - 21 Mayıs', days: [
                { id: '2027-05-17', name: 'Pzt', date: '17 May', isHoliday: true, holidayName: 'Kurban Bayramı' },
                { id: '2027-05-18', name: 'Sal', date: '18 May', isHoliday: true, holidayName: 'Kurban Bayramı' },
                { id: '2027-05-19', name: 'Çar', date: '19 May', isHoliday: true, holidayName: '19 Mayıs Bayramı' },
                { id: '2027-05-20', name: 'Per', date: '20 May' },
                { id: '2027-05-21', name: 'Cum', date: '21 May' }
            ]},
            { week: 7, range: '24 - 28 Mayıs', days: [
                { id: '2027-05-24', name: 'Pzt', date: '24 May' },
                { id: '2027-05-25', name: 'Sal', date: '25 May' },
                { id: '2027-05-26', name: 'Çar', date: '26 May' },
                { id: '2027-05-27', name: 'Per', date: '27 May' },
                { id: '2027-05-28', name: 'Cum', date: '28 May' }
            ]},
            { week: 8, range: '31 Mayıs - 04 Haziran', days: [
                { id: '2027-05-31', name: 'Pzt', date: '31 May' },
                { id: '2027-06-01', name: 'Sal', date: '01 Haz' },
                { id: '2027-06-02', name: 'Çar', date: '02 Haz' },
                { id: '2027-06-03', name: 'Per', date: '03 Haz' },
                { id: '2027-06-04', name: 'Cum', date: '04 Haz' }
            ]}
        ]
    },
    yaz: {
        id: 'yaz',
        name: '5. Kur (Yaz Okulu)',
        title: 'Yaz Okulu Akademik Takvimi',
        subtitle: '05 Temmuz - 13 Ağustos 2027 (6 Hafta / 30 Gün)',
        startDate: '2027-07-05',
        endDate: '2027-08-13',
        totalWeeks: 6,
        totalHours: 150,
        maxUnexcused: 30.0,
        maxMedical: 15.0,
        weeks: [
            { week: 1, range: '05 - 09 Temmuz', days: [
                { id: '2027-07-05', name: 'Pzt', date: '05 Tem' },
                { id: '2027-07-06', name: 'Sal', date: '06 Tem' },
                { id: '2027-07-07', name: 'Çar', date: '07 Tem' },
                { id: '2027-07-08', name: 'Per', date: '08 Tem' },
                { id: '2027-07-09', name: 'Cum', date: '09 Tem' }
            ]},
            { week: 2, range: '12 - 16 Temmuz', days: [
                { id: '2027-07-12', name: 'Pzt', date: '12 Tem' },
                { id: '2027-07-13', name: 'Sal', date: '13 Tem' },
                { id: '2027-07-14', name: 'Çar', date: '14 Tem' },
                { id: '2027-07-15', name: 'Per', date: '15 Tem', isHoliday: true, holidayName: '15 Temmuz Demokrasi Günü' },
                { id: '2027-07-16', name: 'Cum', date: '16 Tem' }
            ]},
            { week: 3, range: '19 - 23 Temmuz', days: [
                { id: '2027-07-19', name: 'Pzt', date: '19 Tem' },
                { id: '2027-07-20', name: 'Sal', date: '20 Tem' },
                { id: '2027-07-21', name: 'Çar', date: '21 Tem' },
                { id: '2027-07-22', name: 'Per', date: '22 Tem' },
                { id: '2027-07-23', name: 'Cum', date: '23 Tem' }
            ]},
            { week: 4, range: '26 - 30 Temmuz', days: [
                { id: '2027-07-26', name: 'Pzt', date: '26 Tem' },
                { id: '2027-07-27', name: 'Sal', date: '27 Tem' },
                { id: '2027-07-28', name: 'Çar', date: '28 Tem' },
                { id: '2027-07-29', name: 'Per', date: '29 Tem' },
                { id: '2027-07-30', name: 'Cum', date: '30 Tem' }
            ]},
            { week: 5, range: '02 - 06 Ağustos', days: [
                { id: '2027-08-02', name: 'Pzt', date: '02 Ağu' },
                { id: '2027-08-03', name: 'Sal', date: '03 Ağu' },
                { id: '2027-08-04', name: 'Çar', date: '04 Ağu' },
                { id: '2027-08-05', name: 'Per', date: '05 Ağu' },
                { id: '2027-08-06', name: 'Cum', date: '06 Ağu' }
            ]},
            { week: 6, range: '09 - 13 Ağustos', days: [
                { id: '2027-08-09', name: 'Pzt', date: '09 Ağu' },
                { id: '2027-08-10', name: 'Sal', date: '10 Ağu' },
                { id: '2027-08-11', name: 'Çar', date: '11 Ağu' },
                { id: '2027-08-12', name: 'Per', date: '12 Ağu' },
                { id: '2027-08-13', name: 'Cum', date: '13 Ağu' }
            ]}
        ]
    }
};

function createEmptyAttendanceState() {
    return Object.fromEntries(Object.keys(KURS_DATA).map((kurId) => [kurId, {}]));
}

function sanitizeAttendanceState(value) {
    const cleanState = createEmptyAttendanceState();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return cleanState;

    const validStatuses = new Set(['present', 'unexcused', 'medical', 'ghost_suspicious', 'ghost_success']);
    Object.entries(value).forEach(([kurId, dates]) => {
        if (!cleanState[kurId] || !dates || typeof dates !== 'object' || Array.isArray(dates)) return;

        Object.entries(dates).forEach(([date, slots]) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
            if (!Array.isArray(slots) || slots.length !== 5) return;
            if (slots.some((slot) => !validStatuses.has(slot))) return;
            cleanState[kurId][date] = slots.slice();
        });
    });

    return cleanState;
}

function detectCurrentKurId() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    for (const kId in KURS_DATA) {
        const k = KURS_DATA[kId];
        if (todayStr >= k.startDate && todayStr <= k.endDate) {
            return kId;
        }
    }

    if (todayStr < KURS_DATA.kur1.startDate) return 'kur1';
    if (todayStr > KURS_DATA.kur1.endDate && todayStr < KURS_DATA.kur2.startDate) return 'kur2';
    if (todayStr > KURS_DATA.kur2.endDate && todayStr < KURS_DATA.kur3.startDate) return 'kur3';
    if (todayStr > KURS_DATA.kur3.endDate && todayStr < KURS_DATA.kur4.startDate) return 'kur4';
    if (todayStr > KURS_DATA.kur4.endDate && todayStr < KURS_DATA.yaz.startDate) return 'yaz';
    if (todayStr > KURS_DATA.yaz.endDate) return 'yaz';

    return 'kur1';
}

/**
 * Aktif kurun devamsızlık özetini localStorage üzerinden hesaplar.
 * Hem devamsizlik.html hem index.html (Not Hesaplayıcı) tarafından kullanılır.
 */
function getActiveAttendanceSummary() {
    let state = createEmptyAttendanceState();
    const rawMulti = SafeStorage.get(ATTENDANCE_ALL_KURS_KEY);
    if (rawMulti) {
        try {
            state = sanitizeAttendanceState(JSON.parse(rawMulti));
        } catch (e) {}
    } else {
        const legacy = SafeStorage.get('sbtu_attendance_cache');
        if (legacy) {
            try {
                state.kur1 = sanitizeAttendanceState({ kur1: JSON.parse(legacy) }).kur1;
            } catch (e) {}
        }
    }

    const savedKur = SafeStorage.get(ACTIVE_KUR_PREF_KEY);
    const kurId = (savedKur && KURS_DATA[savedKur]) ? savedKur : detectCurrentKurId();
    const curKur = KURS_DATA[kurId] || KURS_DATA.kur1;
    const kurData = state[kurId] || {};

    let totalUnexcused = 0;
    let totalMedical = 0;
    let totalGhostSuspicious = 0;
    let totalGhostSuccess = 0;

    Object.values(kurData).forEach((slots) => {
        if (!Array.isArray(slots)) return;
        slots.forEach((slot) => {
            if (slot === 'unexcused') totalUnexcused += 1;
            else if (slot === 'medical') totalMedical += 1;
            else if (slot === 'ghost_suspicious') totalGhostSuspicious += 1;
            else if (slot === 'ghost_success') totalGhostSuccess += 1;
        });
    });

    const maxUnexcused = curKur.maxUnexcused;
    const maxMedical = curKur.maxMedical;
    const validMedicalDeduction = Math.min(maxMedical, totalMedical);
    const excessMedical = Math.max(0, totalMedical - maxMedical);
    const netAttendanceLoss = totalUnexcused + excessMedical;
    const remainingHours = Math.max(0, maxUnexcused - netAttendanceLoss);
    const isFailedAttendance = netAttendanceLoss > maxUnexcused;

    return {
        kurId,
        kurName: curKur.name,
        totalUnexcused,
        totalMedical,
        totalGhostSuspicious,
        totalGhostSuccess,
        validMedicalDeduction,
        excessMedical,
        netAttendanceLoss,
        maxUnexcused,
        maxMedical,
        remainingHours,
        isFailedAttendance
    };
}

// ====================== TEMA YÖNETİMİ ======================

function initTheme() {
    let savedTheme = SafeStorage.get(THEME_KEY);
    if (!savedTheme) {
        savedTheme = SafeStorage.get(LEGACY_ISKUR_THEME_KEY);
    }
    const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

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
        SafeStorage.set(LEGACY_ISKUR_THEME_KEY, 'dark');
        if (sunIcon) sunIcon.classList.remove('hidden');
        if (moonIcon) moonIcon.classList.add('hidden');
    } else {
        document.documentElement.classList.remove('dark');
        SafeStorage.set(THEME_KEY, 'light');
        SafeStorage.set(LEGACY_ISKUR_THEME_KEY, 'light');
        if (sunIcon) sunIcon.classList.add('hidden');
        if (moonIcon) moonIcon.classList.remove('hidden');
    }
}

// ====================== 9 NOKTA UYGULAMALAR MENÜSÜ ======================

function getCurrentPageKey() {
    const bodyPage = document.body?.dataset?.page;
    if (bodyPage) return bodyPage;
    const path = window.location.pathname.toLowerCase();
    if (path.includes('devamsizlik')) return 'attendance';
    if (path.includes('iskur')) return 'iskur';
    return 'grades';
}

function initAppSwitcher() {
    const activePage = getCurrentPageKey();
    const links = document.querySelectorAll('#app-switcher-menu a[data-app-link]');

    links.forEach((link) => {
        const isActive = link.dataset.appLink === activePage;
        if (isActive) {
            link.className = 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800/80 shadow-xs transition';
            link.setAttribute('aria-current', 'page');
            if (!link.querySelector('[data-active-dot]')) {
                const dot = document.createElement('span');
                dot.dataset.activeDot = 'true';
                dot.className = 'w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 shrink-0';
                link.appendChild(dot);
            }
        } else {
            link.className = 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-transparent transition';
            link.removeAttribute('aria-current');
        }
    });

    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('app-switcher-wrapper');
        const menu = document.getElementById('app-switcher-menu');
        if (!wrapper || !menu || menu.classList.contains('hidden')) return;
        if (!wrapper.contains(e.target)) {
            closeAppSwitcher();
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAppSwitcher();
        }
    });
}

function toggleAppSwitcher(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('app-switcher-menu');
    const btn = document.getElementById('app-switcher-btn');
    if (!menu || !btn) return;
    const isHidden = menu.classList.contains('hidden');
    if (isHidden) {
        menu.classList.remove('hidden');
        btn.setAttribute('aria-expanded', 'true');
    } else {
        menu.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
    }
}

function closeAppSwitcher() {
    const menu = document.getElementById('app-switcher-menu');
    const btn = document.getElementById('app-switcher-btn');
    if (menu) menu.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

// ====================== BİLDİRİM / GERİ BİLDİRİM MODALI ======================

function showFeedback(isSuccess, title, desc) {
    const modal = document.getElementById('status-feedback-modal');
    const iconContainer = document.getElementById('feedback-icon-container');
    const titleEl = document.getElementById('feedback-title');
    const descEl = document.getElementById('feedback-desc');

    if (!modal) return;

    if (isSuccess) {
        iconContainer.className = 'w-12 h-12 mx-auto rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400';
        iconContainer.innerHTML = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>';
    } else {
        iconContainer.className = 'w-12 h-12 mx-auto rounded-full flex items-center justify-center bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400';
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
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
        installBtn.classList.remove('hidden');
    }
});

async function triggerPWAInstall() {
    if (!deferredPrompt) {
        if (typeof showFeedback === 'function' && document.getElementById('status-feedback-modal')) {
            showFeedback(true, 'Telefona Yükleme (iOS Safari)', "Safari alt menüsündeki 'Paylaş' (ortadaki yukarı oklu kare) butonuna dokunup 'Ana Ekrana Ekle' seçeneğine basarak doğrudan uygulama gibi yükleyebilirsiniz.");
        }
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
    if (typeof showFeedback === 'function' && document.getElementById('status-feedback-modal')) {
        showFeedback(true, 'Uygulama Yüklendi!', 'SBTÜ Hazırlık Sistemi telefonunuzun ana ekranına başarıyla eklendi.');
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}

// ====================== UYGULAMA BAŞLANGIÇ NOKTASI ======================

function initApp() {
    initTheme();
    initAppSwitcher();

    const page = getCurrentPageKey();

    if (page === 'grades') {
        if (typeof renderExamInputs === 'function' && typeof examStructure !== 'undefined') {
            renderExamInputs('vize-items', examStructure.vize, 'vize');
            renderExamInputs('final-items', examStructure.final, 'final');
        }
        if (typeof loadAllInputsFromStorage === 'function') {
            loadAllInputsFromStorage();
        }
        if (typeof calculateGrades === 'function') {
            calculateGrades();
        }
    } else if (page === 'attendance') {
        if (typeof loadAttendanceFromStorage === 'function') {
            loadAttendanceFromStorage();
        }
        if (typeof renderCalendar === 'function') {
            renderCalendar();
        }
        if (typeof renderDayEditor === 'function') {
            renderDayEditor();
        }
    }

    // Paylaşım modalı dışına tıklama ve Escape tuşu dinleyicileri
    const shareModal = document.getElementById('share-modal');
    if (shareModal) {
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal && typeof closeShareModal === 'function') {
                closeShareModal();
            }
        });
    }
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && typeof closeShareModal === 'function') {
            closeShareModal();
        }
    });

    if (window.SbtuAuth && typeof window.SbtuAuth.init === 'function') {
        window.SbtuAuth.init();
    }
}

document.addEventListener('DOMContentLoaded', initApp);
