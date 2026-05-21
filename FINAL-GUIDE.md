# 🚀 최종 완벽 가이드: 한국투자증권 API + Render 클라우드

## 📊 시스템 구조

```
[한국투자증권 OPEN API]
         ↓
   [Render 클라우드]
   Node.js 백엔드
         ↓
   [브라우저 접속]
   https://your-app.onrender.com
```

---

## 📝 **1단계: 한국투자증권 OPEN API 신청**

### **API 신청 방법**

1. **한국투자증권 홈페이지 방문**
   ```
   https://www.koreainvestment.com/
   ```

2. **API 신청 경로**
   ```
   상단 메뉴 → 투자자문 → OPEN API
   또는
   https://apiportal.koreainvestment.com/
   ```

3. **필수 준비 사항**
   - 실명인증 (본인 확인)
   - 한국투자증권 계좌 (모의 계좌 가능)
   - 휴대폰 번호

4. **신청 후 받을 정보**
   ```
   ✅ APP KEY (API_KEY)
   ✅ APP SECRET (SECRET_KEY)
   ✅ ACCOUNT (계좌번호)
   ✅ ACCOUNT_CODE (계좌코드, 보통 '00')
   ```

### **승인 기간**
```
신청 → 1~2일 내 승인 → 사용 가능
```

---

## 💻 **2단계: 로컬에서 테스트 (선택)**

### **프로젝트 구조**

```
stock-screener/
├── backend-kis.js          ← 새로운 백엔드
├── frontend-advanced.html  ← 프론트엔드
├── package.json
├── .env                    ← 환경 변수 (Render에서 설정)
└── node_modules/
```

### **패키지 설치**

```bash
cd stock-screener
npm install jsonwebtoken axios
```

### **로컬 실행**

```bash
# .env 파일 생성 (프로젝트 폴더에)
KIS_API_KEY=YOUR_APP_KEY
KIS_SECRET_KEY=YOUR_APP_SECRET
KIS_ACCOUNT=YOUR_ACCOUNT_NUMBER
KIS_ACCOUNT_CODE=00

# 백엔드 실행
node backend-kis.js
```

**성공 메시지:**
```
╔════════════════════════════════════════════════════╗
║   고급 주식 스크리닝 시스템                         ║
║   한국투자증권 OPEN API 기반                        ║
║   포트: 5000                                      ║
║   모드: 🟢 실시간 데이터 (KIS OPEN API)             ║
║   ✅ API 설정됨: ✓ 완료                           ║
╚════════════════════════════════════════════════════╝
```

### **브라우저 테스트**

```
file:///경로/stock-screener/frontend-advanced.html

KOSPI: 1.2
종목: 삼성전자 (또는 005930)
분석 시작
```

---

## ☁️ **3단계: Render 클라우드 배포**

### **3-1) GitHub에 업로드**

```bash
# GitHub 저장소 생성 (https://github.com/new)
Repository name: stock-screener

# 로컬에서 푸시
cd stock-screener

git init
git add .
git commit -m "KIS API Backend + Frontend"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/stock-screener.git
git push -u origin main
```

### **3-2) Render 배포**

**Render 접속:**
```
https://render.com
```

**1단계: 새 Web Service 생성**
```
대시보드 → New + → Web Service
```

**2단계: GitHub 연결**
```
"Connect Repository" → GitHub 계정 승인 → stock-screener 선택
```

**3단계: 배포 설정**

| 항목 | 설정값 |
|------|--------|
| **Name** | stock-screener-kis |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `node backend-kis.js` |
| **Plan** | Free |

**4단계: 환경 변수 설정**

배포 페이지 → "Environment" 탭 → 다음 추가:

```
KEY: KIS_API_KEY
VALUE: YOUR_APP_KEY

KEY: KIS_SECRET_KEY
VALUE: YOUR_APP_SECRET

KEY: KIS_ACCOUNT
VALUE: YOUR_ACCOUNT_NUMBER

KEY: KIS_ACCOUNT_CODE
VALUE: 00
```

**5단계: Deploy 클릭**

```
약 2~5분 대기 → 배포 완료!
```

---

## 🌐 **4단계: 브라우저에서 접속**

### **배포 URL 확인**

Render 대시보드에서:
```
Your Render URL:
https://stock-screener-kis.onrender.com
```

### **프론트엔드 수정 (중요!)**

`frontend-advanced.html`을 편집기로 열어서:

**변경 전 (약 256줄):**
```javascript
const BACKEND_URL = 'ws://localhost:5000';
```

**변경 후:**
```javascript
const BACKEND_URL = 'wss://stock-screener-kis.onrender.com';
```

**저장 후 GitHub에 push:**
```bash
git add frontend-advanced.html
git commit -m "Update backend URL"
git push
```

### **브라우저에서 접속**

```
직접 파일 열기:
file:///경로/stock-screener/frontend-advanced.html

또는

Render에서 프론트엔드도 배포 (선택)
https://stock-screener-kis.onrender.com/frontend-advanced.html
```

---

## 🧪 **사용 방법**

### **1. 시장 정보 입력**
```
KOSPI 등락률: 1.2
KOSDAQ 등락률: 0.5
주도 섹터: IT, BIO, Semiconductors
시장 강도: 강세장
```

### **2. 종목 검색**
```
삼성전자   (또는 005930)
카카오     (또는 035720)
LG화학
NAVER
```

### **3. 분석 결과**
```
Tier A/B/C 자동 분류
기술 검증 + 거래량 + 섹터 + RS 분석
Action Plan (진입가, 목표가, 손절)
```

---

## ⚡ **속성 요약**

| 항목 | 내용 |
|------|------|
| **데이터 소스** | 한국투자증권 OPEN API |
| **백엔드** | Render (Node.js) |
| **프론트엔드** | HTML + JavaScript |
| **접근 방식** | WebSocket 실시간 |
| **지원 종목** | 한국 모든 상장 주식 |
| **분석 기준** | 미너비니 + 사이먼스 |
| **배포 URL** | https://stock-screener-kis.onrender.com |

---

## 🔍 **문제 해결**

### **문제 1: "API 설정이 안 됨"**
```
→ Render 환경 변수 확인
→ KIS_API_KEY, KIS_SECRET_KEY 정확히 입력
→ Render 재배포
```

### **문제 2: "주식 데이터 조회 실패"**
```
→ KIS 계좌 확인
→ API 신청 승인 확인
→ 종목명 정확성 확인 (예: "삼성전자" 또는 "005930")
```

### **문제 3: "연결 안 됨"**
```
→ WebSocket URL 확인
→ 브라우저 콘솔 (F12) 확인
→ Render 로그 확인
```

---

## 📋 **최종 체크리스트**

```
✅ KIS OPEN API 신청 & 승인
✅ API KEY, SECRET, 계좌정보 획득
✅ GitHub에 코드 업로드
✅ Render Web Service 생성
✅ 환경 변수 설정 (KIS_API_KEY, SECRET 등)
✅ Render 배포 완료
✅ frontend-advanced.html 수정 (WebSocket URL)
✅ GitHub 푸시
✅ 브라우저 접속 테스트
✅ 종목 검색 성공
```

---

## 🎯 **다음 단계 (고급)**

1. **프론트엔드도 Render에 배포** (HTML 서빙)
2. **데이터베이스 추가** (히스토리 저장)
3. **자동 알림** (조건 만족 시)
4. **모바일 앱** (React Native)
5. **실거래 연동** (주문 자동화)

---

## 📞 **핵심 연락처**

| 항목 | 주소 |
|------|------|
| **KIS API 문서** | https://apiportal.koreainvestment.com/docs |
| **KIS 고객센터** | 1544-9000 |
| **Render 문서** | https://render.com/docs |
| **GitHub** | https://github.com |

---

**이제 언제 어디서나 실시간 주식 분석이 가능합니다!** 🚀📈

행운을 빕니다! 💪
