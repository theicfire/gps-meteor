var Twilio = Meteor.npmRequire('twilio');
var net = Meteor.npmRequire('net');
var PushBullet = Meteor.npmRequire('pushbullet');
Meteor.npmRequire('log-timestamp'); // TODO can't mup do this for me?
var client = Twilio('ACa8b26113996868bf72b7fab2a8ea0361', '47d7dc0b6dc56c2161dc44bc0324bb70');
var last_ping;
var MICRO_PHONE = '+16502356065';
//var MICRO_PHONE = '+16507720745';
var WATCHDOG_TIMEOUT = 250000;
var pusher = new PushBullet('oYHlSULc3i998hvbuVtsjlH0ps23l7y2');

Meteor.startup(function () {
    console.log('start up');
    if (Coords.find().count() === 0) {
        Coords.insert({lat: 37.446013, long: -122.125731, createdAt: (new Date()).getTime()})
    }
    StateMap.find({key: 'locked'}).observeChanges({
      added: function() {
        console.log('locked added');
        last_ping = (new Date()).getTime();
      },
      changed: function() {
        console.log('locked updated');
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


var sendPushbullet = function(title, msg, phone_nickname, cb) {
    pusher.devices(function(err, res) {
        if (err) {
            return;
        }
        var params = {};
        if (phone_nickname && phone_nickname.length > 0) {
            var bikeId;
            for (var i = 0; i < res.devices.length; i++) {
                if (res.devices[i].nickname == phone_nickname) {
                    params = {device_iden: res.devices[i].iden};
                    break;
                }
            }
        }
        pusher.note(params, title, msg, cb);
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

var sendAlert = function(msg) {
  var CHASE_PHONE = '+15125778778';
  sendPushbullet(msg, '', 'nexus4chase');
  sendSMS(CHASE_PHONE, msg);
};

Meteor.methods({
    removeAll: function() {
      Coords.remove({from_arduino: true});
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

var handle_micro_msg = function(msg) {
  msg = msg.trim();
  console.log('handling', msg);
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
  } else if (msg.startsWith('srt:')) {
    StateMap.upsert({key: 'locked'}, {$set: {val: false}});
  } else if (msg === "Locked") {
    StateMap.upsert({key: 'locked'}, {$set: {val: true}});
  } else if (msg === "Unlocked") {
    StateMap.upsert({key: 'locked'}, {$set: {val: false}});
  } else if (msg === "second_move") {
    StateMap.upsert({key: 'locked'}, {$set: {val: false}});
    sendAlert('Second move!');
  }
  StateMap.upsert({key: 'lastSMS'}, {$set: {val: msg}});
  last_ping = (new Date()).getTime();
  console.log('update last_ping', last_ping);
};

Router.route('/sms', {where: 'server'})
  .post(function () {
      handle_micro_msg(this.request.body.Body);
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
    var locked = StateMap.findOne({key: 'locked'});
    if (!locked || !locked.val) {
      return;
    }
    if (last_ping + WATCHDOG_TIMEOUT < (new Date()).getTime()) {
      console.log('watchdog too old', last_ping, (new Date()).getTime());
      sendAlert('Watchdog expired!');
      StateMap.update(locked._id, {$set: {val: false}});
    } else {
      console.log('interval', (new Date()).getTime() - last_ping);
    }
}, 2000);

net.createServer( Meteor.bindEnvironment( function ( socket ) {
  socket.on("error", function(err) {
    console.log("Caught tcp error: ");
    console.log(err.stack);
    socket.destroy();
  });

  socket.addListener( "data", Meteor.bindEnvironment( function ( data ) {
        handle_micro_msg(data.toString('ascii'));
  }));
})).listen( 5000 );
