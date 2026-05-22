const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const axios = require('axios');
const iconv = require('iconv-lite');
const AdmZip = require('adm-zip');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = [];
let marketContext = {
  kospiChange: 0,
  kosdaqChange: 0,
  leadingSector: 'IT',
  marketStrength: 'neutral'
};

// 환경 변수 설정
const KIS_API_KEY = process.env.KIS_API_KEY || 'YOUR_API_KEY';
const KIS_SECRET_KEY = process.env.KIS_SECRET_KEY || 'YOUR_SECRET_KEY';
const KIS_ACCOUNT = process.env.KIS_ACCOUNT || 'YOUR_ACCOUNT';
const KIS_ACCOUNT_CODE = process.env.KIS_ACCOUNT_CODE || '00';

const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443'; // 실전투자

// ============================================================
// 📚 KIS 종목 마스터 파일 (Naver/Daum 의존성 완전 제거)
//    공식 KIS CDN에서 KOSPI + KOSDAQ 전 종목 다운로드
// ============================================================
const STOCK_DICT = new Map();      // 정규화 종목명 → 6자리 코드
const CODE_TO_NAME = new Map();    // 6자리 코드 → 원본 종목명
let STOCK_LOADED = false;
let STOCK_LOAD_PROMISE = null;     // 동시 호출 방지용
let LAST_LOAD_TIME = 0;
const RELOAD_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24시간마다 갱신

// 다운로드 실패 시 최소 동작 보장용 핵심 종목 (시총 상위 100)
const FALLBACK_STOCKS = {
  '삼성전자': '005930', 'SK하이닉스': '000660', 'LG에너지솔루션': '373220',
  '삼성바이오로직스': '207940', '현대차': '005380', '기아': '000270',
  '셀트리온': '068270', 'NAVER': '035420', '네이버': '035420',
  '카카오': '035720', 'POSCO홀딩스': '005490', '포스코홀딩스': '005490',
  '삼성SDI': '006400', '삼성물산': '028260', 'KB금융': '105560',
  '신한지주': '055550', '하나금융지주': '086790', '우리금융지주': '316140',
  'LG화학': '051910', '현대모비스': '012330', 'LG전자': '066570',
  'KT&G': '033780', '메리츠금융지주': '138040', '한화에어로스페이스': '012450',
  '삼성생명': '032830', '삼성화재': '000810', 'HMM': '011200',
  '엔씨소프트': '036570', '크래프톤': '259960', '카카오뱅크': '323410',
  '카카오페이': '377300', '한국전력': '015760', 'SK텔레콤': '017670',
  'KT': '030200', 'LG유플러스': '032640', '한국조선해양': '009540',
  'HD현대중공업': '329180', '한화오션': '042660', '두산에너빌리티': '034020',
  'SK이노베이션': '096770', 'S-Oil': '010950', 'LG': '003550',
  'SK': '034730', '한화': '000880', '에코프로비엠': '247540',
  '에코프로': '086520', '포스코퓨처엠': '003670', '하이브': '352820',
  '카카오게임즈': '293490', '아모레퍼시픽': '090430', 'LG생활건강': '051900',
  '한미약품': '128940', '유한양행': '000100', '대웅제약': '069620',
  '셀트리온헬스케어': '091990', 'HK이노엔': '195940', '삼성에스디에스': '018260',
  '삼성중공업': '010140', '두산밥캣': '241560', '현대글로비스': '086280',
  '롯데케미칼': '011170', '한화솔루션': '009830', 'CJ': '001040',
  'CJ제일제당': '097950', 'GS': '078930', 'GS건설': '006360',
  '대우건설': '047040', 'DL이앤씨': '375500', '롯데쇼핑': '023530',
  '이마트': '139480', '신세계': '004170', '농심': '004370', '오리온': '271560',
  '하이트진로': '000080', '한국타이어앤테크놀로지': '161390', '한국가스공사': '036460',
  '미래에셋증권': '006800', '한국금융지주': '071050', '키움증권': '039490',
  'NH투자증권': '005940', '삼성증권': '016360', '한화생명': '088350',
  '메리츠화재': '000060', '한미반도체': '042700', '이오테크닉스': '039030',
  '리노공업': '058470', '동진쎄미켐': '005290', '솔브레인': '357780',
  '레인보우로보틱스': '277810', '루닛': '328130', '알테오젠': '196170',
  'SK바이오사이언스': '302440', 'SK바이오팜': '326030', '엘앤에프': '066970',
  '에스엠': '041510', 'JYP Ent.': '035900', '와이지엔터테인먼트': '122870',
  '클래시스': '214150', '파마리서치': '214450', 'HLB': '028300',
  'LS': '006260', 'LS ELECTRIC': '010120', '현대로템': '064350', 'SK스퀘어': '402340'
};

function normalize(name) {
  return String(name || '').replace(/\s+/g, '').toUpperCase();
}

// 폴백 종목을 STOCK_DICT에 미리 적재
function loadFallback() {
  for (const [name, code] of Object.entries(FALLBACK_STOCKS)) {
    STOCK_DICT.set(normalize(name), code);
    if (!CODE_TO_NAME.has(code)) CODE_TO_NAME.set(code, name);
  }
}

// KIS 공식 MST 파일 다운로드 + 파싱
async function downloadAndParseMst(market, url) {
  try {
    console.log(`📥 [${market}] KIS 종목 마스터 다운로드 중... (${url})`);
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StockScreener/1.0)' }
    });

    const zip = new AdmZip(Buffer.from(res.data));
    const entries = zip.getEntries();
    let totalCount = 0;

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      if (!entry.entryName.toLowerCase().endsWith('.mst')) continue;

      const buffer = entry.getData();
      const text = iconv.decode(buffer, 'cp949');
      const lines = text.split(/\r?\n/);

      for (const line of lines) {
        if (!line || line.length < 50) continue;

        // KIS MST 포맷 (KOSPI/KOSDAQ 공통):
        //   - 0~8  (9자):  단축코드 (앞 공백 + 6자리)
        //   - 9~20 (12자): 표준코드 (ISIN)
        //   - 21~  (가변): 한글 종목명 (뒤쪽 228자는 기타 필드)
        const code = line.substring(0, 9).trim();
        if (!/^\d{6}$/.test(code)) continue;

        const nameEnd = line.length - 228;
        if (nameEnd <= 21) continue;
        const nameKor = line.substring(21, nameEnd).trim();
        if (!nameKor) continue;

        const key = normalize(nameKor);
        if (!STOCK_DICT.has(key)) STOCK_DICT.set(key, code);
        if (!CODE_TO_NAME.has(code)) CODE_TO_NAME.set(code, nameKor);
        totalCount++;
      }
    }

    console.log(`✅ [${market}] ${totalCount.toLocaleString()}개 종목 로드 완료`);
    return totalCount;
  } catch (err) {
    console.error(`❌ [${market}] 마스터 다운로드 실패: ${err.message}`);
    return 0;
  }
}

async function loadStockMasterInternal() {
  loadFallback(); // 최소한의 매핑은 항상 보장

  const sources = [
    { market: 'KOSPI',  url: 'https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip' },
    { market: 'KOSDAQ', url: 'https://new.real.download.dws.co.kr/common/master/kosdaq_code.mst.zip' }
  ];

  for (const src of sources) {
    await downloadAndParseMst(src.market, src.url);
  }

  STOCK_LOADED = true;
  LAST_LOAD_TIME = Date.now();
  console.log(`🎯 종목 매핑 총합: ${STOCK_DICT.size.toLocaleString()}개`);
}

// 외부에서는 이걸로 호출 (중복 호출 방지)
async function ensureStockMaster() {
  const isExpired = Date.now() - LAST_LOAD_TIME > RELOAD_INTERVAL_MS;
  if (STOCK_LOADED && !isExpired) return;
  if (STOCK_LOAD_PROMISE) return STOCK_LOAD_PROMISE;

  STOCK_LOAD_PROMISE = loadStockMasterInternal()
    .finally(() => { STOCK_LOAD_PROMISE = null; });
  return STOCK_LOAD_PROMISE;
}

// 종목명 → 코드 변환 (KIS 마스터만 사용)
async function findStockCode(query) {
  const q = String(query || '').trim();
  if (!q) return null;

  // 1. 6자리 숫자면 그대로 사용
  if (/^\d{6}$/.test(q)) return q;

  // 2. 마스터 데이터 보장 (없으면 로드)
  await ensureStockMaster();

  // 3. 정규화 후 정확 매칭
  const key = normalize(q);
  if (STOCK_DICT.has(key)) return STOCK_DICT.get(key);

  return null;
}

// ============================================================
// KIS API 호출 함수들 (이하 동일)
// ============================================================

// 1. 한국투자증권 인증 토큰 발급 (1일 1회 + 캐싱)
let cachedToken = null;
let tokenExpiry = 0;

async function getKisAuthToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  try {
    const response = await axios.post(
      `${KIS_BASE_URL}/oauth2/tokenP`,
      { grant_type: 'client_credentials', appkey: KIS_API_KEY, appsecret: KIS_SECRET_KEY },
      { headers: { 'Content-Type': 'application/json' } }
    );
    cachedToken = response.data.access_token;
    // KIS 토큰은 24시간 유효, 안전하게 23시간 캐싱
    tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
    return cachedToken;
  } catch (err) {
    throw new Error('인증 토큰 발급 실패 (API 키 확인 필요)');
  }
}

// 2. KIS API - 주식 현재가 조회
async function getKisStockPrice(stockCode) {
  const token = await getKisAuthToken();
  const response = await axios.get(
    `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`,
    {
      params: { fid_cond_mrkt_div_code: 'J', fid_input_iscd: stockCode },
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${token}`,
        'appKey': KIS_API_KEY,
        'appSecret': KIS_SECRET_KEY,
        'tr_id': 'FHKST01010100'
      }
    }
  );

  if (!response.data.output) {
    throw new Error(`[KIS 응답] ${response.data.msg1 || '데이터가 없습니다.'}`);
  }

  const data = response.data.output;
  return {
    stockCode: stockCode,
    stockName: data.hts_kor_isnm || CODE_TO_NAME.get(stockCode) || stockCode,
    currentPrice: parseInt(data.stck_prpr || 0),
    changePercent: parseFloat(data.prdy_ctrt || 0),
    changeAmount: parseInt(data.prdy_vrss || 0),
    volume: parseInt(data.acml_vol || 0),
    high52Week: parseInt(data.w52_hgpr || 0),
    low52Week: parseInt(data.w52_lwpr || 0),
    marketCap: parseInt(data.hts_avls || 0),
    per: parseFloat(data.per || 0),
    eps: parseInt(data.eps || 0),
    timestamp: new Date().toISOString()
  };
}

// 3. KIS API - 일봉 차트 데이터
async function getKisChartData(stockCode) {
  try {
    const token = await getKisAuthToken();
    const response = await axios.get(
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`,
      {
        params: {
          fid_cond_mrkt_div_code: 'J',
          fid_input_iscd: stockCode,
          fid_org_adj_prc: '0',
          fid_period_div_code: 'D'
        },
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${token}`,
          'appKey': KIS_API_KEY,
          'appSecret': KIS_SECRET_KEY,
          'tr_id': 'FHKST03010100'
        }
      }
    );

    const chartData = response.data.output2;
    if (!chartData || !Array.isArray(chartData)) {
      return { chartData: [], ma5: 0, ma10: 0, ma20: 0, ma50: 0, ma150: 0, ma200: 0, vol5Avg: 0, volatility10: 100, low52Week: 0 };
    }

    const prices = chartData.map(d => ({
      date: d.stck_bsop_date,
      open: parseInt(d.stck_oprc || d.open),
      high: parseInt(d.stck_hgpr || d.high),
      low: parseInt(d.stck_lwpr || d.low),
      close: parseInt(d.stck_clpr),
      volume: parseInt(d.acml_vol)
    }));

    const closePrices = prices.map(p => p.close).reverse();
    
    // 📊 5일 평균 거래량 (만주 단위)
    const recent5Vol = prices.slice(0, 5).map(p => p.volume).filter(v => v > 0);
    const vol5Avg = recent5Vol.length > 0
      ? recent5Vol.reduce((a, b) => a + b, 0) / recent5Vol.length
      : 0;
    
    // 📈 10봉 변동폭 (VCP 패턴 확인용)
    const recent10 = prices.slice(0, 10);
    let volatility10 = 100;
    if (recent10.length >= 10) {
      const highs = recent10.map(p => p.high);
      const lows = recent10.map(p => p.low);
      const maxHigh = Math.max(...highs);
      const minLow = Math.min(...lows);
      volatility10 = ((maxHigh - minLow) / minLow) * 100;
    }
    
    // 📉 52주 최저가 (240거래일 기준)
    const yearLows = prices.slice(0, Math.min(240, prices.length)).map(p => p.low).filter(l => l > 0);
    const low52Week = yearLows.length > 0 ? Math.min(...yearLows) : 0;

    return {
      chartData: prices,
      ma5: calculateMA(closePrices, 5),
      ma10: calculateMA(closePrices, 10),
      ma20: calculateMA(closePrices, 20),
      ma50: calculateMA(closePrices, 50),
      ma150: calculateMA(closePrices, 150),
      ma200: calculateMA(closePrices, 200),
      vol5Avg: vol5Avg,
      volatility10: volatility10,
      low52Week: low52Week
    };
  } catch (err) {
    return { chartData: [], ma5: 0, ma10: 0, ma20: 0, ma50: 0, ma150: 0, ma200: 0, vol5Avg: 0, volatility10: 100, low52Week: 0 };
  }
}

function calculateMA(prices, period) {
  if (prices.length < period) return 0;
  const sum = prices.slice(0, period).reduce((a, b) => a + b, 0);
  return Math.round(sum / period);
}

// ============================================================
// 기술 지표 분석 (기존과 동일)
// ============================================================
// ============================================================
// 🛡️ 하드 필터 (통과 못하면 즉시 탈락 → Tier Z)
// ============================================================
function hardFilter(stockData, chartData) {
  const reasons = [];
  const { currentPrice, marketCap, volume } = stockData;
  const { ma50, ma150, ma200, low52Week } = chartData;
  
  // 1. 시총 3,000억 ~ 5조 (중소형 주도주)
  const mcInWon = (marketCap || 0) * 100000000;
  if (mcInWon < 300000000000) return { pass: false, reason: '시총 3,000억 미만' };
  if (mcInWon > 5000000000000) return { pass: false, reason: '시총 5조 초과 (대형주 제외)' };
  
  // 2. 당일 거래량 (10만주 이상 — 유동성 확보)
  if (!volume || volume < 100000) {
    return { pass: false, reason: `거래량 부족 (${Math.round((volume||0)/10000)}만주, 10만주 미만)` };
  }
  
  // 3. 50MA > 150MA > 200MA (장기 정배열)
  if (!(ma50 > ma150 && ma150 > ma200 && ma200 > 0)) {
    return { pass: false, reason: '장기 정배열(50>150>200MA) 미달' };
  }
  
  // 4. 현재가 > 200MA (Stage 2 진입)
  if (currentPrice <= ma200) return { pass: false, reason: '현재가 200MA 이하' };
  
  // 5. 52주 신고가 대비 -25% 이내
  const high52 = stockData.high52Week || currentPrice * 1.2;
  const drawdown = ((high52 - currentPrice) / high52) * 100;
  if (drawdown > 25) return { pass: false, reason: `52주 신고가 대비 -${drawdown.toFixed(1)}%` };
  
  // 6. 52주 저가 대비 +30% 이상 상승
  if (low52Week > 0) {
    const upFromLow = ((currentPrice - low52Week) / low52Week) * 100;
    if (upFromLow < 30) return { pass: false, reason: `52주 저가 대비 +${upFromLow.toFixed(1)}% (30% 미달)` };
  }
  
  return { pass: true, reason: '하드 필터 통과' };
}

// ============================================================
// 🚫 즉시 탈락 신호 (분배/이탈 신호 = Z 등급)
// ============================================================
function detectExitSignal(stockData, chartData) {
  const { currentPrice, changePercent } = stockData;
  const { ma5, ma10, volatility10 } = chartData;
  
  // 1. 5MA & 10MA 동시 이탈
  if (currentPrice < ma5 && currentPrice < ma10 && ma5 > 0 && ma10 > 0) {
    return { exit: true, reason: '5MA & 10MA 동시 이탈' };
  }
  
  // 2. 전일 대비 -4% 이상 하락 + 거래량 동반 (분배 신호)
  const recentVolumes = chartData.chartData?.slice(0, 5)?.map(d => d.volume) || [];
  const avgVol = recentVolumes.length > 0 ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length : 1;
  const volMul = (stockData.volume || 0) / avgVol;
  if (changePercent <= -4 && volMul >= 1.5) {
    return { exit: true, reason: `분배 신호 (${changePercent.toFixed(1)}% + 거래량 ${volMul.toFixed(1)}배)` };
  }
  
  // 3. 10봉 변동폭 30% 초과 (VCP 실패 = 변동성 과대)
  if (volatility10 > 30) {
    return { exit: true, reason: `변동성 과대 (10봉 ${volatility10.toFixed(1)}%)` };
  }
  
  return { exit: false };
}

// ============================================================
// ✅ 기술적 검증 (미너비니 표준) — 점수 분해 포함
// ============================================================
function validateTechnicals(stockData, chartData) {
  const result = { 
    score: 0, details: [], breakdown: [], 
    vcpStatus: 'none', maAlignment: false, strength: 'weak' 
  };
  const { currentPrice } = stockData;
  const { ma5, ma10, ma20, ma50, ma150, ma200, volatility10 } = chartData;

  // 장기 정배열 (50>150>200) — 미너비니 핵심
  if (ma50 > ma150 && ma150 > ma200 && ma200 > 0) {
    result.maAlignment = true;
    result.score += 20;
    result.breakdown.push({ name: '장기 정배열 (50>150>200MA)', score: 20, detail: `50MA(₩${ma50.toLocaleString()}) > 150MA(₩${ma150.toLocaleString()}) > 200MA(₩${ma200.toLocaleString()}) — Stage 2 확인` });
    result.details.push('✓ 장기 정배열 (50>150>200MA)');
    result.strength = 'strong';
  } else {
    result.breakdown.push({ name: '장기 정배열', score: 0, detail: '50>150>200MA 미달 — Stage 1 또는 약세' });
  }
  
  // 단기 정배열
  if (currentPrice > ma5 && ma5 > ma10 && ma10 > ma20 && ma20 > 0) {
    result.score += 15;
    result.breakdown.push({ name: '단기 정배열 (현재가>5>10>20MA)', score: 15, detail: `현재가(₩${currentPrice.toLocaleString()}) > 5MA(₩${ma5.toLocaleString()}) > 10MA(₩${ma10.toLocaleString()}) > 20MA(₩${ma20.toLocaleString()})` });
    result.details.push('✓ 단기 정배열');
  } else if (currentPrice > ma5 && ma5 > ma10) {
    result.score += 8;
    result.breakdown.push({ name: '부분 단기 정배열', score: 8, detail: '5MA, 10MA만 정렬 — 추세 형성 초기' });
    result.details.push('✓ 부분 단기 정배열');
  } else {
    result.breakdown.push({ name: '단기 정배열', score: 0, detail: '5MA, 10MA, 20MA 정렬 부족' });
  }

  // 52주 신고가 근접도
  const high52 = stockData.high52Week || currentPrice * 1.2;
  if (high52 > 0) {
    const drawdown = ((high52 - currentPrice) / high52) * 100;
    if (drawdown <= 15) {
      result.score += 15;
      result.breakdown.push({ name: '52주 신고가 근접', score: 15, detail: `신고가 ₩${high52.toLocaleString()} 대비 -${drawdown.toFixed(1)}% (강한 모멘텀)` });
      result.details.push(`✓ 52주 신고가 -${drawdown.toFixed(1)}%`);
    } else if (drawdown <= 25) {
      result.score += 8;
      result.breakdown.push({ name: '52주 신고가 근접', score: 8, detail: `신고가 대비 -${drawdown.toFixed(1)}% (양호)` });
      result.details.push(`✓ 52주 신고가 -${drawdown.toFixed(1)}%`);
    } else {
      result.breakdown.push({ name: '52주 신고가 근접', score: 0, detail: `신고가 대비 -${drawdown.toFixed(1)}% (-25% 초과)` });
    }
  }
  
  // VCP 패턴
  if (volatility10 <= 15 && volatility10 > 0) {
    result.score += 15;
    result.vcpStatus = 'tight';
    result.breakdown.push({ name: 'VCP 변동성 수축', score: 15, detail: `10봉 변동폭 ${volatility10.toFixed(1)}% — 강한 수축 (돌파 임박 신호)` });
    result.details.push(`✓ VCP 강력 (${volatility10.toFixed(1)}%)`);
  } else if (volatility10 <= 25 && volatility10 > 0) {
    result.score += 8;
    result.vcpStatus = 'normal';
    result.breakdown.push({ name: 'VCP 변동성 수축', score: 8, detail: `10봉 변동폭 ${volatility10.toFixed(1)}% — 양호한 수축` });
    result.details.push(`✓ VCP 양호 (${volatility10.toFixed(1)}%)`);
  } else {
    result.breakdown.push({ name: 'VCP 변동성 수축', score: 0, detail: volatility10 > 0 ? `10봉 변동폭 ${volatility10.toFixed(1)}% — 변동성 과대` : '데이터 부족' });
  }
  
  return result;
}

function analyzeAnomalyVolume(stockData, chartData) {
  const result = { 
    anomalyScore: 0, details: [], breakdown: [],
    anomalyLevel: 'normal', smartMoneySignal: false, volumeMultiple: 1 
  };
  const recentVolumes = chartData.chartData?.slice(0, 5)?.map(d => d.volume).filter(v => v > 0) || [];
  const avgVolume = recentVolumes.length > 0
    ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length
    : (stockData.volume || 1);

  const volumeMultiple = stockData.volume / avgVolume;
  result.volumeMultiple = volumeMultiple;
  const todayVol = Math.round((stockData.volume || 0) / 10000);
  const avgVol = Math.round(avgVolume / 10000);

  if (volumeMultiple >= 5) {
    result.anomalyLevel = 'critical'; result.anomalyScore = 50; result.smartMoneySignal = true;
    result.breakdown.push({ name: '거래량 폭발 (CRITICAL)', score: 50, detail: `당일 ${todayVol}만주 / 평균 ${avgVol}만주 = ${volumeMultiple.toFixed(1)}배 — 스마트머니 대규모 진입 신호` });
    result.details.push(`🔴 [CRITICAL] 거래량 ${volumeMultiple.toFixed(1)}배`);
  } else if (volumeMultiple >= 3) {
    result.anomalyLevel = 'high'; result.anomalyScore = 40; result.smartMoneySignal = true;
    result.breakdown.push({ name: '거래량 대폭 증가 (HIGH)', score: 40, detail: `당일 ${todayVol}만주 / 평균 ${avgVol}만주 = ${volumeMultiple.toFixed(1)}배 — 강한 매수세 유입` });
    result.details.push(`🟠 [HIGH] 거래량 ${volumeMultiple.toFixed(1)}배`);
  } else if (volumeMultiple >= 1.5) {
    result.anomalyLevel = 'normal'; result.anomalyScore = 20;
    result.breakdown.push({ name: '거래량 증가', score: 20, detail: `당일 ${todayVol}만주 / 평균 ${avgVol}만주 = ${volumeMultiple.toFixed(1)}배` });
    result.details.push(`🟡 거래량 ${volumeMultiple.toFixed(1)}배`);
  } else {
    result.anomalyScore = 5;
    result.breakdown.push({ name: '거래량 보통', score: 5, detail: `당일 ${todayVol}만주 / 평균 ${avgVol}만주 = ${volumeMultiple.toFixed(1)}배` });
    result.details.push(`🟢 거래량 ${volumeMultiple.toFixed(1)}배`);
  }
  return result;
}

function analyzeSectorRotation(stockData, marketContext) {
  const result = { sectorScore: 0, details: [], breakdown: [], isLeadingSector: false, isWeakSector: false };
  const leadingSectors = marketContext.leadingSector?.split(',').map(s => s.trim()) || ['IT'];
  const sector = stockData.sector || '기타';

  if (leadingSectors.some(s => sector.includes(s))) {
    result.isLeadingSector = true; result.sectorScore = 30;
    result.breakdown.push({ name: '주도섹터 진입', score: 30, detail: `현재 섹터 "${sector}"가 주도 섹터(${leadingSectors.join(',')})에 포함 — 자금 유입 방향성 일치` });
    result.details.push(`✓ 주도섹터 (${sector})`);
  } else {
    result.isWeakSector = true; result.sectorScore = 10;
    result.breakdown.push({ name: '주도섹터 진입', score: 10, detail: `섹터 "${sector}" — 주도섹터(${leadingSectors.join(',')}) 미포함, 자금 유입 약함` });
    result.details.push(`⚠ 중립 섹터 (${sector})`);
  }
  return result;
}

function calculateRSRating(stockData, marketContext) {
  const result = { rsRating: 0, details: [], breakdown: [], relativeStrength: 'normal' };
  const stockChange = stockData.changePercent || 0;
  const marketChange = marketContext.kospiChange || 0;
  const rsMultiple = stockChange - marketChange;

  if (rsMultiple > 3) {
    result.rsRating = 30; result.relativeStrength = 'strong';
    result.breakdown.push({ name: 'RS Rating', score: 30, detail: `종목 ${stockChange.toFixed(2)}% vs 시장 ${marketChange.toFixed(2)}% = +${rsMultiple.toFixed(2)}% 우위 — 진정한 주도주` });
    result.details.push(`✓ RS 우수 +${rsMultiple.toFixed(1)}%`);
  } else if (rsMultiple > -2) {
    result.rsRating = 15;
    result.breakdown.push({ name: 'RS Rating', score: 15, detail: `종목 ${stockChange.toFixed(2)}% vs 시장 ${marketChange.toFixed(2)}% = ${rsMultiple.toFixed(2)}% — 시장 동조` });
    result.details.push(`⚠ RS 평균 ${rsMultiple.toFixed(1)}%`);
  } else {
    result.rsRating = -20; result.relativeStrength = 'weak';
    result.breakdown.push({ name: 'RS Rating', score: -20, detail: `종목 ${stockChange.toFixed(2)}% vs 시장 ${marketChange.toFixed(2)}% = ${rsMultiple.toFixed(2)}% — 시장 대비 약세 (감점)` });
    result.details.push(`✗ RS 약함 ${rsMultiple.toFixed(1)}%`);
  }
  return result;
}


function detectCupWithHandle(stockData) {
  const result = { isCupWithHandle: false, handleDepth: 0, confidence: 0, details: [] };
  const high30 = stockData.high52Week || stockData.currentPrice * 1.15;
  const handleDepth = ((high30 - stockData.currentPrice) / high30) * 100;
  result.handleDepth = handleDepth;

  if (handleDepth >= 8 && handleDepth <= 15) {
    result.isCupWithHandle = true; result.confidence = 60;
    result.details.push(`⚠ [Cup with Handle] 핸들 깊이 ${handleDepth.toFixed(1)}%`);
  }
  return result;
}

function evaluateAdvancedSignal(stockData, chartData, marketContext) {
  const signal = {
    status: 'HOLD', tier: 'C', score: 0, confidence: 'weak', analysis: {}, reasons: [],
    targetPrices: { entry: stockData.currentPrice, tp1: 0, tp2: 0, stopLoss: 0 }
  };

  // 모든 분석 항상 실행 (UI 표시용)
  const technicals = validateTechnicals(stockData, chartData);
  signal.analysis.technicals = technicals;
  signal.score += technicals.score;
  signal.reasons.push(...technicals.details);

  const volume = analyzeAnomalyVolume(stockData, chartData);
  signal.analysis.volumeAnomaly = volume;
  signal.score += volume.anomalyScore;
  signal.reasons.push(...volume.details);

  const sector = analyzeSectorRotation(stockData, marketContext);
  signal.analysis.sector = sector;
  signal.score += sector.sectorScore;
  signal.reasons.push(...sector.details);

  const rs = calculateRSRating(stockData, marketContext);
  signal.analysis.rs = rs;
  signal.score += rs.rsRating;
  signal.reasons.push(...rs.details);

  const cph = detectCupWithHandle(stockData);
  signal.analysis.cph = cph;

  // 🛡️ 하드 필터 확인
  const filter = hardFilter(stockData, chartData);
  signal.analysis.hardFilter = filter;
  
  // 🚫 즉시 탈락 신호 확인
  const exitSig = detectExitSignal(stockData, chartData);
  signal.analysis.exitSignal = exitSig;

  // 🎯 Tier/상태 결정
  const isVolStrong = volume.anomalyLevel === 'critical' || volume.anomalyLevel === 'high';
  
  if (!filter.pass) {
    // 하드 필터 통과 못함 → Z
    signal.status = 'AVOID';
    signal.tier = 'Z';
    signal.confidence = 'weak';
    signal.reasons.unshift(`🚫 [하드 필터 탈락] ${filter.reason}`);
  } else if (exitSig.exit) {
    // 즉시 탈락 신호 → Z
    signal.status = 'SELL';
    signal.tier = 'Z';
    signal.confidence = 'weak';
    signal.reasons.unshift(`🚫 [탈락 신호] ${exitSig.reason}`);
  } else if (signal.score >= 80) {
    signal.status = 'BUY'; signal.tier = 'A'; signal.confidence = 'strong';
  } else if (signal.score >= 60) {
    signal.status = 'BUY'; signal.tier = isVolStrong ? 'A' : 'B';
    signal.confidence = isVolStrong ? 'strong' : 'medium';
  } else if (signal.score >= 40) {
    signal.status = 'HOLD'; signal.tier = 'C'; signal.confidence = 'medium';
  } else {
    signal.status = 'SELL'; signal.tier = 'Z'; signal.confidence = 'weak';
  }

  // 목표가 / 손절가 (미너비니 8% 룰 + 10MA 손절)
  const ma10 = chartData.ma10 || stockData.currentPrice * 0.95;
  const stopByRule = stockData.currentPrice * 0.92; // -8%
  const stopByMA = ma10 * 0.99; // 10MA 약간 아래
  
  signal.targetPrices.entry = stockData.currentPrice;
  signal.targetPrices.tp1 = (stockData.currentPrice * 1.12).toFixed(0);  // +12%
  signal.targetPrices.tp2 = (stockData.currentPrice * 1.30).toFixed(0);  // +30%
  signal.targetPrices.stopLoss = Math.max(stopByRule, stopByMA).toFixed(0); // 더 가까운 손절

  return signal;
}

// ============================================================
// HTTP 헬스체크 + 종목 검색 보조 엔드포인트
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    stockLoaded: STOCK_LOADED,
    stockCount: STOCK_DICT.size,
    lastLoadTime: LAST_LOAD_TIME ? new Date(LAST_LOAD_TIME).toISOString() : null
  });
});

// 종목 검색 (선택 사항: 프론트에서 자동완성용으로 쓸 수 있음)
app.get('/search', async (req, res) => {
  await ensureStockMaster();
  const q = normalize(req.query.q || '');
  if (!q) return res.json({ results: [] });

  const results = [];
  for (const [key, code] of STOCK_DICT) {
    if (key.includes(q)) {
      results.push({ code, name: CODE_TO_NAME.get(code) || code });
      if (results.length >= 20) break;
    }
  }
  res.json({ results });
});

// ============================================================
// WebSocket 통신
// ============================================================
// ============================================================
// 📊 시장 컨텍스트 자동 분석 (KOSPI/KOSDAQ 등락률 + 주도섹터 + 시장강도)
// ============================================================
const KOSPI_REPRESENTATIVE = ['005930', '000660', '373220', '207940', '005380', '000270', '068270', '035720', '035420', '051910', '105560', '055550', '009540', '329180'];

const KOSDAQ_REPRESENTATIVE = ['036570', '251270', '259960', '352820', '328130', '196170', '237690', '323410', '377300', '141080', '054550', '054950', '099190', '278280'];

const SECTOR_STOCKS = {
  'IT':        ['005930', '000660', '035420', '035720'],
  'Semi':      ['000660', '005930', '006400', '042700'],
  'Bio':       ['068270', '128940', '195940', '207940'],
  'Energy':    ['373220', '034020', '096770', '042660'],
  'Finance':   ['105560', '055550', '086790', '138040'],
  'Auto':      ['005380', '000270', '012330', '086280'],
  'Shipbuild': ['009540', '329180', '042660', '010140'],
  'Chemical':  ['011170', '009830', '051910', '096770'],
  'Game':      ['036570', '251270', '259960', '352820']
};

async function analyzeMarketContextAuto() {
  console.log('📊 시장 컨텍스트 자동 분석 시작...');
  
  // 1. KOSPI 대표 종목 평균 수익률
  let kospiTotal = 0, kospiCount = 0;
  for (const code of KOSPI_REPRESENTATIVE) {
    try {
      const data = await getKisStockPrice(code);
      kospiTotal += data.changePercent;
      kospiCount++;
    } catch(e) {}
  }
  const kospiChange = kospiCount > 0 ? kospiTotal / kospiCount : 0;
  console.log(`  ✅ KOSPI 평균: ${kospiChange.toFixed(2)}% (${kospiCount}개)`);
  
  // 2. KOSDAQ 대표 종목 평균 수익률
  let kosdaqTotal = 0, kosdaqCount = 0;
  for (const code of KOSDAQ_REPRESENTATIVE) {
    try {
      const data = await getKisStockPrice(code);
      kosdaqTotal += data.changePercent;
      kosdaqCount++;
    } catch(e) {}
  }
  const kosdaqChange = kosdaqCount > 0 ? kosdaqTotal / kosdaqCount : 0;
  console.log(`  ✅ KOSDAQ 평균: ${kosdaqChange.toFixed(2)}% (${kosdaqCount}개)`);
  
  // 3. 섹터별 평균 수익률
  const sectorPerformance = {};
  for (const [sector, codes] of Object.entries(SECTOR_STOCKS)) {
    let total = 0, count = 0;
    for (const code of codes) {
      try {
        const data = await getKisStockPrice(code);
        total += data.changePercent;
        count++;
      } catch(e) {}
    }
    if (count > 0) {
      sectorPerformance[sector] = total / count;
      console.log(`  ✅ ${sector}: ${sectorPerformance[sector].toFixed(2)}%`);
    }
  }
  
  // 4. 상위 3개 섹터를 주도섹터로
  const topSectors = Object.entries(sectorPerformance)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([sector]) => sector);
  
  // 5. 시장 강도 판정 (KOSPI 기준)
  const marketStrength = kospiChange > 1.5 ? 'bull' : (kospiChange < -0.5 ? 'bear' : 'neutral');
  
  return {
    kospiChange: parseFloat(kospiChange.toFixed(2)),
    kosdaqChange: parseFloat(kosdaqChange.toFixed(2)),
    leadingSector: topSectors.join(','),
    marketStrength: marketStrength,
    analysis: { sectorPerformance }
  };
}


async function scanAndRecommendStocks(marketContext) {
  await ensureStockMaster();
  const allCodes = Array.from(new Set(STOCK_DICT.values()));
  
  console.log(`🎯 미너비니 스캔 시작: 전체 ${allCodes.length}개 종목`);
  console.log('  🛡️ 하드 필터: 시총 3000억~5조 / 5일 평균 거래량 20만+ / 50>150>200MA / 현재가>200MA / 52주 신고가 -25% 이내 / 52주 저가 +30%+');
  console.log('  🚫 즉시 탈락: 5MA & 10MA 동시 이탈 / 전일 -4% + 거래량 증가 / 10봉 변동폭 30% 초과');
  
  const candidates = [];
  let totalScanned = 0;
  let hardFilterPassed = 0;
  let exitSignaled = 0;

  for (let i = 0; i < allCodes.length; i++) {
    const code = allCodes[i];
    if (!/^\d{6}$/.test(code)) continue;
    
    try {
      const stockData = await getKisStockPrice(code);
      totalScanned++;
      
      // 빠른 사전 필터: 시총만 (차트 데이터 호출 절감)
      const mcInWon = (stockData.marketCap || 0) * 100000000;
      if (mcInWon < 300000000000 || mcInWon > 5000000000000) continue;
      
      const chartData = await getKisChartData(code);
      const signal = evaluateAdvancedSignal(stockData, chartData, marketContext);
      
      // 하드 필터 통과 + 즉시 탈락 신호 없음만 후보
      if (signal.analysis.hardFilter?.pass && !signal.analysis.exitSignal?.exit) {
        hardFilterPassed++;
        candidates.push({ stockData, signal });
        console.log(`  ✅ ${stockData.stockName}: 점수 ${signal.score}, 시총 ${stockData.marketCap.toLocaleString()}억`);
      } else if (signal.analysis.exitSignal?.exit) {
        exitSignaled++;
      }
      
      if ((i + 1) % 100 === 0) {
        console.log(`  진행: ${i + 1}/${allCodes.length} | 분석 ${totalScanned} | 후보 ${candidates.length}`);
      }
    } catch (err) {}
    
    if (i < allCodes.length - 1) await new Promise(r => setTimeout(r, 60));
  }
  
  console.log(`📊 스캔 완료: ${totalScanned}개 분석 → 하드필터 통과 ${hardFilterPassed}개 → 탈락신호 ${exitSignaled}개`);
  
  // 점수순 정렬 후 미너비니 프레임워크 5단계: Tier A(3), B(3), C(4) 강제 분류
  candidates.sort((a, b) => b.signal.score - a.signal.score);
  
  const tierA = candidates.slice(0, 3);
  const tierB = candidates.slice(3, 6);
  const tierC = candidates.slice(6, 10);
  
  tierA.forEach(item => { item.signal.tier = 'A'; item.signal.status = 'BUY'; item.signal.confidence = 'strong'; });
  tierB.forEach(item => { item.signal.tier = 'B'; item.signal.status = 'BUY'; item.signal.confidence = 'medium'; });
  tierC.forEach(item => { item.signal.tier = 'C'; item.signal.status = 'HOLD'; item.signal.confidence = 'medium'; });
  
  const top10 = [...tierA, ...tierB, ...tierC];
  console.log(`🏆 최종 선정: A(${tierA.length}) + B(${tierB.length}) + C(${tierC.length}) = ${top10.length}개`);
  
  return top10;
}


wss.on('connection', (ws) => {
  console.log('✅ 클라이언트 연결됨');
  clients.push(ws);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // 📊 시장 컨텍스트 자동 분석
      if (data.type === 'analyzeMarket') {
        try {
          const marketData = await analyzeMarketContextAuto();
          ws.send(JSON.stringify({ type: 'marketAnalysis', data: marketData }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: '시장 분석 실패: ' + err.message }));
        }
        return;
      }
      
      // 🎯 추천 종목 스캔
      if (data.type === 'recommendStocks') {
        try {
          const recommended = await scanAndRecommendStocks(data.marketContext || marketContext);
          ws.send(JSON.stringify({ type: 'recommendationResult', data: recommended }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: '추천 스캔 실패: ' + err.message }));
        }
        return;
      }
      
      if (data.type === 'checkStock') {
        const input = data.stockName;
        const stockCode = await findStockCode(input);

        if (!stockCode) {
          ws.send(JSON.stringify({
            type: 'error',
            message: `'${input}' 종목을 찾을 수 없습니다. 종목명을 정확히 입력하거나 6자리 종목코드를 사용하세요 (예: 삼성전자 → 005930)`
          }));
          return;
        }

        const stockData = await getKisStockPrice(stockCode);
        const chartData = await getKisChartData(stockCode);
        const signal = evaluateAdvancedSignal(stockData, chartData, data.marketContext || marketContext);

        ws.send(JSON.stringify({
          type: 'signal',
          stockData: stockData,
          signal: signal
        }));
      }
    } catch (err) {
      console.error('에러 발생:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  ws.on('close', () => {
    clients = clients.filter(c => c !== ws);
  });
});

// ============================================================
// 서버 시작
// ============================================================
server.listen(PORT, async () => {
  console.log(`🚀 시스템 구동 완료! 포트: ${PORT}`);
  console.log('📚 KIS 종목 마스터 로딩 시작...');
  try {
    await ensureStockMaster();
  } catch (err) {
    console.error('⚠ 마스터 로딩 실패 (폴백 종목만 사용):', err.message);
  }
});
