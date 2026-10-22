/**
 * Converte links do GitHub em endereços que o widget de notícias consegue ler.
 * - Arquivo (github.com/u/r/blob/branch/arq.json|xml) → raw.githubusercontent.com
 * - Repositório (github.com/u/r) → feed Atom de commits
 * - .../releases, .../commits[/branch], .../tags → feed Atom correspondente
 * Qualquer outro endereço é devolvido sem alteração.
 */
export function normalizeGithubFeedUrl(input: string): string {
  const raw = input.trim();
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return raw;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return raw;
  const [owner, repo, kind, ...rest] = parts;
  const base = `https://github.com/${owner}/${repo.replace(/\.git$/, "")}`;
  if (kind === "blob" && rest.length >= 2) {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${rest.join("/")}`;
  }
  if (kind === "raw" && rest.length >= 2) {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${rest.join("/")}`;
  }
  if (kind && kind.endsWith(".atom")) return raw;
  if (kind === "releases") return `${base}/releases.atom`;
  if (kind === "tags") return `${base}/tags.atom`;
  if (kind === "commits") {
    return rest.length ? `${base}/commits/${rest.join("/")}.atom` : `${base}/commits.atom`;
  }
  if (!kind) return `${base}/commits.atom`;
  return raw;
}

export function isGithubUrl(input: string): boolean {
  return /^https?:\/\/(www\.)?github\.com\//i.test(input.trim());
}
