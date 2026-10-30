/* eslint-env node, mocha */
const assert = require('assert');
const odbc = require('../../lib/odbc');
const { Connection } = require('../../lib/Connection');

const CANCEL_DELAY = 500;
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const OPERATION_CANCELED_STATE = 'HY008';
const CANCEL_PROCEDURE = 'CANCELPROC';

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
    if (connection) {
      await connection.close();
    }
    connection = null;
  });

  it('...should throw a TypeError if function signature doesn\'t match accepted signatures.', async () => {
    const CANCEL_TYPE_ERROR = {
      name: 'TypeError',
      message: '[node-odbc]: Incorrect function signature for call to connection.cancel({function}[optional]).',
    };

    assert.throws(() => {
      connection.cancel('abc');
    }, CANCEL_TYPE_ERROR);
    assert.throws(() => {
      connection.cancel(1, () => {});
    }, CANCEL_TYPE_ERROR);
  });

  describe('...with callbacks...', () => {
    it('...should cancel a running query, which returns SQLSTATE HY008.', (done) => {
      connection.query(global.dbmsConfig.longRunningQuery, (error, result) => {
        assert.notDeepEqual(error, null);
        assert.deepEqual(result, undefined);
        assert.deepEqual(error.odbcErrors[0].state, OPERATION_CANCELED_STATE);
        done();
      });
      setTimeout(() => {
        connection.cancel((error) => {
          assert.deepEqual(error, null);
        });
      }, CANCEL_DELAY);
    });
    it('...should return an error if the connection is closed.', (done) => {
      connection.close((error) => {
        assert.deepEqual(error, null);
        connection.cancel((error1) => {
          assert.notDeepEqual(error1, null);
          assert.deepEqual(error1.message, Connection.CONNECTION_CLOSED_ERROR);
          connection = null;
          done();
        });
      });
    });
  });

  describe('...with promises...', () => {
    it('...should cancel a running query, which returns SQLSTATE HY008.', async () => {
      const queryPromise = connection.query(global.dbmsConfig.longRunningQuery);
      await wait(CANCEL_DELAY);
      await connection.cancel();
      await assert.rejects(queryPromise, (error) => {
        assert.deepEqual(error.odbcErrors[0].state, OPERATION_CANCELED_STATE);
        return true;
      });
    });
    it('...should cancel a running procedure call, which returns SQLSTATE HY008.', async () => {
      const procedureName = `${process.env.DB_SCHEMA}.${CANCEL_PROCEDURE}`;
      await connection.query(global.dbmsConfig.createLongRunningProcedureQuery(procedureName));
      try {
        const callPromise = connection.callProcedure(
          null,
          process.env.DB_SCHEMA,
          CANCEL_PROCEDURE,
          [undefined],
        );
        await wait(CANCEL_DELAY);
        await connection.cancel();
        await assert.rejects(callPromise, (error) => {
          assert.deepEqual(error.odbcErrors[0].state, OPERATION_CANCELED_STATE);
          return true;
        });
      } finally {
        await connection.query(`DROP PROCEDURE ${procedureName}`);
      }
    });
    it('...should keep the connection and its transaction usable after cancelling.', async () => {
      await connection.beginTransaction();
      await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'cancel', 10)`);
      const queryPromise = connection.query(global.dbmsConfig.longRunningQuery);
      await wait(CANCEL_DELAY);
      await connection.cancel();
      await assert.rejects(queryPromise);
      // only the cancelled query fails, the INSERT before it is still in the transaction
      const result1 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.deepEqual(result1.length, 1);
      await connection.rollback();
      const result2 = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.deepEqual(result2.length, 0);
    });
    it('...should cancel only the executing query when several queries run at once.', async () => {
      // The Altibase ODBC driver runs the queries of one connection one at a
      // time, so the second query waits and is not executing when cancelled.
      const firstPromise = connection.query(global.dbmsConfig.longRunningQuery);
      const secondPromise = connection.query(global.dbmsConfig.longRunningQuery);
      await wait(CANCEL_DELAY);
      await connection.cancel();
      await assert.rejects(firstPromise, (error) => {
        assert.deepEqual(error.odbcErrors[0].state, OPERATION_CANCELED_STATE);
        return true;
      });
      const result = await secondPromise;
      assert.deepEqual(result.length, 1);
    });
    it('...should not affect fetching from an open cursor.', async () => {
      await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(1, 'cancel', 10)`);
      await connection.query(`INSERT INTO ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} VALUES(2, 'cancel', 20)`);
      const cursor = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE} ORDER BY ID`, { cursor: true, fetchSize: 1 });
      const result1 = await cursor.fetch();
      assert.deepEqual(result1[0].ID, 1);
      await connection.cancel();
      const result2 = await cursor.fetch();
      assert.deepEqual(result2[0].ID, 2);
      await cursor.close();
    });
    it('...should succeed and do nothing if no operation is running.', async () => {
      await connection.cancel();
      const result = await connection.query(`SELECT * FROM ${process.env.DB_SCHEMA}.${process.env.DB_TABLE}`);
      assert.deepEqual(result.length, 0);
    });
    it('...should throw an error if the connection is closed.', async () => {
      await connection.close();
      assert.throws(() => {
        connection.cancel();
      }, { message: Connection.CONNECTION_CLOSED_ERROR });
      connection = null;
    });
  });
});
