const { cacheWrapMovieDetails } = require("./cache");
const fetch = require("node-fetch-retry");

async function getCinemetaMovieMeta(imdbId, type = "movie") {
  if (!imdbId) return null;
  
  return cacheWrapMovieDetails(imdbId, async () => {
    try {
      const response = await fetch(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`, {
        method: "GET",
        retry: 3,
        pause: 1000,
        retryDelay: 1000,
        retryOn: [404, 500, 503]
      });
      
      if (!response.ok) {
        console.error(`Cinemeta error for ${imdbId}: ${response.status} ${response.statusText}`);
        return null;
      }
      
      const data = await response.json();
      return data.meta || null;
    } catch (error) {
      console.error(`Error fetching data from Cinemeta: ${imdbId}:`, error.message);
      return null;
    }
  });
}

module.exports = { getCinemetaMovieMeta };
