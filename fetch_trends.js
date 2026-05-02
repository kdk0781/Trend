const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const fs = require('fs');

const parser = new Parser({ customFields: { item: [['ht:approx_traffic', 'traffic']] } });

// 1. 구글 트렌드 수집
async function getGoogleTrends() {
  const targetUrl = 'https://trends.google.com/trending/rss?geo=KR';
  const apiKey = process.env.SCRAPER_API_KEY;

  try {
    console.log('🌐 구글 트렌드 (1차: 우회 API) 수집 중...');
    if (!apiKey) throw new Error('API Key가 없습니다.');
    const url = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}`;
    
    const response = await axios.get(url, { timeout: 15000 });
    const feed = await parser.parseString(response.data);
    console.log('✅ 구글 트렌드 1차 수집 성공');
    
    return feed.items.map((item, index) => ({ rank: index + 1, keyword: item.title, traffic: item.traffic || 'N/A' }));
  } catch (error) {
    console.log(`⚠️ 1차 시도 실패(${error.message}). 2차 시도(직접 접속) 진행...`);
    try {
      const response = await axios.get(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 10000
      });
      const feed = await parser.parseString(response.data);
      console.log('✅ 구글 트렌드 2차 수집 성공');
      return feed.items.map((item, index) => ({ rank: index + 1, keyword: item.title, traffic: item.traffic || 'N/A' }));
    } catch (error2) {
      console.error(`❌ 구글 트렌드 최종 실패: ${error2.message}`);
      return [];
    }
  }
}

// 2. 국내 실시간 검색어 수집 (Nate API + ScraperAPI 우회 결합)
async function getDomesticTrends() {
  const apiKey = process.env.SCRAPER_API_KEY;
  if (!apiKey) {
    console.error("❌ API Key가 없습니다. GitHub Secrets를 확인하세요.");
    return [];
  }

  // 1순위: 네이트 내부 API를 우회 서버(ScraperAPI)로 접속 (가장 확실하고 빠른 방법)
  try {
    console.log('🇰🇷 국내 검색어 (1순위: Nate API) 우회 수집 중...');
    const targetUrl = 'https://www.nate.com/js/data/jsonLiveKeywordDataV1.js';
    // API 키를 사용해 프록시 URL 생성
    const proxyUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}`;

    const res = await axios.get(proxyUrl, { timeout: 15000 });

    // 받아온 텍스트에서 JSON 배열 부분만 추출
    const startIndex = res.data.indexOf('[');
    const endIndex = res.data.lastIndexOf(']');

    if (startIndex !== -1 && endIndex !== -1) {
      const jsonString = res.data.substring(startIndex, endIndex + 1);
      const parsedData = JSON.parse(jsonString); 

      // 데이터 가공 (배열의 첫 번째 요소가 검색어)
      const trends = parsedData.map((item, index) => ({
        rank: index + 1,
        keyword: item[0] 
      }));

      console.log('✅ Nate API 데이터 수집 성공');
      return trends.slice(0, 10);
    }
  } catch (e) { console.log('⚠️ Nate API 우회 수집 실패: ' + e.message); }

  // 2순위: 시그널(Signal.bz) 우회 (네이트 서버가 죽었을 때를 대비한 백업)
  try {
    console.log('🇰🇷 국내 검색어 (2순위: Signal) 우회 수집 중...');
    const targetUrl = 'https://signal.bz/news';
    const proxyUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}`;
    
    const res = await axios.get(proxyUrl, { timeout: 15000 });
    const $ = cheerio.load(res.data);
    const trends = [];
    $('.rank-text').each((i, el) => {
      const text = $(el).text().trim();
      if (text && !trends.find(t => t.keyword === text)) {
        trends.push({ rank: trends.length + 1, keyword: text });
      }
    });
    if (trends.length > 0) { console.log('✅ Signal 데이터 수집 성공'); return trends.slice(0, 10); }
  } catch (e) { console.log('⚠️ Signal 우회 수집 실패: ' + e.message); }

  console.error('❌ 모든 국내 검색어 사이트 수집 실패');
  return [];
}

// 메인 실행 함수
async function main() {
  const googleData = await getGoogleTrends();
  const domesticData = await getDomesticTrends();

  if (googleData.length === 0 && domesticData.length === 0) {
    console.error('🚨 모든 데이터 수집에 실패하여 워크플로우를 중단합니다.');
    process.exit(1); 
  }

  const finalData = {
    updatedAt: new Date().toISOString(),
    google: googleData,
    domestic: domesticData
  };

  fs.writeFileSync('trends.json', JSON.stringify(finalData, null, 2), 'utf-8');
  console.log('✅ 하이브리드 트렌드 데이터(trends.json)가 성공적으로 저장되었습니다!');
}

main();
