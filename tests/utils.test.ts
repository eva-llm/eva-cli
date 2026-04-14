import { xnor, observe } from '../src/utils';
import { getFinishedTests, getFinishedAsserts } from '../src/db';
import type { ITestResult, IAssertResult } from '../src/types';

jest.mock('picocolors', () => ({
  __esModule: true,
  default: { yellow: jest.fn((s: string) => s) },
}));
jest.mock('../src/db', () => ({
  getFinishedTests: jest.fn(),
  getFinishedAsserts: jest.fn(),
}));

const mockedGetFinishedTests = getFinishedTests as jest.Mock;
const mockedGetFinishedAsserts = getFinishedAsserts as jest.Mock;

const makeTestResult = (overrides: Partial<ITestResult> = {}): ITestResult => ({
  id: 'test-1',
  run_id: 'run-1',
  provider: 'openai',
  model: 'gpt-4',
  prompt: 'test prompt',
  output: 'test output',
  passed: true,
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
  passed: true,
  score: 1,
  reason: 'passed',
  threshold: 0.5,
  metadata: null,
  started_at: new Date('2025-01-01'),
  finished_at: new Date('2025-01-01'),
  diff_ms: 50,
  ...overrides,
});

describe('utils module', () => {
  describe('xnor', () => {
    it('should return true when both are true', () => {
      expect(xnor(true, true)).toBe(true);
    });

    it('should return true when both are false', () => {
      expect(xnor(false, false)).toBe(true);
    });

    it('should return false when first is true and second is false', () => {
      expect(xnor(true, false)).toBe(false);
    });

    it('should return false when first is false and second is true', () => {
      expect(xnor(false, true)).toBe(false);
    });
  });

  describe('observe', () => {
    let consoleSpy: jest.SpiedFunction<typeof console.log>;

    beforeEach(() => {
      jest.useFakeTimers();
      jest.clearAllMocks();
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      jest.useRealTimers();
      consoleSpy.mockRestore();
    });

    it('should return report when all tests complete in one batch', async () => {
      const tests = [
        makeTestResult({ id: 'test-1', passed: true }),
        makeTestResult({ id: 'test-2', passed: true }),
      ];

      mockedGetFinishedTests.mockResolvedValueOnce(tests);
      mockedGetFinishedAsserts.mockResolvedValueOnce([]);

      const promise = observe('run-1', ['test-1', 'test-2']);
      await jest.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result).toEqual({
        testsAmount: 2,
        passedTestsAmount: 2,
        failedTests: [],
        epistemicTests: [],
        missedTestsAmount: 0,
      });
    });

    it('should handle tests completing in multiple batches', async () => {
      mockedGetFinishedTests
        .mockResolvedValueOnce([makeTestResult({ id: 'test-1' })])
        .mockResolvedValueOnce([makeTestResult({ id: 'test-2' })]);
      mockedGetFinishedAsserts.mockResolvedValueOnce([]);

      const promise = observe('run-1', ['test-1', 'test-2']);
      await jest.advanceTimersByTimeAsync(200);
      await jest.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result.testsAmount).toBe(2);
      expect(result.passedTestsAmount).toBe(2);
      expect(result.failedTests).toEqual([]);
      expect(result.missedTestsAmount).toBe(0);
      expect(consoleSpy).toHaveBeenCalledTimes(2);
    });

    it('should report failed tests with their asserts attached', async () => {
      const failedTest = makeTestResult({ id: 'test-1', passed: false });
      const passingTest = makeTestResult({ id: 'test-2', passed: true });
      const failedAssert = makeAssertResult({
        id: 'assert-1',
        test_id: 'test-1',
        passed: false,
        score: 0,
        reason: 'failed criteria',
      });

      mockedGetFinishedTests.mockResolvedValueOnce([failedTest, passingTest]);
      mockedGetFinishedAsserts.mockResolvedValueOnce([failedAssert]);

      const promise = observe('run-1', ['test-1', 'test-2']);
      await jest.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result.testsAmount).toBe(2);
      expect(result.passedTestsAmount).toBe(1);
      expect(result.failedTests).toHaveLength(1);
      expect(result.failedTests[0].id).toBe('test-1');
      expect(result.failedTests[0].asserts).toEqual([failedAssert]);
    });

    it('should calculate epistemic test metrics', async () => {
      const test = makeTestResult({ id: 'test-1', passed: true });

      const positivePassedAssert = makeAssertResult({
        id: 'assert-pos-pass',
        test_id: 'test-1',
        passed: true,
        metadata: null,
      });
      const positiveFailedAssert = makeAssertResult({
        id: 'assert-pos-fail',
        test_id: 'test-1',
        passed: false,
        metadata: null,
      });
      const negativeFailedAssert = makeAssertResult({
        id: 'assert-neg-fail',
        test_id: 'test-1',
        passed: false,
        metadata: { must_fail: true },
      });
      const negativePassedAssert = makeAssertResult({
        id: 'assert-neg-pass',
        test_id: 'test-1',
        passed: true,
        metadata: { must_fail: true },
      });

      mockedGetFinishedTests.mockResolvedValueOnce([test]);
      mockedGetFinishedAsserts.mockResolvedValueOnce([
        positivePassedAssert,
        positiveFailedAssert,
        negativeFailedAssert,
        negativePassedAssert,
      ]);

      const promise = observe('run-1', ['test-1']);
      await jest.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result.epistemicTests).toHaveLength(1);
      // positiveAsserts: 2, positivePassedAsserts: 1 → ratio 0.5
      // negativeAsserts: 2, negativeFailedAsserts: 1 → ratio 0.5
      // honesty = |1 - 0.5 - 0.5| = 0, deviation = 1
      expect(result.epistemicTests[0].honesty).toBe(0);
      expect(result.epistemicTests[0].deviation).toBe(1);
    });

    it('should calculate perfect epistemic scores', async () => {
      const test = makeTestResult({ id: 'test-1', passed: true });

      const positiveAssert = makeAssertResult({
        id: 'assert-pos',
        test_id: 'test-1',
        passed: true,
        metadata: null,
      });
      const negativeAssert = makeAssertResult({
        id: 'assert-neg',
        test_id: 'test-1',
        passed: false,
        metadata: { must_fail: true },
      });

      mockedGetFinishedTests.mockResolvedValueOnce([test]);
      mockedGetFinishedAsserts.mockResolvedValueOnce([positiveAssert, negativeAssert]);

      const promise = observe('run-1', ['test-1']);
      await jest.advanceTimersByTimeAsync(200);
      const result = await promise;

      // positivePassedAsserts/positiveAsserts = 1/1, negativeFailedAsserts/negativeAsserts = 1/1
      // honesty = |1 - 1 - 1| = 1, deviation = 0
      expect(result.epistemicTests[0].honesty).toBe(1);
      expect(result.epistemicTests[0].deviation).toBe(0);
    });

    it('should skip epistemic entries when test is not found in results', async () => {
      const test = makeTestResult({ id: 'test-1', passed: true });

      const assertForMissingTest = makeAssertResult({
        id: 'assert-1',
        test_id: 'test-nonexistent',
        metadata: { must_fail: true },
      });

      mockedGetFinishedTests.mockResolvedValueOnce([test]);
      mockedGetFinishedAsserts.mockResolvedValueOnce([assertForMissingTest]);

      const promise = observe('run-1', ['test-1']);
      await jest.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result.epistemicTests).toEqual([]);
    });

    it('should correctly filter failed asserts using xnor logic', async () => {
      const test = makeTestResult({ id: 'test-1', passed: false });

      // Regular assert that failed → included (unexpected outcome)
      const regularFailed = makeAssertResult({
        id: 'a1',
        test_id: 'test-1',
        passed: false,
        metadata: null,
      });
      // Regular assert that passed → excluded (expected outcome)
      const regularPassed = makeAssertResult({
        id: 'a2',
        test_id: 'test-1',
        passed: true,
        metadata: null,
      });
      // must_fail assert that passed → included (unexpected outcome)
      const mustFailPassed = makeAssertResult({
        id: 'a3',
        test_id: 'test-1',
        passed: true,
        metadata: { must_fail: true },
      });
      // must_fail assert that failed → excluded (expected outcome)
      const mustFailFailed = makeAssertResult({
        id: 'a4',
        test_id: 'test-1',
        passed: false,
        metadata: { must_fail: true },
      });

      mockedGetFinishedTests.mockResolvedValueOnce([test]);
      mockedGetFinishedAsserts.mockResolvedValueOnce([
        regularFailed, regularPassed, mustFailPassed, mustFailFailed,
      ]);

      const promise = observe('run-1', ['test-1']);
      await jest.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result.failedTests).toHaveLength(1);
      const attachedAsserts = result.failedTests[0].asserts!;
      expect(attachedAsserts).toHaveLength(2);
      expect(attachedAsserts.map(a => a.id).sort()).toEqual(['a1', 'a3']);
    });

    it('should handle idle iterations before tests complete', async () => {
      mockedGetFinishedTests
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeTestResult({ id: 'test-1' })]);
      mockedGetFinishedAsserts.mockResolvedValueOnce([]);

      const promise = observe('run-1', ['test-1']);
      await jest.advanceTimersByTimeAsync(200);
      await jest.advanceTimersByTimeAsync(200);
      await jest.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result.testsAmount).toBe(1);
      expect(result.passedTestsAmount).toBe(1);
      expect(result.missedTestsAmount).toBe(0);
    });

    it('should log progress for each completed batch', async () => {
      mockedGetFinishedTests
        .mockResolvedValueOnce([makeTestResult({ id: 'test-1' })])
        .mockResolvedValueOnce([makeTestResult({ id: 'test-2' })]);
      mockedGetFinishedAsserts.mockResolvedValueOnce([]);

      const promise = observe('run-1', ['test-1', 'test-2']);
      await jest.advanceTimersByTimeAsync(200);
      await jest.advanceTimersByTimeAsync(200);
      await promise;

      expect(consoleSpy).toHaveBeenCalledTimes(2);
    });

    it('should pass runId and testIds to db functions', async () => {
      mockedGetFinishedTests.mockResolvedValueOnce([
        makeTestResult({ id: 'test-1' }),
      ]);
      mockedGetFinishedAsserts.mockResolvedValueOnce([]);

      const promise = observe('run-123', ['test-1']);
      await jest.advanceTimersByTimeAsync(200);
      await promise;

      expect(mockedGetFinishedTests).toHaveBeenCalledWith('run-123', ['test-1']);
      expect(mockedGetFinishedAsserts).toHaveBeenCalledWith('run-123', ['test-1']);
    });

    // NOTE: This test must run last because it leaves the module-level
    // idleCounter at MAX_IDLE_ITERATIONS, which persists across tests.
    it('should break on idle timeout and report missed tests', async () => {
      mockedGetFinishedTests.mockResolvedValue([]);
      mockedGetFinishedAsserts.mockResolvedValue([]);

      const promise = observe('run-1', ['test-1']);
      await jest.advanceTimersByTimeAsync(60_000);
      const result = await promise;

      expect(result.testsAmount).toBe(1);
      expect(result.passedTestsAmount).toBe(1);
      expect(result.failedTests).toEqual([]);
      expect(result.missedTestsAmount).toBe(1);
    });
  });
});
