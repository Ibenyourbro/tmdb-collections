const qs = require("querystring");
const genres = require("../Static/genres");
const disneyPrincess = require("../Static/disneyPrincess");
const dev = process.argv.includes("--dev") == 1 ? "Dev" : "";
const { getSearch } = require("./searchTmdbC");
const { discoverXCollections } = require("./discoverTmdb");
const { processCollectionDetails } = require("./processCollectionDetails");
const { getCollectionIDsFromMovieIDs } = require("./getTmdb");
const { cacheWrapSearch, cacheWrapCatalog } = require("./cache");
const getManifest = require("../manifest");

// Process Disney Princess catalog separately
async function getDisneyPrincessCatalog() {
  console.log('Processing Disney Princess catalog');
  const princessCacheKey = 'disneyPrincess_' + Date.now();
  
  // Get collections directly without caching
  let allCollections = [...disneyPrincess.collections];
  console.log('Starting with predefined collections:', allCollections);
  
  const movieCollections = await getCollectionIDsFromMovieIDs(disneyPrincess.movies);
  console.log('Found movie collections:', movieCollections);
  
  allCollections = [...new Set([...allCollections, ...movieCollections])];
  console.log('Final Disney Princess collections:', allCollections);
  
  // Process collection details
  const metas = await Promise.all(
    allCollections.map(async (collectionId) => {
      const details = await processCollectionDetails(collectionId);
      if (details) {
        console.log('Processed collection:', details.name);
        return details;
      }
      return null;
    })
  );
  
  // Filter out null results and sort by popularity
  const validMetas = metas.filter(meta => meta !== null)
    .sort((a, b) => b.popularity - a.popularity);
  
  console.log('Final Disney Princess metas:', validMetas.map(m => m.name));
  return { metas: validMetas };
}

// Catalog processing function that can be used both for HTTP requests and prebuffering
async function getCatalogResponse(req) {
  const manifest = await getManifest();
  const collectionPrefix = manifest.idPrefixes[0];
  const startTime = process.hrtime();
  const extra = req.params.extra ? qs.parse(req.params.extra) : { search: null, genre: null };

  console.log(`Catalog request for type ${req.params.type}, id: ${req.params.id}`);

  // Ignore skip requests - this is a workaround to avoid triggering skip requests
  if (extra.skip) {
    console.log("Ignoring request with skip parameter");
    return { metas: [] };
  }

  // Handle Disney Princess catalog completely separately
  if (req.params.id === `tmdbcf${dev}.disneyPrincess`) {
    return await getDisneyPrincessCatalog();
  }

  // Normal catalog processing
  const cacheKey = JSON.stringify({
    id: req.params.id,
    search: extra.search,
    genre: extra.genre,
  });
  let sortCollectionsBy = "popularity";
  let collections = [];

  if (extra.search) {
    collections = await cacheWrapSearch(cacheKey, async () => {
      return getSearch(extra.search);
    });
  } else {
    console.log("discovering collections for catalog:", req.params.id);
    // Discover collections with parameters based on catalog type
    const discoverParams = { "vote_count.gte": 100 }; //defaults

    switch (req.params.id) {
      case `tmdbcf${dev}.popular`:
        discoverParams.sort_by = "popularity.desc";
        discoverParams["vote_average.gte"] = 7;
        discoverParams["vote_count.gte"] = 20;
        sortCollectionsBy = "popularity";
        break;



      case `tmdbcf${dev}.pixar`:
        // Pixar's company ID in TMDB
        discoverParams.with_companies = '3';
        discoverParams.sort_by = 'popularity.desc';
        discoverParams['vote_count.gte'] = 50;  // Lower to catch more Pixar movies
        discoverParams['vote_average.gte'] = 6;  // Most Pixar movies are well-rated
        sortCollectionsBy = 'popularity';
        break;

      case `tmdbcf${dev}.topRated`:
        if (!extra.genre) {
          discoverParams["vote_count.gte"] = 13000;
        } else if (extra.genre === "Music" || extra.genre === "TV Movie" || extra.genre === "War") {
          discoverParams["vote_count.gte"] = 300;
        } else if (extra.genre === "Documentary" || extra.genre === "History" || extra.genre === "Western") {
          //default
        } else {
          discoverParams["vote_count.gte"] = 3000;
        }

        discoverParams.sort_by = "vote_average.desc";
        sortCollectionsBy = "imdbRating";
        break;

      case `tmdbcf${dev}.newReleases`:
        discoverParams.sort_by = "release_date.desc";
        // Get movies from last year
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        discoverParams["primary_release_date.gte"] = oneYearAgo.toISOString().split("T")[0];
        discoverParams["vote_count.gte"] = 5;
        discoverParams["vote_average.gte"] = 5;
        sortCollectionsBy = "latestReleaseDate";
        break;
    }

    if (extra.genre) {
      console.log(`Filtering by genre ${extra.genre}`);
      discoverParams.with_genres = genres.find((g) => g.name === extra.genre).id;
    }

    collections = await cacheWrapCatalog("discover:" + cacheKey, async () => {
      return discoverXCollections(discoverParams);
    });
  }

  if (collections.length === 0) {
    console.log("no collections found");
    return { metas: [] };
  }

  // Process collections with caching
  const processCollections = async (collections) => {
    const promises = collections.map((collectionId) => processCollectionDetails(collectionId));
    return (await Promise.all(promises)).filter(Boolean).sort((a, b) => (b[sortCollectionsBy] || 0) - (a[sortCollectionsBy] || 0));
  };

  const metas = extra.search
    ? await processCollections(collections)
    : await cacheWrapCatalog("catalog:" + cacheKey, () => processCollections(collections));

  const endTime = process.hrtime(startTime);
  const milliseconds = endTime[0] * 1000 + endTime[1] / 1000000;
  console.log(`fetching collections time: ${milliseconds.toFixed(2)}ms`);

  return { metas };
}

module.exports = getCatalogResponse;
