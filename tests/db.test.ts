import type { ITestResult, IAssertResult } from '../src/types';

const mockSqlTagged = jest.fn();
const mockSqlIdentifier = jest.fn((...args: any[]) => args[0]);

const mockSql = Object.assign(mockSqlTagged, {
  call: mockSqlTagged,
});

// Make `sql('TableName')` work for identifiers and `sql(array)` for IN lists
// while `sql`...`` (tagged template) calls mockSqlTagged
const sqlProxy = new Proxy(mockSql, {
  apply(_target, _thisArg, argArray) {
    // Tagged template: first arg is TemplateStringsArray
    if (Array.isArray(argArray[0]) && 'raw' in argArray[0]) {
      return mockSqlTagged(...argArray);
    }
    // Regular call: sql('TableName') or sql(array)
    return mockSqlIdentifier(...argArray);
  },
});

jest.mock('postgres', () => ({
  __esModule: true,
  default: jest.fn(() => sqlProxy),
}));

// Must import after mock setup
import { getFinishedTests, getFinishedAsserts } from '../src/db';

const FAKE_TEST_RESULTS: ITestResult[] = [
  {
    id: 'test-1',
    run_id: 'run-1',
    provider: 'openai',
    model: 'gpt-4',
    prompt: 'hello',
    output: 'world',
    passed: true,
    metadata: null,
    started_at: new Date('2025-01-01'),
    assert_started_at: new Date('2025-01-01'),
    finished_at: new Date('2025-01-01'),
    diff_ms: 100,
    assert_diff_ms: 50,
    output_diff_ms: 50,
  },
];

const FAKE_ASSERT_RESULTS: IAssertResult[] = [
  {
    id: 'assert-1',
    test_id: 'test-1',
    run_id: 'run-1',
    name: 'accuracy',
    criteria: 'must be accurate',
    passed: true,
    score: 0.9,
    reason: 'looks good',
    threshold: 0.5,
    metadata: null,
    started_at: new Date('2025-01-01'),
    finished_at: new Date('2025-01-01'),
    diff_ms: 30,
  },
];

describe('db', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getFinishedTests', () => {
    it('should query TestResult table with run_id and test ids', async () => {
      mockSqlTagged.mockResolvedValueOnce(FAKE_TEST_RESULTS);

      const runId = 'run-1';
      const testIds = ['test-1', 'test-2'];
      const result = await getFinishedTests(runId, testIds);

      expect(result).toEqual(FAKE_TEST_RESULTS);
      expect(mockSqlTagged).toHaveBeenCalledTimes(1);

      // Verify template strings contain the expected SQL fragments
      const templateStrings = mockSqlTagged.mock.calls[0][0];
      const joined = templateStrings.join('??');
      expect(joined).toContain('SELECT');
      expect(joined).toContain('FROM');
      expect(joined).toContain('WHERE');
      expect(joined).toContain('run_id');
      expect(joined).toContain('IN');

      // Verify interpolated values include the table identifier, runId, and testIds
      const interpolatedValues = mockSqlTagged.mock.calls[0].slice(1);
      expect(interpolatedValues).toContain(runId);
    });

    it('should pass the table name through sql identifier helper', async () => {
      mockSqlTagged.mockResolvedValueOnce([]);

      await getFinishedTests('run-1', ['test-1']);

      expect(mockSqlIdentifier).toHaveBeenCalledWith('TestResult');
    });

    it('should pass testIds through sql helper for IN clause', async () => {
      mockSqlTagged.mockResolvedValueOnce([]);
      const testIds = ['t-1', 't-2', 't-3'];

      await getFinishedTests('run-1', testIds);

      expect(mockSqlIdentifier).toHaveBeenCalledWith(testIds);
    });
  });

  describe('getFinishedAsserts', () => {
    it('should query AssertResult table with run_id and test ids', async () => {
      mockSqlTagged.mockResolvedValueOnce(FAKE_ASSERT_RESULTS);

      const runId = 'run-1';
      const testIds = ['test-1'];
      const result = await getFinishedAsserts(runId, testIds);

      expect(result).toEqual(FAKE_ASSERT_RESULTS);
      expect(mockSqlTagged).toHaveBeenCalledTimes(1);

      const templateStrings = mockSqlTagged.mock.calls[0][0];
      const joined = templateStrings.join('??');
      expect(joined).toContain('SELECT');
      expect(joined).toContain('FROM');
      expect(joined).toContain('WHERE');
      expect(joined).toContain('run_id');
      expect(joined).toContain('test_id');
      expect(joined).toContain('IN');
    });

    it('should pass the table name through sql identifier helper', async () => {
      mockSqlTagged.mockResolvedValueOnce([]);

      await getFinishedAsserts('run-1', ['test-1']);

      expect(mockSqlIdentifier).toHaveBeenCalledWith('AssertResult');
    });

    it('should pass testIds through sql helper for IN clause', async () => {
      mockSqlTagged.mockResolvedValueOnce([]);
      const testIds = ['t-1', 't-2'];

      await getFinishedAsserts('run-1', testIds);

      expect(mockSqlIdentifier).toHaveBeenCalledWith(testIds);
    });

    it('should return empty array when no results', async () => {
      mockSqlTagged.mockResolvedValueOnce([]);

      const result = await getFinishedAsserts('run-x', ['t-none']);

      expect(result).toEqual([]);
    });
  });
});
