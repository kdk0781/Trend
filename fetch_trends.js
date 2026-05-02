const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const fs = require('fs');

const parser = new Parser({
  customFields: { item: [['ht:approx_traffic', 'traffic']] }
});

// 1. 구글 트렌드 가져오기 (ScraperAPI 우회 사용)
async function getGoogleTrends() {
  try {
    console.log('🌐 구글 트렌드 데이터 수집 중...');
    const apiKey = process.env.SCRAPER_API_KEY;
    if (!apiKey) throw new Error('API Key가 없습니다.');

    const targetUrl = 'https://trends.google.co.kr/trends/trendingsearches/daily/rss?geo=KR';
    // ScraperAPI를 경유하여 구글에 접속 (봇 차단 회피)
    const url = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}`;
    
    const response = await axios.get(url);
    const feed = await parser.parseString(response.data); // 받아온 XML 텍스트를 파싱
    
    return feed.items.map((item, index) => ({
      rank: index + 1,
      keyword: item.title,
      traffic: item.traffic || 'N/A'
    }));
  } catch (error) {
    console.error('❌ 구글 트렌드 수집 실패:', error.message);
    return []; // 에러 시 빈 배열 반환하여 전체 프로세스가 뻗는 것을 방지
  }
}

// 2. 국내 실시간 검색어 가져오기 (시그널 웹 크롤링)
async function getSignalTrends() {
  try {
    console.log('🇰🇷 국내 실시간 검색어(Signal) 수집 중...');
    const response = await axios.get('https://signal.bz/news');
    const $ = cheerio.load(response.data);
    
    const trends = [];
    // 실시간 검색어가 있는 HTML 요소를 찾아 텍스트만 추출
    $('.realtime-rank .content .rank-layer .rank-list .rank-text').each((i, el) => {
      if (i < 10) { // 1위부터 10위까지만 추출
        trends.push({
          rank: i + 1,
          keyword: $(el).text().trim()
        });
      }
    });
    return trends;
  } catch (error) {
    console.error('❌ 국내 검색어 수집 실패:', error.message);
    return [];
  }
}

// 메인 실행 함수
async function main() {
  const googleData = await getGoogleTrends();
  const signalData = await getSignalTrends();

  // 둘 다 가져오는 데 실패했다면 Actions를 실패 처리
  if (googleData.length === 0 && signalData.length === 0) {
    console.error('🚨 모든 데이터 수집에 실패했습니다.');
    process.exit(1); 
  }

  // 최종 저장할 데이터 구조
  const finalData = {
    updatedAt: new Date().toISOString(), // 업데이트 시간 기록
    google: googleData,
    domestic: signalData
  };

  fs.writeFileSync('trends.json', JSON.stringify(finalData, null, 2), 'utf-8');
  console.log('✅ 하이브리드 트렌드 데이터(trends.json)가 성공적으로 저장되었습니다!');
}

main();
