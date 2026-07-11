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
  if (hasClassToday) {
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

    const div = document.createElement("div");
    div.className = "subject-item";

    div.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <span class="subject-name">${sub}</span>
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          ${timeHtml}
          ${bunkHintHtml}
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

    div.onclick = () => openSubject(sub);
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

