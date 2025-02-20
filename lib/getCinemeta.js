const { cacheWrapMovieDetails } = require("./cache");
const fetch = require("node-fetch-retry");

async function getCinemetaMovieMeta(imdbId, type = "movie") {
  return cacheWrapMovieDetails(imdbId, async () => {
    try {
      const response = await fetch(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`, {
        method: "GET",
        retry: 2,
        pause: 500,
      });
      const data = await response.json();
      return data.meta;
    } catch (error) {
      console.error(`Error fetching data from Cinemeta: ${imdbId}: ${error.response?.status} - ${error.response?.data?.status_message}`);
    }
  });
}

module.exports = { getCinemetaMovieMeta };
