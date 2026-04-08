import postgres from 'postgres';
import {
  type IAssertResult,
  type ITestResult,
} from 'types';


const sql = postgres(process.env.DATABASE_URL || '', {
  max: 10, 
  idle_timeout: 20,
  connect_timeout: 10,
});

export const getFinishedTests = (runId: string, testIds: string[]) => sql<ITestResult[]>`
    SELECT *
    FROM ${sql('TestResult')}
    WHERE run_id = ${runId} AND id IN ${sql(testIds)}
`;

export const getFailedAsserts = (runId: string, testIds: string[]) => sql<IAssertResult[]>`
    SELECT *
    FROM ${sql('AssertResult')}
    WHERE run_id = ${runId} AND passed = false AND test_id IN ${sql(testIds)}
`;
