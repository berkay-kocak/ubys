const STORAGE_KEY = "iskur_genclik_puantaj_v1";
            const BACKUP_STORAGE_KEY = "iskur_genclik_puantaj_backup_v1";
            const MANUAL_STORAGE_KEY = "iskur_genclik_manual_v1";
            const STUDENT_NAME_STORAGE_KEY = "iskur_genclik_student_name_v1";
            const TARGET_HOURS = 22.5;
            const MAX_DAILY_HOURS = 10;

            const TIME_SLOTS = [
                "08.00-09.00",
                "09.00-10.00",
                "10.00-11.00",
                "11.00-12.00",
                "12.00-13.00",
                "13.00-14.00",
                "14.00-15.00",
                "15.00-16.00",
                "16.00-17.00",
                "17.00-18.00"
            ];

            const DAY_NAMES = [
                "Pazartesi",
                "Salı",
                "Çarşamba",
                "Perşembe",
                "Cuma",
                "Cumartesi"
            ];

            const MONTH_NAMES = [
                "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
                "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
            ];

            function getMonday(date) {
                const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                return new Date(d.setDate(diff));
            }

            function addDays(date, days) {
                const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                d.setDate(d.getDate() + days);
                return d;
            }

            function toISODate(date) {
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, "0");
                const d = String(date.getDate()).padStart(2, "0");
                return `${y}-${m}-${d}`;
            }

            function parseISODate(str) {
                const parts = str.split("-").map(Number);
                return new Date(parts[0], parts[1] - 1, parts[2]);
            }

            function isSameDate(d1, d2) {
                return (
                    d1.getFullYear() === d2.getFullYear() &&
                    d1.getMonth() === d2.getMonth() &&
                    d1.getDate() === d2.getDate()
                );
            }

            function formatShortDate(date) {
                return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
            }

            function formatRangeBadge(monday) {
                const saturday = addDays(monday, 5);
                if (monday.getMonth() === saturday.getMonth()) {
                    return `${monday.getDate()} – ${saturday.getDate()} ${MONTH_NAMES[monday.getMonth()]} ${saturday.getFullYear()}`;
                }
                return `${formatShortDate(monday)} – ${formatShortDate(saturday)} ${saturday.getFullYear()}`;
            }

            function requestPersistentStorage() {
                try {
                    if (navigator.storage && typeof navigator.storage.persist === "function") {
                        navigator.storage.persist();
                    }
                } catch (e) {}
            }

            let currentMonday = getMonday(new Date());
            let allWeeksData = loadAllData();
            let allManualData = loadAllManualData();
            let plannerSelectedDays = new Set();

            function loadAllData() {
                try {
                    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(BACKUP_STORAGE_KEY);
                    if (!raw) return {};
                    const parsed = JSON.parse(raw);
                    return typeof parsed === "object" && parsed !== null ? parsed : {};
                } catch (e) {
                    return {};
                }
            }

            function loadAllManualData() {
                try {
                    const raw = localStorage.getItem(MANUAL_STORAGE_KEY);
                    if (!raw) return {};
                    const parsed = JSON.parse(raw);
                    return typeof parsed === "object" && parsed !== null ? parsed : {};
                } catch (e) {
                    return {};
                }
            }

            function showToast(text, type = "success") {
                if (window.SbtuAuth && typeof window.SbtuAuth.showToast === "function") {
                    window.SbtuAuth.showToast(text, type);
                }
            }

            function updateStorageStatusText() {
                const statusEl = document.getElementById("storage-status-text");
                if (!statusEl) return;
                const recordedWeeks = Object.keys(allWeeksData).filter((k) => {
                    const m = allWeeksData[k];
                    const hasSlots = Array.isArray(m) && m.some((day) => Array.isArray(day) && day.some((v) => Number(v) > 0));
                    const man = allManualData[k];
                    const hasManual = Array.isArray(man) && man.some((v) => v !== null && v !== "" && Number(v) > 0);
                    return hasSlots || hasManual;
                }).length;

                const user = window.SbtuAuth && typeof window.SbtuAuth.getUser === "function" ? window.SbtuAuth.getUser() : null;
                if (user) {
                    statusEl.textContent = `Bulut hesabına bağlı (${user.email}) • ${recordedWeeks} hafta eşitlendi`;
                } else {
                    statusEl.textContent = recordedWeeks > 0
                        ? `Tarayıcıda kayıtlı • ${recordedWeeks} hafta saklanıyor (Bulut için giriş yapabilirsiniz)`
                        : "Tarayıcıda kalıcı olarak kayıtlı • Bulut yedekleme için Giriş Yapın";
                }
            }

            function saveAllData() {
                try {
                    const serialized = JSON.stringify(allWeeksData);
                    localStorage.setItem(STORAGE_KEY, serialized);
                    localStorage.setItem(BACKUP_STORAGE_KEY, serialized);
                    localStorage.setItem(MANUAL_STORAGE_KEY, JSON.stringify(allManualData));
                    updateStorageStatusText();
                    if (window.SbtuAuth && typeof window.SbtuAuth.markIskurDirty === "function") {
                        window.SbtuAuth.markIskurDirty();
                    }
                } catch (e) {
                    showToast("Tarayıcı depolama alanına kaydedilemedi!", "error");
                }
            }

            function createEmptyMatrix() {
                return Array.from({ length: 6 }, () => Array(TIME_SLOTS.length).fill(0));
            }

            function getWeekMatrix(weekKey) {
                if (!allWeeksData[weekKey] || !Array.isArray(allWeeksData[weekKey])) {
                    allWeeksData[weekKey] = createEmptyMatrix();
                } else {
                    for (let d = 0; d < 6; d++) {
                        if (!Array.isArray(allWeeksData[weekKey][d])) {
                            allWeeksData[weekKey][d] = Array(TIME_SLOTS.length).fill(0);
                        } else if (allWeeksData[weekKey][d].length < TIME_SLOTS.length) {
                            while (allWeeksData[weekKey][d].length < TIME_SLOTS.length) {
                                allWeeksData[weekKey][d].push(0);
                            }
                        }
                    }
                }
                return allWeeksData[weekKey];
            }

            function getWeekManualArray(weekKey) {
                if (!allManualData[weekKey] || !Array.isArray(allManualData[weekKey]) || allManualData[weekKey].length !== 6) {
                    allManualData[weekKey] = Array(6).fill(null);
                }
                return allManualData[weekKey];
            }

            function getEffectiveDayHours(weekKey, dayIdx) {
                const manualArr = getWeekManualArray(weekKey);
                if (manualArr[dayIdx] !== null && manualArr[dayIdx] !== "" && !isNaN(Number(manualArr[dayIdx]))) {
                    return Number(manualArr[dayIdx]);
                }
                const matrix = getWeekMatrix(weekKey);
                return matrix[dayIdx].reduce((sum, val) => sum + (Number(val) || 0), 0);
            }

            function formatHoursNumber(val) {
                return Number.isInteger(val) ? String(val) : val.toFixed(1).replace(/\.0$/, "");
            }

            function formatHoursAndMinutes(totalHours) {
                const totalMins = Math.round(totalHours * 60);
                const h = Math.floor(totalMins / 60);
                const m = totalMins % 60;
                return `${h} Saat ${m} Dk`;
            }

            function openActionModal({
                title,
                message,
                confirmText = "Onayla",
                cancelText = "Vazgeç",
                showCancel = true,
                danger = false,
                showStudentInput = false,
                onConfirm = null
            }) {
                const modalEl = document.getElementById("action-modal");
                const titleEl = document.getElementById("modal-title");
                const msgEl = document.getElementById("modal-message");
                const confirmBtn = document.getElementById("modal-confirm-btn");
                const cancelBtn = document.getElementById("modal-cancel-btn");
                const iconBox = document.getElementById("modal-icon-box");
                const studentBox = document.getElementById("modal-student-name-box");
                const studentInput = document.getElementById("modal-student-name-input");

                titleEl.textContent = title;
                msgEl.textContent = message;
                confirmBtn.textContent = confirmText;
                cancelBtn.textContent = cancelText;

                if (showCancel) {
                    cancelBtn.classList.remove("hidden");
                } else {
                    cancelBtn.classList.add("hidden");
                }

                if (danger) {
                    confirmBtn.className = "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition";
                    iconBox.className = "p-2.5 bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-100 dark:border-rose-900/50 shrink-0";
                } else {
                    confirmBtn.className = "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white bg-[#0F4C81] hover:bg-[#0c3d68] shadow-sm transition";
                    iconBox.className = "p-2.5 bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-300 rounded-xl border border-indigo-100 dark:border-indigo-900/50 shrink-0";
                }

                if (showStudentInput) {
                    studentBox.classList.remove("hidden");
                    try {
                        studentInput.value = localStorage.getItem(STUDENT_NAME_STORAGE_KEY) || "";
                    } catch (e) {
                        studentInput.value = "";
                    }
                } else {
                    studentBox.classList.add("hidden");
                }

                modalEl.classList.remove("hidden");
                modalEl.classList.add("flex");

                if (showStudentInput) {
                    setTimeout(() => studentInput.focus(), 50);
                }

                const closeModal = () => {
                    modalEl.classList.add("hidden");
                    modalEl.classList.remove("flex");
                    confirmBtn.onclick = null;
                    cancelBtn.onclick = null;
                };

                cancelBtn.onclick = closeModal;
                confirmBtn.onclick = () => {
                    const enteredName = showStudentInput ? studentInput.value.trim() : null;
                    closeModal();
                    if (typeof onConfirm === "function") {
                        onConfirm(enteredName);
                    }
                };
            }

            function renderWeek() {
                const weekKey = toISODate(currentMonday);
                const matrix = getWeekMatrix(weekKey);
                const manualArr = getWeekManualArray(weekKey);
                const today = new Date();
                const rangeText = formatRangeBadge(currentMonday);

                document.getElementById("date-picker").value = weekKey;
                document.getElementById("week-range-badge").textContent = rangeText;
                const printRangeEl = document.getElementById("print-week-range");
                if (printRangeEl) printRangeEl.textContent = rangeText;

                for (let d = 0; d < 6; d++) {
                    const dayDate = addDays(currentMonday, d);
                    const isToday = isSameDate(dayDate, today);
                    const th = document.getElementById(`day-header-${d}`);
                    const manualVal = manualArr[d];
                    const hasManual = manualVal !== null && manualVal !== "";

                    th.className = `py-2.5 px-2 text-center border-r border-slate-200 dark:border-zinc-700 last:border-r-0 ${isToday ? "bg-indigo-50/90 dark:bg-indigo-950/60" : ""}`;
                    th.innerHTML = `
                        <div class="text-xs font-extrabold uppercase tracking-wide ${isToday ? "text-indigo-700 dark:text-indigo-300" : "text-slate-800 dark:text-zinc-200"}">
                            ${DAY_NAMES[d]}
                        </div>
                        <div class="text-[11px] font-medium ${isToday ? "text-indigo-600 dark:text-indigo-400 font-semibold" : "text-slate-500 dark:text-zinc-400"} mt-0.5">
                            ${formatShortDate(dayDate)}${isToday ? ' <span class="no-print">• Bugün</span>' : ""}
                        </div>
                        <div class="no-print mt-1.5 flex items-center justify-center gap-1">
                            <input
                                type="number"
                                step="0.5"
                                min="0"
                                max="10"
                                data-manual-day="${d}"
                                value="${hasManual ? manualVal : ""}"
                                placeholder="Elle (s)"
                                title="Bu gün için doğrudan saat girin (0-10 saat). Girildiğinde tablo kilitlenir."
                                class="manual-day-input w-16 px-1.5 py-0.5 text-center text-[11px] font-bold rounded-lg border ${hasManual ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-200" : "border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200"} focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                            >
                            ${hasManual ? `<button type="button" data-clear-manual="${d}" title="Elle girişi kaldır ve tabloyu aç" class="w-5 h-5 inline-flex items-center justify-center rounded-md bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 hover:bg-rose-200 text-xs font-bold leading-none">×</button>` : ""}
                        </div>
                    `;
                }

                const tbody = document.getElementById("schedule-tbody");
                tbody.innerHTML = "";

                TIME_SLOTS.forEach((slotLabel, sIdx) => {
                    const tr = document.createElement("tr");
                    tr.className = "hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors";

                    const timeTd = document.createElement("td");
                    timeTd.className = "py-2 px-3.5 font-semibold text-xs sm:text-sm text-slate-700 dark:text-zinc-300 whitespace-nowrap sticky left-0 bg-white dark:bg-zinc-900 z-10 border-r border-slate-200 dark:border-zinc-800";
                    timeTd.textContent = slotLabel;
                    tr.appendChild(timeTd);

                    for (let dIdx = 0; dIdx < 6; dIdx++) {
                        const val = Number(matrix[dIdx][sIdx]) || 0;
                        const dayDate = addDays(currentMonday, dIdx);
                        const isToday = isSameDate(dayDate, today);
                        const isLocked = manualArr[dIdx] !== null && manualArr[dIdx] !== "";

                        const td = document.createElement("td");
                        td.className = `p-1.5 text-center border-r border-slate-100 dark:border-zinc-800 last:border-r-0 ${isToday ? "bg-indigo-50/40 dark:bg-indigo-950/20" : ""}`;

                        const btn = document.createElement("button");
                        btn.type = "button";
                        btn.dataset.day = String(dIdx);
                        btn.dataset.slot = String(sIdx);
                        btn.disabled = isLocked;
                        btn.setAttribute("aria-label", `${DAY_NAMES[dIdx]} ${slotLabel}`);

                        applyCellVisuals(btn, val, isLocked, sIdx);
                        td.appendChild(btn);
                        tr.appendChild(td);
                    }

                    tbody.appendChild(tr);
                });

                updateSummaries();
            }

            function applyCellVisuals(btn, val, isLocked = false, sIdx = 0) {
                btn.className = "slot-btn group relative w-full min-h-[42px] px-2 py-1.5 rounded-xl font-semibold text-xs transition-all duration-150 flex items-center justify-center select-none";

                if (isLocked) {
                    btn.classList.add(
                        "slot-btn-locked",
                        "bg-slate-100/80",
                        "dark:bg-zinc-800/40",
                        "text-slate-400",
                        "dark:text-slate-600",
                        "border",
                        "border-dashed",
                        "border-slate-300",
                        "dark:border-zinc-700/70",
                        "cursor-not-allowed"
                    );
                    btn.innerHTML = sIdx === 4
                        ? `<span class="text-[11px] font-bold text-indigo-600/80 dark:text-indigo-400/80">Elle Giriş</span>`
                        : `<span class="text-[11px] opacity-50">—</span>`;
                    return;
                }

                btn.classList.add("cursor-pointer", "focus:outline-none", "focus:ring-2", "focus:ring-indigo-400");

                if (val === 1) {
                    btn.classList.add(
                        "slot-btn-full",
                        "bg-emerald-600",
                        "hover:bg-emerald-700",
                        "text-white",
                        "shadow-sm"
                    );
                    btn.innerHTML = `
                        <span>1 Saat</span>
                        <span data-half-trigger="true" title="Yarım saate (0.5) çevir" class="no-print absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md bg-emerald-800/50 hover:bg-emerald-900 text-emerald-100 text-[10px] font-bold flex items-center justify-center">½</span>
                    `;
                } else if (val === 0.5) {
                    btn.classList.add(
                        "slot-btn-half",
                        "bg-amber-500",
                        "hover:bg-amber-600",
                        "text-white",
                        "shadow-sm"
                    );
                    btn.innerHTML = `
                        <span>0.5 Saat</span>
                        <span data-half-trigger="true" title="Yarım saati kaldır" class="no-print absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md bg-amber-700/45 hover:bg-amber-800 text-amber-50 text-[10px] font-bold flex items-center justify-center">½</span>
                    `;
                } else {
                    btn.classList.add(
                        "slot-btn-empty",
                        "bg-slate-50",
                        "dark:bg-zinc-800/80",
                        "hover:bg-slate-100",
                        "dark:hover:bg-slate-800",
                        "text-slate-400",
                        "dark:text-zinc-500",
                        "border",
                        "border-slate-200",
                        "dark:border-zinc-700"
                    );
                    btn.innerHTML = `
                        <span class="group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">+</span>
                        <span data-half-trigger="true" title="Yarım saat (0.5) işaretle" class="no-print opacity-60 sm:opacity-0 group-hover:opacity-100 absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-amber-500 hover:text-white text-slate-600 dark:text-zinc-300 text-[10px] font-bold flex items-center justify-center transition-all">½</span>
                    `;
                }
            }

            function updateSummaries() {
                const weekKey = toISODate(currentMonday);
                const manualArr = getWeekManualArray(weekKey);
                let weeklyTotal = 0;

                for (let d = 0; d < 6; d++) {
                    const dayHours = getEffectiveDayHours(weekKey, d);
                    const hasManual = manualArr[d] !== null && manualArr[d] !== "";
                    weeklyTotal += dayHours;

                    const dayTotalCell = document.getElementById(`day-total-${d}`);
                    dayTotalCell.textContent = hasManual
                        ? `${formatHoursNumber(dayHours)} Saat (Manuel)`
                        : `${formatHoursNumber(dayHours)} Saat`;
                    dayTotalCell.className = `py-3 px-2 text-center text-xs sm:text-sm border-r border-slate-200 dark:border-zinc-700 last:border-r-0 ${dayHours > 0 ? "text-indigo-700 dark:text-indigo-400 font-extrabold" : "text-slate-500 dark:text-zinc-500 font-semibold"}`;
                }

                const formattedWeekly = formatHoursNumber(weeklyTotal);
                document.getElementById("weekly-total-hours").textContent = formattedWeekly;
                document.getElementById("weekly-total-hm").textContent = `(${formatHoursAndMinutes(weeklyTotal)})`;
                document.getElementById("print-total-hours-text").textContent = `${formattedWeekly} Saat (${formatHoursAndMinutes(weeklyTotal)})`;

                const progressBar = document.getElementById("quota-progress-bar");
                const quotaBadge = document.getElementById("quota-badge");
                const pct = Math.min(100, Math.round((weeklyTotal / TARGET_HOURS) * 100));
                progressBar.style.width = `${pct}%`;

                const diff = TARGET_HOURS - weeklyTotal;
                if (diff > 0) {
                    progressBar.className = "h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300";
                    quotaBadge.className = "text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200/70 dark:border-zinc-700";
                    quotaBadge.textContent = `Kalan: ${formatHoursNumber(diff)} Saat`;
                } else if (diff === 0) {
                    progressBar.className = "h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300";
                    quotaBadge.className = "text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800";
                    quotaBadge.textContent = "22.5 Saat Tamamlandı!";
                } else {
                    progressBar.className = "h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-300";
                    quotaBadge.className = "text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800";
                    quotaBadge.textContent = `22.5 Saat Aşıldı (+${formatHoursNumber(Math.abs(diff))} s)`;
                }

                updateStorageStatusText();
            }

            // 22.5 SAAT HEDEF PROGRAMI
            function buildDiscreteDistribution(remainingHours, dayIndices, weekKey) {
                const stepsNeeded = Math.round(remainingHours * 2);
                const plan = dayIndices.map((dayIdx) => {
                    const existing = getEffectiveDayHours(weekKey, dayIdx);
                    const capHours = Math.max(0, MAX_DAILY_HOURS - existing);
                    return {
                        dayIdx,
                        existing,
                        capSteps: Math.round(capHours * 2),
                        addSteps: 0
                    };
                });

                const totalCapSteps = plan.reduce((acc, item) => acc + item.capSteps, 0);
                if (totalCapSteps < stepsNeeded) {
                    return { possible: false, totalCapHours: totalCapSteps / 2, plan };
                }

                let left = stepsNeeded;
                while (left > 0) {
                    let progressed = false;
                    for (let i = 0; i < plan.length && left > 0; i++) {
                        if (plan[i].addSteps < plan[i].capSteps) {
                            plan[i].addSteps += 1;
                            left -= 1;
                            progressed = true;
                        }
                    }
                    if (!progressed) break;
                }

                return { possible: true, totalCapHours: totalCapSteps / 2, plan };
            }

            function renderPlannerDaysAndResult() {
                const weekKey = toISODate(currentMonday);
                const gridEl = document.getElementById("planner-days-grid");
                const resultBox = document.getElementById("planner-result-box");

                let weeklyTotal = 0;
                for (let d = 0; d < 6; d++) {
                    weeklyTotal += getEffectiveDayHours(weekKey, d);
                }
                const remaining = Math.max(0, TARGET_HOURS - weeklyTotal);

                document.getElementById("planner-current-hours").textContent = `${formatHoursNumber(weeklyTotal)} Saat`;
                document.getElementById("planner-remaining-hours").textContent = `${formatHoursNumber(remaining)} Saat`;

                gridEl.innerHTML = "";
                for (let d = 0; d < 6; d++) {
                    const dayDate = addDays(currentMonday, d);
                    const isChecked = plannerSelectedDays.has(d);
                    const existing = getEffectiveDayHours(weekKey, d);
                    const freeCap = Math.max(0, MAX_DAILY_HOURS - existing);

                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.dataset.planDay = String(d);
                    btn.className = isChecked
                        ? "flex items-center justify-between px-3 py-2.5 rounded-xl border-2 border-indigo-600 bg-indigo-50 dark:bg-indigo-950/70 text-indigo-900 dark:text-indigo-200 text-left transition"
                        : "flex items-center justify-between px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition";

                    btn.innerHTML = `
                        <div>
                            <div class="text-xs font-extrabold">${DAY_NAMES[d]}</div>
                            <div class="text-[10px] opacity-80">${formatShortDate(dayDate)} • Boş: ${formatHoursNumber(freeCap)}s</div>
                        </div>
                        <span class="w-4 h-4 rounded flex items-center justify-center text-[11px] font-bold ${isChecked ? "bg-indigo-600 text-white" : "border border-slate-400 dark:border-slate-500"}">
                            ${isChecked ? "✓" : ""}
                        </span>
                    `;
                    gridEl.appendChild(btn);
                }

                if (remaining <= 0) {
                    resultBox.innerHTML = `
                        <div class="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                            🎉 Tebrikler! Bu hafta 22.5 saat hedefine zaten ulaştınız.
                        </div>
                        <p class="text-xs text-slate-600 dark:text-zinc-400 mt-1">
                            Ekstra gün planlamanıza gerek kalmadı.
                        </p>
                    `;
                    return;
                }

                const sortedDays = Array.from(plannerSelectedDays).sort((a, b) => a - b);
                if (sortedDays.length === 0) {
                    resultBox.innerHTML = `
                        <div class="text-sm font-bold text-amber-700 dark:text-amber-300">
                            ⚠️ Lütfen yukarıdan gelebileceğiniz en az 1 gün seçin.
                        </div>
                    `;
                    return;
                }

                const dist = buildDiscreteDistribution(remaining, sortedDays, weekKey);
                if (!dist.possible) {
                    resultBox.innerHTML = `
                        <div class="text-sm font-bold text-rose-700 dark:text-rose-300">
                            ⚠️ Seçtiğiniz günler 22.5 saati tamamlamaya yetmiyor!
                        </div>
                        <p class="text-xs text-slate-600 dark:text-zinc-400 mt-1">
                            08.00–18.00 (günlük maks. 10 saat) kuralına göre seçtiğiniz günlerde en fazla <strong>${formatHoursNumber(dist.totalCapHours)} saat</strong> daha çalışabilirsiniz. Kalan <strong>${formatHoursNumber(remaining)} saat</strong> için başka günler de ekleyin.
                        </p>
                    `;
                    return;
                }

                const activeItems = dist.plan.filter((item) => item.addSteps > 0);
                const minAdd = Math.min(...activeItems.map((i) => i.addSteps / 2));
                const maxAdd = Math.max(...activeItems.map((i) => i.addSteps / 2));
                const avgText = minAdd === maxAdd
                    ? `günde ${formatHoursNumber(minAdd)} saat`
                    : `günde ${formatHoursNumber(minAdd)} – ${formatHoursNumber(maxAdd)} saat`;

                const rowsHtml = dist.plan.map((item) => {
                    const addHours = item.addSteps / 2;
                    const newTotal = item.existing + addHours;
                    const dayDate = addDays(currentMonday, item.dayIdx);
                    return `
                        <div class="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-white/85 dark:bg-zinc-900/80 border border-indigo-200/70 dark:border-indigo-800/50 text-xs">
                            <div>
                                <span class="font-bold text-slate-800 dark:text-zinc-100">${DAY_NAMES[item.dayIdx]}</span>
                                <span class="text-slate-500 dark:text-zinc-400 ml-1">(${formatShortDate(dayDate)})</span>
                            </div>
                            <div class="text-right">
                                <span class="font-extrabold text-indigo-700 dark:text-indigo-300">+${formatHoursNumber(addHours)} Saat</span>
                                <span class="text-[11px] text-slate-500 dark:text-zinc-400 ml-1">(Gün toplamı: ${formatHoursNumber(newTotal)}s)</span>
                            </div>
                        </div>
                    `;
                }).join("");

                resultBox.innerHTML = `
                    <div class="flex flex-wrap items-center justify-between gap-1 mb-2.5">
                        <span class="text-xs font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                            Önerilen Günlük Dağılım (${sortedDays.length} Gün)
                        </span>
                        <span class="text-xs font-extrabold text-indigo-700 dark:text-indigo-300">
                            Ortalama ${avgText}
                        </span>
                    </div>
                    <div class="space-y-1.5">
                        ${rowsHtml}
                    </div>
                `;
            }

            function openPlannerModal() {
                const today = new Date();
                plannerSelectedDays.clear();
                for (let d = 0; d < 6; d++) {
                    const dayDate = addDays(currentMonday, d);
                    const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate());
                    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    if (dayStart >= todayStart) {
                        plannerSelectedDays.add(d);
                    }
                }
                if (plannerSelectedDays.size === 0) {
                    for (let d = 0; d < 6; d++) plannerSelectedDays.add(d);
                }

                renderPlannerDaysAndResult();
                const modalEl = document.getElementById("planner-modal");
                modalEl.classList.remove("hidden");
                modalEl.classList.add("flex");
            }

            function closePlannerModal() {
                const modalEl = document.getElementById("planner-modal");
                modalEl.classList.add("hidden");
                modalEl.classList.remove("flex");
            }

            // TABLO ETKİLEŞİMLERİ
            const tbody = document.getElementById("schedule-tbody");
            const thead = document.querySelector("#puantaj-table thead");

            thead.addEventListener("input", (e) => {
                const input = e.target.closest(".manual-day-input");
                if (!input) return;

                const dIdx = Number(input.dataset.manualDay);
                const weekKey = toISODate(currentMonday);
                const manualArr = getWeekManualArray(weekKey);
                const raw = input.value.trim();

                if (raw === "") {
                    manualArr[dIdx] = null;
                    saveAllData();
                    renderWeek();
                    return;
                }

                let num = Number(raw);
                if (isNaN(num)) return;
                if (num < 0) num = 0;
                if (num > 10) {
                    num = 10;
                    input.value = "10";
                }

                manualArr[dIdx] = num;
                saveAllData();
                renderWeek();

                const restoredInput = document.querySelector(`.manual-day-input[data-manual-day="${dIdx}"]`);
                if (restoredInput) {
                    restoredInput.focus();
                    const len = restoredInput.value.length;
                    restoredInput.setSelectionRange(len, len);
                }
            });

            thead.addEventListener("click", (e) => {
                const clearBtn = e.target.closest("[data-clear-manual]");
                if (!clearBtn) return;

                const dIdx = Number(clearBtn.dataset.clearManual);
                const weekKey = toISODate(currentMonday);
                const manualArr = getWeekManualArray(weekKey);
                manualArr[dIdx] = null;
                saveAllData();
                renderWeek();
                showToast(`${DAY_NAMES[dIdx]} günü elle girişi kaldırıldı.`);
            });

            tbody.addEventListener("click", (e) => {
                const btn = e.target.closest("button[data-day]");
                if (!btn || btn.disabled) return;

                const dIdx = Number(btn.dataset.day);
                const sIdx = Number(btn.dataset.slot);
                const weekKey = toISODate(currentMonday);
                const matrix = getWeekMatrix(weekKey);
                const currentVal = Number(matrix[dIdx][sIdx]) || 0;

                const isHalfTrigger = Boolean(e.target.closest("[data-half-trigger]"));

                if (isHalfTrigger) {
                    matrix[dIdx][sIdx] = currentVal === 0.5 ? 0 : 0.5;
                } else {
                    matrix[dIdx][sIdx] = currentVal === 1 ? 0 : 1;
                }

                applyCellVisuals(btn, matrix[dIdx][sIdx], false, sIdx);
                saveAllData();
                updateSummaries();
            });

            tbody.addEventListener("contextmenu", (e) => {
                const btn = e.target.closest("button[data-day]");
                if (!btn || btn.disabled) return;
                e.preventDefault();

                const dIdx = Number(btn.dataset.day);
                const sIdx = Number(btn.dataset.slot);
                const weekKey = toISODate(currentMonday);
                const matrix = getWeekMatrix(weekKey);
                const currentVal = Number(matrix[dIdx][sIdx]) || 0;

                matrix[dIdx][sIdx] = currentVal === 0.5 ? 0 : 0.5;
                applyCellVisuals(btn, matrix[dIdx][sIdx], false, sIdx);
                saveAllData();
                updateSummaries();
            });

            // Hafta Geçişleri
            document.getElementById("prev-week-btn").addEventListener("click", () => {
                currentMonday = addDays(currentMonday, -7);
                renderWeek();
            });

            document.getElementById("next-week-btn").addEventListener("click", () => {
                currentMonday = addDays(currentMonday, 7);
                renderWeek();
            });

            document.getElementById("today-week-btn").addEventListener("click", () => {
                currentMonday = getMonday(new Date());
                renderWeek();
                showToast("Mevcut haftaya dönüldü.");
            });

            document.getElementById("date-picker").addEventListener("change", (e) => {
                if (!e.target.value) return;
                currentMonday = getMonday(parseISODate(e.target.value));
                renderWeek();
            });

            // Planlayıcı Olayları
            document.getElementById("open-planner-btn").addEventListener("click", openPlannerModal);
            document.getElementById("planner-close-btn").addEventListener("click", closePlannerModal);
            document.getElementById("planner-done-btn").addEventListener("click", closePlannerModal);

            document.getElementById("planner-modal").addEventListener("click", (e) => {
                if (e.target.id === "planner-modal") closePlannerModal();
            });

            document.getElementById("planner-days-grid").addEventListener("click", (e) => {
                const btn = e.target.closest("button[data-plan-day]");
                if (!btn) return;
                const d = Number(btn.dataset.planDay);
                if (plannerSelectedDays.has(d)) {
                    plannerSelectedDays.delete(d);
                } else {
                    plannerSelectedDays.add(d);
                }
                renderPlannerDaysAndResult();
            });

            document.getElementById("planner-select-all-btn").addEventListener("click", () => {
                for (let d = 0; d < 6; d++) plannerSelectedDays.add(d);
                renderPlannerDaysAndResult();
            });

            document.getElementById("planner-select-remaining-btn").addEventListener("click", () => {
                const today = new Date();
                const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                plannerSelectedDays.clear();
                for (let d = 0; d < 6; d++) {
                    const dayDate = addDays(currentMonday, d);
                    const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate());
                    if (dayStart >= todayStart) {
                        plannerSelectedDays.add(d);
                    }
                }
                renderPlannerDaysAndResult();
            });

            // ALT ARAÇ ÇUBUĞU BUTONLARI
            document.getElementById("copy-summary-btn").addEventListener("click", () => {
                const weekKey = toISODate(currentMonday);
                const manualArr = getWeekManualArray(weekKey);
                const lines = [`İŞKUR Gençlik Puantaj (${formatRangeBadge(currentMonday)})`];
                let total = 0;

                for (let d = 0; d < 6; d++) {
                    const dSum = getEffectiveDayHours(weekKey, d);
                    const hasManual = manualArr[d] !== null && manualArr[d] !== "";
                    total += dSum;
                    const dayDate = addDays(currentMonday, d);
                    lines.push(`- ${DAY_NAMES[d]} (${formatShortDate(dayDate)}): ${formatHoursNumber(dSum)} Saat${hasManual ? " (Elle)" : ""}`);
                }

                lines.push(`Haftalık Toplam: ${formatHoursNumber(total)} / 22.5 Saat (${formatHoursAndMinutes(total)})`);
                const text = lines.join("\n");

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(() => {
                        showToast("Haftalık puantaj özeti panoya kopyalandı!");
                    }).catch(() => {
                        fallbackCopy(text);
                    });
                } else {
                    fallbackCopy(text);
                }
            });

            function fallbackCopy(text) {
                const tempArea = document.createElement("textarea");
                tempArea.value = text;
                tempArea.style.position = "fixed";
                tempArea.style.opacity = "0";
                document.body.appendChild(tempArea);
                tempArea.select();
                try {
                    document.execCommand("copy");
                    showToast("Haftalık puantaj özeti panoya kopyalandı!");
                } catch (err) {
                    showToast("Kopyalama başarısız oldu.", "error");
                }
                document.body.removeChild(tempArea);
            }

            document.getElementById("clear-week-btn").addEventListener("click", () => {
                openActionModal({
                    title: "Haftayı Temizle",
                    message: `${formatRangeBadge(currentMonday)} haftasına ait tüm saat işaretlemeleri ve elle girilen saatler silinecek. Emin misiniz?`,
                    confirmText: "Evet, Temizle",
                    danger: true,
                    onConfirm: () => {
                        const weekKey = toISODate(currentMonday);
                        allWeeksData[weekKey] = createEmptyMatrix();
                        allManualData[weekKey] = Array(6).fill(null);
                        saveAllData();
                        renderWeek();

                        openActionModal({
                            title: "Hafta Temizlendi",
                            message: `${formatRangeBadge(currentMonday)} haftasındaki tüm kayıtlar başarıyla sıfırlandı.`,
                            confirmText: "Tamam",
                            showCancel: false
                        });
                    }
                });
            });

            document.getElementById("export-btn")?.addEventListener("click", () => {
                if (typeof openExportModal === "function") {
                    openExportModal();
                    return;
                }
                const recordedCount = Object.keys(allWeeksData).length;
                openActionModal({
                    title: "Yedek Dosyası İndir",
                    message: `Kayıtlı ${recordedCount} haftalık puantaj veriniz cihazınıza .json yedek dosyası olarak indirilsin mi?`,
                    confirmText: "İndir",
                    onConfirm: () => {
                        const payload = {
                            version: 2,
                            weeks: allWeeksData,
                            manual: allManualData
                        };
                        const dataStr = JSON.stringify(payload, null, 2);
                        const blob = new Blob([dataStr], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `iskur_genclik_puantaj_yedek_${toISODate(new Date())}.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);

                        openActionModal({
                            title: "Yedek İndirildi",
                            message: "Puantaj yedek dosyanız cihazınıza başarıyla indirildi.",
                            confirmText: "Tamam",
                            showCancel: false
                        });
                    }
                });
            });

            document.getElementById("print-btn").addEventListener("click", () => {
                openActionModal({
                    title: "A4 Yatay Yazdır / PDF Kaydet",
                    message: "Kâğıdın altında görünecek Öğrenci Ad Soyad bilgisini yazıp yazdırma ekranını açabilirsiniz:",
                    confirmText: "Yazdır",
                    showStudentInput: true,
                    onConfirm: (studentName) => {
                        const finalName = studentName || "";
                        document.getElementById("print-student-name-text").textContent = finalName;
                        try {
                            localStorage.setItem(STUDENT_NAME_STORAGE_KEY, finalName);
                            if (window.SbtuAuth && typeof window.SbtuAuth.markIskurDirty === "function") {
                                window.SbtuAuth.markIskurDirty();
                            }
                        } catch (e) {}

                        const wasDark = document.documentElement.classList.contains("dark");
                        if (wasDark) {
                            document.documentElement.classList.remove("dark");
                        }

                        setTimeout(() => {
                            window.focus();
                            window.print();

                            if (wasDark) {
                                document.documentElement.classList.add("dark");
                            }

                            openActionModal({
                                title: "Yazdırma Ekranı Tamamlandı",
                                message: "A4 yatay yazdırma / PDF kaydetme işlemi tamamlandı.",
                                confirmText: "Tamam",
                                showCancel: false
                            });
                        }, 80);
                    }
                });
            });

            // Supabase Ortak Senkronizasyon Kancaları
            if (window.SbtuAuth && typeof window.SbtuAuth.registerPageHooks === "function") {
                window.SbtuAuth.registerPageHooks({
                    onDataSynced() {
                        allWeeksData = loadAllData();
                        allManualData = loadAllManualData();
                        renderWeek();
                    },
                    onLogout() {
                        allWeeksData = {};
                        allManualData = {};
                        renderWeek();
                    }
                });
            }

            requestPersistentStorage();
            renderWeek();
            if (window.SbtuAuth && typeof window.SbtuAuth.init === "function") {
                window.SbtuAuth.init();
            }
        