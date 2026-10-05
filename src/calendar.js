// The contribution calendar, as GitHub draws it on the profile: one GraphQL query per year
// (the most a query may span), from the year the account was made to today. Private
// contributions are in the counts when the user shows them on their profile; nothing
// else about them is.

const API = 'https://api.github.com/graphql';

const ACCOUNT = `query($login: String!) { user(login: $login) { createdAt } }`;
const YEAR = `query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) { contributionsCollection(from: $from, to: $to) {
    contributionCalendar { weeks { contributionDays { date contributionCount contributionLevel } } } } } }`;

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

/* [{ date, count, level }] for every day since the account was made, oldest first. */
export async function fetchCalendar(login, token, now = new Date()) {
  const account = await query(token, ACCOUNT, { login });
  if (!account.user) throw new Error(`there is no GitHub user called ${login}`);
  const days = new Map();
  for (let year = new Date(account.user.createdAt).getUTCFullYear(); year <= now.getUTCFullYear(); year++) {
    const from = new Date(Date.UTC(year, 0, 1));
    const to = year === now.getUTCFullYear() ? now : new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    const data = await query(token, YEAR, { login, from: from.toISOString(), to: to.toISOString() });
    for (const week of data.user.contributionsCollection.contributionCalendar.weeks) {
      for (const d of week.contributionDays) days.set(d.date, { date: d.date, count: d.contributionCount, level: d.contributionLevel });
    }
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
