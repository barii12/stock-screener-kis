# 📈 Advanced Stock Screening System
한국투자증권 OPEN API 기반 고급 주식 스크리닝 시스템

## 🎯 특징
- ✅ 한국투자증권 OPEN API 연동 (실시간 데이터)
- ✅ 미너비니 + 사이먼스 기반 분석
- ✅ 거래량 이상 감지 (1순위)
- ✅ Tier A/B/C 자동 분류
- ✅ Render 클라우드 배포
- ✅ WebSocket 실시간 분석

## 📋 필수 요구사항
- Node.js 18.x 이상
- 한국투자증권 OPEN API 키 ([신청하기](https://apiportal.koreainvestment.com/))
- GitHub 계정
- Render 계정 (배포용)

## 🚀 빠른 시작

### 1. 로컬 설치 & 테스트
```bash
# 저장소 클론
git clone https://github.com/YOUR_USERNAME/stock-screener-kis.git
cd stock-screener-kis

# 의존성 설치
npm install

# .env 파일 생성 (.env.example 참고)
cp .env.example .env

# .env 파일에 KIS API 정보 입력
# KIS_API_KEY, KIS_SECRET_KEY, KIS_ACCOUNT 등

# 로컬 실행
npm start
```

### 2. Render에 배포
```
1. GitHub에 푸시 (이 저장소)
2. https://render.com 접속
3. New Web Service 생성
4. 이 저장소 선택
5. Environment 탭에서 .env 정보 입력
6. Deploy 클릭
```

### 3. 브라우저에서 접속
```
프론트엔드: frontend-advanced.html 수정

변경 전:
const BACKEND_URL = 'ws://localhost:5000';

변경 후:
const BACKEND_URL = 'wss://your-app.onrender.com';
```

## 📁 파일 구조
```
stock-screener-kis/
├── backend-kis.js           # 메인 백엔드 (KIS API)
├── frontend-advanced.html   # 웹 UI
├── package.json             # 의존성
├── .env.example             # 환경 변수 샘플
├── .gitignore               # Git 무시 파일
├── README.md                # 이 파일
└── FINAL-GUIDE.md           # 상세 가이드
```

## 🔑 환경 변수 설정

### 로컬 (.env 파일)
```
KIS_API_KEY=YOUR_APP_KEY
KIS_SECRET_KEY=YOUR_APP_SECRET
KIS_ACCOUNT=YOUR_ACCOUNT_NUMBER
KIS_ACCOUNT_CODE=00
```

### Render (대시보드 → Environment)
위와 동일하게 설정

## 📊 사용 방법

### 1. 시장 정보 입력
```
KOSPI 등락률: 1.2
주도 섹터: IT, BIO
시장 강도: 강세장
```

### 2. 종목 검색
```
삼성전자 (또는 005930)
카카오 (또는 035720)
LG화학
```

### 3. 분석 결과
```
✅ Tier A/B/C 자동 분류
✅ 기술 + 거래량 + 섹터 분석
✅ Action Plan (진입/목표/손절)
```

## 🎯 분석 기준

| 순위 | 항목 | 설명 |
|------|------|------|
| 1순위 | 거래량 이상 감지 | 5배 이상 = CRITICAL |
| 2순위 | 기술적 검증 | MA 정배열 + Stage 2 |
| 3순위 | 섹터 순환매 | 주도섹터 진입 |
| 4순위 | 상대 강도 | RS Rating |

## ⚡ API 엔드포인트

### WebSocket
```
ws://localhost:5000  (로컬)
wss://your-app.onrender.com  (배포)
```

### 메시지 포맷
```json
{
  "type": "checkStock",
  "stockName": "삼성전자",
  "marketContext": {
    "kospiChange": 1.2,
    "leadingSector": "IT",
    "marketStrength": "bull"
  }
}
```

## 🔗 유용한 링크
- [한국투자증권 API 문서](https://apiportal.koreainvestment.com/docs)
- [Render 배포 가이드](https://render.com/docs)
- [GitHub 사용법](https://docs.github.com/)

## 📝 라이선스
MIT License

## 👨‍💻 개발자
Your Name

## 📞 문의
KIS API 이슈: KIS 고객센터 (1544-9000)
배포 이슈: Render Support

---

**자세한 설치 및 배포 방법은 FINAL-GUIDE.md를 참고하세요!**
