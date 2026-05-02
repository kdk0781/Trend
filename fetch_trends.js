const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const fs = require('fs');

const parser = new Parser({ customFields: { item: [['ht:approx_traffic', 'traffic']] } });

// 1. 구글 트렌드 수집 (우회 -> 직접 접속 2중 시도)
async function getGoogleTrends() {
  // .co.kr 대신 .com 사용 (미국 IP 프록시 우회 시 404 에러 방지)
  const targetUrl = 'https://trends.google.com/trends/trendingsearches/daily/rss?geo=KR';
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
      // 우회 API가 막혔을 경우, 봇인 척하지 않고 일반 브라우저처럼 직접 찔러보기
      const response = await axios.get(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
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

// 2. 국내 실시간 검색어 수집 (ZUM -> 네이트 -> 시그널 3중 릴레이)
async function getDomesticTrends() {
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

  // 1순위: ZUM (줌)
  try {
    console.log('🇰🇷 국내 검색어 (1순위: ZUM) 수집 중...');
    const res = await axios.get('https://zum.com', { headers, timeout: 5000 });
    const $ = cheerio.load(res.data);
    const trends = [];
    $('.issue-keyword .word, .issue_keyword_list .keyword, .list-issue .word').each((i, el) => {
      const text = $(el).text().trim();
      if (text && !trends.find(t => t.keyword === text)) trends.push({ rank: trends.length + 1, keyword: text });
    });
    if (trends.length > 0) { console.log('✅ ZUM 데이터 수집 성공'); return trends.slice(0, 10); }
  } catch (e) { console.log('⚠️ ZUM 수집 실패, 다음 사이트로 넘어갑니다.'); }

  // 2순위: 네이트 (Nate)
  try {
    console.log('🇰🇷 국내 검색어 (2순위: Nate) 수집 중...');
    const res = await axios.get('https://m.nate.com', { headers, timeout: 5000 });
    const $ = cheerio.load(res.data);
    const trends = [];
    $('.kwd_list .kwd, .isKeywordList .kwd, .sank_list .kwd, .rank_list .kwd').each((i, el) => {
      const text = $(el).text().trim();
      if (text && !trends.find(t => t.keyword === text)) trends.push({ rank: trends.length + 1, keyword: text });
    });
    if (trends.length > 0) { console.log('✅ Nate 데이터 수집 성공'); return trends.slice(0, 10); }
  } catch (e) { console.log('⚠️ Nate 수집 실패, 다음 사이트로 넘어갑니다.'); }

  // 3순위: 시그널 (Signal) - 범용 클래스로 재탐색
  try {
    console.log('🇰🇷 국내 검색어 (3순위: Signal) 수집 중...');
    const res = await axios.get('https://signal.bz/news', { headers, timeout: 5000 });
    const $ = cheerio.load(res.data);
    const trends = [];
    $('.rank-text, .keyword, .rank-title').each((i, el) => {
      const text = $(el).text().trim();
      if (text && !trends.find(t => t.keyword === text)) trends.push({ rank: trends.length + 1, keyword: text });
    });
    if (trends.length > 0) { console.log('✅ Signal 데이터 수집 성공'); return trends.slice(0, 10); }
  } catch (e) { console.log('⚠️ Signal 수집 실패'); }

  console.error('❌ 모든 국내 검색어 사이트 수집 실패');
  return [];
}

// 메인 실행 함수
async function main() {
  const googleData = await getGoogleTrends();
  const domesticData = await getDomesticTrends();

  // 둘 다 배열이 비어있을(실패했을) 때만 워크플로우를 중단
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
