/**
 * 개발용 임시 상품 테이블.
 * GLB 모델 없이 텍스트 설명만으로 게임 테스트 가능.
 * 실제 배포 시 products.js 로 교체.
 */

export const DEV_PRODUCTS = [
  // ── 저가 (1,000 ~ 10,000) ──
  { id: 'dev_001', name: '종이접기 키트',       baseValue: 1_500,   rarity: 0.8, category: '장난감',   description: '색종이 50장과 설명서가 든 초보자용 종이접기 세트' },
  { id: 'dev_002', name: '미니 손전등',         baseValue: 2_000,   rarity: 0.9, category: '생활용품', description: 'AAA 건전지 1개로 작동하는 LED 손전등' },
  { id: 'dev_003', name: '스티커 팩',           baseValue: 3_000,   rarity: 0.85, category: '수집품',  description: '홀로그램 스티커 20장이 든 랜덤 팩' },
  { id: 'dev_004', name: '실리콘 팔찌',         baseValue: 4_000,   rarity: 0.9, category: '수집품',   description: '야광 기능이 있는 컬러풀 실리콘 팔찌' },
  { id: 'dev_005', name: '미니 퍼즐',           baseValue: 5_500,   rarity: 0.85, category: '장난감',  description: '50피스 미니 직소 퍼즐, 풍경 시리즈' },
  { id: 'dev_006', name: '볼펜 세트',           baseValue: 7_000,   rarity: 0.9, category: '생활용품', description: '6색 젤 잉크 볼펜 세트' },
  { id: 'dev_007', name: '카드 슬리브 팩',      baseValue: 8_500,   rarity: 0.95, category: '수집품',  description: '홀로 카드 슬리브 60장' },
  { id: 'dev_008', name: '미니 화분',           baseValue: 10_000,  rarity: 0.9, category: '생활용품', description: '다육식물이 심어진 세라믹 미니 화분' },

  // ── 중저가 (10,000 ~ 30,000) ──
  { id: 'dev_010', name: '레트로 키캡 세트',    baseValue: 12_000,  rarity: 1.0, category: '전자기기', description: '체리 MX 호환 레트로 컬러 키캡 12개' },
  { id: 'dev_011', name: '미니 보드게임',       baseValue: 15_000,  rarity: 0.95, category: '장난감',  description: '2~4인용 카드 기반 전략 보드게임' },
  { id: 'dev_012', name: '아크릴 스탠드',       baseValue: 18_000,  rarity: 1.0, category: '피규어',   description: '캐릭터 일러스트가 인쇄된 투명 아크릴 스탠드' },
  { id: 'dev_013', name: 'USB 허브',           baseValue: 20_000,  rarity: 1.0, category: '전자기기', description: 'USB 3.0 4포트 알루미늄 허브' },
  { id: 'dev_014', name: '텀블러',             baseValue: 22_000,  rarity: 1.0, category: '생활용품', description: '보온보냉 스테인리스 텀블러 350ml' },
  { id: 'dev_015', name: '퍼즐 큐브',          baseValue: 25_000,  rarity: 1.05, category: '장난감',  description: '자석식 스피드 큐브, 경기용 규격' },
  { id: 'dev_016', name: '미니 스피커',         baseValue: 28_000,  rarity: 1.0, category: '전자기기', description: '블루투스 5.0 방수 미니 스피커' },

  // ── 중가 (30,000 ~ 60,000) ──
  { id: 'dev_020', name: '데스크 LED 조명',     baseValue: 32_000,  rarity: 1.05, category: '생활용품', description: 'RGB 무드등 겸용 데스크 LED 바' },
  { id: 'dev_021', name: '블루투스 이어폰',     baseValue: 38_000,  rarity: 1.1, category: '전자기기', description: 'ANC 지원 무선 이어폰' },
  { id: 'dev_022', name: '레트로 로봇 피규어',  baseValue: 42_000,  rarity: 1.1, category: '피규어',   description: '틴 소재 빈티지 로봇 피규어, 관절 가동' },
  { id: 'dev_023', name: '보조배터리',          baseValue: 45_000,  rarity: 1.0, category: '전자기기', description: '10000mAh PD 고속충전 보조배터리' },
  { id: 'dev_024', name: '미니 가습기',         baseValue: 48_000,  rarity: 1.05, category: '생활용품', description: 'USB 충전식 초음파 미니 가습기' },
  { id: 'dev_025', name: '한정판 카드팩',       baseValue: 55_000,  rarity: 1.15, category: '수집품',  description: 'SR 이상 확정 한정판 트레이딩 카드 5장' },

  // ── 중고가 (60,000 ~ 120,000) ──
  { id: 'dev_030', name: '무선 충전기',         baseValue: 65_000,  rarity: 1.1, category: '전자기기', description: 'Qi2 규격 15W 무선 충전 패드' },
  { id: 'dev_031', name: '빈티지 코인',         baseValue: 75_000,  rarity: 1.2, category: '수집품',   description: '1960년대 발행 기념 주화, 케이스 포함' },
  { id: 'dev_032', name: '애니 피규어',         baseValue: 85_000,  rarity: 1.15, category: '피규어',  description: '1/7 스케일 고퀄리티 애니메이션 피규어' },
  { id: 'dev_033', name: 'RC카',               baseValue: 95_000,  rarity: 1.1, category: '장난감',   description: '2.4GHz 4WD 오프로드 미니 RC카' },
  { id: 'dev_034', name: '기계식 키보드',       baseValue: 110_000, rarity: 1.15, category: '전자기기', description: '65% 레이아웃 핫스왑 기계식 키보드' },

  // ── 고가 (120,000 ~ 300,000) ──
  { id: 'dev_040', name: '크리스탈 볼',         baseValue: 130_000, rarity: 1.2, category: '수집품',   description: '내부 레이저 조각 크리스탈 구체, LED 받침대 포함' },
  { id: 'dev_041', name: '미니 드론',           baseValue: 160_000, rarity: 1.15, category: '장난감',  description: 'FPV 카메라 탑재 접이식 미니 드론' },
  { id: 'dev_042', name: '프리미엄 헤드셋',     baseValue: 200_000, rarity: 1.2, category: '전자기기', description: '하이레졸루션 오디오 무선 헤드셋' },
  { id: 'dev_043', name: '한정판 피규어',       baseValue: 250_000, rarity: 1.3, category: '피규어',   description: '넘버링 한정 1000체 프리미엄 피규어' },

  // ── 초고가 (300,000+) ──
  { id: 'dev_050', name: '기념 메달 세트',      baseValue: 350_000, rarity: 1.3, category: '수집품',   description: '순금 도금 기념 메달 3종 세트, 시리얼 넘버' },
  { id: 'dev_051', name: '프리미엄 태블릿',     baseValue: 450_000, rarity: 1.2, category: '전자기기', description: '10인치 AMOLED 태블릿, 스타일러스 포함' },
  { id: 'dev_052', name: '마스터 에디션 피규어', baseValue: 600_000, rarity: 1.4, category: '피규어',   description: '1/4 스케일 LED 라이트업 마스터 에디션 피규어' },
];

/** 히든 전용 상품 (높은 기본가, 특별 연출용) */
export const DEV_HIDDEN_PRODUCTS = [
  { id: 'hid_001', name: '골든 트로피',         baseValue: 200_000, rarity: 1.5, category: '수집품',   description: '24K 금박 미니 트로피, 유리 케이스 포함' },
  { id: 'hid_002', name: '시크릿 피규어',       baseValue: 350_000, rarity: 1.6, category: '피규어',   description: '비공개 한정판 시크릿 컬러 피규어' },
  { id: 'hid_003', name: '다이아몬드 카드',     baseValue: 500_000, rarity: 1.8, category: '수집품',   description: '실제 다이아몬드 칩이 박힌 울트라 레어 카드' },
];
