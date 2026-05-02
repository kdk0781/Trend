const googleTrends = require('google-trends-api');
const fs = require('fs');

async function fetchGoogleTrends() {
  try {
    console.log('구글 트렌드 API를 통해 데이터를 가져오는 중...');
    
    // 한국(KR) 지역의 일별 트렌드 가져오기
    const results = await googleTrends.dailyTrends({ geo: 'KR' });
    const parsedResults = JSON.parse(results);
    
    // 오늘(가장 최신) 날짜의 검색어 데이터 추출
    const trendingSearches = parsedResults.default.trendingSearchesDays[0].trendingSearches;
    
    // 원하는 형태로 데이터 가공
    const trendsData = trendingSearches.map((item, index) => {
      return {
        rank: index + 1,
        keyword: item.title.query,
        traffic: item.formattedTraffic || 'N/A',
        publishedDate: parsedResults.default.trendingSearchesDays[0].date,
        // 관련 뉴스가 있을 경우 첫 번째 뉴스 제목 가져오기
        newsTitle: item.articles && item.articles.length > 0 ? item.articles[0].title : ''
      };
    });

    // JSON 파일로 저장
    fs.writeFileSync('trends.json', JSON.stringify(trendsData, null, 2), 'utf-8');
    console.log('✅ trends.json 파일이 성공적으로 생성/업데이트 되었습니다!');
    
  } catch (error) {
    console.error('❌ 데이터를 가져오는 중 오류 발생:', error);
    process.exit(1); // 에러 발생 시 Actions 워크플로우 강제 종료
  }
}

fetchGoogleTrends();
