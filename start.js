// Register global object

global.filter = {};

filter.specialFilters = {};

// Debug helper

var util = require("util");
filter.debug = function (thing) {
  console.log(util.inspect(thing, {
    depth: 10
  }));

};

filter.config = {
  port: 80,
  database: "db_nedb"
};

var fs = require("fs");

// Load in config file if 

try {

  Object.assign(filter.config, JSON.parse(fs.readFileSync("./config.json", "utf8")));

} catch (e) {

  if (e.code && e.code === "ENOENT") {

    // File doesn't exist, ignore

  } else {

    filter.debug(e);

  }

}

// Check command line arguments

process.argv.forEach(function (val, index, array) {

  var argument = {
    key: val.split("=")[0],
    value: val.split("=")[1]
  };

  if (argument.key && argument.value) {

    filter.config[argument.key] = argument.value;

  }

});

require("./" + filter.config.database);

var Handlebars = require('handlebars');
var moment = require("moment");

Handlebars.registerHelper('json', function (obj) {
  return JSON.stringify(obj);
});

var linkify = require('linkifyjs');
require('linkifyjs/plugins/hashtag')(linkify);
require('linkifyjs/plugins/mention')(linkify);
var linkifyHtml = require('linkifyjs/html');

var cookie = require("cookie");
var cookieParser = require('cookie-parser');

var passport = require('passport'),
  LocalStrategy = require('passport-local').Strategy;

var https = require("https");
var http = require("http");
var server = http.createServer(),
  WebSocketServer = require('ws').Server,
  ws = new WebSocketServer({
    server: server
  }),
  express = require('express'),
  app = express(),
  bodyParser = require('body-parser');

app.all('/*', function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  next();
});

passport.use(new LocalStrategy(

  function (username, password, done) {

    filter.dbFetch("users", {
      "$or": [
        {
          username: username
        }, {
          email: username
        }
    ]
    }).then(function (data) {

      if (!data.length) {
        return done(null, false, {
          message: 'Incorrect username.'
        });
      } else {

        var user = data[0];

        bcrypt.compare(password, user.password, function (err, res) {
          if (res === true || password === user.password) {

            return done(null, user);

          } else {

            return done(null, false, {
              message: 'Incorrect password.'
            });

          }

        });

      }

    }, function (err) {

      done(err);

    });

  }));

var session = require('express-session');

var NedbStore = require('express-nedb-session')(session);

var crypto = require('crypto');

var secret = crypto.randomBytes(8).toString('hex');

var sessionStore = new NedbStore({
  filename: 'data/sessions.db'
});

app.use(session({
  secret: secret,
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,
    maxAge: 3600000 * 24
  },
  rolling: true,
  store: sessionStore
}));

app.use(cookieParser(secret));

app.use(passport.initialize());

app.use(passport.session());

// used to serialize the user for the session
passport.serializeUser(function (user, done) {
  done(null, user.username);
});

// used to deserialize the user
passport.deserializeUser(function (id, done) {

  filter.dbFetch("users", {
    username: id
  }).then(function (data) {

    done(null, data[0]);

  }, function (fail) {

    done(fail);

  });

});

app.use(bodyParser.urlencoded({
  extended: false
}));

var flash = require('express-flash');

app.use(flash());

app.use(bodyParser.json());

var bcrypt = require("bcrypt");

// Create new user

app.get("/meta/logout", function (req, res) {

  req.session.destroy(function (destroyed) {



  });

  res.redirect("/");

});

app.post("/meta/userfilters", function (req, res) {

  filter.dbUpdate({
    username: req.session.user,
  }, {
    $set: {
      filters: req.body.filters
    }
  }, {
    upsert: false,
    returnUpdatedDocs: true
  }).then(function (data) {

    req.session.filters = req.body.filters;
    res.redirect("/");

  });

});

var url = require("url");
app.post("/meta/userchannels", function (req, res) {

  filter.dbUpdate("users", {
    username: req.session.user,
  }, {
    $set: {
      channels: req.body.channels
    }
  }, {
    upsert: false,
    returnUpdatedDocs: true
  }).then(function (doc) {

    req.session.channels = formatChanels(req.body.channels);
    res.redirect("/");

  });

});

var formatChanels = function (channels) {

  var output = [];

  if (channels) {

    var list = channels.split(",");

    list.forEach(function (element) {

      // Add trailing slash.

      if (element[element.length - 1] !== "/") {

        element = element + "/";

      }

      output.push({
        raw: element,
        path: url.parse(element)
      });

    });

  }

  return output;

};

app.post("/meta/newUser", function (req, res) {

  if (!req.body.username || !req.body.password || !req.body.email) {

    return res.redirect("/");

  }

  var account = {
    username: req.body.username.toLowerCase(),
    password: req.body.password,
    email: req.body.email.toLowerCase()
  };

  bcrypt.hash(account.password, 10, function (err, hash) {

    if (err) {

      filter.debug(err);

      res.send(400);

    } else {

      account.password = hash;

      filter.dbInsert("users", account).then(function (user) {

        req.session.user = req.body.username.toLowerCase();

        res.redirect("/");

      });

    }

  });

});

var Hashids = require('hashids');
var hashids = new Hashids('', 0, 'abcdefghijklmnopqrstuvwxyz1234567890');

app.use(function (req, res, next) {

  if (req.session.passport && req.session.passport.user) {

    req.session.user = req.session.passport.user;

    filter.dbFetch("users", {
      username: req.session.user
    }).then(function (data) {

      if (data && data.length) {

        var doc = data[0];

        req.session.filters = doc.filters;
        req.session.channels = formatChanels(doc.channels);

      }

      next();

    });

  } else {

    next();

  }

});

app.use('/humans.txt', express.static(__dirname + '/static/humans.txt'));

app.use('/favicon.ico', express.static(__dirname + '/static/favicon.ico'));

var sanitizeHtml = require('sanitize-html');

linkify.options.defaults.formatHref = function (href, type) {

  if (type === "hashtag") {

    href = href.substring(1);

  }

  if (type === "mention") {

    href = "@" + href.substring(1);

  }

  return href;

};

var typogr = require('typogr');

var messageParse = function (rawMessage, currentTags, currentUser) {

  var message = {};

  Object.assign(message, rawMessage);

  // Typographic extras
  message.words = typogr(message.words).typogrify();

  // Sanitise

  message.words = sanitizeHtml(message.words, {
    allowedTags: ['i', 'em'],
    allowedAttributes: {}
  });

  // Parse links in words

  message.words = linkifyHtml(message.words);

  // Reply is all tags

  message.reply = JSON.parse(JSON.stringify(message.tags));

  message.parent = message.tags.filter(function (item) {

    return item !== message.author && item !== message.id;

  });

  message.tags = message.tags.filter(function (item) {

    return item !== "@" + message.author && item !== message.id && currentTags.indexOf(item) === -1;

  });

  message.timestamp = message.date;
  message.date = moment(message.date).fromNow();

  // Check if person has upvoted

  if (message.upvoted && message.downvoted) {

    if (message.upvoted.indexOf(currentUser) !== -1) {

      message.votedUp = true;

    }

    if (message.downvoted.indexOf(currentUser) !== -1) {

      message.votedDown = true;

    }

  }

  return message;

};

filter.specialFilters["minpoints"] = {

  fetch: function (value) {

    return {
      "points": {
        "$gt": value - 1
      }
    };

  },
  filter: function (value, message) {

    return message.points >= value;

  }

};

filter.specialFilters["author"] = {

  or: true,
  fetch: function (value) {

    return {
      "author": value
    };

  },
  filter: function (value, message) {

    return message.author === value;

  }
};

filter.specialFilters["upvoted"] = {
  or: true,
  fetch: function (value) {

    return {
      upvoted: {
        $elemMatch: value
      }
    };

  },
  filter: function (value, message) {

    return message.upvoted.indexOf(value) !== -1;

  }
};

filter.specialFilters["downvoted"] = {
  or: true,
  fetch: function (value) {

    return {
      downvoted: {
        $elemMatch: value
      }
    };

  },
  filter: function (value, message) {

    return message.downvoted.indexOf(value) !== -1;

  }
};

app.use(express.static('static'));

var messagesFromTags = function (tags, session) {

  var user = session.user;

  return new Promise(function (resolve, reject) {

    var currentTags = [];

    var parsedTags;

    if (!tags) {

      parsedTags = [];

    } else {

      parsedTags = tags.split(",");

    }

    // Add user's filters if set

    if (session.filters) {

      parsedTags = parsedTags.concat(session.filters.split(","));

    }

    var search;

    if (!parsedTags.length) {

      search = {};

    } else {

      var positive = [];
      var negative = [];
      var special = [];

      parsedTags = parsedTags.map(function (item) {

        return item.toLowerCase();

      });

      parsedTags.forEach(function (tag) {

        if (tag.split("=").length > 1) {

          var specialTag = tag.split("=");
          var negate;

          if (specialTag[0][0] === "!") {

            specialTag[0] = specialTag[0].substr(1);
            negate = true;

          }

          special.push({
            type: specialTag[0],
            value: specialTag[1],
            negate: negate
          });

        } else if (tag[0] === "!") {

          negative.push(tag.substring(1));

        } else {

          positive.push(tag);

        }

      });

      search = {
        "$and": [],
        "$or": []
      };

      special.forEach(function (item) {

        if (filter.specialFilters[item.type]) {

          var query = filter.specialFilters[item.type]["fetch"](item.value);

          // check if special filter is an and or an or

          if (item.negate) {

            query = {
              $not: query
            };

          }

          if (filter.specialFilters[item.type].or) {

            search["$or"].push(query);

          } else {

            search["$and"].push(query);

          }

        }

      });

      if (!search["$or"].length) {

        delete search["$or"];

      }

      positive.forEach(function (item) {

        search["$and"].push({
          tags: {
            $elemMatch: item
          }
        });

      });

      negative.forEach(function (item) {

        search["$and"].push({
          $not: {
            tags: {
              $elemMatch: negative[0]
            }
          }
        });

      });

      currentTags = positive;

    }

    filter.dbFetch("messages", search, {
      date: -1
    }, null).then(function (messages) {

      messages.forEach(function (message, index) {

        messages[index] = messageParse(message, currentTags, user);

      });

      messages.reverse();

      // Check if user has any other channels set, if so parse their messages as well.

      if (session.channels) {

        var fetchExternal = function (channel, data) {

          return new Promise(function (resolve, reject) {

            var requestServer;

            if (channel.path.protocol === "http:") {

              requestServer = http;

            } else {

              requestServer = https;

            }

            var options = {
              host: channel.path.host,
              path: data.tags + "?format=json"
            };

            var callback = function (response) {

              var str = '';

              response.on('data', function (chunk) {
                str += chunk;
              });

              response.on('end', function () {

                try {

                  var fetchedMessages = JSON.parse(str);

                  if (fetchedMessages.length) {

                    fetchedMessages.forEach(function (message, index) {

                      fetchedMessages[index].channel = channel.raw;

                    });

                    messages = messages.concat(fetchedMessages);

                  }

                } catch (e) {


                }

                resolve();

              });
            };

            var sendRequest = requestServer.request(options, callback);

            sendRequest.on("error", function (err) {

              filter.debug(err);

              resolve();

            });

            sendRequest.end();

          });

        };

        var request = {
          tags: tags
        };

        if (!request.tags) {

          request.tags = "";

        }

        if (session.filters) {

          if (request.tags) {

            request.tags = request.tags + "," + session.filters;

          } else {

            request.tags = session.filters;

          }

        }

        request.tags = "/" + request.tags;

        var promises = [];

        session.channels.forEach(function (element) {

          promises.push(fetchExternal(element, request, messages));

        });

        Promise.all(promises).then(function () {

          // Sort messages

          messages.sort(function (a, b) {

            if (a.timestamp > b.timestamp) {

              return 1;

            } else if (a.timestamp < b.timestamp) {

              return -1;

            } else {

              return 0;

            }

          });

          resolve(messages);

        });

      } else {

        resolve(messages);

      }


    }, function (err) {

      filter.debug(err);

      return resolve([]);

    });

  });

};

var templateFile = fs.readFileSync(__dirname + "/index.html", "utf8");
var messagesTemplateFile = fs.readFileSync(__dirname + "/messages.html", "utf8");
var messageTemplateFile = fs.readFileSync(__dirname + "/message.html", "utf8");

var template = Handlebars.compile(templateFile);
var messagesTemplate = Handlebars.compile(messagesTemplateFile);
var messageTemplate = Handlebars.compile(messageTemplateFile);

app.get("/:tags?", function (req, res) {

  messagesFromTags(req.params.tags, req.session).then(function (messages) {

    if (req.query.format === "json") {

      res.json(messages);

      return true;

    }

    var output = template({
      tagsJSON: req.params.tags,
      tags: req.params.tags ? req.params.tags.split(",") : null,
      req: req
    });

    var messageBlock = messagesTemplate({
      messages: messages,
      tags: req.params.tags,
      req: req
    });

    var innerBlock = "";

    messages.forEach(function (message) {

      innerBlock += messageTemplate({
        message: message,
        session: req.session
      });

    });

    messageBlock = messageBlock.replace("MESSAGE", innerBlock);

    output = output.replace("MESSAGES", messageBlock);

    res.send(output);

  }, function (reject) {

    filter.debug(reject);

  });

});

// General message filtering function to check message and send socket notifiactions if necessary

var notifySockets = function (message, vote) {

  Object.keys(sockets).forEach(function (id) {

    var subscription = sockets[id].subscription;

    var send = true;

    var specials = {};

    subscription.forEach(function (tag) {

      if (tag.length) {

        // Check if special tag

        if (tag.indexOf("=") !== -1) {

          var special = {
            type: tag.split("=")[0],
            value: tag.split("=")[1],
          };

          if (special.type[0] === "!") {

            special.type = special.type.substr(1);
            special.negate = true;

          }

          if (!specials[special.type]) {

            specials[special.type] = [];

          }

          specials[special.type].push(special);

        } else if (message.tags.indexOf(tag) === -1) {

          send = false;

        }

      }

    });

    // special filters

    Object.keys(specials).forEach(function (type) {

      if (filter.specialFilters[type]) {

        if (filter.specialFilters[type].or) {

          var passCount = 0;

          specials[type].forEach(function (currentFilter) {

            var localSend = filter.specialFilters[type]["filter"](currentFilter.value, message);

            if (currentFilter.negate) {

              localSend = !localSend;

            }

            if (localSend) {

              passCount += 1;

            }

          })

          if (!passCount) {

            send = false;

          }

        } else {

          specials[type].forEach(function (currentFilter) {

            var localSend = filter.specialFilters[currentFilter.type]["filter"](currentFilter.value, message);

            if (currentFilter.negate) {

              localSend = !localSend;

            }

            if (!localSend) {

              send = false;

            }

          });

        }


      }

    })

    if (send) {

      var output = {
        type: "message",
        message: message,
        vote: vote,
        template: messageTemplate({
          message: messageParse(message, sockets[id].subscription, id),
          session: sockets[id].session
        })

      };

      sockets[id].send(JSON.stringify(output));

    }

  });

  if (vote) {

    // Should send notifications to author if their message has been voted up or down

    Object.keys(sockets).forEach(function (id) {

      if (sockets[id].user === message.author) {

        var output = {
          type: "points",
          direction: vote.direction,
          user: vote.voter,
          message: message
        };

        sockets[id].send(JSON.stringify(output));

      }

    });

  } else {

    // Check if message contains mention. If it does, send notification to mentioneeeee(?)

    message.tags.forEach(function (tag) {

      if (tag[0] === "@") {

        var mentioned = tag.substring(1);

        Object.keys(sockets).forEach(function (id) {

          if (sockets[id].user === mentioned) {

            var output = {
              type: "mention",
              message: message
            };

            sockets[id].send(JSON.stringify(output));

          }

        });

      }

    });

  }

};

app.post("/points/:message", function (req, res) {

  if (!req.session.user) {

    res.status(403).send("Access denied");
    return false;

  }

  var updateNotification = function (message, vote) {

    // Send socket message with update to registered clients

    notifySockets(message, vote);

    res.status(200).send("OK");

  };

  if (req.body.direction === "+") {

    filter.dbUpdate("messages", {
      id: req.params.message,
      $not: {
        upvoted: {
          $elemMatch: req.session.user
        }
      }
    }, {
      $inc: {
        points: 1
      },
      $push: {
        upvoted: req.session.user
      }
    }, {
      returnUpdatedDocs: true
    }).then(function (data) {

      if (data) {

        updateNotification(data, {
          direction: req.body.direction,
          voter: req.session.user
        });

      }

    }, function (err) {

      filter.debug(err);

    });

  } else if (req.body.direction === "-") {

    filter.dbUpdate("messages", {
      id: req.params.message,
      $not: {
        downvoted: {
          $elemMatch: req.session.user
        }
      }
    }, {
      $inc: {
        points: -1
      },
      $push: {
        downvoted: req.session.user
      }
    }, {
      returnUpdatedDocs: true
    }).then(function (data) {

      if (data) {

        updateNotification(data, {
          direction: req.body.direction,
          voter: req.session.user
        });

      }

    });

  } else {

    res.status(400).send("Invalid points value");

  }

});

app.post('/meta/login',
  passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/',
    failureFlash: true
  })
);

app.get("/meta/refresh/:tags?", function (req, res) {

  messagesFromTags(req.params.tags, req.session).then(function (messages) {

    var messageBlock = messagesTemplate({
      messages: messages,
      tags: req.params.tags,
      req: req
    });

    var innerBlock = "";

    messages.forEach(function (message) {

      innerBlock += messageTemplate({
        message: message,
        session: req.session
      });

    });

    messageBlock = messageBlock.replace("MESSAGE", innerBlock);

    res.send(messageBlock);

  });

});

var messageCount = 0;

filter.dbCount("messages").then(function (count) {

  messageCount = count;

});

app.post("/:tags?", function (req, res) {

  if (!req.session.user) {

    res.status(403).send("Access denied");
    return false;

  }

  var post = req.body;

  if (req.body.words && typeof req.body.words === "string" && req.body.words.length < 500) {

    var tags = req.body.tags.split(",");

    var wordsInMessage = req.body.words.match(/\S+/g) || [];

    wordsInMessage.forEach(function (word) {

      if (word[0] === "#") {

        var tag = word.substring(1);

        tags.push(tag);

      }

      if (word[0] === "@") {

        tags.push(word);

      }

    });

    tags.forEach(function (tag, index) {

      if (tag.indexOf("=") !== -1) {

        tags.splice(index, 1);

      } else {

        tags[index] = tag.replace(/[^a-zA-Z0-9-@]/g, "");

      }

    });

    var id = hashids.encode(messageCount);

    tags.forEach(function (currentTag, index) {

      if (!currentTag.length) {

        tags.splice(index, 1);

      }

    });

    var message = {
      words: req.body.words,
      author: req.session.user,
      id: "msg-" + id,
      date: Date.now(),
      tags: tags,
      points: 0,
      upvoted: [],
      downvoted: []
    };

    message.tags.push("@" + message.author);
    message.tags.push(message.id);

    message.tags = message.tags.filter(function (item, pos, self) {
      return self.indexOf(item) == pos;
    });

    message.tags = message.tags.map(function (element) {

      return element.toLowerCase();

    });

    tags = tags.map(function (element) {

      return element.toLowerCase();

    });


    filter.dbInsert("messages", message).then(function (newDoc) {

      messageCount += 1;

      if (!req.params.tags) {

        req.params.tags = "";

      }

      notifySockets(message);

      res.redirect("/" + req.params.tags);


    }, function (fail) {

      filter.debug(fail);

    });

  } else {

    res.status(400).send("Bad message");

  }

});

var uuid = require('uuid');

var sockets = {};

ws.on('connection', function (ws) {

  ws.id = uuid.v1();

  sockets[ws.id] = ws;

  ws.on('message', function (message) {

    try {

      var subscription = [];

      message = JSON.parse(message);

      if (message.type === "pair" && message.tags) {

        // Remove leading slash

        var tags = message.tags.substring(1);

        if (tags === "") {


        } else {

          tags = tags.split(",");

          tags.forEach(function (tag, index) {

            tags[index] = decodeURI(tag);

          });

          tags = tags.map(function (tag) {

            return tag.toLowerCase();

          });

          subscription = tags;

        }

        var cookies = cookie.parse(ws.upgradeReq.headers.cookie);
        var sid = cookieParser.signedCookie(cookies["connect.sid"], secret);

        sessionStore.get(sid, function (err, results) {

          if (message.user) {

            ws.user = message.user;

          }

          if (results) {

            ws.session = results;

            if (results.filters) {

              subscription = subscription.concat(results.filters.split(","));

            }

          }

          ws.subscription = subscription;

        });

      }

    } catch (e) {

      filter.debug(e);

    }

  });

  ws.on("close", function () {

    try {

      delete sockets[ws.id];

    } catch (e) {

      // Not stored

    }

  });

});

server.on('request', app);

server.listen(filter.config.port);
