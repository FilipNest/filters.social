// Database stuff

var Datastore = require('nedb');

var databases = {};

databases.messages = new Datastore({
  filename: 'data/words.db',
  autoload: true
});

databases.users = new Datastore({
  filename: 'data/users.db',
  autoload: true
});

// Database API

filter.dbCount = function (database) {

  return new Promise(function (resolve, reject) {

    databases[database].count({}, function (err, count) {

      resolve(count);

    });

  });

};

filter.dbFetch = function (database, query, sort, limit) {

  return new Promise(function (resolve, reject) {

    databases[database].find(query).sort(sort).exec(function (err, data) {

      if (err) {

        reject(err);

      } else {

        resolve(data);

      }


    });

  });

};

filter.dbUpdate = function (database, find, query, options) {

  options.returnUpdatedDocs = true;

  return new Promise(function (resolve, reject) {

    databases[database].update(find, query, options, function (err, updated, data) {

      if (err) {

        reject(err);

      } else {

        resolve(data);

      }

    });

  });

};

filter.dbInsert = function (database, query) {

  return new Promise(function (resolve, reject) {

    databases[database].insert(query, function (err, data) {

      if (err) {

        reject(err);

      } else {

        resolve(data);

      }

    });

  });

};