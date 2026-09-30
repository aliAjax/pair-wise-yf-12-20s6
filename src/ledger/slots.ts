/** 时段工具：车位按小时时段占用 */

const pad = (n: number) => String(n).padStart(2, "0");

export function fmtSlot(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`;
}

export function parseSlot(slot: string): Date {
  const [date, time] = slot.split(" ");
  const [y, m, d] = date.split("-").map(Number);
  const [h] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h);
}

export function addHours(slot: string, hours: number): string {
  const d = parseSlot(slot);
  d.setHours(d.getHours() + hours);
  return fmtSlot(d);
}

/** 当前时刻的下一个整点时段 */
export function nextHourSlot(from = new Date()): string {
  const d = new Date(from);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return fmtSlot(d);
}
