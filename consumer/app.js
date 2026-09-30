// Rox Restaurants consumer: a restaurant list with an area filter and a
// "Next page" button that follows the API's cursor. Every request goes to
// the public API URL from config.js.
import { API_BASE_URL, PAGE_SIZE, REQUEST_TIMEOUT_MS, SLOW_NOTICE_AFTER_MS } from './config.js';

const AREAS = [
  'GRA Phase 2', 'Old GRA', 'Rumuola', 'Trans-Amadi', 'D-Line', 'Woji', 'Rumuokoro',
  'Eliozu', 'Ada George', 'Choba', 'Diobu', 'Borokiri', 'Elelenwo', 'Peter Odili Road',
];

const el = {
  area: document.querySelector('#area'),
  status: document.querySelector('#status'),
  list: document.querySelector('#list'),
  summary: document.querySelector('#summary'),
  next: document.querySelector('#next'),
  first: document.querySelector('#first'),
  retry: document.querySelector('#retry'),
  apiUrl: document.querySelector('#api-url'),
};

// Everything the page needs to know about where it is.
const state = {
  area: '', // '' = all areas
  cursor: null, // cursor of the page being shown (null = first page)
  nextCursor: null, // from meta.nextCursor
  pageNumber: 1,
  shownBefore: 0, // rows on the pages before this one, for "11–20 of 27"
};

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const formatKobo = (kobo) => naira.format(kobo / 100);

// ---------- Talking to the API ----------

function isConfigured(url) {
  return /^https:\/\//.test(url) && !/YOUR-SERVICE|localhost|127\.0\.0\.1/.test(url);
}

// Fetches one page. Resolves with the API's { data, meta } or throws an
// Error whose message is safe to show to the user.
async function fetchRestaurants({ area, cursor }) {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), sort: 'name', order: 'asc' });
  if (area) params.set('area', area);
  if (cursor) params.set('cursor', cursor);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/restaurants?${params}`, { signal: controller.signal });
  } catch (error) {
    throw new Error(
      error.name === 'AbortError'
        ? `The API did not answer within ${REQUEST_TIMEOUT_MS / 1000} seconds.`
        : 'Could not reach the API. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timer);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    // The API always sends { error: { code, message } } with an honest status.
    if (response.status === 429) {
      // Retry-After is readable only because the API lists it in CORS
      // exposedHeaders. Seconds until the rate-limit window resets.
      const wait = Number(response.headers.get('Retry-After'));
      throw new Error(
        wait > 0
          ? `Too many requests. Please wait ${wait} seconds, then try again.`
          : 'Too many requests. Please wait a minute, then try again.',
      );
    }
    throw new Error(body?.error?.message ?? `The API answered with status ${response.status}.`);
  }
  return body;
}

// ---------- The four states: loading, error, empty, data ----------

function showLoading() {
  el.status.className = 'status loading';
  el.status.textContent = 'Loading restaurants…';
  el.list.replaceChildren();
  el.summary.textContent = '';
  el.next.disabled = true;
  el.first.hidden = true;
  el.retry.hidden = true;
  el.area.disabled = true;
}

function showError(message) {
  el.status.className = 'status error';
  el.status.textContent = message;
  el.list.replaceChildren();
  el.summary.textContent = '';
  el.next.disabled = true;
  el.first.hidden = state.pageNumber === 1;
  el.retry.hidden = false;
  el.area.disabled = false;
}

function showPage({ data, meta }) {
  el.area.disabled = false;
  el.retry.hidden = true;
  state.nextCursor = meta.nextCursor;

  if (data.length === 0) {
    el.status.className = 'status empty';
    el.status.textContent = state.area
      ? `No restaurants found in ${state.area}. Try another area.`
      : 'No restaurants found.';
    el.list.replaceChildren();
    el.summary.textContent = '';
  } else {
    el.status.className = 'status';
    el.status.textContent = '';
    el.list.replaceChildren(...data.map(renderRestaurant));
    const from = state.shownBefore + 1;
    const to = state.shownBefore + data.length;
    el.summary.textContent = `Showing ${from}–${to} of ${meta.total} · page ${state.pageNumber}`;
  }

  el.next.disabled = !meta.hasMore;
  el.first.hidden = state.pageNumber === 1;
}

// Built with textContent, never innerHTML, so text coming from the API can
// never be interpreted as HTML (no script injection).
function renderRestaurant(restaurant) {
  const item = document.createElement('li');
  item.className = 'card';

  const title = document.createElement('h2');
  title.textContent = restaurant.name;

  const badge = document.createElement('span');
  badge.className = restaurant.isOpen ? 'badge open' : 'badge closed';
  badge.textContent = restaurant.isOpen ? 'Open' : 'Closed';
  title.append(' ', badge);

  const where = document.createElement('p');
  where.className = 'muted';
  where.textContent = `${capitalise(restaurant.cuisine)} · ${restaurant.address}`;

  const money = document.createElement('p');
  money.textContent =
    `Delivery ${formatKobo(restaurant.deliveryFeeKobo)}` +
    (restaurant.minimumOrderKobo > 0 ? ` · Minimum order ${formatKobo(restaurant.minimumOrderKobo)}` : ' · No minimum order');

  item.append(title, where, money);
  return item;
}

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// ---------- Loading a page ----------

let requestNumber = 0;

async function load() {
  const thisRequest = ++requestNumber;
  showLoading();
  // On a sleeping free-tier server the first answer can take a while: say why.
  const slowNotice = setTimeout(() => {
    el.status.textContent = 'Waking up the API… Free hosting sleeps when idle, so the first request can take up to a minute.';
  }, SLOW_NOTICE_AFTER_MS);

  try {
    const page = await fetchRestaurants({ area: state.area, cursor: state.cursor });
    // Ignore an answer that arrives after the user already asked for something else.
    if (thisRequest === requestNumber) showPage(page);
  } catch (error) {
    if (thisRequest === requestNumber) showError(error.message);
  } finally {
    clearTimeout(slowNotice);
  }
}

function goToFirstPage() {
  state.cursor = null;
  state.nextCursor = null;
  state.pageNumber = 1;
  state.shownBefore = 0;
  load();
}

// ---------- Wiring ----------

el.apiUrl.textContent = API_BASE_URL;
el.area.append(...AREAS.map((area) => new Option(area, area)));

el.area.addEventListener('change', () => {
  state.area = el.area.value;
  goToFirstPage(); // a new filter starts from its first page
});

el.next.addEventListener('click', () => {
  if (!state.nextCursor) return;
  state.shownBefore += el.list.children.length;
  state.cursor = state.nextCursor;
  state.pageNumber += 1;
  load();
});

el.first.addEventListener('click', goToFirstPage);
el.retry.addEventListener('click', load);

if (isConfigured(API_BASE_URL)) {
  goToFirstPage();
} else {
  showError('The API URL is not configured. Set API_BASE_URL in config.js to the public https:// URL of the API.');
  el.retry.hidden = true;
  el.area.disabled = true;
}
