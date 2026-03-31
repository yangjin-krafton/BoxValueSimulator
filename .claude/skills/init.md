# Initialize Game Project for Hub

새로운 게임 프로젝트를 Weeks Game Hub에 등록하고 GitHub Pages로 배포할 수 있도록 설정하는 자동화 스킬입니다.

## Instructions

이 skill은 다음 작업을 자동으로 수행합니다:

### 1. 프로젝트 구조 생성

현재 프로젝트에 다음 구조를 생성합니다:

```
<project-root>/
├── src/
│   ├── index.html (기본 게임 페이지)
│   └── asset/ (리소스 파일: 이미지, 사운드, 데이터 등)
├── sandbox/ (동적인 테스트 공간)
├── thumbs/ (홈 페이지 썸네일 이미지)
├── docs/ (문서 보관)
│   └── devlog/ (개발 일지 보관)
├── package.json (GitHub Pages 배포 스크립트 포함)
└── .github/
    └── workflows/
        └── deploy.yml (GitHub Actions 배포 워크플로우)
```

### 2. 기본 HTML 페이지 생성

`src/index.html`에 다음을 포함하는 기본 게임 페이지를 생성합니다:
- 프로젝트 이름과 설명
- 기본 Canvas 또는 게임 영역
- 모바일 대응 뷰포트 설정
- 기본 스타일링

### 3. Hub Config 업데이트

`F:\Workspace\hub\hub.config.json`의 `apps` 배열에 새 프로젝트를 추가합니다:

필수 필드:
- `id`: 프로젝트 폴더명을 kebab-case로 변환
- `name`: 프로젝트의 표시 이름 (README.md에서 추출)
- `type`: "static"
- `projectDir`: 프로젝트 폴더명
- `route`: `/games/{id}/`
- `staticDir`: 프로젝트 정적 파일 경로 (일반적으로 `{projectDir}/src`)
- `description`: 프로젝트 설명 (README.md에서 추출)
- `tags`: 게임 장르/기술 태그 배열
- `thumbnail`: "/assets/thumbs.png" (기본값)
- `status`: "개발중"
- `progress`: 10

### 4. GitHub Pages 설정

다음 파일들을 생성합니다:

#### package.json
```json
{
  "name": "{project-id}",
  "version": "0.1.0",
  "scripts": {
    "dev": "cd src && python -m http.server 8080",
    "build": "echo 'No build step required for static site'",
    "deploy": "gh-pages -d src"
  },
  "devDependencies": {
    "gh-pages": "^6.1.1"
  }
}
```

#### .github/workflows/deploy.yml
GitHub Pages 자동 배포를 위한 Actions 워크플로우를 생성합니다.

### 5. 실행 순서

1. 현재 프로젝트의 README.md를 읽어 프로젝트 정보 파악
2. 프로젝트 ID 생성 (폴더명을 kebab-case로)
3. `src/` 폴더가 없으면 생성
4. `src/index.html` 생성 (프로젝트 정보 기반)
5. `package.json` 생성
6. `.github/workflows/deploy.yml` 생성
7. `F:\Workspace\hub\hub.config.json` 업데이트
8. 사용자에게 다음 단계 안내:
   - `npm install` 실행
   - GitHub에 저장소 푸시
   - GitHub Settings에서 Pages 활성화 (Source: GitHub Actions)
   - `npm run deploy` 실행하거나 GitHub Actions가 자동 배포 대기

### 사용자 입력 필요 사항

실행 시 사용자에게 다음을 확인/요청합니다:

1. 프로젝트 타입:
   - static (정적 HTML/JS/CSS)
   - node (Node.js 개발 서버 필요)
   - python (Python 서버 필요)

2. 게임 태그 (쉼표로 구분):
   - 예: "rhythm, music, action, mobile"

3. GitHub Pages 배포 필요 여부 (Y/n)

## Usage

```
/init
```

또는 다른 프로젝트에서 실행할 경우:

```
/init --project F:\Workspace\SomeOtherGame
```

## Notes

- 이 skill은 `F:\Workspace\hub\hub.config.json`을 수정합니다
- GitHub Pages 배포를 위해서는 GitHub 저장소가 필요합니다
- hub 서버를 실행하려면 `python3 hub/launcher.py`를 사용하세요