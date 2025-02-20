const getManifest = require("../manifest");
const { getCollectionDetails, getImdbId } = require("./getTmdb");
const { cacheWrapCollectionDetails } = require("./cache");
const { getCinemetaMovieMeta } = require("./getCinemeta");

async function processCollectionDetails(collectionId) {
  return cacheWrapCollectionDetails(collectionId, async () => {
    const manifest = await getManifest();
    const collectionPrefix = manifest.idPrefixes[0];

    const collectionDetails = await getCollectionDetails(collectionId);
    // Return null if collection not found or has no parts
    if (!collectionDetails || !collectionDetails.parts || collectionDetails.parts.length === 0) {
      return null;
    }

    const parts = collectionDetails.parts;
    if (!Array.isArray(parts) || parts.length === 0) {
      console.log(`No parts found for collection ${collectionId}`);
      return null;
    }

    // Filter released parts and sort by release date
    let releasedParts = parts
      .filter((movie) => movie.release_date && movie.popularity)
      .sort((a, b) => new Date(b.release_date) - new Date(a.release_date));

    // Return all parts if no released parts found
    if (releasedParts.length === 0) {
      console.log(`No released parts found for collection ${collectionId}, using all parts`);
      releasedParts = parts;
    }

    // Get IMDB IDs for all parts
    const imdbIds = await Promise.all(
      releasedParts.map(async (movie) => {
        try {
          return await getImdbId(movie.id);
        } catch (error) {
          console.error(`Error getting IMDB ID for movie ${movie.id}:`, error.message);
          return null;
        }
      })
    );

    // Fetch Cinemeta metadata for each movie part
    const cinemetaData = await Promise.all(
      imdbIds.map(async (imdbId) => {
        if (!imdbId) return null;
        try {
          return await getCinemetaMovieMeta(imdbId);
        } catch (error) {
          console.error(`Error getting Cinemeta data for ${imdbId}:`, error.message);
          return null;
        }
      })
        return Promise.resolve(null);
      })
    );

    const lastMovieMeta = cinemetaData[cinemetaData.length - 1];

    if (!lastMovieMeta || !imdbIds) {
      return null;
    }

    return {
      id: collectionPrefix + collectionDetails.id.toString(),
      type: "movie",
      name: collectionDetails.name,
      imdbRating: (
        cinemetaData.filter((meta) => meta && meta.imdbRating).reduce((sum, meta) => sum + parseFloat(meta.imdbRating), 0) /
        cinemetaData.filter((meta) => meta && meta.imdbRating).length
      ).toFixed(1),
      latestReleaseDate: new Date(releasedParts[releasedParts.length - 1].release_date),
      popularity: releasedParts.reduce((sum, movie) => sum + (movie.popularity || 0), 0) / releasedParts.length,
      genres: [...new Set(cinemetaData.reverse().flatMap((meta) => meta?.genres || []))], //get all genres from all movies
      director: [...new Set(cinemetaData.reverse().flatMap((meta) => meta?.director || []))], //get all directors from all movies
      cast: [
        ...new Set(
          cinemetaData
            .reverse() // Reverse to start with newest movies
            .flatMap((meta) => meta?.cast || [])
        ),
      ].slice(0, 20), // Get cast from all movies(max 3 people/mainCharacters per movie), prioritizing newer movies
      // links: lastMovieMeta?.links || [],, //links functionality not implemented yet in Stremio, for the future --> cinemetaData also includes links
      trailers: lastMovieMeta.trailers || [], //only one trailer works, so there is no need to get all trailers
      releaseInfo: `${new Date(parts[0].release_date).getFullYear()}-${
        new Date(parts[parts.length - 1].release_date).getFullYear() +
          (new Date(parts[parts.length - 1]?.release_date) > new Date() ? " (New part soon)" : null) ||
        new Date(releasedParts[releasedParts.length - 1].release_date).getFullYear() + " (New part soon)"
      }`,
      poster: `https://image.tmdb.org/t/p/w500${collectionDetails.poster_path || parts[0].poster_path || parts[1].poster_path}`,
      background: `https://image.tmdb.org/t/p/original${collectionDetails.backdrop_path || parts[0].backdrop_path || parts[1].backdrop_path}`,
      description: collectionDetails.overview,
      videos: parts.map((movie, index) => ({
        id: imdbIds[index] || "",
        title: movie.title,
        released: (movie.release_date ? movie.release_date : "9999-01-01") + "T00:00:00.000Z",
        season: 1,
        episode: index + 1,
        overview: movie.overview,
        thumbnail: `https://image.tmdb.org/t/p/w780${movie.backdrop_path}`,
      })),
    };
  });
}

module.exports = { processCollectionDetails };
