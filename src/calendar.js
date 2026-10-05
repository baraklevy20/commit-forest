// The contribution calendar, as GitHub draws it: the profile's own last year, or one
// GraphQL query per calendar year (the most a query may span) for the other periods. Private
// contributions are in the counts when the user shows them on their profile; nothing
// else about them is.

const API = 'https://api.github.com/graphql';

const ACCOUNT = `query($login: String!) { user(login: $login) { createdAt } }`;
const DAYS = `contributionCalendar { totalContributions weeks { contributionDays { date contributionCount contributionLevel } } }`;
// with no dates, the calendar is the one on the profile: the last year, up to today
const ROLLING = `query($login: String!) { user(login: $login) { contributionsCollection { ${DAYS} } } }`;
const SPAN = `query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) { contributionsCollection(from: $from, to: $to) { ${DAYS} } } }`;

async function query(token, q, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'commit-forest' },
    body: JSON.stringify({ query: q, variables }),
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  if (body.errors) throw new Error(body.errors.map(e => e.message).join('; '));
  return body.data;
}

const daysOf = calendar => calendar.weeks.flatMap(w => w.contributionDays)
  .map(d => ({ date: d.date, count: d.contributionCount, level: d.contributionLevel }));

async function span(login, token, year, now) {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = year === now.getUTCFullYear() ? now : new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  const data = await query(token, SPAN, { login, from: from.toISOString(), to: to.toISOString() });
  if (!data.user) throw new Error(`there is no GitHub user called ${login}`);
  return daysOf(data.user.contributionsCollection.contributionCalendar);
}

/* The days a period covers, oldest first, and today's date on the profile's calendar.
 * period: 'last-year' (the profile's own calendar, so the counts and shades match it
 * exactly), 'this-year', a year ('2025'), or 'all' (every year since the account was made). */
export async function fetchCalendar(login, token, period = 'last-year', now = new Date()) {
  const rolling = await query(token, ROLLING, { login });
  if (!rolling.user) throw new Error(`there is no GitHub user called ${login}`);
  const recent = daysOf(rolling.user.contributionsCollection.contributionCalendar);
  const today = recent[recent.length - 1].date;
  if (period === 'last-year') return { days: recent, today };
  if (period === 'this-year' || /^\d{4}$/.test(period)) {
    const year = period === 'this-year' ? Number(today.slice(0, 4)) : Number(period);
    return { days: await span(login, token, year, now), today };
  }
  if (period !== 'all') throw new Error(`period must be last-year, this-year, all or a year like 2025, not "${period}"`);
  const account = await query(token, ACCOUNT, { login });
  const days = new Map();
  for (let year = new Date(account.user.createdAt).getUTCFullYear(); year <= now.getUTCFullYear(); year++) {
    for (const d of await span(login, token, year, now)) days.set(d.date, d);
  }
  return { days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), today };
}
