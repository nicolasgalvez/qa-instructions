/** The marks a Highlight can draw on a Step Screenshot. */
export type HighlightMark = 'outline' | 'clickDot' | 'badge' | 'spotlight';

export type QaAsset = {
  id: string;
  contentType: string;
  filename: string;
  sha256?: string;
  /** The Highlight marks drawn on this Step Screenshot, if any. */
  highlight?: HighlightMark[];
};

/** A width and height, in CSS pixels for a viewport or in pixels for an image. */
export type QaSize = { width: number; height: number };

/** A point on the page, in CSS pixels from the viewport's top-left corner. */
export type QaPoint = { x: number; y: number };

/** A rectangle on the page, in CSS pixels from the viewport's top-left corner. */
export type QaBox = { x: number; y: number; width: number; height: number };

/**
 * When a Step Screenshot was taken, relative to its Action: at the moment of
 * the Action (preferred), just after it, or just before it.
 */
export type QaScreenshotMoment = 'action' | 'after' | 'before';

export type QaStep = {
  index: number;
  action: string;
  expected?: string;
  url?: string;
  assetIds?: string[];
  /** Titles of the Section this step is in, outermost group first. */
  section?: string[];
  /** True on the QA Step where the test failed. */
  failed?: boolean;
  /** A soft check in the step's Expected Result failed; the test went on. */
  checkFailed?: boolean;
  /** The test changed the page by script here; the tester may need to act by hand. Has no Highlight. */
  warning?: boolean;
  /** The Action was forced past the runner's usual checks; its Highlight may not line up. */
  approximate?: boolean;
  /** When the step's Step Screenshot (its first asset) was taken. */
  screenshotMoment?: QaScreenshotMoment;
  /** The element the Action touched, at the moment of the Action. */
  elementBox?: QaBox;
  /** Where the Action clicked or tapped. */
  clickPoint?: QaPoint;
  /** The viewport the Step Screenshot shows, in CSS pixels; scales its Highlight to the image. */
  viewport?: QaSize;
};

export type QaRunBundle = {
  version: '1';
  meta: {
    title: string;
    prerequisite?: string;
    source?: {
      runner: 'playwright' | 'jest' | 'devtools' | 'manual';
      testFile?: string;
      testTitle?: string;
      project?: string;
    };
    capturedAt: string;
    /**
     * `incomplete`: derived from a test that did not pass, so the QA Steps
     * stop where it failed, or flag where its soft checks failed.
     */
    status: 'complete' | 'incomplete';
  };
  steps: QaStep[];
  assets: Record<string, QaAsset>;
};

export type QaGuideOptions = {
  title: string;
  prerequisite?: string;
};

export type QaStepInput = Omit<QaStep, 'index'>;

export type QaAssetInput = {
  id: string;
  contentType: string;
  filename: string;
  data: Buffer;
  sha256?: string;
};
