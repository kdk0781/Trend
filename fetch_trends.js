const Parser = require('rss-parser');
const fs = require('fs');

const parser = new Parser({
  customFields: {
    item: [
      ['ht:approx_traffic', 'traffic'], // 검색량
      ['ht:picture', 'picture'],       // 관련 이미지
      ['ht:picture_source', 'source']  // 이미지 출처
    ]
  }
});

// 구글 한국 지역 일별 급상승 검색어 RSS 주소
const GOOGLE_TRENDS_URL = 'https://trends.google.co.kr/trends/trendingsearches/daily/rss?geo=KR';

async function fetchGoogleTrends() {
  try {
    console.log('구글 트렌드 데이터를 가져오는 중...');
    const feed = await parser.parseURL(GOOGLE_TRENDS_URL);
    
    const trendsData = feed.items.map((item, index) => ({
      rank: index + 1,
      keyword: item.title,
      traffic: item.traffic,
      publishedDate: item.pubDate,
      newsTitle: item.contentSnippet // 관련 뉴스 헤드라인
    }));

    // 기존처럼 상단 헤더 스킵이나 별도 필터링이 필요하다면 이 단계에서 JS 로직으로 처리하면 됩니다.
    
    // JSON 파일로 저장
    fs.writeFileSync('trends.json', JSON.stringify(trendsData, null, 2), 'utf-8');
    console.log('✅ trends.json 파일이 성공적으로 생성되었습니다!');
    
  } catch (error) {
    console.error('❌ 데이터를 가져오는 중 오류 발생:', error);
  }
}

fetchGoogleTrends();