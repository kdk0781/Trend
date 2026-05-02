const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const fs = require('fs');

const parser = new Parser({ customFields: { item: [['ht:approx_traffic', 'traffic']] } });

// 1. 구글 트렌드 수집 (ScraperAPI 제거, 다이렉트 수집)
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

// 2. 국내 실시간 검색어 수집 (인코딩 깨짐 완벽 해결)
async function getDomesticTrends() {
  
  // 1순위: Nate API 다이렉트 호출 (EUC-KR 디코딩 적용)
  try {
    console.log('🇰🇷 국내 검색어 (1순위: Nate API) 다이렉트 수집 중...');
    const res = await axios.get('https://www.nate.com/js/data/jsonLiveKeywordDataV1.js', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
        'Referer': 'https://www.nate.com/'
      },
      // 🌟 핵심: 글자 깨짐 방지를 위해 텍스트가 아닌 '바이너리(arraybuffer)'로 수신
      responseType: 'arraybuffer', 
      timeout: 10000
    });

    // 🌟 핵심: Node.js 내장 기능을 통해 EUC-KR을 정상적인 한글(UTF-8)로 강제 번역
    const decodedData = new TextDecoder('euc-kr').decode(res.data);
    
    const startIndex = decodedData.indexOf('[');
    const endIndex = decodedData.lastIndexOf(']');
    
    if (startIndex !== -1 && endIndex !== -1) {
      const jsonString = decodedData.substring(startIndex, endIndex + 1);
      const parsedData = JSON.parse(jsonString); 
      
      const trends = parsedData.map((item, index) => ({
        rank: index + 1,
        keyword: item[0] 
      }));

      console.log('✅ Nate API 데이터 수집 성공!');
      return trends.slice(0, 10);
    }
  } catch (e) { 
    console.log('⚠️ Nate API 수집 실패: ' + e.message); 
  }

  // 2순위: Signal.bz 다이렉트 호출 (백업)
  try {
    console.log('🇰🇷 국내 검색어 (2순위: Signal) 다이렉트 수집 중...');
    const res = await axios.get('https://signal.bz/news', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0' },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    const trends = [];
    $('.rank-text').each((i, el) => {
      const text = $(el).text().trim();
      if (text && !trends.find(t => t.keyword === text)) {
        trends.push({ rank: trends.length + 1, keyword: text });
      }
    });
    if (trends.length > 0) { console.log('✅ Signal 데이터 수집 성공!'); return trends.slice(0, 10); }
  } catch (e) { 
    console.log('⚠️ Signal 수집 실패: ' + e.message); 
  }

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
