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

// 2. 국내 실시간 검색어 수집 (한국 IP 우회 + 다중 릴레이)
async function getDomesticTrends() {
  const apiKey = process.env.SCRAPER_API_KEY;
  if (!apiKey) {
    console.error("❌ API Key가 없습니다.");
    return [];
  }

  // 💡 핵심 해결책: &country_code=kr 파라미터를 추가하여 '한국 IP'로 접속 위장!
  const getProxyUrl = (targetUrl) => 
    `http://api.scraperapi.com?api_key=${apiKey}&country_code=kr&url=${encodeURIComponent(targetUrl)}`;

  // 1순위: 네이트 (Nate) 모바일 메인 - 한국 IP 우회 크롤링
  try {
    console.log('🇰🇷 국내 검색어 (1순위: Nate) 우회 수집 중...');
    // 한국 IP로 접속하므로 타임아웃을 넉넉히 20초로 설정
    const res = await axios.get(getProxyUrl('https://m.nate.com'), { timeout: 20000 });
    const $ = cheerio.load(res.data);
    const trends = [];
    $('.kwd_list .kwd, .isKeywordList .kwd, .sank_list .kwd, .rank_list .kwd').each((i, el) => {
      const text = $(el).text().trim();
      if (text && isNaN(text) && !trends.find(t => t.keyword === text)) trends.push({ rank: trends.length + 1, keyword: text });
    });
    if (trends.length > 0) { console.log('✅ Nate 데이터 수집 성공'); return trends.slice(0, 10); }
  } catch (e) { console.log('⚠️ Nate 우회 수집 실패: ' + e.message); }

  // 2순위: 줌 (ZUM) - 한국 IP 우회 크롤링
  try {
    console.log('🇰🇷 국내 검색어 (2순위: ZUM) 우회 수집 중...');
    const res = await axios.get(getProxyUrl('https://zum.com'), { timeout: 20000 });
    const $ = cheerio.load(res.data);
    const trends = [];
    $('.issue-keyword .word, .list-issue .word, .issue_keyword_list .keyword').each((i, el) => {
      const text = $(el).text().trim();
      if (text && isNaN(text) && !trends.find(t => t.keyword === text)) trends.push({ rank: trends.length + 1, keyword: text });
    });
    if (trends.length > 0) { console.log('✅ ZUM 데이터 수집 성공'); return trends.slice(0, 10); }
  } catch (e) { console.log('⚠️ ZUM 우회 수집 실패: ' + e.message); }

  // 3순위: 네이트 숨겨진 내부 API (우회 없이 다이렉트 호출 - 최후의 보루)
  try {
    console.log('🇰🇷 국내 검색어 (3순위: Nate API) 다이렉트 수집 중...');
    const res = await axios.get('https://www.nate.com/js/data/jsonLiveKeywordDataV1.js', { 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' },
      timeout: 10000 
    });
    const startIndex = res.data.indexOf('[');
    const endIndex = res.data.lastIndexOf(']');
    if (startIndex !== -1 && endIndex !== -1) {
      const parsedData = JSON.parse(res.data.substring(startIndex, endIndex + 1));
      const trends = parsedData.map((item, index) => ({ rank: index + 1, keyword: item[0] }));
      console.log('✅ Nate API 다이렉트 수집 성공');
      return trends.slice(0, 10);
    }
  } catch (e) { console.log('⚠️ Nate API 다이렉트 수집 실패: ' + e.message); }

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
