/**
 * SBTÜ Hazırlık Sistemi - Mobil Not Kartı ve Canvas Motoru
 * - HTML5 Canvas ile yüksek çözünürlüklü dijital karne/belge üretimi
 * - Dinamik renk kodlaması (Geçti / Kaldı / Devam Ediyor durumları)
 * - Vize, Final katkıları ve 3 final bileşeni (L&R, Writing, Speaking) dökümü
 * - Kart önizleme modalı ve öğrenci adı entegrasyonu
 * - Web Share API ile doğrudan dosya/görsel paylaşımı veya cihaza PNG indirme
 */

let preRenderedShareFile = null;

// ====================== HTML5 CANVAS ÇİZİM MOTORU ======================

function generateShareCanvas(studentName = '') {
    const canvas = document.getElementById('shareCanvas');
    if (!canvas) return null;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Arka Plan Gradyanı (Koyu Lacivert / Slate Premium Tema)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(0.4, '#1e1b4b');
    bgGrad.addColorStop(1, '#020617');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Dış Çerçeve Süslemesi
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // Üst Kurumsal Başlık
    ctx.textAlign = 'center';
    ctx.fillStyle = '#93c5fd';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.fillText('SİVAS BİLİM VE TEKNOLOJİ ÜNİVERSİTESİ', width / 2, 72);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 32px Inter, sans-serif';
    ctx.fillText('İngilizce Hazırlık Not Belgesi', width / 2, 116);

    const cleanName = studentName.trim();
    let currentY = 152;
    if (cleanName) {
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 20px Inter, sans-serif';
        ctx.fillText(`Öğrenci: ${cleanName}`, width / 2, currentY);
        currentY += 34;
    }

    const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = '500 14px Inter, sans-serif';
    ctx.fillText(`${today} • UBYS Resmi Barem Standardı`, width / 2, currentY);

    // Mevcut Not Durumu Verileri
    const overallScore = document.getElementById('overall-score')?.innerText || '0';
    const rawScoreText = document.getElementById('overall-subtext')?.innerText || 'Ham: 0.00';
    const statusText = document.getElementById('status-text')?.innerText || 'Not Bekleniyor';
    const statusBadgeText = document.getElementById('status-badge')?.innerText || 'Sınır: 60';

    let statusColor = '#3b82f6';
    let statusBg = 'rgba(59, 130, 246, 0.18)';
    if (statusText === 'GEÇTİ') {
        statusColor = '#10b981';
        statusBg = 'rgba(16, 185, 129, 0.2)';
    } else if (statusText === 'KALDI') {
        statusColor = '#f43f5e';
        statusBg = 'rgba(244, 63, 94, 0.2)';
    } else if (statusText === 'DEVAM EDİYOR') {
        statusColor = '#f59e0b';
        statusBg = 'rgba(245, 158, 11, 0.2)';
    }

    // Ana Not Kartı Paneli
    const mainCardY = currentY + 28;
    const mainCardH = 290;
    const mainCardW = width - 80;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 40, mainCardY, mainCardW, mainCardH, 24, true, true);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
    ctx.font = '600 16px Inter, sans-serif';
    ctx.fillText('GENEL DÖNEM NOTU', width / 2, mainCardY + 44);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 86px Inter, sans-serif';
    ctx.fillText(overallScore, width / 2, mainCardY + 130);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 16px Inter, sans-serif';
    ctx.fillText(rawScoreText, width / 2, mainCardY + 164);

    // Durum Rozeti (Geçti / Kaldı / Devam Ediyor)
    const badgeW = 320;
    const badgeH = 56;
    const badgeX = (width - badgeW) / 2;
    const badgeY = mainCardY + 185;

    ctx.fillStyle = statusBg;
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 2;
    roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 16, true, true);

    ctx.fillStyle = statusColor;
    ctx.font = '800 24px Inter, sans-serif';
    ctx.fillText(statusText, width / 2, badgeY + 37);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.font = '600 14px Inter, sans-serif';
    ctx.fillText(statusBadgeText, width / 2, mainCardY + 270);

    // Alt Bölüm: Vize & Final Katkı Kutuları
    const subY = mainCardY + mainCardH + 24;
    const subH = 150;
    const subW = (width - 80 - 20) / 2;

    // Vize Kutusu (%40)
    ctx.fillStyle = 'rgba(30, 27, 75, 0.65)';
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.35)';
    roundRect(ctx, 40, subY, subW, subH, 20, true, true);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#818cf8';
    ctx.font = '700 15px Inter, sans-serif';
    ctx.fillText('VİZE KATKISI (%40)', 40 + (subW / 2), subY + 38);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 36px Inter, sans-serif';
    ctx.fillText(document.getElementById('vize-total-score')?.innerText || '0.00', 40 + (subW / 2), subY + 84);

    ctx.fillStyle = '#a5b4fc';
    ctx.font = '500 14px Inter, sans-serif';
    ctx.fillText(document.getElementById('vize-subtext')?.innerText || 'Vize: 0 / 100', 40 + (subW / 2), subY + 118);

    // Final Kutusu (%60)
    const finalX = 40 + subW + 20;
    ctx.fillStyle = 'rgba(88, 28, 135, 0.5)';
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.35)';
    roundRect(ctx, finalX, subY, subW, subH, 20, true, true);

    ctx.fillStyle = '#c084fc';
    ctx.font = '700 15px Inter, sans-serif';
    ctx.fillText('FİNAL KATKISI (%60)', finalX + (subW / 2), subY + 38);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 36px Inter, sans-serif';
    ctx.fillText(document.getElementById('final-total-score')?.innerText || '0.00', finalX + (subW / 2), subY + 84);

    ctx.fillStyle = '#d8b4fe';
    ctx.font = '500 14px Inter, sans-serif';
    ctx.fillText(document.getElementById('final-subtext')?.innerText || 'Final: 0 / 100', finalX + (subW / 2), subY + 118);

    // Final Sınavları Detay Paneli (L&R, Writing, Speaking)
    const finalDetailY = subY + subH + 24;
    const finalDetailH = 135;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    roundRect(ctx, 40, finalDetailY, width - 80, finalDetailH, 20, true, true);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
    ctx.font = '600 13px Inter, sans-serif';
    ctx.fillText('FİNAL BİLEŞENLERİ (ASGARİ 50 BARAJI)', width / 2, finalDetailY + 30);

    const colW = (width - 80) / 3;
    const f_lr_val = document.getElementById('input-f_lr')?.value || '-';
    const f_wr_val = document.getElementById('input-f_wr')?.value || '-';
    const f_sp_val = document.getElementById('input-f_sp')?.value || '-';

    // Listening & Reading
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 28px Inter, sans-serif';
    ctx.fillText(f_lr_val, 40 + (colW * 0.5), finalDetailY + 75);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 13px Inter, sans-serif';
    ctx.fillText('L&R (%50)', 40 + (colW * 0.5), finalDetailY + 104);

    // Writing
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 28px Inter, sans-serif';
    ctx.fillText(f_wr_val, 40 + (colW * 1.5), finalDetailY + 75);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 13px Inter, sans-serif';
    ctx.fillText('Writing (%25)', 40 + (colW * 1.5), finalDetailY + 104);

    // Speaking
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 28px Inter, sans-serif';
    ctx.fillText(f_sp_val, 40 + (colW * 2.5), finalDetailY + 75);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 13px Inter, sans-serif';
    ctx.fillText('Speaking (%25)', 40 + (colW * 2.5), finalDetailY + 104);

    // Alt Dipnot
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.font = '600 14px Inter, sans-serif';
    ctx.fillText('SBTÜ Hazırlık UBYS Not Hesaplayıcı', width / 2, height - 42);

    return canvas;
}

// Yuvarlatılmış Köşeli Dikdörtgen Çizim Yardımcısı
function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

// ====================== MODAL VE ÖN İZLEME YÖNETİMİ ======================

function updateModalCardPreview() {
    const nameInput = document.getElementById('student-name-input');
    const studentName = nameInput ? nameInput.value : '';
    const canvas = generateShareCanvas(studentName);
    if (!canvas) return;

    const previewImg = document.getElementById('share-preview-img');
    const shareBtn = document.getElementById('modal-native-share-btn');

    if (previewImg) previewImg.src = canvas.toDataURL('image/png');

    canvas.toBlob((blob) => {
        if (!blob) return;
        preRenderedShareFile = new File([blob], 'sbtu-hazirlik-not-durumu.png', { type: 'image/png' });

        if (shareBtn) {
            if (navigator.canShare && navigator.canShare({ files: [preRenderedShareFile] })) {
                shareBtn.classList.remove('hidden');
            } else {
                shareBtn.classList.add('hidden');
            }
        }
    }, 'image/png');
}

function openShareModal() {
    if (typeof calculateGrades === 'function') {
        calculateGrades();
    }
    updateModalCardPreview();
    const modal = document.getElementById('share-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

function closeShareModal() {
    const modal = document.getElementById('share-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// ====================== PAYLAŞIM VE İNDİRME FONKSİYONLARI ======================

async function triggerWebShare() {
    if (!preRenderedShareFile) {
        downloadCardDirectly();
        return;
    }

    if (navigator.canShare && navigator.canShare({ files: [preRenderedShareFile] })) {
        try {
            const overallScore = document.getElementById('overall-score')?.innerText || '0';
            const statusText = document.getElementById('status-text')?.innerText || '';
            await navigator.share({
                title: 'SBTÜ Hazırlık Not Durumu',
                text: `SBTÜ Hazırlık Not Belgesi - Genel Notum: ${overallScore} (${statusText})`,
                files: [preRenderedShareFile]
            });
        } catch (err) {
            if (err.name === 'AbortError') return;
            downloadCardDirectly();
        }
    } else {
        downloadCardDirectly();
    }
}

function downloadCardDirectly() {
    const canvas = document.getElementById('shareCanvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'sbtu-hazirlik-not-durumu.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}