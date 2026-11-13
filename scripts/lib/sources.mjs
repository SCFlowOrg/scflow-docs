// Finds the three source repositories and gets the merged catalogue from `scflow docs build`.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

export const REPOS = ["scflow-core", "scflow-framework", "scflow-plugins"];

/** The sibling checkouts, found under `parent`. Fails naming every missing one. */
export function locateRepos(parent) {
  const found = Object.fromEntries(REPOS.map((name) => [name, resolve(parent, name)]));
  const missing = REPOS.filter((name) => !existsSync(found[name]));
  if (missing.length > 0) throw new Error(`source repositories not found under ${parent}: ${missing.join(", ")} (set SCFLOW_PARENT)`);
  return found;
}

/** Folders that hold a `module.yaml`: the repo root and its `packages/*` and `plugins/*`. */
export function moduleFolders(repo) {
  const candidates = [repo];
  for (const group of ["packages", "plugins"]) {
    const dir = join(repo, group);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) candidates.push(join(dir, entry.name));
  }
  return candidates.filter((folder) => existsSync(join(folder, "module.yaml")));
}

/** What the staging needs of a module.yaml: its name, and whether it declares topics (a top-level `docs:`). */
export function readManifestInfo(folder) {
  const text = readFileSync(join(folder, "module.yaml"), "utf8");
  return { name: /^name:\s*(\S+)/m.exec(text)?.[1], hasDocs: /^docs:/m.test(text) };
}

/**
 * The modules to stage, in repo order: only those that declare `docs:` (a module with
 * none gives no topic, and one whose code is not built, such as scflow:graph, would fail
 * the load of `scflow docs`), and one folder per module name (scflow-plugins carries a
 * synced copy of scflow:core: the first one wins). `skipped` says why for the log.
 */
export function selectModules(repos) {
  const chosen = [];
  const skipped = [];
  const seen = new Map();
  for (const [name, repo] of Object.entries(repos)) {
    for (const folder of moduleFolders(repo)) {
      const info = readManifestInfo(folder);
      const where = `${name}:${folder === repo ? "." : folder.slice(repo.length + 1)}`;
      if (!info.hasDocs) skipped.push(`${where} (${info.name ?? "?"}): no docs`);
      else if (info.name && seen.has(info.name)) skipped.push(`${where} (${info.name}): same module as ${seen.get(info.name)}`);
      else {
        if (info.name) seen.set(info.name, where);
        chosen.push({ repo: name, root: repo, folder });
      }
    }
  }
  return { chosen, skipped };
}

/** Copies the selected modules into one folder, the `--modules` folder of `scflow docs`. */
export function stageModules(repos, staging) {
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const { chosen, skipped } = selectModules(repos);
  const staged = [];
  for (const { repo, root, folder } of chosen) {
    const target = join(staging, `${repo}--${folder === root ? "root" : folder.slice(root.length + 1).replace(/[\\/]/g, "-")}`);
    cpSync(folder, target, { recursive: true, filter: (src) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(src) });
    staged.push(target);
  }
  return { staged, skipped };
}

/**
 * Runs `scflow docs check` then `scflow docs build <out> --modules <staging>`.
 * The command is `SCFLOW_CLI` (e.g. `scflow`), else the built CLI of scflow-core.
 */
export function runScflowDocs({ core, staging, out, cli = process.env.SCFLOW_CLI }) {
  const [command, ...prefix] = cli ? cli.split(" ") : ["node", join(core, "packages/repl/dist/scflowCli.js")];
  if (!cli && !existsSync(prefix[0])) throw new Error(`scflow CLI not built: ${prefix[0]} is missing (build scflow-core, or set SCFLOW_CLI)`);
  const run = (args) => {
    const result = spawnSync(command, [...prefix, "docs", ...args], { encoding: "utf8", shell: process.platform === "win32" && Boolean(cli) });
    if (result.error) throw result.error;
    return result;
  };
  const check = run(["check", "--modules", staging]);
  if (check.status !== 0) throw new Error(`scflow docs check failed:\n${check.stderr || check.stdout}`);
  rmSync(out, { recursive: true, force: true });
  const build = run(["build", out, "--modules", staging]);
  if (build.status !== 0) throw new Error(`scflow docs build failed:\n${build.stderr || build.stdout}`);
}
