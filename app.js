/***********************
  DATA & GLOBAL STATE
************************/
let data = JSON.parse(localStorage.getItem("attendanceData")) || { subjects: {} };
if (data.targetGoal === undefined) {
  data.targetGoal = 75;
}
let currentSubject = null;
let selectedDate = null;
let currentYear = null;
let currentMonth = null;
let viewMode = "today"; // "today" or "all"
let isSelectionMode = false;
let selectedSubjects = [];
let editingSelectedDays = [];
let tempImportSubjects = [];




const subjectScreen = document.getElementById("subject-screen");
const calendarScreen = document.getElementById("calendar-screen");
const subjectListDiv = document.getElementById("subjectList");
const homeHeading = document.getElementById("homeHeading");

const calendarDiv = document.getElementById("calendar");
const modal = document.getElementById("statusModal");

if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}


/***********************
  HELPERS
************************/
function saveData() {
  localStorage.setItem("attendanceData", JSON.stringify(data));
}

// ✅ LOCAL DATE STRING (NO UTC BUG)
function getLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeSubjects() {
  for (let subject in data.subjects) {
    const s = data.subjects[subject];

    // Old format detected
    if (!s.records) {
      data.subjects[subject] = {
        type: "regular",
        weeklyDay: null,
        records: { ...s }
      };
    }
  }
}

/***********************
  ADD SUBJECT (MODAL)
************************/
let selectedDays = [];

function openAddSubjectModal() {
  document.getElementById("addSubjectModal").classList.remove("hidden");

  // Reset previous selections
  selectedDays = [];

  document.querySelectorAll(".day-btn").forEach(btn => {
    btn.classList.remove("day-selected");
  });

  const timingContainer = document.getElementById("timingInputsContainer");
  if (timingContainer) timingContainer.innerHTML = "";

  // Attach click listeners to buttons (IMPORTANT FIX)
  document.querySelectorAll(".day-btn").forEach(btn => {
    btn.onclick = () => {
      const day = Number(btn.getAttribute("data-day"));

      if (selectedDays.includes(day)) {
        selectedDays = selectedDays.filter(d => d !== day);
        btn.classList.remove("day-selected");
      } else {
        selectedDays.push(day);
        btn.classList.add("day-selected");
      }
      
      updateTimingInputs();
    };
  });
}

const dayNames = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  0: "Sun"
};

function updateTimingInputs() {
  const container = document.getElementById("timingInputsContainer");
  if (!container) return;
  container.innerHTML = "";

  if (selectedDays.length === 0) return;

  const title = document.createElement("p");
  title.style.margin = "12px 0 6px 0";
  title.style.fontWeight = "600";
  title.style.fontSize = "14px";
  title.style.color = "#374151";
  title.textContent = "Class Timings (Optional):";
  container.appendChild(title);

  // Sort selected days so they appear in weekly order (Mon-Sun)
  const sortedDays = [...selectedDays].sort((a, b) => {
    const valA = a === 0 ? 7 : a;
    const valB = b === 0 ? 7 : b;
    return valA - valB;
  });

  sortedDays.forEach(day => {
    const row = document.createElement("div");
    row.className = "timing-row";
    row.innerHTML = `
      <span>${dayNames[day]}</span>
      <div style="display:flex; align-items:center; gap:6px;">
        <input type="time" id="start-time-${day}">
        <span style="font-size:12px; font-weight:normal; color:#6b7280;">to</span>
        <input type="time" id="end-time-${day}">
      </div>
    `;
    container.appendChild(row);
  });
}


function closeAddSubjectModal() {
  document.getElementById("addSubjectModal").classList.add("hidden");
}

function selectSubjectType(type) {
  newSubjectType = type;
  if (type === "weekly") {
    document.getElementById("weeklyDaySelector").classList.remove("hidden");
  } else {
    createSubject();
  }
}

function selectWeeklyDay(day) {
  newSubjectWeeklyDay = day;
  createSubject();
}

function createSubject() {
  const input = document.getElementById("newSubjectInput");
  const name = input.value.trim();

  if (!name) {
    alert("Enter subject name first");
    return;
  }
  if (data.subjects[name]) {
    alert("Subject already exists");
    return;
  }
  if (selectedDays.length === 0) {
    alert("Select at least one day");
    return;
  }

  data.subjects[name] = {
    days: selectedDays,
    records: {}
  };

  selectedDays = []; // reset
  saveData();
  input.value = "";
  closeAddSubjectModal();
  renderSubjects();
  viewMode = "today";

}



/***********************
  DASHBOARD
************************/
function calculateSubjectStats(subjectName) {
  const records = data.subjects[subjectName].records;
  let attended = 0, total = 0;

  for (let d in records) {
    if (records[d] === "present") {
      attended++; total++;
    } else if (records[d] === "absent") {
      total++;
    }
  }

  return {
    attended,
    total,
    percent: total === 0 ? 0 : (attended / total) * 100
  };
}

function formatTime12(timeStr) {
  if (!timeStr) return "";
  const [hrs, mins] = timeStr.split(":");
  let h = parseInt(hrs);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  h = h ? h : 12; // 0 becomes 12
  return `${h}:${mins} ${ampm}`;
}

function getBunkStatus(attended, total, targetGoal = 75) {
  if (total === 0) {
    return { status: "safe", count: 0, text: "No classes logged yet.", dashboardHint: "No classes logged" };
  }
  const G = targetGoal / 100;
  const currentPercent = (attended / total) * 100;

  const nextAttendPercent = ((attended + 1) / (total + 1)) * 100;
  const nextSkipPercent = (attended / (total + 1)) * 100;
  
  const willBeSafeIfSkip = nextSkipPercent >= targetGoal;

  if (currentPercent >= targetGoal) {
    const maxBunk = Math.floor(attended / G - total);
    let skipLine = "";
    if (willBeSafeIfSkip) {
      skipLine = `If you miss the next class, you will still be safe at **${nextSkipPercent.toFixed(1)}%**.`;
    } else {
      skipLine = `If you miss the next class, you will drop below target to **${nextSkipPercent.toFixed(1)}%** (Unsafe!).`;
    }

    let text = `You are safe! (Current: **${currentPercent.toFixed(1)}%**)<br>` +
               `If you attend the next class, you will stay safe at **${nextAttendPercent.toFixed(1)}%**.<br>` +
               skipLine;
               
    if (maxBunk > 0) {
      text += `<br><small>You can bunk up to **${maxBunk}** classes consecutively.</small>`;
    } else {
      text += `<br><small>You cannot bunk any classes without dropping below the target.</small>`;
    }

    let dashboardHint = willBeSafeIfSkip ? "Safe to miss next" : "Don't miss next";

    return {
      status: maxBunk > 0 ? "safe" : "borderline",
      count: maxBunk,
      text: text,
      dashboardHint: dashboardHint
    };
  } else {
    const minAttend = Math.ceil((G * total - attended) / (1 - G));
    const text = `You are below target! (Current: **${currentPercent.toFixed(1)}%**)<br>` +
                 `If you attend the next class, you will rise to **${nextAttendPercent.toFixed(1)}%**.<br>` +
                 `If you miss the next class, you will drop further to **${nextSkipPercent.toFixed(1)}%**.<br>` +
                 `<small>You must attend the next **${minAttend}** classes in a row to reach ${targetGoal}%.</small>`;
                 
    return {
      status: "danger",
      count: minAttend,
      text: text,
      dashboardHint: `Attend next ${minAttend}`
    };
  }
}

function updateTargetGoal(val) {
  const num = parseInt(val) || 75;
  data.targetGoal = Math.max(50, Math.min(100, num));
  saveData();
  renderSubjects();
  if (currentSubject) {
    updateStats();
  }
}

function renderSubjects() {

    // 🔥 Update heading based on view mode
  if (homeHeading) {
    homeHeading.textContent =
      viewMode === "today" ? "📅 Today’s Classes" : "📚 All Subjects";
  }

  const btnToday = document.getElementById("btnTodayView");
  const btnAll = document.getElementById("btnAllView");
  if (btnToday && btnAll) {
    if (viewMode === "today") {
      btnToday.classList.add("view-btn-active");
      btnAll.classList.remove("view-btn-active");
    } else {
      btnAll.classList.add("view-btn-active");
      btnToday.classList.remove("view-btn-active");
    }
  }

  const deleteBtn = document.getElementById("selectionDeleteBtn");
  if (deleteBtn) {
    if (isSelectionMode && selectedSubjects.length > 0) {
      deleteBtn.classList.remove("hidden");
      deleteBtn.textContent = `🗑 Delete Selected (${selectedSubjects.length})`;
    } else {
      deleteBtn.classList.add("hidden");
    }
  }

  subjectListDiv.innerHTML = "";
  const today = new Date().getDay(); // 0 = Sun, 1 = Mon, ...
  const todayDateStr = getLocalDateString();

  let subjects = Object.keys(data.subjects);

  if (viewMode === "today") {
    subjects = subjects.filter(sub => {
      const subject = data.subjects[sub];
      return subject.days && subject.days.includes(today);
    });

    // Sort chronologically by today's start time
    subjects.sort((a, b) => {
      const timeA = data.subjects[a].timings && data.subjects[a].timings[today] && data.subjects[a].timings[today].start;
      const timeB = data.subjects[b].timings && data.subjects[b].timings[today] && data.subjects[b].timings[today].start;

      if (timeA && timeB) return timeA.localeCompare(timeB);
      if (timeA) return -1;
      if (timeB) return 1;
      return a.localeCompare(b);
    });
  } else {
    subjects.sort((a, b) => a.localeCompare(b));
  }

  if (!subjects.length) {
    subjectListDiv.innerHTML = "<p>No subjects added.</p>";
    return;
  }
subjects.forEach(sub => {
  const subject = data.subjects[sub];
  const stats = calculateSubjectStats(sub);

  // Optional Timings
  let timeHtml = "";
  if (subject.timings && subject.timings[today]) {
    const start = subject.timings[today].start;
    const end = subject.timings[today].end;
    if (start || end) {
      let displayTime = "";
      if (start && end) displayTime = `${formatTime12(start)} - ${formatTime12(end)}`;
      else if (start) displayTime = `Starts at ${formatTime12(start)}`;
      else displayTime = `Ends at ${formatTime12(end)}`;
      
      timeHtml = `<span class="subject-time-badge">🕒 ${displayTime}</span>`;
    }
  }

  // Bunk Calculator Badge
  let bunkHintHtml = "";
  if (stats.total > 0) {
    const targetGoal = data.targetGoal || 75;
    const bunk = getBunkStatus(stats.attended, stats.total, targetGoal);
    let hintClass = "";
    if (bunk.status === "safe") {
      hintClass = "bunk-hint-safe";
    } else if (bunk.status === "borderline") {
      hintClass = "bunk-hint-borderline";
    } else {
      hintClass = "bunk-hint-danger";
    }
    bunkHintHtml = `<span class="subject-bunk-hint ${hintClass}">${bunk.dashboardHint}</span>`;
  }

  const hasClassToday = subject.days && subject.days.includes(today);
  const todayRecord = subject.records ? subject.records[todayDateStr] : null;

  let quickAttendanceHtml = "";
  if (hasClassToday && !isSelectionMode) {
    if (!todayRecord) {
      quickAttendanceHtml = `
        <div class="quick-attendance">
          <button class="quick-attend-btn quick-present" onclick="quickMark(event, '${sub.replace(/'/g, "\\'")}', 'present')" title="Mark Present">✓</button>
          <button class="quick-attend-btn quick-absent" onclick="quickMark(event, '${sub.replace(/'/g, "\\'")}', 'absent')" title="Mark Absent">✗</button>
        </div>
      `;
    } else {
      let badgeText = "";
      let badgeClass = "";
      if (todayRecord === "present") {
        badgeText = "✅ Present";
        badgeClass = "status-present";
      } else if (todayRecord === "absent") {
        badgeText = "❌ Absent";
        badgeClass = "status-absent";
      } else if (todayRecord === "noclass") {
        badgeText = "🟦 No Class";
        badgeClass = "status-noclass";
      }
      quickAttendanceHtml = `
        <div class="quick-attendance">
          <span class="quick-status-badge ${badgeClass}" onclick="quickMark(event, '${sub.replace(/'/g, "\\'")}', 'clear')" title="Click to clear today's status">${badgeText}</span>
        </div>
      `;
    }
  }

    const isSelected = selectedSubjects.includes(sub);
    const selectBoxHtml = isSelectionMode 
      ? `<div class="selection-checkbox ${isSelected ? 'checked' : ''}"></div>`
      : "";

    const div = document.createElement("div");
    div.className = "subject-item" + (isSelected ? " selected" : "");

    div.innerHTML = `
      <div style="display: flex; align-items: center;">
        ${selectBoxHtml}
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <span class="subject-name">${sub}</span>
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            ${timeHtml}
            ${bunkHintHtml}
          </div>
        </div>
      </div>
      <div class="subject-right-content">
        ${quickAttendanceHtml}
        <span class="subject-percent">${stats.percent.toFixed(1)}%</span>
      </div>
    `;

    const p = div.querySelector(".subject-percent");
    if (stats.percent >= 80) p.classList.add("percent-very-safe");
    else if (stats.percent >= 75) p.classList.add("percent-safe");
    else if (stats.percent >= 65) p.classList.add("percent-warning");
    else p.classList.add("percent-danger");

    let pressTimer;
    let isLongPress = false;

    div.addEventListener("mousedown", (e) => {
      if (e.target.closest(".quick-attendance")) return;
      isLongPress = false;
      pressTimer = setTimeout(() => {
        isLongPress = true;
        enterSelectionMode(sub);
      }, 600);
    });

    div.addEventListener("touchstart", (e) => {
      if (e.target.closest(".quick-attendance")) return;
      isLongPress = false;
      pressTimer = setTimeout(() => {
        isLongPress = true;
        enterSelectionMode(sub);
      }, 600);
    }, { passive: true });

    div.addEventListener("mouseup", () => clearTimeout(pressTimer));
    div.addEventListener("touchend", () => clearTimeout(pressTimer));
    div.addEventListener("mouseleave", () => clearTimeout(pressTimer));
    div.addEventListener("touchcancel", () => clearTimeout(pressTimer));

    div.onclick = (e) => {
      if (e.target.closest(".quick-attendance")) return;
      
      if (isSelectionMode) {
        e.stopPropagation();
        toggleSubjectSelection(sub);
        return;
      }
      if (isLongPress) {
        e.stopPropagation();
        isLongPress = false;
        return;
      }
      openSubject(sub);
    };

    subjectListDiv.appendChild(div);
  }
);
}
function showTodaySubjects() {
  viewMode = "today";
  renderSubjects();   // this will now also change heading
}


function renderAllSubjects() {
  viewMode = "all";
  renderSubjects();   // this will now also change heading
}


/***********************
  SUBJECT VIEW
************************/
function openSubject(name) {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();
  currentSubject = name;

  subjectScreen.classList.add("hidden");
  calendarScreen.classList.remove("hidden");
  document.getElementById("currentSubjectTitle").textContent = name;

  renderCalendar();
  updateStats();
  checkTodayReminder(); // 🔔 AI check
}

function goBack() {
  currentSubject = null;
  calendarScreen.classList.add("hidden");
  subjectScreen.classList.remove("hidden");

  viewMode = "today";
  renderSubjects();
}



/***********************
  CALENDAR
************************/
function renderCalendar() {
  calendarDiv.innerHTML = "";

  const now = new Date();
  const todayY = now.getFullYear();
  const todayM = now.getMonth();
  const todayD = now.getDate();

  document.getElementById("monthHeader").textContent =
    new Date(currentYear, currentMonth).toLocaleString("default", { month: "long", year: "numeric" });

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const offset = (firstDay + 6) % 7;
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  for (let i = 0; i < offset; i++) {
    calendarDiv.appendChild(document.createElement("div"));
  }

  const subject = data.subjects[currentSubject];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(currentYear, currentMonth, d);
    const day = date.getDay();
    const dateStr = getLocalDateString(date);
    const div = document.createElement("div");
    div.className = "day";
    div.textContent = d;

    if (day === 0 || day === 6) {
      div.classList.add("weekend");
      calendarDiv.appendChild(div);
      continue;
    }
if (!subject.days.includes(day)) {
  div.style.opacity = "0.3";  // visually faded
  div.onclick = () => {       // BUT STILL CLICKABLE
    selectedDate = dateStr;
    openModal();
  };
  calendarDiv.appendChild(div);
  continue;
}



    const status = subject.records[dateStr];
    if (status) div.classList.add(status);

    // Highlight today
const todayStr = getLocalDateString(now);

// Highlight today ONLY if:
// 1) It is today
// 2) We are in the current month
// 3) It is NOT already marked
if (
  dateStr === todayStr &&
  currentYear === todayY &&
  currentMonth === todayM &&
  !subject.records[todayStr]
) {
  div.classList.add("today");
}



   if (currentYear === todayY && currentMonth === todayM && d > todayD) {
  // keep normal look for future days
  div.style.opacity = "1";
 // only visual hint
  div.onclick = () => {      // 🔓 still clickable
    selectedDate = dateStr;
    openModal();
  };
} else {
  div.onclick = () => {
    selectedDate = dateStr;
    openModal();
  };
}


    calendarDiv.appendChild(div);
  }
}

/***********************
  MONTH NAV
************************/
function prevMonth() {
  currentMonth--;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  renderCalendar();
}

function nextMonth() {
  currentMonth++;

  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }

  renderCalendar();
}


/***********************
  MODAL & STATUS
************************/
function openModal() {
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  selectedDate = null;
}

function setStatus(status) {
  const records = data.subjects[currentSubject].records;

  if (status === "clear") delete records[selectedDate];
  else records[selectedDate] = status;

  

  saveData();
  closeModal();
  renderCalendar();
  updateStats();
  renderSubjects();
  normalizeSubjects();
migrateToDaysSystem();   // 👈 ADD THIS
saveData();
renderSubjects();


  // ✅ CLEAR REMINDER ONLY IF TODAY WAS MARKED
  const todayStr = getLocalDateString();
  if (selectedDate === todayStr) {
    document.getElementById("reminderBanner").classList.add("hidden");
  }

  checkTodayReminder();

}

function quickMark(event, subjectName, status) {
  event.stopPropagation();
  const todayStr = getLocalDateString();
  const records = data.subjects[subjectName].records;

  if (status === "clear") {
    delete records[todayStr];
  } else {
    records[todayStr] = status;
  }

  saveData();
  normalizeSubjects();
  migrateToDaysSystem();
  saveData();
  renderSubjects();

  if (currentSubject === subjectName) {
    const banner = document.getElementById("reminderBanner");
    if (banner) {
      if (status !== "clear") banner.classList.add("hidden");
      else checkTodayReminder();
    }
    renderCalendar();
    updateStats();
  }

  checkTodayReminder();
}


/***********************
  STATS
************************/
function updateStats() {
  const r = data.subjects[currentSubject].records;
  let a = 0, t = 0;

  for (let d in r) {
    if (r[d] === "present") { a++; t++; }
    else if (r[d] === "absent") t++;
  }

  document.getElementById("attendedCount").textContent = a;
  document.getElementById("totalCount").textContent = t;
  const percentageVal = t === 0 ? 0 : (a / t) * 100;
  document.getElementById("percentage").textContent =
    t === 0 ? "0%" : percentageVal.toFixed(2) + "%";

  const bunkCard = document.getElementById("bunkCalculatorCard");
  if (bunkCard) {
    if (t === 0) {
      bunkCard.classList.add("hidden");
    } else {
      bunkCard.classList.remove("hidden");
      const targetGoal = data.targetGoal || 75;
      const bunk = getBunkStatus(a, t, targetGoal);
      
      bunkCard.className = "bunk-card"; // reset classes
      bunkCard.innerHTML = bunk.text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      
      if (bunk.status === "safe") {
        bunkCard.classList.add("bunk-card-safe");
      } else if (bunk.status === "borderline") {
        bunkCard.classList.add("bunk-card-borderline");
      } else {
        bunkCard.classList.add("bunk-card-danger");
      }
    }
  }
}

/***********************
  AI REMINDER (FINAL)
************************/
function checkTodayReminder() {
  const banner = document.getElementById("reminderBanner");
  if (!banner) return;

  banner.classList.add("hidden");

  if (!currentSubject) return;

  const subject = data.subjects[currentSubject];
  const now = new Date();

  const todayStr = getLocalDateString(now);
  const day = now.getDay(); // 0 = Sunday
  const hour = now.getHours(); // 0–23

  // ❌ Before 6 PM → no reminder
  if (hour < 18) return;

  // ❌ Sunday → no reminder
  if (day === 0) return;

  // ❌ Weekly subject but today is not class day
  if (!subject.days.includes(day)) return;

  // ❌ Already marked today
  if (subject.records[todayStr]) return;

  // ✅ SHOW REMINDER (after 6 PM only)
  banner.classList.remove("hidden");

  // Register background reminder
registerBackgroundReminder();

}


// ===== DARK MODE / THEME TOGGLE =====
function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "light";
  const body = document.body;
  const toggleBtn = document.getElementById("themeToggleBtn");
  
  if (savedTheme === "dark") {
    body.classList.add("dark");
    if (toggleBtn) toggleBtn.textContent = "☀️";
  } else {
    body.classList.remove("dark");
    if (toggleBtn) toggleBtn.textContent = "🌙";
  }
}

function toggleTheme() {
  const body = document.body;
  const toggleBtn = document.getElementById("themeToggleBtn");
  
  if (body.classList.contains("dark")) {
    body.classList.remove("dark");
    localStorage.setItem("theme", "light");
    if (toggleBtn) toggleBtn.textContent = "🌙";
  } else {
    body.classList.add("dark");
    localStorage.setItem("theme", "dark");
    if (toggleBtn) toggleBtn.textContent = "☀️";
  }
}

normalizeSubjects();
saveData();      // persist upgraded data
initTheme();
if (document.getElementById("targetGoalInput")) {
  document.getElementById("targetGoalInput").value = data.targetGoal;
}
renderSubjects();

async function registerBackgroundReminder() {
  if (!("serviceWorker" in navigator) || !("SyncManager" in window)) return;

  const registration = await navigator.serviceWorker.ready;
  try {
    await registration.sync.register("attendance-reminder");
  } catch (e) {
    console.log("Background sync not supported");
  }
}

function openDeleteSubjectModal() {
  if (!currentSubject) {
    alert("Open a subject first to delete it.");
    return;
  }
  document.getElementById("deleteSubjectModal").classList.remove("hidden");
}

function closeDeleteSubjectModal() {
  document.getElementById("deleteSubjectModal").classList.add("hidden");
}

function deleteSubject() {
  if (!currentSubject) return;

  const subjectToDelete = currentSubject;

  // 1) Remove from data
  delete data.subjects[subjectToDelete];
  saveData();

  // 2) Close modal
  closeDeleteSubjectModal();

  // 3) Reset state
  currentSubject = null;
  selectedDate = null;

  // 4) Go back to home screen
  calendarScreen.classList.add("hidden");
  subjectScreen.classList.remove("hidden");

  // 5) Show today’s subjects again
  viewMode = "today";
  renderSubjects();
}

function migrateToDaysSystem() {
  for (let subject in data.subjects) {
    const s = data.subjects[subject];

    // If subject already has days, skip
    if (s.days) continue;

    // Convert old "regular" subjects → Monday to Friday
    if (s.type === "regular") {
      s.days = [1, 2, 3, 4, 5]; // Mon-Fri
    }

    // Convert old "weekly" subjects → single day
    else if (s.type === "weekly" && s.weeklyDay !== null) {
      s.days = [s.weeklyDay];
    }

    // Clean up old fields (optional but recommended)
    delete s.type;
    delete s.weeklyDay;
  }

  saveData();
}


function toggleDay(day) {
  const buttons = document.querySelectorAll(".day-btn");

  buttons.forEach((btn, index) => {
    // Match button by its position in the list (reliable)
    if (index === day) {
      if (selectedDays.includes(day)) {
        selectedDays = selectedDays.filter(d => d !== day);
        btn.classList.remove("day-selected");
      } else {
        selectedDays.push(day);
        btn.classList.add("day-selected");
      }
    }
  });
}

function saveSelectedDays() {
  const input = document.getElementById("newSubjectInput");
  const name = input.value.trim();

  if (!name) {
    alert("Enter subject name first");
    return;
  }

  if (data.subjects[name]) {
    alert("Subject already exists");
    return;
  }

  if (selectedDays.length === 0) {
    alert("Select at least one day");
    return;
  }

  // Collect optional timings
  const timings = {};
  selectedDays.forEach(day => {
    const startVal = document.getElementById(`start-time-${day}`).value;
    const endVal = document.getElementById(`end-time-${day}`).value;
    if (startVal || endVal) {
      timings[day] = { start: startVal, end: endVal };
    }
  });

  data.subjects[name] = {
    days: [...selectedDays], // copy array
    timings: timings,
    records: {}
  };

  saveData();
  input.value = "";
  selectedDays = [];
  closeAddSubjectModal();
  renderSubjects();
}

// ===== MULTI-SELECTION & DELETION =====
function enterSelectionMode(firstSelectedSubject) {
  isSelectionMode = true;
  selectedSubjects = [firstSelectedSubject];
  renderSubjects();
}

function exitSelectionMode() {
  isSelectionMode = false;
  selectedSubjects = [];
  renderSubjects();
}

function toggleSubjectSelection(subjectName) {
  if (selectedSubjects.includes(subjectName)) {
    selectedSubjects = selectedSubjects.filter(s => s !== subjectName);
  } else {
    selectedSubjects.push(subjectName);
  }

  if (selectedSubjects.length === 0) {
    exitSelectionMode();
  } else {
    renderSubjects();
  }
}

function deleteSelectedSubjects() {
  if (selectedSubjects.length === 0) return;

  const confirmMsg = selectedSubjects.length === 1
    ? `Delete "${selectedSubjects[0]}"? This will remove all its attendance data.`
    : `Delete the ${selectedSubjects.length} selected subjects? This will remove all their attendance data.`;

  if (confirm(confirmMsg)) {
    selectedSubjects.forEach(sub => {
      delete data.subjects[sub];
    });
    saveData();
    exitSelectionMode();
  }
}

// ===== EDIT SUBJECT FEATURE =====
function openEditSubjectModal() {
  if (!currentSubject) return;
  const subject = data.subjects[currentSubject];

  // Prefill name
  const nameInput = document.getElementById("editSubjectNameInput");
  if (nameInput) nameInput.value = currentSubject;

  // Prefill selected days
  editingSelectedDays = [...(subject.days || [])];

  // Set active state on edit day buttons
  document.querySelectorAll(".edit-day-btn").forEach(btn => {
    const day = Number(btn.getAttribute("data-day"));
    if (editingSelectedDays.includes(day)) {
      btn.classList.add("day-selected");
    } else {
      btn.classList.remove("day-selected");
    }

    // Click listener for edit day buttons
    btn.onclick = () => {
      if (editingSelectedDays.includes(day)) {
        editingSelectedDays = editingSelectedDays.filter(d => d !== day);
        btn.classList.remove("day-selected");
      } else {
        editingSelectedDays.push(day);
        btn.classList.add("day-selected");
      }
      updateEditTimingInputs();
    };
  });

  // Prefill timings
  updateEditTimingInputs();

  // Fill in existing timings
  const timings = subject.timings || {};
  editingSelectedDays.forEach(day => {
    if (timings[day]) {
      const startInput = document.getElementById(`edit-start-time-${day}`);
      const endInput = document.getElementById(`edit-end-time-${day}`);
      if (startInput && timings[day].start) startInput.value = timings[day].start;
      if (endInput && timings[day].end) endInput.value = timings[day].end;
    }
  });

  document.getElementById("editSubjectModal").classList.remove("hidden");
}

function closeEditSubjectModal() {
  document.getElementById("editSubjectModal").classList.add("hidden");
  editingSelectedDays = [];
}

function updateEditTimingInputs() {
  const container = document.getElementById("editTimingInputsContainer");
  if (!container) return;

  // Store currently typed values in the inputs so they don't get lost when toggling other days!
  const currentValues = {};
  editingSelectedDays.forEach(day => {
    const startVal = document.getElementById(`edit-start-time-${day}`);
    const endVal = document.getElementById(`edit-end-time-${day}`);
    currentValues[day] = {
      start: startVal ? startVal.value : "",
      end: endVal ? endVal.value : ""
    };
  });

  container.innerHTML = "";
  if (editingSelectedDays.length === 0) return;

  const title = document.createElement("p");
  title.style.margin = "12px 0 6px 0";
  title.style.fontWeight = "600";
  title.style.fontSize = "14px";
  title.style.color = "#374151";
  title.textContent = "Class Timings (Optional):";
  container.appendChild(title);

  // Sort editing days
  const sortedDays = [...editingSelectedDays].sort((a, b) => {
    const valA = a === 0 ? 7 : a;
    const valB = b === 0 ? 7 : b;
    return valA - valB;
  });

  sortedDays.forEach(day => {
    const row = document.createElement("div");
    row.className = "timing-row";
    row.innerHTML = `
      <span>${dayNames[day]}</span>
      <div style="display:flex; align-items:center; gap:6px;">
        <input type="time" id="edit-start-time-${day}">
        <span style="font-size:12px; font-weight:normal; color:#6b7280;">to</span>
        <input type="time" id="edit-end-time-${day}">
      </div>
    `;
    container.appendChild(row);

    // Restore previous values if they existed
    const startInput = row.querySelector(`#edit-start-time-${day}`);
    const endInput = row.querySelector(`#edit-end-time-${day}`);

    const subject = data.subjects[currentSubject];
    const originalTimings = (subject && subject.timings) ? subject.timings : {};

    if (currentValues[day]) {
      if (startInput) startInput.value = currentValues[day].start;
      if (endInput) endInput.value = currentValues[day].end;
    } else if (originalTimings[day]) {
      if (startInput && originalTimings[day].start) startInput.value = originalTimings[day].start;
      if (endInput && originalTimings[day].end) endInput.value = originalTimings[day].end;
    }
  });
}

function saveEditSubject() {
  if (!currentSubject) return;

  const nameInput = document.getElementById("editSubjectNameInput");
  const newName = nameInput.value.trim();
  const oldName = currentSubject;

  // 1. Validation
  if (!newName) {
    alert("Enter subject name first");
    return;
  }

  if (newName.toLowerCase() !== oldName.toLowerCase() && data.subjects[newName]) {
    alert("Subject already exists");
    return;
  }

  if (editingSelectedDays.length === 0) {
    alert("Select at least one day");
    return;
  }

  // Collect timings
  const timings = {};
  editingSelectedDays.forEach(day => {
    const startInput = document.getElementById(`edit-start-time-${day}`);
    const endInput = document.getElementById(`edit-end-time-${day}`);
    const startVal = startInput ? startInput.value : "";
    const endVal = endInput ? endInput.value : "";
    if (startVal || endVal) {
      timings[day] = { start: startVal, end: endVal };
    }
  });

  // Preserve records
  const records = data.subjects[oldName].records || {};

  // If name changed, delete old key, else overwrite
  if (newName !== oldName) {
    delete data.subjects[oldName];
  }

  data.subjects[newName] = {
    days: [...editingSelectedDays],
    timings: timings,
    records: records
  };

  // Update active state
  currentSubject = newName;

  saveData();
  closeEditSubjectModal();

  // Refresh dashboard and current subject views
  renderSubjects();

  // Refresh subject details screen
  document.getElementById("currentSubjectTitle").textContent = newName;
  renderCalendar();
  updateStats();
  checkTodayReminder();
}

// ===== AI TIMETABLE IMPORT FEATURE =====

function openImportModal() {
  const fileInput = document.getElementById("timetableFileInput");
  if (fileInput) fileInput.value = "";

  showImportSetup();
  document.getElementById("importTimetableModal").classList.remove("hidden");
}

function closeImportModal() {
  document.getElementById("importTimetableModal").classList.add("hidden");
  tempImportSubjects = [];
}

function showImportSetup() {
  document.getElementById("importSetupView").classList.remove("hidden");
  document.getElementById("importLoadingView").classList.add("hidden");
  document.getElementById("importPreviewView").classList.add("hidden");
}

function showImportLoading(text) {
  document.getElementById("importSetupView").classList.add("hidden");
  document.getElementById("importLoadingView").classList.remove("hidden");
  document.getElementById("importPreviewView").classList.add("hidden");
  document.getElementById("importProgressText").textContent = text;
}

function showImportPreviewView() {
  document.getElementById("importSetupView").classList.add("hidden");
  document.getElementById("importLoadingView").classList.add("hidden");
  document.getElementById("importPreviewView").classList.remove("hidden");
}

// Render PDF page 1 to a Base64 Image Data URL using Canvas
async function renderPDFToImage(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  if (pdf.numPages === 0) {
    throw new Error("PDF contains no pages.");
  }
  
  // Load page 1
  const page = await pdf.getPage(1);
  
  // Set viewport scale (2.0 for higher resolution/readability)
  const scale = 2.0;
  const viewport = page.getViewport({ scale });
  
  // Create offscreen canvas
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  
  // Render
  const renderContext = {
    canvasContext: context,
    viewport: viewport
  };
  await page.render(renderContext).promise;
  
  // Convert to Base64 PNG data URL
  return canvas.toDataURL("image/png");
}

// Image OCR Text Extraction using Tesseract.js
async function extractImageText(file) {
  const worker = await Tesseract.createWorker("eng");
  const ret = await worker.recognize(file);
  await worker.terminate();

  if (!ret.data.text.trim()) {
    throw new Error("OCR could not read any text from the image.");
  }

  return ret.data.text;
}

// Parse AI Markdown or Text response
function parseAIResponse(rawText) {
  let cleaned = rawText.trim();
  
  // Extract only the JSON block (from the first '{' to the last '}')
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      // Sanitizer: If the AI output JS object literals instead of strict JSON (unquoted keys)
      // E.g. {start: "10:00"} -> {"start": "10:00"}
      // E.g. 1: { -> "1": {
      try {
        let fixedJson = cleaned
          .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":') // Quote word keys
          .replace(/([{,]\s*)(\d+)\s*:/g, '$1"$2":'); // Quote digit keys
        return JSON.parse(fixedJson);
      } catch (innerError) {
        console.error("Failed to parse cleaned JSON:", cleaned);
        throw new Error(`JSON parse error. Raw response started with: "${rawText.substring(0, 200)}..."`);
      }
    }
  }
  
  throw new Error(`No JSON braces found. Raw response started with: "${rawText.substring(0, 200)}..."`);
}

// Call NVIDIA chat completions API via Vercel Serverless Function
async function callNvidiaAI(payloadData, apiKey) {
  // Call relative endpoint on same domain to bypass CORS completely
  const response = await fetch("/api/parse", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ...payloadData, apiKey })
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(errorJson.error || `Server returned status ${response.status}`);
  }

  const result = await response.json();
  const rawText = result.choices[0].message.content.trim();
  return parseAIResponse(rawText);
}

// Convert image file to Base64 Data URL
function readImageAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

// Pipeline trigger
async function startAIImport() {
  const fileInput = document.getElementById("timetableFileInput");
  const file = fileInput && fileInput.files ? fileInput.files[0] : null;

  // HARDCODED NVIDIA API KEY (as requested by user)
  const apiKey = "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"; 

  if (!file) {
    alert("Please select a file first.");
    return;
  }

  try {
    const isPdf = file.name.toLowerCase().endsWith(".pdf");
    let payloadData = {};

    if (isPdf) {
      showImportLoading("Rendering PDF visually for AI...");
      let imageDataUrl = "";
      try {
        imageDataUrl = await renderPDFToImage(file);
      } catch (err) {
        console.error(err);
        throw new Error("[PDF Rendering Stage Failed]: " + err.message);
      }
      payloadData = { imageDataUrl: imageDataUrl, isImage: true };
    } else {
      showImportLoading("Encoding image for AI Vision...");
      let imageDataUrl = "";
      try {
        imageDataUrl = await readImageAsBase64(file);
      } catch (err) {
        console.error(err);
        throw new Error("[Image Encoding Stage Failed]: " + err.message);
      }
      payloadData = { imageDataUrl: imageDataUrl, isImage: true };
    }

    showImportLoading("Understanding timetable with AI Vision...");
    let json;
    try {
      json = await callNvidiaAI(payloadData, apiKey);
    } catch (err) {
      console.error(err);
      throw new Error("[NVIDIA AI Completion Stage Failed]: " + err.message);
    }

    if (!json || !json.subjects || !Array.isArray(json.subjects)) {
      throw new Error("AI returned invalid timetable structure.");
    }

    // Initialize tempImportSubjects
    tempImportSubjects = json.subjects.map(s => ({
      name: s.name || "Unnamed Subject",
      confidence: s.confidence !== undefined ? s.confidence : 1.0,
      days: Array.isArray(s.days) ? s.days : [],
      timings: s.timings || {},
      enabled: true
    }));

    showImportPreviewView();
    renderImportPreview();
  } catch (error) {
    alert("Failed to import timetable: " + error.message);
    showImportSetup();
  }
}

// Render Preview List
function renderImportPreview() {
  const container = document.getElementById("importPreviewList");
  if (!container) return;

  container.innerHTML = "";

  if (tempImportSubjects.length === 0) {
    container.innerHTML = "<p style='color:var(--text-secondary); text-align:center;'>No subjects parsed. Go back and try a different file.</p>";
    return;
  }

  tempImportSubjects.forEach((sub, idx) => {
    const isLowConfidence = sub.confidence !== undefined && (sub.confidence === "low" || sub.confidence < 0.7);
    const item = document.createElement("div");
    item.className = "preview-item" + (isLowConfidence ? " preview-low-confidence" : "");

    // Generate day selection buttons for preview
    let dayButtonsHtml = "";
    const daysOfWeek = [1, 2, 3, 4, 5, 6, 0];
    daysOfWeek.forEach(day => {
      const isSelected = sub.days.includes(day);
      dayButtonsHtml += `
        <button class="btn day-btn preview-day-btn ${isSelected ? 'day-selected' : ''}" 
                onclick="togglePreviewDay(${idx}, ${day})">${dayNames[day]}</button>
      `;
    });

    // Generate timings inputs
    let timingsHtml = "";
    sub.days.sort((a,b) => (a===0?7:a) - (b===0?7:b)).forEach(day => {
      const startTime = sub.timings && sub.timings[day] ? sub.timings[day].start : "";
      const endTime = sub.timings && sub.timings[day] ? sub.timings[day].end : "";
      timingsHtml += `
        <div class="timing-row" style="margin-top: 6px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:12px; font-weight:700; width:45px;">${dayNames[day]}:</span>
          <div style="display:flex; align-items:center; gap:6px;">
            <input type="time" value="${startTime}" onchange="updatePreviewTime(${idx}, ${day}, 'start', this.value)" style="padding:4px; border-radius:6px; border:1px solid var(--border-color); font-family:inherit; background:var(--bg-primary); color:var(--text-primary);">
            <span style="font-size:11px; color:#6b7280;">to</span>
            <input type="time" value="${endTime}" onchange="updatePreviewTime(${idx}, ${day}, 'end', this.value)" style="padding:4px; border-radius:6px; border:1px solid var(--border-color); font-family:inherit; background:var(--bg-primary); color:var(--text-primary);">
          </div>
        </div>
      `;
    });

    item.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 8px; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px; flex: 1;">
          <input type="checkbox" id="import-check-${idx}" ${sub.enabled ? 'checked' : ''} onchange="togglePreviewImport(${idx}, this.checked)" style="width:18px; height:18px; cursor:pointer;">
          <input type="text" value="${sub.name}" onchange="updatePreviewName(${idx}, this.value)" style="flex:1; padding:6px 10px; border-radius:8px; border:1px solid var(--border-color); font-family:inherit; font-weight:600; background:var(--bg-secondary); color:var(--text-primary); outline:none;">
        </div>
        <button class="btn-danger" onclick="deletePreviewSubject(${idx})" style="padding:6px 10px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer;">🗑 Remove</button>
      </div>

      ${isLowConfidence ? `
        <div class="confidence-banner">
          ⚠️ Low confidence (${(sub.confidence * 100).toFixed(0)}%) - please verify details.
        </div>
      ` : ""}

      <div style="margin: 10px 0 5px 0; font-size: 11.5px; font-weight: 700; color: var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px;">Class Days:</div>
      <div style="display:grid; grid-template-columns: repeat(7, 1fr); gap:4px; margin-bottom:8px;">
        ${dayButtonsHtml}
      </div>

      ${timingsHtml ? `<div style="margin-top:8px; border-top:1px solid var(--border-color); padding-top:8px;">${timingsHtml}</div>` : ""}
    `;

    container.appendChild(item);
  });
}

function togglePreviewImport(idx, checked) {
  tempImportSubjects[idx].enabled = checked;
}

function updatePreviewName(idx, value) {
  tempImportSubjects[idx].name = value.trim();
}

function deletePreviewSubject(idx) {
  tempImportSubjects.splice(idx, 1);
  renderImportPreview();
}

function togglePreviewDay(idx, day) {
  const sub = tempImportSubjects[idx];
  if (sub.days.includes(day)) {
    sub.days = sub.days.filter(d => d !== day);
    if (sub.timings) delete sub.timings[day];
  } else {
    sub.days.push(day);
    if (!sub.timings) sub.timings = {};
    sub.timings[day] = { start: "", end: "" };
  }
  renderImportPreview();
}

function updatePreviewTime(idx, day, field, value) {
  const sub = tempImportSubjects[idx];
  if (!sub.timings) sub.timings = {};
  if (!sub.timings[day]) sub.timings[day] = { start: "", end: "" };
  sub.timings[day][field] = value;
}

// Duplicate resolver modal handler
function promptDuplicateResolution(name) {
  return new Promise((resolve) => {
    const modal = document.getElementById("duplicateModal");
    const text = document.getElementById("duplicateText");

    text.innerHTML = `Subject <b>"${name}"</b> already exists in your list.<br>What would you like to do?`;
    modal.classList.remove("hidden");

    document.getElementById("btnReplaceDuplicate").onclick = () => {
      modal.classList.add("hidden");
      resolve("replace");
    };

    document.getElementById("btnRenameDuplicate").onclick = () => {
      modal.classList.add("hidden");
      resolve("rename");
    };

    document.getElementById("btnSkipDuplicate").onclick = () => {
      modal.classList.add("hidden");
      resolve("skip");
    };
  });
}

// Save all confirmed preview subjects
async function importSubjects() {
  const enabledSubjects = tempImportSubjects.filter(s => s.enabled && s.name.trim());
  if (enabledSubjects.length === 0) {
    alert("No subjects selected for import.");
    return;
  }

  for (let i = 0; i < enabledSubjects.length; i++) {
    const sub = enabledSubjects[i];
    let name = sub.name.trim();

    if (data.subjects[name]) {
      const choice = await promptDuplicateResolution(name);

      if (choice === "skip") {
        continue;
      } else if (choice === "rename") {
        let newName = "";
        while (true) {
          const inputName = prompt(`Enter a new name for "${name}":`, `${name} (New)`);
          if (inputName === null) break;
          const trimmed = inputName.trim();
          if (!trimmed) {
            alert("Subject name cannot be empty.");
            continue;
          }
          if (data.subjects[trimmed]) {
            alert(`"${trimmed}" already exists. Please choose a different name.`);
            continue;
          }
          newName = trimmed;
          break;
        }
        if (!newName) continue;
        name = newName;
      } else if (choice === "replace") {
        // Overwrite subject config (days/timings) but preserve records!
        const existingRecords = data.subjects[name].records || {};
        data.subjects[name] = {
          days: [...sub.days],
          timings: sub.timings || {},
          records: existingRecords
        };
        continue;
      }
    }

    // Create new subject
    data.subjects[name] = {
      days: [...sub.days],
      timings: sub.timings || {},
      records: {}
    };
  }

  saveData();
  closeImportModal();
  renderSubjects();
}


