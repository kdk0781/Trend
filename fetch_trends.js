const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const fs = require('fs');

const parser = new Parser({
  customFields: { item: [['ht:approx_traffic', 'traffic']] }
});

// 1. 구글 트렌드 가져오기 (ScraperAPI 우회)
async function getGoogleTrends() {
  try {
    console.log('🌐 구글 트렌드 데이터 수집 중...');
    const apiKey = process.env.SCRAPER_API_KEY;
    if (!apiKey) throw new Error('API Key가 없습니다. GitHub Secrets를 확인해주세요.');

    // 해결 1: .co.kr 대신 .com 사용 (프록시 404 에러 방지)
    const targetUrl = 'https://trends.google.com/trends/trendingsearches/daily/rss?geo=KR';
    const url = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}`;
    
    const response = await axios.get(url);
    const feed = await parser.parseString(response.data);
    
    return feed.items.map((item, index) => ({
      rank: index + 1,
      keyword: item.title,
      traffic: item.traffic || 'N/A'
    }));
  } catch (error) {
    console.error(`❌ 구글 트렌드 수집 실패: ${error.message}`);
    return [];
  }
}

// 2. 국내 실시간 검색어 가져오기 (시그널 메인 페이지 크롤링)
async function getSignalTrends() {
  try {
    console.log('🇰🇷 국내 실시간 검색어(Signal) 수집 중...');
    // 해결 2: 하위 페이지(/news) 대신 메인 페이지 접속
    const response = await axios.get('https://signal.bz', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    const trends = [];
    
    // 구조가 바뀌어도 찾을 수 있도록 범용적인 클래스명(.rank-text)으로 추출
    $('.rank-text').each((i, el) => {
      const keyword = $(el).text().trim();
      // 중복 방지 및 상위 10개만 추출
      if (keyword && trends.length < 10 && !trends.find(t => t.keyword === keyword)) {
        trends.push({
          rank: trends.length + 1,
          keyword: keyword
        });
      }
    });

    if (trends.length === 0) {
      console.error('❌ 시그널 사이트 접속은 성공했으나 검색어 요소를 찾지 못했습니다. (사이트 HTML 구조 변경됨)');
    }

    return trends;
  } catch (error) {
    console.error(`❌ 국내 검색어 수집 실패: ${error.message}`);
    return [];
  }
}

async function main() {
  const googleData = await getGoogleTrends();
  const signalData = await getSignalTrends();

  // 방어 로직: 둘 중 하나라도 성공하면 파일 생성 (뻗는 현상 방지)
  if (googleData.length === 0 && signalData.length === 0) {
    console.error('🚨 모든 데이터 수집에 실패하여 워크플로우를 중단합니다.');
    process.exit(1); 
  }

  const finalData = {
    updatedAt: new Date().toISOString(),
    google: googleData,
    domestic: signalData
  };

  fs.writeFileSync('trends.json', JSON.stringify(finalData, null, 2), 'utf-8');
  console.log('✅ 하이브리드 트렌드 데이터(trends.json)가 성공적으로 저장되었습니다!');
}

main();
