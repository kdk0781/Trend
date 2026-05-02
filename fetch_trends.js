const Parser = require('rss-parser');
const fs = require('fs');

const parser = new Parser({
  customFields: {
    item: [
      ['ht:approx_traffic', 'traffic'],
      ['ht:picture', 'picture'],
      ['ht:picture_source', 'source']
    ]
  }
});

const GOOGLE_TRENDS_URL = 'https://trends.google.co.kr/trends/trendingsearches/daily/rss?geo=KR';

async function fetchGoogleTrends() {
  try {
    console.log('구글 트렌드 데이터를 가져오는 중...');
    const feed = await parser.parseURL(GOOGLE_TRENDS_URL);
    
    const trendsData = feed.items.map((item, index) => ({
      rank: index + 1,
      keyword: item.title,
      traffic: item.traffic || 'N/A',
      publishedDate: item.pubDate,
      newsTitle: item.contentSnippet || ''
    }));

    fs.writeFileSync('trends.json', JSON.stringify(trendsData, null, 2), 'utf-8');
    console.log('✅ trends.json 파일이 성공적으로 생성/업데이트 되었습니다!');
    
  } catch (error) {
    console.error('❌ 데이터를 가져오는 중 오류 발생:', error);
    process.exit(1); // 중요: 에러 발생 시 Node 프로세스를 강제 종료하여 Actions 워크플로우를 중단시킵니다.
  }
}

fetchGoogleTrends();
