var Datastore = require('nedb');
var Handlebars = require('handlebars');

var db = new Datastore({
  filename: 'words.db',
  autoload: true
});

var server = require('http').createServer(),
  WebSocketServer = require('ws').Server,
  wss = new WebSocketServer({
    server: server
  }),
  express = require('express'),
  app = express(),
  bodyParser = require('body-parser'),
  port = 80;

app.use(bodyParser.urlencoded({
  extended: false
}))

app.use(bodyParser.json())

var session = require('express-session');

app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true
}))

var Hashids = require('hashids');
var hashids = new Hashids();

app.use(function (req, res, next) {

  if (!req.session.user) {

    req.session.user = hashids.encode(Date.now());

  }

  next();

});

var fs = require("fs");

app.use(express.static('static'));

app.get("/:tags?", function (req, res) {

  var search;

  if (!req.params.tags) {

    search = {};

  } else {

    var parsedTags = req.params.tags.split(",");

    parsedTags.forEach(function (tag) {

      var positive = [];
      var negative = [];

      // Check if first character is exclamation point, therefore negate

      if (tag[0] === "!") {

        negative.push(tag.substring(1));

      } else {

        positive.push(tag);

      }

      search = {
        $and: [{
            tags: {
              $in: positive
            }
                },
          {
            $not: {
              tags: {
                $in: negative
              }
            }
                }]

      }

    })

  }

  var templateFile = fs.readFileSync(__dirname + "/index.html", "utf8");

  var template = Handlebars.compile(templateFile);

  db.find(search).sort({
    date: -1
  }).exec(function (err, messages) {

    res.send(template({
      messages: messages,
      tags: req.params.tags
    }));

  })

});

var messageCount = 0;

// Post message (eventually to an id of an artist or genre)

app.post("/:tags?", function (req, res) {

  var post = req.body;

  if (req.body.words && typeof req.body.words === "string" && req.body.words.length < 500) {

    var tags = req.body.tags.split(",");

    var message = {
      words: req.body.words,
      author: req.session.user,
      id: hashids.encode(messageCount),
      date: Date.now(),
      tags: tags
    }

    db.insert(message, function (err, newDoc) {

      messageCount += 1;

      res.redirect("/" + req.params.tags);

    });

  } else {

    res.status(400).send("Bad message");

  }

});

wss.on('connection', function (ws) {

  ws.on('message', function (message) {
    console.log('received: %s', message);
  });

  ws.send('something');

});

server.on('request', app);

server.listen(port);
