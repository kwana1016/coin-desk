# AI 코인 리서치센터

AI가 공개 뉴스와 업비트 시세를 보고 정해진 시간마다 쓰는 코인 코멘트 사이트.
매매 기능은 없고, 코멘트는 참고용이에요.

## 구조 (Cloudflare Workers + D1)
- 예약 실행(Claude)이 리포트·주간 요약·★5 긴급 소식을 **D1 데이터베이스 `coin_desk`** 에 바로 저장 → 사이트에 즉시 반영 (GitHub 푸시 필요 없음)
- `src/index.js`: Worker
  - `/api/latest`, `/api/report/:id`, `/api/archive`, `/api/scores`, `/api/mentions`, `/api/coin/:sym`, `/api/weekly`, `/api/alerts`, `/api/health`
  - 1분마다(cron) 한 가지씩: 업비트 원화마켓 상장·유의·제외(5분마다), 주요 코인 1시간 급변(5분마다), 뉴스 RSS 2곳씩(각 매체 5분마다)
  - 뉴스 ★5 즉시 감지(`src/newswatch.js`): 거래소 해킹·출금 전면 중단·파산·스테이블코인 디페그·1억 달러 이상 해킹·업비트/빗썸 상장·폐지·유의를
    엄격한 제목 규칙으로 찾고, **서로 다른 매체 2곳 이상**이 3시간 안에 보도하면 바로 사이트에 올림("AI 확인 전"). 예약 실행이 1시간 안에 확인하거나 지움(kind='rejected')
  - 그 밖의 페이지 주소는 `public/app.html`을 돌려줌
- `public/app.js`: 브라우저에서 API를 읽어 화면을 그림 (최신 리포트·주간 요약·성적표·코인별·생태계 지도)
- `public/theme.css`: 사이트와 코멘트 페이지가 같이 쓰는 디자인 (원본은 `tools/theme.css`)
- `public/ecosystem.json`: 생태계 지도 내용 (원본은 `data/ecosystem.json`)
- `wrangler.jsonc`: Worker·정적 파일·D1·cron 설정. 이 저장소에 푸시하면 Cloudflare가 `npx wrangler deploy`로 배포

## 섹터 순위판 (`/sectors`, `/rank/:sym`)
- `src/sectors.js`: 두 번째 cron(`3-58/5 * * * *`)으로 5분마다 한 가지씩 — 코인게코 시세(시총 상위 250개, 30분마다, `kv cp`), 순위 계산(요청이 있거나 11시간 지났을 때), 초기 데이터 넣기(버전이 바뀌었을 때 한 번), 빗썸 원화마켓 목록(1시간마다)·바이낸스 선물 목록(코인게코 파생상품 정보, 6시간마다)
- 점수 = 코인 품질×0.6 + 규모×0.25 + 섹터 생존 점수×0.15 + 뉴스 점수(±20, 반감기 3·10·45일). 1군(3대장)은 2군 1등이 3점 이상 앞선 상태가 2번 연속이면 교체(뉴스 +10이면 바로)
- 후보: 시총 150위 안, 거래대금/시총 0.1% 이상, 기준 코인(BTC·ETH·SOL·BNB·XRP)과 스테이블·래핑·스테이킹 파생·금 토큰 제외(`kv sector_excluded`)
- 예약 실행 '섹터 순위·그림 추적'(하루 3번)이 뉴스를 코인별 점수로 `coin_news`에 넣고 `kv rank_req`를 남긴 뒤 `/api/rank-now`를 불러 바로 계산
- 초기 데이터: `tools/sector_seed.py` → `public/sector_seed.json`. 이후 원본은 D1(`sectors`, `coin_base`) — 다시 넣어도 D1 값이 이김(json_patch)
- API: `/api/sectors`, `/api/sector-coin/:sym`, `/api/rank-now`

## D1 표
- `sectors(id, ord, json)`, `coin_base(sym, sector, json)`, `coin_news(id, sym, ts, impact, kind, json)`, `rankings(id, ts, json)` — 섹터 순위판
- `reports(id, ts, json)`, `weekly(id, ts, json)`, `alerts(id, ts, kind, json)` — kind: news(AI 판단)·auto_news(뉴스 자동 감지)·price(가격 급변)·listing/warning/delist(업비트 목록)·rejected(AI가 지운 것), `kv(k, v, ts)`

## 참고 도구 (예약 실행은 안내문에 들어 있는 사본을 씀)
- `tools/levels.py`: 주봉으로 참고 가격 레벨 계산
- `tools/check_report.py`: 저장 전 규칙 점검
- `tools/weekly_stats.py`: 주간 요약용 숫자 집계
- `data/reports`, `data/weekly`: D1로 옮기기 전 예전 기록 (더 이상 갱신하지 않음)
