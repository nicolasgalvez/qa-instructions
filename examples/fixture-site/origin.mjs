import process from 'node:process';

/**
 * Where an example run serves the fixture site. `FIXTURE_PORT` picks the port
 * so runs on one machine (e.g. two worktrees) don't collide; goldens always
 * read the canonical port, so a run's output is canonicalized before it is
 * compared with (or written to) a golden.
 */
export class FixtureOrigin {
  static HOST = '127.0.0.1';
  static CANONICAL_PORT = 4321;

  /** @param {number} port */
  constructor(port) {
    this.port = port;
    this.url = `http://${FixtureOrigin.HOST}:${port}`;
  }

  /** The origin for this run: `FIXTURE_PORT`, or the canonical port. */
  static fromEnv(env = process.env) {
    const raw = env.FIXTURE_PORT;
    if (raw === undefined || raw === '') {
      return new FixtureOrigin(FixtureOrigin.CANONICAL_PORT);
    }
    const port = Number(raw);
    if (!/^\d+$/.test(raw) || port < 1 || port > 65535) {
      throw new Error(`FIXTURE_PORT must be a port number, got "${raw}"`);
    }
    return new FixtureOrigin(port);
  }

  /** The origin every golden is written against. */
  static get canonical() {
    return new FixtureOrigin(FixtureOrigin.CANONICAL_PORT);
  }

  /** `text` with this run's origin rewritten to the canonical one. */
  canonicalize(text) {
    const escaped = this.url.replace(/[.]/g, '\\.');
    return text.replace(
      new RegExp(`${escaped}(?!\\d)`, 'g'),
      FixtureOrigin.canonical.url,
    );
  }
}

/** The fixture site's origin for the current run. */
export const fixtureOrigin = FixtureOrigin.fromEnv();
