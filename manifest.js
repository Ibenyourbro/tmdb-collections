const genres = require("./Static/genres");
const dev = process.argv.includes("--dev") == 1 ? "Dev" : "";

// Extract only the names from the genres array
const genreNames = genres.map((genre) => genre.name);

console.log("[manifest.js] Module being loaded");

async function getManifest() {
  return {
    id: "org.stremio.tmdbcollections" + dev,
    version: "1.1.2",
    name: "TMDB Collections",
    description:
      "Addon lets you explore TMDB Collections, which are essentially grouped movie series. Discover collections featuring newly released movies or browse catalogs of popular and top-rated collections. You can filter by genre or search collections by actor, director, writer, movie or collection name in any language.",
    types: ["movie", "collections"],
    resources: ["catalog", "meta"],
    idPrefixes: [`tmdbc${dev}.`],
    favicon: "https://github.com/youchi1/tmdb-collections/raw/main/Images/favicon.png",
    logo: "https://github.com/youchi1/tmdb-collections/raw/main/Images/logo.png",
    background: "https://github.com/youchi1/tmdb-collections/raw/main/Images/bg.png",
    catalogs: [
      {
        type: "collections",
        id: `tmdbc${dev}.popular`,
        name: "Popular" + dev,
        extra: [
          {
            name: "search",
            isRequired: false,
          },
          {
            name: "genre",
            isRequired: false,
            options: genreNames,
          },
        ],
      },
      {
        type: "collections",
        id: `tmdbc${dev}.topRated`,
        name: "Top Rated" + dev,
        extra: [
          {
            name: "genre",
            isRequired: false,
            options: genreNames,
          },
        ],
      },
      {
        type: "collections",
        id: `tmdbc${dev}.newReleases`,
        name: "New Releases" + dev,
        extra: [
          {
            name: "genre",
            isRequired: false,
            options: genreNames,
          },
        ],
      },
      {
        type: "collections",
        id: `tmdbc${dev}.disneyPrincess`,
        name: "Disney Princess" + dev,
        extra: [
          {
            name: "search",
            isRequired: false,
          },
        ],
      },
      {
        type: "collections",
        id: `tmdbc${dev}.pixar`,
        name: "Pixar Movies" + dev,
        extra: [
          {
            name: "search",
            isRequired: false,
          },
        ],
      },
    ],
  };
}

module.exports = getManifest;
