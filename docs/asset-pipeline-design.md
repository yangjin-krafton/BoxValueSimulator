# Asset Generation Pipeline 설계

ComfyUI 기반 자동 3D 모델 생성 파이프라인.
피규어/아이템 이미지를 생성한 뒤, 3D 모델(GLB)로 변환하여 게임 리소스로 통합한다.

## 인프라

| 항목 | 값 |
|------|-----|
| ComfyUI 서버 | `http://100.66.10.225:8188/` |
| GPU | RTX 5080 16GB |
| Text-to-Image 워크플로우 | `tools/text2img.json` |
| Image-to-GLB 워크플로우 | `tools/img2glb.json` |

## 워크플로우 분석

### 1단계: Text-to-Image (`text2img.json`)

```
[CLIPLoader] → [CLIPTextEncode] → [KSampler] → [VAEDecode] → [SaveImage]
     ↑              ↑ (prompt)        ↑
[UNETLoader]                    [EmptyLatentImage 512x512]
```

| 노드 | 역할 | 파라미터화 대상 |
|-------|------|-----------------|
| `50` (CLIPTextEncode) | 프롬프트 입력 | `text` — 생성할 피규어 설명 |
| `49` (KSampler) | 샘플링 | `seed` — 매 실행마다 랜덤, `steps`=7, `denoise`=0.5 |
| `9` (SaveImage) | 이미지 저장 | `filename_prefix` — 제품 ID로 설정 |
| `96` (EmptyLatentImage) | 해상도 | 512x512 고정 |

- **모델**: `z_image_turbo_bf16.safetensors` (Lumina2 Turbo)
- **CLIP**: `qwen_3_4b.safetensors`
- **속도**: steps=7, ddim — 이미지당 약 3~5초 예상

### 2단계: Image-to-GLB (`img2glb.json`)

```
[LoadImage] → [ImageResize 1024x1024] → [RemoveBg] → [TRELLIS.2 Conditioning]
                                                           ↓
                                         [ImageToShape] → [ShapeToTexturedMesh] → [ExportGLB]
```

| 노드 | 역할 | 파라미터화 대상 |
|-------|------|-----------------|
| `80` (LoadImage) | 입력 이미지 | `image` — 1단계 출력 파일명 |
| `72` (ExportGLB) | GLB 내보내기 | `filename_prefix` — 제품 ID |
| `68` (LoadTrellis2Models) | 모델 로드 | `vram_mode`=`cpu_offload` (16GB 대응) |

- **배경 제거**: RMBG-1.4 (자동)
- **Shape 생성**: ss_steps=12, shape_steps=12
- **Texture 생성**: tex_steps=24
- **출력**: decimation 100k faces, 1024 texture
- **소요시간**: 모델당 약 60~120초 예상 (cpu_offload 포함)

## GPU 메모리 관리 전략

RTX 5080 16GB에서 두 워크플로우를 연속 실행하면 VRAM 누적으로 OOM 위험이 있다.

### 해결 방법

1. **배치 분리 실행**: text2img를 모두 먼저 완료 → img2glb를 별도로 실행
2. **워크플로우 간 메모리 정리**: ComfyUI `/free` API 호출
   ```
   POST /free
   {"unload_models": true, "free_memory": true}
   ```
3. **배치 사이 쿨다운**: N개 처리 후 `/free` 호출 → 2초 대기
4. **img2glb는 이미 cpu_offload 모드**: TRELLIS.2가 필요 시 CPU로 오프로드

### 안전 장치

- 각 워크플로우 실행 전 `/system_stats` 로 VRAM 사용량 확인
- VRAM 사용률 > 80% 시 `/free` 호출 후 재시도
- 3회 연속 실패 시 해당 아이템 스킵 + 로그 기록
- 각 단계 완료 시 진행상황 JSON 저장 (재시작 가능)

## 파이프라인 실행 흐름

```
┌─────────────────────────────────────────────────────┐
│  1. 제품 테이블 로드 (product-prompts.json)          │
│     - id, prompt(영문/중문), category                │
├─────────────────────────────────────────────────────┤
│  2. Phase 1: Text → Image (배치)                     │
│     for each product:                                │
│       - text2img 워크플로우 실행                      │
│       - 완료 대기 (polling /history)                  │
│       - 출력 이미지 다운로드 → tools/generated-img/   │
│       - 매 10개마다 /free 호출                        │
│     ✓ checkpoint 저장                                │
├─────────────────────────────────────────────────────┤
│  3. Phase 2: Image → GLB (배치)                      │
│     - /free 호출 (Phase 1 모델 언로드)                │
│     for each generated image:                        │
│       - img2glb 워크플로우 실행                       │
│       - 완료 대기 (polling /history)                  │
│       - GLB 다운로드 → src/assets/models/             │
│       - 매 5개마다 /free 호출                         │
│     ✓ checkpoint 저장                                │
├─────────────────────────────────────────────────────┤
│  4. Phase 3: 후처리                                  │
│     - scan-models.mjs 실행 (CSV 생성)                │
│     - 또는 직접 products.csv에 추가                   │
└─────────────────────────────────────────────────────┘
```

## ComfyUI API 사용

### 워크플로우 실행
```
POST /prompt
Content-Type: application/json

{"prompt": <workflow_json>, "client_id": "asset-pipeline"}
```
응답: `{"prompt_id": "xxx"}`

### 완료 확인
```
GET /history/{prompt_id}
```
응답의 `outputs` 필드에서 결과 파일명 확인.

### 결과 다운로드
```
GET /view?filename={name}&subfolder={sub}&type=output
```

### 메모리 정리
```
POST /free
{"unload_models": true, "free_memory": true}
```

### 시스템 상태
```
GET /system_stats
```
`devices[0].vram_free` 로 여유 VRAM 확인.

## 제품 프롬프트 테이블 (`tools/product-prompts.json`)

```json
[
  {
    "id": "figure_warrior",
    "prompt": "game figure, warrior character, chibi style, full body, white background, high quality",
    "category": "피규어"
  },
  {
    "id": "item_sword_gold",
    "prompt": "game item, golden sword, fantasy weapon, icon style, white background",
    "category": "무기"
  }
]
```

프롬프트 규칙:
- 영문 또는 중문 (Lumina2 모델이 양쪽 지원)
- `white background` 필수 (배경 제거 품질 향상)
- `icon style` 또는 `full body` 로 구도 지정
- 512x512 해상도에 맞는 단순한 구도

## 파일 구조

```
tools/
├── text2img.json              # ComfyUI 워크플로우 (기존)
├── img2glb.json               # ComfyUI 워크플로우 (기존)
├── asset-pipeline.mjs         # 메인 파이프라인 스크립트
├── product-prompts.json       # 생성할 제품 프롬프트 목록
├── generated-img/             # Phase 1 출력 이미지
├── generated-glb/             # Phase 2 출력 GLB (다운로드 후 models/로 복사)
└── pipeline-checkpoint.json   # 진행상황 (재시작용)
```

## 실행 방법

```bash
# 전체 파이프라인 실행
node tools/asset-pipeline.mjs

# Phase 1만 (이미지 생성)
node tools/asset-pipeline.mjs --phase 1

# Phase 2만 (GLB 변환)
node tools/asset-pipeline.mjs --phase 2

# 특정 제품만
node tools/asset-pipeline.mjs --ids figure_warrior,item_sword_gold

# 건너뛴 항목 재시도
node tools/asset-pipeline.mjs --retry-failed
```
