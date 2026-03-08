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

## 작업 규칙

1. 코드 수정 작업이 끝나면 `/simplify` 스킬을 실행하여 코드 품질을 점검한다.
2. 변경된 내용은 `README.md`에 누락된 내용이 없는지 확인하고 업데이트한다.
3. 모든 작업이 끝나면 `/commit-commands:commit` 실행 여부를 사용자에게 물어본다.
