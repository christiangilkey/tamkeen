// The extension's stand-in for the phone's drive.js (Google Drive), of which the shared dictionary
// store (mobile/src/js/lexicon-store.js) only needs the unpacking of a downloaded file. The extension
// itself never signs in to Google: the web app keeps the library in the user's Drive.

/** A gzipped JSON file -> its value. */
export async function gunzipJson(buf) {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}
