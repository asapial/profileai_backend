import type { HarnessPreferences } from './harness.schema';

export function browserSearchUrls(preferences: HarnessPreferences) {
  const location = preferences.allowedCountries.length ? preferences.allowedCountries.join(' OR ') : 'worldwide';
  const workplace = preferences.workplace === 'REMOTE' ? 'remote' : preferences.workplace === 'ANY' ? '' : preferences.workplace.toLowerCase().replace('_', ' ');
  return preferences.roles.slice(0, 3).map((role, index) => {
    const query = [role, workplace, location, 'jobs', '(site:jobs.lever.co OR site:boards.greenhouse.io OR site:jobs.ashbyhq.com)'].filter(Boolean).join(' ');
    return { index, query, url: `https://www.google.com/search?q=${encodeURIComponent(query)}` };
  });
}
