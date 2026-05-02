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

  // 2. 국내 실시간 검색어 수집 (HTML 크롤링 ❌ -> 내부 API 직접 호출 ⭕)
async function getDomesticTrends() {
  
  // 1순위: 네이트 (Nate) - 숨겨진 내부 실시간 검색어 데이터 파일 직접 호출
  try {
    console.log('🇰🇷 국내 검색어 (1순위: Nate API) 수집 중...');
    // 네이트 메인 화면에 데이터를 공급하는 순수 데이터(JS) 파일 주소
    const res = await axios.get('https://www.nate.com/js/data/jsonLiveKeywordDataV1.js', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000
    });

    // 받아온 텍스트(var liveKeywordData = [...])에서 배열 괄호 '[' 와 ']' 사이의 순수 JSON만 추출
    const startIndex = res.data.indexOf('[');
    const endIndex = res.data.lastIndexOf(']');

    if (startIndex !== -1 && endIndex !== -1) {
      const jsonString = res.data.substring(startIndex, endIndex + 1);
      const parsedData = JSON.parse(jsonString); // 완벽한 배열 형태로 변환

      // 네이트 데이터 구조: [["키워드", "상승/하락", ...], ["키워드", ...]]
      const trends = parsedData.map((item, index) => ({
        rank: index + 1,
        keyword: item[0] // 배열의 첫 번째 요소가 검색어
      }));

      console.log('✅ Nate API 데이터 수집 성공');
      return trends.slice(0, 10);
    }
  } catch (e) { console.log('⚠️ Nate API 수집 실패: ' + e.message); }

  // 2순위: 줌 (ZUM) - 백업용 직접 접속
  try {
    console.log('🇰🇷 국내 검색어 (2순위: ZUM) 수집 중...');
    const res = await axios.get('https://zum.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000
    });
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
