# SecondBrain

Obsidian용 Git 동기화 + Claude 플러그인입니다. 버튼 하나로 vault의 변경사항을 commit, pull, push하고, Claude로 문서를 분석합니다.

## 주요 기능

- **원클릭 동기화**: 리본 버튼 또는 커맨드로 commit → pull → push 실행
- **자동 동기화**: 설정한 간격(기본 5분)으로 자동 동기화
- **멀티 리포 지원**: vault root 및 하위 3단계 깊이까지 git 저장소를 자동 탐지하고 개별 관리
- **충돌 처리**: merge 충돌 시 원격 버전을 유지하고 로컬 버전을 별도 파일로 저장
- **데스크톱/모바일 지원**: 데스크톱은 시스템 git, 모바일은 isomorphic-git 사용
- **Claude 연동**: 프롬프트 템플릿 기반으로 현재 문서를 Claude로 분석 (Desktop 전용)

## 동기화 흐름

1. 로컬 변경사항 stage & commit
2. 원격에서 pull (merge 전략)
3. 원격으로 push

push 실패(non-fast-forward) 시 자동으로 re-pull 후 재시도합니다.

## 충돌 처리

같은 파일의 같은 부분을 수정한 경우 merge 충돌이 발생합니다.

1. **원본 파일** → 원격(remote) 버전으로 업데이트
2. **conflicted copy** → 로컬 버전을 `파일명-YYYYMMDD-HHmmss-conflicted-copy.확장자`로 저장
3. **충돌 로그** → vault root에 `sync-conflict-YYYYMMDD-HHmmss.md` 생성

같은 파일이라도 수정한 부분이 다르면 git이 자동으로 merge하며 충돌이 발생하지 않습니다.

## Claude

현재 열린 문서에 대해 Claude 작업을 실행합니다. 리본의 ✨(sparkles) 버튼 또는 커맨드 팔레트(`SecondBrain: Claude - 현재 문서 작업`)에서 사용합니다.

### 프롬프트 템플릿

프롬프트 폴더(기본: `io-second-brain/프롬프트`)에 `.md` 파일을 추가하면 자동으로 액션 목록에 나타납니다. 파일 이름이 액션 이름이 됩니다.

템플릿에서 사용 가능한 변수:

| 변수 | 설명 |
|------|------|
| `{{content}}` | 현재 열린 문서의 전체 내용 |
| `{{fileName}}` | 현재 열린 문서의 파일 이름 |
| `{{inputName}}` | frontmatter로 정의한 사용자 입력값 |

#### 예시: `요약하기.md`

```markdown
다음 문서를 한국어로 요약해주세요. 핵심 내용을 간결하게 정리해주세요.

파일: {{fileName}}

---

{{content}}
```

#### 예시: `문서검색.md` (사용자 입력 포함)

frontmatter에 `inputs`를 정의하면 실행 전 입력 폼이 표시됩니다. 입력값은 `{{name}}`으로 치환되며, 템플릿에 해당 변수가 없으면 프롬프트 끝에 자동 추가됩니다.

```markdown
---
inputs:
  - name: query
    label: 검색어
    placeholder: 검색할 내용을 입력하세요
---
질문을 받으면 볼트 내 마크다운 파일을 탐색하여 관련 내용을 찾아주세요.

검색어: {{query}}

{{content}}
```

**입력 필드 옵션:**

| 항목 | 설명 | 기본값 |
|------|------|--------|
| `name` | 변수명 (`{{name}}`으로 사용) | 필수 |
| `label` | 입력 폼에 표시할 라벨 | `name` |
| `placeholder` | 플레이스홀더 텍스트 | - |
| `type` | `text` 또는 `textarea` | `text` |

### 사전 요구사항

- **Desktop 전용** (모바일 미지원)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) 설치 필요
- 설정에서 Claude 활성화 필요

### 모델 선택

설정에서 Sonnet 또는 Opus 모델을 선택할 수 있습니다.

## 설정

### Claude

| 항목 | 설명 | 기본값 |
|------|------|--------|
| Claude 활성화 | Claude 기능 on/off | `off` |
| 모델 | 사용할 모델 (Sonnet / Opus) | `Sonnet` |
| 프롬프트 폴더 | 프롬프트 템플릿 파일이 있는 폴더 경로 | `io-second-brain/프롬프트` |

### Git 동기화

| 항목 | 설명 | 기본값 |
|------|------|--------|
| 커밋 메시지 | 커밋 메시지 (`{{date}}` 사용 가능) | `vault backup: {{date}}` |
| 날짜 형식 | `{{date}}` 치환 형식 (Moment.js) | `YYYY-MM-DD HH:mm:ss` |
| 자동 동기화 간격 | 자동 동기화 간격 (분, 0이면 비활성화) | `5` |
| 비밀번호 / PAT | 모바일 전용, GitHub Personal Access Token | - |
| 저장소 | 탐지된 저장소별 활성/비활성 토글 | - |

## 커맨드

| 커맨드 | 설명 |
|--------|------|
| Claude - 현재 문서 작업 | 현재 문서에 Claude 프롬프트 실행 (Desktop 전용) |
| Sync Now | 즉시 동기화 실행 |
| Rescan Repositories | 저장소 재탐지 |
| View Conflicts | 최근 충돌 로그 열기 |

## 플랫폼별 인증

- **데스크톱**: 시스템 git 설정 사용 (SSH 키, credential helper 등)
- **모바일**: 설정에서 Personal Access Token 입력

## 빌드

```bash
npm install
npm run build
```

## 설치

`dist/` 폴더의 `main.js`, `manifest.json`, `styles.css`를 vault의 `.obsidian/plugins/second-brain/`에 복사합니다.

## 보안 및 개인정보

### 데이터 처리

- **Claude 기능**: 현재 열린 문서의 내용이 Anthropic Claude API로 전송됩니다. 민감한 정보가 포함된 문서에 주의하세요.
- **Git 동기화**: 설정된 원격 저장소로 vault 내용이 push됩니다. 원격 저장소의 접근 권한을 확인하세요.

### 인증 정보 저장

- **데스크톱**: 시스템 git 설정(SSH 키, credential helper)을 사용하며, 플러그인이 별도로 저장하지 않습니다.
- **모바일**: GitHub Personal Access Token을 `localStorage`에 저장합니다. 기기 분실 시 GitHub에서 토큰을 폐기하세요.
- **Claude API 키**: 플러그인이 직접 관리하지 않습니다. Claude Code CLI가 자체적으로 인증을 처리합니다.
