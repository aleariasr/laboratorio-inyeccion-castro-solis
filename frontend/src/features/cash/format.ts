/**
 * Formateo de las semanas de caja. Los campos week_start / week_end son de
 * solo fecha ("YYYY-MM-DD"), así que se parsean con T00:00:00 para que no
 * corran un día hacia atrás en America/Costa_Rica.
 */

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("es-CR", {
    day: "numeric",
  }).format(date);
}

function formatDayAndMonth(date: Date): string {
  return new Intl.DateTimeFormat("es-CR", {
    day: "numeric",
    month: "long",
  }).format(date);
}

function formatFullDate(date: Date): string {
  return new Intl.DateTimeFormat("es-CR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** "19 al 25 de septiembre de 2026" (o con los dos meses si cambia el mes). */
export function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = parseDateOnly(weekStart);
  const end = parseDateOnly(weekEnd);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${weekStart} al ${weekEnd}`;
  }

  const startLabel =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
      ? formatDay(start)
      : formatDayAndMonth(start);

  return `${startLabel} al ${formatFullDate(end)}`;
}

/** "viernes 2 de octubre de 2026". */
export function formatWeekdayDate(value: string): string {
  const date = parseDateOnly(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
