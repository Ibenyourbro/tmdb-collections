const { initMovieDb, getCollectionIDsFromMovieIDs } = require("./getTmdb");
let moviedb = null;
(async () => (moviedb = await initMovieDb()))();

async function discoverCollections(parameters, fromPage = 1, toPage = 5) {
  console.log('Starting discover with parameters:', JSON.stringify(parameters));
  try {
    // 1. Fetch movies from all pages in parallel with timeout
    const pagePromises = [];
    for (let page = fromPage; page <= toPage; page++) {
      const pagePromise = Promise.race([
        moviedb.discoverMovie({ ...parameters, page }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Timeout fetching page ${page}`)), 10000)
        )
      ]).catch((err) => {
        console.error(`Discover page ${page} error:`, {
          message: err.message,
          status: err.response?.status,
          data: err.response?.data
        });
        return { results: [] };
      });
      pagePromises.push(pagePromise);
    }

    console.log('Fetching pages:', fromPage, 'to', toPage);
    const pagesResults = await Promise.all(pagePromises);
    
    // Log results from each page
    pagesResults.forEach((response, index) => {
      const pageNum = fromPage + index;
      console.log(`Page ${pageNum} results:`, {
        totalResults: response.results?.length || 0,
        hasResults: !!response.results,
        totalPages: response.total_pages,
        totalMovies: response.total_results
      });
    });

    // Collect all movie IDs
    const movieIds = new Set(pagesResults.flatMap((response) => (response.results ? response.results.map((movie) => movie.id) : [])));
    console.log('Total unique movie IDs found:', movieIds.size);

    if (movieIds.size === 0) {
      return [];
    }

    // 2. Split movie IDs into chunks for parallel processing
    const chunkSize = 20; // Process 20 movies at a time
    const movieIdChunks = [...movieIds].reduce((chunks, id, index) => {
      const chunkIndex = Math.floor(index / chunkSize);
      if (!chunks[chunkIndex]) chunks[chunkIndex] = [];
      chunks[chunkIndex].push(id);
      return chunks;
    }, []);

    // Process each chunk in parallel
    const chunkResults = await Promise.all(movieIdChunks.map((chunk) => getCollectionIDsFromMovieIDs(chunk)));

    // 3. Combine all collection IDs into a single unique set
    const allCollectionIds = new Set(chunkResults.flatMap((collectionIds) => [...collectionIds]));

    return [...allCollectionIds];
  } catch (err) {
    console.error(`Discover: ${err.response?.status} - ${err.response?.data?.status_message}`);
    return [];
  }
}

async function discoverXCollections(parameters, minCollections = 20, maxPage = 10) {
  try {
    const PAGE_CHUNK = 2; // Reduced: fetch fewer pages at a time
    let collections = [];
    let currentStartPage = 1;

    while (collections.length < minCollections && currentStartPage <= maxPage) {
      const endPage = Math.min(currentStartPage + PAGE_CHUNK - 1, maxPage);

      console.log(`Fetching collections from pages ${currentStartPage} to ${endPage}`);
      const newCollections = await Promise.race([
        discoverCollections(parameters, currentStartPage, endPage),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Collection discovery timeout')), 25000)
        )
      ]);

      // Add new unique collections
      collections = [...new Set([...collections, ...newCollections])];
      console.log(`Total unique collections so far: ${collections.length}`);

      // If we have enough collections, break early
      if (collections.length >= minCollections) {
        console.log('Reached minimum collections target');
        break;
      }

      // If no new collections found, break to avoid unnecessary requests
      if (newCollections.length === 0) {
        console.log('No new collections found, stopping search');
        break;
      }

      // Add a small delay between chunks
      await new Promise(resolve => setTimeout(resolve, 200));
      currentStartPage = endPage + 1;
    }

    return collections;
  } catch (err) {
    console.error(`Extended discover: ${err.response?.status} - ${err.response?.data?.status_message}`);
    return [];
  }
}

module.exports = {
  discoverCollections,
  discoverXCollections,
};
