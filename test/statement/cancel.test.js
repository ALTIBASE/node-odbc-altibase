/* eslint-env node, mocha */
const assert = require('assert');
const odbc = require('../../lib/odbc');

const CANCEL_DELAY = 500;
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const OPERATION_CANCELED_STATE = 'HY008';
const STATEMENT_CLOSED_ERROR = 'Statement has already been closed!';

describe('.cancel([callback])...', () => {
  let connection = null;

  // Each DBMS needs its own query that runs long enough to be cancelled
  before(function skipWithoutLongRunningQuery() {
    if (!global.dbmsConfig.longRunningQuery) {
      this.skip();
    }
  });

  beforeEach(async () => {
    connection = await odbc.connect(`${process.env.CONNECTION_STRING}`);
  });

  afterEach(async () => {
    await connection.close();
    connection = null;
  });

  it('...should throw a TypeError if function signature doesn\'t match accepted signatures.', async () => {
    const statement = await connection.createStatement();
    const CANCEL_TYPE_ERROR = {
      name: 'TypeError',
      message: '[node-odbc]: Incorrect function signature for call to statement.cancel({function}[optional]).',
    };

    assert.throws(() => {
      statement.cancel('abc');
    }, CANCEL_TYPE_ERROR);
    assert.throws(() => {
      statement.cancel(1, () => {});
    }, CANCEL_TYPE_ERROR);
    await statement.close();
  });

  describe('...with callbacks...', () => {
    it('...should cancel a running execute, which returns SQLSTATE HY008.', (done) => {
      connection.createStatement((error1, statement) => {
        assert.deepEqual(error1, null);
        statement.prepare(global.dbmsConfig.longRunningQuery, (error2) => {
          assert.deepEqual(error2, null);
          statement.execute((error3, result) => {
            assert.notDeepEqual(error3, null);
            assert.deepEqual(result, undefined);
            assert.deepEqual(error3.odbcErrors[0].state, OPERATION_CANCELED_STATE);
            statement.close((error4) => {
              assert.deepEqual(error4, null);
              done();
            });
          });
          setTimeout(() => {
            statement.cancel((error5) => {
              assert.deepEqual(error5, null);
            });
          }, CANCEL_DELAY);
        });
      });
    });
    it('...should return an error if the statement is closed.', (done) => {
      connection.createStatement((error1, statement) => {
        assert.deepEqual(error1, null);
        statement.close((error2) => {
          assert.deepEqual(error2, null);
          statement.cancel((error3) => {
            assert.notDeepEqual(error3, null);
            assert.deepEqual(error3.message, STATEMENT_CLOSED_ERROR);
            done();
          });
        });
      });
    });
  });

  describe('...with promises...', () => {
    it('...should cancel a running execute and keep the statement reusable.', async () => {
      const statement = await connection.createStatement();
      await statement.prepare(global.dbmsConfig.longRunningQuery);
      const executePromise = statement.execute();
      await wait(CANCEL_DELAY);
      await statement.cancel();
      await assert.rejects(executePromise, (error) => {
        assert.deepEqual(error.odbcErrors[0].state, OPERATION_CANCELED_STATE);
        return true;
      });
      // the prepared statement can be executed again after the cancel
      const result = await statement.execute();
      assert.deepEqual(result.length, 1);
      await statement.close();
    });
    it('...should succeed and do nothing if no operation is running.', async () => {
      const statement = await connection.createStatement();
      await statement.cancel();
      await statement.prepare(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      await statement.cancel();
      const result = await statement.execute();
      assert.deepEqual(result.length, 0);
      await statement.cancel();
      await statement.close();
    });
    it('...should throw an error if the statement is closed.', async () => {
      const statement = await connection.createStatement();
      await statement.close();
      assert.throws(() => {
        statement.cancel();
      }, { message: STATEMENT_CLOSED_ERROR });
    });
  });
});
