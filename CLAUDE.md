# CLAUDE.md

## 프로젝트 개요

Obsidian 플러그인 (SecondBrain) - Git 동기화 + Claude 연동 플러그인.

- **언어**: TypeScript
- **빌드**: esbuild (`esbuild.config.mjs`)
- **출력**: `dist/` 폴더 (`main.js`, `manifest.json`, `styles.css`)

## 빌드 & 실행

```bash
npm install
npm run build    # 프로덕션 빌드
npm run dev      # 개발 모드 (watch)
```

## 프로젝트 구조

- `src/` - 소스 코드 (엔트리포인트: `main.ts`)
- `src/claude/` - Claude 연동 관련 모듈
- `dist/` - 빌드 출력

## 주요 의존성

- `obsidian` - Obsidian API
- `isomorphic-git` - 모바일용 git
- `simple-git` - 데스크톱용 git
- `@anthropic-ai/claude-agent-sdk` - Claude 연동

## 배포

### 버전 & 릴리스

```bash
npm run release <patch|minor|major>
```

이 명령어 하나로 다음이 순서대로 실행된다:

1. `package.json`, `manifest.json` 버전 동기화
2. `release: v{버전}` 커밋 생성
3. 태그 생성 + 원격 푸시
4. GitHub Action이 빌드 → Release에 `main.js`, `manifest.json`, `styles.css`, zip 첨부

### 버전 규칙

- **patch** (0.1.0 → 0.1.1): 버그 수정
- **minor** (0.1.0 → 0.2.0): 새 기능 추가
- **major** (0.1.0 → 1.0.0): 호환성 깨지는 변경

### 배포 체크리스트

1. 코드 수정 후 `npm run build`로 빌드 확인
2. `README.md` 업데이트 (새 기능/변경사항 반영)
3. `npm run release <patch|minor|major>` 실행
4. GitHub Actions 탭에서 빌드 성공 확인
5. Release 페이지에서 파일 첨부 확인

### 버전 관련 파일

| 파일 | 역할 |
|------|------|
| `package.json` | npm 버전 (스크립트가 자동 업데이트) |
| `manifest.json` | Obsidian이 읽는 버전 (스크립트가 자동 업데이트) |
| `.github/workflows/release.yml` | 태그 푸시 시 빌드 + Release 생성 |
| `scripts/release.mjs` | 버전 bump + 커밋 + 태그 + 푸시 스크립트 |

## 작업 규칙

1. 코드 수정 작업이 끝나면 `/simplify` 스킬을 실행하여 코드 품질을 점검한다.
2. 변경된 내용은 `README.md`에 누락된 내용이 없는지 확인하고 업데이트한다.
3. 모든 작업이 끝나면 `/commit-commands:commit` 실행 여부를 사용자에게 물어본다.
