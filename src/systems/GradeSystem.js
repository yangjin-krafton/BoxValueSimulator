/**
 * 등급 시스템 (v2 — 슬롯 기반 확률표).
 *
 * rollGrade()는 이제 boxDef를 받아 해당 슬롯의 등급 테이블로 등급을 뽑는다.
 * RuleEngine 훅으로 등급 테이블을 실시간 보정할 수 있다.
 */

import { GRADE_TABLES, BASE_GRADES, getGradeTable } from '../data/gradeTables.js';

export { GRADE_TABLES, BASE_GRADES };

/**
 * 슬롯 기반 등급 뽑기.
 *
 * @param {object} boxDef - generateBoxSet()이 생성한 박스 정의
 * @param {import('./RuleEngine.js').RuleEngine} [ruleEngine]
 * @returns {{ grade, multiplier, color, weight }}
 */
export function rollGrade(boxDef, ruleEngine = null) {
  // 박스에 저장된 등급 테이블 사용
  let table = boxDef.gradeTable
    ? boxDef.gradeTable.map(g => ({ ...g }))
    : getGradeTable('stable', 0, 0).map(g => ({ ...g }));

  // RuleEngine 보정
  if (ruleEngine) {
    const ctx = {
      table,
      towerRole: boxDef.laneType,
      depth: boxDef.depth,
    };
    ruleEngine.apply('grade:tableModify', ctx);
    table = ctx.table;
  }

  // 가중 랜덤
  const total = table.reduce((s, g) => s + g.weight, 0);
  let r = Math.random() * total;
  for (const g of table) {
    r -= g.weight;
    if (r <= 0) return g;
  }
  return table[0]; // 폴백
}

/**
 * 하위 호환 — 테이블 ID와 깊이로 직접 등급 뽑기.
 * @param {string} tableId
 * @param {number} depth
 * @param {number} escalation
 */
export function rollGradeByTable(tableId, depth = 0, escalation = 0) {
  const table = getGradeTable(tableId, depth, escalation);
  const total = table.reduce((s, g) => s + g.weight, 0);
  let r = Math.random() * total;
  for (const g of table) {
    r -= g.weight;
    if (r <= 0) return g;
  }
  return table[0];
}
