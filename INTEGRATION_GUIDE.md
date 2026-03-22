# BaseMark v1 UI - 코드 통합 가이드

## 📋 개요

이 문서는 새로운 v1 UI를 기존 BaseMark 저장소와 통합하는 방법을 설명합니다.

**파일 변경 사항:**
- `src/ui/index.html` - 새 HTML 구조로 대체
- `src/ui/styles.css` - 새 CSS로 대체
- `src/ui/app.js` - 새 통합 로직으로 대체

---

## 🔧 통합 단계

### Step 1: 파일 백업

```bash
cd basemark

# 기존 파일 백업
cp src/ui/index.html src/ui/index.html.backup
cp src/ui/styles.css src/ui/styles.css.backup
cp src/ui/app.js src/ui/app.js.backup
```

### Step 2: 새 파일 복사

```bash
# 생성된 파일들을 저장소로 복사
cp /mnt/user-data/outputs/basemark_v1_index.html src/ui/index.html
cp /mnt/user-data/outputs/basemark_v1_styles.css src/ui/styles.css
cp /mnt/user-data/outputs/basemark_v1_app_integrated.js src/ui/app.js
```

### Step 3: 의존성 확인

새 앱이 사용하는 엔진 모듈들이 이미 있는지 확인:

```bash
# 필수 엔진 모듈 확인
ls -la src/ui/engine/
```

필요한 파일들:
- ✅ `src/ui/engine/baseMarkEngine.js`
- ✅ `src/ui/engine/models.js`
- ✅ `src/ui/engine/photoAnchorSuggester.js`
- ✅ `src/ui/engine/drawingStructureExtractor.js`

### Step 4: 서버 테스트

```bash
# 개발 서버 시작
npm run app

# 브라우저에서 접속
open http://localhost:3000
```

---

## 🎯 주요 변경사항

### HTML 구조

**기존:**
```html
<main class="app-frame">
  <aside class="sidebar">...</aside>
  <section class="main-shell">
    <header class="topbar">...</header>
    <section class="screen-stack">
      <section class="screen" data-screen="home">...</section>
      <section class="screen" data-screen="engine">...</section>
      <section class="screen" data-screen="workspace">...</section>
    </section>
  </section>
</main>
```

**새로운:**
```html
<div class="app-container">
  <div class="screen screen-home is-active" data-screen="home">...</div>
  <div class="screen screen-verification" data-screen="verify-step-1">...</div>
  <div class="screen screen-verification" data-screen="verify-step-2">...</div>
  <div class="screen screen-verification" data-screen="verify-step-3">...</div>
  <div class="screen screen-complete" data-screen="complete">...</div>
</div>
```

### CSS 색상 체계

```css
/* 기존 */
--color-primary: #007AFF (파란색)

/* 새로운 */
--color-primary: #FF6B35 (주황색 - 건설 현장용)
```

### JavaScript 아키텍처

**기존:**
- 3775줄의 복잡한 로직
- 다양한 기능 혼합 (비교, 저장, 리뷰, 보고)

**새로운:**
- ~600줄의 간단한 로직
- 단계별 흐름 중심
- 명확한 함수 분리

---

## 🔌 API 호환성

### 기존 엔진 함수들

새 앱이 사용하는 기존 엔진 함수들:

#### 1. `generateComparisonCandidates(scenario)`

```javascript
// 입력
const scenario = {
  segment: { segmentId, segmentKind, label },
  anchors: [
    {
      anchorId,
      segmentId,
      anchorKind,
      geometryType,
      drawingReference: { point: { x, y } },
      fieldObservation: { point: { x, y } },
      stabilityScore,
      visibilityState,
    }
  ],
  checkpoints: [
    {
      checkpointId,
      segmentId,
      anchorBasis: ['anchor-0', 'anchor-1'],
      coordinateModel,
      normalizedPosition: { spanRatio, heightRatio },
      allowedTolerance: { positionSpanRatio, searchSpanRatio },
      semanticExpectation,
    }
  ],
  fieldEvidence: { evidenceId, segmentId, imageRef },
  observedElements: [],
};

// 출력
const candidates = [
  {
    candidateId,
    candidateType: 'missing' | 'extra' | 'position_diff',
    segmentId,
    checkpointId,
    activeAnchors: [],
    reasonCode,
    reviewHint,
    // ... 기타 필드
  }
];
```

#### 2. `suggestPhotoAnchorsFromImageData(input)`

```javascript
// 입력
const input = {
  imageData: ImageData,  // Canvas ImageData 객체
  imageUrl: string,      // base64 또는 URL
};

// 출력
const suggestions = {
  'window-left-top': { x: number, y: number },
  'window-right-top': { x: number, y: number },
  // ...
};
```

#### 3. `extractDrawingStructureFromSvg(svg)`

```javascript
// 입력
const svg = string;  // SVG 마크업

// 출력
const structure = {
  elements: [
    { id, type, position: { x, y }, width, height }
  ]
};
```

---

## 📊 상태 관리 변경

### 기존 상태 구조

```javascript
const state = {
  scenario: { ... },           // 복잡한 구조
  currentScenario: string,
  candidates: [ ... ],
  observedElements: [ ... ],
  // ... 여러 기능이 섞여 있음
};
```

### 새로운 상태 구조

```javascript
const state = {
  currentScreen: string,       // 현재 화면
  verification: {
    photo: string,            // base64
    anchors: [ ... ],         // UI 입력
    candidates: [ ... ],      // 비교 결과
    selectedCandidateIndex: number,
    reviewStatus: { },        // 각 항목의 상태
  },
  currentPreset: string,      // 선택된 기준점 유형
  autoSuggestedAnchors: { },  // 자동 추천
  startTime: number,          // 검증 시작 시간
};
```

---

## 🧪 테스트 검사항목

### 기능 테스트

- [ ] 홈 화면 표시
- [ ] "검증 시작" 버튼 클릭 → Step 1으로 이동
- [ ] 사진 업로드
  - [ ] 파일 선택 대화 열림
  - [ ] 이미지가 캔버스에 표시됨
- [ ] 기준점 선택
  - [ ] 프리셋 버튼 클릭 → 선택 표시
  - [ ] 캔버스 클릭 → 기준점 추가
  - [ ] 기준점 목록 업데이트
- [ ] 다음 버튼
  - [ ] 기준점 < 2개 → 비활성화
  - [ ] 기준점 >= 2개 → 활성화
- [ ] Step 2: 비교 실행
  - [ ] 진행 표시 (스피너)
  - [ ] 결과 요약 표시
  - [ ] 카운트 표시 (누락/추가/위치)
- [ ] Step 3: 결과 검토
  - [ ] 결과 목록 표시
  - [ ] 항목 클릭 → 상세 정보 표시
  - [ ] 탭 필터링 (전체/누락/추가/위치)
  - [ ] 확인/이상/보류 버튼
- [ ] 완료 화면
  - [ ] 성공 메시지 표시
  - [ ] 통계 표시 (시간, 항목 수)
  - [ ] "다시 검증" 버튼

### 성능 테스트

- [ ] 초기 로딩 < 2초
- [ ] 화면 전환 < 500ms
- [ ] 비교 실행 < 3초
- [ ] 메모리 누수 없음

### 호환성 테스트

- [ ] Chrome/Chromium ✅
- [ ] Firefox ✅
- [ ] Safari ✅
- [ ] 모바일 브라우저 (테스트 예정)

---

## 🐛 일반적인 문제 해결

### 문제 1: 엔진 함수 임포트 오류

```
Error: Cannot find module './engine/baseMarkEngine.js'
```

**해결:**
```bash
# 경로 확인
ls -la src/ui/engine/

# import 문 확인 (app.js 첫 줄)
head -5 src/ui/app.js
```

### 문제 2: 캔버스에 이미지가 표시되지 않음

**확인:**
- 사진 파일 형식 확인 (JPG, PNG)
- 파일 크기 확인 (< 10MB)
- 콘솔의 에러 메시지 확인

### 문제 3: 비교 결과가 없음

**확인:**
- 기준점이 2개 이상인지 확인
- scenario 객체 구조 확인
- 콘솔의 에러 메시지 확인

---

## 📝 로깅 및 디버깅

### 콘솔 로그 활성화

브라우저 개발자 도구에서 다음을 확인할 수 있습니다:

```javascript
// app.js에서 디버그 출력
console.log('현재 상태:', state);
console.log('scenario:', buildScenarioFromUI());
console.log('결과:', state.verification.candidates);
```

### 로컬 스토리지 확인

```javascript
// 저장된 검증 목록 확인
JSON.parse(localStorage.getItem('basemark.verification.library.v1'))
```

---

## 🚀 배포 준비

### 프로덕션 빌드

```bash
# CSS 최소화 (선택)
npx csso src/ui/styles.css -o src/ui/styles.min.css

# JavaScript 최소화 (선택)
npx terser src/ui/app.js -o src/ui/app.min.js
```

### 서버 설정

Express 서버(`src/server/basemarkServer.js`)가 다음을 제공하는지 확인:

```javascript
// static 파일 제공
app.use(express.static('src/ui'));

// API 라우트 (필요시)
app.post('/api/engine/run', (req, res) => {
  // 엔진 실행
});
```

---

## 📱 모바일 배포 (Capacitor)

### Android 앱 빌드

```bash
# Capacitor 동기화
npm run android:sync

# Android 앱 실행
npm run android:run
```

### iOS 앱 빌드 (향후)

```bash
# Capacitor iOS 추가
npx cap add ios

# iOS 앱 빌드
npx cap run ios
```

---

## 🔄 역호환성

### 기존 데이터 마이그레이션

v1 이전의 시나리오 데이터를 v1에서 사용하려면:

```javascript
// 기존 scenario 형식 → 새 형식 변환 필요
function migrateScenario(oldScenario) {
  // TODO: 형식 변환 로직
  return newScenario;
}
```

### 저장소 스키마

새 검증 세션은 다음 스키마로 저장됩니다:

```javascript
{
  id: 'session-{timestamp}',
  timestamp: ISO8601,
  duration: milliseconds,
  anchorsCount: number,
  candidatesCount: number,
  reviewStatus: {
    [candidateIndex]: 'confirmed' | 'rejected' | 'pending'
  }
}
```

---

## 📚 참고 자료

### 관련 파일
- 새 UI 설계: `BASEMARK_V1_UI_DESIGN.md`
- 현재 상태 분석: `basemark_analysis.md`
- 원본 engine: `src/ui/engine/baseMarkEngine.js`

### 개발 도구
- 브라우저 개발자 도구 (F12)
- VS Code
- Node.js 24+

---

## ✅ 통합 체크리스트

실제 통합 작업할 때 이용:

- [ ] 파일 백업
- [ ] 새 파일 복사
- [ ] import 경로 확인
- [ ] 서버 시작
- [ ] 기본 기능 테스트
- [ ] 엔진 호출 확인
- [ ] 저장소 저장 확인
- [ ] 모바일 호환성 테스트
- [ ] 배포 준비
- [ ] Git 커밋

---

생성일: 2026-03-20
버전: v1.0.0-integration-guide
