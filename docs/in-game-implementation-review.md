# In-Game 구현 상태 리뷰

## 범위

- 기준 문서: `README.md`
- 비교 대상: `src/` 아래 현재 인게임 루프 구현
- 목적: 실제 플레이 가능한 범위와 설계 대비 차이, 구현 리스크를 정리

## 한줄 요약

현재 빌드는 `상자 세트 생성 -> 상자 선택/구매 -> 낙하/개봉 -> 상품 공개 -> 판매 -> 다음 상자 또는 다음 세트`까지는 실제로 플레이 가능한 상태다.  
반면 README에서 강조한 `상품 상태 시각화`, `상태 기반 등급 판정`, `파산 시 복구 미니게임`, `시장/보너스 확장 루프`는 아직 없거나 단순화되어 있다.

## 현재 구현된 인게임 루프

### 1. 세트 시작과 저장 복구

- 새 세트 시작, 저장 복구, 세트 교체 흐름이 `src/main.js`에 연결되어 있다: `startNewSet()` / `resumeFromSave()` / `swapBoxes()` in `src/main.js:28`, `src/main.js:41`, `src/main.js:66`
- 게임 상태 저장, 로드, 오프라인 보상은 `GameStateManager`가 담당한다: `src/core/GameStateManager.js:31`, `src/core/GameStateManager.js:49`, `src/core/GameStateManager.js:72`
- 초기 자금 10만 원, 오프라인 보상, 박스 상태 복구까지는 구현되어 있다: `src/core/GameStateManager.js:13`, `src/core/GameStateManager.js:76`

### 2. 박스 선택 단계

- 한 세트는 10개 박스로 생성된다: `src/systems/BoxGenerator.js:13`
- 세트 총가치 범위를 먼저 잡고 각 박스 내부 가치를 분배하는 구조는 들어가 있다: `src/systems/BoxGenerator.js:14`, `src/systems/BoxGenerator.js:18`
- 박스는 2~4개 타워로 쌓이고, 각 타워 최상단 박스만 선택 가능하다: `src/scenes/BoxSelectionScene.js:71`, `src/scenes/BoxSelectionScene.js:221`, `src/scenes/BoxSelectionScene.js:272`
- 가격 태그와 잔액 기반 구매 가능 표시도 구현되어 있다: `src/scenes/BoxSelectionScene.js:142`, `src/scenes/BoxSelectionScene.js:235`

### 3. 구매, 낙하, 개봉, 결과 표시

- 박스 구매와 자금 차감, 낙하 시작은 `box:select` 이벤트에서 연결된다: `src/main.js:80`
- 박스 낙하 물리, 착지 후 플레이 가능 상태 전환, 클릭 개봉은 `UnboxingScene`에 구현돼 있다: `src/scenes/UnboxingScene.js:66`, `src/scenes/UnboxingScene.js:185`, `src/scenes/UnboxingScene.js:230`, `src/scenes/UnboxingScene.js:344`
- 개봉 애니메이션, 컨페티, 상품 상승 연출, 결과 상태 진입도 구현돼 있다: `src/scenes/UnboxingScene.js:111`, `src/scenes/UnboxingScene.js:253`, `src/scenes/UnboxingScene.js:296`, `src/scenes/UnboxingScene.js:328`
- 결과 팝업과 판매 버튼 노출은 HUD와 `box:open` 이벤트로 연결된다: `src/main.js:115`, `src/ui/HUD.js:92`

### 4. 판매와 다음 루프

- 판매 시 자금 증가, 코인 연출, 박스 숨김, 남은 박스 검사 후 다음 상자 또는 다음 세트로 이동한다: `src/main.js:128`, `src/main.js:145`, `src/main.js:159`
- 상품 판매 자체는 `GameStateManager.sellProduct()`로 상태 처리한다: `src/core/GameStateManager.js:122`

## 설계 대비 부분 구현

### 1. 세트 총가치 기반 박스 분배

README의 핵심인 `10개 세트 총가치 -> 개별 박스 분배` 구조는 들어가 있다.  
다만 실제 플레이어가 추론할 수 있는 정보는 `가격 태그`, `박스 크기`, `탑 구조` 정도라서, README가 묘사한 강한 추리/심리전까지는 아직 약하다.

근거:

- 총가치 설정 및 분배: `src/systems/BoxGenerator.js:14`, `src/systems/BoxGenerator.js:18`
- 가격은 내부 가치에 잡음값을 곱해 별도로 계산: `src/systems/BoxGenerator.js:22`, `src/systems/BoxGenerator.js:23`
- 크기는 내부 가치 비율로 계산: `src/systems/BoxGenerator.js:24`

### 2. 타워 클리어 보너스

타워를 비우면 남은 최상단 박스들에 할인 보너스를 주는 시스템은 구현돼 있다.  
이건 README의 위험/보상 구조를 살리는 방향이지만, 현재는 할인 수치만 바뀌고 별도 설명이나 피드백이 거의 없다.

근거:

- 유효 가격 계산: `src/scenes/BoxSelectionScene.js:142`
- 보너스 소모: `src/scenes/BoxSelectionScene.js:152`
- 타워 클리어 시 할인 부여: `src/scenes/BoxSelectionScene.js:178`, `src/scenes/BoxSelectionScene.js:192`, `src/scenes/BoxSelectionScene.js:197`

### 3. 데이터 기반 상품 풀과 3D 프리셋

README의 `대량 상품 데이터 + GLB + 프리셋` 방향은 상당 부분 반영돼 있다.

- CSV/manifest 로딩: `src/data/products.js:27`, `src/data/products.js:73`, `src/data/products.js:88`
- GLB 로딩과 캐시: `src/core/AssetLoader.js:15`
- 프리셋 적용 렌더링: `src/rendering/ProductRenderer.js:31`, `src/rendering/ProductRenderer.js:66`

## 아직 구현되지 않았거나 축약된 부분

### 1. 상품 상태 시각화

README는 스크래치, 먼지, 변색, 광택 저하 같은 `상태`가 등급과 가격에 직접 연결된다고 설명한다.  
현재 코드는 그런 상태 파라미터를 따로 생성하거나 시각화하지 않고, 등급만 확률 테이블에서 바로 뽑는다.

근거:

- 등급은 고정 가중치 룰렛: `src/systems/GradeSystem.js:5`, `src/systems/GradeSystem.js:15`
- 가격은 `baseValue * grade * rarity * marketAdj`: `src/systems/PricingCalculator.js:4`, `src/systems/PricingCalculator.js:6`

### 2. 상태 기반 등급 판정

README는 “상품별 상태 파라미터 + 판정 테이블”에 가깝다.  
현재는 `rollGrade(boxDef.product.category)`처럼 카테고리를 넘기지만, 실제 `rollGrade()`는 인자를 사용하지 않는다.

근거:

- 카테고리 전달: `src/scenes/UnboxingScene.js:101`
- 인자 미사용 등급 롤: `src/systems/GradeSystem.js:15`

### 3. 파산 후 복구 미니게임

README에는 자금이 바닥나면 반복 노동 미니게임으로 복구하는 루프가 있다.  
현재 구현에는 오프라인 보상은 있지만, 파산 상태 진입이나 복구 미니게임은 없다.

근거:

- 자금 부족 시 구매 실패 힌트만 표시: `src/main.js:82`
- 별도 파산 상태/미니게임 상태 없음: `src/core/GameStateManager.js:17`

### 4. 시장, VIP 상자, 연속 보너스 같은 확장 경제

README 하단 확장 항목에 있는 시장 변동, VIP 상자, 연속 보너스, 창고/전시 등은 아직 없다.  
현재 시장 요소는 판매 시점의 단순 랜덤 배수 하나뿐이다.

근거:

- 시장 보정 랜덤값: `src/systems/PricingCalculator.js:5`

## 리뷰 관점의 핵심 차이와 리스크

### 1. 박스 내부 가치가 최종 판매가까지 강하게 이어지지 않는다

세트 총가치와 박스 내부 가치는 생성되지만, 최종 판매가는 결국 선택된 상품의 `baseValue`를 중심으로 다시 계산된다.  
즉 README가 말하는 `세트 총가치 기반 심리전`보다, 현재는 `근사한 상품 뽑기 + 확률형 등급 보정`에 더 가깝다.

근거:

- 박스 내부 가치 기반 상품 선택: `src/systems/BoxGenerator.js:21`, `src/systems/BoxGenerator.js:32`
- 최종 판매가는 상품 baseValue 중심: `src/systems/PricingCalculator.js:6`

영향:

- 플레이어가 박스 가격과 크기에서 읽어야 할 정보량이 줄어든다.
- 세트 단위의 숨은 총가치 개념이 경제 루프에 약하게 반영된다.

### 2. 등급 시스템이 설계 대비 너무 단순하다

현재 등급은 모든 상품에 동일한 가중치 테이블을 쓰며, 상태 파라미터도 없다.  
이 구조에서는 “같은 모델이라도 상태 차이로 가치가 크게 달라진다”는 설계의 핵심 감각이 부족하다.

근거:

- 공통 등급 테이블: `src/systems/GradeSystem.js:5`
- 카테고리 인자 미사용: `src/scenes/UnboxingScene.js:101`, `src/systems/GradeSystem.js:15`

### 3. 타워 클리어 보너스는 시스템상 존재하지만 피드백이 약하다

타워를 비우면 할인 보너스가 발생하지만, 플레이어에게 명확히 전달되는 이벤트/HUD 설명이 없다.  
시스템은 있는데 체감이 약한 상태다.

근거:

- 보너스 이벤트 emit: `src/scenes/BoxSelectionScene.js:197`
- 메인/HUD에서 `tower:cleared` 수신 처리 없음: `src/main.js`, `src/ui/HUD.js`

### 4. 상품 데이터 로딩 범위가 세션마다 달라진다

manifest에서 CSV 전체를 읽지 않고 매번 1~2개만 랜덤 선택한다.  
성능 목적은 이해되지만, 밸런스 재현성과 디버깅 일관성은 떨어진다.

근거:

- 랜덤 선택: `src/data/products.js:58`, `src/data/products.js:79`

영향:

- 같은 빌드라도 새로고침할 때 상품 풀 성격이 크게 달라질 수 있다.
- 플레이 테스트 결과 재현이 어려워진다.

## 종합 판단

현재 상태는 `프로토타입으로서의 인게임 루프`는 성립한다.  
특히 박스 선택, 3D 개봉 연출, 판매 후 다음 루프로 이어지는 플레이 감각은 이미 확인 가능한 수준이다.

하지만 README가 목표로 삼는 게임의 정체성은 아직 절반 정도만 반영돼 있다.

- 구현 강점: 3D 연출, 루프 연결, 저장/복구, 대량 GLB 데이터 기반 구조
- 부족한 핵심: 상태 기반 감정평가, 세트 단위 경제 심리전, 파산 복구 루프, 장기 경제 확장

## 우선순위 제안

### 1순위

- `grade`를 단순 확률이 아니라 `condition state` 묶음으로 분해
- 판매가를 `box innerValue`와 더 직접 연결
- 타워 클리어 보너스를 HUD에서 명확히 알리기

### 2순위

- 자금 고갈 시 복구 미니게임 또는 최소 보정 루프 추가
- 시장 변동을 세션 단위 상태로 관리해 단순 랜덤보다 예측 가능한 경제로 확장

### 3순위

- 랜덤 CSV 1~2개 로딩 정책을 옵션화해서 테스트/실서비스 모드를 분리

