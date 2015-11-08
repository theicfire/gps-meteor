var Twilio = Meteor.npmRequire('twilio');
var client = Twilio('ACa8b26113996868bf72b7fab2a8ea0361', '47d7dc0b6dc56c2161dc44bc0324bb70');
var last_ping;
var CHASE_PHONE = '+15125778778';
//var MICRO_PHONE = '+16502356065';
var MICRO_PHONE = '+16507720745';
var WATCHDOG_TIMEOUT = 250000;

Meteor.startup(function () {
    console.log('start up');
    if (Coords.find().count() === 0) {
        Coords.insert({lat: 37.446013, long: -122.125731, createdAt: (new Date()).getTime()})
    }
    StateMap.find({key: 'watchdog'}).observeChanges({
      added: function() {
        console.log('watchdog added');
        last_ping = (new Date()).getTime();
      },
      changed: function() {
        console.log('watchdog updated');
        last_ping = (new Date()).getTime();
      },
    });
});

Meteor.publish('coords', function(num) {
    Counts.publish(this, 'countCoords', Coords.find(), { noReady: true });
    return Coords.find({}, {'sort': ['createdAt'], skip: num, limit: 1});
});

Meteor.publish('arduino_coords', function() {
    // TODO change
    return Coords.find({from_arduino: true}, {'sort': {'createdAt': -1}, limit: 10});
});

Meteor.publish('state', function() {
  return StateMap.find({});
});

var sendSMS = function(number, msg) {
    client.sendMessage({
      to: number,
      from: '+15128722240',
      body: msg
    }, function (err, res) {
      console.log('err', err);
      console.log('res', res);
    });
};

var sendRing = function(to_number, from_number) {
  console.log('send ring to', from_number);
    client.calls.create({
      to: to_number,
      from: from_number,
      url: "http://gps.chaselambda.com",
      timeout: 1,
      statusCallback: "http://gps.chaselambda.com/call_completed",
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["completed"],
    }, function (err, res) {
      console.log('err', err);
      console.log('res', res);
    });
};

Meteor.methods({
    removeAll: function() {
      Coords.remove({from_arduino: true});
    },
    sendSMS: function (msg) {
      sendSMS(MICRO_PHONE, msg);
    },
    sendRing: function (from_number) {
      StateMap.upsert({key: 'ringStatus'}, {$set: {val: 'ringing'}});
      sendRing(MICRO_PHONE, from_number);
    },
});


// IronRouter
Router.route('/add_coords/:lat/:long/:time', {where: 'server'})
  .post(function () {
      var coord = {
          lat: this.params.lat,
          long: this.params.long,
          createdAt: new Date(parseInt(this.params.time))
      };
      Coords.insert(coord);
      this.response.end('Received loc of ' + JSON.stringify(coord) + '\n');
  });

Router.route('/add_arduino/:lat/:long/:type', {where: 'server'})
  .post(function () {
      var coord = {
        lat: parseInt(this.params.lat) / 10000.0,
        long: parseInt(this.params.long) / 10000.0,
        createdAt: new Date(),
        type: this.params.type,
        from_arduino: true
      };
      Coords.insert(coord);
      this.response.end('Received loc of ' + JSON.stringify(coord) + '\n');
  });

Router.route('/sms', {where: 'server'})
  .post(function () {
      var msg = this.request.body.Body;
      console.log(msg);
      if (msg.startsWith('gps:')) {
        parts = msg.split(':');
        var coord = {
          lat: parseInt(parts[1]) / 10000.0,
          long: parseInt(parts[2]) / 10000.0,
          createdAt: new Date(),
          type: 'gps',
          from_arduino: true
        };
        console.log('insert', coord);
        Coords.insert(coord);
      } else if (msg.trim() === "Locked") {
        StateMap.upsert({key: 'watchdog'}, {$set: {val: true}});
      } else if (msg.trim() === "Unlocked") {
        StateMap.upsert({key: 'watchdog'}, {$set: {val: false}});
      }
      StateMap.upsert({key: 'lastSMS'}, {$set: {val: msg}});
      last_ping = (new Date()).getTime();
      var headers = {'Content-type': 'text/xml'};
      this.response.writeHead(200, headers);
      this.response.end('<Response></Response>');
  });

Router.route('/call', {where: 'server'})
  .post(function () {
      console.log('hit call');
      var headers = {'Content-type': 'text/xml'};
      this.response.writeHead(200, headers);
      this.response.end('<Response></Response>');
  });

Router.route('/call_completed', {where: 'server'})
  .post(function () {
      console.log('call completed');
      StateMap.upsert({key: 'ringStatus'}, {$set: {val: 'completed'}});
      var headers = {'Content-type': 'text/xml'};
      this.response.writeHead(200, headers);
      this.response.end();
  });

Meteor.setInterval(function() {
    var watchdog = StateMap.findOne({key: 'watchdog'});
    if (!watchdog || !watchdog.val) {
      return;
    }
    if (last_ping + WATCHDOG_TIMEOUT < (new Date()).getTime()) {
      sendSMS(CHASE_PHONE, 'Watchdog expired');
      StateMap.update(watchdog._id, {$set: {val: false}});
    } else {
      console.log('interval', (new Date()).getTime() - last_ping);
    }
}, 2000);
