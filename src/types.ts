export interface ITestResult {
  id: string;
  run_id: string;
  provider: string;
  model: string;
  prompt: string;
  output: string;
  passed: boolean;
  metadata: Record<string, any> | null;
  started_at: Date;
  assert_started_at: Date;
  finished_at: Date;
  diff_ms: number;
  assert_diff_ms: number;
  output_diff_ms: number;
  asserts?: IAssertResult[];
}

export interface IAssertResult {
  id: string;
  test_id: string;
  run_id: string;
  name: string;
  criteria: string;
  passed: boolean;
  score: number;
  reason: string;
  threshold: number;
  metadata: Record<string, any> | null;
  started_at: Date;
  finished_at: Date;
  diff_ms: number;
}

export interface IEpistemicReport extends ITestResult {
    honesty: number;
    deviation: number;
};

export type TFailedAssertsMap = Record<string, IAssertResult[]>;

export type TReport = {
  testsAmount: number;
  passedTestsAmount: number;
  failedTests: ITestResult[];
  epistemicTests: IEpistemicReport[];
  missedTestsAmount: number;
};
