import type { ITestResult, TReport, IEpistemicReport, IAssertResult } from '../src/types';

let capturedAction: (suite?: string) => Promise<void>;

const mockCommand: Record<string, jest.Mock> = {
  name: jest.fn().mockReturnThis(),
  version: jest.fn().mockReturnThis(),
  description: jest.fn().mockReturnThis(),
  command: jest.fn().mockReturnThis(),
  argument: jest.fn().mockReturnThis(),
  action: jest.fn((fn: any) => {
    capturedAction = fn;
    return mockCommand;
  }),
  parse: jest.fn(),
};

jest.mock('commander', () => ({
  Command: jest.fn(() => mockCommand),
}));

const mockIntro = jest.fn();
const mockText = jest.fn();
const mockIsCancel = jest.fn<boolean, [unknown]>(() => false);
const mockSpinner = jest.fn(() => ({ start: jest.fn(), stop: jest.fn() }));
const mockCancel = jest.fn();
const mockOutro = jest.fn();

jest.mock('@clack/prompts', () => ({
  intro: (...args: any[]) => mockIntro(...args),
  text: (...args: any[]) => mockText(...args),
  isCancel: (value: unknown) => mockIsCancel(value),
  spinner: () => mockSpinner(),
  cancel: (...args: any[]) => mockCancel(...args),
  outro: (...args: any[]) => mockOutro(...args),
}));

jest.mock('picocolors', () => ({
  __esModule: true,
  default: {
    bgCyan: (s: string) => s,
    black: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
    green: (s: string) => s,
    blue: (s: string) => s,
    cyan: (s: string) => s,
    magenta: (s: string) => s,
    bold: (s: string) => s,
  },
}));

const mockParsePromptfoo = jest.fn<any, [string]>(() => [{ task: 'parsed' }]);
jest.mock('@eva-llm/eva-parser', () => ({
  parsePromptfoo: (content: string) => mockParsePromptfoo(content),
}));

const mockReadFileSync = jest.fn<string, [string, string]>(() => 'file content');
jest.mock('node:fs', () => ({
  readFileSync: (path: string, encoding: string) => mockReadFileSync(path, encoding),
}));

const mockUuidv7 = jest.fn(() => 'mock-uuid-v7');
jest.mock('uuidv7', () => ({
  uuidv7: () => mockUuidv7(),
}));

const mockRequest = jest.fn();
jest.mock('undici', () => ({
  request: (...args: any[]) => mockRequest(...args),
}));

const mockObserve = jest.fn();
jest.mock('../src/utils', () => ({
  observe: (...args: any[]) => mockObserve(...args),
}));

// Load the module — registers the commander action via the mock
require('../src/index');

const makeReport = (overrides: Partial<TReport> = {}): TReport => ({
  testsAmount: 2,
  passedTestsAmount: 2,
  failedTests: [],
  epistemicTests: [],
  missedTestsAmount: 0,
  ...overrides,
});

const makeTestResult = (overrides: Partial<ITestResult> = {}): ITestResult => ({
  id: 'test-1',
  run_id: 'run-1',
  provider: 'openai',
  model: 'gpt-4',
  prompt: 'test prompt',
  output: 'test output',
  passed: false,
  metadata: null,
  started_at: new Date('2025-01-01'),
  assert_started_at: new Date('2025-01-01'),
  finished_at: new Date('2025-01-01'),
  diff_ms: 100,
  assert_diff_ms: 50,
  output_diff_ms: 50,
  ...overrides,
});

const makeAssertResult = (overrides: Partial<IAssertResult> = {}): IAssertResult => ({
  id: 'assert-1',
  test_id: 'test-1',
  run_id: 'run-1',
  name: 'test-assert',
  criteria: 'test criteria',
  passed: false,
  score: 0,
  reason: 'it failed',
  threshold: 0.5,
  metadata: null,
  started_at: new Date('2025-01-01'),
  finished_at: new Date('2025-01-01'),
  diff_ms: 50,
  ...overrides,
});

describe('eva-cli index module', () => {
  let consoleSpy: jest.SpiedFunction<typeof console.log>;
  let exitSpy: jest.SpiedFunction<typeof process.exit>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as any);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  describe('run command', () => {
    const setupMocks = (report: TReport = makeReport()) => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: () => Promise.resolve({ test_ids: ['tid-1', 'tid-2'] }),
          text: () => Promise.resolve(''),
        },
      });
      mockObserve.mockResolvedValue(report);
    };

    it('should read and parse the suite file', async () => {
      setupMocks();

      await expect(capturedAction('my-suite.yaml')).rejects.toThrow('process.exit');

      expect(mockReadFileSync).toHaveBeenCalledWith('my-suite.yaml', 'utf-8');
      expect(mockParsePromptfoo).toHaveBeenCalledWith('file content');
    });

    it('should submit parsed tasks to the eva-run cluster', async () => {
      setupMocks();

      await expect(capturedAction('suite.yaml')).rejects.toThrow('process.exit');

      expect(mockRequest).toHaveBeenCalledWith(
        'http://localhost:3000/eval',
        expect.objectContaining({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify([{ run_id: 'mock-uuid-v7', task: 'parsed' }]),
          bodyTimeout: 0,
          headersTimeout: 0,
        }),
      );
    });

    it('should observe test results with run_id and test_ids', async () => {
      setupMocks();

      await expect(capturedAction('suite.yaml')).rejects.toThrow('process.exit');

      expect(mockObserve).toHaveBeenCalledWith('mock-uuid-v7', ['tid-1', 'tid-2']);
    });

    it('should prompt for suite path when not provided as argument', async () => {
      setupMocks();
      mockText.mockResolvedValue('interactive-suite.yaml');

      await expect(capturedAction(undefined)).rejects.toThrow('process.exit');

      expect(mockText).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Provide path to the test suite:' }),
      );
      expect(mockReadFileSync).toHaveBeenCalledWith('interactive-suite.yaml', 'utf-8');
    });

    it('should validate that prompt input is not empty', async () => {
      setupMocks();
      mockText.mockResolvedValue('suite.yaml');

      await expect(capturedAction(undefined)).rejects.toThrow('process.exit');

      const textConfig = mockText.mock.calls[0][0];
      expect(textConfig.validate('')).toBe('Please enter a path');
      expect(textConfig.validate('some-path')).toBeUndefined();
    });

    it('should exit gracefully when user cancels the prompt', async () => {
      mockIsCancel.mockReturnValueOnce(true);
      mockText.mockResolvedValue(Symbol('cancel'));

      await expect(capturedAction(undefined)).rejects.toThrow('process.exit(0)');

      expect(mockCancel).toHaveBeenCalledWith('Operation cancelled.');
      expect(mockRequest).not.toHaveBeenCalled();
    });

    it('should throw on non-200 API response', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 500,
        body: {
          text: () => Promise.resolve('Internal Server Error'),
        },
      });

      await expect(capturedAction('suite.yaml')).rejects.toThrow(
        'Server responded with 500: Internal Server Error',
      );
    });

    it('should call outro and exit after printing report', async () => {
      setupMocks();

      await expect(capturedAction('suite.yaml')).rejects.toThrow('process.exit');

      expect(mockOutro).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('should log submission and test count messages', async () => {
      setupMocks();

      await expect(capturedAction('suite.yaml')).rejects.toThrow('process.exit');

      const logs = consoleSpy.mock.calls.map((c) => c[0]);
      expect(logs).toContain('Submitting to eva-run cluster (localhost:3000)...');
      expect(logs).toContain('2 test(s) are started...');
    });
  });

  describe('printReport', () => {
    const setupAndRun = async (report: TReport) => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: { json: () => Promise.resolve({ test_ids: ['t1'] }) },
      });
      mockObserve.mockResolvedValue(report);

      await expect(capturedAction('suite.yaml')).rejects.toThrow('process.exit');
    };

    it('should print summary for all-passing report', async () => {
      await setupAndRun(
        makeReport({
          testsAmount: 3,
          passedTestsAmount: 3,
          failedTests: [],
          epistemicTests: [],
          missedTestsAmount: 0,
        }),
      );

      const logs = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(logs).toContain('Passed tests: 3');
      expect(logs).toContain('Failed tests: 0');
      expect(logs).toContain('Total tests: 3');
      expect(logs).toContain('Missed tests: 0');
      expect(logs).not.toContain('Failed test details:');
    });

    it('should print failed test details with asserts', async () => {
      const failedTest = makeTestResult({
        id: 'ft-1',
        provider: 'anthropic',
        model: 'claude-3',
        prompt: 'why?',
        output: 'because',
        passed: false,
        asserts: [
          makeAssertResult({
            criteria: 'must be polite',
            reason: 'was rude',
            passed: false,
            score: 0.2,
            threshold: 0.8,
          }),
        ],
      });

      await setupAndRun(
        makeReport({
          testsAmount: 1,
          passedTestsAmount: 0,
          failedTests: [failedTest],
        }),
      );

      const logs = consoleSpy.mock.calls.map((c) => String(c.join(' '))).join('\n');
      expect(logs).toContain('Failed test details:');
      expect(logs).toContain('why?');
      expect(logs).toContain('because');
      expect(logs).toContain('must be polite');
      expect(logs).toContain('was rude');
      expect(logs).toContain('Failed tests: 1');
    });

    it('should print epistemic test details', async () => {
      const epistemicTest: IEpistemicReport = {
        ...makeTestResult({ id: 'et-1', prompt: 'epistemic q', output: 'answer' }),
        honesty: 0.875,
        deviation: 0.125,
      };

      await setupAndRun(
        makeReport({
          testsAmount: 1,
          passedTestsAmount: 1,
          failedTests: [],
          epistemicTests: [epistemicTest],
        }),
      );

      const logs = consoleSpy.mock.calls.map((c) => String(c.join(' '))).join('\n');
      expect(logs).toContain('Epistemic test details:');
      expect(logs).toContain('epistemic q');
      expect(logs).toContain('answer');
      expect(logs).toContain('0.875');
      expect(logs).toContain('0.125');
      expect(logs).toContain('Epistemic tests: 1');
    });

    it('should print missed tests count', async () => {
      await setupAndRun(
        makeReport({
          testsAmount: 5,
          passedTestsAmount: 3,
          missedTestsAmount: 2,
        }),
      );

      const logs = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(logs).toContain('Missed tests: 2');
    });

    it('should display temperature in model info for failed tests', async () => {
      const test = makeTestResult({
        provider: 'openai',
        model: 'gpt-4',
        metadata: { temperature: 0.7 },
        asserts: [makeAssertResult()],
      });

      await setupAndRun(makeReport({ testsAmount: 1, passedTestsAmount: 0, failedTests: [test] }));

      const logs = consoleSpy.mock.calls.map((c) => String(c.join(' '))).join('\n');
      expect(logs).toContain('openai | gpt-4 | T=0.7');
    });

    it('should display topP in model info for failed tests', async () => {
      const test = makeTestResult({
        provider: 'openai',
        model: 'gpt-4',
        metadata: { topP: 0.9 },
        asserts: [makeAssertResult()],
      });

      await setupAndRun(makeReport({ testsAmount: 1, passedTestsAmount: 0, failedTests: [test] }));

      const logs = consoleSpy.mock.calls.map((c) => String(c.join(' '))).join('\n');
      expect(logs).toContain('openai | gpt-4 | topP=0.9');
    });

    it('should display topK in model info for failed tests', async () => {
      const test = makeTestResult({
        provider: 'openai',
        model: 'gpt-4',
        metadata: { topK: 50 },
        asserts: [makeAssertResult()],
      });

      await setupAndRun(makeReport({ testsAmount: 1, passedTestsAmount: 0, failedTests: [test] }));

      const logs = consoleSpy.mock.calls.map((c) => String(c.join(' '))).join('\n');
      expect(logs).toContain('openai | gpt-4 | topK=50');
    });

    it('should display provider and model without extras when no relevant metadata', async () => {
      const test = makeTestResult({
        provider: 'anthropic',
        model: 'claude-3',
        metadata: null,
        asserts: [makeAssertResult()],
      });

      await setupAndRun(makeReport({ testsAmount: 1, passedTestsAmount: 0, failedTests: [test] }));

      const logs = consoleSpy.mock.calls.map((c) => String(c.join(' '))).join('\n');
      expect(logs).toContain('anthropic | claude-3');
      expect(logs).not.toMatch(/T=|topP=|topK=/);
    });

    it('should print must_fail metadata in assert summary', async () => {
      const test = makeTestResult({
        asserts: [
          makeAssertResult({
            passed: true,
            score: 0.9,
            threshold: 0.5,
            metadata: { must_fail: true },
          }),
        ],
      });

      await setupAndRun(makeReport({ testsAmount: 1, passedTestsAmount: 0, failedTests: [test] }));

      const logs = consoleSpy.mock.calls.map((c) => String(c.join(' '))).join('\n');
      expect(logs).toContain('must_fail: true');
    });

    it('should omit must_fail when assert metadata is null', async () => {
      const test = makeTestResult({
        asserts: [makeAssertResult({ metadata: null })],
      });

      await setupAndRun(makeReport({ testsAmount: 1, passedTestsAmount: 0, failedTests: [test] }));

      const logs = consoleSpy.mock.calls.map((c) => String(c.join(' '))).join('\n');
      expect(logs).not.toContain('must_fail');
    });

    it('should display model info for epistemic tests', async () => {
      const epistemicTest: IEpistemicReport = {
        ...makeTestResult({
          provider: 'google',
          model: 'gemini-pro',
          metadata: { temperature: 0.3 },
        }),
        honesty: 1,
        deviation: 0,
      };

      await setupAndRun(makeReport({ epistemicTests: [epistemicTest] }));

      const logs = consoleSpy.mock.calls.map((c) => String(c.join(' '))).join('\n');
      expect(logs).toContain('google | gemini-pro | T=0.3');
    });

    it('should handle multiple failed tests', async () => {
      const tests = [
        makeTestResult({
          id: 'ft-1',
          prompt: 'prompt A',
          asserts: [makeAssertResult({ id: 'a1', criteria: 'criterion A' })],
        }),
        makeTestResult({
          id: 'ft-2',
          prompt: 'prompt B',
          asserts: [makeAssertResult({ id: 'a2', criteria: 'criterion B' })],
        }),
      ];

      await setupAndRun(
        makeReport({ testsAmount: 2, passedTestsAmount: 0, failedTests: tests }),
      );

      const logs = consoleSpy.mock.calls.map((c) => String(c.join(' '))).join('\n');
      expect(logs).toContain('prompt A');
      expect(logs).toContain('prompt B');
      expect(logs).toContain('criterion A');
      expect(logs).toContain('criterion B');
    });
  });
});
