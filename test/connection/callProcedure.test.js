/* eslint-env node, mocha */
const assert = require('assert').strict;
const odbc   = require('../../lib/odbc');

const dbms = process.env.DBMS;

if (dbms) {
  const procedureDataTypes = require('../DBMS/_test.test')[dbms];
  if (!procedureDataTypes) {
    console.error(`No callProcedure tests found for DBMS ${global.dbms}`);
  } else {

    async function runTest(connection, procedureName, test) {
      const { values } = test;
      const parameters = [values.in.value, values.inout.value, values.out.value];
      const expectedParams = [values.in.expected, values.inout.expected, values.out.expected];
      const results = await connection.callProcedure(null, process.env.DB_SCHEMA, procedureName, parameters);
      assert.deepEqual(results.parameters, expectedParams);
    }

    describe('...testing IN, INOUT, and OUT parameters...', () => {
      procedureDataTypes.forEach((dataTypeInfo) => {
        const { dataType } = dataTypeInfo;
        describe(`...for ${dataType}...`, () => {
          dataTypeInfo.configurations.forEach((dataTypeConfiguration, index) => {
            const { size, options } = dataTypeConfiguration;
            const fieldConfiguration = `${size ? `${size} ` : ''}${options ? `${options} ` : ''}`;
            describe(`...with ${fieldConfiguration ? `${fieldConfiguration}` : 'default field configuration...'}`, () => {
              const procedureName = `${dataType}${index}_IN_INOUT_OUT`;
              let connection;
              before(async () => {
                try {
                  connection = await odbc.connect(process.env.CONNECTION_STRING);
                  // await connection.beginTransaction();
                  const procedureQuery = `CREATE OR REPLACE PROCEDURE ${process.env.DB_SCHEMA}.${procedureName} (
                    IN_${dataType} IN ${dataType} ${size ? `${size} ` : ' '}${options ? `${options}` : ''},
                    INOUT_${dataType} IN OUT ${dataType} ${size ? `${size} ` : ' '}${options ? `${options}` : ''},
                    OUT_${dataType} OUT ${dataType} ${size ? `${size} ` : ' '}${options ? `${options}` : ''}
                          )
                    AS      
                    BEGIN
                    SET OUT_${dataType} = INOUT_${dataType};
                    SET INOUT_${dataType} = IN_${dataType};
                    END`;
                  await connection.query(procedureQuery);
                  // await connection.commit();
                } catch (error) {
                  // In the future, do something more creative with this error
                  throw(error);
                }
              });
              dataTypeConfiguration.tests.forEach((test) => {
                it(`...testing ${test.name}.`, async () => {
                  await runTest(connection, procedureName, test);
                });
              });
              after(async () => {
                try {
                  await connection.query(`DROP PROCEDURE ${process.env.DB_SCHEMA}.${procedureName}`);
                  // await connection.commit();
                  await connection.close();
                } catch (error) {
                  // In the future, do something more creative with this error
                  throw(error);
                }
              });
            });
          });
        });
      });
    });
  }
}

describe('.callProcedure(procedureName, parameters, [callback])...', () => {
  describe('...with callbacks...', () => {
    it('...should place correct result in an out parameter.', (done) => {
      const array = [undefined];
      odbc.connect(`${process.env.CONNECTION_STRING}`, (error1, connection) => {
        assert.deepEqual(error1, null);
        const procedureQuery = `CREATE OR REPLACE PROCEDURE TESTPROC(a1 OUT INTEGER)
                                AS
                                BEGIN
                                  SELECT 1 INTO a1 FROM dual;
                                END`;
        connection.query(procedureQuery);
        connection.callProcedure(null, `${process.env.DB_SCHEMA}`, `${process.env.DB_STOREDPROCEDURE}`, array, (error2, result2) => {
          assert.deepEqual(error2, null);
          assert.notDeepEqual(result2, null);
          done();
          connection.query("DROP PROCEDURE TESTPROC");
        });
      });
    });
    it('...should place correct result in an multiple out parameters.', (done) => {
      const array = [undefined, undefined];
      odbc.connect(`${process.env.CONNECTION_STRING}`, (error1, connection) => {
        assert.deepEqual(error1, null);
        const procedureQuery = `CREATE OR REPLACE PROCEDURE TESTPROC2(a1 OUT INTEGER, a2 OUT INTEGER)
                                AS
                                BEGIN
                                  SELECT 1 INTO a1 FROM dual;
                                  SELECT 2 INTO a2 FROM dual;
                                END`;
        connection.query(procedureQuery);                        
        connection.callProcedure(null, `${process.env.DB_SCHEMA}`, `${process.env.DB_STOREDPROCEDURE2}`, array, (error2, result2) => {
          assert.deepEqual(error2, null);
          assert.notDeepEqual(result2, null);
          connection.query("DROP PROCEDURE TESTPROC2");
          done();
        });
      });
    });
    it.skip('...should return SQL_LONGVARCHAR data.', (done) => {
      const array = [undefined];
      odbc.connect(`${process.env.CONNECTION_STRING}`, (error1, connection) => {
        assert.deepEqual(error1, null);
        connection.callProcedure(null, 'MIRISH', 'CLOBPROC', array, (error2, result2) => {
          assert.deepEqual(error2, null);
          assert.notDeepEqual(result2, null);
          done();
        });
      });
    });
  });
});
