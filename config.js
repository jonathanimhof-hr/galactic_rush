// Galactic Rush V12 site settings (public values only, no secrets). The build reads them when the matching variables
// (GR_MP_SERVER / GR_FIREBASE_API_KEY / GR_FIREBASE_PROJECT_ID) are not set, so editing this file on GitHub is enough.
//   multiplayerServer: the V12 server's public address (multiplayer and accounts), e.g. wss://galactic-rush-v12.onrender.com
//                      (the V11 game keeps its own address in dist/site-v11/config.js)
//   firebase.apiKey / firebase.projectId: the Firebase project's Web API key and project id (Firebase console ->
//                      Project settings -> General). Public identifiers: Firebase sends them to every browser.
window.GALACTIC_RUSH_CONFIG = {
  multiplayerServer: "",
  firebase: { apiKey: "", projectId: "" },
};
