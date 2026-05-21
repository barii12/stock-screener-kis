# ⚡ 5분 안에 시작하기

## 🎯 전체 흐름
```
1️⃣ KIS API 신청 (1~2일)
2️⃣ GitHub에 푸시 (5분)
3️⃣ Render 배포 (5분)
4️⃣ 브라우저 접속 (1분)
```

---

## 📋 **준비물**
```
✅ GitHub 계정
✅ Render 계정
✅ 한국투자증권 OPEN API 키 (신청 필요)
```

---

## 🚀 **Step 1: 로컬 설치 (생략 가능)**

```bash
# 1. 폴더 생성
mkdir stock-screener-kis
cd stock-screener-kis

# 2. 파일 다운로드 (아래의 5개 파일)
#    - backend-kis.js
#    - frontend-advanced.html
#    - package.json
#    - .env.example
#    - .gitignore

# 3. 의존성 설치
npm install

# 4. .env 파일 생성
cp .env.example .env
# .env 파일에 KIS 정보 입력

# 5. 로컬 테스트 (선택)
node backend-kis.js
```

---

## 📤 **Step 2: GitHub에 푸시**

### **2-1) GitHub 저장소 생성**
```
https://github.com/new
Repository name: stock-screener-kis
Public 선택
Create repository
```

### **2-2) 로컬에서 푸시**
```bash
cd stock-screener-kis

# Git 초기화
git init

# 모든 파일 추가
git add .

# 커밋
git commit -m "Initial commit: KIS API Stock Screener"

# 저장소 연결
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/stock-screener-kis.git

# 푸시
git push -u origin main
```

---

## ☁️ **Step 3: Render 배포**

### **3-1) Render 접속**
```
https://render.com
로그인 (또는 GitHub로 로그인)
```

### **3-2) Web Service 생성**
```
Dashboard → New + → Web Service
→ "Connect a repository" → GitHub 계정 인증
→ stock-screener-kis 선택
```

### **3-3) 배포 설정**
```
Name: stock-screener-kis
Runtime: Node
Build Command: npm install
Start Command: node backend-kis.js
Plan: Free
→ Create Web Service
```

### **3-4) 환경 변수 설정 (중요!)**
```
배포 페이지 → "Environment" 탭 → Add Environment Variable

KIS_API_KEY = YOUR_API_KEY
KIS_SECRET_KEY = YOUR_SECRET_KEY
KIS_ACCOUNT = YOUR_ACCOUNT_NUMBER
KIS_ACCOUNT_CODE = 00
```

### **3-5) 배포**
```
"Save Changes" 클릭
대기... (약 2~5분)
배포 완료!

Your URL:
https://stock-screener-kis.onrender.com
```

---

## 🌐 **Step 4: 브라우저 접속**

### **프론트엔드 설정**

`frontend-advanced.html`을 편집기로 열어서:

**찾기 (Ctrl+F): 256번째 줄**
```javascript
const BACKEND_URL = 'ws://localhost:5000';
```

**변경**
```javascript
const BACKEND_URL = 'wss://stock-screener-kis.onrender.com';
```

**저장 후 GitHub에 푸시**
```bash
git add frontend-advanced.html
git commit -m "Update backend URL"
git push
```

### **브라우저 열기**

**로컬 파일로 열기:**
```
file:///C:/Users/master/stock-screener-kis/frontend-advanced.html
```

**또는 Render에서도 서빙:**
```
https://stock-screener-kis.onrender.com/frontend-advanced.html
```

---

## ✅ **테스트**

### **입력 예시**
```
KOSPI: 1.2
주도 섹터: IT, BIO
시장 강도: 강세장
종목: 삼성전자
```

### **분석 시작 클릭**
```
🎉 Tier A/B/C 분류 결과 나타남!
```

---

## 🎯 **한눈에 보기**

| Step | 작업 | 시간 | 필수 |
|------|------|------|------|
| 1 | KIS API 신청 | 1~2일 | ✅ |
| 2 | GitHub 푸시 | 5분 | ✅ |
| 3 | Render 배포 | 5분 | ✅ |
| 4 | 브라우저 접속 | 1분 | ✅ |

---

## ❓ **FAQ**

**Q: KIS API는 무료인가?**
```
A: 네, 완전 무료입니다.
신청만 하면 바로 사용 가능 (승인 1~2일)
```

**Q: Render 무료 버전 괜찮나?**
```
A: 네, 개인 용도로는 충분합니다.
하지만 15분 유휴 시 자동 sleep
```

**Q: 데이터는 실시간인가?**
```
A: 네, KIS API가 제공하는 실시간 데이터입니다.
네이버/야후보다 정확합니다.
```

**Q: 손절/익절은 자동인가?**
```
A: 아니요, 신호만 제공합니다.
실제 거래는 수동으로 합니다.
(자동화는 고급 기능)
```

---

## 📞 **도움말**

**KIS API 이슈:**
```
KIS 고객센터: 1544-9000
API 문서: https://apiportal.koreainvestment.com/
```

**Render 배포 이슈:**
```
Render 문서: https://render.com/docs
Render 지원: support@render.com
```

**GitHub 이슈:**
```
GitHub 가이드: https://docs.github.com/
```

---

**완료되면 FINAL-GUIDE.md에서 고급 기능을 배워보세요!** 🚀
