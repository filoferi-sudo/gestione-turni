const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

export function formatDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

// Lunedì come primo giorno della settimana
export function startOfWeek(date) {
  const day = date.getDay(); // 0 = domenica
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(date, diffToMonday);
}

export function getWeekDays(referenceDate) {
  const monday = startOfWeek(referenceDate);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return {
      date: formatDateISO(date),
      label: `${DAY_LABELS[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`,
    };
  });
}

export function getSingleDay(referenceDate) {
  return [
    {
      date: formatDateISO(referenceDate),
      label: `${DAY_LABELS[referenceDate.getDay()]} ${referenceDate.getDate()}/${referenceDate.getMonth() + 1}`,
    },
  ];
}

export function formatRangeLabel(days) {
  if (days.length === 1) return days[0].label;
  return `${days[0].label} - ${days[days.length - 1].label}`;
}
