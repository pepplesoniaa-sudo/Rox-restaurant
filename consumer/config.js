// The only file to edit when the API moves.
// Must be the PUBLIC URL of the deployed API: never localhost. The consumer
// exists to prove the API works from outside its own machine.
export const API_BASE_URL = 'https://YOUR-SERVICE.onrender.com';

// Restaurants per page (the API clamps anything above 100).
export const PAGE_SIZE = 10;

// How long to wait for the API before showing an error. Generous on purpose:
// Render's free plan sleeps when idle and the first request can take ~1 minute.
export const REQUEST_TIMEOUT_MS = 90_000;

// After this long without an answer, explain the cold start to the user.
export const SLOW_NOTICE_AFTER_MS = 4_000;
