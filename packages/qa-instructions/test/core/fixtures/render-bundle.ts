import type { QaRunBundle } from '../../../src/core/model.js';

/**
 * A fixed bundle that exercises everything a renderer shows: a prerequisite,
 * incomplete status, nested Sections (including a return to the outer one and
 * a step outside any Section), Expected Results, a warning step, an
 * approximate step, the failed step, steps with and without a Step
 * Screenshot, and characters that must be escaped in Markdown and HTML.
 */
export const RENDER_BUNDLE: QaRunBundle = {
  version: '1',
  meta: {
    title: 'Sign in & check <welcome>',
    prerequisite: 'Deploy the branch to dev first.',
    capturedAt: '2026-01-01T00:00:00.000Z',
    status: 'incomplete',
  },
  steps: [
    {
      index: 1,
      action: 'Open https://app.example.com/',
      expected: 'The **Home** heading is visible',
      url: 'https://app.example.com/',
      assetIds: ['step-01'],
      screenshotMoment: 'after',
    },
    {
      index: 2,
      action: 'Click the **Sign in** link',
      expected: 'The page title is **Sign in**',
      assetIds: ['step-02'],
      section: ['Sign in'],
      screenshotMoment: 'action',
    },
    {
      index: 3,
      action: 'Type **demo-user** into **Username**',
      assetIds: ['step-03'],
      section: ['Sign in', 'Enter the username'],
      approximate: true,
      screenshotMoment: 'action',
    },
    {
      index: 4,
      action:
        'The test changed the page with a script instead of a user action.',
      section: ['Sign in'],
      warning: true,
    },
    {
      index: 5,
      action: 'Click `Submit` <b>now</b>',
      expected: '**Welcome** is visible',
      assetIds: ['step-05'],
      failed: true,
      screenshotMoment: 'action',
    },
  ],
  assets: {
    'step-01': {
      id: 'step-01',
      contentType: 'image/png',
      filename: 'step-01.png',
    },
    'step-02': {
      id: 'step-02',
      contentType: 'image/png',
      filename: 'step-02.png',
    },
    'step-03': {
      id: 'step-03',
      contentType: 'image/png',
      filename: 'step-03.png',
    },
    'step-05': {
      id: 'step-05',
      contentType: 'image/png',
      filename: 'step-05.png',
    },
  },
};

/** Stand-in image bytes for each asset, keyed by asset id. */
export const RENDER_BUNDLE_IMAGES: ReadonlyMap<string, Uint8Array> = new Map([
  ['step-01', Buffer.from('one')],
  ['step-02', Buffer.from('two')],
  ['step-03', Buffer.from('three')],
  ['step-05', Buffer.from('five')],
]);
