import color from 'picocolors';
import {
    getFinishedTests,
    getFailedAsserts,
} from './db';
import {
    type IAssertResult,
    type TFailedAssertsMap,
    type ITestResult,
    type TReport,
} from './types';


const POLLING_INTERVAL = 200; // ms
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

export async function observe(runId: string, testIds: string[]): Promise<TReport> {
    const testsAmount = testIds.length;
    const finishedTests = [];

    let trackingTestIds = new Set(testIds);

    while (trackingTestIds.size > 0) {
        await sleep(POLLING_INTERVAL);

        const finishedBatch = await getFinishedTests(runId, [...trackingTestIds]);

        if (finishedBatch.length === 0) {
            continue;
        }

        finishedTests.push(...finishedBatch);
        // NOTE: Just print directly here, not need hooks injection now
        console.log(color.yellow(`Done: ${finishedTests.length}/${testsAmount}`));

        trackingTestIds = trackingTestIds.difference(
            new Set(finishedBatch.map(test => test.id)));
    }

    const failedTests = finishedTests.filter(test => !test.passed);
    const failedAsserts = await getFailedAsserts(runId, failedTests.map(test => test.id));

    insertAsserts(failedTests, failedAsserts);

    return {
        testsAmount,
        passedTestsAmount: testsAmount - failedTests.length,
        failedTests,
    };
}
