# Asset Pipeline 실행 가이드

피규어 이미지 대량 생성 + AI 비전 검수 + 3D 모델 변환 + 등급/가격 판정 파이프라인.

## 인프라

| 서비스 | 주소 | 용도 | VRAM |
|--------|------|------|------|
| ComfyUI | `http://100.66.10.225:8188` | text2img, img2glb (Docker) | 공유 |
| LM Studio | `http://100.66.10.225:1234` | QA 비전 검수, 등급/가격 판정 | 공유 |
| GPU | RTX 5080 16GB | **동시 사용 불가** — 교대 운영 | 16GB |

## 사전 조건

```bash
docker start comfyui                    # ComfyUI 컨테이너 시작
# LM Studio에 qwen/qwen3-vl-8b 모델 다운로드 (QA용)
# LM Studio에 qwen/qwen3-8b 모델 다운로드 (등급 판정용)
# Node.js 18+
```

## 전체 흐름

```
┌──────────────────────────────────────────────────────────────┐
│  1. 프롬프트 생성 (100주제 x 10스타일 = 1,000개)              │
│     node tools/generate-prompts.mjs                          │
├──────────────────────────────────────────────────────────────┤
│  2. Phase 1: 이미지 생성 [ComfyUI] (~2.8시간)                │
│     node tools/asset-pipeline.mjs --phase 1 --reset          │
├──────────────────────────────────────────────────────────────┤
│  3. QA 검수 + 재생성 루프 [LM Studio ↔ ComfyUI]              │
│     node tools/qa-pipeline.mjs                               │
├──────────────────────────────────────────────────────────────┤
│  4. Phase 2: GLB 변환 [ComfyUI TRELLIS.2] (~66시간)          │
│     node tools/asset-pipeline.mjs --phase 2                  │
├──────────────────────────────────────────────────────────────┤
│  5. 게임 에셋 배치                                            │
│     GLB → src/assets/models/                                 │
│     이미지 → src/assets/cards/                                │
├──────────────────────────────────────────────────────────────┤
│  6. 등급/가격 판정 [LM Studio]                                │
│     node tools/grade-products.mjs                            │
│     → src/data/products.json 생성                             │
└──────────────────────────────────────────────────────────────┘
```

## 정식 실행

### 1단계: 프롬프트 생성

```bash
cd D:\Weeks\BoxValueSimulator

# 미리보기
node tools/generate-prompts.mjs --dry-run

# 전체 1000개 생성 → tools/product-prompts.json
node tools/generate-prompts.mjs
```

프롬프트 구성: 100주제 x 10스타일 = 1,000개

| 카테고리 | 주제 수 | 예시 |
|----------|---------|------|
| 미소녀 | 31 | 스쿨아이돌, 고딕로리타, 메이드카페스타 |
| 쿨/멋짐 | 13 | 다크나이트, 사이버닌자, 건슬링어 |
| 섹시/매력 | 11 | 서큐버스, 발키리, 뱀파이어퀸 |
| 마법소녀 | 11 | 매지컬걸스타, 문프린세스, 썬더소서러스 |
| 메카/로봇 | 11 | 건담히어로, 탱크메카, 카이주헌터 |
| 신화/전설 | 9 | 아누비스, 미노타우르스, 펜리르 |
| 공포/다크 | 8 | 리치킹, 웬디고, 역병의사 |
| 동물 | 6 | 알파울프, 백호, 섀도우팬서 |

| 스타일 | 설명 |
|--------|------|
| chibi | 2등신 슈퍼디폼 |
| stylized | 4등신 카툰풍 |
| realistic | 실사 디테일 |
| clay | 점토 조형 매트 |
| vinyl | 광택 디자이너 토이 |
| wooden | 나무 조각 민속풍 |
| pixel | 복셀 저폴리 |
| plush | 봉제인형 패브릭 |
| mech | 기계 관절 장갑판 |
| metallic | 크롬 반사 메탈 |

### 2단계: 이미지 생성 (Phase 1)

```bash
# 처음부터 시작
node tools/asset-pipeline.mjs --phase 1 --reset

# 이어서 실행 (중단 후 재시작 시)
node tools/asset-pipeline.mjs --phase 1

# 특정 ID만
node tools/asset-pipeline.mjs --phase 1 --ids fig_knight_chibi,fig_mage_clay
```

- 출력: `tools/generated-img/*.png` (512x512)
- 속도: ~10초/장, 1000개 약 2.8시간
- 10개마다 VRAM 자동 정리

### 3단계: QA 검수 + 재생성

```bash
# 검수 + 재생성 루프 (90% 합격 목표)
node tools/qa-pipeline.mjs

# 검수만 (재생성 안 함)
node tools/qa-pipeline.mjs --qa-only

# 합격률/라운드 조정
node tools/qa-pipeline.mjs --pass-rate 0.95 --max-rounds 5

# 배치 크기 조정 (기본 5장씩)
node tools/qa-pipeline.mjs --batch 8
```

#### VRAM 교대 관리 (자동)

파이프라인이 자동으로 처리합니다:
1. ComfyUI `/free` API → VRAM 해제
2. LM Studio `/api/v1/models/load` → 모델 로드
3. 검수 완료
4. LM Studio `/api/v1/models/unload` → 모델 언로드
5. 재생성 필요 시 ComfyUI 자동 사용
6. 반복

#### QA 모델

- **모델**: `qwen/qwen3-vl-8b` (비전 모델)
- **출력**: structured output (JSON Schema 강제)
- **thinking**: ON/OFF 무관 — `<think>` 태그 자동 제거

#### QA 판정 기준

| 구분 | 이슈 | 결과 |
|------|------|------|
| **HARD FAIL** | `SINGLE` — 여러 캐릭터 | 즉시 0점, 재생성 |
| **HARD FAIL** | `MAJOR_CROP` — 머리/몸통 잘림 | 즉시 0점, 재생성 |
| **HARD FAIL** | `MAJOR_ARTIFACT` — 심각한 결함 | 즉시 0점, 재생성 |
| SOFT | `WHITE_BG` — 연회색 배경 | -5점 (합격 가능) |
| SOFT | `MINOR_CROP` — 무기/날개 끝 살짝 닿음 | -5점 (합격 가능) |
| SOFT | `HELD_ITEMS` — 무기 위치 부정확 | -15점 |
| SOFT | `CLEAR_SHAPE` — 형태 불분명 | -10점 |

합격: HARD FAIL 없음 + 점수 70 이상

#### 불합격 처리

- 불합격 이미지 **즉시 삭제** (백업 없음)
- 새 시드로 같은 ID 재생성
- 재검수 → 90% 달성까지 반복

### 4단계: GLB 변환 (Phase 2)

```bash
node tools/asset-pipeline.mjs --phase 2
```

- QA 합격 이미지만 대상
- 출력: `tools/generated-glb/*.glb`
- 속도: ~4분/개 (TRELLIS.2 512 해상도)
- 3개마다 VRAM 자동 정리

### 5단계: 게임 에셋 배치

생성된 에셋을 게임 디렉토리에 배치합니다.

```bash
# GLB 모델 → src/assets/models/
cp tools/generated-glb/*.glb src/assets/models/

# 이미지 → src/assets/cards/ (카드 상품용)
cp tools/generated-img/*.png src/assets/cards/
```

게임에는 두 종류의 상품이 있습니다:

| 타입 | 소스 | 위치 | 설명 |
|------|------|------|------|
| **3D 모델** | `generated-glb/*.glb` | `src/assets/models/` | GLB 피규어, 상자에서 회전하며 등장 |
| **2D 카드** | `generated-img/*.png` | `src/assets/cards/` | 이미지 카드, 3D 카드 형태로 렌더링 |

- 카드는 모델보다 **낮은 가격대** (3,000~150,000원 vs 5,000~500,000원)
- 같은 캐릭터+스타일이 모델/카드 모두 존재 가능 (다른 상품)

### 6단계: 등급/가격 판정

LM Studio를 사용하여 각 상품의 등급과 가격을 자동 판정합니다.

```bash
# 전체 (모델 + 카드) 등급 판정
node tools/grade-products.mjs

# 모델만
node tools/grade-products.mjs --models-only

# 카드만
node tools/grade-products.mjs --cards-only

# LM Studio 설정 변경
node tools/grade-products.mjs --url http://localhost:1234 --model qwen/qwen3-8b

# 배치 크기 변경
node tools/grade-products.mjs --batch 20
```

- 입력: `src/assets/models/*.glb` + `src/assets/cards/*.png` (파일명 기반)
- 출력: `src/data/products.json`
- LM Studio가 캐릭터명 + 스타일 + 타입을 분석하여 등급/가격 산출

#### 등급 체계

| 등급 | 희귀도 | 모델 가격대 | 카드 가격대 |
|------|--------|------------|------------|
| C | 커먼 | 5,000~20,000 | 3,000~10,000 |
| B | 언커먼 | 15,000~40,000 | 7,000~20,000 |
| A | 레어 | 30,000~80,000 | 15,000~40,000 |
| S | 슈퍼 레어 | 60,000~150,000 | 30,000~80,000 |
| SS | 울트라 레어 | 100,000~300,000 | 50,000~120,000 |
| SSS+ | 레전더리 | 200,000~500,000 | 80,000~150,000 |

#### products.json 구조

```json
[
  {
    "id": "fig_catgirl_gamer_metallic",
    "name": "Catgirl Gamer",
    "style": "Metallic",
    "grade": "S",
    "price": 85000,
    "modelPath": "assets/models/fig_catgirl_gamer_metallic.glb"
  },
  {
    "id": "card_fig_catgirl_gamer_metallic",
    "name": "Catgirl Gamer",
    "style": "Metallic",
    "type": "card",
    "grade": "A",
    "price": 28000,
    "imagePath": "assets/cards/fig_catgirl_gamer_metallic.png",
    "modelPath": ""
  }
]
```

## 진행상황 확인

```bash
# Phase 1/2 진행률
cat tools/pipeline-checkpoint.json | node -e "
  let d='';process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    const j=JSON.parse(d);
    const p1=Object.values(j.phase1).filter(v=>v==='done').length;
    const p1f=Object.values(j.phase1).filter(v=>v?.startsWith('fail:')).length;
    const p2=Object.values(j.phase2).filter(v=>v==='done').length;
    console.log('Phase1:',p1,'done,',p1f,'fail');
    console.log('Phase2:',p2,'done');
  })"

# 생성 파일 수
ls tools/generated-img/fig_*.png 2>/dev/null | wc -l
ls tools/generated-glb/*.glb 2>/dev/null | wc -l

# 게임 에셋 수
ls src/assets/models/*.glb 2>/dev/null | wc -l
ls src/assets/cards/*.png 2>/dev/null | wc -l

# 상품 테이블 확인
node -e "const p=require('./src/data/products.json');
  const m=p.filter(x=>x.type!=='card'), c=p.filter(x=>x.type==='card');
  console.log('모델:',m.length,'카드:',c.length,'총:',p.length);
  const gs={};p.forEach(x=>gs[x.grade]=(gs[x.grade]||0)+1);
  console.log('등급:',gs);"

# QA 합격률
cat tools/qa-report.json | node -e "
  let d='';process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    const j=JSON.parse(d);
    console.log('합격:',j.stats?.passed,'/',j.stats?.passed+j.stats?.failed);
    if(j.failedIds?.length) console.log('불합격:',j.failedIds.join(', '));
  })"
```

## 중단 / 재시작

```bash
# ComfyUI 즉시 중단
curl -X POST http://100.66.10.225:8188/interrupt
curl -X POST http://100.66.10.225:8188/queue -H "Content-Type: application/json" -d '{"clear":true}'

# LM Studio 모델 수동 언로드
curl -X POST http://100.66.10.225:1234/api/v1/models/unload \
  -H "Content-Type: application/json" -d '{"instance_id":"qwen/qwen3-vl-8b"}'

# 이어서 실행
node tools/asset-pipeline.mjs              # checkpoint에서 자동 복구
node tools/asset-pipeline.mjs --retry-failed  # 실패 항목만 재시도
node tools/asset-pipeline.mjs --reset        # 처음부터
```

## 옵션 레퍼런스

### asset-pipeline.mjs

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--phase 1/2` | 특정 Phase만 | `all` |
| `--ids id1,id2` | 특정 ID만 | 전체 |
| `--reset` | checkpoint 초기화 | 이어서 |
| `--retry-failed` | 실패 재시도 | 건너뜀 |
| `--comfy-url` | ComfyUI 주소 | `http://100.66.10.225:8188` |
| `--img-batch N` | Phase1 VRAM 정리 간격 | `10` |
| `--glb-batch N` | Phase2 VRAM 정리 간격 | `3` |

### qa-pipeline.mjs

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--qa-only` | 검수만 | 루프 |
| `--pass-rate 0.95` | 합격률 목표 | `0.9` |
| `--max-rounds N` | 최대 라운드 | `10` |
| `--batch N` | 배치 크기 | `10` |
| `--lm-url` | LM Studio 주소 | `http://100.66.10.225:1234` |
| `--model` | 비전 모델 | `qwen/qwen3-vl-8b` |

### grade-products.mjs

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--url` | LM Studio 주소 | `http://100.66.10.225:1234` |
| `--model` | 텍스트 모델 | `qwen/qwen3-8b` |
| `--batch N` | 배치 크기 | `10` |
| `--models-only` | 3D 모델만 판정 | 전체 |
| `--cards-only` | 카드만 판정 | 전체 |

### generate-prompts.mjs

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--dry-run` | 미리보기 | 저장 |
| `--max N` | 최대 수 | 전체 |
| `--theme NAME` | 주제 필터 | 전체 |
| `--style NAME` | 스타일 필터 | 전체 |

## 파일 구조

```
tools/
├── generate-prompts.mjs       # 프롬프트 조합 생성 (100주제 x 10스타일)
├── asset-pipeline.mjs         # ComfyUI 파이프라인 (text2img + img2glb)
├── qa-pipeline.mjs            # LM Studio 비전 검수 + 재생성 루프
├── grade-products.mjs         # LM Studio 등급/가격 판정 → products.json
├── run-full-pipeline.mjs      # 전체 오케스트레이터
├── product-prompts.json       # 현재 프롬프트 목록
├── text2img.json              # ComfyUI 워크플로우 (이미지)
├── img2glb.json               # ComfyUI 워크플로우 (TRELLIS.2)
├── glb-preview.html           # GLB 뷰어
├── generated-img/             # [gitignore] Phase1 이미지 출력 → src/assets/cards/
├── generated-glb/             # [gitignore] Phase2 GLB 출력 → src/assets/models/
├── pipeline-checkpoint.json   # [gitignore] Phase1/2 진행상황
└── qa-report.json             # [gitignore] QA 검수 리포트

src/
├── assets/
│   ├── models/                # GLB 피규어 모델 (3D 상품)
│   └── cards/                 # PNG 카드 이미지 (2D 카드 상품)
└── data/
    └── products.json          # 전체 상품 테이블 (모델 + 카드)
```

## 게임 상품 구조

### 상품 타입

| 타입 | 렌더링 | 가격대 | 비고 |
|------|--------|--------|------|
| 3D 모델 | GLB → Three.js GLTFLoader | 5,000~500,000원 | 회전 + 부유 애니메이션 |
| 2D 카드 | PNG → 3D 카드 메시 (앞/뒤/테두리) | 3,000~150,000원 | 금색 테두리, 앞면 이미지 |

### 상자 → 상품 흐름

1. `BoxGenerator` — 가격 밴드에 따라 `products.json`에서 상품 선택
2. 카드/모델 자동 혼합 (가격 범위 매칭)
3. `ProductRenderer` — `type === 'card'` → 카드 메시, 아니면 GLB 로드
4. 히든 상품 — 상위 20% 가격 풀에서 랜덤 선택

## TRELLIS.2 16GB VRAM 수정사항

`D:\comfy\custom_nodes\ComfyUI-TRELLIS2\nodes\`:

- **`trellis_utils/lazy_manager.py`**: `cpu_offload` 모드에서 `enable_disk_offload=True` → 서브모델 on-demand 로드
- **`trellis2/pipelines/base.py`**: `_unload_model`에서 모델 삭제 + `gc.collect()` + `torch.cuda.empty_cache()`

Docker 재시작 후 적용: `docker restart comfyui`
