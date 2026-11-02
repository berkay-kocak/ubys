/**
 * SBTÜ Hazırlık Sistemi - Not Hesaplama ve Başarı Stratejisi
 * - Sınav yapısı tanımları (Vize %40, Final %60)
 * - 60 geçme puanı ve 50 final baraj kuralı
 * - Dinamik sınav girdi alanlarının oluşturulması
 * - Toplu ve bireysel not giriş yönetimi
 * - SBTÜ UBYS standartlarında yuvarlama ve hesaplama
 * - Öncelikli ve beceri bazlı kişiselleştirilmiş final strateji algoritması
 */

const PASSING_GRADE = 60;
const FINAL_MIN_GRADE = 50;
const STORAGE_CACHE_KEY = 'sbtu_grades_cache';

// Kullanıcı Beceri Seviyeleri (1-5 arası katsayı veya 'baraj' [sabit 50])
const userSkills = {
    lr: 3,
    wr: 3,
    sp: 3
};

// SBTÜ YDYO Notlandırma Barem Yapısı
const examStructure = {
    vize: [
        { id: 'w11', name: 'Writing 1.1', weight: 13.13 },
        { id: 'w12', name: 'Writing 1.2', weight: 5.63 },
        { id: 'w21', name: 'Writing 2.1', weight: 13.13 },
        { id: 'w22', name: 'Writing 2.2', weight: 5.63 },
        { id: 'q1',  name: 'Quiz 1',       weight: 19.68 },
        { id: 'q2',  name: 'Quiz 2',       weight: 19.68 },
        { id: 'spk', name: 'Speaking Task',weight: 13.12 },
        { id: 'hw',  name: 'Online Homework', weight: 10.00 }
    ],
    final: [
        { id: 'f_lr', name: 'Final (Listening & Reading)', weight: 50.00 },
        { id: 'f_wr', name: 'Final (Writing)', weight: 25.00 },
        { id: 'f_sp', name: 'Final (Speaking)', weight: 25.00 }
    ]
};

// ====================== GİRDİ ALANLARINI RENDER ETME ======================

function renderExamInputs(containerId, items, category) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const isVize = category === 'vize';
    const badgeClass = isVize 
        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50' 
        : 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-900/50';
    const rowFocusClass = isVize
        ? 'focus-within:bg-indigo-50/40 dark:focus-within:bg-indigo-950/30 focus-within:border-indigo-200 dark:focus-within:border-indigo-800'
        : 'focus-within:bg-purple-50/40 dark:focus-within:bg-purple-950/30 focus-within:border-purple-200 dark:focus-within:border-purple-800';

    items.forEach((item) => {
        const row = document.createElement('div');
        row.className = `grid grid-cols-12 items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-xl hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-all border border-transparent ${rowFocusClass}`;
        
        row.innerHTML = `
            <label for="input-${item.id}" class="col-span-6 sm:col-span-7 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer select-none truncate">
                ${item.name}
            </label>
            <div class="col-span-3 sm:col-span-2 text-center text-[11px] sm:text-xs font-semibold py-1 rounded-lg ${badgeClass}">
                %${item.weight}
            </div>
            <div class="col-span-3 text-right">
                <input 
                    type="number" 
                    inputmode="decimal"
                    id="input-${item.id}"
                    data-category="${category}"
                    data-name="${item.name}"
                    data-weight="${item.weight}"
                    min="0" 
                    max="100" 
                    placeholder="-"
                    oninput="onIndividualInput(this)"
                    class="w-full text-right bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 sm:px-2.5 py-1 sm:py-1.5 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
                />
            </div>
        `;
        container.appendChild(row);
    });
}

function applyInputStyle(inputEl) {
    if (!inputEl) return;
    if (inputEl.dataset.category === 'final' && inputEl.value !== '') {
        const score = parseFloat(inputEl.value);
        if (score < FINAL_MIN_GRADE) {
            inputEl.className = "w-full text-right bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-400 dark:border-rose-500 rounded-lg px-2 sm:px-2.5 py-1 sm:py-1.5 text-xs sm:text-sm font-bold text-rose-700 dark:text-rose-300 focus:outline-none transition";
            return;
        }
    }
    inputEl.className = "w-full text-right bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 sm:px-2.5 py-1 sm:py-1.5 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition";
}

function validateAndCalculate(inputEl) {
    if (inputEl.value !== '') {
        let val = parseFloat(inputEl.value);
        if (val > 100) inputEl.value = 100;
        if (val < 0) inputEl.value = 0;
    }
    applyInputStyle(inputEl);
    calculateGrades();
    saveAllInputsToStorage();
}

function onIndividualInput(inputEl) {
    const category = inputEl.dataset.category;
    const bulkInput = document.getElementById(`bulk-${category}-input`);
    if (bulkInput) bulkInput.value = '';
    validateAndCalculate(inputEl);
}

function applyBulkScore(category, bulkEl) {
    let val = bulkEl.value;
    if (val !== '') {
        let parsed = parseFloat(val);
        if (parsed > 100) { parsed = 100; bulkEl.value = 100; }
        if (parsed < 0) { parsed = 0; bulkEl.value = 0; }
        val = parsed;
    }

    const items = examStructure[category];
    items.forEach(item => {
        const input = document.getElementById(`input-${item.id}`);
        if (input) {
            input.value = val;
            applyInputStyle(input);
        }
    });

    calculateGrades();
    saveAllInputsToStorage();
}

function onStudentNameChange() {
    if (typeof updateModalCardPreview === 'function') {
        updateModalCardPreview();
    }
    saveAllInputsToStorage();
}

function scrollToResult() {
    calculateGrades();
    const topBar = document.getElementById('top-summary-bar');
    if (topBar) {
        topBar.scrollIntoView({ behavior: 'smooth' });
        const card = document.getElementById('summary-card');
        if (card) {
            card.classList.add('ring-2', 'ring-indigo-500');
            setTimeout(() => card.classList.remove('ring-2', 'ring-indigo-500'), 1200);
        }
    }
}

// ====================== NOT VE ORTALAMA HESAPLAMA MOTORU ======================

function calculateGrades() {
    let vizeWeightedSum = 0;
    let vizeEnteredCount = 0;
    let vizeEnteredWeight = 0;

    examStructure.vize.forEach(item => {
        const input = document.getElementById(`input-${item.id}`);
        if (input && input.value !== '' && !isNaN(input.value)) {
            const score = parseFloat(input.value);
            vizeWeightedSum += (score * item.weight) / 100;
            vizeEnteredWeight += item.weight;
            vizeEnteredCount++;
        }
    });

    let finalWeightedSum = 0;
    let finalEnteredCount = 0;
    let finalEnteredWeight = 0;
    let failedFinalComponent = null;

    examStructure.final.forEach(item => {
        const input = document.getElementById(`input-${item.id}`);
        if (input && input.value !== '' && !isNaN(input.value)) {
            const score = parseFloat(input.value);
            finalWeightedSum += (score * item.weight) / 100;
            finalEnteredWeight += item.weight;
            finalEnteredCount++;

            if (score < FINAL_MIN_GRADE) {
                failedFinalComponent = item.name;
            }
        }
    });

    const vizeOverallContribution = vizeWeightedSum * 0.40;
    const finalOverallContribution = finalWeightedSum * 0.60;
    const totalOverallGained = vizeOverallContribution + finalOverallContribution;
    const totalWeightEnteredOverall = (vizeEnteredWeight * 0.40) + (finalEnteredWeight * 0.60);
    const roundedOverall = Math.round(totalOverallGained);

    // Skor ve metin alanlarını güncelle
    document.getElementById('vize-total-score').innerText = vizeOverallContribution.toFixed(2);
    document.getElementById('final-total-score').innerText = finalOverallContribution.toFixed(2);
    document.getElementById('overall-score').innerText = roundedOverall;
    document.getElementById('overall-subtext').innerText = `Ham: ${totalOverallGained.toFixed(2)}`;
    document.getElementById('vize-subtext').innerText = `Vize: ${vizeWeightedSum.toFixed(1)} / 100`;
    document.getElementById('final-subtext').innerText = `Final: ${finalWeightedSum.toFixed(1)} / 100`;
    document.getElementById('vize-percent-badge').innerText = `${vizeEnteredCount} / ${examStructure.vize.length} Giriş`;
    document.getElementById('final-percent-badge').innerText = `${finalEnteredCount} / ${examStructure.final.length} Giriş`;

    // İlerleme çubuğunu güncelle
    const progressBar = document.getElementById('overall-progress-bar');
    const clampedScore = Math.min(100, Math.max(0, totalOverallGained));
    progressBar.style.width = `${clampedScore}%`;

    if (failedFinalComponent) {
        progressBar.className = "h-full bg-gradient-to-r from-rose-500 to-red-600 rounded-full transition-all duration-500 ease-out";
    } else if (roundedOverall >= PASSING_GRADE) {
        progressBar.className = "h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500 ease-out";
    } else {
        progressBar.className = "h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500 ease-out";
    }

    updateStatusUI(totalOverallGained, roundedOverall, totalWeightEnteredOverall, failedFinalComponent);
    updateStrategyPanel(vizeOverallContribution, vizeEnteredCount);
}

function updateStatusUI(gainedPoints, roundedOverall, enteredWeight, failedFinalComponent) {
    const statusCard = document.getElementById('status-card');
    const statusText = document.getElementById('status-text');
    const statusBadge = document.getElementById('status-badge');

    if (failedFinalComponent) {
        statusText.innerText = "KALDI";
        statusText.className = "text-base sm:text-xl font-extrabold text-rose-700 dark:text-rose-400 mt-0.5 sm:mt-1";
        statusCard.className = "bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-center items-center transition-colors duration-300";
        statusBadge.innerText = `${failedFinalComponent} < 50`;
        statusBadge.className = "mt-0.5 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full bg-rose-200 dark:bg-rose-900/70 text-rose-800 dark:text-rose-200 font-bold truncate max-w-full";
        return;
    }

    statusBadge.className = "mt-0.5 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold";
    statusBadge.innerText = `Sınır: ${PASSING_GRADE}`;

    if (enteredWeight === 0) {
        statusText.innerText = "Not Bekleniyor";
        statusText.className = "text-sm sm:text-lg font-bold text-slate-700 dark:text-slate-200 mt-0.5 sm:mt-1";
        statusCard.className = "bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-center items-center transition-colors duration-300";
        return;
    }

    const remainingWeight = 100 - enteredWeight;

    if (enteredWeight >= 99.9) {
        if (roundedOverall >= PASSING_GRADE) {
            statusText.innerText = "GEÇTİ";
            statusText.className = "text-base sm:text-xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5 sm:mt-1";
            statusCard.className = "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-center items-center transition-colors duration-300";
        } else {
            statusText.innerText = "KALDI";
            statusText.className = "text-base sm:text-xl font-extrabold text-rose-700 dark:text-rose-400 mt-0.5 sm:mt-1";
            statusCard.className = "bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-center items-center transition-colors duration-300";
        }
    } else {
        if (Math.round(gainedPoints + remainingWeight) < PASSING_GRADE) {
            statusText.innerText = "KALDI";
            statusText.className = "text-base sm:text-xl font-extrabold text-rose-700 dark:text-rose-400 mt-0.5 sm:mt-1";
            statusCard.className = "bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-center items-center transition-colors duration-300";
        } else {
            statusText.innerText = "DEVAM EDİYOR";
            statusText.className = "text-xs sm:text-base font-bold text-amber-700 dark:text-amber-400 mt-0.5 sm:mt-1";
            statusCard.className = "bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-center items-center transition-colors duration-300";
        }
    }
}

// ====================== KİŞİSELLEŞTİRİLMİŞ STRATEJİ ALGORİTMASI ======================

function setSkillLevel(skillKey, level) {
    userSkills[skillKey] = level;
    calculateGrades();
}

function calculateCustomizedPlan(reqFinalAvg, vizeContrib) {
    const extraNeeded = Math.max(0, reqFinalAvg - 50.0);
    if (extraNeeded <= 0) return { lr: 50, wr: 50, sp: 50, valid: true, allBarajBlocked: false };

    const weights = { lr: 0.50, wr: 0.25, sp: 0.25 };
    const softCaps = { lr: 95, wr: 90, sp: 90 };
    const hardCaps = { lr: 100, wr: 100, sp: 100 };

    const activeSkills = [];
    ['lr', 'wr', 'sp'].forEach(k => {
        if (userSkills[k] !== 'baraj') activeSkills.push(k);
    });

    if (activeSkills.length === 0) return { lr: 50, wr: 50, sp: 50, valid: false, allBarajBlocked: true };

    let scores = { lr: 50.0, wr: 50.0, sp: 50.0 };

    function distributePoints(needed, targetCaps) {
        let remaining = needed;
        let pool = activeSkills.filter(k => scores[k] < targetCaps[k] - 0.0001);

        while (remaining > 0.0001 && pool.length > 0) {
            let totalPriorityWeight = 0;
            pool.forEach(k => totalPriorityWeight += weights[k] * (userSkills[k] || 1));
            if (totalPriorityWeight === 0) pool.forEach(k => totalPriorityWeight += weights[k]);

            let maxC = remaining / totalPriorityWeight;
            for (let k of pool) {
                let headroom = targetCaps[k] - scores[k];
                let c_limit = headroom / (userSkills[k] || 1);
                if (c_limit < maxC) maxC = c_limit;
            }

            for (let k of pool) {
                let delta = maxC * (userSkills[k] || 1);
                scores[k] += delta;
                remaining -= delta * weights[k];
            }

            pool = activeSkills.filter(k => scores[k] < targetCaps[k] - 0.0001);
        }
        return Math.max(0, remaining);
    }

    let rem = distributePoints(extraNeeded, softCaps);
    if (rem > 0.0001) distributePoints(rem, hardCaps);

    let s_lr = userSkills.lr === 'baraj' ? 50 : Math.max(50, Math.ceil(scores.lr));
    let s_wr = userSkills.wr === 'baraj' ? 50 : Math.max(50, Math.ceil(scores.wr));
    let s_sp = userSkills.sp === 'baraj' ? 50 : Math.max(50, Math.ceil(scores.sp));

    s_lr = Math.min(100, s_lr);
    s_wr = Math.min(100, s_wr);
    s_sp = Math.min(100, s_sp);

    let finalCont = (s_lr * 0.50 + s_wr * 0.25 + s_sp * 0.25) * 0.60;
    let currentOverall = vizeContrib + finalCont;

    let safetyGuard = 0;
    while (Math.round(currentOverall) < PASSING_GRADE && safetyGuard < 15) {
        let candidates = activeSkills.filter(k => {
            if (k === 'lr') return s_lr < 100;
            if (k === 'wr') return s_wr < 100;
            if (k === 'sp') return s_sp < 100;
            return false;
        });
        if (candidates.length === 0) break;
        candidates.sort((a, b) => userSkills[b] - userSkills[a]);
        let best = candidates[0];

        if (best === 'lr') s_lr++;
        else if (best === 'wr') s_wr++;
        else if (best === 'sp') s_sp++;

        finalCont = (s_lr * 0.50 + s_wr * 0.25 + s_sp * 0.25) * 0.60;
        currentOverall = vizeContrib + finalCont;
        safetyGuard++;
    }

    const isValid = s_lr <= 100 && s_wr <= 100 && s_sp <= 100 && Math.round(currentOverall) >= PASSING_GRADE;
    return { lr: s_lr, wr: s_wr, sp: s_sp, valid: isValid, allBarajBlocked: false };
}

function updateStrategyPanel(vizeContrib, vizeEnteredCount) {
    const badge = document.getElementById('strategy-status-badge');
    const container = document.getElementById('strategy-content');
    if (!badge || !container) return;

    if (vizeEnteredCount < examStructure.vize.length) {
        badge.innerText = `${vizeEnteredCount} / ${examStructure.vize.length} Giriş`;
        badge.className = "text-[11px] sm:text-xs bg-slate-800 border border-slate-700 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-slate-300 font-medium";
        container.innerHTML = `
            <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 text-center space-y-2">
                <div class="inline-flex p-2 rounded-full bg-slate-200/60 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                </div>
                <h4 class="font-bold text-xs sm:text-sm text-slate-700 dark:text-slate-200">Vize Girişleri Bekleniyor</h4>
                <p class="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                    Resmi final stratejilerinin ve kişiselleştirilmiş geçme planının hesaplanabilmesi için 8 vize notunun da girilmesi gerekmektedir.
                </p>
            </div>
        `;
        return;
    }

    badge.innerText = "Aktif";
    badge.className = "text-[11px] sm:text-xs bg-emerald-950/70 border border-emerald-500/40 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-emerald-300 font-semibold";

    const targetOverall = 59.50;
    const baseFinalScore = 50.00;
    const baseFinalContribution = baseFinalScore * 0.60;
    const totalWithBase = vizeContrib + baseFinalContribution;
    const isBaseSufficient = totalWithBase >= targetOverall;

    const neededFinalContrib = Math.max(0, targetOverall - vizeContrib);
    const theoreticalFinalAvg = neededFinalContrib / 0.60;

    if (isBaseSufficient) {
        const projectedScore = Math.round(totalWithBase);
        container.innerHTML = `
            <div class="space-y-4">
                <div class="p-3.5 sm:p-4 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 space-y-2">
                    <div class="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs sm:text-sm">
                        <svg class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Asgari Mevzuat Tabanı (50.00) Yeterlidir
                    </div>
                    <p class="text-[11px] sm:text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        Vize katkınız (%40 etki ile <strong>${vizeContrib.toFixed(2)}</strong> puan) doğrultusunda tüm final bileşenlerinden yalnızca <strong>50.00</strong> almanız geçmeniz için yeterlidir.
                    </p>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-emerald-200/60 dark:border-emerald-900/40 text-[11px] text-slate-600 dark:text-slate-400">
                        <div>• <strong>50 Barajı Olmasaydı:</strong> Gereken Teorik Not: <strong>${Math.ceil(theoreticalFinalAvg)}</strong></div>
                        <div>• <strong>50-50-50 Tahmini Sonuç:</strong> <strong>${projectedScore}</strong> (Ham: ${totalWithBase.toFixed(2)})</div>
                    </div>
                </div>

                <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 gap-3">
                    <div class="text-xs text-slate-600 dark:text-slate-300">
                        <span class="font-bold text-slate-800 dark:text-slate-100">Önerilen Taban Giriş:</span> Tüm finallere taban not olan 50 uygulayın.
                    </div>
                    <button onclick="applyScenario(50, 50, 50)" class="shrink-0 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-sm active:scale-95">
                        Tabanı Uygula (50)
                    </button>
                </div>
            </div>
        `;
        return;
    }

    if (vizeContrib + 60.00 < targetOverall) {
        container.innerHTML = `
            <div class="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-800 dark:text-rose-300 space-y-1.5">
                <div class="font-bold flex items-center gap-1.5 text-xs sm:text-sm text-rose-900 dark:text-rose-200">
                    <svg class="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    Matematiksel Olarak Bütünleme Gerekmektedir
                </div>
                <p class="leading-relaxed">
                    Mevcut vize puanınız ile finallerin tamamından tam not (100) alınsa dahi dönem sonu başarı puanı en fazla <strong>${Math.round(vizeContrib + 60.00)}</strong> seviyesine ulaşabilmektedir.
                </p>
            </div>
        `;
        return;
    }

    const reqAvg = theoreticalFinalAvg;
    const customPlan = calculateCustomizedPlan(reqAvg, vizeContrib);

    let balancedScore = Math.max(50, Math.ceil(reqAvg));
    while (Math.round(vizeContrib + (balancedScore * 0.60)) < PASSING_GRADE && balancedScore < 100) {
        balancedScore++;
    }
    const balancedValid = balancedScore <= 100;

    const btnClass = (active) => active 
        ? 'bg-indigo-600 text-white font-bold shadow-sm' 
        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';

    container.innerHTML = `
        <div class="space-y-4">
            <div class="p-3.5 sm:p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 space-y-3">
                <div class="flex items-center justify-between">
                    <div>
                        <span class="text-xs font-bold text-slate-800 dark:text-slate-100 block">
                            Beceri Seviyenizi Belirleyin (Baraj: 50 Taban, 1-5: Öncelik)
                        </span>
                    </div>
                    <span class="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-900/50 shrink-0">
                        Asgari Final Ort: %${Math.ceil(reqAvg)}
                    </span>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <!-- L&R -->
                    <div class="p-2 sm:p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                        <div class="text-[11px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5 flex justify-between">
                            <span>L & R</span>
                            <span class="text-slate-400 font-normal">%50</span>
                        </div>
                        <div class="grid grid-cols-6 gap-1 text-[10px]">
                            <button onclick="setSkillLevel('lr', 'baraj')" class="py-1 rounded-md transition text-[9px] sm:text-[10px] ${btnClass(userSkills.lr === 'baraj')}">Baraj</button>
                            <button onclick="setSkillLevel('lr', 1)" class="py-1 rounded-md transition ${btnClass(userSkills.lr === 1)}">1</button>
                            <button onclick="setSkillLevel('lr', 2)" class="py-1 rounded-md transition ${btnClass(userSkills.lr === 2)}">2</button>
                            <button onclick="setSkillLevel('lr', 3)" class="py-1 rounded-md transition ${btnClass(userSkills.lr === 3)}">3</button>
                            <button onclick="setSkillLevel('lr', 4)" class="py-1 rounded-md transition ${btnClass(userSkills.lr === 4)}">4</button>
                            <button onclick="setSkillLevel('lr', 5)" class="py-1 rounded-md transition ${btnClass(userSkills.lr === 5)}">5</button>
                        </div>
                    </div>

                    <!-- Writing -->
                    <div class="p-2 sm:p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                        <div class="text-[11px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5 flex justify-between">
                            <span>Writing</span>
                            <span class="text-slate-400 font-normal">%25</span>
                        </div>
                        <div class="grid grid-cols-6 gap-1 text-[10px]">
                            <button onclick="setSkillLevel('wr', 'baraj')" class="py-1 rounded-md transition text-[9px] sm:text-[10px] ${btnClass(userSkills.wr === 'baraj')}">Baraj</button>
                            <button onclick="setSkillLevel('wr', 1)" class="py-1 rounded-md transition ${btnClass(userSkills.wr === 1)}">1</button>
                            <button onclick="setSkillLevel('wr', 2)" class="py-1 rounded-md transition ${btnClass(userSkills.wr === 2)}">2</button>
                            <button onclick="setSkillLevel('wr', 3)" class="py-1 rounded-md transition ${btnClass(userSkills.wr === 3)}">3</button>
                            <button onclick="setSkillLevel('wr', 4)" class="py-1 rounded-md transition ${btnClass(userSkills.wr === 4)}">4</button>
                            <button onclick="setSkillLevel('wr', 5)" class="py-1 rounded-md transition ${btnClass(userSkills.wr === 5)}">5</button>
                        </div>
                    </div>

                    <!-- Speaking -->
                    <div class="p-2 sm:p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                        <div class="text-[11px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5 flex justify-between">
                            <span>Speaking</span>
                            <span class="text-slate-400 font-normal">%25</span>
                        </div>
                        <div class="grid grid-cols-6 gap-1 text-[10px]">
                            <button onclick="setSkillLevel('sp', 'baraj')" class="py-1 rounded-md transition text-[9px] sm:text-[10px] ${btnClass(userSkills.sp === 'baraj')}">Baraj</button>
                            <button onclick="setSkillLevel('sp', 1)" class="py-1 rounded-md transition ${btnClass(userSkills.sp === 1)}">1</button>
                            <button onclick="setSkillLevel('sp', 2)" class="py-1 rounded-md transition ${btnClass(userSkills.sp === 2)}">2</button>
                            <button onclick="setSkillLevel('sp', 3)" class="py-1 rounded-md transition ${btnClass(userSkills.sp === 3)}">3</button>
                            <button onclick="setSkillLevel('sp', 4)" class="py-1 rounded-md transition ${btnClass(userSkills.sp === 4)}">4</button>
                            <button onclick="setSkillLevel('sp', 5)" class="py-1 rounded-md transition ${btnClass(userSkills.sp === 5)}">5</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 1. SIRADA: Kişiselleştirilmiş Hedef Planı -->
            <div class="p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border-2 border-indigo-500/30 dark:border-indigo-500/40 space-y-3">
                <div class="flex items-center justify-between">
                    <div>
                        <span class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">1. Sıra (Öncelikli Model)</span>
                        <h3 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">Kişiselleştirilmiş Hedef Planınız</h3>
                    </div>
                    ${customPlan.valid ? `
                        <button onclick="applyScenario(${customPlan.lr}, ${customPlan.wr}, ${customPlan.sp})" class="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm active:scale-95">
                            Plana Göre Doldur
                        </button>
                    ` : customPlan.allBarajBlocked ? `
                        <span class="text-amber-700 dark:text-amber-300 font-bold text-xs bg-amber-100 dark:bg-amber-950/60 px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-900/50">Tümü Baraj Olamaz</span>
                    ` : `
                        <span class="text-rose-500 font-bold text-xs bg-rose-100 dark:bg-rose-950/60 px-2.5 py-1 rounded-md">Mümkün Değil (>100)</span>
                    `}
                </div>

                ${customPlan.allBarajBlocked ? `
                    <p class="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-lg border border-amber-200 dark:border-amber-900/40 leading-relaxed">
                        Tüm sınavları 'Baraj' (50) olarak seçtiğinizde genel ortalama 60 sınırını geçememektedir. Lütfen en az bir sınavı 1-5 aralığında hedefleyin.
                    </p>
                ` : `
                    <div class="grid grid-cols-3 gap-2 text-center">
                        <div class="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                            <div class="flex items-center justify-center gap-1 mb-0.5">
                                <span class="text-[10px] text-slate-500 dark:text-slate-400 font-medium">L & R (%50)</span>
                                ${userSkills.lr === 'baraj' ? '<span class="text-[9px] px-1 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-semibold">Baraj</span>' : ''}
                            </div>
                            <span class="text-lg sm:text-xl font-extrabold ${customPlan.lr > 100 ? 'text-rose-500' : 'text-indigo-950 dark:text-indigo-100'}">${customPlan.lr}</span>
                        </div>
                        <div class="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                            <div class="flex items-center justify-center gap-1 mb-0.5">
                                <span class="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Writing (%25)</span>
                                ${userSkills.wr === 'baraj' ? '<span class="text-[9px] px-1 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-semibold">Baraj</span>' : ''}
                            </div>
                            <span class="text-lg sm:text-xl font-extrabold ${customPlan.wr > 100 ? 'text-rose-500' : 'text-indigo-950 dark:text-indigo-100'}">${customPlan.wr}</span>
                        </div>
                        <div class="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                            <div class="flex items-center justify-center gap-1 mb-0.5">
                                <span class="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Speaking (%25)</span>
                                ${userSkills.sp === 'baraj' ? '<span class="text-[9px] px-1 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-semibold">Baraj</span>' : ''}
                            </div>
                            <span class="text-lg sm:text-xl font-extrabold ${customPlan.sp > 100 ? 'text-rose-500' : 'text-indigo-950 dark:text-indigo-100'}">${customPlan.sp}</span>
                        </div>
                    </div>
                `}
            </div>

            <!-- 2. SIRADA: Alternatif Dengeli Model -->
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr class="border-b border-slate-200 dark:border-slate-800 text-[10px] sm:text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                            <th class="py-2 px-2">Alternatif Model</th>
                            <th class="py-2 px-2 text-center">L&R</th>
                            <th class="py-2 px-2 text-center">Writing</th>
                            <th class="py-2 px-2 text-center">Speaking</th>
                            <th class="py-2 px-2 text-right">İşlem</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-200">
                        <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                            <td class="py-2.5 px-2 font-semibold">
                                Dengeli Dağılım Modeli
                                <span class="block text-[10px] font-normal text-slate-400">Tüm sınavlara eşit hedef</span>
                            </td>
                            <td class="py-2.5 px-2 text-center font-bold text-slate-800 dark:text-slate-100">${balancedScore}</td>
                            <td class="py-2.5 px-2 text-center font-bold text-slate-800 dark:text-slate-100">${balancedScore}</td>
                            <td class="py-2.5 px-2 text-center font-bold text-slate-800 dark:text-slate-100">${balancedScore}</td>
                            <td class="py-2.5 px-2 text-right">
                                ${balancedValid ? `
                                    <button onclick="applyScenario(${balancedScore}, ${balancedScore}, ${balancedScore})" class="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 rounded-md text-[11px] font-bold transition">
                                        Uygula
                                    </button>
                                ` : `
                                    <span class="text-rose-500 font-bold text-[10px]">>100</span>
                                `}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function applyScenario(lr, wr, sp) {
    const lrInput = document.getElementById('input-f_lr');
    const wrInput = document.getElementById('input-f_wr');
    const spInput = document.getElementById('input-f_sp');

    if (lrInput) lrInput.value = lr;
    if (wrInput) wrInput.value = wr;
    if (spInput) spInput.value = sp;

    const bulkFinalInput = document.getElementById('bulk-final-input');
    if (bulkFinalInput) bulkFinalInput.value = '';

    [lrInput, wrInput, spInput].forEach(inp => {
        if (inp) applyInputStyle(inp);
    });

    calculateGrades();
    saveAllInputsToStorage();
    scrollToResult();
}

// ====================== YEREL DEPOLAMA (STORAGE) SENKRONİZASYONU ======================

function saveAllInputsToStorage() {
    const data = {
        vize: {},
        final: {},
        studentName: document.getElementById('student-name-input')?.value || ''
    };

    examStructure.vize.forEach(item => {
        const el = document.getElementById(`input-${item.id}`);
        if (el && el.value !== '') data.vize[item.id] = el.value;
    });

    examStructure.final.forEach(item => {
        const el = document.getElementById(`input-${item.id}`);
        if (el && el.value !== '') data.final[item.id] = el.value;
    });

    SafeStorage.set(STORAGE_CACHE_KEY, JSON.stringify(data));
}

function loadAllInputsFromStorage() {
    const raw = SafeStorage.get(STORAGE_CACHE_KEY);
    if (!raw) return;

    try {
        const data = JSON.parse(raw);
        if (data.vize) {
            examStructure.vize.forEach(item => {
                if (data.vize[item.id] !== undefined) {
                    const el = document.getElementById(`input-${item.id}`);
                    if (el) { el.value = data.vize[item.id]; applyInputStyle(el); }
                }
            });
        }
        if (data.final) {
            examStructure.final.forEach(item => {
                if (data.final[item.id] !== undefined) {
                    const el = document.getElementById(`input-${item.id}`);
                    if (el) { el.value = data.final[item.id]; applyInputStyle(el); }
                }
            });
        }
        if (data.studentName) {
            const nameInput = document.getElementById('student-name-input');
            if (nameInput) nameInput.value = data.studentName;
        }
    } catch (e) {}
}

function resetGrades() {
    [...examStructure.vize, ...examStructure.final].forEach(item => {
        const input = document.getElementById(`input-${item.id}`);
        if (input) { 
            input.value = ''; 
            applyInputStyle(input); 
        }
    });
    const bVize = document.getElementById('bulk-vize-input');
    const bFinal = document.getElementById('bulk-final-input');
    const sName = document.getElementById('student-name-input');
    if (bVize) bVize.value = '';
    if (bFinal) bFinal.value = '';
    if (sName) sName.value = '';

    SafeStorage.remove(STORAGE_CACHE_KEY);
    calculateGrades();
}