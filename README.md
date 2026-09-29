# AI 코인 리서치센터

AI가 공개 뉴스와 업비트 시세를 보고 정해진 시간마다 쓰는 코인 코멘트 사이트.
매매 기능은 없고, 코멘트는 참고용이에요.

- `data/reports/*.json`: 예약 실행이 쓰는 리포트 원본
- `tools/build_site.py`: 리포트 → 정적 HTML (`python3 tools/build_site.py`)
- `public/`: Cloudflare가 배포하는 폴더
  - Workers 방식: `wrangler.jsonc`가 `public`을 정적 자산으로 지정, Deploy command `npx wrangler deploy`
  - Pages 방식을 쓸 경우: Build output directory = `public`, Build command 없음
- `site.json`: 사이트 이름, 이해관계 공시 문구(`disclosure`) — 예: "운영자는 LINK를 보유하고 있어요"
