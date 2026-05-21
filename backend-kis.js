const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const axios = require('axios');

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

const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443'; // 실전투자용

// 1. 한국투자증권 인증 토큰 발급
async function getKisAuthToken() {
  try {
    const response = await axios.post(
      `${KIS_BASE_URL}/oauth2/tokenP`,
      { grant_type: 'client_credentials', appkey: KIS_API_KEY, appsecret: KIS_SECRET_KEY },
      { headers: { 'Content-Type': 'application/json' } }
    );
    return response.data.access_token;
  } catch (err) {
    throw new Error('인증 토큰 발급 실패 (키 값을 다시 확인해주세요)');
  }
}

// 2. KIS API - 주식 현재가 조회
async function getKisStockPrice(stockCode) {
  try {
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
      throw new Error(`[API 거절] ${response.data.msg1 || '데이터가 없습니다.'}`);
    }

    const data = response.data.output;
    return {
      stockCode: stockCode,
      stockName: data.hts_kor_isnm || stockCode,
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
  } catch (err) {
    throw err;
  }
}

// 3. KIS API - 주식 검색 (✅ 배열 깊이 오류 수정)
async function searchKisStock(query) {
  try {
    const response = await axios.get('https://ac.finance.naver.com/ac', {
      params: { q: query, t: 'A', q_enc: 'UTF-8', st: '111', r_format: 'json' },
      timeout: 5000
    });
    
    // 이전에 에러가 났던 배열 참조 깊이 완벽 수정
    if (response.data && response.data.items && response.data.items[0] && response.data.items[0][0]) {
      return response.data.items[0][0][1]; // 정확한 종목코드 추출
    }
    return null;
  } catch (err) {
    return null;
  }
}

// 4. KIS API - 일봉 차트 데이터 (✅ output2 배열 참조 오류 수정)
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

    // KIS API 일봉 차트 데이터는 output1(X)이 아니라 output2(O)에 담겨 옵니다.
    const chartData = response.data.output2;
    if (!chartData || !Array.isArray(chartData)) {
      return { chartData: [], ma5: 0, ma10: 0, ma20: 0, ma50: 0, ma200: 0 };
    }
    
    let prices = chartData.map(d => ({
      date: d.stck_bsop_date,
      open: parseInt(d.open),
      high: parseInt(d.high),
      low: parseInt(d.low),
      close: parseInt(d.stck_clpr),
      volume: parseInt(d.acml_vol)
    }));

    const closePrices = prices.map(p => p.close).reverse();
    
    return {
      chartData: prices,
      ma5: calculateMA(closePrices, 5),
      ma10: calculateMA(closePrices, 10),
      ma20: calculateMA(closePrices, 20),
      ma50: calculateMA(closePrices, 50),
      ma200: calculateMA(closePrices, 200)
    };
  } catch (err) {
    return { chartData: [], ma5: 0, ma10: 0, ma20: 0, ma50: 0, ma200: 0 };
  }
}

function calculateMA(prices, period) {
  if (prices.length < period) return 0;
  const sum = prices.slice(0, period).reduce((a, b) => a + b, 0);
  return Math.round(sum / period);
}

// 5. 기술 지표 분석
function validateTechnicals(stockData, chartData) {
  const result = { score: 0, details: [], vcpStatus: 'none', maAlignment: false, strength: 'weak' };
  const { currentPrice } = stockData;
  const { ma5, ma10, ma20, ma50 } = chartData;

  if (ma5 > ma10 && ma10 > ma20 && ma20 > ma50 && ma50 > 0) {
    result.maAlignment = true; result.score += 25; result.details.push('✓ 완벽 정배열 (5MA>10MA>20MA>50MA)'); result.strength = 'strong';
  } else if (ma5 > ma10 && ma10 > ma20) {
    result.score += 15; result.details.push('✓ 부분 정배열 (5MA>10MA>20MA)'); result.strength = 'normal';
  } else {
    result.details.push('✗ 역배열 상태'); return result;
  }

  if (currentPrice > ma5 && ma5 > 0) {
    result.score += 10; result.details.push(`✓ 현재가(${currentPrice}) > 5MA(${ma5})`);
  } else {
    result.details.push('✗ 현재가 < 5MA (약세)');
  }

  const high52 = stockData.high52Week || stockData.currentPrice * 1.2;
  if (high52 > 0) {
    const drawdown = ((high52 - currentPrice) / high52) * 100;
    if (drawdown <= 25) {
      result.score += 20; result.details.push(`✓ 52주 신고가 대비 -${drawdown.toFixed(1)}% (Stage 2)`);
    } else {
      result.details.push(`⚠ 52주 신고가 대비 -${drawdown.toFixed(1)}%`);
    }
  }
  return result;
}

function analyzeAnomalyVolume(stockData, chartData) {
  const result = { anomalyScore: 0, details: [], anomalyLevel: 'normal', smartMoneySignal: false, volumeMultiple: 1 };
  const recentVolumes = chartData.chartData?.slice(0, 5)?.map(d => d.volume) || [];
  const avgVolume = recentVolumes.length > 0 ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length : (stockData.volume || 1);

  const volumeMultiple = stockData.volume / avgVolume;
  result.volumeMultiple = volumeMultiple;

  if (volumeMultiple >= 5) {
    result.anomalyLevel = 'critical'; result.anomalyScore = 50; result.smartMoneySignal = true; result.details.push(`🔴 [CRITICAL] 거래량 폭발! ${volumeMultiple.toFixed(1)}배`);
  } else if (volumeMultiple >= 3) {
    result.anomalyLevel = 'high'; result.anomalyScore = 40; result.smartMoneySignal = true; result.details.push(`🟠 [HIGH] 거래량 대폭 증가 ${volumeMultiple.toFixed(1)}배`);
  } else if (volumeMultiple >= 1.5) {
    result.anomalyLevel = 'normal'; result.anomalyScore = 20; result.details.push(`🟡 [NORMAL] 거래량 증가 ${volumeMultiple.toFixed(1)}배`);
  } else {
    result.anomalyScore = 5; result.details.push(`🟢 [LOW] 거래량 안정 ${volumeMultiple.toFixed(1)}배`);
  }
  return result;
}

function analyzeSectorRotation(stockData, marketContext) {
  const result = { sectorScore: 0, details: [], isLeadingSector: false, isWeakSector: false };
  const leadingSectors = marketContext.leadingSector?.split(',') || ['IT'];
  const sector = stockData.sector || '기타';

  if (leadingSectors.some(s => sector.includes(s.trim()))) {
    result.isLeadingSector = true; result.sectorScore = 30; result.details.push(`✓ 주도섹터 진입 (${sector})`);
  } else {
    result.isWeakSector = true; result.sectorScore = 10; result.details.push(`⚠ 중립/약세 섹터 (${sector})`);
  }
  return result;
}

function calculateRSRating(stockData, marketContext) {
  const result = { rsRating: 0, details: [], relativeStrength: 'normal' };
  const stockChange = stockData.changePercent || 0;
  const marketChange = marketContext.kospiChange || 0;
  const rsMultiple = stockChange - marketChange;

  if (rsMultiple > 3) {
    result.rsRating = 30; result.relativeStrength = 'strong'; result.details.push(`✓ RS 우수 +${rsMultiple.toFixed(1)}%`);
  } else if (rsMultiple > -2) {
    result.rsRating = 15; result.details.push(`⚠ RS 평균 ${rsMultiple.toFixed(1)}%`);
  } else {
    result.rsRating = -20; result.relativeStrength = 'weak'; result.details.push(`✗ RS 약함`);
  }
  return result;
}

function detectCupWithHandle(stockData) {
  const result = { isCupWithHandle: false, handleDepth: 0, confidence: 0, details: [] };
  const high30 = stockData.high52Week || stockData.currentPrice * 1.15;
  const handleDepth = ((high30 - stockData.currentPrice) / high30) * 100;
  result.handleDepth = handleDepth;

  if (handleDepth >= 8 && handleDepth <= 15) {
    result.isCupWithHandle = true; result.confidence = 60; result.details.push(`⚠ [Cup with Handle] 핸들 깊이 ${handleDepth.toFixed(1)}%`);
  }
  return result;
}

// 6. 최종 신호 판정
function evaluateAdvancedSignal(stockData, chartData, marketContext) {
  const signal = {
    status: 'HOLD', tier: 'C', score: 0, confidence: 'weak', analysis: {}, reasons: [],
    targetPrices: { entry: stockData.currentPrice, tp1: 0, tp2: 0, stopLoss: 0 }
  };

  const technicals = validateTechnicals(stockData, chartData);
  signal.analysis.technicals = technicals; signal.score += technicals.score; signal.reasons.push(...technicals.details);

  if (technicals.score < 30) { signal.status = 'AVOID'; signal.tier = 'Z'; return signal; }

  const volume = analyzeAnomalyVolume(stockData, chartData);
  signal.analysis.volumeAnomaly = volume; signal.score += volume.anomalyScore; signal.reasons.push(...volume.details);
  if (volume.anomalyLevel === 'critical' || volume.anomalyLevel === 'high') { signal.tier = 'A'; signal.confidence = 'strong'; }

  const sector = analyzeSectorRotation(stockData, marketContext);
  signal.analysis.sector = sector; signal.score += sector.sectorScore; signal.reasons.push(...sector.details);

  const rs = calculateRSRating(stockData, marketContext);
  signal.analysis.rs = rs; signal.score += rs.rsRating; signal.reasons.push(...rs.details);

  const cph = detectCupWithHandle(stockData);
  signal.analysis.cph = cph;

  if (signal.score >= 80) { signal.status = 'BUY'; signal.tier = 'A'; signal.confidence = 'strong'; }
  else if (signal.score >= 50) { signal.status = 'BUY'; signal.tier = signal.tier === 'A' ? 'A' : 'B'; }
  else if (signal.score >= 30) { signal.status = 'HOLD'; signal.tier = 'C'; }
  else { signal.status = 'SELL'; signal.tier = 'Z'; }

  signal.targetPrices.entry = stockData.currentPrice;
  signal.targetPrices.tp1 = (stockData.currentPrice * 1.12).toFixed(0);
  signal.targetPrices.tp2 = (stockData.currentPrice * 1.30).toFixed(0);
  signal.targetPrices.stopLoss = (stockData.currentPrice * 0.93).toFixed(0);

  return signal;
}

// WebSocket 통신
wss.on('connection', (ws) => {
  console.log('✅ 클라이언트 연결됨');
  clients.push(ws);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'checkStock') {
        const input = data.stockName;
        
        let stockCode = input.length === 6 ? input : await searchKisStock(input);
        
        if (!stockCode) {
          ws.send(JSON.stringify({ type: 'error', message: `'${input}' 종목코드 검색에 실패했습니다. (정확한 종목명이나 코드를 입력해주세요)` }));
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

server.listen(PORT, () => {
  console.log(`🚀 시스템 구동 완료! 포트: ${PORT}`);
});