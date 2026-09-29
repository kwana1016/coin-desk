# AI 코인 리서치센터

AI가 공개 뉴스와 업비트 시세를 보고 정해진 시간마다 쓰는 코인 코멘트 사이트.
매매 기능은 없고, 코멘트는 참고용이에요.

- `data/reports/*.json`: 예약 실행이 쓰는 리포트 원본
- `data/weekly/*.json`: 일요일 밤 주간 요약
- `data/ecosystem.json`: 생태계 지도 내용 (층·분야·대표 코인·연결)
- `tools/build_site.py`: 데이터 → 정적 HTML (`python3 tools/build_site.py`)
- `tools/theme.css`: 사이트와 코멘트 페이지가 같이 쓰는 디자인
- `tools/levels.py`: 주봉으로 진입·손절·목표 가격 계산
- `tools/check_report.py`: 저장 전 규칙 점검 (중복 코인 제한, 필수 필드, 별점-등급 일치)
- `tools/weekly_stats.py`: 주간 요약용 숫자 집계
- `public/`: Cloudflare가 배포하는 폴더
  - Workers 방식: `wrangler.jsonc`가 `public`을 정적 자산으로 지정, Deploy command `npx wrangler deploy`
- `site.json`: 사이트 이름, 이해관계 공시 문구(`disclosure`) — 예: "운영자는 LINK를 보유하고 있어요"
