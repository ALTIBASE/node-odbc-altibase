// Records the Statements created on a connection so that a test's afterEach
// can close them before closing the connection.
//
// Closing a connection first frees its statement handles inside the driver,
// but each Statement object keeps the freed handle. When the Statement is
// garbage collected later, node-odbc frees that handle again, and by then the
// driver may have given the same handle to another live statement, which then
// fails or crashes.
function trackStatements(connection) {
  const statements = [];
  const createStatement = connection.createStatement.bind(connection);

  // eslint-disable-next-line no-param-reassign
  connection.createStatement = (callback = undefined) => {
    if (typeof callback === 'function') {
      return createStatement((error, statement) => {
        if (statement) {
          statements.push(statement);
        }
        callback(error, statement);
      });
    }
    if (typeof callback !== 'undefined') {
      // let Connection report the incorrect signature
      return createStatement(callback);
    }
    return createStatement().then((statement) => {
      statements.push(statement);
      return statement;
    });
  };

  return async function closeStatements() {
    const openStatements = statements.filter((statement) => statement.odbcStatement);
    await Promise.all(openStatements.map((statement) => statement.close()));
  };
}

module.exports = { trackStatements };
