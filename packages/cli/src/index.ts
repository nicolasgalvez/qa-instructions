#!/usr/bin/env node
import { isRenderFormat, RENDER_FORMATS } from '@qa-instructions/core';

import { findBundles, renderAll } from './render.js';

const USAGE = `Usage: qa-instructions render <bundle-dir> --format ${RENDER_FORMATS.join('|')} --out <dir>`;

function parseArgs(argv: string[]) {
  const [, , command, input, ...rest] = argv;
  const flags = new Map<string, string>();

  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]?.replace(/^--/, '');
    const value = rest[i + 1];
    if (key && value) flags.set(key, value);
  }

  return {
    command,
    input,
    format: flags.get('format') ?? 'qa-steps',
    out: flags.get('out') ?? 'qa-steps-out',
  };
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.command !== 'render' || !args.input) {
    console.error(USAGE);
    process.exit(1);
  }
  if (!isRenderFormat(args.format)) {
    console.error(`Unknown format "${args.format}".\n${USAGE}`);
    process.exit(1);
  }

  const bundles = await findBundles(args.input);
  if (bundles.length === 0) {
    throw new Error(`No bundles found under ${args.input}`);
  }

  await renderAll(bundles, args.format, args.out);
  for (const bundleDir of bundles) {
    console.log(`rendered ${bundleDir}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
