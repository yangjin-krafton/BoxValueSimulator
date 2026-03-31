/**
 * 슬롯별 등급 확률표.
 * 기획서 섹션 11 기반.
 *
 * 각 테이블은 { grade, multiplier, color, weight } 배열.
 * depthEscalation 적용 시 weight를 보정해서 새 테이블을 생성.
 */

const BASE_GRADES = [
  { grade: 'A',     multiplier: 1.00, color: 0xffdd00 },
  { grade: 'S',     multiplier: 1.55, color: 0xff8800 },
  { grade: 'SS',    multiplier: 2.40, color: 0xff44aa },
  { grade: 'SSS',   multiplier: 4.20, color: 0x44ffff },
  { grade: 'SSSS',  multiplier: 8.20, color: 0x88ff44 },
  { grade: 'SSSSS', multiplier: 16.50, color: 0xff00ff },
];

/**
 * 등급 확률 테이블 사전.
 * weight 합이 100인 필요는 없으며 상대 가중치로 작동.
 */
export const GRADE_TABLES = {
  stable: [
    { ...BASE_GRADES[0], weight: 70 },
    { ...BASE_GRADES[1], weight: 20 },
    { ...BASE_GRADES[2], weight: 8 },
    { ...BASE_GRADES[3], weight: 1.7 },
    { ...BASE_GRADES[4], weight: 0.25 },
    { ...BASE_GRADES[5], weight: 0.05 },
  ],

  attack: [
    { ...BASE_GRADES[0], weight: 48 },
    { ...BASE_GRADES[1], weight: 27 },
    { ...BASE_GRADES[2], weight: 15 },
    { ...BASE_GRADES[3], weight: 7 },
    { ...BASE_GRADES[4], weight: 2.3 },
    { ...BASE_GRADES[5], weight: 0.7 },
  ],

  deep_bottom: [
    { ...BASE_GRADES[0], weight: 36 },
    { ...BASE_GRADES[1], weight: 28 },
    { ...BASE_GRADES[2], weight: 18 },
    { ...BASE_GRADES[3], weight: 10 },
    { ...BASE_GRADES[4], weight: 5 },
    { ...BASE_GRADES[5], weight: 3 },
  ],
};

/** 등급 정보만 필요할 때 (배율, 색상 조회용) */
export { BASE_GRADES };

/**
 * 깊이 보정을 적용해 등급 테이블 생성.
 * escalation > 0이면 상위 등급 weight가 올라간다.
 *
 * @param {string} tableId - GRADE_TABLES 키
 * @param {number} depth - 해당 박스의 열 내 깊이 (0 = 최상단)
 * @param {number} escalation - 깊이 보정 강도
 * @returns {Array} 보정된 등급 테이블
 */
export function getGradeTable(tableId, depth = 0, escalation = 0) {
  const base = GRADE_TABLES[tableId] || GRADE_TABLES.stable;
  if (depth === 0 || escalation === 0) return base;

  const boost = depth * escalation;
  return base.map((entry, i) => {
    // 상위 등급(뒤쪽)일수록 weight 증가, 하위 등급(앞쪽)은 감소
    const rank = i / (base.length - 1); // 0 (최하) ~ 1 (최상)
    const factor = 1 + (rank - 0.3) * boost * 0.1;
    return { ...entry, weight: Math.max(0.01, entry.weight * factor) };
  });
}
