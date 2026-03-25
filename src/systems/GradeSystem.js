/**
 * 등급 시스템.
 * grade, multiplier(가격배수), color(16진수), weight(확률가중치)
 */
export const GRADES = [
  { grade: 'C',   multiplier: 0.4, color: 0x888888, weight: 5 },
  { grade: 'B',   multiplier: 0.7, color: 0x7799ff, weight: 20 },
  { grade: 'A',   multiplier: 1.0, color: 0xffdd00, weight: 35 },
  { grade: 'S',   multiplier: 1.4, color: 0xff8800, weight: 25 },
  { grade: 'SS',  multiplier: 2.0, color: 0xff44aa, weight: 10 },
  { grade: 'SSS', multiplier: 3.5, color: 0x44ffff, weight: 5 },
];

/** 가중 랜덤 등급 뽑기 */
export function rollGrade() {
  const total = GRADES.reduce((s, g) => s + g.weight, 0);
  let r = Math.random() * total;
  for (const g of GRADES) {
    r -= g.weight;
    if (r <= 0) return g;
  }
  return GRADES[2]; // 폴백 A
}
