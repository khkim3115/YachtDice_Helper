# 기여 가이드 — 브랜치 · 커밋 · 릴리스 규약

웹 앱은 `main` 푸시마다 GitHub Pages 로 **자동 배포**된다(연속 배포). 그래서
**코드가 배포되는 시점**과 **사용자에게 패치노트 NEW 가 뜨는 시점**을 분리해 운영한다.
배포는 그때그때, **공지는 모아서**(트렁크 기반 + 패치노트 묶기).

## 브랜치 규약

- 한 이슈 = 한 브랜치, 짧게 유지. 항상 `main` 에서 분기.
- 이름: `<type>/<이슈번호>-<짧은-설명>`
  - 예) `feat/25-patch-notes`, `fix/31-dice-hold`, `chore/40-deps-bump`, `docs/42-readme`
- `type` 은 커밋 `type` 과 동일: `feat` / `fix` / `chore` / `docs` / `refactor` / `style` / `test`
- `main` 에 직접 커밋 금지 — 자동배포라 항상 "배포 가능" 상태를 유지한다.

## 커밋 규약 (Conventional Commits, 한국어)

- 형식: `<type>(<scope>): <한국어 설명> (#이슈)`
  - 예) `feat(ui): 패치노트 확인 모달 추가 (#25)`
- `scope` 예: `ui`, `solo`, `helper`, `leaderboard`, `desktop`, `web`, `naming`, `deps` …

## PR & 머지

- 브랜치 → PR(대상 `main`). 본문에 `Closes #이슈` 를 넣으면 머지 시 이슈가 자동으로 닫힌다.
- **Squash merge** 사용 → `main` 히스토리 = "이슈 1개 = 커밋 1줄 `(#PR)`".
- 머지되면 곧바로 자동 배포된다(코드 기준 즉시 반영, 단 NEW 공지는 아래 참고).

## 릴리스 & 패치노트 (방안 A)

1. 작은 단위로 자유롭게 `main` 에 머지한다. 그때마다 조용히 배포되며 **NEW 는 뜨지 않는다.**
2. 묶을 만큼 모이면 패치노트를 **한 번에** 올린다:
   - `src/data/changelog.ts` 의 `CHANGELOG` **맨 위(index 0)** 에 새 버전 항목 1개를 추가
     (그동안의 변경을 종류별로 한 줄씩 정리).
   - 항목을 추가하면 `LATEST_VERSION` 이 자동 갱신된다 →
     **이 순간 사용자에게 헤더 NEW 배지 + (재방문 사용자엔) 자동 모달이 뜬다.**
   - 버전 문자열은 `package.json` 과 **분리된 웹 공개 버전**(예: `0.5.0`). semver 권장.
3. 같은 버전으로 annotated 태그 `web-vX.Y.Z` 를 그 배포(머지) 커밋에 달아 push 한다(데스크톱 트레이의 `tray-vX.Y.Z` 와 평행).
   **태그만** 단다 — `web-v*` 로 GitHub Release 를 만들지 않는다([트레이 앱 릴리스](#트레이-앱-릴리스) 경고 참고).

### 패치노트 항목 작성 요령

- `type`: `feature`(✨ 새 기능) / `improvement`(🔧 개선) / `fix`(🐛 버그 수정)
- 개발 용어 대신 **사용자 언어**로, 한 항목 = 한 변경. 작성 예시는 `src/data/changelog.ts` 참고.

## 버전 체계

| 대상 | 버전 출처 | 태그 | 배포 |
|---|---|---|---|
| 웹 앱 | `src/data/changelog.ts` 의 `LATEST_VERSION` | `web-vX.Y.Z` | `main` push → Pages 자동 |
| 트레이 앱 | `desktop/package.json` | `tray-vX.Y.Z` | GitHub Release → `desktop-release.yml` |

루트 `package.json` 의 `version` 은 사용자에게 노출되지 않는다 — 패치노트 버전이 웹의 단일 진실원본.

## 트레이 앱 릴리스

트레이 앱은 `main` 머지로 배포되지 않는다 — **GitHub Release 발행**이 빌드·배포 트리거다
([`desktop-release.yml`](.github/workflows/desktop-release.yml)). 기존 설치본은 그 릴리스의 `latest.yml` 을 보고
자동 업데이트한다([`desktop/README.md`](desktop/README.md) *자동 업데이트* 참고).

1. **버전 범프 PR** — `desktop/package.json` 과 `desktop/package-lock.json` 의 `version` 을 함께 올린다.
   자동 업데이트는 이 semver 를 비교하므로 **안 올리면 기존 설치본이 새 버전을 받지 못한다.**
   웹 패치노트도 함께 낸다면 `changelog.ts` 항목을 같은 PR 에 묶는다(배치 릴리스).
2. (권장) **드라이런** — `gh workflow run desktop-release.yml --ref <브랜치>`(workflow_dispatch).
   실제 Windows·macOS 러너에서 설치 파일·`latest.yml` 생성과 헬퍼 엔진/가치 테이블 동봉을 검증한다(릴리스 첨부 단계는 건너뜀).
   워크플로 아티팩트로 받은 `latest.yml` 의 `version` 이 새 버전인지도 확인한다.
3. **squash 머지** 후 머지 커밋에 annotated 태그 `tray-vX.Y.Z`(웹 버전도 올렸다면 `web-vX.Y.Z` 도)를 달아 push 한다.
4. **발행** — `gh release create tray-vX.Y.Z --verify-tag --latest --title … --notes-file …`.
   draft·prerelease 는 자동 업데이트가 보지 못하니 정식으로 발행한다. `--target <SHA>` 대신 태그를 먼저 push 하고
   태그 이름으로 만든다. 웹 패치노트를 묶었다면 머지 즉시 공지가 뜨므로 발행을 미루지 않는다.
5. **확인** — CI 가 릴리스에 `latest.yml` · `YachtDice-Tray-Setup.exe` · `.blockmap` · `YachtDice-Tray.dmg` 4종을 첨부했는지 본다.

> ⚠️ GitHub Release 는 `tray-v*` 만 만든다. `web-v*` 로 Release 를 만들면 `releases/latest` 가 그쪽으로 바뀌어
> 웹의 트레이 다운로드 링크(`releases/latest/download/…`)와 설치본 자동 업데이트가 깨진다.

## PR 전 체크

- `npm run typecheck`
- `npm test`
- `desktop/` 를 바꿨다면 `cd desktop && npm run test:helper` — 숨은 창에서 실제 `popup.html` 의 헬퍼를 검증한다(화면 표시 없음).
- 룰·상태 인덱스(`src/core/rules.ts` · `stateIndex.ts` · `dice.ts`)를 바꿨다면 `npm run build:table` · `npm run build:table:additional`
  로 가치 테이블을 다시 만들어 **커밋**한다 — 웹 배포는 `prebuild` 가 재생성하지만 트레이 앱은 커밋된 `public/V*.bin` 을 그대로 동봉한다.
- 로직 변경은 **테스트 먼저**(TDD 권장). 순수 로직은 `src/**/*.test.ts`(node 환경).
