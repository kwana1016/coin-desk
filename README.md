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
- `src/sectors.js`: 두 번째 cron(`3-58/5 * * * *`)으로 5분마다 한 가지씩 — 시세(코인마켓캡 공개 데이터 → 막히면 코인게코 → 코인로어, 15분마다, `kv cp`·역대 최고가 `kv ath`), 순위 계산(요청이 있거나 11시간 지났을 때), 초기 데이터 넣기(버전이 바뀌었을 때 한 번), 빗썸 원화마켓 목록·유의 종목(1시간마다)
- 점수 = 코인 품질×0.6 + 규모×0.25 + 섹터 생존 점수×0.15 + 뉴스 점수(±20, 반감기 3·10·45일). 1군(3대장)은 2군 1등이 3점 이상 앞선 상태가 2번 연속이면 교체(뉴스 +10이면 바로)
- 후보: 시총 150위 안, 거래대금/시총 0.1% 이상, 기준 코인(BTC·ETH·SOL·BNB·XRP)과 스테이블·래핑·스테이킹 파생·금 토큰 제외(`kv sector_excluded`)
- 예약 실행 '섹터 순위·그림 추적'(하루 3번)이 뉴스를 코인별 점수로 `coin_news`에 넣고 `kv rank_req`를 남긴 뒤 `/api/rank-now`를 불러 바로 계산
- 초기 데이터: `tools/sector_seed.py` → `public/sector_seed.json`. 이후 원본은 D1(`sectors`, `coin_base`) — 다시 넣어도 D1 값이 이김(json_patch)
- 실제 수익(`src/extra.js` `watchFees`, 28·58분): `coin_base.json.ll`(DefiLlama 프로토콜 이름)이 있는 코인을 6시간마다 10개씩 — 30일·7일·1년 수수료, 매출, 보유자 수익 → `kv fees`. 품질 점수 '실사용·수익'·'토큰 가치 포착'을 AI 점수와 반반 섞음(PoW·프라이버시 제외)
- 성적표(`snapPerf`, 38분): 한국 시각 9시 이후 하루 한 번 1군·2군 코인 가격을 `perf`에 저장 → 화면이 1군 vs 2군 vs 전체 후보 vs 비트코인 누적 수익률(매일 동일 비중) 계산
- 바이낸스 선물(23분, 2시간마다): 목록 `kv bnf` + 펀딩비·미결제약정 `kv fund` (코인게코 → 코인마켓캡)
- 언락 일정(8분, 매시간 300개씩 이어 받아 한 바퀴 약 5시간 → 12시간 쉼): `kv unlocks` (코인마켓캡 공개 데이터, 다음 언락·유통량 대비 %·금액·잠긴 비율)
- 데이터 점수(순위 계산 때 함께): 성장·실질 보유자 수익·밸류(섹터 대비)·점유율 추세·공급 건전성 5항목 각 20점 → 스냅숏 c[12..14]. 종합 점수에는 아직 안 넣고 성적표의 '데이터 점수 상위 3' 바구니로 검증
- 실제 공급 증가율: 성적표 기록의 유통량(c[5])이 28일 넘게 쌓이면 순위 계산이 연환산해서 데이터 점수에 넣음
- 성적표 perf.c[sym] = [리그, 섹터, 순위, 가격, 시총 순위, 유통량, 데이터 점수] → 화면에서 1군·2군·전체·섹터 시총 상위 3·데이터 점수 상위 3·비트코인 비교
- 수수료 12개월 흐름(`watchFeeHist`, 8·23·38분 칸이 쉴 때 코인 2개씩, 일주일마다 갱신): DefiLlama 일별 차트 → 달마다 하루 평균 13칸(마지막은 이번 달) → `kv feehist` → `/api/feehist`. 돈 버는 코인의 1년 흐름·섹터 추세·꾸준함·3달 추세, 코인 페이지 12개월 막대
- 임시 1군: 시총 150위 안 후보가 3개가 안 되는 섹터는 마이너리그 전용 코인(시세·거래량 있음) 중 점수 순으로 빈자리를 채움(지난번 임시 1군 우선, 3점 이상 앞서면 교체) → 스냅숏 c[15] = 2
- 섹터 리포트: sectors.json에 flow(돈의 흐름)·kpi(봐야 할 지표)·pick(고르는 법)·bull·bear — `tools/sector_report.py`. 화면은 섹터 숫자(시총 가중 지수·고점 대비 중앙값·수수료·보유자 몫)를 함께 계산
- 심층 점검: coin_base.json.dd = {at, v, items:[{k, s(0~5), n, src:[{t,u}]}], kill, q:{from,to,why}} — 예약 작업 '코인 심층 점검'이 채움
- 탈중앙화 정도: coin_base.json.dz = {s(0~100), lv(3 탈중앙 60+ · 2 중간 35~59 · 1 중앙화), p[검증·운영 참여, 지분 분산, 업그레이드 통제, 회사·재단 독립, 검열·동결 내성 — 각 20], why, e(1=섹터 평균 추정), at, h[[ts, s]]}. 순위 점수에는 안 넣고 화면(이름 옆 표시·탈중앙화 지도·섹터 구성 막대·코인 페이지·필터/정렬)으로만 추적. 예약 실행 '섹터 순위·그림 추적'이 추정치를 차례로 확인하고 구조 변화 뉴스 때 고침(h에 기록)
- 유의 종목: 업비트(`kv upbit_krw`의 w)·빗썸(`kv bithumb_warn`) 유의 종목은 지정 동안 뉴스 점수 -8
- API: `/api/sectors`, `/api/sector-coin/:sym`, `/api/rank-now`, `/api/perf`

## 내러티브 레이더 (`/radar`)
- 목적: 한국 기사·업비트보다 먼저 해외에서 뜨는 이야기(내러티브)와 코인을 찾기 — 정보 전파 6단계(창업자·펀드 → 해외 X → 관심 집계 → 해외 상장·기사 → 해외 유튜브 → 국내) 중 3~4단계를 노림
- `src/radar.js` (AI 없음): 두 번째 cron의 8·23·38분 칸이 쉴 때 한 가지씩 — 코인게코 트렌딩(2시간마다, 날짜별 등장 횟수 → `kv radar_tr`) · 코인게코 카테고리 시총(8시간, 날짜별 시총으로 7일 변화 → `kv radar_cat`) · 해외 거래소 현물 목록(코인마켓캡 공개 데이터, 바이낸스·코인베이스·OKX·바이비트 각 12시간 → `kv radar_ex`) · 레이더 코인 가격(12시간 → `kv radar_px`). 새 데이터가 생기면 다음 칸에서 화면용 JSON(`kv radar`)을 다시 계산. 상태는 `kv radar_st`
- 코인게코는 Cloudflare 공용 IP에서 가끔 429 — Worker 비밀값 `CG_KEY`(코인게코 무료 Demo 키)를 넣으면 자동으로 씀. 실패하면 50분 뒤 다시 시도
- 국내 상장 표시: 업비트는 영문 이름까지 맞춰 보고, 심볼만 같은 다른 코인이면 '업 동명'(up=2, 미상장으로 봄)
- 예약 실행 '내러티브 레이더'(하루 1번, 아침 7시쯤): `kv radar`를 보고 국내 미상장 + 해외 관심 코인을 골라 왜 뜨는지 확인 → `radar_notes(id, ts, json)` = {ts, btc, headline, summary, themes[{name, stage(초기/확산/과열/식는 중), why, coins}], picks[{id(코인게코), sym, name, price, theme, stage(1~6), why, ladder, checks{circ, unlock, claim, fake}, risk(1~5), src}], watch}
- API: `/api/radar` (view·가격·최신 정리·최근 60일 기록), `/api/radar-now` (cron과 같은 규칙으로 한 칸 실행)

## D1 표
- `sectors(id, ord, json)`, `coin_base(sym, sector, json)`, `coin_news(id, sym, ts, impact, kind, json)`, `rankings(id, ts, json)`, `perf(day, ts, json)` — 섹터 순위판
- `reports(id, ts, json)`, `weekly(id, ts, json)`, `radar_notes(id, ts, json)`, `alerts(id, ts, kind, json)` — kind: news(AI 판단)·auto_news(뉴스 자동 감지)·price(가격 급변)·listing/warning/delist(업비트 목록)·rejected(AI가 지운 것), `kv(k, v, ts)`

## 참고 도구 (예약 실행은 안내문에 들어 있는 사본을 씀)
- `tools/levels.py`: 주봉으로 참고 가격 레벨 계산
- `tools/check_report.py`: 저장 전 규칙 점검
- `tools/weekly_stats.py`: 주간 요약용 숫자 집계
- `data/reports`, `data/weekly`: D1로 옮기기 전 예전 기록 (더 이상 갱신하지 않음)
