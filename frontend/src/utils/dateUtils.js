/**
 * Date and Time Utility Helpers for AURA
 */

export function formatZero(n) {
  return String(n).padStart(2, '0');
}

export function formatDateISO(d) {
  return `${d.getFullYear()}-${formatZero(d.getMonth() + 1)}-${formatZero(d.getDate())}`;
}

export function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

export function formatLongDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

export function formatTime12(time24) {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

export function isToday(dateStr) {
  const todayStr = formatDateISO(new Date());
  return dateStr === todayStr;
}

export function isTomorrow(dateStr) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateStr === formatDateISO(tomorrow);
}

export function getRelativeDateLabel(dateStr) {
  if (isToday(dateStr)) return 'Today';
  if (isTomorrow(dateStr)) return 'Tomorrow';
  return formatDisplayDate(dateStr);
}

/**
 * Generate 7 days for the current week starting Sunday or Monday
 */
export function getDaysOfWeek(baseDate = new Date()) {
  const d = new Date(baseDate);
  const day = d.getDay();
  // Start from Sunday
  const start = new Date(d);
  start.setDate(d.getDate() - day);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);
    days.push({
      date: current,
      dateStr: formatDateISO(current),
      dayName: current.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNumber: current.getDate(),
      isToday: formatDateISO(current) === formatDateISO(new Date())
    });
  }
  return days;
}

/**
 * Generate month calendar matrix (42 cells: 6 weeks x 7 days)
 */
export function getMonthMatrix(year, monthIndex) {
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);

  const startDayOfWeek = firstDay.getDay(); // 0 is Sun
  const totalDays = lastDay.getDate();

  const matrix = [];
  let currentWeek = [];

  // Previous month trailing days
  const prevMonthLastDay = new Date(year, monthIndex, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNum = prevMonthLastDay - i;
    const prevDate = new Date(year, monthIndex - 1, dayNum);
    currentWeek.push({
      dateStr: formatDateISO(prevDate),
      dayNumber: dayNum,
      isCurrentMonth: false,
      isToday: formatDateISO(prevDate) === formatDateISO(new Date())
    });
  }

  // Current month days
  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, monthIndex, day);
    currentWeek.push({
      dateStr: formatDateISO(date),
      dayNumber: day,
      isCurrentMonth: true,
      isToday: formatDateISO(date) === formatDateISO(new Date())
    });

    if (currentWeek.length === 7) {
      matrix.push(currentWeek);
      currentWeek = [];
    }
  }

  // Next month leading days
  let nextDay = 1;
  while (currentWeek.length < 7 && currentWeek.length > 0) {
    const nextDate = new Date(year, monthIndex + 1, nextDay);
    currentWeek.push({
      dateStr: formatDateISO(nextDate),
      dayNumber: nextDay,
      isCurrentMonth: false,
      isToday: formatDateISO(nextDate) === formatDateISO(new Date())
    });
    nextDay++;
  }
  if (currentWeek.length === 7) {
    matrix.push(currentWeek);
  }

  // Pad to 6 rows if needed
  while (matrix.length < 6) {
    currentWeek = [];
    for (let i = 0; i < 7; i++) {
      const nextDate = new Date(year, monthIndex + 1, nextDay);
      currentWeek.push({
        dateStr: formatDateISO(nextDate),
        dayNumber: nextDay,
        isCurrentMonth: false,
        isToday: formatDateISO(nextDate) === formatDateISO(new Date())
      });
      nextDay++;
    }
    matrix.push(currentWeek);
  }

  return matrix;
}
