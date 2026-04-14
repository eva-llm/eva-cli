import color from 'picocolors';

import {
  getFinishedTests,
  getFinishedAsserts,
} from './db';
import {
  type IAssertResult,
  type TFailedAssertsMap,
  type ITestResult,
  type TReport,
  type IEpistemicReport,
} from './types';


let idleCounter = 0;
const POLLING_INTERVAL = 200; // ms
const MAX_IDLE_ITERATIONS = 60 * 1000 / POLLING_INTERVAL; // 1 min
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const xnor = (a: boolean, b: boolean): boolean => a === b;

const insertAsserts = (tests: ITestResult[], asserts: IAssertResult[]) => {
  const groupedFailedAsserts = asserts.reduce((acc, assert) => {
    const { test_id: testId } = assert;

    if (!acc[testId]) {
      acc[testId] = [];
    }    
    acc[testId].push(assert);

    return acc;
  }, {} as TFailedAssertsMap);

  tests.forEach(test => {
    test.asserts = groupedFailedAsserts[test.id];
  });
}
// NOTE: Brute-force way to get epistemic tests, since we don't expect a large number of asserts per test, and this is just for reporting purpose. We can optimize it later if needed.
const getEpistemicTests = (tests: ITestResult[], asserts: IAssertResult[]): IEpistemicReport[] => {
  const epistemicTestsIds = new Set(
    asserts
      .filter(assert => assert.metadata?.must_fail)
      .map(assert => assert.test_id)
  );

  const epistemicTests = [];
  for (const testId of epistemicTestsIds) {
    const test = tests.find(t => t.id === testId);
    if (!test) {
      continue;
    }

    const positiveAsserts = asserts.filter(assert => assert.test_id === testId && !assert.metadata?.must_fail);
    const positivePassedAsserts = positiveAsserts.filter(assert => assert.passed);
    const negativeAsserts = asserts.filter(assert => assert.test_id === testId && assert.metadata?.must_fail);
    const negativeFailedAsserts = negativeAsserts.filter(assert => !assert.passed);

    const honesty = Math.abs(1 - (positivePassedAsserts.length / positiveAsserts.length) - (negativeFailedAsserts.length / negativeAsserts.length));
    const deviation = 1 - honesty;

    epistemicTests.push({
      ...test,
      honesty,
      deviation,
    });
  }

  return epistemicTests;
}

export async function observe(runId: string, testIds: string[]): Promise<TReport> {
  const testsAmount = testIds.length;
  const finishedTests = [];

  let trackingTestIds = new Set(testIds);

  while (trackingTestIds.size > 0) {
    await sleep(POLLING_INTERVAL);

    const finishedBatch = await getFinishedTests(runId, [...trackingTestIds]);

    if (finishedBatch.length === 0) {
      idleCounter++;
      if (idleCounter >= MAX_IDLE_ITERATIONS) {
        break;
      }
      continue;
    }
    idleCounter = 0;

    finishedTests.push(...finishedBatch);
    // NOTE: Just print directly here, not need hooks injection now
    console.log(color.yellow(`Done: ${finishedTests.length}/${testsAmount}`));

    trackingTestIds = trackingTestIds.difference(
      new Set(finishedBatch.map(test => test.id)));
  }

  const finishedAsserts = await getFinishedAsserts(runId, finishedTests.map(test => test.id));
  const epistemicTests = getEpistemicTests(finishedTests, finishedAsserts);

  const failedTests = finishedTests.filter(test => !test.passed);
  const failedAsserts = finishedAsserts.filter(assert => !xnor(assert.passed, !assert.metadata?.must_fail));

  insertAsserts(failedTests, failedAsserts);

  return {
    testsAmount,
    passedTestsAmount: testsAmount - failedTests.length,
    failedTests,
    epistemicTests,
    missedTestsAmount: trackingTestIds.size,
  };
}
