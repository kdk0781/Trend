const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const fs = require('fs');

const parser = new Parser({ customFields: { item: [['ht:approx_traffic', 'traffic']] } });

// 1. 구글 트렌드 수집
async function getGoogleTrends() {
  // 🚨 해결 1: 구글이 기존 주소를 폐쇄했으므로, 작동하는 최신 공식 RSS 주소로 변경
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
    console.log(`⚠️ 1차 시도 실패(${error.message}). 2차 시도(우회 없이 직접 접속) 진행...`);
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

// 2. 국내 실시간 검색어 수집 (Nate -> ZUM 릴레이)
async function getDomesticTrends() {
  const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

  // 1순위: 네이트 (Nate) - 정적 HTML 크롤링이 가장 안정적
  try {
    console.log('🇰🇷 국내 검색어 (1순위: Nate) 수집 중...');
    const res = await axios.get('https://m.nate.com', { headers, timeout: 5000 });
    const $ = cheerio.load(res.data);
    const trends = [];
    $('.kwd_list .kwd, .isKeywordList .kwd, .sank_list .kwd, .rank_list .kwd').each((i, el) => {
      const text = $(el).text().trim();
      // 해결 2: 순위 숫자("1", "2")나 빈 텍스트가 섞이는 것을 방지
      if (text && isNaN(text) && !trends.find(t => t.keyword === text)) {
        trends.push({ rank: trends.length + 1, keyword: text });
      }
    });
    if (trends.length > 0) { console.log('✅ Nate 데이터 수집 성공'); return trends.slice(0, 10); }
  } catch (e) { console.log('⚠️ Nate 수집 실패: ' + e.message); }

  // 2순위: ZUM (줌)
  try {
    console.log('🇰🇷 국내 검색어 (2순위: ZUM) 수집 중...');
    const res = await axios.get('https://zum.com', { headers, timeout: 5000 });
    const $ = cheerio.load(res.data);
    const trends = [];
    $('.issue-keyword .word, .list-issue .word, .issue_keyword_list .keyword').each((i, el) => {
      const text = $(el).text().trim();
      if (text && isNaN(text) && !trends.find(t => t.keyword === text)) {
         trends.push({ rank: trends.length + 1, keyword: text });
      }
    });
    if (trends.length > 0) { console.log('✅ ZUM 데이터 수집 성공'); return trends.slice(0, 10); }
  } catch (e) { console.log('⚠️ ZUM 수집 실패: ' + e.message); }

  console.error('❌ 모든 국내 검색어 사이트 수집 실패');
  return [];
}

// 메인 실행 함수
async function main() {
  const googleData = await getGoogleTrends();
  const domesticData = await getDomesticTrends();

  // 방어 로직: 구글과 국내 데이터 중 하나라도 성공하면 파일 생성
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
