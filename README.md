# AI 코인 리서치센터

AI가 공개 뉴스와 업비트 시세를 보고 정해진 시간마다 쓰는 코인 코멘트 사이트.
매매 기능은 없고, 코멘트는 참고용이에요.

## 구조 (Cloudflare Workers + D1)
- 예약 실행(Claude)이 리포트·주간 요약·★5 긴급 소식을 **D1 데이터베이스 `coin_desk`** 에 바로 저장 → 사이트에 즉시 반영 (GitHub 푸시 필요 없음)
- `src/index.js`: Worker
  - `/api/latest`, `/api/report/:id`, `/api/archive`, `/api/scores`, `/api/mentions`, `/api/coin/:sym`, `/api/weekly`, `/api/alerts`, `/api/health`
  - 5분마다(cron) 업비트 원화마켓 신규 상장·유의 종목 지정·목록 제외를 감지해 긴급 소식으로 저장 (AI 판단 없음)
  - 그 밖의 페이지 주소는 `public/app.html`을 돌려줌
- `public/app.js`: 브라우저에서 API를 읽어 화면을 그림 (최신 리포트·주간 요약·성적표·코인별·생태계 지도)
- `public/theme.css`: 사이트와 코멘트 페이지가 같이 쓰는 디자인 (원본은 `tools/theme.css`)
- `public/ecosystem.json`: 생태계 지도 내용 (원본은 `data/ecosystem.json`)
- `wrangler.jsonc`: Worker·정적 파일·D1·cron 설정. 이 저장소에 푸시하면 Cloudflare가 `npx wrangler deploy`로 배포

## D1 표
- `reports(id, ts, json)`, `weekly(id, ts, json)`, `alerts(id, ts, kind, json)`, `kv(k, v, ts)`

## 참고 도구 (예약 실행은 안내문에 들어 있는 사본을 씀)
- `tools/levels.py`: 주봉으로 참고 가격 레벨 계산
- `tools/check_report.py`: 저장 전 규칙 점검
- `tools/weekly_stats.py`: 주간 요약용 숫자 집계
- `data/reports`, `data/weekly`: D1로 옮기기 전 예전 기록 (더 이상 갱신하지 않음)
