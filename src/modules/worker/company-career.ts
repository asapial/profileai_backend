type Board = { company: string; provider: string; board: string };
type BoardResponse = { ok: boolean; json(): Promise<unknown>; headers?: { get(name: string): string | null } };
type BoardFetch = (url: string) => Promise<BoardResponse>;

const companyKey = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');

/** Resolve only public boards whose company identity can be checked. */
export async function resolveCompanyCareer(company: string, boards: Board[], fetchBoard: BoardFetch = url =>
  fetch(url, { headers: { Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(8000) }),
): Promise<{ url: string; company: string } | null> {
  const name = company.trim();
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .,&'()\-]{1,119}$/u.test(name)) return null;
  const key = companyKey(name);
  if (key.length < 2) return null;
  const boardDestination = async (boardUrl: string): Promise<string> => {
    try {
      let page = await fetchBoard(boardUrl);
      let location = page.headers?.get('location');
      if (location) {
        const first = new URL(location, boardUrl);
        const original = new URL(boardUrl);
        if (first.protocol === 'https:' && first.hostname === 'job-boards.greenhouse.io' && first.pathname === original.pathname && !first.username && !first.password && !first.port) {
          page = await fetchBoard(first.toString());
          location = page.headers?.get('location');
        }
      }
      if (location) {
        const redirect = new URL(location, boardUrl);
        const hosts = ['com', 'org', 'net', 'io', 'co', 'co.uk'].flatMap(tld => [`${key}.${tld}`, `www.${key}.${tld}`, `careers.${key}.${tld}`, `jobs.${key}.${tld}`]);
        if (redirect.protocol === 'https:' && !redirect.username && !redirect.password && !redirect.port && hosts.includes(redirect.hostname) && /\b(careers?|jobs?)\b/i.test(redirect.pathname)) return redirect.toString();
      }
    } catch { /* The scoped ATS board remains the fallback. */ }
    return boardUrl;
  };
  const matches = boards.filter(row => companyKey(row.company) === key && /^[a-zA-Z0-9_-]{1,80}$/.test(row.board) && ['GREENHOUSE', 'LEVER'].includes(row.provider));
  if (matches.length === 1) {
    const row = matches[0]!;
    const url = row.provider === 'GREENHOUSE' ? await boardDestination(`https://boards.greenhouse.io/${row.board}`) : `https://jobs.lever.co/${row.board}`;
    return { company: row.company, url };
  }
  if (matches.length > 1) return null;
  const slugs = [...new Set([name.toLowerCase().replace(/[^a-z0-9]+/g, ''), name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')])].filter(value => /^[a-z0-9][a-z0-9-]{1,79}$/.test(value));
  for (const slug of slugs) {
    try {
      const response = await fetchBoard(`https://boards-api.greenhouse.io/v1/boards/${slug}`);
      if (!response.ok) continue;
      const body = await response.json();
      if (body && typeof body === 'object' && 'name' in body && typeof body.name === 'string' && companyKey(body.name) === key) {
        const boardUrl = `https://boards.greenhouse.io/${slug}`;
        return { company: body.name, url: await boardDestination(boardUrl) };
      }
    } catch { /* An unavailable provider is not evidence of a matching company. */ }
  }
  return null;
}
