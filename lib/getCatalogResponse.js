const qs = require("querystring");
const genres = require("../Static/genres");
const { getSearch } = require("./searchTmdbC");
const { discoverXCollections } = require("./discoverTmdb");
const { processCollectionDetails } = require("./processCollectionDetails");
const { cacheWrapSearch, cacheWrapCatalog } = require("./cache");
const getManifest = require("../manifest");

// Catalog processing function that can be used both for HTTP requests and prebuffering
async function getCatalogResponse(req) {
  const manifest = await getManifest();
  const collectionPrefix = manifest.idPrefixes[0];
  const startTime = process.hrtime();
  const extra = req.params.extra ? qs.parse(req.params.extra) : { search: null, genre: null };

  const cacheKey = JSON.stringify({
    id: req.params.id, //catalog
    search: extra.search, //search query
    genre: extra.genre, //genre
  });
  let sortCollectionsBy = "popularity"; //popularity is better than imdbRating for searching
  let collections = [];

  console.log(`Catalog request for type ${req.params.type}, ${cacheKey}`);

  // Ignore skip requests - this is a workaround to avoid triggering skip requests
  if (extra.skip) {
    console.log("Ignoring request with skip parameter");
    return { metas: [] };
  }

  if (extra.search) {
    collections = await cacheWrapSearch(cacheKey, async () => {
      return getSearch(extra.search);
    });
  } else {
    console.log("discovering collections for catalog:", req.params.id);
    // Discover collections with parameters based on catalog type
    const discoverParams = { "vote_count.gte": 100 }; //defaults

    switch (req.params.id) {
      case `${collectionPrefix}popular`:
        discoverParams.sort_by = "popularity.desc";
        discoverParams["vote_average.gte"] = 7;
        discoverParams["vote_count.gte"] = 20;
        sortCollectionsBy = "popularity";
        break;

      case `${collectionPrefix}disneyPrincess`:
        // Disney's company ID in TMDB
        discoverParams.with_companies = '2';
        discoverParams.with_keywords = '2064'  // Princess keyword ID in TMDB
        discoverParams.sort_by = 'popularity.desc';
        sortCollectionsBy = 'popularity';
        break;

      case `${collectionPrefix}pixar`:
        // Pixar's company ID in TMDB
        discoverParams.with_companies = '3';
        discoverParams.sort_by = 'primary_release_date.desc';
        discoverParams['vote_count.gte'] = 100;
        sortCollectionsBy = 'release_date';
        break;

      case `${collectionPrefix}topRated`:
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

      case `${collectionPrefix}newReleases`:
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
