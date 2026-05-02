const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const fs = require('fs');

const parser = new Parser({ customFields: { item: [['ht:approx_traffic', 'traffic']] } });

// 1. 구글 트렌드 수집
async function getGoogleTrends() {
  const targetUrl = 'https://trends.google.com/trending/rss?geo=KR';
  try {
    console.log('🌐 구글 트렌드 다이렉트 수집 중...');
    const response = await axios.get(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0' },
      timeout: 10000
    });
    const feed = await parser.parseString(response.data);
    console.log('✅ 구글 트렌드 수집 성공');
    return feed.items.map((item, index) => ({ rank: index + 1, keyword: item.title, traffic: item.traffic || 'N/A' }));
  } catch (error) {
    console.error(`❌ 구글 트렌드 수집 실패: ${error.message}`);
    return [];
  }
}

// 2. 국내 실시간 검색어 수집 (상승/하락 상태값 추가)
async function getDomesticTrends() {
  try {
    console.log('🇰🇷 국내 검색어 (1순위: Nate API) 다이렉트 수집 중...');
    const res = await axios.get('https://www.nate.com/js/data/jsonLiveKeywordDataV1.js', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
        'Referer': 'https://www.nate.com/'
      },
      responseType: 'arraybuffer', 
      timeout: 10000
    });

    const decodedData = new TextDecoder('euc-kr').decode(res.data);
    const startIndex = decodedData.indexOf('[');
    const endIndex = decodedData.lastIndexOf(']');
    
    if (startIndex !== -1 && endIndex !== -1) {
      const parsedData = JSON.parse(decodedData.substring(startIndex, endIndex + 1)); 
      
      const trends = parsedData.map((item, index) => ({
        rank: index + 1,
        keyword: item[1], // 실제 검색어
        state: item[2],   // 상승(+), 하락(-), 신규(n), 동일(s)
        change: item[3]   // 변동폭 숫자
      }));

      console.log('✅ Nate API 데이터 수집 성공!');
      return trends.slice(0, 10);
    }
  } catch (e) { console.log('⚠️ Nate API 수집 실패: ' + e.message); }

  // 백업용 (ZUM/Signal 생략)
  console.error('❌ 국내 검색어 수집 실패');
  return [];
}

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
  console.log('✅ 하이브리드 트렌드 데이터(trends.json) 저장 완료!');
}

main();
